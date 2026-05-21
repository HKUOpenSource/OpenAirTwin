from __future__ import annotations

import numpy as np

from backend import config
from backend.rt.common import to_numpy


def _cross2d(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return a[..., 0] * b[..., 1] - a[..., 1] * b[..., 0]


def _points_in_box(points: np.ndarray, lower: np.ndarray, upper: np.ndarray) -> np.ndarray:
    return np.logical_and(points >= lower, points <= upper).all(axis=-1)


def _points_in_triangles(points: np.ndarray, triangles: np.ndarray) -> np.ndarray:
    a = triangles[:, None, 0, :]
    b = triangles[:, None, 1, :]
    c = triangles[:, None, 2, :]
    p = points[None, :, :]

    d1 = _cross2d(b - a, p - a)
    d2 = _cross2d(c - b, p - b)
    d3 = _cross2d(a - c, p - c)

    has_neg = (d1 < 0.0) | (d2 < 0.0) | (d3 < 0.0)
    has_pos = (d1 > 0.0) | (d2 > 0.0) | (d3 > 0.0)
    return ~(has_neg & has_pos)


def _segment_intersections(p1: np.ndarray, p2: np.ndarray, q1: np.ndarray, q2: np.ndarray) -> np.ndarray:
    r = p2 - p1
    s = q2 - q1
    qp = q1 - p1

    denom = _cross2d(r, s)
    numer_t = _cross2d(qp, s)
    numer_u = _cross2d(qp, r)

    with np.errstate(divide="ignore", invalid="ignore"):
        t = numer_t / denom
        u = numer_u / denom

    intersects = (denom != 0.0) & (t >= 0.0) & (t <= 1.0) & (u >= 0.0) & (u <= 1.0)

    collinear = (denom == 0.0) & (numer_u == 0.0)
    if np.any(collinear):
        p_min = np.minimum(p1, p2)
        p_max = np.maximum(p1, p2)
        q_min = np.minimum(q1, q2)
        q_max = np.maximum(q1, q2)
        overlaps = (
            (p_min[..., 0] <= q_max[..., 0])
            & (q_min[..., 0] <= p_max[..., 0])
            & (p_min[..., 1] <= q_max[..., 1])
            & (q_min[..., 1] <= p_max[..., 1])
        )
        intersects = intersects | (collinear & overlaps)

    return intersects


def _select_faces_in_xy_box(
    vertex_positions: np.ndarray,
    faces: np.ndarray,
    center_xy: tuple[float, float],
    size_xy: tuple[float, float],
) -> np.ndarray:
    half_size = np.asarray(size_xy, dtype=np.float32) * 0.5
    lower = np.asarray(center_xy, dtype=np.float32) - half_size
    upper = np.asarray(center_xy, dtype=np.float32) + half_size

    triangles_xy = vertex_positions[faces][:, :, :2]
    tri_min = np.min(triangles_xy, axis=1)
    tri_max = np.max(triangles_xy, axis=1)
    candidate_mask = (
        (tri_min[:, 0] <= upper[0])
        & (tri_max[:, 0] >= lower[0])
        & (tri_min[:, 1] <= upper[1])
        & (tri_max[:, 1] >= lower[1])
    )
    candidate_indices = np.flatnonzero(candidate_mask)
    if candidate_indices.size == 0:
        return candidate_mask

    candidate_triangles = triangles_xy[candidate_indices]
    vertex_inside = _points_in_box(candidate_triangles.reshape(-1, 2), lower, upper).reshape(-1, 3).any(axis=1)

    box_corners = np.asarray(
        [
            [lower[0], lower[1]],
            [lower[0], upper[1]],
            [upper[0], lower[1]],
            [upper[0], upper[1]],
        ],
        dtype=np.float32,
    )
    box_corner_inside = _points_in_triangles(box_corners, candidate_triangles).any(axis=1)

    triangle_starts = candidate_triangles[:, (0, 1, 2), :][:, :, None, :]
    triangle_ends = candidate_triangles[:, (1, 2, 0), :][:, :, None, :]
    box_starts = box_corners[(0, 2, 3, 1), :][None, None, :, :]
    box_ends = box_corners[(2, 3, 1, 0), :][None, None, :, :]
    edge_hits = _segment_intersections(triangle_starts, triangle_ends, box_starts, box_ends).any(axis=(1, 2))

    selected = vertex_inside | box_corner_inside | edge_hits
    mask = np.zeros(len(faces), dtype=bool)
    mask[candidate_indices] = selected
    return mask


def _subdivide_triangles(
    vertex_positions: np.ndarray,
    faces: np.ndarray,
    vertex_normals: np.ndarray | None,
    vertex_texcoords: np.ndarray | None,
    levels: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray | None, np.ndarray | None]:
    if levels <= 0:
        return vertex_positions, faces, vertex_normals, vertex_texcoords

    positions = [vertex.copy() for vertex in np.asarray(vertex_positions, dtype=np.float32)]
    normals = None if vertex_normals is None else [normal.copy() for normal in np.asarray(vertex_normals, dtype=np.float32)]
    texcoords = None if vertex_texcoords is None else [uv.copy() for uv in np.asarray(vertex_texcoords, dtype=np.float32)]
    current_faces = np.asarray(faces, dtype=np.int64)

    for _ in range(levels):
        edge_midpoints: dict[tuple[int, int], int] = {}
        next_faces: list[tuple[int, int, int]] = []

        def midpoint_index(i: int, j: int) -> int:
            key = (i, j) if i < j else (j, i)
            cached = edge_midpoints.get(key)
            if cached is not None:
                return cached

            index = len(positions)
            positions.append((positions[i] + positions[j]) * 0.5)
            if normals is not None:
                midpoint_normal = (normals[i] + normals[j]) * 0.5
                length = np.linalg.norm(midpoint_normal)
                if length > 0.0:
                    midpoint_normal /= length
                normals.append(midpoint_normal.astype(np.float32, copy=False))
            if texcoords is not None:
                texcoords.append(((texcoords[i] + texcoords[j]) * 0.5).astype(np.float32, copy=False))
            edge_midpoints[key] = index
            return index

        for a, b, c in current_faces:
            ab = midpoint_index(int(a), int(b))
            bc = midpoint_index(int(b), int(c))
            ca = midpoint_index(int(c), int(a))
            next_faces.extend(
                [
                    (int(a), ab, ca),
                    (ab, int(b), bc),
                    (ca, bc, int(c)),
                    (ab, bc, ca),
                ]
            )

        current_faces = np.asarray(next_faces, dtype=np.uint32)

    return (
        np.asarray(positions, dtype=np.float32),
        np.asarray(current_faces, dtype=np.uint32),
        None if normals is None else np.asarray(normals, dtype=np.float32),
        None if texcoords is None else np.asarray(texcoords, dtype=np.float32),
    )


def _max_triangle_edge_length(vertex_positions: np.ndarray, faces: np.ndarray) -> float:
    triangles = np.asarray(vertex_positions, dtype=np.float32)[np.asarray(faces, dtype=np.int64)]
    if triangles.size == 0:
        return 0.0
    edges = np.stack(
        [
            triangles[:, 0, :] - triangles[:, 1, :],
            triangles[:, 1, :] - triangles[:, 2, :],
            triangles[:, 2, :] - triangles[:, 0, :],
        ],
        axis=1,
    )
    return float(np.max(np.linalg.norm(edges, axis=2)))


def _check_radiomap_cell_limit(selected_count: int, subdivision_levels: int, descriptor: str) -> int:
    expected_cell_count = int(selected_count) * (4 ** int(subdivision_levels))
    if expected_cell_count > config.MAX_RADIOMAP_CELLS:
        raise ValueError(
            f"Selected terrain patch contains {expected_cell_count} cells at {descriptor}, "
            f"which exceeds the configured limit of {config.MAX_RADIOMAP_CELLS}"
        )
    return expected_cell_count


def _grid_shape_for_cell_size(size_xy: tuple[float, float], cell_size: float) -> tuple[int, int, float, float]:
    if not np.isfinite(cell_size) or cell_size <= 0.0:
        raise ValueError("surface.cell_size must be a positive finite number")
    size_x = float(size_xy[0])
    size_y = float(size_xy[1])
    nx = max(1, int(np.ceil(size_x / float(cell_size))))
    ny = max(1, int(np.ceil(size_y / float(cell_size))))
    return nx, ny, size_x / nx, size_y / ny


def _check_radiomap_grid_limit(nx: int, ny: int, cell_size: float) -> tuple[int, int]:
    grid_cell_count = int(nx) * int(ny)
    triangle_count = grid_cell_count * 2
    if triangle_count > config.MAX_RADIOMAP_CELLS:
        raise ValueError(
            f"Radio map cell size {cell_size:g} m creates {grid_cell_count} grid cells "
            f"({triangle_count} triangles), which exceeds the configured limit of {config.MAX_RADIOMAP_CELLS}"
        )
    return grid_cell_count, triangle_count


def _barycentric_xy(point: np.ndarray, triangles_xy: np.ndarray, denom: np.ndarray) -> np.ndarray:
    a = triangles_xy[:, 0, :]
    b = triangles_xy[:, 1, :]
    c = triangles_xy[:, 2, :]
    w0 = ((b[:, 1] - c[:, 1]) * (point[0] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (point[1] - c[:, 1])) / denom
    w1 = ((c[:, 1] - a[:, 1]) * (point[0] - c[:, 0]) + (a[:, 0] - c[:, 0]) * (point[1] - c[:, 1])) / denom
    w2 = 1.0 - w0 - w1
    return np.stack([w0, w1, w2], axis=1)


def _triangle_normals(triangles: np.ndarray) -> np.ndarray:
    normals = np.cross(triangles[:, 1, :] - triangles[:, 0, :], triangles[:, 2, :] - triangles[:, 0, :])
    lengths = np.linalg.norm(normals, axis=1)
    valid = lengths > 1e-8
    normals[valid] = normals[valid] / lengths[valid, None]
    normals[~valid] = np.asarray([0.0, 0.0, 1.0], dtype=np.float32)
    normals[normals[:, 2] < 0.0] *= -1.0
    return normals.astype(np.float32, copy=False)


def _vertex_normals_from_faces(positions: np.ndarray, faces: np.ndarray) -> np.ndarray:
    triangles = np.asarray(positions, dtype=np.float32)[np.asarray(faces, dtype=np.int64)]
    face_normals = _triangle_normals(triangles)
    accumulator = np.zeros_like(positions, dtype=np.float32)
    np.add.at(accumulator, faces[:, 0], face_normals)
    np.add.at(accumulator, faces[:, 1], face_normals)
    np.add.at(accumulator, faces[:, 2], face_normals)
    lengths = np.linalg.norm(accumulator, axis=1, keepdims=True)
    default = np.zeros_like(accumulator)
    default[:, 2] = 1.0
    return np.divide(accumulator, lengths, out=default, where=lengths > 0.0).astype(
        np.float32, copy=False
    )


def _interpolate_points_on_terrain(
    points_xy: np.ndarray,
    terrain_triangles: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    triangles_xy = terrain_triangles[:, :, :2].astype(np.float64, copy=False)
    triangles_z = terrain_triangles[:, :, 2].astype(np.float64, copy=False)
    tri_min = np.min(triangles_xy, axis=1)
    tri_max = np.max(triangles_xy, axis=1)
    denom = (
        (triangles_xy[:, 1, 1] - triangles_xy[:, 2, 1]) * (triangles_xy[:, 0, 0] - triangles_xy[:, 2, 0])
        + (triangles_xy[:, 2, 0] - triangles_xy[:, 1, 0]) * (triangles_xy[:, 0, 1] - triangles_xy[:, 2, 1])
    )
    usable = np.abs(denom) > 1e-8
    if not np.any(usable):
        raise ValueError("Selected terrain patch has no usable XY triangles for cell-size grid")

    normals = _triangle_normals(terrain_triangles.astype(np.float32, copy=False))
    z_values = np.empty(points_xy.shape[0], dtype=np.float32)
    point_normals = np.empty((points_xy.shape[0], 3), dtype=np.float32)
    eps = 1e-5

    for point_index, point in enumerate(points_xy.astype(np.float64, copy=False)):
        candidates = np.flatnonzero(
            usable
            & (tri_min[:, 0] - eps <= point[0])
            & (tri_max[:, 0] + eps >= point[0])
            & (tri_min[:, 1] - eps <= point[1])
            & (tri_max[:, 1] + eps >= point[1])
        )

        chosen_index = -1
        chosen_weights = None
        if candidates.size:
            weights = _barycentric_xy(point, triangles_xy[candidates], denom[candidates])
            inside = np.all(weights >= -eps, axis=1) & np.all(weights <= 1.0 + eps, axis=1)
            if np.any(inside):
                local_index = int(np.flatnonzero(inside)[0])
                chosen_index = int(candidates[local_index])
                chosen_weights = weights[local_index]

        if chosen_index < 0:
            raise ValueError("Receiver or grid sample falls outside the selected terrain surface")

        z_values[point_index] = float(np.dot(chosen_weights, triangles_z[chosen_index]))
        point_normals[point_index] = normals[chosen_index]

    return z_values, point_normals


def sample_points_on_terrain(
    scene,
    points_xy: np.ndarray,
    *,
    center_xy: tuple[float, float],
    size_xy: tuple[float, float],
    height_offset: float = 0.0,
) -> tuple[np.ndarray, np.ndarray]:
    import mitsuba as mi

    terrain_candidates = [
        obj
        for obj in scene.objects.values()
        if getattr(getattr(obj, "radio_material", None), "name", None) == config.RADIOMAP_MEASUREMENT_MATERIAL
    ]
    if not terrain_candidates:
        raise ValueError(
            f"Could not find a terrain measurement surface with radio material '{config.RADIOMAP_MEASUREMENT_MATERIAL}'"
        )

    terrain_triangles: list[np.ndarray] = []
    for terrain in terrain_candidates:
        patch_mesh = terrain.clone(as_mesh=True)
        params = mi.traverse(patch_mesh)
        vertex_positions = np.asarray(to_numpy(params["vertex_positions"]), dtype=np.float32).reshape(-1, 3)
        faces = np.asarray(to_numpy(params["faces"]), dtype=np.uint32).reshape(-1, 3)
        face_mask = _select_faces_in_xy_box(vertex_positions, faces, center_xy, size_xy)
        selected_faces = faces[face_mask]
        if selected_faces.size:
            terrain_triangles.append(vertex_positions[selected_faces])

    if not terrain_triangles:
        raise ValueError("Selected DeepMIMO ROI contains no terrain surface in the selected tiles")

    z_values, normals = _interpolate_points_on_terrain(
        np.asarray(points_xy, dtype=np.float32),
        np.concatenate(terrain_triangles, axis=0),
    )
    positions = np.column_stack(
        [
            np.asarray(points_xy, dtype=np.float32)[:, 0],
            np.asarray(points_xy, dtype=np.float32)[:, 1],
            z_values + float(height_offset),
        ]
    ).astype(np.float32, copy=False)
    return positions, normals


def _build_cell_size_grid(
    vertex_positions: np.ndarray,
    selected_faces: np.ndarray,
    *,
    center_xy: tuple[float, float],
    size_xy: tuple[float, float],
    height_offset: float,
    cell_size: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, dict]:
    nx, ny, resolved_x, resolved_y = _grid_shape_for_cell_size(size_xy, cell_size)
    grid_cell_count, triangle_count = _check_radiomap_grid_limit(nx, ny, cell_size)

    half_size = np.asarray(size_xy, dtype=np.float32) * 0.5
    lower = np.asarray(center_xy, dtype=np.float32) - half_size
    upper = np.asarray(center_xy, dtype=np.float32) + half_size
    xs = np.linspace(float(lower[0]), float(upper[0]), nx + 1, dtype=np.float32)
    ys = np.linspace(float(lower[1]), float(upper[1]), ny + 1, dtype=np.float32)
    xx, yy = np.meshgrid(xs, ys)
    points_xy = np.column_stack([xx.reshape(-1), yy.reshape(-1)]).astype(np.float32, copy=False)

    terrain_triangles = vertex_positions[selected_faces]
    z_values, point_normals = _interpolate_points_on_terrain(points_xy, terrain_triangles)
    patch_positions = np.column_stack(
        [
            points_xy[:, 0],
            points_xy[:, 1],
            z_values + float(height_offset),
        ]
    ).astype(np.float32, copy=False)

    faces: list[tuple[int, int, int]] = []
    row_stride = nx + 1
    for row in range(ny):
        for col in range(nx):
            v00 = row * row_stride + col
            v10 = v00 + 1
            v01 = v00 + row_stride
            v11 = v01 + 1
            faces.append((v00, v10, v11))
            faces.append((v00, v11, v01))

    u = (points_xy[:, 0] - float(lower[0])) / max(float(size_xy[0]), 1e-6)
    v = (points_xy[:, 1] - float(lower[1])) / max(float(size_xy[1]), 1e-6)
    patch_texcoords = np.column_stack([u, v]).astype(np.float32, copy=False)
    patch_faces = np.asarray(faces, dtype=np.uint32)
    meta = {
        "cell_count": int(triangle_count),
        "density_level": 1,
        "resolution_mode": "cell_size_grid",
        "requested_cell_size": float(cell_size),
        "resolved_cell_size": float(max(resolved_x, resolved_y)),
        "resolved_cell_size_x": float(resolved_x),
        "resolved_cell_size_y": float(resolved_y),
        "grid_shape": [int(nx), int(ny)],
        "grid_cell_count": int(grid_cell_count),
        "triangle_count": int(triangle_count),
        "subdivision_levels": 0,
        "sample_multiplier": 1,
    }
    return patch_positions, patch_faces, point_normals, patch_texcoords, meta


def build_terrain_patch(
    scene,
    *,
    tx_position: tuple[float, float, float],
    size_xy: tuple[float, float],
    height_offset: float,
    density_level: int,
    cell_size: float | None = None,
):
    import mitsuba as mi

    terrain_candidates = [
        obj
        for obj in scene.objects.values()
        if getattr(getattr(obj, "radio_material", None), "name", None) == config.RADIOMAP_MEASUREMENT_MATERIAL
    ]
    if not terrain_candidates:
        raise ValueError(
            f"Could not find a terrain measurement surface with radio material '{config.RADIOMAP_MEASUREMENT_MATERIAL}'"
        )
    selected_position_blocks: list[np.ndarray] = []
    selected_face_blocks: list[np.ndarray] = []
    selected_normal_blocks: list[np.ndarray] = []
    selected_texcoord_blocks: list[np.ndarray | None] = []
    patch_mesh = None
    for terrain in terrain_candidates:
        candidate_mesh = terrain.clone(as_mesh=True)
        candidate_params = mi.traverse(candidate_mesh)
        vertex_positions = np.asarray(to_numpy(candidate_params["vertex_positions"]), dtype=np.float32).reshape(-1, 3)
        faces = np.asarray(to_numpy(candidate_params["faces"]), dtype=np.uint32).reshape(-1, 3)
        face_mask = _select_faces_in_xy_box(vertex_positions, faces, tx_position[:2], size_xy)
        selected_faces = faces[face_mask]
        if not selected_faces.size:
            continue
        # Dedup vertices per source mesh so shared edges keep their topology
        # (single-tile parity) and `_subdivide_triangles` can cache midpoints.
        unique_indices, inverse = np.unique(selected_faces.reshape(-1), return_inverse=True)
        block_positions = vertex_positions[unique_indices]
        block_faces = inverse.reshape(-1, 3).astype(np.uint32, copy=False)
        source_normals = np.asarray(to_numpy(candidate_params["vertex_normals"]), dtype=np.float32)
        if source_normals.size:
            block_normals = source_normals.reshape(-1, 3)[unique_indices]
        else:
            block_normals = _vertex_normals_from_faces(block_positions, block_faces)
        source_texcoords = np.asarray(to_numpy(candidate_params["vertex_texcoords"]), dtype=np.float32)
        block_texcoords = (
            source_texcoords.reshape(-1, 2)[unique_indices] if source_texcoords.size else None
        )
        selected_position_blocks.append(block_positions)
        selected_face_blocks.append(block_faces)
        selected_normal_blocks.append(block_normals)
        selected_texcoord_blocks.append(block_texcoords)
        if patch_mesh is None:
            patch_mesh = candidate_mesh

    if not selected_position_blocks or patch_mesh is None:
        raise ValueError("Selected terrain patch contains no measurement cells around the chosen Tx")

    # Concatenate blocks with per-block index offsets so each tile keeps its
    # own shared-edge topology (subdivision midpoint cache benefits from it),
    # without merging vertices across tile seams where coordinates may not
    # coincide exactly.
    vertex_offsets = np.cumsum([0] + [block.shape[0] for block in selected_position_blocks[:-1]])
    terrain_vertex_positions = np.concatenate(selected_position_blocks, axis=0).astype(
        np.float32, copy=False
    )
    terrain_faces = np.concatenate(
        [block + offset for block, offset in zip(selected_face_blocks, vertex_offsets)],
        axis=0,
    ).astype(np.uint32, copy=False)
    terrain_vertex_normals = np.concatenate(selected_normal_blocks, axis=0).astype(
        np.float32, copy=False
    )
    if all(block is not None for block in selected_texcoord_blocks):
        terrain_vertex_texcoords = np.concatenate(
            [block for block in selected_texcoord_blocks if block is not None],
            axis=0,
        ).astype(np.float32, copy=False)
    else:
        terrain_vertex_texcoords = None
    selected_count = int(terrain_faces.shape[0])
    params = mi.traverse(patch_mesh)

    if cell_size is None:
        subdivision_levels = max(0, int(density_level) - 1)
        descriptor = f"density level {density_level}"
        _check_radiomap_cell_limit(selected_count, subdivision_levels, descriptor)

        patch_positions = terrain_vertex_positions.copy()
        patch_positions[:, 2] += float(height_offset)
        patch_faces = terrain_faces.copy()
        patch_normals = terrain_vertex_normals.copy()
        if terrain_vertex_texcoords is not None:
            patch_texcoords = terrain_vertex_texcoords.copy()
        else:
            patch_texcoords = np.zeros((patch_positions.shape[0], 2), dtype=np.float32)

        patch_positions, patch_faces, patch_normals, patch_texcoords = _subdivide_triangles(
            patch_positions,
            patch_faces,
            patch_normals,
            patch_texcoords,
            subdivision_levels,
        )
        max_edge_before_subdivision = _max_triangle_edge_length(terrain_vertex_positions, terrain_faces)
        patch_meta = {
            "density_level": int(subdivision_levels + 1),
            "resolution_mode": "density_level",
            "requested_cell_size": None,
            "resolved_cell_size": float(max_edge_before_subdivision / (2 ** subdivision_levels))
            if max_edge_before_subdivision > 0.0
            else 0.0,
            "resolved_cell_size_x": None,
            "resolved_cell_size_y": None,
            "grid_shape": None,
            "grid_cell_count": None,
            "subdivision_levels": int(subdivision_levels),
            "sample_multiplier": int(4 ** subdivision_levels),
        }
    else:
        patch_positions, patch_faces, patch_normals, patch_texcoords, patch_meta = _build_cell_size_grid(
            terrain_vertex_positions,
            terrain_faces,
            center_xy=tx_position[:2],
            size_xy=size_xy,
            height_offset=height_offset,
            cell_size=float(cell_size),
        )

    params["vertex_positions"] = patch_positions.astype(np.float32, copy=False).reshape(-1)
    params["faces"] = patch_faces.reshape(-1)
    if patch_normals is not None:
        params["vertex_normals"] = patch_normals.reshape(-1)
    if patch_texcoords is not None:
        params["vertex_texcoords"] = patch_texcoords.reshape(-1)

    params.update()
    patch_mesh.parameters_changed()

    triangle_positions = patch_positions[patch_faces]
    bounds_min = np.min(triangle_positions.reshape(-1, 3), axis=0)
    bounds_max = np.max(triangle_positions.reshape(-1, 3), axis=0)

    return patch_mesh, {
        "cell_count": int(patch_faces.shape[0]),
        "triangle_count": int(patch_faces.shape[0]),
        "triangle_positions": triangle_positions.astype(np.float32, copy=False),
        "bounds_min": bounds_min.astype(np.float32, copy=False),
        "bounds_max": bounds_max.astype(np.float32, copy=False),
        **patch_meta,
    }

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


def build_terrain_patch(
    scene,
    *,
    tx_position: tuple[float, float, float],
    size_xy: tuple[float, float],
    height_offset: float,
    density_level: int,
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
    if len(terrain_candidates) != 1:
        raise ValueError(
            f"Expected exactly one terrain measurement surface for '{config.RADIOMAP_MEASUREMENT_MATERIAL}', "
            f"found {len(terrain_candidates)}"
        )

    patch_mesh = terrain_candidates[0].clone(as_mesh=True)
    params = mi.traverse(patch_mesh)

    vertex_positions = np.asarray(to_numpy(params["vertex_positions"]), dtype=np.float32).reshape(-1, 3)
    faces = np.asarray(to_numpy(params["faces"]), dtype=np.uint32).reshape(-1, 3)

    face_mask = _select_faces_in_xy_box(vertex_positions, faces, tx_position[:2], size_xy)
    selected_count = int(np.count_nonzero(face_mask))
    if selected_count == 0:
        raise ValueError("Selected terrain patch contains no measurement cells around the chosen Tx")
    subdivision_levels = max(0, int(density_level) - 1)
    expected_cell_count = selected_count * (4 ** subdivision_levels)
    if expected_cell_count > config.MAX_RADIOMAP_CELLS:
        raise ValueError(
            f"Selected terrain patch contains {expected_cell_count} cells at density level {density_level}, "
            f"which exceeds the configured limit of {config.MAX_RADIOMAP_CELLS}"
        )

    selected_faces = faces[face_mask]
    unique_vertices, inverse = np.unique(selected_faces.reshape(-1), return_inverse=True)
    patch_positions = vertex_positions[unique_vertices].copy()
    patch_positions[:, 2] += float(height_offset)
    patch_faces = inverse.reshape(-1, 3).astype(np.uint32, copy=False)

    original_normals = np.asarray(to_numpy(params["vertex_normals"]), dtype=np.float32)
    original_texcoords = np.asarray(to_numpy(params["vertex_texcoords"]), dtype=np.float32)
    patch_normals = original_normals.reshape(-1, 3)[unique_vertices] if original_normals.size else None
    patch_texcoords = original_texcoords.reshape(-1, 2)[unique_vertices] if original_texcoords.size else None

    patch_positions, patch_faces, patch_normals, patch_texcoords = _subdivide_triangles(
        patch_positions,
        patch_faces,
        patch_normals,
        patch_texcoords,
        subdivision_levels,
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
        "triangle_positions": triangle_positions.astype(np.float32, copy=False),
        "bounds_min": bounds_min.astype(np.float32, copy=False),
        "bounds_max": bounds_max.astype(np.float32, copy=False),
        "density_level": int(density_level),
    }

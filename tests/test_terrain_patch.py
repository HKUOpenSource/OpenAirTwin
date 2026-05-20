from __future__ import annotations

import unittest

import numpy as np

from backend import config
from backend.rt.terrain_patch import (
    _build_cell_size_grid,
    _check_radiomap_grid_limit,
    _check_radiomap_cell_limit,
    _interpolate_points_on_terrain,
    _max_triangle_edge_length,
)


class TerrainPatchResolutionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.positions = np.asarray(
            [
                [0.0, 0.0, 0.0],
                [8.0, 0.0, 0.0],
                [0.0, 6.0, 0.0],
            ],
            dtype=np.float32,
        )
        self.faces = np.asarray([[0, 1, 2]], dtype=np.uint32)

    def test_density_cell_limit_still_uses_subdivision_levels(self) -> None:
        self.assertEqual(_max_triangle_edge_length(self.positions, self.faces), 10.0)
        self.assertEqual(_check_radiomap_cell_limit(1, 2, "density level 3"), 16)

    def test_cell_limit_reports_requested_resolution(self) -> None:
        previous = config.MAX_RADIOMAP_CELLS
        config.MAX_RADIOMAP_CELLS = 3
        try:
            with self.assertRaisesRegex(ValueError, "density level 2"):
                _check_radiomap_cell_limit(1, 1, "density level 2")
        finally:
            config.MAX_RADIOMAP_CELLS = previous

    def test_cell_size_grid_generates_expected_10m_shape(self) -> None:
        positions = np.asarray(
            [
                [-80.0, -80.0, 0.0],
                [80.0, -80.0, 0.0],
                [-80.0, 80.0, 0.0],
                [80.0, 80.0, 0.0],
            ],
            dtype=np.float32,
        )
        faces = np.asarray([[0, 1, 3], [0, 3, 2]], dtype=np.uint32)

        grid_positions, grid_faces, grid_normals, grid_texcoords, meta = _build_cell_size_grid(
            positions,
            faces,
            center_xy=(0.0, 0.0),
            size_xy=(160.0, 160.0),
            height_offset=1.5,
            cell_size=10.0,
        )

        self.assertEqual(meta["resolution_mode"], "cell_size_grid")
        self.assertEqual(meta["grid_shape"], [16, 16])
        self.assertEqual(meta["grid_cell_count"], 256)
        self.assertEqual(meta["triangle_count"], 512)
        self.assertEqual(grid_faces.shape, (512, 3))
        self.assertEqual(grid_positions.shape, (289, 3))
        self.assertEqual(grid_normals.shape, (289, 3))
        self.assertEqual(grid_texcoords.shape, (289, 2))
        self.assertTrue(np.allclose(grid_positions[:, 2], 1.5))

    def test_cell_size_grid_generates_expected_100m_shape(self) -> None:
        positions = np.asarray(
            [
                [-80.0, -80.0, 0.0],
                [80.0, -80.0, 16.0],
                [-80.0, 80.0, 16.0],
                [80.0, 80.0, 32.0],
            ],
            dtype=np.float32,
        )
        faces = np.asarray([[0, 1, 3], [0, 3, 2]], dtype=np.uint32)

        grid_positions, grid_faces, _grid_normals, _grid_texcoords, meta = _build_cell_size_grid(
            positions,
            faces,
            center_xy=(0.0, 0.0),
            size_xy=(160.0, 160.0),
            height_offset=1.5,
            cell_size=100.0,
        )

        self.assertEqual(meta["grid_shape"], [2, 2])
        self.assertEqual(meta["grid_cell_count"], 4)
        self.assertEqual(meta["triangle_count"], 8)
        self.assertEqual(grid_faces.shape, (8, 3))
        self.assertEqual(grid_positions.shape, (9, 3))
        center_index = 4
        self.assertAlmostEqual(float(grid_positions[center_index, 2]), 17.5)

    def test_cell_size_grid_limit_reports_grid_and_triangles(self) -> None:
        previous = config.MAX_RADIOMAP_CELLS
        config.MAX_RADIOMAP_CELLS = 7
        try:
            with self.assertRaisesRegex(ValueError, "4 grid cells \\(8 triangles\\)"):
                _check_radiomap_grid_limit(2, 2, 100.0)
        finally:
            config.MAX_RADIOMAP_CELLS = previous

    def test_outside_point_projection_is_rejected(self) -> None:
        terrain_triangles = np.asarray(
            [
                [
                    [0.0, 0.0, 0.0],
                    [1.0, 0.0, 0.0],
                    [0.0, 1.0, 10.0],
                ]
            ],
            dtype=np.float32,
        )
        with self.assertRaisesRegex(ValueError, "outside the selected terrain surface"):
            _interpolate_points_on_terrain(
                np.asarray([[10.0, 10.0]], dtype=np.float32),
                terrain_triangles,
            )


if __name__ == "__main__":
    unittest.main()

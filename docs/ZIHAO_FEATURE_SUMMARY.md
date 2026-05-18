# Zihao Branch Feature Summary

This document summarizes the current frontend and viewer updates prepared from the `worktree-zihao` line of development.

## Developer Context

- Developer: Zihao
- Remote host: `defaultuser@100.65.77.20`
- Remote work folder: `/home/defaultuser/worktree-zihao`
- Main validation port: `18091`

Use `worktree-zihao` for Zihao validation. Do not restart, kill, or sync over
another developer's worktree, especially `worktree-zhaolin`, unless explicitly
requested. Sync code with an explicit target:

```bash
HKU_RT_REMOTE_ROOT=/home/defaultuser/worktree-zihao bash scripts/sync_code_to_remote.sh
```

## Scope

The branch focuses on the user entry flow before loading the 3D scene, while keeping the existing path solver and radio-map pipeline unchanged.

## New Functionality

### 1. Map-driven entry screen

Users no longer enter the 3D scene immediately on page load.

Instead, the page now opens with a Hong Kong tile-map screen that:

- uses a static `tile_map.png` reference image as the map base
- overlays transparent clickable tile rectangles generated from the Open3DHK tiling rules
- shows selection statistics such as available tiles, selected tiles, selected meshes, and loaded tiles
- supports quick actions like `Select Available`, `Clear`, and `Load Selected Tiles`

### 2. Direct tile selection on the map

The map overlay follows the same hierarchical tile logic used by Open3DHK:

- major sheet
- quadrant (`NW`, `NE`, `SW`, `SE`)
- numbered cell (`1` to `25`)
- subtile (`A`, `B`, `C`, `D`)

Each clickable overlay cell maps back to the actual manifest tile ID used by the backend, such as `11_SW_7A`.

This means the UI reflects the actual scene data that exists on the server, including:

- which tiles are available
- which tiles are unavailable in the current manifest
- which tiles are currently selected
- which tiles have already been loaded into the viewer

### 3. Manual tile ID input

The entry screen now supports manual tile selection by typing IDs such as:

- `11-SW-7A`
- `11-SW-7B`

The input logic:

- accepts commas, spaces, and new lines as separators
- normalizes user input into the internal manifest tile IDs
- selects only tiles that actually exist in the current scene manifest
- reports invalid or unavailable tile IDs without affecting the downstream 3D loading logic

### 4. Controlled transition into the 3D scene

After the user selects tiles, the scene loads only the corresponding tile bundles.

The 3D workflow keeps the original path and radio-map computation pipeline intact, while adding a cleaner loading step:

- selected tiles are synced to the viewer bundles
- the entry screen closes only after the scene is ready
- users can reopen the tile index from inside the app and adjust the loaded tile set

### 5. Lazy viewer initialization

The Three.js viewer is initialized on demand instead of at initial page boot.

This improves startup behavior and avoids blocking the tile selection screen before the user actually enters the 3D scene.

### 6. Large-scale zoom visibility improvement

Viewer visibility at large zoom-out distances has been improved.

Changes include:

- removal of the distance fog that caused the scene to fade into white
- dynamic near/far clipping updates based on current camera distance
- a larger maximum camera distance for wider overview inspection

These changes make it much easier to zoom out and still keep the scene visible.

### 7. Frontend stability fixes

Several frontend issues found during integration were fixed, including:

- a broken JavaScript token caused by corrupted text encoding
- startup behavior that could leave the loading overlay visible forever
- safer viewer access before the 3D scene is initialized

## Validation Notes

The current entry flow has been checked against the real scene manifest used on the server.

Verified behaviors include:

- available tile count is driven by the backend manifest
- manual tile input updates the same selection state used by scene loading
- clicking map tiles and manual input can be mixed in the same selection flow
- the path and radio-map workflows remain downstream of the same bundle-loading pipeline

## Affected Files

- `backend/static/index.html`
- `backend/static/css/app.css`
- `backend/static/js/app.js`
- `backend/static/js/viewer.js`
- `backend/static/assets/tile_map.png`

## Current Behavior

In the current branch state:

- the entry screen uses the Hong Kong map-based tile selector
- users can select tiles either by clicking the map or by typing IDs manually
- selected tiles are loaded before entering the 3D scene
- original path solving and radio-map computation remain available
- `master` is not modified by this branch

## Suggested Use

This branch is suitable for:

- demoing selective tile loading from a geographic index
- letting users choose scene coverage before loading geometry
- preparing future multi-region map entry workflows on top of the current entry-screen architecture

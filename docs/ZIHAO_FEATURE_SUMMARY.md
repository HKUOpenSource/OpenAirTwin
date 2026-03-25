# Zihao Branch Feature Summary

This document summarizes the current frontend and viewer updates prepared from the `worktree-zihao` line of development.

## Scope

The branch focuses on the user entry flow before loading the 3D scene, plus stability and visibility improvements for the web demo.

## New Functionality

### 1. Tile-first entry workflow

Users no longer enter the 3D scene immediately on page load.

Instead, the page now opens with a tile index screen that:

- shows the available tiles for the current scene region
- lets users select one or more tiles before loading geometry
- displays selection statistics such as available tiles, selected tiles, selected meshes, and loaded tiles
- supports quick actions like `Select Available`, `Clear`, and `Load Selected Tiles`

### 2. Manifest-driven tile overview

The entry screen builds a tile overview directly from the backend scene manifest.

This means the UI reflects the actual scene data that exists on the server, including:

- which tiles are available
- how many meshes each tile contains
- which tiles are currently selected
- which tiles have already been loaded into the viewer

### 3. Controlled transition into the 3D scene

After the user selects tiles, the scene loads only the corresponding tile bundles.

The 3D workflow keeps the original path and radio-map computation pipeline intact, while adding a cleaner loading step:

- selected tiles are synced to the viewer bundles
- the entry screen closes only after the scene is ready
- users can reopen the tile index from inside the app and adjust the loaded tile set

### 4. Lazy viewer initialization

The Three.js viewer is now initialized on demand instead of at initial page boot.

This improves startup behavior and avoids blocking the tile selection screen before the user actually enters the 3D scene.

### 5. Large-scale zoom visibility improvement

Viewer visibility at large zoom-out distances has been improved.

Changes include:

- removal of the distance fog that caused the scene to fade into white
- dynamic near/far clipping updates based on current camera distance
- a larger maximum camera distance for wider overview inspection

These changes make it much easier to zoom out and still keep the scene visible.

### 6. Frontend stability fixes

Several frontend issues found during integration were fixed, including:

- a broken JavaScript token caused by corrupted text encoding
- startup behavior that could leave the loading overlay visible forever
- safer viewer access before the 3D scene is initialized

## Affected Files

- `backend/static/index.html`
- `backend/static/css/app.css`
- `backend/static/js/app.js`
- `backend/static/js/viewer.js`

## Current Behavior

In the current branch state:

- the entry screen uses the manifest-based tile grid
- users select tiles first, then enter the 3D scene
- original path solving and radio-map computation remain available
- `master` is not modified by this branch

## Suggested Use

This branch is suitable for:

- demoing selective tile loading
- reducing unnecessary scene loading before user intent is clear
- preparing future region-specific or map-driven entry flows on top of the new entry-screen architecture

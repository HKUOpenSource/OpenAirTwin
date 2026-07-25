OpenAirTwin interactive tutorial assets
=======================================

The production walkthrough uses nine manually reviewed 2x PNG screenshots in
`manual/`. Do not add tutorial videos, captions, or automatically generated
captures.

Map Selection contains four interface states:

1. `map-search.png`
2. `map-selected.png`
3. `map-loading.png`
4. `map-scene.png`

Link, Mobility, Radio Map, DeepMIMO, and Radar each use one full interface
screenshot. Every production image must remain 4064x2144 so the tutorial can
zoom into the original pixels without enlarging a low-resolution source.

The Radar Sensing feature card uses the separate
`../../feature-radar-sensing.png` asset. Replacing that preview must not modify
the approved `manual/radar.png` tutorial screenshot.

Interactive targets and explanations are authored together in
`website/src/tutorialData.ts`. Keep targets subtle, use one highlighted region
per step, and describe observation-only states honestly rather than presenting
them as clickable application controls.

Run `npm test` inside `website/` after replacing an image. CI verifies the
manual asset list, dimensions, 24-step data contract, accessibility controls,
and the absence of legacy MP4/VTT tutorial material.

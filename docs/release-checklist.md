# Release Checklist

Use this checklist for the next OpenAirTwin release. Items that change GitHub
state should be completed by a maintainer after the release commit is reviewed.

## Local preparation

- [ ] Review the complete diff and confirm that generated scene data, runtime
  output, dependency directories and `.codegraph/` are not included.
- [ ] Run `python3 -m unittest discover -s tests -p 'test_*.py'`.
- [ ] Run `npm test` in `tests/browser/`, including the macOS visual snapshots.
- [ ] Run `npm test && npm run build` in `website/` and confirm that
  `dist/architecture/index.html` exists.
- [ ] Run `npm run test:tutorial-site` in `tests/browser/` and confirm all six
  tutorial modes work at 1440, 768 and 375 pixel widths.
- [ ] Confirm the tutorial contains exactly nine 4064x2144 PNG interface states,
  no legacy MP4/VTT walkthrough files, and a Radar Feature preview independent
  from `tutorial/manual/radar.png`.
- [ ] Verify all four Radar drone assets retain their aurumjuda747 attribution,
  canonical Sketchfab source links, CC BY 4.0 metadata and derivative hashes.
- [ ] Complete the desktop Radar smoke from an empty state: place Tx/Rx, add and
  edit a drone target, run Radar, observe determinate progress, and inspect the
  Range–Doppler, range-profile, detection and propagation-path results.
- [ ] Exercise Radar cancellation and a recoverable failure, then confirm a
  subsequent job succeeds and no Radar download route, button or result file is
  present.
- [ ] Move the entries in `CHANGELOG.md` from `Unreleased` to the selected
  Semantic Version and add the release date.
- [ ] Confirm third-party model, scene and media attribution before adding any
  artifacts to the release.

## Pull request and repository checks

- [ ] Open a focused release pull request and wait for all CI jobs to pass.
- [ ] Review the rendered README, documentation links and Pages artifact from
  the exact release commit.
- [ ] Require the CI workflow through branch protection before merging.
- [ ] Merge without changing the tested commit contents.

## Publish and verify

- [ ] Create an annotated tag matching the changelog version.
- [ ] Publish GitHub release notes from the changelog; do not attach scene data
  unless the applicable terms and attribution are included.
- [ ] Verify the release tag, source archive, CI badge, tutorial home page and
  `/OpenAirTwin/architecture/` page.
- [ ] Perform one clean installation and Link plus Radar smoke test from the
  published tag.
- [ ] Record any post-release issue under a new `Unreleased` changelog section.

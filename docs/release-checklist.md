# v1.1.0 Release Checklist

This checklist defines the release contract for OpenAirTwin `1.1.0`, dated
2026-08-01. The supported Workbench target is desktop Chromium or Chrome at
1280x720 or larger. This release does not add mobile, Safari or Firefox
support.

## Release identity

- [ ] Confirm `backend.__version__`, Workbench metadata, tutorial metadata,
  `CITATION.cff`, `CHANGELOG.md` and the application manifest all report
  `1.1.0`.
- [ ] Build with the full lowercase 40-character Git commit from `HEAD`.
- [ ] Confirm the frontend Build ID is
  `1.1.0+<first-12-characters-of-the-commit>`.
- [ ] Confirm the tracked tree is clean before packaging and that the packaged
  commit is the exact tested commit.
- [ ] Confirm all commit subjects and bodies created for the release are in
  English. Do not rewrite existing repository history.

## Source and language scope

- [ ] Review the complete diff and confirm `node_modules/`, build caches,
  browser reports, screenshots, traces, audit reports, generated Workbench
  output, scene data and runtime job output are not tracked.
- [ ] Confirm migration-only planning material remains local and ignored.
- [ ] Run `python3 tools/check_release_english.py` against tracked UTF-8 text.
- [ ] Confirm every HTML entry point uses English language metadata.
- [ ] Manually inspect user-facing images, GIFs and videos for non-English
  visible text.
- [ ] Confirm the archive contains every Git-tracked project source file plus
  the installer, pinned requirements and the verified prebuilt Workbench.
  Untracked or ignored dependencies, caches, generated data, reports and
  migration-only planning material must remain excluded.

## Toolchain and tests

- [ ] Use Node.js `22.13.0`, npm `11.9.0` and Python `3.11`.
- [ ] Run `npm ci && npm test` in `workbench/` and confirm TypeScript, ESLint,
  Stylelint, Prettier, unit tests, production build verification and size
  budgets pass.
- [ ] Run `python3.11 -m pytest tests` and confirm the complete Python suite
  passes.
- [ ] Run `npm ci && npm test && npm run build` in `website/`.
- [ ] Run the complete Playwright suite in `tests/browser/`, including the
  unchanged macOS 1440x900 visual baselines and 1280x720 geometry checks.
- [ ] Confirm all five Features, Entry Map round trips, repeated tile loading,
  result isolation, device operations, dialogs, tooltips, errors, cancellation
  and manual retries pass.
- [ ] Confirm Critical and Serious Axe violations are zero for every Feature,
  dialogs and error states; verify keyboard focus restoration and reduced
  motion behavior.
- [ ] Run the release soak and confirm listeners, timers, DOM nodes, canvases,
  frames and Radar labels return to their starting counts. Confirm median heap
  growth after forced collection is no greater than both 8 MiB and 20 percent.
- [ ] Run seven local cold starts in the fixed Chrome environment. Confirm
  median UI Ready is at most 175 ms and median FCP is at most 885 ms.

## Security and dependency review

- [ ] Run `pip-audit` against `requirements.txt` and `npm audit` against all
  three lockfiles. High or Critical findings block the release.
- [ ] Run `python3 tools/audit_release_dependencies.py` and confirm every
  runtime and vendored browser dependency has an approved license.
- [ ] Confirm unknown licenses and unapproved strong-copyleft dependencies are
  absent.
- [ ] Review `THIRD_PARTY_NOTICES.md` and the generated CycloneDX SBOM against
  the exact archive contents.
- [ ] Retain machine-readable audit reports as temporary CI artifacts only.

## Deterministic application package

- [ ] Build the Workbench once with `OAT_RELEASE_VERSION=1.1.0` and the
  exact `OAT_GIT_COMMIT`; all later jobs must consume that same output.
- [ ] Confirm `build-info.json`, `.vite/manifest.json` and `integrity.json`
  agree on the Build ID and every production file.
- [ ] Build `openairtwin-1.1.0.tar.gz` twice from the same commit and
  confirm the archives are byte-for-byte identical.
- [ ] Verify `openairtwin-1.1.0.tar.gz.sha256`,
  `openairtwin-1.1.0.cdx.json` and the archive's
  `release-manifest.json`.
- [ ] Extract into a new temporary directory, run the packaged installer with
  Python 3.11 and start the server with a PATH that does not contain Node.js.
- [ ] Verify `/api/health`, the homepage Build ID response header, every
  manifest asset, `no-store` HTML and immutable hashed-asset cache headers.
- [ ] Confirm a missing or damaged production Workbench returns the standard
  English 503 response and never serves the legacy source entry as a production
  fallback.

## Publication

This checklist stops before the following repository-changing actions. A
maintainer performs them only after reviewing the local commits and artifacts.

- [ ] Push the reviewed release branch.
- [ ] Open and merge the release pull request without changing the tested tree.
- [ ] Create an annotated `v1.1.0` tag.
- [ ] Publish the English release notes and attach the archive, checksum and
  SBOM to the GitHub Release.
- [ ] Verify the published digest, Build ID, CI checks, tutorial and
  architecture documentation.

## Rollback

1. Stop the current OpenAirTwin service and preserve the active `scene/`,
   `generated/`, `.oat-env` and `.oat-env.ps1` paths.
2. Restore the previous complete application directory. Do not overlay only
   backend files or only the Workbench because each application directory is
   an indivisible release unit.
3. Reconnect or copy the preserved runtime data and environment files without
   modifying their formats. This release requires no data migration.
4. Start the previous directory with its own Python environment and request the
   homepage.
5. Confirm `X-OpenAirTwin-Frontend-Build-ID` reports the previous Build ID,
   `/api/health` returns 200 and the expected scene opens before removing the
   failed release directory.

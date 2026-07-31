# OpenAirTwin UI Legacy Alias Retirement Record

> Status: Phase 8 complete; no active legacy aliases remain in production code

Phase 8 removed `.btn`, `.miniBtn`, `.miniSelect`, `.primary`, `.danger`, and `oat-button--legacy-native-font`. These names remain only in this retirement record and build denylist. They must not re-enter CSS, React markup, the component manifest, or feature implementations.

New UI must use the shared `oat-*` classes registered in `component-manifest.json`. When a new variant is needed, update the component contract, machine-readable manifest, component catalog, and tests first. An alias or feature-private class may not duplicate shared component geometry.

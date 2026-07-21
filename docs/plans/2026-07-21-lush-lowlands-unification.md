# Lush Lowlands palette unification

## Scope

This draft PR is presentation-only and is based on the reviewed PR5 head
`fc95959d3c2128c267e535a6e6cffec5aaa692ff` (`agent/luminous-broad-grass-v3`).
It does not change terrain membership, passability, structures, resources,
castle state, routes, economy, SpacetimeDB, Pages, releases, or production.

## Diagnosis and policy

- Heath cells previously tinted broad ground purple and generated one purple
  `heath-bloom` dodecahedron on High/Balanced quality. The historical feature
  type remains accepted for compatibility, but ordinary generation and the
  live layer now draw zero blooms.
- Heath now shares the Lowlands moss/olive family with a bounded semantic tint;
  Ancient Stone is neutral slate/moss. Ridge and monolith readability comes
  from neutral geometry, height, and deliberate clearances rather than violet
  contrast.
- Meadow, Lowland, Forest, and Heath candidate/retention policies are denser
  while remaining deterministic, slope-aware, structure-safe, and within the
  existing quality budgets. Ridge and Ancient Stone receive only modest grass.

## Measurable contracts

The scene telemetry now exposes feature counts by kind (including an explicit
zero for `heath-bloom`), candidate and active grass cells by terrain, retained
instances by terrain, average vegetation density by terrain, bare-cell and
rejection counts, grass luminance/green ranges, draw calls, triangle totals,
cache state, and overview-hidden state. These remain bounded diagnostics; they
do not become authority or gameplay inputs.

The active-window cache, shared ambient scheduler, shader coverage path,
selection flattening, no-op grass raycast, lifecycle disposal, and quality
budgets are unchanged.

## Verification

- Focused visual/scene contracts: 54 tests passing.
- TypeScript `tsc --noEmit`: passing.
- Remaining build and full-suite results are recorded in the draft PR body.
- Render QA uses the existing fixed-camera harness when available; no runtime
  texture or new binary asset is introduced by this PR.

# Placement validity versus build readiness — 2026-09-07

The placement schematic previously said "Ready to build" whenever geometry was
valid, even when the Builder was occupied or spendable resources were insufficient.
The geometric status now says "Placement is valid." Existing Builder, shortage,
cost, and confirmation controls continue to express actual build eligibility.
No command, economy, placement rule, authentication, or G001 behavior changed.

Two real `Keep04Screen` component regressions cover a valid Lumber Camp draft
with (1) an active Mill construction and ample resources and (2) no construction
but zero resources. Both first failed on the contradictory ready-to-build status.
After the copy correction, both keep Confirm disabled, clicking submits nothing,
and the Builder/shortage information remains visible alongside valid placement.

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/Keep04PlacementUi.test.tsx tests/gameplay04ClientPlacement.test.ts tests/Keep04Accessibility.test.tsx tests/Keep04Benefits.test.tsx
27 passed, 4 files; exit 0, 6.24 seconds.

.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -b
exit 0
```

These are DOM/component checks, not a physical-device or authenticated PTR
playtest. The ten-minute actual-route gameplay gate remains required.

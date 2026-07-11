# Hegemony Lowlands Terrain Core Implementation Plan

> **For Hermes:** Execute task-by-task with the subagent-driven-development and test-driven-development workflows.

**Goal:** Make `ENTER REALM` open a deterministic, pointy-top 19-cell Hegemony Lowlands technical prototype generated from a stable seed, without gameplay systems or runtime use of the supplied art reference.

**Architecture:** Keep game/map data and math under `src/game/map/` with no Three.js imports. Build a thin direct-Three.js realm view over one combined, indexed terrain geometry, with shared corner vertices and world-space height/color functions. The existing title/menu controller owns realm state and browser history; the realm screen owns renderer lifetime, hover/selection, and a lightweight fallback.

**Tech Stack:** React, TypeScript 7 strict mode, Three.js already installed, Vitest, existing CSS/history/audio primitives. No new dependencies and no runtime texture derived from the reference.

**Scope boundary:** This slice implements terrain mathematics, a neutral lowlands technical surface, selection, basic camera controls, and `ENTER REALM` integration. It deliberately excludes keeps, resources, units, roads, biomes, persistence, full terrain decoration, and gameplay mechanics.

---

### Task 1: Deterministic axial-coordinate foundation

**Files:**
- Create: `src/game/map/hexCoordinates.ts`
- Test: `tests/hexCoordinates.test.ts`

1. Write failing tests for pointy-top axial/cube conversion, deterministic `q,r` keys, six canonical neighbors, radius-two disc size/uniqueness, distance symmetry, and world-to-axial round trips.
2. Run `npm test -- tests/hexCoordinates.test.ts`; verify failures are missing-module/API failures.
3. Implement pure `HexCoord` helpers with the documented convention `x = size * sqrt(3) * (q + r / 2)`, `z = size * 1.5 * r`.
4. Re-run the focused test; then commit only after it passes.

### Task 2: Seeded map data and seam-safe height functions

**Files:**
- Create: `src/game/map/realmSeed.ts`
- Create: `src/game/map/terrainTypes.ts`
- Create: `src/game/map/generateTerrainMap.ts`
- Create: `src/game/map/terrainHeight.ts`
- Test: `tests/realmSeed.test.ts`
- Test: `tests/generateTerrainMap.test.ts`
- Test: `tests/terrainHeight.test.ts`

1. Write failing tests for string-seed hashing, repeated map equality, seed variation, finite bounded fields, 19 stable cells, no `Math.random()` usage, and shared-edge/corner height equality.
2. Run focused tests and verify RED.
3. Implement a stable integer hash/PRNG, serializable `RealmTerrainMap`, `HEGEMONY_GENESIS_001`, continuous world-space low-frequency relief, and cell-local detail multiplied by an exact-zero hex-edge falloff.
4. Re-run focused tests and full core tests. Keep Three.js out of all map modules.

### Task 3: Combined terrain geometry data

**Files:**
- Create: `src/components/realm/createTerrainGeometry.ts`
- Test: `tests/terrainGeometry.test.ts`

1. Write failing tests for finite indexed geometry, in-bounds indices, nonempty triangles, deduplicated shared corners/edges, and bounded positions.
2. Run the focused test and verify RED.
3. Implement a combined indexed hex-fan geometry data builder. Shared world-space corner keys must produce one vertex per shared location; border heights and colors must use continuous functions.
4. Re-run focused geometry tests.

### Task 4: Realm screen and accessibility fallback

**Files:**
- Create: `src/components/realm/RealmMapScreen.tsx`
- Create: `src/components/realm/RealmMapScreen.css`
- Test: `tests/realmMapScreen.test.tsx`

1. Write failing component tests for semantic heading, deterministic 19-cell status, Return to Menu, selection information, and WebGL-failure fallback.
2. Run focused test and verify RED.
3. Create one direct Three.js renderer with orthographic camera, neutral lowlands lighting, one terrain mesh, separate hover/selection line overlays, bounded pan/wheel zoom, demand rendering, teardown, and a static SVG/CSS fallback. No persistent borders or reference image textures.
4. Re-run component tests.

### Task 5: Menu/history integration

**Files:**
- Modify: `src/components/menu/WarpkeepMainMenu.tsx`
- Modify: `src/components/transition/experienceTransition.ts`
- Modify: `src/components/WarpkeepExperience.tsx`
- Modify: `src/components/WarpkeepExperience.css`
- Test: `tests/WarpkeepExperience.test.tsx`
- Test: `tests/experienceTransition.test.ts`

1. Write failing tests that `ENTER REALM` opens the prototype, other commands preserve notices, Escape/Return return to menu, and `#realm` / browser Back remain coherent.
2. Run focused tests and verify RED.
3. Add a stable `realm` experience phase and minimal restrained menu-to-realm fade. Keep title/menu media behavior intact; preserve the existing menu audio scene while realm is open.
4. Re-run focused integration tests.

### Task 6: Documentation and visual QA

**Files:**
- Create: `docs/design/hegemony-lowlands-terrain.md`
- Modify: `README.md`

1. Document the art-direction interpretation, deterministic coordinate/seed rules, seam strategy, scope boundary, and explicit no-runtime-reference-image rule.
2. Render three deterministic seeds and inspect the active prototype at desktop and mobile sizes; verify no console/WebGL errors and no permanent cell borders at rest.
3. Record measured mesh/triangle/instance/draw-call counts and known limitations without claiming unmeasured performance.

### Task 7: Quality gates, reviews, and PR

1. Run `npm test`, `npm run typecheck`, `npm run build`, `GITHUB_PAGES=true npm run build`, `npm audit --audit-level=high`, and `git diff --check`.
2. Run an independent spec-compliance review, then code-quality review. Revision gate: fix all critical/important findings and re-run the relevant review, maximum three cycles.
3. Inspect the full staged list, commit conventional logical changes, push `agent/procedural-hegemony-lowlands-core`, open a PR, and verify PR CI. Do not merge without explicit Ael direction.

# Repository map and investigation routes

Snapshot: 2026-09-07, `1600f4b`. Paths in code notation below are repository-relative.
Follow the [start page](README.md) for scope and evidence terminology.

## Whole-tree inventory

`git ls-files` grouped by first path component counted 632 files under `tests`, 587 `src`
files, 574 scripts, 328 SpacetimeDB files, 302 public assets, 269 docs, 155 service
files, 22 `.superpowers` files, 15 operations files, 11 `.github` files, 9 dev files,
3 files under `licenses`, and individual root/config/owner-canary files. These
include generated material and are not measures of completeness or quality.
Of the 632 tracked files under `tests`, 590 are `.test`/`.spec` TypeScript/TSX
files; the remainder includes fixtures and helpers.

| Area | Role / first inspection | Boundary |
| --- | --- | --- |
| Root README, CHANGELOG, package/config files | Public 0.3 product; build/test/toolchain policy | `package.json` still says 0.3.43; source inclusion is not a 0.4 release |
| `src/` | React/TypeScript frontend, Three.js presentation, narrow authenticated adapters | Browser cannot create authority or grant resources |
| `spacetimedb/src/` | Existing G001 authority and dormant legacy features | Preserve deployed compatibility and existing player behavior |
| `spacetimedb/gameplay04/` | Shared pure 0.4 policy and transition core | Do not mix with legacy G001 construction policy |
| `spacetimedb/genesis002/`, `spacetimedb/ptr/` | Realm-specific schemas, procedures, auth and generated bindings | G002 remains closed; only real owner uses PTR |
| `spacetimedb/tests/`, `migration-fixtures/`, `scripts/` | Module harnesses, migration and module generation | Separate test runner; synthetic contexts are not a live database |
| `services/auth-bridge/` | Cloudflare Farcaster verification, sessions, admin/observer boundaries | Never expose signing/admin credentials to frontend |
| `services/release-recovery/` | OIDC/GitHub evidence, private signer/gateway and durable recovery state | Separate deployment authority, default-disabled configuration |
| `scripts/` | Build/asset/closure generation, publisher/operator/recovery code, QA tooling | Inspect entry points and credentials/effects before invoking |
| `tests/` | Root Vitest suites and fixtures | Root runner does not select `spacetimedb/tests` |
| `.github/` | Verify/CodeQL, Pages, notification and sealed-realm workflows; issue forms | Protected workflows/job identities cannot be simulated by a shell |
| `public/` | Exact runtime assets and static metadata | Not a scratch directory or proof of broad media rights |
| `docs/design`, `docs/gameplay`, `docs/superpowers` | Requirements, dated plans and specifications | Historical descriptions can lag current source |
| `docs/evidence/0.4.0/` | Dated component verification journals | Read latest entries and their scope; not all gate files exist |
| `docs/operations`, root `operations/` | Procedures and operator material | Commands may mutate production; review, do not run wholesale |
| `docs/reference`, `docs/legal`, `licenses/`, `.reuse/` | Provenance, licensing classifications and canonical texts | Preserve exact upstream/license and asset-specific terms |
| `dev/`, `src/dev/`, `src/owner-canary`, `owner-canary/` | Loopback QA, synthetic scenarios and separately gated canary | Must not become public authenticated gameplay or ship as QA backdoor |
| `src/build`, `src/release`, `config/` | Build boundaries and generated release/config projections | Derive exact family; no hand-patched source pins |
| `.superpowers/` | Mixture of tracked diagnostics and local probes | Inspect tracked status and ownership; not all probes are reproducible public evidence |
| `.cache`, `artifacts`, `dist`, dependency directories, `AppData` | Local caches, diagnostic outputs, build products or machine state | Do not commit wholesale, delete broadly, or scan private data into notes |

The root `node_modules` here is a shared external junction. Generic `npm ci`
instructions apply to a fresh isolated clone, **not** to this shared worktree.
Generated `dist` directories and dependency trees are not source inputs to review
by default. Temporary probes are not final attested toolchains.

## Browser route map

Start at `src/App.tsx` and `src/components/WarpkeepExperience.tsx`; inspect provider
nesting, entry, realm selection, exit and settings before changing a child surface.
In the following table, implementation paths are relative to `src/`; test names
identify suites under the repository's root `tests/` directory.

| Problem | Primary files | Useful root tests |
| --- | --- | --- |
| Wrong realm access/directory | `components/menu/realmChoicePolicy.ts`, `release/admissionLaunchPolicy.ts`, `ptr/PtrRealmProvider.tsx` | `RealmChoiceSelector`, `PtrRealmProvider`, `WarpkeepExperiencePtrRealm` |
| PTR connection/identity isolation | `ptr/ptrRealmAuthClient.ts`, `ptrRealmConnection.ts`, `PtrRealmProvider.tsx` | `ptrRealmAuthClient`, `ptrRealmConnection`, `ptrGameplay04Capability`, `ptrGameplay04Bindings` |
| World/keep navigation | `ptr/PtrGameplay04SurfaceHost.tsx`, `components/realm/GreaterRealmWorldScene.tsx` | `PtrGameplay04SurfaceHost`, `greaterRealmWorldScene`, `Keep04SceneHost` |
| State decoding/quotes/placement | `ptr/gameplay04/gameplay04State.ts`, `gameplay04Presentation.ts`, `gameplay04Placement.ts` | `gameplay04ClientState`, `gameplay04Presentation`, `gameplay04ClientPlacement` |
| Refresh/retry/reconnect | `ptr/gameplay04/createGameplay04Controller.ts`, `useGameplay04Controller.ts` | `gameplay04Controller`, `gameplay04ControllerLifecycle` |
| Keep choices/feedback/accessibility | `components/keep04/Keep04Screen.tsx`, `Keep04BuildingPanel.tsx`, `Keep04WorkerPanel.tsx`, `Keep04Schematic.tsx`, CSS | `Keep04Screen`, `Keep04PlacementUi`, `Keep04Benefits`, `Keep04Accessibility` |
| Keep rendering/loading/disposal | `components/keep04/Keep04SceneHost.tsx`, `createKeep04Scene.ts`, `loadKeep04Assets.ts`, `createKeep04Buildings.ts`, `keep04VisualProfile.ts` | `Keep04SceneHost`, `keep04SceneLifecycle`, `keep04Scene`, `keep04Buildings`, `keep04VisualProfile` |
| Voxel detail | `components/realm/voxelSurfaceMesh.ts`, `greaterRealmVoxelPresentation.ts`; `components/keep04/keep04VoxelDressing.ts`, `planKeep04DressingSource.ts`, generated plans | `voxelSurfaceMesh`, `greaterRealmVoxelPresentation`, `keep04VoxelDressing`, `keep04DressingGenerator` |
| Actual 0.4 world/water/stream | `greater-realm/createGreaterRealmSceneRuntime.ts`, `greaterRealmPresentationPlan.ts`, `greaterRealmChunkStream.ts`; `components/realm/createGreaterRealmWorldCanvasHost.ts` | `greaterRealmSceneRuntime`, `greaterRealmChunkStream`, `greaterRealmWorldCanvasHost` |
| G001 presentation regressions | `components/realm/RealmMapScreen.tsx`, `createRealmScene.ts`, `realmWaterLayer.ts`, `components/inner-keep/` | Existing G001/quality/legacy-production-seal suites and baseline comparisons |
| Entry/menu/Farcaster/audio/chat | `components/{menu,auth,title,audio}/`, `farcaster/`, realm chat components | Existing entry/session/media/chat regression suites; no unrelated redesign |

`RealmMapScreen.tsx` (7,521 lines), `createRealmScene.ts` (6,144),
`WarpkeepSpacetimeProvider.tsx` (5,326) and `WarpkeepExperience.tsx` (1,928) are
concentrated orchestration surfaces at this snapshot. That increases review risk;
it does not prove failure. Extract only a bounded responsibility when a needed
change demonstrates the benefit, with existing interface tests intact.

## Backend and release routes

For gameplay, read `spacetimedb/gameplay04/{policy,placement,commands,keep,workers,
workerJourney,workerState,construction,reconciliation}.ts`, then the realm-specific
`gameplayKeep`, `gameplayWorkers`, `gameplayConstruction`, `gameplaySchedule`,
`gameplaySchema`, `auth`, `ownerPolicy` and atlas adapters under `spacetimedb/ptr/src`.
Compare the deliberate pre-storage denials under `spacetimedb/genesis002/src`.

For G001 freeze, start at `spacetimedb/src/genesis001AccessPolicy.ts` and its module
test. For identity bridge changes, start at the [bridge README](../../../services/auth-bridge/README.md),
its `src/app.ts`, fixed config and service tests. Never infer that a checked-in
disabled flag is the deployed value; fetch authenticated configuration evidence.

For release failures, start at the exact failed CI suite, then the corresponding
source/closure generator. See [release audit](release-and-infrastructure.md) for
the operating caller map. Avoid reading hundreds of similarly named scripts in
alphabetical order without tracing their callers and fixed workflow inputs.

## Assets, legal and public output

Read [LICENSING](../../../LICENSING.md), [ASSETS-LICENSE](../../../ASSETS-LICENSE.md),
[NOTICE](../../../NOTICE), [CONTRIBUTING](../../../CONTRIBUTING.md),
[SECURITY](../../../SECURITY.md), [TRADEMARKS](../../../TRADEMARKS.md), and the
asset's dated provenance record before modifying or redistributing media.
New project software follows Apache-2.0; confirmed project-owned creative content
follows CC-BY-4.0. File-specific externally governed terms remain separate.

The older [license inventory](../../legal/license-inventory.md) records a historical
cutover, not current universal ownership. Exact-use GameReady and other supplied
assets must not be relabeled, substituted or granted broad derivative rights by
assumption. An Astra-authored art direction does not make preserved models new
assets. Use official recorded runtime permissions and retain attribution.

Ordinary builds verify local immutable assets; explicit asset-fetch/preparation
commands are separate. Keep QA/private atlas/source masters outside production
output. Root `build` performs voxel-plan, asset/catalog, type, Vite, final asset,
production-exclusion, public-atlas and Mini App checks: a successful `vite build`
alone is not the same acceptance result.

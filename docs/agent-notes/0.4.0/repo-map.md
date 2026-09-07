# Repository map and investigation routes

Use this map to find the source, its real caller and the tests for a change.
[Technical architecture](../../technical-architecture.md) explains ownership and
runtime flow; the [execution handoff](execution-handoff.md) records dated checks
and current work. This map intentionally does not duplicate repository counts,
CI snapshots or release completion status.

## Choose the correct generation

| Area | What belongs here | First source |
| --- | --- | --- |
| Existing G001 game | Established world, identity, resources, Workers, timers and retained compatibility | [Module root](../../../spacetimedb/src/index.ts), [browser provider](../../../src/spacetime/WarpkeepSpacetimeProvider.tsx) |
| Shared 0.4 gameplay | Pure policy, placement, command protocol and state transitions | [Policy](../../../spacetimedb/gameplay04/policy.ts), [commands](../../../spacetimedb/gameplay04/commands.ts) |
| PTR module | Real owner access, private atlas, SDK storage/transaction adapters and scheduled execution | [Module root](../../../spacetimedb/ptr/src/index.ts), [auth](../../../spacetimedb/ptr/src/auth.ts) |
| G002 module | Separate private schema, atlas ingestion and deliberately closed gameplay interface | [Module root](../../../spacetimedb/genesis002/src/index.ts), [closed keep procedures](../../../spacetimedb/genesis002/src/gameplayKeep.ts) |
| New keep frontend | Validated 0.4 state, decisions, schematic fallback and renderer | [Surface host](../../../src/ptr/PtrGameplay04SurfaceHost.tsx), [Keep04Screen](../../../src/components/keep04/Keep04Screen.tsx) |
| Greater Realm frontend | Atlas reads, chunk streaming, world rendering and 0.4 water | [Scene runtime](../../../src/greater-realm/createGreaterRealmSceneRuntime.ts) |
| Identity service | Farcaster proof exchange, sessions, scoped claims and admission/notification boundaries | [Auth bridge README](../../../services/auth-bridge/README.md), [app](../../../services/auth-bridge/src/app.ts) |
| Release/recovery | Source/artifact preparation, provider effects, workflow identity and durable authorization | [Release route map below](#release-and-recovery-routes) |

The G001 `inner-keep` components and `spacetimedb/src/innerKeep*` implement older
construction semantics. New 0.4 work starts in `components/keep04`,
`ptr/gameplay04` and `spacetimedb/gameplay04`. Similarly, G001's
`src/components/realm/realmWaterLayer.ts` is not the active Greater Realm water path.

## Trace a player decision end to end

Start with [`App.tsx`](../../../src/App.tsx) and
[`WarpkeepExperience.tsx`](../../../src/components/WarpkeepExperience.tsx) to see
provider nesting, entry and realm selection. For a PTR Worker dispatch, follow:

1. [`PtrRealmProvider.tsx`](../../../src/ptr/PtrRealmProvider.tsx) obtains owner
   access via [`ptrRealmAuthClient.ts`](../../../src/ptr/ptrRealmAuthClient.ts).
   [`ptrRealmConnection.ts`](../../../src/ptr/ptrRealmConnection.ts) binds the
   database connection, atlas bridge and private gameplay capability to the session.
2. [`PtrGameplay04SurfaceHost.tsx`](../../../src/ptr/PtrGameplay04SurfaceHost.tsx)
   receives a world resource selection and submits a duration/Worker intent.
3. [`createGameplay04Controller.ts`](../../../src/ptr/gameplay04/createGameplay04Controller.ts)
   captures the request key, next sequence, state revision and atlas revision.
   The connection capability dispatches through
   [generated PTR procedures](../../../spacetimedb/ptr/generated-bindings/index.ts).
4. [`gameplayWorkers.ts`](../../../spacetimedb/ptr/src/gameplayWorkers.ts)
   authenticates with `requirePtrOwner`, loads `requirePtrReadyAtlas`, performs
   receipt preflight and resolves real location capacity and a connected route.
5. [`workers.ts`](../../../spacetimedb/gameplay04/workers.ts) applies the transition
   through the storage adapter. [`workerJourney.ts`](../../../spacetimedb/gameplay04/workerJourney.ts)
   owns timing/recall/earned-cargo arithmetic; the server captures the terms.
6. [`gameplaySchedule.ts`](../../../spacetimedb/ptr/src/gameplaySchedule.ts) or an
   authenticated [`getGameplay04KeepV1`](../../../spacetimedb/ptr/src/gameplayKeep.ts)
   reconciles due work. Return credits the account and records earned, credited
   and overflow amounts. [`reconciliation.ts`](../../../spacetimedb/gameplay04/reconciliation.ts)
   coordinates Worker and construction effects in one transaction.
7. The controller rereads the result. [`gameplay04State.ts`](../../../src/ptr/gameplay04/gameplay04State.ts)
   validates wire state and [`gameplay04Presentation.ts`](../../../src/ptr/gameplay04/gameplay04Presentation.ts)
   derives UI meaning before publication.

For a building decision, branch from `Keep04Screen` → `Keep04BuildingPanel` →
controller quote capture →
[`gameplayConstruction.ts`](../../../spacetimedb/ptr/src/gameplayConstruction.ts) →
[`construction.ts`](../../../spacetimedb/gameplay04/construction.ts).
The core validates expected cost/duration, target, layout and permanent placement;
reconciles due work; deducts stored resources; and commits the project, schedule
and receipt. Completed buildings affect subsequent journeys/projects, not terms
already captured by an earlier command.

## Browser investigation routes

Test names below are exact root suite filenames unless a directory is shown.
Use the linked source first, then inspect callers and the selected test's fixtures.

| Symptom or change | Source to inspect | Useful tests |
| --- | --- | --- |
| Wrong realm choice or closed entry | [realmChoicePolicy](../../../src/components/menu/realmChoicePolicy.ts), [admissionLaunchPolicy](../../../src/release/admissionLaunchPolicy.ts), [PtrRealmProvider](../../../src/ptr/PtrRealmProvider.tsx) | `RealmChoiceSelector.test.tsx`, `PtrRealmProvider.test.tsx`, `WarpkeepExperiencePtrRealm.test.tsx` |
| PTR identity, expiry or stale capability | [auth client](../../../src/ptr/ptrRealmAuthClient.ts), [connection](../../../src/ptr/ptrRealmConnection.ts), [provider](../../../src/ptr/PtrRealmProvider.tsx) | `ptrRealmAuthClient.test.ts`, `ptrRealmConnection.test.ts`, `ptrGameplay04Capability.test.ts` |
| Refresh interruption, unknown command outcome or retry | [controller](../../../src/ptr/gameplay04/createGameplay04Controller.ts), [React lifecycle hook](../../../src/ptr/gameplay04/useGameplay04Controller.ts) | `gameplay04Controller.test.ts`, `gameplay04ControllerLifecycle.test.tsx` |
| Incorrect balances, quote or placement preview | [state decoder](../../../src/ptr/gameplay04/gameplay04State.ts), [presentation](../../../src/ptr/gameplay04/gameplay04Presentation.ts), [placement](../../../src/ptr/gameplay04/gameplay04Placement.ts) | `gameplay04ClientState.test.ts`, `gameplay04Presentation.test.ts`, `gameplay04ClientPlacement.test.ts` |
| Keep choice, shortage, benefit or keyboard/touch feedback | [screen](../../../src/components/keep04/Keep04Screen.tsx), [building panel](../../../src/components/keep04/Keep04BuildingPanel.tsx), [Worker panel](../../../src/components/keep04/Keep04WorkerPanel.tsx), [schematic](../../../src/components/keep04/Keep04Schematic.tsx) | `Keep04Screen.test.tsx`, `Keep04PlacementUi.test.tsx`, `Keep04Benefits.test.tsx`, `Keep04Accessibility.test.tsx` |
| World/keep navigation and retained selection | [surface host](../../../src/ptr/PtrGameplay04SurfaceHost.tsx), [world scene](../../../src/components/realm/GreaterRealmWorldScene.tsx) | `PtrGameplay04SurfaceHost.test.tsx`, `greaterRealmWorldScene.test.tsx` |
| Canvas replacement, loading or disposal | [Keep04SceneHost](../../../src/components/keep04/Keep04SceneHost.tsx), [scene](../../../src/components/keep04/createKeep04Scene.ts), [asset loader](../../../src/components/keep04/loadKeep04Assets.ts) | `Keep04SceneHost.test.tsx`, `keep04SceneLifecycle.test.ts`, `keep04Scene.test.ts` |
| Building appearance or fallback | [buildings](../../../src/components/keep04/createKeep04Buildings.ts), [visual profile](../../../src/components/keep04/keep04VisualProfile.ts) | `keep04Buildings.test.ts`, `keep04VisualProfile.test.ts` |
| Voxel/forest composition | [mesher](../../../src/components/realm/voxelSurfaceMesh.ts), [world voxel presentation](../../../src/components/realm/greaterRealmVoxelPresentation.ts), [keep dressing](../../../src/components/keep04/keep04VoxelDressing.ts) | `voxelSurfaceMesh.test.ts`, `greaterRealmVoxelPresentation.test.ts`, `keep04VoxelDressing.test.ts` |
| Atlas streaming, world water or renderer ownership | [chunk stream](../../../src/greater-realm/greaterRealmChunkStream.ts), [runtime](../../../src/greater-realm/createGreaterRealmSceneRuntime.ts), [canvas host](../../../src/components/realm/createGreaterRealmWorldCanvasHost.ts) | `greaterRealmChunkStream.test.ts`, `greaterRealmSceneRuntime.test.ts`, `greaterRealmWorldCanvasHost.test.ts` |
| G001 regression | [RealmMapScreen](../../../src/components/realm/RealmMapScreen.tsx), [createRealmScene](../../../src/components/realm/createRealmScene.ts), [legacy water](../../../src/components/realm/realmWaterLayer.ts) | Relevant existing `realm*`, `innerKeep*` and production-seal suites |

The controller has separate `ready`, `refreshing`, `pending` and `uncertain`
states. A healthy refresh preserves the last validated presentation while
commands are unavailable; an unknown mutation outcome retains its exact envelope.
Inspect delayed-request and disposal tests before changing those transitions.
Active PTR continuation is implemented at `c990a3b`: hard expiry retires the old
capability, obtains fresh same-FID/database/epoch authority and reconnects through
preflight. A new controller reads authoritative state before allowing commands;
no draft or command envelope crosses sessions. Actual owner renewal acceptance
remains open; see the [continuation evidence](../../evidence/0.4.0/isolation-lifecycle.md).
The world/keep host mounts mutually exclusive renderers rather than passing 0.4
callbacks into the legacy G001 authority surface.

## Gameplay and database investigation routes

| Rule or boundary | Source | Useful root tests |
| --- | --- | --- |
| Economy, durations and building effects | [policy](../../../spacetimedb/gameplay04/policy.ts) | `gameplay04Policy.test.ts`, `gameplay04Presentation.test.ts` |
| Keep initialization and binding | [keep](../../../spacetimedb/gameplay04/keep.ts), [PTR keep adapter](../../../spacetimedb/ptr/src/gameplayKeep.ts) | `gameplay04Keep.test.ts`, `gameplay04KeepModules.test.ts` |
| Replay, pruning, sequence and atomic revision | [commands](../../../spacetimedb/gameplay04/commands.ts), [construction](../../../spacetimedb/gameplay04/construction.ts), [Workers](../../../spacetimedb/gameplay04/workers.ts) | `gameplay04Keep.test.ts`, `gameplay04Workers.test.ts`, `gameplay04Construction.test.ts` |
| Outbound/gather/return timing and cargo credit | [journey](../../../spacetimedb/gameplay04/workerJourney.ts), [state validation](../../../spacetimedb/gameplay04/workerState.ts), [Workers](../../../spacetimedb/gameplay04/workers.ts) | `gameplay04WorkerJourney.test.ts`, `gameplay04Workers.test.ts`, `gameplay04WorkersModules.test.ts` |
| Build/upgrade costs, collision and completion | [placement](../../../spacetimedb/gameplay04/placement.ts), [construction](../../../spacetimedb/gameplay04/construction.ts), [PTR adapter](../../../spacetimedb/ptr/src/gameplayConstruction.ts) | `gameplay04Placement.test.ts`, `gameplay04Construction.test.ts`, `gameplay04ConstructionModules.test.ts` |
| Actual owner or database rejection | [PTR auth](../../../spacetimedb/ptr/src/auth.ts), [owner policy](../../../spacetimedb/ptr/src/ownerPolicy.ts), [owner provisioning](../../../spacetimedb/ptr/src/ownerReducers.ts) | `ptrOwnerPolicy.test.ts`, `ptrRealmBackend.test.ts`, `ptrOwnerProvisionOperator.test.ts` |
| Real destination/route/capacity | [PTR atlas reads](../../../spacetimedb/ptr/src/atlasReadReducers.ts), [atlas authority](../../../spacetimedb/ptr/src/atlasAuthority.ts), [dispatch resolver](../../../spacetimedb/ptr/src/gameplayWorkers.ts) | `gameplay04WorkersModules.test.ts`, PTR atlas suites |
| Schema, generated interface or wakeup shape | [PTR gameplay schema](../../../spacetimedb/ptr/src/gameplaySchema.ts), [schedule](../../../spacetimedb/ptr/src/gameplaySchedule.ts), [G002 root](../../../spacetimedb/genesis002/src/index.ts) | `ptrGameplay04Bindings.test.ts`, `gameplay04KeepModules.test.ts`, `gameplay04WorkersModules.test.ts`, `gameplay04ConstructionModules.test.ts` |
| Preserved G001 population policy | [access policy](../../../spacetimedb/src/genesis001AccessPolicy.ts), [admin reducers](../../../spacetimedb/src/reducers/admin.ts), [access requests](../../../spacetimedb/src/reducers/accessRequests.ts) | Module `spacetimedb/tests/genesis001AccessFreeze.test.ts` and compatibility proofs |

Protocol details which explain the interfaces:

- The private `gameplay04_*_v1` tables cover keep/account, Worker, receipt,
  reservation, building, project and schedule. G002 and PTR register their own
  tables and procedure roots; the pure core registers no SDK schema.
- Keep binding includes database identity, owner FID, atlas identity/revision and
  anchor cell. Commands carry a sequence-bound `g04:` request key and expected
  revision. The core retains 128 receipts; older accepted sequences remain
  rejected after their receipt is pruned.
- Building requests also bind policy/layout, exact cost/duration, target level and
  placement. Dispatch resolves route and capacity on the server. A client quote is
  an assertion to verify, not an instruction to set a price or outcome.
- Reads may reconcile overdue work; the name `getGameplay04KeepV1` does not mean
  its transaction is necessarily free of writes. The schedule uses the same core
  and validates persisted wakeup correlation before running it.
- 0.4 resources are credited at return. Do not reuse G001's materialized-accrual or
  passive-resource assumptions in the new HUD, costs or tests.

Root Vitest contains the new shared-core and module-adapter tests. The older
`spacetimedb/tests/` suite uses the module package's separate Node/tsx runner.
Tests with in-memory tables or SDK stubs do not establish actual server scheduling
or SQL visibility; inspect the relevant real loopback/migration evidence as well.

## Identity service routes

[`services/auth-bridge/src/app.ts`](../../../services/auth-bridge/src/app.ts)
connects browser SIWF, Mini App exchange, PTR owner exchange, scoped administrator
endpoints, session refresh and notification routes. Follow its dependencies into
`jwt.ts`, `sessionFamily.ts`, `sessionCookie.ts` and `config.ts` for claim/session
changes. PTR owner exchange is a separate route from atlas/admin credentials.

The service's own `test/`, package scripts and lockfile are the verification
boundary. Root app types do not typecheck the service. The
[Farcaster guide](../../farcaster-integration.md) explains user entry, and the
[service README](../../../services/auth-bridge/README.md) covers configuration.

## Release and recovery routes

Trace the fixed caller and its generated inputs, rather than reading similarly
named scripts in alphabetical order. These layers do different work:

| Stage | Sources | What the stage establishes |
| --- | --- | --- |
| Binding production | [local-binding-runtime](../../../scripts/local-binding-runtime.mjs), [runtime core](../../../scripts/local-binding-runtime-core.mjs), realm locked-source builders | Actual compiled module/binding outputs from recorded committed source; G001 compatibility is a check |
| Operation and recovery bundles | [operation runtime](../../../scripts/local-operation-bundle-runtime.mjs), [operation core](../../../scripts/local-operation-bundle-runtime-core.mjs), [recovery runtime](../../../scripts/local-recovery-bundle-runtime.mjs) | Fixed bundle exports, loading and source identity |
| Matched artifact inputs | [local-release-artifact-inputs](../../../scripts/local-release-artifact-inputs.mjs) | Binding, operation and recovery producers agree on commit/tree; returns ordered candidate files |
| Derived release family | [closure family](../../../scripts/local-prepared-closure-family.mjs), [inventory](../../../scripts/local-prepared-closure-inventory.mjs), [source pins](../../../scripts/local-prepared-source-pins.mjs) | Generated consumers match the prepared source family; no hand-edited pin/count repair |
| Candidate installation | [workspace](../../../scripts/local-release-workspace.mjs), [lock](../../../scripts/local-release-candidate-lock.mjs), [transaction install](../../../scripts/local-release-transaction-install.mjs), [transaction recovery](../../../scripts/local-release-transaction-recovery.mjs) | Separate immutable source/candidate, owned filesystem writes and crash recovery |
| Production operation lanes | [dispatcher](../../../scripts/sealed-realms-production-dispatch.mjs), realm-specific `sealed-realms-production-*-workflow-entry.mjs` and `*-lane-entry.mjs` | Select and execute a fixed G001/G002/PTR/activation operation with its authority/evidence |
| Hosted frontend | [deploy-pages workflow](../../../.github/workflows/deploy-pages.yml), [sealed launch verifier](../../../scripts/verify-0.4.0-sealed-launch.mjs) | Classify source, build approved frontend output, deploy and verify; a skipped deploy is not a new release |
| Recovery transport | [gateway entry](../../../services/release-recovery/src/index-gateway.ts), [gateway](../../../services/release-recovery/src/gateway.ts), [private signer entry](../../../services/release-recovery/src/index-signer.ts) | HTTP boundary forwards only the supported protocol to a private service binding |
| Recovery authorization | [signer environment](../../../services/release-recovery/src/signerEnvironment.ts), [signer control](../../../services/release-recovery/src/signerControl.ts), [GitHub OIDC](../../../services/release-recovery/src/githubOidc.ts), [durable ledger](../../../services/release-recovery/src/ledgerDurableObjectV2.ts) | Independently verified source/artifact/workflow facts and durable issue/claim/completion/reconciliation |

The integrated local family currently has a
[native probe caller](../../../tests/fixtures/localReleaseCompiledFamilyNativeProbe.mjs).
It composes real producer outputs, candidate installation and repeated derivation.
It is a verification fixture, not a supported production assembler command.
Useful suites are `localReleaseArtifactInputs`, `localPreparedClosureFamily`,
`localReleaseWorkspace`, `localReleaseTransactionInstall` and
`localReleaseTransactionRecovery` under root `tests/`.

Two concrete operating seams remain visible in source:

- [`sealed-realms-production-activation-workflow-entry.mjs`](../../../scripts/sealed-realms-production-activation-workflow-entry.mjs)
  supplies unavailable implementations for deployment/binding attesters, import
  evidence and owner provision resolution. Its lane interface alone is not the
  complete provider operation.
- The [Pages workflow](../../../.github/workflows/deploy-pages.yml) implements
  `deploy-recovery` at `c51bb00`, matching the defined Linux/WSL runner profile in
  [`githubOidc.ts`](../../../services/release-recovery/src/githubOidc.ts) and the
  claim → fresh boundary → deployment → mandatory postflight contract. The actual
  runner and private state remain unprovisioned; tracked generated bundle/manifest
  installation, final source-family preparation and live authorization acceptance
  remain outstanding. Other Pages/sealed-realm lanes retain Mac selections.

Recovery service unit tests live in `services/release-recovery/test`; real
Cloudflare-runtime tests live in `test-workerd`. The
[release/infrastructure audit](release-and-infrastructure.md),
[assembler specification](../../superpowers/specs/2026-09-06-warpkeep-local-release-assembler-design.md)
and [delivery journal](../../operations/0.4.0-live-delivery-status.md) distinguish
component evidence, actual provider state and unfinished integration. Candidate
file rollback and write-preserving live database recovery are separate subjects.

## Generators, assets and public output

| Output family | Authoring/producer route | Validation route |
| --- | --- | --- |
| Keep voxel dressing | [planKeep04DressingSource](../../../src/components/keep04/planKeep04DressingSource.ts) → [generate-keep04-voxel-dressing](../../../scripts/generate-keep04-voxel-dressing.ts) → `keep04DressingPlans.generated.ts` | `keep04DressingGenerator.test.ts`, producer `--check` used by root build |
| Database bindings | Module schema/procedure roots → [binding runtime](../../../scripts/local-binding-runtime.mjs) / [binding generator](../../../scripts/generate-spacetime-bindings.mjs) | [binding verifier](../../../scripts/verify-spacetime-bindings.mjs), module/ABI tests and current family evidence |
| Atlas runtime release | [atlas CLI](../../../scripts/atlas/greater-realm-cli.ts), [candidate generator](../../../scripts/atlas/greater-realm-candidate-generator.ts), [runtime release](../../../scripts/atlas/greater-realm-runtime-release.ts) | Atlas contract/audit suites and [public boundary verifier](../../../scripts/atlas/verify-public-boundary.mjs) |
| Browser asset catalogs | Recorded asset registry and [catalog generator](../../../scripts/generate-inner-keep-browser-asset-catalog.mjs) | Runtime integrity and production-dist asset checks in [package.json](../../../package.json) |
| Release closures/pins | Matched artifact producers and closure-family derivation above | Family tests, independent candidate verification and convergence evidence |

`public/` contains deliverable runtime assets and static metadata. Source masters,
private atlas packages and local captures have different roles. Read
[ASSETS-LICENSE](../../../ASSETS-LICENSE.md), [LICENSING](../../../LICENSING.md) and
the asset's dated provenance before changing media. New art direction does not
change a reused model's ownership or terms.

The root build checks generated plans, asset catalogs/integrity, TypeScript,
Vite output, production exclusions, atlas public boundaries and Mini App metadata.
Source generators, generated outputs and local artifacts should be recognizable
as separate review units. Dependency trees, `dist`, private receipts and temporary
probes are not source inputs to commit wholesale.

## Supporting documentation and local tooling

- [Development workflow](../../engineering/development-workflow.md): document
  ownership and practical verification, including fresh clones versus shared
  dependency junctions.
- [Gameplay/visual audit](gameplay-and-visuals.md): connected UI and rendering
  observations; [performance record](../../evidence/0.4.0/performance.md): measured
  workloads and their limits.
- `docs/design/`, `docs/gameplay/` and `docs/superpowers/specs/`: product and feature
  intent. Dated plans explain decisions but do not replace inspection of callers.
- `docs/evidence/0.4.0/`: dated source/test/runtime observations; use the relevant
  topic's latest entry rather than treating every old failure as current.
- `dev/`, `src/dev/`, `owner-canary/` and `tests/fixtures/`: isolated QA and canary
  entry points. Inspect their build exclusions and authority before reusing them.
- `.github/workflows/` and package manifests: actual CI selection and commands.
  Root, module, auth and recovery packages have distinct check boundaries.
- [Documentation index](../../README.md): product, operating, legal and historical
  reading routes without duplicating the implementation map.

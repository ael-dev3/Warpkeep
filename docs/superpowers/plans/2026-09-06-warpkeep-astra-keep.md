# Warpkeep 0.4 Verdant Citadel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The owner explicitly assigns this redesign's code work to GPT-6 Astra. Do not spawn additional agents without the controller's authorized execution assignment. Independent review remains a controller gate after each task.

**Goal:** Ship a distinct, readable internal keep through the real owner-only PTR entry, connecting authoritative gathering, permanent placement, construction and future benefits without changing Genesis 001.

**Architecture:** Add an opaque, session-bound 0.4 capability alongside the existing PTR atlas capability, and a controller that publishes validated immutable 0.4 presentation. A dedicated PTR surface host switches between the existing GreaterRealm world and a new keep screen/Three.js host; both use the same controller but never render concurrently. Reuse neutral pinned asset loading and bounded voxel meshing, not G001 presentation/economic authority.

**Tech Stack:** Existing React 19, TypeScript, Three.js 0.185.1, SpacetimeDB generated TypeScript bindings, Vitest and Testing Library. Root frontend commands use the repository's Node `>=22.13 <23`; the accepted isolated binding-generation runtime retains its own pinned toolchain. No new package, service, engine or provider.

**Spec:** `docs/superpowers/specs/2026-09-06-warpkeep-astra-keep-design.md` (committed as `2327421`), together with the owner constraints in `docs/superpowers/specs/2026-09-05-warpkeep-voxel-renderer-design.md` and mechanics in `docs/superpowers/specs/2026-09-05-warpkeep-0.4-gameplay-design.md`.

## Global Constraints

- Use Astra for implementation of this redesign.
- Do not claim that preserved third-party or pre-existing assets were newly authored by Astra.
- Genesis 001 gameplay, presentation and data remain unchanged. Genesis 002 stays sealed; PTR stays owner-only.
- Keep the existing rejection of legacy gameplay props when PTR authority is present.
- Never hand-invent generated methods or widen transport into arbitrary RPC.
- Forest and voxels are visual-only: no new terrain destruction, excavation, interactive vegetation, harvesting targets, collision or persistence mechanics.
- Four Workers; six existing building kinds; five levels; one active Builder; no new queue, cancellation, relocation, refund, resource kind or payment.
- Unknown commit status retries the same envelope; stale quotes refresh and require confirmation. No optimistic resource spending or automatic rebinding of build assertions.
- Realm/session/database/epoch changes discard presentation and retire pending operations. Credentials never enter the controller's public snapshot, renderer, DOM, telemetry, browser persistence or QA evidence.
- Only one scene canvas remains active. Entering the keep stops hidden world rendering.
- Preserve existing renderer ceilings. Actual-owner PTR journey and physical-phone evidence must be distinguished from local fixtures, emulation and screenshots.
- Do not change admissions, authentication endpoints, server policy/schema, atlas topology, pinned shared assets, G001 scene implementations or release infrastructure in these tasks.
- All paths below are relative to `C:/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree`. Preserve unrelated dirty-worktree edits. Stage only each reviewed task's files; this plan author does not commit it.

## Task order and file ownership

Execute Tasks 0–8 in order. Each is a separately reviewable deliverable, not permission to ship an incomplete branch. The controller may carry genuine generated bindings before final release source closure is frozen; it must regenerate/reverify final closure later. Source carry is not deployment or admission activation.

| Task | Sole responsibility | New or narrowly modified files |
| --- | --- | --- |
| 0 | Generated SDK prerequisite | Generated `spacetimedb/ptr/generated-bindings/**`; `tests/ptrGameplay04Bindings.test.ts` |
| 1 | Authenticated five-operation capability | Modify `src/ptr/ptrRealmConnection.ts`; create `src/ptr/gameplay04/ptrGameplay04Types.ts`, `ptrGameplay04Errors.ts`; tests |
| 2 | Runtime validation and UI policy | Create `src/ptr/gameplay04/gameplay04State.ts`, `gameplay04Presentation.ts`, `gameplay04Placement.ts`; fixture and tests |
| 3 | Single-flight state/command lifecycle | Create `src/ptr/gameplay04/createGameplay04Controller.ts`, `useGameplay04Controller.ts`; controller tests |
| 4 | Usable keep and world action panels | Create `src/components/keep04/Keep04Screen.tsx`, `Keep04Screen.css`, `Keep04WorkerPanel.tsx`, `Keep04BuildingPanel.tsx`, `Keep04Schematic.tsx`; UI tests |
| 5 | Actual PTR route and resource choice | Create `src/ptr/PtrGameplay04SurfaceHost.tsx`; modify `PtrRealmProvider.tsx`, `WarpkeepExperience.tsx`, `RealmMapScreen.tsx`, `GreaterRealmWorldScene.tsx`; route tests |
| 6 | New scene, all six silhouettes and meshed setting | Create `src/components/keep04/keep04VisualProfile.ts`, `keep04VoxelDressing.ts`, `loadKeep04Assets.ts`, `createKeep04Buildings.ts`, `createKeep04Scene.ts`, `Keep04SceneHost.tsx`; rendering tests and minimal actual-component DEV harness |
| 7 | Failure, lifecycle and accessible motion | Complete the Task 6 host and Task 5 navigation; dedicated lifecycle/accessibility tests |
| 8 | Render and playable acceptance | Complete DEV-only `src/dev/Keep04QaHarness.tsx`, `src/dev/keep04QaMain.tsx`, `dev/keep04-qa.html`; create QA scenarios, browser probe and evidence report; verify actual PTR separately |

The old `InnerKeepScreen`, `innerKeepPresentation`, `createInnerKeepSceneLayer`, `createRealmScene` and their CSS/assets are read-only references. Do not refactor them to make the new code fit. Existing neutral `loadInnerKeepRuntimeAssetBundle`, hashed catalog and `voxelSurfaceMesh` are consumed without modifications. No extra Atlas-to-keep scenery network requests.

## Stable interfaces used by the tasks

Task 0 proves the generated accessor names before Task 1 uses these aliases. These are application aliases of real generated methods, not handwritten SDK implementations:

```ts
// src/ptr/gameplay04/ptrGameplay04Types.ts
import type { DbConnection } from '../../../spacetimedb/ptr/generated-bindings/index';
import type { Building04, Resource04, Cost04 } from '../../../spacetimedb/gameplay04/policy';
import type { Placement04 } from '../../../spacetimedb/gameplay04/placement';

type Procedures04 = InstanceType<typeof DbConnection>['procedures'];
export type ReadWire04 = Awaited<ReturnType<Procedures04['getGameplay04KeepV1']>>;
export type InitializeWire04 = Parameters<Procedures04['initializeGameplay04KeepV1']>[0];
export type DispatchWire04 = Parameters<Procedures04['dispatchGameplay04WorkerV1']>[0];
export type RecallWire04 = Parameters<Procedures04['recallGameplay04WorkerV1']>[0];
export type BuildWire04 = Parameters<Procedures04['startGameplay04BuildingV1']>[0];
export type ResultWire04 = Awaited<ReturnType<Procedures04['startGameplay04BuildingV1']>>;
export type Mutation04 =
  | Readonly<{ kind: 'initialize'; input: InitializeWire04 }>
  | Readonly<{ kind: 'dispatch'; input: DispatchWire04 }>
  | Readonly<{ kind: 'recall'; input: RecallWire04 }>
  | Readonly<{ kind: 'build'; input: BuildWire04 }>;
export type Scope04 = Readonly<{
  generation: number; databaseIdentity: string; anchorQ: number; anchorR: number;
}>;
export type Atlas04 = Readonly<{ atlasId: string; revision: bigint }>;
export type Target04 = Atlas04 & Readonly<{
  locationId: string; resource: Resource04; q: number; r: number;
}>;
export type BuildQuote04 = Readonly<{
  revision: bigint; atlasRevision: bigint; policyVersion: string; layoutDigest: string;
  kind: Building04; targetLevel: number; placement: Placement04;
  cost: Cost04; durationMicros: bigint;
}>;
export type Intent04 =
  | Readonly<{ kind: 'initialize' }>
  | Readonly<{ kind: 'dispatch'; workerOrdinal: number; target: Target04; durationMicros: bigint }>
  | Readonly<{ kind: 'recall'; workerOrdinal: number; atlasRevision: bigint }>
  | Readonly<{ kind: 'build'; quote: BuildQuote04 }>;
```

Use `../../../spacetimedb/...` from `src/ptr/gameplay04/`. `Scope04` is controller-internal metadata, not renderer props; owner auth-epoch is intentionally not copied from private claims. Changing the opaque authority object or generation invalidates the whole capability, which also covers an auth-epoch change without exposing it.

```ts
// Exported from ptrRealmConnection.ts; implementation has access to privateSessions.
export type PtrGameplay04Capability = Readonly<{
  scope: Scope04;
  isCurrent: () => boolean;
  read: (signal: AbortSignal) => Promise<ReadWire04>;
  mutate: (command: Mutation04, signal: AbortSignal) => Promise<ResultWire04>;
}>;
export function createPtrGameplay04Capability(
  session: PtrRealmConnectionSession,
  authority: PtrRealmAuthority,
  anchor: Readonly<{ q: number; r: number }>,
  now?: () => number,
): PtrGameplay04Capability;
export function isCurrentPtrGameplay04Capability(
  value: unknown, authority: PtrRealmAuthority, generation: number,
): value is PtrGameplay04Capability;
```

Use a module-private WeakMap for capability branding and comparison to its exact current session/authority. Do not use an exported registration function or trust a structurally equal object.

```ts
// gameplay04State.ts
export type State04 = Readonly<ReadWire04>;
export function decodeState04(value: unknown, scope: Scope04): State04;

// gameplay04Presentation.ts
export type View04 = Readonly<{
  state: State04;
  atlas: Atlas04 | null;
  receivedAtMs: number;
  balances: Cost04;
  pending: Cost04;
  buildings: readonly BuildingView04[];
  workers: readonly WorkerView04[];
}>;
export type BuildingView04 = Readonly<{
  kind: Building04; placement: Placement04; completedLevel: number;
  targetLevel: number; phase: 'constructing' | 'complete';
  startsAtMicros: bigint | null; completesAtMicros: bigint | null;
}>;
export type WorkerView04 = Readonly<{
  ordinal: number; assignmentRevision: bigint;
  phase: 'idle' | 'outbound' | 'gathering' | 'returning';
  resource: Resource04 | null; route: readonly Readonly<{ q: number; r: number }>[];
  returnsAtMicros: bigint | null; capturedYield: bigint | null;
  lastCredited: bigint | null; lastOverflow: bigint | null;
}>;
export function presentState04(state: State04, atlas: Atlas04 | null, receivedAtMs: number): View04;
export function quoteBuilding04(view: View04, kind: Building04, placement: Placement04): BuildQuote04;
export function buildingBenefit04(view: View04, kind: Building04): Readonly<{
  label: string; current: bigint; next: bigint; unit: 'per-quantum' | 'micros';
}>;

// createGameplay04Controller.ts
export type Snapshot04 = Readonly<{
  phase: 'loading' | 'uninitialized' | 'ready' | 'pending' | 'uncertain' | 'failed' | 'disposed';
  view: View04 | null;
  problem: 'none' | 'reconfirm' | 'capacity' | 'target' | 'authority' | 'unknown' | 'invalid-state';
}>;
export type Controller04 = Readonly<{
  getSnapshot: () => Snapshot04;
  subscribe: (listener: () => void) => () => void;
  refresh: () => Promise<void>;
  setAtlas: (atlas: Atlas04 | null) => void;
  submit: (intent: Intent04) => Promise<void>;
  retryPending: () => Promise<void>;
  dispose: () => void;
}>;
export function createGameplay04Controller(options: Readonly<{
  capability: PtrGameplay04Capability;
  nonce: () => string;
  now: () => number;
}>): Controller04;
// useGameplay04Controller.ts: owns controller, visibility refresh and cleanup.
export function useGameplay04Controller(capability: PtrGameplay04Capability): Readonly<{
  controller: Controller04; snapshot: Snapshot04;
}>;
```

Types are colocated with their owner modules and imported explicitly. `ReadWire04` stays server-shaped; recursively copy and freeze validated data before returning `State04`. The narrower renderer contract in Task 6 contains no `State04`, command capability, identity, receipt or transport.

---

### Task 0: Carry genuine generated PTR gameplay bindings

**Owner:** Controller-operated generation; Astra-owned source/test carry after evidence is available.

**Files:** Modify only generated files returned under `spacetimedb/ptr/generated-bindings/`; create `tests/ptrGameplay04Bindings.test.ts`. Do not add a fake SDK shim, edit backend code, use `--include-private`, or replace a different realm's bindings.

**Prerequisite interface:** `derivePreparedPtrLinuxBindings()` from accepted `scripts/local-binding-runtime.mjs` returns `{ profile, sourceCommit, sourceTree, bundleSha256, dependencyClosureDigest, bindings: readonly { path, bytes: Uint8Array }[] }` on success. It accepts no arguments. The initial real probe against `2327421` failed with `LOCAL_BINDING_WORKER_FAILED` before materialization because the linked snapshot inherited Windows Git configuration inconsistent with the isolated production Git-context requirements. The controller reports a separately committed snapshot repair at `966a95f` and native regression in progress; successful genuine gameplay-binding output has not yet been supplied to this plan author. Do not weaken provenance checks, modify user Git configuration or start duplicate generation; Task 0 waits for the controller's independently validated result.

- [ ] Read the returned source commit/tree and verify the commit contains the five PTR procedure exports in `spacetimedb/ptr/src/index.ts`. Check returned entries are unique regular `.ts` files under exactly `spacetimedb/ptr/generated-bindings/`, with no absolute paths, `..`, backslashes or symlinks. Compare their bytes/hashes to the intended carry. Reject a source/tree mismatch; do not relabel stale output as current.
- [ ] Add the compile-surface test before copying generated files:

```ts
import { expect, it } from 'vitest';
import type { DbConnection } from '../spacetimedb/ptr/generated-bindings/index';
type P = InstanceType<typeof DbConnection>['procedures'];
const accessors = [
  'initializeGameplay04KeepV1', 'getGameplay04KeepV1',
  'dispatchGameplay04WorkerV1', 'recallGameplay04WorkerV1',
  'startGameplay04BuildingV1',
] as const satisfies readonly (keyof P)[];
it('declares precisely the required application gameplay accessors', () => {
  expect(accessors).toHaveLength(5);
  expect(new Set(accessors).size).toBe(5);
});
```

- [ ] Run `npm run typecheck`. Expected initial failure: missing generated gameplay accessor names. A Vitest pass by itself does not verify TypeScript constraints. Record unrelated preexisting type failures separately.
- [ ] Materialize the accepted generator's bytes as a mechanical generated-file copy, never by handwriting TypeScript. The carry must be all returned PTR files, not only five selected procedure files, because associated return types and index registration also change. Compare existing and returned path sets before changing them; remove an obsolete generated file only when it is absent from the accepted complete result and belongs to this exact generated directory.
- [ ] Run `npm run typecheck`, `npm test -- tests/ptrGameplay04Bindings.test.ts tests/ptrRealmConnection.test.ts tests/ptrRealmBackend.test.ts`. Update exact public/private-surface assertions only to the source-proven output; do not relax them. If generated bindings or descriptor assertions disagree, stop this task for the controller's generation repair.
- [ ] Have the controller review generation provenance, byte equality and API surface; commit only that source carry and its test with `chore: carry generated PTR gameplay bindings`. This is not a release activation claim. No downstream task begins typed SDK wiring until this gate passes.

### Task 1: Add a separate authenticated five-operation capability

**Files:** Modify `src/ptr/ptrRealmConnection.ts` near `privateSessions`, `assertLiveInvocation` and below `createPtrRealmProcedureInvoker`; create `src/ptr/gameplay04/ptrGameplay04Types.ts`, `src/ptr/gameplay04/ptrGameplay04Errors.ts`, `tests/ptrGameplay04Capability.test.ts`, and `tests/fixtures/gameplay04Client.ts` with the exact wire fixture printed in Task 2. Read `tests/ptrRealmConnection.test.ts` for issued-authority and fake-builder patterns; leave its five-atlas-procedure contract intact.

**Consumes/produces:** Uses Task 0 accessors and the types/signatures above. Exports the branded capability and fixed error classifier; neither exposes an underlying connection or arbitrary procedure name.

- [ ] Add a test using the existing issued-authority/connect builder pattern and fake generated procedures. Capture a deferred gameplay read, close its session, resolve the deferred value and prove the result is rejected. Also reject spread-cloned capability and mismatched authority/generation before an SDK call. Use the concrete assertion body:

```ts
const work = capability.read(new AbortController().signal);
closePtrRealmConnectionSession(session);
readDeferred.resolve(wire);
await expect(work).rejects.toMatchObject({ kind: 'authority' });
expect(isCurrentPtrGameplay04Capability({ ...capability }, authority, session.generation)).toBe(false);
```

`capability`, `session` and `authority` come from the real test connection path, not an exported production test-bypass. `readDeferred` is `Promise.withResolvers<ReadWire04>()`; `wire` is `EMPTY_WIRE04`, created in the shared test fixture during this task using the complete shape printed in Task 2.
- [ ] Run `npm test -- tests/ptrGameplay04Capability.test.ts`; expect the new capability import to fail before implementation.
- [ ] Define `Gameplay04ClientError` with constructor `(kind: 'authority' | 'not-initialized' | 'rejected' | 'uncertain' | 'invalid-state', code?: Gameplay04KeepErrorCode | Gameplay04WorkerErrorCode | Gameplay04ConstructionErrorCode)`; assign readonly `kind` and `code`, and use the fixed message `PTR gameplay request is unavailable.` The optional code must be in the explicit existing error-code set, never arbitrary backend text. The installed SDK rejects procedure failure `result.value` in `node_modules/spacetimedb/src/sdk/db_connection_impl.ts:1241`; test the actual generated/runtime error shape at this gate. Recognize only exact bounded strings in the existing exported gameplay error unions. `GAMEPLAY04_NOT_INITIALIZED` maps to `not-initialized`; known input/sequence/capacity/quote errors map to `rejected`; unrecognized errors map to `uncertain`. Never substring-match arbitrary error messages or infer rollback from timeout.
- [ ] Implement the capability inside `ptrRealmConnection.ts` so it can use `privateSessions` without exporting them. Invoke the SDK through an exhaustive switch:

```ts
switch (command.kind) {
  case 'initialize': operation = procedures.initializeGameplay04KeepV1(command.input); break;
  case 'dispatch': operation = procedures.dispatchGameplay04WorkerV1(command.input); break;
  case 'recall': operation = procedures.recallGameplay04WorkerV1(command.input); break;
  case 'build': operation = procedures.startGameplay04BuildingV1(command.input); break;
}
```

Authenticate before starting and again before returning/rejecting. Use an abort listener removed on every resolution path; it suppresses late results without pretending to cancel a committed transaction. Use a gameplay-specific await helper that preserves whitelisted procedure rejections; do not reuse the atlas helper that erases all errors. A definitive gameplay rejection does not retire the socket. Existing connection-level failures still retire the session via existing lifecycle logic. Malformed successful responses are handled as protocol failure in Task 3.
- [ ] Add parameterized tests for all five methods, both command and session aborts, expired authority, synchronous SDK throw, exact server rejection, unrecognized rejection, and secret-bearing error input. Assert no caller can invoke an atlas-admin, G001 or sixth gameplay procedure, and neither public capability enumeration nor thrown messages includes JWT/SDK tokens.
- [ ] Run `npm test -- tests/ptrGameplay04Capability.test.ts tests/ptrRealmConnection.test.ts` and `npm run typecheck`; request review, then commit only Task 1 files with `feat: add isolated PTR gameplay capability`.

### Task 2: Validate 0.4 state and derive exact build/benefit presentation

**Files:** Create `src/ptr/gameplay04/gameplay04State.ts`, `gameplay04Presentation.ts`, `gameplay04Placement.ts`, `tests/gameplay04ClientState.test.ts`, `tests/gameplay04Presentation.test.ts`, `tests/gameplay04ClientPlacement.test.ts`; extend `tests/fixtures/gameplay04Client.ts` created in Task 1.

**Consumes:** Real `ReadWire04`; dependency-free 0.4 `policy`, `placement`, `workerState`, `workerJourney`, and `construction` constants. **Produces:** `State04`, `View04`, `BuildQuote04` and benefit/placement functions above. Import no module under `spacetimedb/src/` or legacy Inner Keep presentation.

- [ ] Reuse this genuine wire-shape fixture created in Task 1 and make the first test reject an excessive balance:

```ts
export const EMPTY_WIRE04 = {
  policyVersion: GAMEPLAY04_POLICY_VERSION,
  layoutVersion: GAMEPLAY04_LAYOUT_VERSION, layoutDigest: GAMEPLAY04_LAYOUT_DIGEST,
  revision: 1n, lastAcceptedSequence: 1n,
  food: 0n, wood: 0n, stone: 0n, gold: 0n,
  workers: [0, 1, 2, 3].map(ordinal => ({ ordinal, assignmentRevision: 0n,
    assignment: undefined, lastReturn: undefined })),
  buildings: [], project: undefined,
  completedLevels: { mill: 0, lumberCamp: 0, stoneworks: 0, goldworks: 0, barracks: 0, cathedral: 0 },
  completedEffects: { foodYieldPerQuantum: 10n, woodYieldPerQuantum: 10n,
    stoneYieldPerQuantum: 10n, goldYieldPerQuantum: 10n,
    travelPerEdgeMicros: 2_000_000n, levelOneBuildDurationMicros: 120_000_000n },
} satisfies ReadWire04;
export const SCOPE04 = { generation: 1, databaseIdentity: 'a'.repeat(64), anchorQ: 0, anchorR: 0 };
it('rejects over-cap balances before presentation', () => {
  expect(() => decodeState04({ ...EMPTY_WIRE04, wood: 1_000_001n }, SCOPE04)).toThrow();
});
```

Import the three policy/layout constants from the actual shared 0.4 files. The four slots are zero-based, verified in `spacetimedb/gameplay04/keep.ts:287`.
- [ ] Run `npm test -- tests/gameplay04ClientState.test.ts tests/gameplay04Presentation.test.ts tests/gameplay04ClientPlacement.test.ts`; expect missing functions.
- [ ] Implement closed-shape, bounded decoding. Reject getters/proxies whose data cannot be safely copied, unknown enumerable fields, duplicate/missing ordinals, sparse arrays, invalid integers, negative/u64 overflow, balances over 1,000,000, more than six buildings, duplicate kinds, overlapping/illegal placements and wrong policy/layout digests. Require four Workers, route lengths 1–8193, contiguous axial points via `validateRoute04`, route start at scope anchor, `routeEdges === route.length - 1`, valid phase/timestamp ordering and captured rates permitted by shared policy. Validate optional `lastReturn` credit/overflow arithmetic and assignment revision relation. Reject a project without its matching building, multiple constructing interpretations, wrong target level, impossible times or cost/duration shape. Derive completed-level/effect expectations from actual completed buildings and compare to returned fields; never silently fix inconsistent server data.
- [ ] Implement pure presentation and quote functions with shared policy helpers:

```ts
const cost = buildingCost04(kind, targetLevel);
const durationMicros = buildingDuration04(targetLevel, completed);
return Object.freeze({ revision: view.state.revision, atlasRevision: view.atlas.revision,
  policyVersion: view.state.policyVersion, layoutDigest: view.state.layoutDigest,
  kind, targetLevel, placement: Object.freeze({ ...placement }), cost, durationMicros });
```

`quoteBuilding04` throws fixed local preflight errors for null atlas, busy Builder, level five, malformed placement, or mismatched kind. Upgrade uses the exact persisted transform, never the draft. Quotes are local assertions recomputed from validated server state and shared policy, not a new server quote endpoint. Pending totals sum returned `assignment.earned` only as informational accrual, never balance. Copy says `pending · not spendable`. Do not count unearned future quanta as owned resources.
- [ ] Implement `initialPlacement04(kind, occupied): Placement04 | null`, `nudgePlacement04(draft, dx: -1|0|1, dz: -1|0|1): Placement04`, `rotatePlacement04(draft): Placement04`, and `placementMessage04(reason): string` in `gameplay04Placement.ts`. Initial search is deterministic: z from -40m to 32m, x from -44m to 44m in 0.5m increments; cap at the finite grid size and return first `evaluatePlacement04(...).valid`, else null. Direction buttons change exactly 500,000 microunits; rotation cycles 0/90000/180000/270000. UI and 3D ghosts call the same existing `evaluatePlacement04` and never use scenery for legality.
- [ ] Test Mill level-one cost 20/40/20/0, benefit 10→12, all six before/after effects at levels 0–5, Cathedral integer rounding, unchanged captured Worker yield, all deficits, one active project, unchanged upgrade transform, illegal civic/road placement and no free site. Check `Object.isFrozen` recursively. Add a source-import test rejecting G001 policy/presentation imports in the new directory.
- [ ] Run the three new tests plus `tests/gameplay04Policy.test.ts`, `tests/gameplay04Placement.test.ts`, `tests/gameplay04WorkerJourney.test.ts`; run typecheck, review and commit `feat: validate and present isolated 0.4 keep state`.

### Task 3: Single-flight controller, exact replay and refresh lifecycle

**Files:** Create `src/ptr/gameplay04/createGameplay04Controller.ts`, `useGameplay04Controller.ts`, `tests/gameplay04Controller.test.ts`, `tests/gameplay04ControllerLifecycle.test.tsx`. Extend only `tests/fixtures/gameplay04Client.ts` with a test-only scripted capability; do not export test authority creation from production.

**Consumes/produces:** Stable interfaces above. `useGameplay04Controller` uses `useSyncExternalStore`; the same instance survives keep/world navigation, but not a capability replacement.

- [ ] Add the exact-retry failing test using a scripted test capability whose `mutate` spy first throws `new Gameplay04ClientError('uncertain')`, then returns `{ sequence: 2n, revision: 2n }`:

```ts
const controller = createGameplay04Controller({ capability, nonce: () => 'b'.repeat(32), now: () => 1000 });
await controller.refresh();
controller.setAtlas({ atlasId: 'atlas-test', revision: 1n });
await controller.submit({ kind: 'dispatch', workerOrdinal: 0, target: {
  atlasId: 'atlas-test', revision: 1n, locationId: 'resource-test', resource: 'wood', q: 1, r: 0,
}, durationMicros: 60_000_000n });
const first = mutate.mock.calls[0][0];
expect(controller.getSnapshot().phase).toBe('uncertain');
await controller.retryPending();
expect(mutate.mock.calls[1][0]).toBe(first);
expect(first.input.requestKey).toBe('g04:2:' + 'b'.repeat(32));
```

The scripted capability starts with `EMPTY_WIRE04`, and its successful follow-up read returns revision/sequence two with the authoritative assignment. No fake capability crosses production branding in route tests.
- [ ] Run `npm test -- tests/gameplay04Controller.test.ts tests/gameplay04ControllerLifecycle.test.tsx`; expect missing controller/hook.
- [ ] Implement a private single pending immutable `Mutation04`; do not publish it. Read first on entry. Only exact `not-initialized` enables a visible Initialize action; do not seed by treating network failure as absence. Initialization uses sequence one, revision zero, current policy. Subsequent commands use lastAcceptedSequence+1, checked for u64 overflow, `g04:<sequence>:<32-lowercase-hex>`, and the displayed revision. Production nonce uses `crypto.getRandomValues(new Uint8Array(16))` and fixed lowercase hex encoding. Capture the complete envelope once before the first call.
- [ ] For a successful accepted result, validate sequence equals submitted sequence and revision is bounded/consistent, then read authoritative state; never synthesize balances or projects. If that read fails, keep controls read-only and retain confirmed-versus-unknown outcome internally. `refresh` does not clear a commit-ambiguous envelope merely because lastAcceptedSequence advanced: another tab may have used the sequence. Only exact replay result or a definitive rejection resolves this envelope. A definitive rejection triggers fresh read and `problem='reconfirm'` (or fixed capacity/target message) without resubmitting. `GAMEPLAY04_INPUT_INVALID` is not a dedicated stale-quote code; handle it with generic refresh/reconfirm, not an invented distinction.
- [ ] Implement hard invalidation: all async paths capture the controller life counter; before and after awaited work check counter, disposed flag and capability.isCurrent(). A disposed/replaced session drops all state and its pending envelope. It must not silently replay a command into a new generation. Re-entry reads persisted state; copy explains that a previous action may have completed when its outcome was unknown. Suspension/expiry never returns optimistic ready state.
- [ ] Poll one read at a time at 5 seconds while visible; pause on hidden and refresh immediately on visibility/focus return. Do not poll during mutation or overlap refreshes. Store authoritative Worker phase from each read. Current wire has no server observation timestamp: show `Estimated return/build time`, using local time only for countdown presentation, then `Awaiting Realm update` at zero until server state changes. A local clock jump must not mark a project complete or change spendable resources.
- [ ] Test duplicate button clicks, overlapping polls, retry byte/object identity, malformed responses, disposed late reads, authority expiry before/after calls, sequence exhaustion, two-tab sequence conflict, stale build quotes, nonce rejection, rejected initialization, hidden polling pause and clock jumps. Add one test proving the pending request key never appears in snapshot serialization.
- [ ] Run the new tests and Tasks 1–2 tests plus typecheck; review and commit `feat: control authoritative 0.4 keep commands and refresh`.

### Task 4: Complete accessible keep UI and schematic first

**Files:** Create `src/components/keep04/Keep04Screen.tsx`, `Keep04Screen.css`, `Keep04WorkerPanel.tsx`, `Keep04BuildingPanel.tsx`, `Keep04Schematic.tsx`, `tests/Keep04Screen.test.tsx`, `tests/Keep04PlacementUi.test.tsx`, `tests/Keep04Benefits.test.tsx`.

**Interfaces:**

```ts
export type Keep04ScreenProps = Readonly<{
  snapshot: Snapshot04;
  controller: Controller04;
  selection: Keep04UiSelection;
  onSelectionChange: (selection: Keep04UiSelection) => void;
  onBack: () => void;
  quality: 'high' | 'balanced' | 'reduced';
  reducedMotion: boolean;
  onFindResources: (resource: Resource04 | null) => void;
  onReturnToWorld: () => void;
}>;
export type Keep04UiSelection = Readonly<{
  selectedKind: Building04 | null;
  draft: Placement04 | null;
  panel: 'workers' | 'buildings' | null;
}>;
```

`Keep04Screen` receives controlled UI selection from its host; Workers/building children receive view, selected kind/draft and intent callbacks, not transport. `Keep04Schematic` receives `buildings`, `draft`, selected kind and select/change callbacks. Keep controller state outside the screen so navigation cannot reset gameplay. Task 4 tests use a small React wrapper with `useState<Keep04UiSelection>`; Task 5 binds that interface to the existing neutral surface-navigation hook.

- [ ] Render a ready zero-balance fixture; test four Worker buttons, four resource labels, six named building choices and disabled build confirmation. Test permanent-placement text is present when a valid draft is selected and pending resources cannot enable spending:

```tsx
render(<Keep04Screen snapshot={snapshot} controller={controller} quality="balanced"
  selection={selection} onSelectionChange={setSelection} onBack={back}
  reducedMotion={false} onFindResources={find} onReturnToWorld={back} />);
expect(screen.getByRole('button', { name: /Worker 1/ })).toBeVisible();
expect(screen.getByText(/pending.*not spendable/i)).toBeVisible();
expect(screen.getByRole('button', { name: /Confirm placement/i })).toBeDisabled();
```

Fixture controller implements the Task 3 interface with spies; fixture snapshot derives from `presentState04`. Use explicit fixture interaction to open building detail before querying confirmation.
- [ ] Run the three UI tests; expect missing components.
- [ ] Implement hierarchy: compact header `VERDANT CITADEL` / `Your keep`; resource strip; large scene/schematic region; one bottom command dock; one open panel at a time. Desktop panel width 320px; at 390px use an in-flow/bottom sheet with safe-area padding, scrollable body and visible sticky primary action. Minimum 44px buttons, body text at least 14px, normal-text contrast at least 4.5:1. CSS is scoped under `.keep04`, never generic `.inner-keep` or shared root changes.
- [ ] Implement visible initialize/loading/failed/uncertain states before the ready view. Initialization button calls only `{kind:'initialize'}`. Unknown outcome shows `Check outcome` and `Retry same request` only when permitted by controller state, not another enabled build/dispatch. Build confirmation submits its frozen `BuildQuote04` once; changed state invalidates it and displays `Review updated costs and confirm again`. No local balance deduction.
- [ ] Implement six catalog rows with exact deficits, duration, current/next benefit, and an actionable `Find food/wood/stone/gold` for the first deficit. Benefit labels: food/wood/stone/gold per 10-second quantum; Barracks travel time per edge; Cathedral future build duration. Do not advertise combat, faith, G001 discounts or retroactive benefits. Completed level is always a number/text badge, not color alone.
- [ ] Implement schematic placement on normalized support bounds x[-44,44], z[-40,32] with an SVG/HTML footprint overlay; keep the civic/road exclusions visible. Click/tap maps to the nearest half-meter; arrows nudge, R rotates, Escape closes panel, and explicit buttons provide equivalent touch/keyboard controls. Announce invalid reasons via `role='status'`, restore focus to the opening control, and never hide a focused control behind a replaced canvas. The permanent confirmation says construction cannot be cancelled and spent resources are not refunded. Free draft cancellation remains a UI-only action.
- [ ] Test all controls without WebGL, keyboard focus/back behavior, 0.5m/quarter-turn parity, busy Builder, maximum level, exact unchanged upgrade transform, construction waiting beyond estimated zero, and all six effects. Add CSS-source assertions for `.keep04` scope, forced-colors and reduced-motion support; actual contrast/layout remains Task 8 visual acceptance.
- [ ] Run UI tests plus Task 2–3 tests and typecheck; review and commit `feat: add playable 0.4 keep controls and schematic`.

### Task 5: Wire actual PTR entry, world resource selection and Back

Execution clarification (2026-09-06): a supplied `ptrGameplay04` also requests
the PTR boundary; capability-only input without verified authority/anchor fails
before renderer creation. Add the corresponding negative test.

The scene additionally accepts one optional presentation-only prop:
`renderGameplay04WorldPanel?: (selection: WorldSelection04 | null,
validateSelection: (selection: WorldSelection04) => boolean) => ReactNode`.
Host-owned dispatch controls render beside the selected resource. Before dispatch,
the guard checks latest scene/source/view/selection refs and lifecycle, not stale
render-time closures. Reject replaced source/generation, mismatched atlas/target,
refreshing and unmounted state, including retained handlers. This is freshness
validation only, never owner authority or capacity proof. Keep controller and
capability out of the scene and preserve legacy workerControl behavior. Cover
source replacement and unmount in negative tests. This resolves the callback-only
interface's inability to synchronously validate a selected target at invocation.

**Files:** Create `src/ptr/PtrGameplay04SurfaceHost.tsx`, `tests/PtrGameplay04SurfaceHost.test.tsx`; modify `src/ptr/PtrRealmProvider.tsx` snapshot/runtime lifecycle, `src/components/WarpkeepExperience.tsx:1764`, `src/components/realm/RealmMapScreen.tsx:851`, `src/components/realm/GreaterRealmWorldScene.tsx` props and selected-resource section. Extend `tests/WarpkeepExperiencePtrRealm.test.tsx`, `tests/greaterRealmWorldScene.test.tsx`, `tests/ptrRealmConnection.test.ts`, and `tests/PtrRealmProvider.test.tsx`.

**Interfaces:** Add `gameplay04: PtrGameplay04Capability | null` to provider snapshot and `createGameplay04(session, authority, anchor, now)` to its injected runtime. Add `ptrGameplay04?: PtrGameplay04Capability` to `RealmMapScreenProps`—not any legacy resource/Worker/keep props—and export that existing type for a type-only import by the new host. Export `PtrGameplay04SurfaceHost(props: RealmMapScreenProps & { ptrGameplay04: PtrGameplay04Capability }): ReactElement` only from its module. The host receives existing verified PTR authority/bridge/anchor and rechecks capability matching before creating the controller.

Add an optional presentation-only `onGameplay04WorldSelection?: (selection: WorldSelection04 | null) => void` and `resourceFocus04?: Resource04 | null` to GreaterRealm scene props:

```ts
export type WorldSelection04 = Readonly<{
  sessionGeneration: number;
  atlas: Atlas04;
  target: Target04 | null;
}>;
```

The callback exposes only the currently validated command snapshot and selected public location; it is neither owner authority nor capacity proof. Atlas/target validity is rechecked against current scene selection before each dispatch button invocation. A null callback value clears the transient selected target and disables world dispatch during refresh, identity/view changes or disposal. The controller retains the last verified atlas ID/revision within its current capability lifetime as build/recall assertions; otherwise unmounting the world to enter the keep would disable every build. Those assertions are not proof the atlas is still current: server commands/read binding checks remain decisive and any mismatch requires a fresh world view. A new controller starts with null atlas. The host never retains a selected target across scene lifetimes.

- [ ] Add route tests proving actual ready PTR receives the new capability and renders `Open keep`, while passing legacy `innerKeep` alongside PTR still produces unavailable. A copied capability or wrong generation must prevent any renderer creation. G002 entry remains sealed before connection. Use the existing real branded test authority/provider setup, not a fake structural authority.
- [ ] Run `npm test -- tests/WarpkeepExperiencePtrRealm.test.tsx tests/PtrGameplay04SurfaceHost.test.tsx tests/greaterRealmWorldScene.test.tsx`; expect no new keep entry.
- [ ] In provider, create the capability only after verified view preflight and successful bridge creation; publish it only while `phase='ready'`. Baseline and every invalidation clear it. Update injected runtime fixtures deliberately, keeping default fail-closed behavior. In `WarpkeepExperience`, pass this separate capability only on the actual PTR branch.
- [ ] In `RealmMapScreen`, preserve `legacySurfacePresent` verbatim. After existing PTR authority/anchor validation and strategy selection, select the new host only for a current matching capability and `greater-realm` strategy. An explicit malformed capability fails unavailable; absent capability retains current non-gameplay map behavior for safe staged source integration. Genesis routes never import or instantiate the new host eagerly; use a lazy import on the PTR branch.
- [ ] In the host use existing neutral `useRealmSurfaceNavigation({ historyEnabled: !miniAppHost.isMiniApp, identityKey })` and `useMiniAppBackNavigation(surface.depth + 1, handleBack)` without modifying either hook. Build `identityKey` from current capability generation/database/anchor and verified PTR identity; it is navigation metadata, never command authority. Empty stack means world; `Open keep` pushes `{kind:'inner-keep'}`; catalogue, placement, completed detail and Worker panel push the existing presentation-only route kinds. Keep an in-memory draft beside the hook, map route changes to `Keep04UiSelection`, and clear draft when leaving placement. Updating the same draft never pushes another history entry. `Find resources` calls `closeToRealm()` and opens the resource panel focused by kind. `handleBack` calls `surface.back()` when depth>0, otherwise existing `onRequestReturn`. Sanitize current routes to this host's allowed subset; neither a route nor a building-kind string bypasses state validation. Changing world/keep unmounts the other scene, not CSS hiding. Preserve anchor/graphics and test browser Back and host Back from pending draft/keep/ready world. Do not add duplicate history listeners or modify G001 hook behavior.
- [ ] Render a new 0.4 Worker dispatch panel beside the selected actual resource without changing legacy `workerControl` bridge semantics. Four duration buttons are exactly 60 seconds, 10 minutes, 1 hour, 8 hours; choose a specific idle Worker ordinal, show resource/site and preview-only duration/yield copy, then submit an explicit dispatch. Disabled/refreshing atlas clears command availability even if old art remains visible. Node count is informational; backend reservations decide capacity. Recall uses the current atlas revision and selected Worker. Server routes returned in read state drive route/phase presentation, not client-invented paths.
- [ ] Provide route visualization for the four validated Worker routes as a bounded 2D route/status inset in the new 0.4 Worker panel using the exact returned axial points, clearly labeled `Journey route`. It shows start, target and authoritative phase, works in fallback, and does not disclose unrelated atlas cells. Use a single SVG polyline per route with at most 8193 validated points and labeled endpoints; do not create one React/Three object per point. This task does not modify the existing canvas host's actor authority or add a scene manager. Do not claim 3D actor integration from an inset.
- [ ] Test select→dispatch→return→keep flow using current snapshot callbacks; source replacement invalidates selection, viewport refresh disables dispatch until current, wrong resource/location rejection refreshes without optimistic assignment, and controller remains one instance across routes. Count active world/keep canvases and assert at most one.
- [ ] Run route/provider tests plus capability/controller/UI tests and typecheck. Review and commit `feat: integrate 0.4 keep and gathering into PTR entry`.

### Task 6: Build the distinct Verdant Citadel scene and all six buildings

**Files:** Create `src/components/keep04/keep04VisualProfile.ts`, `keep04VoxelDressing.ts`, `loadKeep04Assets.ts`, `createKeep04Buildings.ts`, `createKeep04Scene.ts`, `Keep04SceneHost.tsx`; modify only new `Keep04Screen.tsx` to insert this host; create `tests/keep04VisualProfile.test.ts`, `tests/keep04VoxelDressing.test.ts`, `tests/keep04Buildings.test.ts`, `tests/keep04Scene.test.ts`. Create the minimal actual-component DEV preview in `src/dev/Keep04QaHarness.tsx`, `src/dev/keep04QaMain.tsx`, `dev/keep04-qa.html` so this task's art review does not depend on Task 8 or live PTR availability.

**Interfaces:**

```ts
export type Quality04 = 'high' | 'balanced' | 'reduced';
export type VisualState04 = Readonly<{
  buildings: readonly BuildingView04[];
  selectedKind: Building04 | null;
  draft: Placement04 | null;
  draftValid: boolean;
}>;
export type SceneTelemetry04 = Readonly<{
  drawCalls: number; triangles: number; geometryBytes: number; textureBytes: number;
  uploadBytes: number; voxelQuads: number; sceneryInstances: number;
  buildingCount: number; pickTargetCount: number;
  fallback: 'none' | 'asset' | 'voxel' | 'budget';
}>;
export type Scene04 = Readonly<{
  scene: THREE.Scene; camera: THREE.OrthographicCamera;
  reconcile: (state: VisualState04) => void;
  resize: (width: number, height: number) => void;
  pickBuilding: (ndcX: number, ndcY: number) => Building04 | null;
  pickPlacement: (ndcX: number, ndcY: number, kind: Building04) => Placement04 | null;
  update: (elapsedSeconds: number) => boolean;
  telemetry: () => SceneTelemetry04;
  dispose: () => void;
}>;
export function createKeep04Scene(options: Readonly<{
  quality: Quality04; reducedMotion: boolean; assets: InnerKeepRuntimeAssetBundle;
}>): Scene04;
export function loadKeep04Assets(options: Readonly<{
  quality: Quality04; reducedMotion: boolean; signal: AbortSignal;
}>): Promise<InnerKeepRuntimeAssetBundle>;
export type Keep04SceneHostProps = Readonly<{
  visual: VisualState04; quality: Quality04; reducedMotion: boolean;
  onSelect: (kind: Building04) => void;
  onPlacement: (placement: Placement04) => void;
  onMode: (mode: 'loading' | 'webgl' | 'fallback') => void;
}>;
```

`loadKeep04Assets` imports pinned catalog/neutral loader, never scene-level G001 validation. It requests only six constructible assets and selected decorative trees/walls used by the new composition, `populationActorIds: []`, existing base URL helper, existing profile mapping and abort support. No asset installations, downloads from new providers or shared file overwrites.

- [ ] Add a scene test with an empty asset bundle and a Mill construction projection. Assert exactly one project silhouette, a selected footprint, no prebuilt Cathedral/Barracks, no scenery pick targets, and zero economics/identity fields accepted by `VisualState04`. Add the voxel test:

```ts
const plan = planKeep04Dressing('reduced');
expect(plan.surfacePlan.uploadBytes).toBeLessThanOrEqual(512 * 96);
expect(plan.surfacePlan.mergedQuadCount).toBeLessThanOrEqual(512);
expect(plan.pickable).toBe(false);
expect(plan.supportHeight).toBe(0);
```

`planKeep04Dressing(quality)` returns `{ surfacePlan: VoxelSurfacePlan, pickable: false, supportHeight: 0 }` from the Task 6 voxel module. Test every profile and deterministic repeated plans before implementation.
- [ ] Run the four scene tests; expect missing modules/functions.
- [ ] Implement fixed `KEEP04_VISUAL_PROFILE` values: masonry `#d7d2ba`, timber `#514237`, roof teal `#397d7d`, warp violet `#8d6ac8`, forest near `#52694b`, distant haze `#a3b3a1`, ground `#7a8063`. Orthographic elevated view looking toward civic center `(0,0,-4)` from `(80,95,105)`; fit the full support rectangle with 10% margin and responsive aspect before allowing existing-style bounded pan/zoom. No free-flight/WASD. Use a directional key plus hemisphere fill, no bloom/postprocessing requirement, shadows high only.
- [ ] Set new scene design targets lower than legacy ceilings: high <=180 draws/300,000 triangles; balanced <=120/180,000; reduced <=80/90,000. Existing hard ceilings remain 650/900,000; 550/520,000; 400/250,000 respectively, and must never be increased. Asset admission preflights pinned triangle/draw metadata, then actual BufferGeometry/material/texture sizes before attaching. If targets cannot hold all six maximum-level buildings, choose compact prefab/fallback silhouettes before dropping gameplay. Record actual uploaded buffers/textures; no declaration that scene-graph counts include shadow passes.
- [ ] Build the ground as a flat legal support deck at y=0 with decorative voxel terracing descending outside x[-44,44], z[-40,32]. Use grid scale 2m high, 4m balanced/reduced horizontally and 1m vertically; bounded occupancy counts <=8192/4096/2048, maximumFaces <=32768/16384/8192 and maximum emitted quads <=2048/1024/512. Stop adding cells at the occupancy cap before calling `planVoxelSurface`; reject oversize plans before typed-array allocation. Call existing `createVoxelSurfaceMeshData` and create BufferGeometry with normalized Int8 normals/Uint8 colors; clone colors into the 0.4 palette by material class without changing shared mesher palette. On bounded failure create one simple ground/perimeter geometry and truthful `fallback='voxel'`, disposing any partial geometry first.
- [ ] Frame forest in two sparse bands outside the support deck, with 18/12/6 decorative tree instances at high/balanced/reduced; no trunks, fronds, steps or opaque walls inside any legal build footprint. Gate spine/civic commons remain clearly open. Use fog and silhouette overlap for depth, not density. Keep scenery in a separate non-pickable group; building picks use an explicit list and placement intersects only the y=0 plane. Visual walls yield/clip near camera rather than hide placed buildings. No authoritative map coordinates, resource location IDs or navigation are derived from this scene.
- [ ] Implement all six distinct building families from pinned models: Mill sails, Lumber Camp timber stack/saw roof, Stoneworks stone yard, Goldworks furnace/ore treatment, Barracks fortified roof/tower, Cathedral tall spire. Clone materials before tinting; never mutate shared source materials. Use normalized bounds to respect each exact policy footprint. Levels 1–5 show a number badge and up to four small decorative pennants/roof details kept within the same footprint; never enlarge collision or relocate the building. Construction is a bounded scaffold matching the footprint plus warm work light; completion reveal is presentation-only and reduced-motion-safe. On missing asset use a distinct procedural silhouette for that kind, not six identical boxes. Card previews may reuse pinned images with truthful existing-asset attribution; new styling must come from the actual rendered composition/material profile.
- [ ] Implement `reconcile` keyed by kind, completed level, project state and transform; selection/draft updates must not reload assets or rebuild all buildings. Dispose owned cloned material/geometry exactly once; the host owns the bundle and disposes it after scene children. Renderer exposes picked kind/quantized placement only. All six procedural fallbacks and every level 1–5 receive parameterized bounds, triangle, material-sharing and silhouette-name tests.
- [ ] Bootstrap the DEV-only harness with React `createRoot`, the actual keep component, `EMPTY_WIRE04` and one valid Mill construction/completion fixture, controlled selection and a fixed synthetic-controller label. Use the finite same-origin HTML entry `dev/keep04-qa.html`; no alternate renderer, production route, identity forgery or network gameplay calls. Task 8 extends this working preview rather than being a dependency of this task.
- [ ] Run scene tests plus existing `tests/voxelSurfaceMesh.test.ts`, `tests/innerKeepAuthoredPresentation.test.ts`, `tests/innerKeepSceneLayer.test.ts` and typecheck. Controller review includes first actual desktop/high and 390px/balanced renders in this harness; fix visual direction before propagating refinements. Commit `feat: render the Verdant Citadel keep in PTR` only after those representative images are reviewed.

### Task 7: Context, memory, motion, fallback and input lifecycle

**Files:** Complete `Keep04SceneHost.tsx`, `createKeep04Scene.ts`, `Keep04Screen.css`, `PtrGameplay04SurfaceHost.tsx`; create `tests/Keep04SceneHost.test.tsx`, `tests/keep04SceneLifecycle.test.ts`, `tests/Keep04Accessibility.test.tsx`.

**Consumes/produces:** Task 6 host/scene interfaces remain unchanged. Host alone owns WebGLRenderer, requestAnimationFrame, resize/visibility/context listeners and asset AbortController. React screen remains available during any graphics failure.

- [ ] Write failure-first lifecycle tests: unmount while asset promise is pending, then resolve; assert returned bundle disposed, no scene/canvas attachment. Render world→keep→world twice; assert active renderer count <=1 and all listeners/RAF/bundle owners return to baseline. Force `webglcontextlost`, verify default prevented, render stopped and schematic available; restore creates at most one new scene from current visual state, never a second controller or command replay.

```ts
unmount();
pendingAssets.resolve(bundle);
await Promise.resolve();
expect(bundle.dispose).toHaveBeenCalledTimes(1);
expect(rendererFactory).not.toHaveBeenCalled();
```

The test injects/mock-imports loader and renderer constructors; no production query parameter bypass or external test service.
- [ ] Run the three new tests; expect lifecycle failures against the initial host.
- [ ] Implement effect-generation ownership, idempotent cleanup and `finally` disposal of late assets. On mode/loading changes keep all resource/Worker/build controls mounted. If WebGL initialization, assets or budget fail, `onMode('fallback')` activates the schematic with the same selected building/draft. Auth/protocol failures remain controller failures, never graphics fallback. Context restore respects latest quality/reducedMotion and current state, and cannot reuse disposed objects.
- [ ] Render on demand when reduced motion or hidden. Otherwise cap ambient scheduling at 30fps high, 24 balanced, 15 reduced, with scenery motion disabled first when frame pacing is poor; each rendered frame may interpolate cosmetic reveal only. No opacity blink/spin/zoom reveal under reduced motion. Pause RAF while hidden; visible resume first reconciles current props and requests controller refresh through existing hook, not from renderer. Limit device pixel ratio to 1.75 high, 1.5 balanced, 1 reduced; changing profile disposes old GPU resources before replacement.
- [ ] Keep pointer hit-testing within the scene viewport; UI drags/buttons never place buildings underneath panels. Quantize world-space pointer placement through the same Task 2 helpers. Pinch/pan and click thresholds must not confirm construction. Ensure arrows/R work without pointer, Escape returns focus, screen reader has building-level/phase text and forced-colors retains valid/invalid distinction. Copy for graphics fallback must not imply gameplay/server failure.
- [ ] Run lifecycle, route, accessibility and prior render tests plus typecheck. Review actual GPU cleanup evidence in Task 8 before completion; commit `fix: bound 0.4 keep lifecycle and accessible fallback`.

### Task 8: Actual render, representative journey and release handoff evidence

Controller acceptance clarification: `docs/evidence/0.4.0/performance.md` is the
binding pre-established measurement contract. Its three 60-second workload
samples, ten cold runs/profile, three warm-up plus 20 measured world/keep cycles,
ten realm cycles, three context cycles, transfer/heap budgets and reduced 75ms
frame gate supersede the shorter 30-second/ten-cycle/blanket-mobile 50ms targets
below. No post-result relaxation. DEV harness visual evidence is distinct from
final production-build full-world/keep performance and actual-owner gameplay;
record separate rows rather than claiming one proves the others.

**Files:** Complete the Task 6 `src/dev/Keep04QaHarness.tsx`, `src/dev/keep04QaMain.tsx`, `dev/keep04-qa.html`; create `src/dev/keep04QaScenarios.ts`, `scripts/qa-observer/keep04-browser-probe.mjs`, `tests/keep04QaContract.test.ts`, `docs/operations/2026-09-06-keep04-visual-acceptance.md`. Use existing browser-probe command/runtime patterns; do not install browser automation libraries. Existing Vite DEV HTML handling supplies the entry; production build must exclude the harness.

**Interfaces:** Harness renders the actual `Keep04Screen`/`Keep04SceneHost` with a synthetic controller and controlled selection, not another renderer. Scenarios are finite named records `empty`, `mill-placement`, `blocked-placement`, `mill-constructing`, `mill-complete`, `all-six-level-five`, `fallback`, `reduced-motion`, `context-cycle`. Their fixtures come from Task 2 wire builders and `presentState04`. The all-six fixture uses the validated complete layout already covered by `tests/gameplay04Placement.test.ts`: Mill (-15m,15m), Lumber Camp (-15m,26m), Stoneworks (15m,10m), Goldworks (15m,22m), Barracks (20m,-30m), Cathedral (-25.5m,-23.5m), all rotation zero. Assert the fixture passes `evaluatePlacement04` before rendering. The browser probe records actual renderer counters via harness-owned callbacks and DOM data attributes, never private controller state.

- [ ] Add a failing QA contract test proving every named scenario uses the actual keep component and identifies itself as synthetic. Enforce absence of request keys, JWT, owner identity and private atlas response data in telemetry/serialization. Test production exclusion via the repository's existing DEV asset exclusions after build.
- [ ] Run `npm test -- tests/keep04QaContract.test.ts`; expect missing scenario/harness modules.
- [ ] Implement the minimal DEV HTML/module entry using `createRoot`, import `Keep04Screen`, wrap only the providers actually required by the component, and fail closed outside `import.meta.env.DEV`. Browser-probe command is `node scripts/qa-observer/keep04-browser-probe.mjs --base-url=http://127.0.0.1:5173`; accept that single local origin, fixed scenario list and output below `artifacts/keep04-qa/`, no remote URL or credential argument. Use the installed existing probe transport; if unavailable, inspect through the available browser tool and record manual evidence instead of installing tools.
- [ ] Start existing Vite with `npm run dev -- --host 127.0.0.1 --port 5173` only if a task-owned server is not already running. Capture desktop 1440x900/high, 390x844/balanced, 390x844/reduced and 844x390 landscape. Include all named states, open catalog, Worker dispatch panel and permanent confirmation. Inspect images rather than relying on snapshot existence. Compare G001's unchanged entry separately to its own baseline; never assert visual preservation solely from tests.
- [ ] Inspect: distinct stepped stone/teal/timber/violet identity versus G001; Mill sails and Cathedral spire distinguishable at mobile scale; empty keep contains no prebuilt economy/benefit landmark; forest does not obscure footprints; civic/road exclusions match schematic; selected/blocked states distinguished with text/shape; resource totals and one primary action remain visible; level-five details stay inside footprints; all six fallback silhouettes distinguishable; no clipping or horizontal overflow at 390px or landscape.
- [ ] Measure warmed 30-second frame samples plus first-load/upload cost at all qualities. Record actual renderer draw calls including shadow passes, triangles, geometry/texture bytes, cumulative uploads, voxel preparation time, RAF interval p50/p95 and long tasks. Targets: p95 frame interval <=50ms on mobile emulation and <=33.4ms desktop; no single keep voxel preparation >16ms on measured reference desktop, otherwise defer decorative construction or reduce density. These are engineering targets, not a statement of phone performance. Hard scene ceilings must pass; if target fails, reduce optional trees/shadows/details and recapture before acceptance.
- [ ] Perform ten keep/world cycles and three WebGL loss/restore cycles. After warm-up, renderer geometry/texture counts must return to the initial world/keep baseline each cycle with no monotonic growth, pending loaders/listeners/RAFs must be zero after final unmount, and active canvas count never exceeds one. Repeat under reduced motion, missing one model, failed voxel preparation and complete WebGL unavailability. UI remains usable in each graphics case.
- [ ] Run `npm test -- tests/ptrGameplay04Bindings.test.ts tests/ptrGameplay04Capability.test.ts tests/gameplay04ClientState.test.ts tests/gameplay04Presentation.test.ts tests/gameplay04ClientPlacement.test.ts tests/gameplay04Controller.test.ts tests/gameplay04ControllerLifecycle.test.tsx tests/Keep04Screen.test.tsx tests/Keep04PlacementUi.test.tsx tests/Keep04Benefits.test.tsx tests/PtrGameplay04SurfaceHost.test.tsx tests/keep04VisualProfile.test.ts tests/keep04VoxelDressing.test.ts tests/keep04Buildings.test.ts tests/keep04Scene.test.ts tests/Keep04SceneHost.test.tsx tests/keep04SceneLifecycle.test.ts tests/Keep04Accessibility.test.tsx tests/keep04QaContract.test.ts tests/WarpkeepExperiencePtrRealm.test.tsx tests/greaterRealmWorldScene.test.tsx tests/innerKeepSceneLayer.test.ts tests/innerKeepAuthoredPresentation.test.ts tests/gameplay04ConstructionModules.test.ts tests/gameplay04WorkersModules.test.ts tests/gameplay04KeepModules.test.ts`, then `npm run typecheck` and `npm run build`. Do not conceal unrelated preexisting failures or modify G001 assertions to make them pass. Inspect `git diff --name-only` for unauthorized G001/backend/asset changes before review.
- [ ] The controller conducts the real owner PTR journey only once the compatible backend/client release is actually available through the existing authorized boundary: initialize once, choose real nearby locations, dispatch Workers, observe return balances, place Mill, complete construction, dispatch the next food expedition at captured yield twelve, then disconnect/re-enter and verify persistence. Record actual elapsed time to first economy building plus improved return; target <=10 minutes. If actual routes miss the target, return a concrete measured topology/route issue for an explicit design adjustment—do not invent resources, speed server timers, reseed balances or waive the test. Source-only work may be marked source-verified, never live-complete.
- [ ] Record a physical-phone run separately: device/browser, quality, thermal context, frame-pacing observations, readable touch controls, resume/reconnect and fallback. If no phone/owner session is available, leave those acceptance rows `not measured` and report them as release evidence still required, not as implementation ambiguity. Do not make up screenshots or performance values.
- [ ] Populate the evidence report with exact source commit/tree, generated-binding provenance, environment, screenshots, observed metrics, failures/fixes and separate statuses for unit/source, synthetic render, real owner journey and physical phone. Controller review then commits `test: verify Verdant Citadel rendering and journey`. Final release assembler/closure freeze, deployment verification and Desktop handoff remain controller-owned work outside this plan; supply changed-source and evidence paths to that process.

## Self-review and execution handoff

- [ ] Map every committed design requirement to Tasks 0–8: real SDK, isolated authority, replay, immutable 0.4 presentation, actual PTR host, resource selection, construction/benefits, all six silhouettes, voxel-only scenery, fallback/accessibility, cleanup, G001 preservation and honest live/phone evidence.
- [ ] Scan this plan and implementation for placeholder markers, invented generated methods, unowned files and inconsistent signatures. Use `rg -n 'T[O]DO|T[B]D|implement later|fill in details|as any|@ts-ignore' docs/superpowers/plans/2026-09-06-warpkeep-astra-keep.md src/ptr/gameplay04 src/components/keep04`. Fix substantive gaps before claiming a task ready; a literal check command is not an unfinished requirement.
- [ ] Reconfirm first prerequisite with the controller: accepted actual PTR generation result must contain the five source-proven accessors and carry correct sourceCommit/sourceTree. No generated shim is allowed when that result is missing.
- [ ] Report source completion independently from release/live/phone acceptance. Routine design choices above continue under standing owner authorization; unavailable genuine authority or generation evidence is a concrete gate, not permission to bypass it.

Execute inline with Astra through `superpowers:executing-plans`; the controller reviews each task and owns final source carry/release coordination. This plan is saved for controller self-review and is not committed by its author.

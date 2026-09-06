# 0.4 gameplay integration evidence

Recorded 2026-09-06. **R02/R03/R07 remain incomplete.** The following accepted
source components and local fixture tests are not a live owner playtest.

## Reviewed source checkpoints

| Component | Accepted commits | Evidence and limits |
| --- | --- | --- |
| Realm-bound client and generated bindings | `ccd11b2`, `6b1d2e4` | See `bindings-client.md`; no arbitrary RPC or structurally forged capability |
| Strict state, presentation, quotes and placement | `53bede2` | Runtime decoding, authoritative balances and pending returns, shared policy-based quotes and permanent footprint validation |
| Command/controller lifecycle | `df7acb8`, `615597c` | Single-flight commands, original-envelope uncertain retry, authoritative refresh on stale quotes, explicit renewed confirmation |
| Keep controls and schematic | `16f5c02`, `91bf888` | Four Workers, six building choices, resource deficits, permanent placement, repeated rejected-quote review recovery |
| Actual frontend PTR route integration | `acd62c7ce785939cbe8a16ca4ef3b63291a31e08` | Provider publishes capability only after preflight/bridge; lazy matched host; world/keep navigation; actual selected-resource assertions; bounded returned-route inset |

Each checkpoint passed its task-scoped independent spec and quality review.
Task 5 review found no defects. Its cross-task limitations remain mandatory
release acceptance: real owner gameplay, server behavior on deployed modules,
physical-device behavior, graphics performance and actual new-renderer cleanup.

## Task 5 local verification

The implementation report records these commands and results on the Windows
worktree at `acd62c7`:

```text
npm test -- tests/WarpkeepExperiencePtrRealm.test.tsx tests/PtrGameplay04SurfaceHost.test.tsx tests/greaterRealmWorldScene.test.tsx tests/ptrRealmConnection.test.ts tests/PtrRealmProvider.test.tsx tests/ptrGameplay04Capability.test.ts tests/gameplay04Controller.test.ts tests/gameplay04ControllerLifecycle.test.tsx tests/Keep04Screen.test.tsx tests/Keep04PlacementUi.test.tsx tests/Keep04Benefits.test.tsx
# 11 suites, 219 tests passed, exit 0

npm test -- tests/realmMapScreen.test.tsx tests/useRealmSurfaceNavigation.test.tsx tests/realmSurfaceNavigation.test.ts tests/ptrGameplay04Bindings.test.ts tests/gameplay04ClientState.test.ts tests/gameplay04ClientPlacement.test.ts tests/gameplay04Presentation.test.ts
# 7 suites, 151 tests passed, exit 0

& .git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -b
# No output, exit 0
```

Tests use real branded frontend capability/controller paths with synthetic SDK
responses and world runtime/canvas fixtures. They cover copied/wrong-generation
capability rejection, stale selection invalidation, explicit Worker/duration,
pending-command navigation, resource focus and returned route bounds. The route
inset is two-dimensional; it does not prove 3D Worker animation. The keep is still
schematic at this checkpoint, so future WebGL world/keep exclusivity must be
measured again with the actual renderer.

## Remaining acceptance

Demonstrate dispatch, gathering, return, first construction, completion and the
improved subsequent return through the actual authenticated owner's isolated PTR
on actual atlas routes. Record the first economy building **and improved return
within ten minutes**, all six effects/progression, reconnect/background/switching
and failure behavior. Do not infer these outcomes from fixture time advancement,
button availability, test totals or a successful source push.

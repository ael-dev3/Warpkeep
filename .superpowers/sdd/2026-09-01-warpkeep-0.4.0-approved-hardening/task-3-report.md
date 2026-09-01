# Task 3 — Task 6E workflow authority and durable continuation core

## Status

Implemented and verified in the isolated
`C:\Users\heyas\AppData\Local\Temp\Warpkeep-baseline-96e49c` worktree.
No lane/reconciliation call site, workflow, generated bundle, derived pin,
production infrastructure, deployment, push, or merge was changed.

## TDD evidence

Both focused capability-boundary tests were written before either production
module existed. The required red command was:

```powershell
npm test -- tests/sealedRealmsProductionWorkflowAuthority.test.ts tests/sealedRealmsProductionContinuation.test.ts --maxWorkers=1
```

It failed for the intended missing behavior, not a module-load error:

```text
Test Files  2 failed (2)
Tests       28 failed (28)
AssertionError: expected undefined to be type of 'function'
Expected: "function"
Received: "undefined"
```

The final run of the same exact command passed:

```text
Test Files  2 passed (2)
Tests       28 passed (28)
Start at    15:28:25
Duration    7.96s
```

## Implementation

- Added a sealed-realms-specific GitHub workflow authority. A permit is an
  empty, frozen, process-local WeakMap-branded object. Issuance and every
  continuation phase freshly read the fixed protected `main` branch and exact
  current Actions run, and require the exact source SHA, repository,
  `.github/workflows/sealed-realms-production.yml`, `workflow_dispatch`, run
  ID/attempt, `in_progress` status, null conclusion, and main head.
- Added eight literal continuation kinds:
  `g001-census-first-to-second`,
  `g001-census-second-to-suspension`, `g002-publication`, `g002-import`,
  `ptr-publication`, `ptr-import`, `ptr-owner-provision`, and
  `activation-evidence`. Each has one fixed issue operation, claim operation,
  and lane.
- Added canonical issued/claimed/terminal records under the fixed
  `runtime/sealed-realms-v1/continuations/<derived-scope>/` tree. Scope and
  record filenames are derived internally from an opaque authenticated source
  authority, fixed kind, canonical bytes, and cryptographic nonce. The public
  continuation API accepts no continuation/record ID, path, filename, record
  body, token, or confirmation.
- Issued records bind the S/A source authority digest and commits, exact
  operation pair/lane/subject, immutable evidence digest, ordered receipt and
  predecessor chains, issuance workflow authority/run/attempt, 32-byte nonce,
  canonical issue time, and a fixed 24-hour expiry.
- Added only two narrow private-state primitives: fixed-prefix no-clobber
  continuation record write and fixed-scope record inventory. They reuse the
  existing hardened `write`, `read`, and `list` implementation, retaining
  owner/mode checks, `O_EXCL`/`O_NOFOLLOW`, one-link validation, directory and
  inode race revalidation, file/directory fsync, bounded reads, and byte
  zeroization.
- Claim ordering is one-way: validate inventory and binding, freshly attest
  the claim phase, durably create the claimed record, reopen and validate the
  exact claim, freshly attest the effect phase, and only then invoke the
  callback with an empty callback-scoped WeakMap-branded claim. The claim file
  is never removed. Callback or post-callback failure therefore leaves a
  durable ambiguity fence and cannot replay the effect.
- Normal completion freshly re-attests before writing the terminal record.
  An ambiguous claim cannot enter the ordinary claim path; only the explicit
  read-only reconciliation entry may classify `effect-applied` or `no-effect`
  and durably terminalize it. `no-effect` permits a later fresh inspect/issue;
  completed or adopted effect state seals the scope.
- Public results are limited to `{ status: 'issued' }`,
  `{ status: 'completed' }`, or the bounded reconciliation status/outcome.
  Permits, stores, and callback claims all serialize as `{}` and fail if
  copied, serialized, forged, reused, cross-source, or used outside callback
  lifetime.

## Capability and failure coverage

The focused suite proves:

- exact fresh protected-main/workflow/repository/SHA/event/run/attempt
  attestation and later re-attestation drift rejection;
- all eight fixed issue-to-claim transitions across a second private-state
  capability/process boundary;
- deterministic discovery, durable claim-before-callback, callback-scoped
  brand lifetime, canonical terminal state, and absence of public continuation
  material;
- exactly one winner under concurrent claims;
- fail-closed missing, duplicate, orphan, malformed, expired, wrong source,
  wrong operation, wrong lane, wrong subject, wrong evidence, wrong run,
  wrong predecessor, path/digest injection, and serialized `{}` cases;
- no replay after a pre-effect attestation crash or after a callback performs
  an effect and throws; only read-only reconciliation resolves either durable
  ambiguity.

## Verification

Passed on the final tree:

- Required focused suite: 2 files, 28 tests passed.
- Adjacent hardened-state regression suite:
  `npm test -- tests/sealedRealmsProductionPrivateState.test.ts tests/sealedRealmsProductionSourceAuthority.test.ts tests/sealedRealmsProductionReconciliation.test.ts --maxWorkers=1`
  — 3 files, 42 tests passed (8.78s).
- `npm run typecheck` — exit 0.
- `npm run verify:file-sizes` — tracked file-size policy passed.
- `node --check scripts/sealed-realms-production-workflow-authority.mjs` —
  exit 0.
- `node --check scripts/sealed-realms-production-continuation.mjs` — exit 0.

One preceding adjacent run transiently missed the pre-existing Windows
directory-replacement injection at
`sealedRealmsProductionPrivateState.test.ts:336`. Systematic diagnosis found
no Task 3 execution-path change: the diff does not touch `descendant`,
directory creation/fsync, inode revalidation, or `write`. The exact case then
passed 3/3 isolated, the full private-state file passed 3/3 (48/48 aggregate),
and the complete adjacent trio passed 42/42. No unrelated source or test was
changed for this non-reproducible filesystem-race harness event.

The task-specific brief deliberately defers workflow/call-site integration and
derived closure regeneration to later tasks, so this task ran its prescribed
focused/typecheck gates plus the directly adjacent hardened-state regressions;
it did not alter or claim the later Task 6E/Task 7 integration gates.

## 2026-09-01 — Fix Round 1

Fix Round 1 addressed all five review findings without changing a workflow,
lane/reconciliation call site, generated bundle, derived pin, production
infrastructure, deployment, push, or merge.

### Regression-first evidence

The focused regressions were added before the correction. The exact command
was:

```powershell
npm test -- tests/sealedRealmsProductionWorkflowAuthority.test.ts tests/sealedRealmsProductionContinuation.test.ts --maxWorkers=1
```

Against the Round 0 production code it failed for the reviewed behaviors:

```text
Test Files  1 failed | 1 passed (2)
Tests       13 failed | 20 passed (33)
Duration    24.94s
```

The five targeted failures proved that live reconciliation fulfilled instead
of rejecting, both concurrent issuers fulfilled, expiry crossing during the
pre-effect attestation still invoked the callback, a retained callback claim
was not revoked before terminal attestation, and the complete immutable claim
binding could not be asserted. The other eight failures were the existing
fixed-kind table exercising the intentionally expanded claim assertion
contract before its implementation.

After the correction, the same exact command passed:

```text
Test Files  2 passed (2)
Tests       33 passed (33)
Start at    16:01:08
Duration    14.20s
```

### Corrections and security decisions

- Reconciliation now jointly re-attests its own exact in-progress run and the
  exact claimed run/attempt as completed, with the same protected main SHA,
  repository, workflow path, dispatch event, and head identity. A live or
  otherwise non-terminal claim run fails before read-only classification.
- A per-record, owner-private, no-clobber arbitration slot is won by either
  callback effect authority or reconciliation. A reconciler may classify
  `no-effect` only when it owns that slot. If reconciliation wins, the original
  claimant cannot enter its callback; if effect authority wins, reconciliation
  may only adopt `effect-applied`. This closes the terminalization/effect race
  without adding a public continuation identifier or replay route.
- The callback claim's WeakMap membership now retains the exact store identity,
  internally derived scope and record digest, source authority identity and
  digest, mode and commits, fixed issue/claim operations and lane, complete
  subject/evidence/receipt/predecessor binding, run/attempt, and canonical
  issued/claimed records. Assertion re-derives all public inputs and
  re-inventories the same durable record; a different store, authority,
  operation/lane, kind, subject, evidence, chain, run, or attempt fails.
- Issuance now first wins one monotonic O_EXCL slot for the internally derived
  scope generation. The generation digest covers the scope and sorted durable
  `reconciled-no-effect` history, so concurrent issuers contend on one fixed
  name, while a legitimate no-effect terminal creates a distinct next
  generation. A crash after reservation remains durably fail-closed instead of
  risking duplicate issued records.
- The two new slot primitives accept only validated internal digests and fixed
  decisions, derive their paths beneath
  `runtime/sealed-realms-v1/continuations/<scope>/`, generate their own fixed
  record bodies, and delegate to the existing owner/mode, O_EXCL/O_NOFOLLOW,
  link, race-revalidation, fsync, bounded-read, and zeroization machinery. No
  caller supplies a filename, path, or body.
- Expiry is sampled again after the fresh pre-effect GitHub attestation and
  immediately before effect arbitration/callback. The callback WeakMap brand
  and process-local live-record fence are both revoked in a `finally` directly
  around the callback, before terminal re-attestation or record creation.

### Round 1 verification

- Focused workflow-authority/continuation suite: 2 files, 33 tests passed.
- Adjacent private-state/source-authority/reconciliation suite: 3 files,
  42 tests passed (11.15s).
- `npm run typecheck` — exit 0.
- `npm run verify:file-sizes` — tracked file-size policy passed.
- Syntax checks for the workflow-authority, private-state, and continuation
  modules — exit 0.

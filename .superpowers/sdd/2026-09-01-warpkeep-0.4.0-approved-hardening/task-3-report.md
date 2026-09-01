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

# Task 1 implementation report: recovery authorization protocol kernel

## Scope

Implemented only Task 1 of the approved recovery-service plan:

- strict canonical JSON and exact-shape JWS protocol parsing;
- domain-separated SHA-256 helper;
- pinned production P-256 public JWK, key ID, and RFC 7638 thumbprint;
- ES256 signing, pinned verification, low-S normalization/rejection, and signer
  private-key/public-key/thumbprint self-check;
- npm-governed package/test/typecheck scaffold and focused tests.

No deployment, provisioning, secret handling, remote mutation, ledger, gateway,
signer route, evidence loading, or auth-bridge changes were made. The existing
untracked `docs/superpowers/plans/2026-09-01-warpkeep-0.4.0-approved-hardening.md`
was not read, staged, changed, or included in this task.

## Tooling diagnosis

The repository root declares `packageManager: npm@10.9.8`, while the service
plan's illustrative commands use pnpm. `pnpm --dir services/release-recovery
exec vitest run test/protocol.test.ts` failed with an `ENOENT` directory
resolution error in this checkout. The new service package therefore declares
the repository's npm package manager. No install, ignored-build approval, or
lifecycle script was run. Focused commands use the already-installed root
Vitest and TypeScript binaries from the service directory.

## RED evidence

1. `node ..\\..\\node_modules\\vitest\\vitest.mjs run test/protocol.test.ts`
   failed because `../src/protocol.js` did not exist.
2. `node ..\\..\\node_modules\\vitest\\vitest.mjs run test/crypto.test.ts`
   failed because `../src/crypto.js` did not exist.
3. After removing the hash implementation, the protocol test failed with
   `TypeError: sha256Hex is not a function`.
4. Before cycle detection, the cyclic-input test failed with
   `Maximum call stack size exceeded`, rather than the required stable
   `RECOVERY_JSON_INVALID` code.

## GREEN evidence

- `node ..\\..\\node_modules\\vitest\\vitest.mjs run test/protocol.test.ts`
  passed: 11 tests.
- `node ..\\..\\node_modules\\vitest\\vitest.mjs run test/crypto.test.ts`
  passed: 7 tests.
- `node ..\\..\\node_modules\\vitest\\vitest.mjs run test/protocol.test.ts test/crypto.test.ts`
  passed: 18 tests across 2 files.
- `npm run typecheck` passed.
- `npm test` passed: 18 tests across 2 files.
- `git diff --check` passed with no output.

## Self-review

- Exact header and payload-key gates reject duplicate keys, non-canonical JSON,
  extra keys, unsafe integers, accessors, hostile proxy traps, cyclic values,
  malformed base64url, wrong algorithms, and wrong `kid`/`typ` values.
- Compact signatures are constrained to 64-byte P1363 form. Issuance normalizes
  to low-S and verification rejects high-S before Web Crypto verification.
- Production verifier entrypoints are closed over only the pinned checked-in
  public JWK. The only `d` field is in `test/crypto.test.ts`, prominently
  labeled as a fixture-only key; no production private JWK was read, printed,
  staged, or copied.
- Signer self-check imports non-extractable P-256 keys, requires exact pinned
  coordinates and thumbprint, and proves the candidate private component signs
  for that public component.
- TypeScript 7's typed-array `BufferSource` strictness is handled by passing
  copied `ArrayBuffer` inputs to Web Crypto rather than casting away types.

## Files

- `services/release-recovery/package.json`
- `services/release-recovery/pnpm-workspace.yaml`
- `services/release-recovery/tsconfig.json`
- `services/release-recovery/vitest.config.ts`
- `services/release-recovery/src/protocol.ts`
- `services/release-recovery/src/crypto.ts`
- `services/release-recovery/src/recoveryPublicKey.ts`
- `services/release-recovery/test/protocol.test.ts`
- `services/release-recovery/test/crypto.test.ts`

## Commit

Commit message: `add recovery authorization protocol kernel`.

## Review fix round 1

### Scope

Addressed only Task 1 review findings. The recovery protocol kernel now uses
unambiguous length-prefixed hashing, snapshots only verified plain JSON data,
rejects proxy/accessor input, validates exact signed schemas for all four JWS
kinds, and keeps verification closed over the production recovery public key.
The arbitrary-key verifier is a test-only Vitest module injection outside
`src/crypto.ts`.

### RED evidence

- `npm --prefix services/release-recovery test -- --run test/protocol.test.ts test/crypto.test.ts`
  initially failed 11 regression assertions, covering the colon-delimited hash
  collision, array getters, proxy snapshot drift, an exported arbitrary-key
  verifier, exclusive `exp`, relaxed signed schemas, and relaxed JWK handling.
- `npm --prefix services/release-recovery test -- --run test/crypto.test.ts`
  then failed 2 relationship regressions (an authorization observation after
  `iat` and a zero-duration status token) before their checks were added.
- A final targeted RED check for negative claim timing failed as intended:
  `npm --prefix services/release-recovery test -- --run test/crypto.test.ts`
  reported the signer resolving for `claimedAt: -1` instead of rejecting it.

### GREEN evidence

- The same final targeted command passed: 19 crypto tests.
- `npm --prefix services/release-recovery test` passed: 33 tests across 2
  files.
- `npm --prefix services/release-recovery run typecheck` passed with no
  output.
- `git diff --check` passed with no output.

### Self-review

- Hash preimages now prefix the domain and value byte lengths, removing the
  delimiter ambiguity without restricting caller domains.
- Serialization and signing consume a one-time descriptor-based snapshot;
  `structuredClone` is used only as a final transparent-proxy rejection check.
  Arrays require data descriptors for every index, and objects reject symbols,
  non-enumerable properties, and accessors.
- Per-kind payload gates enforce exact key sets, canonical decimal identifiers,
  UUIDs, lowercase SHA-256 digests and Git commits, fixed recovery targets,
  counts/booleans, issuance lifetimes, and cross-field time relationships.
  JWT expiration is exclusive (`nowSeconds >= exp` rejects).
- JWK input is snapshotted before validation; metadata or aliases are rejected,
  base64url coordinates are canonicalized byte-for-byte, and both public
  verification and signer self-check require exact P-256 material.
- Test-only key substitution is isolated to `test/cryptoFixture.ts`; production
  exports only pinned verifier entrypoints. No production private JWK was read,
  printed, staged, or copied.

### Files

- `services/release-recovery/src/protocol.ts`
- `services/release-recovery/src/crypto.ts`
- `services/release-recovery/test/protocol.test.ts`
- `services/release-recovery/test/crypto.test.ts`
- `services/release-recovery/test/cryptoFixture.ts`
- `.superpowers/sdd/2026-09-03-warpkeep-0.4.0-recovery-service/task-1-report.md`

## Review fix round 3

### Scope and evidence

Added the direct named authorization observation-interval regression only; no
production behavior changed. To prove it exercises the guard, a temporary local
removal of `observedThrough < observedFrom` made
`npm --prefix services/release-recovery test -- --run test/crypto.test.ts -t "observation interval whose start follows its end"`
fail because signing resolved instead of rejecting. After restoring the guard,
the same focused command passed (1 passed, 36 skipped).

### Commit

Fix commit message: `harden recovery authorization protocol kernel`.

## Review fix round 2

### Scope

Strengthened only Task 1 signed-object semantics. Authorization now binds the
workflow SHA to the candidate commit, requires distinct Pages and source Verify
run IDs, uses the approved recovery source-closure profile, keeps G002 and PTR
database identities distinct, and limits issuance evidence freshness to 120
seconds. Claim receipts now require their ledger deadline to be exactly 20
minutes after claim time; claim and terminal receipts retain distinct run IDs.

### RED evidence

- `npm --prefix services/release-recovery test -- --run test/crypto.test.ts`
  failed 8 new semantic regressions before the implementation: stale evidence,
  workflow/candidate mismatch, collapsed authorization run IDs, equal G002/PTR
  identities, arbitrary closure profile, non-exact claim deadline, collapsed
  claim run IDs, and collapsed terminal run IDs.

### GREEN evidence

- The same focused command passed: 36 crypto tests.
- `npm --prefix services/release-recovery test` passed: 50 tests across 2
  files.
- `npm --prefix services/release-recovery run typecheck` and `git diff --check`
  both passed with no output.
- The suite includes named schema-version checks for authorization, status,
  claim, and terminal objects, plus each kind's exact maximum lifetime and
  one-second-over rejection.

### Self-review

- Evidence freshness enforces both directions: observations cannot be later
  than issuance and `iat - observedThrough` cannot exceed 120 seconds.
- The exact closure profile is
  `warpkeep-0.4.0-recovery-source-closure-v1`; all three signed objects that
  carry both workflow locators reject equal run IDs.
- No later Task's signer, ledger, service binding, gateway, or deployment
  behavior was added.

### Files

- `services/release-recovery/src/protocol.ts`
- `services/release-recovery/test/crypto.test.ts`
- `.superpowers/sdd/2026-09-03-warpkeep-0.4.0-recovery-service/task-1-report.md`

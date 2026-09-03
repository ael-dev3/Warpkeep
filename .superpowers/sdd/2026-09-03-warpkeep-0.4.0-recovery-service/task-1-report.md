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

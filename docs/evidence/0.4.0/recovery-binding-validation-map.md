# Recovery binding validation map

Inspected 2026-09-07 against local source after `ed69c896ac1b2e78bd7b7cdd79d219e1001c1a04`.
This records the next implementation constraints for recovery release Task 1, not completed validation.

## Reviewed foundation checkpoint

`scripts/recovery-binding-projection.mjs` supplies fixed schema-2 field order, bounded scalar snapshotting, canonical document decoding, and acyclic receipt/core hashes. Hash framing is the receiver's four-byte big-endian domain length, UTF-8 `warpkeep-recovery-v1:<domain>:`, eight-byte big-endian payload length, and compact exact-order JSON. A receiver integration test caught and corrected an initial unframed hash mismatch.

These APIs intentionally do not establish field semantics, source provenance, receipt authenticity, or deployment authority. Null-filled projection fixtures are not valid release bindings.

Review found no critical or important issue within this foundation scope. Fresh verification on 2026-09-07: 189 root projection/decoder tests and one receiver compatibility test passed; root and service TypeScript checks exited 0. Commands: root `node node_modules/vitest/vitest.mjs run tests/recoveryAuthorizationBinding.test.ts` and `node node_modules/typescript/bin/tsc -b`; service-directory `node node_modules/vitest/vitest.mjs run test/recoveryBindingProjection.test.ts` and `node node_modules/typescript/bin/tsc --noEmit`. This is not approval of full Task 1 or of a production release.

## Semantic validator requirements and sources

| Boundary | Source to preserve/adapt | Required treatment |
| --- | --- | --- |
| Canonical schema-specific document | New projection decoder; service `githubEvidence.ts` `validateBinding` | Exact schema-2 keys/order; explicit mode/profile; keep schema-1 parser and byte behavior unchanged. |
| Recovery identity | Service `config.ts` `snapshotRecoveryRealmBindingProjection` and `recoveryPublicKey.ts` | Pinned public key identity, repository/owner IDs, main/workflow/environment, operation/origin/issuer, positive dynamic authorization and configuration epochs. |
| Bridge and realm identity | Same service projection validator | Exact bridge semantic version, version UUID, source/config identity, distinct immutable realm databases, three source-derived program hashes, all fourteen atlas coordinates. Grammar alone is not provenance. |
| Existing player/admission invariants | Root `verify-0.4.0-sealed-launch.mjs` `verifyActivationBinding` | Preserve G001 version/player access, closed admissions/request submission, suspended monitor, sealed G002, owner-only PTR and disabled public admission surfaces. Preserve required exact row counts and atlas states. |
| Historical G001 receipt | Recovery specification and service `validateBinding` | Historical freeze receipt digest and commitment remain null. Do not copy the old validator's fixed historical receipt requirement or synthesize it. Other non-historical evidence remains required. |
| Source coordinates | Recovery specification's independently authenticated build/import coordinates | Do not blindly copy old `moduleSourceCommit === preparationSourceCommit` and `atlasSourceCommit === preparationSourceCommit` checks. Verify each coordinate against its own authenticated source evidence. |
| Hash consistency | New projections and service `validateBinding` | Recompute every non-historical commitment with core forced null, then recompute core with populated commitments. Reject substituted or malformed stored hashes. |

## Fixture gap to resolve before claiming semantic validation

The service `githubEvidence.test.ts` helper `validBinding` initializes every field to null and populates only the GitHub/arming projection and receipt fields. This is useful for that loader's contract but leaves many gameplay invariant fields null. Copying it as the local validator's positive acceptance fixture would omit the broader Task 1 requirements.

Build a complete, explicitly synthetic local positive fixture containing every required gameplay and recovery field; independently substitute each field. Never install that fixture into `config/releases/0.4.0-sealed-launch.json` or use it as live evidence. The checked-in release binding remains schema 1 with deployment approval false.

Remaining implementation: complete semantic validator, sanitized static generator, schema-1 compatibility verification, source/evidence integration, then the source-bound attestation command. Full Task 1 remains incomplete.

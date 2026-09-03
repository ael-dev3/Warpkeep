# Task 2 report — recovery workflow and artifact identity

## Scope and review-fix outcome

Task 2 now implements the full local recovery-service boundary for strict GitHub
JSON/HTTP handling, GitHub App authentication, GitHub Actions OIDC identity,
candidate/source/artifact evidence, metadata-only claim recheck, and incremental
ZIP/TAR inspection. This report supersedes the incomplete follow-up recorded for
commit `11f01de`; the previously listed App, candidate-tree, and DEFLATE gaps are
closed by this review-fix round.

No GitHub, Cloudflare, SpacetimeDB, deployment, workflow-dispatch, provisioning,
push, or other remote operation was performed. All network behavior was exercised
through deterministic local fakes with generated test-only keys.

## RED / GREEN evidence

The fixes were developed as bounded RED-to-GREEN slices.

### Strict JSON, HTTP, ID, and hostile-input slice

- RED command: `npm --prefix services/release-recovery test -- --run
  test/http.test.ts test/githubOidc.test.ts`.
- RED result: 10 intended failures covering duplicate HTTP JSON and signed
  claims; non-aliasing of `9007199254740992` and `9007199254740993`;
  exponent/fraction ID rejection; content-length mismatch; missing final URL;
  the five-millisecond stalled-stream bound; and an accessor error-message leak.
- Separate focused RED cases covered a valid proxy, missing `Content-Type`, and
  two hostile GitHub App inputs.
- GREEN: focused HTTP/OIDC/evidence 26/26; full service 79/79.

### OIDC, Pages run, job, and check identity slice

- RED: focused `githubOidc.test.ts` had 33 failures and 60 passes: JTI (2),
  optional-claim shape (1), bounded X.509 metadata (3), check identity (3),
  Pages run-attempt identity (11), deploy-job cardinality (2), and deploy-job
  correlation (11).
- GREEN: combined focused suite 142/142; full service 199/199.

### Candidate, binding, source Verify, artifact, and recheck slice

- RED command: focused `githubEvidence.test.ts`.
- RED result: its single end-to-end positive fake failed at the old archive-only
  implementation boundary.
- GREEN: evidence 83/83; full service 278/278.

### Incremental archive and attestation slice

- RED command: focused `archive.test.ts`.
- RED result: 58 total, with the eight new positive/streaming cases failing and
  the existing 50 adversarial cases passing against the old parser.
- GREEN: archive 67 plus evidence 84, 151/151; full service 344/344.

### Final security self-review correction

The final whole-diff review added a direct overlong three-block TAR terminator
case, which passed immediately because the existing final-state invariant already
requires exactly two blocks. It then found that an invalid outer response could
fail in the `ArchiveSource` constructor before the body was owned and cancelled.
A new regression produced RED at archive 67 passed / 1 failed, and the minimal
cleanup fix produced archive 68/68. Final verification results are recorded below.

## Pinned schema-2 and commitment decisions

- Binding profile is exactly `warpkeep-0.4.0-sealed-launch-v2`.
- `sourceClosureProfile` is exactly
  `warpkeep-0.4.0-recovery-source-closure-v1`.
- The V2 key prefix/order is exactly `schemaVersion`, `profile`,
  `authorizationMode`, `recoveryAuthorizationProfile`,
  `recoveryAuthorizationRequestId`, `recoveryAuthorizationCoreSha256`,
  `recoveryKeyId`, `recoveryKeyThumbprint`, `recoveryAuthorizationEpoch`,
  `recoveryRepository`, `recoveryRepositoryId`,
  `recoveryRepositoryOwnerId`, `recoveryRef`, `recoveryWorkflowRef`,
  `recoveryEnvironment`, `recoveryReleaseVersion`, `recoveryOperation`,
  `recoveryCanonicalOrigin`, `recoveryIssuer`, `recoveryAuthWorker`,
  `sourceClosureProfile`, `sourceClosureSha256`, `pagesDeploymentApproved`,
  `preparationSourceCommit`, `preparationSourceTree`, followed by every remaining
  V1 key after `preparationSourceCommit` in its original relative order.
- Canonical binding bytes are exactly `JSON.stringify(value, null, 2) + '\n'`.
- The recovery core domain is exactly
  `warpkeep.0.4.0.recovery-authorization-core.v1\n`; it hashes the full ordered
  V2 projection with only `recoveryAuthorizationCoreSha256` forced to `null`.
- Each nonhistorical receipt domain is exactly
  `warpkeep.0.4.0.recovery-sealed-launch.${commitmentKey}.v2\n`. The receipt
  snapshot excludes every commitment slot, forces the core field to `null`, and
  computes only the 16 nonhistorical commitments.
- Historical G001 freeze receipt digest and commitment are both required to be
  `null`; `pagesDeploymentApproved` is required to be `true`.
- Runtime candidate commit/tree do not enter the checked-in recovery core. The
  candidate is independently tied to the signer-armed preparation commit/tree,
  fixed identities, and exact three-file activation delta.

## Pinned deployment-attestation decisions

- The compact UTF-8 JSON key order is exactly `schemaVersion`, `profile`,
  `candidateCommit`, `candidateTree`, `recoveryAuthorizationCoreSha256`,
  `sourceClosureProfile`, `sourceClosureSha256`, `releaseVersion`,
  `canonicalOrigin`, `contentManifestSha256`.
- Schema is `1`; profile is `warpkeep-deployment-attestation-v1`; release is
  `0.4.0`; origin is `https://warpkeep.com`; closure profile is
  `warpkeep-0.4.0-recovery-source-closure-v1`.
- The manifest is compact JSON sorted by explicit unsigned UTF-8 path bytes.
  Each object is ordered `path`, `byteLength`, `sha256`, and every regular file
  except `.well-known/warpkeep-deployment-v1.json` is included.
- Candidate/tree/core/closure values are compared with independently verified
  GitHub evidence and signer-armed state, never accepted from archive authority.

## Security self-review

- The duplicate-free parser preserves configured GitHub integer lexemes as
  canonical positive decimal strings. Production identity comparisons never
  coerce GitHub IDs through `Number`; safe numeric parsing remains only for
  bounded non-ID JSON values, lengths, octal TAR fields, and cryptographic bytes.
- Response status, final URL, media type, declared length, actual stream length,
  byte count, deadline, queue size, and stable no-body/error behavior are checked.
  Hostile accessors and proxies are snapshotted and rejected before trust-bearing
  work. Upstream bodies, tokens, PEMs, and exception messages never enter errors.
- OIDC is exact RS256 with canonical base64url, strict header/claim allowlists,
  fixed issuer/audience/subject/repository/ref/workflow/environment/event/runner,
  exact time ordering and lifetime bounds, canonical JTI, and authenticated App
  correlation across check run, Pages attempt, and in-progress deploy job.
- Discovery accepts only validated additive standard fields and the fixed GitHub
  JWKS URI. JWKS accepts bounded standard `x5c`, `x5t`, and `x5t#S256` metadata,
  but imports only canonical RSA `n`/`e` plus fixed `kty`/`alg`/`use`; duplicate
  key IDs and authority aliases fail closed.
- GitHub App permissions are exactly read-only Actions, Checks, Contents,
  Deployments, Metadata, and Pages for the fixed repository. App inputs and all
  caller projections reject accessors/proxies.
- Candidate evidence reauthenticates fixed repository/owner IDs, protected main,
  linear commit ancestry, actual trees, exact three-file delta, stable Git blobs
  with ETag/body/base64/size/Git-SHA-1 checks, schema-2 binding, protected workflow
  structure, distinct successful source Verify attempt, and exactly one named
  unexpired Pages artifact with stable metadata and recorded `sha256:` digest.
- Metadata-only recheck uses a canonical stored projection/digest, reloads current
  protected main/candidate and stable artifact metadata, and never calls `/zip`,
  tree, blob, or archive parsing paths.
- ZIP processing is incremental and permits one exact ASCII `artifact.tar` entry,
  stored or raw DEFLATE, including unambiguous signed/signatureless bit-3 data
  descriptors. It verifies local/central/EOCD consistency, CRC32, sizes, limits,
  ratio, offsets, and EOF without scanning for descriptor magic.
- TAR processing incrementally verifies checksums, exact ustar fields, safe modes,
  path/type/size/count/aggregate bounds, zero padding, exactly two terminal zero
  blocks, and collision/authority-file rules. It retains only bounded metadata
  and the small attestation body; ordinary file bodies are streamed and discarded.
- Outer archive SHA-256, inner TAR SHA-256, content-manifest SHA-256, and exact
  attestation SHA-256 are recomputed locally and returned with defensive copies.

## Tooling and dependency decision

The service now declares exact production dependency `fflate: 0.8.3`. That exact
version was already present in the repository root lock/runtime; neither the root
`package-lock.json` nor any root package manifest was modified. The raw-inflater
adapter intentionally reads the pinned 0.8.3 cursor needed to delimit a bit-3 raw
DEFLATE stream without descriptor scanning. Standard fflate stored/DEFLATE ZIPs,
bit-3 variants, one-byte chunks, invalid streams, progress/size bounds, and the
cursor boundary are covered by direct tests.

No root or service `pnpm-lock.yaml` was created or retained. Existing tracked
pnpm locks in unrelated subprojects were not touched. Verification uses the
service's npm scripts and the repository's existing installed toolchain.

## Final verification

- `npm --prefix services/release-recovery run typecheck` — exit 0.
- Full service tests — 6 files, 345 tests passed.
- Focused archive/evidence/OIDC/HTTP tests — 4 files, 294 tests passed.
- `git diff --check 11f01de` — no output, exit 0.
- Targeted coercion/full-body/mock/error-leak greps — no production GitHub ID
  `Number` coercion, no archive `arrayBuffer()`/`text()` use, no temporary archive
  inspector mock/seam, and no upstream token/body/error interpolation.

## Files

- `services/release-recovery/package.json`
- `services/release-recovery/src/config.ts`
- `services/release-recovery/src/http.ts`
- `services/release-recovery/src/archive.ts`
- `services/release-recovery/src/githubOidc.ts`
- `services/release-recovery/src/githubEvidence.ts`
- `services/release-recovery/test/http.test.ts`
- `services/release-recovery/test/archive.test.ts`
- `services/release-recovery/test/githubOidc.test.ts`
- `services/release-recovery/test/githubEvidence.test.ts`
- `.superpowers/sdd/2026-09-03-warpkeep-0.4.0-recovery-service/task-2-report.md`

## Remaining concerns

No known Task 2 implementation or local-test defect remains. The pinned fflate
cursor is an accepted exact-version constraint rather than an unbounded fallback.
Live GitHub integration and later Tasks 3–8 were intentionally not exercised in
this local, credential-free task and remain separate work; they are not bypassed
or represented as completed here.

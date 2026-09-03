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

## Review fix round 4

Round 4 started from `2e3d5d4` and closed the reviewed package-content and
archive-response-ownership gaps without changing the schema-2 binding,
deployment attestation, four digests, or metadata-only recheck.

- RED command: bundled Node 22 ran `npm --prefix services/release-recovery test
  -- --run test/githubEvidence.test.ts test/archive.test.ts
  test/githubOidc.test.ts`.
- RED result: 3 files, 370 tests, 21 intended failures and 349 passes. Nineteen
  failures proved that changed scripts, dependencies, unrelated metadata,
  package/lock names and shapes, old/new versions, lock resolution/integrity,
  one-sided lock versions, and noncanonical/duplicate package JSON were not
  content-constrained. Two failures proved that throwing `headers` and
  `headers.get` accessors selected a stable error but left the archive body
  uncancelled.
- GREEN adds exact `body.getReader`, throwing body, cancellation rejection, and
  cancellation-throw coverage. Final focused HTTP/OIDC/evidence/archive tests
  are 407/407; the full service suite is 458/458 across 6 files.
- A final size-consistency self-review added two candidate/preparation tree-size
  regressions. Focused evidence was RED at 132 passed / 2 failed before the
  stable tree-blob loader enforced exact recursive-tree-size equality, then
  GREEN at 134/134.

Round-4 decisions are pinned as follows:

- Candidate and preparation `package.json` and `package-lock.json` blobs are
  each loaded through the existing stable double-fetch path, including ETag,
  body, canonical 60-column GitHub base64, declared size, Git blob SHA-1, and
  bounded decoded bytes. Both JSON documents use the duplicate-free strict
  parser and must equal exact `JSON.stringify(value, null, 2) + '\n'` bytes.
- `package.json` must retain root name `warpkeep`; preparation version is exactly
  `0.3.43`, candidate version is exactly `0.4.0`, and replacing that one
  candidate property with `0.3.43` must reproduce the complete preparation
  bytes. `package-lock.json` additionally requires lockfile version 3,
  `requires: true`, `packages['']`, and both root names. Only its top-level and
  root-package versions may make the same `0.3.43` to `0.4.0` transition; the
  transformed candidate must reproduce every preparation byte.
- Authenticated artifact byte length is now an explicit strict transport
  expectation of the incremental archive inspector. The inspector captures the
  response body before any header access, compares the single content-length
  snapshot with authenticated metadata before acquiring a reader, and performs
  one nonblocking sanitized cancellation on every owned-body failure. The
  evidence layer maps all such failures to `RECOVERY_GITHUB_EVIDENCE_INVALID`.
- Immutable sanitized literals independently pin the current 60-column LF blob
  wrapping, `0x032d`/`0x81a40020` outer ZIP central tuple, sparse check suite,
  hosted runner group `0`, and null unassigned sibling-job fields.

Round 4 modified only `src/{archive,githubEvidence}.ts`, the archive, evidence,
and OIDC test files, and this report. No dependency, package manifest, or lock
file changed.

## Review fix round 3

Round 3 started from `2334a4d` and corrected the last captured-wire differences
for the exact pinned Pages uploader, GitHub blob content, and Actions check/job
responses. No schema-2, attestation, digest, or metadata-only-recheck contract
changed.

- Archive RED: `npm --prefix services/release-recovery test -- --run
  test/archive.test.ts` produced 22 positive-path failures and 60 passes after
  replacing the synthetic ZIP/GNU fixture with captured metadata. Four handled-
  later rejection warnings were timer-test fallout from those early positive
  failures and disappeared at GREEN. Archive GREEN is 82/82.
- Blob RED: focused `githubEvidence.test.ts` produced 7 positive evidence-chain
  failures and 98 passes because the old decoder rejected LF-wrapped content.
  Evidence GREEN is 105/105.
- Check/job RED: focused `githubOidc.test.ts` produced 9 positive identity
  failures and 148 passes because the old integer parser rejected null sibling
  runner fields before filtering. OIDC GREEN is 157/157.
- Final focused GREEN is 377/377 across HTTP, OIDC, evidence, and archive tests;
  final full-service GREEN is 428/428 across 6 files.

Round-3 decisions are pinned as follows:

- The sanctioned uploader ZIP central record is exactly version-made-by
  `0x032d` with external attributes `0x81a40020`. The captured production form
  is local version 20, flags `0x0008`, DEFLATE method 8, no extra fields, and a
  signed descriptor. Stored and known-size DEFLATE test variants retain the
  same exact sanctioned central metadata; neighboring creator/attribute values
  fail closed. Signatureless descriptor support remains unambiguous and bounded.
- GNU TAR device-major and device-minor accept either strict zero octal or an
  entirely NUL field as zero. This exception is confined to those two fields;
  mixed and nonzero fields fail. The end-to-end fixture includes `./`, directory
  records, runner ownership, GNU LongLink, NUL devices, record padding, signed
  bit-3 descriptor, and the exact central tuple.
- Stored TAR bytes are copied in bounded 64 KiB windows, separate from the 1 KiB
  raw-DEFLATE feed. A 4 MiB instrumentation regression proves the stored path no
  longer performs thousands of 1 KiB copies without increasing queue or
  inflater memory limits.
- GitHub blob `content` must be canonical base64 wrapped at exactly 60 columns,
  with a nonempty final line and exactly one final LF. Only those validated LFs
  are stripped before canonical decode/re-encode, decoded-size, declared-size,
  and Git blob SHA-1 checks. CR, whitespace, blank/irregular lines, missing or
  extra final LF, misplaced separators, and noncanonical padding fail closed.
- The check-run suite projection is exactly its positive ID. That ID is tied to
  `run.check_suite_id`, and `run.check_suite_url` is synthesized from the fixed
  repository and suite ID. Check `html_url` and `details_url` both equal the
  exact run/job page derived from signed run and check IDs.
- The strict JSON reader now has separately configured nullable/nonnegative
  integer paths. It returns only `null` or canonical decimal strings, preserving
  precision and rejecting signs, fractions, exponents, and leading zeros. This
  applies only to job runner IDs. Every listed job is checked for fixed run,
  workflow, candidate, API/web URL, node, label, lifecycle, and internally
  consistent all-null or all-assigned runner metadata before selecting exactly
  one `deploy-recovery` job. The selected job still requires positive runner ID,
  runner-group ID exactly `0`, group `GitHub Actions`, and exact hosted labels.

Round 3 modified only `src/{archive,githubEvidence,githubOidc,http}.ts`, their
three directly affected tests, and this report. No dependency or lock file was
changed.

## Review fix round 2

Round 2 started from `c2a7856` and addressed the real GitHub and pinned
`actions/upload-pages-artifact` compatibility findings without changing the
schema-2 binding, attestation, four-digest, or metadata-only-recheck contracts.

- Aggregate RED command: `npm --prefix services/release-recovery test -- --run
  test/http.test.ts test/githubOidc.test.ts test/githubEvidence.test.ts
  test/archive.test.ts`.
- Aggregate RED result: 4 files, 332 tests, 31 intended failures and 301 passes.
  The failures covered hostile HTTP response access/cancellation and reserved
  redirects; additive App envelopes, PKCS#1, JOSE `x5t`, `nbf` skew, and real
  run-attempt shapes; recursive-tree sizing/ancestor semantics and protected
  workflow structure; and GNU TAR, LongLink, descriptor collision, inflater
  peak, timeout, and cleanup behavior. Three asynchronous warnings came from
  the first fake-timer harness and were corrected before judging GREEN.
- Two final focused RED regressions proved that the fetch and inspector could
  receive separate five-minute budgets (HTTP 32 passed / 1 failed) and that a
  redundant GNU LongLink could encode a short path (archive 74 skipped / 1
  failed). The minimal fixes share the fetch-start deadline and require a
  LongLink target to exceed the 100-byte header name field.
- Focused GREEN: the same four files pass 349/349.
- Full GREEN: all 6 service files pass 400/400.

Round-2 design decisions are pinned as follows:

- GitHub App PEM accepts canonical bounded PKCS#8 and GitHub's downloaded
  PKCS#1 `RSA PRIVATE KEY` form. PKCS#1 is deterministically wrapped in a
  PKCS#8 `PrivateKeyInfo` before WebCrypto import; malformed DER, extra PEM
  blocks, noncanonical base64, and oversized keys fail closed.
- The installation-token request body and six read-only permissions remain
  exact. The parser now accepts the documented bounded additive response
  envelope and rich repository objects while projecting and requiring the
  fixed repository ID/name, selected-repository authority, exact permission
  set, token, and expiry.
- OIDC accepts canonical optional header `x5t` only when it equals the selected
  JWKS key's validated `x5t`; it remains metadata rather than key authority.
  Minimal RSA JWKS keys and `x5c`/`x5t` keys without `x5t#S256` are supported.
  `nbf` is bounded to `iat - 600 <= nbf <= iat`; all other issue, expiry,
  freshness, and lifetime checks remain strict. `issuer_scope` is the sole new
  bounded, ignored optional claim; arbitrary extra claims still fail closed.
- Pages and source Verify accept only the two exact GitHub path shapes (bare
  `.github/workflows/<file>.yml` or the same path with `@main`). Workflow URLs
  must use the positive numeric workflow ID, and Pages `jobs_url` must be the
  exact run-attempt URL.
- Recursive-tree responses use a dedicated 7 MiB transport cap and a 20,000
  entry semantic cap. The activation comparison requires identical path,
  mode, and type sets and exactly three changed blobs. Tree SHA changes are
  allowed only for strict ancestors of those blobs; unrelated subtree changes
  fail closed. The positive regression uses 2,419 entries and real ancestor
  tree records.
- Protected workflow bytes are parsed with exact `yaml@2.9.0`, duplicate-key
  and alias expansion rejection, then structurally bind the `deploy-recovery`
  job, Actions OIDC token-request variables and exact audience, pinned
  `actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9`,
  and exact recovery artifact-name expression. Broader workflow permissions
  and ordering remain Task 4.
- The archive reader uses a monotonic five-minute total deadline plus a
  resettable 30-second idle deadline. Test-only timing values may only shorten
  those production maxima. Archive fetch and inspection share one absolute
  five-minute deadline measured from the start of the redirected archive fetch.
  Cleanup cancels the exact captured body/reader once, never awaits untrusted
  cancellation, and always emits the stable archive/HTTP code.
- Raw DEFLATE is fed in at most 1 KiB slices; each callback is capped at 2 MiB,
  cumulative output/ratio is checked before downstream processing, and fflate
  pending state is checked before and after every push. The 16 MiB zero-input
  regression exercises the highly-compressible path without full-body reads.
- TAR accepts the exact GNU class emitted by the pinned action: `./` root,
  normalized directory records, bounded ownership names/IDs, GNU or POSIX
  magic/version, safe file/directory modes, narrowly validated one-shot GNU
  LongLink for a following file or directory, at least two end blocks, and
  zero 10 KiB record padding. The realistic fixture contains 340 files and 66
  LongLink records. A LongLink is canonical only when its resolved raw path is
  longer than the 100-byte TAR name field. Directories/LongLink records stay out of the manifest;
  unsafe hidden directories, PAX/general GNU extensions, links/devices,
  traversal, collisions, dangling names, and nonzero trailing data are rejected.
- Signatureless bit-3 DEFLATE descriptors are disambiguated from a CRC equal to
  `0x08074b50` by evaluating bounded signed/unsigned candidates against the
  already computed CRC/sizes and following central signature. Stored bit-3
  remains rejected because it is not self-delimiting.

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
  documented bounded pre-issue `nbf` skew and strict lifetime bounds, canonical JTI, and authenticated App
  correlation across sparse check suite, Pages attempt, in-progress hosted
  deploy job, and safely nullable unassigned sibling jobs.
- Discovery accepts only validated additive standard fields and the fixed GitHub
  JWKS URI. JWKS accepts bounded standard `x5c`, `x5t`, and `x5t#S256` metadata,
  but imports only canonical RSA `n`/`e` plus fixed `kty`/`alg`/`use`; duplicate
  key IDs and authority aliases fail closed.
- GitHub App permissions are exactly read-only Actions, Checks, Contents,
  Deployments, Metadata, and Pages for the fixed repository. Canonical bounded
  PKCS#1 and PKCS#8 keys are supported; additive response metadata cannot alter
  the fixed authority projection. App inputs and all caller projections reject
  accessors/proxies.
- Candidate evidence reauthenticates fixed repository/owner IDs, protected main,
  linear commit ancestry, actual recursive trees, exact three-blob delta with
  only necessary ancestor-tree SHA changes, stable Git blobs
  with ETag/body/canonical 60-column LF-wrapped base64/size/Git-SHA-1 checks,
  exact canonical package/lock version-only transforms, schema-2 binding, protected workflow
  structure, distinct successful source Verify attempt, and exactly one named
  unexpired Pages artifact with stable metadata and recorded `sha256:` digest.
- Metadata-only recheck uses a canonical stored projection/digest, reloads current
  protected main/candidate and stable artifact metadata, and never calls `/zip`,
  tree, blob, or archive parsing paths.
- ZIP processing is incremental and permits one exact ASCII `artifact.tar` entry,
  stored or raw DEFLATE, including unambiguous signed/signatureless bit-3 data
  descriptors. It verifies local/central/EOCD consistency, CRC32, sizes, limits,
  ratio, offsets, exact `0x032d`/`0x81a40020` producer metadata, and EOF without
  scanning for descriptor magic.
- TAR processing incrementally verifies checksums, bounded POSIX/GNU identity
  fields, safe modes, normalized directories/LongLink, path/type/size/count and
  path-metadata bounds, zero padding, at least two terminal zero blocks plus only
  zero GNU record padding, and collision/authority-file rules. It retains only bounded metadata
  and the small attestation body; ordinary file bodies are streamed and discarded.
- Outer archive SHA-256, inner TAR SHA-256, content-manifest SHA-256, and exact
  attestation SHA-256 are recomputed locally and returned with defensive copies.

## Tooling and dependency decision

The service declares exact production dependencies `fflate: 0.8.3` and
`yaml: 2.9.0`. Both exact versions were already present in the repository root
lock/runtime; neither the root `package-lock.json` nor any root package manifest
was modified. The raw-inflater
adapter intentionally reads the pinned 0.8.3 cursor needed to delimit a bit-3 raw
DEFLATE stream without descriptor scanning. Standard fflate stored/DEFLATE ZIPs,
bit-3 variants, one-byte chunks, invalid streams, progress/size bounds, and the
cursor boundary are covered by direct tests.

No root or service `pnpm-lock.yaml` was created or retained. Existing tracked
pnpm locks in unrelated subprojects were not touched. Verification uses the
service's npm scripts and the repository's existing installed toolchain.

## Final verification

- Node `v22.23.2`: `npm --prefix services/release-recovery run typecheck` — exit 0.
- Full service tests — 6 files, 458 tests passed.
- Focused archive/evidence/OIDC/HTTP tests — 4 files, 407 tests passed.
- `git diff --check 2e3d5d4` — no output, exit 0.
- Targeted coercion/full-body/mock/error-leak greps — no production GitHub ID
  `Number` coercion, no archive-response `arrayBuffer()`/`text()` use, no temporary archive
  inspector mock/seam, and no upstream token/body/error interpolation.

## Files

- `services/release-recovery/package.json`
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

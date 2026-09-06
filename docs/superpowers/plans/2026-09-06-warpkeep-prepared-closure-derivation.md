# Prepared closure derivation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Give the final release assembler a working deterministic manifest and workflow-pin derivation function that shares the existing verifier's projection rules.

**Architecture:** Keep projection logic inside the self-contained builtins-only closure verifier; add a pure byte-in/byte-out derivation API there. Reuse the same projection routines in generation and verification, while only verification may mint authenticated authority. The later fixed Linux assembler supplies authenticated captured bytes and installs the complete release family through its durable transaction.

**Tech Stack:** Node22 ESM, existing canonical JSON/SHA256/projection routines, Vitest and TypeScript declarations.

**Spec:** docs/superpowers/specs/2026-09-05-warpkeep-local-release-preparation-design.md (Generation, bundles and final transaction); docs/superpowers/plans/2026-09-03-warpkeep-0.4.0-recovery-release-and-local-package.md Task6; docs/superpowers/plans/2026-08-30-warpkeep-0.4.0-preparation.md Task7.

## Global Constraints

- Keep all `GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS` bytes unchanged.
- G001 bindings are an exact zero-diff check, never a write target.
- G002 remains sealed and PTR remains owner-only.
- Local build code neither needs nor receives production credentials, FIDs, raw receipts or database contents.
- Do not install into or modify the Windows node_modules junction.
- No generated repository artifact installation, provider mutation, or claim of live activation in this task. Final transaction and deployment remain required.
- Preserve existing digest profiles, reviewed release phases, canonical source patterns, exact workflow pin cardinalities, error-class identity and verification authority checks. No test-seam enablement in production.
- Do not add a static local import to the self-contained bootstrap verifier; no new bootstrap trust dependency.

### Task 1: Derive complete current-inventory closure bytes through shared projections

**Files:**
- Modify: `scripts/auth-bridge-notification-prepared-deploy-closure.mjs` and `.d.mts`.
- Create: `tests/authBridgeNotificationPreparedClosureDerivation.test.ts`.
- Test existing: `tests/authBridgeNotificationPreparedReleaseProjection.test.ts`, `tests/authBridgeNotificationB0Closure.test.ts`, and direct attested-loader/manifest-parser tests found by imports of the modified verifier.

**Interfaces:**
- Add `deriveAuthBridgeNotificationPreparedDeployClosure({memberBodies})`, where `memberBodies` is a `ReadonlyMap<string, Uint8Array>` containing exactly the current exported `AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS`, with no duplicate, missing or additional path. No repository path, callback, filesystem adapter, profile, member-list or digest override is accepted.
- Return frozen `{profile, memberCount, manifestBytes, manifestSha256, workflowBodies}`. Profile is the unchanged `warpkeep-auth-bridge-notification-prepared-deploy-closure-v1`; `manifestBytes` is copied canonical schemaVersion2 pretty JSON with trailing LF; `workflowBodies` is a frozen sorted array of frozen `{path,bytes}` records for the three existing `BOOTSTRAP_PINNED_WORKFLOWS`. Bytes are fresh copies, not caller aliases. No returned object is registered in authenticated authority WeakSets/Maps.
- Existing `verifyAuthBridgeNotificationPreparedDeployClosure` retains its public API, filesystem checks, bootstrap-pin value verification and authority minting behavior. Share internal canonical projection/hash assembly rather than copying a second loop or source-pattern set.
- Retain source member bounds4MiB each,2048members, and enforce aggregate128MiB before copying bodies; manifest bound256KiB. Reject non-byte values, malformed paths, incorrect namespace, invalid UTF8 where text projection is required, invalid phases and malformed/duplicate/missing workflow pin declarations using existing closure error class and appropriate fixed codes. Wipe owned intermediate buffers on failure; never wipe/mutate caller buffers.

**Derivation algorithm:**
1. Validate exact input keys and full fixed inventory, bounds and byte types before materializing owned copies. Raw binary members remain byte-preserving.
2. Reuse `canonicalReviewedReleaseMemberBodies` for the full fixed16role source map; preserve coupled phase checks. Never canonicalize an invalid phase into a valid one.
3. For generation only, parse each existing workflow's exact fixed pin declarations as syntactically valid64hex values. Reuse `canonicalPinnedWorkflowBody` against those declared values to obtain its zero-pin projection. Generation may replace stale well-formed pins; it does not authenticate them. Verification continues comparing declarations with independently computed expected hashes.
4. Derive every manifest member using `expectedMemberDigestProfile`, the existing raw/release/bootstrap/combined projections and SHA256. Preserve exact sorting and canonical JSON field order `{schemaVersion,profile,members}` and `{path,digestProfile,sha256}`. Do not hash the manifest into itself.
5. Compute manifestSha256 from canonical manifestBytes. Compute the existing five bootstrap pins from the corresponding supplied raw member bodies, except the manifest pin uses the freshly generated manifest hash. Rewrite only exact designated pin literals in the three workflow bodies, preserving every other byte and reviewed phase value. Reject absent/duplicate/unexpected pin slots.
6. Internally project the rewritten workflows with the computed final pins and prove their projected hashes still equal their manifest records. Return copies only after all members and rewrites agree. Re-derivation using returned workflows must yield identical manifest and workflow bytes.

- [ ] **Step 1: Add meaningful failing behavior tests.** Reuse existing release-transition fixture construction patterns from `tests/authBridgeNotificationPreparedReleaseProjection.test.ts` and its imported fixture helpers; do not copy production canonicalization into expected-value calculations. Use independently generated existing fixture manifests as baseline evidence. Test missing export RED separately from malformed-input cases.

```ts
const first = deriveAuthBridgeNotificationPreparedDeployClosure({ memberBodies });
expect(first.manifestBytes).toEqual(expectedFixtureManifestBytes);
const installed = new Map(memberBodies);
for (const member of first.workflowBodies) installed.set(member.path, member.bytes);
const second = deriveAuthBridgeNotificationPreparedDeployClosure({ memberBodies: installed });
expect(second.manifestBytes).toEqual(first.manifestBytes);
expect(second.workflowBodies).toEqual(first.workflowBodies);
expect(() => assertAuthBridgeNotificationPreparedDeployClosureAuthority(first, {repositoryRoot})).toThrow();
```

Cover all four digest profiles; accepted phase fixture equivalence; stale well-formed pins mechanically repaired while verifier rejects them before repair; unrelated workflow-byte mutation changes its digest; duplicate/missing/extra pin rejection; inconsistent release phase rejection; missing/extra members; byte/aggregate/manifest bounds; no input mutation or returned aliasing; malformed UTF8; generation does not grant authority. Exercise existing verifier on a disposable complete fixture after installing only derived fixture outputs, never on the production working tree.

- [ ] **Step 2: Run RED.**

```powershell
& '.git/ci-node-22.22.3/node.exe' 'node_modules/vitest/vitest.mjs' run tests/authBridgeNotificationPreparedClosureDerivation.test.ts
```

Record the intended missing derivation API failure. Broad rejection assertions must not pass merely because an import/function is absent.

- [ ] **Step 3: Implement the pure production derivation API and shared internals.** Preserve the current builtins-only module import surface. Separate declared-pin parsing for generation from expected-pin authentication for verification; no permissive flag in the authority-minting path. Existing test-only seam conditions remain unchanged.

```js
const manifestBytes = Buffer.from(`${JSON.stringify({
  schemaVersion: 2,
  profile: AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_PROFILE,
  members,
}, null, 2)}\n`, 'utf8');
const manifestSha256 = sha256Body(manifestBytes);
```

The algorithm and exact interface above define the body; reuse the existing implementations at expectedMemberDigestProfile, canonicalReviewedReleaseMemberBodies and canonicalPinnedWorkflowBody rather than retyping their regex/state rules.

- [ ] **Step 4: Run focused and covering verification.** Run the new suite and existing projection/B0-closure suites, plus identified direct loader/parser consumers. Record any preexisting stale-manifest test failure separately with baseline comparison; do not update generated arrays, counts, hashes or manifests in this source task.

```powershell
& '.git/ci-node-22.22.3/node.exe' 'node_modules/typescript/bin/tsc' --project tsconfig.app.json --noEmit --tsBuildInfoFile .git/tsbuildinfo/prepared-closure-derivation.app.tsbuildinfo
```

Check protected34roots raw bytes against HEAD and zero protected committed delta. Verify production import with test environment absent exposes derivation but no test seams and has no filesystem write/network activity. This pure task needs real fixture verification, not another full native eight-bundle rebuild.

- [ ] **Step 5: Commit exact source/tests and report.** Commit message `feat: derive prepared closure from shared projections`. Report BASE/HEAD, commands/results, before/after fixture identities, source-preservation evidence and any unresolved issue. Leave all unrelated changes, including the owner's forest design amendment, untouched.

## Acceptance and successor

Independent task review must approve both spec and quality. This task is only the shared derivation component: it neither expands the current fixed member inventory nor claims the final closure is up to date. The full assembler still must derive updated inventory/declarations/consumer pins and bindings, enforce matching captured identities, implement exclusive lock/staged siblings/durable journal/recovery/fsync, run identical write/check convergence, and eventually install the whole allowlisted family. Final freeze remains after all other release source work.

# PTR update recovery implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement the connected tasks below. Current user instructions and AGENTS.md take precedence.

**Goal:** Deliver populated PTR updates through the actual production and recovery callers without erasing later gameplay or misrepresenting historical provisioning.

**Architecture:** Preserve the existing schema-2 initialization and schema-3 update paths. Add a distinct schema-4 preservation path backed by the real completed update, signed pre/post state and retained continuation. Derive artifacts and credentials inside the supported Linux workflow and reuse its existing owners. Never substitute preservation evidence for an import or provisioning operation.

**Tech stack:** Node ESM, TypeScript, Vitest, Cloudflare recovery service, Linux and SpacetimeDB.

**Spec:** Current user release objective, AGENTS.md and docs/evidence/0.4.0/recovery.md. Earlier private receipt designs are historical; the corrections below supersede their inference that legacy zero counters forbid gameplay progress.

## Constraints

- Preserve G001 progress and admission freeze; keep G002 sealed and PTR owner-isolated.
- Keep all applicable legacy zero counters. They are not gameplay04 resource or worker counts.
- Preserve authentic historical atlas-import and owner-provision records with their original source coordinates when available. Do not invent missing history. Authenticated current state determines whether real initialization or existing-state continuity is needed.
- Later legitimate gameplay must not invalidate an authentic historical update completion.
- Synthetic fixtures, public digests and local compatibility tests do not authorize production writes.
- Never substitute Hermes game-admin tokens for provider-owner update credentials.
- Generate release pins from a committed source; do not hand-edit them.

## 1. Versioned public binding and consumers

Files: scripts/recovery-binding-projection.mjs and declaration; scripts/recovery-activation-candidate.mjs and declaration; services/release-recovery/src/githubEvidence.ts; recovery-attestation-source.mjs; recovery-workflow-session.mjs; recovery-workflow-deployment-boundary.mjs; verify-recovery-authorization-jws.mjs; verify-sealed-realms-public-activation-artifact.mjs; verify-0.4.0-sealed-launch.mjs; sealed-realms-production-source-authority.mjs. Corresponding tests own parity and actual caller coverage.

- [x] Test schema3/profile `warpkeep-0.4.0-sealed-launch-ptr-update-v3`, replacing only the four PTR fresh/publish digest/commitment fields with `ptrExistingUpdateReceiptDigest` and `ptrExistingUpdateReceiptCommitment` in the same field position.
- [x] Implement explicit version dispatch, separate v3 receipt/core hash domains and exact existing v2 behavior.
- [x] Prove root/service parity, actual signed-authorization consumption, public-artifact validation, source ancestry and routing. Reject mixed versions, receipt substitution and unsafe admission values.
- [x] Review source and affected tests before publication; state that private producer integration remains unfinished if that is still true.

## 2. Private update receipt through activation

Files: sealed-realms-production-activation-records.mjs, sealed-realms-production-recovery-candidate.mjs, sealed-realms-production-activation-workflow-entry.mjs and generate-0.4.0-recovery-launch-activation.mjs, with producer-to-consumer tests.

- [x] Test a distinct schema-3 update corpus with authentic import/owner provenance and sealed-live observation. The schema-4 path below handles preserved state when that initialization history is absent.
- [x] Commit current target/artifact/full definition, predecessor and submission/completion lineage, host preservation contract and exact acknowledgement outcome in the private receipt. Cross-check all projected coordinates and historical/current receipt digests.
- [x] Select immutable completion records through authenticated continuation lineage; provide no caller-selected raw receipt writer.
- [ ] Exercise private reopen through candidate generation, public verifier and service parser. Cover later gameplay writes, broken lineage, changed corpus, wrong source/store and synthetic/fresh substitution.

## 3. Actual Linux artifact and update producer

Files: sealed-realms-production-existing-update.mjs, sealed-realms-production-ptr-workflow-entry.mjs, sealed-realms-production-ptr-lane-entry.mjs, Linux source-built artifact owner and production workflow entry.

- [x] Select withPtrLinuxLockedSourceBuild in the actual descriptor-bound artifact helper; native build, provenance and cleanup verified. Factory integration remains below.
- [x] Derive complete supported RawV10 from exact compiled bytes and compute SHA-256/program Keccak internally. Native verification of the integrated path remains pending.
- [x] Derive provider-owner authority from the private validated CLI configuration and cross-check the fixed existing PTR identity. Keep game-admin reads separate.
- [x] Persist pre-send intent and authentic successful response digest. Lost-response reconciliation may establish observed installation, never invent a received acknowledgement.
- [x] Connect the existing inspect/apply/reconcile hooks, genuine supported-runner permit and cleanup. Capture separate private signed state after actual update completion; activation integration remains below.
- [ ] Verify actual-owner play and integrated release preservation, regenerate source-bound release outputs and ship through the actual operating workflow.

## Evidence and status

Public binding and consumer support was published in `63d4e60`; the actual Linux artifact builder followed in `880bd09`. Root/service parity, signed/public consumers, native committed-source routing and independent review passed. The full release verifier still requires regeneration of the changed source-bound family; consumer checks do not establish complete release verification.

The separate official 2.10.0 disposable recovery rehearsal passed from `826ed94`, including earned/pending progress, repair, timers, expiry and exact retry. It is not production acceptance or a test of the later v3 definition adapter. Windows results, logs and independent readback evidence survive; the temporary native database and row snapshots subsequently became unavailable during WSL interruption.

Historical production notes record initial PTR creation without atlas import or owner provisioning. The public schema does not establish row contents or current ownership. No authentic import/owner corpus has yet been found in the inspected retained evidence. First authenticate current state: if initialization is absent, perform real import/provisioning; if populated, establish actual continuity without inventing historical receipt digests.

### Provider authority implementation findings

The existing `stageCliConfig` in `ptr-production-publisher.mjs` creates a private,
reattested configuration snapshot; this protects configuration integrity but does
not prove provider authorization. Official CLI 2.6.1 `login show --token` reads the
configured provider token without network access. It can return success when no
login exists, and its decoded identity is unsigned. Parse the expected successful
output strictly, keep it private and report fixed errors: CLI decoding failures
can contain the token. Do not fall back to a command that creates a new login.

The provider's fixed-target `pre_publish` checks `UpdateDatabase` authorization;
the subsequent PUT checks it separately. Metadata describes the initial program,
not the current program. An opaque provider capability should own the staged-token
transport and target checks; a separate module-admin capability owns protected
Warpkeep observations. Derive both inside the existing workflow's authenticated
source, permit, private state and continuation. Literal owner identity equality is
a principal policy to state explicitly, not a substitute for server authorization
or an accurate description of every delegated permission supported upstream.

## Current production adapter implementation

The factory now composes internally built artifact capabilities, the staged-provider
credential transport, full RawV10 comparison and private update continuation records.
Tests cover genuine-response recording separately from lost-response installation
reconciliation, predecessor continuity, cancellation and changed host observations.
The combined Windows checks passed 170 tests with 34 native skips, strict types
and independent review. These are implementation checks: the actual workflow must
still construct the capabilities, activation must consume their authenticated
private records, and native/live acceptance remains open. See the canonical
[production adapter evidence](../../evidence/0.4.0/recovery.md#production-ptr-update-adapter-implementation).

## 4. Preserved-state activation and recovery (current work)

The retained schema-4 envelope uses profile
`warpkeep-ptr-existing-state-adoption-v1`. Its adoption digest is the SHA-256 of
its exact persisted JSON bytes including the final LF. The writer's `receiptDigest`
continues to mean the schema-3 completion receipt digest; `recordDigest` identifies
this separate schema-4 adoption. Do not interchange them.

- [x] Capture genuine signed pre-state before submission and signed post-state after
  the unchanged completed/reconciled update and terminal. Keep claim, terminal and
  present observation jobs distinct. Native acceptance at c5fbb2dd covered the
  connected producer and existing consumers (230 tests) and service (1,194 tests).
- [x] Authenticate retained adoption after producer disposal using the same private
  update inventory and continuation owner. Verify service signatures and complete
  context; reopen exact evidence after asynchronous verification and on each
  synchronous consumer read. Historical evidence does not need present freshness.
- [x] Add separate public profile `warpkeep-0.4.0-sealed-launch-ptr-adoption-v4`,
  with update/adoption commitments, actual module/tool/atlas facts, singleton-owner
  and closed-admission guards, and expected sealed/owner HMACs. Preserve canonical
  schema-2/schema-3 bytes. Do not project unavailable raw import/provision fields.
- [x] Extend the recovery receiver's exact typed arming projection and mandatory
  live issue/claim observations. Compare both HMACs under the signed bridge version,
  source, configuration and authorization-epoch scope. Keep ledger/JWS versions;
  legacy SQL storage must reject a projection it cannot faithfully retain.
- [x] Connect the actual activation workflow, bridge-state owner, candidate and
  descriptor generator. The distinct bridge receipt retains real G002 and deployment
  evidence and links genuine PTR adoption instead of fictional import/provision
  receipts. A synchronous raw descriptor parser must require authenticated opaque
  evidence for V4; decoded signatures alone never establish authenticity.
- [ ] Exercise actual retained producer → activation → public artifact → receiver,
  including restart, malformed signatures, changed bytes/history, wrong authority,
  scope/HMAC drift and later legitimate gameplay. Review independently.
- [ ] Regenerate the coherent source-bound release family after the connected batch,
  verify exact-head CI, integrate through normal protected review and continue live
  delivery/owner/mobile acceptance. Existing prepared output is historical only.

No additional preserved-live receipt is needed: signed post-state is the immutable
baseline, while recovery always observes current realm state before initial issue
and every claim. Issuance retries reuse frozen authorization; the claim observes
again and the ledger rejects invariant drift. Gameplay rows and renewable session
expiry are outside the preservation HMACs; program identity is checked separately.
This is deliberate preservation of normal gameplay, not a full gameplay-row census.

## Next delivery boundary: existing G002

The reviewed PTR family is published at `70a65b34`; native generated/private
consumers and preflight passed. Exact-head hosted checks and protected integration
remain separate. G002 already exists with an older public interface, while genuine
local publication/import/bridge history was absent from the documented paths.
Its production update workflow remains unimplemented. A new proof must establish
an observed existing-state transition, without asserting original publication or
import execution. Authentic current predecessor observations can support forward
recovery without the unavailable original executable.

Reuse the existing authenticated realm RPC: it already returns G002 program,
atlas and sealed-state facts, which the PTR observation projection currently
validates and discards. Extend the shared signed update-observation machinery
under a fixed G002 policy, preserving canonical PTR bytes and its existing wrappers.
Sign the exact G002 projection and HMACs with the existing pre/post claim,
completion, terminal, source and bridge correlation. Use fixed G002 OIDC job and
audience rules; a signed observation does not grant mutation authority.

Reuse the production update engine and continuation's existing `g002-update`
operation with a separate target namespace and evidence discriminator. Derive an
owned G002 artifact and RawV10 definition from the existing native source builder;
require compatible schema, authentic predecessor, candidate-bound plan and
unchanged sealed-state invariants. Preserve uncertain-outcome reconciliation
without a second submission. Do not weaken the zero-population/closed-admission
checks to accommodate unexpected live state.

The activation family needs an explicit G002 adoption branch because current V4
claims original publish/import evidence. Replace only those unavailable claims
with authenticated G002 adoption and its invariant; retain genuine prepared bridge
deployment evidence and unchanged G001/PTR semantics. Carry that branch through
candidate/generator, public binding, approval and recovery issue/claim consumers.
No new realm RPC, census, preparation-observation version or continuation schema is
needed. This is the recommended next implementation, not completed functionality.

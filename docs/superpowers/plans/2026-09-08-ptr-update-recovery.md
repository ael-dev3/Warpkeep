# PTR update recovery implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement the connected tasks below. Current user instructions and AGENTS.md take precedence.

**Goal:** Deliver populated PTR updates through the actual production and recovery callers without erasing later gameplay or misrepresenting historical provisioning.

**Architecture:** Add a distinct schema-3 public recovery binding backed by an authenticated private update receipt. Preserve fresh schema-2 behavior. Derive artifacts and credentials inside the supported Linux workflow and reuse the existing continuation owner.

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

- [ ] Test schema3/profile `warpkeep-0.4.0-sealed-launch-ptr-update-v3`, replacing only the four PTR fresh/publish digest/commitment fields with `ptrExistingUpdateReceiptDigest` and `ptrExistingUpdateReceiptCommitment` in the same field position.
- [ ] Implement explicit version dispatch, separate v3 receipt/core hash domains and exact existing v2 behavior.
- [ ] Prove root/service parity, actual signed-authorization consumption, public-artifact validation, source ancestry and routing. Reject mixed versions, receipt substitution and unsafe admission values.
- [ ] Review source and affected tests before publication; state that private producer integration remains unfinished if that is still true.

## 2. Private update receipt through activation

Files: sealed-realms-production-activation-records.mjs, sealed-realms-production-recovery-candidate.mjs, sealed-realms-production-activation-workflow-entry.mjs and generate-0.4.0-recovery-launch-activation.mjs, with producer-to-consumer tests.

- [ ] Test a distinct update corpus preserving historical import/owner provenance and current sealed-live observation.
- [ ] Commit current target/artifact/full definition, predecessor and submission/completion lineage, host preservation contract and exact acknowledgement outcome in the private receipt. Cross-check all projected coordinates and historical/current receipt digests.
- [ ] Select immutable completion records through authenticated continuation lineage; provide no caller-selected raw receipt writer.
- [ ] Exercise private reopen through candidate generation, public verifier and service parser. Cover later gameplay writes, broken lineage, changed corpus, wrong source/store and synthetic/fresh substitution.

## 3. Actual Linux artifact and update producer

Files: sealed-realms-production-existing-update.mjs, sealed-realms-production-ptr-workflow-entry.mjs, sealed-realms-production-ptr-lane-entry.mjs, Linux source-built artifact owner and production workflow entry.

- [x] Select withPtrLinuxLockedSourceBuild in the actual descriptor-bound artifact helper; native build, provenance and cleanup verified. Factory integration remains below.
- [ ] Derive complete registered schema from exact compiled bytes; generated binding names are insufficient. Compute SHA-256 and program Keccak internally.
- [ ] Derive provider-owner authority from the private validated CLI configuration and cross-check the fixed existing PTR identity. Keep game-admin reads separate.
- [ ] Persist pre-send intent and authentic successful response digest. Lost-response reconciliation may establish observed installation, never invent a received acknowledgement.
- [ ] Connect the existing inspect/apply/reconcile hooks, genuine supported-runner permit and cleanup. Enable dispatch only when producer and consumers are connected.
- [ ] Verify actual-owner play and integrated release preservation, regenerate source-bound release outputs and ship through the actual operating workflow.

## Evidence and status

Base is published `af68cae8f6e6f60cb8a5252e6b5c14f5c336c9d9`. The separate official 2.10.0 disposable recovery rehearsal passed from `826ed94`, including earned/pending progress, repair, timers, expiry and exact retry. It is not production acceptance or a test of the later v3 definition adapter.

Historical production notes record initial PTR creation without atlas import or owner provisioning. The public schema does not establish row contents or current ownership. No authentic import/owner corpus has yet been found in the inspected retained evidence. First authenticate current state: if initialization is absent, perform real import/provisioning; if populated, establish actual continuity without inventing historical receipt digests.

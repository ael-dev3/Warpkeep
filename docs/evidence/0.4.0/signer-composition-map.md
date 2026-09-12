# Signer composition inspection — 2026-09-07

Inspected at `c3a9eb2f54c59b503a8c3029a86c839a9e852dda`; R12 remains incomplete.
This maps existing executable components to Task 6, not a new architecture.

Update 2026-09-07: `signerControl.ts`, `signerSecrets.ts`, `signer.ts` and
`signerIssue.ts` now compose configuration/key validation, status and issuance.
See `signer-status-composition.md` and `signer-issue-composition.md` for exact
test scope and limitations. The table below is the original inspection;
status/issue gaps have partially advanced, not the Worker runtime or the other
methods. R12 is still open.

Use `ReleaseRecoveryAuthorizationLedgerV2`, not the older ledger adapter.
Its fixed control object is `warpkeep-release-recovery-control-v2`; request
objects use the request UUID. `reconcileControl` transactionally returns the
full control state; its `status` output is deliberately a reduced projection.
The signer must not substitute that reduced status for the control state passed
to `installArming`, `reserveIssue`, `readIssued` or `claim`.

Required composition:

| Operation | Existing components | Still required |
| --- | --- | --- |
| status | reconcileControl; signRecoveryStatusJws | exact server configuration/key validation and named RPC method |
| issue | snapshotSignerRequest; verifyGitHubWorkflowIdentity; loadGitHubCandidateEvidence; observeRecoveryRealmEvidence; reserveIssue/finalizeIssue/readIssued; signRecoveryAuthorizationJws | payload construction, control refresh, reservation/retry sequencing and private lifetime management |
| claim | verifyRecoveryAuthorizationJws; fresh workflow verification; recheckGitHubEvidenceMetadata; observeRecoveryRealmEvidence; ledger claim; signRecoveryClaimJws | complete observation-interval freshness and durable-before-response composition |
| complete/reconcile | readClaimedProjection; verifyPostDeployClaimReceiptCorrelation; createDeploymentReconciliationProofReader; ledger complete | fresh same-job identity/locator comparison and terminal response signing |
| terminal | request-object status; signRecoveryTerminalJws | exact read-only UUID lookup and terminal-only public projection |

Important reuse findings:

- `recheckGitHubEvidenceMetadata` consumes retained metadata plus its digest and
  independently refreshes GitHub metadata. Claim need not download the archive
  again or reconstruct metadata from caller input.
- The existing reconciliation reader already recognizes in-progress jobs and
  successful completed deployment steps. Do not implement a second evidence
  reader merely because same-job postflight occurs before job completion.
- Post-deployment receipt correlation is already separate from the strict
  pre-deploy verifier and checks the stored claim deadline. Do not add an
  allow-expired switch to the generic verifier.
- No signer entry point or signer configuration parser exists yet. Next work
  should connect validated server control to this V2 adapter, then implement
  status/issue with real ledger orchestration tests. Request-field validation
  alone is not signer composition.

The new request component uses a 16 KiB token transport cap matching the root
client; the lower-level GitHub verifier allows up to 64 KiB. These are distinct
limits, not authority to increase the public transport cap.

No production operation, configuration change, or independent review occurred
during this inspection.

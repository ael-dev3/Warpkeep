# Recovery completion and terminal composition — 2026-09-07

`RecoverySigner.complete` and `reconcile` now exact-parse receipt-only requests,
validate signing material, independently invoke the existing fresh same-job
OIDC verifier, compare every stored locator and stable workflow identity field,
and verify the receipt against the consumed row. They use the existing
deployment reconciliation evidence reader, not caller-provided proof. Only a
completed proof can commit completion; ambiguous/not-deployed reader results
cannot be turned into success by same-job postflight. Alarm reconciliation
continues to own its existing terminal-outcome rules.

Consumed-row postflight does not require the current configuration to remain
enabled or at the consumed epoch. Configuration is still parsed, but no control
transition is performed. A newer disabled epoch must not erase an actual
deployment outcome. The claim receipt remains usable only for correlation
before the stored 20-minute deadline, not for starting a deployment after its
two-minute expiry.

`terminal` uses a new narrow `readTerminalProjection` ledger RPC. It only loads
an already-terminal row, rejects a wrong request UUID/nonterminal state, and
does not repair alarms or mutate SQL. Signed terminal responses omit raw
authorization bytes, private arming and provider metadata. Postflight re-reads
the durable terminal row and compares its row-binding digest before signing.

Verification using pinned Node 22.22.3:

- Service TypeScript and workerd TypeScript checks: both exit 0.
- signerSecrets, claimReceiptCorrelation, reconciliationEvidence, ledgerV2 and
  crypto tests, `--maxWorkers=1`: 96 passed, five files.
- `vitest run --config vitest.workerd.config.ts test-workerd/ledgerDurableObjectV2.test.ts`:
  13 passed in actual local Workerd, 20.09 seconds. The new test proves SQL and
  a deliberately leftover alarm remain unchanged by terminal lookup.

The initial Workerd test used the wrong complete-request property order and
failed exact parsing. It also used the RPC rejection assertion form that emitted
an unhandled test-pool rejection; corrected to the existing in-object assertion
pattern. The successful rerun has no unhandled errors. Production parsing was
not relaxed.

The integrated signer journey uses real crypto and ledger state transitions,
with ephemeral public pins and mocked OIDC/provider/proof-reader boundaries.
It covers expired-for-deploy receipt correlation, exact deadline denial,
changed locators/workflow attempt, rejection of authorizationJws in postflight,
ambiguous proof, disabled higher epoch, durable success, terminal lookup and
idempotent reconciliation. It does not prove a live job/deployment or the
missing named signer/gateway Worker wiring. Existing reader tests separately
exercise exact deployment-evidence validation. No production operation occurred.

R12 remains incomplete: Worker configuration/entrypoints, gateway integration,
full runtime journey and deployment are outstanding. Independent review remains
pending; full-suite Windows timeout failures are not resolved by this checkpoint.

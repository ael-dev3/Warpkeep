# Remaining release-engineering execution gaps

Inventory 2026-09-06; inspected checkout based on `c7f3c4d`.
**R12 incomplete.** This names executable gaps, not permission to bypass fences.

| Component | Observed unfinished behavior | Required completion evidence |
| --- | --- | --- |
| `.github/workflows/sealed-realms-production.yml:63` | Stale-closure step always emits `SEALED_REALMS_TASK_7_CLOSURE_UNAVAILABLE` and exits 1 before operations | Complete authenticated lane bundle/closure verification followed by genuine protected workflow execution |
| `scripts/sealed-realms-production-dispatch.mjs:188` | Activation-evidence operation returns `SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE` | Executable approved generator composition with exact source, receipt ownership and reconciliation checks |
| `scripts/sealed-realms-production-auth-bridge-state.mjs:2413` | `createSealedRealmsProductionActivationEvidenceGenerator` unconditionally fails; assert at 2422 and generator-consume at 2451 also fail | Canonical authenticated generator receipt and non-mutating reconciliation, valid private capability lifecycle, negative and recovery tests |
| `scripts/sealed-realms-production-workflow-evidence.mjs:7` | Every syntactically valid commit still throws workflow-evidence unavailable | Genuine workflow-attested Verify evidence bound to exact reviewed source; no caller-SHA self-attestation |
| Production runner/workflows | Current protected execution targets macOS/ARM64; no local Windows/Linux repository runner registered in authenticated inventory | Supported isolated local execution with real workflow identity, pinned toolchains and production credential separation |

The opaque activation-member checks and confirmation-consumption logic around the
generator stubs are existing implementation, not a complete generator. Do not
replace their private receipt boundaries with raw caller evidence to fill a stub.

## Existing work to retain

Verified local generation, bundle construction and closure components exist and
must be composed according to the existing local release assembler specification.
Accepted component tests are not proof that a complete candidate can be assembled,
frozen, dispatched, recovered and activated end-to-end.

The fixed work order remains representative playable keep, required gameplay and
visual coverage/local operations, final release freeze, deployment, live checks.
Source pins, artifact hashes and closure counts must derive from the finished
source family, not be edited to make an intermediate branch pass.

## Scope and acceptance boundaries

These are concrete entries within existing R11–R13, not additional product scope.
Remove a fence only in the same reviewed change that supplies its required
authority and tests. A deleted `exit 1`, changed status string, mock success or
locally fabricated workflow identity is not completion.

Before production effects, verify the G001 baseline and tested recovery preserving
post-deployment writes; preserve sealed G002 and owner-only PTR. R14–R17 still
require reviewed integration, real deployment identities and live acceptance.

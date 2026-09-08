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

## 2026-09-08 recovery workflow caller

The change following `c990a3bb361327f77d6f08faf74b3eb1537f5a03` adds the real
`deploy-recovery` job to `.github/workflows/deploy-pages.yml`. It selects the
existing `sealed-g002-recovery` classification and requires the supported Linux
runner identity, UID 1001 and the existing mode-0700 recovery directory. It does
not create that private state or compile an authorization helper during a run.

The job checks exact verified/current protected main, the installed claim bundle
and source closure, then builds with the existing V2-compatible configuration
checks. It rechecks Node and source around dependency installation/build, writes
and checks the deployment attestation, and uploads a run/attempt-specific Pages
artifact including its required hidden manifest. The fixed claim, fresh boundary,
pinned deployment and unconditional-after-claim postflight steps remain adjacent.
The existing signer independently verifies workflow/runner metadata and the
actual uploaded archive before permitting deployment.

The actual checked-in workflow now passes the unchanged recovery source-evidence
and reconciliation validators. Independent review caught a duplicate notification
YAML key that broke the older source parser/closure projection. Recovery's fixed
`false` value now goes through `GITHUB_ENV` in its first prerequisite step; the
existing build's single YAML authority and validators remain unchanged. A real
parser compatibility regression covers that interaction. Other jobs and global
workflow settings were compared structurally with the prior source and are
unchanged.

Executed verification for this caller:

- Release-recovery source-evidence/reconciliation suites: 278 passed; service
  TypeScript check passed.
- Linux root caller/parser/closure and attestation/context/boundary/postflight
  suites: 115 passed, one intentional non-Linux guard skipped, across nine files.
- All 12 Bash step bodies passed `bash -n`; scoped diff checks passed.
- Independent review repeated the real legacy parser check before and after the
  fix and found no remaining actionable caller defect.

The Linux run used the isolated `5ddefb0` verification checkout plus the exact
four-file workflow/test overlay. Relevant scripts, validators, test sources,
package locks and test configuration were compared with `c990a3b` and found
identical before the overlay. It used its own Node 22.22.3 and existing exact
YAML/TypeScript Linux dependencies through a service-local link. The primary
checkout's shared dependencies were not changed. Initial Windows Git fixtures
hit a timeout/cleanup contention and hardcoded `/usr/bin/git` failures; the
affected fixtures subsequently passed unchanged in the appropriate serial/local
or Linux run. No timeout, assertion or platform condition was weakened.

This is caller implementation, not an operating recovery deployment. A fresh
read of the GitHub runner inventory found only the offline Mac runner; the
required `warpkeep-wsl-production-01` Linux/X64 runner is not registered. The
inspected Ubuntu environment has the separate UID-1000 preparation account,
without UID 1001 or `/home/runner/.warpkeep-recovery-v1`. The generated claim
bundle/manifest, final source closure, signer/gateway configuration and authentic
release authorization must be installed and verified through their real owning
procedures. Missing prerequisites still fail. No runner, provider, credential,
admission, player state, security validator or generated pin changed here.

This workflow must be part of the preparation source: the existing recovery
activation child permits changes only to its binding and package version files.
Do not postpone this caller until activation or claim R12/R16 from its fixture
results. Other assembler/activation gaps below remain open.

## Existing work to retain

Verified local generation, bundle construction and closure components exist and
must be composed according to the existing local release assembler specification.
Accepted component tests are not proof that a complete candidate can be assembled,
frozen, dispatched, recovered and activated end-to-end.

The fixed work order remains representative playable keep, required gameplay and
visual coverage/local operations, final release freeze, deployment, live checks.
Source pins, artifact hashes and closure counts must derive from the finished
source family, not be edited to make an intermediate branch pass.

## 2026-09-07 source reinspection

Rechecked at `88e35b48cb0eb66ec35e472081caa906bb2df461` before final
freeze. The source fences above remain present. Additionally,
`scripts/sealed-realms-production-activation-lane-entry.mjs:221` rejects
`activation-evidence-generate` after validating the lane authority. Completing
the dispatcher alone therefore cannot make activation executable: the lane and
private generator must be completed together under the existing receipt rules.

The assembler has more reusable work than the original inventory states:
`scripts/local-prepared-bundle-files.mjs` exports
`derivePreparedOperationBundleFiles`, which derives four bundle/declaration
pairs and a source-bound manifest. It checks fixed lane identities, graph
digests, export names, declaration shape, and bounded bytes. Its returned files
are data, not an installed or authenticated candidate. A repository search for
that exported function found its definition, declaration, tests and component
plan, but no operating caller in `scripts/`.

The next assembler work is the specification's complete-family composition and
owned-Linux candidate transaction: derive bindings and all generated consumers
from one source identity, lock and journal replacements, recover interrupted
publication without overwriting unexpected bytes, then independently verify
the full family and repeat-write zero diff. The existing bundle-file helper
should be reused; its component tests cannot substitute for those transaction
and convergence checks. Do not perform final refreeze before remaining gameplay
and deployment source changes finish.

This is a refinement of R11–R13, not an additional release requirement. No
production changes or fence removals were performed during this inspection.

## Scope and acceptance boundaries

### Pages workflow regression coverage

Verify run `34170072520` at `5b97c5f` reported three additional root-suite
failures after the Linux recovery Pages job was added. Two assertions counted
workflow-wide checkout/verifier occurrences; the third read past `verify-live`
into the new deployment job and attributed its write permission to postflight.

The tests now inspect every named job's exact verified source checkout, fetch
depth and disabled credential persistence, compare the required verification
phases by job, and bound postflight source to its own job. All **17 workflow
security tests passed** on Windows with Node 22.22.3. This correction changes no
workflow permissions or deployment behavior. The same CI run still reports
source-pin/closure and activation-fixture failures; a passing focused test is
not a green full Verify run or a live deployment.

### No-Mac execution boundary reinspection

At `78a0a7a`, production migration is not just a runner-label change:

- `sealed-realms-production.yml` selects macOS and checks a fixed Darwin Node
  path and Mach-O ARM64 executable identity.
- `notification-bridge-b0.yml` and `notification-bridge-prepared.yml` also bind
  fixed Darwin Node/pnpm paths and the Darwin installed-toolchain manifest.
- `deploy-pages.yml` has Linux-aware disposable build setup, but its protected
  execution jobs still select macOS and consume that same Darwin manifest.
- `auth-bridge-notification-prepared-installed-toolchain.mjs` binds a Darwin
  profile and exact Darwin workerd, esbuild and native TypeScript executable
  paths. A Linux package tree cannot truthfully satisfy that attestation.

The local preparation runtime and hosted Linux native tests do not replace
these production contracts. Required migration must update the supported local
runner execution, fixed runtime checks, actual Linux installed-byte attestation
and all authenticated consumers together, before final source closure freeze.
Do not rename a Darwin manifest or accept a Linux runner under Darwin identity.
This inspection was read-only and did not register or alter a runner.

These are concrete entries within existing R11–R13, not additional product scope.
Remove a fence only in the same reviewed change that supplies its required
authority and tests. A deleted `exit 1`, changed status string, mock success or
locally fabricated workflow identity is not completion.

Before production effects, verify the G001 baseline and tested recovery preserving
post-deployment writes; preserve sealed G002 and owner-only PTR. R14–R17 still
require reviewed integration, real deployment identities and live acceptance.

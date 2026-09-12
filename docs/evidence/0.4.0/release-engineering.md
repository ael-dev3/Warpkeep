# Release engineering: implementation and evidence

Current reading point: inspect actual [main](https://github.com/ael-dev3/Warpkeep/tree/main),
the current working PR and [execution handoff](../../agent-notes/0.4.0/execution-handoff.md).
PR #228 is merged and its branch retired. Actual M1
`c4b95505b73705d120aff3f3318d2bd5151f6565` completed native preparation,
independent checking and guarded export. PR #235 integrated its checked generated
family into signed main `7b102f9f` (M2); later product source follows separately.
The retained `8033e01c` family below is historical and predates the Linux PTR
caller and pending-keep changes. Each later source change needs its own CI and
protected integration. Older synchronized heads below are historical checkpoints.
The generated source families recorded below are dated, source-bound evidence;
documentation and test follow-ups do not create a new release candidate. The
retained candidate, closure and runner observations below are not current
deployment authority. The [execution handoff](../../agent-notes/0.4.0/execution-handoff.md)
gives the next connected work and actual publication/check status. **0.4 is not shipped.**

Each dated section retains its exact source and scope. Earlier missing-component
entries are history when a later section demonstrates their implementation;
component success does not establish unrecorded production acceptance.

## Pending-panel source family — 2026-09-12

The Close/Escape host correction at source
`8aaeda0fe21e726603208594c2cb6c114873e794`, tree
`51fb0cf1e02d57b4ba6813aa153255ff31fa0ab6`, completed native preparation
`24973` and independent rebuilding check `93940`, both exit zero with all 19
returned fields equal. Retained candidate:
`release-workspace-88969f8c268f4f0c6bca51f42f11d734`.

- Transaction: `2f0a50a3d65b54694a6922384c74002a`.
- Journal SHA-256: `d30d993c4da7ece550539e2b5b2bc55c41ae3a450c2d14685e5b5abab05de258`.
- Complete-family SHA-256: `13bfe8dad242357360e8fbd56d0e6afd0379770f5ffd0730aba2c54dbdb0e004`.
- Closure-manifest SHA-256: `d15a7b107b1dece31b2d7681389e85411c505f07b9d0e7409360a7bed97c3168`.
- Scanner-manifest SHA-256: `edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71`.

Both runs checked 3,213 source/candidate files, 102 outputs, 3,111 preserved
source files, 460 bundle inputs and seven recovery inputs. The authenticated
export's SHA-256 is `8e02516e4bdd21a34b1ee7910bdc38f460e155feb04d6c86707c531549dc75f6`;
its 7,648-byte patch has SHA-256
`fd645e8c125c58664d5c65b982898515f298ed43d79e5e092a093fd2dec56cfa`.
The complete output family was verified and applied to the unchanged Windows
input, preserving HEAD, index and non-output source. Generated-only staging
matched tree `1494fe0d9468b54c30ae47acccadd7038fb83726` before adding notes.
Only seven manifests/workflow pins changed; compiled bodies, bindings and count
fixtures remained unchanged. The ignored reviewed helpers changed only input
coordinates. No generated digest or body was hand-edited.

This proves repeatable preparation for the UI source, with
`finalReleasePrepared: false`; it does not establish deployment or owner/device
acceptance. PR #240's broader Linux job `103590042919` subsequently reported one
failure in `sealedRealmsProductionBridgeProvider`: its real-parser fixture still
omits the observer entrypoint and version-metadata binding. That suite was not in
the earlier 365-case native selection. Keep the hosted failure visible and verify
its correction separately; the earlier passing subset does not cover it.

## Prepared-policy family refresh — 2026-09-12

Source `3710f139b3572ae0a742d582d0d79d8aa88d9476`, tree
`228bceec2a81dd41fb88f2f88a7af5ff75e1df91`, corrects the one stale helper
signature expectation described below. Native targeted session `30348` passed
all seven affected cases in 54.41 seconds, exit zero; 156 other cases were
filtered, not disabled. Independent review confirmed that the runtime guards
and regression assertions were preserved.

Native preparation `91889` and independent rebuilding check `80884` both
completed with exit zero; all 19 returned fields matched. Retained candidate:
`release-workspace-baf068853796d70d5c6b480a15116d05`.

- Transaction: `74a77e9a2e6a262dc4a63d4bce04e1af`.
- Journal SHA-256: `a679f9545c05cab12446770d4dd6515d349630f7e599bb10a5494a388a9ebac8`.
- Complete-family SHA-256: `a6e2cc8293796d90c172d3fa754f6c76f32fb3715dd81d3e36661a2b1b0460c1`.
- Closure-manifest SHA-256: `f380eb136a37d5c237a55293645aa1308794212cbf16eaea5c83a904314fc47d`.
- Scanner-manifest SHA-256: `edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71`.

Both runs authenticated 3,213 source/candidate files, 102 generated outputs,
3,111 preserved files, 460 bundle inputs and seven recovery inputs.
`finalReleasePrepared` remains false. The reviewed export authenticated the
complete family, normal indexes and retained evidence, then round-tripped its
7,703-byte patch. Patch SHA-256:
`44137df79aeefda09d4d918948df883039effdf15bf122eebf838f50b277bba7`.
All seven changed paths are derived manifests or their four workflow pins;
compiled bundles, declarations, bindings and count fixtures did not change.
Independent review reconstructed every output and the complete generated tree
`4795a1fe2bb6b6eeb5851c538a352b454aa66596`.

Authenticated application to the unchanged Windows compiler input verified all
output bytes/OIDs, exact changed paths and unchanged HEAD/index/preserved source.
Generated-only staging reproduced that exact tree before documentation was
added. Existing ignored operator helpers changed only their input coordinates;
no candidate, output digest or generated body was hand-edited. Published
integration `9ac3ee3628a8586fd1338c4f036f46bad414fca9` passed all 365 native
tests across eight suites without skips (session `81593`, exit zero, 289.91
seconds), including all 163 prepared-workflow cases and its affected generated
consumers. The native checkout remained clean afterward. All 30 doc-facing
tests, file policy, diff checks and the entire outgoing secret scan also passed.
Earlier G's 448 passing cases remain evidence for G. Current-head hosted checks
and normal protected integration remain required; no provider deployment occurred.

The public entry-point audit replaced retired development links in the game's
README, Assets README and Water Engine README. Water main is
`9d42fb786b9fe2dbed9e9a5103c9c692d5612567`; Assets PR #34 passed its required
checks and merged normally into signed main
`4a47038ae837cc5eba5227e726d3ce1f89e70f79`, with exact reviewed tree equality.
Both owning local checkouts matched their live GitHub refs. The sync procedure
now explicitly fetches the authorized native ref, including development inputs.
No new Desktop file, clone or dependency tree was created.

## Bridge/PTR source family — 2026-09-12

Published compiler input `9e098f7594bd76e3afcf0b1c6d79f106d8a6a4b7`
(tree `3abb7a974ed729d6cffbcc0ff89718da1bb8f2bf`) completed native preparation
session `67204` and independent rebuilding check `6320`, both exit zero. Every
returned field matched, including source, transaction, verification counts and
`finalReleasePrepared: false`. The retained final candidate is
`release-workspace-54312911486fdf55e97e67414ec67b38`.

- Transaction: `323655434cbf165c5c5a691b61f69096`.
- Journal SHA-256: `6c55dad6c9c5d08bbd18eebed4e3866ce9971c1628a20bcc4ccbc5d728bd784d`.
- Complete-family SHA-256: `f48e8d7281b5e0090695bd429b9d49dcd98a06afa00ee3d904bf21a5727ca88d`.
- Closure-manifest SHA-256: `f16c9375a1c4981da057a3fe1d20c86436a22f73e5f6b847453995c7ef623c15`.
- Scanner-manifest SHA-256: `edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71`.

Both runs checked all 3,213 source/candidate files, 102 generated outputs,
3,111 preserved source files, 460 compiled bundle inputs and seven recovery
inputs. These are verification facts, not product scope or release acceptance.
The refreshed family carries the PTR observation and prepared-bridge source
inventory through all compiled lanes, generated source pins, manifests, workflow
consumers and count fixtures. The G001 and G002/PTR generated binding bytes remain
unchanged. No counts, hashes or generated source identities were hand-edited.

The reviewed operator composition reacquired the candidate lock, authenticated
completion and its sole journal, retained backups and every output, and rechecked
the entire source/candidate. Its captured-byte temporary index produced tree
`5426f0d7c3311ef3b669cf635b170358175769c2`. A binary-patch round trip reproduced
that tree; both normal indexes and retained evidence stayed unchanged, and the
owned temporary index was removed before final reattestation. All 102 outputs
were authenticated; 19 paths differed from the committed input. The patch was
4,447,026 bytes with SHA-256
`57259d0aa8b41ad25786380ac84eaa8a28146ba09bfdb3bb1485b64eee26adaa`.

On the clean Windows checkout at that exact input, patch checking preceded plain
application. All output sizes, hashes and Git blob IDs matched; the full changed
path set was exact, and HEAD identity, branch state, normal index and every
non-output source file stayed unchanged. The export and receiver helpers remain
ignored operator artifacts; no Desktop file, clone or dependency tree was created.
An initial exporter guard incorrectly required the assembler-created `.git`
directory to be mode 0700; the observed 0755 directory satisfies the existing
lock's non-writable contract. The receiver's isolated Git invocation also needed
the already-authorized exact Windows safe-directory entry. Both attempts stopped
before applying source; the corrected composition passed without changing
candidate permissions or global Git policy.

The family and owning notes were published as
`4b96ae380b6fdb348d26eaf74464638e2e346aff` after the full outgoing range passed
the secret scan. GitHub/Windows equality was verified, then the clean idle native
checkout fast-forwarded to that exact commit. Native session `89197` passed all
448 tests across the 15 runtime, closure and generated-consumer suites without
skips in 38.75 seconds. This includes the downstream source-pin/count failures
recorded before generation. Checked-in and preparation CLI verification passed;
the source classifier returned `sealed-launch-blocked`. A direct `--phase=pages`
invocation without its GitHub environment rejected with
`SEALED_LAUNCH_PAGES_ENVIRONMENT_INVALID`, as required; it is not a production
workflow run. No fabricated workflow environment was supplied.

Both Windows TypeScript projects passed after application. All 30 tests in
`projectLinks`, `publicLegalDocuments` and `keep04DocumentPolicy` passed; the
tracked file-size policy and diff whitespace checks passed. These checks do not
stand in for the separate affected native/hosted verification.

The supplemental Windows session `31279` later ended with 283 passes, 78
failures and four skips across eight files in 672.91 seconds. Three suites failed
before their intended native assertions: the closure repository requires
`process.getuid`, fixtures call `/usr/bin/git`, and Windows rejected symlink
creation with `EPERM`. This is a recorded failed Windows invocation, not a pass.
The same projection and deployment-boundary suites passed on native G above.
The separate native prepared-workflow suite `81300` completed at `42b660fd`
with 156 passes and seven failures in 233.32 seconds, without skips. These seven
were an actual source-policy mismatch: the static verifier expected
`exactApiScriptAttestation(script, code)`, while the repaired runtime takes
`exactApiScriptAttestation(script, expectedNamedHandlers, code)`. Its initial
baseline failure caused six later credential-comment checks to fail before their
mutation assertions. The verifier now requires the actual three-argument shape;
no credential check, production guard or test assertion is relaxed. The completed
targeted recheck and fresh whole-family preparation/check are recorded above.
The development workflow also makes the platform routing explicit.

This is development-source preparation and integration, not deployment. Read
[PR #240](https://github.com/ael-dev3/Warpkeep/pull/240) for the current published
head and its verification. Full current-head hosted checks, protected-main
ancestry, provider/owner authority, live preservation and final release acceptance
remain separate. Preserve the original compiler-input identities in this family
through later commits and follow the [local preparation procedure](../../operations/0.4.0-local-release-preparation.md)
for subsequent protected-source preparation.

## Existing PTR observation integration — 2026-09-12

The new read-only operation reaches the existing private bridge observer through
a dedicated GitHub job, recovery gateway and private signer. GitHub OIDC `jti`
binds the request; the signer derives the real check-run identity from the
attempt's complete GitHub jobs inventory and independently verifies the check,
workflow, current attempt and protected main. It rechecks authority after the
bridge RPC, validates the original full response and signs a narrow PTR projection.
The caller verifies the pinned signature and exact source/run/request identity,
then writes and reopens the canonical JWS only in the existing private audit root.
Recovery stays disabled, and this path does not issue import/provision/adoption
receipts or invoke a realm mutation.

Focused tests exercise the actual auth-bridge response construction and signed
contract, OIDC/job evidence, signer and gateway. The complete release-recovery
unit suite passed 1,143 tests in 44 files on pinned Node 22.22.3; both service
TypeScript projects passed. All seven Worker runtime suites passed their 53 tests
in 65.87 seconds using the service-local Vitest runner and its existing dependency
tree. An earlier invocation incorrectly used root Vitest and failed before test
discovery because the service loaded a different Vitest peer snapshot; this was
an invocation error, not a Windows limitation. No dependency install was needed.

The broader root owning run passed 181 tests in nine suites before the final
job-ID parser correction. After that correction, four focused caller/workflow/
compiled-bundle suites passed 51 tests and root build-mode types passed. Review
caught and corrected a runner-label mismatch using the actual workflow as fixture
input. The caller now reads GitHub integer IDs without precision loss and checks
the job ID, run and attempt against the exact check URL and current context;
large-ID and mismatched-identity regressions cover that boundary. Freshness is
checked again after asynchronous signature verification before evidence is stored.
The signer also checks the authenticated validity window after crypto completes.
A regression first reproduced an expired statement escaping within the longer
request/OIDC budget, then passed after the correction. Final focused service
verification passed 59 tests across contract, OIDC, signer and gateway, and both
service type projects passed again. Record subsequent final-source/Linux checks
and publication in the actual PR.

The final workflow audit reproduced two omitted owning-contract failures: the
new operation's vocabulary order differed from dispatch choices, and the workflow
test omitted `observe_ptr`. Source and declaration now append the operation in
the existing order, retaining the strict ordered assertion. Workflow coverage
includes its exact job/permissions, runtime guards and environment pruning;
dispatcher cases exercise successful observation and wrong-job/result/export
refusals. The three affected suites passed 50 tests on Windows with 40 Linux-only
cases skipped; root types passed. Include those Linux cases in native validation.

The first outgoing scan correctly stopped publication on three occurrences of
the existing preparation test key's public thumbprint in the new tests. The
fixture's public coordinates were checked against the original test key and
confirmed distinct from the production key pin. This is public fixture metadata,
not private signing material. The scoped scanner correction permits only that
exact value, the `generic-api-key` rule and the three exact test paths. The real
scanner regression first reproduced the three unexpected findings, then passed
40 allowed cases and 78 mandatory detections, including changed values and the
unchanged value at copied paths. All seven scanner tests and the Node-project
typecheck passed. Keep both source and correction commits in the outgoing scan;
do not bypass scanning or rewrite the source checkpoint to hide the finding.

At published `937c0128`, native session `80114` passed all 396 tests in 17 owning
and affected graph suites without skips in 10.39 seconds. The checkout stayed
clean and unchanged. PR #239 then exposed a separate clean-install boundary:
Verify `34699623347`, recovery job `103568959219`, failed service typechecking
because the new producer-compatibility test imported auth-bridge source while
that job installs only recovery dependencies. The missing module was the bridge's
`@noble/hashes/blake3`. Local sibling installations had masked that dependency.
The compatibility regression now lives in the auth bridge's existing test suite,
with recovery contract tests retaining their own dependency boundary. The recovery
compiler graph contains no auth-bridge paths; the shared capture imports only its
internal recovery files. Both services' Node and workerd type projects passed,
along with 35 focused recovery and 13 auth-bridge tests. This preserves the real
producer check without adding unrelated service installs to CI. Fresh hosted
verification remains the authoritative clean-install result for the correction.

Authenticated provider inventory found only the existing auth bridge, with B0
source and public authentication enabled; neither recovery Worker nor the
required PTR/canary/recovery bridge bindings is deployed. The existing private
Windows bootstrap validates and its public key matches the source pin. Full
bootstrap and live bridge-key verification remain incomplete. See the
[provider record](../../agent-notes/0.4.0/release-and-infrastructure.md#current-provider-configuration--september-12).
No live PTR observation, preservation result or deployment is established.

Normal merge commits reconciled M2 into PRs #236, #237 and #238 without changing
their reviewed trees. Their published heads are respectively `92d363ce`,
`7bc5992c` and `23ec4731`; full outgoing scans and local/live comparisons passed.
The clean idle native checkout was synchronized to the last of those before
the new observation work began. None of these updates moved protected M2.

## M1 family and runner availability — 2026-09-12

Final K Verify `34694406086` and CodeQL `34694406081` passed. Normal protected
expected-head squash merged PR #235 at 13:33:31 UTC into signed, valid M2
`7b102f9f`, with sole parent R and tree exactly equal to reviewed K `93a976b0`.
Actual M2 main push Verify `34696760924` subsequently reached terminal success.
The first sealed workflow dispatch `34699447213`, created at 14:29:45 UTC, ran
against that exact protected main. Its actual `operate_readonly` job
`103568496530` passed and emitted exactly
`{"operation":"preflight","status":"preflight-inspected"}`; all other jobs
were skipped. Live main was rechecked unchanged afterward. This proves the
installed Linux runtime, private-root, source/family and GitHub authority path.
It does not establish provider credentials, owner state, deployment or release
acceptance. Later source requires its own current-main evidence and preparation.

M1 prepare `30088` and independent check `8359` both exited zero; every result
field matched for `release-workspace-99438dc2cc576e073df09bc44f930bc6`. The
guarded export and receiver authenticated the full output family and preserved
non-output source. Generated source `d452b055` was normally merged with the
scanner repair, then protected main `2dc1f519`, yielding `3c4eb264` without
changing the authenticated family. PR #235 contains only its generated paths.
Its producer manifests retain M1's source and tree. The native owning workflow,
bundle-engine and closure-derivation suites passed 194 tests without skips;
the checked-in sealed-launch and prepared-policy verifiers passed again at
`3c4eb264`. This remains preparation evidence with `finalReleasePrepared: false`.
Protected integration, main CI and actual sealed preflight are verified above;
provider and player acceptance remain separate requirements.

The September 12 runner check found GitHub registration 22 offline, with
`WarpkeepRunner` absent from the running distro list. Opening the guest started
its healthy enabled service. The existing Windows keepalive task was `Ready`
with last result 1; that result alone does not identify the original exit cause.
The stored task also had the default 72-hour limit and only a logon trigger.
The task was recovered and adjusted to `PT0S`, `StartWhenAvailable`, and an
indefinite five-minute time trigger alongside its original logon trigger.
Its existing action, interactive limited principal, hidden setting, battery
policy, `IgnoreNew`, restart settings and disabled host-wake setting were preserved.

Readback caught the new trigger's default `StopAtDurationEnd: true`; it was set
to false and re-read before the controlled task restart. The runner was verified
online and idle before that restart. A temporary hidden guest hold preserved
the WSL lifetime during the handoff. The new keepalive instance started at
13:20:18 UTC. The 13:20:26 trigger left the same Windows launcher/WSL child pair
running and created no duplicate. GitHub still reported online and idle after
the temporary hold expired. The task's last result became `0x800710E0` for that
overlapping trigger while the active instance remained running; inspect current
process, service and GitHub state before interpreting a last-result field.

No runner registration, credential, private receipt, game state or deployment
was changed. The [runner guide](../../operations/0.4.0-linux-runner.md) owns
maintenance and recovery instructions. This proves the observed session's
recovery and duplicate prevention, not availability through host sleep/reboot
or arbitrary future runner failures.

## Independent frozen-source mutation cases — 2026-09-12

Historical R main Verify `34694304468` failed only the Linux root-test step:
`genesis001BindingFrozenSource.test.ts` combined four independent materializations
and mutation checks in one callback, which completed in 10,749 ms and exceeded
the default 10,000 ms budget. There was no failed behavioral assertion. The
nearby corrupt-object diagnostics belong to a separate passing negative test.
The generated family in M2 does not alter this test or the production materializer.

The test now gives extra entries, changed bytes, same-byte inode replacement and
directory symlink replacement separate names and one materialization each. All
existing error and destination-retention assertions remain; the inode case also
asserts retention. The default timeout, Linux condition, shared private-parent
cleanup and production implementation are unchanged. Independent source review
confirmed the split preserves the test contract. PR #238 published `e18cf0c5`;
native session `93630` then passed all 11 tests without skips in 20.92 seconds.
The split cases took 880, 877, 920 and 854 ms. The later published M2 ancestry
reconciliation `23ec4731` retains the same tree. This correction does not claim
that a global CI run or authenticated release acceptance has passed.

## Protected source integration and history scanner — 2026-09-12

Normal protected squash integrated reviewed `820e6111` into signed main
`c4b95505b73705d120aff3f3318d2bd5151f6565` at 11:30:54 UTC. GitHub returned
signature verification `true/valid`; tree `24f5ceb4e36814b0a2bdb691adb59591db676611`
exactly matches the reviewed source. Verify `34688961992` and CodeQL
`34688961994` succeeded before the merge. The root suite passed 10,526 tests,
with 181 tests/two files skipped; its serial checks and module rehearsals also
passed. The original source is retained by published annotated history tags.

The subsequent main Verify `34691247637` Linux job `103546763151` stopped at
the full-history Gitleaks scan, before tests. A local pinned 8.30.1 scan reproduced
all nine findings. Exact in-memory comparison proved they are public commit/blob
identifiers used by G001 adoption, frozen-source verification, CLI attestation,
B0 identity and water provenance. Only finding identities and proven public IDs
were inspected; raw scanner secret/match fields were not printed. The existing
Sourcegraph exception is extended by exact values on the activation bundle path,
with independent positive and altered-value/wrong-path regression fixtures.
The full-history command and `.gitleaksignore` remain unchanged.

The real scanner regression reproduced nine unexpected findings before the
configuration repair, then passed with 33 allowed fixtures and 66 required
detections. Every reviewed ID has a single-character mutation at the allowed
path and an unchanged-value control at both a copied filename and another bundle.
All six owning tests passed. The complete M1 history scan then passed across
435 commits (48,353,147 bytes); app/test types, file-size policy and 233 local
document-link targets passed. These checks do not replace the repair's hosted CI.

The outgoing scan of initial repair `1fb1c88d` correctly stopped publication on
four additional matches: actual M1's public commit and tree IDs in this record
and the execution handoff. The follow-up retains that commit and adds a separate
exception for only those two exact values at those two exact paths. The real
regression first reproduced four unexpected findings, then passed 37 allowed
fixtures and 72 mandatory detections, including altered values at both paths and
the unchanged values at an unrelated document. The original bundle exception,
full-history command and historical fingerprints remain unchanged.

Both clean checkouts deliberately moved to actual M1. Native preparation session
`30088` exited zero with candidate `release-workspace-99438dc2cc576e073df09bc44f930bc6`.
The result retains source/tree M1, transaction `71a85ab27d28482e77a030c0b9df7c71`,
journal SHA-256 `893cf764bf187cedb2e487eb13dacdb321fb400480aedc121133b4faf92089bb`,
family `8eda7283eb503ae2ebdcf74abf80d33761158d2be321da5a3329b21766b76f45`,
closure `266f52fae9ce4095c23919add9c7f3bba20a4b2b0fab75a6b47aa7650e25ea5d`,
and scanner `edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71`.
It verified 3,199 source/candidate files, 102 outputs, 3,097 preserved files,
453 bundle inputs and seven recovery inputs; `finalReleasePrepared` is false.
Independent check session `8359` is active from unchanged M1 and must return
matching identities before export. Scanner configuration, regression fixtures
and these notes are outside the deployment
closure. Preserve the candidate's real input and separately reconcile this repair
before generated-family promotion. No deployment, authenticated owner journey or
physical-device acceptance follows from source integration or scanner verification.

## Pending keep route acceptance correction — 2026-09-12

Verify `34686939701` at `48a38b0f` completed Linux job `103535497342` with
two failures in `tests/PtrGameplay04SurfaceHost.test.tsx`: the Mini App and browser
pending-placement/back cases still required the old unavailable-state message.
The actual funded keep remained visible with pending status inside Resources.
The batch passed 10,524 tests across 656 files, with 181 tests/two files skipped;
later types/build phases were not run. CodeQL, native contracts, auth bridge and
recovery passed separately. The module job was still running when diagnosed.

Pinned Node 22.22.3 reproduced exactly two failures and 31 passes in the owning
route suite (session `30658`, exit one). The corrected assertions verify the live
status role, retained Resources/command-panel identity, selected building and
disabled original Confirm button. Clicking that disabled button cannot issue a
second build. Existing atlas-revision, back/history and no-replay assertions remain.
All 113 tests in five affected route/screen/scene/accessibility/controller suites
then passed (session `20563`, exit zero). This corrects integration coverage;
production rendering, command authority and navigation code are unchanged.

Application/test `tsconfig.app.json` noEmit checking passed with pinned Node,
as did the owning file-size policy and all 62 local link targets in the changed
documents. Independent review found no actionable defect. The new publication
still requires its own hosted results; this scoped pass does not claim a full
root build or actual-owner acceptance.

The exact CodeQL alert 19 in the Node dispatch fixture was independently reviewed
and dismissed as a false positive. The flagged `JSON.stringify(lane)` receives
only fixed `ptr`/`activation` literals; the generated module is base64-loaded via
Node import and never embedded in HTML. Its pinned Node suite passed 11/11, and
the resolved review thread and alert state were read back. No broad suppression
or production escaping change was introduced.

## Bundle path and workflow timeout correction — 2026-09-12

Verify `34684939145` at `a7e19376` completed its Linux root-test batch with seven
failures in three files, 654 files passed and two skipped. Six bundle tests failed
at the build boundary; the workflow timeout test also failed. The Linux job
`103530183905` failed at 09:41 UTC before the later `05c9e0f3` UI publication.
That push cancelled the still-running module job, so the workflow's final
cancelled conclusion must not hide its actual Linux failures. Later root phases,
types and builds were not executed. CodeQL at `a7e19376` succeeded separately.

A bounded injected build diagnostic identified the bundle cause: the PTR caller
required `/home/warpkeep`, while the engine's exact path transform still demanded
one occurrence of `/home/runner`. The correction changes only that expected
literal. Exact counts, graph membership, runtime rejection and artifact checks
remain intact. The bundle regression also checks the emitted path representation;
its encoding reconstructs the same runtime string and provides no secrecy.

The workflow test counted jobs with a regex that excluded underscore IDs. That
omitted both `operate_readonly` and `operate_ptr`; the old aggregate comparison
had accidentally concealed the missing timeout on `unsupported`. The corrected
policy parses YAML and checks each job's positive integer timeout. The only
workflow change is a five-minute limit on that refusal-only job; its permissions,
conditions, runner and rejection command are unchanged.

The original six bundle failures and count mismatch were reproduced before the
fixes. The parsed policy then independently exposed the missing unsupported-job
timeout before it was added. Native `warpkeep`/Node 22.22.3 verification passed
all 127 tests in seven affected suites without skips (session `59734`, exit zero),
using an exact four-file overlay over clean `05c9e0f3`. Every copied path was
hash-checked and restored after the run. Subsequent Windows typechecking caught
a test-only `Uint8Array` decoding mismatch; explicit `Buffer.from` corrected it.
This does not change production bytes. Independent review found no actionable
defect. These controlled bundle/workflow checks do not establish a newly prepared
release family, genuine provider authorization or current-head hosted CI success.
Publish the correction and read its own checks before protected promotion.

## PTR provider read and unresolved account authority — 2026-09-12

At `2026-09-12T09:26:36.482Z`, a bounded provider check used the already installed
private CLI configuration and the fixed PTR database. Database metadata returned
HTTP 200 and confirmed the configured database identity. Its owner identity
differed from the saved CLI login. The read-only SQL request
`SELECT COUNT(*) FROM greater_realm_release_v1` returned HTTP 403; no atlas or
owner state was obtained. The preceding pinned CLI SQL attempt also failed.
The config remained byte-identical, and no provider mutation was performed.
Credential bytes, raw response bodies and identity values were not published.

Metadata may be publicly readable, so its success does not prove that the saved
credential is valid or authorized. The owner mismatch and SQL refusal do not
establish whether a separate update delegation exists; no update was attempted.
At `2026-09-12T09:59:15.737Z`, a bounded follow-up identified
`INVALID_PTR_OWNER_SESSION` in the SQL rejection. That is the application's
session gate, not proof of provider update denial. Configuration bytes remained
unchanged. The earlier account/configuration question remains unanswered, but
unrelated source work does not depend on that answer. Preserve the existing
config and PTR while verifying provider authority separately. A refused read is
not evidence that the atlas or owner is absent, and does not authorize importing
or provisioning them again.

The separate deployed bridge admin-token inspection path could establish atlas
and owner status through its genuine authority, but its current configuration
and credentials have not been verified. It is not a substitute for provider update
permission. Import/adoption and owner/live caller composition remain unfinished.

GitHub metadata confirmed the protected `notification-bridge-prepared` environment
contains the five expected secret names for Cloudflare account/token/zone, owner
FID and production admin token. Values were not read. It allows protected branches;
the dedicated Linux runner was online and idle. These are configuration-presence
observations, not credential validation or an executed provider operation.

The receipt-location audit found no documented retained PTR atlas/owner/live
receipt location. The initial creation record at `799814b5` explicitly performed
no atlas import or owner provisioning at that historical checkpoint. Subsequent
synthetic rehearsals do not establish current production state; initial-program
metadata does not replace a current program observation or signed receipt.

## Linux existing-PTR update caller — 2026-09-12

At `33de0387`, both update operations stopped at the Linux CLI input boundary;
the GitHub evidence context omitted them, and the composed PTR entry required
the retired `runner` UID/GID 1001 and Node mode `0700`. New tests reproduced
those failures before implementation. The new `operate_ptr` job connects both
operations on exact main/source with read-only GitHub permissions, the installed
Linux bootstrap guards and fixed cache, CLI and private login-config paths.
It receives no job OIDC, Cloudflare credential or production-admin token.

The Linux dispatch now selects the existing PTR bundle factory/runner and accepts
only the matching `update-inspected` or `completed` result. GitHub evidence binds
both operations to `operate_ptr`, and captured inspection evidence cannot be
reused by changing the operation to apply. The constructor enforces `warpkeep`
UID/GID 1000 and exact pinned Node owner/mode `0500`, preserving ownership,
canonical-path, no-symlink, link-count, byte and re-attestation checks. Existing
provider preservation, continuation, one-submission and reconciliation logic is
unchanged; no new realm or owner is provisioned by this caller.

Validation over a ten-file implementation/test overlay from `33de0387`:

- Pinned Windows Node 22.22.3: CLI/evidence/dispatch 104 passes; lifecycle 36
  passes; workflow 12 passes with 39 Linux-only cases skipped.
- Native `WarpkeepRunner`, `warpkeep` UID 1000, Node 22.22.3: all five suites,
  all 191 tests passed with no skips in session `83875` (exit zero). This includes
  actual Bash syntax, ambient/startup rejection and PTR environment transport.
- The native overlay was hash-checked and only its exact copied paths restored
  afterward; the operating checkout was clean. No preparation was running.
- Application/test TypeScript, script syntax and tracked file-size policy passed.

These are source, dispatch and controlled-provider fixtures. In a separate local
preparation step, the owner's existing Windows CLI config was piped directly to
the previously absent private Linux config using exclusive no-follow creation,
file/directory fsync, exact-byte readback and owner/mode/link checks. Both pinned
CLI binaries matched their committed size/hash contracts. Captured local
`login show` output confirmed a readable login without exposing token or identity
values. No provider request was made, and no actual update permission, module
update, complete predecessor receipt corpus or owner play was validated.
The required config and effect semantics are in the
[operating guide](../../operations/0.4.0-linux-runner.md#existing-ptr-module-updates).
The generated operation family must be rebuilt and independently checked through
the protected promotion sequence below. The intentionally current-source-only
V3 receipt contract still needs genuine historical continuity when existing
import/owner receipts are reused. Import, owner and sealed-live callbacks remain
unfinished and must not be replaced by a fabricated fresh-publish receipt.

For preceding source `33de0387`, Verify `34682368968` Linux job `103523271476`
completed successfully: 657 files passed with two skipped in its first batch,
then both serial suites passed; types, all build variants and dependency checks
passed. The run subsequently completed successfully, including the module and
aggregate Verify jobs. This older-head result is not CI acceptance for the new
caller; read its publication's own checks.

## Activation lifecycle fixture correction — 2026-09-12

At source `2615518e`, Verify `34680474756` Linux job `103518129259` completed
its first root-test batch with one failed file: all ten cases in
`sealedRealmsRecoveryBridgeRuntime.test.ts` reached the newly connected real
bridge-provider constructor with the suite's opaque authority stub. Its old
source-authority mock lacked `sourceCommitFromSealedRealmsProductionAuthority`,
so intended lifecycle assertions were never reached. That batch passed 656 files
and skipped two; its serial follow-up, types and builds did not run. This is not
a successful Verify result.

The correction mocks the provider at the existing lifecycle-fixture boundary,
asserts its exact inputs and handoff into bridge state, and adds early provider
failure coverage for evidence revocation before resource preparation. Production
provider checks are unchanged. Independent read-only review found no further
issue. The corrected runtime, real provider and auth-bridge-state suites passed
all 177 tests on pinned Windows Node 22.22.3, with no skips (session `18025`,
exit zero). Explicit application/test TypeScript checking also passed.

Publish this test/documentation correction immediately and read its own hosted
checks. It does not change the prepared compiler input, generated family or
deployment authority, and does not require another native preparation. The
source-history tag at `2615518e` continues to retain the required historical
operator ancestry; preserve that immutable tag through the eventual squash.

## Mobile source family and guarded export — 2026-09-12

Native preparation session `35471` and independent check `7224` both exited zero
and returned exactly matching results for candidate
`release-workspace-7e291b7e65262f27a14228e7ab90680c`:

| Identity | Verified value |
| --- | --- |
| Committed compiler input | `8033e01cc911f510fafb1770fdb0c0f0f3d2b3ac` |
| Source tree | `0b312c22c550a7f32e8096c4de1174e89b1729f5` |
| Transaction | `5828b3244d0f93858258b931c3dd1ed3` |
| Journal SHA-256 | `b21305974d0873e509ac313980b8e514af56db7cd24c1b01c400b9893ef91140` |
| Generated family SHA-256 | `3cf849ca5d3db6adcfbc6478d4d672a81cb1df197cf0a3c69a6822b0540d4545` |
| Closure manifest SHA-256 | `3853461dd7d3384182b750e7ea86db9007800bac8a61f5e678a491a17bf90fa1` |
| Scanner manifest SHA-256 | `edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71` |

Both runs checked 3,199 source/candidate files, 102 generated outputs, 3,097
preserved source files, 453 bundle inputs and seven recovery inputs.
`finalReleasePrepared` remains false. LF-only Linux stdin and `exec` preserved
the real Node exit status; the earlier shell carriage-return error did not recur.

Guarded export session `78755` exited zero after authenticating the complete
output family, retained backups, full trees and closure. It wrote seven changed
files: four workflow closure pins, the closure manifest and the recovery/sealed
operation bundle manifests. The other 95 outputs were preserved, including all
compiled bundles, bindings and generated test consumers. Windows HEAD and index
remained at the clean input until reviewed staging. No generated body was edited
by hand. The reused ignored export helper changed only seven source/candidate
identity literals; its existing verification logic was retained.

The policy source had already passed all 163 native prepared-workflow tests.
The mobile correction passed 64 affected tests, build-mode types and the final
18-test accessibility/visual-contract check. The
[visual record](visuals.md) retains the fresh synthetic capture and review limits.
Post-publication native closure/classification and final-head hosted checks must
be read from their actual results; this candidate alone does not establish them.

### Protected promotion and historical source retention

The sealed Linux preflight requires the manifest's preparation commit to be an
ancestor of dispatched main. A squash of this development branch does not make
`8033e01c` an ancestor of its new main commit. Preserve the existing checks:

1. Publish and verify this checked family. Before the first squash, retain its
   reviewed source ancestry with an annotated, non-release `source-history/` tag
   at the published family checkpoint in the PR's ancestry; verify the remote
   peeled commit. Test/documentation follow-ups do not require moving that tag.
   The PR branch is
   automatically deleted on merge, and the preparation projection still reads
   historical commit `f6036cb93711f1358eda9c7a5804457665a864c9`, which is absent
   from current main ancestry. Main Verify fetches tags with full history; the
   inspected workflows have no tag or tag-creation deployment trigger.
2. After required PR checks pass, use the normal protected squash to main **M1**.
   Prepare and independently check actual clean M1 while its own CI runs.
3. Promote only that newly generated family through a second protected squash
   to **M2**. M1 is now an ancestor of M2 and remains the bundle source.
4. After M2 Verify succeeds, dispatch `sealed-realms-production.yml` on main
   with `source_commit=M2` and `operation=preflight`. Expected success is
   `preflight-inspected`. Do not deploy from interim M1 or rerun preparation
   solely because generated-only M2 changed HEAD.

This follows the existing bundle provenance and repository protections; it does
not create release approval. No protection or branch-deletion setting is changed.
The PR and existing external handoff own the actual tag, promotion and CI results
until the next substantive publication; avoid status-only commits that restart CI.

### Fresh credential-free public observations

At `2026-09-12T07:01:50.277Z`, the canonical bridge release-attestation route
returned HTTP 200 and source `308f901d91a1fb68d90f157a2ec164ed1acaf51d`, matching
reviewed B0. Its public report enabled notification delivery/transport/store,
public authentication and the expected-FID requirement. At
`2026-09-12T07:03:36.803Z`, the existing suspension probe confirmed request
POST/OPTIONS return 503 with `admission_requests_suspended`; status OPTIONS
returned 204. The public receipt digest is
`c3f636da3a6a930f7d9e73375060ed006ebe673af9e8892d1aa17ee8af108f9a`.
These observations used no credentials or player identity. They establish public
source/admission behavior, not private provider bytes, player-state preservation
or actual-owner 0.4 acceptance.

## Earlier composed provider family and guarded export — 2026-09-12

Native Linux preparation session `90120` and independent check `72208` both
exited zero for candidate
`release-workspace-326aab0c728dd07f02faa1969a94c7eb`. Both processes are terminal
and returned exactly matching identities:

| Identity | Verified value |
| --- | --- |
| Committed compiler input | `7cb573baab40e54f52ab2aeb26c56c9e8f1cf9f5` |
| Source tree | `00be1c0ea63b49dbf3aff4f2396c24c5d629b635` |
| Transaction | `a99ae63254fdf9361bfd214b9e018866` |
| Journal SHA-256 | `f62470669d8da89d1f214e2630a8935a18a650bfe89abb4e696016c2ef29ccd7` |
| Generated family SHA-256 | `6d75716c6ddc470714cbe6261f35be41a7af421b1ebd984b95a2d18dd1e26ea4` |
| Closure manifest SHA-256 | `9e19ed00a5ea0af1ebee9d373622c9c453c02bbbb257194855bcb5feb01e9f67` |
| Scanner manifest SHA-256 | `edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71` |

The check authenticated all 3,199 source/candidate files, 102 generated outputs,
3,097 preserved source files, 453 bundle inputs and seven recovery inputs.
The bundle inventory now includes the composed bridge provider and its actual
reachable dependencies. `finalReleasePrepared` remains false.

After both commands completed, the guarded export authenticated all 102 output
bodies and before/backup facts, compared the complete source/candidate trees and
verified the closure before copying the 17 changed generated bodies. It preserved
the 85 unchanged outputs, Windows HEAD/index and the published `132355e0`
CodeQL test correction. Changes comprise the four workflow bootstrap pins,
closure manifest, canary launcher count/declaration, four operation bundles,
two bundle manifests and four count-consumer tests. Generated bindings, activation
state and other source bytes were preserved. No output was hand-edited.

The corrected dispatcher/update fixtures in `7cb573ba` passed 196 native tests
with one intentional unsupported-runtime skip inside the supported namespace.
The test-only `132355e0` HTTP fixture URL-routing correction passed 43 tests and strict
TypeScript; its CodeQL analysis and security checks succeeded. The final
generated-source checkpoint still requires its own CI result. Ordinary notes
and this test-only correction do not alter the recorded compiler input; retain
the generated manifests' original source IDs.

Post-export Windows build-mode types and file-size policy passed. The desktop
handoff and visual-foundation contract suites also passed all eight tests under
pinned Node 22.22.3. The selected eight-suite native-boundary invocation exited
one: 62 passed, 12 skipped and 13 failed at native POSIX repository,
`/usr/bin/git`, owner-private mode or stdin boundaries. The
direct closure CLI also refused the Windows repository/platform. Neither result
is counted as a native pass, and production checks were not relaxed. After
publication and synchronization, those eight suites passed all 87 tests on the
clean native checkout. The installed closure and preparation classification also
passed, with Pages `sealed-launch-blocked`. The exported classification API
checked actual HEAD locally without inventing GitHub workflow variables or an
output descriptor.

The full prepared-workflow run (session `36364`, terminal) passed 156 tests and
failed three because the protected static policy retained stale API-token,
reviewed-B0 and PTR occurrence counts. The correction checks the separate
deployment, recovery-source and recovery-live credential uses, including that
source inspection receives no admin token. The baseline and six targeted
credential-relocation cases passed natively in session `34162`; 156 tests were
deselected. Strict TypeScript passed with explicit Node types. Independent policy
and Linux PTR-variable wiring reviews found no further defect. Both temporary native
overlay files were restored to the clean published checkpoint.

The complete updated suite passed all 163 native tests, with no skips, on clean
source `72aee27e8dc165994d3893bed9b9151330b8c9f2` in session `75371`.
Preparation then emitted its completed result for candidate
`release-workspace-3e7657772125faa459d4fa2d50e96fe0`, source tree
`82275d6bb3155d316e685236de11fdea1b5a5be2`, transaction
`290a5f36478428d169cd612878a58473`, journal
`139919009c0f2c61c4370bc563fb7f4dcd7ef662fff0e4fdb22d0240876436a1`, family
`f317fb3df155085972ed52231efa3a3f5a84743bf3a61ce8a0beede36e0b140b` and closure
`ba408e61a83ea13947159cf9d88126625abcf7bcf92950a5667bc2934c5ebe1b`.
The scanner identity and inventory sizes match the earlier family above.
The outer shell exited one on a trailing carriage return at line 14, after the
Node command returned under `set -e`; this is not a successful wrapper exit.
Session `75371` is terminal. No independent check or export is claimed for this
candidate: subsequent edits to `Keep04Screen.tsx` and `Keep04Screen.css` change
raw-hashed closure members. Retain it as source-bound history and prepare the
new committed UI input instead of independently rebuilding an obsolete family.
Future Linux command stdin must use LF-only line endings.
The successful `7cb573ba` candidate above certifies its original input only.
Preparation remains separate from final-head CI, protected promotion, genuine
provider execution, owner play, device measurements and live release acceptance.

## Independently reproduced recovery-source candidate — 2026-09-12

Preparation session `81502` and independent check `47903` both exited zero for
candidate `release-workspace-91f8c69cc3c77a9517e2fa7f8d27863b`, committed source
`6a74005e5f56997aca41fc40e782092aa6cc4b67` and tree
`9f6e38fe36c6db8b7ac9e6ff46b16cc627a7e7c3`. Both returned transaction
`a8c2cedab47fb47f4740bcb5b2fab06a`, journal
`8c557e06ce7791247690c7b80b9dd2703286ce93ad0498c105f1374c8e5e2c3b`, family
`7e280fecd07bc3ba257711351f188d672d4a0d658aa9335769b2c18e8078a2ab`, closure
`c3d51b634806f112a732fdb8abb459ea6fa7820b4a3353d9080a239f4679a289` and scanner
`edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71`.

The comparison authenticated 3,194 source/candidate files, 102 generated outputs,
3,092 preserved source files, 444 bundle inputs and seven recovery inputs.
`finalReleasePrepared` remains false. The candidate is retained as source-bound
evidence; it was not exported over the newer provider/workflow implementation.
The clean native checkout was synchronized to published `44b91b94` after the
check ended, then all 519 affected native tests passed without skips. At that
checkpoint the composed source still required preparation/check; the later
`7cb573ba` candidate above supplies that evidence. This earlier candidate
cannot certify later closure members.

## Independently reproduced source family — 2026-09-12

The native Linux x64 assembler prepared and independently rebuilt candidate
`release-workspace-2efb9231c19a88dd555a6a908533926b` from source
`27700d617d7085098b6f1ab8ee3d8cf9cdc40e23`, tree
`6ab0cda88d19d1276d9911de2450d33020d91649`. Both commands exited zero and
returned the same transaction `69181e9a996f65545788eb80aef99f39`, journal digest
`f0229980585bfcfc2c4bdd7203f60fcde3a02611251745d299d4eb33d171b5c5`, family
`0b55b6bdc11453b9d679e3065c6ee876ea56ff1e0bde01e00da678fe8e25df6e`, closure
`69c979a8c333a7c97c92a216367c12e08030c97832487d60c474f5a62883567c` and scanner
`edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71`.

The guarded export validated all 102 journal output bodies and retained source
backups, compared every local target against committed input through Git newline
filters, and copied only the eight changed generated bodies. Unchanged outputs
and concurrent source work stayed byte-identical. The changed family includes
the four workflow closure pins, closure manifest, recovery and sealed bundle
manifests, and G001 lane bundle. The latter adds the already-reviewed runtime
member to its protected inventory. No output was hand-edited or regenerated from
a fixture. `finalReleasePrepared` remains false. This establishes deterministic
source preparation only; provider delivery, recovery readback, owner play and
device acceptance remain open.

## Recorded runner alignment — 2026-09-11 (source checkpoint 64690fc)

The final synchronized branch head `64690fc425640b8ea33388caa5a9c89485ea7ea3`
was freshly prepared and independently checked on the owner-only Linux x64
runner. The converged candidate is
`release-workspace-f16740e2569ed2c63fb0378ad41ca912`, with source tree
`6d6db937b545b645d2faddd780fc114087ab1fb9`, family digest
`8c9575659038d0cd0e4c6fe8cb9db746af218f8ddad0bfba81b98630c06a40a6`, closure
manifest `a0b5892e45fd07f6e821afa826c02f9831dbd6e80b29f1541e4d3bbd2a7e90d0`,
102 generated outputs and 1,199 protected closure members. The assembler
returned `finalReleasePrepared: false`; this establishes source-bound
preparation/convergence, not deployment authorization.

The final isolated marker-safe native pass prepared and independently checked
candidate `release-workspace-342ea5448bfeb9bdf9dc51c7e31b67e4` from source
`aef672061e22cebeec66a7d22bda92bcb459d9d1` and source tree
`5def926b9ad4f4cd940742a67bb5335f6b21a1ef`. It produced family digest
`c632804d2990d8f18c7bbf5405775a245139ddddc8fa5a99c01a44a5b69e10df`, closure
manifest `0013fc94514cf623b829138d2fe2ed1564dc90498ce84e8cd516bd9aac7dd07b`,
and scanner manifest `edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71`.
The generated family is refrozen in `4bbe860b`. The native closure verifier
passed 1,195 members, the Greater Realm public-boundary verifier passed 3,181
tracked paths and 1,324 scanned entries, and the emitted activation bundle has
no private-marker bytes. `finalReleasePrepared` remains false by design.

The checked-in recovery Pages caller is aligned with the currently registered
Linux runner `warpkeep-wsl-production-01`: the job and its private directory
helper require `warpkeep` UID/GID 1000 and the separate
`/home/warpkeep/.warpkeep-recovery-v1` root at mode `0700`. The earlier UID-1001
`/home/runner` contract remains historical evidence and is not a current
operating prerequisite. The root is provisioned empty; no recovery claim,
credential or deployment authorization exists yet.

The earlier native Linux assembler prepared and independently checked the
source-bound candidate `release-workspace-328713ba2532b2dcef3815d7e9d7daa2`
from source `22a834e6d7d0106e5d6cfd535a90692bdfe17ff5`, source tree
`cec3750ef8a363b55b7f71cd55c0522e160be3a7`, transaction
`58393eda2cb2d4b7c7226f972f5bd1cc`, family digest
`c9cf06c09bdd7c52869ecb6b06d091bc912141fae8277c4ad3f963edf43850d8`, and
closure manifest digest
`445e5f7131ba85dbbe89edb4b28abff39a9d584f73118fbe3ec35d051908320a`.
The run checked 3,181 source/candidate files, 101 generated outputs, 444
compiled bundle inputs and 7 recovery inputs; it intentionally returned
`finalReleasePrepared: false`. The generated closure was copied into the
source and committed as `b8a6c5ab`; the native closure verifier now reports
1,195 members verified. This is preparation and closure evidence, not a
release grant, provider deployment or owner acceptance.

## Current assembled-artifact execution — 2026-09-09

The pinned WarpkeepRunner Ubuntu 24.04 guest executed the current native
materializer and child worker from source `206c03683c9039b513b878d7b0d3c6770eda2626`
and tree `ebc91c6cc7bf205de22e331d127b1f2f7b8ba5da`. The operation-bundle runtime
completed activation, G001, G002 and PTR lanes. The program-artifact path
completed frozen G001 and current G002, and the all-realms binding run completed
G001 current/compatibility, G002 and PTR. The compact all-realms receipt is
retained at `/home/warpkeep/warpkeep-all-realms-206c036.json` in the isolated
guest. This is local execution evidence only; it does not establish a protected
GitHub workflow, provider deployment, live owner admission or physical-device
acceptance.

## Historical execution inventory — September 6

Inspected checkout `c7f3c4d`; R12 was incomplete. These are the observed gaps at
that source, not a statement that every gap remains present in current code.

| Component | Observed unfinished behavior | Required completion evidence |
| --- | --- | --- |
| `.github/workflows/sealed-realms-production.yml:63` | Stale-closure step always emits `SEALED_REALMS_TASK_7_CLOSURE_UNAVAILABLE` and exits 1 before operations | Complete authenticated lane bundle/closure verification followed by genuine protected workflow execution |
| `scripts/sealed-realms-production-dispatch.mjs:188` | Activation-evidence operation returns `SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE` | Executable approved generator composition with exact source, receipt ownership and reconciliation checks |
| `scripts/sealed-realms-production-auth-bridge-state.mjs:2413` | `createSealedRealmsProductionActivationEvidenceGenerator` unconditionally fails; assert at 2422 and generator-consume at 2451 also fail | Canonical authenticated generator receipt and non-mutating reconciliation, valid private capability lifecycle, negative and recovery tests |
| `scripts/sealed-realms-production-workflow-evidence.mjs:7` | Every syntactically valid commit still throws workflow-evidence unavailable | Genuine workflow-attested Verify evidence bound to exact reviewed source; no caller-SHA self-attestation |
| Production runner/workflows | Sealed-realms operations and the prepared notification lane now have authenticated Linux x64 source wiring; B0 and Pages private lanes remain macOS/ARM64 legacy callers | Supported isolated execution with real workflow identity, pinned toolchains and production credential separation |

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

- `sealed-realms-production.yml` already selects the dedicated Linux x64 runner
  and checks its fixed owner, checkout and Node executable identity.
- `notification-bridge-b0.yml` and the historical
  `notification-bridge-prepared.yml` still bind fixed Darwin Node/pnpm paths
  and the Darwin installed-toolchain manifest.
- `notification-bridge-prepared-linux.yml` now binds the dedicated Linux x64
  runner, fixed Node and pnpm authorities, Linux installed-toolchain manifest,
  and the profile-aware deployment entrypoint. Its first authenticated run and
  recovery readback remain outstanding.
- `deploy-pages.yml` has Linux-aware disposable build setup, but its protected
  execution jobs still select macOS and consume that same Darwin manifest.
- `auth-bridge-notification-prepared-installed-toolchain.mjs` now carries
  separate Darwin/ARM64 and Linux/x64 profiles with exact workerd, esbuild and
  native TypeScript executable paths. The Linux manifest has been verified
  against the installed runner tree, but the durable notification callers still
  select the Darwin profile and require a separate Linux workflow wiring pass.

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

## 2026-09-08 connected V2 activation generation

The development changes following `5b97c5f` replace the missing generator and
receipt seam with a fixed V2 implementation. This section supersedes the earlier
claim that every activation generation route is unavailable. It does **not**
establish production activation readiness or authorize a populated candidate.

`scripts/generate-0.4.0-recovery-launch-activation.mjs` owns the recovery
generator. It consumes the exact owner-private descriptor through a synchronous
file descriptor, validates all twelve non-historical receipt records and their
G001/G002/PTR relationships, and checks the current bridge confirmation and realm
import cross-links. Bootstrap tree, blob and SHA-256 derive from immutable Git
objects at authenticated preparation source S. The fixed source reader requires
an exact clean S checkout, canonical origin and matching main references; both
canonical HTTPS origin forms, with and without `.git`, are accepted. It does not
require Mac-only Git configuration or borrow the legacy generated bootstrap pin.

The original sealed-launch generator retains V1 behavior and re-exports the V2
entry points. V1 verification remains supported; no historical G001 freeze
receipt is synthesized for recovery. The V2 public artifact verifier checks
canonical schema and derived commitments before publication.

The connected caller is `sealed-realms-production-activation-lane-entry.mjs`.
A configured lane reopens actual bridge evidence, claims its durable activation
continuation and invokes the fixed generator capability. The bridge state checks
the claim synchronously before asynchronous work, reauthenticates live bridge
facts, and revokes the private member in `finally`. There is no caller-selected
generation callback. A lane without the fixed capability returns `unavailable`
before reserving a claim.

### Durable result and uncertainty handling

The operation atomically publishes one owner-private family under
`runtime/sealed-realms-v1/public/`:

- `0.4.0-sealed-launch.json`, the verified public binding;
- `activation-generation-receipt.json`, its private completion receipt.

The workflow's existing exact-file upload includes only the binding. The receipt
must not be added to a directory upload. Its canonical profile is
`warpkeep-sealed-realms-activation-generation-receipt-v1`; fields bind source,
source authority digest, fixed operation, original GitHub run/attempt, activation
evidence/chain digests, descriptor/artifact SHA-256, artifact schema/profile,
generation time and generated outcome. The codec only validates data; a
caller-created JSON receipt does not establish operation authority.

If the operation result or terminal continuation write is lost, a later
independently attested run can reconcile only the matching complete family. The
reader revalidates the original run, receipt, fixed descriptor, reopened receipt
corpus, bridge chain and mathematically derived binding. Missing, partial, extra,
changed or retained-lock state is ambiguous and is not repaired or regenerated.
Reconciliation performs no provider probes or effect replay. G001 freshness is
validated at the matched generation timestamp; actual generation still uses
current-time evidence checks. This permits recovery after the original freshness
window without granting fresh authority to stale evidence.

### Verification performed

The focused Linux run passed **231 tests across eight suites**: activation
records, bridge state, continuation, private state, V1 generator, public artifact
verifier, generation receipt codec and fixed V2 source reader. A subsequent
targeted run passed all **eight connected generation cases**, including four new
rejections for a wrong original run, extra file, partial family and retained lock.
The existing successful generation, next-day lost-acknowledgment reconciliation,
changed artifact and changed descriptor cases also passed. Other tests were
filtered out in that second run; they were not disabled in source.

All twelve V1 generator tests now use fresh real bridge confirmation and durable
continuation machinery for each synchronous test body. The former `beforeAll`
fixture tried to retain an opaque member indefinitely through an unavailable
callback factory. The replacement requires the existing opaque test capability,
revokes the member before returning, and explicitly checks that it cannot be
read afterward. The V2 test-facts entry also requires that capability and rejects
it outside the test environment. Positive and negative V1 coverage was retained.

Linux verification used Node 22.22.3 and Vitest 4.1.9 in the independent
`5ddefb0` verification checkout with the exact activation-source/test overlay.
This is scoped verification, not a claim that the older checkout is the complete
current source. No shared dependency installation occurred. Windows passed the
26 pure codec/source-reader tests, application `tsc --noEmit` and scoped diff
checks. An earlier Windows filesystem-heavy run had timeout failures and stale
expected-status assertions; the complete Linux suites establish those affected
contracts on their supported platform.

### Remaining operating dependency

`sealed-realms-production-activation-workflow-entry.mjs` now composes the fixed
records/generator capability, but its **canonical recovery candidate reader is
explicitly unavailable**. Its four-field checked-in source projection remains
inert metadata. A prepared assembler directory is also source, not live recovery
facts or authorization. Neither is accepted as a populated recovery candidate.

The next implementation must derive the canonical candidate through fixed,
authenticated recovery-core, source, realm and private-record readers. That
producer must join independently authenticated recovery authorization/worker
facts to the actual source S and the exact G001/G002/PTR receipt corpus. The
workflow's deployment, binding, import and owner-receipt provider adapters are
also still explicit unavailable functions, and workflow evidence/runtime/runner
contracts remain separate operating work. Filling their values from caller JSON,
copying test fixtures or treating local preparation success as authorization
would bypass the missing work.

No provider mutation, runner registration, live authorization, production
generation or deployment was performed for this slice. Generated source pins and
compiled artifacts must still be derived and verified from the final reviewed
source family by the assembler; no pin was hand-edited here.

## Complete Linux source assembler — 2026-09-08

`scripts/local-release-assembler.mjs` now connects the fixed native producers,
complete generated consumer derivation, independent candidate comparison,
durable installation and recovery. The
[operating runbook](../../operations/0.4.0-local-release-preparation.md) describes
its `prepare`, `check` and `recover` commands and exact environment. Component
and diagnostic verification was followed by the full committed-source operating
run recorded below.

The fixed TypeScript scanner inventory was derived from exact archives matching
the committed auth-bridge lock's SHA-512 integrities. The manifest generator
reproduced its complete bytes. Scanning worked without repository dependencies;
repeated attestation checked the complete namespace and detected late metadata,
binary and namespace changes. Scanner and consumer suites passed **104 tests**.
The actual legacy generator test bootstrap pin is now included in the generated
consumer family. Planned files without real generated slots were not invented.

The operation graph suites passed **101 tests**, including disconnected or
missing inputs, unauthorized relative/package/synthetic edges, absent authority
modules, newly reachable source, raw-source hashing and repeat-build equality.
The final diagnostic in-memory compilation of every operation lane and recovery
succeeded. No compiler input intersected a generated closure/consumer or binding
output. Generic private record reads retain their existing limit; native bundle
loaders use their separate bounded artifact reader and exact size/digest checks.

The read-only whole-candidate verifier passed **34 native cases**, with one
unsupported-platform case skipped. It checks all source and candidate bytes,
complete generated namespaces, G001 preservation, unexpected files, aliases,
modes and late identity changes. Transaction recovery passed **21 native cases**
with one unsupported-host case skipped, including genuine held-lease use.

The assembler's real recovery CLI passed **14 native integration cases** using
actual Git source/candidate repositories and installer journals. Tests cover
completed/pending markers, existing-history restarts, no-marker interruption,
invalid/ambiguous metadata, held locks during archival and preserved user edits.
An actual child process was killed after history rename and before directory
sync; resumed recovery re-established durability. Its completion metadata was a
synthetic journal-bound fixture, not evidence of compilation or preparation.
CLI argument/import/error boundaries also passed **15 tests** on Windows.

Native checks used WSL Linux x64, UID 1000, the pinned Node 22.22.3 and Vitest
4.1.9. Fixtures copied exact current source overlays into independent directories;
shared dependency metadata remained unchanged and caches stayed local. The
scanner/graph diagnostic used the `5b97c5f` baseline plus current overlays.
Independent reviews corrected late scanner/candidate mutation checks and the
history-restart durability gap before these passing runs.

These component tests preceded the full operating run recorded below. They do
not establish a prepared final release, populated production evidence, runner
readiness or owner acceptance.

### Full prepare, independent check and recovery at `772d3a4`

The fixed CLI ran from a clean, separate native Linux checkout of
`772d3a44b2c4fff9c1626147bc447b85534005eb`, tree
`bc1758ad4c304da2413bd24461b99ce9e70be815`, under the pinned operating profile.
Both `prepare` and a subsequent independent `check` completed with exit 0 and
the same journal/family/closure/scanner commitments. The check compiled expected
outputs again from fresh captured source and compared the entire retained
candidate. No dependency directory was installed into the candidate.

| Verified record | SHA-256 |
| --- | --- |
| Generated family | `972f113f82dfcb36af6f3846f1afbd46d07589c092c3a7278aa3d5d7ba8f21f5` |
| Native journal | `d91f1cbe3b3bfe214db78414e4acc9e4400f48fd193654e9ea2858a08a2b210a` |
| Prepared source closure | `aca6f27059ccd937bbb435feaf27bd817ce5f746d05e86208119e67c7dad55e8` |
| Installed scanner manifest | `edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71` |

The result checked 2,977 source files and 3,001 candidate files, with 101 exact
generated outputs. These are observed verifier results, not manually maintained
inventory policy. The result explicitly retained `finalReleasePrepared:false`.

A separate QA clone of this exact source received only the journal-verified
generated outputs. Four closure/activation suites passed; the remaining PTR
suite found stale explicit browser and binding members. Updating the real member
lists passed all eight PTR cases and was committed at `f558bd5`. The test file is
outside the compiled inputs and prepared closure. All generated hashes and the
read-only dependency metadata stayed unchanged during QA and patch export.

After retaining that export and the newer source's independent preparation,
the real `recover` CLI restored the earlier candidate's complete generated
transaction and returned `rolled-back`, exit 0. The active completion marker was
absent and its history was retained. A separate full-byte verification against
the original Git source matched all 2,977 restored files, including the original
binding namespaces; Git reported no source changes. This proves local candidate
recovery for this actual family, not live database recovery or preservation of
post-deployment player writes. The old candidate is now the restored baseline;
its archived completion is not active preparation authority.

## Recovery receipt projection — 2026-09-08

The V2 record reader now authenticates its complete private receipt corpus before
constructing a recovery candidate. It returns frozen scalar facts to the existing
candidate callback, compares every overlapping candidate field, then reopens the
corpus to reject replacement during construction. Source and authority digests
must match the authenticated preparation source. Realm identities, module and
atlas sources, imports, sealed state and owner proof must agree across records.
V1 behavior is preserved. Historical inspection does not grant fresh generation
authority, and a projection alone supplies neither authorization nor missing
worker/source facts.

The connected generator, records, bridge state and continuation suites passed
**191 tests on Linux without skips**. The fixture used the retained independent
`5ddefb0` checkout with the exact current activation overlay; unchanged runtime
companions were compared to development `772d3a4`. Application TypeScript and
scoped diff checks also passed. A Windows filesystem-heavy diagnostic had one
timeout; the supported Linux run completed all selected cases.

The records runtime is compiled into the activation, G002 and PTR operation
bundles, and its runtime/declaration bytes belong to the prepared source closure.
The source family therefore must be regenerated after this change is committed.
The earlier native candidate built from `772d3a4` cannot attest these later bytes.
Do not carry forward its generated hashes or relabel its source commit.

### Next operating producer

The G001 policy observation lane already authenticates its frozen child envelope,
source/bootstrap coordinates, cleanup result and exact policy observation, but
its persistence adapter remains unavailable. Connect that authenticated result
to the existing private record writer for the fixed policy-observation member.
Lost-acknowledgment adoption must reopen and validate the matching durable
record; lifecycle completion alone cannot replace missing evidence or justify
replaying an effect. The workflow Verify reader, live transport adapters,
remaining realm receipt captures and canonical recovery inputs remain separate
unfinished callers.

## Complete generated source at `f558bd5` — 2026-09-08

The operating assembler was repeated from the committed receipt-projection and
PTR-test source `f558bd5aeb306e783e674eed9bf02df2dbeeeae6`, tree
`f746972e05e89951f62493682c16c3cd06a0940d`. Native `prepare` and the subsequent
independent operating `check` both completed with exit 0. The check rebuilt from
fresh captured source and verified the complete retained candidate. Both runs
returned exactly the same source, tree, transaction, journal, family, closure,
scanner and inventory results; neither conferred final release authorization.

| Verified preparation record | SHA-256 |
| --- | --- |
| Complete generated family | `f00fe8de0859f6c6af591037ce65f9a25db4d4d5882e5843a42075d25d3286f5` |
| Native journal | `27977449f89129683602e0daf952992a4847b7a27a747faddf295083cc4a9275` |
| Prepared source closure | `755b6467e34aaef27e0f2d57f89960b54dc398438edacd93f059bb02ad60fc25` |
| Installed scanner manifest | `edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71` |

The result verified 2,977 source files, 3,001 candidate files and 101 generated
outputs. The output set contains complete G002/PTR bindings, the operation and
recovery bundles and manifests, and their derived closure/consumer/source pins.
G001 source and bindings remain unchanged. These values are measured outputs,
not new fixed policy counts, and the candidate retains `finalReleasePrepared:false`.

An independent clone of this exact commit plus only the journal-verified outputs
passed **234 tests across six complete suites**: B0 closure, Greater Realm deploy
boundary, PTR closure, sealed-launch verifier, V1 activation generator and
activation records. Application and Vite-config TypeScript checks both passed
with `--noEmit`, using the pinned Linux TypeScript 7.0.2 and Node 22.22.3. No
fixture source overlay was present. The source/test bytes, generated family and
read-only dependency metadata matched before and after. Caches and build-info
stayed in the QA fixture; the actual candidate remained dependency-free.

The exported patch contains only the 41 changed paths within the 101 verified
outputs. It passed application checks against the primary checkout, and all 101
staged Git blobs matched the journal's exact bytes, sizes and modes. Workflow
changes are generated closure commitments; job permissions and operating phases
are unchanged. Manifests retain `f558bd5` as compiler input instead of claiming the
later containing commit supplied those bytes.

This establishes source preparation and scoped regression verification. It does
not establish live provider receipts, signer authorization, complete current CI,
owner play, physical-device/performance acceptance or deployment. The canonical
activation/provider adapters and remaining Linux operating callers still require
implementation and actual execution.

### Generated public constants and secret scanning

The first outgoing scan identified compiled copies of two already reviewed
public values: the `g002AdmissionMutationsEnabled` schema field and the public
recovery verification-key thumbprint. Their existing `generic-api-key` exceptions
now include only the exact activation/G002/PTR bundle paths, with the same
anchored values and combined path/value condition. Generated bytes were unchanged.
The pinned scanner's real regression passed 20 permitted-value and 29 required
negative findings, including changed values in all three bundles and unchanged
wrong-path checks. The complete scanner regression suite passed six cases in a
fresh Linux clone of `ff813f9` with only the three scanner files overlaid.
Independent review found no broad suppression; the outgoing scan then passed.

## Source authority, durable policy capture and Verify readback — 2026-09-08

The reviewed source integration follows `1277cc8`. Preparation metadata remains
strictly null; actual Git identity and exact protected Verify evidence establish
its source. Native V2 activation is now authenticated through the canonical full
binding, actual sole parent/tree, exact three regular-file delta and version-only
package transition. The four read-only operations available after activation are
unchanged. Every workflow Git reader ignores replacement objects.

The actual Verify CLI exposed an incorrect G001 history projection. The frozen
materializer extracts `2ae5198:spacetimedb/**`, and the immutable artifact's root
manifest is `spacetimedb/package.json`. Repository-root browser packages do not
own that frozen build. Only those two root package files were removed from the
G001 projection; their exact structures remain independently checked. Module
source, locks, manifests, workspace and frozen operators retain current snapshot
equality, with ancestry and exact activation delta checks. A reverted historical
edit no longer fails an otherwise identical final snapshot. The frozen
materializer, its toolchain and pinned artifact identities are unchanged.

G001 policy capture now writes the authenticated frozen child result through the
existing fixed private writer and reopens it before completion. Lost-acknowledgment
adoption binds the retained terminal record, original cleanup commitments,
source/bootstrap/command/run and durable wrapper. Missing or altered evidence
fails before replay. The terminal reader is bounded, owner-checked and read-only;
it does not create a caller-selected path or generalized writer.

The four actual workflow factories now load fixed read-only GitHub evidence into
an opaque, expiring scope, refresh it before dispatch reauthentication and revoke
it on completion or failure. The latest authenticated Verify run for the exact
push/main source must succeed; an older green run cannot mask a newer failure or
pending run. Current run/attempt and discovery are reopened to detect races.
Repository/owner/workflow/source identities, bounded strict JSON, fixed origin,
redirect rejection and timeouts are enforced. Tests use synthetic HTTP responses;
no production authorization or live token readback is claimed by those tests.

Related CI regressions preserve the real containment and effect assertions:
promise rejection handlers are attached before process polling, a byte-identical
Node executable at the wrong path exercises the host rejection, and supported
Linux scanner races remain enabled. Unsupported hosts test their explicit
rejection. The obsolete early-activation error expectation was corrected.

Independent reviews found no blocking issue in the source-authority, policy,
Verify transport or CI patches. A fresh native Linux clone with the complete
reviewed source passed **731 tests across 20 suites**, with two expected platform
skips and no unhandled errors. App and Vite-config noEmit checks passed. The
actual source-pin generator ran only for diagnostic verifier tests; its outputs
were restored and byte-checked before exporting source. These tests establish
connected local contracts, not a new prepared family or deployed release.

The previously published generated family still identifies `f558bd5`. This new
compiled source requires fresh complete native prepare/check and generated-output
integration. The sealed production workflow still contains its explicit closure
fence, Darwin-specific runtime and missing token mapping. Remaining private/live
provider adapters, canonical recovery facts, data-preserving existing-database
updates, signer authorization and actual owner acceptance remain unfinished.

## Fixed recovery candidate and historical inspection — 2026-09-08

The source integration following `b4df426` connects the actual activation workflow
callback to `sealed-realms-production-recovery-candidate.mjs`. The reader derives
source/tree/bootstrap facts from fixed immutable Git reads, reopens the scoped
private corpus and checks canonical policy fields. It does not accept a generic
provider bag or substitute plausible values for missing deployment evidence.
Recovery request/epoch, Worker version/source/configuration, source-closure,
realm program identities, bridge source, suspension digest and approval records
still require genuine producer evidence. Incomplete inputs cannot emit a descriptor.

Independent review found and resolved a historical-continuation defect: the
outer reconciliation used completed receipt time while the newly connected
reader reopened records at the current clock. The revised path first authenticates
the fixed completed receipt, descriptor and public V2 artifact, including source,
authority, byte commitments, exact creation time and all private receipt bodies.
Only that callback receives an opaque, records-bound historical read context.
It expires after callback use and rechecks retained evidence afterward. Direct
and fresh-generation reads still use current time; caller timestamps, reused or
cross-record contexts and replaced completion/corpus data reject. Final bridge,
workflow-run and evidence-chain reconciliation remains mandatory.

The full revised eight-path candidate patch passed **156 native Linux tests**
across activation records, workflow evidence and V2 runtime suites, with app
noEmit exit 0. Regressions invoke the actual fixed reader after freshness expiry
and exercise replacement before/after derivation and independently valid but
different corpus data. Independent review found no remaining blocker within this
scope. The initial candidate export without historical support was superseded;
it must not be applied alongside the revised patch. This is local evidence,
not live provider provenance or activation approval.

## Whole-source inventory and current CI — 2026-09-08

The tracked source inventory exceeded the notification verifier's former file
and aggregate ceilings after real generated bundles grew. Its inventory now
permits at most 1 MiB per file and 64 MiB aggregate. The separate presentation
parser limit remains 512 KiB. Git inventory/object/size/path, UTF-8, AST, immutable
source and authorization checks remain in place. Tests read the real committed
tree and reject a file one byte over its ceiling and an aggregate over its limit.
The closure fixture now removes the generated members from its modeled baseline
before adding them once; duplicate production members still reject and owned
buffers are cleared.

All 65 cases across the four affected Linux suites were exercised successfully:
64 passed in the clean committed-source run, and its one test-local timeout was
corrected and rerun successfully. Only scoped test budgets changed for measured
whole-tree Git/TypeScript traversal; no application, network or global test timeout
changed. App noEmit passed. The reviewed integration also passed app and
Vite-config noEmit together with the player-feedback changes.

At exact `b4df426`, [Verify 34177573424](https://github.com/ael-dev3/Warpkeep/actions/runs/34177573424)
reported a failed Linux job: 9,121 passed, 74 failed and 121 skipped. Of those
failures, 62 stop at stale generated source pins or inventories, 11 concern the
inventory/fixture defects above, and one requires replacing an obsolete literal
classifier-source expectation with behavior. Do not relabel that run successful
from focused local passes. Its database job was still running when inspected.
CodeQL's analysis workflow completed, but its separate
[security check](https://github.com/ael-dev3/Warpkeep/runs/101910854549) reported
nine high and five medium findings in test fixtures/helpers. The reviewed
ten-file correction preserves deliberate one-key and mixed-line-ending corruption
through explicit splices, uses direct Windows tool argument arrays, and passes
fixture values as JSON data and module URLs as arguments to fixed child code.
No negative assertion, alert or check was removed, dismissed or suppressed.
The affected native suites passed 567 root and 333 recovery-service tests;
application and service noEmit checks passed. A Windows path diagnostic retained
the prior filesystem mode behavior with spaces, an apostrophe and shell
metacharacters. Actual CodeQL clearance still requires a new GitHub analysis.
Fresh source-family derivation and passing checks on the selected final source
remain required.

## Rebuilt source family from b4df426 — 2026-09-08

The actual native assembler completed prepare and a separate independent check
from source `b4df4263b1f640c264b5c2cf1d3a81a1c1e2bebd`, tree
`72f0b59486e78b6d60cd486b00590a9c83ca8c35`. Both exited 0 and returned identical
candidate, journal, family, closure and scanner commitments. The generated-only
commit is `e789815012225bbe9ea30f14f3eaefdaac4bd339`.

| Derived commitment | SHA-256 |
| --- | --- |
| Journal | `c6b4cca8caa837254cd68a7268cb3d7ff153cd697f07dd0ed901c3795d23e31b` |
| Source family | `4431712afbc064a031829483a457f9445ab0579542b52c6580354fa029d5f8e3` |
| Closure manifest | `45cd8446ea57f5c8b63b3e9b2f5accba551727cf4228bd7121672968cc2325ff` |
| Exact generated patch | `46eb4ca073e94b2baefc77aab1c500c13ec7e01d1eeab8a038a629b6daf6bef7` |

The journal admitted 101 outputs; only 18 differed from committed input. All
3,008 candidate files and 2,907 preserved source files were checked, alongside
the actual bundle/recovery input sets. A fresh native QA checkout received only
the journal-approved outputs. Ten complete release suites passed **325 tests**
with no skips, and app/config noEmit passed. Before/after source and generated
snapshots matched. Integration verified every output's canonical Git bytes
against its journal size/hash and staged only the exact changed allowlist.

A separate copied test overlay replaced the obsolete Pages classifier source
substring check with execution of the actual classifier over its complete fixed
source map. Its eight tests passed, including the preparation-blocked result and
existing workflow boundaries. That test belongs to the next source checkpoint;
it was excluded from the generated export. The newer candidate reader, inventory
fixes, security helpers and keep feedback likewise do not belong to this prepared
input. Their next combined source needs fresh derivation. The result remains
`finalReleasePrepared:false`; no production authorization or deployment occurred.

## G001 compiled public-value scanner scope — 2026-09-08

The independently rebuilt G001 bundle contains the same public boolean schema
key and recovery verification-key thumbprint already allowed in the other fixed
lane bundles. The existing two scanner exceptions now include only its exact
anchored path, retaining the exact values, rule scope and AND condition. Generated
bytes and scanner rules remain unchanged. Real Gitleaks 8.30.1 regression passed
22 accepted cases and all 33 required negative findings, including altered values
and unchanged values at a lookalike path. The six native scanner unit tests passed.
The actual outgoing commit range must also pass before publication.

## Published checkpoint and supported Linux preflight — 2026-09-08

Checkpoint `a4ec99f8202d34ef067c28461ea7200066b943f4` published six reviewed
commits after the actual outgoing first-parent/merge-aware Gitleaks scan passed.
Fetch after non-forced publication verified local/GitHub equality. The maintained
main, profile, assets, water and editor repository refs were also fetched and
equal. Its [CodeQL analysis](https://github.com/ael-dev3/Warpkeep/actions/runs/34180632901)
passed, and the separate [CodeQL security check](https://github.com/ael-dev3/Warpkeep/runs/101919500304)
passed with zero annotations. This clears the earlier 14 reported annotations
on this source. Three service/native Verify jobs passed; Linux and database jobs
were still active when inspected. The earlier b4df database build/binding step
passed before the next push cancelled its later recovery stage; that cancelled
job is not a full module-lane pass.

The next source connects a dedicated Linux preflight executable to the sealed
workflow. It preserves protected main/manual `operate` identity, read-only
permissions, environment and shared non-cancelling production lock. Unsupported
operations refuse before checkout. The shell checks actual account, fixed Git,
Node bytes and committed bootstrap files, then retains the token only in the
environment. The caller authenticates actual prepared ancestry, G001 source graph,
bundle/declaration and imported bytes, and invokes the genuine bundled runtime
factory and operation with source/runtime rechecks around both awaits. It accepts
no provider bag, digest/path/factory override or mutation operation.

Independent caller review found no blocker within this preflight scope. All 31
native caller tests passed, with no skips, and application types passed. The tests
use the completed b4df generated bundle in an independent source snapshot,
real UID/GID 1001 inside a private mount namespace and fixed synthetic GET-only
GitHub responses. They exercise the actual factory/run plus runtime, graph,
import replacement, workflow and private-root rejection. The actual retained
journal authenticated all 101 before/after output bytes, with exactly 18 changes;
copied dependencies had no symlink outside their respective isolated roots.
Normal unprivileged CI skips the 25 privileged namespace cases; its ordinary
caller suite does not repeat this full native proof. The workflow's 67 native
tests passed, including real shell syntax/guards, ignored startup injection,
source/token transport and every unsupported operation; application types passed.
The workflow changes none of the static verifier's selected source bytes. An exact
a4ec source diagnostic also passed the actual preparation-mode static verifier.
These are local composition results, not live GitHub job or provider evidence.

The registered Linux runner remained online/idle with its systemd service active
as UID/GID 1001. Its separate sealed-operation roots were initially absent and
then created as empty owner-only directories with checked no-follow descriptors,
exact ownership/modes, no ACL and fsync. No credentials, keys, receipts or authority
records were created. The fixed caller continues to require existing roots rather
than provisioning them. The account remains noninteractive. A successful future
`preflight-inspected` result establishes operating prerequisite inspection only;
real provider adapters, signer authorization, owner acceptance and live release
proof remain unfinished. The newly combined source requires fresh preparation
and independent check; b4df's completed family is not relabelled as that result.

The same next checkpoint fixes the connected keep-to-atlas Worker handoff.
“Find resources for Worker 3” previously selected Worker 1 in the atlas. An actual
surface-host regression failed on that mismatch before the fix at both tested
DOM widths. The source now carries a bounded ordinal as presentation state while
retaining fresh target review, authoritative idle checks and capability-scope
reset. All 41 affected surface-host/keep tests passed, including a selected Worker
becoming busy, invalid or busy chooser values, and target/duration reset on scope
replacement. Integrated application and Vite-config types passed with the Linux
caller/workflow changes. No server economy, automatic dispatch or live owner
evidence was introduced.


## Current-source preparation and existing-target protocol — 2026-09-08

Native `prepare` and the independent rebuilding `check` both exited 0 for
`1e90b2e4a67208c5ea70fd8589ec56ddacee2226`, source tree
`ee1ce7b49a8b5f49205c3a82049d8c41fdc6287f`. Their complete returned results agree.
Journal SHA-256 is
`1a362293715d58dc863f81bf8017a961ba976faa06826e6cc4f21a063f6be8b4`;
generated-family SHA-256 is
`f6b6a8b425b449d9dd20c1115274cec5abf8e1d5a0ca1e91d82385e04af5b95b`.
The closure manifest is
`74db0de3fdc3d46943e579210b2bbedf1fd75b3b068146e0364250d7888cdb8d`.
The actual logs and exit records were independently re-read and hashed after
completion. These results remain `finalReleasePrepared:false`; generated-output
QA, publication and real release authority are separate outcomes.

During the check, new Windows-to-WSL command launches stalled and then returned
`Wsl/Service/E_UNEXPECTED`. Bounded read-only UNC observations confirmed the
actual Linux check and successive compiler children continued. The native check
completed successfully at 03:21 UTC. Explicit Linux-directory/direct-exec command
access subsequently recovered without restarting WSL or interrupting the guest.
The failed control calls are neither failed compiler tests nor positive evidence.
Do not restart an operation from an old process note without checking its actual
log, exit record and process identity.

Separately, twelve native provider-protocol assertions passed at 03:24 UTC against
official SpacetimeDB 2.6.1, pinned Node 22.22.3 and SDK 2.6.1. The test used its own
private Linux network namespace, local signing keys, synthetic owner and in-memory
loopback server. Its compiled old/new table boundary matched; all observed program
hashes were checked against exact compiled bytes, and preserved rows were compared
in full. The server stopped and its local keys were removed.

The tested harness SHA-256 is
`5b806dcc0d51e54744798883f0f0c62544190db73c0a1d6d432e3f40bb939bdb`;
result SHA-256 is
`c3a3a0fac696d259dd75b05e4e0080945083b66c8df3e996544cd1492f45ad10`.
Retained native and Windows harness/result/module inventories match byte for byte.
The fixture's copied repository helpers match source `a4ec99f`; its dependency
copies contain no escaping symlinks. Earlier staging and wire-decoding failures
were retained separately and do not count as successful assertions.

The experiment confirms that `Compatible` ignores the migration token. The
token-checking policy rejects wrong target, changed candidate, stale predecessor
and missing token without changing the tested state. An approved additive update
and compatible forward replacement preserve exact pre-update, post-update and
after-plan writes. ABA restores the original token's validity. The token is not
an epoch, authorization credential or postflight receipt. This agrees with the
[official migration-policy source](https://github.com/clockworklabs/SpacetimeDB/blob/v2.6.1/crates/schema/src/auto_migrate.rs#L79).

The diagnostic's flag classifier is not a production additive-plan validator.
This in-memory toy experiment does not prove Warpkeep's real migration, private
population, schedules, application admission, crash durability, uncertain PUT
reconciliation or recovery artifact. No live database or persistence source was
changed. Read the [infrastructure boundary](../../agent-notes/0.4.0/release-and-infrastructure.md)
for the real schema observations and denied current-program queries.

## Integrated Linux preflight family and compiled schema — 2026-09-08

Generated-only commit `de10f83103c45ba90f8375c922ab96b30779a864` has the exact
prepared input `1e90b2e` as its parent. Its tree is
`264d1e8725d1e618e17f92232bb18122e7359dda`. Every journal-approved output was
reopened and checked against its size/hash before staging only the nine changed
paths. The exact export SHA-256 is
`3b7de8a375e918c0ba8d0ecc410b4d3d629aa56d8dfe73b8f001cf362fd568f7`.

The requested release/Worker coverage passed 499 unique tests across explicitly
separate Git topologies, with 25 privileged namespace cases skipped under normal
UID1000. Nineteen suites passed with the generated overlay; LiveReceipt correctly
rejected that dirty checkout, then passed all 20 cases in a clean synthetic child
with identical tracked source/output bytes. The synthetic commit was not exported
or treated as the preparation input. Both app and Vite-config type checks passed.
An extra unchanged PreparedWorkflow baseline reproduced the 13 CI failures;
it is not included in the passing coverage claim. No source guard was relaxed.

Separately, G002 and PTR were freshly compiled from exact `1e90b2e` through the
actual locked Linux build callbacks. Both real noEmit/build operations passed.
The retained G002 module SHA-256 is
`0037a0979a460aea8607a36fccd649d4311046925faeb3d8186276ac0a6ccbd3`;
PTR is `c5c2cc46d428e85c87352c341d1a5235a69336a960f566b0a91a484deba3ec4e`.
Each had one successful compile; this diagnostic is not a separate two-build
reproducibility result. Temporary source-mode staging failures were corrected
only inside scratch fixtures before compilation, with fixed helper checks intact.

Their fresh RawModuleDef descriptions on an owned in-memory loopback instance
preserve every existing canonical table object and reachable typespace from the
02:50 UTC provider captures. G002's old boundary SHA-256 is
`7e568010e2c2babed106e577a64ed7f866a92258337bd2aae4fac93aee8c7d21`;
PTR's is `2b0463765c1c076e6c987774df65f6f8a45554c5b5d7ae16604d1c05cb2cf922`.
The comparison keeps numeric type references and complete nested declarations.
All added gameplay table descriptors match their declared private access,
primary/index/unique keys and schedule sequence. The scheduler resolves to the
exact `run_gameplay_04_schedule_v_1` reducer and row argument. Independent
read-only replay passed both complete object comparisons and every new descriptor.

This diagnostic used ordinary loopback, not a private network namespace; no
player rows were seeded or read. Its server and temporary credentials were
removed and cleanup independently checked. It closes compiled table-schema
compatibility only. Actual current provider program, populated migration,
post-update writes/recovery, procedure behavior, timers and owner play remain
unverified. The native protocol experiment above has separate synthetic scope.
Neither result is a deployed-state or final-release claim.

## Exact 1e90b2e GitHub CI result — 2026-09-08

[Verify 34181594471](https://github.com/ael-dev3/Warpkeep/actions/runs/34181594471)
completed with failure. Auth bridge, native contract, release recovery and the
entire database job passed. The latter includes its real module/generated-binding
verification, synthetic exporter/server compatibility, connected relocation and
rollback, populated gathering rehearsal and dependency audit. It completed at
03:47 UTC; earlier running-state notes are superseded for this exact source.

Linux's main batch passed 9,266 tests across 596 files, with 146 tests and two
files skipped. Its later dedicated PreparedWorkflow suite passed 105 cases and
failed 13; the accompanying canary closure suite passed. The subsequent Linux
static checks, type checks, build and audit did not run. Both the CodeQL analysis
workflow and separate security check passed for this source. A new source repair
must earn its own required checks; these results cannot be relabelled as that run.

## Prepared recovery workflow policy repair — 2026-09-08

Source-only commit `1f91470e879550a4c5610f3ac6d97b5f2fad41fd` changes the static policy verifier and its affected
suite. The published YAML already selected deployment or explicit read-only
recovery; its old verifier still required deployment invocation/credentials in
both steps and an obsolete final condition. That drift originated with the
earlier workflow change `326cc9c`. The repaired verifier checks each actual
operation, recovery's smaller credential relay and verified result, and the
complete terminal outcome step. Credential/scrub uses are paired to their real
functions so preserved global string totals cannot conceal a missing use.

The three source-owner workflow comparison hashes were mechanically derived from
unchanged committed `1e90b2e` YAML and independently reviewed. Its four generated
bootstrap slots retain their existing canonical projection. Exact comparison
with `de10f83` confirms unchanged operation behavior after that projection; no
workflow, generated output, admission gate, authority, timeout or credential
boundary was widened. Declaration tests now compare exact executable/declaration
pairs and explicit exceptions; the existing generated member-count slot remains
owned by its generator. Negative closure cases establish a valid baseline and
verify actual set changes before asserting the current exact rejection.

All 159 native cases passed in the final complete run: the 118 existing cases and
41 new cases, including execution of the real configured final shell and targeted
recovery/outcome/credential mutations. Both app and Vite-config noEmit checks
passed. Tests ran in an owned Linux fixture with a copied pinned Node executable
matching its actual test UID; this is not operating-runner authority. Earlier
fixture UID/indentation errors and superseded runs were retained, then corrected
without weakening source checks. The final exact two-path export SHA-256 is
`a8cbf046c147f4dbfc0881827780b2d9c27de084803433cdbecc478a60fb1e2d`.
This source repair needs its own generated family and required CI result.

## Existing-program planning and recovery direction — 2026-09-08

At 04:02 UTC, a fixed owner-authenticated diagnostic called the documented
`pre_publish` endpoint once for each existing G002/PTR immutable identity with
the retained exact `1e90b2e` compiled candidate. Its complete metadata and schema
captures matched the pinned earlier baseline before and after planning. Both
plans contained the intended private gameplay tables and schedule, with
client-breaking and major-upgrade flags false. No publication, SQL or player-row
request was made. Schema/planning access can start a dormant host and normal
scheduling; this is not a claim of zero application or infrastructure effects.

For each response, the returned migration token matched the independently
calculated Keccak256 of immutable identity, recorded initial-program hash and
candidate-program hash in the provider's documented hexadecimal encoding.
Independent retained readbacks recomputed both results from the exact candidate
bytes. Under the authenticated provider semantics and collision-resistance
assumption, this supports the recorded initial hash as the loaded old program at
the planning snapshot. It does not prove continuous currentness after the
response, an update epoch, original source provenance, retained executable bytes,
row preservation or completed publication. A program can change and change back,
restoring the same token; that cannot establish no effect after an uncertain PUT.

The diagnostic used the configured CLI's normal credential export through bounded
private pipes. Credentials and identity-bearing response headers were not retained
or printed. Fixed transport, target/candidate hashes, duplicate-key and response
validation, token decoding, owner assertions and marker-before-request behavior
were reviewed before the one-shot operation. No retries or redirects were allowed.
The retained diagnostic SHA-256 is
`1e7b4d5ff9a88ae4177776bc154815b09451b71dd565348fff5f7dad61bd6a50`;
sanitized result SHA-256 is
`9caa0de3a9a1b355a4b11640d5887d56d4f93cba9d286381a834d310cfdcdd6e`.
This is local diagnostic evidence, not an authenticated production-producer
receipt, current-source observation, consumed permit or release authority.

No supported deployed-byte download route was found in the inspected exact
SpacetimeDB 2.6.1 public API/CLI/dashboard sources. The system-table SQL route
remains behind the already-denied application connection lifecycle; it was not
retried. A bounded local artifact search found no matching original bundle.
One isolated build per realm from historical module source `799814b5` completed
but did not match the recorded publication SHA-256. The original Windows build
used parent dependency resolution and path-sensitive inline source maps; the
Linux reconstruction did not reproduce that environment. These are reconstructed
historical-source fixtures, not recovered original executables.

The missing original executable limits an exact deployed-artifact rehearsal.
It is **not an explicit general recovery prerequisite** in `AGENTS.md` or R16.
The requirement is isolated, schema-compatible recovery that preserves existing
and subsequent writes. A useful forward-recovery design can meet that requirement
without restoring a pre-gameplay executable or snapshot. Actual-module populated
migration and forward-recovery testing remains unfinished; label a historical
schema-equivalent fixture honestly and retain fresh authenticated old-program
binding at the actual update boundary.

The connected fresh-create publishers and V1 receipts must retain their present
meaning. Existing updates need explicit target/predecessor/candidate observation,
preservation evidence and uncertain-outcome reconciliation. They cannot pass by
removing the existing-target refusal, asserting `freshDatabase:true`, rerunning
owner/import creation or rewriting historical receipts to a new module hash.

## Verified recovery-policy source family — 2026-09-08

Full native preparation and an independent rebuilding check both passed for
`b306eedd8c4fe8f32661d89abc32f04938a5aa8e`, tree
`92a5abb1fdf4d38a916611debfe8ff745d574e5f`. Their complete result commitments agree.
Journal SHA-256 is `b64a5ae6875b3fa12fc2a2652dce146822ae5b3441d71667ee25dae350464edb`;
family SHA-256 is `e7d4f39733bcb9e67ce22316a3250e1c59b99a8636e9815e79098c6c6b312f3e`.
The operating result explicitly retains `finalReleasePrepared:false`.

Clean candidate QA passed 499 cases across twenty suites with 25 privileged
namespace skips, followed by all 159 prepared-workflow cases. App and configuration
noEmit checks passed. The source-sensitive tests used an explicitly synthetic
clean Git child; export retained the original b306 source HEAD. Every tracked
source/test body and all journal-approved outputs matched before and after QA.
Dependencies were copied into owned exact-lock fixtures; no shared install,
source overlay or validation relaxation was used.

Root reopened all journal outputs and compared their actual bytes/hashes and
changed Git blobs before integrating only the six changed generated files at
`ba12a7ff9539a5fd460251a73662a51f28935012`. Its tree matches the verified clean QA tree. Exact patch
SHA-256: `61ddf5fc886e8f995c24e80bda62e1198cafa8fb47671ac3244076cb4f798727`.
The selected input was locally committed when this preparation began; older
scratch filenames containing “published” do not prove it had already been pushed.

Panel fix `0d98599c1f26ecc74c4182fc587cd21278c3af63` is later source work with separate scoped tests. Its
affected source manifest/workflow references are derived incrementally through
their existing owner; this does not relabel the combined source as fully prepared.
See [gameplay evidence](gameplay.md) and the actual publication record. Required
CI, populated recovery, real owner play and live deployment remain separate.

## Navigation source closure — 2026-09-08

From exact `0d98599c1f26ecc74c4182fc587cd21278c3af63`, the existing closure owner
derived the complete consumer family in an owned Linux checkout. An independent
clone passed the real installed-closure verifier and reproduced all fifteen
outputs byte for byte. Every tracked source body, accepted preparation output,
reviewed UI input and scanner/config identity was checked before and after.
The original b306 candidate and journal were not opened by this caller.

Generated-only commit `cd6d89b5455a658a724601c3f7cc86f33f36cc27` installs the four
changed outputs: two runtime-file hashes in the closure manifest and that
manifest's three workflow pins. There are no inventory membership, count,
compiler-input or compiled-bundle changes. Closure manifest SHA-256 is
`4fdfca65f38beb3f530e75b9151260d2948fd89cb289ca5e3a1e8be9d2cf0ec9`;
reviewed export patch SHA-256 is
`7f5bf5ff937d4f0be6df96433880e6436eaf0ff0dbff2f711394da2142275fc9`.
Root compared the exported bytes with the verification clone before integration.

This is incremental development evidence. It does not extend b306's full native
preparation to later source, rerun the retained UI/policy tests, establish required
CI success or authorize a deployment. Final release preparation remains open.


## G002 direct-HTTP identity correction — 2026-09-08

Source `95ce45c0fd823f2d1b0c37872b8fa13a7bae5774` corrects a transport-specific
authentication mismatch. The bridge's original G002 admin JWT omitted
`hex_identity`, while the module's strict claim parser and sender comparison
require it. Direct HTTP forwards that original signed payload. The producer now
derives the identity from the existing issuer/subject using the exact pinned
SpacetimeDB 2.6.1 BLAKE3/checksum construction and includes it in the signature.
The existing locked `@noble/hashes` version becomes a direct service dependency.
G001/PTR claim schemas and all module authorization guards remain unchanged.

The earlier statement that the host never supplies this field was too broad.
The pinned SDK's `src/sdk/ws.ts` first calls `/v1/identity/websocket-token`, then
subscribes with the replacement token. The endpoint re-signs the validated claims
for a short lifetime and serializes the computed identity. Raw-payload forwarding
after that exchange therefore receives an already enriched token. Official
2.6.1 identity/auth/subscribe sources and the actual SDK call chain explain this
distinction; a direct-HTTP request performs no such exchange.

The completed old CI log confirms that private loopback ran and finalized its
atlas successfully at 03:14–03:15 UTC in PR `1e90b2e`'s merge checkout `f77d88b`.
It was neither skipped nor a no-op. The earlier projected-identity fixture modeled
that SDK path but did not verify the original bridge JWT against direct HTTP.
The corrected fixture now uses the actual producer, and a route regression checks
the real signature plus unchanged module parser, including signed-field tampering.

Focused native tests passed 61 root and 258 service cases. Service, workerd, app
and configuration noEmit checks all passed. Pinned pnpm validated the exact lock
offline in an owned checkout. Direct dependency resolution remained inside that
service's owned package tree. The real root-only loopback import also succeeded
without a service installation, using the root's existing exact dependency.
The reviewed nine-path patch SHA-256 is
`7b39ed86840549a0afeae52397c591215047ffe3b56997c8313c9bfd071af0f0`.

A separate private-network native oracle passed at 05:01 UTC using the retained
historical G002 artifact and actual bridge minting. Direct HTTP entered the
unmodified lifecycle successfully; the generated SDK client exchanged its token,
reported the same sender identity and called the protected status procedure.
Missing identity, wrong audience and extra claims received the expected module
403 refusal. Two correctly signed wrong-identity cases and unsigned payload
tampering received host 401 refusals. The public error may reflect OIDC fallback;
tests do not require exposure of the internal validator message. Program rows
and source hashes matched after the probes. The final result SHA-256 is
`b654e76f6e234aca59ce23f2fbc8c6ad41724f51f1e1463daeaa2a627d367686`.

The first oracle attempt stopped after HTTP success on a harness URL-object
handling error; the second stopped on an overly specific public-error expectation
after its positive and module-negative probes. Both were retained separately.
The final run completed every intended case; all disposable servers were stopped,
signing files and CLI snapshots removed, with no cleanup failures.

This uses synthetic authority. Hermes also owns the disposable database, so SQL
success is not evidence of private-query authority on a production database owned
by another principal. The protected procedure, HTTP lifecycle and SDK exchange
are separately established. No live provider request, module update, populated
migration, recovery completion or owner-play acceptance is claimed. The original
failed populated rehearsal remains failed and can now continue with the corrected
bridge in a fresh isolated fixture. Generated consumers and publication are
recorded separately from this source and interoperability evidence.

## G002 generated source family and rehearsal continuation — 2026-09-08

The complete generated consumer family for `95ce45c` was independently reproduced
and verified. Commit `6a5123ed7fde3e5e6b21114b895477f8c6b43a03` installs its
reviewed generated changes. All affected suites passed: 432 cases, no skips,
including the complete prepared-workflow suite. Tracked source and generated
output bytes remained unchanged during QA. Retained compiled inputs and bundles
were verified without rebuilding; full preparation remains scoped to `b306eed`.
Final release preparation and required published-source CI remain separate.


The 05:09–05:10 UTC rehearsal remains a retained failed attempt: it stopped at
PTR inspection because the historical parser rejects the SDK's exchanged identity
claim. Source `c5392e0` accepts only the original exact shapes or those shapes plus
the SDK identity, validates that field and binds it to the authenticated sender.
All existing owner/database/epoch and absolute-session checks remain enforced.
The historical A artifacts were not modified; their import, provisioning and
owner bootstrap use the actual host HTTP lifecycle with the original signed JWT.

The new rehearsal completed at 08:24 UTC. Real exporters/importers populated both
historical realms, followed by token-bound A-to-B updates that preserved every
existing row and complete table boundary. The updated PTR then completed gathering,
construction, issuance containment, autonomous timer settlement, expired-session
refusal and fresh-session resume. An explicit accepted-command retry changed no
rows. This is actual module behavior with synthetic local authority and persistent
test data; production owner play and code-replacement recovery remain unproven.
The server, temporary signing files and CLI snapshot were cleaned up.


## PTR SDK identity and release verification — 2026-09-08

Source `c5392e0` corrects the PTR SDK exchange boundary while preserving original
direct-HTTP claims. Native tests exercised the protected atlas procedure with the
actual exchanged token and rejected wrong audiences, extra claims, mismatched
identities and unsigned tampering. Focused tests and module/application/configuration
type checks passed. Source `d7798e6` updates the exact release-parser contract for
that one optional identity field; the focused verifier suite passed.

Full preparation and independent checking of `c5392e0` succeeded, but its candidate
QA correctly rejected the old parser contract. That family was not integrated.
A fresh preparation from `d7798e6` and its independent rebuilding check both
passed. Generated-only commit `582f498b0cd86117bdf8c5ea5d0cf8a2d1a741fd` contains the verified
family. All affected candidate suites and both type checks passed, while complete
tracked bodies and journal outputs remained unchanged. This is source-candidate
acceptance; `finalReleasePrepared` remains false. See [recovery evidence](recovery.md) for the completed populated
module update, real timer settlement and access-resume rehearsal.

Published `00c0399` CI completed with successful module, auth, native, recovery and
CodeQL jobs. Linux's only failed suite was `genesis002BridgeClaims.test.ts`: its
root SDK mock missed the separately installed module SDK, which cannot initialize
its server runtime in Node. The failure reproduced with the locked CI workspace
layout. Resolving the ESM mock from the actual module importer passes both that
layout and the root-only layout. It changes test resolution, not game authority.


At 08:40 UTC, a second native run replaced the direct update calls with the actual
existing-update dispatcher and adapter draft, which remain local work outside the
committed source checkpoint. Both populated realm updates passed
through durable continuation/submission/completion records, followed by the same
gathering, construction, session-expiry and access-resume checks. Every draft input
body matched before and after, and both completion records were reopened. Workflow
and source authority were explicit fixtures; native database and HTTP behavior
were real. The production adapter factory remains unavailable pending its genuine
authority and operating callers. This does not establish code-replacement recovery.


The accepted source-candidate journal SHA-256 is
`1edb25eac1d4a10c434c4b88f40a39c76e479ff97be7af9c7bcea638178e19c8` and the complete family SHA-256 is
`40773aacfaed31ac2faeb7edf65562d96e60369207ad0d717bb4ca02abd9999d`. Prepare/check logs matched the same exact result.
Both app and configuration type checks exited successfully. Retained test summaries:

- Tests  513 passed | 25 skipped (538)
- Tests  159 passed (159)

The test-only CI correction is committed as `0ab958f7bc088f61fcf9e7a63e7cadeda31d50c1`. Both supported
dependency layouts passed its focused suite. Required checks on the published
checkpoint still need their own fresh GitHub readback.

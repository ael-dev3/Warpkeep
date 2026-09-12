# Continue Warpkeep 0.4

## Current review and next work — 12 September 2026

PR #228 merged normally at 11:30:54 UTC to signed main
`c4b95505b73705d120aff3f3318d2bd5151f6565` (**M1**). Its tree
`24f5ceb4e36814b0a2bdb691adb59591db676611` exactly matches reviewed `820e6111`.
Verify `34688961992` and CodeQL `34688961994` passed at that reviewed source;
the old remote branch was retired. Both annotated source-history tags remain
published, including `source-history/warpkeep-0.4-pr228-820e611148db`.

Main push Verify `34691247637` then failed its full-history Gitleaks step before
Linux tests. All nine findings were independently matched to public Git commit
and blob identifiers in the generated activation bundle. The repair on
`codex/0.4-history-scan-fix` extends the existing exact-value, exact-path,
Sourcegraph-rule exception and tests altered values and wrong paths. Follow its
actual open PR for publication and hosted results. Do not weaken the history scan
or treat successful pre-merge checks as a pass for the later main run.

Native preparation from clean M1 completed successfully in session `30088`,
candidate `release-workspace-99438dc2cc576e073df09bc44f930bc6`. Independent check
is running in original session `8359` against unchanged M1; follow that process
and require its exact terminal result before export. Windows has a separate clean-M1
`codex/0.4-prepared-source` branch for the checked generated family. The scanner
configuration, scanner fixture/tests and documentation repair are outside the
deployment closure; they do not relabel the candidate or change its input.
The initial repair passed all six owning tests, the real scanner's 33 allowed
fixtures and 66 mandatory detections, app/test types and the full M1 history scan.
Its outgoing scan then stopped on four matches of M1's public commit/tree IDs
in these source notes. A separate exception covers only those two IDs in the two
exact evidence documents; its real regression passed 37 allowed fixtures and
72 mandatory detections. The first commit remains intact for review.
Changed-document links and the repository size policy passed. Hosted checks for
the repair still require their own terminal result.
After successful preparation and independent check, export at exact M1 and
reconcile the reviewed repair before protected generated-family promotion to M2.
Require final M2 CI before one sealed preflight. No live release is established.

### Pre-merge route correction

Hosted Verify `34686939701` at published `48a38b0f` failed two route integration
cases after 10,524 root tests passed. Both still expected the retired unavailable
pending message, although the funded keep now correctly remains visible. The
same two failures reproduced locally. The corrected test checks accessible pending
feedback inside the retained Resources region, the same command panel and disabled
confirmation, preserved City Mill selection, and the original exact-one-build,
atlas revision and back/history behavior for Mini App and browser. All 113 tests
in five affected route/screen/scene/accessibility/controller suites then passed
on pinned Node 22.22.3. No production behavior changed. Include the real route
suite in future keep-phase verification. Its terminal hosted success and protected
source promotion are recorded above; later main checks have their own authority.

The latest delivery correction fixes two integration defects exposed by hosted
Verify at `a7e19376`: the bundle engine still required the retired PTR home
literal, and aggregate workflow regex counts concealed a missing job timeout.
The exact transform now agrees with `/home/warpkeep`. Workflow policy parses
every job, including underscore IDs, and the refusal-only unsupported job has a
five-minute limit. Native verification passed all 127 affected tests without
skips; the [release engineering record](../../evidence/0.4.0/release-engineering.md#bundle-path-and-workflow-timeout-correction--2026-09-12)
owns the failed run, checks and limitations. The prior run is not green: its
Linux job failed before the subsequent source push cancelled the module job.

The latest product change preserves the last confirmed keep during a pending
command. The actual renderer, resources, selected draft and panel remain mounted;
mutations remain disabled until an authoritative read restores ready. A concise
pending status sits inside the measured resource header, visible at scrolled
confirmation on portrait and short landscape. Initialization without a confirmed
view, uncertainty, failures and expired sessions keep their unavailable behavior.
The [visual evidence](../../evidence/0.4.0/visuals.md#2026-09-12-pending-command-continuity)
records the reproduced defect, browser checks and their limitations.

Real provider inspection confirmed the fixed PTR identity, while its metadata
owner differed from the saved CLI login. A bounded follow-up classified the SQL
403 as `INVALID_PTR_OWNER_SESSION`, the application's session gate. This does not
prove provider update permission or denial. No atlas or owner state was obtained,
and no update was attempted. Inspect game state with genuine Warpkeep admin/owner
session authority and verify provider update authority separately. Preserve the
existing configuration and PTR state. The
[provider evidence](../../evidence/0.4.0/release-engineering.md#ptr-provider-read-and-unresolved-account-authority--2026-09-12)
owns the exact result; a refused read must not become an assumption of empty state.
The existing protected environment contains the workflow's secret entries, but
their presence does not establish validity. Source/UI work can continue while
access is verified. Remaining delivery work is
authenticated import/adoption continuity, owner/live caller composition, protected
source/family promotion and real preservation/owner/device acceptance. Overall
development remains approximately 65%; this is judgment against the full release
outcome, not a test-count score or a shipped-release claim.

The UI checkpoint `05c9e0f3` and bundle/workflow correction `48a38b0f` were
published, with Windows, GitHub and the clean idle native checkout verified equal.
The route-test correction was published as `820e6111` and integrated through
PR #228 after terminal checks. Continue each new change through the
[sync procedure](../../operations/0.4.0-development-sync.md), recording its actual
working PR and preserving the native input while the independent check runs.
The retained `8033e01c` family predates this UI source and the Linux PTR caller;
use the new M1 result after its independent check, not a relabelled old candidate.

The retained candidate also passed a fresh locked integrity check and an isolated
Git-index patch roundtrip. Existing assembler primitives support export without
another clone or a new CLI. Follow the
[integration procedure](../../operations/0.4.0-local-release-preparation.md#integrate-the-reviewed-source)
with the actual M1 prepare/check identities; do not reuse historical confirmation
values. This operating-path proof does not replace fresh M1 preparation.

## Linux PTR workflow and preceding publication

The Linux production caller now connects `ptr-update-inspect` and
`ptr-update-apply` to the existing source-built artifact, fixed PTR provider,
continuation and completion-record path. The dedicated `operate_ptr` job has
read-only GitHub permissions, exact main/source guards and fixed cache/CLI/private
config paths; it does not receive OIDC or bridge/admin secrets. The CLI and
workflow evidence bind these operations to that job. The PTR constructor now
requires the installed `warpkeep` account, UID/GID 1000 and pinned Node mode
`0500`, retaining canonical-path, ownership, byte and re-attestation checks.

Tests first reproduced the missing input/evidence route and retired-runner
contract. All five affected suites then passed all 191 tests on native Linux
Node 22.22.3, with no skips (session `83875`, exit zero), using a checked ten-file
overlay over `33de0387`. Its exact paths were restored after verification; no
private credentials, provider state or generated family was changed. Windows
passed 104 CLI/evidence/dispatch tests, 36 lifecycle tests and 12 workflow tests;
its 39 Linux-only workflow cases were subsequently covered by the native pass.
The [Linux operating guide](../../operations/0.4.0-linux-runner.md#existing-ptr-module-updates)
owns the concrete path and credential requirements.

The private Linux CLI configuration has now been provisioned from the owner's
existing local configuration using an exclusive, checked process pipe. Both
pinned CLI binaries and config bytes/metadata were verified, and captured local
`login show` output confirmed a readable login without exposing credential or
identity values. This does not prove provider permission, current token validity
or PTR ownership; do not recreate or overwrite that existing config.

This source integration was published as `a7e19376`; it is not an executed PTR
update. All 191 tests also passed on the final committed native checkout in
session `83911` (exit zero). CodeQL `34684939137` completed successfully; Verify
`34684939145` was still running during the pending-keep work. Read the actual
published head's checks rather than carrying earlier results forward.
Follow normal source/family promotion.
The retained `8033e01c` generated family does not cover these runtime changes;
the [promotion sequence](../../evidence/0.4.0/release-engineering.md#protected-promotion-and-historical-source-retention)
requires preparation and independent checking from actual main ancestry before
protected use. Do not run apply until genuine credentials, predecessor state
and required recovery evidence are established. Inspection itself writes private
inspection/continuation records, although it performs no database update.

The next integration is the PTR import/owner/live caller. Import currently accepts
fresh-publish authority only; support authenticated completed existing-update
authority without fabricating a publish receipt. V3 intentionally supports
current-source initialization. Existing historical import/owner receipts, if
present, must retain their original bodies and source coordinates and obtain
authenticated continuity/adoption authority. Inspect actual private state before
choosing initialization versus adoption; never assume the owner is absent or
recreate an existing owner. The current-source restriction is already recorded
and tested, rather than a newly introduced regression.

The [sync procedure](../../operations/0.4.0-development-sync.md) now resolves its
example branch/PR dynamically, describes new-branch scan bases and clean idle
fast-forward updates, and makes contaminated outgoing-history recovery explicit.
The related repository agent guides and existing periodic check also enforce
immediate publication; their actual remote checkpoints remain in the external
handoff. Keep the complete 0.4 goal active; source and fixture progress does not
close owner, preservation, visuals, performance or release acceptance.

## Activation lifecycle correction and preceding checks

Verify `34680474756` at `2615518e` exposed a single failed root-test suite:
the activation lifecycle fixture supplied opaque authority stubs to the newly
connected real bridge-provider constructor. The corrected fixture now mocks
that boundary, asserts provider-to-state wiring and checks evidence revocation
before resource preparation on provider failure. Its ten previous cases remain,
with one new failure-path case. The runtime, real provider and auth-bridge-state
suites passed all 177 tests on pinned Windows Node 22.22.3 (session `18025`,
exit zero); explicit application/test types and independent review passed.
Production authority checks are unchanged. The
[release engineering record](../../evidence/0.4.0/release-engineering.md)
retains the failed hosted batch and corrected scope. The correction was published
as `33de0387`, and Verify `34682368968` and CodeQL `34682369009` completed
successfully. The subsequent PTR caller needs its own publication checks. Do not rerun source
preparation for this test/documentation-only follow-up. The immutable tag at
`2615518e` already retains the required historical operator ancestry.

All 36 saved mobile/desktop PNGs from `8033e01c` have now been reviewed. The
[visual record](../../evidence/0.4.0/visuals.md) owns the remaining desktop action
discoverability, small-building hierarchy, scenery and cropped-view findings.
This completes the saved-image review, not device, interaction or owner acceptance.
Continuous publication also resolves the authorized branch through future merges:
the existing 15-minute check was updated in place, Windows now tracks its verified
`upstream` publication remote, and maintained repositories were freshly fetched
and clean. Follow the [sync procedure](../../operations/0.4.0-development-sync.md).

The shared bridge provider is connected to the sealed activation workflow.
Recovery authenticates original uploaded bytes, preserves the complete retained
authority chain and samples elapsed time through provider reads and receipt
expiry. Source `44b91b94e401ed51512e11ca786bd04f8413d112` passed all 519 tests
in twelve affected suites on Linux as `warpkeep` UID 1000 with Node 22.22.3
(session `18870`, exit zero). The earlier Windows pass covered 193 tests with
42 platform skips; native verification completed that scope.

Hosted Verify `34675180672` exposed older update/dispatcher fixtures missing the
required test capability. The correction in `7cb573ba` preserves the production
constructor and passed 196 native tests; its one intentional skip is the
unsupported-runtime rejection inside the supported namespace. The test-only
follow-up `132355e0` replaces HTTP fixture URL-prefix routing with exact parsed
origin and route checks. Its 43 tests and strict types passed, and both CodeQL checks
succeeded. These results do not establish CI success for the generated-source
checkpoint that follows them; read that head's own required checks.

Native preparation `90120` and independent check `72208` both exited zero from
`7cb573baab40e54f52ab2aeb26c56c9e8f1cf9f5`, reproducing candidate
`release-workspace-326aab0c728dd07f02faa1969a94c7eb`. Both processes are terminal.
The guarded export authenticated every generated output and retained backup,
checked the full source/candidate trees and closure, then copied only the 17
changed generated bodies. The other 85 outputs, Windows HEAD/index and the
published `132355e0` test fix were preserved. The
[release engineering record](../../evidence/0.4.0/release-engineering.md) owns
exact transaction, family and closure identities, including older candidates.
`finalReleasePrepared` remains false: this is reproducible source preparation,
not a live release. Test-only and ordinary note changes do not alter the recorded
compiler input or require another preparation run.

The generated checkpoint `60097dd7` was scanned, published and synchronized to
the clean native checkout. Its closure and preparation classification passed
with Pages `sealed-launch-blocked`, and the eight selected suites passed all 87
native tests.
These results complete the scope that Windows could not verify: its earlier
invocation returned 62 passes, 12 skips and 13 POSIX-boundary failures. Windows
build-mode types and file-size policy passed; its closure CLI correctly refused
the unsupported platform.

The full prepared-workflow suite (session `36364`, terminal) passed 156 tests and
failed three because static policy still expected the old API-token, reviewed-B0
and PTR source counts. The correction binds credentials to their owning calls:
source inspection receives the Cloudflare token, and live inspection also
receives the admin token. The baseline and six credential-relocation regressions
passed natively in session `34162`; 156 tests were deselected. Strict TypeScript
also passed. The full suite then passed all 163 tests on clean native source
`72aee27e8dc165994d3893bed9b9151330b8c9f2` in session `75371`, with no skips.
Independent policy
and Linux PTR-variable wiring reviews found no further defect. The temporary
native overlays were restored, leaving the published checkout clean.

Preparation in that same session emitted its completed candidate result for
`release-workspace-3e7657772125faa459d4fa2d50e96fe0`. The outer shell then exited
one because of a trailing carriage return after the successful Node command.
Do not label the wrapper successful. The candidate is retained without an
independent check or export: the subsequent mobile layout changes two raw-hashed
closure members, so that candidate cannot cover the new UI source. Its exact
identities remain in the release engineering record. No active native process
remains from session `75371`.

The mobile entry correction moves the full loop rail below the workspace,
compacts resource and scene controls, and keeps exact balances and primary
actions visible. Its five affected suites passed all 64 tests and build-mode
types passed; local synthetic portrait/narrow/landscape views were inspected.
The [visual notes](gameplay-and-visuals.md) retain the capture limitations and
remaining composition work. No authority or gameplay mechanic changed.

Source `8033e01cc911f510fafb1770fdb0c0f0f3d2b3ac` was scanned, published and
synchronized before native preparation `35471` and independent check `7224`.
Both commands now exited zero with exactly matching candidate identities.
Guarded export `78755` also exited zero: seven generated manifest/pin files
changed and 95 outputs were preserved. Compiled bundles, bindings and test
consumers did not change. The release engineering record owns exact identities,
the public B0/admission observations and the source-bound verification scope.
Use LF-only Linux stdin and preserve the native command exit status. Verify the
published clean native closure, preparation policy and Pages `sealed-launch-blocked`
classification. Do not repeat the unrelated full policy suite for these generated
identity changes. Read the published head's own terminal hosted checks.

Protected promotion requires two normal squashes. First retain the reviewed PR
source ancestry with a remotely verified non-release `source-history/` tag:
automatic branch deletion would otherwise remove the normal fetch route to the
historical operator checkpoint used by the preparation projection. Squash the
checked source to main **M1**, then prepare and independently check actual clean
M1. Promote only its generated family through a second protected squash to **M2**.
After M2 Verify succeeds, dispatch preflight at M2. Its manifest source M1 must
remain an ancestor; no preparation from M2 is needed merely for that generated-only
commit. Do not deploy from interim M1 or alter protections to skip this source rule.
See the [promotion sequence](../../evidence/0.4.0/release-engineering.md#protected-promotion-and-historical-source-retention)
for exact operations. Record the actual tag/CI/promotion results in the PR and
existing external handoff until the next substantive commit.

After M2 verification, execute the existing protected read-only `preflight` and genuine
provider reads. Re-attest the retained B0 predecessor before initial prepared
bridge deployment. That existing deployment caller owns its durable journal and
receipt lifecycle, including B0 re-attestation and provider postflight; empty
Linux private roots do not require copying an old Mac prepared journal. Do not
rerun B0 or invent retained evidence. Complete the missing realm import and owner
producers, then obtain actual owner, preservation, recovery and device evidence.
The [workflow audit](../../evidence/0.4.0/workflow-sufficiency-audit.md) and
[recovery record](../../evidence/0.4.0/recovery.md) distinguish implemented callers
from remaining live acceptance. Keep G001 preserved and G002 sealed throughout.

The Linux PTR routing and account gaps identified at this earlier checkpoint are
addressed by the current integration above. Actual protected execution remains
unverified. Continue with genuine existing-update/adoption authority for import
and authenticated owner/live resolution; source composition is not provider proof.

Continuous publication is required in `AGENTS.md` and the
[sync procedure](../../operations/0.4.0-development-sync.md): commit and push
each completed development change and all authored durable work at handoff.
The 15-minute thread check supplements immediate publication. Synchronize clean
idle native checkouts after active runs finish, preserving private state and
immutable candidates. Reuse existing storage; create no Desktop output.

The placement fix inverts the native SVG screen transform and ignores
outside-plan taps before snapping, preserving pointer mapping with borders and
letterboxing. Chrome fixture checks passed at portrait, narrow bordered, wide
and tall layouts; keyboard movement remains covered. This is local browser
evidence, not owner or physical-device acceptance. Countdown arithmetic retains
a regression against the old floating-point calculation; contemporary
microsecond timestamps do not already exceed JavaScript's safe-integer range.

The loop indicator keeps construction at Build until authoritative completion,
then shows Benefit when inspecting a completed improvement. Other stages are
neutral: a returning Worker does not prove a building was completed. This changes
presentation, not construction timers, costs or resource authority.

Pages uses Verify's root-suite prerequisites and serial allowance for expensive
authority tests. The Linux prepared bridge reads the public immutable PTR
identity from `WARPKEEP_PTR_SPACETIMEDB_DATABASE`; repository readback agreed
with source pins and retained creation/provider metadata. Credentials remain
secrets, and publisher/owner access still requires genuine verification. The
Linux deployment/recovery caller already exists. No observed protected squash
rejection establishes a missing local signing key as a blocker. The recorded
public bridge attestation reports B0 source `308f901d`; it does not prove private
receipts, current Cloudflare bytes or live 0.4 acceptance.

## Historical verification checkpoint — 12 September 2026

The recorded synchronized development head was
`95945beaae12e31a3516b6ad42511fe8cff63ef4` on
`codex/prepared-keep-bindings-fix`. This documentation checkpoint aligns the
agent-facing evidence with the latest source/test head; the reviewed runtime
source and native preparation input remain unchanged. The complete
`authBridgeNotificationPreparedWorkflow.test.ts` suite passed 159/159 under
the dedicated `warpkeep` UID; a root-UID invocation is intentionally invalid
for this permission-bound verifier and is not counted.

GitHub Verify run `34665737857` completed successfully for this head, including
Linux, SpacetimeDB, release-recovery, auth-bridge, native-contract, and the
aggregate verification job. CodeQL run `34665737866` also completed
successfully. This evidence is source/test-head-bound; any later branch commit
requires its own terminal checks before treating R14 as complete.

At that checkpoint, the Windows checkout, GitHub development branch and native
WSL checkout were synchronized on `codex/prepared-keep-bindings-fix`; the
source checkpoint used for native preparation is
`03cb8b8fc2c0c59bcb58c4303b2082dead6325d9`; the reviewed
runtime source checkpoint is
`24e3c136fb5e3839b00c8e8ddb3c780b6f795461`. The Keep04-focused local suite passed 10 test
files and 139 tests, the PTR gameplay surface suite passed 33 tests, and the
Greater Realm world/RealmMapScreen suites passed 45 tests. A narrow local browser
pass also confirmed the title, menu, realm directory, sealed G002 state, and
fail-closed G001/PTR messages are legible and coherent; this is rendered smoke
evidence, not physical-device or live-owner acceptance.

The runtime bootstrap remains deferred behind a React lazy boundary: the initial
application chunk is about 3.9 kB (down from about 899 kB), while the interactive
runtime remains deferred until the gateway is entered. The Worker review panel
keeps internal `locationId` in the authority-bound dispatch payload but does not
render it to players; resource labels use the resource site and coordinates.
Native Linux `prepare` and independent `check` converged on candidate
`release-workspace-2d70e1808817fcf50990e5a4b84409b9` with family digest
`841eb93123b88508d82febe883966722d0ffffe46c0cd84b36666a6ed4d2deee`, closure
manifest `689dc56ab6ae708958093b6c8ffb89dcb7fd4671de82261f1c3bdc77ed4a7f77`,
scanner manifest `edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71`,
and 1,200 protected members. `finalReleasePrepared` remains `false`.
Verify and CodeQL are attached to the current PR head; read their live run IDs
and terminal state from GitHub before claiming R14 complete. No
authenticated provider deployment, recovery readback, owner journey,
physical-device result or live release is claimed. The existing Desktop handoff
was updated in place; no new Warpkeep Desktop file, copy, backup or archive was
created.

Build a persistent strategy world around **gather → choose → build → benefit → return**.
The GitHub/profile/ecosystem refresh is complete. Continue the connected game and
delivery work; substantial implementation is present, but 0.4 is not yet a verified
live release. The current user's direction takes precedence over historical plans.
The dated [workflow sufficiency audit](../../evidence/0.4.0/workflow-sufficiency-audit.md)
is the compact read of what is ready for development and what still blocks a ship.

## Workspace output direction — 2026-09-11

The owner requires no new Warpkeep files on the Desktop and limited storage
growth. Follow the repository-wide
[output and retention rules](../../engineering/development-workflow.md#output-locations-and-retention).
Update existing notes, reuse checkouts and attested caches, keep disposable
non-sensitive output under ignored `artifacts/`, and create the final package
only at `artifacts/delivery/0.4.0/`. The legacy `desktop-handoff.md` filename is
retained solely for link compatibility. Older Desktop delivery/export directions
are superseded; the existing external handoff may be maintained in place without
new sibling backups.

The September 11 storage inspection found approximately 39 GiB in native
release-preparation `runs/`, 127 MiB in its cache and 461 MiB in its toolchain.
These are dated observations, not permanent budgets or evidence of disposable
content. No authoritative candidate or journal was deleted. Inspect retention
and peak host/guest space before another preparation; do not repeat a full
prepare/check cycle solely for this documentation change.

Verification: all 206 local Markdown links in the changed documents resolve,
the existing handoff suite passed all three checks on Node 22.22.3, and
`git diff --check` passed. The delivery destination is Git-ignored. This update
changes workflow guidance and acceptance destinations; it adds no automatic
deletion service and makes no new runtime or deployment claim.

## Prepared source checkpoint — 2026-09-11

The generated source family was integrated at
`7d920b9f57ec450071632fdc3f0b560f7526811a` on
`codex/prepared-keep-bindings-fix`. Its native preparation and independent check
used committed input `713c2bfb7d5b0cb00028c3553089d60b53e2897b`.
Read the current local/GitHub heads through
[source synchronization](../../operations/0.4.0-development-sync.md); later
documentation commits are not new preparation inputs.
The Pages private deployment job now uses Linux x64, and closure
pin derivation resolves the Linux and Darwin workflow profiles independently.
Native `prepare` and independent `check` passed for that input source. The
converged candidate is
`release-workspace-69a975071850f1e562b593ffa811904e`, source tree
`2b23068063945029e439dbeb85bf4fa6b80b9735`, transaction
`5b1ab812dba7456e6c84493fe741efa4`, family
`c6c45376b8662f58f602d59c7f41912ebdde6bb4856d519d8a0cdc65e975c67e`, and
closure manifest
`c92fc469e86ca8ee285c4057901a9bd41c1be982283d04a82196cf541433702f`.
The candidate remains preparation evidence only, with `finalReleasePrepared: false`.
The protected Verify and CodeQL runs attached to the current PR head are the CI
authority; read both at terminal state before claiming CI complete. This
evidence still does not establish provider deployment, recovery readback, owner
admission, physical-device performance or final release approval.

### Linux prepared notification lane — 2026-09-11

Commit `36369e712fa719ce8b0cc2afd2fb181104a80b1c` adds
`.github/workflows/notification-bridge-prepared-linux.yml` and
`scripts/auth-bridge-notification-prepared-linux-runner.mjs`. The lane uses the
owner-only Linux x64 runner, fixed Node 22.22.3, a reviewed pnpm 11.7.0
wrapper and isolated store, then rechecks GitHub workflow authority before any
credentialed deploy or read-only recovery call. The protected source closure is
now 1,199 members; its current manifest SHA-256 is
`c92fc469e86ca8ee285c4057901a9bd41c1be982283d04a82196cf541433702f`.
The lane is source-verified and pushed, but no authenticated production run or
recovery readback has been recorded. Pages private delivery has since moved to
the Linux x64 profile with per-workflow closure pin derivation. B0 and the
legacy prepared caller remain on Darwin until their executable/path migration
is separately reviewed.

The checked-in `sealed-realms-production.yml` routes only `preflight`,
`g001-policy-observe`, and activation evidence operations to the installed Linux
authority. G002 publication/import/live operations and PTR publication,
import, owner-provision and live operations remain explicit fail-closed
`unsupported` cases until their authenticated provider and owner receipts are
available. This is the intended 0.4 safety boundary, not a completed live
release workflow.

## Workflow audit and runner repair — 2026-09-11

The workflow is usable for continued development but is not yet sufficient to
ship. The interrupted dedicated runner installation has been completed:
`WarpkeepRunner`, `warpkeep` UID/GID 1000, and existing GitHub runner ID 22 were
verified online/idle with the service enabled/running. Empty sealed private roots
were provisioned without credentials or receipts. This supersedes the older
offline/systemd-pending observations below; no protected dispatch was attempted.
WSL subsequently stopped the guest when interactive commands exited. A hidden
Windows process holds it open for this session, and the per-user scheduled task
`Warpkeep Runner Keepalive` now starts the same hold at interactive logon.
Post-reboot, pre-logon and host-sleep availability are not established.
Use the [current runner guide](../../operations/0.4.0-linux-runner.md) for the
exact account, maintenance commands, evidence and remaining work.

On September 11, a read-only `preflight` dispatch was attempted against
protected `main` using its exact SHA `9eb98e78bc975e29ced16d92c2060ab833ad9b46`.
GitHub returned workflow-not-found because `sealed-realms-production.yml` is
present on this prepared branch but not on that protected main revision. The
protected preflight therefore becomes runnable only after the prepared branch
lands; branch-local workflow bytes are not live authority.

The actual G001 policy workflow exposed a CLI defect: `g001-policy-observe` was
supported by the dispatcher but absent from its executable parser. The parser
now uses the dispatch operation map. The new fresh-process regression reproduced
the input failure before the fix, then reached the required host-attestation
failure without runner context. Unsupported operations still fail before host work.

The protected closure then exposed a second real drift: the checked-in inventory
omitted `src/components/keep04/Keep04LoopRail.tsx`. Commit `65f6541d` refroze the
generated closure and all count consumers at 1,195 members; commit `c0e30a37`
regenerated the manifest and workflow pins from the native Linux bytes so
Windows CRLF checkout differences cannot invalidate the Linux authority. The
native runner completed `prepare` and independent `check` at `c0e30a37`, each
checking 3,181 source/candidate files and 101 generated outputs. The durable
candidate remains local preparation evidence only; it is not a deployment grant.

After the first documentation-only publication at `7a542a33`, the same two
lanes were rerun against that source and passed with candidate
`release-workspace-447cff3cb663d042a1c10db14e426213`, source tree
`c1152bd3697fe77fda63552daf79edaf13278aaa`, and the same file/output counts.
The follow-up `be43114b` changes documentation only; it is synchronized in all
checkouts.

Linux recovery Pages and activation-generation callers already exist; generation
has job OIDC. The remaining integration is genuine recovery service deployment
and authenticated readback: the recovery bridge projection still relies on the
legacy prepared receipt/journal chain, and activation's deployment, binding,
import and owner attesters remain unavailable. Do not treat an offline bootstrap,
new runner labels or registration as replacement evidence. R11–R13 remain open.

## Earlier source checkpoint — 2026-09-10

The preceding published implementation checkpoint was
`5b9ba9657d6e66319f41aabd396faf2a6c947b29`, with functional source at `c4ad7539` and the Windows QA repair at `84c35a5e` on
`codex/prepared-keep-bindings-fix`. It includes
the bounded Keep04 moat surface,
current reference-to-source notes, the Windows browser-runtime adapter, the
Vite watcher boundary that keeps disposable Chrome profiles out of the source
watch graph, local-output ignore rules, Windows-connected local QA hardening,
realm-selection-aware browser journeys, redundant Inner Keep scene-reconcile
throttling, private-sync retry telemetry, resource-catalog disclosure/pagination,
fresh-browser re-entry diagnostics and the narrow WebGL teardown-warning
boundary. The latest release-rail commits also make the private TypeScript
loader fixture-CWD safe, keep the native operation-bundle import outside Vite's
static resolver, refresh the sealed package/lock identity pins, and refreeze the
1,195-member notification closure. Historical checkpoint labels retain their
original scope and are not current-source claims. The current Verify and CodeQL
runs attached to PR #228 are the R14 authority; read their live conclusions
before release. Local source and protected test rails pass. No live release,
physical-device acceptance or owner journey is claimed.

## Connected journey checkpoint — 2026-09-10

The disposable Windows full-stack lane passed on the functional source checkpoint.
It covered the title gateway,
restored Terms continuity, synthetic cold auth/bootstrap, Inner Keep setup,
four-worker dispatch, outbound → gathering → returning re-entry, private-read
failure/retry seams, timeout/missing/torn/visibility cases, individual recall,
Recall All, automatic settlement and released-node reuse. The visual aggregate
contained both cool high-albedo and warm low-green samples with no clipped
black/white samples. Static security is green at 50/50 after the current head;
rerun the connected lane after any further source change before declaring release evidence.

The handoff's full inspiration set remains the 0.4 visual rail: owner voxel
engine, Verdant Forest, Pelagic Ocean, Dream Loop/Vesper, terrain and atmosphere
research, Townscaper/Tiny Glade settlement language, Mapgen4 geography and the
secondary rendering studies. These references shape composition, palette,
material response, terrain hierarchy and review method; they do not introduce
copied code/media, deep simulation, freeform editing or arbitrary content counts.

### G001 history and the reviewed operator refreeze

The G001 adoption history still anchors the frozen module and its original
build recipe at `d945256b217fa13ade944b9ed9880e8463b46123`. Four shared operator
helpers were subsequently refactored for the current Linux/Windows delivery
rails: `greater-realm-production-provenance.ts`,
`greater-realm-production-transport.ts`, `hermes-admin.ts`, and
`spacetime-cli-attestation.mjs`. The sealed-launch verifier retains the complete
historical projection and, when those four bytes differ, requires every other
projection path to remain byte-identical to the historical freeze while
requiring the four helpers to match the explicitly reviewed refreeze commit
`f6036cb93711f1358eda9c7a5804457665a864c9`. A later operator change must be
reviewed and pinned as a new refreeze; it cannot pass through a broad exception.

## Windows connected local QA — September 9

The pinned SpacetimeDB 2.6.1 Windows CLI is now attested against the reviewed
CLI, standalone, and update-launcher bytes. The private snapshot uses `.exe`
members and retains canonical-path, exact-membership, byte-hash, identity, and
re-attestation checks; Windows ACL metadata is handled without weakening the
Unix mode contract. The local module copy uses a junction for the pinned
dependency tree and rewrites only the disposable copy's Genesis 001 admission
constant. Production `spacetimedb/src/genesis001AccessPolicy.ts` remains sealed.

The disposable SpacetimeDB runtime now completes publication, synthetic founder
seeding, Inner Keep setup, and process-tree cleanup on Windows. The browser lane
keeps Chrome's data directories disposable, starts Chrome before the bounded
Vite graph prewarm, tolerates slow identity/blank-target startup, and follows
the explicit realm-directory step before Terms or restored-session checks. A
connected run has passed the title gateway and restored current-agreement seam;
the current machine-level limitation is a renderer-thread stall during the
second Inner Keep project transition. The browser probe therefore remains
unpassed for this checkout even though the server runtime, focused
source/security suite (89/89), typecheck and CLI attestation suite pass. Do not
claim the full browser journey until a fresh run records it.

## Current native artifact execution — September 9

The pinned WarpkeepRunner Ubuntu 24.04 guest executed the preceding native source
head `206c03683c9039b513b878d7b0d3c6770eda2626` (source tree
`ebc91c6cc7bf205de22e331d127b1f2f7b8ba5da`) through the native materializer and
child worker. The operation-bundle runtime completed activation, G001, G002 and
PTR lanes. The program-artifact path completed frozen G001 and current G002,
retaining exact SHA-256/Keccak bytes. The all-realms binding check also completed
successfully, covering G001 current and compatibility, G002, and PTR. Its
compact receipt is retained at `/home/warpkeep/warpkeep-all-realms-206c036.json`.

This closes the previously open local assembled-artifact execution proof. It is
still local evidence: protected GitHub workflow completion, provider deployment,
live owner admission, physical-device acceptance and the remaining R11–R13
gates remain separate requirements.

## Portrait keep framing — September 9

The portrait WebGL scene now uses the available panel width while retaining
padded controls. Matched actual-renderer synthetic captures cover empty/mature,
placement, construction, completed and fallback states. Portrait picking and
selected-site inspection worked; desktop, short landscape and fallback dimensions
were unchanged. Scene resources were unchanged, but the wider backing canvas
increased pixel area by about 7.4% at the measured profile. This is a readability
improvement, not physical-phone performance acceptance. Building/material cohesion,
final visual coverage, live owner play and deployment remain unfinished.

## Windows Keep04 browser boundary — September 9

After the current moat change, the real Windows Vite page was captured through
`scripts/qa-observer/keep04-windows-capture.mjs` as
`windows-run-q9Jo7j`. The run produced 36 bounded desktop, landscape and 390px
portrait cases, guarded all 36 document responses with the exact server CSP,
verified the installed signed Chrome identity, and verified owned-process
cleanup. Empty and completed-keep states were spot-checked at desktop and
portrait sizes; sustained frame time, memory, physical-device behavior and the
real owner/PTR route remain open.

The first attempt failed closed because Vite watched Chrome's locked profile
SQLite files and Windows raised `EBUSY`. The fix is intentionally narrow:
`vite.config.ts` ignores generated `.cache` profiles, and
`tests/keep04DocumentPolicy.test.ts` locks that contract. The report marks
`stableSource: false` because this checkout still contains unrelated local
changes; the capture is rendered development evidence, not release acceptance.

At preceding source `d6cfc5c`, native release preparation and its independent
rebuild both passed with matching source/artifact provenance. The privileged Linux
caller suite passed 31 cases; the bounded source/private-record rerun passed all
17 selected scenarios with unchanged assertions. Final release preparation is
still false. At that checkpoint, runner registration succeeded but service
installation timed out in systemd. The September 10 repair above supersedes the
service failure; protected workflow completion remains unverified.

## Linux G001 protected closure — September 9

The historical published checkpoint `5c210ce` names and verifies the
complete Linux G001 spawned-program family in the protected source closure:
launcher, materializer, child, policy boundary, receipt codecs, runtime
helpers, YAML manifest, synthetic G002 entry, workflow evidence codec and
binding-tree utilities. The regenerated closure is stable at 1,194 members;
the remaining proof is execution of that materializer/child inside the
assembled Linux artifact and the final-family run.

## Linux G001 policy integration — September 9

The Linux G001 policy integration was historically published at `a0b5060` and is
included in the reviewed branch checkpoint `75d577c8` on
`upstream/codex/prepared-keep-bindings-fix`.
That checkpoint connects the Linux G001 read-only policy lane to its receipt,
adoption, activation-record and recovery consumers. It keeps the historical
Darwin receipt profile distinct, refreshes the opaque workflow evidence scope at
the final credential boundary, and uses the fixed Linux account, private namespace,
Node toolchain and descriptor-backed secret handoff. Shared admin transport
primitives no longer import the unrelated notification/compiler chain.

The development source passed app and Node-side type checks, 21 Linux
receipt/descriptor/dispatch tests, 15 native lifecycle/descriptor tests and six
shared-admin transport tests on Windows. The independent Linux record rerun
passed all 17 selected source/private-record scenarios, and the compiled
shared-evidence identity regression passed with real Git/verification and explicit
host/filesystem/compiler/process fixtures. The broader Windows regression retains
six existing census timeouts; no full-suite pass is claimed.

The native materializer/child has not yet executed in WarpkeepRunner, the generated
release closure still needs an explicit audit that both spawned files are included,
and no provider, credential or protected workflow call has run. The dedicated
runner is registered but not online; systemd recovery remains pending. The source
is a development checkpoint, not a final-prepared or deployed release.

## Signed preparation configuration observation

The recovery service now exposes a separate signed configuration observation for
an exact reserved preparation intent. It reads deployed auth-bridge configuration
through a private RPC, rechecks authenticated GitHub source/run identity after
that RPC, and checks the disabled authorization epoch before and after signing.
It does not arm recovery or establish realm readiness. The durable reservation
receipt remains unchanged. Actual gateway/signer/SQLite composition has six
passing cases; selected service/auth tests and scoped types pass. Full auth types
still need the missing quick-auth dependency in the verification donor.

Downstream candidate consumption is unfinished: the published candidate still
lacks four inputs until the configuration observation consumer and native module
hash producers are connected. No production deployment is claimed.

WarpkeepRunner now has verified Node22 and authenticated Ubuntu package updates
matching the existing local bootstrap pins. The recovery fixture GPG policy is
aligned to the same package version and exact binary hashes. The actual Node24
bootstrap revealed an overlong GPG socket path in its private temporary directory;
the reviewed directory-name fix now retains full random entropy within the Linux
socket limit. Its focused suite and the actual Linux Node24 bootstrap pass. The
frozen G001 native lane completed both reproducible build cycles at cf1fbaa;
The new --program-artifacts mode retains exact reproducible frozen G001 and current
G002 module bytes, SHA256 and Keccak256 through the attested package path. Focused
parent/helper tests and strict types pass. Actual native program-artifact execution
at 0e0b0e4 completed both reproducible G001/G002 lanes and the pinned Keccak path.
The opaque recovery consumer is now connected to the actual candidate and workflow
lifecycle, with genuine corpus crosslinks and final preparation freshness preserved.
Its focused checks use a mocked native producer; actual native artifact production
has separate success evidence. Full authenticated workflow execution remains pending. The paired native diagnostic reached PTR and found missing
pinned archives in cache/ptr. The reviewed [PTR cache bootstrap](../../operations/ptr-local-binding-cache.md)
now follows its own committed lock with integrity and no-clobber checks. Focused
tests and types pass. Actual installation at 40b676a verified all selected PTR
archives. The normal logged paired rerun at ebd5fb1 passed both reproducible
G002/PTR lanes and binding generation. Its retained output is native build evidence,
not deployed program equality or owner acceptance.
Generated deployment closure outputs were regenerated and reproduced identically;
this is source consistency evidence, not an operating bundle or live release.

## Dedicated local Linux runner

Active local launchers, workers, cache/bootstrap paths and service fixture
policies now agree on WarpkeepRunner, user warpkeep and /home/warpkeep. Exact
UID, file modes, executable hashes, attestation and no-clobber checks remain
unchanged. The separate historical GitHub Actions runner has not been migrated.

Ubuntu 24.04.4 now executes commands as warpkeep UID/GID 1000. Home mode0750
and private build directories mode0700 are verified. Node22/24, SpacetimeDB2.6.1,
YAML and pinned operation/recovery/G002 dependency caches are installed and checked.
The cloud-init datasource disk probe stalled startup; the dedicated guest now has
/etc/cloud/cloud-init.disabled and, after restarting only WarpkeepRunner, reports
systemd running without the user-session warning. This guest-specific setting is
reversible by removing that marker when cloud provisioning is actually needed.
Native bundles and current-source preparation remain unfinished.

Independent review verified runtime changes are only the intended fixed path,
account and distro substitutions. Focused local checks passed205 cases; the
one timing failure passed on an isolated rerun at its original timeout. Seven
service checks and strict types passed. An archive-based Git-object composition
test remains unverified because it requires a physical repository. No WSL call
was substituted into those tests and no native readiness is inferred from them.

## Preparation receipts reach the recovery candidate

The generation runtime now obtains a signed preparation receipt through the
fixed workflow OIDC transport, verifies its signature and source binding, and
retains exact bytes in the owned private workspace. Its disposable capability
supplies the actual reserved request ID and epoch to the candidate. Source,
ownership, conflicting facts and receipt bytes are rechecked on reads; failure
and completion dispose the capability.

The genuine joined fixture passed and reduced missing candidate inputs from six
to four: Worker configuration identity/epoch and G001/G002 expected program
hashes remain. Receipt/transport/ownership passed 24 tests; candidate/runtime
checks passed 21. Strict types and a real operation bundle/plain-Node import
passed. Windows fixture Git I/O used a test-only compatibility adapter; production
and Linux bounds remain unchanged. The established deployment manifest generator
produced unchanged outputs; this does not prove native operating bundle readiness.

Live generation still needs the deployed preparation policy/service, workflow
OIDC permission and supported caller, remaining producers and the production
generator consumer. No live reservation, deployment or realm mutation is claimed.

## Activation-record test fixture repair

Fixed candidate and historical-context tests now build genuine G002/PTR private
release artifacts and derive their approval identifiers through production
validators. Receipt links and digests follow those generated releases. The
mandatory approval reader and its negative assertions remain intact; a duplicate
same-error read was removed without removing either assertion.

Focused strict types passed. Standalone real release generation/write/validation
passed, but the Windows integration runs timed out in candidate reads or cleanup.
No full test pass is claimed; Linux CI must establish the repaired scenario result.
This changes test fixtures only and performs no realm operations.

## Generated deployment source inventory

The established generator now includes the current PTR existing-update helpers
in the protected deployment source inventory and refreshes dependent workflow
pins and exact inventory assertions. Source bytes were compared to the published
Git blobs; accidental archive line-ending normalization was corrected before
derivation. Installed outputs reproduce identically on a second derivation.
Independent review verified raw-file digests and found no weakened checks.

The targeted PTR membership test and B0 topology checks passed. Native standalone
ownership verification and rebuilt operating bundles remain unfinished; this
manifest refresh is not proof of a deployable integrated release. Recovery service,
auth-bridge, native-contract and CodeQL CI passed on the preceding service commit;
complete root/module verification and actual owner play remain pending.

## Recovery preparation service

The gateway now exposes POST /v1/recovery/prepare through the private signer.
It authenticates the protected workflow identity and current source using OIDC
and GitHub App observations, then reserves an immutable preparation intent in
the fixed recovery control Durable Object. A separate deployment-owned policy
must explicitly enable preparation while recovery remains disabled. The signed
receipt is preparation data; it does not arm recovery or authorize deployment.
Retries preserve the first receipt, and later arming must match the reserved
coordinates. Source, epoch and token freshness checks precede durable writes.

The normalized service change passed 198 focused tests and both strict type
projects. Actual signer RPC and SQLite Durable Object checks passed before
line-ending-only normalization; the matching-manifest retry also passed against
the actual DO. Independent runtime review found no blocking issues. Broad legacy
suites remain non-green due to recorded timeout/reset and environment failures;
these focused results do not establish full regression or production readiness.

The downstream receipt-to-candidate connection, workflow OIDC permissions and
deployed preparation policy remain unfinished. Six published candidate inputs
are still missing. No preparation policy or realm was changed in production.
The dedicated WarpkeepRunner Ubuntu installation succeeded, but its first boot
failed with Wsl/Service/CreateInstance/HCS_E_CONNECTION_TIMEOUT. Native local
build verification remains pending; other projects' WSL instances are preserved.

## Regenerated sealed-launch source pins

The established source-pin generator refreshes the authority implementation,
authority declaration and PTR publisher hashes to their reviewed current source.
This repairs stale verification after existing-update and V3 PTR support. The
other generated source-pin outputs were already current. Historical source diffs
were reviewed, and independent whole-family derivation produced identical bytes.
Validation rules and hostile tests remain intact.

Source-pin derivation passed 25 tests and authority passed 21. The four-suite
Windows run passed 154 cases, failed 67 and skipped one: failures were missing
Linux shell/Git executables and fixture timeouts. These are not passing coverage;
native CI and the remaining generated operating family still need verification.

## Complete preparation-source inventory

The generation runtime now derives a complete inventory of the authenticated
preparation commit's Git blobs and supplies its digest to the actual recovery
candidate through an owned, disposable capability. It rechecks source, private
state and authority after asynchronous work and on candidate reads. Conflicting
facts fail validation. The inventory describes committed bytes; it does not
claim that Git-filtered checkout bytes are identical to those blobs.

Verify derives and uploads the fixed source inventory on pushes to main. The
artifact becomes useful evidence only after the complete run succeeds and a
consumer authenticates its repository, source and run. The recovery service's
actual GitHub evidence loader now discovers that preparation run, validates the
fixed producer workflow and artifact, compares the complete inventory with the
authenticated Git tree, and recomputes the digest. Run and artifact metadata are
rechecked after download. This supplies an initial source-evidence check; later
persisted metadata checks still cover the existing Pages evidence only.

The service's loader, archive, canonical inventory and bounded stream suites
passed 391 tests, and strict service types passed. Independent producer/consumer
review found no blocking contract mismatch. Tests use synthetic authenticated
transports; no live artifact acceptance or deployment is claimed. Artifact
metadata identifies its run but not its attempt, so only observed run-attempt
stability is claimed. The existing Pages archive parser retains its contract.

The focused integration passed 34 tests, including the actual activation bundle
and plain Node22 import. Two genuine Git/generated-release/private-corpus tests
passed and demonstrated that the candidate's missing inputs decrease from seven
to six solely through the source digest. Two final capability checks and focused
strict types passed. Windows permission emulation is not native Linux acceptance.

Additional surrounding checks passed 35 workflow, eight bundle, two bridge
candidate and three bridge-facts cases. Thirteen other cases failed through
Windows fixture timeouts or their cleanup cascade; they are not passing coverage.
No semantic or compiler assertion mismatch was observed in these runs. Broader
published Linux CI also has unresolved source-contract and fixture failures.

Remaining candidate inputs are the authorization request ID and epoch, worker
configuration identity and epoch, and G001/G002 program hashes. The production
generator consumer, operating workflow, owner PTR acceptance and live delivery
remain unfinished. Earlier sections below record their original checkpoints.

## Construction time in the building review

An active building card now shows its construction estimate, so opening the
Buildings panel on a compact screen no longer leaves the timer behind in the
scene. It uses the existing screen clock and the same estimate formatter.
Reaching zero displays Awaiting Realm update; only confirmed state removes
construction and exposes the completed level. No additional timer or command
submission was introduced.

The screen, benefits and accessibility suites passed 40 tests, including a
countdown-to-zero-to-confirmed-completion regression. Focused strict types
passed. Independent source review found no blocker; actual synthetic 320/390
pixel captures showed the updating estimate, readable cards and reachable
controls. These are desktop browser captures, not owner/device acceptance.
Seven production evidence inputs and the generator consumer remain unfinished.

## Verdant Citadel backdrop and loading continuity

A cooler muted green backdrop separates the pale terrace and warm grounds more
clearly. The WebGL background and fog share the visual profile, and the loading
canvas now uses the same color. Existing lighting, assets, geometry and mobile
framing remain intact.

Actual synthetic renders cover empty and mature keeps at narrow balanced,
narrow reduced and wide high quality. The scene suites passed 74 tests before
the matching loading CSS change; 47 accessibility/host tests passed afterward.
A paused-model-loading browser capture verified the transition into WebGL with
matching background and stable canvas height. Render resource counts were
unchanged in these captures; this is not a device-performance benchmark or owner
acceptance. No production deployment or realm operation occurred.

## Mobile keep framing

Compact screens now give the keep scene more vertical space, making the grounds
and buildings easier to read. The existing viewport budget, sticky resource and
navigation header, scene controls and short-landscape minimum remain in effect.
The wide-screen layout and camera behavior are unchanged.

Fresh actual WebGL renders from the 012bc483 source plus this CSS change show
the canvas increasing from about 168 to 304 pixels high at a 390-pixel viewport,
and from 258 to 468 at 600. Browser checks found no horizontal overflow at
390, 600, 844 and 1440 pixels. Short-landscape checks opened both Buildings and
Workers with their close controls visible below the sticky header. The three
focused accessibility, scene-host and visual-profile suites passed 59 tests.
These are synthetic local QA scenarios, not authenticated owner or device
acceptance. Production activation and the seven missing producer inputs remain
unfinished; this change does not deploy or initialize a realm.

## Approval evidence from the actual private releases

The real recovery candidate reopens the existing private Greater Realm workspace
and derives G002/PTR approval IDs through the production release readers. Realm,
source, public release and release/header digests must match authenticated corpus
receipts; PTR also matches the manifest digest. The reader reopens both releases
and the corpus, rechecks ownership and refuses replacement or conflicting facts.
The existing-only opener never creates missing directories. Missing or invalid
workspace evidence now refuses candidate inspection instead of supplying defaults.

A genuine generated-release, private-corpus and bridge test exercises the actual
candidate and leaves seven producer inputs missing: recovery authorization request
ID/epoch, worker configuration identity/epoch, source-closure SHA256, and G001/G002
expected program Keccak256. The production generator consumer remains closed.
No provider calls, realm initialization, admission change or deployment occurred.

Verification passed 53 tests across the focused reader/candidate, affected corpus
contracts and genuine combined producer suites, plus strict types. Root
independently passed 20 reader/workspace tests. Activation, G002 and PTR bundles
build and import under Node22 with the actual connected activation runtime.
Independent review found no blocking runtime issue. Windows test permission-mode
emulation is explicit; native Unix permission behavior and owner play remain
separate. Earlier timeout failures are retained; only the heavy test's Windows
budget changed, not production timeouts.

## Confirmed Worker return feedback

Worker cards name the resource from the last confirmed return, independently of
any new expedition. Nonzero overflow explains that the resource limit prevented
storage; zero overflow adds no warning. The view uses the decoded last-return
record, and advancing the UI clock cannot invent a credit or clear pending goods.
No server rewards, timers, persistence or commands changed.

The author passed 110 presentation, screen, accessibility and surface-host tests;
root independently passed 62 presentation/screen cases. Focused strict types
passed. Actual component renders at 320px and 390px fit without horizontal
overflow, including a current expedition with a different previous-return
resource. This is fixture presentation evidence, not authenticated owner play or
actual-device acceptance. Full-app types still require the separate auth-bridge
compiler sync API dependency; no full-app type success is claimed.

## Authenticated bridge facts in recovery candidate generation

The production activation runtime passes its actual bridge-state capability into the recovery candidate reader. The reader reopens the retained suspension receipt and its validated authority chain to obtain worker version, worker source, bridge source and suspension receipt digest. It checks exact source/private-state ownership, permits the existing linked recovery predecessor, and reopens the chain/catalog before returning facts. These are retained evidence facts, not a fresh provider observation or permission to perform effects.

Candidate assembly merges corpus, bridge and source projections separately so a conflicting duplicate cannot be silently overwritten. It rechecks each input before returning. The later approval integration above requires retained workspace evidence even during inspection. The final generator projection independently cross-checks G002/PTR import receipt links against the bridge history.

At the earlier bridge-only integration checkpoint, a genuine private bridge/corpus fixture reduced missing inputs from thirteen to nine: recovery authorization request ID and epoch; worker configuration identity and epoch; source-closure SHA256; G001/G002 expected program Keccak256; and G002/PTR public approval receipt IDs. No default values replace those producers. The production generator consumer remains unavailable, and this change does not deploy or initialize a realm.

Verification: the final bridge/candidate/runtime integration suite passed 13 tests and focused strict types. Root independently passed the candidate/runtime checks and all 40 workflow runtime tests. The bridge reader received independent review; its recovery case passed, with earlier Windows timeout evidence retained. The real full-source activation bundle builds and imports under plain Node 22. The relocated bundle fixture now copies the real compiler graph and required package metadata, fixing an incomplete fixture also reproduced on the unchanged baseline. Windows-only fixture timeouts accommodate observed filesystem/compiler setup; production validation and Linux timing limits remain unchanged.

Final relocated bundle regression: all 15 tests passed after the fixture repair.

## Private PTR-update activation integration

The private activation path supports the PTR-update V3 binding family. It reopens
the exact completed-update record, derives the current PTR module coordinates,
checks atlas initialization, owner provisioning and current live observations,
and feeds those facts to the real candidate builder. The generator recognizes
a fully validated V3 envelope; the operating candidate still lacks producer facts. The
actual opaque update writer validates the same receipt format before persistence.
V2 remains a distinct supported family with unchanged canonical output.

The supported V3 initialization path uses authentic records produced under the
current preparation source. Historical atlas or owner wrappers without an
authenticated prior-release anchor are refused rather than rewritten. This does
not establish historical continuity, perform initialization, or deploy the game.
Those operational integrations and evidence remain unfinished.

The generation-receipt codec and completed-family readback recognize the exact
V3 schema/profile pair. Mixed inventories, incompatible receipt families, source
or live-module substitutions and invalid continuation run facts are rejected.
Tests use real private-state and semantic validators where described, with
synthetic fixture evidence; they are not live provider or owner-play proof.

At the earlier V3 checkpoint, corpus-only inspection identified thirteen missing
producer fields. The connected bridge reader described above now supplies four
of them, leaving nine at that checkpoint. The approval reader above now reduces
that set to seven. The PTR program hash comes from the completed update
receipt. A synthetically complete test candidate does not establish operating
readiness; the remaining inputs still need their actual producers.

Final root Windows checks passed 44 V3, writer, generator and bundle tests,
plus focused strict types. Selected V2 descriptor regressions passed 43 tests
with 26 cases not selected. Two fixed-Linux-Git failures reproduced unchanged
in the exact baseline; native and full Linux CI remain separately required.
Independent review corrected attempt bounds and reconciliation-run checks.

The production generator-member consumer also remains closed with
`SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE`; its genuine lifetime must be
connected after the required producer facts are available.

Before shipping, complete actual PTR initialization and owner access, provision
the operating workflow, perform native preparation and live acceptance, and
continue gameplay and Verdant Citadel polish. Keep G001 progress and its agreed
admission freeze intact; G002 remains sealed.

## Completed PTR update capture

The actual PTR runtime now captures an opaque, source-bound completed update
before disposing its artifact and adapter. The receipt reopens private update
records and the genuine continuation terminal. It records acknowledgement
separately from observed installation and never invents a lost response.

If the update completed but receipt capture failed, a later apply can recover
that fixed record after a fresh workflow permit check and genuine completed-head
proof. This path does not redispatch or send another provider update. Conflicting
records are preserved and rejected; foreign stores and disposed capabilities
cannot capture receipts.

Root Windows checks passed 25 completion/adapter/joined tests (four native cases
skipped), plus lifecycle, bundle and existing runtime regression checks. Focused
strict types and independent reviews passed. The previous published native
integration passed all eight cases; newly extended receipt assertions need new
native CI. This is development integration, not a live activation. Private V3
corpus/generator data support was completed in the later checkpoint above;
authenticated historical import/owner continuity remains unfinished. Gameplay, Verdant Citadel polish and live release acceptance remain
part of the full 0.4 objective.

## Joined production update continuation checks

The dedicated production-adapter test now uses the real source issuer, workflow
permit, private-state persistence, continuation store, claim/reconciliation,
PTR lane and dispatcher. Only artifact issuance and external provider transport
are fixture boundaries. Cases cover direct completion, lost-response recovery
without a second update, live predecessor refusal, run revocation before sending,
and the synchronously scoped claim. It is included in the fixed native CI suite.

Windows passed three boundary checks with four native cases skipped; strict
types and source review passed. Native CI must establish the joined POSIX path.
Neither mocked provider responses nor fixture authority prove a live update.

## PTR runtime constructor and bundle integration

The genuine PTR workflow runtime now admits update inspection/application and
constructs its source-built artifact and production adapter internally. It reuses
the real lane's workflow permit and continuation store. The runtime disposes the
adapter and cleans the artifact after consumed execution or construction failure;
workflow evidence is revoked even when cleanup fails.

Configuration is explicit: `WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT`,
`WARPKEEP_SPACETIME_CLI_CONFIG_PATH` and `SPACETIME_BIN`. Paths must satisfy the
existing Linux runner account and ownership policy. The current Node executable
is checked against the pinned Linux runtime and its canonical directory leads
the build PATH. Source and configuration are rechecked by artifact attestation.
These configuration locations are not claimed to be provisioned on the runner.

The real bundle engine now handles the newly reachable artifact-description and
runner paths through its existing exact portability transforms. A regression
builds that graph and imports the generated result using plain Node. Lifecycle,
bundle and existing workflow regression checks, strict types and independent
review cover the implementation. Mocked lifecycle boundaries do not establish an
authenticated provider update or native artifact preparation.

The operating workflow still permits preflight only. Next connect the real
adapter/continuation integration evidence, authenticated private V3 completion
records and current owner/atlas observations before enabling the operating path.
Historical import/owner receipts must keep their original coordinates; the new
module belongs in the current update receipt, not rewritten historical evidence.

## Native inspector loading correction

The native CI run for `0201ca4` failed its two separate-process inspection races.
The new production adapter import reaches TypeScript build helpers; the synthetic
child launched plain Node and failed on an extensionless TypeScript import before
reaching the barrier. The source-level child now uses the locked `tsx` loader.
An always-running child import check covers this dependency graph, and early
child failures retain their original error instead of becoming a barrier timeout.
The barrier duration and native preservation/concurrency assertions are unchanged.

Windows regression checks and focused strict types passed. Native CI at `846adb5` passed both isolated update/recovery and production
contract jobs; production uses generated Node22 bundles and requires fresh
bundle verification separately. This correction does not enable deployment.

## Production PTR update adapter implementation

The existing production factory now constructs an adapter from genuine source,
private-state and internally built artifact capabilities. Artifact construction
derives SHA-256 and program Keccak from the same copied bytes; the capability is
revoked on cleanup. A separate opaque transport reads the staged provider login,
uses only the fixed PTR endpoints and never exposes a token accessor. Its decoded
identity remains a local assertion; successful migration planning supplies the
server's UpdateDatabase authorization evidence.

Complete RawV10 comparison preserves old tables, reachable row types, names and
schedules while committing function changes to the full description. A metadata
initial-program value is only a hypothesis: the authenticated migration token
must match that predecessor and the actual candidate. Private no-clobber records
bind inspections, submission, acknowledgement and completion across sources.
Reconciliation proves the expected installation without comparing mutable player
rows and never invents a received acknowledgement or blindly repeats a PUT.
Current supported-host health is rechecked before submission/reconciliation; it
is a deployment observation, not replica attestation or an atomic version lock.

The combined Windows checks passed 170 tests with 34 native skips; strict types
and independent policy, credential and adapter review passed. Corruption, delayed
callbacks after failed no-effect persistence, changed host and lost-response cases
are covered. Real workflow/continuation execution, activation-corpus selection,
native artifact verification and live production acceptance remain unfinished.
The workflow entry still must construct these capabilities under its genuine
permit; production operation dispatch has not been enabled by this checkpoint.

## Exact-artifact module description

The PTR artifact helper now derives the registered RawV10 description through
the attested standalone executable, reading its existing private artifact
descriptor before CLI credentials are staged. Separate digests retain raw output
identity and canonical schema identity. Explicit keyed collections normalize
runtime ordering differences; typespace, columns, variants and function order
remain significant. Unknown sections, duplicate identities and unsupported
views, RLS, HTTP and defaults refuse explicitly. This identifies a supported
complete description; it does not authorize a migration.

Windows focused tests and strict types passed. The real historical standalone
extraction fixtures are retained with provenance. New native publisher integration
checks and a fresh current-artifact extraction remain pending WSL recovery; the
prior successful Linux build did not execute this new integration. The factory
now composes provider transport, migration policy and private update records;
workflow execution and activation receipt selection remain unfinished.
Generate a fresh source-bound family after the integrated source is
ready; never apply an older source's generated outputs.

## Supported Linux artifact build

The actual PTR artifact helper now selects the existing Linux x64 locked builder,
preserves Darwin arm64 and refuses unsupported runtimes before CLI effects.
Focused platform/race/publisher tests, strict types and independent review passed.
A real Linux build from `af68cae` also passed source/artifact reattestation,
returned-hash/provenance checks and artifact/materialization cleanup. The runtime
used the workflow's existing private umask after normal checkout modes.
This proved builder selection. Schema extraction and provider credential handling
are now implemented as described above, with their native integration still pending.

## Populated PTR update integration

Recovery now has an explicit schema-3 public binding for an existing PTR update.
The public artifact verifier, signed authorization consumer, service evidence
parser and committed-source/Pages routing use version dispatch. Schema 2 remains
the fresh path with unchanged canonical bytes and hash domains. Schema 3 replaces
fresh/publish receipt slots with an update receipt commitment and retains legacy
zero-table and admission invariants; those counters are not gameplay04 progress.

This is consumer support, not production update enablement. The activation producer
must select authentic completion from the new adapter records and cross-bind current artifacts,
historical import/owner provenance and current live observations. The actual
Linux artifact/schema and provider-owner credential capabilities must then be
connected inside the existing workflow runtime. Hermes game-admin JWTs are not
provider module-update credentials. Follow the [connected implementation plan](../../superpowers/plans/2026-09-08-ptr-update-recovery.md).

The separate official 2.10.0 disposable recovery rehearsal passed from `826ed94`
at 12:40 UTC on September 8. It preserved earned resources and pending work through
repair and passed timers, expiry, renewed access and exact retry. It predates the
later synthetic v3 definition policy and does not prove production acceptance.

## Start from the actual checkout

The development branch is `codex/prepared-keep-bindings-fix`, tracked by
**`upstream/codex/prepared-keep-bindings-fix`** on GitHub. On the current Windows
machine it is at
`C:/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree`.
`origin` is a local baseline repository; equality with it does not prove GitHub sync.

At `923e024`, the isolated dependency correction completed native preparation
and its independent rebuilding check. Candidate QA then identified the stale
source-authority operation contract; that generated family is not accepted.
The current authored correction aligns the verifier with the existing update
operations and tests semantic rejection after authentic pin derivation. Complete
fresh preparation from the corrected source instead of installing hand-edited
pins or relabeling the older candidate. Check any running process through its
actual handle before starting another one.

The populated native B-to-C recovery passed at 11:12 UTC on September 8. It fixed
a synthetic construction fault while preserving earned resources and pending
work, then passed autonomous settlement, expiry and retry checks. Its authority
was synthetic and its preservation interval quiescent. Next connect a distinct
production update receipt to the activation consumer and construct the implemented
factory inside the workflow runtime and fixed Linux caller. Do not represent a populated update as
the existing fresh-publish receipt. See [recovery](../../evidence/0.4.0/recovery.md)
and [CI evidence](../../evidence/0.4.0/ci-preparation-failure-baseline.md).

Earlier source `d7798e6145c19536eefbf328f64d68d5b15b1e1f` completed full native
preparation and an independent rebuilding check. Generated-only commit
`582f498b0cd86117bdf8c5ea5d0cf8a2d1a741fd` integrates the verified output delta. Candidate QA passed
the affected release/recovery/UI suites and both type checks with source and
generated bytes unchanged. The later CI test-resolution correction
`0ab958f7bc088f61fcf9e7a63e7cadeda31d50c1` passed both module-installed and root-only dependency layouts.
That test-only change and the documentation do not extend the preparation proof
beyond its actual `d7798e6` input. Final release preparation and live acceptance
remain open. Read the actual remote and CI before relying on a published status.

Fetch and compare real refs, inspect the scoped diff and read current job/process
handles before starting work. Preserve unrelated files and private probes. This
checkout has widespread line-ending/stat noise; inspect substantive diffs and stage
exact paths. Never normalize, reset, clean or prune it to make status look tidy.

The root `node_modules` is a shared junction. Install only into an independent
verification checkout. Use the pinned toolchain described in the
[development workflow](../../engineering/development-workflow.md); the current
machine's default Node/npm do not match the project's required versions.

Existing-update planning now rejects unsupported visible migration operations
and malformed plan text, while retaining token and fixed-target checks. Captured
native no-op and AddTable plans pass, as do the native adapter tests. This is a
conservative visible-text check: SpacetimeDB omits some view/RLS changes from that
text. The production factory now uses a separate complete RawV10 comparison. Its actual
workflow and activation-receipt integration remain unfinished. See the
[fixture provenance and limits](../../../tests/fixtures/existing-update-plans-2.6.1.md).

## What works and what still needs proof

The September 8 mobile catalog review improved first-build readability: unbuilt
sites and construction now have distinct labels, cost/shortage lists omit unused
resources, and affordable cards say "Resources ready". Construction eligibility
still comes from the authoritative quote, including the busy Builder check.
The affected Benefits, Screen, Accessibility and PlacementUi suites passed; the
catalog was inspected at a 390-pixel browser viewport using empty and completed
keep fixtures. This is presentation evidence, not authenticated owner play or
physical-device performance acceptance. The whole-grounds camera still makes a
small keep difficult to appreciate; continue the rendered composition review.

| Area | Implemented and verified scope | Next useful evidence |
| --- | --- | --- |
| Core loop | Server-owned gathering, construction and progression connect to the PTR controller and keep UI. Building choices explain benefits; confirmed returns become spendable. | Actual owner first improvement and the better return it enables on real routes. |
| Navigation and continuity | Selected Worker survives keep-to-atlas navigation. Close/Escape closes nested panels to the keep; Back stays separate. Healthy refresh preserves scene/focus. Active expiry renews scoped authority and reconnects without replaying commands. | Actual owner foreground/resume, uncertain command and realm-switch journey. |
| Verdant Citadel | Current keep presentation and coherent Greater Realm water have scoped tests and synthetic rendered evidence. | Integrated visual review, lower quality/motion settings and physical-device performance. |
| Linux delivery | Complete source preparation, independent byte check, recovery and the fixed sealed preflight caller are connected. The supported runner is installed. | Remaining operating callers, authentic provider inputs and release-specific signer/runner authorization. |
| Existing databases | Compiled candidates preserve the captured old schema; authenticated planning supported deployed-program fingerprints at the recorded snapshots. | Populated A-to-B preservation and PTR timer/access-resume rehearsal passed. Complete useful code-replacement recovery and connected existing-update receipts. |
| GitHub checks | The published `00c0399` module, auth, native, recovery and CodeQL jobs passed. Linux failed one G002 test suite during SDK initialization; the failure was reproduced and its mock resolution corrected locally. | Required checks on the newly published source. |

These are separate scopes. A local fixture, generated source family, successful
provider request, runner registration or source sync does not establish a live
release. See [release engineering](../../evidence/0.4.0/release-engineering.md) and
the [infrastructure audit](release-and-infrastructure.md) for dated evidence.

## Preserve the worlds and player authority

- **G001:** preserve existing progress, access and normal timers alongside the
  agreed admission freeze.
- **G002:** keep sealed while future admissions remain undecided.
- **PTR:** use the actual owner's isolated entitlement for the new playable journey.

Provider administration, player identity and PTR entitlement are different
authorities. Never invent a player, receipt or token. Recheck authority after
asynchronous work and preserve exact command/retry identity, atomic settlement and
realm/database/session/epoch isolation.

The G002/PTR databases already exist. Current fresh-create publishers deliberately
reject existing targets; do not remove that refusal or manufacture fresh/empty
receipts. Existing updates need their own connected observation, publication,
preservation and reconciliation semantics. An unchanged old fingerprint after an
uncertain request cannot prove no effect: a program can change and change back.

The isolated historical rebuild did not match the recorded original artifacts.
Keep that limitation explicit. Exact predecessor-byte possession is not itself the
project's recovery requirement: the requirement is tested schema-compatible
recovery that preserves existing and subsequent writes. Evaluate a useful forward
recovery path; do not restore an old snapshot or call a schema-equivalent fixture
the exact deployed predecessor. Fresh authenticated program identity still belongs
at the actual update boundary.

G002 authentication has two transport paths. Direct HTTP uses the original bridge
JWT; the SDK exchanges it for a host-signed temporary token before WebSocket
subscription. Source `95ce45c` adds the correctly derived signed identity to the
G002 bridge token, preserving the existing module guards. Native HTTP and SDK
interoperability passed with synthetic local authority. This does not grant
production SQL ownership or establish a populated migration.


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


The complete generated consumer family for `95ce45c` was independently reproduced
and verified. Commit `6a5123ed7fde3e5e6b21114b895477f8c6b43a03` installs its
reviewed generated changes. All affected suites passed: 432 cases, no skips,
including the complete prepared-workflow suite. Tracked source and generated
output bytes remained unchanged during QA. Retained compiled inputs and bundles
were verified without rebuilding; that historical checkpoint retained the
`b306eed` preparation. The newer `d7798e6` prepare/check and QA are recorded above.
Final release preparation and required published-source CI remain separate.

## Continue in useful increments

1. **Complete the owner journey.** Follow the real generated bindings, provider,
   controller, module and keep UI. Improve decisions, pacing and feedback where
   actual observation identifies a weakness. Preserve already repaired refresh,
   Worker selection and placement-readiness behavior.
2. **Review the rendered game.** Work in the current `keep04` and Greater Realm
   owners, not dormant legacy renderers. Compare placement, construction and
   completion at desktop and narrow widths; test lifecycle and degraded states.
3. **Connect existing-database delivery and recovery.** Use actual module/state
   fixtures, complete provider adapters and honest receipts. Test preservation of
   writes made after planning and after deployment, including uncertain outcomes.
   Continue from the [recovery evidence](../../evidence/0.4.0/recovery.md).
4. **Settle and publish a coherent checkpoint.** Run affected checks, independently
   review authority/persistence changes, derive generated consumers through their
   owners, scan outgoing commits, push without force and verify GitHub equality.
5. **Finish deployment and acceptance.** Pass required CI and repository protections,
   deploy exact artifacts, inspect live behavior, and produce the credential-free
   workspace delivery package at `artifacts/delivery/0.4.0/` after the usable
   release is demonstrated; do not create new Desktop output.

Do not wait for production readiness to publish reviewed development work. Do not
repeat a full preparation just to restate its status: retain its exact source and
result, and derive again when a new release candidate is actually selected.

## Find the real owners and evidence

Start with the [handoff index](README.md), [repository map](repo-map.md),
[architecture](../../technical-architecture.md),
[ecosystem map](../../engineering/ecosystem-map.md) and
[source synchronization procedure](../../operations/0.4.0-development-sync.md).
Use the [Linux runner guide](../../operations/0.4.0-linux-runner.md) and
[native preparation runbook](../../operations/0.4.0-local-release-preparation.md)
for operating work. The [release acceptance record](../../operations/0.4.0-release-checklist.md)
lists the actual unresolved gameplay, preservation, presentation and deployment
evidence; unchecked historical task labels do not create new approval requirements.

The [engineering record](../../evidence/0.4.0/release-engineering.md) retains prior
commits, exact experiments, environment limitations and superseded CI results.
The [earlier handoff](https://github.com/ael-dev3/Warpkeep/blob/b306eedd8c4fe8f32661d89abc32f04938a5aa8e/docs/agent-notes/0.4.0/execution-handoff.md)
preserves the longer local-inventory and implementation history. Recheck historical
claims before operating; do not confuse retained evidence with present authority.

Root tests use Vitest; module and service tests have separate runners. Root
`tsc --noEmit` alone does not traverse referenced projects: run the real package
typecheck or both app/config checks. Verify selected tests and exit status, and
label fixtures, emulation, real devices and authenticated owner play distinctly.

Signed preparation observation now reaches the actual recovery candidate through
the genuine source/private-state capability, with exact receipt retention and
final freshness checks. The complete joined fixture passed: reservation and
configuration inputs reduce the missing set from six to the two native program
hashes. Earlier Windows timeouts are retained; only duplicate test inspections
were removed. The new program capability supplies those fields from its fixed native producer
and authenticated source/corpus ownership. The actual bundle now constructs and
imports with corrected checkout paths; existing engine regression checks pass.
Native execution of the fully bundled workflow remains to be established.

Terrace tops now use muted ground cover with subdued retaining stone. Matching
desktop/mobile and reduced-quality captures preserve rendering resources and
show no horizontal overflow; focused tests and types pass. This is a modest
visual improvement, not physical-device or complete visual acceptance.

## Quieter mobile resource status and native candidate verification

The keep now omits repeated zero-pending amounts and shows one quiet no-return status. Nonzero incoming amounts remain explicitly unspendable; balances and command semantics are unchanged. All 21 Keep04Screen tests and app/test types passed. Fresh empty/mature desktop and 390px synthetic renderer captures had no horizontal overflow. Nonzero pending and confirmed-return behavior are covered by component tests; physical-device performance remains unverified.

At the earlier source `c104f7b6368635ab6ae36da6ce02c3aa5a9c412d`, full native Linux prepare and the separate rebuilding check both exited successfully with identical family `f23eb885a62eea112e943b70a692b785da0a28b7b873fe2f0e39a59c1508740e`. That candidate had `finalReleasePrepared: false`, was not deployed, and predates the current UI and Linux G001 integration. The note later recorded `096d9c0` as its then-current Windows/GitHub checkpoint; the current branch tip is the live source. Native materializer/child execution and generated-closure audit remain open.

## Dedicated Linux caller and private-state integration

The operating workflow now uses the dedicated warpkeep UID/GID1000 profile and fixed native Node toolchain. Preflight and activation inspection run without OIDC; activation generation alone receives job-level OIDC. Exact operation/job context is retained and refreshed. Other realm provider operations still refuse because their real adapters remain unconnected.

Linux private records use the fixed account-owned .warpkeep/private/sealed-realms-v1 namespace; the public artifact reader follows it. Existing record descendants and non-Linux layout remain. No credentials or private records were migrated.

Combined app/test types and 57 focused tests passed on Windows;14 POSIX tests skipped. Separate operation/context/workflow checks and independent source review passed with documented Windows fixture seams. Corrected native caller fixtures passed6 portable cases;25 privileged cases still require Linux execution. Full candidate preparation/check at preceding c104 source does not validate these new changes. Native verification, runner registration, genuine operating authority and real provider adapters remain unfinished.

## 11 September 2026 — workspace output guard

The current development head is `9ace823626515fd2293c952a42bae7b929c90b60` on
`codex/prepared-keep-bindings-fix`. Windows, GitHub and the native
`/home/warpkeep/Warpkeep-0.4` checkout are clean and synchronized at this SHA.
The focused `tests/desktopHandoff.test.ts` suite passes 5/5 and now checks both
the documented retention rule and the current verification/production workflow
files. Those workflow files must not contain Desktop, OneDrive or localized
Desktop output paths, so a future workflow edit fails the suite before it can be
treated as a valid checkpoint.

The runtime paths already enforce the same boundary: recovery bootstrap rejects
repository, profile, Desktop, OneDrive and worktree private roots, while Keep04
QA captures are created beneath the checkout's ignored `artifacts/keep04-qa`
tree. Routine notes remain in their existing tracked documents, and a final
credential-free package is created only when delivery needs it under
`artifacts/delivery/0.4.0/`. No new Warpkeep Desktop file, handoff copy,
backup or archive was created during this checkpoint; the existing Desktop
handoff was updated in place to point to this SHA.

The Linux private preparation root currently retains historical run evidence;
it was not age-deleted because several candidates and receipts remain referenced
by acceptance records. Future cleanup must name an agent-owned disposable path,
verify that no operation or process uses it, and record the retention decision.
The new GitHub Verify run is still in progress for this head; CodeQL completed
successfully in run `34646882569`. No release or authenticated provider
operation is claimed. B0 and the legacy
prepared caller still require their separate Darwin-to-Linux migration, and the
owner PTR journey, physical-device checks, protected deployment and signed-history
merge remain open.

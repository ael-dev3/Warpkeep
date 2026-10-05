# Warpkeep 0.4 development handoff

Start with the [product direction](../../design/warpkeep-direction.md), then use
this index to find the implementation, current evidence, and next useful work.
The goal is a satisfying **gather → choose → build → benefit → return** journey
and a coherent Verdant Citadel, delivered as a dependable persistent game.

## Current operating decision — 5 October 2026

- **Release route.** Ship the owner PTR first at `warpkeep.com/ptr/`, preserve
  the live Alpha root and G001 state/admission policy, and keep G002 sealed.
- **Actions.** The current hold check reports GitHub Actions disabled with no
  active runs in Warpkeep, Warpkeep-Live, Warpkeep-Assets or
  Warpkeep-Water-Engine. Continue local validation and ordinary Git sync; do
  not treat a push as CI or deployment evidence. `Verify` listens to main and
  pull requests; Pages deployment listens to successful `Verify` pushes on
  main. Workflow dispatch and provider work remain separate operations.
- **Hydrology correction.** The owner-approved narrow policy is recorded in
  [issue #384 comment 5995094139](https://github.com/ael-dev3/Warpkeep/issues/384#issuecomment-5995094139):
  allow equal accumulation only when generated water goes strictly downhill;
  allow lower accumulation only when generated River/Stream flow terminates
  into a verified frozen Alpha Ocean endpoint. Keep every other check and all
  Alpha rows unchanged.
- **Sequence.** Validate and publish the reviewed source checkpoint, then
  generate a source-bound candidate with the maintained private workflow;
  complete its proof/selection, atlas publication, isolated PTR update, owner
  provisioning, bridge/frontend verification, cutover, and authenticated owner
  PTR plus Alpha acceptance in order. Never relabel an older seed or candidate.

## Current working state — 5 October 2026

The latest exact-source private search ran on signed `fee3832`. Its 256 attempts
produced no eligible package, shortlist, selection or provider operation. The
safe aggregate summary is recorded in [local operations](../../evidence/0.4.0/local-operations.md).
After the evidence commit was pushed, the maintained abort path returned
`checkpointAborted: true` and `productionUntouched: true`.
The signed source correction
`fee38320f81f54647e17ed8351b3f2a4b45199dc` is pushed to the release branch and
open draft PR #385. It considers non-Lowlands fallback bundles when both
Lowlands-repair siblings have own bundles but no compatible own pair, without
relaxing the existing caps or geometry and ownership proofs.
The hydrology correction, deterministic PTR frozen-water catalog, authority
repairs, and closure/test fixes remain committed and pushed. The old
`GR-A-WB4ATWJNGTDQCGGH` / H19/T03 candidate remains invalid and must not be
relabeled or resumed.

The diagnosis is read-only and source-bound: verifier receipt
`9561974f29bfb5236fd5c321069b3ceb9837d72210ff8215a26fc8ff5b5bbfa0` and
independent postcheck claim `4b9ac9ff5591fedc912852ec1c337311ea154d57d484e1ea05501f491e486fcd` found 15 generated-to-generated equal-flow
joins whose surface strictly falls and seven generated River/Stream joins
that discharge into verified frozen Alpha Ocean terminals. All other
hydrology, terrain, direction, body and Alpha-row checks remain mandatory.
The implementation mirrors this exact policy in the offline candidate
verifier, shared live authority and isolated PTR verifier, backed by a
deterministic frozen-water catalog.

Native targeted validation passes 455 cases across the 13 affected files,
including the full 8-case PTR prepared-closure file on the exact `e1ac103`
source. The checked-in sealed-launch gate passes in preparation mode and the
protected browser closure verifies all 1,271 members. Windows root/PTR builds,
module verification, frozen catalog checks, and focused hydrology/PTR suites
also pass. The full runtime-release suite retains its Windows private-temp ACL
limitation; its guard is unchanged. GitHub Actions remains disabled, so these
are local checks, not hosted CI or deployment evidence.

The exact-source private search on `e1ac103` exhausted 128 ordinals. Two fresh,
source-bound searches on `cff3479` and documentation-only successor `c7c494b`
then exhausted all 256 supported ordinals each with
`GREATER_REALM_CANDIDATE_BATCH_INCOMPLETE`. Their safe profiles are nearly
identical: respectively 96/95 dry-gate apron no-matches, 52/51 search-node
limits, and 36/34 missing capacity assignments. The c7 run recorded 223
geography rejections and 33 proof rejections. This confirms the bounded
Tier-II apron/capacity solver is a systemic blocker, not a seed-specific event.
Full safe counts are in [local operations](../../evidence/0.4.0/local-operations.md).
No eligible package, shortlist, selection, atlas publication or provider
operation resulted. The cff, c7 and c5 checkpoints have each been retired
through the maintained abort command after their safe summaries were
synchronized (`checkpointAborted: true`, `productionUntouched: true`). The older
retained-seed checkpoint remains bound to `19b3422`; preserve it without
relabeling or seed import.

Next: inspect the assignment-missing profile for a concrete, policy-preserving
correction before another bounded batch.
Do not claim causal improvement from
different fresh-seed samples. Keep private output private. If a candidate
passes, verify its package and shortlist before separate owner selection.
Preserve the one-winner import rule, rollback artifacts, Alpha and licensing.
The [execution handoff](execution-handoff.md) is authoritative for the ordered
release path. Earlier dated sections below are history.

## Current operating decision — 3 October 2026

- **Route.** 0.4 ships owner PTR first, at `warpkeep.com/ptr/`.
  - The Alpha root, G001 state, timers and admission policy are preserved.
  - G002 stays sealed.
  - A wider rollout is separate later work.
- **Why Cloudflare.** The private repository's included hosted Actions allowance is exhausted, and Actions stays disabled under the current policy. This route therefore doesn't use hosted Verify, protected workflow dispatches or branch Pages. It uses the Cloudflare route that the owner chose instead. Each provider action follows the owner's current instructions; this note records the route and grants no permission.
- **Steps:**
  - P1: native `warpkeep-ptr` update and owner provisioning (Codex);
  - P2: a native PTR-only bridge binding (Codex);
  - P3: `/ptr/` publication on Cloudflare Pages, with mobile validation (Claude).
- **Coordination.** Ownership, results and blockers are tracked in [issue #384](https://github.com/ael-dev3/Warpkeep/issues/384).
- **Preview.** The Pages preview at `warpkeep.pages.dev` (source `a89173f9`) only proves the delivery route.
  - It isn't the accepted final source.
  - The custom-domain cutover follows a successful final postflight.

The current session's user instructions remain authoritative.

## Current working state — 3 October 2026

This checkpoint integrates the authentic PR #386 (`ad4879ce`), #387
(`00b5e517`) and #388 (`1fa2ac2c`) heads with the P1 private-source-clone
repair and P2 scoped native bridge caller, on signed quality base `f06bb380`.
Resolve the latest signed HEAD/tree and publication from Git and its receipts.
Main `cb282bab` is unchanged and [PR #385](https://github.com/ael-dev3/Warpkeep/pull/385)
remains draft. Alpha 0.3.43 is live; authenticated owner `/ptr/` is unpublished.

The 3,449-file integration passed fifteen complete files with 344 cases and
related types/syntax. The final P2 privacy repair then passed its complete
31-case file, all three type checks and core syntax, with independent process/
source/Git closure. The earlier strict type failure is retained in the handoff;
its heavyweight receipt-parser import was replaced with the pure owner-input
helper. Supported family reproduction held all 16 outputs, with no further
generated change after the privacy correction. These are scoped local results,
not full native authority or provider execution.

P1 and P2 have not updated the realm or auth Worker. After clean signed
publication, continue the inline PTR compatibility bootstrap, owner provisioning
and scoped direct-native bridge route. The clone repair preserves G001's builder
guard. Actual ABI, nonbreaking token, durable no-replay and provider readback
checks remain required; full 102-output preparation and unrelated hosted permits
are separate from this isolated caller.

The latest [Pages preview](https://a4e3a104.warpkeep.pages.dev) uses prior base
`f06bb380` and preserves Alpha root bytes. Claude's pinned postflight reports
800 files/two fallbacks; root independently sampled Alpha bytes and PTR HTTP 200.
It is not a domain cutover, PTR auth or owner/mobile acceptance. The decision
block's `a89173f9` preview records the earlier trial. Codex/root retains final
integration/delivery authority; Claude contributes P3 through
[issue #384](https://github.com/ael-dev3/Warpkeep/issues/384).

Use the [handoff](execution-handoff.md) for exact receipts and next operations.
Actions remains held under its runtime policy.

## Previous integrated work — before f06 publication, 3 October 2026 (superseded)

Signed `da3e057f` / tree `02164ba0` is the verified base for this
checkpoint; resolve the latest HEAD/tree and guarded native source from Git.
Genuine prepare/check at the signed base completed with matching results
(`90eb8e1b`, receipt `604b840c`), and independent post `e06d20bb` closed its
original process group with source/index/refs preserved. The guarded native integration contains the authentic PR #383 merge,
maintenance, PTR compatibility, G001 refreeze and notes. Resolve its exact
signed checkpoint/publication from Git and receipts; the earlier base
preparation does not cover the combined source. Main `cb282bab` is unchanged; [PR #385](https://github.com/ael-dev3/Warpkeep/pull/385)
is draft and supersedes #380/#381.

The maintenance overlay passed 52 complete cases and its type checks. The
explicit G001 refreeze passed 170 cases; PTR compatibility/bootstrap passed
39 focused cases and its type checks. Supported metadata derivation reproduced
all 16 family outputs, without recompiling the integrated source. The ordinary
focused aggregate reported 393 passed, zero failed and 29 skipped; its strict
overall result remains failed because the namespace cases could not run there.
The separate installed namespace run reported 260 passed, zero failed and one
declared unsupported-runtime negative-control skip (`84a572de`, independent
post `edb305c3`). Raw skipped is still skipped. These are scoped local checks,
not complete native authority, backend update or release acceptance.

Alpha 0.3.43 remains live and authenticated owner `/ptr/` unpublished. Codex owns the clean-source PTR compatibility bootstrap: genuine inline
artifact/ABI validation, authenticated nonbreaking prepublish token, one
durably marked guarded update and two complete poststate reads. Old private
SQL 403 leaves programBefore/rowsBefore unknown (`null`); do not invent
private before-state or require it before bootstrap. Codex then owns the
existing auth Worker's direct owner caller path. Do not substitute unrelated GitHub-bound
settings for that caller contract. Claude owns the frontend/mobile preview; its
current Cloudflare preview is from an older source, not the Alpha domain
cutover or actual owner acceptance. Preserve G001 state, timers and admission
freeze, and keep G002 sealed. Unrelated G002/notification deployments and
global S/F/A remain separate. The previous PTR SQL 403 and missing bridge PTR
bindings stay open until supported reads prove otherwise.

Use [issue #384](https://github.com/ael-dev3/Warpkeep/issues/384) for exact
head and completion coordination. Claude works in a separate Windows checkout;
Codex owns the guarded native operation. The already integrated #375–#378
branches are provenance, not extra merges. Read the
[handoff](execution-handoff.md) for full receipt scope and next actions. Check
SpacetimeDB `login show` before `list --yes`; a logged-out list can initialize
an anonymous identity.

## Previous working state — earlier 3 October 2026 (superseded)

Published signed quality source `a89173f9` / tree `e3cf809b` follows game baseline `a0f6a55f`. Resolve subsequent repair checkpoints from Git. Main `cb282bab` and PRs #380/#381 remain separate. Alpha 0.3.43 is live; authenticated owner PTR remains unpublished. Actions is held disabled; the current runtime policy governs remote actions.

Initial-owner inspection/update passed 139 tests and types (`276442df`, independent post `3bd626b9`). The completed relocation run passed all 79 original cases within their maintained bounds (`fc0cb87e`, post `d43bbb94`); its preserved assertions and native structuredClone remain intact. Remaining module coverage and full release acceptance are open.

The first real prepare/check at this source failed before compilation. A genuine materialization diagnostic isolated rejection of a valid Git 100755 executable. The repair preserves exact 100644/100755 bytes and modes while retaining nonregular-file rejection. All 21 native regression cases and root/module types pass (`9fba62b8`, post `6c379b10`). The supported family changed five metadata outputs, reproduced all 16 and passed protected/static policies (`00dab22d`, post `2a5b8518`). Metadata is not compiler success: retry genuine prepare/check from the clean signed repair checkpoint.

Actual PTR inspection fails at the first SQL request with HTTP 403 / INVALID_PTR_OWNER_SESSION. Metadata/schema reads succeed, and the stored publisher identity matches the database owner. Pinned CLI SQL reproduces the same connection-gate refusal. This is neither a missing login nor a parser error; preserve the failed receipts and resolve the publisher/module compatibility before claiming before-state observation or update readiness. Latest auth Worker also lacks PTR and managed-owner bindings. See [handoff](execution-handoff.md) and [local operations](../../evidence/0.4.0/local-operations.md) for evidence and recovery order.

## Historical working state (superseded)

The former working-state text and its follow-up directions below are retained history; the current section supersedes them.

## Current working state

The [execution handoff](execution-handoff.md) is the single dated record of
current main, active source, CI receipts and operation results. Read its latest
checkpoint before acting; older checkpoints below it are historical evidence.
The private-repository plan currently provides neither branch protection nor
CodeQL code scanning. Read the [current Actions policy](../../operations/github-actions-budget.md)
before following historical hosted-Verify directions. Actions is globally
disabled; complete local verification is being integrated with the existing
release callers. Selected local diagnostics do not authorize deployment. The
intended route retains genuine GitHub dispatch/OIDC for bounded operations.
The maintained verifier and explicitly closed native consumer retain real local reports without granting production authority. Signed `5cddb1a7` / tree `f2b1e73e` is the published clean baseline. Its maintained namespace run passed 260 assertions with one known source-declared skip; that skip is not a pass. The full ordinary run completed with 12,970 passes, 11 failures and 68 skips, then failed canonical-index preservation. It did not time out.

This coherent repair checkpoint descends from the published baseline and integrates eleven reviewed repair candidates plus five mechanically derived metadata changes; its signed identity must come from actual receipts. The completed focused run covers 15 whole files: 715 passed, nine failed and none skipped or unfinished of 724 assertions. Its first group retains nine notification clean-checkout failures; the other groups passed 400 and 194 cases. App/all-tests types and three module syntax checks returned normal 0/null. Independent cleanup preserved the focused source/index/refs, but the aggregate remains failed. Rerun the complete 20-case notification file from a clean local signed checkpoint and retain closure before remote backup, without weakening its guard. A separate three-mode unprivileged sleep-fixture crash rehearsal passed independent audits; maintained connected execution remains closed.

Completed service evidence at `41e760fe` remains 2,069 assertions across 76 files plus five separate type/declaration checks. Genuine development preparation retains its `b9ca8ca7` scope. The opt-in public workflow is not installed or deployed. Complete native/dependency coverage, authenticated transport, prepared reuse and cumulative hosted admission remain open. Read the current handoff for actual failures and the next source-bound checks.

Recheck that accepted main still names the exact verified source before each
operation. Source changes to the release workflow require a fresh native
prepare/check and generated-only promotion before live observations.
Preserve failed census attempts and never reuse their identities. Pages
classification does not establish deployment, owner play or device acceptance.

The Keep04 gather → choose → build → benefit → return foundation, readable
expedition/return feedback, first-journey cue and mobile visual foundation are
implemented and covered by focused tests. Exact test results belong to the
source and platform recorded in the execution handoff and linked evidence.
Earlier connected probes and synthetic captures retain their original source;
they do not automatically attest later presentation changes.

Checkouts may legitimately track different published branches or immutable
native inputs; use the [checkout roles](../../operations/0.4.0-development-sync.md#start-from-the-actual-checkout-and-remote).
The sync automation is paused and routine
notes belong in the repository; use the existing checkouts and ignored
`artifacts/` directory, and create no Desktop siblings, backups or archives.
Development and live release remain separate: private activation authority,
G001 observation, PTR observer/readback, provider deployment/recovery,
owner-only PTR play, physical-device performance and final release freeze are
still open.
## Find the right starting point

| Need | Read | Outcome |
| --- | --- | --- |
| Understand the game | [Direction](../../design/warpkeep-direction.md), [roadmap](../../design/roadmap.md) | Player promise, 0.4 focus, and later opportunities |
| Find code and its owner | [Repository map](repo-map.md), [architecture](../../technical-architecture.md) | Real entry points, callers, state authority, and generated boundaries |
| Improve play and appearance | [Gameplay and visuals](gameplay-and-visuals.md) | Working behavior, specific defects, missing evidence, and useful next probes |
| Apply the full inspiration library | [Visual foundation contract](visual-foundation-contract.md) | Reference-to-source decisions, mobile rules, review states, and evidence limits |
| Continue the living vale and world | [Living realm](living-realm.md) | Keep vale, ambient life, world daylight, own journeys, steward advice, budgets and limits |
| Continue daylight, sound and keep-screen craft | [Craft and atmosphere](craft-and-atmosphere.md) | Local-hour daylight for keep and world, night glow, ground contact, shore and verges, 0.4 sound cues and the keep soundscape, keep-screen design |
| Check bug, security and reliability status | [Hardening audit](hardening-audit.md) | PTR device-clock lease and in-place reconnection fixes, deferred observations, reviewed-sound areas, dependency advisories |
| Complete delivery | [Release and infrastructure](release-and-infrastructure.md) | Current services, CI, operating gaps, and verification routes |
| Continue this checkout | [Execution handoff](execution-handoff.md), [source synchronization](../../operations/0.4.0-development-sync.md) | Current checkpoint, environment traps, reviewed publication, and next actions |
| Follow the daily release sequence | [Next work](next-work.txt) | Compact, tracked action brief; the repository copy is canonical and no Desktop duplicate is created |
| Resolve access or request owner help | [Connection and resumption guide](../../operations/0.4.0-infra-access.md#resume-without-guessing) | Correct account, target and caller; exact unmet prerequisite and smallest human action |
| Recover from a known delivery failure | [Known blocker recovery paths](../../operations/0.4.0-infra-access.md#known-blockers-and-recovery-paths) | Observed symptom, owning repair and confirming check; reuse existing credentials and retained evidence |
| Keep local storage compact | [Output locations and retention](../../engineering/development-workflow.md#output-locations-and-retention) | No new Desktop files; reuse tools/checkouts, bound disposable output, preserve recovery evidence |
| Work across repositories | [Repository ecosystem](../../engineering/repository-ecosystem.md) | Runtime, asset archive, planned tools, and public profile ownership |
| Judge release readiness | [Release checklist](../../operations/0.4.0-release-checklist.md), [evidence](../../evidence/0.4.0/) | Required results tied to source and actual deployed artifacts |

## How to use the findings

Retain strong foundations and improve weak behavior based on evidence. The owner
explicitly authorizes product and architecture improvements that advance the game;
old plans do not impose arbitrary restrictions. Record changes to settled behavior
in its specification and relevant tests so the next contributor understands why.

Source inspection, local tests, synthetic rendered scenes, physical-device play,
authenticated provider observations, and actual owner acceptance establish
different facts. Each finding must say what was observed and what remains unknown.
Never replace missing live evidence with a fixture or a plausible release record.

Source publication is a normal development step. Keep this index, the execution
handoff and the dated evidence aligned with the actual branch and deployed state;
none of them should turn missing provider or owner evidence into a release claim.

## Coverage and limits

The study mapped tracked source, browser entry points, keep/world rendering,
gameplay and schemas, identity, Cloudflare services, release/recovery callers,
generators, tests, asset manifests, and current documentation. Independent reviews
covered gameplay/presentation, backend ownership, and delivery infrastructure.
Historical plans and generated/binary artifacts were classified by role; this is
not a claim to have inspected every media byte or independently security-audited
every dependency.

Keep private probes, credentials, player records, provider stores, and disposable
build output outside public evidence. Preserve existing local work. Detailed
commands and historical results remain in the linked notes, with dates and scope.

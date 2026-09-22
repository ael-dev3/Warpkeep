# Warpkeep 0.4 development handoff

Start with the [product direction](../../design/warpkeep-direction.md), then use
this index to find the implementation, current evidence, and next useful work.
The goal is a satisfying **gather → choose → build → benefit → return** journey
and a coherent Verdant Citadel, delivered as a dependable persistent game.

## Current working state

The [execution handoff](execution-handoff.md) is the single dated record of
protected main, active source, CI receipts and operation results. Exact protected
main is generated-only M2 `8b4fa5ee08048878fa88973f3cd72900a1a1b84a`; its push
Verify `35766416370` and read-only preflight `35772760378` passed. The following
read-only G001 policy observation `35772933637` failed because a valid
older-source receipt occupied the active slot. Source-only PR #337 carries the
retry-safe recovery. Read its live checks before merging; then prepare/check the
exact M1, promote its generated-only M2, and repeat preflight and policy
observation on that source. Source CI and Pages classification do not establish
provider deployment, owner play or device acceptance.

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
| Complete delivery | [Release and infrastructure](release-and-infrastructure.md) | Current services, CI, operating gaps, and verification routes |
| Continue this checkout | [Execution handoff](execution-handoff.md), [source synchronization](../../operations/0.4.0-development-sync.md) | Current checkpoint, environment traps, reviewed publication, and next actions |
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

# Warpkeep 0.4 development handoff

Start with the [product direction](../../design/warpkeep-direction.md), then use
this index to find the implementation, current evidence, and next useful work.
The goal is a satisfying **gather → choose → build → benefit → return** journey
and a coherent Verdant Citadel, delivered as a dependable persistent game.

## Current working state

The [execution handoff](execution-handoff.md) owns the dated accepted source,
Verify/CodeQL results and successful read-only preflight. Pages classification
deliberately skips deployment while `pagesDeploymentApproved:false` is set.
Provider-backed deployment, recovery/readback, actual-owner play, device
acceptance and final-freeze evidence remain open. The recorded live baseline
remains Genesis.

The [execution handoff](execution-handoff.md) owns exact source, CI, native
and environment identities. Keep the product direction and evidence below
aligned to this checkpoint; historical source families remain historical.

- **Development and live release are separate.** `main` contains the 0.4
  development source alongside preserved G001 behavior. The integrated 0.4
  release is not shipped, and synthetic or local rehearsals do not establish
  live authority.
- **The player journey has a clear foundation.** Keep/atlas navigation, Worker
  dispatch and return feedback, construction state, session renewal, the
  gather → choose → build → benefit → return rail, readable dispatch-return
  timing and the first-journey cue are implemented and covered by focused tests.
  Refresh keeps the scene and focus available while authoritative commands remain
  guarded.
- **The Verdant Citadel presentation is under integrated review.** Lightweight
  voxel scenery, layered terrain, water restraint, readable building hierarchy
  and mobile layout decisions are recorded in the visual contract and current
  evidence. Synthetic browser review is useful for layout; physical-device,
  performance and owner acceptance remain open.
- **Delivery has working foundations and specific gaps.** Generated bindings,
  recovery callers, Linux verification, protected-main promotion and sealed
  preflight are connected, and publisher login has been restored. Operation-specific private authority, live recovery
  readback, G001 preservation, sealed G002 evidence, owner-only PTR play and
  final deployment remain to be verified.
- **Preserve each realm's purpose.** Keep G001 progress and its admission
  freeze, keep G002 sealed while admissions remain undecided, and use the
  actual owner's isolated PTR for the new playable journey.

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

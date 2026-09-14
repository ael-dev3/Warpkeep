# Warpkeep 0.4 development handoff

Start with the [product direction](../../design/warpkeep-direction.md), then use
this index to find the implementation, current evidence, and next useful work.
The goal is a satisfying **gather → choose → build → benefit → return** journey
and a coherent Verdant Citadel, delivered as a dependable persistent game.

## Current working state

Protected `main` is `c0e1d2d667ced3d3613ee32ab9ce28001fc2914f`, the exact
protected squash merge of PR #254, a documentation-only checkpoint on the
gameplay/source checkpoint `d0af28e924f187ab91fee9390c9a6b56389d2043` (PR #253).
PR #255 is the current open documentation and generated-family alignment pull
request at head `8331875b1110e3097c7659d1388a7243cde2877c`; CodeQL
`34816061714` has passed and Verify `34816061716` is still running. This proves
source and protected CI rails, not a live 0.4 deployment. The
[execution handoff](execution-handoff.md) owns exact source, CI, native and
environment identities.

PR #252 adds a narrow-canvas façade-biased overview and preserves manual camera
orientation and vertical framing across resize. It is presentation-only:
footprints, picking, placement authority, progression and asset budgets stay
unchanged. GitHub Pages run `34810674281` classified the gameplay/source
checkpoint but skipped build, deploy and live verification under the current
release classification; warpkeep.com still serves
the established Genesis UI. Treat live 0.4 as not shipped until owner/provider,
recovery and deployment evidence is complete.

The fresh protected-main sealed-realms preflight `34813075520` passed runner,
checkout and source attestation, then failed at bundle validation against the
older preparation input `27c2d276`; no provider, realm, owner or deployment
mutation occurred. A new Linux native preparation and independent check now
completed for exact source `c0e1d2d667ced3d3613ee32ab9ce28001fc2914f` using
candidate `release-workspace-6c6d10e57c03ce0ead8c3ac35b285a19`: 3,229 source and
candidate files, 102 outputs, family SHA-256
`593fdb280394632d0d3302b5fa127f162c1ef145b58b3f16be593c2021adce7c`, closure
manifest SHA-256 `65a8c8feb58a2b432af919fc80b0c902b69efebf947e35ed87349711c94e2335`,
and `finalReleasePrepared:false`. The generated-only refresh is published in
PR #255; rerun protected preflight after its reviewed merge.

- **Development and live release are separate.** `main` contains the 0.4
  development source alongside preserved G001 behavior. The integrated 0.4
  release is not shipped, and synthetic or local rehearsals do not establish
  live authority.
- **The player journey has a clear foundation.** Keep/atlas navigation, Worker
  dispatch and return feedback, construction state, session renewal, the
  gather → choose → build → benefit → return rail and the new first-journey cue
  are implemented and covered by focused tests. Refresh keeps the scene and
  focus available while authoritative commands remain guarded.
- **The Verdant Citadel presentation is under integrated review.** Lightweight
  voxel scenery, layered terrain, water restraint, readable building hierarchy
  and mobile layout decisions are recorded in the visual contract and current
  evidence. Synthetic browser review is useful for layout; physical-device,
  performance and owner acceptance remain open.
- **Delivery has working foundations and specific gaps.** Generated bindings,
  recovery callers, Linux verification, protected-main promotion and sealed
  preflight are connected. Genuine provider/publisher authority, live recovery
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

# Warpkeep 0.4 development handoff

Start with the [product direction](../../design/warpkeep-direction.md), then use
this index to find the implementation, current evidence, and next useful work.
The goal is a satisfying **gather → choose → build → benefit → return** journey
and a coherent Verdant Citadel, delivered as a dependable persistent game.

## Current working state

This refresh was inspected on 2026-09-07 against development source `781e51e`
and the documentation changes accompanying this note. Recheck Git and live
providers before acting on dated observations.

- `main` is the public G001 baseline. Current 0.4 implementation is on
  `codex/prepared-keep-bindings-fix`, associated with draft
  [PR #228](https://github.com/ael-dev3/Warpkeep/pull/228).
- The server-owned gameplay core, typed client, realm isolation, and keep
  presentation are substantial working foundations. Their presence does not
  establish a complete live owner journey.
- Healthy snapshot refresh now retains the keep scene and focus (`555e505`).
  Session expiry, meaningful pacing on real routes, complete visual/device
  coverage, and connected release operations still need evidence and work.
- GitHub and configured Cloudflare/SpacetimeDB metadata reads work in the current
  session. Earlier network-denial notes describe an older session.
- G002 and PTR databases already exist. Production workflows retain Mac-specific
  dependencies even though native CI has moved to Linux.
- 0.4 is **not shipped**. Preserve the live G001 game and its admission freeze,
  keep G002 closed, and use the isolated owner's PTR for real 0.4 acceptance.

## Find the right starting point

| Need | Read | Outcome |
| --- | --- | --- |
| Understand the game | [Direction](../../design/warpkeep-direction.md), [roadmap](../../design/roadmap.md) | Player promise, 0.4 focus, and later opportunities |
| Find code and its owner | [Repository map](repo-map.md), [architecture](../../technical-architecture.md) | Real entry points, callers, state authority, and generated boundaries |
| Improve play and appearance | [Gameplay and visuals](gameplay-and-visuals.md) | Working behavior, specific defects, missing evidence, and useful next probes |
| Complete delivery | [Release and infrastructure](release-and-infrastructure.md) | Current services, CI, operating gaps, and verification routes |
| Continue this checkout | [Execution handoff](execution-handoff.md), [source synchronization](../../operations/0.4.0-development-sync.md) | Current checkpoint, environment traps, reviewed publication, and next actions |
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

The owner's current sequence is to finish and publish the GitHub/profile/project
documentation refresh before resuming gameplay shipping. Source publication is a
normal development step; it does not require claiming the release is ready.

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

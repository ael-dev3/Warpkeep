# Warpkeep 0.4 development handoff

Start with the [product direction](../../design/warpkeep-direction.md), then use
this index to find the implementation, current evidence, and next useful work.
The goal is a satisfying **gather → choose → build → benefit → return** journey
and a coherent Verdant Citadel, delivered as a dependable persistent game.

## Current working state

Updated 2026-09-08 for the source integration following `1277cc8`: real S/V2
source authentication, durable G001 policy capture, fixed GitHub Verify readback,
CI regressions and continuous Greater Realm water. The earlier generated family
was prepared from `f558bd5`; it cannot attest these new compiled inputs. Read the
[execution handoff](execution-handoff.md) and dated evidence for actual preparation,
verification and publication results. The original `781e51e` audit is historical.

- `main` is the public G001 baseline. Current 0.4 implementation is on
  `codex/prepared-keep-bindings-fix`, associated with draft
  [PR #228](https://github.com/ael-dev3/Warpkeep/pull/228).
- The server-owned gameplay core, typed client, realm isolation, and keep
  presentation are substantial working foundations. Their presence does not
  establish a complete live owner journey.
- Healthy snapshot refresh retains the keep scene and focus (`555e505`). Active
  PTR continuation now obtains fresh scoped authority at hard expiry (`c990a3b`)
  without replaying commands. Presentation-only Mini App changes preserve the
  session; observed identity/authority changes revoke it (`d088ec1`). Actual owner renewal, meaningful pacing on real
  routes, complete visual/device coverage and live acceptance still need evidence.
- GitHub and configured Cloudflare/SpacetimeDB metadata reads work in the current
  session. Earlier network-denial notes describe an older session.
- G002 and PTR databases already exist. The Linux recovery Pages caller is
  implemented (`c51bb00`). Its [registered Linux runner](../../operations/0.4.0-linux-runner.md)
  was online and idle on September 8, with the dedicated account and private root
  installed. Signer authorization, live provider inputs and operating acceptance
  remain unfinished. Other production lanes retain Mac-specific dependencies.
- The [local source assembler](../../operations/0.4.0-local-release-preparation.md)
  now connects fixed compilers, complete generated consumers, independent byte
  verification and durable candidate recovery. The activation lane has a fixed
  V2 generator and receipt-based reconciliation. The receipt reader now resolves
  its candidate-construction cycle; authenticated canonical candidate/provider
  producers remain unfinished. See the dated
  [engineering evidence](../../evidence/0.4.0/release-engineering.md) before
  assessing the completed native prepare/check from `f558bd5`, subsequent
  generated-source integration and separate remaining operating/CI defects.
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

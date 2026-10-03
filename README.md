# Warpkeep

**A real person. A permanent keep. A world worth returning to.**

Warpkeep is a persistent strategy world connected to Farcaster. Workers travel
across the landscape, resources come home, and a keep becomes a place shaped by
its Keeper's choices. We are building a game that makes the first session
satisfying and the next visit worthwhile.

[Play the current Alpha](https://warpkeep.com/) · [0.4 delivery status](docs/operations/0.4.0-live-delivery-status.md) · [Follow development](https://github.com/ael-dev3/Warpkeep/pulls)
· [Product direction](docs/design/warpkeep-direction.md) · [Documentation](docs/README.md)

## The next chapter

Warpkeep 0.4 brings the game together around a clear loop:

**Gather → choose → build → benefit → return.**

Choose where your Workers travel and when they return. Turn the resources they
bring home into a useful improvement. See that improvement change your keep
and make the next journey or construction project better. Return to a place
that remembers your effort and offers another worthwhile decision.

Our aim is a satisfying first session and meaningful choices beyond it.
Clear feedback, dependable progress, thoughtful pacing and comfortable mobile
controls are central to that experience. The 0.4 scope is a polished visual
foundation and dependable loop; deeper simulation, freeform editing and social
systems remain later milestones.

## The Verdant Citadel

The visual direction is an inviting town diorama: pale masonry, dark timber,
oxidized-teal roofs, restrained violet warp accents and warm signs of activity.
Layered forest, lightweight voxel scenery and shallow water frame the keep
without obscuring the decisions inside it.

We judge the result in the rendered game—its composition, readability, motion
and responsiveness. Detail should serve the experience on a phone as well as
on a desktop. Reused assets retain their original credits and permissions.

## Where development stands

**Alpha 0.3.43 is live; the authenticated 0.4 owner PTR remains unpublished.**
The published quality source is `a89173f9`, following game integration
`a0f6a55f` on `release/0.4-living-realm-quality`. Initial-owner update checks
and all relocation cases pass locally. The release builder's handling of Git
executable files has also been repaired and regression-tested. Full compilation
and owner delivery still need verification.

The current PTR module rejects the database publisher's connection before it can
inspect private state. Resolving that compatibility issue and preserving existing
data are the next backend tasks. Follow the
[execution handoff](docs/agent-notes/0.4.0/execution-handoff.md) for actual results,
known blockers and the next step.

The 0.4 foundation and reviewed contributions have been integrated into main
through [PR #374](https://github.com/ael-dev3/Warpkeep/pull/374) and
[PR #379](https://github.com/ael-dev3/Warpkeep/pull/379). Existing PRs #375–#378
are already included; their older heads must not be merged again.

The candidate brings together:

- The Verdant Citadel 3D menu, castle presentation and Hegemony banners ([#375](https://github.com/ael-dev3/Warpkeep/pull/375)).
- The owner-eligible castle-film action ([#376](https://github.com/ael-dev3/Warpkeep/pull/376)). Its large video remains
  external and click-to-load.
- Sealed Genesis 002 soundtrack wiring ([#377](https://github.com/ael-dev3/Warpkeep/pull/377)). G002 remains inaccessible;
  the soundtrack derivative's source terms are unresolved.
- Hash-pinned Greater Realm tree models ([#378](https://github.com/ael-dev3/Warpkeep/pull/378)). The app uses local runtime
  copies; the private Warpkeep-Assets source archive is a provenance record, not a
  runtime download dependency.

The existing gather, Worker dispatch and return, building, construction and
persistent-progress loop remains the gameplay foundation. The PTR has a
dedicated lazy-loaded gameplay host that preserves /ptr/ routing and checks its
owner/session capabilities. No candidate change opens Genesis 002 admissions
or widens the Genesis 001 admission freeze.

The [execution handoff](docs/agent-notes/0.4.0/execution-handoff.md) and
[local operations](docs/evidence/0.4.0/local-operations.md) record completed
local checks, preserved failures and the next delivery step. Each result
retains its actual source scope. Complete release verification, actual-owner
play and final production performance remain open.

The connected local PTR lane exercises the real module and client with normal
server timers and synthetic authority/atlas. Gathering, construction, improved
return, exact retry, manual fixture-session renewal and client reconnection pass.
Automatic Quick Auth expiry through the real browser host still needs the planned
owner acceptance. Actual-owner play, production-atlas pacing and physical-phone
performance remain release requirements. Earlier fixture tests, full suites and
rendered captures retain their original source scopes. The build's existing
RealmMapScreen size warning remains under measurement.

The 3 October readback still finds Alpha live and the owner PTR unpublished.
GitHub Actions remains disabled across the Warpkeep repositories under the
[current operating policy](docs/operations/github-actions-budget.md). Development
continues through local validation and signed, scanned, synchronized checkpoints.
That integration baseline passed the maintained checks, all three production build
variants and the production exclusion check for local QA pages. A real Chrome
fixture also confirmed construction motion respects reduced quality and explicit
reduced motion. These are bounded local results; foreground audio, complete native
coverage, authenticated owner play and physical-device performance remain open.
The [handoff](docs/agent-notes/0.4.0/execution-handoff.md) records those limits and
the next delivery step.

| Realm | Purpose |
| --- | --- |
| **Genesis 001** | Preserve the established world, player progress and agreed admission freeze. |
| **Genesis 002** | Keep the successor realm sealed while its future admissions remain undecided. |
| **Owner PTR** | Exercise the new playable experience in an isolated realm before broader release. |

The [execution handoff](docs/agent-notes/0.4.0/execution-handoff.md),
[delivery status](docs/operations/0.4.0-live-delivery-status.md), and
[release checklist](docs/operations/0.4.0-release-checklist.md) track current
evidence and exact gates. The [development brief](docs/agent-notes/0.4.0/next-work.txt)
keeps the next action concise; release status belongs to the linked handoff and
checklist.

The merged [Warpkeep-Assets PR #41](https://github.com/ael-dev3/Warpkeep-Assets/pull/41)
carries the source archive for the biome trees; [PR #40](https://github.com/ael-dev3/Warpkeep-Assets/pull/40)
is a study reference with rights still unverified. These archives are now in
the Assets repository; their publication does not change the app's hash-pinned
local runtime models. The Genesis 002 soundtrack
archive is tracked separately in [Warpkeep-Assets PR #38](https://github.com/ael-dev3/Warpkeep-Assets/pull/38).
Review the linked provenance records before changing or republishing any source
asset.

## Build with us

`main` remains the integrated baseline from PRs #374 and #379. Existing
[PR #380](https://github.com/ael-dev3/Warpkeep/pull/380) and
[PR #381](https://github.com/ael-dev3/Warpkeep/pull/381) remain separate from the
reviewed quality branch. [PR #382](https://github.com/ael-dev3/Warpkeep/pull/382)
has merged into `release/0.4-living-realm-quality`; it is not a deployment or a
merge into `main`. Start from the actual branch and current
[execution handoff](docs/agent-notes/0.4.0/execution-handoff.md) before editing.

For a fresh independent checkout, use Git, Node 22 (22.13 or newer within that
major) and npm 10.9.8:

```sh
git clone https://github.com/ael-dev3/Warpkeep.git
cd Warpkeep
git switch -c my-change
npm ci
npm run dev
```

Open the local address printed by Vite. To inspect a synthetic keep, open
`/dev/keep04-qa.html?scenario=all-six-level-five&quality=high` on that same local
origin. The fixture demonstrates presentation; it does not connect a real owner
or establish live gameplay acceptance. Follow [Contributing](CONTRIBUTING.md)
and [the development workflow](docs/engineering/development-workflow.md) for
setup, verification, and existing-worktree guidance.

After building a reviewed candidate, `npm run qa:menu-entry` checks its current
production menu across desktop and mobile layouts. Inspect the saved views;
this check does not establish authenticated gameplay or phone performance.
Warpkeep and Tervain share suitable assets and rendering techniques while keeping
their game rules and worlds separate; follow the
[repository ecosystem](docs/engineering/repository-ecosystem.md#sharing-with-tervain)
for source ownership, provenance and reuse.

Stop the development server with `Ctrl+C` in its terminal.

| I want to… | Start here |
| --- | --- |
| Understand the game and its future | [Product direction](docs/design/warpkeep-direction.md) and [roadmap](docs/design/roadmap.md) |
| Work as an agent or return to development | [AGENTS.md](AGENTS.md) and [current handoff](docs/agent-notes/0.4.0/README.md) |
| Find the implementation | [Architecture](docs/technical-architecture.md) and [repository map](docs/agent-notes/0.4.0/repo-map.md) |
| Improve the player experience | [Gameplay and visual review](docs/agent-notes/0.4.0/gameplay-and-visuals.md) |
| Apply the complete inspiration library | [0.4 visual foundation contract](docs/agent-notes/0.4.0/visual-foundation-contract.md) |
| Understand delivery and outstanding work | [Release and infrastructure notes](docs/agent-notes/0.4.0/release-and-infrastructure.md) |
| Contribute and publish a change | [Contributing](CONTRIBUTING.md) and [source synchronization](docs/operations/0.4.0-development-sync.md) |

The browser uses React, TypeScript and Three.js. Cloudflare verifies identity;
SpacetimeDB owns persistent gameplay. The frontend is a static build whose
current hosting and live status are tracked in the delivery journal.
Development and release operations target Windows/WSL and Linux; the
[infrastructure notes](docs/agent-notes/0.4.0/release-and-infrastructure.md)
distinguish verified paths from remaining work. Source publication is continuous
work; production deployment is a verified outcome.

## Community and reuse

[Warpkeep channel on Farcaster](https://farcaster.xyz/~/channel/warpkeep) ·
[Realm Council issue forms](https://github.com/ael-dev3/Warpkeep/issues/new/choose) ·
[Changelog](CHANGELOG.md) · [Releases](https://github.com/ael-dev3/Warpkeep/releases)

Report sensitive issues through [SECURITY.md](SECURITY.md). Public feedback should
describe player experience without exposing credentials or private player data.

Software is licensed under Apache-2.0. Creative work and third-party assets follow
their recorded terms: see [LICENSING.md](LICENSING.md),
[ASSETS-LICENSE.md](ASSETS-LICENSE.md) and [NOTICE](NOTICE).
Experimental Community Marks are separate from gameplay resources and carry no
promise of financial value or rewards.

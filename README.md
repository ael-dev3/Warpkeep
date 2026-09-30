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

**Alpha 0.3.43 is live; Warpkeep 0.4 is an open, unpublished candidate.** The
candidate is assembled on [PR #374](https://github.com/ael-dev3/Warpkeep/pull/374).
It includes the reviewed work from still-open PRs #375–#378; those older heads
must not be merged separately while their changes are already in #374.

The candidate brings together:

- The Verdant Citadel 3D menu, castle presentation and Hegemony banners ([#375](https://github.com/ael-dev3/Warpkeep/pull/375)).
- The eligible FID 539854 castle-film action ([#376](https://github.com/ael-dev3/Warpkeep/pull/376)). Its 289 MB video remains
  external and click-to-load.
- Sealed Genesis 002 soundtrack wiring ([#377](https://github.com/ael-dev3/Warpkeep/pull/377)). G002 remains inaccessible;
  the soundtrack derivative's source terms are unresolved.
- Forty hash-pinned Greater Realm tree models ([#378](https://github.com/ael-dev3/Warpkeep/pull/378)). The app uses local runtime
  copies; the open Warpkeep-Assets source archive is a provenance record, not a
  runtime download dependency.

The existing gather, Worker dispatch and return, building, construction and
persistent-progress loop remains the gameplay foundation. The PTR has a
dedicated lazy-loaded gameplay host that preserves /ptr/ routing and checks its
owner/session capabilities. No candidate change opens Genesis 002 admissions
or widens the Genesis 001 admission freeze.

The latest candidate's exact source, native test results, /ptr/ build, payload
hashes and read-only publication plan are recorded in PR #374. Independent
reviews repaired camera gestures becoming selections, lost pan after a pinch,
confirmation being disabled by a concurrent refresh, and destination focus
being lost between world and keep. The affected UI/controller tests and app/
Vite-config typechecks passed. Earlier Keep UI and accessibility tests passed
70/70. The full native rerun uncovered a root-owned ignored build artifact;
restoring only that file's ownership made its affected 199-test suite pass.
Read the exact-source result on the PR before treating a historical full-suite
pass as current acceptance.
The candidate also passed a disposable local G001/legacy Inner Keep
full-stack browser playthrough covering construction, persisted reload, Worker
dispatch/recall/return, re-entry and recovery paths. That run used synthetic
identity and an isolated local database; it does not test the gameplay04/PTR
journey. A 36-case Windows Chrome capture is
also synthetic evidence, not authenticated owner gameplay or physical-phone
acceptance. The build still reports a 677.80 kB RealmMapScreen chunk (188.23 kB
gzip), outside the standalone PTR route's load path. Mobile performance budgets
are established, but final production measurements remain pending.

The public Alpha root returned HTTP 200 and /ptr/ returned HTTP 404 at 07:08
CEST on 30 September. The sealed-launch verifier still reports package
0.3.43, Pages approval false, unset G001/G002/PTR identities and disabled PTR
presentation. No 0.4 production publication or owner PTR journey is claimed.
Hosted exact-head verification and the signed M1/M2 release sequence remain
pending under the September GitHub Actions pause; resume the hosted release
lane on or after October 1. G001 preservation, sealed G002
readback, PTR publication/readback, the actual-owner journey and physical-phone
acceptance are all release requirements.

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

The open [Warpkeep-Assets PR #41](https://github.com/ael-dev3/Warpkeep-Assets/pull/41)
carries the source archive for the biome trees; [PR #40](https://github.com/ael-dev3/Warpkeep-Assets/pull/40)
is a study reference with rights still unverified. Their open status does not
block the app's hash-pinned local runtime models. The Genesis 002 soundtrack
archive is tracked separately in [Warpkeep-Assets PR #38](https://github.com/ael-dev3/Warpkeep-Assets/pull/38).
Review the linked provenance records before changing or republishing any source
asset.

## Build with us

`main` contains an earlier integrated 0.4 development baseline; the active
0.4 changes are on PR #374. The running game remains at a different
release stage, and the 0.4 owner PTR is not live. Follow the
[execution handoff](docs/agent-notes/0.4.0/execution-handoff.md) for the
current candidate, local verification and remaining hosted release gates.

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

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
Layered forest, lightweight voxel scenery and flowing water frame the keep
without obscuring the decisions inside it.

We judge the result in the rendered game—its composition, readability, motion
and responsiveness. Detail should serve the experience on a phone as well as
on a desktop. Reused assets retain their original credits and permissions.

## Where development stands

**The existing Alpha 0.3.43 is live; 0.4 has not shipped.** The owner confirmed
a successful phone-approved sign-in after the Alpha QR RPC repair; the
[timestamped incident report](docs/evidence/0.4.0/qr-auth-incident-2026-09-27.md)
records the evidence limits. The reviewed Verdant Citadel menu and native
Hegemony banners from [PR #375](https://github.com/ael-dev3/Warpkeep/pull/375)
are already integrated into the open 0.4 candidate,
[PR #374](https://github.com/ael-dev3/Warpkeep/pull/374), together with the
mobile/WebGL corrections and the reviewed Greater Realm tree presentation from
[#378](https://github.com/ael-dev3/Warpkeep/pull/378). PTR sign-in and framed-
host fallbacks now preserve `/ptr/` instead of routing owners to the Alpha root.
The candidate also stages the owner-commissioned FID 539854 castle-film action
and narrow-screen castle focus improvements from
[#376](https://github.com/ael-dev3/Warpkeep/pull/376); the film player code is
lazy-loaded for that eligible castle, and its 289 MB video remains external and
click-to-load. PR #376 stays open as source provenance until #374 lands.
PR #375 remains open as source provenance; its older branch must not be merged
separately. The candidate is a polished visual foundation around the existing
gather, dispatch, return and construction loop.

Pinned Node 22.22.3 local verification on September 29 passed the full `/ptr/`
production build at code checkpoint `b37e5a89`, including the v3 asset
verifier, production exclusions, public-boundary scan (3,346 tracked paths /
1,901 scanned entries), and Farcaster Mini App checks. The 40 runtime tree
models total 2,738,208 bytes; Balanced and Reduced select the mobile meshes,
asset URLs follow the `/ptr/` base, and the loader retries on a later view after
a failed fetch.

The PTR route now lazy-loads `PtrGameplay04SurfaceHost` independently of
Genesis 001's `RealmMapScreen`. The production PTR host chunk is 105.92 kB
(32.53 kB gzip). `RealmMapScreen` remains 680.14 kB (188.86 kB gzip) and its
stylesheet is 16.88 kB gzip, but neither belongs to the PTR route's load path;
the route integration test confirms it never imports that legacy screen. The
G001 chunk remains available and Vite still reports its size warning. This is
local build and route evidence, not physical-phone performance or release
acceptance. No publication payload was produced, and the September GitHub
Actions pause remains in effect.

The public root serves Alpha 0.3.43 (HTTP 200), while
`https://warpkeep.com/ptr/` returns HTTP 404. No 0.4 PTR has been published.
After the September pause, Verify must pass on the exact candidate head before
source M1 integration. Native preparation and independent checking then run on
that exact main source; promote only the generated M2 and require its exact-head
Verify before protected operations. Finish G001 preservation/readback, sealed
G002 verification, PTR publication/readback, and owner acceptance on a phone.
The initial 0.4 PTR is required; opening live admissions is not. The [execution handoff](docs/agent-notes/0.4.0/execution-handoff.md),
[delivery status](docs/operations/0.4.0-live-delivery-status.md), and
[release checklist](docs/operations/0.4.0-release-checklist.md) track the
current evidence and gates.

Genesis 002 soundtrack PR #377 remains deferred because G002 is sealed and no
current player path can exercise the new score on the owner PTR. Warpkeep-Assets
PR #41 still has an unpublished v3 source-release attachment; its source branch
is linked from the tree provenance record. Warpkeep carries the reviewed,
hash-pinned runtime copies and its production verifier passes without fetching
that archive. Treat archive publication as an asset-source recovery and
provenance follow-up; no physical-phone performance claim follows from the
model triangle budgets. PR #40 remains a study reference pending packed-image
rights verification.

| Realm | Purpose |
| --- | --- |
| **Genesis 001** | Preserve the established world, existing player progress and agreed admission freeze. |
| **Genesis 002** | Prepare the successor realm as a sealed launch; its future admissions remain undecided. |
| **Owner PTR** | Exercise the new playable experience in an isolated realm before broader release. |

The [current development notes](docs/agent-notes/0.4.0/README.md) and tracked
[daily action brief](docs/agent-notes/0.4.0/next-work.txt) distinguish
implemented behavior, verified results, open integration work and live observations.
The [roadmap](docs/design/roadmap.md) explains how the first complete loop supports
future exploration, cooperation and strategy without promising unfinished features.

## Build with us

`main` contains an earlier integrated 0.4 development baseline; the active
0.4 changes are on PR #374. The running game remains at a different
release stage, and the 0.4 owner PTR is not live. Follow the
[execution handoff](docs/agent-notes/0.4.0/execution-handoff.md) for the live
checkpoint and next action, then inspect any open pull requests for their exact
source and check status.

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

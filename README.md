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

**The existing Alpha 0.3.43 is live; 0.4 has not shipped.** The generated-files
host now carries the focused QR diagnostic client and matches its reviewed
build. The owner confirmed successful phone-approved desktop sign-in at
2026-09-27 19:06:14 UTC after a secret-only RPC endpoint repair; the
[timestamped incident report](docs/evidence/0.4.0/qr-auth-incident-2026-09-27.md)
records the evidence and its limits. No exact frontend build hash was captured
for that sign-in. The reviewed Verdant Citadel menu and source repairs are
integrated into the open 0.4 candidate, [PR
#374](https://github.com/ael-dev3/Warpkeep/pull/374). At the 06:45 CEST
checkpoint, its signed branch head was `4abc69b7` and matched the maintained
local checkout. The exact-head
[Verify run 36378719419](https://github.com/ael-dev3/Warpkeep/actions/runs/36378719419)
failed all 17 jobs before any step because GitHub cited account payments or the
Actions spending limit; each job had an empty step list, so this is not a
source-test result. The exact-source `/ptr/` production build passed locally
with Node 22.23.2/npm 10.9.8. Its checked 369-file manifest totals
137,382,410 bytes and has SHA-256
`f064464b94ee5722f2af9253fa0427bbeb507bcb501b84e962ec620e53e0289c`. The live
Alpha root returned HTTP 200 and `/ptr/` returned HTTP 404 at 04:45 UTC; no
0.4 PTR deployment or release acceptance is claimed. Sealed launch remains in
preparation, package version `0.3.43`, without a PTR database identity or
activated production receipts. Resolve the billing gate, then rerun Verify on
the exact current PR head. PR #375 duplicates menu work already in #374; #376's
288.9 MB video and #377's Genesis 002-only soundtrack remain deferred from
the initial PTR, for mobile cost and realm-readiness/rights reasons. The dated
[execution handoff](docs/agent-notes/0.4.0/execution-handoff.md)
records the release sequence and evidence. Protected integration, native
preparation, provider work and owner acceptance remain before 0.4 release.

Provider deployment, accepted G001 preservation/readback, sealed G002 evidence,
owner PTR play, mobile and measured-performance acceptance, and final release
freeze still need current evidence. The owner PTR is mandatory for the initial
0.4 ship; live admissions servers are not. The [release checklist](docs/operations/0.4.0-release-checklist.md)
tracks the evidence required to make that distinction concrete.

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

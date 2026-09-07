# Warpkeep

A persistent strategy world built around one promise: **a real person, a permanent
keep, and a world worth returning to.** Farcaster proves identity; SpacetimeDB
owns game state; the browser makes the world readable and inviting.

[Play the Alpha](https://warpkeep.com/) · [0.4 release checklist](docs/operations/0.4.0-release-checklist.md)
· [Agent guide](AGENTS.md) · [Documentation](docs/README.md)

## One satisfying evening, a meaningful return

Warpkeep 0.4 connects gathering to visible progress:

**Gather → choose → build → benefit → return.**

Send four Workers to real atlas resources. Bring Food, Wood, Stone and Gold home.
Choose a permanent place for one of six buildings. See construction finish and
understand how that building improves the next expedition or project.

The visual direction is **The Verdant Citadel**: an elevated town diorama with
pale stepped masonry, dark timber, teal roofs, restrained violet accents and
layered forest framing. Decorative voxel terrain and lightweight water support
that view; they do not add terrain editing, environmental harvesting or a second
set of gameplay rules. Clear mobile controls and usable graphics fallback matter
as much as the high-quality scene.

**0.4 is in development—not yet shipped or accepted.** Substantial gameplay,
rendering and release tooling exists locally, but operating deployment paths and
mandatory live/visual/performance evidence remain incomplete. See the
[dated audit](docs/agent-notes/0.4.0/README.md) for what works, what is disconnected
and what has not been proved.

## Three realms, explicit boundaries

| Realm | Role in the 0.4 release | Access and preservation requirement |
| --- | --- | --- |
| **Genesis 001** | Preserve the recorded Alpha 0.3.43 world | Existing admitted players, keeps, resources, timers and appearance continue; new admissions freeze during verified rollout |
| **Genesis 002** | Deploy the isolated 0.4 successor, sealed | Listed as closed; admissions policy remains TBD. Denied play must cause zero unauthorized writes |
| **PTR** | Prove the complete 0.4 game journey | Separate database, actual authenticated owner only; no substitute identities or open admissions for testing |

The recorded public baseline is the admission-gated Genesis 001 Alpha: 10,000
world cells, 100 permanent keep sites, four Worker journeys and persistent
resource gathering. It is a world foundation, not the completed construction
strategy loop. Reverify live versions and access policy before operational work;
this README does not attest a deployment or grant access.

![Genesis 001 Alpha 0.3.43 reference: keeps and Worker road network.](docs/reference/screenshots/2026-08-02-alpha-0.3.43-launch/warpkeep-alpha-0.3.43-genesis-001.png)

*Historical 0.3.43 renderer reference, captured locally with synthetic keep records.
This is not a screenshot or acceptance result for the new 0.4 look.*

## What 0.4 includes—and what it does not

- Six buildings, five levels: Mill, Lumber Camp, Stoneworks and Goldworks improve
  their resource's gathering yield; Barracks improves travel; Cathedral improves
  future build time. One Builder, permanent placement, server-priced actions.
- Exact retries, visible stale quotes and uncertain outcomes, spendable resources
  separate from pending returns, and server-owned timers and completion.
- A separate 0.4 keep presentation with bounded voxel meshing/detail, reduced
  quality/motion, cleanup, context recovery and schematic fallback.
- Reproducible Windows/WSL release operations, protected integration, linked
  deployment evidence and recovery that preserves legitimate player writes.

The first economy building **and its improved subsequent return** must be
achievable within ten minutes on actual atlas routes, proved by owner PTR play.
This gate is not yet passed. Numeric [performance gates](docs/evidence/0.4.0/performance.md)
are also mandatory; viewport emulation is not physical-phone evidence.

Admissions design, combat, units, queues, cancellation, relocation, refunds,
payments and additional resource systems are outside this release. Longer-term
ideas are [deferred directions](docs/design/roadmap.md), not implementation promises.
Experimental Community Marks are not money, transferable rewards, an airdrop or
a promise of future value. Warpkeep remains a solo-developed open-source Alpha,
not a finished MMO or financial product.

## Start developing

For a **fresh, independent clone**, use Git, Node 22 (`>=22.13.0 <23`) and npm
`>=10.9.8 <11` as declared in `package.json`. The project pins npm 10.9.8.

```sh
git clone https://github.com/ael-dev3/Warpkeep.git
cd Warpkeep
npm ci
npm run dev
```

Open the URL Vite prints. Local startup does not grant production admission,
supply private atlas data or create an owner session. Active 0.4 work may be ahead
of the default branch: inspect the [draft release PR](https://github.com/ael-dev3/Warpkeep/pull/228)
and your checkout before assuming a file or feature is present.

```sh
npm run test
npm run typecheck
npm run build
# Full root gate, including licensing/assets/boundaries:
npm run check
```

Service/module changes require their own checks. Read [CONTRIBUTING](CONTRIBUTING.md)
and the [development workflow](docs/engineering/development-workflow.md) for test
selection, isolated toolchains, generated outputs, privacy and review.
In an existing agent worktree, inspect dependencies before installing: the current
Windows 0.4 worktree uses a shared dependency junction. Do not run `npm ci` there.

### For a new agent or returning contributor

1. Read [AGENTS.md](AGENTS.md) for repository-wide rules and entry points.
2. Read the [0.4 handoff](docs/agent-notes/0.4.0/README.md) and
   [repository map](docs/agent-notes/0.4.0/repo-map.md); verify current source/CI
   before relying on dated status.
3. Continue the settled [gameplay](docs/superpowers/specs/2026-09-05-warpkeep-0.4-gameplay-design.md),
   [Verdant Citadel](docs/superpowers/specs/2026-09-06-warpkeep-astra-keep-design.md)
   and [assembler](docs/superpowers/specs/2026-09-06-warpkeep-local-release-assembler-design.md)
   designs. Fix evidenced problems; do not restart or expand the release.
4. Choose an existing release gate, trace its actual caller, make a bounded
   change, test the boundary, and record the result and its limitations.

## System structure

| Responsibility | Implementation | Hosting / boundary |
| --- | --- | --- |
| Interface and scenes | React, TypeScript, Vite, Three.js; `src/` | GitHub Pages at `warpkeep.com`; presentation is not authority |
| Player identity and sessions | `services/auth-bridge/` | Cloudflare Workers at `auth.warpkeep.com`; least-privilege Farcaster verification |
| Persistent gameplay | `spacetimedb/` | Distinct SpacetimeDB realm databases; authentication and atomic transitions |
| Recovery authorization | `services/release-recovery/` | Separate gateway/private signer design; not player authentication |
| Reproducible delivery | `scripts/`, `.github/workflows/` | Windows/WSL preparation and genuine supported Actions identity where required |

The [architecture](docs/technical-architecture.md) explains subsystem ownership
and preserved G001 versus new 0.4. The [documentation index](docs/README.md) routes
product, engineering, evidence, operations and provenance without making every
historical plan current authority.

## What “shipped” means

Complete required gameplay, visual coverage and operating sources; test
write-preserving recovery before deployment. Then freeze the reproducible artifact
family, integrate through repository protections, deploy and verify the live result.
The [R01–R18 checklist](docs/operations/0.4.0-release-checklist.md) requires G001
preservation, sealed G002 denial, actual-owner PTR play, performance and a
credential-free Desktop handoff.

Every mandatory result must link to reviewed source, CI and exact deployed
artifacts/identities. A commit, draft PR, unit suite or upload is not a shipped
release. [Source synchronization](docs/operations/0.4.0-development-sync.md) is
separate from deployment.

## Community, security and reuse

[Warpkeep channel on Farcaster](https://farcaster.xyz/~/channel/warpkeep) ·
[Realm Council issue forms](https://github.com/ael-dev3/Warpkeep/issues/new/choose) ·
[Changelog](CHANGELOG.md) · [Releases](https://github.com/ael-dev3/Warpkeep/releases)

Report sensitive issues privately through [SECURITY.md](SECURITY.md). Never publish
credentials, raw identity proofs, private player data or operational receipts.

Software uses Apache-2.0. Confirmed project-owned creative work follows recorded
CC-BY terms; third-party and exact-use assets retain their own permissions.
New Astra-authored composition does not change authorship or rights of reused
models. Read [LICENSING](LICENSING.md), [ASSETS-LICENSE](ASSETS-LICENSE.md) and
[NOTICE](NOTICE) before reuse. Warpkeep trademarks and official identity are separate.

# Contributing to Warpkeep

Thank you for helping build Warpkeep in the open. Contributions should keep the
software commercially reusable, forkable, mod-friendly, and clear about
provenance. Media terms vary by asset and are recorded separately. Participation
follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before submitting

- Only submit work you have the right to contribute.
- Do not submit secrets, private keys, personal data, live Farcaster proofs, QR
  payloads, channel tokens, or private authentication material.
- Do not copy third-party code, fonts, models, audio, video, images, or
  references without compatible terms and a provenance record.
- Generated or AI-assisted work must be reviewed by the contributor and must
  not knowingly include incompatible third-party material. AI assistance does
  not automatically determine copyright status or licensing.

## Realm Council intake

Use the [Warpkeep Farcaster channel](https://farcaster.xyz/~/channel/warpkeep)
for open conversation, early ideas, and community stories. Use the
[Realm Council issue forms](https://github.com/ael-dev3/Warpkeep/issues/new/choose)
for a durable public bug report or realm wish that contributors can triage.

Keep every public report privacy-safe. Describe only public product behavior or
a reproduction using synthetic/local data. Do not attach private logs or
screenshots, and never include tokens, proofs, QR payloads, wallet/account
identifiers, personal data, or credentialed URLs. Security-sensitive behavior
does not belong in Realm Council intake; follow [SECURITY.md](SECURITY.md) and
wait for a private reporting channel.

## Licensing of contributions

Contributions included in a release follow the licensing policy for that
release and material category:

- Through v0.2.0, Warpkeep software follows the historical `0BSD` policy and
  confirmed project-owned creative material follows the historical `CC0-1.0`
  policy.
- Active software license: Apache-2.0
- Active project-owned creative-content license: CC-BY-4.0
- Beginning with v0.3.0, those policies apply to new or modified Warpkeep work
  in their respective categories.
- Third-party, externally governed, generated, and uncertain-provenance material
  keeps its original terms unless the project has documented the right to
  license it.

Contributors retain their copyright. No copyright assignment is required, and
Warpkeep does not use a heavyweight CLA. By submitting a contribution for
inclusion, you confirm that you have the right to submit it and agree that it
may be distributed under the applicable release policy.

See [`LICENSING.md`](LICENSING.md),
[`ASSETS-LICENSE.md`](ASSETS-LICENSE.md), and
[`TRADEMARKS.md`](TRADEMARKS.md) for the full policy and provenance boundary.

## Choose the source you intend to change

`main` contains the integrated 0.4 gameplay, owner PTR, new keep and local
release/recovery source alongside the preserved Genesis 001 implementation.
The integrated 0.4 release is not yet shipped. Use the
[source map](docs/agent-notes/0.4.0/repo-map.md) and
[architecture](docs/technical-architecture.md) to find the subsystem, then read
[AGENTS.md](AGENTS.md) and the [current handoff](docs/agent-notes/0.4.0/README.md).

For a new 0.4 checkout:

```sh
git clone https://github.com/ael-dev3/Warpkeep.git
cd Warpkeep
git switch -c my-change
```

Inspect your branch, remote and existing changes before editing. Follow the
[execution handoff](docs/agent-notes/0.4.0/execution-handoff.md), current refs and
open pull requests before continuing existing work. Submit your working branch
through a pull request to `main`; source integration does not deploy the game.

## Local setup and verification

The root package requires Node 22 (22.13 or newer within that major) and npm
10.9.8. A fresh independent checkout can use:

```sh
npm ci
npm run dev
```

Open the address printed by Vite. Follow the checked-out version of the
[auth bridge guide](services/auth-bridge/README.md) for local authentication;
production identity and private realm data are not local fixtures. The
[0.4 development workflow](docs/engineering/development-workflow.md)
describes its current synthetic and connected gameplay paths. Existing worktrees
may share a `node_modules` link or junction; inspect that before installing and
use an independent checkout when an install would affect another task.

Run checks suited to the change, then the required complete checks on a stable
candidate. The root aggregate is:

```sh
npm run check
```

`npm run check` verifies licensing, atlas public boundaries, runtime assets,
repository size, root tests, project types and the production build.

| Changed area | Verification owner |
| --- | --- |
| Browser, presentation and shared root tooling | Root `tests/**`, `npm run typecheck` and relevant build/asset checks |
| SpacetimeDB authority | [Module guide](spacetimedb/README.md) and package `verify`; its tests use a separate Node/tsx runner |
| Identity and sessions | [Auth bridge](services/auth-bridge/README.md) and package `check`, including workerd tests |
| 0.4 gameplay, recovery and delivery | [Source map](docs/agent-notes/0.4.0/repo-map.md), [recovery service](services/release-recovery/README.md) and package-specific scripts |
| Documentation and issue forms | Local/branch link checks, `tests/communityIntake.test.ts`, `tests/licensePolicy.test.ts`, scoped diff review |

Root `tsconfig.json` references separate projects; use build-mode
`npm run typecheck` instead of treating root `tsc --noEmit` as a complete check.
The [Verify workflow](.github/workflows/verify.yml) defines CI, including dependency
and signature audits. Keep these checks intact and report inherited failures
separately from results for the changed behavior.

## Pull requests

Keep pull requests focused on a player or developer outcome. Explain the resulting
behavior, affected realm and relevant checks, including failures or unverified
work. For visual changes, review actual rendered states and say whether captures
come from fixtures, emulation, a physical device or authenticated play.

Identify generated files and their source, include provenance for external
material, and explain security, compatibility or recovery implications when they
apply. Update the canonical documentation for changed behavior instead of creating
another competing plan. Preserve unrelated edits and stage exact reviewed paths.

Do not include raw authentication responses, live QR screenshots, tokens, private
keys or exported HAR/network files. A merged source change and successful tests
do not by themselves establish production deployment or live acceptance.

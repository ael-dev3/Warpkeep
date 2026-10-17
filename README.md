# Warpkeep

**Development is halted.** This repository preserves the game's source and
assets for anyone who wants to study, reuse, or continue the work.

Warpkeep is a persistent strategy game connected to Farcaster: gather
resources, build a keep, and return to a world that remembers your progress.
Project site: [warpkeep.com](https://warpkeep.com/).

## Reuse

- **Code:** [Apache License 2.0](LICENSE), permitting personal and commercial
  use, modification, distribution, and forks with its notices.
- **Original assets and creative documentation:** [CC0 1.0 Universal](LICENSE-CC0-1.0).
  Copy, modify, redistribute, sell, and use them in your own projects without
  asking permission or providing attribution. Credit is welcome.
- **Third-party material:** its original licenses and notices still apply.

The owner's [CC0 dedication](ASSET-REUSE.md) is effective 17 October 2026 and
adds free reuse permission to earlier project-owned asset releases, including
owner-supplied models, images, audio, and video. See [LICENSING.md](LICENSING.md)
and [the provenance index](ASSETS-LICENSE.md) for scope and third-party credits.

## Run locally

Use Git, Node.js 22 (22.13 or newer in that major), and npm 10.9.8:

```sh
git clone https://github.com/ael-dev3/Warpkeep.git
cd Warpkeep
npm ci
npm run dev
```

Open the local address printed by Vite. A synthetic keep presentation is
available at `/dev/keep04-qa.html?scenario=all-six-level-five&quality=high`.
Authenticated gameplay requires your own compatible backend and configuration;
the source license does not provide credentials or access to a hosted realm.
Use [.env.example](.env.example) for configuration names.

The browser uses React, TypeScript, and Three.js. Cloudflare hosts the identity
bridge, and SpacetimeDB owns persistent gameplay state. See
[the architecture](docs/technical-architecture.md),
[the repository map](docs/agent-notes/0.4.0/repo-map.md), and
[the asset archive](https://github.com/ael-dev3/Warpkeep-Assets).

## Preserved development state

The repository contains the Alpha history and an unfinished 0.4 development
candidate. Historical release plans, handoffs, issues, and pull requests record
work before development halted; they are not a promise of future releases,
maintenance, support, or continued hosted-service availability.

Privileged self-hosted production workflows are restricted to private
repositories. The existing repository Actions pause remains in effect. Local
checks and their definitions remain available to people continuing the project;
read [the public-source notes](PUBLIC-RELEASE.md) before configuring automation.

Security reports: [SECURITY.md](SECURITY.md).

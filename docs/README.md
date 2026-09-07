# Warpkeep documentation

Start with the [project README](../README.md) for the player experience and the
[ecosystem map](engineering/ecosystem-map.md) for branches, implementation owners
and delivery boundaries. This index routes deeper work without duplicating it.

## Current 0.4 development

The links in this section deliberately open `codex/prepared-keep-bindings-fix`.
The default branch contains the G001 baseline and release preparation; it does
not yet contain the new gameplay core, owner PTR or `keep04` presentation.
Check the branch and current source before following a development guide.

| Question | Development document |
| --- | --- |
| What is implemented and what remains? | [0.4 handoff](https://github.com/ael-dev3/Warpkeep/blob/codex/prepared-keep-bindings-fix/docs/agent-notes/0.4.0/README.md) |
| Where should I look in source? | [Repository map](https://github.com/ael-dev3/Warpkeep/blob/codex/prepared-keep-bindings-fix/docs/agent-notes/0.4.0/repo-map.md) and [architecture](https://github.com/ael-dev3/Warpkeep/blob/codex/prepared-keep-bindings-fix/docs/technical-architecture.md) |
| How do I work and verify? | [Development workflow](https://github.com/ael-dev3/Warpkeep/blob/codex/prepared-keep-bindings-fix/docs/engineering/development-workflow.md) and [agent guidance](https://github.com/ael-dev3/Warpkeep/blob/codex/prepared-keep-bindings-fix/AGENTS.md) |
| How should the game behave? | [Gameplay specification](https://github.com/ael-dev3/Warpkeep/blob/codex/prepared-keep-bindings-fix/docs/superpowers/specs/2026-09-05-warpkeep-0.4-gameplay-design.md) and [gameplay/visual review](https://github.com/ael-dev3/Warpkeep/blob/codex/prepared-keep-bindings-fix/docs/agent-notes/0.4.0/gameplay-and-visuals.md) |
| What defines the new keep? | [Verdant Citadel specification](https://github.com/ael-dev3/Warpkeep/blob/codex/prepared-keep-bindings-fix/docs/superpowers/specs/2026-09-06-warpkeep-astra-keep-design.md) |
| How does the release reach players? | [Release and infrastructure notes](https://github.com/ael-dev3/Warpkeep/blob/codex/prepared-keep-bindings-fix/docs/agent-notes/0.4.0/release-and-infrastructure.md), [release checklist](https://github.com/ael-dev3/Warpkeep/blob/codex/prepared-keep-bindings-fix/docs/operations/0.4.0-release-checklist.md) and [source synchronization](https://github.com/ael-dev3/Warpkeep/blob/codex/prepared-keep-bindings-fix/docs/operations/0.4.0-development-sync.md) |

## Product and contribution

- [Product direction](design/warpkeep-direction.md) — the game's premise,
  current target and design principles
- [Roadmap](design/roadmap.md) — recorded baseline, current work and future possibilities
- [Agent guide](../AGENTS.md) — durable branch-aware working guidance
- [Contributing](../CONTRIBUTING.md) — setup, verification, review and provenance
- [Code of Conduct](../CODE_OF_CONDUCT.md) — expectations for project spaces

## Default-branch system references

These documents describe the G001 baseline, prepared components or their named
historical generation. They are useful references, but do not define the new 0.4
gameplay policy or prove a feature is deployed. In particular, legacy Inner Keep
construction discounts differ from 0.4 building benefits and return-time credit.

- [Baseline architecture](technical-architecture.md)
- [Farcaster integration](farcaster-integration.md)
- [Auth bridge](../services/auth-bridge/README.md)
- [SpacetimeDB module](../spacetimedb/README.md)
- [Legacy Inner Keep construction V1](design/inner-keep-construction.md)
- [Community Marks policy](gameplay/marks-policy-v1.md)
- [Realm Chat V1 contract](design/realm-chat-v1-contract.md) and
  [implementation](design/realm-chat-v1-implementation.md) — dormant feature references

## World presentation and art

- [Lowlands renderer](design/hegemony-lowlands-terrain.md)
- [Living Realm V1](design/living-realm-v1.md)
- [Genesis water](design/genesis-water.md) and
  [surface relief and analytic waves](design/realm-surface-relief-and-analytic-waves.md)
- [Lowlands audio](design/lowlands-audio.md)
- [Northern Reach reference boundary](design/northern-reach-reference-boundary.md)
- [Sunscoured South reference boundary](design/sunscoured-south-reference-boundary.md)
- [Licensing overview](../LICENSING.md) and [asset provenance](../ASSETS-LICENSE.md)

`docs/reference/` holds dated source, authorization and review records for specific
assets. It is evidence of their terms and origins, not a general asset library.

## Operations, security and history

Inspect a runbook's generation, actual script and current target before operating
a service. Historical procedures do not replace the development branch's release
path. Source flags, local checks and production evidence have different meanings.

- [Greater Realm production cutover](operations/greater-realm-production-cutover.md)
- [Reviewed launch envelope](operations/greater-realm-production-launch-envelope.sh.txt)
- [Private atlas generation boundary](security/greater-realm-private-generation.md)
- [Daily Marks operations](operations/daily-marks.md)
- [Local visual QA](operations/qa-observatory.md)
- [Threat model](security/threat-model.md) and [private security reporting](../SECURITY.md)
- [Operations and recovery](operations/reconstruction/README.md)
- [Changelog](../CHANGELOG.md) and [versioning](releases/versioning.md)

Git tags, releases, merged pull requests and commit history preserve the detailed
record. Keep source and evidence labels attached when using an older document.

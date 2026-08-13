# Warpkeep documentation

The root [README](../README.md) is the best starting point for players and new
contributors. This page routes deeper work without duplicating it.

## Start here

- [Product direction](design/warpkeep-direction.md) — the game's premise and
  design principles
- [Roadmap](design/roadmap.md) — what is live, under development, and later
- [Realm Chat V1 implementation](design/realm-chat-v1-implementation.md) —
  review-only research, SpacetimeDB authority, abuse controls, and rollout gates
- [Technical architecture](technical-architecture.md) — browser, identity
  bridge, SpacetimeDB, rendering, and delivery
- [Lowlands renderer](design/hegemony-lowlands-terrain.md) — terrain,
  presentation, and performance principles
- [Living Realm V1](design/living-realm-v1.md) — coherent environmental motion,
  bounded surface response, ecology budgets, and fail-closed design
- [Realm Chat V1 contract](design/realm-chat-v1-contract.md) — dormant authority,
  legal-review, privacy, moderation, and activation boundaries
- [Genesis water](design/genesis-water.md) — canonical coast, river, and fog
  layout
- [Realm surface relief and analytic waves](design/realm-surface-relief-and-analytic-waves.md)
  — quality-tiered topographic relief, coherent water derivatives, and clean-room provenance
- [Lowlands audio](design/lowlands-audio.md) — scene transitions and runtime
  sound boundaries
- [Northern Reach reference boundary](design/northern-reach-reference-boundary.md)
  — the snow-system clean-room and license record
- [Sunscoured South reference boundary](design/sunscoured-south-reference-boundary.md)
  — the desert presentation's clean-room boundary
- [Contributing](../CONTRIBUTING.md) — local setup, checks, privacy, and
  provenance expectations
- [Code of Conduct](../CODE_OF_CONDUCT.md) — expectations for project spaces

## System guides

- [Farcaster integration](farcaster-integration.md)
- [Auth bridge](../services/auth-bridge/README.md)
- [SpacetimeDB module](../spacetimedb/README.md)
- [Greater Realm production cutover](operations/greater-realm-production-cutover.md)
  — guarded commit-bound tooling and closed release-gate sequence
- [Reviewed Greater Realm launch envelope](operations/greater-realm-production-launch-envelope.sh.txt)
  — exact non-executable command-boundary review copy
- [Greater Realm private-generation boundary](security/greater-realm-private-generation.md)
  — private atlas generation, public declassification, and threat boundaries
- [Community Marks policy](gameplay/marks-policy-v1.md)
- [Daily Marks operations](operations/daily-marks.md)
- [Local visual QA](operations/qa-observatory.md)
- [Threat model](security/threat-model.md)
- [Operations and recovery](operations/reconstruction/README.md)

## Art and licensing

- [Licensing overview](../LICENSING.md)
- [Asset provenance](../ASSETS-LICENSE.md)
- `docs/reference/` contains dated source, authorization, and review records.
  It is evidence for specific assets, not a general asset library.

## Project history

The [changelog](../CHANGELOG.md) summarizes public versions, and the
[versioning guide](releases/versioning.md) explains tags and builds. Git tags,
GitHub Releases, merged pull requests, and commit history preserve the detailed
implementation record.

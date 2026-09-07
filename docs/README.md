# Warpkeep documentation

The root [README](../README.md) is the best starting point for players and new
contributors. This page routes deeper work without duplicating it.

## Current 0.4 — start here

- [Agent guide](../AGENTS.md) — durable repository rules, authority boundaries,
  verification and handoff expectations
- [0.4 agent handoff and quality audit](agent-notes/0.4.0/README.md) — current
  implementation map, working and unverified behavior, release gaps, and next checks
- [0.4 release checklist](operations/0.4.0-release-checklist.md) — the single
  mandatory R01–R18 acceptance contract; planned evidence destinations are not passes
- [Development workflow](engineering/development-workflow.md) — document ownership,
  bounded changes, review, evidence and source publication
- [Technical architecture](technical-architecture.md) — current subsystem ownership,
  preserved G001 versus separate 0.4, rendering and delivery boundaries

## Product and contribution

- [Product direction](design/warpkeep-direction.md) — the game's premise and
  design principles
- [Roadmap](design/roadmap.md) — what is live, under development, and later
- [Contributing](../CONTRIBUTING.md) — local setup, checks, privacy, and
  provenance expectations
- [Code of Conduct](../CODE_OF_CONDUCT.md) — expectations for project spaces

## Preserved G001 and dormant V1 references

These guides describe their named generation, not new 0.4 gameplay authority or
an instruction to activate unrelated features. Use the settled 0.4 specs below
for the current release; retain historical contracts and provenance intact.

- [Realm Chat V1 implementation](design/realm-chat-v1-implementation.md) —
  review-only research, SpacetimeDB authority, abuse controls, and rollout gates
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

## Current 0.4 specifications and acceptance

- [0.4 gameplay specification](superpowers/specs/2026-09-05-warpkeep-0.4-gameplay-design.md)
  — settled isolated gameplay; not the older dormant G001 construction-discount policy
- [Verdant Citadel specification](superpowers/specs/2026-09-06-warpkeep-astra-keep-design.md)
  — separate 0.4 presentation, mobile usability and accurate asset authorship
- [Local complete release assembler](superpowers/specs/2026-09-06-warpkeep-local-release-assembler-design.md)
  — required family derivation, installation/recovery and final-freeze ordering
- [0.4 performance contract](evidence/0.4.0/performance.md) — fixed profiles,
  workload and numeric gates; final measurements remain separately required

## Services and operations

Inspect the named runbook's generation, actual script and current authority before
running an operation. Historical procedures do not replace the 0.4 release path.

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

Current 0.4 intent is defined by the release checklist and linked settled specs;
current implementation must be checked against source and dated evidence.
Older design, operations and `superpowers` plans preserve their own generation and
date. They do not silently reopen scope, prove deployment or override the new
gameplay policy. The [documentation ownership guide](engineering/development-workflow.md)
explains where to update each kind of information.

The [changelog](../CHANGELOG.md) summarizes public versions, and the
[versioning guide](releases/versioning.md) explains tags and builds. Git tags,
GitHub Releases, merged pull requests, and commit history preserve the detailed
implementation record.

# Warpkeep branch entry map

Start with the checkout you are using. Branch names identify source; they do not
attest the deployed frontend, service or realm.

| Source | Where to begin |
| --- | --- |
| [Public main](https://github.com/ael-dev3/Warpkeep/tree/main) | G001 Alpha baseline and release preparation. Its README routes new work to development. Existing G002 import scaffolding does not establish playable 0.4. |
| This 0.4 development checkout | [README](../../README.md), [current handoff](../agent-notes/0.4.0/README.md) and [execution handoff](../agent-notes/0.4.0/execution-handoff.md). Current implementation and dated evidence are maintained here. |
| Generated release candidate | The source identities, closure and manifests produced by the [local preparation components](../superpowers/specs/2026-09-05-warpkeep-local-release-preparation-design.md). A candidate is not a deployed release. |
| Live deployment | The exact deployed artifacts and configured realm/service identities, checked through the [release acceptance record](../operations/0.4.0-release-checklist.md). |

## Find the owner of a question

- [Product direction](../design/warpkeep-direction.md) and [roadmap](../design/roadmap.md)
  explain the intended player experience and priorities.
- [Architecture](../technical-architecture.md) explains authority and runtime
  boundaries. The [source map](../agent-notes/0.4.0/repo-map.md) identifies real
  callers, state owners, renderers and tests.
- [Repository ecosystem](repository-ecosystem.md) owns the responsibilities of
  related repositories, current infrastructure location and asset adoption flow.
- [AGENTS](../../AGENTS.md), [CONTRIBUTING](../../CONTRIBUTING.md) and
  [development workflow](development-workflow.md) explain how to work and verify.
- [Source synchronization](../operations/0.4.0-development-sync.md) explains
  reviewed publication without conflating a development checkpoint with release.
- [Documentation index](../README.md) routes specifications, evidence, operations
  and historical material. Update the canonical owner rather than duplicating it.

Preserve G001 players and normal timers alongside the agreed admission freeze.
G002 remains sealed with admissions undecided; new gameplay uses the genuine
isolated owner PTR. A fixture, administrator session or successful preparation
job cannot establish player access or production behavior. Read the current
handoff before resuming an older plan.

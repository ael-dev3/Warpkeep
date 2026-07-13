# Incident command

## Ownership

Declare severity, scope, affected coordinates, and one mutation owner. Reviewers and agents may inspect, test isolated candidates, or produce read-only analysis, but they do not deploy, publish, merge, tag, change admission, or alter repository settings. Store an atomic ownership claim in private per-user application state, never in the public repository.

## Modes

| Mode | Purpose | Mutation boundary |
| --- | --- | --- |
| Diagnosis | classify the failing layer | read-only evidence and reversible local probes |
| Candidate | prove one repair in isolation | isolated worktree and exact candidate deployment with rollback |
| Release | converge approved production | frozen SHA, one mutator, normal merge, exact final deploy |

Do not spend scarce human identity approval in diagnosis when a server-only synthetic can test the dependency. Do not call a candidate shipped. Do not continue diagnosis mutations after entering release mode.

## Coordinate ledger

Record full repository SHA/tree, PR/review state, workflow runs, deployed Pages SHA, Worker source/deployment version, Maincloud module/database/schema, asset tag/attachment hashes, protected aggregate, and rollback coordinate. A timeout or disconnected terminal is indeterminate; inspect remote state before retrying.

## Evidence and privacy

Retain static allowlisted event names, HTTP class/status where safe, aggregate counts, version coordinates, and pass/fail timestamps. Never retain SIWF messages/signatures, channel tokens, QR payloads, JWTs, keys, request bodies, raw upstream responses, FIDs, personal paths, private RPC URLs, or identity-bearing screenshots.

Fresh-browser QA uses one disposable profile, one window, one tab, a verified anonymous baseline, and one correlated website action before the human approval. Remembered-session QA is a separate phase. Remove disposable profiles and temporary observers after evidence is reduced safely.

## Forbidden actions

- rewrite, squash, amend, or cherry-pick the immutable licensing cutover pair;
- force-push `main`;
- log or transmit secret/proof material;
- add a real or synthetic admission merely to test infrastructure;
- mutate world/player/castle state outside approved scope;
- use destructive SpacetimeDB flags or recreate the database;
- publish unresolved-rights source media;
- tag/release a build that does not match deployed final main.

## Handoff and closure

A handoff states current mode, owner, exact coordinates, completed checks, remaining blocker, rollback, and next authorized action. Closure requires final deployment verification, protected aggregate, observation window, review/PR zero-state, cleanup of temporary worktrees/caches/browser profiles, and a durable public-safe report.

# Development workflow and documentation ownership

This is the durable contribution process. Dated implementation facts belong in
evidence records; product intent belongs in product/specification documents. The
[agent guide](../../AGENTS.md) is the short repository-wide entry point.

## One document for each responsibility

| Question | Canonical place | Maintenance rule |
| --- | --- | --- |
| What are we making? | [README](../../README.md), [product direction](../design/warpkeep-direction.md) | Explain the player outcome; distinguish recorded live baseline from target |
| What is in this release? | [0.4 checklist](../operations/0.4.0-release-checklist.md) | Single R01–R18 completion contract; no competing checklist |
| How should a feature behave? | Settled specs linked in [agent handoff](../agent-notes/0.4.0/README.md) | Record evidenced amendments; historical plans do not silently override them |
| Who owns data and execution? | [Architecture](../technical-architecture.md) | Separate current target, implemented component and unavailable operating caller |
| Where should an agent investigate? | [Repo map](../agent-notes/0.4.0/repo-map.md), [docs index](../README.md) | Keep navigable; link source rather than copying whole implementations |
| What passed, failed or remains unknown? | `docs/evidence/0.4.0/`, dated [audit](../agent-notes/0.4.0/README.md) | Date, commit/input, method, results, limitations and next proof |
| How is an authorized operation executed? | `docs/operations/` and exact fixed scripts/workflows | Preconditions, scope, failure/reconciliation and postflight; no secret values |
| What reached players? | [CHANGELOG](../../CHANGELOG.md), release/deployment ledger | Never mark planned or local-only work released |
| What may be reused? | [ASSETS-LICENSE](../../ASSETS-LICENSE.md), dated provenance | Preserve file-specific terms and attribution |

If documents conflict, do not infer precedence from file date alone. Follow the
current explicit task and settled acceptance contract; inspect source and evidence
to determine implementation status. Record unresolved material ambiguity rather
than inventing a new architecture. Link historical contracts with clear labels.

## Change cycle

1. **Orient.** Read the applicable requirement, identify subsystem owner and real
   caller, inspect branch/diff and tests. For diagnoses, gather evidence before
   implementing. Do not treat every fail-closed refusal as an accidental obstacle.
2. **Bound.** State the user-visible or operational outcome, preserved invariants,
   affected paths, relevant failure modes and proof needed. Select an existing
   release gate; add mandatory work only when evidence shows it is necessary.
3. **Implement.** Prefer a vertical slice through existing interfaces. Delegate
   independent bounded work with explicit file ownership; reconcile reviews before
   committing. Avoid orphan helpers, duplicated realm authority and speculative
   general frameworks.
4. **Verify.** Reproduce the defect first where practical. Exercise success and
   rejection/rollback/timeout/expiry paths. Test actual composition with delayed
   async work. Run types, relevant packages, asset/public-output checks and required
   full gates on a stable candidate. Preserve exact assertions and default budgets.
5. **Review.** Inspect the scoped diff, generator provenance and privacy exposure.
   Obtain an independent review for security/authority/lifecycle-sensitive changes.
   Close actionable findings or explicitly record why they remain blocking.
6. **Record and publish source.** Add concise evidence tied to source and inputs;
   review/secret-scan exact outgoing commits, push without force and verify remote
   identity. An unfinished checkpoint is allowed when labeled honestly; this is
   separate from PR approval, main integration and deployment.
7. **Hand off.** State what changed, what passed, what failed or is unverified,
   where evidence lives and the next real caller/gate. Do not invent percentages
   from time spent, line count, test count or number of commits.

## Evidence record template

Use this content in the relevant existing evidence file; create a new file only
when the topic has no owner. Do not fill missing values with plausible examples.

```text
Date and requirement/gate:
Source commit/tree; exact changed overlay if any:
Environment/toolchain and input identities:
Behavior under test; real caller and trust boundary:
Command/workload and selected file/sample counts:
Observed results, failures, skips and limitations:
Artifact/output identities and privacy-safe evidence links:
What this does NOT prove:
Remaining acceptance and next action:
```

Keep private identity, credentials and raw sensitive receipts in their authorized
restricted store. Public evidence describes the result and secure reference, not
secret contents. Screenshot fixtures, emulation, physical devices, authenticated
provider metadata and actual owner gameplay are separate evidence classes.

## Verification selection

Root `npm run check` covers licensing, public boundaries, assets, file-size policy,
tests, types and production build. Run it on the appropriate isolated candidate;
a direct Vite build is narrower. Root `tsconfig.json` only references projects:
use build-mode `npm run typecheck`, or explicit noEmit checks for
`tsconfig.app.json` and `tsconfig.node.json` (Vite configuration only).

Root Vitest selects `tests/**`, not `spacetimedb/tests/**`. Run module Node/tsx,
types and build scripts separately. Auth bridge and recovery services likewise
own separate scripts/lockfiles. Inspect each package's actual commands before
running; do not assume root checks transitively verify every package or `.mjs` file.

For a fresh clone, install from locked manifests. In an existing worktree, first
check whether dependencies are shared links/junctions. Do not mutate shared trees;
use suitable isolation. Test processes may write temporary fixtures, caches or
build information even if they make no production changes.

For documentation changes: verify local links and source paths; read the rendered
or structured result; check README/community/license contracts; compare numeric
claims with source; label historical images and statuses. Do not require new art
or a game redesign merely to improve documentation.

## Done has three different meanings

- **Change ready:** scoped behavior is implemented, tests and review support it,
  regressions/limits are documented, and source is safely synchronized.
- **Gate accepted:** the exact mandatory condition has its required evidence.
  Source-only or fixture evidence cannot close a live gate.
- **Release shipped:** all mandatory checklist items pass. Required sources are
  complete before final freeze; baseline and isolated write-preserving recovery
  are established before production effects; reviewed artifacts are deployed;
  live preservation/access/owner/performance results and Desktop package are linked.

Do not conflate these levels. There is no objective “10/10” score that replaces
verification. For documentation, readiness means a newcomer can find the target,
current state, subsystem owner, safe procedure, proof and next action without
contradictory directions. Keep that standard through future changes.

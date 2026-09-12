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
| Where do outputs belong and what can be removed? | [Output locations and retention](#output-locations-and-retention) | Keep the Desktop clear, reuse storage, preserve required evidence |
| What reached players? | [CHANGELOG](../../CHANGELOG.md), release/deployment ledger | Never mark planned or local-only work released |
| What may be reused? | [ASSETS-LICENSE](../../ASSETS-LICENSE.md), dated provenance | Preserve file-specific terms and attribution |

If documents conflict, follow the owner's current explicit task, then reconcile
product intent, specifications, source, and evidence. File age alone does not
establish authority. The owner authorizes improving mechanics and architecture
when it materially benefits the game or delivery. Record the reason, update the
owning specification, and preserve real player-state and security invariants.
Historical plans are context, not an automatic restriction on better solutions.

## Change cycle

1. **Orient.** Read the applicable requirement, identify subsystem owner and real
   caller, inspect branch/diff and tests. For diagnoses, gather evidence before
   implementing. Do not treat every fail-closed refusal as an accidental obstacle.
2. **Bound.** State the user-visible or operational outcome, preserved invariants,
   affected paths, relevant failure modes and proof needed. Connect release work
   to the existing evidence requirements. Keep process proportional to the change;
   do not invent mandatory gates for ordinary improvements.
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
   identity for every completed development change. Include its implementation,
   tests and owning notes in the same checkpoint where practical. Before yielding,
   publish all agent-authored durable work, including unfinished source labeled
   with its actual limits. Do not wait for full hosted CI or production readiness;
   publication remains separate from PR approval, main integration and deployment.
7. **Hand off.** State what changed, what passed, what failed or is unverified,
   where evidence lives and the next real caller/gate. Do not invent percentages
   from time spent, line count, test count or number of commits.

The owner's September 12 direction makes synchronization part of development,
not an optional later batch. Follow the [synchronization procedure](../operations/0.4.0-development-sync.md)
for every edited repository and its actual owning remote. Avoid accumulating
local-only changes or making extra commits just to repeat an unchanged status.
An active generated family stays intact until its required check finishes;
credentials, private evidence and ignored disposable output stay outside Git.
If publication fails, preserve the work and record the exact reason, then resume
sync when it clears. A running native build retains its pinned operating source
and is synchronized after it releases that source. A periodic app check provides
recovery for missed publications; the active developer still publishes directly.

## Output locations and retention

The owner's September 11 instruction is to keep new Warpkeep output off the
Desktop and avoid unnecessary storage growth. This applies to agents, scripts,
exports and final delivery, including redirected and OneDrive Desktops. Older
plans that require a Desktop package or private Desktop census are superseded.
An explicit later request can choose a different destination.

| Material | Destination and lifetime |
| --- | --- |
| Durable plans, findings and handoffs | Update the existing owner in `docs/agent-notes/0.4.0/`, `docs/evidence/0.4.0/` or `docs/operations/`. Use Git history instead of sibling backups or another full project summary. |
| Local non-sensitive logs, screenshots and disposable output | Use the checkout's ignored `artifacts/` tree and stable task directories. Reuse replaceable output after recording needed evidence; do not overwrite captures cited by an acceptance record. |
| Final credential-free delivery | Keep the tracked [delivery index](../evidence/0.4.0/desktop-handoff.md) current. Materialize one package at `artifacts/delivery/0.4.0/` only when delivery requires it. Keep the last accepted package until its replacement is verified; omit duplicate source trees, dependency folders and archives. |
| Private release candidates, journals and authenticated evidence | Use the existing fixed private roots required by the operation. On the current WSL host, preparation uses `/home/warpkeep/.warpkeep/release-preparation-v1/`. Never redirect private data into `artifacts/`, Git, the Desktop or cloud sync. |
| Temporary test fixtures | Use the test runner's owned temporary directory and its cleanup path. Keep only the diagnostics required to resolve a failure; record the path and reason in the existing task notes. |
| Tools, dependencies and caches | Reuse the attested toolchain and compatible locked caches. Reuse an existing independent verification checkout when suitable; do not create a fresh clone or install for every test. Never mutate a shared dependency junction or relax candidate isolation. |

Before a large build or preparation run, inspect free space on the Windows host
and, for WSL, inside the guest. Inspect retained run sizes and confirm the actual
process state before restarting work. Estimate peak space from a comparable run,
including the draft, final candidate, independent check and temporary compiler
trees. If that headroom is unavailable or uncertain, inspect/reclaim eligible
disposable output before starting another large run; do not fill the volume.
A large advertised WSL virtual disk does not establish free host space.

At task completion, stop owned servers and child processes, retain the active
candidate and last accepted recovery/evidence set, and remove only known
agent-owned disposable outputs that are no longer referenced. For each cleanup,
resolve the absolute target, verify it remains inside the intended disposable
root, reject symlinks/junctions that escape it, and check that no active process,
candidate, journal, acceptance record or recovery path needs it. Remove exact
reviewed targets with native filesystem operations. Do not use blanket
`git clean`, `reset --hard`, age-based recursive deletion or a global cache purge.

The assembler's `recover` command rolls back a candidate; it is not garbage
collection. Preserve journals, receipts, ambiguous/interrupted runs, deployed
artifacts and their recoverable inputs until their owning operation explicitly
establishes that they can be retired. Never delete those records just because
they are large or old. Record an unresolved retention decision and its size
instead of silently generating more copies or destroying evidence.

Routine documentation work does not require another release preparation run.
Run focused checks for the actual change; rebuild/recheck a release candidate
when its inputs or required acceptance change. Do not produce an archive or
Desktop backup for each edit. The existing Desktop handoff may be read or
updated in place; its location is not an output-directory convention.

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

When keep phases, panels or navigation change, include
`tests/PtrGameplay04SurfaceHost.test.tsx` alongside the affected `Keep04` and
controller suites. That real route composition exercises pending commands and
back navigation in both the Mini App and browser. Assert the retained presentation,
accessible feedback and command boundary; do not preserve retired copy as a proxy
for the behavior. Component-only checks missed this integration expectation in
the September 12 pending-keep change.

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
  live preservation/access/owner/performance results and workspace package are linked.

Do not conflate these levels. There is no objective “10/10” score that replaces
verification. For documentation, readiness means a newcomer can find the target,
current state, subsystem owner, safe procedure, proof and next action without
contradictory directions. Keep that standard through future changes.

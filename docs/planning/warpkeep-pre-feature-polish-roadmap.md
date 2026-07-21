# Warpkeep pre-feature polish roadmap

This document defines the reviewable polish train for the Alpha before new
horizontal gameplay features are added. It is planning guidance, not an
authorization to merge, publish, seed, deploy, activate, or mutate production.
Each implementation PR must refresh repository state, open PRs, tags/releases,
worktrees, and production status before editing.

## Baseline

- Repository: `ael-dev3/Warpkeep`
- Planning checkpoint: `main` at `582441671f7ad41158ef7117d28985608d3fa96a`
- Checkpoint release: Alpha 0.3.13 — The Living Lowlands
- Backend protocol: 3
- Schema tail: `realm_water_revision_v1` at append-only reference 46
- Renderer: React + TypeScript + Three.js r185 with a custom WebGL scene

The checkpoint is historical. Implementation branches must verify the current
remote `main` and production state again; no version, deployment, or backend
assumption in this document is permanent.

## Why this train comes first

The current Alpha has a substantial world and rendering surface, but several
player-facing systems are still architectural prototypes:

1. A Realm graphics, model, or context failure can still expose a terminal
   illustrated fallback instead of recovering the real scene. The fallback
   should remain a bounded compatibility surface, never a post-ready renderer
   state.
2. Food, Wood, Stone, and Gold are presented as resource-specific singleton
   expeditions rather than four stable workers. The world has no public worker
   ID, ordinal, roster, dedicated worker inspector, individual recall, or
   recall-all command.
3. Resource accrual still exposes pending balances and explicit collection.
   Completed server time appears as “ready to collect,” which feels like
   confirming a database deposit instead of commanding workers.
4. Water topology is strong, but Water v1/v11 is early visual work: wave
   brightness modulation does not displace the surface or provide analytic
   normals, shore/crest/river foam, or an inspectable Water record.
5. Heath blooms and purple semantic tint are intentional renderer content, but
   conflict with the desired lush Lowlands art direction.
6. The immutable shared forest is sparse for a 10,000-cell world. Denser
   presentation needs camera-local, bounded ecology rather than an unbounded
   global tree increase.

The next feature after this train should return to the published product loop:

`resources → one durable keep improvement → visible persistent result → return testing`

## Serial PR sequence

Prefer this integration order. A draft may be stacked on the exact predecessor
head when parallel work is necessary, but its dependency must be explicit and
it must not merge out of order.

| Order | Title | Invariant | Prompt |
| --- | --- | --- | --- |
| 1 | Fix Realm renderer recovery and remove the terminal world fallback | A real renderer recovers or fails explicitly without replacing a ready world with a full-world SVG | `01_Warpkeep_Realm_Renderer_Recovery_PR_Prompt.txt` |
| 2 | Gameplay: add four generic castle workers and automatic settlement | Four durable worker identities gather and settle server-authoritative resources automatically | `02_Warpkeep_Generic_Four_Worker_Authority_Automatic_Settlement_PR_Prompt.txt` |
| 3 | UX: give workers a dedicated command center and world identity | Worker roster, IDs, commands, recall, and world markers are coherent and inspectable | `03_Warpkeep_Worker_Command_Center_World_UX_PR_Prompt.txt` |
| 4 | UX: make visible Water cells selectable and inspectable | Water selection and records use the same identity-safe interaction model as other world targets | `04_Warpkeep_Selectable_Water_Cells_Inspector_PR_Prompt.txt` |
| 5 | Visual: add real Water motion, foam, and atmospheric fog | Water motion and atmosphere are layered, bounded, and compatible with fallback, mobile, and reduced motion | `05_Warpkeep_Layered_Water_Foam_Fog_PR_Prompt.txt` |
| 6 | Visual: remove purple ground clutter and unify the lush Lowlands | Heath, grass, terrain, and lighting share one readable Lowlands palette | `06_Warpkeep_Lush_Lowlands_Palette_Grass_PR_Prompt.txt` |
| 7 | Visual: add dense bounded forest ecology | Forest density increases locally and deterministically without changing shared authority or exhausting budgets | `07_Warpkeep_Dense_Forest_Ecology_PR_Prompt.txt` |

PR 1 is currently represented by open renderer-recovery PR #80 and its focused
follow-up #82; neither is part of this documentation-only change. Do not
duplicate that diff. Any follow-up should state whether it is stacked on that
branch and should preserve its exact dependency.

## Dependency and conflict model

Use a serial train:

`PR 1 → PR 2 → PR 3 → PR 4 → PR 5 → PR 6 → PR 7`

PRs 1, 3, 4, and 5 touch shared Realm interaction and rendering surfaces.
PRs 3 and 4 both extend pick arbitration and inspector state. PRs 5, 6, and 7
share environment, terrain, vegetation, and rendered QA surfaces. Independent
large branches would recreate the integration risk that motivated this train.

Do not use open PR #79 as a base. It is an unrelated README restoration. Do not
close, retarget, or modify it without explicit owner instruction. Keep the
renderer PRs and this planning document independent.

## Reviewability limits

Each PR should target one independently understandable invariant and preferably
stay below 80 changed files and 8,000 net new lines. Do not mix backend
authority with a major visual redesign unless the prompt explicitly requires
the boundary. Every PR body must state its exact base and head, what changed,
what did not change, checks run, and residual risks.

If an implementation exceeds these limits, split it at the architecture
boundary rather than compressing a release megadiff into one review.

## Guardrails for every implementation PR

- Refresh `main`, open PRs, tags/releases, worktrees, repository instructions,
  and production state before editing.
- Distinguish source readiness from deployed, seeded, activated, or verified
  production state.
- Preserve auth version 2 unless a separate security review requires a change.
- Preserve append-only SpacetimeDB schema order and generated-binding checks.
- Use `--delete-data=never` for any separately authorized publication.
- Keep browser presentation non-authoritative; FIDs, balances, cargo,
  idempotency, ownership, and operator data remain private and server-owned.
- Preserve non-WebGL, keyboard, touch, reduced-motion, and mobile paths.
- Run the full repository check, focused tests, and rendered QA appropriate to
  the change.
- Report residual risks honestly.
- State explicitly that no merge, deploy, publish, seed, or activation occurred.

## Out of scope during this train

Do not add keep construction or upgrade queues, combat, armies, raids,
alliances, trade, chat, boats, swimming, fishing, naval mechanics, another
resource family, a second world-generation expansion, wallet/token/Marks
spending, a second renderer or animation scheduler, destructive migrations,
generic open image proxies, or unreviewed external art.

The purpose of this train is to make the existing Alpha coherent, legible,
recoverable, and satisfying before it becomes broader.

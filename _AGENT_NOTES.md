# Maintainer and agent notes

## Current release

Warpkeep Alpha 0.3.4 is the current Pages-only, admission-gated release.
v0.3.4 and protected-main commit 089430e identify the public build. The player
surface is shared realm viewing, castle presentation, and navigation; it is not
yet a complete strategy game.

Start with:

1. README.md
2. docs/technical-architecture.md
3. docs/design/warpkeep-direction.md
4. docs/design/roadmap.md
5. docs/releases/alpha-0.3.4.md
6. ASSETS-LICENSE.md

## Non-negotiable boundaries

- The browser is not authoritative for admission, ownership, resources, timers,
  or outcomes.
- FID is identity; handles and profile fields are display metadata.
- Never add a real or synthetic FID, change admission/founding state, or mutate
  production world state during diagnostics.
- Every production mutation needs explicit owner scope and a fresh bounded
  verification plan.
- Keep secrets, SIWF proofs, bearer material, private endpoints, and personal
  paths out of source, logs, screenshots, and issues.
- Preserve licensing/provenance records and keep source bundles in
  Warpkeep-Assets rather than the runtime repository.

## Scope discipline

Worker and SpacetimeDB publication are separate release decisions. Marks apply,
spending, production crediting, and scheduling are unavailable. The next
gameplay work is a small server-authoritative resources and construction-queue
slice, not a broad simulation expansion.

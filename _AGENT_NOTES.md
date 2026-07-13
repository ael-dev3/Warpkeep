# Maintainer and agent notes

## Current state

Warpkeep Alpha 0.3.1 has a live title/menu, an explicit Alpha Terms gate,
browser-bound S256 website SIWF, rotating HttpOnly session families, a
least-privilege Cloudflare Worker OIDC bridge, a non-destructively published
protocol-v2 SpacetimeDB module, a deterministic 61-cell Lowlands, and
quality-aware title/realm rendering. Production admission remains intentionally
empty; do not create a player or castle as a convenience test.

Start with:

1. `README.md`
2. `docs/design/roadmap.md`
3. `docs/technical-architecture.md`
4. `docs/farcaster-integration.md`
5. `docs/operations/reconstruction/README.md`
6. `ASSETS-LICENSE.md`

## Hard boundaries

- FID is identity; handles and profile fields are display metadata.
- The browser never owns admission, keep ownership, resources, timers, or combat.
- AI output is flavor, not authority.
- Never add a real/synthetic FID, mutate production world state, or use destructive SpacetimeDB flags during diagnostics.
- Keep secrets, SIWF proofs, bearer material, private endpoints, and personal paths out of source, logs, screenshots, and issues.
- Preserve the immutable v0.3.0 licensing cutover commits and normal merge ancestry.
- Runtime assets stay in Warpkeep; authorized source bundles belong in immutable Warpkeep-Assets releases. Unresolved-rights material is not published by assumption.

## Next product work

The next deliberate slice is one admitted shared-realm fixture, followed by server-derived resources and construction queues. Each slice needs deterministic reducers, generated-binding parity, isolated tests, exact-head deployment, production verification, and rollback evidence before expansion.

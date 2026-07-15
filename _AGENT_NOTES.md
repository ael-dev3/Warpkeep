# Maintainer and agent notes

## Current state

The checked-in package is the Alpha 0.3.4 Pages-only candidate. The verified
public release remains Alpha 0.3.3. The public menu build stamp identifies the
exact deployed source; an annotated release tag is created only after that
deployed commit passes exact-build verification. Do not turn the disabled local
QA observer into a Worker or SpacetimeDB release without a separately reviewed
production scope.

Warpkeep Alpha 0.3.3 has a live title/menu, an explicit Alpha Terms gate,
browser-bound S256 website SIWF, rotating HttpOnly session families, a
least-privilege Cloudflare Worker OIDC bridge, and a non-destructively published
protocol-3 SpacetimeDB module. Genesis 001 contains 1,261 authoritative cells
and 100 permanent castle slots ordered outward from the close founding district.
Deliberately admitted founders occupy the shared frontier; do not add an
admission, create a convenience player, or mutate their state during diagnostics.

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
- Never add a real/synthetic FID, change admission/founding state, mutate production world state, or use destructive SpacetimeDB flags during diagnostics. Every production mutation requires explicit owner scope and fresh bounded pre/post verification.
- Keep secrets, SIWF proofs, bearer material, private endpoints, and personal paths out of source, logs, screenshots, and issues.
- Preserve the immutable v0.3.0 licensing cutover commits and normal merge ancestry.
- Runtime assets stay in Warpkeep; authorized source bundles belong in immutable Warpkeep-Assets releases. Unresolved-rights material is not published by assumption.

## Next product work

The founding slice is live. The next deliberate gameplay slice is
server-derived resources and deterministic construction queues. Marks apply,
spending, production crediting, and scheduler installation remain unavailable
until their separate transport, recovery proof, review, and owner approval are
complete. Each slice needs deterministic reducers, generated-binding parity,
isolated tests, exact-head deployment, production verification, and rollback
evidence before expansion.

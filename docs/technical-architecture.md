# Technical architecture

Warpkeep is an admission-gated persistent-world alpha. The current player
experience is realm exploration and castle presentation; economy, combat, and
social systems are deliberately not live.

## Authority boundaries

- The browser owns presentation and short-lived client state only. It never
  decides admission, castle ownership, resource totals, timers, or outcomes.
- The Farcaster identity bridge verifies sign-in and brokers bounded browser
  sessions. It is separate from game authority and public admission.
- The SpacetimeDB module is authoritative for admission, world, player, and
  castle state. Private ownership and administrative records are not public
  browser authority.
- Public projections exist for display and navigation. They do not grant a
  player power to alter authoritative state.

## Client presentation

The player is built with React, TypeScript, Vite, Three.js/WebGL, and responsive
CSS. The title, menu, and realm share quality preferences while preserving
reduced-motion and non-WebGL fallbacks. Model assets are integrity-pinned and
loaded only when their screen needs them.

## Delivery

Semantic versions name release lines; an immutable tag and build SHA identify a
specific public deployment. Protected CI validates the frontend, release
configuration, provenance, and additive compatibility before the Pages workflow
publishes a frontend release. Worker and SpacetimeDB operations are separate
release decisions.

## Repository guide

- src/components — player presentation
- src/farcaster — identity-entry state and browser boundary
- src/spacetime — generated client boundary
- spacetimedb — authoritative server module
- scripts — build, asset, and release tooling
- docs — current decisions, release records, and provenance

For the current product scope, start with the [README](../README.md),
[product direction](design/warpkeep-direction.md), [roadmap](design/roadmap.md),
and [latest release notes](releases/alpha-0.3.4.md).

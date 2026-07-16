# Technical architecture

Warpkeep is an admission-gated persistent-world alpha. The current player
experience is realm exploration and castle presentation; economy, combat, and
social systems are deliberately not live.

## Authority boundaries

- The browser owns presentation and short-lived client state only. It never
  decides admission, castle ownership, resource totals, timers, or outcomes.
- The Cloudflare identity bridge independently verifies Farcaster sign-in and
  brokers bounded OIDC/browser sessions. It is separate from game authority and
  public admission.
- The SpacetimeDB module is authoritative for admission, world, player, and
  castle state. Private ownership and administrative records are not public
  browser authority.
- Public projections exist for display and navigation. They do not grant a
  player power to alter authoritative state.

## Authentication presentation

FID is the only identity coordinate. Username, display name, biography, and PFP
are sanitized public presentation fields. A tab-scoped cache may restore those
fields only when its exact FID matches an authoritative cookie refresh; it
cannot restore a session or choose identity. Browser-bound S256 flow, rotating
HttpOnly session families, short-lived OIDC handoff, and SpacetimeDB admission
remain separate fail-closed gates.

Remote profile presentation is optional and fail-closed. Only reviewed
provider/path pairs or the fixed same-origin observer placeholder may enter the
bounded JPEG/PNG/static-WebP loader. It omits credentials and referrer, refuses
redirects, caps time, transfer bytes, dimensions, and decoded pixels, then draws
one temporary blob decode into a static canvas and disposes it. The DOM keeps a
local monogram fallback throughout; profile delivery never grants identity or
session authority.

## Client presentation

The player is built with React, TypeScript, Vite, Three.js/WebGL, and responsive
CSS. The title, menu, and realm share quality preferences while preserving
reduced-motion and non-WebGL fallbacks. Genesis readiness is validated before
the Realm appears.

Founded keeps use one realm-lifetime castle/base prefab repository. Each
graphics profile pairs an integrity-pinned GameReady castle with its matching
authored landscape base, then shares those resources through instanced LOD
buckets. The pair loads and fails as one assembly. Selection, labels, camera
focus, culling, and disposal remain presentation concerns; authoritative
coordinates and ownership come only from the validated snapshot.

Runtime GLBs use immutable SHA-prefixed filenames plus exact length/hash checks.
The prior release's public castle paths retain their former bytes so cached
clients and rollback remain safe. Source packages stay offline; checked-in
runtime files, installers, dated manifests, and provenance records define the
reviewable asset boundary.

Concurrent castle/base byte requests share a transport only for the same
integrity-pinned URL and normalized timeout policy; individual cancellation
cannot abort another consumer, while the final pending cancellation stops the
transport. The mounted-Realm prefab repository coalesces LOD acquisitions,
owns one retain per cached entry, retires only after pending acquisitions and
active leases both reach zero, and disposes shared resources exactly once.
Retired or failed entries do not revive during that Realm lifetime. An empty
authoritative castle set reaches readiness with zero presented models.

## Local QA boundary

Unit and rendered-browser lanes cover readiness, responsive UI, WebGL models,
labels, picking, fallbacks, and cleanup. The optional macOS QA observatory is a
local, machine-bound test subsystem. Production build checks reject its broker,
fixture, endpoint, and procedure markers from Pages assets. It owns no Worker,
SpacetimeDB, player, or admission authority.

## Delivery

Semantic versions name release lines; an annotated tag and exact build SHA
identify a public deployment. Protected CI validates frontend behavior,
configuration, provenance, asset integrity, production exclusions, and additive
backend compatibility before Pages publishes. Worker and SpacetimeDB operations
remain separate release decisions.

## Repository guide

- `src/components` — player presentation
- `src/farcaster` — identity-entry state and browser presentation boundary
- `src/spacetime` — generated client boundary
- `spacetimedb` — authoritative server module
- `services/auth-bridge` — independently verifying identity/session bridge
- `scripts` — build, asset, QA, and release tooling
- `docs` — current decisions, release records, recovery, and provenance

Start with the [README](../README.md), [product direction](design/warpkeep-direction.md),
[roadmap](design/roadmap.md), and [Alpha 0.3.5 release notes](releases/alpha-0.3.5.md).

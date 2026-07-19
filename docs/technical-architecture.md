# Technical architecture

Warpkeep is an admission-gated persistent-world Alpha. The browser renders the
Realm, a Cloudflare Worker verifies Farcaster sign-in, and SpacetimeDB owns game
state. These responsibilities stay separate so a compromised or stale browser
cannot grant admission, claim a castle, or invent resources.

## System overview

### Browser client

The React and TypeScript client presents the title, menu, authentication flow,
and Realm. Three.js/WebGL renders the Lowlands and founded castles, with
responsive CSS and non-WebGL fallbacks for constrained devices.

The client holds short-lived presentation state. It validates server
projections before showing the Realm and does not apply optimistic ownership or
resource changes.

### Identity bridge

The Cloudflare Worker independently verifies Farcaster sign-in, binds the flow
to the initiating browser, and manages short-lived sessions. Farcaster ID (FID)
is the identity key; usernames, display names, biographies, and portraits are
sanitized presentation data.

Authentication proves identity but does not grant admission or game ownership.
The bridge issues narrowly scoped claims that SpacetimeDB validates again.
Implementation and local setup are documented in
[`services/auth-bridge/README.md`](../services/auth-bridge/README.md).

### SpacetimeDB module

SpacetimeDB owns admission, player and castle bindings, the persistent world,
Terms acceptance, resource accounts, Community Marks, and server-time
settlement. Public tables expose only what the shared map needs; ownership,
administration, and player balances remain private.

Reducers derive identity and authority from the authenticated caller. The
browser cannot choose an FID, castle owner, balance, timer, or outcome through
request fields. Schema changes are additive because deployed tables and
generated client bindings must remain compatible.

The module guide, local commands, and schema notes live in
[`spacetimedb/README.md`](../spacetimedb/README.md).

## Current world and resource model

Genesis 001 contains 10,000 persistent cells and 100 permanent castle sites
near its founding district. Founded players return to the same castle and can
inspect public castle and profile presentation for nearby founders.

Each founded castle has a private Food, Wood, Stone, and Gold account. Terrain
and completed ten-minute server intervals determine yield. Collection settles
only server-recorded production and never reveals another player's balances.
Community Marks use separate accounting and currently have no spending,
conversion, transfer, redemption, or reward loop.

Gold Mines, Wheat Farms, Logging Camps, and Stone Quarries are public map
projections. Each resource has an independent private expedition that is bound
to its caller and settled by server time. Public occupation rows show only the
site, phase, timeline, and origin castle. Construction, upgrades, units, combat,
alliances, trading, chat, seasons, and governance are not playable yet.

## Realm presentation

The client receives a validated public Realm snapshot and the authenticated
player's private projection. It waits for both before entering the Realm.
Reconnects may retain public scenery, but private actions remain unavailable
until caller authority returns.

Castle models and their landscape bases are shared across founded sites through
instancing and level-of-detail tiers. Selection, labels, camera focus, culling,
and accessibility are presentation concerns; coordinates and ownership always
come from server state.

The shared forest and procedural grass are deterministic presentation layers.
The coast and twelve rivers are rendered from an activated canonical water
layout held by SpacetimeDB. Graphics quality may change environmental detail,
but never world membership, resource placement, or authority.

Runtime assets use immutable filenames and integrity checks. Source packages,
reference masters, and provenance records stay separate from public runtime
files. See [`ASSETS-LICENSE.md`](../ASSETS-LICENSE.md) before changing media.

## Security and privacy

The main design rules are:

- treat browser, relay, profile, and network input as untrusted;
- keep identity, admission, ownership, balances, and timers server-owned;
- expose the minimum public projection needed by the Realm;
- keep secrets, proofs, QR payloads, private logs, and operator data out of the
  repository and browser output;
- use least-privilege claims and short-lived sessions between services;
- fail closed when configuration, identity, schema, or projection validation
  is incomplete.

The current defensive assumptions and residual risks are documented in the
[`threat model`](security/threat-model.md). Sensitive reports follow
[`SECURITY.md`](../SECURITY.md).

## Development and delivery

Vitest covers client behavior, server-facing decoders, auth bridge logic,
migration compatibility, and asset contracts. Local rendered-browser fixtures
exercise responsive WebGL and fallback paths without real users or production
state.

GitHub Actions builds the client, auth bridge, and SpacetimeDB module; runs the
test and dependency checks; verifies generated bindings and asset provenance;
and scans code and committed history for security issues. Pages deployment is
limited to `main`. Worker publication, database publication, data migration,
and admission changes remain separate operator actions.

## Repository map

- `src/` — browser application and presentation contracts
- `services/auth-bridge/` — Farcaster verification and session bridge
- `spacetimedb/` — server-owned world and player state
- `scripts/` — build, asset, migration, and local QA tooling
- `tests/` — frontend and cross-boundary regression tests
- `docs/design/` — product direction and world design
- `docs/operations/` — operator and recovery guides
- `docs/reference/` — asset provenance and review records

For a shorter product view, start with the [README](../README.md) and
[roadmap](design/roadmap.md). For development checks, see
[CONTRIBUTING.md](../CONTRIBUTING.md).

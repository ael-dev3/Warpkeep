# Technical architecture

Warpkeep is an admission-gated persistent-world Alpha. The browser renders the
Realm, a Cloudflare Worker verifies Farcaster sign-in, and SpacetimeDB owns game
state. These responsibilities stay separate so a compromised or stale browser
cannot grant admission, claim a castle, or invent resources.

## System overview

### Browser client

The React and TypeScript client presents the title, menu, authentication flow,
and Realm in ordinary browsers and as a Farcaster Mini App. Three.js/WebGL
renders the Lowlands and founded castles, with responsive CSS and non-WebGL
fallbacks for constrained devices. Compact screens keep the map full-screen and
open complex records through one bounded, history-aware destination stack.

The client holds short-lived presentation state. It validates server
projections before showing the Realm and does not apply optimistic ownership or
resource changes.

### Identity bridge

The Cloudflare Worker independently verifies browser SIWF or an exact-domain
Mini App Quick Auth bearer. Browser SIWF remains bound to the initiating browser
and may use a rotating `SameSite=Strict` session; Mini App entry is cookie-free
and reacquires a host bearer when needed. Both paths issue only short-lived,
memory-held player access. Farcaster ID (FID) is the identity key; usernames,
display names, biographies, portraits, and Mini App context are sanitized
presentation data.

Authentication proves identity but does not grant admission or game ownership.
The bridge issues narrowly scoped claims that SpacetimeDB validates again.
Implementation and local setup are documented in
[`services/auth-bridge/README.md`](../services/auth-bridge/README.md).

### SpacetimeDB module

SpacetimeDB owns admission, player and castle bindings, the persistent world,
Terms acceptance, resource accounts, Community Marks, and server-time
settlement. The prepared Inner Keep suffix also keeps construction policy,
Builder state, deductions, receipts, and completion under the same authority.
Public tables expose only what shared presentation needs; ownership,
administration, balances, Builder state, and receipts remain private.

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

The inactive Inner Keep V1 foundation defines twelve fixed castle-compound
slots, four unique economy buildings with five levels, and one internal Builder
per founded castle. It is separate from the four external gathering Workers.
The client submits a fixed slot, building kind, and idempotency key; the server
derives level, cost, discount, duration, settlement, deduction, and completion.
Merging to protected `main` triggers the existing verified Pages deployment of
the compatible, dormant client. Publication, catalog seed, Builder backfill,
runtime asset verification, and activation remain separate owner-reviewed
operations.
See the [Inner Keep V1 authority contract](design/inner-keep-construction.md)
and [future activation runbook](operations/inner-keep-activation.md).

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

The Realm and Inner Keep use one canvas, WebGL renderer, quality policy,
recovery path, and animation scheduler. Switching to the Inner Keep suspends
world interaction instead of creating a second graphics context. A functional
twelve-slot HTML/CSS view preserves navigation, costs, Builder status, and
guarded actions when 3D or an optional model is unavailable.

The installed Inner Keep presentation uses the Grand Covenant Cathedral as its
northern anchor and the Barracks as its western garrison. Fixed authored
scenery, quality-bounded grass and water, and deterministic ambient citizens
and patrols remain client-only presentation. They never provide server
coordinates, collision, unit, chat, resource, reward, or ownership authority.
Static placement is atomic, loading is bounded and retry-safe, and a procedural
compound remains available until exact coverage is safe to reveal.

Runtime assets use immutable filenames and integrity checks. Source packages,
reference masters, and provenance records stay separate from public runtime
files. The two Inner Keep installers accept only the exact content-addressed
static and population selections authorized on 2026-08-04; archive publication
alone would not have been enough. See
[`ASSETS-LICENSE.md`](../ASSETS-LICENSE.md) before changing media.

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
limited to `main` and requires the signed static Mini App manifest, exact image
contract, and hidden `.well-known` upload. Worker publication, database
publication, data migration, and admission changes remain separate operator
actions.

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

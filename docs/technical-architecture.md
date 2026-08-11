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

A review-only Realm Chat V1 implementation is isolated from the large Realm
snapshot. SpacetimeDB owns sender identity, order, time, anti-abuse state,
history, reporting, and moderation evidence; the browser may subscribe only to
one status row and a bounded recent projection. Independent client and server
gates plus a blocked production publication lane keep it unavailable pending a
separate legal and operational activation review.

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

The inactive Inner Keep V1 foundation defines a continuous buildable interior,
six unique buildings with five levels, and one internal Builder per founded
castle. It is separate from the four external gathering Workers. The retained
v15 compatibility-slot table has zero rows; Barracks and Cathedral begin absent
alongside the four economy buildings.

The client submits a building kind, local X/Z microunits, quarter-turn rotation,
idempotency key, `expectedTargetLevel`, canonical decimal
`expectedProjectRevision`, `expectedPolicyDigest`, and `expectedLayoutDigest`.
The four expected values are untrusted quote-and-placement-binding
compare-and-set assertions. The server derives ownership, the current target,
current policy digest, and current layout digest. After a prior accepted receipt
has short-circuited idempotently, a new request verifies policy/layout digests
and transactionally reconciles any exact overdue project. It validates the
half-meter-snapped transform inside x `[-44, 44]` / z `[-40, 32]`, rejects
road/civic exclusions and persisted footprint overlap, then checks target and
aggregate revision against the reconciled graph. A mismatch rolls the whole
reducer back before reconciliation, settlement, or deduction can commit. It
then derives cost, discount, duration, settlement, deduction, and completion.

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
HTML/CSS placement view preserves navigation, the valid-ground map, costs,
Builder status, and guarded actions when 3D or an optional model is unavailable.

The installed Inner Keep presentation begins mostly empty, with roads, a civic
commons, walls, and modest non-functional town dressing. Grand Covenant
Cathedral and City Barracks appear only as player-built outcomes at persisted
server transforms. Fixed authored scenery, quality-bounded grass and water,
and deterministic ambient citizens and patrols remain client-only
presentation. They never provide unit, chat, resource, reward, or ownership
authority. Static placement is atomic, loading is bounded and retry-safe, and
a procedural compound remains available until exact coverage is safe to reveal.

The 96 x 80 meter palisade surrounds an 88 x 72 meter authoritative support
rectangle after the four-meter interior setback. Presentation-only dirt aprons
and district roads make the larger footprint readable. Native placement
controls use a 0.5-meter snap and 0 / 90 / 180 / 270-degree rotations, while
the server revalidates the same geometry before accepting a command.

The surrounding-estate policy is a separate client contract and does not
change the canonical Inner Keep layout digest. One finite deterministic height
sampler grounds its nine topographic features, connected headwater-rill-lake,
outer patrol road, grass, trees, animals, trade wagon, and scenic resource
structures. The compound footprint samples to exactly zero; terrain feathers
through a rounded 5.5-meter shoulder only beyond the walls. The estate spans
144 x 144 meters. A separately digested, non-pickable countryside ring extends
the rendered field to 416 x 544 meters without changing the detailed sampler,
placement density, canonical layout digest, or server authority. It fades to
the scene fog and caps crop tufts at 320 / 192 / 96 and procedural hedgerow
silhouettes at 32 / 20 / 10. Camera focus is presentation-clamped to nine
meters per axis with reduced screen tracking so the visual boundary remains
outside supported views. Quality caps detailed grass at 2,400 / 1,400 / 480
blades and eight Warpkeep-Assets tree species at 72 / 44 / 22 instances.

The same outer policy caps presentation-only resource structures at 8 / 6 / 4
and rabbits at 10 / 7 / 4, with one trade wagon in every tier. The optional
exact rabbit layer replaces matching procedural animals only after its local,
content-addressed model is ready. Terrain, trees, resources, wagon, and
wildlife report and fail independently, so an optional asset failure cannot
remove healthy scenery or affect gameplay state. None of these anchors are
resource nodes or server coordinates, and none can create production,
balances, Workers, collision, ownership, or rewards.

Runtime assets use immutable filenames and integrity checks. Source packages,
reference masters, and provenance records stay separate from public runtime
files. The three Inner Keep installers accept only the exact content-addressed
static, population, and Lowlands Rabbit selections authorized for runtime use;
archive publication alone would not have been enough. See
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

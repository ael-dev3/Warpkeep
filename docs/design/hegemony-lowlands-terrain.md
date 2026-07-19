# Genesis 001 Realm presentation

## Purpose

Genesis 001 is one persistent Lowlands world. SpacetimeDB owns the realm,
world tiles, public metadata, players, profiles, castles, and private resource
state. The browser renders validated server data; it does not invent ownership,
identity, castle coordinates, balances, or replacement geography.

The current Realm supports exploration, castle inspection, caller-private
terrain yield, roads, and shared Gold Mine, Wheat Farm, and Logging Camp sites.
Units, combat, fog of war, and alternate biomes are not part of the current
presentation.

## Realm loading

The authenticated Realm appears only after the client has a complete,
internally consistent snapshot for a recognized Genesis generation. Realm
metadata, tile keys, terrain sidecars, castle occupancy, and the current
player's castle must agree. Partial, stale, ambiguous, or mixed snapshots stay
behind the loading surface and eventually offer Retry or Return to Menu.

A reconnect may retain the previous public view only for the same player and
matching world fingerprint. Private balances and actions remain unavailable
until current authority returns. The browser never substitutes a local recovery
map for missing server state.

The live generation contains 10,000 authoritative cells: a complete radius-57
disc plus 81 cells on ring 58. Rendering extends to radius 60 with a neutral
981-cell visual apron. Apron cells improve the horizon but have no server
metadata, ownership, movement, resource, or gameplay meaning.

The map uses pointy-top axial coordinates. Stable hashes of the world seed,
coordinates, channel, and item index generate presentation detail without
mutable random state. Server coordinates determine every
castle and authoritative cell.

## Lowlands terrain

Genesis 001 should read as a continuous landscape, not a board of disconnected
hexes. The renderer combines pointy-hex geometry into shared terrain, reuses
edge positions, and computes normals across the result to avoid cracks,
overlapping surfaces, and hard seams.

The central play area receives denser geometry while distant cells use a
coarser representation. This split is deterministic and selected before large
CPU or GPU allocations. High, Balanced, and Reduced profiles change detail
budgets without changing world coordinates or terrain identity.

The Lowlands palette uses restrained moss, grass, dried gold, heather, stone,
soil, and slate water. Authoritative metadata selects one of seven terrain
families: Lowland, Meadow, Forest, Heath, Ridge, Lake, or Ancient stone. Tints
fade at cell edges so terrain categories remain legible without drawing a hex
grid over the world.

Instanced grass, dry tufts, stones, coppices, heather, outcrops, water, and
monoliths add local character. Their placement is deterministic, respects the
active quality profile, and clears castle foundations and scenic blockers.
Detail updates are demand-driven and pause while the document is hidden.

Metadata such as `resource-capable`, `core-capable`, and `reserve` describes
placement capacity only. Live resource sites come from separate, validated
server catalogs; the terrain renderer never turns metadata flags into nodes,
rewards, balances, or interactive targets.

## Castles and foundations

Every founded castle is presented at its server-provided axial coordinate.
Presentation may normalize a model for consistent scale and grounding, but it
must never move a castle to improve composition, resolve label crowding, or fit
client-generated terrain.

Each graphics profile pairs one Hegemony castle model with its matching authored
landscape base. The castle receives the placement transform; the base copies
that same position, rotation, and uniform scale. The base is decorative and is
never independently centered, normalized, grounded, lifted, or treated as game
authority.

Terrain levels and blends around the complete authored island, and nearby
decoration is cleared from the same footprint. Castle geometry drives visual
detail selection, camera focus, and identity anchoring. Composite bounds may
support culling, while picking compares the nearest castle hit with a simple
base collider instead of raycasting decorative island triangles.

Models are loaded once per mounted Realm and shared through instanced detail
groups. Screen-space detail selection uses stable hysteresis and profile limits
to avoid rapid switching or unbounded high-detail residency. Cancellation,
unmount, and failed loading release shared resources without leaving partial
castles in the scene.

Sunlight, sky and earth bounce, restrained amethyst fill, a procedural
environment map, and the authored base give keeps readable depth without a
world-sized shadow pass or network HDR download. If environment allocation
fails, the direct lights and solid sky remain usable.

Asset permissions, integrity records, and source/runtime distinctions belong in [ASSETS-LICENSE.md](../../ASSETS-LICENSE.md).

## Identity and interaction

Castle identity comes from sanitized public profile records. World labels
prefer a validated username, then display name, then `Hegemony Keep`; numeric
FID values are not used as the primary name or avatar.

Each visible castle label stays attached to its projected foundation. Camera
distance, model detail, or crowding must not move it to a roof, cluster, or
unrelated screen position. Labels that cannot fit safely remain available
through Explore instead of becoming clipped controls.

Hover is visual only. Click, tap, Enter, Space, and Explore activation select a
castle. Drag and pinch gestures suppress accidental activation. One visible
world label participates in the tab order at a time; arrow keys move spatially,
Home and End follow reading order, and focus recovers when the active label
leaves the viewport.

The selected-castle record uses sanitized public identity and existing public
Realm fields only. It does not invent durability, alliances, combat state,
resources, rewards, or actions that the server does not provide.

## Camera, responsive UI, and fallback

The camera composes against the unobstructed play region rather than the raw
canvas center. It accounts for the player portrait, resource rail, drawers,
sheets, and safe-area insets. Opening an inspector recomposes the existing view;
reduced-motion mode settles it immediately.

Keyboard focus remains visible and returns to the initiating control. Escape
closes the topmost Realm surface first, touch targets remain at least 44 CSS
pixels, and hover-only feedback is never required or announced as state.

If WebGL2 or a required model is unavailable, an illustrated SVG fallback uses
a constant-size world hull rather than thousands of DOM hexes. It preserves
authoritative castle coordinates, identity, selection, HUD, inspector, and
Explore behavior. The hull and visual apron remain presentation only.

## Performance intent

The renderer favors shared geometry, instancing, deterministic detail budgets,
frustum culling, display-frame input updates, and prompt resource disposal.
Quality profiles should reduce visual cost without changing gameplay state or
which castles exist. Real device GPU, memory, and thermal behavior still vary,
so representative hardware checks remain important as the world gains detail.

For system ownership and data flow, see the [technical architecture](../technical-architecture.md).

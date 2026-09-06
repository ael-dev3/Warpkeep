# Astra-authored 0.4 keep: The Verdant Citadel

## Scope and authorship

The owner requested an Astra-authored new look and reassessment of internal
keep gameplay. GPT-6 Astra supplied the read-only design assessment used here.
Use Astra for implementation of this redesign. Do not claim that preserved
third-party or pre-existing assets were newly authored by Astra. Reuse neutral,
tested infrastructure where appropriate; create a new 0.4-owned art profile,
composition, presentation and controls instead of changing shared G001 assets.

This design continues the owner's standing implementation authorization.
It does not change admissions, authorize fabricated identity, or constitute
completed gameplay or visual validation.

## Direction and alternatives

Choose The Verdant Citadel: an elevated, readable town diorama with pale
stepped masonry, dark timber, oxidized-teal roofs, restrained violet warp
details, warm construction lighting and muted forest framing. Building kinds
must remain recognizable through distinct silhouettes rather than color alone.
New scene composition, materials, lighting and interface hierarchy must make
0.4 recognizably different in rendered comparison, not merely rename assets.

A fully voxelized miniature town would provide a stronger stylistic break but
requires rebuilding six building families and validating five-level readability.
An illustrated tactical courtyard is cheaper to render but weaker for free
placement and reusable voxel integration; use its schematic clarity as fallback.
The chosen direction retains the real voxel subsystem for decorative terrain
and scene framing without making every building a cube sculpture.

## Existing boundaries

WarpkeepExperience currently passes only PTR authority, view anchor and atlas
bridge into RealmMapScreen. RealmMapScreen rejects legacy resources, Workers,
innerKeep and their callbacks when PTR authority is present. Keep that legacy
rejection; add a separate authenticated 0.4 capability and presentation path.

The existing innerKeepPresentation imports spacetimedb/src/innerKeepPolicy and
its renderer checks the G001 catalog and economics. It is not a neutral model
for 0.4. Do not manufacture legacy policy values to satisfy those checks.
The actual G001 internal scene is created by createRealmScene through
createInnerKeepSceneLayer; preserve that route and its assets unchanged.

The PTR backend already exposes initialize_gameplay04_keep_v1,
get_gameplay04_keep_v1, dispatch_gameplay04_worker_v1,
recall_gameplay04_worker_v1 and start_gameplay04_building_v1. Current checked-in
PTR bindings and frontend do not expose those methods. Generate real bindings
with the accepted local compiler workflow before integrating typed calls;
never hand-invent generated methods or widen transport into arbitrary RPC.

## Playable journey

The keep is the home of decisions. Four Worker cards distinguish idle,
outbound, gathering and returning. Find resources opens actual Greater Realm
locations; dispatch uses validated atlas locations and server routes. Decorative
trees never become resource targets.

Building choices show exact resource deficits, costs, duration and effects.
Placement shows half-meter positions, quarter-turn rotation, legal/blocked
footprints and a permanent-placement warning. Preserve one active Builder and
existing queue/cancellation/refund semantics; no new such systems are implied.

Construction transitions visibly from scaffold to completed building. Show the
benefit for the next expedition, including Mill level-one food yield changing
from ten to twelve per quantum under current policy. Existing expeditions keep
their captured rates. Display spendable balances separately from pending returns.
Client countdowns never grant resources, finish construction or mutate authority.

The first representative journey must include actual dispatch, return, Mill
placement, construction completion and improved subsequent gathering. A
ten-minute first economy-building-and-improved-return target is a product
acceptance goal to verify against actual atlas routes, not a claim already proven.

## Component boundaries

Create separate 0.4 modules for authenticated gameplay transport/controller,
validated presentation, keep screen, scene host and visual profile. The controller
owns command sequence and exact retry envelopes; unknown commit status retries
the same envelope, stale quotes refresh and require confirmation. Validate
responses before exposing immutable presentation state. Recheck authority before
and after asynchronous work; realm/session/database/epoch changes discard state
and retire pending operations. No credentials enter the renderer.

The renderer receives only building kind, persisted transform, construction
state and selection. Reuse neutral loaders, disposal and meshing utilities only
where their contracts permit it. Integrate decorative stepped ground through
the existing bounded voxel mesher. Keep authoritative placement geometry and
navigation unchanged and ensure legal footprints never look blocked by scenery.

Only one scene canvas remains active. Entering the keep stops hidden world
rendering; returning releases keep resources and restores the correct world
context without session reuse across realms.

## Mobile, accessibility and fallback

Forest and voxels are visual-only: no new terrain destruction, excavation,
interactive vegetation, harvesting targets, collision or persistence mechanics.
Reduce decorative density before sacrificing readable placement or frame pacing.
Preserve existing renderer ceilings; scene-graph counts are not GPU performance
evidence. Measure actual calls, triangles, uploads, frame pacing and memory.
Provide touch and keyboard placement, text beyond color, unobscured primary
actions, reduced ambient/reveal motion and a usable schematic fallback.

## Implementation sequence and acceptance

1. Generate actual gameplay bindings and implement the separate owner-only client
   boundary, including replay, stale-response and realm-switch tests.
2. Integrate a representative playable keep through the actual PTR entry with
   authoritative state and usable fallback; no legacy-prop escape hatch.
3. Establish the new art direction with rendered desktop and 390px mobile views
   of empty, placement, blocked placement, construction and completed states.
4. Complete all six buildings and their existing effects; verify reconnect,
   background/resume, reduced motion, asset failure, context loss/restoration
   and repeated enter/leave resource cleanup.

Genesis 001 gameplay, presentation and data remain unchanged. Genesis 002 stays
sealed; PTR stays owner-only. Compare G001 regressions and visuals separately.
Actual-owner PTR journey and physical-phone evidence must be distinguished from
local fixtures, emulation and screenshots. Final release assembly and deployment
remain required; this design alone is not a shipped 0.4 release.

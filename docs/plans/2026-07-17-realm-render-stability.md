# Alpha 0.3.6 Realm render stability work item

**Status:** implementation in PR #44; not merged, deployed, or release-verified

**Evidence:** owner-supplied 39.38-second local gameplay capture reviewed on
17 July 2026. The recording is diagnostic input only and is not copied into
the repository.

## Outcome

Alpha 0.3.6 makes founded keeps readable and visually stable while the player
zooms and pans. Map input catches on the first deliberate gesture whether it
starts on terrain or a castle rail, zoom remains anchored to the point of
interest, and castle identities remain attached to their own foundations.
Castle masonry separates from the Lowlands without bleaching the terrain,
authored landscape bases no longer intersect local relief, and ordinary camera
input cannot pull so far back that the finite rendered terrain becomes a tiny
island in a gray void.

This is browser presentation only. It changes no castle coordinate, owner,
identity authority, admission decision, gameplay state, Marks value, Worker,
SpacetimeDB module, production data, DNS, or deployment state.

## Capture findings

The following timestamps describe behavior, not retained player identity:

- **00:00–00:08.5 — direct-label baseline.** Individual foundation rails are
  readable and remain on their castles.
- **00:09–00:14 — label membership churn.** Zoom crosses measured collision
  thresholds. Two direct identities are replaced by a displaced `+1` keeper
  cluster, and the cluster representative changes while the world records do
  not. This is the reported appearing, flying, and “disco” behavior.
- **00:22–00:28 — close castle/base evidence.** Masonry is consistently much
  darker than adjacent terrain. A depth-tested six-edge occupied-cell outline
  also crosses the wider authored base and exaggerates the appearance of
  clipping.
- **00:25 — readability sample.** Conservative stone crops are roughly
  0.46–0.51 times the brightness of adjacent ground. This is diagnostic, not a
  release golden image.
- **00:32–00:38 — overview failure.** Castles become too small to read, direct
  identities disappear or consolidate again, and the hard edge of the finite
  hex terrain exposes the gray scene fallback.

The local synthetic 100-castle fixture independently reproduced the same
failure classes at 1920×1080. At its normal view, 25 castle projections were
eligible but only 23 direct rails survived. Explicit full-realm framing also
showed the terrain as a partially cropped island surrounded by a large fallback
field.

## Root causes and accepted changes

### Persistent identity rails

The existing direct rail already uses the correct projected foundation anchor.
Instability came from re-solving membership on every rounded camera frame:
distance bands, collision rejection, cluster neighborhoods, and cluster
representative selection all changed at different zoom thresholds.

The Alpha 0.3.6 world layer therefore keeps one direct rail for every
projection-visible founded castle. Zoom, LOD, selection, hover, and measured
collisions may not replace it with a cluster, change its identity, displace it,
or make it transparent. Compact presentation is a stable viewport decision,
not a camera-distance decision. Dense labels may overlap; selected, focused,
owned, and hovered rails receive deterministic visual priority, while Explore
retains the complete keyboard/touch-accessible list.

Visibility follows the instance layer's pre-mask 3D frustum result before the
2D foundation projection is admitted. This prevents an edge rail from outliving
its model without letting the previous frame's label mask suppress a newly
entering castle. Interaction targets retain a one-pixel sizing margin above the
44-pixel acceptance floor to absorb browser subpixel rounding.

### Castle-only readability response

The renderer already uses sRGB output and ACES tone mapping. The source of the
contrast problem is a dark but LOD-consistent castle atlas combined with direct
lighting that supplied about four times more energy to upward terrain normals
than to a camera-facing wall. Global exposure would brighten the already-pale
terrain and is not used as the repair.

The existing neutral camera fill is made more horizontal and targets about
0.70 camera-facing irradiance while keeping upward irradiance below 0.09. The
competing amethyst side fill is reduced. One idempotent, role-aware material
uniform calibration applies the same bounded diffuse gain to every castle LOD
and a smaller gain to the authored base. It does not alter GLB bytes, textures,
normal response, roughness, metallic response, provenance, draw-call count,
texture sampling, shadow allocation, or demand-driven rendering.

### Terrain/base contact

Castle and base transforms were verified to match exactly; independent model
positioning is not the defect and remains prohibited. The authored base reaches
about 1.06 world units from its center, while the former flat/blend terrain
influence ended at 0.62/0.78. Sampling all 100 canonical slots found
topography-dependent terrain penetration, with the worst case near 0.088 world
units.

The local terrain foundation now covers the authored island and blends outside
it. Decoration clearance follows the same conservative outer radius. The
change remains a client render input and does not rewrite an authoritative
tile or castle coordinate. Castle hover/selection geometry must route around
the authored base footprint instead of drawing a cell line through it.

### Camera and finite-world edge

Ordinary wheel and pinch input previously reached zoom zero, where overview
math fitted the nonexistent corners of the terrain axis-aligned box. That made
the real hex smaller than necessary and exposed the solid fallback around it.

Interactive zoom now has a readable lower floor. The explicit Realm overview
may still reach zoom zero so all 100 canonical slots remain inspectable.
Overview fitting uses the actual convex 12-point perimeter derived from the
rendered cell corners, including its real chamfers. Any visual horizon apron
remains a cheap, noninteractive presentation mesh: it creates no world cell,
semantic record, raycast target, or gameplay authority.

### Input continuity and projection cadence

The former pointer path belonged only to the canvas. A permanent castle rail
could therefore intercept the first press, making an otherwise valid map drag
or wheel gesture appear unresponsive. The drag threshold also discarded the
movement used to cross it, while a previous camera animation could continue to
pull against direct input. Pointer capture loss, window blur, a hidden document,
or a missing pressed button could leave stale gesture state behind.

The map root now coordinates one bounded gesture lane for the WebGL canvas and
direct castle rails while excluding HUD controls and dialogs. A rail tap still
opens its castle; a deliberate drag instead captures the pointer, suppresses
only its same-task compatibility click, and applies the complete
press-to-current movement on the first accepted frame. Keyboard and assistive
activation remain unaffected. Failed capture is retried while the drag remains
active. Pinch uses the same lane. Capture loss, pointer cancellation, lost
buttons, blur, visibility change, and scene disposal all terminate direct
manipulation and clear active gesture state.

Direct pan resolves both viewport points against the Realm ground plane and
applies that world-space delta immediately, without stale camera catch-up.
Wheel zoom follows the pointer; wheel input over a castle rail follows its
foundation anchor; and pinch follows its centroid. The ground anchor is held
through every eased wheel frame. Leaving explicit zoom-zero overview for a
closer view is continuous rather than jumping to the normal interactive floor.
High-rate pointer samples accumulate into one direct camera update and WebGL
render per display frame. Viewport or composition changes invalidate an old
screen-space zoom anchor so demand rendering always converges.

Foundation rails now consume the scene's projection in the same frame and
retain tenth-pixel motion instead of waiting through a second animation frame
and snapping to whole pixels. Permanent transform promotion and moving
backdrop blur were removed from the rails to avoid unnecessary compositing
work during camera motion.

## Acceptance criteria

- A projection-visible castle has exactly one direct identity button and zero
  automatic cluster buttons or overflow identities.
- The same castle button node, public text, and accessible name survive zoom,
  LOD, hover, and selection changes; its rendered point stays at the exact
  foundation anchor.
- The 100-castle desktop, tablet, portrait, and short-landscape fixtures keep
  deterministic O(n) identity membership and preserve at-least-44-pixel control geometry.
  Dense pointer hit-test contention is measured honestly rather than used as
  cull authority; Explore retains an individually selectable touch/pointer path.
- Castle-facing light rises materially without increasing global exposure,
  adding a light, allocating a shadow map, or changing terrain material energy.
- High, Balanced, and Compact use the same castle gain and do not flash in hue
  or brightness at LOD changes. Direct-light fallback remains readable.
- Every canonical base is supported across its authored footprint. Castle and
  base retain one exact shared transform and no independent lift, scale,
  normalization, or recentering.
- Selection/hover feedback no longer fragments across the authored island.
- Manual wheel/pinch cannot reproduce the tiny-world gray-void view; explicit
  Realm overview still contains the canonical terrain perimeter with a
  conservative raised-scene margin and keeps canonical slots inspectable.
- A primary drag that begins on either terrain or a direct castle rail engages
  on its first deliberate attempt, includes threshold-crossing movement, and
  cannot accidentally activate the rail after dragging. A rail tap remains a
  normal castle activation.
- Direct pan keeps the grabbed ground point under the pointer. Wheel and pinch
  keep their pointer, foundation, or centroid ground anchor throughout motion,
  including the eased wheel transition and continuous departure from explicit
  overview.
- Pointer cancellation, capture loss, lost buttons, window blur, hidden-page
  transition, and disposal leave no captured pointer, dragging marker, or
  camera-manipulation state or click guard behind. Keyboard and assistive rail
  activation cannot be consumed by pointer-drag suppression.
- High-frequency drag and pinch samples produce no more than one direct camera
  render per display frame, retain their complete accumulated movement, and
  settle after viewport or composition changes.
- Foundation rails update in the projection frame with stable subpixel motion;
  their moving surface uses no permanent transform promotion or backdrop blur.
- The horizon presentation, if present, is excluded from terrain picking,
  semantics, authority, and unbounded animation.

## Validation required before review

- Focused label, material, terrain-placement, camera, shared canvas/rail
  gesture, cancellation, cleanup, and responsive React regressions.
- Complete TypeScript, Vitest, production build, runtime-asset, file-size,
  production-exclusion, and license-policy checks.
- Rendered WebGL verification at High, Balanced, and Reduced across desktop,
  tablet, portrait mobile, and short landscape.
- Repeated close, approach, minimum-interactive, and explicit-overview browser
  frames with zero console errors and stable identity membership.
- Synchronized Alpha 0.3.6 package version, in-menu patch chronicle, changelog,
  README, release note, and maintainer/agent record.

Protected-main deployment and exact-build verification remain later release
gates. Passing this work item in PR #44 must not be described as live.

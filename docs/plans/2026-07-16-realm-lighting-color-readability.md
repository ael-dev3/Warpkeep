# Realm Lighting, Color, and Castle Readability Proposal

**Status:** implementation proposal only

**Audit baseline:** `089430e` (`main`, 2026-07-16)

**Runtime changes in this document:** none

This document turns the current Realm readability problem into a bounded engine
work plan. It does not change game code, runtime assets, authentication, world
state, deployment, or DNS. It does not authorize a release or production
mutation.

## Decision summary

The current presentation should not be repaired by raising global exposure or
copying the saturated palette of another strategy game. The supplied live
comparison succeeds because it has a clearer value hierarchy: bright ground,
readable lit planes, decisive directional shadows, and stronger separation
between the building and its surroundings.

Warpkeep should keep its own restrained Lowlands identity while making six
targeted changes:

1. define one explicit color-space contract for every terrain color;
2. replace the flat green contact discs with directional, soft grounding;
3. use a clear key/fill hierarchy and reserve amethyst for accents;
4. keep fog on the distant realm, not on the castle the player is reading; and
5. lift the castle model's stone midtones through one bounded, LOD-consistent
   surface calibration; and
6. add production-scene, object-aware visual metrics before tuning values.

A focused shadow map may improve the approach and close views, but a world-sized
shadow pass over all 100 castles is not the recommended solution. Overview
grounding should remain cheap, while High and possibly Balanced quality may use
one tightly bounded shadow pass around the active focus after measurement.

## Evidence boundary

The two supplied screenshots were reviewed as perceptual evidence only. They are
not checked into this repository:

- the Warpkeep frame contains public account labels that are unnecessary for an
  engine proposal; and
- the comparison frame is third-party visual material and is not a source asset,
  palette, or fidelity target for Warpkeep.

The screenshots do not identify the exact graphics profile, display color
profile, browser, camera pose, or pre-capture processing. They support the
readability diagnosis below, but they are not suitable for inventing numeric
golden thresholds.

### Observed in the Warpkeep frame

- The terrain occupies a narrow olive/khaki value and hue range. Biome variation
  is present, but it reads as broad haze rather than distinct natural surfaces.
- Castle silhouettes are clear, but roofs, walls, towers, recesses, and gates
  collapse into a similar dark-brown mass.
- Castles have weak contact with the ground. There is no readable sun-cast shadow
  to explain their volume or the light direction.
- The identity labels carry much more contrast than the world beneath them, so
  the interface wins attention before the keeps do.
- Small faction-color and material accents disappear at the default camera.

### Useful lesson from the comparison frame

The relevant lesson is not “make the grass neon green.” It is the separation of
roles: the ground is a bright field, the castle has readable light-facing and
shadow-facing planes, the cast shadow is directional, and local clearings and
ground transitions help the building sit in the world. Warpkeep should reproduce
that hierarchy in its own moss, stone, electrum, and amethyst language.

## What the engine currently does

The following are confirmed implementation facts, not screenshot guesses.

| Area | Current behavior | Consequence |
| --- | --- | --- |
| Shadow policy | `REALM_QUALITY_SPECS` declares 2048/1024 shadow maps for High/Balanced, but `resolveRealmRenderPlan()` always returns `dynamicShadows: false`, `shadowMapSize: 0`, and `shadowMode: 'contact-only'`. Tests lock this behavior for both small and canonical realms. | Renderer shadow maps, sun casting, terrain receiving, and castle casting are disabled in every production quality profile. |
| Castle grounding | Every visible castle receives the same tone-mapping-independent `#283020` circle at opacity `0.16` when dynamic shadows are disabled. It has no radial alpha, softness profile, or sun-aligned offset. | The circle can mark a footprint, but it cannot communicate light direction or architectural volume and may add a green-brown halo. |
| Output pipeline | The production renderer uses sRGB output and ACES filmic tone mapping with exposure `0.98`–`1.02`. The castle base-color map and generated environment are explicitly sRGB, while its normal map is `NoColorSpace`; the loader applies those same color/non-color roles to optional emissive or material-data maps when present. | No obvious castle-texture double-gamma error was found. Global exposure should not be the first lever. |
| Terrain color | Lowlands and semantic palette values are raw floating-point RGB triples. WebGL writes them directly to a vertex-color buffer, while the SVG fallback multiplies the same values by 255 into CSS `rgb(...)`. | Three.js requires vertex colors in Linear-sRGB, while CSS interprets the fallback as display-sRGB. The same palette therefore has two confirmed color-space interpretations. |
| Light rig | The scene combines a lavender-white/dark-purple hemisphere light, warm sun, amethyst directional fill, neutral camera-facing fill, and low-intensity procedural environment. | The dark brown castle receives several colored fills without a simple key/fill value hierarchy. This can preserve hue while still producing muddy form. |
| Fog | Linear fog uses the cool-gray sky fallback and its near/far range changes with camera zoom. The overview intentionally begins fog within the realm depth range. | Fog helps scale, but can further compress distant terrain and castle contrast at overview. |
| Castle material | Each checked-in Hegemony Main Castle LOD contains one primitive and one material, with a base-color atlas and normal atlas, uniform metallic factor near `0.08`, and roughness near `0.68`. There is no occlusion, emissive, or metallic-roughness texture. | The engine cannot recover separate stone, roof, fabric, metal, and recess responses from material channels that do not exist. Lighting can improve form, but cannot invent authored AO or roughness classes. |
| Runtime QA | The LOD fidelity lane renders under `NoToneMapping`, no shadows, and a separate two-light rig. The production WebGL lane accepts broad color-bucket and luminance-range evidence from the whole frame. | Existing checks prove model fidelity and non-blank output, not castle readability under the production light/fog/tone-map pipeline. UI labels can contribute to the broad whole-frame range. |
| Render lifecycle | Realm rendering is demand-driven. Camera motion renders while settling, and vegetation uses a bounded low-rate scheduler. | Lighting work must not introduce an unconditional 60 fps loop. |

Primary code locations:

- `src/components/realm/realmQuality.ts`
- `src/components/realm/createRealmScene.ts`
- `src/components/realm/createRealmEnvironment.ts`
- `src/components/realm/realmCastleInstanceLayer.ts`
- `src/components/realm/loadHegemonyKeep.ts`
- `src/components/realm/realmCameraController.ts`
- `src/game/map/hegemonyLowlandsSpec.ts`
- `src/game/map/terrainColor.ts`
- `src/components/realm/createTerrainGeometry.ts`
- `src/dev/castleLodVisualEvidenceMain.ts`
- `scripts/qa-observer/png-visual-aggregate.mjs`

## Root-cause assessment

### Confirmed primary gap: directional shadowing is absent

The code has dormant shadow-map setup, but the canonical render planner disables
it before the scene is created. The current flat circle is therefore the only
castle-to-ground shadow cue in every quality tier. This directly explains the
absence of directional cast shadows and contributes to the floating appearance.

This was a reasonable scale optimization for 100 instanced castles. It is now
visual debt, not evidence that the whole optimization should be removed.

### Likely contributor: the castle starts from a dark, low-channel material

The current castle is intentionally dark and has only base-color and normal
atlases behind one uniform PBR material. Warm, purple, and cool fills can change
its hue, but cannot create material-class separation or baked recess definition.
This is consistent with the screenshot, although an object-masked production
capture is required before assigning exact weight to the asset versus lighting.

### Confirmed correctness gap: WebGL and fallback interpret terrain differently

Three.js performs lighting in Linear-sRGB and expects vertex-color attributes in
that working space. The terrain pipeline writes numeric channels directly to the
attribute. The fallback pipeline sends the same values to CSS without converting
them, which treats those channels as display-sRGB.

For example, the current `grassBase` tuple `(0.424, 0.49, 0.271)` is roughly
`rgb(108 125 69)` in the fallback, but direct Linear-sRGB vertex input displays
near `rgb(174 186 142)` before scene lighting/tone interactions. Its linear
luminance is about 2.5 times the fallback interpretation. This is a strong
explanation for pale WebGL ground beside much darker sRGB castle and decoration
textures.

Explicit conversion alone is not proof that the final look will be better: a
blind conversion would make the existing ground considerably darker. The
conversion and a re-authored, more chromatic Lowlands palette must be one
reviewed visual migration. That stable contract is the prerequisite for later
lighting work.

### Likely contributor: value compression from fill, fog, and palette together

No single line proves the olive wash. The low-chroma terrain values, tinted light
stack, gray fog, ACES shoulder, and dark atlas interact. These controls should be
isolated in a deterministic production-scene harness rather than tuned together
by eye.

### Confirmed QA gap: current gates do not measure the reported problem

The existing LOD comparison answers “did optimization preserve the source
model?” The whole-frame PNG check answers “did Chrome render credible pixels?”
Neither answers “can a player read this castle against this terrain?” A future
implementation can pass every current test and still reproduce the supplied
screenshot.

## Desired visual contract

The Realm should read as sunlit Hegemony Lowlands, not as a uniformly bright
scene.

- Keep the masonry weighty and weathered; lift readable midtones rather than
  bleaching the base-color texture.
- Make the 3D castle itself measurably brighter than the audited baseline. Do not
  obtain the entire improvement by darkening terrain or raising global exposure.
- Keep light-facing stone in a natural midtone relationship with the surrounding
  clearing so the keep belongs to the same sunlit world, while roofs, gates,
  windows, banners, and electrum accents remain materially distinct.
- Match perceived brightness and hue across High, Balanced, and Compact castle
  LOD transitions so zooming never produces a visible surface-value pop.
- Make the sun direction evident from lit roofs, tower sides, and a grounded
  shadow.
- Preserve dark windows, gates, and recesses without allowing the majority of a
  visible castle to collapse into near-black.
- Keep meadow and lowland brighter than forest, heath, ridge, and ancient stone,
  while maintaining a common natural world.
- Keep distant terrain quieter through atmosphere, but exempt the active
  foreground castle and its immediate clearing from visible fog wash.
- Reserve amethyst for faction identity, portal energy, sigils, and restrained
  reflected fill. It should not tint every neutral stone plane.
- Preserve all current interaction, identity, authoritative-world, LOD,
  accessibility, and fallback behavior.

## Recommended implementation sequence

### Phase 0 — Add a production-readability baseline

Do this before changing a light value.

Extend the synthetic, loopback-only rendered WebGL fixture with fixed captures
for:

- overview, Founding District/approach, and selected-keep close camera poses;
- High, Balanced, and Reduced quality;
- procedural-environment success and direct-light fallback;
- 1440×900 desktop, the existing 1920×1080 Balanced presentation, 1024×768
  tablet, 390×844 narrow portrait, and 667×375 short landscape; and
- one single/focused castle fixture in addition to the 100-castle density fixture.

Extend rather than replace the existing fourteen rendered browser cases. Reuse
their fresh/private Chrome boundary, fixed device-pixel ratio, real
`RealmMapScreen`, and synthetic canonical snapshot. Set reduced motion before
navigation so the camera settles immediately and vegetation does not add a
timing variable. Reach the direct-light fallback through a local QA-only injected
environment-factory failure seam, never simulated resource exhaustion or a
public production/query switch; test that production builds cannot activate the
seam.

Commit a closed-shape visual-threshold manifest with the fixture and browser
revision, mask definitions, metric units, and repeatability tolerances. Accept a
static measurement only after two consecutive aggregate samples fall within
those committed tolerances. Do not apply that repeatability rule to performance
timing.

Render an object-ID or silhouette mask for the castle and a separate adjacent
ground ring. Use that mask only for segmentation: calculate luminance, color,
and contrast from an otherwise unmodified production render captured with the
identical camera, depth, fog, ACES, environment, and quality. Pixels from a
mask-material override must never enter the measured statistics. Erode the
castle mask or exclude its anti-aliased boundary, and start the ground ring
outside a small deterministic dilation so silhouette blending and the contact or
cast shadow do not contaminate either median. Calculate aggregate evidence from
those regions rather than sampling the complete UI frame:

- castle display-luminance percentiles;
- crushed-shadow and clipped-highlight fractions;
- castle local dynamic range;
- castle-to-adjacent-ground median luminance separation;
- edge contrast around the castle silhouette;
- contact/cast-shadow coverage and base contact;
- fog contribution at the focused castle; and
- render calls, triangles, drawing-buffer pixels, texture allocations, and
  shadow-map dimensions.

Raw pixels should remain transient and local under the existing QA privacy
boundary. Store only closed-shape aggregate metrics. Establish pass ranges from
the current baseline and an owner-approved Warpkeep target render; do not derive
thresholds from the third-party screenshot.

Run performance as a separate, owner-local, same-device before/after lane with
reduced motion disabled and a fixed scripted pan, zoom, focus, and vegetation
sequence. Its manifest must define warm-up, sample count, median and p95 CPU
duration, an owner-approved relative regression limit, and the tested
browser/device class. GPU timing is optional: when
`EXT_disjoint_timer_query_webgl2` is unavailable or `GPU_DISJOINT_EXT` is true,
discard that sample and use the CPU result rather than fabricating a GPU value.
Timing is comparative evidence, not an absolute cross-host CI gate.

Keep raw per-case timings, device identifiers, renderer strings, and GPU/browser
logs out of the automated QA artifact. Under the current observatory privacy
contract, the durable report may emit only a fixed-shape pass/fail result per
tier and the existing total check duration. Retaining richer owner-local timing
evidence requires a separate privacy-contract review.

### Phase 1 — Make color input unambiguous

Choose and document one terrain authoring convention. The recommended option is:

1. author palette swatches as display-sRGB values;
2. decode each swatch exactly once before procedural interpolation so terrain
   mixing and output use Linear-sRGB;
3. expose an explicit `LinearTerrainColor`-style result from the pure map helper;
4. write that result directly into the WebGL vertex-color attribute;
5. encode that result once back to display-sRGB for the CSS/SVG fallback; and
6. keep the game/map layer free of Three.js imports.

All procedural interpolation, including `mixColor()`-style biome blending, must
operate on the decoded Linear-sRGB values. `RealmMapScreen.tsx` must explicitly
encode those results to display-sRGB before constructing CSS colors; it must not
multiply linear components by 255 directly.

Add tests for known black, mid-gray, white, and Lowlands swatches; a seam test
must continue to prove identical edge colors from adjacent cells. Add a
known-vector WebGL/fallback parity test so both renderers share one art source.
Record the conversion as a deliberate visual migration because applying it to
existing ambiguous values without retuning would materially change the Realm.

Keep the current correct texture roles:

- base-color and emissive textures: sRGB;
- normal, roughness, metallic, and occlusion data: no color space; and
- renderer output: sRGB.

Retain ACES initially. Calibrate color input and light roles before deciding
whether exposure needs a small per-quality adjustment.

### Phase 2 — Establish a simple key/fill hierarchy

Create a local QA-only light debugger that can isolate sun, sky/ground fill,
camera fill, environment, fog, and contact shadow. It must not ship as a public
query-controlled feature.

Recommended production direction:

- one warm-neutral directional sun as the dominant form light;
- one neutral-to-cool sky/ground fill that keeps shadowed stone readable;
- a weaker camera-side lift only when measurements show the front elevation
  still collapses;
- procedural environment for restrained PBR response, not as a replacement key;
  and
- amethyst light limited to local faction/portal accents.

Tune the key-to-fill ratio with the actual production castle, terrain, ACES, and
camera. Do not stack additional lights to compensate for an unmeasured input or
material problem. Lower quality may reduce resolution, geometry, environment
detail, and shadow technique, but it should retain the same minimum castle
midtone/readability range rather than becoming a darker game mode.

### Phase 3 — Replace the contact-disc shadow with a hybrid policy

Introduce an explicit shadow policy by quality and camera mode. Do not leave
`dynamicShadows: true` in a preset that the canonical plan silently overrides.

#### Overview and Reduced quality

Use a cheap analytic or texture-backed contact decal:

- neutral rather than green;
- radial softness with no visible circle edge;
- slightly elongated and offset opposite the shared sun direction;
- sized from the real prefab footprint;
- conforming closely enough to uneven terrain to avoid floating or clipping;
  and
- instanced in one draw call with demand-driven updates.

#### Approach and selected-keep close view

After Phase 0 proves the budget, High quality should use one tightly fitted,
focus-local directional shadow. Balanced may opt in only if its measured budget
passes. Reduced remains decal-only.

The focused shadow pass should:

- include only the selected castle or bounded focus group, not every permanent
  slot;
- use an isolated bounded caster mesh/bucket or compact proxy for that focus set,
  while reusing repository-owned geometry/material resources without duplicating
  textures;
- never enable `castShadow` on the shared, non-frustum-culled all-castle
  `InstancedMesh` buckets, because a tight shadow camera alone does not prevent
  submission of every instance and triangle;
- fit and retarget its orthographic shadow camera whenever focus, camera mode,
  LOD, or viewport changes;
- let the nearby terrain receive the shadow;
- set bias and normal bias from deterministic tests for acne and
  peter-panning; and
- set `renderer.shadowMap.autoUpdate = false` (or use an equivalent explicit
  per-shadow control), request `needsUpdate` only when the sun, selected/focus
  set, LOD packing, camera fit, viewport, or relevant terrain state changes, and
  restore that state correctly during recreation, context restoration, and
  teardown; and
- smoothly suppress or attenuate the focus set's analytic decal while its true
  shadow is valid, then restore the decal atomically if allocation fails, the
  tier/mode changes, or focus is removed.

The current dormant fixed-origin shadow-camera setup is not sufficient for a
panned radius-20 world. A world-sized 2K shadow camera would waste resolution
and still produce soft or blocky results.

### Phase 4 — Retune fog and Lowlands palette

Fog should establish distance, not tint the subject.

- Keep the focused castle and its clearing in front of the fog onset in every
  close/approach fixture.
- At overview, fade the visual apron and distant terrain before the founding
  district loses readability.
- Validate fog-off and fog-on captures to measure the contribution instead of
  changing fog color and lighting simultaneously.

Retune the palette after the color-space contract is fixed:

- lowland: mossy mid-green with soil variation;
- meadow: the highest-value, warm-green family;
- forest: cooler and darker, but not black-green;
- heath: localized muted amethyst rather than a broad gray-purple wash;
- ridge and ancient stone: more neutral than surrounding grass; and
- lake: cool and clearly distinct without becoming a bright UI-like patch.

Keep semantic tint seam-safe and deterministic. Do not introduce categorical
hex borders, camera-dependent albedo, copied reference colors, or runtime use of
the supplied comparison image.

The castle clearing should be a readable packed-earth/stone value island with a
soft natural boundary. Decorative path work is outside this proposal until a
road/gameplay contract exists.

### Phase 5 — Calibrate castle surface brightness and material response

Brighter castle models are a required visual outcome, not an optional polish.
First measure Phases 1–4 with the existing integrity-pinned model so the material
change is not compensating for an unknown terrain or lighting error. Do not close
the implementation while the object-masked castle midtones remain below the
owner-approved brighter target.

If the corrected light rig alone does not meet that target, extend the authorized
deterministic asset pipeline instead of adding per-castle lights, neutral
emissive glow, undocumented shader gamma, or a screen-space brightening effect.
Preferred material work, in order:

1. derive one named, integrity-pinned offline grade of
   `WK_HeroCastle_BaseColorAtlas` from the authorized project texture: decode
   sRGB to Linear-sRGB, apply an explicitly implemented and tested monotonic
   luminance/toe–midtone–shoulder curve, protect intentional near-black recesses
   and electrum highlight headroom, preserve hue and alpha, then encode once back
   to sRGB; never grade `WK_HeroCastle_NormalAtlas`;
2. grade the canonical 2048px atlas first, then derive High, Balanced, and
   Compact from that same graded master. Make grading independent of the current
   resize-only branch so the 2048px High output is re-encoded and verified rather
   than silently retaining the dark source atlas;
3. require object-masked before/after and cross-LOD parity evidence; and
4. if still justified, add an authorized bounded material-class or
   occlusion/roughness/metallic texture so stone, roof, fabric, recesses, and
   electrum respond distinctly without flattening the entire keep.

Do not express the grade as an undocumented image-tool `gamma()`/`modulate()`
chain. Pin the transfer math, toolchain, and output bytes so a future rebuild
cannot change the castle appearance silently.

The grade must not modify geometry, UVs, normals, alpha coverage, collision,
footprint, selection bounds, or LOD thresholds. Evaluate it only inside the
production Realm pipeline against the local clearing and fog—not in an isolated
model viewer whose background can make the same atlas appear artificially
brighter.

Split the existing LOD visual contract around this intentional migration:

- keep source-versus-runtime silhouette, coverage, geometry, and alignment checks
  against the immutable authorized source;
- record the deliberate raw-source-to-graded color/luminance delta as separate
  owner-approved evidence; and
- compare graded High, Balanced, and Compact masked color/luminance at the real
  switch distances rather than requiring every brighter derivative to preserve
  the old source-color delta.

Any asset change must update exact bytes, hashes, texture dimensions, source
authority records, runtime manifests, LOD comparisons, and license inventory.
Do not reinterpret a normal/data map as sRGB, apply an undocumented runtime
gamma multiplier, or claim material separation that the asset does not encode.
Preserve the current encoded GLB ceilings—High below `2,000,000` bytes, Balanced
below `1,200,000`, and Compact (the Reduced tier) below `520,000`—unless a
separate measured review changes them. The grade must not increase atlas
dimensions or channel count.

### Rollout and rollback

Use the existing graphics mapping: Cinematic → High, Balanced → Balanced, and
Performance → Reduced. Ship palette/color correctness to all tiers together;
stage focused true shadows on High first and retain the analytic decal everywhere.

During implementation, a typed, build-time-only presentation revision such as
`legacy` / `readable-v2` may provide one-release rollback. It must not become a
public URL parameter, local-storage override, backend flag, or authority-bearing
state. Remove the legacy branch after the new presentation passes its release
and exact-deployment gates.

## Acceptance gate for the implementation PR

The implementing system should not declare completion until all of the following
are true in deterministic production-scene fixtures.

### Visual

- Roof, front, and side planes remain distinguishable at overview, approach, and
  close camera modes.
- The focused castle has readable midtones while intentional windows and recesses
  remain dark.
- At identical camera, quality, and light settings, the castle mask is visibly
  and measurably brighter than the `089430e` baseline without bleached stone,
  glowing neutral surfaces, or clipped electrum highlights.
- High, Balanced, and Compact LOD changes introduce no perceptible brightness,
  hue, or material-response flash during zoom.
- A directional shadow touches the castle base and agrees with the visible sun.
- The overview decal has no visible circular edge or green halo.
- The focused foreground castle is not visibly washed by fog.
- Castle and adjacent ground remain separable without a selection outline or DOM
  label.
- High, Balanced, and Reduced preserve the same palette relationships; quality
  changes affect fidelity and shadow technique, not faction identity.
- The direct-light environment fallback remains readable.
- No third-party artwork, palette sample, or screenshot enters runtime assets.

### Measured

- Object-masked luminance, clipping, local-range, edge-contrast, and
  castle/ground-separation metrics stay inside owner-approved ranges.
- Baseline-to-candidate evidence shows an owner-approved increase in castle
  p25 and median luminance while preserving bounded near-black-recess,
  crushed-shadow, clipped-highlight, local-dynamic-range, and
  roof/front/side-separation evidence.
- The metric gate excludes DOM labels and other UI pixels.
- Shadow coverage proves base contact and sun-direction consistency.
- Derive shadow pixels from otherwise identical production and shadow-disabled
  passes. Compare the shadow centroid with the projected negative sun vector and
  require owner-approved angular and base-overlap tolerances from the committed
  manifest; dark terrain alone must not satisfy the gate.
- Aggregate evidence has fixed shape and contains no screenshot, raw pixel,
  identity, coordinate, path, or browser-log payload.

Exact ranges must be established in Phase 0. Arbitrary luminance numbers chosen
from compressed screenshots are not an acceptable gate.

### Performance and lifecycle

Preserve the current geometry/draw ceilings and target drawing-buffer budgets
unless a separate measured budget change is reviewed:

| Profile | Terrain triangles | Detail instances | Target drawing-buffer pixels | Existing all-castle geometry ceiling |
| --- | ---: | ---: | ---: | ---: |
| High | 150,000 | 7,000 | 8,400,000 | 2,807,760 triangles |
| Balanced | 90,000 | 5,500 | 5,200,000 | 2,419,008 triangles |
| Reduced | 40,000 | 3,000 | 2,400,000 | 1,908,600 triangles |

The drawing-buffer values are targets, not unconditional ceilings: the current
resolver intentionally preserves a minimum pixel ratio of `0.5`, which can
exceed a target on a pathological canvas. The fixed QA viewport matrix must meet
its target; any minimum-DPR exception outside that matrix must be explicit and
reported rather than mislabeled as a passing budget.

For the first focused-shadow experiment, the incremental caster ceiling should
be no more than one active LOD keep: 67,680 triangles on High, 40,353 on
Balanced, and zero on Reduced. A compact proxy may lower that cost. Any larger
caster group needs a newly measured and explicitly reviewed ceiling.

Also preserve the current maximum of five semantic-feature draw calls, eight
total terrain-detail draw calls, and three castle instance draw calls plus the
single contact-shadow call. A focused shadow pass must report its additional
calls separately.

Allow at most one focused 2D shadow map: High must not exceed `2048×2048`,
Balanced must not exceed `1024×1024`, and Reduced allocates none. Cascades, cube
maps, or a second shadow-casting light require a separate measured and reviewed
budget. Report the added pass, calls, and submitted caster triangles separately.

- The separate same-device performance lane stays within its pre-recorded,
  owner-approved relative CPU/GPU regression limits; unsupported or disjoint GPU
  samples fall back to CPU evidence.
- No world-sized all-castle shadow pass is introduced.
- No unconditional animation loop is introduced.
- Settled shadows stop updating even when vegetation schedules its bounded
  periodic scene render; hidden-document behavior remains paused.
- Render calls, triangles, texture allocations, and shadow-map dimensions remain
  bounded and reported by quality/mode.
- Context loss, environment allocation failure, partial setup failure, quality
  recreation, and teardown still release resources exactly once.

No absolute frame-rate or GPU-memory claim exists today. Record same-device
before/after evidence before enabling a true shadow pass on a tier, and do not
infer decoded GPU memory from compressed GLB bytes.

### Product and authority

- Terrain coordinates, castle ownership, identity, admission, world state,
  gameplay, Marks, and backend protocol remain unchanged.
- WebGL fallback remains complete and usable.
- Keyboard, touch, pointer, label, inspector, navigator, and safe-area behavior
  remain unchanged except for intentional camera framing tests.
- Player-visible implementation receives the next appropriate version, release
  note, changelog entry, and menu patch-note update. This proposal-only PR does
  not bump the version.

## Suggested future file ownership

This is a handoff map, not a list of files changed by this proposal.

| Work package | Likely implementation locations |
| --- | --- |
| Color-space contract and palette | `src/game/map/hegemonyLowlandsSpec.ts`, `src/game/map/terrainColor.ts`, `src/components/realm/createTerrainGeometry.ts`, fallback encoding in `src/components/realm/RealmMapScreen.tsx`, focused terrain tests |
| Lighting/fog policy | `src/components/realm/realmQuality.ts`, `src/components/realm/createRealmScene.ts`, `src/components/realm/createRealmEnvironment.ts`, camera/scene tests |
| Contact and focused shadows | `src/components/realm/realmCastleInstanceLayer.ts`, `src/components/realm/createRealmScene.ts`, quality/instance/cleanup tests |
| Castle brightness and material calibration | `scripts/prepare-hegemony-main-castle.mjs`, `scripts/rewrite-embedded-webp-glb.mjs` and its declaration/tests, `src/components/realm/loadHegemonyKeep.ts`, runtime-asset verifier, dated castle manifest/record, object-masked production evidence, asset/LOD parity tests |
| Readability QA | rendered WebGL fixture, browser probe, bounded PNG/target analyzer, QA contract tests, `docs/operations/qa-observatory.md` |
| Release truth | `CHANGELOG.md`, next `docs/releases/` note, menu patch-note source, build version, `_AGENT_NOTES.md` |

## Recommended PR train for implementation

1. **Instrumentation and color contract:** object-aware metrics, baseline evidence,
   explicit terrain color space, no art-direction tuning hidden in the same diff.
2. **Lighting, fog, and contact grounding:** calibrated key/fill hierarchy,
   directional contact decal, production-scene visual gates.
3. **Castle surface calibration:** meet the brighter object-masked target with
   cross-LOD parity; prepare a deterministic authorized texture/material
   derivative when lighting alone is insufficient.
4. **Focused shadow mode:** High first; Balanced only after evidence; preserve
   decal fallback and demand rendering.
5. **Release integration:** complete regression matrix, real-device evidence,
   patch notes, versioning, and exact deployed-build verification.

Each PR should be independently reviewable and must not merge merely because the
previous visual screenshot appears brighter.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Brightening destroys the heavy Hegemony mood | Target readable midtones and directional form, not a global exposure increase. Review masked castle values and full-scene composition separately. |
| A brighter atlas looks bleached or detached from the ground | Use one monotonic hue-preserving midtone lift, protect recesses/highlights, and approve it only in production Realm captures beside the local clearing. |
| LOD changes flash between different castle values | Derive every LOD from the same authorized surface source and grade, then gate masked luminance/hue parity at the actual switch distances. |
| Re-encoded brighter textures exceed the current GLB byte caps | Grade the canonical atlas before LOD derivation, verify every output byte/hash, and preserve the existing per-tier encoded-size ceilings unless a separate measured budget is approved. |
| Explicit color conversion causes a large palette jump | Treat existing floats as ambiguous legacy inputs, capture a baseline, then migrate and retune in one reviewed color-contract PR. |
| Focused shadows show acne, peter-panning, clipping, or stale direction | Add deterministic focus/pan/LOD fixtures, fit the shadow camera tightly, test bias bounds, and invalidate only on relevant state changes. |
| Shadow pass harms mobile or 100-castle performance | Keep Reduced decal-only, start High focus-local, measure Balanced before enabling, and never shadow all 100 castles at realm scale. |
| Transparent contact decals z-fight or sort badly where foundations overlap | Test adjacent founding slots and uneven terrain; preserve one bounded instance layer, explicit render order, depth behavior, and soft non-overdrawn edges. |
| More fill flattens the model further | Remove or neutralize competing fills before adding energy. Calibrate lights independently. |
| Fog fix removes world scale or reveals the radius-22 apron edge | Preserve fog for distant terrain and the apron; move the focused subject ahead of onset rather than deleting atmosphere, and gate every overview edge. |
| Asset derivative exceeds current authority or provenance | Use only the recorded project-internal source/derivative scope, update immutable provenance, and stop if a required material source is not authorized. |
| Visual QA leaks identity or durable screenshots | Use the synthetic fixture, transient pixels, closed aggregate output, and the existing loopback/no-foreign-network boundary. |

## Primary technical references

- [Three.js color management](https://threejs.org/manual/en/color-management.html)
  defines Linear-sRGB as the working space, sRGB for display/color textures, and
  Linear-sRGB for vertex colors.
- [Three.js shadow guidance](https://threejs.org/manual/en/shadows.html) explains
  the extra scene render per shadow-casting light, fake-shadow alternatives, and
  the resolution cost of oversized directional-light shadow cameras.
- [Three.js renderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html)
  defines output/tone-map controls and the available draw-call, triangle, and
  allocation counters for bounded diagnostics.
- [Three.js standard-material documentation](https://threejs.org/docs/pages/MeshStandardMaterial.html)
  and [PMREM documentation](https://threejs.org/docs/pages/PMREMGenerator.html)
  describe the PBR/environment roles used by the Realm.
- [Three.js directional-light](https://threejs.org/docs/pages/DirectionalLight.html)
  and [fog](https://threejs.org/docs/pages/Fog.html) documentation cover the
  focus-local light camera and linear atmosphere controls proposed here.
- [Khronos glTF 2.0 material specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#materials)
  defines sRGB base/emissive inputs, linear normal/metallic/roughness/occlusion
  data, and the metallic-roughness material contract.
- [W3C relative-luminance definition](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance)
  provides the sRGB decoding and luminance math suitable for the aggregate QA
  calculation. Using that math is not a claim that textured world art has a WCAG
  contrast requirement or conformance result.
- [W3C High Resolution Time](https://www.w3.org/TR/hr-time-3/) defines the
  monotonic browser clock suitable for owner-local CPU duration comparisons.
- [Khronos `EXT_disjoint_timer_query_webgl2`](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/)
  defines optional WebGL GPU timing and the disjoint state that invalidates a
  sample.

## Non-goals

- copying the comparison game's terrain color, castle design, UI, roads, or
  composition;
- replacing the Hegemony castle model in this proposal;
- adding post-processing, screen-space AO, bloom, or per-castle dynamic lights
  before the simpler pipeline is measured;
- changing authoritative terrain, castle placement, gameplay, identity, auth,
  backend state, or deployment; or
- merging or shipping an implementation from this documentation-only PR.

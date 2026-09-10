# Warpkeep 0.4 visual foundation contract

This is the implementation-facing companion to the complete reference library
in the Desktop `Warpkeep - Full Project Handoff.md`. It turns the owner-supplied links
and the later research into decisions that can be reviewed in the actual 0.4
keep and Greater Realm. The contract is intentionally about presentation,
readability, mobile behavior and iteration quality. It does not turn a visual
reference into an imported engine, a new economy, or a promise of deep
interactivity.

The visual contract is maintained against the current PR #228 implementation
published at `c4ad7539`, with functional source checkpoint `211b0b1a`; the Windows QA repair is
`84c35a5e`. Earlier hashes in dated evidence records remain
historical anchors and are not the source to review for a new pass. The latest connected
checkpoint covers the four-worker journey, fresh-browser re-entry, private
retry/recovery seams, resource-catalog disclosure, mobile presentation and
browser-log hygiene. The full disposable Windows lane passed on the functional
source checkpoint with the warning boundary and re-entry diagnostics enabled;
rerun it after any further source change before a release cut.
The functional Keep04 visual checkpoint includes the bounded scenic moat treatment
and the Windows browser-boundary repair.
The 0.4 release remains a development build until the release checklist records
authenticated owner play, physical-device review and the required delivery
evidence.

## Handoff coverage audit — 2026-09-10

The attached handoff was rechecked against this contract before continuing the
0.4 workflow. The mapping covers the voxel and Astra studies; Verdant Forest,
Pelagic and Dream Loop; settlement and construction references including Selo,
Widelands, Townscaper and Tiny Glade; terrain, climate and rendering research
including Mapgen4, EZ-Tree, SimonDev, ZyFou, the erosion and fog papers, WebGPU
and TSL; performance references including InstancedMesh2 and the grass and
Mistwood studies; and the atmosphere, reconnect, accessibility and social-UI
references. Each family has a source owner, a mobile/readability rule and an
evidence or deferral boundary below. These references guide the Verdant Citadel
presentation and review process; they do not add deep interactivity, a new
simulation, or an imported engine to 0.4.

The exact labels used by the handoff index are retained here as aliases for the
grouped decisions:

- **Custom voxel engine made with GPT Astra**
- **SimonDev game-development demonstrations**
- **Procedural Terrains — demonstration**
- **Procedural Terrains — engine**
- **Procedural tectonic structure**
- **Coupled uplift and fluvial erosion**
- **Priority-Flood drainage**
- **Tile-based erosion evaluation**
- **Crytek height-fog / rendering course notes**
- **Three.js WebGPU renderer guide**
- **Three.js WebGPU renderer API**
- **Three.js Shading Language**
- **Final Fantasy XIV — creating a chat-log tab**

Keeping these names beside the grouped source owners prevents a future agent
from mistaking an alias for an unreviewed or omitted reference.

## Current checkpoint (`c4ad7539` published head; `211b0b1a` functional source; `31ad1240` loop rail)

The presentation contract is now exercised end to end: the atlas/keep entry,
worker setup, outbound → gathering → returning rail, gather → choose → build →
benefit → return loop rail, resource disclosure,
individual recall, Recall All, automatic settlement and node reuse all remain
readable at narrow widths. Active Worker cards also identify the reserved result
and resource, exposing that status as a polite update for assistive technology,
while the aggregate rail continues to distinguish pending from
spendable stock. Setup evidence is deliberately labelled as a
progressed snapshot; strict fresh-browser re-entry still owns the continuity,
private-gate and settlement proof. The product surface keeps the handoff's
voxel, Verdant Forest, Pelagic, terrain/atmosphere, settlement and Dream Loop
lessons in one authored Verdant Citadel language, with simple interaction and
deeper simulation/editing deferred.

The connected visual lane recorded a stable authored palette with broad
luminance separation, no clipped extremes, and both cool high-albedo and warm
low-green spatial samples. These are QA observations for the scene, not product
content or arbitrary numeric targets.

## The visual promise

The player should understand the loop at a glance: **gather → choose → build →
benefit → return**. The Verdant Citadel is a small, elevated settlement with a
strong silhouette, pale stepped masonry, dark timber, oxidized-teal roofs,
restrained violet warp accents, warm activity light and layered forest. Water,
terrain and interface elements frame the decision instead of competing with it.

Professional quality in 0.4 means coherent art direction, stable composition,
legible state, deliberate transitions, predictable controls and an honest
loading or fallback experience. Mesh density, shader novelty and world scale
are subordinate to those outcomes.

## Reference-to-0.4 decisions

Every reference in the handoff has one of three dispositions: a concrete lesson
already represented in the current source, a focused review question for the
next visual pass, or a deliberate deferral because it would expand the game
beyond the 0.4 foundation. A disposition is not allowed to imply that source
code or media was copied; nothing was copied from the references into Warpkeep.

| Reference family | 0.4 decision and source owner |
| --- | --- |
| Astra voxel engine; Binary Greedy Meshing; noa | Keep the bounded, material-aware voxel presentation and generated dressing owned by `voxelSurfaceMesh.ts`, `greaterRealmVoxelPresentation.ts`, and `keep04VoxelDressing.ts`. Use merging, batching and stable authored surfaces; do not add editable terrain, physics or a replacement engine. |
| Verdant Forest; EZ-Tree; three-stylized; stylized-components; TUMBLE meadow | Use a small authored forest language: near and far bands, curated gaps around buildings, restrained tint variation and one coherent motion rhythm. Review repetition at the keep and atlas cameras before adding assets. The forest stays visual and batched. |
| Pelagic; Three.js Water Pro; Luminous Lake | Keep one lightweight water surface with broad world-aligned movement, fine ripples, calm shoreline color and restrained sky highlights. Directional river cues may be tuned from existing data. Avoid displaced grids, live reflections and CPU-per-frame deformation. The Greater Realm owner is `greaterRealmWaterSurface.ts`; Keep04 now carries a static, non-interactive moat edge in `createKeep04Scene.ts`. |
| Dream Loop and Vesper | Treat visual iteration as a repeatable critic loop: capture the real scene, compare against the Verdant Citadel target, name the most visible mismatch, make the smallest source change, and capture again. The process is documented below; Dream Loop is not a runtime dependency. |
| Selo Empire; Widelands | Make available, incoming, blocked, committed and completed states answer “what is missing?”, “what is returning?”, “what happens next?” and “what improves afterward?” in the existing Worker and building panels. Do not import their larger logistics simulations. |
| Townscaper; Tiny Glade | Make each completed building level read as a cohesive silhouette and material change with a short, calm reveal. The keep now adds bounded merged masonry courses to authored prefabs and fallback silhouettes alongside its level badge and pennants. Keep fixed policy footprints and Warpkeep's own strategic purpose; do not add freeform construction. |
| Mapgen4; procedural terrain research; SimonDev; ZyFou | Give the atlas a readable hierarchy of coast, water, ridges, climate bands and selected routes using authoritative atlas data. Generation remains separate from presentation, and no live erosion or replacement geography is introduced for visual polish. |
| Tectonic/uplift/erosion studies; Priority-Flood; tile-erosion evaluation; Crytek height fog; Three.js WebGPU and TSL references | Use these as bounded review lenses for landform continuity, drainage plausibility, atmospheric separation and renderer capability. Keep the current authoritative terrain data, WebGL fallback and quality profiles; do not add live erosion, a WebGPU migration or a shader-language rewrite to 0.4. |
| InstancedMesh2 | Measure current batches before adopting per-instance culling or LOD. Use it only when a real keep or atlas workload shows a visible benefit; simple grass and voxel faces should remain simple when most instances are visible. |
| Grassworks; noa; Mistwood Cottage | Keep these as documented research leads, not 0.4 dependencies: Grassworks has no established public reuse path, noa would replace too much of Warpkeep's browser/world stack, and Mistwood Cottage has unresolved payload and license questions. Preserve their useful visual or organizational lessons only when a bounded source change has a measured player benefit. |
| Razarion; A Small World; Dorfromantik | Returning to a keep should preserve a stable place, an understandable next action and quiet reconciliation after refresh. Seeded composition, selective emphasis and calm negative space serve the loop. No tutorial or quest system is added by the reference alone. |
| Snowflow; Desert Dusky; broader climate studies | Borrow palette separation, top-facing snow retention, warm/dry layering and silhouette clarity only where current regional data supports it. These are material and dressing choices, not weather, erosion or simulation features. |
| The Long Silence; Starfall; Operation Ironhold | Use intentional quiet regions, reduced-motion support, finite completion emphasis, clear subsystem boundaries, one readable route/activity accent and existing quality budgets. Do not turn ambience into a new automation or audio dependency. |
| FFXIV, Fortnite, Minecraft, Forge of Empires, Travian | Carry forward accessible labels, contrast, touch targets, keyboard escape behavior and a calm information hierarchy. Chat, moderation and reporting remain separate product work and are not implied by this visual foundation. |

The complete URL and provenance inventory remains in the handoff and in
`gameplay-and-visuals.md`. This table is the decision layer for 0.4; when a
reference is revisited, update the owning source, the evidence record and the
disposition together.

The coverage is guarded by `tests/visualFoundationContract.test.ts` and can be
checked directly with `npm run verify:visual-foundation`. That check protects
the direction without turning reference names into runtime dependencies: it
requires each documented family to retain a decision, the mobile/evidence
boundaries to remain visible, and the cited source owners to stay real paths.

## Review states and evidence

The visual pass uses the real Keep04 and Greater Realm entry points. Review the
same authored composition through these player states:

- an empty keep with no active command;
- a mature keep with distinct building families and forest framing;
- a placement choice with a clearly valid or blocked site;
- construction underway with restrained activity light and status copy;
- a completed improvement whose silhouette and benefit are both apparent;
- a world-to-keep return, refresh and renderer fallback.

For each state, inspect portrait mobile, short landscape and desktop at matching
resolutions. Record the source checkpoint, quality/reduced-motion profile,
browser or device, and what was actually observed. A synthetic screenshot proves
composition at that fixture; it does not prove phone frame pacing, thermal
behavior, authentication or owner acceptance. Physical-device results remain a
separate acceptance record. The release checklist remains the authority for
those claims.

## Mobile foundation rules

The narrow layout keeps one readable decision header, safe-area padding, a
touch-sized action surface, a scene that uses the available panel width, and a
single document scroll when a panel is open. The desktop and short-landscape
layouts keep their existing hierarchy. Reduced motion, hidden-page suspension,
quality profiles, context recovery and the schematic fallback are part of the
same foundation rather than separate modes of the game.

Do not introduce a new mobile-only mechanic, a second economy view, or a dense
overlay to compensate for a weak scene. Improve hierarchy, spacing, contrast,
silhouette and status language first. Preserve server authority and the current
touch, keyboard and focus behavior while polishing the presentation.

## The Dream Loop review cycle

1. Start with a real source-controlled capture from one of the review states.
2. Describe the target in Verdant Citadel terms: focal silhouette, material
   grouping, forest depth, water restraint, state clarity and mobile legibility.
3. Ask a separate critic to identify the most visible mismatch and the smallest
   change that would resolve it. Keep gameplay authority and asset provenance in
   the critique.
4. Change one coherent presentation owner, then repeat the same capture at the
   same viewport and profile. Do not hide a composition regression behind a
   different camera, quality mode or synthetic fixture.
5. Carry unresolved issues into the next evidence note with their source and
   limitation. A polished screenshot is evidence of that state only.

The useful output is a better scene and a traceable reason for the change, not a
larger catalogue of references or an arbitrary score.

## Source routing

| Question | Start here |
| --- | --- |
| Keep composition, materials and building silhouettes | `src/components/keep04/keep04VisualProfile.ts`, `src/components/keep04/createKeep04Buildings.ts`, `src/components/keep04/createKeep04Scene.ts` |
| Forest and voxel dressing | `src/components/keep04/keep04VoxelDressing.ts`, `src/components/keep04/planKeep04DressingSource.ts`, `src/components/realm/voxelSurfaceMesh.ts` |
| Mobile layout, status and focus | `src/components/keep04/Keep04Screen.tsx`, `src/components/keep04/Keep04Screen.css`, `src/components/keep04/Keep04LoopRail.tsx`, `src/components/keep04/Keep04BuildingPanel.tsx`, `src/components/keep04/Keep04WorkerPanel.tsx` |
| Greater Realm water and quality | `src/greater-realm/greaterRealmWaterSurface.ts`, `src/greater-realm/createGreaterRealmSceneRuntime.ts` |
| Rendered evidence and limits | `docs/evidence/0.4.0/visuals.md`, `docs/evidence/0.4.0/renderer.md`, `docs/evidence/0.4.0/performance.md`, `docs/operations/0.4.0-release-checklist.md` |

If a proposed change cannot be tied to one of these owners and one player
outcome, it is probably reference collecting rather than 0.4 work.

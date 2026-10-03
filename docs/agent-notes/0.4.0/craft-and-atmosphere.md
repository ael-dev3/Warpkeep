# Craft and atmosphere: daylight, sound and the keep screen — 3 October 2026

On 3 October 2026 the owner asked for another pull request "improving everything
about 0.4 you can think of, especially design, visuals, lightning, sound
effects". "Lightning" is read here as lighting; no storm or lightning weather
was added. Like the [living realm note](living-realm.md), this records what the
work changes, which source owns it, what was actually verified and what remains
open. It does not change the release checklist, the release sequence or any
acceptance gate.

## The player problem

- The keep and the Greater Realm were lit by one flat midday rig. A Keeper
  returning in the evening or at night saw the same noon light as everyone else.
- On balanced and reduced quality, where there are no shadow maps, buildings
  and cottages floated on the grass.
- In the vale, lanes, river and pond read as ribbons laid on a lawn. The river
  had no shore, and the road met the meadow with a hard edge. The
  Stillwater study in `next-work.txt` names exactly this: bank, water and
  planting should read as one place.
- 0.4 was nearly silent. Only the generic button click played. Choosing a
  building, placing a draft, confirmed construction, Worker journeys and returns
  made no sound, and the keep had no ambience.
- The keep screen read as a generic dark dashboard. On desktop the 3D keep began
  below the fold, under a stack of cards.

## What changed

| Area | Change | Source owner |
| --- | --- | --- |
| Daylight model | The device's local hour chooses a mood: night, dawn, morning, day, golden hour or dusk. Moods blend smoothly by minute and drive key, fill, hemisphere, fog, exposure and night glow. Night is cool, readable moonlight, not darkness. | `src/greater-realm/verdantDaylight.ts` |
| Keep lighting | A warm key carries the only shadow, now softer with a PCF radius and lighter at night. A cool shadow-side fill and a sky/ground hemisphere complete the rig. The sun sweeps across the camera side, so facades stay lit while shadows move. | `src/components/keep04/createKeep04Scene.ts`, `Keep04SceneHost.tsx` |
| Night keep | Windows of cottages, mills, towers and gate towers glow through a per-vertex mask that adds no draw calls. The gate-spine lamps light, with warm pools on the paving. Light spills around each building and the warp crystal brightens. | `keep04ModelKit.ts`, `createKeep04Landscape.ts`, `createKeep04Life.ts`, `createKeep04Scene.ts` |
| Grounding | Soft vertex-alpha contact discs sit under every building, cottage, mill and tower. On balanced and reduced they are the only shadow. | `keep04ModelKit.ts`, `createKeep04Landscape.ts`, `createKeep04Scene.ts` |
| Vale | Lanes gain worn verges. The waterline gets a pale shore and a wet edge, and the river and pond get lighter shallows. Reed clumps stand where the ground first rises above the water. The meadow is slightly deeper and less yellow. | `keep04Terrain.ts`, `createKeep04Landscape.ts`, `keep04Models.ts`, `keep04ValePalette.ts` |
| World daylight | By day the world keeps its own pale sky; toward night it shares the keep's haze. The hemisphere and sun take the mood's colours. Clouds tint with the hour, and birds roost after dusk. | `src/components/realm/createGreaterRealmWorldCanvasHost.ts`, `src/greater-realm/greaterRealmAtmosphere.ts` |
| Keep cues | Each building family has a material voice: timber and grain, a log knock, stone, a coin, buckle and blade, a soft bell. Placing a draft gives a tock on open ground or a muted thud when blocked. | `src/components/audio/sfxEvents.ts`, `proceduralSfxEngine.ts`, `src/components/keep04/Keep04Screen.tsx` |
| Confirmed outcomes | Mallet knocks sound when the Realm confirms construction, and a rising bell when a level completes. Worker dispatch, recall, arrival and return have cues, clustered when several land together. A credited return makes a per-resource sound; an empty recalled cart stays silent. | `src/ptr/gameplay04/gameplay04Sfx.ts`, `src/ptr/PtrGameplay04SurfaceHost.tsx` |
| World cues | Each public resource site answers a choice with its material cue. | `src/components/realm/GreaterRealmWorldScene.tsx` |
| Keep soundscape | While a keep scene renders: a breeze bed with sparse birdsong by day, crickets and a rare owl after dusk. It yields to gameplay cues under voice pressure. | `src/components/audio/keepSoundscape.ts`, `WarpkeepSfxDirector.tsx`, `Keep04SceneHost.tsx` |
| Keep screen | Serif display headings from local system fonts (no web-font download), a Verdant Citadel crest, resource icons and accent edges, brass calls to action, a construction bar with a gentle sheen and Worker phase markers. Wide screens place the decision column beside the scene. | `Keep04Screen.tsx`, `Keep04Screen.css` |
| World panel | Resource sites carry the same material accents as the keep's stores; Dispatch becomes the Worker panel's one primary action. | `GreaterRealmWorldScene.tsx`, `PtrGameplay04SurfaceHost.tsx`, `src/components/realm/RealmMapScreen.css` |

## Authority and data boundaries

Everything above is presentation:

- **Daylight:** reads only the device clock. Nothing is sent anywhere, and no
  gameplay value, timer or request depends on it. A development-only `?hour=`
  parameter on the keep and world QA hosts pins the mood for captures.
- **Sound cues:** come from `gameplay04SfxEvents`, which compares two validated
  keep views of one session. It reads only revisions, phases, levels and the
  confirmed return outcome, so an unconfirmed command never sounds, and the
  first view after entry is silent.
- **Keep soundscape:** its state carries only `active` and a night level. It
  stops whenever audio is muted, the page is hidden, the player signs out or
  the scene retires.

Nothing new is pickable, and placement still uses the legal plane. No server,
schema, binding, generated output, admission, G001 or G002 code changed.
`keep04VisualProfile.ts` and the generated voxel dressing plans are untouched
(`generate-keep04-voxel-dressing --check` passes). The scene still rejects any
worker or building field outside its presentation contract.

The prepared-deploy closure policy forbids `url()` and `@import` in member
stylesheets. The keep screen's glyphs are therefore inline SVG elements, hidden
from assistive technology.

## Budgets and measured evidence

All new decoration is charged to the existing prefab admission budget:

- **Contact discs and night pools:** counted in the admission budget.
- **Reeds:** an instanced vale batch, charged through the vale's own cost.
- **Window glow:** a shader term on existing meshes, with no draw calls.

Reduced drops the reeds and light pools and uses lighter discs. It thins the
vale woods from 0.26 to 0.24 density, so every authored building is still
admitted beside the vale and its life. The keep vale and scene suites pin this
at every quality.

The measurements below are synthetic local runs on 3 October 2026: local Vite
dev build, headless Chrome with ANGLE/D3D11 on an RTX 3080 Ti, the `living-keep`
fixture and a 20 s bounded observation with ambient life on. "Previous" is the
living realm measurement of the same profile.

| Profile | Frames | Frame work p50/p95 | Interval p50/p95 | Renderer calls / triangles | Previous |
| --- | --- | --- | --- | --- | --- |
| 1440×900 high, 11:00 | 600 | 1.6 / 2.0 ms | 33.3 / 33.7 ms | 75 / 262,156 | 73 / 255,628 |
| 1440×900 high, 22:00 | 601 | 1.5 / 2.0 ms | 33.3 / 33.7 ms | 77 / 262,816 | — |
| 1440×900 balanced, 11:00 | 481 | 1.3 / 1.8 ms | 33.9 / 50.3 ms | 57 / 112,723 | 55 / 108,148 |
| 390×844 balanced (emulated) | 480 | 1.3 / 1.8 ms | 49.4 / 50.3 ms | 57 / 112,723 | 54 / 108,028 |

No long tasks were recorded. Static counts:

- **Reduced, day and night:** 53 calls / 78,516 triangles (previously 51 /
  79,006). Target: 80 / 90k.
- **All six buildings at level five:** 54 / 80,460 on reduced, and 79 /
  269,728 on high at night.

The sound evidence is offline. Every new cue renders through the QA corpus
checks with no clipping or DC offset, silent tails and peaks of 0.003–0.014,
beside existing cues at 0.006–0.007. The corpus now covers every building and
resource variant.

These are desktop-GPU synthetic results. They do not establish phone frame
pacing, thermal or battery cost, how the soundscape sounds on a real speaker,
cold load, production transfer or owner acceptance. R06 and the
physical-device gates remain open.

## Verification

Local Windows checkout, Node 24.19 / npm 11.7 (not the pinned Node 22.22 /
npm 10.9.8). No native SpacetimeDB CLI or WSL runner was used.

- **New suites:** `verdantDaylight` (9 tests: phases, continuity, bounds,
  scene fog/background/exposure, night lamps and pools, the rig), `gameplay04Sfx`
  (5), four keep-cue and soundscape tests in `proceduralSfx`, and world daylight
  tests in the world canvas host and atmosphere suites.
- **Existing suites that pass:** the Keep04 scene, vale, life, lifecycle, host,
  screen, placement, accessibility, benefits, loop rail and QA contract suites;
  the Greater Realm world host, world scene, atmosphere and daylight-journeys
  suites; the PTR surface host and SFX director suites; and the visual
  foundation contract.
- **Contract changes made deliberately:**
  - The lifecycle test now names the two new scene-owned batches.
  - The SFX snapshot gains `keepAmbienceActive`.
  - Both SFX sample tables cover the new event kinds.
- **Closure suites (Windows), compared with the base `5cddb1a7` in the same
  checkout:** five failures occur only on this branch, all closure topology.
  The derived import graph includes three new frontend modules (1,269 paths)
  while the checked-in namespace lists 1,266:
  - three direct derived-against-listed comparisons;
  - two fixture-copy tests (an unreferenced Worker source, and the
    production-dist CLI declaration), whose copied member set lacks the new
    modules and so reports `IMPORT_UNRESOLVED`.

  The remaining failures in those suites fail identically on the base:
  Windows shells, `/usr/bin/git`, path separators and pinned native receipts.
- **Typecheck:** `npm run typecheck` (build mode) passes. `DEPLOY_BASE=/ptr/ npm run build`
  passes, including:
  - the voxel dressing check;
  - exact runtime and provenance asset verification;
  - the Greater Realm public boundary (3,411 tracked paths, 1,927 scanned
    entries);
  - Farcaster Mini App integrity.

  The existing `RealmMapScreen` chunk-size warning is unchanged.
- **Verifiers:** `verify:file-sizes`, `verify:licenses`,
  `verify:atlas-public-boundary` and `verify:visual-foundation` pass.
  `verify:sealed-launch` passes on the clean checkout and still reports Pages
  approval false, package 0.3.43, every live identity unset and PTR
  presentation disabled.
- **Bundle size:** compared with a `/ptr/` build of the base, the branch adds
  8.2 kB of gzip JavaScript in total (the PTR surface chunk adds 3.8 kB) and
  1.1 kB of gzip CSS. No new network asset, texture, model or font is
  requested.

## Release integration

This branch is based on `release/0.4-living-realm-quality` at `5cddb1a7`, which
already integrates PR #381. It is not part of that branch. Integration follows
the same route used for the living realm:

1. Add the three new modules to the checked-in closure namespace in
   `scripts/auth-bridge-notification-prepared-deploy-closure.mjs`:
   - `src/components/audio/keepSoundscape.ts`;
   - `src/greater-realm/verdantDaylight.ts`;
   - `src/ptr/gameplay04/gameplay04Sfx.ts`.
2. Run the supported closure reprojection natively to refresh the member
   digests and the workflow bootstrap pins.

A local trial edit of the namespace again cascaded into pinned bytes, so it
was reverted. No release tool, workflow, closure manifest, bootstrap pin or
generated file was edited by hand.

## Open follow-ups

- **Physical phone:** review night readability, the lamp-pool and contact-disc
  cost, and the soundscape and cue levels on a real speaker. Only offline audio
  metrics exist.
- **Owner review:** the moods (especially night), the serif headings and the
  wide-screen layout.
- **Possible setting:** an "always daylight" option, if players prefer a fixed
  noon. None was added.
- **Building windows:** the six authored building models bake their lighting
  into vertex colours, so their windows do not glow. They get a warm light
  pool instead. A window mask in those models would be an asset-pipeline
  change.

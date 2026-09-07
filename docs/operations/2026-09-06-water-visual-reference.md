# 0.4 water reference: Pelagic

Owner supplied [Pelagic — Ocean & Atmosphere](https://pelagic-ocean.lexn8.chatgpt.site/)
on 2026-09-06 as inspiration, explicitly requiring lightweight mobile rendering.
Controller inspected the rendered desktop scene and exposed controls in Chrome.
This is a visual study, not a source audit or mobile performance measurement.

Observed visual cues worth adapting: broad overlapping swells with finer ripples,
blue-green water, broken pale sky highlights, and a soft distant horizon. The
reference exposes weather presets, free-camera movement and rendering detail.
Those controls and environmental simulation are not requirements for Warpkeep.
No reference code, textures or other assets were copied.

## Bounded direction for existing 0.4 water presentation

- Preserve a readable strategic map: use restrained blue/teal color depth,
  broad wave structure and sparse highlights rather than screen-filling sparkle.
- Target the actual 0.4 water in `src/greater-realm/createGreaterRealmSceneRuntime.ts`.
  The analytic wave/normal, foam and fallback infrastructure in the legacy
  `src/components/realm/realmWaterLayer.ts` is a reuse reference, not already
  integrated 0.4 water. Any adaptation must be 0.4-owned and leave G001 unchanged;
  do not introduce a second ocean engine merely to match the reference.
- Prefer shader-level lighting/color tuning. No FFT ocean simulation, additional
  reflection/refraction scene renders, volumetric clouds, physics, free flight,
  underwater mode or new environmental interactions for this inspiration item.
- Any change must be explicitly 0.4-owned; the shared G001 water appearance,
  persistent water layout, navigation and authoritative state remain preserved.
- Retain existing reduced-quality/reduced-motion and graphics fallback behavior,
  visibility scheduling and cleanup. Do not add continuous rendering to an idle
  surface solely for this effect.
- Evaluate any candidate at the actual strategic camera scale and on the fixed
  390px mobile profiles. Existing total frame, transfer and memory gates govern;
  visual similarity does not justify higher budgets or a phone-performance claim.

Status: inspiration studied and recorded; no water implementation changed. Apply
only as bounded polish within existing visual coverage. This note does not add a
separate engine or silently expand the finite release acceptance checklist.

## Renderer routing clarification — 2026-09-07

The actual 0.4/PTR world water is currently created by `waterMesh` in
`src/greater-realm/createGreaterRealmSceneRuntime.ts`, with standard materials
and bounded color/opacity animation. `realmWaterLayer.ts` is consumed by the
legacy G001 renderer, not that 0.4 path. Its analytic shading is a reuse reference,
not already-integrated 0.4 functionality. Any adaptation must be 0.4-owned and
leave G001 appearance unchanged. See the [agent visual audit](../agent-notes/0.4.0/gameplay-and-visuals.md)
for the source distinction and required verification.

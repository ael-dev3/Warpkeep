# Verdant Citadel visual acceptance — current source, with device gates open

## 2026-09-09 source-render matrix checkpoint

The current documentation checkpoint is `ccfc56d`; the functional source is
`206c03683c9039b513b878d7b0d3c6770eda2626`, and the functional visual
checkpoint is `0ce25c8`. Actual renderer synthetic captures
covered the empty, mature, legal-placement, blocked-placement, construction,
completed and schematic-fallback states at desktop and 390px portrait profiles.
The portrait WebGL canvas now uses the available keep panel width while the
toolbar remains padded; desktop, short-landscape and fallback geometry are
unchanged. A real browser center-pick traversed the resized canvas raycast and
selected-site inspection rendered correctly. The change does not alter asset
count, geometry or scene quality settings. It is a source-render comparison,
not physical-phone performance, live owner play or final R04/R05 acceptance.

The current mobile polish keeps the same interaction surface while improving the
narrow resource strip: two balanced columns, explicit safe-area insets and quiet
surface contrast keep balances legible without adding a second mobile layout. The
focused Keep04 UI/scene run passed 161 tests after this matrix expansion; visual
captures and physical-device measurements remain separate acceptance evidence.

The completed-level masonry course treatment is represented in the authored and
fallback keep paths and remains bounded by the existing footprint and geometry
budgets. The source-level six-family progression matrix now covers all six policy
building kinds at levels 1–5, with fallback silhouettes and authored-prefab
footprint checks; `tests/keep04Buildings.test.ts` covers that matrix and the
focused building/visual run passes 97 tests across four files. A balanced browser
QA pass also inspected the all-six completed-level scene, where the masonry
courses read as a quiet progression cue without changing the camera or footprint.
This is rendered browser evidence, not physical-device acceptance.

The handoff reference library is represented in the current visual plan and
source notes: voxel composition, Verdant Forest, Pelagic water/material cues,
terrain/atmosphere studies, settlement/rendering research and Dream Loop's
iteration discipline. The implementation deliberately uses the existing
bounded renderer, authored assets and lightweight water instead of importing
new engines or unverified heavy media.

## 2026-09-07 interactive construction check

Inspected the existing local synthetic preview at
`http://127.0.0.1:4176/dev/keep04-qa.html?scenario=mill-constructing&quality=balanced`
using the Codex in-app browser, with an explicit 390×844 viewport. This is
browser emulation on the Windows development machine, not a physical phone or
an authenticated owner PTR session. The page explicitly reported no gameplay
connection. The checkout HEAD was `2f8c9fd4da081bfa886d412522a03752264fab46`;
this observation did not attest the preview server's complete served source.

Observed through actual controls and separately captured settled screenshots:

- Inspect selected site brought the City Mill construction scaffold and its
  footprint fully into the canvas below the zoom/inspection controls.
- Opening the building catalog showed Builder busy and disabled Confirm upgrade.
- Selecting Lumber Camp showed Place Lumber Camp and a legal draft. The scene
  status said **Placement is valid.**, not Ready to build. Confirm placement
  remained disabled despite zero displayed resource shortages.
- The panel retained the permanent-placement/no-refund warning. Draft selection
  did not complete the construction or change resource balances.
- DOM measurements at the end: viewport width 390, height 844, document width
  375 (no horizontal overflow), one canvas. The viewport override was reset and
  the temporary tab closed after inspection.

This is interactive confirmation of the earlier `fd8b146` placement-copy repair,
not a new implementation or a complete visual pass. The image labels accurately
credit reused pinned Hegemony models and Verdant Citadel composition/material
treatment; the check does not establish new authorship of those model assets.

R04 now has source-level six-family and browser-render coverage, but final
commit-bound desktop/mobile captures, physical-device performance, R05/R06
renderer/fallback budgets and R02/R07 actual-owner gameplay remain separate,
unproven requirements. Do not substitute browser emulation or source geometry
tests for those gates.

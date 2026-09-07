# Verdant Citadel visual acceptance — partial

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

R04 remains incomplete: final commit-bound desktop/mobile coverage across all
six families, progression, legal/blocked placement and completion states is
still required. R05/R06 renderer/fallback/performance gates and R02/R07 actual
owner gameplay are separate, unproven requirements. Do not substitute this
single balanced construction fixture for those acceptance results.

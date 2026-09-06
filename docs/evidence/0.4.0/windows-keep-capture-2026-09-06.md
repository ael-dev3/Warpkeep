# Exploratory Windows keep capture — 2026-09-06

Not release acceptance. Source `b344d975cbad56170eb46804b115e44f06533b45`,
tree `683ee61e0b6a0496a7d91f6dc3e287167e40dda5`.

Command from the isolated checkout with the existing local Vite server:

```powershell
.git/ci-node-22.22.3/node.exe scripts/qa-observer/keep04-windows-capture.mjs --base-url=http://127.0.0.1:4176
```

Run `artifacts/keep04-qa/windows-run-CjFZ2k/` contains 36 PNGs, numeric
observations and `run-provenance.json`. This is local DEV synthetic state, not
authenticated gameplay, a production build, physical-phone testing or performance
measurement. Its enforced document CSP is explicitly synthetic-only.

Chrome 151.0.7922.174 used ANGLE/NVIDIA GeForce RTX 3090, Direct3D11, driver
32.0.15.9186; software rendering was false. All 36 document responses were guarded.
The signed executable identity stayed unchanged. Both source observations were
clean and matched the commit/tree above. Normal browser exit was 0, with verified
cleanup, zero remaining owned processes and no forced termination. The isolated
profile was retained.

The report nevertheless says `stableSource: false` with `target-failed`, while
its status says captured and failure is null. Expected shutdown detachment is a
hypothesis, not an accepted explanation; a bounded diagnostic/fix was assigned.
One network error class also remains unexplained. Do not edit the original run
report or promote it to accepted evidence. Repeat after reviewed correction.

## Image inspection

The controller viewed all 36 images individually: nine scenarios for desktop
1440×900/high, portrait 390×844/balanced, portrait/reduced and landscape
844×390/balanced. Observations:

- Desktop empty, construction and completion images show their different scene
  states. All-six scenes render the models, but economy buildings are visually
  small relative to the grounds and cathedral. The lower scene/controls extend
  below the initial viewport.
- Portrait balanced/reduced show the diorama and resources at initial entry,
  but the economy-building silhouettes are tiny. Placement captures scroll away
  from resource balances; the confirmation extends below the viewport.
- Landscape initial captures mostly contain the heading and resource strip,
  leaving the scene and primary actions below the viewport. Placement captures
  reveal only part of the grounds and panel, with resource totals clipped above.
- Fallback screenshots show explanatory copy and the schematic where visible;
  they do not establish that all offscreen commands work.
- Static reduced-motion and context-cycle images do not prove animation policy
  or a loss/restore sequence. Those require separate event/interaction evidence.

These findings retain the existing mobile layout/readability work as necessary.
The QA-only header also consumes screen space; production UI must be checked
separately rather than assuming this exact initial viewport is production.
No performance, native negative-canary, full lifecycle, owner journey, G001
comparison or live deployment gate is satisfied by this run.

## Preliminary numeric observations

All 32 non-fallback entries recorded one canvas, a frame observation and zero
active loaders. The four intentional fallback entries recorded zero canvases.
All-six samples reported high 43 draws/142,260 triangles, balanced 28/37,060,
and reduced 28/36,040. These are individual synthetic frames, not representative
frame-time percentiles or a whole-game renderer pass.

The measured synchronous `createKeep04Dressing` call took 13.1–15.4 ms on the
desktop profile, 19.5–22.7 ms on portrait balanced, 18.9–20.5 ms on portrait
reduced, and 18.2–21.8 ms on landscape balanced. The capture code applies the
profile CPU-throttling rate before navigation. These DEV samples exceed the
16 ms voxel-preparation budget on the mobile profiles; investigate and remeasure
the production implementation without loosening that budget. This is not a
physical-phone result or final performance measurement. Source inspection places
the timer around voxel planning, mesh-array preparation and geometry creation,
not later asynchronous asset loads or actual GPU upload.

## Native capture-policy diagnosis

The later `windows-run-m7CLTQ` run at source `613228c` captured 36 cases but
correctly failed its final guard: Chrome emitted an unexpected detach during
verified normal owned closure. A separate fresh blank-page diagnostic identified
the exact native reason `Render process gone.`. Reviewed correction `8dcfa7b`
recognizes that spelling only under the existing verified normal-close conditions;
it does not waive crashes or unexpected disconnections. Earlier reports remain
unchanged.

Native worker tests then disproved the headers-only interception assumption.
Using the same signed Chrome 151, fresh profiles and loopback-only canary:

| Document policy delivery | Dedicated/shared worker result |
| --- | --- |
| Original QA document, header added through `Fetch.continueResponse` | Both executed; no worker-src violation |
| Controlled HTML fulfilled with the same policy header | Both blocked; worker-src violations |
| Original QA document plus worker-src meta policy | Both blocked; worker-src violations |
| Original QA body explicitly fulfilled with the same header | Both blocked; worker-src violations |

The last comparison used the same DOM-originated script as the first. All
diagnostic browsers exited normally with zero remaining owned processes and zero
canary-server requests. Zero requests alone is not worker nonexecution; the
message/error and policy-violation observations distinguish the outcomes.
The meta comparison is diagnostic only: it cannot replace the required sandbox
response header. Some runs overlapped mobile source edits and are explicitly not
stable-build or performance evidence.

Thus a visible modified header and successful continuation acknowledgement do
not establish enforcement in this Chrome path. A capture-tool correction remains
required. Body fulfillment also produced local-network access errors for Vite
websockets in a subsequent diagnostic; it is not accepted as a complete fix.
Serving the exact QA route's header directly from the local dev server is being
assessed to preserve normal response handling without body interception.
No production headers, G001 behavior or browser permissions were changed.

## Mobile layout follow-up (partial, not acceptance)

An exploratory Chrome check of mobile commit `19de7cf` used the local synthetic
all-six-level-five balanced fixture. The capture-policy source repair was in
progress separately: this is rendered UI evidence, not a stable-source capture,
performance result, physical-phone result or authoritative PTR journey.

- At 390×844, opening Buildings left Resources at y=4..103.89, primary actions
  at y=109.89..153.89 and the focused Close panel button at y=182.80..227.30.
- At 844×390, opening Workers left Resources at y=4..103.89 and focused Close
  at y=182.80..227.30. The first Worker content was visible below the heading.
- Neither viewport had horizontal document overflow. Screenshots were inspected
  for these openings; remaining controls and transition cases are not yet proven.

Independent source review found an Important pending-to-ready focus regression:
Back can scroll the page upward during pending, then restoration focuses Close
with `preventScroll` without bringing that panel back into view. The source is
not accepted until that path is repaired and verified. These opening checks do
not waive the issue or the remaining mobile/fallback/reduced-motion gates.

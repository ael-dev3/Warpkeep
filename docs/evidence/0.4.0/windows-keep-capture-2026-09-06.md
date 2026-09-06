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

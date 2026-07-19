# Four-worker system plan

This plan is the review boundary for the worker-system release train. It is
stacked on Stone Quarry PR #65 at `de679623b6814d95e501000d11d7208c6318d86e`.
PR #65 must be merged first. This branch does not retarget, merge, seed, or
deploy it.

## PR A: stable live Realm reconciliation

The reproduced failure path was a public occupation update changing a resolved
resource-node array. `RealmMapScreen` used that array as a dependency of the
WebGL scene-construction effect. React then disposed and rebuilt the renderer,
camera controller, scene layers, pointer listeners, and presentation telemetry.
The rebuild called `setCameraMode('realm')`, which explains the reported jump
to an overview-like view until reload.

This PR separates immutable node topology from live occupation state:

- Gold, Food, Wood, and Stone site catalogs construct the scene once.
- Occupation, phase, origin-castle, and timestamp changes reconcile through the
  persistent scene handle and resource layers.
- Static pick volumes, models, camera, renderer, selection, and labels remain
  owned by the same scene.
- Malformed dynamic state is rejected and the last valid presentation remains.
- `sceneBuildSequence`, canvas/scene identity, camera pose, mode, zoom, and
  selection are exposed as development QA attestation data.

The deterministic scene test proves that a dispatch-like outbound-to-gathering
update keeps the same build sequence, scene/canvas identity, camera mode, pose,
and zoom while requesting one ordinary render.

## PR B: generic worker authority (next stack)

The current Gold/Food/Wood/Stone expeditions remain legacy systems. They are
not cosmetic four-worker slots. The next PR will append the exact next schema
generation after Stone v9 and add four stable, server-owned workers per castle.
It will use public worker/occupation rows, private assignment and cargo rows,
generic dispatch/recall/claim reducers, canonical routes, worker selection,
roster status, and a staged activation gate. Legacy active expeditions must be
zero before activation. No browser bootstrap or production seed is permitted.

The worker art asset, worker layer, PFP roster, inspection panel, fallback
presentation, accessibility review, migration/backfill, and recall race matrix
remain explicit follow-up work for PR B. Until that PR is reviewed and
activated, the release must not claim that four generic workers are live.

## Residual risks

- Legacy activation requires zero active old assignments, occupations, and
  schedules unless a separate audited migration is approved.
- The current supply wagon remains the transport visual until a reviewed worker
  model and provenance record exist.
- Worker label density and mobile thermal behavior need rendered QA.
- Recall boundary races require scheduler and exactly-once settlement tests.
- Generic activation is an irreversible forward schema transition, though it
  can remain staged/inactive.
- No construction purpose is added by this release train.

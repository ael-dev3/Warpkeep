# Greater Realm candidate evidence

This directory accepts only canonical aggregate review reports produced by
`atlas:export-sanitized-review` and verified by
`atlas:verify-sanitized-review`, plus the single fixed
`pending-owner-review-v1.json` historical pre-selection snapshot. Generation
and resume leave the Git worktree exactly clean and never install that file.

At protected C0, after replaying and verifying the one private candidate
package, `retain-pending-owner-report` seals canonical public-safe snapshot
bytes and a private binding in the owner-only workspace. It must happen before
owner selection; selection and runtime export refuse a missing or mismatched
retention record. The record is immutable and binds the C0 source commit,
review batch, candidate handle, package digests, report digest, and reviewed A
source-closure manifest.

After selection, runtime export, active-v17 canaries, and the reviewed C1-C3
source transitions, `export-pending-owner-report` runs from an otherwise clean
protected C3 (`activation-only`, Alpha `0.3.43`). It replays the selected
package, verifies the runtime release and exact C0-to-C3 lineage, and writes
only the previously retained bytes to the fixed repository path. Its
postcondition is the unchanged C3 HEAD plus exactly that one untracked file (or
an exact tracked replay), with no temporary or unrelated drift. The file then
enters Git atomically with the inert C4 notification generation-zero change;
C4 remains Alpha `0.3.43` and does not activate world presentation.

The snapshot schema is
`warpkeep.greater-realm.pre-selection-retention-snapshot.v1`. Every lifecycle
claim is explicitly time-relative: `ownerValidationAtRetention`,
`selectionAtRetention`, `activationAtRetention`, and
`productionAtRetention`. Those fields truthfully record C0 before selection;
publication during C4 preparation does not claim that the current release is
still pending, inactive, or production-untouched. It is not an approval
receipt or current deployment status.

Allowed evidence is newly constructed from an exact allowlist and contains only
opaque random candidate handles, aggregate counts, broad size ranges,
geology/topography/biome/hydrology metrics, aggregate quality metrics, boolean
proof outcomes, rounded performance figures, selection status, and one report
digest.
It must never contain seeds or seed digests, generation-canvas coordinates,
cell or chunk payloads, process fields, topography patches,
layout/stage/package/private digests, exact region geometry, transforms, gates,
sites, candidate previews, screenshots, or paths to the owner-review workspace.

The owner-only source package, marked seed envelopes, exact chunk and
topography authority, chunk-bound private dressing fields, and seven-map
preview set live outside every Git worktree under a mode-0700 private
workspace. Per the owner's direction, PR A
creates one eligible world and a deterministic, unranked single-candidate
review record; it cannot select the world. The candidate remains `pending`
at retention until the owner records a separate explicit approval. No report
in this directory is a selection, activation, schema/runtime change,
deployment instruction, current production status, or completed-gameplay-loop
claim.

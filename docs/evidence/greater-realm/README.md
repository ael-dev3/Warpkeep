# Greater Realm candidate evidence

This directory accepts only canonical aggregate review reports produced by
`atlas:export-sanitized-review` and verified by
`atlas:verify-sanitized-review`, plus the single fixed
`pending-owner-review-v1.json` projection. The generation CLI may install that
projection only after regenerating and verifying the one private candidate
package, reparsing the canonical aggregate, and proving every hard gate true.
The projection remains pending, inactive, and production-untouched; it is not
an approval receipt.

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
until the owner records a separate explicit approval; no report in this
directory is a selection, activation, schema/runtime change, deployment
instruction, or production record. PR A leaves the deployed Lowlands untouched.

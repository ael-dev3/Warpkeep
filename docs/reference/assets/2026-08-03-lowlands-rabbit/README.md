# Lowlands Rabbit compact runtime record

This record covers the exact visual-only compact Rabbit integrated into draft
PR #181. The source is the public Warpkeep-Assets release
[`rabbit-runtime-ui-bundle-2026-07-30`](https://github.com/ael-dev3/Warpkeep-Assets/releases/tag/rabbit-runtime-ui-bundle-2026-07-30).
The project owner explicitly requested this Rabbit integration on 2026-08-03.
That instruction authorizes the exact compact runtime in this public Warpkeep
PR, but does not approve merging or deployment and does not create a separate
open-content license.

| Runtime file | Bytes | Triangles | Uploaded vertices | SHA-256 |
| --- | ---: | ---: | ---: | --- |
| `public/models/hegemony/environment/wildlife/rabbit/hegemony-lowlands-rabbit-compact-2ecc7b1adf4c1d79.glb` | 14,808 | 146 | 384 | `2ecc7b1adf4c1d79b7ca2d5ea9a6727ed3f6d9072047466082bb912d34ea930c` |

The GLB is glTF 2.0, +Y up, +Z forward, one mesh, one material, no textures,
no external URIs, no skin, and no animation clips. It retains embedded vertex
colors and the supplied `KHR_materials_specular` declaration. The runtime
loader rechecks exact length, SHA-256, primitive count, vertex count, and
triangle count before presentation.

High and Balanced use this compact mesh as one camera-local instanced draw.
Motion is a renderer-owned transform animation on the existing Realm ambient
scheduler; it is not AI, collision, pathing, ownership, population, or
gameplay state. Rabbits are non-pickable, hidden in overview, absent from
Reduced and reduced-motion, and fail closed if the asset cannot be verified.

The complete public release also contains rigged High/Balanced LODs and UI
art, but those files are not copied into this runtime PR. The source release
records public archival/distribution authorization and project-owned
provenance while explicitly declining to assert a separate open-license grant.

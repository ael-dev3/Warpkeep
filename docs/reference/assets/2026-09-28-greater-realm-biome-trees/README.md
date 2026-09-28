# Greater Realm biome trees — 2026-09-28

Alpha 0.4 replaces the Greater Realm's uniform green canopy cone with 20
original, faceted tree sculptures. A canopy actor retains the public cell's
stable biome ID as **visual-only** metadata. The renderer makes one instanced
batch for each biome actually present in a chunk and includes every batch's
geometry bytes and draw call in the mobile budget. It preserves the existing
wind sway through instance transforms. The shapes do not affect the atlas,
movement, collision, resources, ownership, or any persistent server state.

The model sources are
[`biomeTreeGeometry.ts`](../../../../src/greater-realm/biomeTreeGeometry.ts),
with the reproducible archive exporter at
[`export-greater-realm-biome-trees.ts`](../../../../scripts/assets/export-greater-realm-biome-trees.ts).
These are built from original four-sided tapered limbs, angular volume crowns,
radial fronds, buttresses, prop roots, and conifer whorls. They use vertex
colors and no texture images, alpha planes, fetched GLBs, or BlendSwap geometry.
All models use +Y up with a trunk-root pivot at the origin.

| Biome ID | Biome | Model silhouette |
| --- | --- | --- |
| 1 | Temperate lowland | Forked orchard crown |
| 2 | Flower meadow | Slender blossom spray |
| 3 | Oak forest | Heavy lateral-limbed oak |
| 4 | Old-growth forest | Buttressed double-leader giant |
| 5 | Pine forest | Wide whorled pine |
| 6 | Alpine snow | Narrow snow-faceted fir |
| 7 | Tundra | Low wind-bent krummholz |
| 8 | Heathland | Many-stemmed dwarf juniper |
| 9 | Savanna | Flat umbrella acacia |
| 10 | Warm scrub | Twisted compact olive |
| 11 | Dune desert | Bent radial date palm |
| 12 | Rocky desert | Forked Joshua tree |
| 13 | Red badlands | Sparse zig-zag mesquite |
| 14 | Volcanic upland | Charred ember-tipped fork |
| 15 | Ash meadow | Pale pioneer regrowth |
| 16 | Freshwater marsh | Pendant marsh willow |
| 17 | Salt marsh | Stilt-root mangrove |
| 18 | River delta | Flared cypress with knees |
| 19 | Rocky highland | Cliff-windswept stone pine |
| 23 | Coastal | One-sided salt-wind pine |

Unclassified (0), saltwater (20), lake (21), and river/stream (22) deliberately
have no tree model or canopy actor. The living-world atlas already excludes
open water from vegetation dressing; the renderer also suppresses a stray
positive canopy value on these IDs.

Each of the 20 trees has High, Balanced, and Reduced exports. Across this pack,
the per-model maxima are **276 / 166 / 132 triangles** respectively, far below
the old Genesis family's 1,200 / 600 / 220 targets. All 60 uncompressed GLBs
together occupy under 0.7 MB. No individual tree requires a new draw call per
instance: every present species in a chunk uses one instanced draw. The
planner counts those actual batches and their buffer sizes before the chunk
enters the profile's bounded upload queue.

To rebuild the archive from the game repo root, run:

```sh
node --import tsx scripts/assets/export-greater-realm-biome-trees.ts artifacts/biome-trees
```

The ignored `artifacts/biome-trees/manifest.json` records every generated
GLB's SHA-256, bytes, bounds, triangle and vertex count. The new family is
archived separately in Warpkeep-Assets; the July 2026 Hegemony tree bundle and
its strict 66-file runtime verifier are unchanged.

The user-supplied SavageIndie *Procedural Tree* from BlendSwap was examined as
procedural-tree reference. These models import no mesh, node graph, texture, or
packed image from that CC BY file. The original project-authored recipes and
their derived GLBs are classified as CC BY 4.0 in `ASSETS-LICENSE.md`.

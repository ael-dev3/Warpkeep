# Greater Realm biome trees — 2026-09-28

Alpha 0.4 replaces the Greater Realm's uniform green canopy cone with 20
textured v3 tree species, each with near and mobile geometry. The source pack
and release manifest are prepared in [Warpkeep-Assets PR #41](https://github.com/ael-dev3/Warpkeep-Assets/pull/41).
Warpkeep's compact one-atlas runtime copies are pinned in
[`public/models/greater-realm/biome-trees/v3/`](../../../../public/models/greater-realm/biome-trees/v3/).
A canopy actor retains the public cell's stable biome ID as **visual-only**
metadata. The renderer makes one instanced batch for each biome actually
present in a chunk, counts each batch's geometry bytes and draw call in the
mobile budget, and preserves the existing wind sway. Tree shapes do not affect
the atlas, movement, collision, resources, ownership, or persistent server
state.

The v3 source models combine connected low-poly branch structures, full
species-specific crowns and original painted foliage/bark atlases. Each source
GLB is converted into one mesh, one material and one packed atlas so all
instances of a biome stay in one draw call. The app verifies the model's byte
length and SHA-256 before loading it. It uses near models on High and mobile
models on Balanced and Reduced; the former code-authored meshes remain a
temporary fallback if a v3 file cannot load. Models use +Y up and retain a
trunk-root pivot.

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

Near meshes span 311–1,098 triangles and mobile meshes 80–277. The 40 runtime
GLBs total 2,738,208 bytes; the source archive preserves all 40 original GLBs,
60 PNG source textures and complete provenance. The build checks all model
hashes, material/atlas structure and triangle counts in both `public/` and the
production output. The existing canopy budget planner accounts for the actual
profile geometry before upload.

The user-supplied SavageIndie *Procedural Tree* from BlendSwap was examined as
procedural-tree reference. No mesh, node graph, UV layout, texture or packed
image from the BlendSwap or WoW examples is included. Source pack licensing
and runtime adoption are recorded in [`ASSETS-LICENSE.md`](../../../../ASSETS-LICENSE.md).

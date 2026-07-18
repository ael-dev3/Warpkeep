# Hegemony environment trees — 2026-07-18 runtime record

This is the technical and provenance record for the exact tree family supplied
for the Alpha 0.3.7 forest-presentation draft. The source handoff is
Warpkeep_Trees_Runtime_Bundle_2026-07-18.zip (1,276,509 bytes, SHA-256
8ff19bb2a9b4c779db0836ea8ab59f8d67abfd282d5b4cce70d48e062874f9e2).
It is an owner-supplied offline bundle, not a browser CDN or a checked-in
source archive.

The public runtime output is exactly 22 tree assets with High, Balanced, and
Compact GLBs each: 66 digest-bearing files, 4,726,460 bytes in total, and
25,528 triangles across all LODs. Every supplied GLB is glTF 2.0, +Y up,
+Z-forward, right-handed, with a trunk-base pivot; it has one mesh, one
triangle primitive, one opaque double-sided material, embedded COLOR_0
vertex colors, no image payloads or external URIs, no animation, and no
camera. Triangle budgets remain at or below 1,200 / 600 / 220 for
High / Balanced / Compact.

## Family

The catalog preserves every suitable supplied asset:

- Spruce: Sunlit Dense and Deep Narrow
- Pine: Alpine and Windblown Blue
- Fir: Alpine Lime and Silver Young
- Cypress: Golden Columnar and Ancient Dark
- Oak: Spring Broad and Gnarled Amber
- Birch: Fresh Slender and Golden Lean
- Maple: Meadow Round and Ember Crown
- Willow: Lemon Weeping and River Mist
- Regular-tree family: Meadow, Cool Evergreen, Deep Forest, Ember Maple,
  Golden Grove, and Sunlit Lime

The detailed manifest.json pins each original per-asset manifest, source GLB
hash, public output path, LOD triangle/vertex count, biome tags, trunk-only
collision guidance where supplied, and presentation-only fallback for the
legacy Regular Tree set.

For each of the 66 LODs it also pins a `normalizedFootprintDiameter`: the
maximum X/Z span from that exact GLB's POSITION accessor bounds, normalized to
the renderer's fixed 0.62 visual height. Forest planning may use only this
derived, per-selected-LOD presentation measure (and its documented instance
scale) to keep broad canopies apart before model bytes are loaded; it is not
collision, pathfinding, placement, or other game authority.

## Installation and verification

The one-off installer accepts only the extracted root of the exact owner
bundle. It rejects symbolic links, unknown/missing archive members, malformed
bundle/catalog/asset manifests, changed source hashes, and changed GLB
structure before atomically replacing the complete public family.

    WARPKEEP_TREES_RUNTIME_BUNDLE_ROOT=/trusted/offline/Warpkeep_Trees_Runtime_Bundle_2026-07-18 \
      npm run prepare:hegemony-trees
    npm run verify:hegemony-trees

Ordinary builds only run the verifier; they do not fetch, unpack, transform,
or rewrite supplied assets.

## Rendering and authority boundary

Renderers may select an LOD from projected height, deterministically vary
Y rotation and uniform scale within the recorded bounds, and place a private
terrain-contact wrapper. Some authored bounds dip slightly below the pivot
plane, so grounding needs a small visual tolerance without editing the GLB.
Use the tree catalog for visual biome diversity only; it is not a source of
authoritative collision, gameplay map placement, resources, rewards, or
authority. The reviewed `realm_forest_layout_v1` / `realm_forest_instance_v1`
projection may persist one fixed Genesis visual layout, but its asset IDs and
fixed-point transforms are authored and server-validated independently of GLB
geometry. It cannot alter terrain semantics, movement, picking, ownership, or
economy.

The species-library source manifests state doubleSided: false, but all 66
decoded GLBs actually set material.doubleSided: true. The runtime family keeps
the exact supplied bytes and treats decoded GLB structure as the
renderer-facing fact; the discrepancy is recorded in the manifest rather than
silently repairing model data.

The project-owner instruction authorizes use of these exact digest-pinned
outputs in this public repository and an eventual official Pages runtime only
after separately approved deployment. It does not grant a public/open-content
licence, general redistribution or derivative authority, trademark rights, or
approval to merge or deploy this draft.

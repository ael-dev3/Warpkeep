# Hegemony Stone Quarry runtime assets

This record pins the three exact owner-supplied Grand Stone Quarry GLBs used by
the live Stone-node presentation. The delivery package and editable masters are
not checked in or fetched by ordinary builds; only the named, digest-bearing
runtime files are public.

The models are self-contained, vertex-coloured GLB files with no images,
animation, cameras, or external URIs. The renderer centres and grounds a private
decoded-bounds wrapper, uses an engine-side footprint instead of the render mesh
for collision, and selects High, Balanced, or Compact within the recorded LOD
policy.

This record describes the visual runtime contract only. The live Stone Quarry
catalog, server-owned expedition lifecycle, and client scene wiring live in the
reviewed Stone node implementation. The renderer still treats these models as
presentation assets: it never uses them to create sites, grant rewards, or
decide routes. See manifest.json for exact source and output hashes, bounds,
orientation, collision guidance, and the narrow authorization boundary.

The companion [inspection-art record](../record-art/README.md) tracks the
high-resolution UI element used by the live Stone Quarry inspector. It does not
change the presentation-only rendering contract above.

# Hegemony Stone Quarry runtime assets

This record pins the three exact owner-supplied Grand Stone Quarry GLBs selected
for the first, asset-only Stone-node integration slice. The delivery package
and editable masters are not checked in or fetched by ordinary builds; only the
named, digest-bearing public runtime files are available after a separately
approved merge and deployment.

The models are self-contained, vertex-coloured GLB files with no images,
animation, cameras, or external URIs. A later renderer must centre and ground
a private decoded-bounds wrapper, use an engine-side footprint instead of the
render mesh for collision, and select High, Balanced, or Compact only within
the recorded LOD policy.

This record describes the visual runtime contract only. The live Stone Quarry
catalog, server-owned expedition lifecycle, and client scene wiring live in the
reviewed Stone node implementation. The renderer still treats these models as
presentation assets: it never uses them to create sites, grant rewards, or
decide routes. See manifest.json for exact source and output hashes, bounds,
orientation, collision guidance, and the narrow authorization boundary.

The companion [inspection-art record](../record-art/README.md) tracks the
high-resolution UI element used by the live Stone Quarry inspector. It does not
change the asset-only rendering contract above.

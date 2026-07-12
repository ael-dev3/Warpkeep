Warpkeep Meshy Title Runtime Assets
===================================

Decision
--------
The six unique Meshy letters were combined into one runtime scene instead of
being deployed as separate files. Two LOD files are provided:

- warpkeep-title-high.glb
- warpkeep-title-compact.glb

Each GLB contains eight named letter nodes in one row:

  W, A, R, P1, K, E1, E2, P2

Only six unique meshes/textures are stored. P2 references the P mesh and E2
references the E mesh, avoiding duplicated geometry and textures while keeping
all letters separately addressable at runtime.

Scene structure
---------------
Root node: WarpkeepTitleRoot
Mesh names: Letter_W, Letter_A, Letter_R, Letter_P, Letter_K, Letter_E
Bounds: approximately 13.6554 wide x 1.9001 high x 0.5000 deep
Baseline: Y = 0
Title center: X = 0
Depth center: Z = 0

The W was uniformly enlarged to match the common cap height. All source models
were normalized to a common 0.50 depth. Letter spacing is baked into node
transforms, with a slightly larger WARP / KEEP separation.

High profile
------------
File size: 3,844,364 bytes
Unique triangles: 288,328
Rendered triangles including repeated P/E instances: 345,078
Textures: WebP, maximum 1024 x 1024
Geometry: Meshopt-compressed and quantized
Tangents: MikkTSpace included
Recommended use: desktop and capable mobile devices

Compact profile
---------------
File size: 1,714,060 bytes
Unique triangles: 132,136
Rendered triangles including repeated P/E instances: 158,146
Textures: WebP, maximum 512 x 512
Geometry: Meshopt-compressed and quantized
Tangents: MikkTSpace included
Recommended use: phones, reduced-quality mode, or slower GPUs

Source comparison
-----------------
The six original unique Meshy files total 264,858,820 bytes. The combined high
asset is about 98.5% smaller, and the compact asset is about 99.4% smaller.

Runtime requirements
--------------------
The GLBs use:

- EXT_meshopt_compression
- EXT_texture_webp
- KHR_mesh_quantization

Warpkeep already uses Meshopt-compressed GLBs for the keep, so the same
GLTFLoader + MeshoptDecoder path should be reused. WebP texture support is
widely available in current browsers.

Suggested integration
---------------------
1. Preserve the existing procedural title as fallback and reduced-motion / load
   failure protection during the first integration.
2. Load only one profile according to the existing quality selector.
3. Keep the title root centered, and fit camera/framing from the GLB bounds.
4. Retain named nodes so per-letter hover, lighting, displacement, or gateway
   reactions remain possible.
5. Do not load both LODs in the same session.
6. Compare the full title against the current procedural title behind a feature
   flag before replacing it permanently.

Validation
----------
Both final GLBs pass glTF Validator with zero errors and zero warnings. The only
validator information is that its validator build does not inspect the standard
EXT_meshopt_compression extension itself.

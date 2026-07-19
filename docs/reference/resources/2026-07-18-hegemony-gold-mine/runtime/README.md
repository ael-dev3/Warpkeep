# Hegemony Gold Mine runtime assets

This directory records the immutable runtime GLBs promoted for the Gold Wagon
integration. It is separate from the earlier `runtime-candidates/` evidence:
the original candidate bytes remain intact, while the runtime record names the
approved public outputs and their hashes.

The High profile is an exact supplied source file. Balanced and Compact repair
only their stale declared atlas size (`1024`) to the already-decoded 512px and
256px atlas dimensions; their geometry and embedded WebP image bytes are
preserved. This avoids teaching the renderer the wrong texture size while
retaining an auditable, minimal output change.

Use a bounds-centered wrapper and terrain-contact tolerance in the renderer.
The model’s render mesh is never a collider, a world-site authority, or a
source of Gold balance/reward state. See [manifest.json](manifest.json) for the
exact source/output hashes, dimensions, and authorization boundary.

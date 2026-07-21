# Realm renderer recovery

The Realm keeps a real WebGL scene as the source of truth once it has become
ready. The renderer lifecycle is explicit: `probing`, `loading`, `ready`,
`recovering`, `static-unsupported`, and `failed`.

`static-unsupported` is reserved for a device that cannot create WebGL before
the first successful scene. It is an accessible, bounded illustrated view; it
is never a post-ready error surface. A renderer construction error, failed
castle assembly, castle-count mismatch, or synchronization failure remains an
explicit loading/recovery/failed state instead of silently replacing a real
world with a full-world SVG.

Context loss calls `preventDefault`, pauses ambient work and rendering, and
retains React selection, camera intent, and the scene attestation. Pointer,
wheel, label-click, and camera input are synchronously suspended while the
context is lost so a partially disposed scene cannot consume a gesture. The
restored event starts a bounded scene rebuild and records loss/restore counts on
the canvas for DOM diagnostics. If the browser does not restore the context in
time, the user sees an explicit retry surface. All renderer surfaces share one
cached, non-destructive WebGL2 capability probe. No capability check calls
`WEBGL_lose_context` or otherwise tears down a context; a probe only reads the
optional texture-size limit.

Castle loading is staged: Compact is mandatory and retried once for transient
transport failures after a deterministic short yield; Balanced and High are
optional upgrades. A missing optional LOD records the active quality in
`data-realm-castle-active-lod` and continues with Compact. Pairing, integrity,
and Compact failures are reported with stable failure codes for telemetry and
QA. Each controlled load is assigned a monotonic renderer generation. Scene
callbacks carry that generation and stale callbacks from a disposed scene are
ignored by both the React boundary and the pure lifecycle reducer. The DOM
exposes the active generation and the last generation that rendered a
successful frame, making recovery assertions deterministic. A ready renderer
can never transition into static compatibility mode.

The recovery contract is intentionally frontend-only. Durable world state,
authorization, and SpacetimeDB subscriptions remain outside the renderer and
are never mutated by recovery code.

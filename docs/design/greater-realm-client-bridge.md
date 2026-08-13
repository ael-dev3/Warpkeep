# Dormant Greater Realm client bridge

Status: review-only. The server and browser presentation gates are literal
`false` values. This work does not register an activation reducer, subscribe a
v17 table, publish a module, import an atlas, or change production behavior.

## Current boundary

The browser's narrow generated-binding projection contains only these v17
procedures:

- `get_realm_atlas_bootstrap_v1`
- `get_realm_atlas_window_v1`
- `get_realm_atlas_chunk_v1`
- `plan_realm_route_v1`

No Greater Realm table or reducer is part of the player projection. Calls are
bound to one authenticated provider generation and recheck that generation
before and after the SDK operation. Reconnect, identity replacement, release
refresh, and disposal cannot publish an older result.

`createGreaterRealmClientRuntime` composes the reviewed public decoders with
the existing device network pools, graphics-profile visible/resident ceilings,
chunk LRU, and descriptor checks. It owns one bootstrap request, one latest
window request, one latest route request, and the bounded chunk fetch/decode
pools. Its snapshots contain only decoded public DTOs and privacy-safe failure
classes.

`RealmMapScreen` now resolves one explicit world-scene strategy. With the
literal gates closed, an authoritatively active legacy realm remains
`legacy-lowlands`; the existing Lowlands scene, Inner Keep surface route, Chat
surface, browser navigation, focus behavior, and renderer recovery lifecycle
are unchanged. Once legacy authority is inactive, any v17 connection or
identity gap selects a no-canvas connection hold and can never resurrect
retained Lowlands geometry.

Legacy-world retirement is not a connection failure. The provider clears only
the canonical Lowlands geometry and legacy dispatch authority, then remains
`ready` on a castle-scoped continuity projection. The combined public
subscription, resource/Marks refresh, caller-private Worker reconciliation,
Inner Keep projection and mutations, and the separate Chat stream stay on the
same authenticated generation. Generic Worker state remains visible and keeps
advancing, but its v1 mutation controls are sealed until a later v2 authority
is wired. A reconnect can retain only that public continuity projection; it can
never retain or remount a canonical Lowlands snapshot after retirement.

The retired-world host already owns the future runtime's generation-scoped
bootstrap lifecycle and disposes it on strategy, identity, device, or graphics
replacement. Current production cannot enter that branch because both literal
presentation gates are closed. The DEV-only synthetic policy seam verifies the
future bootstrap/teardown transition without changing either gate.

## Remaining wiring before either gate may open

1. Extend the retired-world host with one `createGreaterRealmSceneRuntime` per
   provider generation and graphics profile, mount its group into a reviewed
   renderer/camera host, bind only the active canvas, and dispose the group,
   stream controller, animation, context listeners, and pending requests
   atomically. The current host intentionally stops after public bootstrap
   validation and renders no atlas geometry.
2. Derive the initial public atlas window from reviewed relocation authority.
   The current bridge deliberately does not parse meaning out of an opaque cell
   key. The relocation handoff must provide a verified public atlas coordinate
   (or prove that the phase-aware public castle coordinate is the same atlas
   coordinate) before a first window is requested.
3. Translate camera movement into bounded radius-at-most-four window requests
   and monotonic LOD demand. Superseded window results must never move the
   camera or replace the current scene.
4. Route selection and movement only through `plan_realm_route_v1` pages and
   returned `passable` fields. Roads, water visuals, chunk adjacency, and
   missing cells must never create client-side movement authority.
5. Adapt public castle/worker/resource presentation to the v17 procedures
   without adding a table subscription or carrying caller-private procedure
   rows into the scene snapshot. Inner Keep and Chat remain independent
   surfaces and must survive world-scene replacement without remounting.
6. Add rendered desktop, narrow mobile, Farcaster Mini App, reduced-motion,
   background/resume, WebGL context-loss, reconnect, identity-change, revision
   rollover, route paging, and legacy-return regression evidence. Run the
   production bundle boundary scanners before activation review.
7. Review the complete scene host and production postflight, then change the
   independent server and client literals in the same explicitly authorized
   activation. Changing a gate alone is not a supported deployment.

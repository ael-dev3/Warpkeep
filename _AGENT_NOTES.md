# Maintainer and agent notes

## Current state

The verified public release is Alpha 0.3.6. The checked-in package is the
undeployed Alpha 0.3.10 candidate, which includes private resource authority,
the generation-three world expansion, pending Gold Mine and Tier-I Wheat Farm
wagon loops, and a server-seeded shared forest layout for the preserved
founding Lowlands. The
public menu build stamp
identifies the exact deployed source. An annotated
release tag is created only after the matching protected-main deployment passes
exact-build verification. Do not turn the disabled local QA observer into a
Worker or SpacetimeDB release without a separately reviewed production scope.

The release makes the Realm read as a brighter Lowlands day without changing
global exposure, GLB bytes, textures, light count, or authority. A
camera-visible key sun, clear-sky/earth bounce, restrained amethyst identity
fill, bounded castle/base calibration, and a greener scene-linear terrain
palette make masonry sunlit rather than shadowed. A single small shared
castle-plus-base placement clearance protects the dense High base skirt at the
terrain seam; no LOD or base receives an independent transform. The release
also widens local terrain support around the authored landscape footprint,
removes occupied-cell outlines that visually cross the base, keeps one
permanent direct identity rail per projection-visible founded castle, and adds
a readable floor to ordinary zoom while preserving an explicit truthful Realm
overview. Hardware-aware Auto remains the recommended default; Cinematic,
Balanced, and Performance remain explicit player choices. The canvas and those rails share one
map-gesture lane: direct ground-plane drag engages on the first deliberate
attempt, wheel/pinch retain their ground anchor, explicit-overview departure is
continuous, gesture cancellation is fail-clean, and rails receive same-frame
subpixel projection. The release also includes defensive source hardening for
authentication configuration, cookies, bounded transports, profile text/image
ingress, tooling downloads, and CI action runtimes. Those source changes do not
themselves deploy the Worker, mutate admission or backend state, change DNS, or
touch production data.

Alpha 0.3.5 introduced the responsive Farcaster castle record, while this
release makes every direct
Realm username rail permanent at its projected foundation base. Its decorative
castle art is a same-origin, integrity-pinned,
provenance-required runtime asset. These are browser presentation changes only;
they add no gameplay field, action, identity authority, or backend mutation.
The merged authentication presentation shows a verified username/static PFP
during and after QR verification; exact-FID tab restoration is sanitized,
non-authoritative display state only. Remote portrait delivery is optional and
uses the same reviewed-provider, credential-free, redirect-free, byte-, time-,
dimension-, pixel-, and static-format-bounded canvas loader as Realm profiles;
failure preserves the local monogram.
Each GameReady castle tier now loads with its exact matching GameReady landscape
base as one fail-closed assembly. The wider authored island replaces the old
synthetic contact-shadow instance but does not change authoritative castle
placement, LOD distance, camera focus, identity anchoring, or backend state.
Same-URL model transport sharing also requires the same normalized timeout
policy. The final pending cancellation aborts transport; a prefab LOD retires
only after pending acquisitions and active leases both reach zero, then its one
cache retain is released exactly once. Empty authoritative castle sets are
ready with zero models rather than treated as a missing pair.

Warpkeep Alpha 0.3.6 preserves the live title/menu, explicit Alpha Terms gate,
browser-bound S256 website SIWF, rotating HttpOnly session families, a
least-privilege Cloudflare Worker OIDC bridge, and a non-destructively published
protocol-3 SpacetimeDB module. Live Genesis 001 contains 1,261 authoritative
cells. The undeployed generation-v3 candidate expands that same persistent
world additively to exactly 10,000 cells while preserving all 100 permanent
castle slots ordered outward from the close founding district. Deliberately
admitted founders occupy the shared frontier; do not add an
admission, create a convenience player, or mutate their state during diagnostics.

Start with:

1. `README.md`
2. `docs/design/roadmap.md`
3. `docs/technical-architecture.md`
4. `docs/farcaster-integration.md`
5. `docs/operations/reconstruction/README.md`
6. `ASSETS-LICENSE.md`

## Hard boundaries

- FID is identity; handles and profile fields are display metadata.
- The browser never owns admission, keep ownership, resources, timers, or combat.
- AI output is flavor, not authority.
- Never add a real/synthetic FID, change admission/founding state, mutate production world state, or use destructive SpacetimeDB flags during diagnostics. Every production mutation requires explicit owner scope and fresh bounded pre/post verification.
- Keep secrets, SIWF proofs, bearer material, private endpoints, and personal paths out of source, logs, screenshots, and issues.
- Preserve the immutable v0.3.0 licensing cutover commits and normal merge ancestry.
- Runtime assets stay in Warpkeep; authorized source bundles belong in immutable Warpkeep-Assets releases. Unresolved-rights material is not published by assumption.
- The 2026-07-16 GameReady castle authorization covers use of only the three exact recorded High, Balanced, and Compact inputs in this public Warpkeep GitHub repository and its official `warpkeep.com` Pages runtime plus the bounded atlas-size metadata correction recorded for Balanced and Compact. It grants no separate open licence, broader derivative authority, general redistribution right, trademark right, or permission to substitute same-named files. Their active paths carry the first 16 SHA-256 characters; retain the exact Alpha 0.3.4 files at the old URLs for cached-client and rollback safety. Do not use the superseded Alpha 0.3.4 preparation pipeline to overwrite them, and do not describe this geometry swap as a brightness improvement.
- The separate 2026-07-16 GameReady landscape-base authorization covers only
  PR #40 integration of the three exact recorded High, Balanced, and Compact
  inputs in this public repository and official Pages runtime plus the bounded
  atlas-size metadata correction for Balanced and Compact. Preserve
  `LicenseRef-Warpkeep-Provenance-Required`. Apply the exact castle parent
  position, quaternion, and uniform scale to the base; never independently
  center, normalize, ground, lift, or scale the base. A ground-seam correction,
  if needed, must be one documented shared assembly placement value applied to
  castle and base across every LOD. Do not restore the old contact-shadow
  instance when the complete base family is ready, let base bounds alter castle
  LOD/camera/username metrics, or raycast decorative triangles. Compare the
  nearest valid castle-geometry and simple base-collider hits so a farther
  castle cannot beat a nearer base. No public open licence, general
  derivative/redistribution authority, trademark right, or same-named-file
  substitution is granted.
- Every safely in-viewport founded castle has exactly one persistent direct
  username control at its projected foundation-base anchor. Keep that React
  node keyed by castle identity across camera distance and castle LOD changes;
  update only its projected coordinates. Do not reintroduce random or
  collision-driven displacement, roof stacking, individual leader lines,
  automatic keeper clusters, or distance-driven membership/presentation.
  Fully clipped minimum hit boxes are not interactive world controls, and the
  visible set uses a single roving tab stop instead of exposing up to 100 tab
  stops. Arrow keys move spatially, Home/End follow deterministic reading
  order, and focus recovers to the nearest surviving rail when projection
  removes the active one. Rails conservatively obstructed by visible Realm UI
  stay in Explore. Rendered QA records bounded label-on-label contention but
  must reject clipped, non-label-obstructed, or reserved-UI-overlapping controls
  in its supported viewport matrix. Explore remains the complete individually
  selectable keyboard/touch/pointer path for every founded castle, including
  edge and offscreen castles.
- Canvas and direct castle rails must remain part of the same bounded map
  gesture coordinator while HUD controls and dialogs remain excluded. Do not
  stop pointer or wheel propagation on a rail, discard threshold-crossing drag
  movement, let a rail drag emit its click, or allow an old camera target to
  pull against direct manipulation. Preserve cursor/foundation/centroid ground
  anchoring, continuous inward motion from explicit overview, and fail-clean
  reset on cancellation, capture loss, lost buttons, blur, visibility change,
  and disposal. Coalesce high-rate direct input to at most one camera render
  per display frame, without dropping accumulated movement. Project rails in
  the scene frame with subpixel precision; do not restore a second projection
  frame, permanent transform promotion, or backdrop blur to the moving rail
  surface.
- Castle records may render only the existing sanitized public Farcaster
  projection and public castle/visibility-gated Marks fields. Do not fabricate
  durability, alliance, combat status, coordinates, resources, or actions to
  match a visual reference. Keep remote PFPs behind the reviewed provider/path
  policy and bounded credential-free static raster loader; never weaken its
  redirect, time, byte, dimension, pixel, or animation rejection. Preserve the
  public-name-initial/W fallback on rejection or load failure.
- Coalesce castle/base transport only across consumers with the same
  integrity-pinned URL and normalized timeout policy. Never let one consumer
  cancel another, revive a retired LOD, release shared resources while a lease
  or acquisition remains, or require a model pair for an empty authoritative
  castle set.
- The Alpha 0.3.5 record artwork authorization is limited to the exact
  background-cleaned runtime WebP and recorded use in this public repository
  and official Pages runtime. Its decorative role grants no identity or
  gameplay authority, public open licence, general derivative/redistribution
  right, ownership claim, or trademark right.
- The Alpha 0.3.6 mechanics workstream's gold, food, stone, and wood icons are
  exact transparent reference masters beside their dated records under
  `docs/reference/resources/`, pinned by `npm run verify:runtime-assets`.
  They are deliberately outside `public/` and must not ship through Pages or
  enter a runtime bundle until the corresponding authoritative mechanic and
  asset use receive separate review. Do not treat any image as proof of a live
  resource, currency, balance, cost, reward, or player entitlement, and do not
  replace one without an updated authorization, alpha audit, hash pin, and
  review.
- The three Gold Mine GLBs under
  `docs/reference/resources/2026-07-18-hegemony-gold-mine/runtime-candidates/`
  remain exact historical review evidence, pinned by
  `npm run verify:gold-mine-candidates`; they must remain outside `public/` and
  must never be imported by browser code. Their Balanced and Compact files have
  512²/256² embedded WebPs but stale `wk_atlas_size: 1024` metadata; preserve
  their bytes unchanged. The distinct reviewed public runtime family under
  `public/models/hegemony/gathering-nodes/gold-mine/` is pinned by
  `npm run verify:hegemony-gold-mine-runtime`: High is exact source bytes,
  while Balanced/Compact make only the recorded `wk_atlas_size` correction.
  Any LLM changing either family must preserve its exact role, provenance
  record, immutable digest-bearing names, geometry/image boundary, and
  visual-only scope. Neither family grants a renderer-derived world coordinate,
  site, route, reducer, account, balance, seed, deploy, or Gold/Marks coupling.
  The 0.3.10 candidate defines 10,000 cells and 2,000 resource-capable anchors;
  the reviewed Gold-site policy, never capacity metadata alone, determines any
  site placement.
- The Hegemony Supply Wagon LODs under `public/models/hegemony/` are pinned by
  `npm run verify:hegemony-supply-wagon` and documented in
  `docs/reference/factions/hegemony/2026-07-18-hegemony-supply-wagon/`. They
  are visual-only, immutable 47-joint/six-clip assets sourced from the
  checksum-pinned NoTelescope GameReady release payload. Do not fetch or
  prepare assets during ordinary builds; only manual preparation may use the
  approved checksum-pinned source/toolchain. Render through a bounds-centered,
  ground-contact wrapper and engine-side collision proxy, never as a source of
  movement, route, dispatch, occupation, Gold/Marks, reward, or settlement
  authority. Preserve High/Balanced/Compact LOD selection and animation budgets
  from the runtime record when changing presentation.
- The three Wheat Farm GLBs under
  `public/models/hegemony/gathering-nodes/wheat-farm/` are exact owner-supplied
  runtime bytes, pinned by `npm run verify:hegemony-wheat-farm` and recorded
  under `docs/reference/resources/2026-07-18-hegemony-wheat-farm/`. Their
  delivery is narrow runtime-use authorization only: it is not merge, deploy,
  seed, production, open-license, placement, collision, route, worker,
  balance, reward, timing, or SpacetimeDB authority. Preserve High → Balanced
  → Compact source ordering, hash-bearing names, visual-only scope, strict
  per-Food render ceiling, shared Gold/Food animation budget, and marker
  fallback. Never derive Food catalog identity, occupation, route, or
  settlement from GLB geometry or editable source metadata.
- The Hegemony environment-tree family under
  `public/models/hegemony/environment/trees/` is 66 exact digest-bearing GLBs
  across 22 trees, pinned by `npm run verify:hegemony-trees` and documented in
  `docs/reference/assets/2026-07-18-hegemony-environment-trees/`. The
  owner-supplied ZIP is an offline installation input only: ordinary builds
  must verify it, never fetch, unpack, transform, or rewrite it. Preserve every
  High/Balanced/Compact family member and its source-manifest/hash record; do
  not use a same-named replacement. They are vertex-color, opaque,
  double-sided visual assets with a +Y-up, +Z-forward trunk-base contract.
  The 16 source species manifests incorrectly say `doubleSided: false`; the
  decoded GLB bytes are authoritative and must not be silently repaired.
  Renderers may use only a private terrain-contact wrapper, the transforms
  selected by the reviewed shared layout, and conservative projected-height
  LOD. The immutable GLBs and their geometry never determine collision,
  canonical coordinates, pathing, ownership, resources, rewards, or gameplay
  placement. The separately authored, exact-digest `realm_forest_layout_v1` /
  `realm_forest_instance_v1` public projection may persist a fixed Genesis
  visual layout; it contains only an allowed asset selector and fixed visual
  transform, is seeded and validated server-side, and cannot change movement,
  picking, combat, ownership, resources, rewards, or terrain authority. A
  layout change requires a new reviewed version and seed, never ad-hoc client
  culling. The current 210-instance catalog covers only the preserved
  generation-two/founding-Lowlands footprint; do not infer a forest for the
  outer generation-three cells. Retain `LicenseRef-Warpkeep-Provenance-Required`; the use
  authorization is not an open licence, merge approval, or Pages deployment
  approval.
- `public/images/realm/hegemony-gold-mine-record.webp` is a separate,
  exact-hash-pinned transparent 2D inspection illustration with its provenance
  under `docs/reference/resources/2026-07-18-hegemony-gold-mine/record-art/`.
  It may appear only through the standalone `GoldMineInspectionPanel` visual
  component until a reviewed node projection exists. It does not authorize a
  3D candidate promotion, renderer import, world coordinate, target, click
  path, owner, reserve, inventory, Gather action, balance, reward, entitlement,
  or Gold/Marks coupling. Keep the art decorative (`alt=""`, pointer-inert) and
  preserve its exact hash, alpha audit, authorization boundary, and no-external-
  CDN delivery contract when a future approved node interaction mounts it.

## Player-visible release truth

Every player-visible patch must update the complete release-truth set in the
same change: the root package and lockfile version, `CHANGELOG.md`, a dated
`docs/releases/alpha-X.Y.Z.md` note, the exact-version entry in
`src/components/menu/latestPatchNotes.ts`, its tests, `README.md`, and this
file. The README stays concise and product-directional: retain only current
status and links to release truth there, never expand it into patch notes. The
in-menu patch chronicle must summarize the major player-visible changes for the
exact package version; it must never fall back to stale notes.
Use the next SemVer patch for presentation, asset, defect, or bounded polish
that adds no player-facing system boundary. A checked-in candidate is not a
verified public release until protected-main deployment and exact-build
verification succeed; tag only that verified deployment commit.

## Next product work

The founding slice is live. The checked-in 0.3.10 candidate adds bounded
server-derived Gold Mine and Tier-I Wheat Farm loops: 24 Gold sites and 96
Food sites, separate private expeditions/idempotency rows, and one authoritative
wagon of each resource type per castle. Food dispatch must reserve the complete
remaining Food award plus raw passive Food through its gathering deadline; every
passive-settlement path, including Gold expiry, must preserve that reservation
until Food is credited. Both loops remain undeployed and require separately
approved publication, setup, verification, and deployment. The next deliberate
gameplay slice after a verified resource release is deterministic construction
queues. Marks spending and every further production or scheduler capability
remain unavailable until their separate transport, recovery proof, review, and
owner approval are complete. Each slice needs deterministic reducers,
generated-binding parity, isolated tests, exact-head deployment, production
verification, and rollback evidence before expansion.

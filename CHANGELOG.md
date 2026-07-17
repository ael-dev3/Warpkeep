# Changelog

All notable Warpkeep player-facing releases are recorded here. The product uses semantic versioning; the exact deployed source is always identified by its build SHA.

## [Unreleased]

## [0.3.6] — 2026-07-18 candidate

- Founded castles receive one bounded, role-specific diffuse-colour calibration
  across High, Balanced, and Compact. Authored landscape bases receive a
  smaller bounded gain. The calibration changes material uniforms only; it
  does not rewrite the integrity-pinned GLBs, embedded textures, authored
  roughness/metallic/normal response, shared castle/base child transform, draw
  count, or asset provenance.
- A camera-visible daylight sun, clear-sky/earth bounce, brighter bounded IBL,
  and restrained amethyst accent give castle masonry a sunlit read without
  increasing global tone-mapping exposure, adding lights, shadow maps, render
  passes, or animation demand. Lowlands now use a cleaner scene-linear green
  palette, and the SVG fallback encodes it correctly to display sRGB.
- Hardware-aware Auto remains the recommended title and Realm profile. It
  chooses Cinematic only with measured desktop headroom, keeps normal phones
  Balanced, and fails down on constrained devices; every fixed profile remains
  an explicit player choice. Settings now returns players **Back to the Menu**.
- Local terrain foundation and blend influence now cover the wider authored
  island footprint at every canonical castle slot. Interaction feedback no
  longer draws a depth-tested cell outline through an occupied castle base;
  authoritative cells and castle coordinates remain unchanged.
- The complete castle-plus-base assembly now uses one conservative shared
  clearance above the terrain seam. It applies to every LOD, keeps High's
  denser intended skirt grounded, and never independently moves or scales the
  base.
- Every safely in-viewport founded castle now owns one persistent direct
  identity rail at its exact foundation anchor. Camera distance, LOD, hover,
  selection, and label collisions cannot replace it with a keeper cluster or
  overflow identity. Live pre-mask 3D frustum membership prevents a rail from
  outliving its rendered castle at a viewport edge, and touch targets retain a
  device-rounding safety margin above 44 pixels. Fully clipped controls are
  excluded, exactly one visible world label remains tabbable, spatial arrow
  keys move between nearby labels, and Home/End reach deterministic reading
  endpoints. Rails conservatively obstructed by visible Realm UI stay in
  Explore rather than becoming hidden controls. Rendered QA records bounded
  label-on-label contention while rejecting non-label hit obstruction,
  viewport clipping, and HUD overlap. Explore retains the complete keyboard-
  and touch-accessible castle list.
- Ordinary wheel and pinch input keep a readable zoom floor. The explicit
  Realm overview remains available and fits the actual convex rendered-terrain
  perimeter with a conservative raised-scene margin instead of nonexistent
  axis-aligned corners.
- Canvas and castle rails now share one bounded map-gesture path, so a drag
  engages on the first deliberate attempt even when it starts on a username.
  Rail taps still open the castle, while drag, pinch, cancellation, capture
  loss, lost buttons, blur, and hidden-page transitions cleanly separate or
  terminate their input state.
- Direct drag follows exact ground-plane movement without stale camera
  catch-up. Wheel zoom stays anchored below the pointer—or the castle
  foundation when begun on its rail—and pinch stays anchored below its moving
  centroid. High-rate direct input is coalesced to the display cadence, and
  leaving explicit overview for a closer view is continuous.
- Foundation rails now consume camera projection in the same frame with
  tenth-pixel precision. Removing permanent transform promotion and moving
  backdrop blur reduces avoidable compositing work during map motion.
- The compact player HUD now reuses the bounded static Farcaster portrait
  renderer, with the existing sanitized monogram fallback and no FID-as-label.
- Exact provenance-pinned Food, Wood, Stone, and Gold reference masters remain
  outside the Pages `public/` tree, while a fail-closed bigint projection
  decoder prepares a future mechanics slice. No resource image, balance,
  production, construction action, or placeholder counter is mounted in this
  release; Community Marks remains separate.
- Defensive source hardening tightens authentication configuration and cookie
  validation, profile/image ingress, complete founder-profile projection,
  bounded browser/model transports, local
  tooling downloads, private caches, and exact CI action runtimes. It adds no
  authentication bypass and performs no admission, Worker, SpacetimeDB,
  production-data, DNS, wallet, or authoritative-world mutation.
- Alpha 0.3.6 is checked into the integration branch as a candidate. Alpha 0.3.5 remains the
  verified public release until protected-main deployment and exact-build
  verification succeed; no `v0.3.6` tag or release claim is valid before those
  gates pass.

## [0.3.5] — 2026-07-16

- The Realm's high, balanced, and compact Hegemony Main Castle GLBs now use
  the exact owner-approved GameReady LOD family across Cinematic, Balanced,
  and Performance graphics.
- High accepts a modest transfer and triangle increase for its richer close
  geometry. Balanced and Compact reduce both transfer size and geometry, and
  the Compact model's intentionally shorter authored height is accepted as a
  reviewed LOD tradeoff rather than silently stretched in its source data.
- Every GameReady castle tier now carries its matching integrity-pinned
  landscape base, adding a road, grass island, trees, rocks, shrubs, and flowers
  under each founded keep. Castle and base share the exact parent transform;
  the decorative base is never independently recentered, normalized, grounded,
  or used to rewrite authoritative placement.
- The complete castle-plus-base assembly fails closed as one unit. Authored
  island thickness replaces the old synthetic contact-shadow instance, while
  castle geometry still owns LOD distance, camera focus, and username anchoring.
  Picking compares the nearest valid castle-geometry and simple base-collider
  hits without raycasting decorative island triangles. Conservative composite
  bounds keep the wider base from disappearing at the frustum edge.
- The three base GLBs add 334,484 checked-in bytes and at most 131,496,
  105,576, or 71,400 triangles across 100 castles in Cinematic, Balanced, and
  Performance profiles. They remain shared instanced resources rather than
  per-castle asset copies.
- Automatic Cinematic selection now requires measured 8 GB memory and six CPU
  threads because it retains all three castle/base LOD assemblies. Players may
  still choose Cinematic explicitly; normal and unreported devices default to
  the lighter Balanced profile.
- Runtime records now identify each profile's real atlas dimensions and exact
  file integrity instead of inheriting inconsistent source metadata. Existing
  castle footprint normalization and ground alignment remain responsible for
  placing the keep; its matching base copies that exact transform without
  independent normalization or non-uniform deformation.
- The six new castle/base files use immutable SHA-prefixed public filenames.
  The three Alpha 0.3.4 castle coordinates retain their exact former bytes so
  cached clients and a verified rollback cannot receive a mismatched model.
- Public usernames now sit on slim, translucent rails at each keep's projected
  foundation base. An individual rail has one deterministic anchor and no
  leader line or random collision displacement; crowded identities consolidate
  through the existing deterministic keeper-cluster and Explore paths instead
  of drifting away from their castles.
- Castle activation now opens a responsive Farcaster castle record with the
  keeper's sanitized public name, username, biography, safe portrait, and only
  the existing public castle and opt-in Marks fields. Missing or rejected PFPs
  retain the bounded initial/Warpkeep fallback; no durability, alliance,
  combat status, or destructive gameplay action is invented by the new card.
- The castle record's same-origin decorative art is a background-cleaned alpha
  WebP with exact runtime integrity and a dated narrow-use provenance record.
  It adds no authority and is not a substitute for the instanced world model.
- The sign-in presentation now shows a verified Farcaster username and static
  PFP during and after QR verification. A tab-scoped, exact-FID cache can
  restore only that non-authoritative presentation after an authoritative
  cookie refresh. FID remains the sole identity coordinate; browser binding,
  the bridge-managed session, OIDC handoff, authorization epoch, and admission
  remain separate authorization gates.
- The release truth, in-menu patch chronicle, reconstruction boundary, and
  provenance records distinguish the exact owner-supplied inputs and bounded
  atlas-metadata normalization from the superseded Alpha 0.3.4 deterministic
  derivative family. No brightness improvement is attributed to the model swap
  itself.
- This release is Pages-only. It widens only client-side procedural-decoration
  clearance around the authored islands and improves authentication
  presentation, while changing no Terms, authentication authority, admission,
  backend protocol, authoritative world generation or state, castle ownership,
  wallet, Marks, Worker, SpacetimeDB module, or production data.

## [0.3.4] — 2026-07-15

- Labels preserve their roof-attached placement and readable identity through
  dense castle clusters, viewport changes, and the reserved HUD/inspector
  regions.
- The optimized high, balanced, and compact Hegemony Main Castle GLBs replace
  the prior Frontier Keep derivatives while keeping shared instancing and LOD
  budgets intact.
- The title route is model-only: retired HTML, SVG, loader, and procedural
  wordmark paths no longer duplicate the authorized 3D title.
- A local regression decodes the exact compact Hegemony GLB, instances it, and
  requires a real canvas pointer path to open the intended castle inspector
  before terrain fallback can apply.
- The rendered-WebGL matrix includes desktop, tablet, mobile, and
  short-landscape player presentation lanes, while the narrow Explore sheet
  recognizes its complete accessible castle list when the intentional
  full-sheet layout reserves all map-label space.
- A local-only source-versus-runtime WebGL lane checks bounded aggregate visual
  fidelity for high, balanced, and compact keeps without retaining source bytes,
  screenshots, raw pixels, identities, or browser logs.
- This release is Pages-only: local QA, the disabled QA observer, Worker
  changes, SpacetimeDB module publication, profile refresh, admission, world,
  castle, wallet, and Marks operations are outside its release scope.

## [0.3.3] — 2026-07-14

### Added

- One canonical Genesis readiness validator that withholds realm presentation
  until the protocol-3 radius-20 world has exactly 1,261 matching tile and
  metadata rows, one unambiguous active realm, consistent castle occupancy, and
  the authenticated player's authoritative castle.
- A realm-lifetime real-castle prefab repository with deterministic instanced
  high/balanced/compact LOD buckets, raycast mappings, higher-LOD ceilings,
  hysteresis, frustum visibility, and reference-counted cleanup.
- An explicit realm interaction reducer, measured animation-frame-coalesced
  castle labels, UI-aware camera composition, and a searchable founded-castle
  navigator with validated coordinate focus.
- An in-menu, keyboard/touch/hover-accessible latest-patch chronicle that stays
  inside Warpkeep and is bundled by exact product version.
- A persistent soundtrack mute switch, Data Saver/constrained-network-aware
  speculative media policy, visible pre-React boot shell, no-JavaScript notice,
  branded crash recovery screen, and vector site icon.

### Changed

- Every visible founded castle now uses a real Hegemony castle GLB on the normal
  WebGL path. Model failure switches the entire view to the canonical
  illustrated fallback instead of mixing detailed keeps with primitive peer
  markers.
- Realm entry no longer generates or briefly displays a standalone 61-cell
  recovery world. The original 61 cells remain rings 0–4 of the one canonical
  1,261-cell world.
- Public castle identity now uses bounded display-only Farcaster presentation,
  safe eager PFP loading, and a neutral name/sigil fallback rather than an FID
  label or numeric avatar.
- Castle hover is visual only. Explicit click, tap, keyboard, or navigator
  activation owns selection, inspection, camera focus, focus return, and concise
  live-region feedback.
- The permanent large panels and raw coordinate grid are replaced with a compact
  amethyst/electrum HUD, explicit castle record, action toolbar, and responsive
  navigator. Measured UI and device-safe insets keep the camera target in the
  unobstructed play region.
- Realm selection announcements, explicit map-focus navigation, castle-record
  focus return, and the inert 100-Mark warp preview now communicate their state
  more clearly without duplicate live-region noise.
- Current agent, architecture, security, recovery, Genesis, terrain, Marks, and
  release documents now distinguish the live protocol-3 realm from historical
  protocol-2 checkpoints.

### Fixed

- Same-player reconnect can retain a realm only when its full canonical
  fingerprint and connection coordinates match; partial, stale, ambiguous, and
  post-ready invalid snapshots fail closed.
- Camera-frame label positions no longer flow through full React realm renders.
  Collision uses measured labels, stable priority/hysteresis, and reserved UI
  regions instead of guessed dimensions.
- Castle picking resolves real instance IDs before terrain, and drag/pinch or
  label interaction cannot accidentally select the cell underneath.
- Castle normalization remains uniform, material clamps preserve authored PBR,
  foundations ground the full silhouette, and warm/cool lighting plus localized
  contact shadows restore readable depth.
- JWT validation now requires exactly one Warpkeep audience, and explicitly
  malformed or blank public database coordinates fail closed at both activation
  and transport boundaries.
- Partial realm-scene setup failures now release every registered listener,
  observer, renderer, geometry, material, and object through idempotent reverse
  cleanup while preserving the original failure.
- React root failures no longer expose error messages or component stacks in the
  production console; canonical Terms wording is hash-bound to its accepted
  version in CI.
- Manual Pages runs are main-only and ref-isolated for concurrency, preventing a
  feature-ref dispatch from deploying or cancelling a legitimate main release.
- The protected founded-state verifier now supports exact privacy-safe live
  player and Terms counts after earlier founders have entered the realm.
- The guarded SpacetimeDB republisher now gates the current founded protocol-3
  aggregate before and after its non-destructive publish instead of reusing the
  historical empty protocol-2 checkpoint; authenticated player pairs without
  an admitted founder now trip the existing orphan counters as well.
- Development notices cannot dismiss twice, and patch-note hover content has a
  reachable pointer grace period plus normal disclosure-button toggling.

### Security and privacy

- Public image sinks share a fail-closed HTTPS policy that excludes credentials,
  every literal-IP origin, and non-HTTPS schemes; visible PFP requests send no
  referrer and retain a stable neutral fallback on failure.
- A bounded profile-maintenance workflow accepts private input only outside
  command arguments, preserves sanitized last-known-good public fields, requires
  a short-lived one-use reviewed plan, avoids re-fetching during apply, performs
  a fresh read-only post-check, and emits privacy-safe audit outcomes. It is
  limited to already founded profiles and cannot alter admission, castles,
  wallets, or Marks.
- This release changes no backend protocol, schema, Terms/authentication
  version, admission rule, wallet boundary, or production data. Rollout publishes
  only frontend Pages assets; no backend, schema, Worker, or profile-backfill
  operation occurred.

See [Alpha 0.3.3 release notes](docs/releases/alpha-0.3.3.md).

## [0.3.2] — 2026-07-14

### Added

- An append-only backend protocol 3 that preserves the deployed
  seven-table prefix while expanding Genesis 001 to 1,261 authoritative cells,
  100 deterministic permanent castle slots, and separate terrain/content
  metadata.
- Atomic admission-time castle founding, private slot claims, first-login
  ownership binding, trusted Farcaster public profiles, private versioned wallet
  snapshots, and server-authoritative fixed-point Mark accounts.
- Public castle labels and inspection, exact Marks HUD states, paged radius-20
  navigation, founding-district framing, and an inert 100-Mark castle-warp
  preview that cannot move a castle or spend Marks.
- Exact Hegemony Mark PNG/WebP derivatives with release provenance and runtime
  integrity checks, plus a versioned ordinary SNAP token-burn policy for
  Ethereum mainnet.
- A privacy-bounded, stdin-only local Marks operator with two-provider finalized
  scanning, owner-only reports, reconciliation, Keychain/launchd templates, and
  production application deliberately disabled pending transport implementation,
  disposable-local recovery proof and review, and a later separately approved
  production run plan.
- A cancellable 3D title-presentation controller with exact asset integrity,
  shared request coalescing, delayed procedural fallback, and smooth quality
  replacement without transient duplicate render loops.
- Keyboard-contained Terms and Settings dialogs plus a pauseable, manually
  scrollable Credits presentation with live reduced-motion support.

### Changed

- Castle-slot admission order now grows outward from the central district;
  every next slot remains within four hexes of an established slot while the
  complete permanent set still spans all six sectors.
- Current Alpha Terms acknowledgment is enforced server-side before public
  realm subscription. Versioned acceptance evidence stays private, while the
  Terms and Privacy documents disclose experimental Marks, public aggregates,
  external PFP requests, and private wallet/burn processing.
- Realm terrain, packed-earth pads, decoration clearance, SVG fallback, and
  peer markers now derive from the authoritative own-and-peer castle set.
- Peer castle markers share one instanced draw, terrain placement sampling uses
  immutable coordinate indexes, repeated keep-model requests are coalesced and
  integrity-checked, and menu-only visits no longer fetch title music.
- Title, realm, and admission-only UI are split behind their actual screen
  boundaries; menu-only visits avoid the Three.js scene bundle, title music,
  and reduced-motion menu-video metadata transfer.

### Fixed

- Closed an authenticated-session edge that could subscribe without a fresh
  in-memory Terms gesture for the same FID, and made malformed large-world
  projections fall back to the bounded legacy surface.
- Made sector metadata integer-deterministic, prevented the fourth admitted
  castle from jumping directly to the outer realm, and bounded scanner range
  allocation before creating work records.
- The scanner now reads chain ID from both providers, reconciles proxy upgrade
  history and the opaque indexed event word, and reattests implementation code
  at every distinct burn-event block.
- Preserved realm focus and selection across quality changes, ignored metadata-
  only peer updates, and stopped nested HUD controls from triggering map keys.
- Removed the phantom origin foundation when no castle exists and kept custom
  wide foundations continuous across shared terrain edges.
- Deduplicated SpacetimeDB transaction notifications and consumed observer
  snapshots directly instead of rebuilding and sorting the realm repeatedly.
- Stabilized title loading, reveal, quality replacement, hidden-tab recovery,
  particle-density changes, and resource disposal under Strict Mode and live
  reduced-motion changes.
- Restored exact modal trigger focus, removed non-interactive heading outlines,
  and improved compact Terms, Credits, project-link, and realm-HUD legibility.
- Corrected SVG-fallback castle-label projection for aspect-fit canvases,
  clamped priority labels inside the viewport, and made scenic blockers clearly
  non-playable in inspection and navigation UI.
- Prevented a cancelled Terms acknowledgment from opening a late realm
  subscription, ignored the initial duplicate subscription row event, and made
  warp-preview Escape handling stay inside its own control.
- Added radius-aware renderer budgets for the 1,261-cell realm, preserving the
  existing radius-four quality while bounding expanded-realm terrain and detail
  geometry across all quality tiers.

### Security and operations

- Added strict protocol-3 preseed and seeded-empty aggregate gates, counts-only
  inspection, exact private-table omission checks, and a non-destructive local
  migration rehearsal for both empty and populated legacy fixtures.
- Strengthened the guarded publisher's final pre-publication stop from the
  legacy five-count shape to the exact deployed protocol-2 aggregate, including
  private ownership/orphan counts and protocol/seed metadata.
- Added transactional pending/finalized scan batches, frozen wallet-snapshot
  generations, immutable batch-bound receipts, cursor compare-and-swap, and
  counts-only reconciliation; the local apply command remains hard-disabled
  until its transport and disposable-local recovery path are implemented and
  reviewed. Any later production run still requires separate approval.
- Added a privacy-safe founded-state verifier stage with a required canonical
  expected founder count. It checks the exact seeded world, admission/founding
  row counts, empty pre-login/operator state, and every protocol-3 integrity
  counter after each separately approved founding action without accepting or
  printing FIDs.
- Completed the separately gated protocol-3 publication, Genesis 001 expansion,
  exact frontend deployment, and deliberately approved founding admissions
  without publishing founder identities. Further admissions and all production
  mutations remain explicit owner actions; Marks apply, spending, and scheduler
  installation remain unavailable.

See [Alpha 0.3.2 release notes](docs/releases/alpha-0.3.2.md).

## [0.3.1] — 2026-07-13

### Added

- An accessible, unchecked **ALPHA PARTICIPATION TERMS** gate before every
  authentication attempt, with one-shot in-memory acceptance and no identity or
  persistent acceptance record.
- S256 browser binding for Farcaster proof exchange, rotating HttpOnly session
  families, explicit remember-device opt-in, and server-side logout/revocation.
- Tokenless pending-admission sessions, positive admission epochs, a dedicated
  resolver authority, and an additive public `player_v2` / private
  `player_ownership_v2` ownership pair. The deployed legacy `player` schema is
  retained unchanged and its writer is retired.

### Changed

- Anonymous mount, focus, visibility, pageshow, and direct `#realm` navigation
  no longer restore cookie authority or begin authentication. Direct realm URLs
  normalize to the menu until a fresh, accepted entry attempt succeeds.
- Retry, pending-admission checks, authenticated entry, cancellation, failure,
  expiry, browser Back, and unmount now consume or clear the current acceptance.

### Security and operations

- Added exact runtime/configuration attestation, defensive transport and response
  headers, least-privilege protocol-v2 claims, privacy-safe logging, and
  fail-closed browser/Worker/SpacetimeDB compatibility checks.
- Added a pinned, loopback-only SpacetimeDB 2.6.1 rehearsal proving that the v2
  schema is additive, the real module preserves empty and synthetic nonempty
  legacy fixtures, uses `--delete-data=never`, and cannot accept a
  breaking-client prompt. The guarded publisher repeats that proof, binds its
  SHA-256 receipt to the same prebuilt `bundle.js`, rechecks the bytes before
  invoking `--js-path`, and performs a fresh protected v1 aggregate before
  targeting the immutable database identity.
- Pinned the browser's numeric world seed and made canonical terrain plus every
  castle/occupancy backlink fail closed before v2 readiness or inspection.
- Kept public authentication disabled by default. The schema, Durable Object,
  managed-secret, Worker, Pages, and public-enable stages remain separate owner
  approval gates; this source release alone changes no production user or world
  data.

See [Alpha 0.3.1 release notes](docs/releases/alpha-0.3.1.md).

## [0.3.0] — 2026-07-13

### Added

- Real Meshopt-compressed WARPKEEP stone-title assemblies with exact runtime integrity checks and a procedural fallback.
- One persisted graphics setting shared by the title and realm: Auto, Cinematic, Balanced, and Performance.
- A 2.06 MB balanced Hegemony keep tier that preserves the mobile silhouette and material boundaries.
- Public-safe engineering lessons plus workstation, service, asset, deployment, incident, and credential-recovery documentation.
- Explicit title-asset fetch/cache/offline preparation and CI checks for runtime hashes and oversized non-runtime files.

### Changed

- Normal phones now use the balanced profile; manual settings safely recreate renderers while preserving the selected realm cell.
- Realm fog sits farther from the camera, while restrained ACES exposure and warm/cool lighting improve keep contrast.
- Credits use a viewport-centered track independent of their vertical animation and include the stone-title attribution.
- The README and project voice now describe a live, persistent frontier rather than an outdated local scaffold.
- Large reference-only source binaries left the active repository tree. Unresolved-rights families were restricted rather than uploaded publicly.

### Removed

- The local-save-style **CONTINUE** menu command and its stale notices/tests.

### Fixed

- Corrected the deployed Workerd auth-epoch resolver's accidental method receiver binding by invoking the stored runtime `fetch` through a receiverless local binding.
- Added privacy-safe failure stages and a server-only synthetic resolver probe so deployed failures can be diagnosed without returning identity, token, epoch, URL, or upstream-body data.
- Preserved selected realm cells and disposed/recreated exactly one scene when graphics quality changes.

### Security and operations

- Preserved the fail-closed SIWF → Worker OIDC → SpacetimeDB admission boundary and the empty production admission state.
- Completed the history-preserving Apache-2.0/CC-BY-4.0 two-commit cutover while retaining the v0.2.0 0BSD/CC0 texts.
- Archived the authorized title sources and assemblies in the public Warpkeep-Assets release `title-stone-letters-2026-07-12` with verified download hashes.

## [0.2.0] — Alpha candidate

### Added

- The cinematic title, Hegemony menu, Lowlands presentation, first keep, soundtrack, and Credits flow.
- Farcaster SIWF with mobile deep-link support and an intentionally limited remembered-device alpha session.
- A secure closed-alpha path: Farcaster proof verification, an ES256 OIDC bridge, private admission records, generated SpacetimeDB bindings, and safe Hermes administration.
- A 61-cell Genesis 001 authority model ready for an empty-whitelist rejection test.

### Changed

- `warpkeep.com` is the canonical production target; legacy GitHub Pages path builds remain available for compatibility checks.
- The main menu reports the release channel, version, and exact deployed build SHA.

### Security

- Shared-alpha browser activity is disabled unless explicit, valid public configuration enables it.
- Credential-bearing bridge routes use distributed exact rolling-window limits, and disabled-to-enabled admissions rotate the authorization epoch before old player tokens can regain authority.
- No player, castle, or real Farcaster FID is created or admitted by this release candidate.

[Unreleased]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.5...HEAD
[0.3.6]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.5...codex/alpha-0.3.6-integration
[0.3.5]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.4...v0.3.5
[0.3.4]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/ael-dev3/Warpkeep/compare/d5f0748dbfff07064a736c2b8d273d6022a03050...v0.3.0
[0.2.0]: https://github.com/ael-dev3/Warpkeep/compare/f50a277044b8abe23df9fe8aae25dd82b49635b6...d5f0748dbfff07064a736c2b8d273d6022a03050

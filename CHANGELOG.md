# Changelog

All notable Warpkeep player-facing releases are recorded here. The product uses semantic versioning; the exact deployed source is always identified by its build SHA.

## [Unreleased]

### Added

- An in-menu, keyboard/touch/hover-accessible latest-patch chronicle that stays
  inside Warpkeep and is bundled by exact product version.
- A persistent soundtrack mute switch, Data Saver/constrained-network-aware
  speculative media policy, visible pre-React boot shell, no-JavaScript notice,
  branded crash recovery screen, and vector site icon.

### Changed

- Realm selection announcements, explicit map-focus navigation, castle-record
  focus return, and the inert 100-Mark warp preview now communicate their state
  more clearly without duplicate live-region noise.
- Current agent, architecture, security, recovery, Genesis, terrain, Marks, and
  release documents now distinguish the live protocol-3 realm from historical
  protocol-2 checkpoints.

### Fixed

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

[Unreleased]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.2...HEAD
[0.3.2]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/ael-dev3/Warpkeep/compare/d5f0748dbfff07064a736c2b8d273d6022a03050...v0.3.0
[0.2.0]: https://github.com/ael-dev3/Warpkeep/compare/f50a277044b8abe23df9fe8aae25dd82b49635b6...d5f0748dbfff07064a736c2b8d273d6022a03050

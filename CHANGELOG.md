# Changelog

This file summarizes player-facing releases. Commit history and
[GitHub Releases](https://github.com/ael-dev3/Warpkeep/releases) retain the
full engineering record.

## [Unreleased]

## [0.3.17] — 2026-07-24

- Let keepers return from the Realm and re-enter during the same authorized
  session without accepting the current entry agreement again.
- Kept the checkbox mandatory for every fresh, expired, signed-out, changed-FID,
  or otherwise unproven session. No acceptance is persisted in browser storage.

## [0.3.16] — 2026-07-24

- Unified each occupied resource site and its gathering keeper into one record,
  with phase-specific time left, public identity, castle navigation, and
  owner-only worker recall kept together.
- Removed manual resource-claim controls. Existing server-authoritative
  settlement now runs on the authenticated Realm cadence, while recall and
  expiry schedules preserve offline completion.
- Kept balances private and all rates, clocks, ownership, and credit cursors
  under SpacetimeDB authority.

## [0.3.15] — 2026-07-24

- Restored the path from sign-in to live Realm records and restored the authored
  texture treatment across keeps and the title presentation.
- Softened the ocean-to-fog horizon, tightened ordinary zoom-out, and brought
  denser biome-shaped forests to the Lowlands.
- Added safe public Farcaster portraits to occupied resource sites and their
  read-only gathering records, including static previews for animated or
  decentralized profile images.
- Kept passive selection camera-neutral across keeps, water, workers, and
  resource records. Gathering records now show the authoritative arrival,
  gathering, or return time left instead of a generic deployment duration.
- Prepared four persistent worker slots and guarded individual / Recall All
  controls behind inactive rollout gates. They are not live in Alpha 0.3.15;
  the existing expedition flow remains authoritative.

## [0.3.14] — 2026-07-22

- Made the Realm recover from temporary graphics interruptions while preserving
  selection and camera intent, and let castles continue at compact detail when
  optional richer models cannot load.
- Gave river and ocean surfaces gentle motion and selectable, read-only public
  records, including source-to-mouth river navigation. Reduced-motion play
  keeps the water still.
- Refined the Lowlands toward a clearer green palette and denser grass coverage
  without changing authoritative terrain, ownership, or resource rules.
- Staged a server-authoritative four-worker foundation behind inactive migration
  and activation gates. Workers are not live in Alpha 0.3.14; the existing
  expedition flow remains in place.

## [0.3.13] — 2026-07-19

- Let the old scattered lakes return to lowland while preserving twelve
  one-cell rivers and the ocean around Genesis 001.
- Opened the strategic overview to coast-to-fog panning without letting the
  camera cross the full-fog boundary.
- Gathered grass and trees into clearer biome regions and kept water, roads,
  keeps, and resource sites free of stray vegetation.
- Made moving supply wagons selectable and placed active expedition shortcuts
  in the Realm menu.

## [0.3.12] — 2026-07-19

- Gave Genesis 001 a persistent coastline, lakes, and rivers, bringing water
  through the Lowlands without moving its castles or roads.
- Opened Stone Quarries as the fourth shared gathering destination, with an
  independent wagon alongside Gold, Food, and Wood expeditions.
- Extended grass across the Realm and improved touch, viewport, and Safari
  behavior for a calmer experience on smaller screens.
- Shortened the Hegemony Social Contract and made the Alpha's boundaries
  clearer. The core strategy loop remains unfinished, and participation carries
  no promise of rewards or financial return.

## [0.3.11] — 2026-07-19

- Opened Gold Mines, Wheat Farms, and Logging Camps across Genesis 001, giving
  each founder three independent wagon expeditions to manage.
- Made the Lowlands feel more alive with a shared forest and wind-swept grass,
  while keeping its roads, terrain, castle sites, and ownership unchanged.
- Added clear resource explanations and focused site records for mouse, touch,
  and keyboard play. Stone remains a terrain resource without a live Quarry
  loop.
- Kept castle control durable when public Farcaster presentation changes,
  improved interrupted-expedition recovery, and refreshed the Alpha entry
  agreement in plain language.

## [0.3.8] — 2026-07-18

- Expanded Genesis 001 to 10,000 persistent cells while preserving the
  founding district, existing castles, and 100 permanent castle sites.
- Brought private Food, Wood, Stone, and Gold collection into the live Realm.
  Terrain and server time determine yield; other players cannot read a keep's
  balances.
- Reserved space for future resource nodes without placing nodes or adding a
  new reward, spending, or trading system.
- Improved Realm entry, reconnect behavior, keyboard focus, and large-world
  loading.
- Kept Community Marks separate from resources. Marks still cannot be spent,
  converted, transferred, or redeemed.

## [0.3.6] — 2026-07-18

- Brightened the Lowlands and improved castle readability across graphics
  profiles without replacing the reviewed models.
- Made castle labels easier to select and navigate with pointer, touch, and
  keyboard input.
- Improved map dragging, anchored zoom, overview framing, profile fallbacks,
  and defensive browser input handling.

## [0.3.5] — 2026-07-16

- Introduced the GameReady Hegemony castle and landscape-base model family.
- Added responsive castle records with sanitized Farcaster presentation.
- Restored verified Farcaster usernames and portraits after safe session
  refreshes.

## [0.3.4] — 2026-07-15

- Replaced the previous keep presentation with optimized castle models.
- Simplified the title screen to the approved 3D wordmark.
- Expanded rendered browser coverage across desktop, tablet, mobile, and short
  landscape layouts.

## [0.3.3] — 2026-07-14

- Added the 1,261-cell Genesis realm, clearer castle labels, castle inspection,
  map navigation, and a more compact Realm interface.
- Improved model loading, camera behavior, accessibility, and cleanup after
  failed or cancelled Realm sessions.

## [0.3.2] — 2026-07-14

- Expanded Genesis 001 to 100 permanent castle slots and introduced
  server-owned founding, castle ownership, and Community Marks accounting.
- Added the Hegemony Mark artwork, richer terrain presentation, and responsive
  settings and terms dialogs.

## [0.3.1] — 2026-07-13

- Added Alpha participation terms before authentication.
- Hardened Farcaster sign-in with browser binding, rotating sessions, logout,
  and separate identity, admission, and ownership checks.

## [0.3.0] — 2026-07-13

- Added the 3D stone title, shared graphics settings, improved castle rendering,
  and the Apache-2.0 / CC-BY-4.0 licensing transition.
- Removed the obsolete local-save-style Continue flow.

## [0.2.0] — 2026-07-12

- Established the first public Alpha: cinematic title and menu, the Hegemony
  Lowlands, a first keep, Farcaster sign-in, and an admission-gated shared-world
  foundation.

[Unreleased]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.17...HEAD
[0.3.17]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.16...v0.3.17
[0.3.16]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.15...v0.3.16
[0.3.15]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.14...v0.3.15
[0.3.14]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.13...v0.3.14
[0.3.13]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.12...v0.3.13
[0.3.12]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.11...v0.3.12
[0.3.11]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.8...v0.3.11
[0.3.8]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.6...v0.3.8
[0.3.6]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.5...v0.3.6
[0.3.5]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.4...v0.3.5
[0.3.4]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/ael-dev3/Warpkeep/compare/d5f0748dbfff07064a736c2b8d273d6022a03050...v0.3.0
[0.2.0]: https://github.com/ael-dev3/Warpkeep/compare/f50a277044b8abe23df9fe8aae25dd82b49635b6...d5f0748dbfff07064a736c2b8d273d6022a03050

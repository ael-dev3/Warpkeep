# Changelog

This file summarizes player-facing releases. Commit history and
[GitHub Releases](https://github.com/ael-dev3/Warpkeep/releases) retain the
full engineering record.

## [Unreleased]

## [0.3.28] — 2026-07-30

- Added a portrait-first Farcaster Mini App entry with a compact top resource
  rail, host safe areas, and one browser/host Back hierarchy.
- Moved compact keep, Worker, resource, Water, terrain, Explore, and Settings
  records into focused full-screen destinations while preserving camera,
  selection, and the long-lived Realm scene beneath them.
- Added verified keeper identity, relevant resource-site shortcuts, and
  capability-aware Farcaster profile and Mini App exit actions.
- Added exact-domain, server-verified Farcaster Quick Auth without persistent
  browser bearers or cross-site cookies; ordinary browser SIWF remains
  unchanged.
- Added static Mini App embed metadata and fail-closed manifest, image,
  provenance, CSP, and Pages release checks.
- Left admission, ownership, balances, Worker authority, terrain, and
  persistent world rules unchanged.

## [0.3.27] — 2026-07-30

- Opened a broad dry frontier across the southern outer Lowlands, shaped by a
  deterministic wind field rather than a new authoritative terrain kind.
- Let grass and woodland thin and warm toward the rim while preserving exact
  terrain height, topology, northern winter presentation, and central identity.
- Left movement, Water, Workers, resources, routes, balances, and persistent
  world rules unchanged.

## [0.3.26] — 2026-07-30

- Let frost settle gradually across the northern outer Lowlands and deepen
  toward the rim without adding a new authoritative terrain kind.
- Made grass and woodland respond to the winter field while preserving exact
  terrain topology, forest records, draw budgets, and central Lowlands identity.
- Left movement, Water, Workers, resources, routes, balances, and persistent
  world rules unchanged.

## [0.3.25] — 2026-07-29

- Gave ordinary Realm interactions restrained procedural sound while preserving
  trusted browser gestures, the existing soundtrack, and exact mute behavior.
- Made every canonical river occupy its full Water hex, with clearer banks,
  directional movement, and continuous source-to-ocean identity.
- Added exact cell-by-cell Water record navigation without changing Worker
  routes, camera position on selection, ownership, balances, or world authority.

## [0.3.24] — 2026-07-29

- Gave active Supply Wagons a continuous, demand-driven locomotion cycle whose
  horse gait and distance-driven wheels follow their real journey speed.
- Smoothed road headings, terrain contact, corners, and recalls without
  changing the exact server-timed position of any Worker.
- Restored the current movement phase through reconnects, late model loads,
  quality changes, and reduced-motion play instead of replaying old gestures.
- Left Worker authority, timings, routes, assignments, ownership, balances,
  settlement, node leases, authentication, terrain, and persistent world state
  unchanged.

## [0.3.23] — 2026-07-28

- Centered the violet title passage on the actual visible black-hole gateway
  from its first rendered frame in both directions.
- Kept pointer, touch, keyboard, and repeated crossings aligned to that same
  gateway center without reusing a stale or arbitrary click origin.
- Left authentication, Workers, resources, Realm rendering, and persistent
  world state unchanged.

## [0.3.22] — 2026-07-28

- Shipped an initial title-transition alignment pass; later production
  recording confirmed that a coordinate mismatch still remained.
- Parked idle Supply Wagons invisibly inside their keeps so only active
  outbound, gathering, and returning journeys occupy the Realm map.
- Kept all four Workers available through keep controls without changing
  dispatch, recall, routes, balances, authority, or persistent world state.

## [0.3.21] — 2026-07-27

- Kept all four public Workers and their journeys present while caller-private
  control and accrual state synchronize independently.
- Added one caller-bound, atomic Worker control projection while retaining the
  earlier read procedures as a bounded compatibility path.
- Kept Food, Wood, Stone, and Gold numeric using the last confirmed private
  core balance whenever Worker-inclusive accrual is still synchronizing.
- Restored individual recall and Recall All through the authenticated,
  caller-bound server authority without inventing local Worker movement.
- Anchored the title transition to the frozen pointer, touch, or measured
  keyboard gateway position without drift through departure.
- Removed patch notes from the operational Realm menu while keeping them in the
  main menu, and added an overview regression that distinguishes canonical
  Water from stretched route or shoreline artifacts.

## [0.3.20] — 2026-07-27

- Kept the ready Realm present through ordinary worker actions, resource
  updates, menus, and inspection instead of returning players to a disruptive
  full-world loading screen.
- Restored valid public worker journeys, wagons, routes, and keeper portraits
  across reloads and reconnects while private controls synchronize safely in
  place.
- Corrected the title gateway departure, worker-menu truth, Recall All
  availability, and duplicated destination reservations.
- Crafted a calmer Lowlands landscape with more natural terrain, clustered
  grass, forest cores and clearings, grounded keeps, and clearer resource-site
  states.
- Joined rivers into continuous channels with readable banks, restrained
  motion, and a softer meeting between ocean and fog.
- Made worker travel feel more physical through terrain-following route
  ribbons, steady movement, turning Supply Wagons, and one coherent moving or
  gathering identity marker.
- Refined records, camera hierarchy, interaction feedback, and responsive
  composition so the world remains primary on desktop, mobile, and short
  landscape screens.
- Left worker authority, ownership, private balances, gathering rates,
  settlement, and the deployed database contract unchanged.

## [0.3.19] — 2026-07-25

- Moved worker assignment onto the Realm map: select an open Gold Mine, Wheat
  Farm, Logging Camp, or Stone Quarry and send one of the keep’s four ready
  workers from that site record.
- Gave each journey its canonical passable hex route, a bounded dashed trail,
  an approved Supply Wagon, and a keeper portrait that travels with the worker
  instead of appearing early at an endpoint.
- Kept reconnects, worker selection, reduced-motion play, individual recall,
  and Recall All aligned with each worker’s current authoritative position and
  physical return to the keep.
- Made the Realm easier to use with explicit keyboard guidance, quieter
  resource announcements, larger resource touch targets, and paused background
  resource polling while the page is hidden.
- Gated Pages delivery on the exact successful protected verification commit
  and added a bounded, read-only proof of the deployed SHA and authentication
  mode.
- Left the deployed v12 worker authority, ownership, settlement, node leases,
  timings, activation state, and database schema unchanged.

## [0.3.18] — 2026-07-24

- Prepared exactly four permanent workers for every founded keep, with flexible
  Gold / Food / Wood / Stone assignments across distinct open sites, automatic
  authoritative settlement, individual recall, and Recall All.
- Added an owner-bound return for active legacy wagons and a separately
  confirmed operator cutover that preserves earned resources, clears the exact
  legacy lifecycle graph, and leaves generic activation closed until every
  legacy count is zero.
- Kept occupied-node portraits and records public and read-only while worker
  commands, balances, ownership, and accounting remain private and
  server-authoritative.
- Published the append-only module, backfilled the exact roster, drained the
  legacy lifecycle, activated generic mode, deployed the matching client, and
  passed the owner smoke test before declaring the release live.

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

[Unreleased]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.28...HEAD
[0.3.28]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.27...v0.3.28
[0.3.27]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.26...v0.3.27
[0.3.26]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.25...v0.3.26
[0.3.25]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.24...v0.3.25
[0.3.24]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.23...v0.3.24
[0.3.23]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.22...v0.3.23
[0.3.22]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.21...v0.3.22
[0.3.21]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.20...v0.3.21
[0.3.20]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.19...v0.3.20
[0.3.19]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.18...v0.3.19
[0.3.18]: https://github.com/ael-dev3/Warpkeep/compare/v0.3.17...v0.3.18
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

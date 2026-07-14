# Warpkeep Alpha 0.3.3 — Genesis Realm UI and Castle Presentation

**Status: released 14 July 2026 through protected main and GitHub Pages. The
menu build stamp identifies the exact deployed source; `v0.3.3` is tagged only
after that deployed commit passes exact-build verification.**

Alpha 0.3.3 is a focused Genesis Realm presentation and canonical-state patch.
It replaces transitional world and marker behavior with one fail-closed realm
boundary, real Hegemony keeps for every founded castle, stable interaction, and
a compact responsive interface. It does not add a gameplay system or expand
browser authority.

## One canonical Genesis realm

Realm presentation now waits for one complete protocol-3 Genesis 001 snapshot.
The shared validator requires one active canonical realm, radius 20, the
expected generation and capacity, exactly 1,261 world rows and 1,261 matching
metadata rows, valid tile keys and static metadata, consistent castle occupancy,
and exactly one castle owned by the authenticated player.

Until those checks succeed, the browser shows a branded opening surface rather
than a playable map. Partial, ambiguous, timed-out, or contradictory state
fails closed to recovery controls. A same-player reconnect may retain a prior
snapshot only when its full canonical fingerprint and connection coordinates
still match. The browser no longer generates a standalone radius-four recovery
world: the historical 61 inner cells remain rings 0–4 of the one authoritative
1,261-cell realm.

The illustrated no-WebGL/model fallback uses the same canonical snapshot and
selection contract. It cannot revive the obsolete 61-cell presentation.

## Real castles and bounded rendering

Every visible founded castle uses a real integrity-pinned Hegemony castle GLB
on the normal WebGL path. There is no peer cone, crystal, pin, number-circle, or
temporary primitive castle. The realm remains behind its loading layer until
all authoritative castles have real instances; a model failure moves the whole
view to the canonical illustrated fallback instead of mixing representations.

A realm-lifetime prefab repository fetches and parses each required compact,
balanced, or high LOD once. Instanced submesh buckets share geometry, materials,
and textures across players, while deterministic castle-ID mappings support
raycasting. Screen-space thresholds use hysteresis, frustum visibility, a
selected-castle quality floor, and hard ceilings of eight high and twenty-four
balanced visible instances; additional visible castles use the compact real
model. Late asynchronous loads cannot insert into a disposed scene, and shared
resources are reference-counted and released once.

The keep is normalized with uniform scale, centered over a wider blended
foundation, and grounded without changing authored proportions. Material
handling preserves authored PBR differences while bounding unsafe numeric
extremes. Neutral stone light, warm sun, cool amethyst fill, restrained
reflections, and localized contact shadows replace the flat transitional look.

Deterministic terrain ceilings for the 1,261-cell world remain 150,000 high,
90,000 balanced, and 40,000 reduced triangles. Automated packing covers four
and one hundred synthetic castles, but those tests are architectural evidence,
not a real-device frame-rate or thermal benchmark.

## Stable interaction and labels

Durable state now separates selected terrain, selected castle, inspector
target, camera target, navigator state, and keyboard-focus intent. Pointer
hover is transient presentation only: it cannot rewrite selection or the main
HUD, open an inspector, move the camera, or produce a live-region announcement.
Castle instances are resolved before terrain, and drag/pinch gestures suppress
accidental activation.

React owns label identity and public profile content. Camera motion updates
label transforms imperatively at most once per animation frame. Layout uses
measured label dimensions, priority ordering, hysteresis, bounded membership,
and the actual HUD, inspector, toolbar, navigator, viewport, and device-safe
regions. A label contains pointer and keyboard events instead of leaking them
to the map below.

The compact Hegemony interface keeps the playfield central. It provides a small
own-keep HUD, inline Marks presentation, bottom actions, an explicit castle
record, and a searchable Realm Navigator with an optional validated coordinate
jump. The former principal grid of more than one thousand coordinate buttons is
gone. Escape closes the topmost transient surface first, focus returns safely,
and touch controls retain 44 CSS-pixel targets.

## UI-aware camera and accessibility

Camera composition is calculated against the unobstructed play region rather
than the raw canvas center. Measured HUD, inspector, toolbar, navigator, compact
bottom-sheet, viewport-safe, and device-safe insets feed the same controller.
Opening or closing a record recomposes the existing camera; selecting a castle
or navigator coordinate focuses that target without rebuilding the scene.

Overview uses a 26-degree strategy lens and close keep inspection uses an
18-degree lens with additional distance rather than non-uniform castle scaling.
Golden safe-bound tests cover 1920×1080, 1440×900, 1024×768, 390×844, and
667×375 layouts with the inspector open and closed. Reduced-motion mode settles
camera transitions immediately.

Keyboard, touch, focus-visible, no-WebGL, and screen-reader paths remain
first-class. The principal live region changes only for explicit selection or an
important error; pointer hover and public-profile arrival do not create chatter.

## Public profile and privacy boundary

Castle presentation consumes only bounded, sanitized public profile fields.
Labels prefer a canonical username, then a public display name, then the neutral
`Hegemony Keep` fallback. Avatars prefer a validated HTTPS PFP, then a
public-name initial, then the Warpkeep sigil. FID digits are never used as the primary
world label or avatar.

Visible PFPs load eagerly with no referrer. Shared URL policy strips fragments
and rejects credentials, every literal-IP origin, and non-HTTPS schemes before
an image reaches a browser sink. Image failure keeps a stable neutral fallback.

The private profile-maintenance workflow is bounded to already founded public
profiles, preserves sanitized last-known-good values only when the upstream is
unavailable or incomplete, and honors authoritative field clears from a
complete current response. It requires a dry run plus a short-lived, one-use,
content/config-attested reviewed plan bound to the exact founder set. Apply
never re-fetches profile data, performs a fresh read-only post-check, and records
only privacy-safe completeness and mutation outcomes. It cannot admit a player,
move a castle, inspect a wallet, or alter Marks. The current founded profiles
were backfilled through that bounded reducer path.

The existing Terms-gated, browser-bound Sign In with Farcaster, short-lived
access authority, rotating HttpOnly session, admission, and protocol-3 server
boundaries are preserved. Alpha 0.3.3 does not place tokens, proofs, QR payloads,
wallet data, private identity, or operator inputs in public realm state or
browser diagnostics.

## Validation status

Focused automated coverage now exercises:

- exact canonical acceptance plus rejection of 61/1,260 cells, missing or
  duplicate metadata, realm ambiguity, wrong protocol/seed/radius/generation,
  broken occupancy, public-row overflow, and wrong own-castle ownership;
- pre-application loading, readiness timeout, inert late callbacks, reconnect
  fingerprint retention, fail-closed invalid observer updates, and hidden-tab,
  pageshow, and StrictMode remount rejection of the historical 61-cell state;
- hover-independent interaction, inspector/navigator exclusivity, focus return,
  measured label collision, label event isolation, and concise announcements;
- deterministic four- and one-hundred-castle LOD packing, higher-LOD ceilings,
  instance picking, real-prefab resource reuse, and cleanup after asynchronous
  scene work;
- camera-safe bounds at the five target viewport classes, live composition,
  reduced motion, and hidden-document render recovery;
- profile sanitization, authoritative clearing versus outage preservation,
  unsafe-image rejection, neutral fallbacks, exact-founder reviewed-plan
  handling, bounded reducer outcomes, and privacy-safe audit records.

The cumulative Alpha 0.3.3 matrix passed 99 root files / 977 tests, 152 Worker
unit tests plus 3 workerd tests, and 85 SpacetimeDB tests. Root, Worker, and
module typechecks; standard, canonical Pages, and legacy-base builds; 18 exact
runtime assets; file-size and licensing policy; generated-binding parity; the
additive migration proof; zero-vulnerability dependency audits; 189 registry
signatures; 61 attestations; and a zero-finding redacted secret scan all passed.
Protected Verify and CodeQL checks passed before merge and again on main.

Local clean-browser desktop, mobile, and short-landscape menu and Terms QA
passed. The exact deployed Pages SHA passed public asset/build-stamp and
redirect verification plus the unchanged auth-v2 bridge's read-only health,
discovery, JWKS, retired-v1, security-header, and CORS checks.

## Preserved boundaries

Alpha 0.3.3 does not:

- change backend protocol 3, the active realm seed, the 1,261 authoritative
  rows, the 100 castle slots, admission, ownership, castle coordinates, or
  Marks state; the only bounded data repair was sanitized public profile
  presentation for already founded players;
- publish a Maincloud schema, change the authentication Worker, enable public
  admission, or mutate production game data;
- connect or scan wallets, apply burn credits, enable Mark spending, install a
  scheduler, or change the Marks policy;
- add resources, construction, units, movement, combat, alliances, chat,
  seasons, or live castle warp.

## Residual risks and deferred operations

- The supplied 104-second source recording was not available in the repository
  or local attachment cache. Its documented interaction path is covered by
  state, rendering, responsive, and stress regressions, but new timestamped
  before/after frames could not be extracted.
- One-hundred-castle packing is synthetic. Representative desktop and mobile
  GPU memory, frame-time, device heat, and browser lifecycle measurements are
  still useful follow-up evidence. Packaged LOD texture cost varies by device
  and driver.
- Public PFP availability remains externally dependent. The neutral fallback is
  intentional; direct image hosts receive ordinary connection metadata even
  though the browser sends no referrer. The production profile source is
  code-pinned and owner-reviewed; each refresh still requires a bounded dry run,
  exact founded-set verification, and explicit production scope.
- No Worker, schema, admission, castle, world, wallet, Marks, scan, or burn
  mutation occurred. Public profile presentation fields were backfilled, and a
  schema-identical policy module was republished with data deletion disabled.

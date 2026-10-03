# 0.4 hardening audit — 3 October 2026

A bug, security and reliability review of the 0.4 critical path: the gameplay
rules, the owner-only PTR module, the PTR client, the authentication bridge,
the page and the shipped dependencies. The bar was what a dependable mobile
strategy game needs: no lost or duplicated progress, no authority leaks, and
sessions that survive ordinary phone conditions.

The review found and fixed two reliability defects in the PTR client. It
recorded five more observations for later work or owner decision, and found
no security defect in the reviewed code. Every fix has tests that fail on the
base and pass here.

Base: `release/0.4-living-realm-quality` at `a89173f9`.

## Findings

| ID | Finding | Severity | Status |
|---|---|---|---|
| H-01 | PTR access is refused when the phone's clock trails the bridge, and the lease runs early or late by the whole clock error | Medium: availability | Fixed |
| H-02 | A dropped PTR connection during play sends the player back to the main menu | Medium: reliability | Fixed |
| H-03 | Keep countdowns compare Realm deadlines with the phone's clock | Low: presentation | Deferred: needs a server time reference |
| H-04 | After a renewal reopens the keep, building and recall wait for a Return to world | Info | Intentional (2026-09-16 maintenance review); owner decision |
| H-05 | The PTR module's owner-claim check gives `iat` no leeway between the bridge's and the database host's clocks | Low | Deferred: needs a module publish |
| H-06 | G001 tokens use the same absolute-expiry pattern, softened by a 30-second refresh lead | Low | Deferred: G001 is frozen |
| H-07 | Every two minutes PTR lease renewal tears the session down and rebuilds the surface | Info: experience | Owner decision: the hard-expiry design is deliberate |

### H-01 — Device clock skew blocked PTR access (fixed)

`parsePtrJwt` compared the bridge-stamped `iat` with the phone's `Date.now()`
and allowed no tolerance. `iat` is whole seconds, issued a moment before the
response arrives. So a phone whose clock trails the bridge by more than the
transit time plus the sub-second remainder had every exchange rejected as
`invalid-response`, which the player saw as "access unavailable". A phone
running two seconds slow always failed.

Even when accepted, the 120-second lease was scheduled on the bridge's
absolute expiry. A slow clock kept using the token after the module had begun
rejecting it, by the full error. A fast clock lost the same amount of every
lease, and at two minutes or more ahead it was refused outright.

The fix is in `src/ptr/ptrRealmAuthClient.ts`:

- It tolerates up to 60 seconds of device lag, the main realm's existing
  `FARCASTER_OIDC_CLOCK_SKEW_TOLERANCE_MS`. A token the device clock already
  places past its signed expiry is still rejected, as before.
- The lease is bounded by what the device observed. The token was issued
  after the request left and before the response arrived. On the device clock
  its expiry therefore lies between `requestedAt + lease − 1 s` (the
  whole-second `iat`) and `receivedAt + lease`. A consistent clock keeps the
  signed expiry exactly, so existing behavior and tests are unchanged. A
  skewed clock takes the nearest bound.
- The credential is never sent without a usable device clock.

SpacetimeDB still checks expiry by its own clock on every protected call. The
client therefore never gains time; it only stops refusing or wasting valid
time. A trailing clock can use the token up to one second plus transit past
the bridge's expiry. That is the same order as the network race at any lease
edge, and far below the old error.

Tests (`tests/ptrRealmAuthClient.test.ts`, "device clock skew") cover:

- a consistent clock with a slow response;
- trailing clocks at 1 ms, 2.5 s and exactly 60 s;
- a clock trailing by more than 60 s;
- a leading clock, alone and with a slow response;
- a clock already past the signed expiry;
- a clock that steps back mid-request;
- an unusable clock.

Five of these fail against the base client.

### H-02 — A dropped connection ejected the player (fixed)

Backgrounding a phone, switching networks or a server restart drops the
WebSocket. `handleTransportFailure` cleared the continuation and published
`error`. `WarpkeepExperience` then unmounted the realm and returned to the
main menu, so the player had to re-enter from the realm picker. Lease expiry
already had a safe in-place path: retire the old authority, take a fresh
Quick Auth exchange, require the same FID, database and authorization epoch,
reconnect through preflight, and replay nothing. The open 0.4 acceptance item
"return/reconnect/background/resume without lost or duplicated progress"
needs the same treatment for a drop.

The fix is in `src/ptr/PtrRealmProvider.tsx`. A transport failure while
`ready` with an active continuation now takes that same expiry path, so the
player sees "Returning to your keep" and lands back on the same surface.

- **Rate limit:** automatic recovery runs at most once per
  `PTR_TRANSPORT_RECOVERY_INTERVAL_MILLISECONDS` (30 s). A sooner drop
  publishes `renewal-error` ("Connection interrupted", Retry or Return to
  Menu) and keeps the continuation, so a flapping transport or repeatedly
  malformed atlas data cannot loop.
- **Unchanged behavior:** a drop outside active play (no continuation) still
  fails closed to `error`, and a drop during renewal still ends in
  `renewal-error`.
- **Command safety:** an unconfirmed command still shows the existing "Review
  the latest keep state" notice after reconnection. Its envelope is never
  replayed.

Tests (`tests/PtrRealmProvider.test.tsx` and
`tests/WarpkeepExperiencePtrRealm.test.tsx`) cover:

- in-place reconnection with new authority and a new capability, with no
  mutation;
- a second drop inside the interval, which waits for Retry;
- recovery again after the interval;
- a drop without a continuation, which still fails closed;
- denial when the fresh authority changes the epoch;
- the outer experience reconnecting in place.

The previous experience test "revokes the mounted PTR surface and normalizes
history on transport failure" now asserts the new route: the surface and
authority are revoked immediately, the reconnection panel is shown, and
Return to Menu normalizes history to `#menu`. Six of these tests fail against
the base provider.

### H-03 — Keep countdowns use the phone's clock (deferred)

`estimatedTime04`, `constructionProgress04` and the steward's advice subtract
`Date.now()` from Realm-stamped deadlines. The world's journey walkers
(`greaterRealmJourneyLayer.update(Date.now())`) place Workers along their
captured routes the same way, clamped by the server-reported phase. With a
skewed phone the countdowns are labelled estimates and the five-second
authoritative poll still decides completion. Even so, a fast clock shows
"Awaiting Realm update" early and parks a walker at its site early, while a
slow clock overstates time left and makes walkers jump forward when the phase
changes.

The procedure transport discards the SDK's procedure timestamp, and the keep
read carries none. The clean fix is an `observedAtMicros` field on
`Gameplay04KeepStateV1`, in a future schema version with generated bindings,
with countdowns presented relative to it. A smaller interim option is to
expose the H-01 exchange window as an offset estimate.

### H-04 — Renewed keep entry waits for the world (intentional)

A renewal that restores the keep remounts the controller without an atlas
assertion. Building and recall stay disabled with "Return to world to refresh
the Realm…" until the world bootstrap supplies one. The 2026-09-16 maintenance
review and the local-operations evidence record this as an intentional
freshness gate. With 120-second leases a player who stays in the keep meets it
every two minutes.

If the owner wants it softened, the preflight bootstrap already fetched on
every reconnection carries the same `atlasId` and `revision`. Server binding
checks would still decide freshness.

### H-05 — No `iat` leeway between bridge and module clocks (deferred)

`readFreshPtrOwnerClaims` rejects `currentTime < session_iat` exactly. Admin
claims allow `PTR_ADMIN_IAT_SKEW_MICROS` (1 s). A connect that reaches the
database host within the same second as signing, while that host's clock
trails Cloudflare's, could be refused once. The risk is negligible with
NTP-synced hosts, but parity with the admin claims would remove it. Changing
it needs a module publish.

### H-06 — G001 absolute expiry (deferred)

`farcasterOidcSession.ts` already tolerates 60 s of lag. The provider
refreshes 30 s before the bridge's absolute expiry, which absorbs most skew.
A phone trailing by 30–60 s would refresh late. G001 is frozen, so the H-01
bounded lease belongs in its next reviewed window.

### H-07 — Renewal at expiry rebuilds the surface (owner decision)

The PTR lease renews when it expires. The old capability is retired, the
renewal panel replaces the realm, and the world scene or keep is rebuilt under
a new controller. With 120-second leases this happens every two minutes of
play and interrupts any in-flight command, which the notice then reports.
G001 instead refreshes 30 seconds before expiry.

Because a SpacetimeDB token is bound when its connection opens, renewal always
means a new connection. A make-before-break renewal could still fetch the next
authority and open its connection before the old lease ends, then hand the
surface over. It changes the deliberate hard-expiry design, so it is recorded
here rather than implemented.

## Reviewed and sound

These areas were read line by line or checked by targeted search, and no
defect was found.

- **Gameplay rules** (`spacetimedb/gameplay04`):
  - Exact enumerable-field inputs and u64/i64 bounds, with a revision
    overflow guard.
  - Idempotency by sequence plus a canonical-fingerprint receipt, with 128
    receipts retained and conflicts rejected.
  - Balances capped at 1,000,000, with overflow reported.
  - Journey derivation: recall during outbound returns the elapsed time;
    earnings use whole 10-second quanta.
  - One reservation per node, schedules and reservations reconciled against
    stored state, and inconsistent rows failing closed.
  - Placement checks for grid, rotation, support, reserved areas, overlap and
    duplicates.
  - Construction invariants (revision equals level, project and schedule
    consistency, cost and duration recomputed from policy).
- **PTR module** (`spacetimedb/ptr/src`):
  - Connections require fresh administrator claims, or owner claims that
    match the single enabled owner anchor and epoch, and empty
    player-population tables.
  - All 31 tables are private.
  - Every owner procedure, including the five atlas reads, rechecks claims
    and the database identity.
  - The scheduled reducer rejects any caller but the database identity, and
    revalidates its row against current state before reconciling.
- **PTR client:**
  - Wire state is decoded into closed records without invoking getters, then
    every derived value is recomputed with the server's own policy.
  - Receipts must describe the captured request.
  - Unknown outcomes keep the exact envelope for an explicit retry, under a
    30-second response deadline.
  - Request nonces come from `crypto.getRandomValues`.
  - The bearer is held in a module `WeakMap`, never in React state.
  - Bridge responses are read with a size bound and zeroed after parsing.
- **Authentication bridge:**
  - Exact origin allowlists for CORS.
  - Exact-key JSON bodies, bounded reads with an 8-second deadline.
  - `default-src 'none'`, HSTS, COOP, CORP, `nosniff` and `DENY` framing on
    every response.
  - Rate limits.
  - The PTR exchange's Quick Auth claims are rechecked at verification,
    signing and completion, with a constant-time owner comparison and a
    live-admission check.
- **Page and client hygiene:**
  - No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function` in
    shipped code; one `innerHTML` assignment exists in a development QA
    harness.
  - A strict meta CSP: no inline script, an explicit `connect-src` and
    `object-src 'none'`. The `'unsafe-eval'` exception is the documented
    SpacetimeDB 2.6.1 requirement.
  - `no-referrer`.
  - A root error boundary that neither renders nor forwards error data.
  - WebGL context loss handled on all five 3D surfaces (title, menu, keep,
    Greater Realm world and G001 realm), with restore on all but the title,
    and the keep frame loop failing closed to the schematic.
  - Listeners, intervals and animation frames all released on cleanup.
  - Sound suspended while hidden and resumed only by a trusted gesture.
- **Dependencies (3 October 2026):**
  - `npm audit` over the root lockfile (344 packages): 0 advisories.
  - The four pnpm lockfiles queried against the npm bulk advisory endpoint:
    0 advisories. They cover the bridge (204 packages), release recovery
    (187), `spacetimedb` (41) and `spacetimedb/ptr` (41).

Residual risks already in the [threat model](../../security/threat-model.md)
are unchanged:

- the CSP `'unsafe-eval'` exception;
- GitHub Pages cannot send `frame-ancestors`;
- XSS acting with a live in-memory token.

The threat model now also describes the owner-only PTR controls, which it did
not mention before.

## Integration route

- No schema, reducer, generated binding, G001 or release-manifest change.
- `src/ptr/ptrRealmAuthClient.ts` and `src/ptr/PtrRealmProvider.tsx` are
  members of the prepared deploy closure with raw-file SHA-256 pins.
  - The manifest's pins equal the base bytes, so both entries are stale here:
    - `ptrRealmAuthClient.ts`: `75534b2e…` at base, `6b27d6d5…` on the branch.
    - `PtrRealmProvider.tsx`: `5071443c…` at base, `fb55e484…` on the branch.
  - They must be regenerated in
    `scripts/auth-bridge-notification-prepared-deploy-closure-v1.json` by the
    native reprojection, Codex's procedure, not edited by hand.
  - The native policy verifier refuses this Windows checkout
    (`AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_REPOSITORY_INVALID`) on the base and
    the branch alike, so the stale pins could not be observed locally. No
    Windows closure suite changed outcome against the base.

## Verification

These are Windows 11 results under Node 24.19, not the pinned 22.22.

- **Types:** `npm run typecheck` and `tsc -p tsconfig.app.json --noEmit`
  (application and tests) both exit 0.
- **PTR and experience suites:** the ten files that import the changed
  modules pass 382/382:
  - the auth client, provider, connection, capability, transport and
    surface host suites;
  - `Keep04SceneHost`;
  - the three `WarpkeepExperience` suites.
- **Stability:** the three changed suites pass 95/95 in three consecutive
  runs. The experience suite passes 20/20 twice while the closure suites run
  alongside it.
- **Tests catch the bugs:** the new tests fail on the base code, five for the
  auth client and six for the provider and experience.
- **Base comparison** (`a89173f9` worktree, same machine, 24 files: the ten
  above plus the 14 closure suites):

  | Run | Passed | Failed | Skipped | Total |
  |---|---|---|---|---|
  | Base | 610 | 82 | 23 | 715 |
  | Branch | 627 | 79 | 23 | 729 |

  - No test changed from pass to fail.
  - The fourteen new tests pass.
  - Three closure tests that failed on the base under concurrent load also
    pass on the base when rerun alone.
  - The other 79 failures are identical, environmental Windows failures.
- **Build:** `DEPLOY_BASE=/ptr/ npm run build` passes, including its asset,
  public-boundary and Mini App checks.
- **Verifiers:** `verify:file-sizes`, `verify:licenses`,
  `verify:atlas-public-boundary` and `verify:visual-foundation` pass.
- **Not run:** the full root suite was stopped after about 4,300 of its
  roughly 13,000 tests, because on this machine it needs several hours.

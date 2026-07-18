# Warpkeep closed-alpha activation and recovery runbook

This runbook preserves the Alpha 0.2 and Alpha 0.3.1 recovery records and carries
their approval boundaries forward to the current protocol-3 realm.

> **Alpha 0.3.8 is live on backend protocol 3.** The additive schema was
> published to the existing Maincloud database with deletion prohibited, the
> deterministic 10,000-cell Genesis world and 100 close-outward castle slots are
> live, deliberately admitted founders received their permanent castles and
> private resource accounts, and public shared auth and realm entry are enabled.
> Exact founder counts and identities remain in the private operational record.
> These observations are bound to the privately
> recorded deployment and verification coordinates; they do not authorize any
> later change.

## Historical activation record

Recorded Alpha 0.2 coordinates previously passed discovery/JWKS, distributed
rate control, the raw admin epoch lookup, non-destructive module publish, and
protected aggregate inspection at 61 world tiles with empty admission/player/
castle state. Those observations apply only to their recorded deployed heads.
The later v2 paused checkpoint and enabled owner canary are recorded separately
and are likewise not evidence that an arbitrary checkout, frontend build, or
public-auth state is live.

## Safety invariants

- Preserve `_github-pages-challenge-ael-dev3.warpkeep.com` exactly as supplied
  by GitHub; do not change DNS during an auth-only rollout without separate
  approval.
- Never permit data deletion. A module publish must use `--delete-data=never`;
  never use `--delete-data=always`, `--delete-data=on-conflict`,
  `--break-clients`, database recreation, a schema rollback, or an activation
  FID. Leave additive v2 tables inert if containment is required.
- Inspect aggregate state read-only before and after any approved publish. Stop
  on unexpected state; do not erase or auto-repair it.
- Keep secrets out of the repository, `VITE_` variables, command arguments,
  shell history, logs, screenshots, HAR files, and support bundles.
- Keep Worker public auth and frontend shared-alpha access false through module,
  migration, secret, Worker, and frontend staging.
- Treat every approval below as single-purpose. Approval for additive module
  publication does not approve the Durable Object migration, a secret change,
  deploy, or enable.

## Historical mandatory v2 rollout order and approval gates

The Alpha 0.3.1 rollout was staged and sequential. The reviewed SpacetimeDB
change is an additive migration: it freezes the deployed five-table prefix and
appends a versioned public/private player pair. The later Durable Object
migration is a different additive change with its own approval:

1. **Local verification only:** verify module/Worker/browser tests, generated
   bindings, dependency locks, and documentation. No cloud login or mutation.
2. **Module gate:** obtain explicit approval for read-only Maincloud inspection.
   The protected aggregate must match the empty-alpha baseline, with exactly zero
   legacy `player` rows; any nonzero value is a hard stop requiring a separate
   reconciliation plan. Then request the separate approval phrase
   `approve additive protocol-v2 module publication`. No other approval wording
   authorizes the guarded publish. Verify protocol 2, the appended v2 pair,
   private ownership isolation, and the structured resolver before moving on.
3. **Durable Object gate:** obtain separate approval for the additive
   `SessionFamily` SQLite Durable Object binding/migration. Never delete or
   rename existing challenge/rate-limit classes as part of this step.
4. **Secret gate:** obtain separate approval to configure an independent,
   high-entropy `SESSION_COOKIE_KEY` and any other required managed secrets.
   Never reuse `ADMIN_TOKEN_SECRET` or `SIGNING_KEY_JWK` material.
5. **Worker gate:** obtain separate approval to deploy the exact v2 Worker with
   `PUBLIC_AUTH_ENABLED=false`. Verify discovery/JWKS, retired public v1 routes,
   structured resolver probe, cookie attributes, and config attestation.
6. **Frontend gate:** obtain separate approval to deploy the exact v2 frontend
   while `VITE_WARPKEEP_SHARED_ALPHA_ENABLED=false`.
7. **Enable gate:** after exact-head hosted paused verification, exercise the
   recorded final authority in strict order: enable the Worker, pass its public
   and private enabled checks, enable/deploy the exact frontend, then perform
   immediate owner QA. Alpha 0.3.1 completed that sequence. Its authority is not
   reusable for a later change.

If any stage fails or disagrees, stop and keep both switches false. Do not remove
the additive v2 tables or restore a v1 module: leave the tables inert and use a
separately reviewed forward fix.

For current protocol-3 recovery, preserve those authority boundaries but use a
fresh privacy-safe founded aggregate matched to the private current-state
record. The historical empty-alpha values are not current expectations.

## Protocol-v3 founding checkpoints

Alpha 0.3.2 added a read-only, counts-only checkpoint for the interval after
each separately approved atomic founding action. During the historical
contained rollout, before wallet snapshots, scans, player login, or Terms
acceptance, both production switches were disabled and attested; that paused
profile used:

```sh
npm run verify:alpha-production -- \
  --require-auth-v2 \
  --require-genesis-v3-founded-aggregate \
  --expected-founder-count=N
```

`--require-auth-v2` explicitly requires the paused/contained profile. For an
additional founding action against the currently enabled production profile,
the private Keychain wrapper must instead supply the Hermes credential in
memory and invoke:

```sh
npm run verify:alpha-production -- \
  --require-auth-v2-enabled \
  --require-genesis-v3-founded-aggregate \
  --expected-founder-count=N \
  --expected-player-count=P \
  --expected-terms-acceptance-count=T
```

The verifier does not auto-detect or silently substitute these profiles. Using
the wrong flag is a hard stop.

`N` must be the canonical founder count `1..100` from the reviewed private
record. During the historical contained checkpoint, the stage required the
exact seeded world and static sidecars; exactly `N` occupied cells, claims,
castles, profiles, Mark accounts, allowed rows, and enabled rows; zero pre-login
and operator state; and all protocol-v3 integrity counters at zero. In current
enabled production, `P` and `T` must be the separately reviewed current player
and Terms-acceptance counts (`0..N`); omitting them silently means zero and must
not be used when the private aggregate records nonzero values. The verifier
accepts and prints no FID. Consequently, it does not by itself prove which FIDs
were admitted or that their claims use the first `N` nearest slots; retain those
checks in the private founding plan and reducer evidence. Any mismatch stops
rollout before another founding action.

### Durable profiled admission boundary

The checked-out module adds `admin_admit_founder_v1` as the only first-time
founding path. It combines admission, permanent close-outward castle founding,
the complete founder/resource graph, and the reviewed trusted Farcaster public
profile in one database transaction. The module normalizes the profile before
any write and requires both a canonical username and a valid HTTPS PFP URL;
display name and public bio remain optional. Any failed profile or graph
postcondition aborts the whole transition.

`admin_allow_fid` is now legacy compatibility for idempotence or re-enabling an
already complete founder/resource/profile graph. It must reject a missing FID
and must not be used as a fallback when required profile data is unavailable.

Founding does not create player authority. No administrator may insert or
pre-bind `player_ownership_v2`: ownership is created only when the admitted
player genuinely authenticates and `bootstrap_player_v2` binds the verified FID
to that exact SpacetimeDB sender. Admission verification therefore proves the
castle and public profile exist, while control verification additionally
requires the caller-bound player/ownership pair. Future gameplay reducers must
resolve the acting castle from that authenticated pair and must not accept an
authority-selecting FID, castle, or owner argument.

The only incomplete-profile recovery path is the exact-admin
`admin_upsert_realm_profile_v1` reducer. It may repair a structurally valid
existing founder only when the reviewed intended username-and-PFP projection is
complete and normalizes successfully; it cannot create, move, or reassign
founder state. The profile operator may plan that repair only when current
authoritative data supplies every missing or invalid required field. A required
field already valid in the persisted row may retain its sanitized reviewed
last-known-good value if that one response is unavailable or incomplete; an
authoritative clear still stops. A fully blank row needs both current fields.
Player status/bootstrap, gameplay, and legacy `admin_allow_fid` remain blocked
until the profile is complete.

The new admission wire and all tightened profile-completeness/recovery behavior
in this checkout are not an attested change to the live Alpha 0.3.8 module.
Making them available on Maincloud requires a fresh, explicit approval for the
reviewed module publication, with data deletion prohibited and the exact
current founded/resource aggregate checked before and after. Approval to admit
a founder does not approve publication, and publication does not approve any
admission or profile mutation. Until that publication has a successful private
receipt, operators must not assume the wire or tightened behavior exists in
production.

The matching local operator uses a two-step private reviewed plan. Its target
database must be configured as the compiled immutable production identity, not
the mutable database name. The dry run accepts only this exact stdin envelope:

```json
{"founderAdmission":{"fid":"<decimal-fid>","note":"<private-audit-note>","profileSourceUseApproval":"approved-for-this-founder-admission-v1"}}
```

The exact approval phrase authorizes only the bounded public-profile lookup for
the FID in that private plan. It does not authorize module publication,
admission, or any other mutation, and the older transport-provenance scope is
not reused as per-founder authority. Keep the envelope in an owner-only `0600`
file outside the repository. The dry run must name the immutable production
database identity explicitly:

```sh
WARPKEEP_SPACETIMEDB_DATABASE=<immutable-production-database-identity> \
npm run stdb:admit-founder -- --input-stdin --dry-run < /owner-only/path/request.json
```

The operator resolves the pinned public profile exactly once, requires username
and PFP, and writes a 30-minute `0600` plan under the owner-only local Warpkeep
support directory. Standard output contains only readiness counts, expiry, and
the safe filename/content-digest reference—not the FID, note, or profile values.

After private review, confirmation accepts only:

```json
{"reviewedAdmissionPlan":{"filename":"<safe-plan-filename>","sha256":"<content-digest>"}}
```

Pass that envelope through the private Keychain wrapper with the immutable
database identity, canonical Maincloud URI and auth bridge, and the Hermes
secret already present in parent-process memory:

```sh
WARPKEEP_SPACETIMEDB_DATABASE=<immutable-production-database-identity> \
npm run stdb:admit-founder -- --input-stdin --confirm < /owner-only/path/plan-reference.json
```

Because stdin is reserved for the plan reference, the wrapper must leave
`WARPKEEP_ADMIN_TOKEN_SECRET_STDIN` unset and supply the secret through the
existing Keychain-backed environment path, never a second stdin payload. The
confirmed step never refetches the profile, validates target/source/policy and
expiry before credential access, verifies exact counts-only v3/v4 capacity and
resource preconditions, and only then creates a one-use local claim immediately
before submission. It verifies the exact aggregate transition afterward. Any
failure after the one-use claim—including a timeout, transport disconnect, or
unavailable/failed postcondition—consumes the plan and may be ambiguous; inspect
fresh bounded v3/v4 aggregates before creating or submitting another plan. A
final transport disconnect is best-effort after verified postconditions and
cannot turn a known successful transition into a failed result. Neither step
publishes the module, and the legacy noninteractive switch cannot approve this
mutation.

## 1. Domain and public coordinates

The historical public coordinates are:

```txt
frontend: https://warpkeep.com/
issuer: https://auth.warpkeep.com
database service: https://maincloud.spacetimedb.com
database: warpkeep-89e4u
audience: warpkeep-spacetimedb
```

Confirm DNS/TLS and GitHub Pages source only through read-only checks unless a
separate DNS/Pages approval exists. Do not infer the deployed source SHA from a
healthy hostname.

## 2. Protocol-v2 module gate

The repository proof freezes the production-v1 definitions and ordering of
`allowed_fid`, `world_tile`, public `player`, `castle`, and `admin_audit`, then
uses the pinned SpacetimeDB 2.6.1 CLI against an in-memory loopback server. It
proves those five table descriptions remain unchanged while public `player_v2`
and private `player_ownership_v2` are appended, the 61-tile empty fixture remains
empty, a synthetic nonempty legacy row is preserved, a second publish is
idempotent, partial state is detected, and guarded v1 rollback is refused before
any schema change.
That command is repository-only compatibility evidence. The separately
approved production checkpoint published the same guarded additive contract to
the existing database with `--delete-data=never`; only the recorded identity,
aggregate, and post-publish probes attest that publication.

The legacy public `player` table remains byte-compatible, including its opaque
Identity column, and is frozen and inert: protocol-v2 authorization, bootstrap,
subscriptions, snapshots, and observers use only the v2 pair, and no v2 path may
write a legacy row. Because the legacy table must remain public for compatibility,
an arbitrary old client can technically request it. The approved production path
therefore requires it to remain empty; this release does not claim that retaining
the schema makes legacy Identity rows private.

Before any publish, inspect the production-v1 database read-only using its
existing protected `admin_get_alpha_status` procedure. It must report exactly 61
world tiles and zero players, castles, allowlist rows, and enabled allowlist rows.
At this gate its `players` field is the legacy `player` count: any value other
than exactly zero is an unconditional hard stop. An enabled epoch-zero allowlist
row also fails closed and requires a separate migration decision. Never copy,
repair, delete, or reconcile production rows during this gate.

Immediately after an approved additive publish, use the new protected
`admin_get_alpha_status_v2` aggregate to recheck the same empty-alpha baseline
and require:

- `legacyPlayers = 0`;
- `playersV2 = 0`, `playerOwnershipsV2 = 0`, and
  `consistentPlayerPairsV2 = 0`;
- `orphanedPlayerRowsV2 = 0` and `orphanedOwnershipRowsV2 = 0`;
- protocol `2` and the reviewed world generation.

Both aggregates expose counts only; they must not expose FIDs, Identities,
profiles, notes, ownership contents, audit contents, or credentials. A nonzero
legacy, orphan, v2, castle, or admission count blocks every later rollout stage.

The guarded publisher must retain `--delete-data=never`, must not request or
interactively approve `--break-clients`, and must not recreate the database. If
local or read-only preflight cannot accept the additive module under those
conditions, stop and prepare a separately reviewed forward fix; do not weaken the
guard or attempt a v1 schema rollback.

The historical first-publish authority was
`approve additive protocol-v2 module publication`. That authority is exhausted,
and the old invocation below is intentionally no longer accepted by the current
publisher because it has no founded-state expectations:

```sh
WARPKEEP_OIDC_ISSUER=https://auth.warpkeep.com \
WARPKEEP_PUBLISH_CONFIRM=warpkeep-89e4u \
npm run stdb:publish:dev
```

For any current protocol-3 forward republish, obtain fresh approval and use the
private Keychain wrapper with all three counts-only expectations supplied
explicitly, including zeroes:

```sh
WARPKEEP_OIDC_ISSUER=https://auth.warpkeep.com \
WARPKEEP_PUBLISH_CONFIRM=warpkeep-89e4u \
WARPKEEP_EXPECTED_FOUNDER_COUNT=<reviewed-current-founder-count> \
WARPKEEP_EXPECTED_PLAYER_COUNT=<reviewed-current-player-count> \
WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT=<reviewed-current-terms-count> \
npm run stdb:publish:dev -- \
  --resource-rollout-stage=<prebackfill-or-ready> \
  --genesis-world-stage=<pre-expansion-or-expanded>
```

Both rollout stages are mandatory. Use resource stage `prebackfill` only for
the first additive resource-module publication, when no resource rows exist.
Use `ready` only after the separately approved backfill has been independently
verified. A ready-state republish proves the exact v4 ready aggregate both
before and after publication; a pre-backfill publication proves the exact
empty-resource v4 aggregate immediately afterward. Omitting or guessing the
stage fails before publication. Use world stage `pre-expansion` only while the
exact 1,261-cell generation-two predecessor remains; use `expanded` only after
the separately approved 10,000-cell transition passes its independent
checkpoint. The publisher never infers one lifecycle from the other.

The wrapper supplies the Hermes credential only in parent memory. The publisher
passes it to the protected inspection child over stdin and forwards neither the
secret nor the three expected counts in child arguments or environment. It
attests the exact reviewed CLI binary, repeats the current loopback migration
proof, verifies the canonical existing database name-to-identity mapping, and
invokes `admin_get_alpha_status_v3` against that immutable identity. The result
must match the exact founder/player/ownership/Terms graph and every zero
orphan/drift/invariant counter before publication. Its player orphan counters
also reject otherwise paired player/ownership rows that have no admitted FID.
The historical first v2
publication used the then-deployed v1 aggregate; that weaker shape is not a
valid current pre-publication gate.

The proof emits one SHA-256 receipt. The publisher accepts only the exact
absolute `bundle.js` it just proved, rechecks that digest immediately before
spawning `spacetime publish --js-path`, and never rebuilds between proof and
publish. Unknown flags, malformed expectations, stale counts, changed artifact
bytes, wrong coordinates, and compatibility prompts all fail before
publication.

The publish must remain non-destructive (`--delete-data=never`). If the command
times out, the outcome is indeterminate: inspect read-only before any retry.
Never seed, admit, disable, or bump an epoch as part of the publish gate.

For the historical v2 checkpoint, the exact module contract was:

- backend protocol is `2`;
- player JWTs require `auth_version: 2`, `auth_epoch >= 1`, and a maximum
  600-second custom session, with FID but no optional profile claims;
- lifecycle admission accepts only current players, fresh exact Hermes admins,
  or the exact fresh resolver principal required before its HTTP procedure;
- the frozen legacy public `player` table remains unchanged and empty, while
  public `player_v2` contains no opaque OIDC Identity;
- private `player_ownership_v2` has no browser query/subscription accessor, and
  partial/mismatched v2 ownership state fails closed;
- the active browser subscribes to `player_v2` and never legacy `player`;
- bootstrap ignores optional profile-shaped JWT claims and inserts undefined
  `username`, `displayName`, and `pfpUrl` fields;
- `auth_resolver_get_fid_admission_v2` returns exact structured
  missing/disabled/enabled state and epoch rules;
- the Worker issues resolver authority for 15 seconds with exact
  `sub: service:auth-epoch-resolver` and sole role
  `warpkeep-auth-epoch-resolver`, bound by exact `resolver_fid` to the one
  procedure argument; the module rejects windows over 60 seconds.

The current production state is expanded. Every later republish must retain
backend protocol `3`, the exact 10,000-cell generation-three aggregate, every
inherited table reference and appended visibility contract, and the exact
founded/resource-ready state. The 1,261-cell generation-two contract remains
only a predecessor and recovery boundary.
The publisher requires that world stage explicitly and repeats the matching
aggregate after a successful publish. If this post-publish read fails, the
outcome is indeterminate: stop and establish state through a fresh read-only
inspection before making any further publication decision.

### Completed Alpha 0.3.8 resource-module rollout record

Alpha 0.3.8 published the additive resource table and procedure, then backfilled
founders under a second approval. Those completed approvals are not reusable:
any future publication or resource mutation requires fresh, explicit owner
approval. The procedure below is retained as rollout and recovery evidence, not
as authority to replay a production mutation.

Before an approved resource-module publish, keep using the exact founded
protocol-v3 checkpoint above. `admin_get_alpha_status_v4` does not exist before
the additive publish, so a v4 pre-publication probe is neither required nor
permitted as a substitute. After `spacetime publish` returns success, the
guarded publisher first repeats the founded v3 inspection and then, before any
backfill, invokes this read-only child internally:

```sh
tsx scripts/hermes-admin.ts inspect-alpha-v4 --json
```

The publisher pins the immutable production database identity and canonical
Maincloud/bridge origins, passes the Hermes credential only over stdin, uses an
exact four-variable child environment, and hard-bounds time and output. The v4
result may contain only counts and version strings. For reviewed founder count
`N`, it must report exactly:

- `allowedFids = castles = markAccounts = N`;
- `resourceAccounts = 0` and `missingResourceAccounts = N`;
- `orphanedResourceAccounts = 0` and `resourceInvariantViolations = 0`;
- backend `protocolVersion = 3`; and
- `resourcePolicyVersion = genesis-resource-yield-v1`.

Any missing, extra, identity-shaped, balance-shaped, noncanonical, or mismatched
field fails closed. Because publication has already returned success at this
point, either post-publication inspection failure is an indeterminate state:
stop, do not backfill, and establish state through a fresh bounded read-only
inspection before making any further publication decision. The operator must
not infer that retrying publication is safe.

```sh
npm run stdb:publish:dev -- --dry-run \
  --resource-rollout-stage=prebackfill \
  --genesis-world-stage=pre-expansion
```

This remains non-mutating for the first publication plan. Use `ready` instead when
rehearsing an already-backfilled republish, and `expanded` instead only after
the world transition is independently verified. A dry run performs only
the bounded issuer check plus local CLI/artifact/migration/expectation proof;
it does not publish, invoke the post-publish v4 procedure, or backfill rows.

The separately approved durable backfill named the immutable database identity
explicitly. The human-readable database name and an omitted database value are
rejected before Hermes requests a token:

```sh
WARPKEEP_SPACETIMEDB_DATABASE=c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e \
npm run stdb:backfill-resources -- N --confirm
```

The private Keychain wrapper supplies the canonical Maincloud/bridge values and
the Hermes credential; the command line carries no secret. Publication approval
does not authorize this backfill, and backfill approval does not authorize a
later republish.

### Completed Alpha 0.3.8 generation-three rollout record

Publishing the reducer did not authorize the persistent world mutation. After
the additive module existed and a fresh read-only checkpoint proved the exact
1,261-cell generation-two founded state, the separately approved operator was:

```sh
WARPKEEP_SPACETIMEDB_DATABASE=<immutable-production-database-identity> \
npm run stdb:expand-world-v3 -- --confirm
```

The private Keychain wrapper supplies the canonical Maincloud and bridge
coordinates plus the Hermes credential in parent memory. The operator rejects
the human-readable database name, requires a visible command-line confirmation,
and does not accept the legacy noninteractive bypass. It reads and verifies the
complete counts-only v3 checkpoint, invokes the exact-CAS reducer with
`1261 / 1261 / generation 2`, then requires `10000 / 10000` plus every dynamic
count unchanged and exactly one new audit row. A timeout or postcondition
failure is indeterminate: stop and perform a fresh bounded read-only inspection
before considering any retry. A v4 checkpoint also requires either the exact
pre-backfill or exact resource-ready aggregate and proves all private resource
account counts and policy fields unchanged across the world transaction.

An exact target retry exists at the reducer layer only for recovery proof. The
guarded operator deliberately refuses to invoke it when the read-only
precondition already reports generation three. Module publication, resource
backfill, world expansion, and Pages deployment are four separate approval
boundaries.

### Completed Alpha 0.3.8 post-backfill readiness record

After the separately approved resource backfill returned, the rollout did not
rely on the mutation command's result as its only evidence. The private Keychain
wrapper supplied the Hermes credential in memory and ran this independent,
read-only checkpoint with the separately reviewed current counts:

The final Alpha 0.3.8 combined-release checkpoint is:

```sh
npm run verify:alpha-production -- \
  --require-auth-v2-enabled \
  --require-genesis-generation-v3-founded-aggregate \
  --require-resource-v4-ready-aggregate \
  --expected-founder-count=N \
  --expected-player-count=P \
  --expected-terms-acceptance-count=T
```

The immediate post-backfill predecessor-world read used
`--require-genesis-v3-founded-aggregate`. After expansion, the final checkpoint
used `--require-genesis-generation-v3-founded-aggregate`. Never claim final
release readiness from a predecessor-world resource check.

The v4 flag is invalid without the founded protocol-v3 gate and all three
explicit expectations. The verifier constructs and validates one exact
four-variable child environment, then reuses the same bounded child options for
both `inspect-alpha-v3 --json` and `inspect-alpha-v4 --json`. Both inspections
therefore use the same stdin-only credential, canonical Maincloud URI,
immutable production database identity, canonical bridge, 30-second hard
timeout, and one-megabyte output limit. Ambient URI, mutable or human-readable
database, and noncanonical-bridge remaps fail before either aggregate child
starts. It does not call a reducer or mutate database state.

For founder count `N`, the v4 result must contain only the exact counts-only
contract and report:

- `allowedFids = castles = markAccounts = resourceAccounts = N`;
- `missingResourceAccounts = orphanedResourceAccounts = 0`;
- `resourceInvariantViolations = 0`;
- backend `protocolVersion = 3`; and
- `resourcePolicyVersion = genesis-resource-yield-v1`.

Missing, extra, identity-shaped, balance-shaped, noncanonical, or mismatched
fields fail closed, and child output is never mirrored. A failure leaves the
post-backfill outcome indeterminate: stop all further mutations and establish
state through a fresh bounded read-only inspection. Do not retry the backfill
on the assumption that it failed.

`admin_get_fid_auth_epoch` remains admin-only rollback compatibility. Do not
configure new v2 issuance or refresh to use it.

## 3. Durable Object migration and secret gate

The v2 Worker requires three SQLite Durable Object bindings:

```txt
CHALLENGE_REPLAY_GUARD -> ChallengeReplayGuard
AUTH_RATE_LIMITER      -> AuthRateLimiter
SESSION_FAMILIES       -> SessionFamily
```

The `SessionFamily` class is an additive migration and requires its own explicit
approval. Confirm migration tag/order and recovery manifest before deployment.
Do not remove existing classes or storage.

Required managed Worker secrets are:

```txt
SIGNING_KEY_JWK
ADMIN_TOKEN_SECRET
SESSION_COOKIE_KEY
FARCASTER_RPC_URL
```

`SESSION_COOKIE_KEY` is a separate high-entropy HMAC secret. Do not derive it
from, rotate it implicitly with, or reuse the signing/admin secrets. The admin
secret must also differ from the signing JWK private `d` scalar: all three
secret materials are pairwise distinct. Configure or rotate any secret only
with explicit approval and non-logging handoff. This runbook contains no secret
value. The private Alpha 0.3.1 audit records successful independent session-key
configuration with the value suppressed; every future configuration or rotation
requires fresh authority.

## 4. Worker staging with public auth false

An approved Worker deployment must retain:

```txt
PUBLIC_AUTH_ENABLED=false
```

The local v2 public routes are `/v2/farcaster/challenge`,
`/v2/farcaster/exchange`, `/v2/session/refresh`, and `/v2/session/logout`.
Legacy public `/v1/farcaster/challenge` and `/v1/farcaster/exchange` must return
`410 legacy_auth_retired` and never mint a token. Admin `/v1` paths are a
separate server-only namespace and are not public-v1 fallback.

For each admission resolution the Worker uses:

```txt
POST https://maincloud.spacetimedb.com/v1/database/warpkeep-89e4u/call/auth_resolver_get_fid_admission_v2
Authorization: Bearer <Worker-minted 15-second resolver-only JWT>
Content-Type: application/json
Accept: application/json
body: [<verified safe-integer fid>]
```

The resolver JWT must have exact `sub: service:auth-epoch-resolver` and exactly
`roles: [warpkeep-auth-epoch-resolver]`, plus exact `resolver_fid` equal to the
positional argument; the module retains a 60-second rejection ceiling. The HTTP
SATS-JSON response must be exactly `[state, authEpoch]`, with epoch zero only for
missing/disabled and a positive epoch for enabled. The Worker normalizes it to
internal `{ state, authEpoch }`. A FID-binding mismatch, redirect, timeout,
status, media, size, JSON, or invariant failure is
`503 authorization_unavailable` and yields no access token.

Because SpacetimeDB runs `clientConnected` before HTTP procedures, this exact
fresh resolver also passes lifecycle admission. The 15-second production window
bounds connection initiation, not an accepted WebSocket's lifetime: public-table
subscriptions opened while fresh may persist until transport disconnect. Static
`get_alpha_backend_info` is callable only while fresh, protected calls recheck
expiry, and the resolver cannot read private tables, bootstrap or mutate as a
player, or pass Hermes/admin guards.

In production the Worker refuses any resolver target other than exact
`https://maincloud.spacetimedb.com` and database `warpkeep-89e4u`. Only an
explicit `ENVIRONMENT=development` profile may configure a different local/test
origin or database; development flexibility is not a production fallback.

## 5. Session and cookie checks

An enabled result may yield only a maximum-600-second access token with exact
`auth_version: 2` and positive epoch. The browser keeps it in JavaScript memory
only. The exchange request, session-family record, response identity, and JWT
carry the verified FID only; optional profile fields are rejected. Missing
admission creates a pending session with no access token and no SpacetimeDB
connection. Disabled admission creates neither.

The continuity cookie must be exactly host-only
`__Host-warpkeep_session; Secure; HttpOnly; SameSite=Strict; Path=/`. A
remembered family has a maximum 30-day absolute lifetime. **Keep me signed in on
this device** defaults false, so the cookie is non-persistent unless the user
opts in; the server family remains absolutely bounded at 30 days either way.
Refresh rotates the generation. Bound epoch mismatch/missing/disabled,
expiry/origin disagreement, and stale replay revoke the family; only the
immediately previous generation has a bounded lost-response recovery grace.

Successful logout confirms server-side revocation, expires the cookie, clears
browser bearer state, and closes the database connection. If durable revocation
fails, the bridge returns generic `503` and still expires the current browser
cookie. Do not report that family as revoked: a separately copied cookie may
remain usable after storage recovery until the bounded family expires.

Sign-out first records a non-secret, base-path-scoped `logout-v1:<timestamp>`
tombstone with a 30-day maximum. It contains no FID, token, proof, cookie,
family identifier, or profile data and blocks every cookie-refresh entry point
across reloads/tabs until an explicit Terms-gated auth activation clears it
early. Malformed or unavailable storage fails closed. If the tombstone write is
denied and server revocation also fails, a later storage-enabled context cannot
discover the missing marker and may
resume a copied cookie; record that combined condition as residual risk.

## 6. Configuration attestation

After an explicitly approved paused Worker deploy, an authorized operator may
call the server-only, zero-body `/v1/admin/config-attestation`. It must return:

```json
{
  "profile": "warpkeep-auth-v2",
  "digest": "<reviewed SHA-256 digest>",
  "publicAuthEnabled": false,
  "qaObserverEnabled": false,
  "qaObserverSpacetimeDbUri": null,
  "qaObserverSpacetimeDbDatabase": null,
  "qaObserverAudience": null,
  "qaObserverKeyFingerprint": null,
  "qaObserverKeyRegisteredAt": null,
  "qaObserverKeyExpiresAt": null,
  "qaObserverMaxRegistrationLifetimeMilliseconds": 31622400000
}
```

The three observer-target fields must either all be null or match the separately
reviewed tuple. In production, the observer origin is pinned to exact
`https://maincloud.spacetimedb.com`; its database and audience must both differ
from gameplay. A configured tuple does not prove that its target is
identity-free, so the QA gate remains false until that module/database or
replica has been independently reviewed.

The QA fingerprint, registration timestamp, and expiry may be non-null only as
one tuple after their separately approved machine-enrollment step; the QA gate
still remains false during the paused deployment. Never copy the fingerprint
into public release evidence.

Compare the digest with the reviewed expected issuer, origin/SIWF coordinates,
audience, key ID, gameplay Maincloud/database coordinates, dedicated observer
Maincloud/database/audience coordinates, S256 binding, 600-second access
lifetime, 15-second resolver lifetime, five-second resolver timeout,
five-minute challenge lifetime, 30-day family lifetime, cookie attributes,
environment, false public-auth state, independent QA gate, registered QA
fingerprint, registration/expiry timestamps, maximum registration lifetime,
one-minute QA challenge, 15-second QA resolver, and fixed snapshot procedure.
Never print the admin credential. A mismatch blocks frontend deployment and all
enablement.

The protected resolver probe must exercise the structured v2 resolver without
returning an epoch/FID/JWT/upstream body. Discovery must advertise
`auth_version`; JWKS must expose only the public key.

## 7. Frontend staging and activation

An approved v2 frontend deployment must retain:

```txt
VITE_WARPKEEP_SHARED_ALPHA_ENABLED=false
VITE_WARPKEEP_AUTH_BRIDGE_URL=https://auth.warpkeep.com
VITE_WARPKEEP_OIDC_ISSUER=https://auth.warpkeep.com
VITE_WARPKEEP_OIDC_AUDIENCE=warpkeep-spacetimedb
VITE_SPACETIMEDB_URI=https://maincloud.spacetimedb.com
VITE_SPACETIMEDB_DATABASE=warpkeep-89e4u
```

The production frontend activation gate and Pages validator require those exact
bridge/issuer, audience, Maincloud, and database values whenever shared alpha is
enabled; matching lookalikes fail closed. The localhost/configurable escape hatch
is development-only.

Only a final explicit enable approval may change Worker public auth from false;
only a separate final explicit enable approval may change frontend shared-alpha
access from false. Enable Worker first, verify exact-head v2 behavior, then
enable the frontend. Never enable a v2 frontend against a v1 Worker/module.

Immediately after an approved Worker enable, run the tokenless enabled-profile
check before enabling the frontend:

```sh
WARPKEEP_EXPECTED_DEPLOYED_SHA=<full-pages-sha> \
  npm run verify:alpha-production -- --require-auth-v2-enabled
```

`--require-auth-v2-enabled` is deliberately distinct from the existing
`--require-auth-v2` paused-profile gate. The enabled check makes only bounded,
no-store `GET` and `OPTIONS` requests. It requires the health document to attest
`publicAuthEnabled: true`, then verifies exact discovery/JWKS coordinates,
retired v1 routes, v2 allowed- and hostile-origin preflights, security headers,
and browser isolation of all three server-only admin paths. For each admin path
it verifies an allowed-origin `GET` plus allowed- and hostile-origin `OPTIONS`
preflights, with no `Access-Control-*` response headers. It sends no body,
authorization, cookie, FID, proof, QR payload, or bearer token and never calls
challenge, exchange, refresh, or logout with `POST`, so it creates no
challenge/session or production application state.

Run this public check in addition to—not instead of—the required additive
aggregate gate. It does **not** prove the private configuration digest, observed
Cloudflare source/deployment coordinate, Maincloud resolver execution, SIWF
exchange, cookie rotation/revocation, or an end-to-end player connection. Verify
the reviewed enabled config-attestation digest and exact Cloudflare source and
deployment version separately through their existing bounded server/platform
checks. Then perform the immediate clean-profile owner QA below; neither source
coordinates nor a passing tokenless check substitutes for that QA.

## 8. Owner QA after approved enablement

The Alpha 0.3.1 owner QA passed and is recorded only through privacy-safe facts
in the private audit trail. Every future activation or recovery should use a
clean profile to confirm:

1. **ENTER REALM** opens unchecked Alpha Terms, while Cancel, close, Escape,
   browser Back, reload, another tab, and direct `#realm` navigation create no
   challenge, QR/deep link, cookie refresh, or database connection;
2. one checked **CONTINUE TO SIGN-IN** creates exactly one auth continuation,
   while retry starts with fresh unchecked acceptance;
3. a missing FID receives pending identity but no access token/database
   connection;
4. **CHECK AGAIN** uses cookie refresh without a new SIWF request;
5. disabling or epoch-changing a bound FID revokes refresh and disconnects;
6. successful logout revokes the family, expires the cookie, clears memory token
   state, and closes the database connection; an injected/local revocation-store
   failure returns `503`, expires the current cookie, emits only the static safe
   event, and is recorded as an unresolved bounded family risk;
7. a local fixture confirms the non-secret logout tombstone blocks startup,
   focus/timer, **CHECK AGAIN**, and direct refresh until explicit Terms-gated
   activation; a denied
   tombstone write plus failed server revocation remains explicitly unresolved;
8. no secret/proof/token/cookie is captured in screenshots, console, network
   exports, or logs.

Admission of any additional real FID requires another explicit approval after
tokenless pending QA. Do not attempt first-time production founding until
`admin_admit_founder_v1` has been separately published and attested, and do not
fall back to `admin_allow_fid`. First admission begins at epoch `1`; do not
preserve the historical epoch-zero policy.

## Recovery

The safest immediate containment is to keep or restore both auth switches to
false through separately approved deployments. That stops new public auth/realm
work without deleting Maincloud or Durable Object data. Leave the frozen legacy
table and additive v2 tables in place; do not publish a v1 module, remove tables,
delete data, recreate the database, or call that destructive reversal a rollback.
Do not silently restore v1 public routes or raw-epoch issuance. The legacy admin
epoch procedure may assist an approved server-only investigation, but it is not
browser authority.

Secret rotation, Durable Object recovery, Worker recovery, frontend recovery,
and a SpacetimeDB forward fix are distinct actions with distinct blast radii.
Follow the [reconstruction documentation](./reconstruction/deployment-recovery.md),
inspect state before retrying an indeterminate mutation, and obtain explicit
approval for every external change.

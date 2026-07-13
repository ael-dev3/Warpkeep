# Warpkeep threat model — Alpha 0.2 historical baseline and local v2 delta

Status: the Alpha 0.2 evidence remains historical. The active security delta in
this document describes local protocol-v2 code that has **not** been published,
migrated, configured, deployed, or enabled. This is not an OWASP ASVS
certification or a penetration-test attestation.

## Scope and revision

This model covers the browser experience, Farcaster Sign In with Farcaster
(SIWF), the Cloudflare authentication bridge, SpacetimeDB authorization, local
Hermes administration, and the GitHub Pages delivery path.

- Runtime audit base: `2e9f3cfe9eb3f04c37156fb6cf2b82377ad616cc`
- Runtime branch: `feat/spacetimedb-basic-connection` (PR #11)
- Licensing-policy review: `f57d252e56d6d3abf1530d12997815c5b1466e35`
  (PR #15), reviewed separately from the runtime branch
- Intended public frontend: `https://warpkeep.com/`
- Intended OIDC issuer: `https://auth.warpkeep.com`
- Intended database service: SpacetimeDB Maincloud

The model assumes a deliberately small, invite-only alpha. The local v2 target
replaces the historical browser-readable 30-day bearer with a 600-second
memory-only access token and a separate maximum-30-day HttpOnly rotating session
family. That target remains untrusted as production state until every rollout
gate is separately approved and verified.

## Local v2 status and non-deployment boundary

The checked-out v2 target has exact `auth_version: 2`, positive auth epochs,
tokenless pending sessions, a `__Host-` session cookie, server-side family
rotation/revocation, a dedicated resolver principal/procedure, protocol 2, and
retired public v1 challenge/exchange routes. The bridge persists and issues only
the verified FID, while SpacetimeDB keeps opaque OIDC ownership in private
`player_ownership` rows instead of the public `player` projection. Worker
`PUBLIC_AUTH_ENABLED` and frontend shared-alpha activation remain false.

This review performed no Maincloud publish/mutation, Durable Object migration,
secret configuration, Worker/frontend deployment, DNS/account change, or auth
enable. The historical live Alpha 0.2 record is not evidence that this local v2
head is deployed.

## System and data flow

```mermaid
flowchart LR
  Browser["Player browser\nstatic GitHub Pages app"]
  Farcaster["Farcaster relay and verifier"]
  Bridge["Cloudflare auth bridge\nmanaged ES256 key"]
  Guard["Challenge Durable Object"]
  Family["Session Family Durable Object\nrotating generation and epoch binding"]
  STDB["SpacetimeDB Maincloud\nmodule, private admission and ownership data"]
  Hermes["Local Hermes operator"]
  GitHub["GitHub repository and Actions"]
  Pages["GitHub Pages\nwarpkeep.com"]

  Browser -->|"channel creation/status; user approval"| Farcaster
  Browser -->|"challenge; minimized SIWF proof"| Bridge
  Bridge -->|"one-time claim / cleanup"| Guard
  Bridge -->|"create / rotate / revoke"| Family
  Bridge -->|"independent proof verification"| Farcaster
  Bridge -->|"60s resolver-only JWT; structured v2 procedure"| STDB
  Bridge -->|"600s access JWT or tokenless pending result"| Browser
  Browser -->|"OIDC-authenticated WebSocket"| STDB
  Hermes -->|"admin secret; short-lived admin JWT"| Bridge
  Hermes -->|"admin procedures and reducers"| STDB
  GitHub -->|"reviewed build artifact"| Pages
  Pages -->|"static application"| Browser
```

The browser may request identity proof, but it does not choose the authoritative
FID. The bridge independently verifies the proof and obtains the current
authorization epoch from a fixed server-to-server procedure before issuing a
player token. SpacetimeDB remains authoritative for admission, player/castle
creation, and world state. Anonymous visitors do not open a database connection.

## Assets

| Asset | Required protection |
| --- | --- |
| Farcaster FID identity binding | Integrity; a client-supplied FID must never become authority. |
| SIWF message and signature | Confidentiality in transit and logs; strict contextual validation; single use. |
| Relay channel token, channel URL, nonce, and request ID | Confidentiality, bounded lifetime, and no persistence beyond the active flow. |
| Player OIDC access JWT | JavaScript-memory-only confidentiality; exact auth version/claims; 600-second maximum; positive epoch enforcement. |
| Session-family cookie and Durable Object state | `__Host-`, Secure, HttpOnly, SameSite=Strict; integrity-protected rotating reference; server-side expiry/revocation. |
| Browser logout-intent tombstone | Non-secret, base-path scoped marker/timestamp only; no FID, proof, token, cookie, family ID, or profile data; 30-day maximum and explicit-SIWF clearing. |
| Worker-to-SpacetimeDB resolver JWT | Server-only, maximum 60 seconds, exact resolver subject/sole role, fixed destination, never logged. |
| ES256 private signing key | Worker-managed secret only; absent from source, browser, artifacts, and logs. |
| Hermes admin secret | Operator/Worker secret only; never placed in browser code, process output, or repository. |
| Session-cookie HMAC key | Independent Worker-managed secret; never reused with signing/admin material or recorded in recovery evidence. |
| Farcaster/Optimism RPC credential | Worker secret only; URL and credential must not be logged or returned. |
| Cloudflare account and Worker | Deployment and configuration integrity; least privilege. |
| SpacetimeDB identity and claims | Exact issuer, audience, token type, subject, role, FID, epoch, and time validation. |
| Private whitelist, player-ownership binding, and admin audit data | Server-only confidentiality and authorized mutation; opaque OIDC identity must not enter public subscriptions. |
| Persistent player, castle, and world state | Transactional integrity and module-authoritative ownership. |
| Minimum browser identity state | No bearer/family secret persistence; strict parsing, expiry, logout propagation, and minimum data. |
| GitHub deployment authority | Least privilege, immutable workflow dependencies, reviewed artifact provenance. |
| Pages custom domain | HTTPS integrity, canonical redirects, and controlled deployment. |
| Local operations machine | Separation from public repository content and protection of operator credentials. |

## Trust boundaries

1. **Browser ↔ Farcaster relay/client.** Channel creation and approval data are
   untrusted until independently verified. A relay response is not itself an
   identity assertion.
2. **Browser ↔ auth bridge.** All request fields, headers, origins, and proof
   data are hostile input. The exchange accepts exactly `identity: { fid }` and
   rejects profile metadata. TLS, exact CORS policy, strict size bounds,
   contextual proof checks, and replay protection apply.
3. **Worker ↔ Farcaster verifier / Optimism RPC.** The endpoint and credential
   are server configuration. Responses may fail, stall, or be malformed and
   must not produce a token on error.
4. **Worker ↔ SpacetimeDB HTTP procedure.** A resolver-only ephemeral token
   crosses this boundary. Its exact subject/role and 60-second window, HTTPS
   origin, database, procedure, redirects, time, body size, content type, and
   structured response shape are constrained.
5. **Browser ↔ SpacetimeDB Maincloud.** The browser presents a bearer token.
   Only a current admitted player may connect; every sensitive
   procedure/reducer repeats module-side authorization. Frontend gating is not
   a security boundary.
6. **Hermes ↔ Worker admin endpoint.** Browser origins are rejected. The
   long-lived admin secret may be sent only to the canonical bridge, which
   returns a short-lived, narrowly shaped admin JWT.
7. **Hermes ↔ SpacetimeDB admin surfaces.** The short-lived token may be sent
   only to the canonical Maincloud origin/database. Admin role and subject are
   distinct from player authority.
8. **GitHub Actions ↔ Pages.** Dependency-running build jobs are untrusted with
   deployment authority. Only the deploy job receives Pages and OIDC write
   permissions, and it consumes the built artifact.
9. **Public repository ↔ local operations machine.** Repository scripts and
   documentation are public and must contain no credential material. Local
   secret stores and private reports remain outside the repository.

## Attacker classes

- anonymous browser user;
- valid but non-whitelisted Farcaster user;
- malicious whitelisted player;
- bearer-token holder after XSS, extension, memory capture, or device compromise;
- XSS or malicious-extension attacker operating in the application origin;
- replay and parallel-request attacker;
- origin-spoofing non-browser client;
- availability, quota, and cost attacker;
- compromised package, package registry path, or downloaded tool;
- malicious pull-request contributor or compromised GitHub Action;
- on-path network attacker before transport policy is established;
- misconfigured or compromised operator environment.

## Security properties and controls

### Identity and proof

- A decimal FID is derived from the independently verified Farcaster proof, not
  a browser display field or reducer argument.
- SIWF context is bound to the configured domain, URI, nonce, request ID, and
  expiration before a token can be issued.
- The proof FID, requested FID, and exact FID-only exchange identity must agree.
- The bridge rejects username, display-name, avatar, and other optional profile
  fields; it stores only the verified FID in a session family and issues no
  optional profile claims in an access JWT.
- The module independently ignores optional profile-shaped JWT claims during
  bootstrap and inserts undefined public profile fields. JWT authority cannot be
  repurposed as a profile-write channel.
- Proof material, relay secrets, tokens, credentialed URLs, and private
  responses are excluded from logs and public error messages.

### Replay and resource control

- Challenges are random, expire, and are atomically claimed before expensive
  verification, database lookup, or signing.
- A successful or definitively invalid exchange consumes the challenge. Only
  an explicitly retryable verifier outage, epoch lookup failure, or signing
  failure restores a still-live challenge.
- Durable Object storage is alarm-cleaned and deallocated after use or expiry.
- Request and response bodies are streamed through byte bounds with strict text
  decoding. The browser bridge exchange, Worker epoch lookup, and local Hermes
  connection/operation paths use explicit deadlines.
- Credential-bearing routes use Durable Object-backed exact rolling-window
  limits: challenge 12/300 seconds, exchange 20/300 seconds, refresh 30/300
  seconds, and the shared admin action 6/300 seconds. Durable
  IPv4-address/IPv6-`/64` buckets use bounded backoff,
  failure-atomic alarm updates, and full expired-object deallocation. Aggregate
  edge monitoring and alert maturity remain necessary before wider availability.

### Tokens and authorization

- Player, resolver, and admin tokens use ES256 and distinct exact principal
  shapes. Players require `auth_version: 2`, positive `auth_epoch`, and empty
  roles. The resolver requires exact `service:auth-epoch-resolver` and sole
  `warpkeep-auth-epoch-resolver`; Hermes remains exact and admin-only.
- SpacetimeDB verifies the token signature and standard time claims when the
  connection is authenticated. The module then validates issuer, audience,
  token type, auth version, subject, roles, FID, positive epoch, and time
  window. A player cannot use an admin/resolver surface; resolver/admin tokens
  cannot bootstrap or subscribe as players.
- Signed `session_iat`/`session_exp` claims preserve the original player-session
  window across SpacetimeDB's temporary connection-token exchange. Every player
  module call rechecks the maximum-600-second deadline against module time.
- Admin reducer/procedure entry points recheck the connection JWT expiry
  against authoritative reducer time, even when a WebSocket outlives token
  expiry.
- Player admission and the authorization epoch are module-authoritative.
  Denied admission creates no player or castle state.
- First admission starts at epoch one. Epoch zero is only the structured
  missing/disabled sentinel and is never player authority.
- `auth_resolver_get_fid_admission_v2` returns exact missing/disabled/enabled
  state; non-enabled results use epoch zero and enabled requires a positive
  epoch. `admin_get_fid_auth_epoch` is rollback compatibility only.
- Private whitelist, `player_ownership`, and admin-audit tables have no public
  generated query/subscription accessors. Inert generated schema types expose no
  rows. Public `player` rows contain the FID and presentation/game fields but no
  opaque SpacetimeDB OIDC Identity.
- Existing-player authorization requires a consistent public `player` row and
  matching private ownership row. Partial or mismatched state fails closed.

### Browser session lifecycle

- An access bearer exists only in JavaScript memory and expires within 600
  seconds. It is never persisted to localStorage, IndexedDB, a URL, or a
  browser-readable cookie.
- Continuity uses a separate maximum-30-day server-side session family referenced
  by `__Host-warpkeep_session; Secure; HttpOnly; SameSite=Strict; Path=/`.
- Remember-device persistence defaults false. Only explicit opt-in adds a
  persistent cookie lifetime; the default uses a session cookie while the
  server-side family remains absolutely bounded at 30 days.
- Pending admission returns FID-only identity and the HttpOnly reference but no
  access token, so it cannot open a database connection.
- Every authorized refresh rechecks admission and rotates the generation. A
  bound epoch mismatch/missing/disabled result, origin/expiry failure, or stale
  replay revokes the family. Only the immediately previous generation has a
  bounded lost-response recovery grace.
- Successful logout confirms family revocation, expires the cookie, clears
  transient bearer/pending state, and closes the database connection. If durable
  revocation cannot be confirmed, the bridge returns generic `503` and still
  expires the current browser cookie; a separately copied cookie may remain
  usable after storage recovery until the bounded family expires.
- Sign-out writes a non-secret 30-day logout-intent tombstone before the
  best-effort server call. All startup, focus/timer, pending-check, and direct
  refresh paths fail closed while it is active; reloads and same-origin tabs
  honor it, and only explicit SIWF clears it before expiry. Malformed or
  unavailable storage blocks refresh.
- The bridge returns only the verified FID. Proof, profile, custody,
  verification, and authentication-method details do not enter session-family
  storage or access-token claims.
- XSS can still copy the in-memory access token, but not the HttpOnly family
  reference; a copied access token remains bounded by 600 seconds and module
  epoch/admission checks.

### Operations and delivery

- Hermes credential-bearing operations allowlist the canonical bridge,
  Maincloud origin, and database. Custom destinations are limited to secret-free
  dry runs.
- A server-only configuration attestation hashes the reviewed v2 issuer,
  origins, SIWF coordinates, key/database coordinates, access/family lifetimes,
  cookie attributes, and public-auth state without returning a secret.
- Production frontend activation and Pages validation require exact
  `https://auth.warpkeep.com` bridge/issuer, `warpkeep-spacetimedb` audience,
  `https://maincloud.spacetimedb.com` service, and `warpkeep-89e4u` database.
  The Worker separately pins its production resolver to that Maincloud/database
  pair; only explicit development profiles remain configurable.
- Admin requests reject redirects and use connection, operation, and child
  process deadlines with cleanup.
- Workflow actions are pinned to reviewed immutable commits, and repository
  policy requires SHA pinning. Checkout credentials are not persisted,
  downloaded SpacetimeDB binaries are pinned by release checksum, and all
  package boundaries are audited.
- Build jobs have read-only repository access. Pages and OIDC write authority is
  isolated to the deployment job.
- Verified `main` protection requires pull requests even for administrators,
  strict current-head checks (`verify`, `auth-bridge`, `spacetimedb-module`,
  `analyze`, and `CodeQL`), stale-review dismissal, resolved conversations, and
  linear history; force pushes and branch deletion are disabled.
- The frontend shared-alpha switch defaults off so an incomplete identity chain
  fails closed.
- Worker public auth also defaults false. Module publish, session-family Durable
  Object migration, secret configuration, Worker deploy, frontend deploy, and
  each auth enable are separate approval boundaries.

## Principal threat scenarios

| Threat | Primary control | Residual treatment |
| --- | --- | --- |
| Client chooses or substitutes another FID | Independent SIWF verification and exact FID agreement | Treat verifier/RPC compromise as an external dependency incident. |
| Proof replay or parallel exchange | Expiring Durable Object challenge, atomic pre-work claim, and distributed per-client rolling-window limits | Add aggregate edge monitoring/alerts for broad distributed abuse; tune policy only through separate review. |
| Stolen in-memory access bearer | Exact v2 claims, 600-second maximum, positive epoch/admission checks, disconnect/logout handling | XSS/extension memory capture remains possible for the token's short remaining lifetime; the HttpOnly family is not exposed. |
| Stolen or replayed session reference | HMAC-authenticated `__Host-` cookie, SameSite=Strict, origin binding, generation rotation, stale-replay family revocation | Endpoint/host compromise remains an incident; bounded previous-generation recovery must remain narrow. |
| Admin credential exfiltration through operator target override | Canonical destination allowlist and secret-free custom dry run | Operator host compromise remains out of application scope. |
| Admin WebSocket remains privileged after JWT expiry | Reducer/procedure-side expiry check using authoritative time | Ensure every future admin entry point calls the common guard. |
| Whitelist bypass or private-row disclosure | Module-side admission and private ownership checks on every protected operation; private tables/bindings | Public world/player/castle projections remain intentionally observable, but public player rows contain no opaque OIDC identity. |
| Logout revocation-store failure | Generic `503`, current-cookie expiry, static failure event, and non-secret 30-day browser tombstone that blocks all refresh until explicit SIWF | A denied tombstone write plus failed server revocation can leave a later storage-enabled context able to resume a copied cookie until family expiry; investigate without logging identifiers or cookie material. |
| Worker memory/cost exhaustion | Streaming bounds, timeouts, early challenge claim, per-client rate control, and storage cleanup | Aggregate account quotas, telemetry, and alerting remain operational requirements. |
| Malicious dependency or workflow step obtains deployment authority | Lockfiles, audits, required action SHA pins, checksum verification, job privilege split, and protected `main` required checks | Commit signatures remain disabled; security-update remediation needs a private workflow while automated security PRs are intentionally off. |
| First-visit transport downgrade or framing/content-type hardening gap | HTTPS redirect and browser-origin validation | HSTS and response headers depend on the hosting layer and remain an activation check. |
| Misconfigured partial activation | Worker and frontend default-off switches, exact config attestation, and ordered approval gates | Follow the activation runbook; no stage implies approval for publish, migration, secret change, deploy, or enable at another stage. |

## Accepted alpha risks and future requirements

- An origin-level script, malicious extension, or compromised device can copy
  the current memory-only access token. Its authority is capped at 600 seconds
  and the current epoch; browser logout cannot recall a copy already exfiltrated.
- The HttpOnly family reduces bearer persistence exposure but does not make a
  compromised origin/device safe. Rotation, SameSite=Strict, exact CORS/origin,
  server revocation, incident response, and key rotation remain necessary.
- The non-secret logout tombstone suppresses cookie resurrection for its 30-day
  lifetime and is cleared early only by explicit SIWF. Browser storage denial
  remains a residual when server revocation also fails: a future context where
  storage works cannot discover a tombstone that was never written.
- Public game projections are observable to admitted authenticated clients by
  design; privacy classification must be revisited as state expands. Missing
  and disabled users receive no access token and cannot connect.
- Existing enabled epoch-zero rows, if any, fail closed under v2 and require
  explicit read-only inspection plus an approved migration decision. They must
  never be silently promoted.
- The bridge now rejects caller-supplied profile metadata and neither persists
  it nor issues it in player JWTs. Public SpacetimeDB presentation columns remain
  a separate, non-authoritative data class and must not contain opaque ownership
  identity.
- Static Pages responses currently lack several defense-in-depth headers,
  including HSTS. Hosting-layer header support or a fronting service is a future
  production requirement.
- Distributed Worker rate limiting is active. Alerting, key-rotation drills,
  incident response, and operational history are not yet mature enough for
  production assurance.
- The local v2 code is not production state. Removing opaque OIDC identity from
  public `player` rows and adding private `player_ownership` is a breaking schema
  rollout, not an implicitly additive publish. It requires explicit approval,
  read-only state inspection, a reviewed migration/compatibility decision, and
  staged module/Worker/frontend/session verification before any statement that
  v2 is live.
- GitHub `main` protection is active with pull-request enforcement including
  administrators, strict required checks, stale-review dismissal, conversation
  resolution, linear history, and no force-push/delete. Required commit
  signatures remain disabled. Dependabot security updates remain intentionally
  disabled because automated PRs in a public repository could disclose an
  unpatched vulnerability; private triage and disclosure-safe remediation remain
  operational requirements.

## Assumptions and operational dependencies

- Cloudflare keeps the signing key, RPC credential, admin secret, and independent
  session-cookie key in managed secret storage and never exposes them to Pages
  or untrusted pull requests.
- Production browser/Pages and Worker resolver configuration remain pinned to the
  reviewed Warpkeep auth, audience, Maincloud, and database coordinates;
  development configurability is never accepted as a production profile.
- Farcaster's official verifier correctly binds the signature to the FID.
- SpacetimeDB Maincloud and version 2.6.1 enforce the documented JWT signature
  verification and transaction semantics.
- Rollout is staged and fail-closed: public auth and shared-realm access stay
  false while the explicitly approved breaking module schema is reconciled, the
  session-family Durable Object is migrated, secrets are configured, and
  Worker/frontend heads are independently deployed and attested. Each action
  requires separate explicit approval.
- Public v1 challenge/exchange routes remain retired after Worker cutover; the
  legacy admin raw-epoch procedure exists only for rollback compatibility and
  is never an implicit v2 fallback.
- Verified GitHub branch protection and SHA-pinning policy constrain changes to
  `main`; the `github-pages` environment policy must still be recorded and
  rechecked at each release coordinate rather than inferred from branch rules.
- Operators do not pass secrets on command lines, store returned JWTs, or run
  destructive publish/database commands outside the reviewed runbook.

## Exclusions

This review does not authenticate to Cloudflare or SpacetimeDB, inspect the
owner's Keychain, retrieve or rotate production secrets, mutate Maincloud or
whitelist data, approve a real SIWF request, perform high-volume production
testing, audit Farcaster/Cloudflare/GitHub/SpacetimeDB internals, or assess game
art, layout, and unrelated gameplay design.

## Review triggers

Revisit this model before widening admission, changing token/session policy,
adding a new trusted origin or database, introducing gameplay mutations or
private player data, adding an admin entry point, changing the deployment
workflow, or moving away from the current Pages/Worker/Maincloud topology.

Before claiming the local v2 target is deployed, separately approve and verify:
read-only Maincloud inspection; a reviewed breaking-schema migration and
non-destructive module publish; the additive Durable Object migration; managed
secret configuration; paused Worker deploy plus config attestation; disabled
frontend deploy; and finally any Worker/frontend auth enable. This document
grants none of those approvals.

# Warpkeep Alpha 0.2.0 Security Preflight

This is a sanitized pre-release code and configuration review for Warpkeep's
closed Alpha 0.2 identity and shared-realm architecture. It is neither a formal
OWASP ASVS certification nor a penetration test.

## Scope and audited revisions

- Runtime audit base / PR #11 head at audit start:
  `2e9f3cfe9eb3f04c37156fb6cf2b82377ad616cc`
- Runtime branch: `feat/spacetimedb-basic-connection`
- Security branch: `security/alpha-0.2-preflight`
- Security runtime/CI changes reviewed through:
  `117ea12e18568ed7da95724ab4ce159ea428abc5`
- PR #15 reviewed separately at:
  `f57d252e56d6d3abf1530d12997815c5b1466e35`
- Public frontend checked: `https://warpkeep.com/`
- Observable Pages deployment at audit start:
  `d1184438387cc7d78fd208571f480773d4070c82`

The historical review covered the React/browser client, Farcaster SIWF flow,
the former browser-readable bearer session, Cloudflare Worker bridge, replay controls, ES256 tokens,
Worker-to-SpacetimeDB epoch lookup, module authorization and private tables,
generated bindings, Hermes tooling, GitHub Actions/Pages, dependencies, public
repository history, and passive domain posture.

The private report contains detailed evidence and is intentionally not stored in
the public repository.

## Activation follow-up

The stacked activation PR subsequently verified the server-side closed-alpha
chain through Worker source `63336dd668e901b9ed22752528130c6005182152`
and deployed Pages head `83bc36ccb23bfc012d27865ce8c77550b71b8436`:

- `auth.warpkeep.com`, health, discovery, public-only JWKS, and exact CORS are
  live;
- challenge, exchange, and admin-token routes use distributed exact
  rolling-window limits of 12, 20, and 6 requests per 300 seconds;
- the historical direct private Maincloud raw auth-epoch procedure and matching
  production issuer were live at that recorded head;
- disabled-to-enabled admission incremented the auth epoch exactly once, while
  that historical head retained baseline epoch zero for first admission;
- the module was published non-destructively and the idempotent seed produced
  exactly 61 world tiles, zero allowlist rows, zero enabled FIDs, zero players,
  and zero castles;
- an independent pre-deployment review caught malformed framing and BOM-only
  admin-body cases; the raw-byte guard and regressions were corrected and
  independently passed before the Worker was deployed.
- protected aggregate JSON mode suppresses only SpacetimeDB SDK informational
  chatter; the one-object stdout contract and full production verifier pass.

No real FID was admitted. Empty-whitelist denial remains owner-controlled QA,
not a completed assurance in this report.

The later assurance fixes described below are being consolidated above that
live head. They are not represented as deployed until their new exact head is
deployed and the protected verifier passes again.

## Local protocol-v2 hardening delta

> **Local/draft only.** The following target is implemented in the current
> checkout but was not published, migrated, configured, deployed, or enabled by
> this review. Historical Alpha 0.2 observations above remain evidence only for
> their recorded source coordinates.

The v2 target supersedes the historical bearer/epoch resolver assumptions:

- player access JWTs are maximum 600 seconds, require `auth_version: 2` and
  `auth_epoch >= 1`, contain FID but no optional profile claims, and live only
  in browser JavaScript memory;
- continuity is a separate maximum-30-day server-side rotating family referenced
  by `__Host-warpkeep_session; Secure; HttpOnly; SameSite=Strict; Path=/`;
- remember-device persistence defaults false, and sign-out writes only a
  non-secret, base-path-scoped 30-day logout marker/timestamp that blocks every
  cookie refresh until explicit SIWF clears it early;
- a missing admission creates a pending/tokenless session; bound epoch
  mismatch, missing, disabled, expiry/origin failure, or stale replay revokes;
- public `/v1/farcaster/challenge` and `/v1/farcaster/exchange` are retired;
- resolution uses a maximum-60-second JWT with exact
  `service:auth-epoch-resolver` subject and sole
  `warpkeep-auth-epoch-resolver` role, plus structured
  `auth_resolver_get_fid_admission_v2` results;
- first admission begins at epoch one; epoch zero is only a non-enabled
  sentinel and never player authority;
- the bridge exchange/session/response identity is FID-only; the deployed
  public `player` table is retained byte-for-byte as a frozen, inert legacy
  contract, while new gameplay uses identity-free public `player_v2` plus
  private `player_ownership_v2` with no browser query/subscription accessor;
- module bootstrap ignores all optional profile-shaped JWT claims and inserts
  undefined `username`, `displayName`, and `pfpUrl` fields;
- a server-only configuration attestation covers the reviewed v2 coordinates,
  lifetimes, cookie attributes, and default-false public-auth state;
- production frontend/Pages activation pins exact `https://auth.warpkeep.com`,
  `warpkeep-spacetimedb`, `https://maincloud.spacetimedb.com`, and
  `warpkeep-89e4u`; the Worker independently pins its production resolver while
  development remains explicitly configurable;
- checked-in `PUBLIC_AUTH_ENABLED` and frontend shared-alpha activation remain
  false.

The raw `admin_get_fid_auth_epoch` procedure remains only as admin-authenticated
rollback compatibility. It is not the v2 issuance/refresh contract.

The repository now contains an additive migration plan and local proof. The
production-v1 five-table definitions and order remain unchanged; `player_v2` and
`player_ownership_v2` are appended. A pinned SpacetimeDB 2.6.1 in-memory
loopback rehearsal preserves the 61-tile empty fixture and a synthetic nonempty
legacy row, accepts the additive update with `--delete-data=never`, verifies an
idempotent second update, detects partial/duplicate state, and confirms guarded
v1 rollback is refused before schema change. This is repository-only evidence:
the proof did not inspect or publish Maincloud and does not establish that
production runs v2.

Before any production publication, an explicitly approved fresh protected read
must show exactly zero legacy `player` rows. A nonzero count is an unconditional
hard stop requiring a separate reconciliation plan; it may not be copied,
repaired, deleted, or waived during this release. After an approved additive
publication, the v2 aggregate must also report `legacyPlayers = 0`,
`playersV2 = 0`, `playerOwnershipsV2 = 0`, `consistentPlayerPairsV2 = 0`,
`orphanedPlayerRowsV2 = 0`, and `orphanedOwnershipRowsV2 = 0`, alongside the
reviewed 61-tile empty-alpha state.

The legacy table remains public because changing its visibility would break the
deployed schema. Protocol-v2 code never writes or subscribes to it, but arbitrary
old clients can technically request the still-public table. Production safety
therefore depends on the zero-row hard stop and continuing zero-row verification,
not on treating that legacy table as private.

Keep both `PUBLIC_AUTH_ENABLED=false` and
`VITE_WARPKEEP_SHARED_ALPHA_ENABLED=false` throughout this module gate. Never use
delete-data modes other than `never`, `--break-clients`, database recreation, or
a v1 schema rollback. Leave the additive tables inert and prepare a forward fix
if containment is required. This review grants no external approval; the only
module-publication request phrase is
`approve additive protocol-v2 module publication`.

## Architecture and trust boundaries

The audited Alpha 0.2 head used the following historical authority chain; the
local v2 session-family and structured-resolver delta is defined above:

```text
Farcaster approval
  -> independently verified SIWF proof
  -> one-time Worker challenge
  -> bridge-issued ES256 player token
  -> SpacetimeDB-authenticated connection
  -> private admission row and auth epoch
  -> public world/player/castle projections
```

The browser cannot choose the authoritative FID. The Worker binds proof context
and resolves the current authorization epoch through a fixed private Maincloud
procedure. SpacetimeDB independently enforces exact claims and admission before
state creation. Player and Hermes service principals have distinct subjects and
role shapes. Private admission, player-ownership, and audit tables are absent
from browser bindings; partial or mismatched public/private player state fails
closed.

The complete asset, actor, data-flow, trust-boundary, control, and residual-risk
model is in [the Alpha threat model](./threat-model.md).

## Methodology

The audit combined:

- complete source/diff and security-sensitive history review;
- trust-boundary and abuse-case analysis;
- dependency, lockfile, install-script, and workflow provenance review;
- redacted full-history secret scanning with a checksum-verified official tool;
- table-driven parser, claim, session, concurrency, storage, and operator tests;
- real SpacetimeDB 2.6.1 module build and generated-binding comparison;
- independent second-pass reviews of the fixes;
- read-only GitHub repository/settings inspection;
- low-volume passive HTTPS, redirect, header, and DNS checks.

Requirement mappings use [OWASP ASVS 5.0.0](https://owasp.org/www-project-application-security-verification-standard/).
Supply-chain changes follow [GitHub Actions secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use).
Cloudflare, Farcaster, and SpacetimeDB behavior was checked against their primary
documentation and the pinned SpacetimeDB v2.6.1 source.

No production credential, real SIWF proof, private FID, live QR, or private
relay result was used. No high-volume live fuzzing was performed.

## Fixed findings

The review recorded 13 fixed findings: 1 High, 7 Medium, and 5 Low. No Critical
finding was confirmed.

| ID | Severity | Sanitized resolution |
| --- | --- | --- |
| `WK-OPS-001` | High | Credential-bearing Hermes operations now allow only the canonical bridge, Maincloud origin, and database; custom targets are secret-free dry runs. |
| `WK-BRIDGE-001` | Medium | Worker JSON bodies are streamed through an early byte limit with strict media type and UTF-8 handling. |
| `WK-BRIDGE-002` | Medium | Challenge objects schedule expiry and fully deallocate storage after use, expiry, or malformed state. |
| `WK-BRIDGE-003` | Medium | A challenge is atomically claimed before expensive work; definitive failures consume it and only retryable service failures restore it. |
| `WK-MOD-001` | Medium | Every admin reducer/procedure rechecks connection-JWT expiry against authoritative module time. |
| `WK-MOD-003` | Medium | The local v2 target limits player access/session claims to 600 seconds and rechecks the deadline after connection-token exchange; historical 30-day bearer behavior is not retained. |
| `WK-WEB-001` | Medium | Same-origin tabs propagate logout, cancel active authentication generations, clear bearer state, and reject late completion. |
| `WK-CI-001` | Medium | Actions are immutable-SHA pinned, the official CLI archive is checksum verified, build/deploy permissions are split, jobs are bounded, and CodeQL is added without executing a repository build. |
| `WK-WEB-002` | Low | Browser token lifetime, restored-bearer cleanup, and public identity minimization are enforced. |
| `WK-WEB-003` | Low | Proof, signature, response, timeout, redirect, media type, and HTTPS profile-image boundaries are aligned across browser and Worker. |
| `WK-MOD-004` | Low | Player roles must be exactly empty; the Hermes role remains exact and separate. |
| `WK-OPS-002` | Low | Hermes connection/operation/process deadlines, secret length, late cleanup, and indeterminate-mutation guidance are enforced. |
| `WK-REPO-001` | Low | Wrangler secret-file variants are ignored and copied example configuration fails closed. |

The High finding was fixed and regression-tested before this public report was
created. This report does not publish a weaponized reproduction path.

### Post-audit activation gate

The later stacked activation review added distributed Worker rate control and
the explicit admission-epoch transition, then found and closed additional
release gates without publishing private evidence. The review branch:

- deallocates expired rate-bucket SQLite objects, groups IPv6 clients by `/64`,
  and prevents rejected browser origins from consuming quotas;
- rechecks challenge expiry after upstream work and after signing;
- bounds the browser-to-SpacetimeDB connection handshake and disconnects a late
  connection;
- hardens discovery/JWKS and module-publish preflight against redirects,
  oversized/wrong-media responses, incomplete keys, false-success dry runs,
  and unbounded child execution;
- bounds the Hermes admin response and isolates the protected verifier child
  from unrelated ambient environment variables.

The preceding activation base is live. These additional assurance changes are
not a claim that their new Worker or Pages source is deployed. Exact-head
deployment verification and owner QA remain separate gates.

After replay onto the stable live head, the consolidated branch passed a clean
install, 57 root test files / 399 tests, 4 Worker files / 63 tests, 22 module
tests, all typechecks, all three production build variants, real CLI
module/binding verification, Worker dry run, and root/Worker/module audits.
Registry verification reported 182 signed packages / 55 attestations. Hosted
checks and exact-head deployment verification remain separate gates.

## Remaining accepted alpha risks

The original audit retained four Medium, three Low, and two Informational
observations. Those counts are historical; later local-v2 and repository-control
changes below close or reduce several items and are not production assurance
until their own rollout gates pass:

`WK-RISK-002` was Medium at the original audit head because distributed
challenge and verification limiting was absent. The live activation base added
per-client limits, and this assurance branch further hardens their identity,
alarm, and cleanup behavior. Broad distributed-abuse monitoring and alerts
remain an operational dependency rather than an unresolved application-code
finding.

- `WK-RISK-001` (historical Medium): the local v2 target removes the 30-day
  browser-readable bearer. XSS/extension compromise can still copy the current
  memory-only token, but it is capped at 600 seconds; the maximum-30-day family
  is HttpOnly, rotates, and is server-revocable. This reduction is not production
  evidence until the v2 rollout is approved and verified.
- `WK-MOD-002` (historical Medium): the local v2 target starts first admission
  at epoch one and rejects epoch-zero player tokens, closing baseline-token
  activation. Any existing enabled epoch-zero row fails closed and requires an
  explicit operator migration decision.
- `WK-RISK-003` (Medium): the canonical site redirects HTTP to HTTPS but does
  not send HSTS, leaving a first-visit transport gap.
- `WK-RISK-004` (historical Medium): verified `main` protection now requires pull
  requests including for administrators, strict current-head `verify`,
  `auth-bridge`, `spacetimedb-module`, `analyze`, and `CodeQL` checks, stale-review
  dismissal, resolved conversations, and linear history; force pushes and branch
  deletion are disabled. Repository policy also requires action SHA pinning.
- `WK-RISK-005` (historical Low): the local v2 bridge rejects optional
  display/avatar data and neither persists it in session families nor issues it
  in player JWTs. Remaining public presentation fields are non-authoritative and
  contain no opaque OIDC ownership identity.
- `WK-RISK-006` (Low): static Pages responses lack CSP, `nosniff`, referrer, and
  framing headers. No current dangerous HTML/eval sink was found.
- `WK-OPS-003` (Low): a local timeout cannot cancel a reducer already accepted
  by Maincloud, and several admin no-op/audit semantics need a future policy
  cleanup. Operators must inspect before retrying a timed-out mutation.
- `WK-RISK-007` (Informational): public world/player/castle projections are
  intentionally observable to connected authenticated custom clients.
- `WK-RISK-008` (Informational): required commit signatures remain disabled.
  Dependabot security updates remain intentionally disabled because automated
  security PRs in this public repository could disclose an unpatched issue;
  dependency triage and disclosure-safe remediation therefore remain private
  operational responsibilities.

The local v2 design now uses short-lived access plus a trusted HttpOnly rotating
server session and server-side revocation. Residual XSS/device compromise,
deployment correctness, monitoring, incident response, and key/session-secret
rotation still require operational maturity.

A successful logout confirms family revocation. If the Durable Object revoke
fails, the bridge returns generic `503` and expires the current browser cookie,
but a separately copied cookie could become usable after storage recovery until
the bounded family expires. This residual requires incident monitoring and must
not be reported as successful server-side revocation.

The non-secret 30-day logout tombstone blocks all cookie-refresh paths across
reloads and same-origin tabs and is cleared early only by explicit SIWF.
Malformed/unavailable storage fails closed. If its write is denied at sign-out
and server revocation also fails, the current runtime stays blocked but a later
storage-enabled context cannot recover a marker that never existed; that combined
condition remains an accepted bounded residual.

## Original audit exclusions and remaining operational dependencies

The original review did not authenticate to Cloudflare or SpacetimeDB. The
activation follow-up later verified the live Worker/JWKS/Maincloud chain and
aggregate state described above. It still does not claim independent assurance
for:

- managed Worker secret entropy, access policy, or key rotation;
- external Cloudflare rate-limit/WAF rules and alerting;
- production repository secrets/variables or third-party account controls;
- a real Farcaster approval or owner-only denial flow.

At the original audit coordinate, repository APIs showed secret scanning and
push protection enabled while branch protection was not enabled. The current
verified state adds the protected-`main` and SHA-pinning controls described
above. Required signatures remain disabled, and automated Dependabot security
updates intentionally remain off pending a disclosure-safe private remediation
workflow. The original branch-specific CodeQL query returned zero open alerts;
dependency and secret alert endpoints remained unavailable/inaccessible, so
this report does not make a broader zero-alert claim.

PR #15's license-policy verifier and CI changes were reviewed separately. Its
current v0.2 preparation check passed and it introduced no auth, secret,
network, or runtime path. A later assurance pass identified a future-v0.3
release-integrity gap in its cutover attestation/version/path-map checks; PR #15
must correct and test that future-state branch before it merges.

## Live verification status

Activation follow-up checks observed:

- `https://warpkeep.com/`: 200 over HTTPS;
- `https://www.warpkeep.com/`: canonical redirect;
- legacy GitHub Pages URL: canonical redirect;
- `http://warpkeep.com/`: HTTPS redirect, without HSTS;
- `auth.warpkeep.com`: health, discovery, public-only JWKS, exact CORS, and
  non-empty admin-body rejection passed over HTTPS;
- the protected direct admin path returned exactly 61 world tiles, zero
  allowlist rows, zero enabled FIDs, zero players, and zero castles;
- the historical remote raw-epoch probe passed without admitting a FID; this is
  not evidence for the local structured v2 resolver.

The exact-head Pages workflow must continue to validate its public coordinates,
and owner empty-whitelist denial QA remains required before any FID admission.

## Exclusions

The audit did not access Keychain, retrieve/generate/rotate/upload secrets,
authenticate cloud CLIs, deploy a Worker or Pages build, change DNS/settings,
publish or mutate Maincloud, seed a world, alter whitelist/player/castle data,
approve SIWF, scan a live QR, merge a PR, tag a release, or perform destructive
or high-volume production testing.

Farcaster, Cloudflare, GitHub, package registry, and SpacetimeDB internals were
not independently audited. Art direction, layout, gameplay balance, unrelated
accessibility, and business licensing choices were excluded.

## Regression coverage

Security tests now cover:

- streaming body, UTF-8, media type, and response limits;
- challenge concurrency, replay, retry classification, alarms, deallocation,
  and post-consume restoration;
- strict SIWF context, bounded EOA/smart-account signature shapes, FID equality,
  epoch resolution, and safe error mapping;
- exact protocol-v2 player/admin/resolver claims, role separation, 600-second
  player deadline, positive epoch, and admin connection-token expiry;
- memory-only access parsing, tokenless pending responses, maximum-30-day
  HttpOnly family lifetime, generation rotation/replay revocation, logout,
  default-off remember-device intent, 30-day tombstone refresh suppression,
  storage denial, revocation-store failure, in-flight cancellation, FID-only
  bridge identity, and no optional profile claims;
- public v1 route retirement, structured resolver validation, and server-only
  configuration attestation;
- canonical Hermes destinations, weak-secret rejection, deadlines, and dry run;
- workflow SHA pins, checkout credentials, checksummed CLI, package audits,
  job permissions/timeouts, stacked-PR triggers, and non-executing CodeQL mode;
- real SpacetimeDB 2.6.1 module build, private OIDC-ownership/public-player
  separation, fail-closed partial-state policy, profile-claim discard, and
  generated binding equivalence;
- exact production frontend/Pages and Worker resolver coordinate pins, with
  development configurability kept outside the production profile.

The exact deployed activation head passed 56 root test files / 384 tests, 56
Worker tests, 22 module tests, all typechecks, three root production build
variants, real SpacetimeDB 2.6.1 module build, generated-binding equivalence,
workflow YAML parsing, and `git diff --check`. Root, Worker, and module audits
reported no known vulnerabilities; 182 registry signatures and 55 attestations
verified. Hosted Verify, Worker, module, CodeQL analysis, Pages, and protected
production verification all passed for that recorded deployment. The additional
assurance branch passed the separate consolidated local matrix described above;
the combined head still requires hosted validation and exact-head deployment
verification.

The final shipped build was byte-for-byte equal to the PR #11 baseline: zero
total-byte and zero main-JavaScript-byte delta while the shared-alpha switch is
off. The GitHub runner emitted non-blocking Node 20 action deprecation notices;
the pinned action majors should be upgraded only after a separate compatibility
review.

The redacted full-history secret scan found one deterministic mocked test
fixture false positive and no real secret. Root, Worker, and module package
audits reported no known vulnerabilities at the audited locks.

## Release recommendation

**BLOCK** for advancing the consolidated activation branch or admitting a FID.
There is no remaining confirmed Critical/High code defect in the reviewed
source, but the additional assurance code is not yet the deployed and protected
production-verifier head.

PR #11 remained at the audit-base SHA. The security branch was rebased onto
that exact latest head (a no-op), and the complete local/hosted matrix passed.

Ongoing conditions before admitting any FID:

1. keep `PUBLIC_AUTH_ENABLED=false` and
   `VITE_WARPKEEP_SHARED_ALPHA_ENABLED=false`;
2. explicitly approve a fresh protected read-only inspection; require exactly
   zero legacy player rows or stop, then separately request
   `approve additive protocol-v2 module publication` and verify the unchanged
   five-table prefix, appended v2 pair, aggregate/orphan counters, exact bindings,
   and structured resolver;
3. separately approve the additive session-family Durable Object migration;
4. separately approve managed `SESSION_COOKIE_KEY` configuration without
   exposing or reusing a secret;
5. separately approve a paused Worker deploy and verify discovery/JWKS,
   resolver probe, v1 retirement, and configuration attestation;
6. separately approve a disabled v2 frontend deploy and complete owner QA;
7. require a final explicit approval before either public auth or shared-realm
   access is enabled; first admission must begin at epoch one.

The historical `83bc36c` activation record remains a conditional closed-alpha
pass for its exact deployed source; it is not evidence for the new consolidated
head and is not `PASS FOR PRODUCTION`.

The consolidated activation assurance remains **BLOCKED** from final release.
The repository-only additive proof does not change that status. The final hosted
head must pass, receive each separate approval, be deployed through its guarded
stage, and pass protected aggregate and owner-controlled denial QA before any
production or enablement claim.

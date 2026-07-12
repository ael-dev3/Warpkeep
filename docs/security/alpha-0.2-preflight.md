# Warpkeep Alpha 0.2.0 Security Preflight

This is a sanitized pre-release code and configuration review for Warpkeep's
closed Alpha 0.2 identity and shared-realm architecture. It is neither a formal
OWASP ASVS certification nor a penetration test.

## Scope and audited revisions

- Runtime audit base / PR #11 head at audit start:
  `2e9f3cfe9eb3f04c37156fb6cf2b82377ad616cc`
- Runtime branch: `feat/spacetimedb-basic-connection`
- Security branch: `security/alpha-0.2-preflight`
- Security runtime/CI changes reviewed through: `117ea12`
- PR #15 reviewed separately at:
  `f57d252e56d6d3abf1530d12997815c5b1466e35`
- Public frontend checked: `https://warpkeep.com/`
- Observable Pages deployment at audit start:
  `d1184438387cc7d78fd208571f480773d4070c82`

The review covered the React/browser client, Farcaster SIWF flow, remembered
bearer session, Cloudflare Worker bridge, replay controls, ES256 tokens,
Worker-to-SpacetimeDB epoch lookup, module authorization and private tables,
generated bindings, Hermes tooling, GitHub Actions/Pages, dependencies, public
repository history, and passive domain posture.

The private report contains detailed evidence and is intentionally not stored in
the public repository.

## Activation follow-up

The stacked activation PR subsequently verified the server-side closed-alpha
chain through `63336dd668e901b9ed22752528130c6005182152`:

- `auth.warpkeep.com`, health, discovery, public-only JWKS, and exact CORS are
  live;
- challenge, exchange, and admin-token routes use distributed exact
  rolling-window limits of 12, 20, and 6 requests per 300 seconds;
- the direct private Maincloud auth-epoch procedure and matching production
  issuer are live;
- disabled-to-enabled admission increments the auth epoch exactly once, while
  first admission intentionally retains baseline epoch zero;
- the module was published non-destructively and the idempotent seed produced
  exactly 61 world tiles, zero allowlist rows, zero enabled FIDs, zero players,
  and zero castles;
- an independent pre-deployment review caught malformed framing and BOM-only
  admin-body cases; the raw-byte guard and regressions were corrected and
  independently passed before the Worker was deployed.

No real FID was admitted. Empty-whitelist denial remains owner-controlled QA,
not a completed assurance in this report.

## Architecture and trust boundaries

Warpkeep uses the following authority chain:

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
role shapes. Private admission and audit tables are absent from browser bindings.

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
| `WK-MOD-003` | Medium | Signed absolute player-session claims survive connection-token exchange and enforce the original maximum 30-day deadline on every player call. |
| `WK-WEB-001` | Medium | Same-origin tabs propagate logout, cancel active authentication generations, clear bearer state, and reject late completion. |
| `WK-CI-001` | Medium | Actions are immutable-SHA pinned, the official CLI archive is checksum verified, build/deploy permissions are split, jobs are bounded, and CodeQL is added without executing a repository build. |
| `WK-WEB-002` | Low | Browser token lifetime, restored-bearer cleanup, and public identity minimization are enforced. |
| `WK-WEB-003` | Low | Proof, signature, response, timeout, redirect, media type, and HTTPS profile-image boundaries are aligned across browser and Worker. |
| `WK-MOD-004` | Low | Player roles must be exactly empty; the Hermes role remains exact and separate. |
| `WK-OPS-002` | Low | Hermes connection/operation/process deadlines, secret length, late cleanup, and indeterminate-mutation guidance are enforced. |
| `WK-REPO-001` | Low | Wrangler secret-file variants are ignored and copied example configuration fails closed. |

The High finding was fixed and regression-tested before this public report was
created. This report does not publish a weaponized reproduction path.

## Remaining accepted alpha risks

Four Medium, three Low, and two Informational observations remain. They are
not silent production assurances:

- `WK-RISK-001` (Medium): the 30-day bearer remains readable by same-origin
  script/local browser storage. Logout cannot recall a token copied outside the
  browser; epoch/key response and absolute expiry are the current controls.
- `WK-MOD-002` (Medium): a baseline-epoch token obtained before first admission
  can become usable when that FID is first allowed. Retaining epoch zero for
  first admission is the explicit closed-alpha policy. Disabled-to-enabled
  admission now increments the epoch, so older same-epoch tokens stay invalid.
- `WK-RISK-003` (Medium): the canonical site redirects HTTP to HTTPS but does
  not send HSTS, leaving a first-visit transport gap.
- `WK-RISK-004` (Medium): `main` has no branch protection/ruleset; owner-side
  review/check/bypass rules are required.
- `WK-RISK-005` (Low): optional display/avatar data is bounded convenience
  metadata, not independently verified profile authority.
- `WK-RISK-006` (Low): static Pages responses lack CSP, `nosniff`, referrer, and
  framing headers. No current dangerous HTML/eval sink was found.
- `WK-OPS-003` (Low): a local timeout cannot cancel a reducer already accepted
  by Maincloud, and several admin no-op/audit semantics need a future policy
  cleanup. Operators must inspect before retrying a timed-out mutation.
- `WK-RISK-007` (Informational): public world/player/castle projections are
  intentionally observable to connected authenticated custom clients.
- `WK-RISK-008` (Informational): private vulnerability reporting, dependency
  alert/update policy, central action policy, and rulesets require owner action.


The localStorage design is an explicitly documented closed-alpha compromise.
Production should use short-lived access tokens, a trusted HttpOnly refresh or
server session, server-side revocation, and mature incident/key-rotation
operations.

## Original audit exclusions and remaining operational dependencies

The original review did not authenticate to Cloudflare or SpacetimeDB. The
activation follow-up later verified the live Worker/JWKS/Maincloud chain and
aggregate state described above. It still does not claim independent assurance
for:

- managed Worker secret entropy, access policy, or key rotation;
- external Cloudflare rate-limit/WAF rules and alerting;
- production repository secrets/variables or third-party account controls;
- a real Farcaster approval or owner-only denial flow.

Repository APIs showed secret scanning and push protection enabled, while
private vulnerability reporting and branch protection were not enabled. The
final branch-specific CodeQL query returned zero open alerts; dependency and
secret alert endpoints remained unavailable/inaccessible, so this report does
not make a broader zero-alert claim.

PR #15's license-policy verifier and CI changes were reviewed separately. Its
local license verification passed, it introduced no auth/secret/network/runtime
path, and no actionable security issue specific to that PR was confirmed.

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
- the remote private auth-epoch resolver passed without admitting a FID.

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
- exact player/admin claims, role separation, 30-day player deadline, and admin
  connection-token expiry;
- OIDC/session parsing, maximum lifetime, cross-tab logout, in-flight
  cancellation, stale bearer cleanup, and minimum public identity;
- canonical Hermes destinations, weak-secret rejection, deadlines, and dry run;
- workflow SHA pins, checkout credentials, checksummed CLI, package audits,
  job permissions/timeouts, stacked-PR triggers, and non-executing CodeQL mode;
- real SpacetimeDB 2.6.1 module build and generated binding equivalence.

The latest clean activation matrix passed: 56 root test files / 383 tests, 56
Worker tests, 22 module tests, all typechecks, three root production build
variants, real SpacetimeDB 2.6.1 module build, generated-binding equivalence,
workflow YAML parsing, and `git diff --check`. Root, Worker, and module audits
reported no known vulnerabilities; 182 registry signatures and 55 attestations
verified. Hosted Verify, Worker, module, CodeQL analysis, and CodeQL result
checks all passed on the exact deployed Worker source head.

The final shipped build was byte-for-byte equal to the PR #11 baseline: zero
total-byte and zero main-JavaScript-byte delta while the shared-alpha switch is
off. The GitHub runner emitted non-blocking Node 20 action deprecation notices;
the pinned action majors should be upgraded only after a separate compatibility
review.

The redacted full-history secret scan found one deterministic mocked test
fixture false positive and no real secret. Root, Worker, and module package
audits reported no known vulnerabilities at the audited locks.

## Release recommendation

**CONDITIONAL PASS** for a small closed alpha. There is no remaining confirmed
Critical/High code blocker on the security or activation branch.

PR #11 remained at the audit-base SHA. The security branch was rebased onto
that exact latest head (a no-op), and the complete local/hosted matrix passed.

Ongoing conditions before admitting any FID:

1. keep the exact-head Pages workflow and public identity-chain coordinates
   green;
2. complete owner-controlled empty-whitelist denial QA;
3. retain the explicit first-admission epoch-zero policy and rotate once on
   every disabled-to-enabled transition;
4. set the shared-alpha switch back to `false` if any coordinate disagrees.

This recommendation is not `PASS FOR PRODUCTION`.

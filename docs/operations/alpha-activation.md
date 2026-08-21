# Alpha activation and recovery

This runbook covers deliberate Warpkeep production releases. It is not an
authorization record. A merge or green test run does not approve a Worker
publish, SpacetimeDB publication, data migration, resource seed, admission
change, or public-auth change.

> Greater Realm cutover freeze: every legacy production-capable npm operator
> named below is deliberately disabled. These historical steps may be restored
> only by a separately reviewed post-cutover trusted-launch packet; they are not
> executable instructions for the current release.

## Safety rules

- Use only the recorded Warpkeep production origins and immutable database
  identity.
- Keep SpacetimeDB data deletion disabled.
- Read counts and fixed policy identifiers, never private rows or player data.
- Keep authentication disabled while staging a bridge change.
- Use short-lived credentials through the private operator input path.
- Record commit, artifact digest, CLI version, aggregate counts, deploy ID, and
  timestamps in the private release log.
- Stop on any identity, policy, digest, count, migration, or canary mismatch.
- Never print tokens, SIWF proofs, QR payloads, FIDs, wallet addresses, private
  logs, or database rows into a terminal transcript or public issue.

## 1. Freeze the source

Release only a reviewed commit on a protected branch. Confirm the worktree is
clean and the intended version is consistent across the package, build stamp,
changelog, and in-game patch notes.

```sh
git status --short
git rev-parse HEAD
npm ci
npm run check
```

Then verify the service and module workspaces with their frozen lockfiles:

```sh
pnpm --dir services/auth-bridge install --frozen-lockfile
pnpm --dir services/auth-bridge run check
pnpm --dir spacetimedb install --frozen-lockfile
pnpm --dir spacetimedb run verify
npm run stdb:verify-bindings
npm run stdb:verify-additive-migration
```

The migration proof uses disposable loopback databases. It must not contact or
mutate Maincloud.

## 2. Inspect production before mutation

The former v3/v4 Hermes aggregate-inspection aliases are unavailable during
the Greater Realm cutover freeze. Do not run them from npm or invoke their
TypeScript entrypoint directly; a separately reviewed trusted-launch packet is
required before production inspection can resume.

The same refusal applies to the former v8 aggregate-inspection alias.

The same refusal applies to the former v10 aggregate-inspection alias.

The same refusal applies to the former v12 aggregate-inspection alias.

The historical Daily Marks aggregate-inspection alias is likewise unavailable
during the Greater Realm cutover freeze.

The first v12 publication cannot run that procedure beforehand. Its guarded
publisher instead requires an anonymous schema description of the immutable
database identity to match the exact 47-table v11 predecessor.

The first additive publication that introduces v8 cannot use it as a
pre-publication check. Record counts privately. The v8 status contains only
schema/backend versions, resource/forest policy identifiers and digests, and
aggregate table counts. A partial or drifted catalog is a hard stop.

## 3. Publish an additive module

The historical `stdb:publish:dev` lane is unavailable during the Greater Realm
cutover freeze. The current release has a dedicated commit-bound v17 publisher
only through the exact rows of the reviewed
[Greater Realm production launch envelope](greater-realm-production-launch-envelope.sh.txt).
Its approvals remain false; this historical runbook neither supplies its
reviewed arguments nor authorizes its use.

Do not substitute raw `spacetime publish` commands. If publication times out or
returns an ambiguous result, do not republish. A fresh read-only inspection must
establish the live schema and counts before any further release decision.

`--worker-forward-repair=none` is the normal fail-closed selection. A named
forward-repair value is release-specific and may be used only when its exact
counts-only checkpoint, reviewed module ABI, private operator, and explicit
production authorization all match; it is never a general repair mode.
The historical `stdb:worker-return-repair:inspect` and
`stdb:worker-return-repair:apply` aliases are unavailable during the Greater
Realm cutover freeze. No substitute repair command is approved.

The apply path records an aggregate-only intent before submission and a second
terminal receipt after the fresh post-inspection.

`--worker-module-predecessor=exact-v14-active` is the normal code-only lane
after Daily Marks is active. Its anonymous preflight binds all three proven
schema digests and all 56 table signatures, accepts only the reviewed candidate
Worker ABI, and requires the identical table boundary and ABI after
publication. Protected pre- and postflight checks also require the active Daily
Marks account, grant, schedule, and reconciliation invariants to remain valid.

`--worker-module-predecessor=exact-v13-active` remains available only for a
code-only release before the private v14 Daily Marks suffix is appended. It
binds the v12/v13 schema digests and all 54 table signatures. The one-time v14
append uses its separate explicit predecessor; neither v13 lane is valid once
the 56-table v14 boundary is live.

`--worker-module-predecessor=exact-v12-empty` is the explicit code-only
exception for an already-appended but still-inert v12 suffix. It requires the
proven 53-table digest, captures and preserves every table signature, accepts
only the reviewed predecessor or candidate Worker ABI, and runs the closed v12
aggregate before and after publication. Omit it only for the original exact
v11-to-v12 append. A partial ABI, staged Worker row, or indeterminate checkpoint
blocks publication.

For the one-time v11-to-v12 boundary, the publisher anonymously describes the
same immutable identity before and after publication. It requires all 47 v11
table signatures to remain unchanged and exactly six reviewed Worker tables to
be appended. The local proof receipt pins SHA-256 digests of the complete v11
and v12 table descriptors, row types, indexes, constraints, and every reachable
typespace reference; reducer- and procedure-only schema is excluded. The live
anonymous pre- and post-publication descriptions must match those exact proven
boundaries. The publisher then reruns v3, v4, v8, v10, and v12 aggregate checks.
The v12 checkpoint must prove those tables are empty and the Worker system
remains absent and fail-closed. Worker seeding, backfill, or activation needs separate
approval and is not performed by publication.

## 4. Activate reviewed components

Module publication and component setup are separate decisions. The former
component seed dry-run aliases are deliberately unavailable during the Greater
Realm cutover freeze; neither npm nor direct TypeScript invocation is an
approved substitute.

The historical dry-run and confirmed component flows are retained only as
design context. There is no production inspection or mutation row for them in
the current launch packet, so this document supplies no executable activation
sequence.

Water remains invisible after seeding. Its former activation and v10
inspection aliases are likewise unavailable until a separately reviewed
post-cutover trusted-launch packet restores them.

See [Alpha component activation](alpha-component-activation.md) for the compact
component-specific contract.

## 5. Deploy services and client

An auth-bridge change is staged with public authentication disabled. Verify
health, OIDC discovery, JWKS public-key shape, CORS, cookies, security headers,
configuration attestation, legacy-route retirement, and server-only route
isolation before any approved enablement.

The frontend deploys from the protected `main` commit after its required checks
pass. Confirm:

- the reported build SHA equals the released commit;
- the root document and immutable assets have the expected security and cache
  headers;
- legacy Pages coordinates do not serve a second playable client;
- the Terms, Social Contract, and Privacy Notice match the accepted version;
- realm entry stays fail-closed until backend/module compatibility is ready.

### Admission notification rollout

Farcaster admission notifications are an optional auth-bridge capability, not
a SpacetimeDB schema change. The checked-in Hermes delivery literal
`FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED`, Worker literal
`APPROVAL_NOTIFICATIONS_ENABLED`, and Pages presentation literal
`VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED` begin `false`. Hermes and Pages
advance in separate source-bound phases; the Worker may become live only in the
protected bridge-prepared phase below. Greater Realm client/server presentation
and the `0.3.44` identity remain false/inert throughout all notification phases.
This is an intentional temporary admission blackout: confirmed `admit-founder` and `allow-fid`
execution stops before bridge delivery, administrator-token issuance, database
connection, plan claim, or reducer submission. A false Hermes gate must never
skip delivery and continue admission. Roll them out in this order:

1. Add a dedicated managed `NOTIFICATION_OPERATOR_SECRET` to the currently
   deployed bridge before introducing the two checked-in notification settings.
   It must be distinct from every auth, session, wallet, and database
   credential. Confirm only the managed binding name, never its value.
2. Deploy the reviewed auth bridge and its additive Durable Object migration
   with `APPROVAL_NOTIFICATIONS_ENABLED=false`. Preserve the live values of
   `PUBLIC_AUTH_ENABLED` and `ACCESS_EXPECTED_FID_REQUIRED`; never replace
   production configuration with the checked-in staging defaults. The Hub,
   client, and secret tuple must be complete in that first candidate.
3. Verify the configured Farcaster Hub origins, approved client FID/delivery
   pair, Durable Object binding, webhook isolation, and redacted configuration
   attestation. Keep raw notification tokens and signed webhook bodies out of
   logs and release evidence.
   Stage `PLAYER_CANARY_OWNER_FID` through the protected
   `WARPKEEP_PLAYER_CANARY_OWNER_FID` workflow secret only. The guarded
   transition requires the deployed `v5` predecessor with the exact same
   reviewed module source digest, runtime compatibility, plain-text and Durable
   Object configuration (including exact namespace IDs), and exactly the old
   six Worker secrets. Runtime exports are attested exactly when the official
   API supplies them. When exports are omitted, the required fallback is the
   exact API metadata/annotations, script etag and handler shape, all 22 reviewed
   named class handlers, source digest, `v5` runtime, and raw bindings; null or
   partial exports fail closed. B0 is
   therefore a separate deployment of that exact reviewed source/configuration
   at `v5`, not a migration-tag-only change. The guarded transition then uploads
   a nondeploying strict-inheritance version whose ephemeral multipart omits
   `keep_bindings`, pins each of the established six secrets to that exact
   predecessor version with an `inherit` descriptor, and adds only the canary
   secret as explicit `secret_text`. Candidate inspection
   attests exactly seven, and the exact predecessor is rechecked immediately
   before the sole deployment POST. It never mutates the legacy `/secrets`
   endpoint; ambiguous upload recovery reconciles the candidate without a
   cleanup mutation. Never
   store or print the FID value in source, argv, artifacts, receipts, or journal
   records.
   Preserve the undeployed `dfa24a4` version 47 and its unresolved
   `upload-invoked` history. Do not retry or adopt that candidate, delete either
   evidence set, or manually release it. Continue only from a new reviewed
   protected-main successor whose distinct source tag and journal operation
   reconcile and deploy only that successor's exact candidate.
4. The checked-in production manifest already pins the exact reviewed
   `webhookUrl`; preserve it byte-for-byte. Deploy and attest the backend with
   `APPROVAL_NOTIFICATIONS_ENABLED=false` first, so the advertised endpoint is
   present but cannot record new consent or deliver an alert. Signed opt-outs
   remain usable through the paused bridge.
5. Keep all three literals `false` through backend, manifest, and client
   rehearsal. Then create a protected `notification-bridge-prepared` receipt
   only after the reviewed Worker is live and verified with its delivery gate
   enabled while Hermes and Pages remain `false`. This preparation phase has
   zero Hermes delivery, token, database, or admission calls. The release
   verifier must attest the exact source literals and protected bridge receipt;
   publisher approval alone is not activation-client or live-bridge evidence.
6. In the separately approved generation-zero Pages phase, require that
   protected receipt and change only Pages to `true` while Hermes and both world
   presentation gates remain false. Its live postflight must install the
   content-addressed generation-zero receipt. A later reviewed source clears the
   prepared/private bindings and checks in that immutable durable root while
   Hermes remains false.
7. Only after the durable root is checked in may a projection-only source change
   Hermes false → true. Keep Alpha `0.3.43` and both world presentation gates
   false. Give Hermes both isolated secrets through its private environment only
   after this durable-final source. For
   `allow-fid` and confirmed `admit-founder`, Hermes must queue the exact pending
   request generation before requesting the fresh mutation-session administrator
   token or invoking a reducer. If the player opted in, require Farcaster
   provider acceptance before mutating admission;
   `queued`, `delivery-exhausted`, or `not-subscribed` aborts unchanged. This
   tooling cannot override the no-consent boundary; a policy change requires
   separate explicit owner approval. Never queue a
   post-admission reconciliation notification; that legacy path is retired.
8. Exercise the normal admitted-owner exactly-once path, then the separately
   authorized production-player canary. Retain only privacy-safe,
   content-addressed evidence—never the signed body, token, or subject. Only a
   later activation-client source bound to that exact Hermes-final predecessor
   and canary receipt may publish the `0.3.44` identity and enable both Greater
   Realm client/server presentation gates.

### Owner canary and end-to-end acceptance

The signed production canary is still outstanding unless a private release
record contains all evidence below. Automated webhook fixtures do not satisfy
it.

1. Record the exact reviewed frontend and Worker SHAs, UTC start time, live
   manifest digest, redacted notification configuration attestation, and the
   fact that the client presentation gate is still `false`. Do not record a
   real FID, webhook body, notification token, or delivery URL.
2. Use a dedicated owner-controlled account in the exact production Mini App.
   Before the admission action for that test cycle, accept
   Farcaster's native add prompt. In the bounded log window, require exactly the
   fixed events `miniapp_webhook_verified` and
   `miniapp_notification_subscribed`; no caller data is valid evidence.
3. Disable Warpkeep notifications or remove Warpkeep in the same client. Require
   the fixed events `miniapp_webhook_verified` and
   `miniapp_notification_unsubscribed`. This proves the signed opt-out reached
   the private erasure path. Confirm ordinary authentication still works and no
   approval notification was sent during this canary.
4. After the durable Hermes source, normal admitted-owner exactly-once proof,
   and separately authorized production-player canary are all accepted, review
   and execute only the later activation-client successor and verify the
   deployed build SHA. With a fresh pending request cycle, confirm
   **REQUEST RECEIVED**, select **ENABLE ADMISSION ALERTS** once, accept the
   native prompt, and observe either the enabled host hint or the truthful
   setup-requested state. The access request timestamp and state must not
   change.
5. Confirm one new signed subscription pair through the same fixed events, then
   admit the account through the existing reviewed Hermes dry-run, mutation,
   and postflight sequence. Require the operator receipt to show provider
   acceptance for the exact pending-request generation before the SpacetimeDB
   mutation is submitted. Provider acceptance proves Farcaster handoff, not
   device presentation or that the player opened the alert.
6. Require one approval notification for that request generation. Its target
   must be exactly `https://warpkeep.com/?miniApp=true`. Tap it and verify the
   calm confirmation state, fresh Quick Auth, current admission, current Terms
   when required, and entry through the existing canonical keep. No
   notification context may create a second keep or bypass Terms.
7. Disable notifications or remove Warpkeep again, require the fixed
   unsubscribe events, and confirm Realm access remains unchanged. Repeat the
   complete acceptance on current Farcaster iOS and Android before declaring
   the client rollout complete.

The sole pending-request notification is `Welcome to the Hegemony Empire` with
`The gates have answered your name. Cross the threshold, Founder—your legacy awaits.`
It contains no realm name or player identity. The admitted-epoch payload is
retired and must be cancelled without delivery. Any copy change requires a
separate reviewed Worker rollout.

For rollback, first return the Hermes literal and
`VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED` to `false`, restoring the
admission blackout, then set `APPROVAL_NOTIFICATIONS_ENABLED=false` and deploy
the last reviewed frontend. Leave the webhook verifier and client configuration
available so signed disable/remove events can erase stored tokens. Keep the
manifest webhook, `v5` class, binding, and cleanup implementation; do not
destructively delete private state, disable public authentication, or revoke
admission. Do not remove the cleanup path until at least 366 days after the last
possible accepted enable event and a separately reviewed zero-state drain proof
exists.

## 6. Bounded owner smoke test

Use one owner-controlled account. Verify sign-in, current agreement acceptance,
admission, realm snapshot, own-castle authority, public profile presentation,
resource tooltips, and one non-destructive read of each live component. Do not
exercise other users, expose QR/proof material, or alter production data merely
to create evidence.

## Recovery

- Frontend: redeploy the last known-good protected commit.
- Bridge: disable public authentication first, then roll back the Worker.
- SpacetimeDB: do not attempt destructive schema rollback. Leave additive
  tables inert, stop component setup, and restore service compatibility through
  a reviewed forward change.
- Ambiguous operator result: disconnect, obtain fresh credentials, and inspect
  schema and counts before deciding any next step.
- Suspected credential exposure: stop and use the private credential-rotation
  procedure in [reconstruction/credential-rotation.md](reconstruction/credential-rotation.md).

For full service restoration, use the
[deployment recovery guide](reconstruction/deployment-recovery.md) and
[incident command checklist](reconstruction/incident-command.md).

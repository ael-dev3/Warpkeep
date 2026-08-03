# Alpha activation and recovery

This runbook covers deliberate Warpkeep production releases. It is not an
authorization record. A merge or green test run does not approve a Worker
publish, SpacetimeDB publication, data migration, resource seed, admission
change, or public-auth change.

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

Obtain one short-lived Hermes credential through the private local path and run
the bounded aggregate checks:

```sh
npm run stdb:inspect-alpha-v3 -- --json
npm run stdb:inspect-alpha-v4 -- --json
```

If the currently deployed module already exposes procedure v8, also run:

```sh
npm run stdb:inspect-alpha-v8 -- --json
```

For releases after the Water/Stone suffix has been published, also run:

```sh
npm run stdb:inspect-alpha-v10 -- --json
```

After the Worker v12 suffix exists, its separate aggregate inspection is:

```sh
npm run stdb:inspect-alpha-v12 -- --json
```

After the Daily Marks v14 suffix is active, also run its closed aggregate
inspection. It reports counts and invariant flags only:

```sh
npm run stdb:daily-marks:inspect
```

The first v12 publication cannot run that procedure beforehand. Its guarded
publisher instead requires an anonymous schema description of the immutable
database identity to match the exact 47-table v11 predecessor.

The first additive publication that introduces v8 cannot use it as a
pre-publication check. Record counts privately. The v8 status contains only
schema/backend versions, resource/forest policy identifiers and digests, and
aggregate table counts. A partial or drifted catalog is a hard stop.

## 3. Publish an additive module

Use the guarded root publisher only after its local proof receipt matches the
frozen release commit. The publisher pins the reviewed CLI and canonical
database identity, verifies the issuer and current aggregates, and invokes
SpacetimeDB with deletion disabled.

```sh
npm run stdb:publish:dev -- --dry-run \
  --resource-rollout-stage=ready \
  --genesis-world-stage=expanded \
  --worker-rollout-stage=active \
  --worker-module-predecessor=exact-v14-active \
  --worker-forward-repair=none
```

Those stage values describe the current production predecessor; do not copy
them if a fresh read-only inspection disagrees. This dry run checks the local
artifact, pinned CLI, issuer, expectation format, and selected stage contract;
it does not inspect Maincloud or publish. Review the result, then use the same
explicit stage arguments without `--dry-run` and with the publisher's exact
confirmation variable set through the private operator environment.

The private operator environment must also supply all four founded-state
counts: `WARPKEEP_EXPECTED_FOUNDER_COUNT`,
`WARPKEEP_EXPECTED_ENABLED_ALLOWED_FID_COUNT`,
`WARPKEEP_EXPECTED_PLAYER_COUNT`, and
`WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT`. Founder rows remain the durable
castle-state count; the enabled allowlist count may be lower after an admission
is revoked. Both are checked independently before and after publication.
The standalone production verifier accepts the corresponding
`--expected-enabled-allowed-fid-count=<count>` founded-stage flag; omitting it
keeps the compatibility assertion that every founder remains enabled.

Do not substitute raw `spacetime publish` commands. If publication times out or
returns an ambiguous result, do not republish. A fresh read-only inspection must
establish the live schema and counts before any further release decision.

`--worker-forward-repair=none` is the normal fail-closed selection. A named
forward-repair value is release-specific and may be used only when its exact
counts-only checkpoint, reviewed module ABI, private operator, and explicit
production authorization all match; it is never a general repair mode.
The guarded repair publication writes an owner-only success receipt after its
post-publication checkpoint. The matching one-shot operator requires that
recent receipt, a clean protected `main`, and a fresh artifact proof before it
can submit:

```sh
npm run stdb:worker-return-repair:inspect
npm run stdb:worker-return-repair:apply -- --confirm
```

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

Module publication and component setup are separate decisions. Review each
component's local dry run:

```sh
npm run stdb:seed-alpha-component -- gold --dry-run
npm run stdb:seed-alpha-component -- forest --dry-run
npm run stdb:seed-alpha-component -- food --dry-run
npm run stdb:seed-alpha-component -- wood --dry-run
npm run stdb:seed-alpha-component -- water --dry-run
npm run stdb:seed-alpha-component -- stone --dry-run
```

The dry run reads no credential or production state and submits no mutation;
it presents only the compiled policy and intended component. Use the real v8
inspection above to decide whether activation is safe.

Use `--confirm` only for the component currently approved. Gold, forest, Food,
and Wood use the v8 checkpoint; Water and Stone use v10. Each command seeds only
an empty or already-complete component and checks that unrelated counts did not
change. It will not repair partial or altered data.

Water remains invisible after seeding. Inspect v10 again, review the local
activation plan, then activate it separately:

```sh
npm run stdb:activate-alpha-water -- --dry-run
npm run stdb:activate-alpha-water -- --confirm
npm run stdb:inspect-alpha-v10 -- --json
```

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
a SpacetimeDB schema change. Roll them out in this order:

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
4. Enable and attest the backend gate while the public manifest still has no
   `webhookUrl`. This proves configuration and route isolation, but it cannot
   prove a real client event: Farcaster clients discover the endpoint from the
   production-domain manifest.
5. Publish the manifest `webhookUrl` alone as a bounded canary. After manifest
   convergence, use one owner-controlled production client to generate a real
   enable/add event followed by a disable/remove event. Confirm only
   privacy-safe static evidence; never retain the signed body or token.
6. Keep `VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED=false` until both signed
   canary events pass. Then change only that public presentation gate to the
   literal value `true` in a reviewed frontend release; it does not enable the
   Worker or grant admission.
7. Give Hermes the operator secret through its private environment. A committed
   admission may call the notification route best-effort; if delivery cannot be
   queued, preserve the admission result and reconcile later with
   `npm run stdb:notify-admitted -- <fid> --confirm`.

### Owner canary and end-to-end acceptance

The signed production canary is still outstanding unless a private release
record contains all evidence below. Automated webhook fixtures do not satisfy
it.

1. Record the exact reviewed frontend and Worker SHAs, UTC start time, live
   manifest digest, redacted notification configuration attestation, and the
   fact that the client presentation gate is still `false`. Do not record a
   real FID, webhook body, notification token, or delivery URL.
2. Use a dedicated owner-controlled account in the exact production Mini App.
   Before any admission or `notify-admitted` action for that test cycle, accept
   Farcaster's native add prompt. In the bounded log window, require exactly the
   fixed events `miniapp_webhook_verified` and
   `miniapp_notification_subscribed`; no caller data is valid evidence.
3. Disable Warpkeep notifications or remove Warpkeep in the same client. Require
   the fixed events `miniapp_webhook_verified` and
   `miniapp_notification_unsubscribed`. This proves the signed opt-out reached
   the private erasure path. Confirm ordinary authentication still works and no
   approval notification was sent during this canary.
4. After review, enable the client presentation gate in one narrow release and
   verify the deployed build SHA. With a fresh pending request cycle, confirm
   **REQUEST RECEIVED**, select **ENABLE ADMISSION ALERTS** once, accept the
   native prompt, and observe either the enabled host hint or the truthful
   setup-requested state. The access request timestamp and state must not
   change.
5. Confirm one new signed subscription pair through the same fixed events, then
   admit the account through the existing reviewed Hermes dry-run, mutation,
   and postflight sequence. Admission remains authoritative even if the
   notification side effect fails. If the automatic side effect is ambiguous,
   run `npm run stdb:notify-admitted -- <fid> --confirm` once; accept only
   `queued`, `already-sent`, `delivery-exhausted`, or `not-subscribed`.
6. Require one approval notification for the resulting positive auth epoch.
   Its target must be exactly `https://warpkeep.com/?miniApp=true`. Tap it and
   verify the calm confirmation state, fresh Quick Auth, current admission,
   current Terms when required, and entry through the existing canonical keep.
   No notification context may create a second keep or bypass Terms.
7. Disable notifications or remove Warpkeep again, require the fixed
   unsubscribe events, and confirm Realm access remains unchanged. Repeat the
   complete acceptance on current Farcaster iOS and Android before declaring
   the client rollout complete.

The current Worker copy is intentionally unchanged during this frontend stage:
`The Hegemony admits you` (23 characters) and
`Your keep awaits in Genesis 001. Enter the living Realm.` (56 characters).
Both are bounded and privacy-safe. Any copy change requires a separate reviewed
Worker rollout.

For rollback, set `APPROVAL_NOTIFICATIONS_ENABLED=false` first, then return
`VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED=false` and deploy the last
reviewed frontend. Leave the webhook verifier and client configuration
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

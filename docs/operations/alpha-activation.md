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
  --worker-rollout-stage=empty
```

Those stage values describe the current production predecessor; do not copy
them if a fresh read-only inspection disagrees. This dry run checks the local
artifact, pinned CLI, issuer, expectation format, and selected stage contract;
it does not inspect Maincloud or publish. Review the result, then use the same
explicit stage arguments without `--dry-run` and with the publisher's exact
confirmation variable set through the private operator environment.
Do not substitute raw `spacetime publish` commands. If publication times out or
returns an ambiguous result, do not republish. A fresh read-only inspection must
establish the live schema and counts before any further release decision.

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

# Access requests

An access request is a private expression of interest from a server-verified
Farcaster account. It stores only the FID, a server-derived admission cycle,
and the SpacetimeDB request time. It does not grant access, reserve a castle,
or create player state.

Never-admitted and disabled founders can both apply. Repeated submission in
the same admission cycle is idempotent. Re-enablement resolves the current
request; a later revocation requires a new submission and database timestamp.
Disabling or re-enabling a founder does not remove or rebuild their castle,
ownership, profile, resources, workers, schedules, or other persistent state.

List pending requests through the existing private Hermes credential path:

```sh
npm run stdb:list-access-requests
```

The command is read-only, shows at most 100 oldest pending requests, and
reports the FID, UTC request time, request state, and current admission state.
Continue a page with the exact cursor printed by Hermes:

```sh
npm run stdb:list-access-requests -- \
  --after-requested-at-micros <u64> \
  --after-fid <fid>
```

Use `--limit 1..100`, `--json`, or `--include-resolved` only when needed.
Resolved requests remain private history and are omitted by default.

Admission is deliberately separate. For a missing FID, create and review the
existing trusted admission plan and explicitly run `admit-founder`. For a
disabled founder whose retained graph has passed review, explicitly run
`allow-fid`. Listing never fetches a profile and never admits or edits state.

## Owner canary reset

The exceptional reset command exists for a controlled founder reapplication
test. It atomically disables one existing founder and deletes only that FID's
exact application row:

```sh
# Replace secure-admin-secret-command with the approved local secret source.
export WARPKEEP_SPACETIMEDB_DATABASE=c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e
secure-admin-secret-command | npm run stdb:reset-access-request -- \
  FID 'non-sensitive audit note' --input-stdin --dry-run
# Review the private 0600 plan reference printed above. Pass its non-sensitive
# random filename and digest as arguments; pipe the administrator secret through
# stdin only:
secure-admin-secret-command | npm run stdb:reset-access-request -- \
  REVIEWED_PLAN_FILENAME REVIEWED_PLAN_SHA256 --input-stdin --confirm
```

Both stages are online, pinned to the immutable production database identity,
and require the Hermes administrator credential through stdin. The confirmed
stage binds the mutation to the exact
auth epoch plus request cycle and timestamp read immediately beforehand, and
verifies aggregate preservation afterward. The 30-minute reviewed plan is
claimed once immediately before submission. Never create or submit another
plan after an ambiguous timeout. Reconcile first with:

```sh
npm run stdb:inspect-access-request-reset -- <fid>
```

An already-disabled/no-application plan is a no-op. A committed application
deletion is safe to replay because the missing exact row is its receipt; a new
application is independently protected by the exact cycle and timestamp. An
enabled/no-application revocation has no such receipt and therefore fails
closed on replay.
The castle, ownership, profile, Terms history, Marks, resources, workers, and
schedules remain intact. The private audit row remains intact as the operation
receipt.

This reset does not change Farcaster notification consent or its signed token.
Removing the Mini App or changing notifications is a Farcaster client action;
the database operator must never imitate it.

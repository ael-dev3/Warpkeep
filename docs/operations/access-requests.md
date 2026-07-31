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
`allow-fid`. Listing never fetches a profile and never admits, edits, or
deletes a request.

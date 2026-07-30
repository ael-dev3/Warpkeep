# Access requests

An access request is a private expression of interest from a server-verified
Farcaster account. It stores only the FID and the first SpacetimeDB request
time. It does not grant access, reserve a castle, or create player state.

List pending requests through the existing private Hermes credential path:

```sh
npm run stdb:list-access-requests
```

The command is read-only, shows at most 100 oldest requests, and reports the
FID, UTC request time, and current admission state. Continue a page with the
exact cursor printed by Hermes:

```sh
npm run stdb:list-access-requests -- \
  --after-requested-at-micros <u64> \
  --after-fid <fid>
```

Use `--limit 1..100`, `--json`, or `--include-resolved` only when needed.
Resolved requests remain private history and are omitted by default.

Admission is deliberately separate: select a FID, create and review the
existing trusted admission plan, then explicitly run the existing
`admit-founder` operation. Listing never fetches a profile and never admits,
edits, or deletes a request.

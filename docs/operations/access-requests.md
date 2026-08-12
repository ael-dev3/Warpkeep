# Access requests

> Greater Realm cutover freeze: legacy access-request npm operators and direct
> TypeScript entrypoints are deliberately unavailable. Use only an exact row
> in the reviewed
> [production launch envelope](./greater-realm-production-launch-envelope.sh.txt).
> There is currently no trusted row for listing or owner-canary reset.

An access request is a private expression of interest from a server-verified
Farcaster account. It stores only the FID, a server-derived admission cycle,
and the SpacetimeDB request time. It does not grant access, reserve a castle,
or create player state.

Never-admitted and disabled founders can both apply. Repeated submission in
the same admission cycle is idempotent. Re-enablement resolves the current
request; a later revocation requires a new submission and database timestamp.
Disabling or re-enabling a founder does not remove or rebuild their castle,
ownership, profile, resources, workers, schedules, or other persistent state.

Pending-request listing is unavailable during this cutover freeze. The former
list operator remains a refusal stub and must not be invoked through npm or a
direct TypeScript fallback. A future release may restore bounded private
listing only through a separately reviewed trusted-launch row.

Admission is deliberately separate. For a missing FID, use only the reviewed
`hermes-admit-dry` and `hermes-admit-confirm` envelope rows. For a disabled
founder whose retained graph has passed review, use only `hermes-allow-dry` and
`hermes-allow-confirm`. Listing never fetches a profile and never admits or
edits state.

Both mutation paths fail closed on the current world authority. While legacy
founding is explicitly open, Hermes preserves the exact v3/v4 100-slot graph
checks. Once the Greater Realm is current, new founding instead requires the
admin-only cutover aggregate to report the active, exact 600-slot v17
claim/slot/cell/occupancy/account/worker graph and remaining capacity. A v17
re-enable uses the separate target-specific proof for that founder's exact
claim, resources, four-worker roster, disabled epoch, and pending request CAS;
it does not consume capacity. Prepared, draining, canary, halted, corrupt, or
mode-changing checkpoints submit no admission mutation.

The checked-in Hermes notification-delivery approval literal is also `false`.
That temporary activation-client blackout permits read-only/dry-run review but
blocks confirmed new-founder admission and existing-founder re-enable before
notification transport, administrator-token issuance, database connection,
plan claim, or reducer submission. It may become `true` only in the coordinated
final phase with the Worker delivery and Pages presentation gates; it never
authorizes skipping the required pre-admission notification.

## Owner canary reset

Owner-canary reset and reset inspection are unavailable during the cutover.
Their npm aliases are refusal stubs, and the reviewed launch envelope has no
replacement row. Do not pass an administrator secret through the environment
or a shell pipe, and do not invoke the historical entrypoint directly. Any
future reset must add a command-specific trusted row and re-review its
state-binding, ambiguity recovery, and preservation guarantees before use.

This reset does not change Farcaster notification consent or its signed token.
Removing the Mini App or changing notifications is a Farcaster client action;
the database operator must never imitate it.

## First-time notification recovery

A never-admitted founder cannot use owner-canary reset. If the exact pending
request is still `missing` admission and its notification reached
`delivery-exhausted`, use only these reviewed launch-envelope rows:

- `hermes-notification-inspect FID` for the notification status;
- `hermes-notification-recover-dry FID 'non-sensitive reviewed recovery note'`
  to create the private recovery plan; and
- `hermes-notification-recover-confirm REVIEWED_PLAN_FILENAME
  REVIEWED_PLAN_SHA256` to consume that exact plan.

The envelope receives canonical owner-private administrator- and
notification-secret file paths according to the selected row. It opens each
secret late with no-follow identity checks. Never carry secret values in the
environment, pipe them through a shell, or substitute a direct npm/TypeScript
invocation.

The dry-run requires the exact missing/pending request timestamp, token-free
`delivery-exhausted` diagnostics, zero prior recoveries, current notification
consent, and the immutable production targets. The 30-minute plan binds that
entire diagnostic snapshot and is claimed before submission. The bridge then
rechecks both admission and the request timestamp and permits only that plan ID.
A competing plan conflicts; replaying the same ID is idempotent.

Recovery preserves the exhausted receipt and the original deterministic
notification ID. A sent receipt always wins and can never be reset. Neither
stage changes admission or any database row. Run the ordinary reviewed
`admit-founder` flow only after token-free diagnostics report `already-sent`;
`queued`, `delivery-exhausted`, and `not-subscribed` all leave admission
pending. Without notification consent, recovery remains blocked unless the
owner grants a separate explicit policy change; this recovery mechanism cannot
override that boundary.

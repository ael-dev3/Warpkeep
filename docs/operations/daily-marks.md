# Daily Marks operations

Community Marks are issued by SpacetimeDB, not by a local scanner. The former
external-event workflow is retired. Warpkeep does not read blockchain events
or account-address associations to issue Marks, and there is no local Marks
launch agent or application command.

The active policy grants one Mark per admitted player through server-owned
daily scheduling. Browser requests cannot mint Marks. Admission revocation
pauses future grants without deleting the player's castle, resources, or
existing Mark balance.

## Operational boundary

Module publication must preserve the deployed append-only schema and must not
activate or backfill the daily schedule by itself. Before a reviewed activation,
operators verify counts-only invariants, including that every retired
compatibility table remains empty and every legacy compatibility total remains
zero.

Activation and existing-account migration are explicit, separately reviewed
SpacetimeDB operations. They must establish exactly one recurring schedule, move
eligible accounts to the current policy, and prove that a repeated activation
does not issue a duplicate grant. Private player rows, receipts, identities,
tokens, and logs must never be copied into issues, commits, chat, or screenshots.

Routine verification is counts-only: schedule cardinality, eligible account
count, grant count, account invariant violations, and public-projection
violations. A mismatch stops the rollout for review. It must not be repaired by
direct table writes or by deleting retained Alpha state.

The schedule retries hourly during each UTC day. Operations may restore the
canonical schedule after an interruption, but must not synthesize a grant for a
past day: the deployed state does not prove whether admission stayed enabled
throughout that historical day.

The old schema names remain only where required for additive compatibility.
They are frozen, private, and outside every active authority path.

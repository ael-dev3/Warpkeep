# Greater Realm v17 founding authority

Status: implemented behind the existing profiled admission reducers. The
Greater Realm import and activation mutation gates remain compiled false, and
this design adds neither a reducer nor a table.

## Entry and replay boundary

`admin_admit_founder_v1` and
`admin_admit_founder_for_access_request_v2` retain their existing operator,
trusted-profile, and (for the latter) exact request-CAS checks. Both converge on
`ensureGenesisFounder`. An established v16, relocated v17, or directly founded
v17 graph is validated and returned byte-identically before any fresh-founding
phase or capacity check.

A fresh v17 founder is accepted only while the sole activation, release,
atlas, and worker roots are all exactly `active`. Canary, halted, draining,
pre-cutover, rolled-back, missing, and corrupt states fail closed. Resuming an
already committed release reopens founding because the immutable
`activatedAt` commit evidence remains present and the current roots are active
again.

## One-transaction write set

The server captures the finalized 600-slot topology and replays every existing
claim through the canonical balanced selector. The next slot is selected from
the least-populated Tier-I regions, breaking ties by the lowest available
private allocation rank. No reducer argument contains a region, slot, rank,
cell, coordinate, castle ID, allocation sequence, or timestamp.

The same admission transaction creates exactly one trusted profile, zero-state
daily Marks account, auto-incremented public castle, private founded v17 claim,
identity-minimized public occupancy, zero-state four-resource inventory, four
idle workers, and—when Inner Keep has ever activated—one idle Builder. It then
advances `postCanaryFoundingCount` and `nextAllocationSequence` by one and
updates both worker-system roots to the same castle count, worker count, and
roster digest. Any failure rolls the complete write set, including the admission
row inserted earlier by the reducer, back atomically.

The 600th castle is valid. A fresh 601st castle fails before founder writes,
while replay of an established 600th founder remains read-only and available in
active or halted mode.

## Passive yield

Relocated founders remain bound to their immutable v16 terrain preimage.
Directly founded v17 castles derive passive production only from the selected
cell's declassified `yieldClass` under
`greater-realm-founded-passive-yield-v1`:

- class 1 → existing `lowland` rates;
- class 2 → existing `meadow` rates;
- class 3 → existing `ridge` rates;
- class 0, malformed values, and future unreviewed classes → reject.

This projection deliberately reuses the existing ten-minute settlement
quantum, per-resource inventory cap, expedition reservation rules, and
food/wood/stone/gold account shape. Passive Gold remains zero and therefore
expedition-only.

# Genesis 001 admission-monitor suspension

This operation is non-runnable from every Task 6B-6E preparation intermediate
commit. Task 6B changes two current raw closure members without refreeze and
begins the stale-pin interval. Task 6C's surface intersects 21 current raw
members total, including those same two, and adds 19 newly distinct members;
the union through Task 6C is 21. Task 6C continues the interval, and Tasks 6D
and 6E continue it. Protected prepared and sealed-realms/
live workflows must fail closed throughout; focused task-specific source/
module/static tests cannot be reported as full-green workflow evidence. Task 7
alone atomically refreezes the closure manifest, workflow pins, and all
downstream consumers. Only its green first run and zero-diff second run restore
executability.

The local Hermes admission monitor is read-only: it inventories pending access
requests and emits private operator notifications, but it cannot admit, allow,
reset, disable, re-enable, or otherwise mutate a player. The sealed-realms
release nevertheless requires it disabled and unloaded before the activation/
PTR presentation boundary.

Keep the monitor loaded until all of the following are true in exact source
mode `S`:

1. checkout `HEAD`, protected remote `main`, workflow input commit, inert
   preparation binding, and successful Verify SHA are identical;
2. both G002 and PTR are published, the fresh PTR identity is bound to the
   deployed prepared bridge, and `g002-import-inspect` has authenticated the
   exact prepared receipt/source/expiry, completed deploy-or-recovery journal,
   fresh deployment and PTR-binding attestations, plus authoritative POST/
   OPTIONS suspension evidence;
3. G002 and ownerless PTR atlas imports are finalized and live-inspected;
   their independent fresh `g002Gate`/`ptrGate` confirmations were consumed by
   the corresponding applies, and both immutable receipt cross-links bind one
   unchanged `deploymentAuthority`;
4. PTR configured-owner provisioning and live inspection have succeeded; and
5. both passes of both mandatory G001 evidence pairs are stable: the unchanged
   applicant archive and the distinct admitted-player census.

The authenticated bridge history must obey one exact physical grammar: one
deployment authority, zero-or-more abandoned G002 gates, one final consumed
G002 gate, one `g002ImportAuthorityCrossLink`, zero-or-more abandoned PTR gates,
one final consumed PTR gate, then one `ptrImportAuthorityCrossLink`. Each new
gate names its immediately superseded same-lane predecessor; the old gate is
never modified and only the final gate is cross-linked. Forks, cycles, skipped
predecessors, or a gate after its lane cross-link fail closed.

If the prepared receipt expires before both realm cross-links exist, the old
authority chain cannot receive another gate and the release stops. The only
recovery is the protected prepared workflow's internal
`recover-expired-authority-read-only` action and
`runAuthBridgeNotificationPreparedReadOnlyRecovery`, exact outcome
`verified-read-only-recovery`; it is not another dispatcher operation. The
ordinary receipt writer always invokes its deploy callback and is not used.
Fresh protected-run/`S`, Cloudflare control-plane, public Worker, credentialed
private Worker, and PTR-binding attestations must prove the unchanged
deployment/source/PTR binding before one new content-addressed receipt and
completed no-deploy recovery head are appended.

The expired receipt/head/authority file remains byte-identical and terminal.
The new physical authority filename is deterministically derived as
`auth-bridge-import-authority-<authorityChainDigest>.jsonl`; orphan or duplicate
eligible pairs, revival, mutation, deploy/reducer replay, or drift fails closed.
Existing G002 inspect/apply freshly adopts an already-completed G002 receipt on
the new chain through a dispatcher branch that never calls its import core or
reducer. Existing PTR inspect/apply may then use the equivalent branch for a
completed receipt, or prove no effect and call its missing import core/reducer
once.

`g001-census-first` collects pass one of both pairs. After 60-300 seconds,
`g001-census-second-inspect` collects pass two, requires distinct timestamps
and nonces plus private stability within each pair, and issues the fresh
one-time suspension confirmation. The applicant proof and admitted-player proof
do not substitute for one another. The admitted-player proof preserves the
complete existing enabled set and stable auth epochs without exposing a FID,
epoch, player count, or normalized/raw private digest.

Only `g001-census-second-suspend` may consume that exact confirmation, and it
must consume it before releasing any monitor mutation authority. The fixed G001
bundle then disables the exact launchd service target and boots it out while
keeping the plist and program installed. It must prove two final observations
with `disabled=true` and `loaded=false` and must not invoke an admission,
allow-list, auth-epoch, disable, re-enable, or player reducer.

An ambiguous launchctl result writes reconciliation state, invalidates the
consumed confirmation permanently, and permits only read-only adoption/resume/
no-effect proof through the same existing operation lane. It never authorizes a
retry with the old digest.

Immediately before activation evidence inspection/generation, run
`g001-current-state` in `S`. Require its fresh canonical receipt to prove the
same fixed label, program/plist hashes, G001 0.3.43 target, exact source `S`,
`disabled=true`, and `loaded=false`, with observation no more than five minutes
old at generation. A historical suspension receipt cannot substitute for this
current-state proof.

After that current-state receipt, `activation-evidence-inspect` must reopen the
same deployment authority, both lane gates, and both immutable receipt cross-
links, then freshly reattest and repeat both POST and OPTIONS probes. A changed
source, PTR binding, deployed version, cross-lane substitution, expired/
abandoned confirmation revival, stale/swapped proof, replay/redeploy ambiguity,
or ambiguous result blocks
generation; none may be supplied by the caller. This bridge re-probe neither
changes the two census pairs nor adds an operation name.

The suspension and current-state receipts remain canonical bounded owner-owned
regular single-link mode-`0600` private files below the existing audit root.
Terminal/public output contains only approved opaque commitments and booleans,
never applicant/admitted-player data, FIDs, epochs, counts, raw digests, receipt
bodies, or absolute paths. Re-enabling requires a future reviewed release and
has no operation in this workflow.

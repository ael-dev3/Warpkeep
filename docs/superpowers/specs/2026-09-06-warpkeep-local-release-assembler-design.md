# Local complete release assembler

## Scope and authority

Implement the complete final preparation transaction required by Task 7 of
`docs/superpowers/plans/2026-08-30-warpkeep-0.4.0-preparation.md`, using the
local runtime from `2026-09-05-warpkeep-local-release-preparation-design.md`.
This is an implementation refinement under the owner's standing authorization,
not permission to relax production authentication or change admissions.

The output must be a usable complete prepared source candidate. A bundle cache,
standalone manifest, partial pin update or successful unit suite is insufficient.
Final live deployment, remaining gameplay integration, local deployment migration,
protected PR integration and Desktop handoff remain separate required work.

## Existing interfaces and gaps

The accepted `derivePreparedAllRealmLinuxBindings()` provides one source identity,
G001 zero-diff/compatibility evidence and copied G002/PTR binding bytes. The accepted
`derivePreparedLinuxOperationBundles()` provides one source identity and four
twice-built, actually loaded bundle bodies with graph manifests and export facts.
Neither returns bundle declarations or installs repository artifacts.

The accepted `deriveAuthBridgeNotificationPreparedDeployClosure({memberBodies})`
generates a manifest and three workflow pin updates for its exact current fixed
inventory. It shares verification projections but grants no authority. The final
assembler must derive the expanded inventory before invoking the corresponding
generated verifier; passing an arbitrary inventory override is not supported.

Current `writeFamily` only publishes a new directory with at most eight files.
It cannot replace this release's dispersed existing files or recover interrupted
multi-file replacements. Do not describe that helper as the final transaction.

## Architecture

Use a fixed Linux entrypoint with three internal responsibilities: complete
derivation, durable installation/recovery, and independent post-install checking.
Keep the public operating profile
`warpkeep-spacetime-binding-final-preparation-linux-x64-v1`. No caller executor,
compiler, source-byte map, package path or evidence callback is production authority.

Run durable candidate installation on the owned WSL Linux filesystem, in a
dedicated independently captured repository. Do not claim that an NTFS checkout
has Linux rename/fsync guarantees. The existing Windows checkout remains the
editable source; export a verified candidate for reviewed Git integration only
after its native transaction and checks succeed. Preserve unrelated Windows edits.

Capture a committed source and verify the binding and bundle results have exactly
that profile, commit and tree. Reject mixed snapshots. Recheck source and target
identity before staging, before publication and during final checking. Compiler
workers remain disposable and credential-free; no production secret enters this
assembler. Retain failure diagnostics privately, without raw credentials or data.

Derive the entire exact Task 7 output surface: G002/PTR bindings, four bundle and
declaration pairs, bundle manifest, closure policy/inventory/manifest, and every
listed generated consumer/workflow/test pin or count. Derive declarations from
the existing source ABI and validate them against each bundle's exact exports;
do not invent generic signatures or make declarations optional. G001 bindings
and all fixed G001 adoption projection bytes are validation-only, never outputs.

Resolve generated facts in dependency order. Project only already defined
generated pin positions; do not broaden release projections to hide arbitrary
changes. Reject an unresolved dependency cycle, missing consumer, unknown slot,
duplicate slot or ambiguous source shape instead of iterating hashes indefinitely.
All returned outputs must be covered by the exact installation allowlist.

## Transaction and recovery

Acquire an exclusive candidate-local lock before modifying any target. Stage
complete new bytes and recoverable old bytes as same-filesystem private siblings;
validate canonical containment, ownership, modes, file identity and digests.
Write and fsync a bounded journal before replacing targets. Record the exact
source identity, output namespace and before/after digests, not private data.

Every restart must inspect unfinished transaction state before accepting a
candidate. Recovery either completes the already recorded exact transaction or
restores its recorded prior bytes; changed identities or unrecognized files stop
recovery without overwriting them. A successful rename alone is not completion.
Fsync affected files/directories and require full post-install verification before
marking the journal complete or publishing a usable candidate.

Write and check must use identical derivation rules. The first write must produce
the entire passing output family. A second write and check must produce zero
diff, including declarations, bindings, workflow values and exact-count tests.
Partial or uncertain state must never mint verification or deployment authority.

## Verification and ordering

Use disposable real Linux repositories to exercise normal write/check/recovery,
interruption at each journal/publication boundary, stale or concurrent writers,
symlinks, file/mode drift, unknown output, missing consumer, invalid declarations,
mixed source identities and oversized data. Keep tests bounded and demonstrate
that failed recovery preserves unexpected user bytes. Test complete-family
convergence and G001 byte preservation, not merely journal serialization.

Implement the assembler now, but do not perform the final release freeze until
remaining gameplay and local deployment source changes are complete. Existing
Darwin deployment checks and the stale fixed closure inventory remain real release
gaps; assembler acceptance must not be confused with their resolution.

# Native preparation transaction recovery — 2026-09-07

Status: implemented and independently reviewed; publication checkpoint.
Base commit: `b24f7c2fa1ad90afce4419229396f2d1d1237ffa`.

The recovery entry consumes the bounded journal and exclusive candidate lock.
It restores recorded existing files, removes recorded newly installed files,
checks the entire family before mutation, and retains journal/terminal evidence.
Unknown or changed bytes stop recovery. Tests preserve an untouched G001 sentinel.
This is preparation-file recovery, not database recovery or deployment authority.

## Regression evidence

- Identical-byte terminal inode replacement during cleanup previously returned
  success. Pinning the terminal identity now stops cleanup and preserves remaining
  staged evidence. Pending-to-final rename preserves stable identity fields while
  allowing the filesystem's rename-induced ctime change.
- Restart after terminal rename previously began unlinking without a transaction
  directory fsync. Restart after the last cleanup unlink could return without one.
  Both tests failed before the correction. Recovery now unconditionally syncs the
  transaction directory before cleanup and before success, with validation.
- Tests use real child processes killed with SIGKILL and actual Linux files.
  The sync-order audit wraps real filesystem calls in the test child only.
  This demonstrates process-interruption recovery and call ordering, not simulated
  hardware power-loss durability.
- Malformed transaction IDs now reject before creating a candidate lock, with
  a failing-then-passing native regression. A supplemental real child interruption
  also verifies restart after pending-terminal file fsync, before rename.
- Independent bounded review approved the implementation after the identity,
  durability, per-entry re-observation, and input-validation corrections. This
  approval does not cover initial installation or full release assembly.

## Verification

Actual Ubuntu-24.04 / Linux x64 / UID 1000 / Node 22.22.3, private temporary
Linux filesystem repositories, copied current source and existing dependencies:

```text
wsl -d Ubuntu-24.04 -- /tmp/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/.superpowers/release-journal-linux-check.mjs --recovery
18 passed, 1 unsupported-host test skipped; exit 0 (2.09 seconds)
```

Windows Node 22.22.3:

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/localReleaseTransactionRecovery.test.ts tests/localReleaseRecoveryJournal.test.ts tests/localReleaseCandidateLock.test.ts
59 passed, 32 native-host tests skipped; exit 0 (2.80 seconds)
This Windows run preceded the supplemental Linux pending-terminal test.

.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -b
exit 0
```

The ignored Linux fixture runner is local diagnostic infrastructure, not a
production identity or release artifact. Native tests and the child fixture are
repository sources. Initial staging, successful installation, complete-family
assembly/convergence, broader crash coverage, deployment, owner PTR gameplay,
performance gates, and write-preserving database recovery remain incomplete.

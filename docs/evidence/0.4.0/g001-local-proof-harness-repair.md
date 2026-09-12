# G001 local proof harness repair — 2026-09-07

Base source: `6c620c26d0df26e84c1253a0c021fa61a42e1053`.

The artifact test now respects the production fixed Linux UID 1000 requirement:
other inode owners must be rejected. Byte mutation, inode replacement, and hard-link
rejection remain tested. Production code is unchanged.

The startup test previously advanced Date.now by ten seconds on every cleanup
clock read, exhausting both containment grace periods without letting the real
child exit. This was reproduced on Ubuntu 24.04: STARTUP_TIMEOUT was accompanied
by CONTAINMENT_FAILED in AggregateError. The test now overrides only the three
startup clock reads and restores real clock behavior for containment. It also
requires promise rejection explicitly, rather than accepting an undefined result.

Verification with Node 22.22.3 and Vitest 4.1.9:

- Windows: 9 passed, 2 skipped.
- Native WSL Ubuntu 24.04, UID 1000: 10 passed, 1 skipped.
- Same Linux suite under `unshare --user --map-user=1001 --map-group=1001`:
  10 passed, 1 skipped, including rejection of the non-admitted artifact owner.
- Root `tsc -b`: exit 0.

Command: `node node_modules/vitest/vitest.mjs run tests/genesis001LocalUpgradeProof.test.ts`.
Linux used a disposable archive of the base commit with this test overlaid and
existing Linux dependencies. No production credentials or database were used.
The skipped source-graph integration gate is not established by these results;
this is harness evidence, not a live G001 upgrade or release completion claim.

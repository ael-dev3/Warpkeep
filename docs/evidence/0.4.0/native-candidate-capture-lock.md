# Native candidate capture and lock composition — 2026-09-07

An actual disposable Linux integration probe joined the existing
`captureFixedOperationBundleSource`, its independent `materialize` boundary,
and `acquirePreparedReleaseCandidateLock`. No new snapshot implementation or
replacement locking scheme was needed for this composition.

Captured source commit: `2b9467dd9f4b8547c9efc7560e2bdba0f77be5a1`.
Captured source tree: `47d82fda10d643a01897c8bb4e2a5e7f0f3cb838`.

Result: exit 0, `captured-locked-not-installed`.

Verified with real Git and kernel locking, not mocks:

- Fixed UID 1000, Node 22.22.3 executable path, private native ext4 run directory.
- Git executable digest/ownership checked through the existing bounded reader.
- Committed source captured in a private independent checkout.
- A second, distinct independent candidate checkout materialized at the same
  exact commit and tree, with both working trees clean.
- Existing captured-source and candidate checks passed before and after locking.
- A second lock acquisition failed with `LOCAL_RELEASE_LOCK_BUSY`.
- The first lock was released and a subsequent lock acquisition succeeded.
- Successful probe cleanup validated the exact owned run path and its original
  device/inode before removing only that disposable run directory. Both clones
  are reproducible from the recorded commit; the editable checkout was untouched.

```text
wsl -d Ubuntu-24.04 --user snapmeter -- /usr/bin/env -i LANG=C.UTF-8 LC_ALL=C.UTF-8 /home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/.superpowers/native-candidate-capture-probe.mjs
```

The ignored probe fixes its repository and private run roots, uses the accepted
source-capture implementation, and emits metadata only. It does not install
generated files or grant release authority. This test establishes that existing
capture/materialization and lock primitives compose on the intended filesystem;
it does not establish a complete production assembler API.

## Next integration boundary

The assembler can reuse these primitives to retain an immutable source beside
a separately locked candidate, then require the real binding/bundle coordinator
to match that independently captured source identity. Source integrity checks
must remain separate from allowed generated changes in the candidate.

Complete output derivation, journaled staging/publication, independent final
checks and repeat-write convergence still need integration. No partial candidate
may satisfy Task 7, remove its workflow fence or count as the final release freeze.
G001 production baseline and live preservation remain unverified by this probe.

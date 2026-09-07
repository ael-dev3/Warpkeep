# Guarded native release workspace — 2026-09-07

Implemented the fixed, zero-argument `capturePreparedLinuxReleaseWorkspace`
resource boundary. It retains an independently captured source and a distinct
locked candidate on the private native Linux filesystem. Releasing the workspace
closes its lock; it does not publish artifacts or delete diagnostic checkouts.

## Actual native verification

Captured source commit: `c70606498bf0860dde6a9f817917456ef27de62d`.
Captured source tree: `e087e89e6ae532d376c0b380365a575b6c263fb3`.

The disposable integration probe exited 0 with
`workspace-native-guards-passed`. Real Git, filesystem reads, and kernel locking
verified all seven assertions:

- A concurrent candidate lock is denied.
- A generated candidate edit is allowed during assembly but fails the clean gate.
- A source edit fails the source-cleanliness gate.
- A source byte change hidden from Git status by a temporary `assume-unchanged`
  index flag is still rejected by raw committed-blob verification.
- Special source permission bits are rejected even with unchanged content.
- Candidate directory mode drift is rejected.
- A released workspace cannot be reused.

The probe restored its temporary source bytes, index flag, and modes. On success
it verified the exact private run path and original device/inode before removing
only its own disposable run directory. No editable checkout or production state
was modified by these fault injections. Earlier failed probe checkouts remain
private diagnostics; no broad cleanup was performed.

Reproduction on the configured local toolchain:

```text
wsl -d Ubuntu-24.04 --user snapmeter -- /usr/bin/env -i LANG=C.UTF-8 LC_ALL=C.UTF-8 /home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/.superpowers/native-release-workspace.mjs
```

This command uses an ignored local diagnostic, not a distributed release command.
The checked-in regression suite covers the public workspace boundary with mocks;
it must not be represented as the real native probe.

## Regression and review evidence

The focused Windows run passed 105 tests with 15 platform-specific skips across
`localReleaseWorkspace`, `localReleaseArtifactInputs`, `localReleaseCandidateLock`,
`localReleaseRecoveryJournal`, and `localOperationBundleRuntime`. The workspace
suite contains 20 tests. TypeScript `tsc -b` exited 0.

Review identified special-mode-bit validation and nonfatal Git pathname decoding
gaps. Both received failing regression tests before correction. Raw Git output
now receives fatal UTF-8 decoding and byte round-trip validation; source files
must match the full canonical permission bits. Bounded re-review found no
remaining Critical or Important issue.

Two earlier native probe failures reflected an overly narrow diagnostic expected
error: Git correctly rejected changed source before the raw-byte gate. The final
probe explicitly hides its disposable source edit from Git status to exercise
the separate byte gate, and restores that flag afterward. Failed runs were not
counted as passes.

## Remaining integration

This is source/candidate capture and guarding, not the complete assembler.
The independently captured identity must still be joined to the real artifact
producer results, followed by complete Task 7 output derivation, durable staging
and installation, independent verification, and repeat-write convergence.
No workflow fence is removed and no final release freeze or live acceptance is
claimed. G001 live preservation and owner PTR gameplay remain separate gates.

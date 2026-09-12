# Native candidate lock — 2026-09-07

Base: `ade770881018a5029cc866ddf168b9e7f638ec73`.

Added fixed Linux candidate mutual exclusion for the forthcoming assembler.
It uses a permanent empty lock inode inside the candidate's `.git`, a bounded
isolated system-Python `flock` helper, and a descriptor retained by the parent.
The lock is neither unlinked nor truncated. Invalid existing evidence is not
repaired. Only a newly exclusively created inode receives exact mode0600,
including under a restrictive process umask.

The host boundary is Linux x64 / UID1000 / Node22.22.3 on an owned ext4
candidate; Windows and non-ext4 roots are rejected. This is advisory locking
and substitution detection for a trusted owned candidate, not protection from
a hostile same-UID process and not source/deployment authority.

## Evidence

- Native RED: three behavioral failures before implementation.
- Real restrictive-umask regression RED: expected acquisition instead returned
  `LOCAL_RELEASE_LOCK_FILE_INVALID`; corrected only new-descriptor permissions.
- Final WSL Ubuntu/ext4 lock suite: 14 passed, one unsupported-host test skipped,
  415 ms. Actual separate processes prove busy rejection, normal reacquisition,
  reacquisition after SIGKILL, stable inode reuse, and descriptor release after
  lock substitution. A real tmpfs candidate is rejected before lock creation.
- Independent read-only review approved this bounded component after the umask
  correction; no remaining component findings. It did not approve the installer.
- Windows combined lock/journal suite: 58 passed, 15 explicit native skips,
  2.46 seconds; this verifies unsupported-host rejection, not native locking.
- Pinned `node node_modules/typescript/bin/tsc -b`: exit 0.

Run with pinned Node22.22.3:
`node node_modules/vitest/vitest.mjs run tests/localReleaseCandidateLock.test.ts`.
Linux ran the source and test/child fixture in a disposable private native root;
no production candidate, runner registration, database, or provider was changed.

Mandatory successor work remains native staging, journal and rollback-terminal
fsync ordering, interrupted-publication recovery, complete output derivation,
independent post-install verification and convergence. This component has no
operating assembler caller yet and cannot install or finalize a release.

## Existing CI remains incomplete

Authenticated inspection of Verify `34066214945` (source `0c8cb59`) found the
Linux job terminal with 12 failed files / 85 failed tests. In particular, 17
lifecycle failures now reach `PTR_LOCKED_SOURCE_BUILD_INPUT_INVALID` at
`canonicalDirectory`, beyond the earlier corrected fixture-ownership boundary.
These failures are not resolved by the new lock. Native-contract, recovery and
auth-bridge jobs passed; the database job was still running when checked.

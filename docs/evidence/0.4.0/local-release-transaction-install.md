# Native candidate installation — 2026-09-07

Implemented the missing journaled publication primitive in
`scripts/local-release-transaction-install.mjs`, with a matching declaration.
It is an internal installer, not the complete release assembler and not a
deployment entrypoint. Its only success status is `installed-unverified`.

The installer:

- Takes copied, bounded, sorted output bytes only within the existing Task 7
  namespace. The namespace check is shared with the recovery journal codec.
  G001 bindings and arbitrary paths are rejected before any candidate write.
- Requires the existing owned Linux/ext4 candidate lock, pinned Node host,
  canonical paths and directories, exact source commit/tree and a clean initial
  candidate. It compares existing target bytes to committed blobs even if Git's
  assume-unchanged flag hides an edit.
- Creates private same-filesystem staging and original-byte backups. It checks
  written bytes and the still-open inode identity, fsyncs them, then fsyncs the
  exact bounded journal before any target replacement.
- Checks the complete family before and after publication and each affected
  target/stage/backup before its rename. It rechecks source, lock, directory and
  journal identity during publication, with file and directory fsyncs after
  replacement. It does not repeatedly hash the entire family for every file.
- Retains the journal and backups. The existing recovery operation restores
  replaced targets and removes only transaction-created files with matching
  identities. Unexpected user bytes stop recovery rather than being overwritten.
- Rejects an existing transaction directory; it never silently abandons or
  overwrites an earlier transaction. A failure before a valid journal exists
  leaves targets unchanged and retains private staging for investigation.

## Verification

The selected files were copied into the disposable Linux test workspace
`/tmp/warpkeep-g001-harness.uqgCie`. This is a fixture overlay, not a claim that
the entire workspace is the latest integrated repository. No production
credentials or databases were involved.

With pinned Linux Node 22.22.3, ran:

```text
node node_modules/vitest/vitest.mjs run tests/localReleaseTransactionInstall.test.ts tests/localReleaseTransactionRecovery.test.ts tests/localReleaseRecoveryJournal.test.ts --maxWorkers=1
```

Result: **92 passed, 1 platform-conditional skip**, three files, 4.95 seconds.
Coverage includes dispersed replacements and creations, a 22-file family, exact
restoration and repeat recovery, actual SIGKILL after journal fsync and after
each of two target renames, concurrent-lock refusal, dirty/assume-unchanged
targets, wrong source, links, mode drift, unfinished transactions, staging byte
and same-byte inode substitutions, and a user-created late target that neither
installation nor recovery may overwrite. Protected G001 fixture bytes remain
unchanged.

The older rollback test file initially ran in the repository's default browser
emulation and had nine failures. The same suite passed with `--environment=node`;
the test file now explicitly selects Node, matching its native filesystem and
subprocess contract. No production recovery check was changed for this repair.

Windows: **59 passed, 34 Linux-only skips**. These are not native installation
results. Root `tsc -b --pretty false` and installer syntax check exited 0.
The three test files also passed a strict standalone TypeScript check using
`--ignoreConfig --noEmit --target ES2023 --module ESNext --moduleResolution Bundler --skipLibCheck --strict --types node`.

## Remaining acceptance

No production or final prepared candidate was installed. Full-family source
derivation, missing generated consumers, new-parent/deletion support if required
by the actual generated family, completed-journal lifecycle, independent final
verification, repeat-write convergence and reviewed candidate export remain
assembler work. Existing activation/production-source work must also finish
before final freeze. This component does not close R11–R13.

## Captured workspace connection

Commit `e8716ddfede628fae49fd69a6872710c713a9703` connects the captured workspace
to installation without attempting a second, conflicting acquisition of its
already-held lock. The lock module authenticates genuine active leases in a
private WeakMap and binds each to its exact candidate root. Forged callback
objects, released leases and wrong-root leases are rejected. The under-lock
installer never releases the caller's lease, including on failure. The workspace
supplies its own captured source coordinates and checks the immutable source
again after installation. The installer and journal codec are now included in
the fixed bootstrap-control source checks for this new import chain.

The explicit credential-free native integration probe passed:

```powershell
wsl -d Ubuntu-24.04 -- /usr/bin/env -i HOME=/home/snapmeter PATH=/home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin:/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC /home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/tests/fixtures/localReleaseWorkspaceNativeProbe.mjs
```

Session 4545 exited 0 for source tree
`c72231294edbad7dddc86aa77a21790d094d7781`. It captured the real committed
repository into fresh private source/candidate directories, installed the exact
existing bytes of `scripts/genesis002_module_bindings/index.ts`, checked the held
lock against a competing acquisition, released it explicitly, and rolled back
with the existing recovery implementation. Before and after, the target SHA-256
was `7f3790b57c9fabd1b93bb93e4ef8329217f717ae0026cf4d8a7a843a99a6b876`.
The capture/install/recovery path used no filesystem or Git mocks. An earlier
attempt correctly rejected uncommitted bootstrap control changes; committing
them, not disabling the source check, allowed this exact-source run.

Expanded Linux installer/journal/recovery tests: **96 passed, 1 conditional
skip**. Windows workspace/installer/lock/bundle-runtime suites: **44 passed,
32 platform skips**. Root and targeted strict TypeScript checks exited 0.
The workspace unit tests mock capture/installation to isolate wiring; the
native probe above is separate evidence of their actual integration.

This probe intentionally installs identical bytes for one existing file. It
does not demonstrate complete-family generation, declaration/consumer pin
coverage, repeat-write convergence, final verification or deployment. Private
probe workspaces are retained for diagnostics, not exported as release builds.

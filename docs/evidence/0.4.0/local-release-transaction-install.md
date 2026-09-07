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

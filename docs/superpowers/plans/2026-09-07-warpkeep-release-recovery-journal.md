# Prepared release recovery journal implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the bounded recovery record and all-target rollback reconciliation used by the complete local release assembler.

**Architecture:** Separate pure record validation/reconciliation from native file operations. A prepared transaction always restores its recorded prior bytes after interruption; the accepted specification permits restoration instead of forward completion. Reconciliation returns a complete action list only after all observed targets, backups, and staged files match recorded identities. It grants no source, verification, or deployment authority.

**Tech Stack:** Node built-ins, ESM, TypeScript declarations, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-06-warpkeep-local-release-assembler-design.md`, transaction/recovery section and Task 7's exact output surface in `2026-08-30-warpkeep-0.4.0-preparation.md`.

## Global constraints

- Preserve profile `warpkeep-spacetime-binding-final-preparation-linux-x64-v1`.
- No G001 bindings or arbitrary paths in the output namespace.
- Caller data is not authenticated authority; no callback, filesystem adapter, private bytes, or credential enters this record.
- The native installer must independently capture facts from regular non-symlink files, enforce ownership/containment, hold the exclusive lock, fsync staging and this journal before publication, and recheck immediately before each operation.
- This component does not install files, mark a transaction complete, or replace the complete-family derivation, Linux transaction, independent verification, and convergence requirements.

## Task 1: Bounded journal and all-target rollback decisions

**Files:** Create `scripts/local-release-recovery-journal.mjs`, its `.d.mts`, and `tests/localReleaseRecoveryJournal.test.ts`.

**Interfaces:**

- `encodePreparedReleaseJournal(record): Uint8Array` and `decodePreparedReleaseJournal(bytes): PreparedReleaseJournal` validate and copy the same exact canonical record.
- `planPreparedReleaseRollback({journal, observations}): readonly {path, operation: 'retain'|'restore-backup'|'remove-created'}[]` is pure and validates every entry before returning actions.
- Record: `{schemaVersion:1, profile, transactionId, sourceCommit, sourceTree, candidate:{dev,ino,uid:1000,mode:448}, entries:[{path,before:null|{target,backup},after}]}`.
- File facts: `{dev,ino,uid:1000,mode,size,sha256}`; mode 384 or 420, decimal canonical device/inode strings, inode positive, size 0–8 MiB, lowercase 64-hex SHA-256. All recorded files use the candidate device; distinct recorded inodes prevent backup/target aliasing. Original and backup bytes/size/mode must match.
- Observations: exact ordered `{path,target,backup,stage}` records, each file fact or null; no implicit missing observations. Maximum 2048 entries, 2 MiB encoded journal, 128 MiB aggregate original/new bytes. Paths sorted and unique, static Task 7 files or canonical `.ts` descendants of the two eligible binding roots.

- [x] Write tests that catch changed-source/namespace acceptance, missing bounds, aliasing, noncanonical JSON, and mutation of returned records. Example independently specified failures:

```ts
expect(() => decodePreparedReleaseJournal(Buffer.from('{}\n'))).toThrow();
expect(() => encodePreparedReleaseJournal({ ...record, entries: [
  { ...entry, path: 'scripts/genesis001_module_bindings/index.ts' },
] })).toThrow();
```

- [x] Watch those tests fail because the implementation is absent, then implement strict object/key/type/bound checks and canonical UTF-8 JSON copying. Reject extra fields and noncanonical byte encodings; errors contain a fixed code only.
- [x] Write hand-built interruption-state tests: original target + staged new + backup → retain; installed new + backup → restore-backup; restored backup inode at target + absent backup/stage → retain; newly installed file → remove-created; newly removed file → retain. Changed target/backup/stage, missing backup, missing stage before installation, or an inconsistent late entry rejects the whole decision.

```ts
expect(planPreparedReleaseRollback({ journal, observations: installed }))
  .toEqual([{ path: entry.path, operation: 'restore-backup' }]);
expect(() => planPreparedReleaseRollback({ journal, observations: tampered }))
  .toThrow('LOCAL_RELEASE_RECOVERY_STATE_INVALID');
```

- [x] Run RED, implement reconciliation without filesystem writes or callbacks, then run GREEN. Deep-copy/freeze accepted records and actions; never return caller-owned objects.
- [x] Run the focused suite and TypeScript check, review the exact diff, scan the outgoing commit, and push the reviewed checkpoint to the existing development branch. Delivered in `ade7708`.

## Native integration obligation

The successor installer must consume these functions, not accept a caller's action list as authority. It must generate the complete exact output family, capture and pin candidate/source identity, preflight the full namespace, stage independent backup/new inodes, durably write the encoded record, and re-read/validate it on every restart. Restoration consumes the recorded backup inode by rename; new-file rollback unlinks only the recorded installed inode. After a crash between rename and journal updates, inode matching identifies the already-restored target without trusting an in-memory progress counter. Unknown state stops without overwriting it.

Native tests must use disposable owned Linux repositories, crash at every staging/journal/publication/recovery boundary, and verify untouched unexpected bytes, all-family convergence and G001 preservation. No successful pure-parser test may be reported as that native proof. Final source freeze remains after required gameplay and local operating sources finish.

### Required rollback terminal and cleanup ordering

`retain` means no target mutation, not permission to discard its staged/backup
siblings. An unpublished existing target still requires both siblings while the
prepared journal is active. Deleting either early would make restart fail closed.

The native installer must finish and fsync every target restoration/removal and
its affected directories, re-read all targets, and independently verify the entire
recorded prior byte/mode family (including absent newly created paths). It then
rechecks source/candidate identity and exclusively writes a distinct canonical
rollback terminal record:

```js
({ schemaVersion: 1, status: 'rolled-back', journalSha256,
   candidate: { dev, ino }, sourceCommit, sourceTree })
```

This record's values come from the validated journal and fresh native evidence;
it is not caller completion input. Fsync the terminal file and transaction
directory before cleanup. Only then revalidate and unlink the exact remaining
stage/backup siblings, fsyncing the directory after each unlink. A terminal-aware
restart verifies the journal/terminal binding, full restored target family, and
all remaining sibling identities before continuing cleanup; it must not send a
partially cleaned terminal transaction through prepared-state reconciliation.
Unexpected files, changed bytes/identities, or an invalid terminal stop cleanup.
Keep the journal and terminal as bounded private evidence rather than creating
an unjournaled deletion window. Release the exclusive lock only after the
operation exits this verified state. A rollback terminal never marks a usable
release candidate or mints verification/deployment authority.

Native crash tests must cover the pre-terminal and post-terminal fsync boundary
and each cleanup unlink. This protocol is a mandatory integration requirement;
the pure codec/planner does not implement it.

## Task 2: Crash-released native candidate lock

**Files:** Create `scripts/local-release-candidate-lock.mjs`, its `.d.mts`,
`tests/localReleaseCandidateLock.test.ts`, and
`tests/fixtures/localReleaseCandidateLockChild.mjs`.

**Interfaces:** `acquirePreparedReleaseCandidateLock(candidateRoot)` returns
only frozen `assertActive()` and idempotent `release()` methods. It provides
mutual exclusion, not source/verification authority. The native installer must
hold it from source/target preflight through journal/terminal handling and cleanup.

- Require Linux x64, UID1000, Node22.22.3, a canonical private mode0700 candidate
  root and an owned, non-group/world-writable, non-symlink `.git` directory on
  the same ext4 filesystem. Fail closed on NTFS/DrvFS rather than claim Linux
  durability. This component deliberately does not accept a caller lock path,
  owner, helper, filesystem adapter or process-liveness callback.
- Use the permanent `.git/warpkeep-release-assembly.lock` inode, never unlink,
  replace, or truncate it. Open no-follow/exclusive-create (existing files must
  be regular, single-link, empty, owned1000, mode0600). Pin candidate, `.git`,
  descriptor and named lock identities before/after acquiring the lock.
  Set mode0600 on the exclusively created descriptor to account for a restrictive
  umask; never change permissions on an existing inode.
- Adapt the existing B0 journal's inherited-descriptor `fcntl.flock(3,
  LOCK_EX|LOCK_NB)` pattern with fixed `/usr/bin/python3 -I`, clean environment,
  5-second deadline, bounded output and exact success marker. The parent retains
  the descriptor; no helper process or PID-file inference remains after acquisition.
- Fsync the lock descriptor and its directory. `assertActive()` rechecks the
  owned directory chain and descriptor/name identity. `release()` always closes
  the held descriptor, even if validation finds substitution, and reports that
  substitution without touching the replacement path.
- [x] Write native tests demonstrating a second process is excluded while the
  first owns the lock, then succeeds after first release and after actual SIGKILL.
  Use disposable private ext4 fixtures only; never signal a user process.

```js
const lock = acquirePreparedReleaseCandidateLock(candidateRoot);
lock.assertActive();
// Separate child against the same fixture must exit with the fixed BUSY code.
lock.release();
// A new child must acquire the unchanged permanent lock inode successfully.
```

- [x] Write negative tests for symbolic-link root/`.git`/lock, wrong modes,
  nonempty or hardlinked lock, named-lock substitution and use-after-release.
  Unsupported Windows hosts must reject before filesystem writes, not skip into
  a simulated successful Linux path.
- [ ] Run RED, implement the fixed lock, run Windows negatives and actual Linux
  process tests, run TypeScript, request independent review and push the exact
  checkpoint after scanning it. Retain the separate installer/journal/terminal/
  crash-durability/full-family requirements; a lock test cannot satisfy them.

The boundary is a trusted, exclusively owned candidate with advisory lock
coordination and substitution detection. It does not isolate against a hostile
process running as the same UID. The installer must preserve the existing
disposable-worker/credential separation and fresh checks before every mutation.

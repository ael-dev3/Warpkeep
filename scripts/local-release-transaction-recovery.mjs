import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, constants, fchmodSync, fsyncSync, lstatSync,
  openSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { acquirePreparedReleaseCandidateLock, assertPreparedReleaseCandidateLock } from './local-release-candidate-lock.mjs';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { decodePreparedReleaseJournal, planPreparedReleaseRollback } from './local-release-recovery-journal.mjs';

const MAX_FILE = 8 * 1024 * 1024;
const FACT_KEYS = ['dev', 'ino', 'uid', 'mode', 'size', 'sha256'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function fail() { const error = new Error('LOCAL_RELEASE_TRANSACTION_RECOVERY_INVALID'); error.code = error.message; throw error; }
const present = path => lstatSync(path, { throwIfNoEntry: false }) !== undefined;
const same = (left, right) => left === null || right === null ? left === right : FACT_KEYS.every(key => left[key] === right[key]);

function directory(path, device, privateMode = false) {
  const status = lstatSync(path, { bigint: true });
  if (!status.isDirectory() || status.isSymbolicLink() || status.uid !== 1000n
      || String(status.dev) !== device || (status.mode & 0o022n) !== 0n
      || (privateMode && (status.mode & 0o7777n) !== 0o700n)
      || realpathSync(path) !== path) fail();
  return status;
}

function syncPath(path, isDirectory) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW
    | (isDirectory ? constants.O_DIRECTORY : 0));
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

/** Restore only a recorded prepared transaction; never mint release authority. */
function recover(candidateRoot, transactionId, suppliedLock) {
  if (typeof transactionId !== 'string' || !/^[0-9a-f]{32}$/u.test(transactionId)) fail();
  const ownsLock = suppliedLock === undefined;
  if (!ownsLock) assertPreparedReleaseCandidateLock(suppliedLock, candidateRoot);
  const lock = ownsLock ? acquirePreparedReleaseCandidateLock(candidateRoot) : suppliedLock;
  let primary;
  let result;
  try {
    const controlRoot = join(candidateRoot, '.git', 'warpkeep-release-assembly-v1');
    const transactionRoot = join(controlRoot, transactionId);
    const rootStatus = lstatSync(candidateRoot, { bigint: true });
    const device = String(rootStatus.dev);
    const control = directory(controlRoot, device, true);
    const transaction = directory(transactionRoot, device, true);
    const journalPath = join(transactionRoot, 'journal.json');
    const opened = readLocalBindingBoundedFile(journalPath, {
      maximumBytes: 2 * 1024 * 1024, expectedUid: 1000, expectedMode: 0o600,
    });
    const journalDigest = digest(opened.body);
    let journal;
    try { journal = decodePreparedReleaseJournal(opened.body); } finally { opened.body.fill(0); }
    if (journal.transactionId !== transactionId || journal.candidate.dev !== device
        || journal.candidate.ino !== String(rootStatus.ino)) fail();
    const allowedNames = new Set(['journal.json', 'rolled-back.pending', 'rolled-back.json']);
    journal.entries.forEach((entry, index) => {
      allowedNames.add(`new-${index}`);
      if (entry.before !== null) allowedNames.add(`old-${index}`);
    });
    function sourceIdentity() {
      for (const [ref, expected] of [['HEAD', journal.sourceCommit], ['HEAD^{tree}', journal.sourceTree]]) {
        const git = spawnSync('/usr/bin/git', ['--no-replace-objects', '-c', 'core.hooksPath=/dev/null', 'rev-parse', '--verify', ref], {
          cwd: candidateRoot, env: { PATH: '/usr/bin:/bin', HOME: '/nonexistent',
            GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0' },
          encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 4096,
        });
        if (git.error !== undefined || git.status !== 0 || git.signal !== null
            || git.stdout !== `${expected}\n` || git.stderr !== '') fail();
      }
    }
    function guard() {
      lock.assertActive();
      for (const [path, expected] of [[controlRoot, control], [transactionRoot, transaction]]) {
        const current = directory(path, device, true);
        if (current.ino !== expected.ino || current.mode !== expected.mode) fail();
      }
      readLocalBindingBoundedFile(journalPath, { maximumBytes: 2 * 1024 * 1024,
        expectedUid: 1000, expectedMode: 0o600, expectedSha256: journalDigest,
        expectedIdentity: opened.identity, discardBody: true });
      if (readdirSync(transactionRoot).some(name => !allowedNames.has(name))) fail();
      sourceIdentity();
    }
    function fact(path) {
      // Validate all ancestors, including for an absent leaf. O_NOFOLLOW on
      // the leaf alone would not protect a replaced parent directory.
      let current = candidateRoot;
      for (const part of relative(candidateRoot, dirname(path)).split('/')) {
        if (!part || part === '.' || part === '..') fail();
        current = join(current, part); directory(current, device);
      }
      if (!present(path)) return null;
      const file = readLocalBindingBoundedFile(path, { maximumBytes: MAX_FILE, expectedUid: 1000 });
      try {
        return { dev: file.identity.dev, ino: file.identity.ino, uid: 1000,
          mode: Number(BigInt(file.identity.mode) & 0o7777n), size: Number(file.identity.size), sha256: digest(file.body) };
      } finally { file.body.fill(0); }
    }
    const observation = (entry, index) => ({ path: entry.path,
      target: fact(join(candidateRoot, entry.path)), backup: fact(join(transactionRoot, `old-${index}`)),
      stage: fact(join(transactionRoot, `new-${index}`)),
    });
    const observations = () => journal.entries.map(observation);
    function priorFamily(observed) {
      observed.forEach((entry, index) => {
        const saved = journal.entries[index];
        if (saved.before === null ? entry.target !== null
          : !same(entry.target, saved.before.target) && !same(entry.target, saved.before.backup)) fail();
        if (entry.backup !== null && !same(entry.backup, saved.before?.backup ?? null)) fail();
        if (entry.stage !== null && !same(entry.stage, saved.after)) fail();
      });
    }
    const terminalBytes = Buffer.from(`${JSON.stringify({ schemaVersion: 1, status: 'rolled-back',
      journalSha256: journalDigest, candidate: { dev: journal.candidate.dev, ino: journal.candidate.ino },
      sourceCommit: journal.sourceCommit, sourceTree: journal.sourceTree })}\n`);
    const terminalPath = join(transactionRoot, 'rolled-back.json');
    const pendingPath = join(transactionRoot, 'rolled-back.pending');
    const terminalIdentities = new Map();
    function terminal(path) {
      const file = readLocalBindingBoundedFile(path, { maximumBytes: 4096, expectedBytes: terminalBytes.length,
        expectedUid: 1000, expectedMode: 0o600, expectedSha256: digest(terminalBytes),
        expectedIdentity: terminalIdentities.get(path), discardBody: true });
      if (file.identity.dev !== device) fail();
      terminalIdentities.set(path, file.identity);
      return file.identity;
    }
    guard();
    const hasTerminal = present(terminalPath);
    const hasPending = present(pendingPath);
    if (hasTerminal && hasPending) fail();
    if (hasTerminal) terminal(terminalPath);
    if (hasPending) terminal(pendingPath);
    if (!hasTerminal && !hasPending) {
      const initial = observations();
      const actions = planPreparedReleaseRollback({ journal, observations: initial });
      for (let index = 0; index < actions.length; index += 1) {
        guard();
        const current = observation(journal.entries[index], index);
        if (!same(current.target, initial[index].target) || !same(current.backup, initial[index].backup)
            || !same(current.stage, initial[index].stage)) fail();
        const targetPath = join(candidateRoot, actions[index].path);
        if (actions[index].operation === 'restore-backup') {
          renameSync(join(transactionRoot, `old-${index}`), targetPath);
          syncPath(targetPath, false);
        } else if (actions[index].operation === 'remove-created') unlinkSync(targetPath);
        syncPath(dirname(targetPath), true); syncPath(transactionRoot, true);
      }
    }
    guard(); priorFamily(observations());
    if (!hasTerminal) {
      // Re-fsync all restored targets even when a previous process died just
      // after rename, before reaching its original fsync call.
      for (const entry of journal.entries) {
        const path = join(candidateRoot, entry.path);
        if (entry.before !== null) syncPath(path, false);
        syncPath(dirname(path), true);
      }
      syncPath(transactionRoot, true);
      if (!hasPending) {
        const fd = openSync(pendingPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        try { writeFileSync(fd, terminalBytes); fchmodSync(fd, 0o600); fsyncSync(fd); }
        finally { closeSync(fd); }
      }
      guard(); priorFamily(observations());
      const pendingIdentity = terminal(pendingPath);
      if (present(terminalPath)) fail();
      renameSync(pendingPath, terminalPath); syncPath(transactionRoot, true);
      const finalIdentity = terminal(terminalPath);
      if (['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeNs']
        .some(key => pendingIdentity[key] !== finalIdentity[key])) fail();
    }
    guard(); terminal(terminalPath); priorFamily(observations());
    // A preceding process may have died after the terminal rename but before
    // its directory fsync. Re-establish durability before removing evidence.
    syncPath(transactionRoot, true);
    guard(); terminal(terminalPath);
    // Only verified siblings are removed, after the rollback terminal is durable.
    for (let index = 0; index < journal.entries.length; index += 1) {
      for (const [name, expected] of [[`old-${index}`, journal.entries[index].before?.backup ?? null],
        [`new-${index}`, journal.entries[index].after]]) {
        guard(); terminal(terminalPath);
        const path = join(transactionRoot, name);
        const current = fact(path);
        if (current === null) continue;
        if (!same(current, expected)) fail();
        unlinkSync(path); syncPath(transactionRoot, true);
      }
    }
    guard(); terminal(terminalPath); priorFamily(observations());
    // Also cover restart after the last unlink, when no siblings remain to
    // trigger the per-unlink sync above.
    syncPath(transactionRoot, true);
    guard(); terminal(terminalPath); priorFamily(observations());
    result = Object.freeze({ status: 'rolled-back', transactionId });
  } catch (error) { primary = error; }
  if (ownsLock) { try { lock.release(); } catch (error) { primary ??= error; } }
  if (primary !== undefined) fail();
  return result;
}

export function recoverPreparedReleaseTransaction(...args) {
  if (args.length !== 2) fail();
  return recover(args[0], args[1], undefined);
}

/** Preserve a genuine caller-held lease across rollback and its operating
 * completion record. The lease remains held on both success and failure. */
export function recoverPreparedReleaseTransactionUnderLock(...args) {
  if (args.length !== 3 || args[2] === undefined) fail();
  return recover(args[0], args[1], args[2]);
}

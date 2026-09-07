import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { types } from 'node:util';
import { acquirePreparedReleaseCandidateLock, assertPreparedReleaseCandidateLock } from './local-release-candidate-lock.mjs';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { encodePreparedReleaseJournal, isPreparedReleaseOutputPath } from './local-release-recovery-journal.mjs';

const MAX_FILE = 8 * 1024 * 1024;
const FACT_KEYS = ['dev', 'ino', 'uid', 'mode', 'size', 'sha256'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function fail() { const error = new Error('LOCAL_RELEASE_TRANSACTION_INSTALL_INVALID'); error.code = error.message; throw error; }
const same = (a, b) => a === null || b === null ? a === b : FACT_KEYS.every(key => a[key] === b[key]);
const present = path => lstatSync(path, { throwIfNoEntry: false }) !== undefined;
function exact(value, keys) {
  if (types.isProxy(value) || value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== keys.length || keys.some(key => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value');
      })) fail();
}
function inputs(value) {
  exact(value, ['candidateRoot', 'sourceCommit', 'sourceTree', 'files']);
  if (typeof value.candidateRoot !== 'string' || typeof value.sourceCommit !== 'string'
      || typeof value.sourceTree !== 'string' || !/^[a-f0-9]{40}$/u.test(value.sourceCommit)
      || !/^[a-f0-9]{40}$/u.test(value.sourceTree) || types.isProxy(value.files) || !Array.isArray(value.files)
      || value.files.length < 1 || value.files.length > 2048
      || Reflect.ownKeys(value.files).length !== value.files.length + 1) fail();
  let total = 0;
  let previous = '';
  const seen = new Set();
  const files = [];
  try {
    for (let index = 0; index < value.files.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value.files, index);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail();
      const file = descriptor.value;
      exact(file, ['path', 'bytes']);
      if (!isPreparedReleaseOutputPath(file.path) || file.path <= previous || seen.has(file.path.toLowerCase())
          || types.isProxy(file.bytes) || !(file.bytes instanceof Uint8Array) || file.bytes.byteLength > MAX_FILE) fail();
      total += file.bytes.byteLength;
      if (total > 64 * 1024 * 1024) fail();
      previous = file.path; seen.add(file.path.toLowerCase());
      files.push({ path: file.path, bytes: Buffer.from(file.bytes) });
    }
    return { candidateRoot: value.candidateRoot, sourceCommit: value.sourceCommit, sourceTree: value.sourceTree, files };
  } catch (error) { for (const file of files) file.bytes.fill(0); throw error; }
}
function sync(path, directory = false) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | (directory ? constants.O_DIRECTORY : 0));
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

/** Internal publication primitive, NOT a complete release assembler. Installs
 * only on an owned Linux candidate, retains rollback evidence, and deliberately
 * never marks the candidate prepared. Full-family derivation and independent
 * acceptance must precede any later completed journal or candidate export. */
function install(inputValue, suppliedLock, ownsLock) {
  const input = inputs(inputValue);
  let lock;
  try {
    const { candidateRoot, sourceCommit, sourceTree, files } = input;
    if (ownsLock) lock = acquirePreparedReleaseCandidateLock(candidateRoot);
    else {
      assertPreparedReleaseCandidateLock(suppliedLock, candidateRoot);
      lock = suppliedLock;
    }
    const root = lstatSync(candidateRoot, { bigint: true });
    const device = String(root.dev);
    const directories = new Map();
    function directory(path, privateMode = false) {
      const current = lstatSync(path, { bigint: true });
      if (!current.isDirectory() || current.isSymbolicLink() || current.uid !== 1000n
          || current.dev !== root.dev || (current.mode & 0o022n) !== 0n
          || (privateMode && (current.mode & 0o7777n) !== 0o700n) || realpathSync(path) !== path) fail();
      const before = directories.get(path);
      if (before && (current.ino !== before.ino || current.mode !== before.mode)) fail();
      directories.set(path, current);
    }
    function ancestors(path) {
      let current = candidateRoot;
      for (const part of relative(candidateRoot, dirname(path)).split('/')) {
        if (!part || part === '.' || part === '..') fail();
        current = join(current, part); directory(current);
      }
    }
    function git(arguments_, maximum = 4096) {
      const child = spawnSync('/usr/bin/git', ['--no-replace-objects', '-c', 'core.hooksPath=/dev/null',
        '-c', 'core.fsmonitor=false', ...arguments_], {
        cwd: candidateRoot, env: { PATH: '/usr/bin:/bin', HOME: '/nonexistent', GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0' },
        timeout: 5000, killSignal: 'SIGKILL', maxBuffer: maximum,
      });
      if (child.error !== undefined || child.status !== 0 || child.signal !== null || child.stderr.length !== 0) fail();
      return child.stdout;
    }
    function source() {
      if (git(['rev-parse', '--verify', 'HEAD']).toString() !== `${sourceCommit}\n`
          || git(['rev-parse', '--verify', 'HEAD^{tree}']).toString() !== `${sourceTree}\n`) fail();
    }
    function fact(path) {
      ancestors(path);
      if (!present(path)) return null;
      const file = readLocalBindingBoundedFile(path, { maximumBytes: MAX_FILE, expectedUid: 1000 });
      try {
        const result = { dev: file.identity.dev, ino: file.identity.ino, uid: 1000,
          mode: Number(BigInt(file.identity.mode) & 0o7777n), size: file.body.length, sha256: digest(file.body) };
        if (result.dev !== device || ![0o600, 0o644].includes(result.mode)) fail();
        return result;
      } finally { file.body.fill(0); }
    }
    function create(path, bytes, mode) {
      ancestors(path);
      const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
      let held;
      try { fchmodSync(fd, mode); writeFileSync(fd, bytes); fsyncSync(fd); held = fstatSync(fd, { bigint: true }); }
      finally { closeSync(fd); }
      const result = fact(path);
      if (result === null || result.dev !== String(held.dev) || result.ino !== String(held.ino)
          || result.mode !== mode || result.size !== bytes.length || result.sha256 !== digest(bytes)) fail();
      return result;
    }
    source();
    // No tracked or untracked candidate edits may be overwritten. Git's index
    // alone is insufficient: compare each target to its committed blob below.
    if (git(['status', '--porcelain=v1', '--untracked-files=all'], 4 * 1024 * 1024).length !== 0) fail();
    const prior = files.map(file => {
      const path = join(candidateRoot, file.path);
      const before = fact(path);
      const tree = git(['ls-tree', '-z', sourceCommit, '--', file.path]);
      if (tree.length === 0) { if (before !== null) fail(); }
      else {
        const match = /^(100644) blob ([a-f0-9]{40})\t([^\0]+)\0$/u.exec(tree.toString());
        if (!match || match[3] !== file.path || before === null || before.mode !== 0o644) fail();
        const bytes = git(['cat-file', 'blob', match[2]], MAX_FILE);
        try { if (bytes.length !== before.size || digest(bytes) !== before.sha256) fail(); }
        finally { bytes.fill(0); }
      }
      return before;
    });
    if (prior.reduce((sum, value) => sum + (value?.size ?? 0), 0)
        + files.reduce((sum, value) => sum + value.bytes.length, 0) > 128 * 1024 * 1024) fail();
    const controlRoot = join(candidateRoot, '.git', 'warpkeep-release-assembly-v1');
    if (present(controlRoot)) { directory(controlRoot, true); if (readdirSync(controlRoot).length !== 0) fail(); }
    else { mkdirSync(controlRoot, { mode: 0o700 }); directory(controlRoot, true); sync(dirname(controlRoot), true); }
    const transactionId = randomBytes(16).toString('hex');
    const transactionRoot = join(controlRoot, transactionId);
    mkdirSync(transactionRoot, { mode: 0o700 }); directory(transactionRoot, true); sync(controlRoot, true);
    const names = new Set();
    function guard() {
      lock.assertActive(); source();
      for (const path of directories.keys()) directory(path, path === controlRoot || path === transactionRoot);
      if (readdirSync(controlRoot).join(',') !== transactionId
          || readdirSync(transactionRoot).some(name => !names.has(name))) fail();
    }
    const entries = files.map((file, index) => {
      guard();
      if (!same(fact(join(candidateRoot, file.path)), prior[index])) fail();
      let before = null;
      if (prior[index] !== null) {
        const opened = readLocalBindingBoundedFile(join(candidateRoot, file.path), { maximumBytes: MAX_FILE,
          expectedUid: 1000, expectedSha256: prior[index].sha256 });
        try {
          names.add(`old-${index}`);
          before = { target: prior[index], backup: create(join(transactionRoot, `old-${index}`), opened.body, prior[index].mode) };
        } finally { opened.body.fill(0); }
      }
      names.add(`new-${index}`);
      const after = create(join(transactionRoot, `new-${index}`), file.bytes, 0o644);
      return { path: file.path, before, after };
    });
    const journal = encodePreparedReleaseJournal({ schemaVersion: 1,
      profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1', transactionId,
      sourceCommit, sourceTree, candidate: { dev: device, ino: String(root.ino), uid: 1000, mode: 448 }, entries });
    const journalPath = join(transactionRoot, 'journal.json');
    names.add('journal.json');
    const journalFact = create(journalPath, journal, 0o600);
    journal.fill(0); sync(transactionRoot, true);
    function publicationGuard(index, all = false) {
      guard();
      if (!same(fact(journalPath), journalFact)) fail();
      for (let i = all ? 0 : index; i < (all ? entries.length : index + 1); i += 1) {
        const entry = entries[i];
        if (!same(fact(join(candidateRoot, entry.path)), i < index ? entry.after : entry.before?.target ?? null)
            || !same(fact(join(transactionRoot, `new-${i}`)), i < index ? null : entry.after)
            || !same(fact(join(transactionRoot, `old-${i}`)), entry.before?.backup ?? null)) fail();
      }
    }
    // Check the whole family before the first effect and after the last. Each
    // intervening rename rechecks its own target/stage/backup plus the journal,
    // source and directory identities; no quadratic rereading of bundle bytes.
    publicationGuard(0, true);
    for (let index = 0; index < entries.length; index += 1) {
      publicationGuard(index);
      const target = join(candidateRoot, entries[index].path);
      renameSync(join(transactionRoot, `new-${index}`), target);
      sync(target); sync(dirname(target), true); sync(transactionRoot, true);
    }
    publicationGuard(entries.length, true);
    return Object.freeze({ status: 'installed-unverified', transactionId });
  } catch { fail(); }
  finally { for (const file of input.files) file.bytes.fill(0); if (ownsLock) lock?.release(); }
}

export function installPreparedReleaseTransaction(...args) {
  if (args.length !== 1) fail();
  return install(args[0], undefined, true);
}

/** Uses only a genuine active lease, leaving it held on success AND failure. */
export function installPreparedReleaseTransactionUnderLock(...args) {
  if (args.length !== 2) fail();
  return install(args[0], args[1], false);
}

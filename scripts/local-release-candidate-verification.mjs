import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { isPreparedReleaseOutputPath } from './local-release-recovery-journal.mjs';

const MAX_FILE = 16 * 1024 * 1024;
const MAX_TOTAL = 256 * 1024 * 1024;
const MAX_FILES = 4096;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function fail() { throw new Error('LOCAL_RELEASE_CANDIDATE_VERIFICATION_INVALID'); }
function exact(value, keys) {
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== keys.length || keys.some(key => {
      const field = Object.getOwnPropertyDescriptor(value, key);
      return !field?.enumerable || !Object.hasOwn(field, 'value');
    })) fail();
}
function git(root, args, maximum = 4096) {
  const result = spawnSync('/usr/bin/git', ['--no-replace-objects', '-c', 'core.hooksPath=/dev/null',
    '-c', 'core.fsmonitor=false', ...args], { cwd: root, shell: false,
    env: { PATH: '/usr/bin:/bin', HOME: '/nonexistent', GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0' },
    timeout: 10000, killSignal: 'SIGKILL', maxBuffer: maximum });
  if (result.error !== undefined || result.signal !== null || result.status !== 0 || result.stderr.length !== 0) fail();
  return result.stdout;
}
function sourceIdentity(root, commit, tree) {
  for (const [ref, expected] of [['HEAD', commit], ['HEAD^{tree}', tree]]) {
    if (git(root, ['rev-parse', '--verify', ref]).toString('utf8') !== `${expected}\n`) fail();
  }
}
function sourceFiles(root, tree) {
  const bytes = git(root, ['ls-tree', '-r', '-l', '-z', tree], 1024 * 1024);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!Buffer.from(text).equals(bytes) || !text.endsWith('\0')) fail();
  const files = new Map();
  const casePaths = new Set();
  let total = 0;
  for (const line of text.slice(0, -1).split('\0')) {
    const match = /^(100644|100755) blob ([a-f0-9]{40}) +([0-9]+)\t([^\0]+)$/u.exec(line);
    if (!match) fail();
    const [, mode, oid, sizeText, path] = match;
    const size = Number(sizeText);
    if (!Number.isSafeInteger(size) || size > MAX_FILE || path.length > 512 || /[\\\x00-\x1f\x7f]/u.test(path)
      || path.split('/').some(part => !part || part === '.' || part === '..' || part === '.git')
      || casePaths.has(path.toLowerCase())) fail();
    casePaths.add(path.toLowerCase()); total += size;
    if (files.size >= MAX_FILES || total > MAX_TOTAL) fail();
    files.set(path, { oid, size, mode: mode === '100644' ? 0o644 : 0o755 });
  }
  if (files.size === 0) fail();
  return files;
}
function directory(path, device, privateMode = false) {
  const value = lstatSync(path, { bigint: true });
  if (!value.isDirectory() || value.isSymbolicLink() || value.uid !== 1000n
    || value.dev !== device || (value.mode & 0o022n) !== 0n
    || (value.mode & 0o7000n) !== 0n || (privateMode && (value.mode & 0o777n) !== 0o700n)
    || realpathSync(path) !== path) fail();
  return value;
}
function inventory(root, expected, device) {
  const found = new Set();
  const observedDirectories = new Map();
  const expectedDirectories = new Set();
  for (const file of expected.keys()) {
    const parts = file.split('/');
    for (let index = 1; index < parts.length; index++) expectedDirectories.add(parts.slice(0, index).join('/'));
  }
  let directories = 0;
  function visit(relative) {
    const path = relative ? join(root, relative) : root;
    observedDirectories.set(relative, directory(path, device, !relative));
    if (++directories > MAX_FILES) fail();
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (!relative && entry.name === '.git') {
        directory(join(root, '.git'), device);
        continue;
      }
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) fail();
      if (entry.isDirectory()) {
        if (!expectedDirectories.has(name)) fail();
        visit(name);
      } else if (entry.isFile()) {
        if (!expected.has(name) || found.has(name)) fail();
        found.add(name);
      } else fail();
    }
  }
  visit('');
  if (found.size !== expected.size) fail();
  return observedDirectories;
}

/** Internal read-only comparison, not a release receipt. The operating assembler
 * supplies freshly derived files and holds its native candidate lock throughout.
 * Every other tracked byte, including all G001 source/bindings, stays unchanged.
 */
export function verifyPreparedReleaseCandidateBytes(options) {
  try {
    exact(options, ['sourceRoot', 'candidateRoot', 'sourceCommit', 'sourceTree', 'files']);
    const { sourceRoot, candidateRoot, sourceCommit, sourceTree, files } = options;
    if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid?.() !== 1000
      || typeof sourceRoot !== 'string' || typeof candidateRoot !== 'string' || sourceRoot === candidateRoot
      || !/^[a-f0-9]{40}$/u.test(sourceCommit) || !/^[a-f0-9]{40}$/u.test(sourceTree)
      || !Array.isArray(files) || files.length < 1 || files.length > 2048) fail();
    const sourceDevice = lstatSync(sourceRoot, { bigint: true }).dev;
    const candidateDevice = lstatSync(candidateRoot, { bigint: true }).dev;
    const sourceDirectory = directory(sourceRoot, sourceDevice, true);
    const candidateDirectory = directory(candidateRoot, candidateDevice, true);
    sourceIdentity(sourceRoot, sourceCommit, sourceTree);
    sourceIdentity(candidateRoot, sourceCommit, sourceTree);
    const baseline = sourceFiles(sourceRoot, sourceTree);
    const expected = new Map(baseline);
    const outputs = new Map();
    const casePaths = new Map([...baseline.keys()].map(path => [path.toLowerCase(), path]));
    let previous = '';
    let outputBytes = 0;
    for (const file of files) {
      exact(file, ['path', 'bytes']);
      if (!isPreparedReleaseOutputPath(file.path) || file.path <= previous || outputs.has(file.path)
        || !(file.bytes instanceof Uint8Array) || file.bytes.byteLength > 8 * 1024 * 1024) fail();
      const alias = casePaths.get(file.path.toLowerCase());
      if (alias !== undefined && alias !== file.path) fail();
      casePaths.set(file.path.toLowerCase(), file.path);
      previous = file.path;
      outputBytes += file.bytes.byteLength;
      if (outputBytes > 128 * 1024 * 1024) fail();
      const fact = { size: file.bytes.byteLength, mode: 0o644, sha256: sha(file.bytes) };
      outputs.set(file.path, fact);
      expected.set(file.path, fact);
      if (expected.size > MAX_FILES) fail();
    }
    for (const prefix of ['scripts/genesis002_module_bindings/', 'spacetimedb/ptr/generated-bindings/']) {
      if (![...outputs.keys()].some(path => path.startsWith(prefix))) fail();
      // Producers return complete namespaces. The installer currently supports
      // replacement/addition, so an obsolete tracked binding must stop assembly
      // rather than silently surviving as an unrelated preserved file.
      if ([...baseline.keys()].some(path => path.startsWith(prefix) && !outputs.has(path))) fail();
    }
    const directorySets = [
      [sourceRoot, baseline, sourceDevice, inventory(sourceRoot, baseline, sourceDevice)],
      [candidateRoot, expected, candidateDevice, inventory(candidateRoot, expected, candidateDevice)],
    ];
    const fileIdentities = new Map();
    for (const [root, entries] of [[sourceRoot, baseline], [candidateRoot, expected]]) {
      let total = 0;
      for (const [path, expectedFile] of entries) {
        const opened = readLocalBindingBoundedFile(join(root, path), { maximumBytes: MAX_FILE,
          expectedUid: 1000, expectedMode: expectedFile.mode, expectedBytes: expectedFile.size,
          ...(expectedFile.sha256 ? { expectedSha256: expectedFile.sha256 } : {}) });
        try {
          if ((BigInt(opened.identity.mode) & 0o7777n) !== BigInt(expectedFile.mode)) fail();
          if (expectedFile.oid && createHash('sha1').update(`blob ${opened.body.length}\0`)
            .update(opened.body).digest('hex') !== expectedFile.oid) fail();
          fileIdentities.set(join(root, path), opened.identity);
          total += opened.body.length;
          if (total > MAX_TOTAL) fail();
        } finally { opened.body.fill(0); }
      }
    }
    sourceIdentity(sourceRoot, sourceCommit, sourceTree);
    sourceIdentity(candidateRoot, sourceCommit, sourceTree);
    // Recheck the entire namespace and all identities after the last byte read.
    // The lock serializes assemblers; these checks also detect unrelated edits
    // while a large tree was being inspected.
    for (const [root, entries, device, beforeDirectories] of directorySets) {
      const afterDirectories = inventory(root, entries, device);
      if (afterDirectories.size !== beforeDirectories.size) fail();
      for (const [relative, before] of beforeDirectories) {
        const after = afterDirectories.get(relative);
        if (!after || ['dev', 'ino', 'uid', 'mode', 'mtimeNs', 'ctimeNs']
          .some(field => before[field] !== after[field])) fail();
      }
    }
    for (const [path, before] of fileIdentities) {
      const after = lstatSync(path, { bigint: true });
      if (!after.isFile() || after.isSymbolicLink() || Object.keys(before)
        .some(field => String(after[field]) !== before[field])) fail();
    }
    for (const [root, before, device] of [[sourceRoot, sourceDirectory, sourceDevice],
      [candidateRoot, candidateDirectory, candidateDevice]]) {
      const after = directory(root, device, true);
      if (before.ino !== after.ino || before.mode !== after.mode) fail();
    }
    return Object.freeze({ sourceCommit, sourceTree, checkedSourceFiles: baseline.size,
      checkedCandidateFiles: expected.size, outputFiles: outputs.size, preservedSourceFiles: baseline.size
        - [...outputs.keys()].filter(path => baseline.has(path)).length });
  } catch { fail(); }
}

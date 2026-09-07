import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync, realpathSync, statfsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureFixedOperationBundleSource } from './local-binding-runtime-core.mjs';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { acquirePreparedReleaseCandidateLock } from './local-release-candidate-lock.mjs';
import { installPreparedReleaseTransactionUnderLock } from './local-release-transaction-install.mjs';

const ROOT = '/home/snapmeter/.warpkeep/release-preparation-v1';
const RUNS = `${ROOT}/runs`;
const NODE = `${ROOT}/toolchain/node-v22.22.3-linux-x64/bin/node`;
const NODE_DIGEST = 'e6ec2c188d83d813f81f2de8aea084d74dce603ac1abedd0a30ad941b10087b2';
const GIT_DIGEST = '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668';
const PROFILE = 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';

export class LocalReleaseWorkspaceError extends Error {
  constructor(code) { super(code); this.name = 'LocalReleaseWorkspaceError'; this.code = code; }
}
function fail(suffix) { throw new LocalReleaseWorkspaceError(`LOCAL_RELEASE_WORKSPACE_${suffix}`); }

function directory(path, privateMode = true) {
  const status = lstatSync(path, { bigint: true });
  if (!status.isDirectory() || status.isSymbolicLink() || status.uid !== 1000n
      || (status.mode & 0o022n) !== 0n || (status.mode & 0o7000n) !== 0n
      || (privateMode && (status.mode & 0o777n) !== 0o700n)
      || realpathSync(path) !== path) fail('DIRECTORY_INVALID');
  return status;
}

function attest(path, bytes, sha256, uid) {
  const record = readLocalBindingBoundedFile(path, {
    maximumBytes: bytes, expectedSha256: sha256, expectedUid: uid,
    ...(path === NODE ? { expectedBytes: bytes } : {}),
    requireExecutable: true, rejectWritableExecutable: true, discardBody: true,
  });
  record.body.fill(0);
  return record.identity;
}

function sourceManifest(source) {
  const bytes = source.gitBuffer(source.root, ['ls-tree', '-r', '-l', '-z', source.tree], 1024 * 1024);
  let listing;
  try {
    listing = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!Buffer.from(listing).equals(bytes)) fail('SOURCE_INVALID');
  } catch { fail('SOURCE_INVALID'); }
  if (!listing.endsWith('\0')) fail('SOURCE_INVALID');
  const entries = listing.slice(0, -1).split('\0');
  // Current whole committed tree: 2,746 files / 184,542,446 bytes; these are
  // bounded workspace limits, not mutable deployment-closure member counts.
  if (entries.length < 1 || entries.length > 4096) fail('SOURCE_INVALID');
  const seen = new Set();
  let total = 0;
  return entries.map(line => {
    const match = /^(100644|100755) blob ([a-f0-9]{40}) +([0-9]+)\t([^\0]+)$/u.exec(line);
    if (!match) fail('SOURCE_INVALID');
    const [, mode, oid, sizeText, path] = match;
    const size = Number(sizeText);
    if (!Number.isSafeInteger(size) || size < 0 || size > 16 * 1024 * 1024
        || path.length > 512 || /[\\\x00-\x1f\x7f]/u.test(path)
        || path.split('/').some(part => !part || part === '.' || part === '..')
        || seen.has(path.toLowerCase())) fail('SOURCE_INVALID');
    seen.add(path.toLowerCase());
    total += size;
    if (total > 256 * 1024 * 1024) fail('SOURCE_INVALID');
    return Object.freeze({ path, oid, size, mode: mode === '100644' ? 0o644 : 0o755 });
  });
}

function verifySourceBytes(root, manifest) {
  for (const file of manifest) {
    const opened = readLocalBindingBoundedFile(join(root, ...file.path.split('/')), {
      maximumBytes: 16 * 1024 * 1024, expectedBytes: file.size, expectedUid: 1000, expectedMode: file.mode,
    });
    try {
      if ((BigInt(opened.identity.mode) & 0o7777n) !== BigInt(file.mode)) fail('SOURCE_MODE_CHANGED');
      const oid = createHash('sha1').update(`blob ${file.size}\0`).update(opened.body).digest('hex');
      if (oid !== file.oid) fail('SOURCE_BYTES_CHANGED');
    } finally { opened.body.fill(0); }
  }
}

/** Private working resources only, not a prepared artifact or deployment grant.
 * Release closes the lock but retains both checkouts and failure diagnostics.
 */
export function capturePreparedLinuxReleaseWorkspace(...args) {
  if (args.length !== 0) fail('ARGUMENTS_INVALID');
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid?.() !== 1000
      || process.execPath !== NODE || process.versions.node !== '22.22.3' || process.execArgv.length !== 0
      || process.env.NODE_OPTIONS || process.env.NODE_PATH || process.env.ESBUILD_BINARY_PATH
      || process.env.ESBUILD_WORKER_THREADS
      || Object.keys(process.env).some(name => /TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|COOKIE|API_KEY/iu.test(name))) fail('HOST_INVALID');
  const pinned = new Map();
  function pin(path, privateMode = true) { pinned.set(path, { status: directory(path, privateMode), privateMode }); }
  for (const path of [ROOT, RUNS, join(ROOT, 'toolchain'), dirname(dirname(NODE)), dirname(NODE)]) pin(path);
  if (statfsSync(RUNS).type !== 0xef53) fail('FILESYSTEM_INVALID');
  attest(NODE, 124819136, NODE_DIGEST, 1000);
  const gitIdentity = attest('/usr/bin/git', 64 * 1024 * 1024, GIT_DIGEST, 0);
  const operationRoot = join(RUNS, `release-workspace-${randomBytes(16).toString('hex')}`);
  mkdirSync(operationRoot, { mode: 0o700 });
  chmodSync(operationRoot, 0o700);
  pin(operationRoot);
  for (const name of ['home', 'tmp']) {
    const path = join(operationRoot, name);
    mkdirSync(path, { mode: 0o700 });
    chmodSync(path, 0o700);
    pin(path);
  }
  const environment = Object.freeze({ HOME: join(operationRoot, 'home'), TMPDIR: join(operationRoot, 'tmp'),
    PATH: `${dirname(NODE)}:/usr/bin:/bin`, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC' });
  let lock;
  try {
    const source = captureFixedOperationBundleSource({
      repositoryRoot: resolve(dirname(fileURLToPath(import.meta.url)), '..'), operationRoot, environment, gitIdentity,
    });
    if (source.root !== join(operationRoot, 'source') || !/^[a-f0-9]{40}$/u.test(source.commit)
        || !/^[a-f0-9]{40}$/u.test(source.tree)) fail('SOURCE_INVALID');
    source.verify();
    const manifest = sourceManifest(source);
    const candidateRoot = join(operationRoot, 'candidate');
    const candidate = source.materialize(candidateRoot);
    if (candidate.root !== candidateRoot || candidate.commit !== source.commit || candidate.tree !== source.tree) fail('SOURCE_INVALID');
    for (const root of [source.root, candidateRoot]) { pin(root); pin(join(root, '.git'), false); }
    lock = acquirePreparedReleaseCandidateLock(candidateRoot);
    let released = false;
    function assertActive() {
      if (released) fail('RELEASED');
      lock.assertActive();
      for (const [path, expected] of pinned) {
        const actual = directory(path, expected.privateMode);
        if (['dev', 'ino', 'uid', 'mode'].some(key => actual[key] !== expected.status[key])) fail('DIRECTORY_CHANGED');
      }
      source.verify();
      source.verifyMaterialization(candidateRoot);
      if (source.git(source.root, ['status', '--porcelain=v1', '--untracked-files=all'], 4 * 1024 * 1024) !== '') fail('SOURCE_DIRTY');
      verifySourceBytes(source.root, manifest);
    }
    function assertCandidateClean() {
      assertActive();
      if (source.git(candidateRoot, ['status', '--porcelain=v1', '--untracked-files=all'], 4 * 1024 * 1024) !== '') fail('CANDIDATE_DIRTY');
    }
    assertCandidateClean();
    return Object.freeze({ profile: PROFILE, operationRoot, sourceRoot: source.root, candidateRoot,
      sourceCommit: source.commit, sourceTree: source.tree, assertActive, assertCandidateClean,
      installOutputs(...args) {
        if (args.length !== 1) fail('ARGUMENTS_INVALID');
        const [files] = args;
        assertCandidateClean();
        const result = installPreparedReleaseTransactionUnderLock({ candidateRoot,
          sourceCommit: source.commit, sourceTree: source.tree, files }, lock);
        assertActive();
        return result;
      },
      release() {
        if (released) return;
        released = true;
        lock.release();
      },
    });
  } catch (primary) {
    try { lock?.release(); } catch (cleanup) {
      throw new AggregateError([primary, cleanup], 'LOCAL_RELEASE_WORKSPACE_FAILED', { cause: primary });
    }
    throw primary;
  }
}

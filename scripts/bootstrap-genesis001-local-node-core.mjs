import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { release as kernelRelease } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { runGenesis001NodeBoundedProcess } from './bootstrap-genesis001-local-node-process.mjs';

const PROFILE = 'warpkeep-genesis001-local-node-bootstrap-linux-x64-v1';
const ROOT = '/home/snapmeter/.warpkeep/release-preparation-v1';
const TOOLCHAIN = `${ROOT}/toolchain`;
const RUNS = `${ROOT}/runs`;
const CACHE_PARENT = `${ROOT}/cache`;
const CACHE = `${CACHE_PARENT}/node-v24.19.0-provenance-v1`;
const BOOTSTRAP_NODE = `${TOOLCHAIN}/node-v22.22.3-linux-x64/bin/node`;
const FINAL_VERSION = `${TOOLCHAIN}/node-v24.19.0-linux-x64`;
const FINAL_BIN = `${FINAL_VERSION}/bin`;
const FINAL_NODE = `${FINAL_BIN}/node`;
const VERSION = '24.19.0';
const NODE_BYTES = 125_989_464;
const NODE_SHA256 = 'bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12';
const BOOTSTRAP_NODE_BYTES = 124_819_136;
const BOOTSTRAP_NODE_SHA256 = 'e6ec2c188d83d813f81f2de8aea084d74dce603ac1abedd0a30ad941b10087b2';
const OS_RELEASE_BYTES = 400;
const OS_RELEASE_SHA256 = '01af466feb100306498c86aa6bad1815e33036019aa34d4362c20f374ea5c829';
const KERNEL_RELEASE_BYTES = 34;
const KERNEL_RELEASE_SHA256 = '600c01e56d5afd93f0ecd74ff4ebb5ef91623d779bbba04388a866c3b581fc92';
const GIT = Object.freeze({
  path: '/usr/bin/git',
  bytes: undefined,
  sha256: '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668',
});
const GPG = Object.freeze({
  path: '/usr/bin/gpg', bytes: 1_147_800,
  sha256: '403e04c779ad9fab3895c405f8c53d35ab59fa8e3b8bbe3437f61bc41f468dd4',
});
const GPGV = Object.freeze({
  path: '/usr/bin/gpgv', bytes: 310_416,
  sha256: 'f14d026b9eae172c432e015bce227483293b4966f2f3fdcfa582f71d3dbb2ae8',
});
const TAR = Object.freeze({
  path: '/usr/bin/tar', bytes: 440_264,
  sha256: '3ee2c3c0b4dd9aacebfd2f0fbae44bad36348203acff78a44888dd58c05f811c',
});
const XZ = Object.freeze({
  path: '/usr/bin/xz', bytes: 89_008,
  sha256: 'b5b163eb273291934556377ab883b4b2a5d4da50bd0dc0a91774ecc234ccd8d0',
});
const POLICY_PATH = 'services/release-recovery/scripts/release-recovery-wsl-toolchain-source-policy-v1.json';
const SOURCE_PATHS = Object.freeze([
  'scripts/bootstrap-genesis001-local-node.mjs',
  'scripts/bootstrap-genesis001-local-node-core.mjs',
  'scripts/bootstrap-genesis001-local-node-process.mjs',
  'scripts/local-binding-bounded-file.mjs',
  POLICY_PATH,
]);
const RECORD = Object.freeze({
  version: VERSION,
  archiveUrl: 'https://nodejs.org/dist/v24.19.0/node-v24.19.0-linux-x64.tar.xz',
  archiveBytes: 31_633_904,
  archiveSha256: '14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647',
  archiveMemberPath: 'node-v24.19.0-linux-x64/bin/node',
  archiveMemberMode: '755',
  archiveMemberBytes: NODE_BYTES,
  archiveMemberSha256: NODE_SHA256,
  shasumsUrl: 'https://nodejs.org/dist/v24.19.0/SHASUMS256.txt',
  shasumsBytes: 2_967,
  shasumsSha256: 'be0629ee2bcd8e40bb856abdd3407f0762101b76bd60a36b8867f637733631c0',
  signatureUrl: 'https://nodejs.org/dist/v24.19.0/SHASUMS256.txt.sig',
  signatureBytes: 119,
  signatureSha256: '801534e2d4c769c087e2e3eec89e879032872357e64e82336f86f03e72ece630',
  signingAlgorithm: 'EdDSA',
  signerFingerprint: '5BE8A3F6C8A5C01D106C0AD820B1A390B168D356',
  publicKeyUrl: 'https://raw.githubusercontent.com/nodejs/release-keys/5b7f55f4a7e35d1176d27a6b81b0c3c3b794216b/keys/5BE8A3F6C8A5C01D106C0AD820B1A390B168D356.asc',
  publicKeyBytes: 924,
  publicKeySha256: '5115095e2f8010c75da052ecb1cfb3af630e084f0f8daa93a863557b01b0f90a',
});
const CACHE_FILES = Object.freeze({
  publicKey: Object.freeze({ name: 'node-release-key.asc', urlField: 'publicKeyUrl', bytesField: 'publicKeyBytes', hashField: 'publicKeySha256' }),
  shasums: Object.freeze({ name: 'SHASUMS256.txt', urlField: 'shasumsUrl', bytesField: 'shasumsBytes', hashField: 'shasumsSha256' }),
  signature: Object.freeze({ name: 'SHASUMS256.txt.sig', urlField: 'signatureUrl', bytesField: 'signatureBytes', hashField: 'signatureSha256' }),
  archive: Object.freeze({ name: 'node-v24.19.0-linux-x64.tar.xz', urlField: 'archiveUrl', bytesField: 'archiveBytes', hashField: 'archiveSha256' }),
});
const DEADLINE_MS = 30_000;
const PROCESS_STDERR_LIMIT = 64 * 1_024;
const PREPARATION_DIRECTORY_POLICY = Object.freeze([
  Object.freeze({ path: '/', uid: 0, mode: 0o755 }),
  Object.freeze({ path: '/home', uid: 0, mode: 0o755 }),
  Object.freeze({ path: '/home/snapmeter', uid: 1000, mode: 0o750 }),
  Object.freeze({ path: '/home/snapmeter/.warpkeep', uid: 1000, mode: 0o700 }),
  Object.freeze({ path: ROOT, uid: 1000, mode: 0o700 }),
  Object.freeze({ path: TOOLCHAIN, uid: 1000, mode: 0o700 }),
  Object.freeze({ path: `${TOOLCHAIN}/node-v22.22.3-linux-x64`, uid: 1000, mode: 0o700 }),
  Object.freeze({ path: `${TOOLCHAIN}/node-v22.22.3-linux-x64/bin`, uid: 1000, mode: 0o700 }),
  Object.freeze({ path: RUNS, uid: 1000, mode: 0o700 }),
  Object.freeze({ path: CACHE_PARENT, uid: 1000, mode: 0o700 }),
]);

function codedError(code, cause) {
  const error = new Error(code, cause === undefined ? undefined : { cause });
  error.code = code;
  return error;
}

function fail(code, cause) {
  throw codedError(code, cause);
}

function hash(body) {
  return createHash('sha256').update(body).digest('hex');
}

function sameIdentity(left, right) {
  return ['dev', 'ino', 'mode', 'uid', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
    .every(key => String(left[key]) === String(right[key]));
}

function sameDirectoryIdentity(left, right) {
  return ['dev', 'ino', 'mode', 'uid'].every(key => String(left[key]) === String(right[key]));
}

function directory(path, expectedUid = 1000, expectedMode = 0o700, expectedIdentity) {
  try {
    const state = lstatSync(path, { bigint: true });
    if (!state.isDirectory() || state.isSymbolicLink() || state.uid !== BigInt(expectedUid)
        || (state.mode & 0o777n) !== BigInt(expectedMode) || realpathSync(path) !== path
        || (expectedIdentity !== undefined && !sameDirectoryIdentity(state, expectedIdentity))) {
      fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_DIRECTORY_INVALID');
    }
    return state;
  } catch (error) {
    if (error?.code?.startsWith?.('GENESIS001_')) throw error;
    fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_DIRECTORY_INVALID', error);
  }
}

function bindPreparationNamespace() {
  const base = new Map(PREPARATION_DIRECTORY_POLICY.map(specification => [
    specification.path,
    Object.freeze({ specification, identity: directory(
      specification.path, specification.uid, specification.mode,
    ) }),
  ]));
  return { base, cache: undefined };
}

function recheckPreparationNamespace(authority) {
  for (const { specification, identity } of authority.base.values()) {
    directory(specification.path, specification.uid, specification.mode, identity);
  }
  if (authority.cache !== undefined) directory(CACHE, 1000, 0o700, authority.cache);
}

function fsyncDirectory(path) {
  let descriptor;
  let primary;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    fsyncSync(descriptor);
  } catch (error) { primary = error; }
  let closing;
  try { if (descriptor !== undefined) closeSync(descriptor); } catch (error) { closing = error; }
  if (primary !== undefined || closing !== undefined) {
    if (primary !== undefined && closing === undefined) throw primary;
    throw new AggregateError([primary, closing].filter(Boolean),
      'GENESIS001_LOCAL_NODE_BOOTSTRAP_FSYNC_FAILED', { cause: primary });
  }
}

function ensurePrivateChild(parent, name) {
  directory(parent);
  const path = join(parent, name);
  if (!existsSync(path)) {
    mkdirSync(path, { mode: 0o700 });
    chmodSync(path, 0o700);
    fsyncDirectory(parent);
  }
  directory(path);
  return path;
}

function attestFile(path, options) {
  try {
    return readLocalBindingBoundedFile(path, {
      maximumBytes: options.bytes ?? 64 * 1_024 * 1_024,
      expectedBytes: options.bytes,
      expectedSha256: options.sha256,
      expectedUid: options.uid,
      expectedMode: options.mode,
      expectedIdentity: options.identity,
      requireExecutable: options.executable,
      rejectWritableExecutable: options.executable,
      discardBody: options.discardBody,
    });
  } catch (error) {
    fail(options.code, error);
  }
}

function attestTool(tool, identity) {
  return attestFile(tool.path, {
    bytes: tool.bytes, sha256: tool.sha256, uid: 0, mode: 0o755,
    executable: true, discardBody: true, identity,
    code: 'GENESIS001_LOCAL_NODE_BOOTSTRAP_TOOL_INVALID',
  }).identity;
}

function cleanEnvironment(extra = {}) {
  return Object.freeze({ LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', ...extra });
}

function decodeBounded(buffer, code) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch (error) { fail(code, error); }
}

async function runGit(repositoryRoot, gitIdentity, authority, arguments_, maximumBytes = 128 * 1_024) {
  recheckPreparationNamespace(authority);
  attestTool(GIT, gitIdentity);
  const result = await runGenesis001NodeBoundedProcess(GIT.path,
    ['--no-replace-objects', ...arguments_], {
    cwd: repositoryRoot,
    env: cleanEnvironment({
      PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_COUNT: '0', GIT_NO_REPLACE_OBJECTS: '1', HOME: '/nonexistent',
    }),
    timeout: 60_000, maxStdout: maximumBytes, maxStderr: PROCESS_STDERR_LIMIT,
  });
  attestTool(GIT, gitIdentity);
  recheckPreparationNamespace(authority);
  result.stderr.fill(0);
  return result.stdout;
}

async function attestCommittedSource(repositoryRoot, gitIdentity, authority, expected) {
  const commitBody = await runGit(repositoryRoot, gitIdentity, authority,
    ['rev-parse', '--verify', 'HEAD^{commit}']);
  const commitText = decodeBounded(commitBody, 'GENESIS001_LOCAL_NODE_BOOTSTRAP_SOURCE_INVALID');
  commitBody.fill(0);
  if (!/^[0-9a-f]{40}\n$/u.test(commitText)) {
    fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_SOURCE_INVALID');
  }
  const commit = commitText.slice(0, -1);
  const treeBody = await runGit(repositoryRoot, gitIdentity, authority,
    ['rev-parse', '--verify', `${commit}^{tree}`]);
  const treeText = decodeBounded(treeBody, 'GENESIS001_LOCAL_NODE_BOOTSTRAP_SOURCE_INVALID');
  treeBody.fill(0);
  if (!/^[0-9a-f]{40}\n$/u.test(treeText)) {
    fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_SOURCE_INVALID');
  }
  const tree = treeText.slice(0, -1);
  if (expected !== undefined && (commit !== expected.commit || tree !== expected.tree)) {
    fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_SOURCE_CHANGED');
  }
  const bodies = new Map();
  const identities = new Map();
  for (const path of SOURCE_PATHS) {
    const committed = await runGit(repositoryRoot, gitIdentity, authority,
      ['show', `${commit}:${path}`], 8 * 1_024 * 1_024);
    const current = attestFile(join(repositoryRoot, ...path.split('/')), {
      bytes: committed.length, sha256: hash(committed), uid: 1000,
      code: 'GENESIS001_LOCAL_NODE_BOOTSTRAP_SOURCE_INVALID',
    });
    current.body.fill(0);
    bodies.set(path, committed);
    identities.set(path, current.identity);
  }
  return Object.freeze({ commit, tree, bodies, identities });
}

async function reattestCommittedSource(repositoryRoot, gitIdentity, authority, source) {
  const again = await attestCommittedSource(repositoryRoot, gitIdentity, authority, source);
  for (const path of SOURCE_PATHS) {
    if (hash(again.bodies.get(path)) !== hash(source.bodies.get(path))) {
      fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_SOURCE_CHANGED');
    }
    const current = attestFile(join(repositoryRoot, ...path.split('/')), {
      bytes: source.bodies.get(path).length,
      sha256: hash(source.bodies.get(path)), uid: 1000,
      identity: source.identities.get(path),
      code: 'GENESIS001_LOCAL_NODE_BOOTSTRAP_SOURCE_CHANGED',
    });
    current.body.fill(0);
    again.bodies.get(path).fill(0);
  }
}

function selectedPolicy(source) {
  let policy;
  try {
    policy = JSON.parse(decodeBounded(source.bodies.get(POLICY_PATH),
      'GENESIS001_LOCAL_NODE_BOOTSTRAP_POLICY_INVALID'));
  } catch (error) {
    if (error?.code?.startsWith?.('GENESIS001_')) throw error;
    fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_POLICY_INVALID', error);
  }
  const selected = policy?.nodeReleases?.[VERSION];
  if (policy?.schemaVersion !== 1
      || policy?.profile !== 'warpkeep-release-recovery-wsl-toolchain-source-policy-v1'
      || policy?.distribution !== 'Ubuntu-24.04'
      || policy?.platform !== 'linux' || policy?.architecture !== 'x64'
      || selected === null || typeof selected !== 'object'
      || Object.entries(RECORD).some(([key, value]) => selected[key] !== value)) {
    fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_POLICY_INVALID');
  }
  return RECORD;
}

function validateUrl(value) {
  let url;
  try { url = new URL(value); } catch (error) {
    fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_URL_INVALID', error);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port
      || url.hash || url.href !== value) {
    fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_URL_INVALID');
  }
  return url;
}

function downloadExact(urlValue, expectedBytes, expectedSha256) {
  const url = validateUrl(urlValue);
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    let request;
    let response;
    let deadline;
    let total = 0;
    const chunks = [];
    const erase = () => {
      for (const chunk of chunks) chunk.fill(0);
      chunks.length = 0;
      total = 0;
    };
    const finish = (callback, value, cancel) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (cancel) {
        erase();
        try { response?.destroy(); } catch {}
        try { request?.destroy(); } catch {}
      }
      callback(value);
    };
    const reject = error => finish(rejectPromise,
      codedError('GENESIS001_LOCAL_NODE_BOOTSTRAP_FETCH_FAILED', error), true);
    try {
      request = httpsRequest(url, {
        method: 'GET', agent: false,
        headers: { accept: 'application/octet-stream', 'accept-encoding': 'identity' },
      }, incoming => {
        if (settled) { incoming.destroy(); return; }
        response = incoming;
        const length = incoming.headers['content-length'];
        if (incoming.statusCode !== 200 || incoming.headers.location !== undefined
            || incoming.headers['content-encoding'] !== undefined
            || (length !== undefined && (!/^\d+$/u.test(length)
              || Number(length) !== expectedBytes))) {
          reject(new Error('invalid response metadata'));
          return;
        }
        incoming.on('data', chunk => {
          if (settled) return;
          const copy = Buffer.from(chunk);
          total += copy.length;
          if (total > expectedBytes) {
            copy.fill(0);
            reject(new Error('response too large'));
          } else chunks.push(copy);
        });
        incoming.on('aborted', () => reject(new Error('response aborted')));
        incoming.on('error', reject);
        incoming.on('end', () => {
          if (settled) return;
          if (total !== expectedBytes) { reject(new Error('response size mismatch')); return; }
          const body = Buffer.concat(chunks, total);
          erase();
          if (hash(body) !== expectedSha256) {
            body.fill(0);
            reject(new Error('response hash mismatch'));
            return;
          }
          finish(resolvePromise, body, false);
        });
      });
      request.on('error', reject);
      deadline = setTimeout(() => reject(new Error('request deadline exceeded')), DEADLINE_MS);
      request.end();
    } catch (error) { reject(error); }
  });
}

function missing(error) {
  if (error?.code === 'ENOENT') return true;
  if (error instanceof AggregateError && error.errors.some(missing)) return true;
  return error?.cause !== undefined && missing(error.cause);
}

function readExactPrivateFile(path, bytes, sha256) {
  return attestFile(path, {
    bytes, sha256, uid: 1000, mode: 0o400,
    code: 'GENESIS001_LOCAL_NODE_BOOTSTRAP_CACHE_INVALID',
  });
}

function writeExclusiveFile(path, body, mode, parent) {
  let descriptor;
  let primary;
  let opened;
  try {
    descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
      | constants.O_NOFOLLOW, mode);
    let offset = 0;
    while (offset < body.length) {
      const count = writeSync(descriptor, body, offset, body.length - offset, offset);
      if (!Number.isSafeInteger(count) || count <= 0 || count > body.length - offset) {
        fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_WRITE_FAILED');
      }
      offset += count;
    }
    fchmodSync(descriptor, mode);
    fsyncSync(descriptor);
    opened = fstatSync(descriptor, { bigint: true });
  } catch (error) { primary = error; }
  let closing;
  try { if (descriptor !== undefined) closeSync(descriptor); } catch (error) { closing = error; }
  if (primary !== undefined || closing !== undefined) {
    if (primary !== undefined && closing === undefined) throw primary;
    throw new AggregateError([primary, closing].filter(Boolean),
      'GENESIS001_LOCAL_NODE_BOOTSTRAP_WRITE_FAILED', { cause: primary });
  }
  fsyncDirectory(parent);
  return opened;
}

async function ensureEvidenceFile(record, key, authority) {
  recheckPreparationNamespace(authority);
  const specification = CACHE_FILES[key];
  const path = join(CACHE, specification.name);
  const bytes = record[specification.bytesField];
  const sha256 = record[specification.hashField];
  try {
    const existing = readExactPrivateFile(path, bytes, sha256);
    existing.body.fill(0);
    return path;
  } catch (error) {
    if (!missing(error)) throw error;
  }
  const body = await downloadExact(record[specification.urlField], bytes, sha256);
  try {
    recheckPreparationNamespace(authority);
    writeExclusiveFile(path, body, 0o400, CACHE);
    recheckPreparationNamespace(authority);
    const installed = readExactPrivateFile(path, bytes, sha256);
    installed.body.fill(0);
  } finally { body.fill(0); }
  return path;
}

function createOperation() {
  directory(RUNS);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const name = `node-v24.19.0-${randomBytes(16).toString('hex')}`;
    const path = join(RUNS, name);
    try {
      mkdirSync(path, { mode: 0o700 });
      chmodSync(path, 0o700);
      fsyncDirectory(RUNS);
      return Object.freeze({ path, identity: directory(path) });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_OPERATION_FAILED');
}

function cleanupOperation(operation, authority) {
  recheckPreparationNamespace(authority);
  if (!existsSync(operation.path)) return;
  directory(operation.path, 1000, 0o700, operation.identity);
  rmSync(operation.path, { recursive: true, force: false });
  fsyncDirectory(RUNS);
  recheckPreparationNamespace(authority);
}

function gpgEnvironment(operation, home) {
  return cleanEnvironment({ HOME: operation, GNUPGHOME: home, PATH: '/usr/bin:/bin' });
}

async function runPinnedTool(tool, identity, authority, arguments_, options) {
  recheckPreparationNamespace(authority);
  attestTool(tool, identity);
  const result = await runGenesis001NodeBoundedProcess(tool.path, arguments_, options);
  attestTool(tool, identity);
  recheckPreparationNamespace(authority);
  return result;
}

function verifyPrimaryKey(text, fingerprint) {
  const lines = text.split('\n').filter(Boolean).map(line => line.split(':'));
  const primaryIndexes = lines.map((fields, index) => fields[0] === 'pub' ? index : -1)
    .filter(index => index !== -1);
  const primaryIndex = primaryIndexes[0];
  const primaryFingerprint = lines.slice(primaryIndex + 1)
    .find(fields => fields[0] === 'fpr')?.[9];
  if (primaryIndexes.length !== 1 || lines[primaryIndex][3] !== '22'
      || primaryFingerprint !== fingerprint) {
    fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_KEY_INVALID');
  }
}

function verifySignatureStatus(text, fingerprint) {
  const lines = text.split('\n').filter(line => line.startsWith('[GNUPG:] '));
  const valid = lines.filter(line => line.startsWith('[GNUPG:] VALIDSIG '));
  const forbidden = ['BADSIG', 'ERRSIG', 'EXPSIG', 'EXPKEYSIG', 'REVKEYSIG', 'KEYEXPIRED', 'SIGEXPIRED'];
  if (valid.length !== 1 || forbidden.some(status => lines.some(line => line.startsWith(`[GNUPG:] ${status} `)))) {
    fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_SIGNATURE_INVALID');
  }
  const fields = valid[0].split(' ');
  if (fields[2] !== fingerprint || fields[8] !== '22'
      || fields[11] !== fingerprint) {
    fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_SIGNATURE_INVALID');
  }
}

async function authenticateEvidence(record, paths, operation, identities, authority) {
  const home = join(operation.path, 'gnupg');
  mkdirSync(home, { mode: 0o700 });
  chmodSync(home, 0o700);
  directory(home);
  const env = gpgEnvironment(operation.path, home);
  const common = ['--no-options', '--batch', '--no-tty', '--no-autostart', '--homedir', home];
  const inspect = await runPinnedTool(GPG, identities.gpg, authority, [
    ...common, '--with-colons', '--import-options', 'show-only', '--dry-run', '--import', paths.publicKey,
  ], { cwd: operation.path, env, timeout: 30_000, maxStdout: 64 * 1_024, maxStderr: 64 * 1_024 });
  const inspectionText = `${decodeBounded(inspect.stdout, 'GENESIS001_LOCAL_NODE_BOOTSTRAP_KEY_INVALID')}${decodeBounded(inspect.stderr, 'GENESIS001_LOCAL_NODE_BOOTSTRAP_KEY_INVALID')}`;
  inspect.stdout.fill(0); inspect.stderr.fill(0);
  verifyPrimaryKey(inspectionText, record.signerFingerprint);
  const imported = await runPinnedTool(GPG, identities.gpg, authority, [
    ...common, '--status-fd=1', '--import', paths.publicKey,
  ], { cwd: operation.path, env, timeout: 30_000, maxStdout: 64 * 1_024, maxStderr: 64 * 1_024 });
  const importStatus = decodeBounded(imported.stdout, 'GENESIS001_LOCAL_NODE_BOOTSTRAP_KEY_INVALID');
  imported.stdout.fill(0); imported.stderr.fill(0);
  if (!importStatus.includes('[GNUPG:] IMPORT_OK ')) fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_KEY_INVALID');
  const verified = await runPinnedTool(GPG, identities.gpg, authority, [
    ...common, '--status-fd=1', '--verify', paths.signature, paths.shasums,
  ], { cwd: operation.path, env, timeout: 30_000, maxStdout: 64 * 1_024, maxStderr: 64 * 1_024 });
  const status = decodeBounded(verified.stdout, 'GENESIS001_LOCAL_NODE_BOOTSTRAP_SIGNATURE_INVALID');
  verified.stdout.fill(0); verified.stderr.fill(0);
  verifySignatureStatus(status, record.signerFingerprint);
  attestTool(GPGV, identities.gpgv);
}

function verifySums(record, path) {
  const opened = readExactPrivateFile(path, record.shasumsBytes, record.shasumsSha256);
  try {
    const text = decodeBounded(opened.body, 'GENESIS001_LOCAL_NODE_BOOTSTRAP_SUMS_INVALID');
    const exact = `${record.archiveSha256}  node-v24.19.0-linux-x64.tar.xz`;
    if (text.split(/\r?\n/u).filter(line => line === exact).length !== 1) {
      fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_SUMS_INVALID');
    }
  } finally { opened.body.fill(0); }
}

function provenanceBody(record) {
  return Buffer.from(`${JSON.stringify({
    schemaVersion: 1,
    profile: PROFILE,
    nodeVersion: record.version,
    signerFingerprint: record.signerFingerprint,
    publicKeySha256: record.publicKeySha256,
    shasumsSha256: record.shasumsSha256,
    signatureSha256: record.signatureSha256,
    archiveSha256: record.archiveSha256,
    archiveMemberSha256: record.archiveMemberSha256,
  })}\n`, 'utf8');
}

function ensureProvenance(record) {
  const path = join(CACHE, 'provenance.json');
  const expected = provenanceBody(record);
  try {
    try {
      const existing = readExactPrivateFile(path, expected.length, hash(expected));
      if (!existing.body.equals(expected)) fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_CACHE_INVALID');
      existing.body.fill(0);
      return;
    } catch (error) {
      if (!missing(error)) throw error;
    }
    writeExclusiveFile(path, expected, 0o400, CACHE);
    const installed = readExactPrivateFile(path, expected.length, hash(expected));
    if (!installed.body.equals(expected)) fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_CACHE_INVALID');
    installed.body.fill(0);
  } finally { expected.fill(0); }
}

function validateCacheNamespace(allowMissingProvenance = true) {
  const allowed = new Set([...Object.values(CACHE_FILES).map(value => value.name), 'provenance.json']);
  const names = readdirSync(CACHE);
  if (names.some(name => !allowed.has(name))
      || (!allowMissingProvenance && !names.includes('provenance.json'))) {
    fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_CACHE_INVALID');
  }
}

function finalInstallation() {
  if (!existsSync(FINAL_VERSION)) return undefined;
  directory(FINAL_VERSION);
  if (JSON.stringify([...readdirSync(FINAL_VERSION)].sort()) !== JSON.stringify(['bin'])) {
    fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_DESTINATION_INVALID');
  }
  directory(FINAL_BIN);
  if (JSON.stringify([...readdirSync(FINAL_BIN)].sort()) !== JSON.stringify(['node'])) {
    fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_DESTINATION_INVALID');
  }
  return attestFile(FINAL_NODE, {
    bytes: NODE_BYTES, sha256: NODE_SHA256, uid: 1000, mode: 0o500,
    executable: true, discardBody: true,
    code: 'GENESIS001_LOCAL_NODE_BOOTSTRAP_DESTINATION_INVALID',
  }).identity;
}

async function extractMember(record, archivePath, operation, identities, authority) {
  attestTool(XZ, identities.xz);
  const result = await runPinnedTool(TAR, identities.tar, authority, [
    '--extract', '--file', archivePath, '--to-stdout',
    `--use-compress-program=${XZ.path}`, '--', record.archiveMemberPath,
  ], {
    cwd: operation.path,
    env: cleanEnvironment({ PATH: '/usr/bin:/bin' }),
    timeout: 60_000, maxStdout: record.archiveMemberBytes + 1,
    maxStderr: PROCESS_STDERR_LIMIT,
  });
  attestTool(XZ, identities.xz);
  result.stderr.fill(0);
  if (result.stdout.length !== record.archiveMemberBytes || hash(result.stdout) !== record.archiveMemberSha256) {
    result.stdout.fill(0);
    fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_MEMBER_INVALID');
  }
  return result.stdout;
}

function installMember(body) {
  if (existsSync(FINAL_VERSION)) fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_DESTINATION_INVALID');
  mkdirSync(FINAL_VERSION, { mode: 0o700 });
  chmodSync(FINAL_VERSION, 0o700);
  const versionIdentity = directory(FINAL_VERSION);
  fsyncDirectory(TOOLCHAIN);
  mkdirSync(FINAL_BIN, { mode: 0o700 });
  chmodSync(FINAL_BIN, 0o700);
  const binIdentity = directory(FINAL_BIN);
  fsyncDirectory(FINAL_VERSION);
  const nodeIdentity = writeExclusiveFile(FINAL_NODE, body, 0o500, FINAL_BIN);
  directory(FINAL_VERSION, 1000, 0o700, versionIdentity);
  directory(FINAL_BIN, 1000, 0o700, binIdentity);
  const final = finalInstallation();
  if (!sameIdentity(nodeIdentity, final)) fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_DESTINATION_INVALID');
  fsyncDirectory(FINAL_VERSION);
  fsyncDirectory(TOOLCHAIN);
  return final;
}

async function runInstalledNode(identity, authority) {
  recheckPreparationNamespace(authority);
  const before = finalInstallation();
  if (!sameIdentity(before, identity)) fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_DESTINATION_INVALID');
  const result = await runGenesis001NodeBoundedProcess(FINAL_NODE, ['--version'], {
    cwd: ROOT, env: cleanEnvironment(), timeout: 10_000,
    maxStdout: 64, maxStderr: PROCESS_STDERR_LIMIT,
  });
  recheckPreparationNamespace(authority);
  const version = decodeBounded(result.stdout, 'GENESIS001_LOCAL_NODE_BOOTSTRAP_DESTINATION_INVALID');
  result.stdout.fill(0); result.stderr.fill(0);
  if (version !== 'v24.19.0\n') fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_DESTINATION_INVALID');
  const after = finalInstallation();
  if (!sameIdentity(after, identity)) fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_DESTINATION_INVALID');
}

function cleanSourceBodies(source) {
  for (const body of source?.bodies?.values?.() ?? []) body.fill(0);
}

export async function runGenesis001LocalNodeBootstrap(...arguments_) {
  if (arguments_.length !== 0) fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_ARGUMENTS_INVALID');
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid?.() !== 1000
      || process.execPath !== BOOTSTRAP_NODE || process.execArgv.length !== 0
      || process.env.NODE_OPTIONS !== undefined) {
    fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_HOST_INVALID');
  }
  attestFile('/usr/lib/os-release', {
    bytes: OS_RELEASE_BYTES, sha256: OS_RELEASE_SHA256, uid: 0,
    code: 'GENESIS001_LOCAL_NODE_BOOTSTRAP_HOST_INVALID', discardBody: true,
  });
  const kernelBody = Buffer.from(`${kernelRelease()}\n`, 'utf8');
  try {
    if (kernelBody.length !== KERNEL_RELEASE_BYTES || hash(kernelBody) !== KERNEL_RELEASE_SHA256) {
      fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_HOST_INVALID');
    }
  } finally { kernelBody.fill(0); }
  const namespace = bindPreparationNamespace();
  const bootstrapIdentity = attestFile(BOOTSTRAP_NODE, {
    bytes: BOOTSTRAP_NODE_BYTES, sha256: BOOTSTRAP_NODE_SHA256, uid: 1000,
    mode: 0o500, executable: true, discardBody: true,
    code: 'GENESIS001_LOCAL_NODE_BOOTSTRAP_HOST_INVALID',
  }).identity;
  const identities = Object.freeze({
    git: attestTool(GIT), gpg: attestTool(GPG), gpgv: attestTool(GPGV),
    tar: attestTool(TAR), xz: attestTool(XZ),
  });
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  let source;
  let operation;
  let primary;
  let outcome;
  try {
    source = await attestCommittedSource(repositoryRoot, identities.git, namespace);
    const record = selectedPolicy(source);
    ensurePrivateChild(CACHE_PARENT, 'node-v24.19.0-provenance-v1');
    namespace.cache = directory(CACHE);
    recheckPreparationNamespace(namespace);
    validateCacheNamespace();
    operation = createOperation();
    const paths = {};
    for (const key of Object.keys(CACHE_FILES)) {
      paths[key] = await ensureEvidenceFile(record, key, namespace);
    }
    validateCacheNamespace();
    await authenticateEvidence(record, paths, operation, identities, namespace);
    verifySums(record, paths.shasums);
    attestFile(paths.archive, {
      bytes: record.archiveBytes, sha256: record.archiveSha256, uid: 1000, mode: 0o400,
      discardBody: true, code: 'GENESIS001_LOCAL_NODE_BOOTSTRAP_ARCHIVE_INVALID',
    });
    ensureProvenance(record);
    validateCacheNamespace(false);
    await reattestCommittedSource(repositoryRoot, identities.git, namespace, source);
    let installed = false;
    let nodeIdentity = finalInstallation();
    if (nodeIdentity === undefined) {
      const member = await extractMember(record, paths.archive, operation, identities, namespace);
      try { nodeIdentity = installMember(member); }
      finally { member.fill(0); }
      installed = true;
    }
    await runInstalledNode(nodeIdentity, namespace);
    await reattestCommittedSource(repositoryRoot, identities.git, namespace, source);
    attestFile(BOOTSTRAP_NODE, {
      bytes: BOOTSTRAP_NODE_BYTES, sha256: BOOTSTRAP_NODE_SHA256, uid: 1000,
      mode: 0o500, executable: true, discardBody: true, identity: bootstrapIdentity,
      code: 'GENESIS001_LOCAL_NODE_BOOTSTRAP_HOST_INVALID',
    });
    for (const [name, tool] of Object.entries({ git: GIT, gpg: GPG, gpgv: GPGV, tar: TAR, xz: XZ })) {
      attestTool(tool, identities[name]);
    }
    outcome = Object.freeze({
      profile: PROFILE, sourceCommit: source.commit, sourceTree: source.tree,
      nodeVersion: VERSION, nodeSha256: NODE_SHA256, installed,
    });
  } catch (error) { primary = error; }
  let cleanup;
  try { if (operation !== undefined) cleanupOperation(operation, namespace); } catch (error) { cleanup = error; }
  cleanSourceBodies(source);
  if (primary !== undefined || cleanup !== undefined) {
    if (primary !== undefined && cleanup === undefined) throw primary;
    throw new AggregateError([primary, cleanup].filter(Boolean),
      'GENESIS001_LOCAL_NODE_BOOTSTRAP_FAILED', { cause: primary });
  }
  return outcome;
}

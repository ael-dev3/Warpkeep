import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeSync,
} from 'node:fs';
import { dirname, isAbsolute, join, posix, resolve } from 'node:path';

export const G001_BASELINE = '2ae51984e1fa6ce5b0028c1a250359fed79d819b';
export const G001_BASELINE_ABI_SHA256 = 'cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03';
export const G001_FREEZE_NONCE = '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00';

const ABSOLUTE_GIT = '/usr/bin/git';
const MAX_TREE_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
const MAX_BLOB_BYTES = 1024 * 1024;
const MAX_TREE_ENTRIES = 1_000;

const policy = `export const GENESIS_001_FROZEN_POLICY = Object.freeze({
  realmId: 'GENESIS_001', releaseVersion: '0.3.43', playerAccessEnabled: true,
  admissionStateMutationsEnabled: false, accessRequestSubmissionsEnabled: false,
  sourceBaselineCommit: '${G001_BASELINE}', freezeReleaseNonce: '${G001_FREEZE_NONCE}',
});
export function rejectGenesis001AdmissionMutation(): void { throw new Error('GENESIS_001_ADMISSION_STATE_MUTATIONS_DISABLED'); }
export function rejectGenesis001AccessRequestSubmission(): void { throw new Error('GENESIS_001_ACCESS_REQUEST_SUBMISSIONS_DISABLED'); }
`;

const receipt = `import { t } from 'spacetimedb/server';
import { requireWarpkeepMetadataConnection } from '../auth';
import { GENESIS_001_FROZEN_POLICY } from '../genesis001FrozenPolicy';
import warpkeep from '../schema';
const receipt = t.object('Genesis001AccessPolicyV1', { realmId:t.string(), releaseVersion:t.string(), playerAccessEnabled:t.bool(), admissionStateMutationsEnabled:t.bool(), accessRequestSubmissionsEnabled:t.bool(), sourceBaselineCommit:t.string(), freezeReleaseNonce:t.string() });
export const genesis001AccessPolicyV1 = warpkeep.procedure({ name:'genesis_001_access_policy_v1' }, receipt, ctx => ctx.withTx(tx => { requireWarpkeepMetadataConnection(tx); return GENESIS_001_FROZEN_POLICY; }));
`;

function currentOwner() {
  return typeof process.getuid === 'function' ? process.getuid() : undefined;
}

function modeBits(stat) {
  return stat.mode & 0o777;
}

function assertOwnerPrivateDirectory(path, label) {
  const stat = lstatSync(path);
  const owner = currentOwner();
  if (
    !stat.isDirectory()
    || stat.isSymbolicLink()
    || modeBits(stat) !== 0o700
    || (owner !== undefined && stat.uid !== owner)
  ) {
    throw new Error(`${label} must be an owner-private directory`);
  }
}

function assertTrustedGitExecutable() {
  const stat = lstatSync(ABSOLUTE_GIT);
  if (
    !stat.isFile()
    || stat.isSymbolicLink()
    || (stat.mode & 0o022) !== 0
    || realpathSync.native(ABSOLUTE_GIT) !== ABSOLUTE_GIT
  ) {
    throw new Error('the exact system Git executable is unavailable or unsafe');
  }
}

function gitEnvironment(privateHome) {
  return Object.freeze({
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    HOME: privateHome,
    LANG: 'C',
    LC_ALL: 'C',
    PATH: '/usr/bin:/bin',
    TMPDIR: privateHome,
  });
}

function runGit(repoRoot, privateHome, arguments_, options = {}) {
  return execFileSync(ABSOLUTE_GIT, [
    '--no-pager',
    '--no-optional-locks',
    '-c', 'core.hooksPath=/dev/null',
    '-c', 'core.fsmonitor=false',
    '-c', 'core.attributesFile=/dev/null',
    '-c', 'core.excludesFile=/dev/null',
    '-C', repoRoot,
    ...arguments_,
  ], {
    cwd: '/',
    env: gitEnvironment(privateHome),
    maxBuffer: options.maxBuffer ?? MAX_TREE_BYTES,
    encoding: options.encoding,
  });
}

function assertFreshDestination(destination) {
  try {
    lstatSync(destination);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return;
    throw error;
  }
  throw new Error('Genesis 001 materialization requires a fresh destination');
}

function safeSourcePath(rawPath) {
  const path = rawPath.toString('utf8');
  if (
    !Buffer.from(path, 'utf8').equals(rawPath)
    || path.length === 0
    || path.includes('\\')
    || /[\0-\x1f\x7f]/.test(path)
    || posix.isAbsolute(path)
    || posix.normalize(path) !== path
    || !path.startsWith('spacetimedb/')
    || path.split('/').some(segment => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error('historical source contains an unsafe archive member');
  }
  return path;
}

function parseHistoricalTree(buffer) {
  const records = buffer.subarray(0, buffer.length - (buffer.at(-1) === 0 ? 1 : 0)).toString('binary').split('\0');
  if (records.length === 0 || records.length > MAX_TREE_ENTRIES) {
    throw new Error('historical source tree has an invalid entry count');
  }
  const paths = new Set();
  let totalBytes = 0;
  return records.map(binaryRecord => {
    const record = Buffer.from(binaryRecord, 'binary');
    const tab = record.indexOf(0x09);
    if (tab < 0) throw new Error('historical source tree contains a malformed entry');
    const metadata = record.subarray(0, tab).toString('ascii');
    const match = /^(100644) (blob) ([0-9a-f]{40}|[0-9a-f]{64}) +([0-9]+)$/.exec(metadata);
    if (match === null) throw new Error('historical source tree contains a non-regular member');
    const size = Number(match[4]);
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_BLOB_BYTES) {
      throw new Error('historical source tree contains an oversized member');
    }
    totalBytes += size;
    if (totalBytes > MAX_SOURCE_BYTES) throw new Error('historical source tree is oversized');
    const path = safeSourcePath(record.subarray(tab + 1));
    if (paths.has(path)) throw new Error('historical source tree contains a duplicate member');
    paths.add(path);
    return Object.freeze({ objectId: match[3], path, size });
  });
}

function ensurePrivateDirectory(path) {
  try {
    mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    if (!(error && typeof error === 'object' && error.code === 'EEXIST')) throw error;
  }
  chmodSync(path, 0o700);
  assertOwnerPrivateDirectory(path, 'materialized source directory');
}

function writeAll(fd, buffer) {
  let offset = 0;
  while (offset < buffer.length) offset += writeSync(fd, buffer, offset);
  fsyncSync(fd);
}

function writePrivateFile(path, value) {
  const flags = fsConstants.O_WRONLY
    | fsConstants.O_CREAT
    | fsConstants.O_EXCL
    | ('O_NOFOLLOW' in fsConstants ? fsConstants.O_NOFOLLOW : 0);
  const fd = openSync(path, flags, 0o600);
  try {
    writeAll(fd, Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8'));
  } finally {
    closeSync(fd);
  }
  chmodSync(path, 0o600);
  const stat = lstatSync(path);
  const owner = currentOwner();
  if (
    !stat.isFile()
    || stat.isSymbolicLink()
    || stat.nlink !== 1
    || modeBits(stat) !== 0o600
    || (owner !== undefined && stat.uid !== owner)
  ) {
    throw new Error('materialized source file is not owner-private');
  }
}

function rewritePrivateFile(path, value) {
  const before = lstatSync(path);
  const owner = currentOwner();
  if (
    !before.isFile()
    || before.isSymbolicLink()
    || before.nlink !== 1
    || modeBits(before) !== 0o600
    || (owner !== undefined && before.uid !== owner)
  ) {
    throw new Error('historical source file identity is unsafe');
  }
  const flags = fsConstants.O_WRONLY
    | fsConstants.O_TRUNC
    | ('O_NOFOLLOW' in fsConstants ? fsConstants.O_NOFOLLOW : 0);
  const fd = openSync(path, flags);
  try {
    writeAll(fd, Buffer.from(value, 'utf8'));
  } finally {
    closeSync(fd);
  }
  const after = lstatSync(path);
  if (after.dev !== before.dev || after.ino !== before.ino) {
    throw new Error('historical source file identity changed during editing');
  }
}

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0 || source.indexOf(needle, first + 1) >= 0) {
    throw new Error(`historical source drift: ${label}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

function edit(path, transform) {
  rewritePrivateFile(path, transform(readFileSync(path, 'utf8')));
}

function insertGuardFirst(source, procedureName, guard, label) {
  const marker = `{ name: '${procedureName}' }`;
  const start = source.indexOf(marker);
  if (start < 0 || source.indexOf(marker, start + marker.length) >= 0) {
    throw new Error(`historical source drift: ${label} procedure`);
  }
  const callback = source.indexOf('=> {', start + marker.length);
  const nextExport = source.indexOf('\nexport const ', start + marker.length);
  if (callback < 0 || (nextExport >= 0 && callback > nextExport)) {
    throw new Error(`historical source drift: ${label} callback`);
  }
  const insertion = callback + '=> {'.length;
  return source.slice(0, insertion) + `\n    ${guard}();` + source.slice(insertion);
}

function verifyGuardFirst(source, procedureName, guard, firstAuthority, label) {
  const marker = `{ name: '${procedureName}' }`;
  const start = source.indexOf(marker);
  const nextExport = source.indexOf('\nexport const ', start + marker.length);
  const end = nextExport < 0 ? source.length : nextExport;
  const body = source.slice(start, end);
  if (
    start < 0
    || body.indexOf(`${guard}();`) < 0
    || body.indexOf(`${guard}();`) >= body.indexOf(firstAuthority)
    || body.match(new RegExp(`${guard}\\(\\);`, 'g'))?.length !== 1
  ) {
    throw new Error(`historical source drift: ${label} guard is not first`);
  }
}

function extractExactHistoricalSource(repoRoot, destination) {
  const tree = runGit(repoRoot, destination, [
    'ls-tree', '-rz', '--full-tree', '--long', G001_BASELINE, '--', 'spacetimedb',
  ]);
  const entries = parseHistoricalTree(tree);
  for (const entry of entries) {
    const components = entry.path.split('/');
    for (let index = 1; index < components.length; index += 1) {
      ensurePrivateDirectory(join(destination, ...components.slice(0, index)));
    }
    const blob = runGit(
      repoRoot,
      destination,
      ['cat-file', 'blob', entry.objectId],
      { maxBuffer: MAX_BLOB_BYTES + 1 },
    );
    if (blob.length !== entry.size) {
      throw new Error(`historical source blob size changed: ${entry.path}`);
    }
    writePrivateFile(join(destination, ...components), blob);
  }
  return entries.length;
}

export function materializeGenesis001HistoricalBaseline({ repoRoot, destination }) {
  if (
    !isAbsolute(repoRoot)
    || !isAbsolute(destination)
    || resolve(destination) !== destination
    || destination.includes('\0')
    || destination.includes('\n')
  ) {
    throw new Error('Genesis 001 materialization paths must be exact and absolute');
  }
  assertTrustedGitExecutable();
  const exactRepoRoot = realpathSync.native(repoRoot);
  assertOwnerPrivateDirectory(dirname(destination), 'materialization parent');
  assertFreshDestination(destination);
  mkdirSync(destination, { mode: 0o700 });
  chmodSync(destination, 0o700);
  assertOwnerPrivateDirectory(destination, 'materialization destination');

  const resolved = runGit(
    exactRepoRoot,
    destination,
    ['rev-parse', '--verify', `${G001_BASELINE}^{commit}`],
    { encoding: 'utf8' },
  ).trim();
  if (resolved !== G001_BASELINE) {
    throw new Error('historical baseline is unavailable or not exact');
  }

  const extractedFileCount = extractExactHistoricalSource(exactRepoRoot, destination);
  return Object.freeze({
    baseline: G001_BASELINE,
    baselineAbiSha256: G001_BASELINE_ABI_SHA256,
    extractedFileCount,
  });
}

export function materializeGenesis001Frozen({ repoRoot, destination }) {
  const baseline = materializeGenesis001HistoricalBaseline({ repoRoot, destination });
  const sourceRoot = join(destination, 'spacetimedb');
  const policyPath = join(sourceRoot, 'src/genesis001FrozenPolicy.ts');
  const receiptPath = join(sourceRoot, 'src/reducers/genesis001FrozenPolicy.ts');
  writePrivateFile(policyPath, policy);
  writePrivateFile(receiptPath, receipt);

  const adminPath = join(sourceRoot, 'src/reducers/admin.ts');
  edit(adminPath, source => {
    let next = replaceOnce(
      source,
      "} from '../admissionPolicy';",
      "} from '../admissionPolicy';\nimport { rejectGenesis001AdmissionMutation } from '../genesis001FrozenPolicy';",
      'admin import',
    );
    for (const procedureName of [
      'admin_allow_fid',
      'admin_admit_founder_v1',
      'admin_disable_fid',
      'admin_bump_auth_epoch',
    ]) {
      next = insertGuardFirst(
        next,
        procedureName,
        'rejectGenesis001AdmissionMutation',
        procedureName,
      );
    }
    return next;
  });

  const requestsPath = join(sourceRoot, 'src/reducers/accessRequests.ts');
  edit(requestsPath, source => {
    let next = replaceOnce(
      source,
      "} from '../accessRequestPolicy';",
      "} from '../accessRequestPolicy';\nimport { rejectGenesis001AccessRequestSubmission, rejectGenesis001AdmissionMutation } from '../genesis001FrozenPolicy';",
      'request import',
    );
    next = insertGuardFirst(
      next,
      'access_request_submit_v1',
      'rejectGenesis001AccessRequestSubmission',
      'access_request_submit_v1',
    );
    return insertGuardFirst(
      next,
      'admin_reset_access_request_v1',
      'rejectGenesis001AdmissionMutation',
      'admin_reset_access_request_v1',
    );
  });

  const indexPath = join(sourceRoot, 'src/index.ts');
  edit(indexPath, source => `${source}\nexport { genesis001AccessPolicyV1 } from './reducers/genesis001FrozenPolicy';\n`);
  const schemaPath = join(sourceRoot, 'src/schema.ts');
  edit(schemaPath, source => replaceOnce(
    source,
    "  'admin_activate_daily_marks_v1',\n])",
    "  'admin_activate_daily_marks_v1',\n  'genesis_001_access_policy_v1',\n])",
    'explicit procedure name',
  ));

  const admin = readFileSync(adminPath, 'utf8');
  for (const procedureName of [
    'admin_allow_fid',
    'admin_admit_founder_v1',
    'admin_disable_fid',
    'admin_bump_auth_epoch',
  ]) {
    verifyGuardFirst(
      admin,
      procedureName,
      'rejectGenesis001AdmissionMutation',
      'requireAdmin(',
      procedureName,
    );
  }
  const requests = readFileSync(requestsPath, 'utf8');
  verifyGuardFirst(
    requests,
    'access_request_submit_v1',
    'rejectGenesis001AccessRequestSubmission',
    'requireAccessRequestResolver(',
    'access_request_submit_v1',
  );
  verifyGuardFirst(
    requests,
    'admin_reset_access_request_v1',
    'rejectGenesis001AdmissionMutation',
    'requireAdmin(',
    'admin_reset_access_request_v1',
  );

  return Object.freeze({
    ...baseline,
    freezeNonce: G001_FREEZE_NONCE,
  });
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

import { spawnSync } from 'node:child_process';
import { createHash, randomBytes as systemRandomBytes } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const GENESIS_001_CENSUS_PRIVACY_SAFE_RECEIPT_PROFILE =
  'warpkeep-genesis-001-census-export-privacy-safe-v1';

const PRIVATE_RECEIPT_PROFILE =
  'warpkeep-genesis-001-census-export-private-proof-v1';
const PROOF_DOMAIN =
  'warpkeep.genesis-001.census-export.privacy-safe.opaque-proof.v1\n';
const GENESIS_001_SOURCE_BASELINE_COMMIT =
  '2ae51984e1fa6ce5b0028c1a250359fed79d819b';
const GENESIS_001_ADMISSION_FREEZE_ATTESTATION =
  'b043a0e2e4e2c23e183a0497f47c6d8265f4d95e1d3b58c85629d0de80683304';
const GENESIS_001_CENSUS_TARGET_CONFIGURATION_DIGEST =
  'fed7c0345b370df3fd2399fb0654f55dc55f8f1397ca95544a46429fecb20470';
const COMMIT = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const U64_MAXIMUM = (1n << 64n) - 1n;
const MAXIMUM_CENSUS_ROWS = 4_096;
const MAXIMUM_CENSUS_BYTES = 1_024 * 1_024;
const MAXIMUM_EXPORT_REFERENCE_BYTES = 4 * 1_024;
const MAXIMUM_PRIVATE_RECEIPT_BYTES = 8 * 1_024;
const BLINDING_NONCE_BYTES = 32;
const CENSUS_BASENAME =
  /^warpkeep-access-request-census-[0-9]{8}T[0-9]{6}Z\.txt$/u;
const EXPORT_REFERENCE_BASENAME =
  /^warpkeep-access-request-census-export-reference-[0-9]{8}T[0-9]{6}Z\.json$/u;
const EXPORT_REFERENCE_KEYS = Object.freeze([
  'count', 'pathBasename', 'sha256', 'size',
]);
const PYTHON = '/usr/bin/python3';

const PRIVATE_RECEIPT_OPENAT_SOURCE = String.raw`
import errno
import os
import stat
import sys

def die(status=1):
    raise SystemExit(status)

def decimal(value):
    if not value.isascii() or not value.isdecimal():
        die()
    return int(value, 10)

root = os.fstat(3)
expected = tuple(decimal(value) for value in sys.argv[2:6])
if (
    not stat.S_ISDIR(root.st_mode)
    or (root.st_dev, root.st_ino, root.st_uid, root.st_mode) != expected
):
    die()

filename = sys.argv[1]
body = sys.stdin.buffer.read()
if not body or len(body) > 8192:
    die()

fd = None
created = False
try:
    try:
        fd = os.open(
            filename,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0),
            0o600,
            dir_fd=3,
        )
        created = True
    except FileExistsError:
        die(errno.EEXIST)
    view = memoryview(body)
    offset = 0
    while offset < len(view):
        written = os.write(fd, view[offset:])
        if written < 1:
            die()
        offset += written
    os.fsync(fd)
    current = os.fstat(fd)
    if (
        not stat.S_ISREG(current.st_mode)
        or stat.S_IMODE(current.st_mode) != 0o600
        or current.st_uid != root.st_uid
        or current.st_nlink != 1
        or current.st_size != len(body)
    ):
        die()
    os.close(fd)
    fd = None
    os.fsync(3)
    sys.stdout.write(
        f'{current.st_dev}:{current.st_ino}:{current.st_uid}:{current.st_size}\n'
    )
except BaseException:
    if fd is not None:
        try:
            os.close(fd)
        except OSError:
            pass
    if created:
        try:
            os.unlink(filename, dir_fd=3)
            os.fsync(3)
        except OSError:
            pass
    raise
`;

export class Genesis001CensusPrivacySafeReceiptError extends Error {
  constructor(code) {
    super(code);
    this.name = 'Genesis001CensusPrivacySafeReceiptError';
    this.code = code;
  }
}

function fail(code) {
  throw new Genesis001CensusPrivacySafeReceiptError(code);
}

function ownerId() {
  if (typeof process.getuid !== 'function') {
    fail('GENESIS_001_CENSUS_PRIVACY_SAFE_PRIVATE_FILE_INVALID');
  }
  return BigInt(process.getuid());
}

function exactPath(path) {
  if (
    typeof path !== 'string'
    || !isAbsolute(path)
    || resolve(path) !== path
  ) fail('GENESIS_001_CENSUS_PRIVACY_SAFE_PRIVATE_FILE_INVALID');
  return path;
}

function sameIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.uid === right.uid
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function sameDirectoryIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.uid === right.uid
    && left.mode === right.mode;
}

function openOwnerPrivateDirectory(path) {
  exactPath(path);
  let descriptor;
  try {
    const before = lstatSync(path, { bigint: true });
    if (
      before.isSymbolicLink()
      || !before.isDirectory()
      || before.uid !== ownerId()
      || (before.mode & 0o7777n) !== 0o700n
      || realpathSync(path) !== path
    ) fail('GENESIS_001_CENSUS_PRIVACY_SAFE_PRIVATE_DIRECTORY_INVALID');
    descriptor = openSync(
      path,
      constants.O_RDONLY
        | (constants.O_DIRECTORY ?? 0)
        | (constants.O_NOFOLLOW ?? 0),
    );
    const opened = fstatSync(descriptor, { bigint: true });
    if (!sameDirectoryIdentity(before, opened)) {
      fail('GENESIS_001_CENSUS_PRIVACY_SAFE_PRIVATE_DIRECTORY_INVALID');
    }
    return Object.freeze({ path, descriptor, identity: opened });
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (error instanceof Genesis001CensusPrivacySafeReceiptError) throw error;
    return fail('GENESIS_001_CENSUS_PRIVACY_SAFE_PRIVATE_DIRECTORY_INVALID');
  }
}

function requireDirectoryUnchanged(directory) {
  try {
    const pathState = lstatSync(directory.path, { bigint: true });
    const heldState = fstatSync(directory.descriptor, { bigint: true });
    if (
      !sameDirectoryIdentity(directory.identity, pathState)
      || !sameDirectoryIdentity(directory.identity, heldState)
      || realpathSync(directory.path) !== directory.path
    ) fail('GENESIS_001_CENSUS_PRIVACY_SAFE_PRIVATE_DIRECTORY_CHANGED');
  } catch (error) {
    if (error instanceof Genesis001CensusPrivacySafeReceiptError) throw error;
    return fail('GENESIS_001_CENSUS_PRIVACY_SAFE_PRIVATE_DIRECTORY_CHANGED');
  }
}

function readOwnerPrivateFile(path, maximumBytes, hook) {
  exactPath(path);
  const directory = openOwnerPrivateDirectory(dirname(path));
  let descriptor;
  let bytes;
  try {
    const before = lstatSync(path, { bigint: true });
    if (
      before.isSymbolicLink()
      || !before.isFile()
      || before.uid !== ownerId()
      || before.nlink !== 1n
      || (before.mode & 0o7777n) !== 0o600n
      || before.size < 1n
      || before.size > BigInt(maximumBytes)
      || realpathSync(path) !== path
    ) fail('GENESIS_001_CENSUS_PRIVACY_SAFE_PRIVATE_FILE_INVALID');
    descriptor = openSync(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const opened = fstatSync(descriptor, { bigint: true });
    if (!sameIdentity(before, opened)) {
      fail('GENESIS_001_CENSUS_PRIVACY_SAFE_PRIVATE_FILE_INVALID');
    }
    hook?.();
    bytes = Buffer.alloc(Number(opened.size));
    let offset = 0;
    while (offset < bytes.byteLength) {
      const amount = readSync(
        descriptor,
        bytes,
        offset,
        bytes.byteLength - offset,
        offset,
      );
      if (amount < 1) {
        fail('GENESIS_001_CENSUS_PRIVACY_SAFE_PRIVATE_FILE_CHANGED');
      }
      offset += amount;
    }
    const heldAfter = fstatSync(descriptor, { bigint: true });
    const pathAfter = lstatSync(path, { bigint: true });
    requireDirectoryUnchanged(directory);
    if (
      !sameIdentity(opened, heldAfter)
      || !sameIdentity(opened, pathAfter)
      || realpathSync(path) !== path
    ) fail('GENESIS_001_CENSUS_PRIVACY_SAFE_PRIVATE_FILE_CHANGED');
    return bytes;
  } catch (error) {
    bytes?.fill(0);
    if (error instanceof Genesis001CensusPrivacySafeReceiptError) throw error;
    return fail('GENESIS_001_CENSUS_PRIVACY_SAFE_PRIVATE_FILE_INVALID');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    closeSync(directory.descriptor);
  }
}

function exactExporterReference(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getOwnPropertySymbols(value).length !== 0
    || JSON.stringify(Object.keys(value).sort())
      !== JSON.stringify(EXPORT_REFERENCE_KEYS)
    || !Number.isSafeInteger(value.count)
    || value.count < 0
    || value.count > MAXIMUM_CENSUS_ROWS
    || !Number.isSafeInteger(value.size)
    || value.size < 1
    || value.size > MAXIMUM_CENSUS_BYTES
    || !SHA256.test(value.sha256 ?? '')
    || typeof value.pathBasename !== 'string'
    || !CENSUS_BASENAME.test(value.pathBasename)
  ) fail('GENESIS_001_CENSUS_PRIVACY_SAFE_EXPORT_REFERENCE_INVALID');
  return Object.freeze({
    count: value.count,
    pathBasename: value.pathBasename,
    sha256: value.sha256,
    size: value.size,
  });
}

function parseExporterReference(bytes) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!text.endsWith('\n') || text.includes('\r') || text.includes('\0')) {
      fail('GENESIS_001_CENSUS_PRIVACY_SAFE_EXPORT_REFERENCE_INVALID');
    }
    const value = JSON.parse(text);
    if (`${JSON.stringify(value)}\n` !== text) {
      fail('GENESIS_001_CENSUS_PRIVACY_SAFE_EXPORT_REFERENCE_INVALID');
    }
    return exactExporterReference(value);
  } catch (error) {
    if (error instanceof Genesis001CensusPrivacySafeReceiptError) throw error;
    return fail('GENESIS_001_CENSUS_PRIVACY_SAFE_EXPORT_REFERENCE_INVALID');
  }
}

function decimal(value, maximumDigits) {
  if (!new RegExp(`^(?:0|[1-9][0-9]{0,${maximumDigits - 1}})$`, 'u').test(value)) {
    fail('GENESIS_001_CENSUS_PRIVACY_SAFE_CENSUS_INVALID');
  }
  return BigInt(value);
}

function validateCanonicalCensus(bytes, pathBasename) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return fail('GENESIS_001_CENSUS_PRIVACY_SAFE_CENSUS_INVALID');
  }
  if (
    !CENSUS_BASENAME.test(pathBasename)
    || !text.endsWith('\n')
    || text.includes('\r')
    || text.includes('\0')
  ) fail('GENESIS_001_CENSUS_PRIVACY_SAFE_CENSUS_INVALID');
  const lines = text.split('\n');
  if (lines.pop() !== '') {
    fail('GENESIS_001_CENSUS_PRIVACY_SAFE_CENSUS_INVALID');
  }
  const fixed = [
    'warpkeep-access-request-census-v1',
    'realm-id\tGENESIS_001',
    'release-version\t0.3.43',
    `source-baseline-commit\t${GENESIS_001_SOURCE_BASELINE_COMMIT}`,
    `admission-freeze-attestation\t${GENESIS_001_ADMISSION_FREEZE_ATTESTATION}`,
    `target-configuration-digest\t${GENESIS_001_CENSUS_TARGET_CONFIGURATION_DIGEST}`,
  ];
  if (fixed.some((line, index) => lines[index] !== line)) {
    fail('GENESIS_001_CENSUS_PRIVACY_SAFE_CENSUS_INVALID');
  }
  const totalMatch = /^total-requests\t(.+)$/u.exec(lines[6] ?? '');
  const pendingMatch = /^pending-requests\t(.+)$/u.exec(lines[7] ?? '');
  if (
    totalMatch === null
    || pendingMatch === null
    || lines[8]
      !== 'requested-at-micros\tfid\trequest-state\tadmission-state'
  ) fail('GENESIS_001_CENSUS_PRIVACY_SAFE_CENSUS_INVALID');
  const total = decimal(totalMatch[1], 4);
  const expectedPending = decimal(pendingMatch[1], 4);
  if (
    total > BigInt(MAXIMUM_CENSUS_ROWS)
    || expectedPending > total
    || BigInt(lines.length - 9) !== total
  ) fail('GENESIS_001_CENSUS_PRIVACY_SAFE_CENSUS_INVALID');
  let previous;
  let pending = 0n;
  const fids = new Set();
  for (const line of lines.slice(9)) {
    const fields = line.split('\t');
    if (fields.length !== 4) {
      fail('GENESIS_001_CENSUS_PRIVACY_SAFE_CENSUS_INVALID');
    }
    const [requestedAtValue, fidValue, requestState, admissionState] = fields;
    if (
      !/^[1-9][0-9]{0,19}$/u.test(requestedAtValue)
      || !/^[1-9][0-9]{0,15}$/u.test(fidValue)
      || BigInt(requestedAtValue) > U64_MAXIMUM
      || BigInt(fidValue) > BigInt(Number.MAX_SAFE_INTEGER)
      || (requestState !== 'pending' && requestState !== 'resolved')
      || !['missing', 'enabled', 'disabled'].includes(admissionState)
      || (requestState === 'pending' && admissionState === 'enabled')
      || fids.has(fidValue)
    ) fail('GENESIS_001_CENSUS_PRIVACY_SAFE_CENSUS_INVALID');
    const current = {
      requestedAtMicros: BigInt(requestedAtValue),
      fid: BigInt(fidValue),
    };
    if (previous !== undefined && (
      current.requestedAtMicros < previous.requestedAtMicros
      || (current.requestedAtMicros === previous.requestedAtMicros
        && current.fid <= previous.fid)
    )) fail('GENESIS_001_CENSUS_PRIVACY_SAFE_CENSUS_INVALID');
    if (requestState === 'pending') pending += 1n;
    previous = current;
    fids.add(fidValue);
  }
  if (pending !== expectedPending) {
    fail('GENESIS_001_CENSUS_PRIVACY_SAFE_CENSUS_INVALID');
  }
  return Object.freeze({
    count: Number(total),
    pathBasename,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.byteLength,
  });
}

function exactRandomNonce(randomBytes) {
  if (typeof randomBytes !== 'function') {
    fail('GENESIS_001_CENSUS_PRIVACY_SAFE_RANDOM_INVALID');
  }
  let generated;
  try {
    generated = randomBytes(BLINDING_NONCE_BYTES);
  } catch {
    return fail('GENESIS_001_CENSUS_PRIVACY_SAFE_RANDOM_INVALID');
  }
  if (!(generated instanceof Uint8Array) || generated.byteLength !== BLINDING_NONCE_BYTES) {
    fail('GENESIS_001_CENSUS_PRIVACY_SAFE_RANDOM_INVALID');
  }
  const nonce = Buffer.from(generated);
  if (nonce.every(byte => byte === 0)) {
    nonce.fill(0);
    fail('GENESIS_001_CENSUS_PRIVACY_SAFE_RANDOM_INVALID');
  }
  return nonce;
}

function exactPython() {
  try {
    const entry = lstatSync(PYTHON, { bigint: true });
    const resolved = realpathSync(PYTHON);
    const target = lstatSync(resolved, { bigint: true });
    if (
      (process.platform === 'darwin'
        ? resolved !== PYTHON || entry.isSymbolicLink()
        : !/^\/usr\/bin\/python3(?:\.[0-9]+)?$/u.test(resolved))
      || !target.isFile()
      || target.isSymbolicLink()
      || target.uid !== 0n
      || (target.mode & 0o7777n) !== 0o755n
    ) fail('GENESIS_001_CENSUS_PRIVACY_SAFE_PYTHON_INVALID');
    return Object.freeze({
      path: resolved,
      identity: [
        entry.dev, entry.ino, entry.mode, entry.uid, entry.size,
        target.dev, target.ino, target.mode, target.uid, target.size,
      ].join(':'),
    });
  } catch (error) {
    if (error instanceof Genesis001CensusPrivacySafeReceiptError) throw error;
    return fail('GENESIS_001_CENSUS_PRIVACY_SAFE_PYTHON_INVALID');
  }
}

function writePrivateReceipt(directory, filename, bytes, spawn = spawnSync) {
  requireDirectoryUnchanged(directory);
  const python = exactPython();
  const result = spawn(python.path, [
    '-I', '-S', '-B', '-c', PRIVATE_RECEIPT_OPENAT_SOURCE,
    filename,
    directory.identity.dev.toString(),
    directory.identity.ino.toString(),
    directory.identity.uid.toString(),
    directory.identity.mode.toString(),
  ], {
    encoding: 'buffer',
    env: { LANG: 'C', LC_ALL: 'C' },
    input: bytes,
    stdio: ['pipe', 'pipe', 'pipe', directory.descriptor],
    timeout: 10_000,
    maxBuffer: 4_096,
  });
  const pythonAfter = exactPython();
  if (result?.status === 17) {
    fail('GENESIS_001_CENSUS_PRIVACY_SAFE_RECEIPT_EXISTS');
  }
  if (
    result?.status !== 0
    || !Buffer.isBuffer(result.stdout)
    || !Buffer.isBuffer(result.stderr)
    || result.stderr.byteLength !== 0
    || pythonAfter.identity !== python.identity
  ) fail('GENESIS_001_CENSUS_PRIVACY_SAFE_RECEIPT_WRITE_FAILED');
  requireDirectoryUnchanged(directory);
  const identity = result.stdout.toString('ascii').trim().split(':');
  if (
    identity.length !== 4
    || identity.some(value => !/^(?:0|[1-9][0-9]*)$/u.test(value))
  ) fail('GENESIS_001_CENSUS_PRIVACY_SAFE_RECEIPT_WRITE_FAILED');
  const path = join(directory.path, filename);
  const status = lstatSync(path, { bigint: true });
  if (
    !status.isFile()
    || status.isSymbolicLink()
    || status.dev !== BigInt(identity[0])
    || status.ino !== BigInt(identity[1])
    || status.uid !== BigInt(identity[2])
    || status.size !== BigInt(identity[3])
    || status.nlink !== 1n
    || (status.mode & 0o7777n) !== 0o600n
  ) fail('GENESIS_001_CENSUS_PRIVACY_SAFE_RECEIPT_WRITE_FAILED');
  return path;
}

export function executeGenesis001CensusPrivacySafeReceipt(input, hooks = {}) {
  if (
    input === null
    || typeof input !== 'object'
    || !COMMIT.test(input.sourceCommit ?? '')
    || !CENSUS_BASENAME.test(basename(input.censusPath ?? ''))
  ) fail('GENESIS_001_CENSUS_PRIVACY_SAFE_INPUT_INVALID');
  let exporterBytes;
  let censusBytes;
  let nonce;
  let privateReceiptBytes;
  const privateDirectory = openOwnerPrivateDirectory(input.privateReceiptDirectory);
  try {
    exporterBytes = readOwnerPrivateFile(
      input.exporterReceiptPath,
      MAXIMUM_EXPORT_REFERENCE_BYTES,
    );
    const expectedReference = parseExporterReference(exporterBytes);
    const expectedExporterBasename = expectedReference.pathBasename
      .replace(
        /^warpkeep-access-request-census-/u,
        'warpkeep-access-request-census-export-reference-',
      )
      .replace(/\.txt$/u, '.json');
    if (
      !EXPORT_REFERENCE_BASENAME.test(basename(input.exporterReceiptPath))
      || basename(input.exporterReceiptPath) !== expectedExporterBasename
    ) fail('GENESIS_001_CENSUS_PRIVACY_SAFE_EXPORT_REFERENCE_INVALID');
    censusBytes = readOwnerPrivateFile(
      input.censusPath,
      MAXIMUM_CENSUS_BYTES,
      hooks.afterCensusOpen,
    );
    const actualReference = validateCanonicalCensus(
      censusBytes,
      basename(input.censusPath),
    );
    if (JSON.stringify(actualReference) !== JSON.stringify(expectedReference)) {
      fail('GENESIS_001_CENSUS_PRIVACY_SAFE_EXPORT_MISMATCH');
    }
    nonce = exactRandomNonce(input.randomBytes ?? systemRandomBytes);
    const privateProof = Object.freeze({
      schemaVersion: 1,
      profile: PRIVATE_RECEIPT_PROFILE,
      realmId: 'GENESIS_001',
      releaseVersion: '0.3.43',
      sourceCommit: input.sourceCommit,
      privateCensusReference: actualReference,
      privateBlindingNonceHex: nonce.toString('hex'),
    });
    const opaqueProofDigest = createHash('sha256')
      .update(PROOF_DOMAIN)
      .update(`${JSON.stringify(privateProof)}\n`)
      .digest('hex');
    const completePrivateReceipt = Object.freeze({
      ...privateProof,
      opaqueProofDigest,
    });
    privateReceiptBytes = Buffer.from(
      `${JSON.stringify(completePrivateReceipt, null, 2)}\n`,
      'utf8',
    );
    if (
      privateReceiptBytes.byteLength < 1
      || privateReceiptBytes.byteLength > MAXIMUM_PRIVATE_RECEIPT_BYTES
    ) fail('GENESIS_001_CENSUS_PRIVACY_SAFE_RECEIPT_WRITE_FAILED');
    const privateReceiptBasename =
      `genesis-001-census-privacy-safe-${opaqueProofDigest}.json`;
    hooks.beforeReceiptCreate?.();
    const privateReceiptPath = writePrivateReceipt(
      privateDirectory,
      privateReceiptBasename,
      privateReceiptBytes,
      input.spawn,
    );
    hooks.afterReceiptCreate?.();
    const verifiedBytes = readOwnerPrivateFile(
      privateReceiptPath,
      MAXIMUM_PRIVATE_RECEIPT_BYTES,
    );
    try {
      if (!verifiedBytes.equals(privateReceiptBytes)) {
        fail('GENESIS_001_CENSUS_PRIVACY_SAFE_RECEIPT_WRITE_FAILED');
      }
    } finally {
      verifiedBytes.fill(0);
    }
    return Object.freeze({
      profile: GENESIS_001_CENSUS_PRIVACY_SAFE_RECEIPT_PROFILE,
      opaqueProofDigest,
      privateReceiptBasename,
    });
  } finally {
    exporterBytes?.fill(0);
    censusBytes?.fill(0);
    nonce?.fill(0);
    privateReceiptBytes?.fill(0);
    closeSync(privateDirectory.descriptor);
  }
}

function parseArguments(values, environment) {
  const source = values.length === 1
    ? /^--source-commit=([0-9a-f]{40})$/u.exec(values[0])
    : null;
  const censusPath = environment.WARPKEEP_G001_PRIVATE_CENSUS_TXT_PATH;
  const exporterReceiptPath =
    environment.WARPKEEP_G001_PRIVATE_CENSUS_EXPORT_RECEIPT_PATH;
  const privateReceiptDirectory =
    environment.WARPKEEP_G001_PRIVATE_CENSUS_PROOF_DIRECTORY;
  delete environment.WARPKEEP_G001_PRIVATE_CENSUS_TXT_PATH;
  delete environment.WARPKEEP_G001_PRIVATE_CENSUS_EXPORT_RECEIPT_PATH;
  delete environment.WARPKEEP_G001_PRIVATE_CENSUS_PROOF_DIRECTORY;
  if (
    source === null
    || typeof censusPath !== 'string'
    || typeof exporterReceiptPath !== 'string'
    || typeof privateReceiptDirectory !== 'string'
  ) fail('GENESIS_001_CENSUS_PRIVACY_SAFE_ARGUMENT_INVALID');
  return Object.freeze({
    sourceCommit: source[1],
    censusPath,
    exporterReceiptPath,
    privateReceiptDirectory,
  });
}

async function main() {
  const result = executeGenesis001CensusPrivacySafeReceipt(
    parseArguments(process.argv.slice(2), process.env),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${
      error instanceof Genesis001CensusPrivacySafeReceiptError
        ? error.code
        : 'GENESIS_001_CENSUS_PRIVACY_SAFE_FAILED'
    }\n`);
    process.exitCode = 1;
  }
}

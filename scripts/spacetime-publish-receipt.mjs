import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { homedir } from 'node:os';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';

export const SPACETIME_PUBLISH_RECEIPT_TARGET = Object.freeze({
  uri: 'https://maincloud.spacetimedb.com',
  database:
    'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
  deleteData: 'never',
});

export const SPACETIME_PUBLISH_RECEIPT_KIND =
  'alpha-0.3.21-worker-return-repair-publish-v1';

const SHA256_HEX = /^[0-9a-f]{64}$/;
const RECEIPT_NAME =
  /^spacetime-publish-success-[0-9a-f]{64}\.json$/;
const TEMPORARY_RECEIPT_NAME =
  /^\.spacetime-publish-success-[0-9a-f]{64}-[0-9a-f]{12}\.json\.tmp$/;
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const MAX_RECEIPT_BYTES = 8 * 1024;
const MAX_RECEIPT_AGE_MILLISECONDS = 24 * 60 * 60 * 1_000;

export class SpacetimePublishReceiptError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SpacetimePublishReceiptError';
    this.code = code;
  }
}

function fail(code) {
  throw new SpacetimePublishReceiptError(code);
}

function pathOverlaps(parent, candidate) {
  const difference = relative(parent, candidate);
  return difference === ''
    || (
      difference !== '..'
      && !difference.startsWith(`..${sep}`)
      && !isAbsolute(difference)
    );
}

function exactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return actual.length === canonical.length
    && actual.every((key, index) => key === canonical[index]);
}

function assertPrivateDirectory(directory, repositoryRoot, create) {
  if (!isAbsolute(directory)) {
    fail('SPACETIME_PUBLISH_RECEIPT_DIRECTORY_NOT_ABSOLUTE');
  }
  const requested = resolve(directory);
  let canonicalRepository;
  try {
    canonicalRepository = realpathSync(resolve(repositoryRoot));
  } catch {
    fail('SPACETIME_PUBLISH_RECEIPT_REPOSITORY_INVALID');
  }
  if (
    pathOverlaps(canonicalRepository, requested)
    || pathOverlaps(requested, canonicalRepository)
  ) fail('SPACETIME_PUBLISH_RECEIPT_REPOSITORY_OVERLAP');

  const missing = [];
  let ancestor = requested;
  while (!existsSync(ancestor)) {
    if (!create) fail('SPACETIME_PUBLISH_RECEIPT_MISSING');
    missing.unshift(ancestor);
    const parent = dirname(ancestor);
    if (parent === ancestor) {
      fail('SPACETIME_PUBLISH_RECEIPT_DIRECTORY_INVALID');
    }
    ancestor = parent;
  }
  let inspected = ancestor;
  while (true) {
    const status = lstatSync(inspected);
    if (status.isSymbolicLink()) {
      fail('SPACETIME_PUBLISH_RECEIPT_SYMLINK_REJECTED');
    }
    const parent = dirname(inspected);
    if (parent === inspected) break;
    inspected = parent;
  }
  let canonicalParent = realpathSync(ancestor);
  if (
    pathOverlaps(canonicalRepository, canonicalParent)
    || pathOverlaps(canonicalParent, canonicalRepository)
  ) fail('SPACETIME_PUBLISH_RECEIPT_REPOSITORY_OVERLAP');

  for (const path of missing) {
    try {
      mkdirSync(path, { recursive: false, mode: DIRECTORY_MODE });
    } catch {
      fail('SPACETIME_PUBLISH_RECEIPT_DIRECTORY_CREATE_FAILED');
    }
    const status = lstatSync(path);
    const canonicalCreated = realpathSync(path);
    if (
      !status.isDirectory()
      || status.isSymbolicLink()
      || (process.getuid !== undefined && status.uid !== process.getuid())
      || (status.mode & 0o777) !== DIRECTORY_MODE
      || dirname(canonicalCreated) !== canonicalParent
    ) fail('SPACETIME_PUBLISH_RECEIPT_DIRECTORY_CREATE_FAILED');
    canonicalParent = canonicalCreated;
  }

  const status = lstatSync(requested);
  if (
    !status.isDirectory()
    || status.isSymbolicLink()
    || (process.getuid !== undefined && status.uid !== process.getuid())
    || (statSync(requested).mode & 0o777) !== DIRECTORY_MODE
  ) fail('SPACETIME_PUBLISH_RECEIPT_DIRECTORY_INVALID');
  const canonical = realpathSync(requested);
  if (
    pathOverlaps(canonicalRepository, canonical)
    || pathOverlaps(canonical, canonicalRepository)
  ) fail('SPACETIME_PUBLISH_RECEIPT_REPOSITORY_OVERLAP');
  for (const entry of readdirSync(canonical, { withFileTypes: true })) {
    if (
      !entry.isFile()
      || (
        !RECEIPT_NAME.test(entry.name)
        && !TEMPORARY_RECEIPT_NAME.test(entry.name)
      )
    ) fail('SPACETIME_PUBLISH_RECEIPT_DIRECTORY_NOT_DEDICATED');
    const entryStatus = lstatSync(join(canonical, entry.name));
    if (
      entryStatus.isSymbolicLink()
      || (process.getuid !== undefined && entryStatus.uid !== process.getuid())
      || (entryStatus.mode & 0o777) !== FILE_MODE
    ) fail('SPACETIME_PUBLISH_RECEIPT_DIRECTORY_NOT_DEDICATED');
  }
  return canonical;
}

function canonicalJson(value) {
  const canonicalize = current => {
    if (Array.isArray(current)) return current.map(canonicalize);
    if (current !== null && typeof current === 'object') {
      return Object.fromEntries(
        Object.entries(current)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, canonicalize(child)]),
      );
    }
    return current;
  };
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function validateReceipt(value, expectedArtifactDigest, now) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || !exactKeys(value, [
      'schemaVersion',
      'kind',
      'recordedAt',
      'target',
      'artifactDigest',
      'v12TableSchemaDigest',
      'workerForwardRepair',
      'postPublicationCheckpoint',
      'postVerification',
    ])
    || value.schemaVersion !== 1
    || value.kind !== SPACETIME_PUBLISH_RECEIPT_KIND
    || typeof value.recordedAt !== 'string'
    || typeof value.target !== 'object'
    || value.target === null
    || Array.isArray(value.target)
    || !exactKeys(value.target, ['uri', 'database', 'deleteData'])
    || value.target.uri !== SPACETIME_PUBLISH_RECEIPT_TARGET.uri
    || value.target.database !== SPACETIME_PUBLISH_RECEIPT_TARGET.database
    || value.target.deleteData !== SPACETIME_PUBLISH_RECEIPT_TARGET.deleteData
    || value.artifactDigest !== expectedArtifactDigest
    || !SHA256_HEX.test(value.artifactDigest)
    || typeof value.v12TableSchemaDigest !== 'string'
    || !SHA256_HEX.test(value.v12TableSchemaDigest)
    || value.workerForwardRepair !== 'return-node-reuse-v1'
    || (
      value.postPublicationCheckpoint !== 'candidate-pending'
      && value.postPublicationCheckpoint !== 'candidate-existing'
    )
    || value.postVerification !== 'passed'
  ) fail('SPACETIME_PUBLISH_RECEIPT_INVALID');
  const recordedAt = Date.parse(value.recordedAt);
  const observedAt = now.getTime();
  if (
    !Number.isFinite(recordedAt)
    || new Date(recordedAt).toISOString() !== value.recordedAt
    || recordedAt > observedAt
    || observedAt - recordedAt > MAX_RECEIPT_AGE_MILLISECONDS
  ) fail('SPACETIME_PUBLISH_RECEIPT_EXPIRED');
  return Object.freeze({
    artifactDigest: value.artifactDigest,
    v12TableSchemaDigest: value.v12TableSchemaDigest,
    recordedAt: value.recordedAt,
    postPublicationCheckpoint: value.postPublicationCheckpoint,
  });
}

function readReceiptFile(path, expectedArtifactDigest, now) {
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(descriptor);
    if (
      !before.isFile()
      || before.size < 1
      || before.size > MAX_RECEIPT_BYTES
      || (before.mode & 0o777) !== FILE_MODE
      || (process.getuid !== undefined && before.uid !== process.getuid())
    ) fail('SPACETIME_PUBLISH_RECEIPT_INVALID');
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
      || bytes.byteLength !== after.size
    ) fail('SPACETIME_PUBLISH_RECEIPT_CHANGED');
    const parsed = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    );
    const receipt = validateReceipt(parsed, expectedArtifactDigest, now);
    return Object.freeze({
      ...receipt,
      receiptDigest: createHash('sha256').update(bytes).digest('hex'),
    });
  } catch (error) {
    if (error instanceof SpacetimePublishReceiptError) throw error;
    fail('SPACETIME_PUBLISH_RECEIPT_INVALID');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function defaultSpacetimePublishReceiptDirectory() {
  return join(
    homedir(),
    'Library',
    'Application Support',
    'Warpkeep',
    'private',
    'spacetime-publish-receipts',
  );
}

export function writePrivateSpacetimePublishSuccessReceipt(input) {
  if (
    typeof input?.artifactDigest !== 'string'
    || !SHA256_HEX.test(input.artifactDigest)
    || typeof input.v12TableSchemaDigest !== 'string'
    || !SHA256_HEX.test(input.v12TableSchemaDigest)
    || input.workerForwardRepair !== 'return-node-reuse-v1'
    || (
      input.postPublicationCheckpoint !== 'candidate-pending'
      && input.postPublicationCheckpoint !== 'candidate-existing'
    )
  ) fail('SPACETIME_PUBLISH_RECEIPT_INPUT_INVALID');
  const directory = assertPrivateDirectory(
    input.directory,
    input.repositoryRoot,
    true,
  );
  const destination = join(
    directory,
    `spacetime-publish-success-${input.artifactDigest}.json`,
  );
  if (existsSync(destination)) {
    const existing = readReceiptFile(
      destination,
      input.artifactDigest,
      input.now ?? new Date(),
    );
    if (
      existing.v12TableSchemaDigest !== input.v12TableSchemaDigest
    ) fail('SPACETIME_PUBLISH_RECEIPT_EXISTING_MISMATCH');
    return existing;
  }
  const recordedAt = (input.now ?? new Date()).toISOString();
  const body = Buffer.from(canonicalJson(Object.freeze({
    schemaVersion: 1,
    kind: SPACETIME_PUBLISH_RECEIPT_KIND,
    recordedAt,
    target: SPACETIME_PUBLISH_RECEIPT_TARGET,
    artifactDigest: input.artifactDigest,
    v12TableSchemaDigest: input.v12TableSchemaDigest,
    workerForwardRepair: input.workerForwardRepair,
    postPublicationCheckpoint: input.postPublicationCheckpoint,
    postVerification: 'passed',
  })), 'utf8');
  const temporary = join(
    directory,
    `.spacetime-publish-success-${input.artifactDigest}-${randomUUID()
      .replaceAll('-', '')
      .slice(0, 12)}.json.tmp`,
  );
  let descriptor;
  try {
    descriptor = openSync(
      temporary,
      constants.O_CREAT
        | constants.O_EXCL
        | constants.O_WRONLY
        | constants.O_NOFOLLOW,
      FILE_MODE,
    );
    let offset = 0;
    while (offset < body.byteLength) {
      const written = writeSync(
        descriptor,
        body,
        offset,
        body.byteLength - offset,
      );
      if (written <= 0) fail('SPACETIME_PUBLISH_RECEIPT_WRITE_FAILED');
      offset += written;
    }
    fsyncSync(descriptor);
    chmodSync(temporary, FILE_MODE);
    closeSync(descriptor);
    descriptor = undefined;
    linkSync(temporary, destination);
    unlinkSync(temporary);
    const directoryDescriptor = openSync(directory, constants.O_RDONLY);
    try {
      fsyncSync(directoryDescriptor);
    } finally {
      closeSync(directoryDescriptor);
    }
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* Preserve fixed failure. */ }
    }
    try { unlinkSync(temporary); } catch { /* Preserve fixed failure. */ }
    if (error instanceof SpacetimePublishReceiptError) throw error;
    fail('SPACETIME_PUBLISH_RECEIPT_WRITE_FAILED');
  } finally {
    body.fill(0);
  }
  return readReceiptFile(
    destination,
    input.artifactDigest,
    input.now ?? new Date(),
  );
}

export function readPrivateSpacetimePublishSuccessReceipt(input) {
  if (
    typeof input?.artifactDigest !== 'string'
    || !SHA256_HEX.test(input.artifactDigest)
  ) fail('SPACETIME_PUBLISH_RECEIPT_INPUT_INVALID');
  const directory = assertPrivateDirectory(
    input.directory,
    input.repositoryRoot,
    false,
  );
  return readReceiptFile(
    join(
      directory,
      `spacetime-publish-success-${input.artifactDigest}.json`,
    ),
    input.artifactDigest,
    input.now ?? new Date(),
  );
}

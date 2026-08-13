import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  ensureAuthBridgeNotificationPreparedReceiptDirectory,
  readPrivateAuthBridgeNotificationPreparedReceipt,
} from './auth-bridge-notification-prepared-receipt.mjs';
import * as liveReceipt from './notification-pages-live-receipt.mjs';
import {
  createNotificationPagesPrivateHandoff,
  inspectNotificationPagesPrivateHandoff,
  readNotificationPagesPrivateHandoffKey,
} from './notification-pages-private-handoff.mjs';
import {
  NOTIFICATION_PAGES_PRIVATE_DEPLOY_ABANDONMENT_PROOF_PROFILE,
  recoverNotificationPagesPrivateDeploySkippedInvocation,
  withNotificationPagesPrivateDeployJournal,
} from './notification-pages-private-deploy-journal.mjs';
import {
  readNotificationPagesReleaseSources,
} from './notification-pages-release-source-parser.mjs';
import {
  ensureCanonicalProductionAdminStateDirectory,
} from './production-admin-token-budget.mjs';
import {
  inspectProductionPlayerCanaryDeployAuthority,
} from './production-player-canary-deploy-authority.mjs';
import {
  requireFreshProductionPlayerCanaryActivationAuthority,
} from './production-player-canary-receipt.mjs';

export const NOTIFICATION_PAGES_PRIVATE_DEPLOY_OPERATOR_PROFILE =
  'warpkeep-notification-pages-private-deploy-operator-v1';
export const NOTIFICATION_PAGES_PRIVATE_HANDOFF_STATE_CHILD =
  'notification-pages-private-handoffs-v1';
export const NOTIFICATION_PAGES_PRIVATE_HANDOFF_KEY_BASENAME =
  'notification-pages-private-handoff-key-v1.txt';
export const NOTIFICATION_PAGES_ACTIVE_EVIDENCE_MAXIMUM_AGE_MILLISECONDS =
  24 * 60 * 60 * 1_000;

const REPOSITORY = 'ael-dev3/Warpkeep';
const WORKFLOW = '.github/workflows/deploy-pages.yml';
const SOURCE_WORKFLOW = '.github/workflows/verify.yml';
const REPOSITORY_ROOT = realpathSync(resolve(import.meta.dirname, '..'));
const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const RUN_ID = /^[1-9][0-9]{0,19}$/u;
const FOUNDER_COUNT = /^(?:[1-9]|[1-9][0-9]|[1-5][0-9]{2}|600)$/u;
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const MAX_PRIVATE_INPUT_BYTES = 64 * 1024;
const MAX_HANDOFF_BYTES = 256 * 1024;
const MAX_GITHUB_API_BYTES = 1024 * 1024;
const HANDOFF_FILE = /^notification-pages-private-handoff-([0-9a-f]{64})\.json$/u;
const HANDOFF_TEMPORARY = /^\.notification-pages-private-handoff-([0-9a-f]{64})-([0-9a-f]{24})\.json\.tmp$/u;
const HANDOFF_SUMMARY_KEYS = Object.freeze([
  'expectedActiveEvidenceMaximumAgeMilliseconds',
  'expectedActiveV17EvidenceDigest',
  'expectedBridgeSourceCommit',
  'expectedDeployedModuleReceiptDigest',
  'expectedFounderCount',
  'expectedHandoffDigest',
  'expectedKeyId',
  'expectedPagesSourceCommit',
  'expectedPreparedReceiptDigest',
  'expectedWorkflowRunAttempt',
  'expectedWorkflowRunId',
]);
const SOURCE_RELEASE_KEYS = Object.freeze([
  'atlasSourceCommit',
  'atlasId',
  'publicReleaseId',
  'expectedReleaseSha256',
  'moduleSourceCommit',
]);
const TARGET = Object.freeze({
  uri: 'https://maincloud.spacetimedb.com',
  database: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
  deleteData: 'never',
});

export class NotificationPagesPrivateDeployOperatorError extends Error {
  constructor(code, deploymentMayHaveChanged = false) {
    super(code);
    this.name = 'NotificationPagesPrivateDeployOperatorError';
    this.code = code;
    this.deploymentMayHaveChanged = deploymentMayHaveChanged;
  }
}

function fail(code, deploymentMayHaveChanged = false) {
  throw new NotificationPagesPrivateDeployOperatorError(
    code,
    deploymentMayHaveChanged,
  );
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return isRecord(value)
    && Object.keys(value).join('\0') === keys.join('\0');
}

function exactTarget(value) {
  return isRecord(value)
    && JSON.stringify(value) === JSON.stringify(TARGET);
}

function parsePreparedBinding(value) {
  if (
    !exactKeys(value, [
      'notificationPreparedReceiptDigest',
      'notificationPreparedBridgeSourceCommit',
    ])
  ) fail('NOTIFICATION_PAGES_DEPLOY_PREPARED_BINDING_INVALID');
  const receiptDigest = value.notificationPreparedReceiptDigest;
  const bridgeSourceCommit = value.notificationPreparedBridgeSourceCommit;
  if (receiptDigest === null && bridgeSourceCommit === null) {
    return Object.freeze({ receiptDigest: null, bridgeSourceCommit: null });
  }
  if (
    typeof receiptDigest !== 'string'
    || !SHA256.test(receiptDigest)
    || typeof bridgeSourceCommit !== 'string'
    || !COMMIT.test(bridgeSourceCommit)
  ) fail('NOTIFICATION_PAGES_DEPLOY_PREPARED_BINDING_INVALID');
  return Object.freeze({ receiptDigest, bridgeSourceCommit });
}

function parsePrivateBinding(value) {
  if (!exactKeys(value, [
    'notificationPagesActiveV17EvidenceDigest',
    'notificationPagesDeployedModuleReceiptDigest',
    'notificationPagesExpectedFounderCount',
  ])) fail('NOTIFICATION_PAGES_DEPLOY_PRIVATE_BINDING_INVALID');
  const active = value.notificationPagesActiveV17EvidenceDigest;
  const deployed = value.notificationPagesDeployedModuleReceiptDigest;
  const count = value.notificationPagesExpectedFounderCount;
  if (active === null && deployed === null && count === null) {
    return Object.freeze({
      notificationPagesActiveV17EvidenceDigest: null,
      notificationPagesDeployedModuleReceiptDigest: null,
      notificationPagesExpectedFounderCount: null,
    });
  }
  if (
    typeof active !== 'string'
    || !SHA256.test(active)
    || typeof deployed !== 'string'
    || !SHA256.test(deployed)
    || !Number.isSafeInteger(count)
    || !FOUNDER_COUNT.test(String(count))
  ) fail('NOTIFICATION_PAGES_DEPLOY_PRIVATE_BINDING_INVALID');
  return Object.freeze({
    notificationPagesActiveV17EvidenceDigest: active,
    notificationPagesDeployedModuleReceiptDigest: deployed,
    notificationPagesExpectedFounderCount: count,
  });
}

function parseLiveRootBinding(value) {
  if (!exactKeys(value, [
    'notificationPagesLiveRootReceiptDigest',
    'notificationPagesLiveRootPagesSourceCommit',
  ])) fail('NOTIFICATION_PAGES_DEPLOY_ROOT_BINDING_INVALID');
  const digest = value.notificationPagesLiveRootReceiptDigest;
  const sourceCommit = value.notificationPagesLiveRootPagesSourceCommit;
  if (digest === null && sourceCommit === null) {
    return Object.freeze({
      notificationPagesLiveRootReceiptDigest: null,
      notificationPagesLiveRootPagesSourceCommit: null,
    });
  }
  if (
    typeof digest !== 'string'
    || !SHA256.test(digest)
    || typeof sourceCommit !== 'string'
    || !COMMIT.test(sourceCommit)
  ) fail('NOTIFICATION_PAGES_DEPLOY_ROOT_BINDING_INVALID');
  return Object.freeze({
    notificationPagesLiveRootReceiptDigest: digest,
    notificationPagesLiveRootPagesSourceCommit: sourceCommit,
  });
}

function parseProductionPlayerCanaryBinding(value) {
  if (!exactKeys(value, [
    'productionPlayerCanaryReceiptDigest',
    'productionPlayerCanarySourceCommit',
  ])) fail('NOTIFICATION_PAGES_DEPLOY_PLAYER_CANARY_BINDING_INVALID');
  const digest = value.productionPlayerCanaryReceiptDigest;
  const sourceCommit = value.productionPlayerCanarySourceCommit;
  if (digest === null && sourceCommit === null) {
    return Object.freeze({
      productionPlayerCanaryReceiptDigest: null,
      productionPlayerCanarySourceCommit: null,
    });
  }
  if (
    typeof digest !== 'string' || !SHA256.test(digest)
    || typeof sourceCommit !== 'string' || !COMMIT.test(sourceCommit)
  ) fail('NOTIFICATION_PAGES_DEPLOY_PLAYER_CANARY_BINDING_INVALID');
  return Object.freeze({
    productionPlayerCanaryReceiptDigest: digest,
    productionPlayerCanarySourceCommit: sourceCommit,
  });
}

/**
 * Classify only exact source-controlled release states. A hosted runner may
 * evaluate this function because it reads no private state and grants no
 * deployment authority by itself.
 */
export function classifyNotificationPagesPrivateDeployment({
  candidatePagesSourceCommit,
  phase,
  preparedBinding,
  privateBinding,
  liveRootBinding,
  productionPlayerCanaryBinding = {
    productionPlayerCanaryReceiptDigest: null,
    productionPlayerCanarySourceCommit: null,
  },
} = {}) {
  if (
    typeof candidatePagesSourceCommit !== 'string'
    || !COMMIT.test(candidatePagesSourceCommit)
    || !isRecord(phase)
    || typeof phase.pagesPresentationEnabled !== 'boolean'
    || typeof phase.hermesExecutionApproved !== 'boolean'
  ) fail('NOTIFICATION_PAGES_DEPLOY_SOURCE_INVALID');
  const prepared = parsePreparedBinding(preparedBinding);
  let privateInputs;
  let root;
  privateInputs = parsePrivateBinding(privateBinding);
  root = parseLiveRootBinding(liveRootBinding);
  const playerCanary = parseProductionPlayerCanaryBinding(
    productionPlayerCanaryBinding,
  );
  const hasPrepared = prepared.receiptDigest !== null;
  const hasPrivate = privateInputs.notificationPagesActiveV17EvidenceDigest !== null;
  const hasRoot = root.notificationPagesLiveRootReceiptDigest !== null;
  const hasPlayerCanary =
    playerCanary.productionPlayerCanaryReceiptDigest !== null;
  let mode;
  if (
    phase.pagesPresentationEnabled === false
    && phase.hermesExecutionApproved === false
    && !hasPrepared
    && !hasPrivate
    && !hasRoot
    && !hasPlayerCanary
  ) {
    mode = 'closed-review';
  } else if (
    phase.pagesPresentationEnabled === true
    && phase.hermesExecutionApproved === false
    && hasPrepared
    && hasPrivate
    && !hasRoot
    && !hasPlayerCanary
  ) {
    mode = 'gen0';
  } else if (
    phase.pagesPresentationEnabled === true
    && !hasPrepared
    && !hasPrivate
    && hasRoot
  ) {
    // The durable root keeps the Pages boundary closed while a separately
    // reviewed successor changes Hermes false -> true. Both exact literals are
    // therefore valid durable Pages candidates; the receipt module constrains
    // the sole allowed Hermes transition and its protected source closure.
    mode = 'durable';
  } else {
    fail('NOTIFICATION_PAGES_DEPLOY_SOURCE_STATE_INVALID');
  }
  return Object.freeze({
    schemaVersion: 1,
    profile: NOTIFICATION_PAGES_PRIVATE_DEPLOY_OPERATOR_PROFILE,
    repository: REPOSITORY,
    workflow: WORKFLOW,
    mode,
    candidatePagesSourceCommit,
    expectedFounderCount:
      privateInputs.notificationPagesExpectedFounderCount,
    preparedReceiptDigest: prepared.receiptDigest,
    bridgeSourceCommit: prepared.bridgeSourceCommit,
    activeV17EvidenceDigest:
      privateInputs.notificationPagesActiveV17EvidenceDigest,
    deployedModuleReceiptDigest:
      privateInputs.notificationPagesDeployedModuleReceiptDigest,
    chainRootReceiptDigest:
      root.notificationPagesLiveRootReceiptDigest,
    chainRootPagesSourceCommit:
      root.notificationPagesLiveRootPagesSourceCommit,
    productionPlayerCanaryReceiptDigest:
      playerCanary.productionPlayerCanaryReceiptDigest,
    productionPlayerCanarySourceCommit:
      playerCanary.productionPlayerCanarySourceCommit,
    requiresProductionPlayerCanary: hasPlayerCanary,
  });
}

function git(arguments_) {
  return spawnSync('/usr/bin/git', ['--no-optional-locks', ...arguments_], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    env: {
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_NO_REPLACE_OBJECTS: '1',
      HOME: '/nonexistent',
      PATH: '/usr/bin:/bin',
    },
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 10_000,
    maxBuffer: 512 * 1024,
  });
}

function assertRepositorySource(candidatePagesSourceCommit) {
  const head = git(['rev-parse', '--verify', 'HEAD^{commit}']);
  const status = git(['status', '--porcelain=v1', '--untracked-files=all']);
  if (
    head.status !== 0
    || head.stdout.trim() !== candidatePagesSourceCommit
    || status.status !== 0
    || status.stdout !== ''
  ) fail('NOTIFICATION_PAGES_DEPLOY_CHECKOUT_INVALID');
}

export function loadNotificationPagesPrivateDeployContract(
  candidatePagesSourceCommit,
) {
  assertRepositorySource(candidatePagesSourceCommit);
  let sources;
  try {
    sources = readNotificationPagesReleaseSources({
      repositoryRoot: REPOSITORY_ROOT,
    });
  } catch {
    fail('NOTIFICATION_PAGES_DEPLOY_SOURCE_PHASE_INVALID');
  }
  return classifyNotificationPagesPrivateDeployment({
    candidatePagesSourceCommit,
    ...sources,
  });
}

function fsyncDirectory(directory) {
  let descriptor;
  try {
    descriptor = openSync(directory, constants.O_RDONLY);
    fsyncSync(descriptor);
  } catch {
    fail('NOTIFICATION_PAGES_DEPLOY_PRIVATE_FSYNC_FAILED');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function privateOwnerDirectory(path, parent, { create = false } = {}) {
  if (!existsSync(path)) {
    if (!create) fail('NOTIFICATION_PAGES_DEPLOY_PRIVATE_DIRECTORY_INVALID');
    try {
      mkdirSync(path, { mode: DIRECTORY_MODE });
      chmodSync(path, DIRECTORY_MODE);
      fsyncDirectory(path);
      fsyncDirectory(parent);
    } catch {
      fail('NOTIFICATION_PAGES_DEPLOY_PRIVATE_DIRECTORY_INVALID');
    }
  }
  try {
    let status = lstatSync(path);
    const uid = process.getuid?.();
    const mode = status.mode & 0o7777;
    if (
      status.isDirectory()
      && !status.isSymbolicLink()
      && (uid === undefined || status.uid === uid)
      && (mode & ~DIRECTORY_MODE) === 0
      && mode !== DIRECTORY_MODE
    ) {
      chmodSync(path, DIRECTORY_MODE);
      fsyncDirectory(path);
      fsyncDirectory(parent);
      status = lstatSync(path);
    }
    if (
      realpathSync(path) !== path
      || dirname(path) !== parent
      || !status.isDirectory()
      || status.isSymbolicLink()
      || (uid !== undefined && status.uid !== uid)
      || (status.mode & 0o7777) !== DIRECTORY_MODE
    ) fail('NOTIFICATION_PAGES_DEPLOY_PRIVATE_DIRECTORY_INVALID');
    return path;
  } catch (error) {
    if (error instanceof NotificationPagesPrivateDeployOperatorError) throw error;
    fail('NOTIFICATION_PAGES_DEPLOY_PRIVATE_DIRECTORY_INVALID');
  }
}

function readStablePrivateFile(path, expectedDigest, maximumBytes) {
  let descriptor;
  try {
    const named = lstatSync(path);
    const uid = process.getuid?.();
    if (
      !named.isFile()
      || named.isSymbolicLink()
      || (uid !== undefined && named.uid !== uid)
      || (named.mode & 0o7777) !== FILE_MODE
      || named.nlink !== 1
      || named.size < 1
      || named.size > maximumBytes
    ) fail('NOTIFICATION_PAGES_DEPLOY_PRIVATE_FILE_INVALID');
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    if (
      !before.isFile()
      || (uid !== undefined && before.uid !== uid)
      || (before.mode & 0o7777) !== FILE_MODE
      || before.nlink !== 1
      || before.dev !== named.dev
      || before.ino !== named.ino
      || before.size !== named.size
    ) fail('NOTIFICATION_PAGES_DEPLOY_PRIVATE_FILE_INVALID');
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs
      || after.ctimeMs !== before.ctimeMs
      || bytes.byteLength !== before.size
      || createHash('sha256').update(bytes).digest('hex') !== expectedDigest
    ) {
      bytes.fill(0);
      fail('NOTIFICATION_PAGES_DEPLOY_PRIVATE_FILE_INVALID');
    }
    return bytes;
  } catch (error) {
    if (error instanceof NotificationPagesPrivateDeployOperatorError) throw error;
    fail('NOTIFICATION_PAGES_DEPLOY_PRIVATE_FILE_INVALID');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parseCanonicalPrettyJson(bytes, code) {
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (`${JSON.stringify(value, null, 2)}\n` !== bytes.toString('utf8')) fail(code);
  } catch (error) {
    if (error instanceof NotificationPagesPrivateDeployOperatorError) throw error;
    fail(code);
  }
  return value;
}

function validateDeployedModuleReceipt(bytes) {
  const value = parseCanonicalPrettyJson(
    bytes,
    'NOTIFICATION_PAGES_DEPLOY_MODULE_RECEIPT_INVALID',
  );
  const record = value?.record;
  if (
    !isRecord(value)
    || value.schemaVersion !== 1
    || value.kind !== 'warpkeep-greater-realm-production-publish-v1'
    || !exactTarget(value.target)
    || !isRecord(record)
    || record.schemaVersion !== 1
    || record.kind !== 'warpkeep-greater-realm-production-publish-v1'
    || record.lane !== 'forward-activation-active-v17'
    || !['verified', 'verified-after-submission-error'].includes(record.outcome)
    || !exactTarget(record.target)
    || record.moduleDeltaPolicy !== 'reviewed-same-schema'
    || record.predecessorTableCount !== 84
    || record.postTableCount !== 84
    || record.schemaMutation !== 'none'
    || record.importMutationsCompiled !== false
    || record.activationMutationsCompiled !== true
    || record.releaseState !== 'active'
    || record.activationMode !== 'active'
  ) fail('NOTIFICATION_PAGES_DEPLOY_MODULE_RECEIPT_INVALID');
  const sourceRelease = Object.fromEntries(
    SOURCE_RELEASE_KEYS.map(key => [key, record[key]]),
  );
  if (
    !COMMIT.test(sourceRelease.atlasSourceCommit ?? '')
    || typeof sourceRelease.atlasId !== 'string'
    || sourceRelease.atlasId.length < 1
    || typeof sourceRelease.publicReleaseId !== 'string'
    || sourceRelease.publicReleaseId.length < 1
    || !SHA256.test(sourceRelease.expectedReleaseSha256 ?? '')
    || !COMMIT.test(sourceRelease.moduleSourceCommit ?? '')
  ) fail('NOTIFICATION_PAGES_DEPLOY_MODULE_RECEIPT_INVALID');
  return Object.freeze(sourceRelease);
}

function validateActiveEvidence(bytes, sourceRelease, expectedFounderCount) {
  const value = parseCanonicalPrettyJson(
    bytes,
    'NOTIFICATION_PAGES_DEPLOY_ACTIVE_EVIDENCE_INVALID',
  );
  if (
    !isRecord(value)
    || value.schemaVersion !== 1
    || value.kind !== 'warpkeep-greater-realm-production-pages-active-v17-v1'
    || value.maximumAgeMilliseconds
      !== NOTIFICATION_PAGES_ACTIVE_EVIDENCE_MAXIMUM_AGE_MILLISECONDS
    || value.expectedFounderCount !== expectedFounderCount
    || !exactTarget(value.target)
    || !isRecord(value.sourceRelease)
    || JSON.stringify(value.sourceRelease) !== JSON.stringify(sourceRelease)
  ) fail('NOTIFICATION_PAGES_DEPLOY_ACTIVE_EVIDENCE_INVALID');
}

function unlinkExact(path, identity, links = 1) {
  const status = lstatSync(path);
  const uid = process.getuid?.();
  if (
    !status.isFile()
    || status.isSymbolicLink()
    || (uid !== undefined && status.uid !== uid)
    || status.dev !== identity.dev
    || status.ino !== identity.ino
    || status.nlink !== links
    || (status.mode & 0o7777) !== FILE_MODE
  ) fail('NOTIFICATION_PAGES_DEPLOY_HANDOFF_WRITE_FAILED');
  unlinkSync(path);
}

function repairHandoffTemporaries(directory) {
  const uid = process.getuid?.();
  for (const name of readdirSync(directory).filter(value => HANDOFF_TEMPORARY.test(value))) {
    const temporaryPath = join(directory, name);
    const temporary = lstatSync(temporaryPath);
    const digest = HANDOFF_TEMPORARY.exec(name)?.[1];
    const finalPath = join(directory, `notification-pages-private-handoff-${digest}.json`);
    let final;
    try { final = lstatSync(finalPath); } catch (error) {
      if (error?.code !== 'ENOENT') fail('NOTIFICATION_PAGES_DEPLOY_HANDOFF_WRITE_FAILED');
    }
    if (
      !temporary.isFile()
      || temporary.isSymbolicLink()
      || (uid !== undefined && temporary.uid !== uid)
      || ![1, 2].includes(temporary.nlink)
      || (temporary.nlink === 1
        ? ((temporary.mode & 0o7777) & ~FILE_MODE) !== 0
        : (temporary.mode & 0o7777) !== FILE_MODE)
    ) fail('NOTIFICATION_PAGES_DEPLOY_HANDOFF_WRITE_FAILED');
    if (
      final !== undefined
      && final.dev === temporary.dev
      && final.ino === temporary.ino
      && temporary.nlink === 2
      && final.nlink === 2
    ) {
      unlinkExact(temporaryPath, temporary, 2);
    } else if (temporary.nlink === 1) {
      if ((temporary.mode & 0o7777) !== FILE_MODE) {
        chmodSync(temporaryPath, FILE_MODE);
      }
      unlinkExact(temporaryPath, temporary);
    } else {
      fail('NOTIFICATION_PAGES_DEPLOY_HANDOFF_WRITE_FAILED');
    }
    fsyncDirectory(directory);
  }
}

function publishHandoff(directory, handoff) {
  if (!Buffer.isBuffer(handoff.bytes) || !SHA256.test(handoff.digest ?? '')) {
    fail('NOTIFICATION_PAGES_DEPLOY_HANDOFF_INVALID');
  }
  repairHandoffTemporaries(directory);
  const destination = join(
    directory,
    `notification-pages-private-handoff-${handoff.digest}.json`,
  );
  if (existsSync(destination)) {
    const existing = readStablePrivateFile(
      destination,
      handoff.digest,
      MAX_HANDOFF_BYTES,
    );
    try {
      if (!existing.equals(handoff.bytes)) {
        fail('NOTIFICATION_PAGES_DEPLOY_HANDOFF_WRITE_FAILED');
      }
    } finally {
      existing.fill(0);
    }
    return destination;
  }
  const suffix = randomBytes(12).toString('hex');
  const temporary = join(
    directory,
    `.notification-pages-private-handoff-${handoff.digest}-${suffix}.json.tmp`,
  );
  let descriptor;
  let identity;
  let linked = false;
  try {
    descriptor = openSync(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
        | (constants.O_NOFOLLOW ?? 0),
      FILE_MODE,
    );
    fchmodSync(descriptor, FILE_MODE);
    const opened = fstatSync(descriptor);
    identity = Object.freeze({ dev: opened.dev, ino: opened.ino });
    let offset = 0;
    while (offset < handoff.bytes.byteLength) {
      const written = writeSync(
        descriptor,
        handoff.bytes,
        offset,
        handoff.bytes.byteLength - offset,
      );
      if (written <= 0) fail('NOTIFICATION_PAGES_DEPLOY_HANDOFF_WRITE_FAILED');
      offset += written;
    }
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    linkSync(temporary, destination);
    linked = true;
    fsyncDirectory(directory);
    unlinkExact(temporary, identity, 2);
    identity = undefined;
    fsyncDirectory(directory);
    const installed = readStablePrivateFile(
      destination,
      handoff.digest,
      MAX_HANDOFF_BYTES,
    );
    try {
      if (!installed.equals(handoff.bytes)) {
        fail('NOTIFICATION_PAGES_DEPLOY_HANDOFF_WRITE_FAILED');
      }
    } finally {
      installed.fill(0);
    }
    return destination;
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* Preserve primary error. */ }
    }
    if (!linked && identity !== undefined) {
      try { unlinkExact(temporary, identity); } catch { /* Preserve primary error. */ }
    }
    if (error instanceof NotificationPagesPrivateDeployOperatorError) throw error;
    fail('NOTIFICATION_PAGES_DEPLOY_HANDOFF_WRITE_FAILED');
  }
}

function handoffDirectory() {
  const parent = ensureCanonicalProductionAdminStateDirectory();
  return privateOwnerDirectory(
    join(parent, NOTIFICATION_PAGES_PRIVATE_HANDOFF_STATE_CHILD),
    parent,
    { create: true },
  );
}

function handoffExpectations(summary) {
  if (
    !exactKeys(summary, HANDOFF_SUMMARY_KEYS)
    || !SHA256.test(summary.expectedHandoffDigest ?? '')
    || !SHA256.test(summary.expectedKeyId ?? '')
    || !RUN_ID.test(summary.expectedWorkflowRunId ?? '')
    || !RUN_ID.test(summary.expectedWorkflowRunAttempt ?? '')
    || !COMMIT.test(summary.expectedPagesSourceCommit ?? '')
    || !Number.isSafeInteger(summary.expectedFounderCount)
    || summary.expectedFounderCount < 1
    || summary.expectedFounderCount > 600
    || summary.expectedActiveEvidenceMaximumAgeMilliseconds
      !== NOTIFICATION_PAGES_ACTIVE_EVIDENCE_MAXIMUM_AGE_MILLISECONDS
    || !SHA256.test(summary.expectedPreparedReceiptDigest ?? '')
    || !SHA256.test(summary.expectedActiveV17EvidenceDigest ?? '')
    || !SHA256.test(summary.expectedDeployedModuleReceiptDigest ?? '')
    || !COMMIT.test(summary.expectedBridgeSourceCommit ?? '')
  ) {
    fail('NOTIFICATION_PAGES_DEPLOY_HANDOFF_JOURNAL_INVALID');
  }
  const directory = handoffDirectory();
  return Object.freeze({
    ...summary,
    handoffPath: join(
      directory,
      `notification-pages-private-handoff-${summary.expectedHandoffDigest}.json`,
    ),
    keyPath: join(directory, NOTIFICATION_PAGES_PRIVATE_HANDOFF_KEY_BASENAME),
  });
}

function prepareGen0Handoff(contract, runId, runAttempt, now) {
  const parent = ensureCanonicalProductionAdminStateDirectory();
  const directory = handoffDirectory();
  const keyPath = join(directory, NOTIFICATION_PAGES_PRIVATE_HANDOFF_KEY_BASENAME);
  const preparedDirectory = ensureAuthBridgeNotificationPreparedReceiptDirectory({
    repositoryRoot: REPOSITORY_ROOT,
  });
  const evidenceDirectory = privateOwnerDirectory(
    join(parent, 'greater-realm-pages-active-v17-evidence'),
    parent,
  );
  const cutoverDirectory = privateOwnerDirectory(
    join(parent, 'greater-realm-cutover-receipts'),
    parent,
  );
  const preparedPath = join(
    preparedDirectory,
    `auth-bridge-notification-prepared-${contract.preparedReceiptDigest}.json`,
  );
  const evidencePath = join(
    evidenceDirectory,
    `greater-realm-pages-active-v17-${contract.activeV17EvidenceDigest}.json`,
  );
  const modulePath = join(
    cutoverDirectory,
    `greater-realm-publish-${contract.deployedModuleReceiptDigest}.json`,
  );
  const parsedPrepared = readPrivateAuthBridgeNotificationPreparedReceipt({
    receiptPath: preparedPath,
    repositoryRoot: REPOSITORY_ROOT,
  });
  if (parsedPrepared.bridgeSourceCommit !== contract.bridgeSourceCommit) {
    fail('NOTIFICATION_PAGES_DEPLOY_PREPARED_RECEIPT_INVALID');
  }
  const prepared = readStablePrivateFile(
    preparedPath,
    contract.preparedReceiptDigest,
    MAX_PRIVATE_INPUT_BYTES,
  );
  const active = readStablePrivateFile(
    evidencePath,
    contract.activeV17EvidenceDigest,
    MAX_PRIVATE_INPUT_BYTES,
  );
  const deployed = readStablePrivateFile(
    modulePath,
    contract.deployedModuleReceiptDigest,
    MAX_PRIVATE_INPUT_BYTES,
  );
  const key = readNotificationPagesPrivateHandoffKey(
    keyPath,
    REPOSITORY_ROOT,
  );
  let handoff;
  try {
    const sourceRelease = validateDeployedModuleReceipt(deployed);
    validateActiveEvidence(active, sourceRelease, contract.expectedFounderCount);
    handoff = createNotificationPagesPrivateHandoff({
      key,
      workflowRunId: runId,
      workflowRunAttempt: String(runAttempt),
      pagesSourceCommit: contract.candidatePagesSourceCommit,
      expectedFounderCount: contract.expectedFounderCount,
      activeEvidenceMaximumAgeMilliseconds:
        NOTIFICATION_PAGES_ACTIVE_EVIDENCE_MAXIMUM_AGE_MILLISECONDS,
      bridgeSourceCommit: contract.bridgeSourceCommit,
      preparedReceiptBytes: prepared,
      activeV17EvidenceBytes: active,
      deployedModuleReceiptBytes: deployed,
      createdAt: now,
    });
    publishHandoff(directory, handoff);
    return Object.freeze({
      expectedHandoffDigest: handoff.digest,
      expectedKeyId: handoff.keyId,
      expectedWorkflowRunId: runId,
      expectedWorkflowRunAttempt: String(runAttempt),
      expectedPagesSourceCommit: contract.candidatePagesSourceCommit,
      expectedFounderCount: contract.expectedFounderCount,
      expectedActiveEvidenceMaximumAgeMilliseconds:
        NOTIFICATION_PAGES_ACTIVE_EVIDENCE_MAXIMUM_AGE_MILLISECONDS,
      expectedPreparedReceiptDigest: contract.preparedReceiptDigest,
      expectedActiveV17EvidenceDigest: contract.activeV17EvidenceDigest,
      expectedDeployedModuleReceiptDigest: contract.deployedModuleReceiptDigest,
      expectedBridgeSourceCommit: contract.bridgeSourceCommit,
    });
  } finally {
    key.fill(0);
    prepared.fill(0);
    active.fill(0);
    deployed.fill(0);
    handoff?.bytes?.fill(0);
  }
}

function validateReconciliation(value, candidate) {
  if (
    !isRecord(value)
    || value.candidatePagesSourceCommit !== candidate
    || !['exact-current', 'definitely-not-current'].includes(value.status)
  ) fail('NOTIFICATION_PAGES_DEPLOY_RECONCILIATION_INVALID');
  return value;
}

async function boundedReconciliation(contract, dependencies, retry) {
  const maximumAttempts = retry ? 4 : 1;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const result = validateReconciliation(
      await dependencies.reconcile({
        repositoryRoot: REPOSITORY_ROOT,
        candidatePagesSourceCommit: contract.candidatePagesSourceCommit,
      }),
      contract.candidatePagesSourceCommit,
    );
    if (result.status === 'exact-current') return result;
    if (attempt < maximumAttempts) await dependencies.delay(attempt * 5_000);
    else return result;
  }
  fail('NOTIFICATION_PAGES_DEPLOY_RECONCILIATION_INVALID');
}

function receiptResult(value) {
  if (
    !isRecord(value)
    || !SHA256.test(value.receiptDigest ?? '')
    || !['installed', 'unchanged'].includes(value.result)
  ) fail('NOTIFICATION_PAGES_DEPLOY_RECEIPT_RESULT_INVALID');
  return value;
}

function readPrivateGitHubToken(descriptor = 8) {
  if (!Number.isSafeInteger(descriptor) || descriptor < 3) {
    fail('NOTIFICATION_PAGES_DEPLOY_GITHUB_TOKEN_INVALID');
  }
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const chunk = Buffer.alloc(256);
      const count = readSync(descriptor, chunk, 0, chunk.byteLength, null);
      if (count === 0) {
        chunk.fill(0);
        break;
      }
      total += count;
      if (total > 512) {
        chunk.fill(0);
        fail('NOTIFICATION_PAGES_DEPLOY_GITHUB_TOKEN_INVALID');
      }
      chunks.push(chunk.subarray(0, count));
    }
    const bytes = Buffer.concat(chunks, total);
    let token;
    try {
      if (bytes.at(-1) === 0x0a) {
        token = bytes.subarray(0, bytes.byteLength - 1).toString('utf8');
      } else token = bytes.toString('utf8');
      if (!/^[A-Za-z0-9_]{20,255}$/u.test(token)) {
        fail('NOTIFICATION_PAGES_DEPLOY_GITHUB_TOKEN_INVALID');
      }
      return token;
    } finally {
      bytes.fill(0);
    }
  } catch (error) {
    if (error instanceof NotificationPagesPrivateDeployOperatorError) throw error;
    fail('NOTIFICATION_PAGES_DEPLOY_GITHUB_TOKEN_INVALID');
  } finally {
    for (const chunk of chunks) chunk.fill(0);
  }
}

async function fetchExactGitHubJson(path, token, fetchImpl = fetch) {
  const url = `https://api.github.com${path}`;
  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    fail('NOTIFICATION_PAGES_DEPLOY_GITHUB_ADJUDICATION_AMBIGUOUS', true);
  }
  const contentType = response.headers.get('content-type') ?? '';
  const declaredLength = response.headers.get('content-length');
  if (
    response.status !== 200
    || response.url !== url
    || !/^application\/json(?:;|$)/iu.test(contentType)
    || (declaredLength !== null
      && (!/^[0-9]+$/u.test(declaredLength)
        || Number(declaredLength) > MAX_GITHUB_API_BYTES))
  ) fail('NOTIFICATION_PAGES_DEPLOY_GITHUB_ADJUDICATION_AMBIGUOUS', true);
  let bytes;
  try { bytes = Buffer.from(await response.arrayBuffer()); } catch {
    fail('NOTIFICATION_PAGES_DEPLOY_GITHUB_ADJUDICATION_AMBIGUOUS', true);
  }
  try {
    if (bytes.byteLength < 2 || bytes.byteLength > MAX_GITHUB_API_BYTES) {
      fail('NOTIFICATION_PAGES_DEPLOY_GITHUB_ADJUDICATION_AMBIGUOUS', true);
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof NotificationPagesPrivateDeployOperatorError) throw error;
    fail('NOTIFICATION_PAGES_DEPLOY_GITHUB_ADJUDICATION_AMBIGUOUS', true);
  } finally {
    bytes.fill(0);
  }
}

async function adjudicateSkippedGitHubDeployment(
  request,
  { tokenDescriptor = 8, fetchImpl = fetch } = {},
) {
  if (
    !isRecord(request)
    || !RUN_ID.test(request.runId ?? '')
    || !Number.isSafeInteger(request.runAttempt)
    || request.runAttempt < 1
    || request.runAttempt > 1_000
    || !COMMIT.test(request.candidatePagesSourceCommit ?? '')
  ) fail('NOTIFICATION_PAGES_DEPLOY_GITHUB_ADJUDICATION_AMBIGUOUS', true);
  const token = readPrivateGitHubToken(tokenDescriptor);
  const prefix = `/repos/${REPOSITORY}/actions/runs/${request.runId}`;
  const [run, jobs] = await Promise.all([
    fetchExactGitHubJson(
      `${prefix}/attempts/${request.runAttempt}`,
      token,
      fetchImpl,
    ),
    fetchExactGitHubJson(
      `${prefix}/attempts/${request.runAttempt}/jobs?per_page=100`,
      token,
      fetchImpl,
    ),
  ]);
  if (
    !isRecord(run)
    || String(run.id) !== request.runId
    || run.run_attempt !== request.runAttempt
    || run.status !== 'completed'
    || !['cancelled', 'failure', 'timed_out'].includes(run.conclusion)
    || run.event !== 'workflow_run'
    || run.path !== WORKFLOW
    || run.head_branch !== 'main'
    || run.head_sha !== request.candidatePagesSourceCommit
    || run.repository?.full_name !== REPOSITORY
    || run.head_repository?.full_name !== REPOSITORY
    || !isRecord(jobs)
    || !Number.isSafeInteger(jobs.total_count)
    || !Array.isArray(jobs.jobs)
    || jobs.jobs.length !== jobs.total_count
    || jobs.total_count < 1
    || jobs.total_count > 100
  ) fail('NOTIFICATION_PAGES_DEPLOY_GITHUB_ADJUDICATION_AMBIGUOUS', true);
  const matchingJobs = jobs.jobs.filter(job => (
    isRecord(job)
    && job.name === 'Notification Pages private deploy v1'
  ));
  if (matchingJobs.length !== 1) {
    fail('NOTIFICATION_PAGES_DEPLOY_GITHUB_ADJUDICATION_AMBIGUOUS', true);
  }
  const job = matchingJobs[0];
  if (
    !Number.isSafeInteger(job.id)
    || job.id < 1
    || String(job.run_id) !== request.runId
    || job.head_sha !== request.candidatePagesSourceCommit
    || job.workflow_name !== 'Deploy GitHub Pages'
    || job.status !== 'completed'
    || job.conclusion !== run.conclusion
    || !Array.isArray(job.labels)
    || [
      'self-hosted',
      'macOS',
      'ARM64',
      'warpkeep-production-admin',
      'warpkeep-repository-exclusive',
    ].some(label => !job.labels.includes(label))
    || !Array.isArray(job.steps)
  ) fail('NOTIFICATION_PAGES_DEPLOY_GITHUB_ADJUDICATION_AMBIGUOUS', true);
  const markerSteps = job.steps.filter(step => (
    isRecord(step)
    && step.name
      === 'Recheck protected source and durably mark deployment invocation'
  ));
  const deploySteps = job.steps.filter(step => (
    isRecord(step)
    && step.name === 'Deploy private-authorized release to GitHub Pages'
  ));
  if (markerSteps.length !== 1 || deploySteps.length !== 1) {
    fail('NOTIFICATION_PAGES_DEPLOY_GITHUB_ADJUDICATION_AMBIGUOUS', true);
  }
  const marker = markerSteps[0];
  const deployment = deploySteps[0];
  if (
    marker.status !== 'completed'
    || !['success', 'failure', 'cancelled'].includes(marker.conclusion)
    || deployment.status !== 'completed'
    || deployment.conclusion !== 'skipped'
    || !Number.isSafeInteger(marker.number)
    || deployment.number !== marker.number + 1
  ) fail('NOTIFICATION_PAGES_DEPLOY_GITHUB_ADJUDICATION_AMBIGUOUS', true);
  return Object.freeze({
    candidatePagesSourceCommit: request.candidatePagesSourceCommit,
    deployStepConclusion: deployment.conclusion,
    deployStepName: deployment.name,
    jobConclusion: job.conclusion,
    jobId: String(job.id),
    jobName: job.name,
    jobStatus: job.status,
    markerStepConclusion: marker.conclusion,
    markerStepName: marker.name,
    profile: NOTIFICATION_PAGES_PRIVATE_DEPLOY_ABANDONMENT_PROOF_PROFILE,
    repository: REPOSITORY,
    runAttempt: request.runAttempt,
    runId: request.runId,
    schemaVersion: 1,
    workflow: WORKFLOW,
  });
}

async function attestCurrentGitHubDeploymentAuthority(
  request,
  { tokenDescriptor = 8, fetchImpl = fetch } = {},
) {
  if (
    !isRecord(request)
    || !RUN_ID.test(request.runId ?? '')
    || !Number.isSafeInteger(request.runAttempt)
    || request.runAttempt < 1
    || request.runAttempt > 1_000
    || !RUN_ID.test(request.sourceRunId ?? '')
    || !Number.isSafeInteger(request.sourceRunAttempt)
    || request.sourceRunAttempt < 1
    || request.sourceRunAttempt > 1_000
    || !COMMIT.test(request.candidatePagesSourceCommit ?? '')
  ) fail('NOTIFICATION_PAGES_DEPLOY_GITHUB_AUTHORITY_INVALID');
  const token = readPrivateGitHubToken(tokenDescriptor);
  let branch;
  let currentRun;
  let sourceRun;
  try {
    [branch, currentRun, sourceRun] = await Promise.all([
      fetchExactGitHubJson(
        `/repos/${REPOSITORY}/branches/main`,
        token,
        fetchImpl,
      ),
      fetchExactGitHubJson(
        `/repos/${REPOSITORY}/actions/runs/${request.runId}`
          + `/attempts/${request.runAttempt}`,
        token,
        fetchImpl,
      ),
      fetchExactGitHubJson(
        `/repos/${REPOSITORY}/actions/runs/${request.sourceRunId}`
          + `/attempts/${request.sourceRunAttempt}`,
        token,
        fetchImpl,
      ),
    ]);
  } catch {
    fail('NOTIFICATION_PAGES_DEPLOY_GITHUB_AUTHORITY_INVALID');
  }
  const exactRun = (run, {
    id,
    attempt,
    status,
    conclusion,
    event,
    workflow,
  }) => (
    isRecord(run)
    && String(run.id) === id
    && run.run_attempt === attempt
    && run.status === status
    && run.conclusion === conclusion
    && run.event === event
    && run.path === workflow
    && run.head_branch === 'main'
    && run.head_sha === request.candidatePagesSourceCommit
    && run.repository?.full_name === REPOSITORY
    && run.head_repository?.full_name === REPOSITORY
  );
  if (
    !isRecord(branch)
    || branch.name !== 'main'
    || branch.protected !== true
    || branch.commit?.sha !== request.candidatePagesSourceCommit
    || !exactRun(currentRun, {
      id: request.runId,
      attempt: request.runAttempt,
      status: 'in_progress',
      conclusion: null,
      event: 'workflow_run',
      workflow: WORKFLOW,
    })
    || !exactRun(sourceRun, {
      id: request.sourceRunId,
      attempt: request.sourceRunAttempt,
      status: 'completed',
      conclusion: 'success',
      event: 'push',
      workflow: SOURCE_WORKFLOW,
    })
  ) fail('NOTIFICATION_PAGES_DEPLOY_GITHUB_AUTHORITY_INVALID');
  return Object.freeze({
    candidatePagesSourceCommit: request.candidatePagesSourceCommit,
    runAttempt: request.runAttempt,
    runId: request.runId,
    sourceRunAttempt: request.sourceRunAttempt,
    sourceRunId: request.sourceRunId,
  });
}

function defaultDependencies() {
  for (const name of [
    'reconcileNotificationPagesLiveCandidate',
    'writePrivateNotificationPagesLiveReceipt',
    'inspectLatestPrivateNotificationPagesLiveReceiptForCandidate',
    'promoteNotificationPagesLiveReceipt',
  ]) {
    if (typeof liveReceipt[name] !== 'function') {
      fail('NOTIFICATION_PAGES_DEPLOY_RECEIPT_API_UNAVAILABLE');
    }
  }
  const receiptDirectory = liveReceipt.defaultNotificationPagesLiveReceiptDirectory();
  return Object.freeze({
    assertSource: assertRepositorySource,
    delay: milliseconds => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds)),
    now: () => new Date(),
    prepareHandoff: prepareGen0Handoff,
    resolveHandoff: handoffExpectations,
    inspectHandoff: expectations => inspectNotificationPagesPrivateHandoff({
      ...expectations,
      repositoryRoot: REPOSITORY_ROOT,
    }),
    reconcile: liveReceipt.reconcileNotificationPagesLiveCandidate,
    assertDeploymentAuthority: request =>
      attestCurrentGitHubDeploymentAuthority(request),
    recoverSkippedInvocation: options =>
      recoverNotificationPagesPrivateDeploySkippedInvocation({
        ...options,
        adjudicate: adjudicateSkippedGitHubDeployment,
      }),
    withJournal: withNotificationPagesPrivateDeployJournal,
    writeGen0: expectations => liveReceipt.writePrivateNotificationPagesLiveReceipt({
      directory: receiptDirectory,
      repositoryRoot: REPOSITORY_ROOT,
      handoffExpectations: expectations,
      expectedNotificationsPresentationEnabled: true,
      expectedHermesExecutionApproved: false,
    }),
    inspectCandidate: (contract, playerCanaryInspection = null) =>
      liveReceipt.inspectLatestPrivateNotificationPagesLiveReceiptForCandidate({
        directory: receiptDirectory,
        repositoryRoot: REPOSITORY_ROOT,
        candidatePagesSourceCommit: contract.candidatePagesSourceCommit,
        expectedChainRootReceiptDigest: contract.chainRootReceiptDigest,
        expectedChainRootPagesSourceCommit: contract.chainRootPagesSourceCommit,
        ...(playerCanaryInspection === null ? {} : {
          productionPlayerCanaryActivationAuthority:
            playerCanaryInspection.authority,
        }),
      }),
    inspectPlayerCanary: contract =>
      inspectProductionPlayerCanaryDeployAuthority({
        contract,
        repositoryRoot: REPOSITORY_ROOT,
        now: new Date(),
      }),
    requireFreshPlayerCanary: (authority, contract) =>
      requireFreshProductionPlayerCanaryActivationAuthority(authority, {
        candidatePagesSourceCommit: contract.candidatePagesSourceCommit,
        predecessorPagesSourceCommit:
          contract.productionPlayerCanarySourceCommit,
      }),
    promote: (contract, candidateAuthorityDigest) =>
      liveReceipt.promoteNotificationPagesLiveReceipt({
        directory: receiptDirectory,
        repositoryRoot: REPOSITORY_ROOT,
        candidateAuthorityDigest,
        candidatePagesSourceCommit: contract.candidatePagesSourceCommit,
        expectedChainRootReceiptDigest: contract.chainRootReceiptDigest,
        expectedChainRootPagesSourceCommit: contract.chainRootPagesSourceCommit,
      }),
  });
}

function exactPlayerCanaryInspection(value, contract) {
  if (
    !isRecord(value)
    || !isRecord(value.authority)
    || !SHA256.test(value.authorityDigest ?? '')
    || value.authority.candidatePagesSourceCommit
      !== contract.candidatePagesSourceCommit
    || value.authority.productionPlayerCanaryReceiptDigest
      !== contract.productionPlayerCanaryReceiptDigest
    || value.authority.productionPlayerCanarySourceCommit
      !== contract.productionPlayerCanarySourceCommit
  ) fail('NOTIFICATION_PAGES_DEPLOY_PLAYER_CANARY_AUTHORITY_INVALID');
  return value;
}

async function freshPlayerCanary(contract, dependencies) {
  if (contract.requiresProductionPlayerCanary !== true) return null;
  if (
    typeof dependencies.inspectPlayerCanary !== 'function'
    || typeof dependencies.requireFreshPlayerCanary !== 'function'
  ) fail('NOTIFICATION_PAGES_DEPLOY_PLAYER_CANARY_API_UNAVAILABLE');
  const inspection = exactPlayerCanaryInspection(
    await dependencies.inspectPlayerCanary(contract),
    contract,
  );
  dependencies.requireFreshPlayerCanary(inspection.authority, contract);
  return inspection;
}

async function finishExactCurrent(
  contract,
  journal,
  state,
  dependencies,
  playerCanaryInspection = null,
) {
  let result;
  if (contract.mode === 'gen0') {
    if (state.latestHandoff === null) {
      fail('NOTIFICATION_PAGES_DEPLOY_HANDOFF_JOURNAL_INVALID');
    }
    result = receiptResult(await dependencies.writeGen0(
      dependencies.resolveHandoff(state.latestHandoff),
    ));
  } else if (state.candidateAuthorityDigest !== null) {
    result = receiptResult(await dependencies.promote(
      contract,
      state.candidateAuthorityDigest,
    ));
  } else {
    const inspected = await dependencies.inspectCandidate(
      contract,
      playerCanaryInspection,
    );
    if (
      !isRecord(inspected)
      || inspected.candidateAlreadyLive !== true
      || !SHA256.test(inspected.receiptDigest ?? '')
    ) fail('NOTIFICATION_PAGES_DEPLOY_CANDIDATE_AUTHORITY_REQUIRED', true);
    result = Object.freeze({
      receiptDigest: inspected.receiptDigest,
      result: 'unchanged',
    });
  }
  journal.completed(result.receiptDigest, result.result);
  return result;
}

/** Execute one journaled workflow phase. Dependencies are injectable for tests. */
export async function executeNotificationPagesPrivateDeployPhase({
  command,
  contract,
  runId,
  runAttempt,
  sourceRunId,
  sourceRunAttempt,
  reportedHome,
} = {}, injectedDependencies) {
  if (
    ![
      'classify',
      'recover-skipped-invocation',
      'attest-deployment-source',
      'predeploy',
      'mark-deploy-invoked',
      'postflight',
    ].includes(command)
    || !isRecord(contract)
  ) fail('NOTIFICATION_PAGES_DEPLOY_INPUT_INVALID');
  if (command === 'classify') {
    return Object.freeze({ deploymentLane: contract.mode });
  }
  if (
    !['gen0', 'durable'].includes(contract.mode)
    || typeof runId !== 'string'
    || !RUN_ID.test(runId)
    || !Number.isSafeInteger(runAttempt)
    || runAttempt < 1
    || runAttempt > 1_000
    || typeof sourceRunId !== 'string'
    || !RUN_ID.test(sourceRunId)
    || !Number.isSafeInteger(sourceRunAttempt)
    || sourceRunAttempt < 1
    || sourceRunAttempt > 1_000
  ) fail('NOTIFICATION_PAGES_DEPLOY_INPUT_INVALID');
  const dependencies = injectedDependencies ?? defaultDependencies();
  dependencies.assertSource(contract.candidatePagesSourceCommit);
  const deploymentAuthorityRequest = Object.freeze({
    candidatePagesSourceCommit: contract.candidatePagesSourceCommit,
    runId,
    runAttempt,
    sourceRunId,
    sourceRunAttempt,
  });
  if (command === 'attest-deployment-source') {
    await dependencies.assertDeploymentAuthority(deploymentAuthorityRequest);
    return Object.freeze({ deploymentSourceAttested: true });
  }
  if (command === 'recover-skipped-invocation') {
    if (typeof dependencies.recoverSkippedInvocation !== 'function') {
      fail('NOTIFICATION_PAGES_DEPLOY_RECOVERY_API_UNAVAILABLE');
    }
    return dependencies.recoverSkippedInvocation({
      repositoryRoot: REPOSITORY_ROOT,
      reportedHome,
    });
  }
  return dependencies.withJournal({
    contract,
    repositoryRoot: REPOSITORY_ROOT,
    reportedHome,
    runId,
    runAttempt,
    operation: async journal => {
      if (command === 'predeploy') {
        const before = journal.inspect();
        if (before.completed) {
          return Object.freeze({ deployRequired: false, completed: true });
        }
        // C7 authenticates its private canary before the first public live
        // reconciliation. C5/C6 have a null binding and never touch canary
        // descriptors, receipts, or secrets.
        const playerCanaryInspection = await freshPlayerCanary(
          contract,
          dependencies,
        );
        let handoff = null;
        if (contract.mode === 'gen0') {
          if (before.latestHandoff !== null) {
            // The original run-bound handoff is part of the durable operation
            // contract. Replays never mint replacement authority merely
            // because a workflow run/attempt changed. Once gen0 is installed,
            // its idempotent writer needs only these retained expectations.
            handoff = before.latestHandoff;
          } else {
            handoff = dependencies.prepareHandoff(
              contract,
              runId,
              runAttempt,
              dependencies.now(),
            );
          }
        }
        journal.prepared(handoff);
        let state = journal.inspect();
        const reconciliation = await boundedReconciliation(
          contract,
          dependencies,
          state.deploymentInvoked,
        );
        if (reconciliation.status === 'exact-current') {
          journal.reconciledExactCurrent(contract.mode);
          state = journal.inspect();
          await finishExactCurrent(
            contract,
            journal,
            state,
            dependencies,
            playerCanaryInspection,
          );
          return Object.freeze({ deployRequired: false, completed: true });
        }
        journal.reconciledNotCurrent(contract.mode);
        state = journal.inspect();
        if (state.deploymentInvoked) {
          fail('NOTIFICATION_PAGES_DEPLOY_PREVIOUS_INVOCATION_UNCERTAIN', true);
        }
        if (contract.mode === 'gen0') {
          return Object.freeze({ deployRequired: true, completed: false });
        }
        const authority = await dependencies.inspectCandidate(
          contract,
          playerCanaryInspection,
        );
        if (
          !isRecord(authority)
          || authority.candidateAlreadyLive !== false
          || !SHA256.test(authority.candidateAuthorityDigest ?? '')
        ) fail('NOTIFICATION_PAGES_DEPLOY_CANDIDATE_AUTHORITY_INVALID');
        journal.candidateAuthorized(authority.candidateAuthorityDigest);
        return Object.freeze({ deployRequired: true, completed: false });
      }

      const state = journal.inspect();
      if (command === 'mark-deploy-invoked') {
        if (state.completed || state.deploymentInvoked) {
          fail('NOTIFICATION_PAGES_DEPLOY_ALREADY_INVOKED', true);
        }
        const playerCanaryInspection = await freshPlayerCanary(
          contract,
          dependencies,
        );
        if (contract.mode === 'gen0') {
          if (state.latestHandoff === null) {
            fail('NOTIFICATION_PAGES_DEPLOY_HANDOFF_JOURNAL_INVALID');
          }
          await dependencies.inspectHandoff(
            dependencies.resolveHandoff(state.latestHandoff),
          );
        } else {
          if (state.candidateAuthorityDigest === null) {
            fail('NOTIFICATION_PAGES_DEPLOY_CANDIDATE_AUTHORITY_REQUIRED');
          }
          const authority = await dependencies.inspectCandidate(
            contract,
            playerCanaryInspection,
          );
          if (
            !isRecord(authority)
            || authority.candidateAlreadyLive !== false
            || authority.candidateAuthorityDigest !== state.candidateAuthorityDigest
          ) fail('NOTIFICATION_PAGES_DEPLOY_CANDIDATE_AUTHORITY_MISMATCH');
        }
        dependencies.assertSource(contract.candidatePagesSourceCommit);
        await dependencies.assertDeploymentAuthority(deploymentAuthorityRequest);
        if (playerCanaryInspection !== null) {
          dependencies.requireFreshPlayerCanary(
            playerCanaryInspection.authority,
            contract,
          );
        }
        journal.deployInvoked(state.candidateAuthorityDigest);
        return Object.freeze({ deploymentAttempted: true });
      }

      if (!state.deploymentInvoked) {
        fail('NOTIFICATION_PAGES_DEPLOY_NOT_INVOKED');
      }
      if (state.completed) {
        return Object.freeze({ completed: true });
      }
      const reconciliation = await boundedReconciliation(
        contract,
        dependencies,
        true,
      );
      if (reconciliation.status !== 'exact-current') {
        journal.postflightNotCurrent(contract.mode);
        fail('NOTIFICATION_PAGES_DEPLOY_POSTFLIGHT_UNCERTAIN', true);
      }
      journal.reconciledExactCurrent(contract.mode);
      await finishExactCurrent(
        contract,
        journal,
        journal.inspect(),
        dependencies,
      );
      return Object.freeze({ completed: true });
    },
  });
}

function exactWorkflowEnvironment(command, environment) {
  const privateCommand = command !== 'classify';
  if (
    environment.GITHUB_ACTIONS !== 'true'
    || environment.CI !== 'true'
    || environment.GITHUB_REPOSITORY !== REPOSITORY
    || environment.GITHUB_EVENT_NAME !== 'workflow_run'
    || environment.GITHUB_WORKFLOW_REF
      !== `${REPOSITORY}/${WORKFLOW}@refs/heads/main`
    || typeof environment.WARPKEEP_PAGES_SOURCE_COMMIT !== 'string'
    || !COMMIT.test(environment.WARPKEEP_PAGES_SOURCE_COMMIT)
    || (privateCommand && (
      environment.RUNNER_OS !== 'macOS'
      || environment.RUNNER_ARCH !== 'ARM64'
    ))
  ) fail('NOTIFICATION_PAGES_DEPLOY_WORKFLOW_ENVIRONMENT_INVALID');
  if (
    privateCommand
    && (!RUN_ID.test(environment.GITHUB_RUN_ID ?? '')
      || !RUN_ID.test(environment.GITHUB_RUN_ATTEMPT ?? '')
      || !RUN_ID.test(environment.WARPKEEP_SOURCE_VERIFY_RUN_ID ?? '')
      || !RUN_ID.test(environment.WARPKEEP_SOURCE_VERIFY_RUN_ATTEMPT ?? ''))
  ) fail('NOTIFICATION_PAGES_DEPLOY_WORKFLOW_ENVIRONMENT_INVALID');
  return Object.freeze({
    candidatePagesSourceCommit: environment.WARPKEEP_PAGES_SOURCE_COMMIT,
    runId: environment.GITHUB_RUN_ID,
    runAttempt: Number(environment.GITHUB_RUN_ATTEMPT),
    sourceRunId: environment.WARPKEEP_SOURCE_VERIFY_RUN_ID,
    sourceRunAttempt: Number(environment.WARPKEEP_SOURCE_VERIFY_RUN_ATTEMPT),
  });
}

function writeWorkflowOutputs(command, result, environment) {
  const descriptor = Number(environment.GITHUB_OUTPUT_FD);
  if (!Number.isSafeInteger(descriptor) || descriptor < 3) {
    fail('NOTIFICATION_PAGES_DEPLOY_OUTPUT_INVALID');
  }
  let status;
  try { status = fstatSync(descriptor); } catch {
    fail('NOTIFICATION_PAGES_DEPLOY_OUTPUT_INVALID');
  }
  if (!status.isFile() || status.nlink !== 1 || (status.mode & 0o022) !== 0) {
    fail('NOTIFICATION_PAGES_DEPLOY_OUTPUT_INVALID');
  }
  let lines;
  if (command === 'classify') {
    if (!['closed-review', 'gen0', 'durable'].includes(result.deploymentLane)) {
      fail('NOTIFICATION_PAGES_DEPLOY_OUTPUT_INVALID');
    }
    lines = `deployment-lane=${result.deploymentLane}\n`;
  } else if (command === 'recover-skipped-invocation') {
    lines = `recovered=${result.recovered === true ? 'true' : 'false'}\n`;
  } else if (command === 'attest-deployment-source') {
    lines = `attested=${result.deploymentSourceAttested === true ? 'true' : 'false'}\n`;
  } else if (command === 'predeploy') {
    lines = `deploy-required=${result.deployRequired === true ? 'true' : 'false'}\n`;
  } else if (command === 'mark-deploy-invoked') {
    lines = 'attempted=true\n';
  } else {
    lines = `completed=${result.completed === true ? 'true' : 'false'}\n`;
  }
  try { writeSync(descriptor, lines, null, 'utf8'); } catch {
    fail('NOTIFICATION_PAGES_DEPLOY_OUTPUT_INVALID');
  }
}

export async function runNotificationPagesPrivateDeployOperatorCli(
  arguments_,
  environment,
  toolchainAuthority,
) {
  if (
    !isRecord(toolchainAuthority)
    || !Object.isFrozen(toolchainAuthority)
    || !SHA256.test(toolchainAuthority.runnerIdentityDigest ?? '')
    || !SHA256.test(toolchainAuthority.sourceClosureManifestSha256 ?? '')
  ) fail('NOTIFICATION_PAGES_DEPLOY_TOOLCHAIN_AUTHORITY_INVALID');
  if (arguments_.length !== 1) fail('NOTIFICATION_PAGES_DEPLOY_ARGUMENT_INVALID');
  const command = arguments_[0];
  if (![
    'classify',
    'recover-skipped-invocation',
    'attest-deployment-source',
    'predeploy',
    'mark-deploy-invoked',
    'postflight',
  ].includes(command)) {
    fail('NOTIFICATION_PAGES_DEPLOY_ARGUMENT_INVALID');
  }
  const input = exactWorkflowEnvironment(command, environment);
  const contract = loadNotificationPagesPrivateDeployContract(
    input.candidatePagesSourceCommit,
  );
  const result = await executeNotificationPagesPrivateDeployPhase({
    command,
    contract,
    runId: input.runId,
    runAttempt: input.runAttempt,
    sourceRunId: input.sourceRunId,
    sourceRunAttempt: input.sourceRunAttempt,
  });
  writeWorkflowOutputs(command, result, environment);
}

export const notificationPagesPrivateDeployOperatorTestSeams = Object.freeze({
  attestCurrentGitHubDeploymentAuthority(request, options) {
    if (process.env.NODE_ENV !== 'test') {
      fail('NOTIFICATION_PAGES_DEPLOY_TEST_SEAM_FORBIDDEN');
    }
    return attestCurrentGitHubDeploymentAuthority(request, options);
  },
  adjudicateSkippedGitHubDeployment(request, options) {
    if (process.env.NODE_ENV !== 'test') {
      fail('NOTIFICATION_PAGES_DEPLOY_TEST_SEAM_FORBIDDEN');
    }
    return adjudicateSkippedGitHubDeployment(request, options);
  },
  repairHandoffTemporaries(directory) {
    if (process.env.NODE_ENV !== 'test') {
      fail('NOTIFICATION_PAGES_DEPLOY_TEST_SEAM_FORBIDDEN');
    }
    return repairHandoffTemporaries(directory);
  },
});

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.stderr.write('NOTIFICATION_PAGES_DEPLOY_ATTESTED_LAUNCHER_REQUIRED\n');
  process.exitCode = 1;
}

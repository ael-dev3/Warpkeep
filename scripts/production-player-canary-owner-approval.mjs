import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';

import { assertProductionAdminTrustedAncestors } from './production-admin-token-budget.mjs';
import {
  requireProductionPlayerCanaryBaselineReconciliationForApproval,
} from './production-player-canary-baseline-reconciliation.mjs';

export const PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_KIND =
  'warpkeep-production-player-canary-owner-approval-v1';

const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const ID = /^[0-9a-f]{32}$/u;
const DECIMAL_U64 = /^(?:0|[1-9][0-9]{0,19})$/u;
const WORKER_ID = /^genesis-001-castle-[0-9]+-worker-0[1-4]$/u;
const LOCATION_ID = /^GRL-[A-Z2-7]{26}$/u;
const COMMAND_KEY = /^[a-z0-9][a-z0-9-]{15,79}$/u;
const ISO_INSTANT = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/u;
const FILENAME = /^production-player-canary-owner-approval-([0-9a-f]{32})\.json$/u;
const MAXIMUM_BYTES = 32 * 1_024;
const MAXIMUM_APPROVAL_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;
const OPERATOR_MARGIN_SECONDS = 15 * 60;
const U64_MAX = 0xffff_ffff_ffff_ffffn;
const RESOURCE_KINDS = Object.freeze(['food', 'wood', 'stone', 'gold']);

const APPROVAL_KEYS = Object.freeze([
  'schemaVersion', 'kind', 'approvalId', 'evidenceNonce',
  'reviewedAdmissionPlanDigest', 'protectedCommit', 'protectedTree',
  'predecessorLiveReceiptDigest', 'predecessorLiveRootReceiptDigest',
  'predecessorLiveRootPagesSourceCommit', 'approvedAt', 'notAfter',
  'minimumGatheringSeconds', 'maximumGatheringSeconds', 'maximumRouteSteps',
  'serverBaselineCommitment', 'routes', 'commands',
]);
const ROUTE_KEYS = Object.freeze([
  'ordinal', 'workerId', 'resourceKind', 'locationId',
  'atlasRevision', 'routeSteps', 'nodeCount',
]);
const COMMAND_KEYS = Object.freeze([
  'ordinal', 'dispatchIdempotencyKey', 'recallIdempotencyKey',
]);

export class ProductionPlayerCanaryOwnerApprovalError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ProductionPlayerCanaryOwnerApprovalError';
    this.code = code;
  }
}

function fail(code) {
  throw new ProductionPlayerCanaryOwnerApprovalError(code);
}

function exactKeys(value, keys, code) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')
  ) fail(code);
  return value;
}

function exactInstant(value) {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isSafeInteger(timestamp) && new Date(timestamp).toISOString() === value;
}

function u64(value, code) {
  if (typeof value !== 'string' || !DECIMAL_U64.test(value)) fail(code);
  const result = BigInt(value);
  if (result > U64_MAX) fail(code);
  return value;
}

function framed(values) {
  return values.map(value => {
    const text = value.toString();
    return `${Buffer.byteLength(text, 'utf8')}:${text}`;
  }).join('|');
}

function canonicalApproval(value) {
  return {
    schemaVersion: value.schemaVersion,
    kind: value.kind,
    approvalId: value.approvalId,
    evidenceNonce: value.evidenceNonce,
    reviewedAdmissionPlanDigest: value.reviewedAdmissionPlanDigest,
    protectedCommit: value.protectedCommit,
    protectedTree: value.protectedTree,
    predecessorLiveReceiptDigest: value.predecessorLiveReceiptDigest,
    predecessorLiveRootReceiptDigest: value.predecessorLiveRootReceiptDigest,
    predecessorLiveRootPagesSourceCommit: value.predecessorLiveRootPagesSourceCommit,
    approvedAt: value.approvedAt,
    notAfter: value.notAfter,
    minimumGatheringSeconds: value.minimumGatheringSeconds,
    maximumGatheringSeconds: value.maximumGatheringSeconds,
    maximumRouteSteps: value.maximumRouteSteps,
    serverBaselineCommitment: value.serverBaselineCommitment,
    routes: value.routes.map(route => ({ ...route })),
    commands: value.commands.map(command => ({ ...command })),
  };
}

function routeMaterial(route) {
  return framed([
    route.ordinal,
    route.workerId,
    route.resourceKind,
    route.locationId,
    route.atlasRevision,
    route.routeSteps,
    route.nodeCount,
  ]);
}

export function productionPlayerCanaryRouteSetCommitment(input) {
  const nonce = input?.evidenceNonce;
  const planDigest = input?.reviewedAdmissionPlanDigest;
  if (
    typeof nonce !== 'string' || !SHA256.test(nonce)
    || typeof planDigest !== 'string' || !SHA256.test(planDigest)
    || !Array.isArray(input.routes) || input.routes.length !== 4
  ) fail('PRODUCTION_PLAYER_CANARY_ROUTE_COMMITMENT_INVALID');
  return createHash('sha256').update(`${framed([
    'warpkeep.production-player-canary.route-set.v1',
    nonce,
    planDigest,
    ...input.routes.map(routeMaterial),
  ])}\n`, 'utf8').digest('hex');
}

export function parseProductionPlayerCanaryOwnerApproval(value) {
  const approval = exactKeys(
    value,
    APPROVAL_KEYS,
    'PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_INVALID',
  );
  if (!Array.isArray(approval.routes) || !Array.isArray(approval.commands)) {
    fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_INVALID');
  }
  const routes = approval.routes.map(route => exactKeys(
    route,
    ROUTE_KEYS,
    'PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_INVALID',
  ));
  const commands = approval.commands.map(command => exactKeys(
    command,
    COMMAND_KEYS,
    'PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_INVALID',
  ));
  const approvedAtMs = exactInstant(approval.approvedAt)
    ? Date.parse(approval.approvedAt) : Number.NaN;
  const notAfterMs = exactInstant(approval.notAfter)
    ? Date.parse(approval.notAfter) : Number.NaN;
  if (
    approval.schemaVersion !== 1
    || approval.kind !== PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_KIND
    || typeof approval.approvalId !== 'string' || !ID.test(approval.approvalId)
    || typeof approval.evidenceNonce !== 'string' || !SHA256.test(approval.evidenceNonce)
    || typeof approval.reviewedAdmissionPlanDigest !== 'string'
      || !SHA256.test(approval.reviewedAdmissionPlanDigest)
    || typeof approval.serverBaselineCommitment !== 'string'
      || !SHA256.test(approval.serverBaselineCommitment)
    || typeof approval.protectedCommit !== 'string' || !COMMIT.test(approval.protectedCommit)
    || typeof approval.protectedTree !== 'string' || !COMMIT.test(approval.protectedTree)
    || typeof approval.predecessorLiveReceiptDigest !== 'string'
      || !SHA256.test(approval.predecessorLiveReceiptDigest)
    || typeof approval.predecessorLiveRootReceiptDigest !== 'string'
      || !SHA256.test(approval.predecessorLiveRootReceiptDigest)
    || typeof approval.predecessorLiveRootPagesSourceCommit !== 'string'
      || !COMMIT.test(approval.predecessorLiveRootPagesSourceCommit)
    || !Number.isSafeInteger(approvedAtMs) || !Number.isSafeInteger(notAfterMs)
    || notAfterMs <= approvedAtMs
    || notAfterMs - approvedAtMs > MAXIMUM_APPROVAL_LIFETIME_MS
    || approval.minimumGatheringSeconds !== 60
    || approval.maximumGatheringSeconds !== 120
    || !Number.isSafeInteger(approval.maximumRouteSteps)
    || approval.maximumRouteSteps < 1 || approval.maximumRouteSteps > 8_192
    || routes.length !== 4 || commands.length !== 4
    || new Set(routes.map(route => route.workerId)).size !== 4
    || new Set(routes.map(route => route.locationId)).size !== 4
    || new Set(routes.map(route => route.resourceKind)).size !== 4
    || new Set(commands.flatMap(command => [
      command.dispatchIdempotencyKey,
      command.recallIdempotencyKey,
    ])).size !== 8
  ) fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_INVALID');
  for (let index = 0; index < 4; index += 1) {
    const ordinal = index + 1;
    const route = routes[index];
    const command = commands[index];
    if (
      route.ordinal !== ordinal
      || command.ordinal !== ordinal
      || !WORKER_ID.test(route.workerId)
      || !RESOURCE_KINDS.includes(route.resourceKind)
      || !LOCATION_ID.test(route.locationId)
      || u64(route.atlasRevision, 'PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_INVALID') === '0'
      || !Number.isSafeInteger(route.routeSteps) || route.routeSteps < 1
      || route.routeSteps > approval.maximumRouteSteps
      || !Number.isSafeInteger(route.nodeCount) || route.nodeCount < 1 || route.nodeCount > 32
      || typeof command.dispatchIdempotencyKey !== 'string'
      || !COMMAND_KEY.test(command.dispatchIdempotencyKey)
      || typeof command.recallIdempotencyKey !== 'string'
      || !COMMAND_KEY.test(command.recallIdempotencyKey)
    ) fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_INVALID');
  }
  const requiredLifetimeSeconds = 2 * Math.max(...routes.map(route => route.routeSteps)) * 30
    + approval.maximumGatheringSeconds
    + OPERATOR_MARGIN_SECONDS;
  if (notAfterMs - approvedAtMs < requiredLifetimeSeconds * 1_000) {
    fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_CUTOFF_TOO_SHORT');
  }
  return Object.freeze(canonicalApproval({
    ...approval,
    routes,
    commands,
  }));
}

function exactDirectory(directory) {
  try {
    if (!isAbsolute(directory) || resolve(directory) !== directory) {
      fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_DIRECTORY_INVALID');
    }
    assertProductionAdminTrustedAncestors(directory);
    const status = lstatSync(directory, { bigint: true });
    if (
      !status.isDirectory() || status.isSymbolicLink()
      || (status.mode & 0o7777n) !== 0o700n
      || (process.getuid !== undefined && status.uid !== BigInt(process.getuid()))
      || realpathSync(directory) !== directory
    ) fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_DIRECTORY_INVALID');
    return directory;
  } catch (error) {
    if (error instanceof ProductionPlayerCanaryOwnerApprovalError) throw error;
    return fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_DIRECTORY_INVALID');
  }
}

function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino
    && left.mode === right.mode && left.uid === right.uid
    && left.nlink === right.nlink && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function readExactFile(path, expectedLinks = 1n) {
  let descriptor;
  try {
    const status = lstatSync(path, { bigint: true });
    if (
      !status.isFile() || status.isSymbolicLink()
      || (status.mode & 0o7777n) !== 0o600n || status.nlink !== expectedLinks
      || status.size < 1n || status.size > BigInt(MAXIMUM_BYTES)
      || (process.getuid !== undefined && status.uid !== BigInt(process.getuid()))
    ) fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_FILE_INVALID');
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor, { bigint: true });
    if (!sameFile(status, opened)) fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_FILE_CHANGED');
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const current = lstatSync(path, { bigint: true });
    if (!sameFile(opened, after) || !sameFile(opened, current)) {
      bytes.fill(0);
      fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_FILE_CHANGED');
    }
    return bytes;
  } catch (error) {
    if (error instanceof ProductionPlayerCanaryOwnerApprovalError) throw error;
    return fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_FILE_INVALID');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function fsyncDirectory(directory) {
  const descriptor = openSync(
    directory,
    constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0),
  );
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

/**
 * Reconcile only the exact hard-link crash state produced by this writer. A
 * destination with unrelated links, bytes, metadata, or temporary names is a
 * conflict and remains untouched.
 */
function reconcilePublishedApproval(directory, filename, destination, expectedBytes) {
  let destinationStatus;
  try {
    destinationStatus = lstatSync(destination, { bigint: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_FILE_INVALID');
  }
  if (
    !destinationStatus.isFile() || destinationStatus.isSymbolicLink()
    || (destinationStatus.mode & 0o7777n) !== 0o600n
    || destinationStatus.nlink < 1n
    || (process.getuid !== undefined
      && destinationStatus.uid !== BigInt(process.getuid()))
  ) fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_FILE_INVALID');

  const current = readExactFile(destination, destinationStatus.nlink);
  try {
    if (!current.equals(expectedBytes)) {
      fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_CONFLICT');
    }
  } finally { current.fill(0); }
  if (destinationStatus.nlink === 1n) return true;

  const temporaryPrefix = `.${filename}.`;
  const aliases = [];
  for (const name of readdirSync(directory)) {
    if (
      !name.startsWith(temporaryPrefix)
      || !/^[0-9a-f]{32}\.tmp$/u.test(name.slice(temporaryPrefix.length))
    ) continue;
    const path = join(directory, name);
    const status = lstatSync(path, { bigint: true });
    if (
      status.dev !== destinationStatus.dev
      || status.ino !== destinationStatus.ino
      || status.mode !== destinationStatus.mode
      || status.uid !== destinationStatus.uid
      || status.nlink !== destinationStatus.nlink
      || status.size !== destinationStatus.size
    ) fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_FILE_INVALID');
    aliases.push(path);
  }
  if (BigInt(aliases.length) !== destinationStatus.nlink - 1n) {
    fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_FILE_INVALID');
  }
  for (const alias of aliases) unlinkSync(alias);
  fsyncDirectory(directory);
  const repaired = readExactFile(destination);
  try {
    if (!repaired.equals(expectedBytes)) {
      fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_FILE_CHANGED');
    }
  } finally { repaired.fill(0); }
  return true;
}

export function writeProductionPlayerCanaryOwnerApproval(input) {
  const directory = exactDirectory(input.directory);
  // The owner must durably precommit the identifier with the approved tuple.
  // Generating it here would make a killed-after-link retry publish a second
  // semantically equivalent artifact under a different name.
  const approval = parseProductionPlayerCanaryOwnerApproval(input.approval);
  try {
    requireProductionPlayerCanaryBaselineReconciliationForApproval(
      input.baselineReconciliation,
      approval,
    );
  } catch {
    fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_BASELINE_RECONCILIATION_REQUIRED');
  }
  const bytes = Buffer.from(`${JSON.stringify(approval)}\n`, 'utf8');
  const filename = `production-player-canary-owner-approval-${approval.approvalId}.json`;
  const destination = join(directory, filename);
  const temporary = join(directory, `.${filename}.${randomUUID().replaceAll('-', '')}.tmp`);
  let descriptor;
  try {
    if (reconcilePublishedApproval(directory, filename, destination, bytes)) {
      return Object.freeze({
        filename,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
    descriptor = openSync(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    let offset = 0;
    while (offset < bytes.length) {
      const count = writeSync(descriptor, bytes, offset, bytes.length - offset);
      if (count <= 0) fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_WRITE_FAILED');
      offset += count;
    }
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    linkSync(temporary, destination);
    fsyncDirectory(directory);
    unlinkSync(temporary);
    fsyncDirectory(directory);
    return Object.freeze({
      filename,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* No surviving unpublished temporary. */ }
    if (error instanceof ProductionPlayerCanaryOwnerApprovalError) throw error;
    return fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_WRITE_FAILED');
  } finally {
    bytes.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function inspectProductionPlayerCanaryOwnerApproval(input) {
  const directory = exactDirectory(input.directory);
  const reference = exactKeys(
    input.reference,
    ['filename', 'sha256'],
    'PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_REFERENCE_INVALID',
  );
  if (
    typeof reference.filename !== 'string'
    || basename(reference.filename) !== reference.filename
    || !FILENAME.test(reference.filename)
    || typeof reference.sha256 !== 'string'
    || !SHA256.test(reference.sha256)
  ) fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_REFERENCE_INVALID');
  const bytes = readExactFile(join(directory, reference.filename));
  try {
    if (createHash('sha256').update(bytes).digest('hex') !== reference.sha256) {
      fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_DIGEST_MISMATCH');
    }
    let approval;
    try {
      approval = parseProductionPlayerCanaryOwnerApproval(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
      );
    } catch (error) {
      if (error instanceof ProductionPlayerCanaryOwnerApprovalError) throw error;
      return fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_INVALID');
    }
    const canonical = Buffer.from(`${JSON.stringify(approval)}\n`, 'utf8');
    try {
      if (!canonical.equals(bytes)) {
        fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_NONCANONICAL');
      }
    } finally { canonical.fill(0); }
    const match = FILENAME.exec(reference.filename);
    if (match?.[1] !== approval.approvalId) {
      fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_REFERENCE_INVALID');
    }
    const nowMs = input.now instanceof Date ? input.now.getTime() : Number.NaN;
    if (
      !Number.isSafeInteger(nowMs)
      || nowMs < Date.parse(approval.approvedAt)
      || nowMs > Date.parse(approval.notAfter)
    ) fail('PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_EXPIRED');
    const routeSetCommitment = productionPlayerCanaryRouteSetCommitment(approval);
    const approvalCommitment = createHash('sha256').update(`${framed([
      'warpkeep.production-player-canary.owner-approval.v1',
      approval.evidenceNonce,
      reference.sha256,
      approval.serverBaselineCommitment,
      routeSetCommitment,
    ])}\n`, 'utf8').digest('hex');
    return Object.freeze({
      approval,
      artifactDigest: reference.sha256,
      approvalCommitment,
      routeSetCommitment,
    });
  } finally {
    bytes.fill(0);
  }
}

export const productionPlayerCanaryOwnerApprovalTestSeams =
  process.env.NODE_ENV === 'test' && process.env.VITEST === 'true'
    ? Object.freeze({ sameFile })
    : undefined;

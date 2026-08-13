import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { DEFAULT_AUTH_BRIDGE_URL } from './auth-bridge-config-attestation.mjs';
import {
  inspectProductionPlayerCanaryExpectedEvidenceAuthority,
} from './production-player-canary-evidence-authority.mjs';
import {
  inspectProductionPlayerCanaryActivationAuthority,
  productionPlayerCanaryActivationAuthorityDigest,
  requireFreshProductionPlayerCanaryActivationAuthority,
} from './production-player-canary-receipt.mjs';
import {
  ensureCanonicalProductionAdminStateDirectory,
} from './production-admin-token-budget.mjs';

export const PRODUCTION_PLAYER_CANARY_DEPLOY_AUTHORITY_PROFILE =
  'warpkeep-production-player-canary-deploy-authority-v1';
export const PRODUCTION_PLAYER_CANARY_DEPLOY_STATE_CHILD =
  'production-player-canary-deploy-v1';
export const PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_BASENAME =
  'activation-request-v1.json';
export const PRODUCTION_PLAYER_CANARY_LAUNCH_SECRETS_CHILD =
  'launch-secrets-v1';

const ADMIN_SECRET_BASENAME = 'production-admin-secret-v1.txt';
const NOTIFICATION_SECRET_BASENAME =
  'notification-operator-secret-v1.txt';
const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const PRIVATE_PATH = /^[^\0\r\n]{1,4096}$/u;
const REFERENCE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}\.json$/u;
const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_SECRET_BYTES = 512;
const REQUEST_TEMPORARY =
  /^\.activation-request-v1\.json\.([0-9a-f]{32})\.tmp$/u;
const REQUEST_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'candidatePagesSourceCommit',
  'predecessorPagesSourceCommit',
  'predecessorProtectedTree',
  'productionPlayerCanaryReceiptDigest',
  'founderPlanDirectory',
  'reviewedAdmissionPlanReference',
  'ownerApprovalDirectory',
  'ownerApprovalReference',
]);
const REFERENCE_KEYS = Object.freeze(['filename', 'sha256']);

export class ProductionPlayerCanaryDeployAuthorityError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ProductionPlayerCanaryDeployAuthorityError';
    this.code = code;
  }
}

function fail(code) {
  throw new ProductionPlayerCanaryDeployAuthorityError(code);
}

function exactKeys(value, keys) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).join('\0') === keys.join('\0');
}

function fixedPrivateFile(path, maximumBytes, code) {
  let descriptor;
  try {
    const named = lstatSync(path, { bigint: true });
    if (
      !named.isFile() || named.isSymbolicLink() || named.nlink !== 1n
      || (named.mode & 0o7777n) !== 0o600n
      || named.size < 1n || named.size > BigInt(maximumBytes)
      || realpathSync(path) !== path
      || (process.getuid !== undefined && named.uid !== BigInt(process.getuid()))
    ) fail(code);
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (
      before.dev !== named.dev || before.ino !== named.ino
      || before.mode !== named.mode || before.uid !== named.uid
      || before.nlink !== named.nlink || before.size !== named.size
      || before.mtimeNs !== named.mtimeNs || before.ctimeNs !== named.ctimeNs
    ) fail(code);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const current = lstatSync(path, { bigint: true });
    if (
      after.dev !== before.dev || after.ino !== before.ino
      || after.mode !== before.mode || after.uid !== before.uid
      || after.nlink !== before.nlink || after.size !== before.size
      || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs
      || current.dev !== before.dev || current.ino !== before.ino
      || current.mode !== before.mode || current.uid !== before.uid
      || current.nlink !== before.nlink || current.size !== before.size
      || current.mtimeNs !== before.mtimeNs || current.ctimeNs !== before.ctimeNs
    ) {
      bytes.fill(0);
      fail(code);
    }
    return bytes;
  } catch (error) {
    if (error instanceof ProductionPlayerCanaryDeployAuthorityError) throw error;
    return fail(code);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function exactPrivateDirectory(path, parent, code) {
  try {
    const status = lstatSync(path, { bigint: true });
    if (
      !isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path
      || dirname(path) !== parent || !status.isDirectory() || status.isSymbolicLink()
      || (status.mode & 0o7777n) !== 0o700n
      || (process.getuid !== undefined && status.uid !== BigInt(process.getuid()))
    ) fail(code);
    return path;
  } catch (error) {
    if (error instanceof ProductionPlayerCanaryDeployAuthorityError) throw error;
    return fail(code);
  }
}

function ensureFixedPrivateDirectory(path, parent, code) {
  try {
    lstatSync(path);
  } catch (error) {
    if (error?.code !== 'ENOENT') fail(code);
    try {
      mkdirSync(path, { mode: 0o700 });
      fsyncDirectory(parent);
    } catch (createError) {
      if (createError?.code !== 'EEXIST') fail(code);
    }
  }
  return exactPrivateDirectory(path, parent, code);
}

function samePrivateFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino
    && left.mode === right.mode && left.uid === right.uid
    && left.nlink === right.nlink && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function fsyncDirectory(directory) {
  let descriptor;
  try {
    descriptor = openSync(
      directory,
      constants.O_RDONLY
        | (constants.O_DIRECTORY ?? 0)
        | (constants.O_NOFOLLOW ?? 0),
    );
    fsyncSync(descriptor);
  } catch (error) {
    if (error instanceof ProductionPlayerCanaryDeployAuthorityError) throw error;
    fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_WRITE_FAILED');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readPrivateFileWithLinks(path, expectedLinks) {
  let descriptor;
  try {
    const named = lstatSync(path, { bigint: true });
    if (
      !named.isFile() || named.isSymbolicLink()
      || named.nlink !== expectedLinks
      || (named.mode & 0o7777n) !== 0o600n
      || named.size < 1n || named.size > BigInt(MAX_REQUEST_BYTES)
      || (process.getuid !== undefined && named.uid !== BigInt(process.getuid()))
    ) fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_FILE_INVALID');
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!samePrivateFile(named, before)) {
      fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_FILE_INVALID');
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const current = lstatSync(path, { bigint: true });
    if (!samePrivateFile(before, after) || !samePrivateFile(before, current)) {
      bytes.fill(0);
      fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_FILE_CHANGED');
    }
    return Object.freeze({ bytes, status: before });
  } catch (error) {
    if (error instanceof ProductionPlayerCanaryDeployAuthorityError) throw error;
    return fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_FILE_INVALID');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parseReference(value) {
  if (
    !exactKeys(value, REFERENCE_KEYS)
    || typeof value.filename !== 'string'
    || !REFERENCE_NAME.test(value.filename)
    || typeof value.sha256 !== 'string'
    || !SHA256.test(value.sha256)
  ) fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_INVALID');
  return Object.freeze({ ...value });
}

export function parseProductionPlayerCanaryActivationRequest(value) {
  if (
    !exactKeys(value, REQUEST_KEYS)
    || value.schemaVersion !== 1
    || value.profile !== PRODUCTION_PLAYER_CANARY_DEPLOY_AUTHORITY_PROFILE
    || typeof value.candidatePagesSourceCommit !== 'string'
    || !COMMIT.test(value.candidatePagesSourceCommit)
    || typeof value.predecessorPagesSourceCommit !== 'string'
    || !COMMIT.test(value.predecessorPagesSourceCommit)
    || value.candidatePagesSourceCommit === value.predecessorPagesSourceCommit
    || typeof value.predecessorProtectedTree !== 'string'
    || !COMMIT.test(value.predecessorProtectedTree)
    || typeof value.productionPlayerCanaryReceiptDigest !== 'string'
    || !SHA256.test(value.productionPlayerCanaryReceiptDigest)
    || typeof value.founderPlanDirectory !== 'string'
    || !PRIVATE_PATH.test(value.founderPlanDirectory)
    || !isAbsolute(value.founderPlanDirectory)
    || resolve(value.founderPlanDirectory) !== value.founderPlanDirectory
    || typeof value.ownerApprovalDirectory !== 'string'
    || !PRIVATE_PATH.test(value.ownerApprovalDirectory)
    || !isAbsolute(value.ownerApprovalDirectory)
    || resolve(value.ownerApprovalDirectory) !== value.ownerApprovalDirectory
  ) fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_INVALID');
  return Object.freeze({
    ...value,
    reviewedAdmissionPlanReference:
      parseReference(value.reviewedAdmissionPlanReference),
    ownerApprovalReference: parseReference(value.ownerApprovalReference),
  });
}

function canonicalRequestBytes(request) {
  return Buffer.from(`${JSON.stringify(request, null, 2)}\n`, 'utf8');
}

function requireInspectedActivationRequestReferences(
  request,
  inspectedPlan,
  inspectedApproval,
) {
  const plan = inspectedPlan?.plan;
  const approval = inspectedApproval?.approval;
  if (
    plan === null || typeof plan !== 'object'
    || approval === null || typeof approval !== 'object'
    || inspectedPlan.planDigest !== request.reviewedAdmissionPlanReference.sha256
    || inspectedApproval.artifactDigest !== request.ownerApprovalReference.sha256
    || approval.reviewedAdmissionPlanDigest !== inspectedPlan.planDigest
    || approval.protectedCommit !== request.predecessorPagesSourceCommit
    || approval.protectedTree !== request.predecessorProtectedTree
    || plan.notificationPagesLivePagesSourceCommit
      !== request.predecessorPagesSourceCommit
    || approval.predecessorLiveReceiptDigest
      !== plan.notificationPagesLiveReceiptDigest
    || approval.predecessorLiveRootReceiptDigest
      !== plan.notificationPagesLiveRootReceiptDigest
    || approval.predecessorLiveRootPagesSourceCommit
      !== plan.notificationPagesLiveRootPagesSourceCommit
  ) fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_REFERENCE_MISMATCH');
  return request;
}

function matchingRequestTemporaries(stateDirectory) {
  try {
    return readdirSync(stateDirectory)
      .filter(name => REQUEST_TEMPORARY.test(name))
      .sort()
      .map(name => join(stateDirectory, name));
  } catch {
    return fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_FILE_INVALID');
  }
}

function exactExpectedTemporary(path, expectedBytes) {
  let status;
  try { status = lstatSync(path, { bigint: true }); } catch {
    return fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_FILE_INVALID');
  }
  const inspected = readPrivateFileWithLinks(path, status.nlink);
  try {
    if (!inspected.bytes.equals(expectedBytes)) {
      fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_CONFLICT');
    }
    return inspected.status;
  } finally {
    inspected.bytes.fill(0);
  }
}

/**
 * Recover only exact writer temporaries containing the requested canonical
 * bytes. Any mismatched temporary, unaccounted hard link, or destination byte
 * conflict is left untouched and fails closed.
 */
function reconcileCanonicalRequest(stateDirectory, destination, expectedBytes) {
  const temporaries = matchingRequestTemporaries(stateDirectory);
  let destinationStatus;
  try {
    destinationStatus = lstatSync(destination, { bigint: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_FILE_INVALID');
    }
  }

  if (destinationStatus === undefined) {
    if (temporaries.length === 0) return false;
    const temporaryStatuses = temporaries.map(path =>
      exactExpectedTemporary(path, expectedBytes));
    if (temporaryStatuses.some(status => status.nlink !== 1n)) {
      fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_FILE_INVALID');
    }
    try {
      linkSync(temporaries[0], destination);
      fsyncDirectory(stateDirectory);
      for (const temporary of temporaries) unlinkSync(temporary);
      fsyncDirectory(stateDirectory);
    } catch (error) {
      if (error instanceof ProductionPlayerCanaryDeployAuthorityError) throw error;
      fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_WRITE_FAILED');
    }
    const installed = readPrivateFileWithLinks(destination, 1n);
    try {
      if (!installed.bytes.equals(expectedBytes)) {
        fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_FILE_CHANGED');
      }
    } finally { installed.bytes.fill(0); }
    return true;
  }

  const installed = readPrivateFileWithLinks(
    destination,
    destinationStatus.nlink,
  );
  try {
    if (!installed.bytes.equals(expectedBytes)) {
      fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_CONFLICT');
    }
  } finally { installed.bytes.fill(0); }

  let linkedAliases = 0;
  for (const temporary of temporaries) {
    const status = exactExpectedTemporary(temporary, expectedBytes);
    if (
      status.dev === destinationStatus.dev
      && status.ino === destinationStatus.ino
    ) linkedAliases += 1;
    else if (status.nlink !== 1n) {
      fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_FILE_INVALID');
    }
  }
  if (BigInt(linkedAliases) !== destinationStatus.nlink - 1n) {
    fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_FILE_INVALID');
  }
  if (temporaries.length > 0) {
    try {
      for (const temporary of temporaries) unlinkSync(temporary);
      fsyncDirectory(stateDirectory);
    } catch {
      fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_WRITE_FAILED');
    }
  }
  const repaired = readPrivateFileWithLinks(destination, 1n);
  try {
    if (!repaired.bytes.equals(expectedBytes)) {
      fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_FILE_CHANGED');
    }
  } finally { repaired.bytes.fill(0); }
  return true;
}

function publishCanonicalRequest(stateDirectory, requestValue) {
  const request = parseProductionPlayerCanaryActivationRequest(requestValue);
  const destination = join(
    stateDirectory,
    PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_BASENAME,
  );
  const bytes = canonicalRequestBytes(request);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const temporary = join(
    stateDirectory,
    `.activation-request-v1.json.${randomUUID().replaceAll('-', '')}.tmp`,
  );
  let descriptor;
  try {
    if (reconcileCanonicalRequest(stateDirectory, destination, bytes)) {
      return Object.freeze({ activationRequestDigest: digest });
    }
    descriptor = openSync(
      temporary,
      constants.O_WRONLY
        | constants.O_CREAT
        | constants.O_EXCL
        | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = writeSync(
        descriptor,
        bytes,
        offset,
        bytes.byteLength - offset,
      );
      if (count < 1) {
        fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_WRITE_FAILED');
      }
      offset += count;
    }
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    linkSync(temporary, destination);
    fsyncDirectory(stateDirectory);
    unlinkSync(temporary);
    fsyncDirectory(stateDirectory);
    const installed = readPrivateFileWithLinks(destination, 1n);
    try {
      if (!installed.bytes.equals(bytes)) {
        fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_FILE_CHANGED');
      }
    } finally { installed.bytes.fill(0); }
    return Object.freeze({ activationRequestDigest: digest });
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* Preserve the publication result. */ }
    if (error instanceof ProductionPlayerCanaryDeployAuthorityError) throw error;
    return fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_WRITE_FAILED');
  } finally {
    bytes.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

/**
 * Publish the one fixed activation descriptor after independently inspecting
 * both referenced private artifacts. The publication is idempotent for exact
 * bytes and never replaces a different existing request.
 */
export async function writeProductionPlayerCanaryActivationRequest({
  request: requestValue,
  now = new Date(),
} = {}) {
  const request = parseProductionPlayerCanaryActivationRequest(requestValue);
  if (!(now instanceof Date) || !Number.isSafeInteger(now.getTime())) {
    fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_INPUT_INVALID');
  }
  const [{
    FOUNDER_ADMISSION_SOURCE_CONFIGURATION_DIGEST,
    FOUNDER_ADMISSION_TARGET_CONFIGURATION_DIGEST,
  }, { FARCASTER_PROFILE_POLICY_VERSION }, planModule, approvalModule] =
    await Promise.all([
      import('./hermes-admin.ts'),
      import('./profiles/farcaster-profile-policy.ts'),
      import('./profiles/founder-admission-plan.ts'),
      import('./production-player-canary-owner-approval.mjs'),
    ]);
  const [inspectedPlan, inspectedApproval] = await Promise.all([
    planModule.inspectClaimedReviewedFounderAdmissionPlan({
      directory: request.founderPlanDirectory,
      reference: request.reviewedAdmissionPlanReference,
      expectedSourceConfigurationDigest:
        FOUNDER_ADMISSION_SOURCE_CONFIGURATION_DIGEST,
      expectedTargetConfigurationDigest:
        FOUNDER_ADMISSION_TARGET_CONFIGURATION_DIGEST,
      expectedProfilePolicyVersion: FARCASTER_PROFILE_POLICY_VERSION,
      now,
    }),
    approvalModule.inspectProductionPlayerCanaryOwnerApproval({
      directory: request.ownerApprovalDirectory,
      reference: request.ownerApprovalReference,
      now,
    }),
  ]);
  requireInspectedActivationRequestReferences(
    request,
    inspectedPlan,
    inspectedApproval,
  );

  const parent = ensureCanonicalProductionAdminStateDirectory();
  const stateDirectory = ensureFixedPrivateDirectory(
    join(parent, PRODUCTION_PLAYER_CANARY_DEPLOY_STATE_CHILD),
    parent,
    'PRODUCTION_PLAYER_CANARY_DEPLOY_STATE_DIRECTORY_INVALID',
  );
  ensureFixedPrivateDirectory(
    join(stateDirectory, PRODUCTION_PLAYER_CANARY_LAUNCH_SECRETS_CHILD),
    stateDirectory,
    'PRODUCTION_PLAYER_CANARY_DEPLOY_SECRET_DIRECTORY_INVALID',
  );
  return publishCanonicalRequest(stateDirectory, request);
}

function readCanonicalRequest(path) {
  const bytes = fixedPrivateFile(
    path,
    MAX_REQUEST_BYTES,
    'PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_FILE_INVALID',
  );
  try {
    let value;
    try {
      value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_INVALID');
    }
    const request = parseProductionPlayerCanaryActivationRequest(value);
    if (`${JSON.stringify(request, null, 2)}\n` !== bytes.toString('utf8')) {
      fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_NONCANONICAL');
    }
    return request;
  } finally {
    bytes.fill(0);
  }
}

function readSecret(path, code) {
  const bytes = fixedPrivateFile(path, MAX_SECRET_BYTES + 1, code);
  try {
    const end = bytes.at(-1) === 0x0a ? bytes.byteLength - 1 : bytes.byteLength;
    const value = new TextDecoder('utf-8', { fatal: true })
      .decode(bytes.subarray(0, end));
    if (Buffer.byteLength(value, 'utf8') < 32 || Buffer.byteLength(value, 'utf8') > 512
      || /[\0\r\n]/u.test(value)) fail(code);
    return value;
  } catch (error) {
    if (error instanceof ProductionPlayerCanaryDeployAuthorityError) throw error;
    return fail(code);
  } finally {
    bytes.fill(0);
  }
}

/** Acquire fresh private authority from fixed owner-only state. */
export async function inspectProductionPlayerCanaryDeployAuthority({
  contract,
  repositoryRoot,
  now = new Date(),
} = {}) {
  if (
    contract === null || typeof contract !== 'object'
    || typeof contract.candidatePagesSourceCommit !== 'string'
    || !COMMIT.test(contract.candidatePagesSourceCommit)
    || typeof contract.productionPlayerCanaryReceiptDigest !== 'string'
    || !SHA256.test(contract.productionPlayerCanaryReceiptDigest)
    || typeof contract.productionPlayerCanarySourceCommit !== 'string'
    || !COMMIT.test(contract.productionPlayerCanarySourceCommit)
    || typeof contract.chainRootReceiptDigest !== 'string'
    || !SHA256.test(contract.chainRootReceiptDigest)
    || typeof contract.chainRootPagesSourceCommit !== 'string'
    || !COMMIT.test(contract.chainRootPagesSourceCommit)
    || typeof repositoryRoot !== 'string'
    || !isAbsolute(repositoryRoot) || resolve(repositoryRoot) !== repositoryRoot
    || !(now instanceof Date) || !Number.isSafeInteger(now.getTime())
  ) fail('PRODUCTION_PLAYER_CANARY_DEPLOY_AUTHORITY_INPUT_INVALID');

  const parent = ensureCanonicalProductionAdminStateDirectory();
  const stateDirectory = exactPrivateDirectory(
    join(parent, PRODUCTION_PLAYER_CANARY_DEPLOY_STATE_CHILD),
    parent,
    'PRODUCTION_PLAYER_CANARY_DEPLOY_STATE_DIRECTORY_INVALID',
  );
  const secretDirectory = exactPrivateDirectory(
    join(stateDirectory, PRODUCTION_PLAYER_CANARY_LAUNCH_SECRETS_CHILD),
    stateDirectory,
    'PRODUCTION_PLAYER_CANARY_DEPLOY_SECRET_DIRECTORY_INVALID',
  );
  const requestPath = join(
    stateDirectory,
    PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_BASENAME,
  );
  const request = readCanonicalRequest(requestPath);
  if (
    request.candidatePagesSourceCommit !== contract.candidatePagesSourceCommit
    || request.predecessorPagesSourceCommit
      !== contract.productionPlayerCanarySourceCommit
    || request.productionPlayerCanaryReceiptDigest
      !== contract.productionPlayerCanaryReceiptDigest
  ) fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_BINDING_MISMATCH');

  const adminSecret = readSecret(
    join(secretDirectory, ADMIN_SECRET_BASENAME),
    'PRODUCTION_PLAYER_CANARY_ADMIN_SECRET_INVALID',
  );
  const notificationOperatorSecret = readSecret(
    join(secretDirectory, NOTIFICATION_SECRET_BASENAME),
    'PRODUCTION_PLAYER_CANARY_NOTIFICATION_SECRET_INVALID',
  );
  const [{
    FOUNDER_ADMISSION_SOURCE_CONFIGURATION_DIGEST,
    FOUNDER_ADMISSION_TARGET_CONFIGURATION_DIGEST,
  }, { FARCASTER_PROFILE_POLICY_VERSION }] = await Promise.all([
    import('./hermes-admin.ts'),
    import('./profiles/farcaster-profile-policy.ts'),
  ]);
  const evidenceAuthority =
    await inspectProductionPlayerCanaryExpectedEvidenceAuthority({
      founderPlanDirectory: request.founderPlanDirectory,
      reviewedAdmissionPlanReference: request.reviewedAdmissionPlanReference,
      ownerApprovalDirectory: request.ownerApprovalDirectory,
      ownerApprovalReference: request.ownerApprovalReference,
      expectedSourceConfigurationDigest:
        FOUNDER_ADMISSION_SOURCE_CONFIGURATION_DIGEST,
      expectedTargetConfigurationDigest:
        FOUNDER_ADMISSION_TARGET_CONFIGURATION_DIGEST,
      expectedProfilePolicyVersion: FARCASTER_PROFILE_POLICY_VERSION,
      pagesSourceCommit: request.predecessorPagesSourceCommit,
      candidatePagesSourceCommit: request.candidatePagesSourceCommit,
      rootBinding: {
        notificationPagesLiveRootReceiptDigest:
          contract.chainRootReceiptDigest,
        notificationPagesLiveRootPagesSourceCommit:
          contract.chainRootPagesSourceCommit,
      },
      repositoryRoot,
      notificationBridgeUrl: DEFAULT_AUTH_BRIDGE_URL,
      notificationOperatorSecret,
      adminSecret,
      now,
    });
  const authority = inspectProductionPlayerCanaryActivationAuthority({
    binding: {
      productionPlayerCanaryReceiptDigest:
        contract.productionPlayerCanaryReceiptDigest,
      productionPlayerCanarySourceCommit:
        contract.productionPlayerCanarySourceCommit,
    },
    expectedCandidatePagesSourceCommit: contract.candidatePagesSourceCommit,
    expectedPredecessorPagesSourceCommit:
      contract.productionPlayerCanarySourceCommit,
    expectedProtectedTree: request.predecessorProtectedTree,
    expectedLiveReceiptDigest:
      evidenceAuthority.notificationPagesLiveReceiptDigest,
    expectedLivePagesSourceCommit:
      evidenceAuthority.notificationPagesLivePagesSourceCommit,
    expectedLiveRootReceiptDigest:
      evidenceAuthority.notificationPagesLiveRootReceiptDigest,
    expectedLiveRootPagesSourceCommit:
      evidenceAuthority.notificationPagesLiveRootPagesSourceCommit,
    expectedEvidenceAuthority: evidenceAuthority,
    now,
  });
  requireFreshProductionPlayerCanaryActivationAuthority(authority, {
    candidatePagesSourceCommit: contract.candidatePagesSourceCommit,
    predecessorPagesSourceCommit: contract.productionPlayerCanarySourceCommit,
    now: now.getTime(),
  });
  return Object.freeze({
    authority,
    authorityDigest: productionPlayerCanaryActivationAuthorityDigest(authority),
  });
}

export const productionPlayerCanaryDeployAuthorityTestSeams =
  process.env.NODE_ENV === 'test' && process.env.VITEST === 'true'
    ? Object.freeze({
      fixedPrivateFile,
      publishCanonicalRequest,
      readCanonicalRequest,
      requireInspectedActivationRequestReferences,
    })
    : undefined;

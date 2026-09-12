import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  projectPtrProductionStatus,
  ptrProductionImportReceiptDigest,
  type PtrProductionImportReceipt,
  type PtrProductionStatus,
} from './ptr-production-import-core';
import {
  readPtrOwnerProvisionAuthority,
  requestPtrProductionAdminToken,
  takePtrProductionAdminSecret,
  type PtrOwnerProvisionAuthority,
} from './ptr-production-admin-token';
import {
  createPtrOwnerProvisionTransport,
  type PtrOwnerProvisionTransport,
} from './ptr-production-transport';
import {
  derivePtrOwnerOpaqueProofDigest,
  executePtrOwnerProvision,
  ptrOwnerProvisionReceiptDigest,
  ptrSealedLiveReceiptDigest,
  takePtrProductionLaunchEntropy,
  takePtrProductionOwnerFid,
} from './ptr-production-release-receipts';
import {
  readPrivatePtrProductionImportReceipt,
  writePrivatePtrProductionReceipt,
} from './ptr-production-receipt-file';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');
const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;

export class PtrOwnerProvisionOperatorError extends Error {
  constructor(readonly code: string, readonly submitted = false) {
    super(code);
    this.name = 'PtrOwnerProvisionOperatorError';
  }
}

function fail(code: string, submitted = false): never {
  throw new PtrOwnerProvisionOperatorError(code, submitted);
}

type ParsedArguments = Readonly<{
  command: 'inspect' | 'provision';
  databaseIdentity: string;
  moduleSourceCommit: string;
  moduleSha256: string;
  atlasImportReceiptDigest: string;
  confirmationDigest?: string;
}>;

function parseArguments(values: readonly string[]): ParsedArguments {
  const command = values[0];
  if (command !== 'inspect' && command !== 'provision') {
    fail('PTR_OWNER_PROVISION_ARGUMENT_INVALID');
  }
  const patterns = Object.freeze({
    'database-identity': SHA256,
    'module-source-commit': COMMIT,
    'module-sha256': SHA256,
    'atlas-import-receipt-digest': SHA256,
    confirm: SHA256,
  });
  const parsed = new Map<string, string>();
  for (const value of values.slice(1)) {
    const match = /^--([a-z0-9-]+)=(.+)$/u.exec(value);
    if (
      match === null
      || !Object.hasOwn(patterns, match[1]!)
      || parsed.has(match[1]!)
      || !(patterns[match[1]! as keyof typeof patterns]).test(match[2]!)
    ) fail('PTR_OWNER_PROVISION_ARGUMENT_INVALID');
    parsed.set(match[1]!, match[2]!);
  }
  const required = [
    'database-identity', 'module-source-commit', 'module-sha256',
    'atlas-import-receipt-digest',
  ] as const;
  if (
    required.some(key => !parsed.has(key))
    || (command === 'inspect' && parsed.has('confirm'))
    || (command === 'provision' && !parsed.has('confirm'))
    || parsed.size !== required.length + (command === 'provision' ? 1 : 0)
  ) fail('PTR_OWNER_PROVISION_ARGUMENT_INVALID');
  return Object.freeze({
    command,
    databaseIdentity: parsed.get('database-identity')!,
    moduleSourceCommit: parsed.get('module-source-commit')!,
    moduleSha256: parsed.get('module-sha256')!,
    atlasImportReceiptDigest: parsed.get('atlas-import-receipt-digest')!,
    ...(command === 'provision'
      ? { confirmationDigest: parsed.get('confirm')! }
      : {}),
  });
}

function authenticateImportReceipt(
  value: unknown,
  arguments_: ParsedArguments,
): PtrProductionImportReceipt {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      fail('PTR_OWNER_PROVISION_IMPORT_ANCESTRY_INVALID');
    }
    const receipt = value as PtrProductionImportReceipt;
    const { importReceiptDigest, ...withoutDigest } = receipt;
    if (
      importReceiptDigest !== arguments_.atlasImportReceiptDigest
      || ptrProductionImportReceiptDigest(withoutDigest) !== importReceiptDigest
      || receipt.databaseIdentity !== arguments_.databaseIdentity
      || receipt.moduleSourceCommit !== arguments_.moduleSourceCommit
      || receipt.moduleSha256 !== arguments_.moduleSha256
    ) fail('PTR_OWNER_PROVISION_IMPORT_ANCESTRY_INVALID');
    return receipt;
  } catch (error) {
    if (error instanceof PtrOwnerProvisionOperatorError) throw error;
    return fail('PTR_OWNER_PROVISION_IMPORT_ANCESTRY_INVALID');
  }
}

function assertSealedOwnerlessStatus(
  value: unknown,
  receipt: PtrProductionImportReceipt,
): PtrProductionStatus {
  const status = projectPtrProductionStatus(value);
  if (
    !status.ready
    || status.state !== 'ready'
    || !status.importsExact
    || status.atlasId !== receipt.atlasId
    || status.sourceCommit !== receipt.atlasSourceCommit
    || status.publicReleaseId !== receipt.publicReleaseId
    || status.expectedReleaseSha256 !== receipt.expectedReleaseSha256
    || status.releaseHeaderSha256 !== receipt.releaseHeaderSha256
    || status.verificationDigest !== receipt.verificationDigest
    || status.importEpoch?.toString() !== receipt.importEpoch
    || status.ownerProvisioned
    || status.ownerEnabled
  ) fail('PTR_OWNER_PROVISION_ATLAS_STATUS_INVALID');
  return status;
}

function confirmationStatus(status: PtrProductionStatus) {
  return Object.freeze({
    atlasId: status.atlasId,
    sourceCommit: status.sourceCommit,
    publicReleaseId: status.publicReleaseId,
    expectedReleaseSha256: status.expectedReleaseSha256,
    releaseHeaderSha256: status.releaseHeaderSha256,
    verificationDigest: status.verificationDigest,
    importEpoch: status.importEpoch?.toString(),
    ownerProvisioned: status.ownerProvisioned,
    ownerEnabled: status.ownerEnabled,
  });
}

function confirmationDigestFromStatus(input: Readonly<{
  databaseIdentity: string;
  moduleSourceCommit: string;
  moduleSha256: string;
  atlasImportReceiptDigest: string;
  status: PtrProductionStatus;
}>): string {
  if (
    !SHA256.test(input.databaseIdentity)
    || !COMMIT.test(input.moduleSourceCommit)
    || !SHA256.test(input.moduleSha256)
    || !SHA256.test(input.atlasImportReceiptDigest)
  ) fail('PTR_OWNER_PROVISION_CONFIRMATION_INVALID');
  return createHash('sha256')
    .update('warpkeep.ptr.owner-provision-confirmation.v1\n')
    .update(`${JSON.stringify({
      schemaVersion: 1,
      profile: 'warpkeep.ptr.owner-provision-confirmation.v1',
      databaseIdentity: input.databaseIdentity,
      moduleSourceCommit: input.moduleSourceCommit,
      moduleSha256: input.moduleSha256,
      atlasImportReceiptDigest: input.atlasImportReceiptDigest,
      status: confirmationStatus(input.status),
    })}\n`)
    .digest('hex');
}

export function ptrOwnerProvisionConfirmationDigest(input: Readonly<{
  databaseIdentity: string;
  moduleSourceCommit: string;
  moduleSha256: string;
  atlasImportReceiptDigest: string;
  status: unknown;
}>): string {
  return confirmationDigestFromStatus({
    ...input,
    status: projectPtrProductionStatus(input.status),
  });
}

type Dependencies = Readonly<{
  readImportReceipt?: typeof readPrivatePtrProductionImportReceipt;
  inspectStatus?: () => Promise<unknown>;
  resolveOwnerAuthority?: (ownerFid: bigint) => Promise<PtrOwnerProvisionAuthority>;
  requestOwnerToken?: typeof requestPtrProductionAdminToken;
  validateOwnerToken?: typeof readPtrOwnerProvisionAuthority;
  deriveOwnerProof?: typeof derivePtrOwnerOpaqueProofDigest;
  createOwnerTransport?: typeof createPtrOwnerProvisionTransport;
  executeProvision?: typeof executePtrOwnerProvision;
  writeReceipt?: typeof writePrivatePtrProductionReceipt;
  nowSeconds?: () => number;
}>;

export async function executePtrOwnerProvisionOperator(input: Readonly<{
  arguments: readonly string[];
  environment: NodeJS.ProcessEnv;
  dependencies?: Dependencies;
}>): Promise<Readonly<Record<string, unknown>>> {
  const arguments_ = parseArguments(input.arguments);
  const receiptDirectory = input.environment.WARPKEEP_PTR_RECEIPT_DIRECTORY;
  if (typeof receiptDirectory !== 'string' || !isAbsolute(receiptDirectory)) {
    fail('PTR_OWNER_PROVISION_ENVIRONMENT_INVALID');
  }
  const dependencies = input.dependencies ?? {};
  const readImportReceipt = dependencies.readImportReceipt
    ?? readPrivatePtrProductionImportReceipt;
  const inspectStatus = dependencies.inspectStatus
    ?? (() => Promise.reject(new Error('ownerless status dependency unavailable')));
  const firstEvidence = readImportReceipt({
    directory: receiptDirectory,
    repositoryRoot: REPOSITORY_ROOT,
    expectedReceiptDigest: arguments_.atlasImportReceiptDigest,
  });
  const firstReceipt = authenticateImportReceipt(firstEvidence.receipt, arguments_);
  const initialStatus = assertSealedOwnerlessStatus(
    await inspectStatus(),
    firstReceipt,
  );
  const confirmationDigest = confirmationDigestFromStatus({
    databaseIdentity: arguments_.databaseIdentity,
    moduleSourceCommit: arguments_.moduleSourceCommit,
    moduleSha256: arguments_.moduleSha256,
    atlasImportReceiptDigest: firstReceipt.importReceiptDigest,
    status: initialStatus,
  });
  if (arguments_.command === 'inspect') {
    return Object.freeze({
      schemaVersion: 1,
      profile: 'warpkeep.ptr.owner-provision-inspection.v1',
      databaseIdentity: arguments_.databaseIdentity,
      moduleIdentity: 'warpkeep-ptr-owner-view-v1',
      moduleSourceCommit: arguments_.moduleSourceCommit,
      moduleSha256: arguments_.moduleSha256,
      atlasImportReceiptDigest: firstReceipt.importReceiptDigest,
      confirmationDigest,
      atlasReady: true,
      ownerProvisioned: false,
      ownerEnabled: false,
      privacySafe: true,
    });
  }
  if (arguments_.confirmationDigest !== confirmationDigest) {
    fail('PTR_OWNER_PROVISION_CONFIRMATION_INVALID');
  }

  let adminSecret = '';
  let ownerToken = '';
  let stagedOwnerToken = '';
  let launchEntropy = '';
  let transport: PtrOwnerProvisionTransport | undefined;
  let mutationStarted = false;
  try {
    const ownerFid = takePtrProductionOwnerFid(input.environment);
    const resolveOwnerAuthority = dependencies.resolveOwnerAuthority;
    if (resolveOwnerAuthority === undefined) {
      fail('PTR_OWNER_PROVISION_OWNER_RESOLVER_UNAVAILABLE');
    }
    const resolved = await resolveOwnerAuthority(ownerFid);
    if (
      resolved.ownerFid !== ownerFid
      || !Number.isSafeInteger(resolved.ownerAuthEpoch)
      || resolved.ownerAuthEpoch < 1
    ) fail('PTR_OWNER_PROVISION_OWNER_AUTHORITY_INVALID');
    adminSecret = takePtrProductionAdminSecret(input.environment);
    const requestOwnerToken = dependencies.requestOwnerToken
      ?? requestPtrProductionAdminToken;
    ownerToken = await requestOwnerToken(adminSecret);
    adminSecret = '';
    const validateOwnerToken = dependencies.validateOwnerToken
      ?? readPtrOwnerProvisionAuthority;
    const nowSeconds = (dependencies.nowSeconds ?? (() => Math.floor(Date.now() / 1_000)))();
    const tokenAuthority = validateOwnerToken(ownerToken, ownerFid, nowSeconds);
    if (
      tokenAuthority.ownerFid !== resolved.ownerFid
      || tokenAuthority.ownerAuthEpoch !== resolved.ownerAuthEpoch
    ) fail('PTR_OWNER_PROVISION_OWNER_AUTHORITY_INVALID');
    const secondEvidence = readImportReceipt({
      directory: receiptDirectory,
      repositoryRoot: REPOSITORY_ROOT,
      expectedReceiptDigest: arguments_.atlasImportReceiptDigest,
    });
    const secondReceipt = authenticateImportReceipt(secondEvidence.receipt, arguments_);
    if (JSON.stringify(secondReceipt) !== JSON.stringify(firstReceipt)) {
      fail('PTR_OWNER_PROVISION_IMPORT_ANCESTRY_INVALID');
    }
    launchEntropy = takePtrProductionLaunchEntropy(input.environment);
    const deriveOwnerProof = dependencies.deriveOwnerProof
      ?? derivePtrOwnerOpaqueProofDigest;
    const ownerOpaqueProofDigest = deriveOwnerProof({
      launchEntropy,
      ownerFid,
      ownerAuthEpoch: resolved.ownerAuthEpoch,
      databaseIdentity: arguments_.databaseIdentity,
      moduleSourceCommit: arguments_.moduleSourceCommit,
    });
    launchEntropy = '';
    const createOwnerTransport = dependencies.createOwnerTransport
      ?? createPtrOwnerProvisionTransport;
    stagedOwnerToken = ownerToken;
    transport = createOwnerTransport({
      databaseIdentity: arguments_.databaseIdentity,
      adminSecret: 'consumed-by-prevalidated-token'.padEnd(32, 'x'),
      disallowedDatabaseIdentities: [],
      requestToken: async () => {
        const result = stagedOwnerToken;
        stagedOwnerToken = '';
        return result;
      },
      nowSeconds: () => nowSeconds,
    });
    ownerToken = '';
    const executeProvision = dependencies.executeProvision
      ?? executePtrOwnerProvision;
    const provision = await executeProvision({
      databaseIdentity: arguments_.databaseIdentity,
      moduleSourceCommit: arguments_.moduleSourceCommit,
      moduleSha256: arguments_.moduleSha256,
      importReceipt: secondReceipt,
      inspectStatus,
      ownerFid,
      ownerAuthEpoch: resolved.ownerAuthEpoch,
      ownerOpaqueProofDigest,
      transport,
      assertCanStartWrite: () => { mutationStarted = true; },
    });
    const { provisionReceiptDigest, ...ownerWithoutDigest }
      = provision.ownerProvisionReceipt;
    if (
      provision.ownerProvisionReceipt.databaseIdentity
        !== arguments_.databaseIdentity
      || provision.ownerProvisionReceipt.moduleIdentity
        !== 'warpkeep-ptr-owner-view-v1'
      || provision.ownerProvisionReceipt.moduleSourceCommit
        !== arguments_.moduleSourceCommit
      || provision.ownerProvisionReceipt.atlasImportReceiptDigest
        !== secondReceipt.importReceiptDigest
      || provision.ownerProvisionReceipt.ownerOpaqueProofDigest
        !== ownerOpaqueProofDigest
      || ptrOwnerProvisionReceiptDigest(ownerWithoutDigest)
        !== provisionReceiptDigest
      || provision.sealedLiveReceipt.databaseIdentity
        !== arguments_.databaseIdentity
      || provision.sealedLiveReceipt.moduleIdentity
        !== 'warpkeep-ptr-owner-view-v1'
      || provision.sealedLiveReceipt.moduleSourceCommit
        !== arguments_.moduleSourceCommit
      || provision.sealedLiveReceipt.moduleSha256
        !== arguments_.moduleSha256
      || provision.sealedLiveReceipt.atlasSourceCommit
        !== secondReceipt.atlasSourceCommit
      || provision.sealedLiveReceipt.atlasId !== secondReceipt.atlasId
      || provision.sealedLiveReceipt.publicReleaseId
        !== secondReceipt.publicReleaseId
      || provision.sealedLiveReceipt.releaseManifestSha256
        !== secondReceipt.releaseManifestSha256
      || provision.sealedLiveReceipt.expectedReleaseSha256
        !== secondReceipt.expectedReleaseSha256
      || provision.sealedLiveReceipt.releaseHeaderSha256
        !== secondReceipt.releaseHeaderSha256
      || provision.sealedLiveReceipt.verificationDigest
        !== secondReceipt.verificationDigest
      || provision.sealedLiveReceipt.ownerOpaqueProofDigest
        !== ownerOpaqueProofDigest
      || provision.sealedLiveReceipt.ownerOpaqueProofDigest
        !== provision.ownerProvisionReceipt.ownerOpaqueProofDigest
      || provision.sealedLiveReceipt.ownerProvisionReceiptDigest
        !== provisionReceiptDigest
      || ptrSealedLiveReceiptDigest(provision.sealedLiveReceipt)
        !== provision.sealedLiveReceiptDigest
    ) fail('PTR_OWNER_PROVISION_RECEIPT_ANCESTRY_INVALID', true);
    const writeReceipt = dependencies.writeReceipt
      ?? writePrivatePtrProductionReceipt;
    writeReceipt({
      directory: receiptDirectory,
      repositoryRoot: REPOSITORY_ROOT,
      kind: 'owner-provision',
      receipt: provision.ownerProvisionReceipt,
    });
    writeReceipt({
      directory: receiptDirectory,
      repositoryRoot: REPOSITORY_ROOT,
      kind: 'sealed-live',
      receipt: provision.sealedLiveReceipt,
    });
    return Object.freeze({
      ptrOwnerProvisionReceipt: provision.ownerProvisionReceipt,
      ptrSealedLiveReceipt: provision.sealedLiveReceipt,
      ptrSealedLiveReceiptDigest: provision.sealedLiveReceiptDigest,
      privacySafe: true,
      activationWrites: 'none',
      publicRootWrites: 'none',
    });
  } catch (error) {
    if (error instanceof PtrOwnerProvisionOperatorError) throw error;
    fail(
      mutationStarted
        ? 'PTR_OWNER_PROVISION_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED'
        : 'PTR_OWNER_PROVISION_FAILED',
      mutationStarted,
    );
  } finally {
    delete input.environment.WARPKEEP_ADMIN_TOKEN_SECRET;
    delete input.environment.WARPKEEP_PLAYER_CANARY_OWNER_FID;
    delete input.environment.WARPKEEP_PTR_LAUNCH_ENTROPY;
    adminSecret = '';
    ownerToken = '';
    stagedOwnerToken = '';
    launchEntropy = '';
    try { await transport?.close(); } catch {
      fail(
        mutationStarted
          ? 'PTR_OWNER_PROVISION_CLEANUP_FAILED_MANUAL_RECONCILIATION_REQUIRED'
          : 'PTR_OWNER_PROVISION_CLEANUP_FAILED',
        mutationStarted,
      );
    }
  }
  return fail('PTR_OWNER_PROVISION_FAILED');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await executePtrOwnerProvisionOperator({
      arguments: process.argv.slice(2),
      environment: process.env,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const code = error instanceof PtrOwnerProvisionOperatorError
      ? error.code
      : 'PTR_OWNER_PROVISION_FAILED';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}

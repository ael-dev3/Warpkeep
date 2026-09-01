import { createHash, createHmac, createSecretKey } from 'node:crypto';

import {
  projectPtrProductionStatus,
  ptrProductionImportReceiptDigest,
  type PtrProductionImportReceipt,
  type PtrProductionImportTransport,
  type PtrProductionStatus,
} from './ptr-production-import-core';

const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const PUBLIC_RELEASE_ID = /^GRR-[A-Z2-7]{26}$/u;
const MAXIMUM_SAFE_FID = BigInt(Number.MAX_SAFE_INTEGER);
const MINIMUM_SECRET_BYTES = 32;
const MAXIMUM_SECRET_BYTES = 512;
const OWNER_PROVISION_RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'outcome',
  'databaseIdentity',
  'databaseAlias',
  'moduleIdentity',
  'moduleSourceCommit',
  'atlasImportReceiptDigest',
  'ownerOpaqueProofDigest',
  'ownerAnchorRows',
  'ownerProvisioned',
  'ownerEnabled',
  'zeroPopulationBoundary',
] as const);
const SEALED_LIVE_RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'uri',
  'databaseIdentity',
  'databaseAlias',
  'moduleIdentity',
  'moduleSourceCommit',
  'moduleSha256',
  'releaseVersion',
  'realmId',
  'atlasSourceCommit',
  'atlasId',
  'publicReleaseId',
  'releaseManifestSha256',
  'expectedReleaseSha256',
  'releaseHeaderSha256',
  'verificationDigest',
  'atlasState',
  'atlasFinalized',
  'atlasImportsExact',
  'atlasWritesClosedByFinalization',
  'allowedFids',
  'accessRequests',
  'playersV1',
  'playersV2',
  'ownershipBindings',
  'castles',
  'realmProfiles',
  'termsAcceptances',
  'markAccounts',
  'resourceAccounts',
  'claimRows',
  'occupancyRows',
  'activationRows',
  'publicAtlasRows',
  'publicRegionRows',
  'workerSystemRows',
  'atlasImportMutationsCompiled',
  'atlasActivationMutationsCompiled',
  'ownerProvisionReceiptDigest',
  'ownerOpaqueProofDigest',
  'ownerAnchorRows',
  'ownerProvisioned',
  'ownerEnabled',
  'admissionsOpen',
  'accessRequestsOpen',
  'admissionSurfacePresent',
  'accessRequestSurfacePresent',
  'playerPresentationEnabled',
] as const);
const ZERO_LIVE_FIELDS = Object.freeze([
  'allowedFids', 'accessRequests', 'playersV1', 'playersV2',
  'ownershipBindings', 'castles', 'realmProfiles', 'termsAcceptances',
  'markAccounts', 'resourceAccounts', 'claimRows', 'occupancyRows',
  'activationRows', 'publicAtlasRows', 'publicRegionRows', 'workerSystemRows',
] as const);

export class PtrProductionReleaseReceiptError extends Error {
  constructor(readonly code: string, readonly submitted = false) {
    super(code);
    this.name = 'PtrProductionReleaseReceiptError';
  }
}

function fail(code: string, submitted = false): never {
  throw new PtrProductionReleaseReceiptError(code, submitted);
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  code: string,
): Readonly<Record<string, unknown>> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).length !== keys.length
    || Reflect.ownKeys(value).some((key, index) => key !== keys[index])
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(
      descriptor => !('value' in descriptor) || descriptor.enumerable !== true,
    )
  ) fail(code);
  return value as Readonly<Record<string, unknown>>;
}

function receiptDigest(
  domain: string,
  receipt: Readonly<Record<string, unknown>>,
): string {
  return createHash('sha256')
    .update(`${domain}\n`)
    .update(`${JSON.stringify(receipt)}\n`)
    .digest('hex');
}

export function takePtrProductionOwnerFid(
  environment: NodeJS.ProcessEnv,
): bigint {
  const value = environment.WARPKEEP_PLAYER_CANARY_OWNER_FID;
  delete environment.WARPKEEP_PLAYER_CANARY_OWNER_FID;
  if (
    typeof value !== 'string'
    || !/^[1-9][0-9]{0,15}$/u.test(value)
    || BigInt(value) > MAXIMUM_SAFE_FID
  ) fail('PTR_PRODUCTION_OWNER_FID_INVALID');
  return BigInt(value);
}

export function takePtrProductionLaunchEntropy(
  environment: NodeJS.ProcessEnv,
): string {
  const value = environment.WARPKEEP_PTR_LAUNCH_ENTROPY;
  delete environment.WARPKEEP_PTR_LAUNCH_ENTROPY;
  const length = typeof value === 'string'
    ? Buffer.byteLength(value, 'utf8')
    : 0;
  if (
    typeof value !== 'string'
    || length < MINIMUM_SECRET_BYTES
    || length > MAXIMUM_SECRET_BYTES
    || /[\u0000-\u0020\u007f]/u.test(value)
  ) fail('PTR_PRODUCTION_LAUNCH_ENTROPY_INVALID');
  return value;
}

export function derivePtrOwnerOpaqueProofDigest(input: Readonly<{
  launchEntropy: string;
  ownerFid: bigint;
  ownerAuthEpoch: number;
  databaseIdentity: string;
  moduleSourceCommit: string;
}>): string {
  const secretLength = typeof input.launchEntropy === 'string'
    ? Buffer.byteLength(input.launchEntropy, 'utf8')
    : 0;
  if (
    secretLength < MINIMUM_SECRET_BYTES
    || secretLength > MAXIMUM_SECRET_BYTES
    || /[\u0000-\u0020\u007f]/u.test(input.launchEntropy)
    || typeof input.ownerFid !== 'bigint'
    || input.ownerFid < 1n
    || input.ownerFid > MAXIMUM_SAFE_FID
    || !Number.isSafeInteger(input.ownerAuthEpoch)
    || input.ownerAuthEpoch < 1
    || input.ownerAuthEpoch > 0xffff_ffff
    || !SHA256.test(input.databaseIdentity)
    || !COMMIT.test(input.moduleSourceCommit)
  ) fail('PTR_PRODUCTION_OWNER_PROOF_INPUT_INVALID');
  const secretBytes = Buffer.from(input.launchEntropy, 'utf8');
  const ownerBytes = Buffer.alloc(8);
  const ownerAuthEpochBytes = Buffer.alloc(4);
  try {
    ownerBytes.writeBigUInt64BE(input.ownerFid);
    ownerAuthEpochBytes.writeUInt32BE(input.ownerAuthEpoch);
    const key = createSecretKey(secretBytes);
    return createHmac('sha256', key)
      .update('warpkeep.ptr.owner-opaque-proof.v1\n')
      .update('databaseIdentity\0')
      .update(input.databaseIdentity)
      .update('\nmoduleSourceCommit\0')
      .update(input.moduleSourceCommit)
      .update('\nmoduleIdentity\0warpkeep-ptr-owner-view-v1')
      .update('\nownerFidU64BE\0')
      .update(ownerBytes)
      .update('\nauthEpochU32BE\0')
      .update(ownerAuthEpochBytes)
      .update('\n')
      .digest('hex');
  } finally {
    ownerBytes.fill(0);
    ownerAuthEpochBytes.fill(0);
    secretBytes.fill(0);
  }
}

export function ptrOwnerProvisionReceiptDigest(value: unknown): string {
  const receipt = exactRecord(
    value,
    OWNER_PROVISION_RECEIPT_KEYS,
    'PTR_PRODUCTION_OWNER_RECEIPT_INVALID',
  );
  if (
    receipt.schemaVersion !== 1
    || receipt.profile !== 'warpkeep-ptr-owner-provision-v1'
    || receipt.outcome !== 'verified'
    || typeof receipt.databaseIdentity !== 'string'
    || !SHA256.test(receipt.databaseIdentity)
    || receipt.databaseAlias !== 'warpkeep-ptr'
    || receipt.moduleIdentity !== 'warpkeep-ptr-owner-view-v1'
    || typeof receipt.moduleSourceCommit !== 'string'
    || !COMMIT.test(receipt.moduleSourceCommit)
    || typeof receipt.ownerOpaqueProofDigest !== 'string'
    || !SHA256.test(receipt.ownerOpaqueProofDigest)
    || /^0{64}$/u.test(receipt.ownerOpaqueProofDigest)
    || typeof receipt.atlasImportReceiptDigest !== 'string'
    || !SHA256.test(receipt.atlasImportReceiptDigest)
    || receipt.ownerAnchorRows !== 1
    || receipt.ownerProvisioned !== true
    || receipt.ownerEnabled !== true
    || receipt.zeroPopulationBoundary !== true
  ) fail('PTR_PRODUCTION_OWNER_RECEIPT_INVALID');
  return receiptDigest('warpkeep.ptr.owner-provision-receipt.v1', receipt);
}

export function ptrSealedLiveReceiptDigest(value: unknown): string {
  const receipt = exactRecord(
    value,
    SEALED_LIVE_RECEIPT_KEYS,
    'PTR_PRODUCTION_SEALED_LIVE_RECEIPT_INVALID',
  );
  if (
    receipt.schemaVersion !== 1
    || receipt.profile !== 'warpkeep-ptr-sealed-live-v1'
    || receipt.uri !== 'https://maincloud.spacetimedb.com'
    || typeof receipt.databaseIdentity !== 'string'
    || !SHA256.test(receipt.databaseIdentity)
    || receipt.databaseAlias !== 'warpkeep-ptr'
    || receipt.moduleIdentity !== 'warpkeep-ptr-owner-view-v1'
    || typeof receipt.moduleSourceCommit !== 'string'
    || !COMMIT.test(receipt.moduleSourceCommit)
    || typeof receipt.moduleSha256 !== 'string'
    || !SHA256.test(receipt.moduleSha256)
    || receipt.releaseVersion !== '0.4.0-ptr.1'
    || receipt.realmId !== 'PTR'
    || typeof receipt.atlasSourceCommit !== 'string'
    || !COMMIT.test(receipt.atlasSourceCommit)
    || receipt.atlasId !== 'PTR_GREATER_REALM'
    || typeof receipt.publicReleaseId !== 'string'
    || !PUBLIC_RELEASE_ID.test(receipt.publicReleaseId)
    || typeof receipt.releaseManifestSha256 !== 'string'
    || !SHA256.test(receipt.releaseManifestSha256)
    || typeof receipt.expectedReleaseSha256 !== 'string'
    || !SHA256.test(receipt.expectedReleaseSha256)
    || typeof receipt.releaseHeaderSha256 !== 'string'
    || !SHA256.test(receipt.releaseHeaderSha256)
    || typeof receipt.verificationDigest !== 'string'
    || !SHA256.test(receipt.verificationDigest)
    || receipt.atlasState !== 'ready'
    || receipt.atlasFinalized !== true
    || receipt.atlasImportsExact !== true
    || receipt.atlasWritesClosedByFinalization !== true
    || ZERO_LIVE_FIELDS.some(field => (
      receipt[field] !== 0 || Object.is(receipt[field], -0)
    ))
    || receipt.atlasImportMutationsCompiled !== true
    || receipt.atlasActivationMutationsCompiled !== false
    || typeof receipt.ownerOpaqueProofDigest !== 'string'
    || !SHA256.test(receipt.ownerOpaqueProofDigest)
    || /^0{64}$/u.test(receipt.ownerOpaqueProofDigest)
    || typeof receipt.ownerProvisionReceiptDigest !== 'string'
    || !SHA256.test(receipt.ownerProvisionReceiptDigest)
    || receipt.ownerAnchorRows !== 1
    || receipt.ownerProvisioned !== true
    || receipt.ownerEnabled !== true
    || receipt.admissionsOpen !== false
    || receipt.accessRequestsOpen !== false
    || receipt.admissionSurfacePresent !== false
    || receipt.accessRequestSurfacePresent !== false
    || receipt.playerPresentationEnabled !== true
  ) fail('PTR_PRODUCTION_SEALED_LIVE_RECEIPT_INVALID');
  return receiptDigest('warpkeep.ptr.sealed-live-receipt.v1', receipt);
}

function exactEmptyAtlas(status: PtrProductionStatus): boolean {
  return !status.present
    && status.state === 'absent'
    && !status.ready
    && !status.importsExact
    && status.verificationPhase === 'components'
    && status.verificationCursor === 0n
    && status.expectedRegionCount === 0
    && status.expectedComponentCount === 0
    && status.expectedChunkCount === 0
    && status.expectedCellCount === 0
    && status.expectedSlotCount === 0
    && status.expectedResourceNodeCount === 0
    && status.verifiedComponentCount === 0
    && status.verifiedChunkCount === 0
    && status.verifiedCellCount === 0
    && status.verifiedSlotCount === 0
    && status.verifiedResourceNodeCount === 0
    && status.componentExpectedCellCount === 0
    && status.componentExpectedSlotCount === 0
    && status.componentExpectedResourceNodeCount === 0
    && status.importedPassableCellCount === 0
    && status.regionManifestRows === 0
    && status.componentRows === 0n
    && status.chunkRows === 0n
    && status.cellRows === 0n
    && status.slotRows === 0n
    && status.resourceRows === 0n
    && !status.ownerProvisioned
    && !status.ownerEnabled;
}

export function verifyPtrFreshPublishStatus(value: unknown): Readonly<{
  freshDatabase: true;
  admissionSurfacePresent: false;
  accessRequestSurfacePresent: false;
  zeroPopulationBoundary: true;
  atlasImportMutationsCompiled: true;
  atlasActivationMutationsCompiled: false;
  ownerProvisioned: false;
}> {
  const status = projectPtrProductionStatus(value);
  if (!exactEmptyAtlas(status)) fail('PTR_PRODUCTION_FRESH_STATUS_INVALID');
  return Object.freeze({
    freshDatabase: true,
    admissionSurfacePresent: false,
    accessRequestSurfacePresent: false,
    zeroPopulationBoundary: true,
    atlasImportMutationsCompiled: true,
    atlasActivationMutationsCompiled: false,
    ownerProvisioned: false,
  });
}

function verifyImportReceipt(
  receipt: PtrProductionImportReceipt,
  input: Readonly<{
    databaseIdentity: string;
    moduleSourceCommit: string;
    moduleSha256: string;
  }>,
): void {
  const { importReceiptDigest, ...withoutDigest } = receipt;
  if (
    ptrProductionImportReceiptDigest(withoutDigest) !== importReceiptDigest
    || receipt.databaseIdentity !== input.databaseIdentity
    || receipt.moduleSourceCommit !== input.moduleSourceCommit
    || receipt.moduleSha256 !== input.moduleSha256
  ) fail('PTR_PRODUCTION_OWNER_IMPORT_BINDING_INVALID');
}

function verifyReadyStatus(
  status: PtrProductionStatus,
  receipt: PtrProductionImportReceipt,
): void {
  if (
    !status.present
    || !status.ready
    || status.state !== 'ready'
    || status.atlasId !== receipt.atlasId
    || status.publicReleaseId !== receipt.publicReleaseId
    || status.sourceCommit !== receipt.atlasSourceCommit
    || status.expectedReleaseSha256 !== receipt.expectedReleaseSha256
    || status.releaseHeaderSha256 !== receipt.releaseHeaderSha256
    || status.verificationDigest !== receipt.verificationDigest
    || status.importEpoch?.toString() !== receipt.importEpoch
    || !status.importsExact
    || !status.importMutationsCompiled
    || status.activationMutationsCompiled
    || status.claimRows !== 0n
    || status.occupancyRows !== 0n
    || status.activationRows !== 0n
    || status.publicAtlasRows !== 0n
    || status.publicRegionRows !== 0n
    || status.workerSystemRows !== 0n
  ) fail('PTR_PRODUCTION_OWNER_ATLAS_NOT_SEALED');
}

export type PtrOwnerProvisionReceipt = Readonly<{
  schemaVersion: 1;
  profile: 'warpkeep-ptr-owner-provision-v1';
  outcome: 'verified';
  databaseIdentity: string;
  databaseAlias: 'warpkeep-ptr';
  moduleIdentity: 'warpkeep-ptr-owner-view-v1';
  moduleSourceCommit: string;
  atlasImportReceiptDigest: string;
  ownerOpaqueProofDigest: string;
  ownerAnchorRows: 1;
  ownerProvisioned: true;
  ownerEnabled: true;
  zeroPopulationBoundary: true;
  provisionReceiptDigest: string;
}>;

export type PtrSealedLiveReceipt = Readonly<{
  [key: string]: unknown;
}>;

export type PtrOwnerProvisionTransport = Readonly<{
  provisionOwner: (
    expectedOwnerFid: bigint,
    assertCanStartWrite: () => void,
  ) => Promise<Readonly<{ ownerFid: bigint; ownerAuthEpoch: number }>>;
}>;

export async function executePtrOwnerProvision(input: Readonly<{
  databaseIdentity: string;
  moduleSourceCommit: string;
  moduleSha256: string;
  importReceipt: PtrProductionImportReceipt;
  inspectStatus: () => Promise<unknown>;
  ownerFid: bigint;
  ownerAuthEpoch: number;
  ownerOpaqueProofDigest: string;
  transport: PtrOwnerProvisionTransport;
  assertCanStartWrite: () => void;
}>): Promise<Readonly<{
  ownerProvisionReceipt: PtrOwnerProvisionReceipt;
  sealedLiveReceipt: PtrSealedLiveReceipt;
  sealedLiveReceiptDigest: string;
}>> {
  if (
    !SHA256.test(input.databaseIdentity)
    || !COMMIT.test(input.moduleSourceCommit)
    || !SHA256.test(input.moduleSha256)
    || typeof input.ownerFid !== 'bigint'
    || input.ownerFid < 1n
    || input.ownerFid > MAXIMUM_SAFE_FID
    || !Number.isSafeInteger(input.ownerAuthEpoch)
    || input.ownerAuthEpoch < 1
    || input.ownerAuthEpoch > 0xffff_ffff
    || !SHA256.test(input.ownerOpaqueProofDigest)
    || /^0{64}$/u.test(input.ownerOpaqueProofDigest)
  ) fail('PTR_PRODUCTION_OWNER_INPUT_INVALID');
  verifyImportReceipt(input.importReceipt, input);
  const before = projectPtrProductionStatus(await input.inspectStatus());
  verifyReadyStatus(before, input.importReceipt);
  if (before.ownerProvisioned || before.ownerEnabled) {
    fail('PTR_PRODUCTION_OWNER_ALREADY_PROVISIONED');
  }
  let submissionFailed = false;
  let ownerAuthority: Readonly<{
    ownerFid: bigint;
    ownerAuthEpoch: number;
  }> | undefined;
  try {
    ownerAuthority = await input.transport.provisionOwner(
      input.ownerFid,
      input.assertCanStartWrite,
    );
  } catch {
    submissionFailed = true;
  }
  let after: PtrProductionStatus;
  try {
    after = projectPtrProductionStatus(await input.inspectStatus());
  } catch {
    return fail(
      'PTR_PRODUCTION_OWNER_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
      true,
    );
  }
  verifyReadyStatus(after, input.importReceipt);
  if (
    !after.ownerProvisioned
    || !after.ownerEnabled
    || ownerAuthority === undefined
    || ownerAuthority.ownerFid !== input.ownerFid
    || ownerAuthority.ownerAuthEpoch !== input.ownerAuthEpoch
  ) {
    return fail(
      submissionFailed
        ? 'PTR_PRODUCTION_OWNER_REJECTED_OR_UNCOMMITTED'
        : 'PTR_PRODUCTION_OWNER_POSTCONDITION_FAILED',
      true,
    );
  }
  const ownerReceipt = Object.freeze({
    schemaVersion: 1 as const,
    profile: 'warpkeep-ptr-owner-provision-v1' as const,
    outcome: 'verified' as const,
    databaseIdentity: input.databaseIdentity,
    databaseAlias: 'warpkeep-ptr' as const,
    moduleIdentity: 'warpkeep-ptr-owner-view-v1' as const,
    moduleSourceCommit: input.moduleSourceCommit,
    atlasImportReceiptDigest: input.importReceipt.importReceiptDigest,
    ownerOpaqueProofDigest: input.ownerOpaqueProofDigest,
    ownerAnchorRows: 1 as const,
    ownerProvisioned: true as const,
    ownerEnabled: true as const,
    zeroPopulationBoundary: true as const,
  });
  const ownerProvisionReceipt = Object.freeze({
    ...ownerReceipt,
    provisionReceiptDigest: ptrOwnerProvisionReceiptDigest(ownerReceipt),
  });
  const sealedLiveReceipt = Object.freeze({
    schemaVersion: 1,
    profile: 'warpkeep-ptr-sealed-live-v1',
    uri: 'https://maincloud.spacetimedb.com',
    databaseIdentity: input.databaseIdentity,
    databaseAlias: 'warpkeep-ptr',
    moduleIdentity: 'warpkeep-ptr-owner-view-v1',
    moduleSourceCommit: input.moduleSourceCommit,
    moduleSha256: input.moduleSha256,
    releaseVersion: '0.4.0-ptr.1',
    realmId: 'PTR',
    atlasSourceCommit: input.importReceipt.atlasSourceCommit,
    atlasId: input.importReceipt.atlasId,
    publicReleaseId: input.importReceipt.publicReleaseId,
    releaseManifestSha256: input.importReceipt.releaseManifestSha256,
    expectedReleaseSha256: input.importReceipt.expectedReleaseSha256,
    releaseHeaderSha256: input.importReceipt.releaseHeaderSha256,
    verificationDigest: input.importReceipt.verificationDigest,
    atlasState: 'ready',
    atlasFinalized: true,
    atlasImportsExact: true,
    atlasWritesClosedByFinalization: true,
    allowedFids: 0,
    accessRequests: 0,
    playersV1: 0,
    playersV2: 0,
    ownershipBindings: 0,
    castles: 0,
    realmProfiles: 0,
    termsAcceptances: 0,
    markAccounts: 0,
    resourceAccounts: 0,
    claimRows: 0,
    occupancyRows: 0,
    activationRows: 0,
    publicAtlasRows: 0,
    publicRegionRows: 0,
    workerSystemRows: 0,
    atlasImportMutationsCompiled: true,
    atlasActivationMutationsCompiled: false,
    ownerProvisionReceiptDigest: ownerProvisionReceipt.provisionReceiptDigest,
    ownerOpaqueProofDigest: input.ownerOpaqueProofDigest,
    ownerAnchorRows: 1,
    ownerProvisioned: true,
    ownerEnabled: true,
    admissionsOpen: false,
    accessRequestsOpen: false,
    admissionSurfacePresent: false,
    accessRequestSurfacePresent: false,
    playerPresentationEnabled: true,
  });
  return Object.freeze({
    ownerProvisionReceipt,
    sealedLiveReceipt,
    sealedLiveReceiptDigest: ptrSealedLiveReceiptDigest(sealedLiveReceipt),
  });
}

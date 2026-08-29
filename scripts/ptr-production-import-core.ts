import { createHash } from 'node:crypto';

import {
  verifyPtrGreaterRealmRuntimeReleaseArtifacts,
  type GreaterRealmRuntimeReleaseArtifacts,
} from './atlas/greater-realm-runtime-release';
import {
  greaterRealmProductionImportEngine,
  type GreaterRealmProductionImportStatus,
} from './greater-realm-production-import-core';
import type { GreaterRealmProductionCutoverStatus } from './greater-realm-production-relocation-core';

export const PTR_PRODUCTION_IMPORT_TARGET = Object.freeze({
  uri: 'https://maincloud.spacetimedb.com',
  bridge: 'https://auth.warpkeep.com',
  databaseAlias: 'warpkeep-ptr',
  moduleIdentity: 'warpkeep-ptr-owner-view-v1',
  releaseVersion: '0.4.0-ptr.1',
  atlasId: 'PTR_GREATER_REALM',
  genesis001DatabaseIdentity:
    'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
  deleteData: 'never',
} as const);

export const PTR_PRODUCTION_IMPORT_REDUCERS = Object.freeze({
  stage: 'admin_stage_greater_realm_release_v1',
  components: 'admin_import_greater_realm_components_v1',
  regions: 'admin_import_greater_realm_regions_v1',
  chunk: 'admin_import_greater_realm_chunk_v1',
  beginVerification: 'admin_begin_greater_realm_verification_v1',
  verifyBatch: 'admin_verify_greater_realm_batch_v1',
  finalize: 'admin_finalize_greater_realm_release_v1',
} as const);

const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const PUBLIC_RELEASE_ID = /^GRR-[A-Z2-7]{26}$/u;
const PUBLIC_APPROVAL_ID = /^GRA-[A-Z2-7]{26}$/u;
const U64_MAXIMUM = (1n << 64n) - 1n;
const MAXIMUM_OPERATIONS = 4_096;
const STATUS_KEYS = Object.freeze([
  'present',
  'atlasId',
  'publicReleaseId',
  'publicApprovalReceiptId',
  'sourceCommit',
  'expectedReleaseSha256',
  'releaseHeaderSha256',
  'state',
  'importEpoch',
  'verificationPhase',
  'verificationCursor',
  'verificationDigest',
  'expectedRegionCount',
  'expectedComponentCount',
  'expectedChunkCount',
  'expectedCellCount',
  'expectedSlotCount',
  'expectedResourceNodeCount',
  'verifiedComponentCount',
  'verifiedChunkCount',
  'verifiedCellCount',
  'verifiedSlotCount',
  'verifiedResourceNodeCount',
  'componentExpectedCellCount',
  'componentExpectedSlotCount',
  'componentExpectedResourceNodeCount',
  'importedPassableCellCount',
  'regionManifestRows',
  'componentRows',
  'chunkRows',
  'cellRows',
  'slotRows',
  'resourceRows',
  'claimRows',
  'occupancyRows',
  'activationRows',
  'publicAtlasRows',
  'publicRegionRows',
  'workerSystemRows',
  'importsExact',
  'ready',
  'importMutationsCompiled',
  'activationMutationsCompiled',
  'ownerProvisioned',
  'ownerEnabled',
  'ownerFid',
  'ownerAuthEpoch',
] as const);
const OPTIONAL_STRINGS = Object.freeze([
  'atlasId', 'publicReleaseId', 'publicApprovalReceiptId', 'sourceCommit',
  'expectedReleaseSha256', 'releaseHeaderSha256',
] as const);
const U32_FIELDS = Object.freeze([
  'expectedRegionCount', 'expectedComponentCount', 'expectedChunkCount',
  'expectedCellCount', 'expectedSlotCount', 'expectedResourceNodeCount',
  'verifiedComponentCount', 'verifiedChunkCount', 'verifiedCellCount',
  'verifiedSlotCount', 'verifiedResourceNodeCount',
  'componentExpectedCellCount', 'componentExpectedSlotCount',
  'componentExpectedResourceNodeCount', 'importedPassableCellCount',
  'regionManifestRows',
] as const);
const U64_FIELDS = Object.freeze([
  'verificationCursor', 'componentRows', 'chunkRows', 'cellRows', 'slotRows',
  'resourceRows', 'claimRows', 'occupancyRows', 'activationRows',
  'publicAtlasRows', 'publicRegionRows', 'workerSystemRows',
] as const);
const ZERO_BOUNDARY_FIELDS = Object.freeze([
  'claimRows', 'occupancyRows', 'activationRows', 'publicAtlasRows',
  'publicRegionRows', 'workerSystemRows',
] as const);
const STATES = Object.freeze(['absent', 'importing', 'verifying', 'ready'] as const);
const PHASES = Object.freeze([
  'components', 'chunks', 'cells', 'component-slots', 'slots',
  'component-resources', 'resources', 'component-finalize', 'complete',
] as const);
const IMPORT_RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'outcome',
  'databaseIdentity',
  'moduleIdentity',
  'moduleSourceCommit',
  'moduleSha256',
  'moduleTreeId',
  'dependencyClosureDigest',
  'spacetimeExecutableSha256',
  'atlasId',
  'atlasSourceCommit',
  'publicReleaseId',
  'releaseManifestSha256',
  'expectedReleaseSha256',
  'releaseHeaderSha256',
  'verificationDigest',
  'importEpoch',
  'operationsSubmitted',
  'operationChainDigest',
  'zeroPopulationBoundary',
  'importsExact',
  'ready',
  'atlasFinalized',
  'atlasWritesClosedByFinalization',
  'importMutationsCompiled',
  'activationMutationsCompiled',
] as const);

export class PtrProductionImportError extends Error {
  constructor(readonly code: string, readonly submitted = false) {
    super(code);
    this.name = 'PtrProductionImportError';
  }
}

function fail(code: string, submitted = false): never {
  throw new PtrProductionImportError(code, submitted);
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
    || Object.getOwnPropertySymbols(value).length !== 0
    || Reflect.ownKeys(value).length !== keys.length
    || Reflect.ownKeys(value).some((key, index) => key !== keys[index])
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(
      descriptor => !('value' in descriptor) || descriptor.enumerable !== true,
    )
  ) fail(code);
  return value as Readonly<Record<string, unknown>>;
}

function u32(value: unknown): number {
  if (
    !Number.isInteger(value)
    || Object.is(value, -0)
    || Number(value) < 0
    || Number(value) > 0xffff_ffff
  ) fail('PTR_PRODUCTION_STATUS_INVALID');
  return Number(value);
}

function u64(value: unknown): bigint {
  if (typeof value !== 'bigint' || value < 0n || value > U64_MAXIMUM) {
    fail('PTR_PRODUCTION_STATUS_INVALID');
  }
  return value;
}

function optionalU64(value: unknown): bigint | undefined {
  return value === undefined ? undefined : u64(value);
}

function optionalU32(value: unknown): number | undefined {
  return value === undefined ? undefined : u32(value);
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 512
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) fail('PTR_PRODUCTION_STATUS_INVALID');
  return value;
}

export type PtrProductionStatus = Readonly<{
  present: boolean;
  atlasId?: string;
  publicReleaseId?: string;
  publicApprovalReceiptId?: string;
  sourceCommit?: string;
  expectedReleaseSha256?: string;
  releaseHeaderSha256?: string;
  state: typeof STATES[number];
  importEpoch?: bigint;
  verificationPhase: typeof PHASES[number];
  verificationCursor: bigint;
  verificationDigest: string;
  expectedRegionCount: number;
  expectedComponentCount: number;
  expectedChunkCount: number;
  expectedCellCount: number;
  expectedSlotCount: number;
  expectedResourceNodeCount: number;
  verifiedComponentCount: number;
  verifiedChunkCount: number;
  verifiedCellCount: number;
  verifiedSlotCount: number;
  verifiedResourceNodeCount: number;
  componentExpectedCellCount: number;
  componentExpectedSlotCount: number;
  componentExpectedResourceNodeCount: number;
  importedPassableCellCount: number;
  regionManifestRows: number;
  componentRows: bigint;
  chunkRows: bigint;
  cellRows: bigint;
  slotRows: bigint;
  resourceRows: bigint;
  claimRows: bigint;
  occupancyRows: bigint;
  activationRows: bigint;
  publicAtlasRows: bigint;
  publicRegionRows: bigint;
  workerSystemRows: bigint;
  importsExact: boolean;
  ready: boolean;
  importMutationsCompiled: boolean;
  activationMutationsCompiled: boolean;
  ownerProvisioned: boolean;
  ownerEnabled: boolean;
  ownerFid?: bigint;
  ownerAuthEpoch?: number;
}>;

/** Exact protected server projection; a successful call also proves all hidden legacy tables empty. */
export function projectPtrProductionStatus(value: unknown): PtrProductionStatus {
  const source = exactRecord(
    value,
    STATUS_KEYS,
    'PTR_PRODUCTION_STATUS_SHAPE_CHANGED',
  );
  const projected: Record<string, unknown> = {};
  for (const key of OPTIONAL_STRINGS) projected[key] = optionalString(source[key]);
  for (const key of U32_FIELDS) projected[key] = u32(source[key]);
  for (const key of U64_FIELDS) projected[key] = u64(source[key]);
  Object.assign(projected, {
    present: source.present,
    state: source.state,
    importEpoch: optionalU64(source.importEpoch),
    verificationPhase: source.verificationPhase,
    verificationDigest: source.verificationDigest,
    importsExact: source.importsExact,
    ready: source.ready,
    importMutationsCompiled: source.importMutationsCompiled,
    activationMutationsCompiled: source.activationMutationsCompiled,
    ownerProvisioned: source.ownerProvisioned,
    ownerEnabled: source.ownerEnabled,
    ownerFid: optionalU64(source.ownerFid),
    ownerAuthEpoch: optionalU32(source.ownerAuthEpoch),
  });
  if (
    typeof source.present !== 'boolean'
    || !STATES.includes(source.state as never)
    || !PHASES.includes(source.verificationPhase as never)
    || typeof source.verificationDigest !== 'string'
    || source.verificationDigest.length < 1
    || source.verificationDigest.length > 512
    || /[\u0000-\u001f\u007f]/u.test(source.verificationDigest)
    || typeof source.importsExact !== 'boolean'
    || typeof source.ready !== 'boolean'
    || typeof source.importMutationsCompiled !== 'boolean'
    || typeof source.activationMutationsCompiled !== 'boolean'
    || typeof source.ownerProvisioned !== 'boolean'
    || typeof source.ownerEnabled !== 'boolean'
  ) fail('PTR_PRODUCTION_STATUS_INVALID');
  const status = Object.freeze(projected) as PtrProductionStatus;
  if (ZERO_BOUNDARY_FIELDS.some(field => status[field] !== 0n)) {
    fail('PTR_PRODUCTION_ZERO_BOUNDARY_VIOLATED');
  }
  if (!status.importMutationsCompiled || status.activationMutationsCompiled) {
    fail('PTR_PRODUCTION_POLICY_INVALID');
  }
  const atlasFieldsPresent = OPTIONAL_STRINGS.every(key => (
    status.present ? status[key] !== undefined : status[key] === undefined
  ));
  const ownerFieldsPresent = status.ownerFid !== undefined
    && status.ownerAuthEpoch !== undefined;
  if (
    status.present !== (status.state !== 'absent')
    || status.present !== (status.importEpoch !== undefined)
    || !atlasFieldsPresent
    || status.ready !== (status.state === 'ready')
    || status.ownerProvisioned !== ownerFieldsPresent
    || (!status.ownerProvisioned && status.ownerEnabled)
    || (status.ownerProvisioned && status.state !== 'ready')
  ) fail('PTR_PRODUCTION_STATUS_INCONSISTENT');
  if (status.present && (
    status.atlasId !== PTR_PRODUCTION_IMPORT_TARGET.atlasId
    || !PUBLIC_RELEASE_ID.test(status.publicReleaseId ?? '')
    || !PUBLIC_APPROVAL_ID.test(status.publicApprovalReceiptId ?? '')
    || !COMMIT.test(status.sourceCommit ?? '')
    || !SHA256.test(status.expectedReleaseSha256 ?? '')
    || !SHA256.test(status.releaseHeaderSha256 ?? '')
  )) fail('PTR_PRODUCTION_STATUS_IDENTITY_INVALID');
  return status;
}

type ParsedArguments = Readonly<{
  command: 'inspect' | 'apply';
  databaseIdentity: string;
  genesis002DatabaseIdentity: string;
  moduleSourceCommit: string;
  moduleSha256: string;
  moduleTreeId: string;
  dependencyClosureDigest: string;
  spacetimeExecutableSha256: string;
  spacetimeCliConfigSha256: string;
  publishReceiptDigest: string;
  atlasSourceCommit: string;
  releaseSha256: string;
  confirmationDigest?: string;
}>;

export function parsePtrProductionImportArguments(
  values: readonly string[],
): ParsedArguments {
  const command = values[0];
  if (command !== 'inspect' && command !== 'apply') {
    fail('PTR_PRODUCTION_IMPORT_ARGUMENT_INVALID');
  }
  const patterns = Object.freeze({
    'database-identity': SHA256,
    'genesis-002-database-identity': SHA256,
    'module-source-commit': COMMIT,
    'module-sha256': SHA256,
    'module-tree-id': COMMIT,
    'dependency-closure-digest': SHA256,
    'spacetime-executable-sha256': SHA256,
    'spacetime-cli-config-sha256': SHA256,
    'publish-receipt-digest': SHA256,
    'atlas-source-commit': COMMIT,
    'release-sha256': SHA256,
    confirm: SHA256,
  });
  const parsed = new Map<string, string>();
  for (const value of values.slice(1)) {
    const match = /^--([a-z0-9-]+)=(.+)$/u.exec(value);
    if (
      match === null
      || !(match[1] in patterns)
      || parsed.has(match[1])
      || !patterns[match[1] as keyof typeof patterns].test(match[2]!)
    ) fail('PTR_PRODUCTION_IMPORT_ARGUMENT_INVALID');
    parsed.set(match[1]!, match[2]!);
  }
  const required = [
    'database-identity', 'genesis-002-database-identity',
    'module-source-commit', 'module-sha256', 'module-tree-id',
    'dependency-closure-digest', 'spacetime-executable-sha256',
    'spacetime-cli-config-sha256', 'publish-receipt-digest',
    'atlas-source-commit', 'release-sha256',
  ];
  if (
    required.some(key => !parsed.has(key))
    || (command === 'apply') !== parsed.has('confirm')
    || parsed.size !== required.length + (command === 'apply' ? 1 : 0)
  ) fail('PTR_PRODUCTION_IMPORT_ARGUMENT_INVALID');
  const databaseIdentity = parsed.get('database-identity')!;
  const genesis002DatabaseIdentity = parsed.get('genesis-002-database-identity')!;
  if (
    databaseIdentity === PTR_PRODUCTION_IMPORT_TARGET.genesis001DatabaseIdentity
    || databaseIdentity === genesis002DatabaseIdentity
    || genesis002DatabaseIdentity
      === PTR_PRODUCTION_IMPORT_TARGET.genesis001DatabaseIdentity
  ) fail('PTR_PRODUCTION_IMPORT_TARGET_IDENTITY_FORBIDDEN');
  return Object.freeze({
    command,
    databaseIdentity,
    genesis002DatabaseIdentity,
    moduleSourceCommit: parsed.get('module-source-commit')!,
    moduleSha256: parsed.get('module-sha256')!,
    moduleTreeId: parsed.get('module-tree-id')!,
    dependencyClosureDigest: parsed.get('dependency-closure-digest')!,
    spacetimeExecutableSha256: parsed.get('spacetime-executable-sha256')!,
    spacetimeCliConfigSha256: parsed.get('spacetime-cli-config-sha256')!,
    publishReceiptDigest: parsed.get('publish-receipt-digest')!,
    atlasSourceCommit: parsed.get('atlas-source-commit')!,
    releaseSha256: parsed.get('release-sha256')!,
    ...(command === 'apply'
      ? { confirmationDigest: parsed.get('confirm')! }
      : {}),
  });
}

function canonical(value: unknown): string {
  return `${JSON.stringify(value, (_key, child) => (
    typeof child === 'bigint' ? child.toString() : child
  ))}\n`;
}

function validateDisallowedIdentities(
  values: readonly string[],
  databaseIdentity: string,
): readonly string[] {
  if (
    !Array.isArray(values)
    || values.length < 1
    || values.some(value => !SHA256.test(value))
    || new Set(values).size !== values.length
    || values.includes(PTR_PRODUCTION_IMPORT_TARGET.genesis001DatabaseIdentity)
    || values.includes(databaseIdentity)
  ) fail('PTR_PRODUCTION_IMPORT_TARGET_IDENTITY_FORBIDDEN');
  return Object.freeze([...values].sort());
}

export function ptrProductionImportConfirmationDigest(input: Readonly<{
  databaseIdentity: string;
  disallowedDatabaseIdentities: readonly string[];
  moduleSourceCommit: string;
  moduleSha256: string;
  moduleTreeId: string;
  dependencyClosureDigest: string;
  spacetimeExecutableSha256: string;
  spacetimeCliConfigSha256: string;
  publishReceiptDigest: string;
  atlasSourceCommit: string;
  releaseSha256: string;
  publicReleaseId: string;
  importEpoch: bigint;
}>): string {
  if (
    !SHA256.test(input.databaseIdentity)
    || input.databaseIdentity === PTR_PRODUCTION_IMPORT_TARGET.genesis001DatabaseIdentity
    || !COMMIT.test(input.moduleSourceCommit)
    || !SHA256.test(input.moduleSha256)
    || !COMMIT.test(input.moduleTreeId)
    || !SHA256.test(input.dependencyClosureDigest)
    || !SHA256.test(input.spacetimeExecutableSha256)
    || !SHA256.test(input.spacetimeCliConfigSha256)
    || !SHA256.test(input.publishReceiptDigest)
    || !COMMIT.test(input.atlasSourceCommit)
    || !SHA256.test(input.releaseSha256)
    || !PUBLIC_RELEASE_ID.test(input.publicReleaseId)
    || input.importEpoch < 1n
    || input.importEpoch > U64_MAXIMUM
  ) fail('PTR_PRODUCTION_IMPORT_IDENTITY_INVALID');
  const disallowedDatabaseIdentities = validateDisallowedIdentities(
    input.disallowedDatabaseIdentities,
    input.databaseIdentity,
  );
  return createHash('sha256')
    .update('warpkeep.ptr.production-import-confirmation.v1\n')
    .update(canonical({
      ...PTR_PRODUCTION_IMPORT_TARGET,
      ...input,
      disallowedDatabaseIdentities,
      importEpoch: input.importEpoch.toString(),
    }))
    .digest('hex');
}

function baseStatus(status: PtrProductionStatus): GreaterRealmProductionImportStatus {
  return Object.freeze({
    present: status.present,
    atlasId: status.atlasId,
    publicReleaseId: status.publicReleaseId,
    state: status.state,
    importEpoch: status.importEpoch,
    verificationPhase: status.verificationPhase,
    verificationCursor: status.verificationCursor,
    verificationDigest: status.verificationDigest,
    expectedComponentCount: status.expectedComponentCount,
    expectedChunkCount: status.expectedChunkCount,
    expectedCellCount: status.expectedCellCount,
    expectedSlotCount: status.expectedSlotCount,
    expectedResourceNodeCount: status.expectedResourceNodeCount,
    regionManifestRows: status.regionManifestRows,
    componentRows: status.componentRows,
    chunkRows: status.chunkRows,
    cellRows: status.cellRows,
    slotRows: status.slotRows,
    resourceRows: status.resourceRows,
    claimRows: status.claimRows,
    occupancyRows: status.occupancyRows,
    activationRows: status.activationRows,
    publicAtlasRows: status.publicAtlasRows,
    publicRegionRows: status.publicRegionRows,
    workerSystemRows: status.workerSystemRows,
    importsExact: status.importsExact,
    ready: status.ready,
    importMutationsCompiled: status.importMutationsCompiled,
    activationMutationsCompiled: status.activationMutationsCompiled,
  });
}

function authorityStatus(
  status: PtrProductionStatus,
): GreaterRealmProductionCutoverStatus {
  return {
    componentExpectedCellCount: status.componentExpectedCellCount,
    componentExpectedSlotCount: status.componentExpectedSlotCount,
    componentExpectedResourceNodeCount: status.componentExpectedResourceNodeCount,
    importedPassableCellCount: status.importedPassableCellCount,
    verifiedComponentCount: status.verifiedComponentCount,
    verifiedChunkCount: status.verifiedChunkCount,
    verifiedCellCount: status.verifiedCellCount,
    verifiedSlotCount: status.verifiedSlotCount,
    verifiedResourceNodeCount: status.verifiedResourceNodeCount,
  } as GreaterRealmProductionCutoverStatus;
}

type Authority = ReturnType<
  typeof greaterRealmProductionImportEngine.importAuthority
>;

function assertBoundStatus(
  status: PtrProductionStatus,
  authority: Authority,
  importEpoch: bigint,
): void {
  if (status.ownerProvisioned || status.ownerEnabled) {
    fail('PTR_PRODUCTION_OWNER_PROVISIONED_BEFORE_IMPORT');
  }
  if (!status.present) {
    if (
      status.expectedRegionCount !== 0
      || status.expectedComponentCount !== 0
      || status.expectedChunkCount !== 0
      || status.expectedCellCount !== 0
      || status.expectedSlotCount !== 0
      || status.expectedResourceNodeCount !== 0
      || status.componentRows !== 0n
      || status.chunkRows !== 0n
      || status.cellRows !== 0n
      || status.slotRows !== 0n
      || status.resourceRows !== 0n
    ) fail('PTR_PRODUCTION_IMPORT_ABSENT_STATE_INVALID');
    return;
  }
  if (
    status.atlasId !== PTR_PRODUCTION_IMPORT_TARGET.atlasId
    || status.atlasId !== authority.atlasId
    || status.publicReleaseId !== authority.publicReleaseId
    || status.publicApprovalReceiptId !== authority.publicApprovalReceiptId
    || status.sourceCommit !== authority.sourceCommit
    || status.expectedReleaseSha256 !== authority.releaseSha256
    || status.releaseHeaderSha256 !== createHash('sha256')
      .update(authority.headerJson).digest('hex')
    || status.importEpoch !== importEpoch
    || status.expectedRegionCount !== authority.totals.regionCount
    || status.expectedComponentCount !== authority.totals.componentCount
    || status.expectedChunkCount !== authority.totals.chunkCount
    || status.expectedCellCount !== authority.totals.cellCount
    || status.expectedSlotCount !== authority.totals.castleSlotCount
    || status.expectedResourceNodeCount !== authority.totals.resourceNodeCount
  ) fail('PTR_PRODUCTION_IMPORT_RELEASE_BINDING_INVALID');
}

function exactReady(
  status: PtrProductionStatus,
  authority: Authority,
  importEpoch: bigint,
): boolean {
  return greaterRealmProductionImportEngine.readyPostcondition(
    baseStatus(status),
    authority,
    importEpoch,
  )
    && SHA256.test(status.verificationDigest)
    && status.verifiedComponentCount === authority.totals.componentCount
    && status.verifiedChunkCount === authority.totals.chunkCount
    && status.verifiedCellCount === authority.totals.cellCount
    && status.verifiedSlotCount === authority.totals.castleSlotCount
    && status.verifiedResourceNodeCount === authority.totals.resourceNodeCount
    && status.componentExpectedCellCount === status.importedPassableCellCount
    && status.componentExpectedSlotCount === authority.totals.castleSlotCount
    && status.componentExpectedResourceNodeCount
      === authority.totals.resourceNodeCount;
}

export type PtrProductionImportTransport = Readonly<{
  inspect: () => Promise<unknown>;
  prepareSubmission?: () => Promise<void>;
  submit: (
    reducer: typeof PTR_PRODUCTION_IMPORT_REDUCERS[
      keyof typeof PTR_PRODUCTION_IMPORT_REDUCERS
    ],
    arguments_: Readonly<Record<string, unknown>>,
    assertCanStartWrite: () => void,
  ) => Promise<void>;
}>;

export type PtrProductionImportReceipt = Readonly<{
  schemaVersion: 1;
  profile: 'warpkeep.ptr.production-import.v1';
  outcome: 'ready';
  databaseIdentity: string;
  moduleIdentity: typeof PTR_PRODUCTION_IMPORT_TARGET.moduleIdentity;
  moduleSourceCommit: string;
  moduleSha256: string;
  moduleTreeId: string;
  dependencyClosureDigest: string;
  spacetimeExecutableSha256: string;
  atlasId: typeof PTR_PRODUCTION_IMPORT_TARGET.atlasId;
  atlasSourceCommit: string;
  publicReleaseId: string;
  releaseManifestSha256: string;
  expectedReleaseSha256: string;
  releaseHeaderSha256: string;
  verificationDigest: string;
  importEpoch: string;
  operationsSubmitted: number;
  operationChainDigest: string;
  zeroPopulationBoundary: true;
  importsExact: true;
  ready: true;
  atlasFinalized: true;
  atlasWritesClosedByFinalization: true;
  importMutationsCompiled: true;
  activationMutationsCompiled: false;
  importReceiptDigest: string;
}>;

export function ptrProductionImportReceiptDigest(value: unknown): string {
  const receipt = exactRecord(
    value,
    IMPORT_RECEIPT_KEYS,
    'PTR_PRODUCTION_IMPORT_RECEIPT_INVALID',
  );
  if (
    receipt.schemaVersion !== 1
    || receipt.profile !== 'warpkeep.ptr.production-import.v1'
    || receipt.outcome !== 'ready'
    || typeof receipt.databaseIdentity !== 'string'
    || !SHA256.test(receipt.databaseIdentity)
    || receipt.databaseIdentity === PTR_PRODUCTION_IMPORT_TARGET.genesis001DatabaseIdentity
    || receipt.moduleIdentity !== PTR_PRODUCTION_IMPORT_TARGET.moduleIdentity
    || typeof receipt.moduleSourceCommit !== 'string'
    || !COMMIT.test(receipt.moduleSourceCommit)
    || typeof receipt.moduleSha256 !== 'string'
    || !SHA256.test(receipt.moduleSha256)
    || typeof receipt.moduleTreeId !== 'string'
    || !COMMIT.test(receipt.moduleTreeId)
    || typeof receipt.dependencyClosureDigest !== 'string'
    || !SHA256.test(receipt.dependencyClosureDigest)
    || typeof receipt.spacetimeExecutableSha256 !== 'string'
    || !SHA256.test(receipt.spacetimeExecutableSha256)
    || receipt.atlasId !== PTR_PRODUCTION_IMPORT_TARGET.atlasId
    || typeof receipt.atlasSourceCommit !== 'string'
    || !COMMIT.test(receipt.atlasSourceCommit)
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
    || typeof receipt.importEpoch !== 'string'
    || !/^[1-9][0-9]{0,19}$/u.test(receipt.importEpoch)
    || BigInt(receipt.importEpoch) > U64_MAXIMUM
    || typeof receipt.operationsSubmitted !== 'number'
    || !Number.isSafeInteger(receipt.operationsSubmitted)
    || receipt.operationsSubmitted < 1
    || receipt.operationsSubmitted > MAXIMUM_OPERATIONS
    || typeof receipt.operationChainDigest !== 'string'
    || !SHA256.test(receipt.operationChainDigest)
    || receipt.zeroPopulationBoundary !== true
    || receipt.importsExact !== true
    || receipt.ready !== true
    || receipt.atlasFinalized !== true
    || receipt.atlasWritesClosedByFinalization !== true
    || receipt.importMutationsCompiled !== true
    || receipt.activationMutationsCompiled !== false
  ) fail('PTR_PRODUCTION_IMPORT_RECEIPT_INVALID');
  return createHash('sha256')
    .update('warpkeep.ptr.production-import-receipt.v1\n')
    .update(`${JSON.stringify(receipt)}\n`)
    .digest('hex');
}

export async function executePtrProductionImport(input: Readonly<{
  artifacts: GreaterRealmRuntimeReleaseArtifacts;
  databaseIdentity: string;
  disallowedDatabaseIdentities: readonly string[];
  moduleSourceCommit: string;
  moduleSha256: string;
  moduleTreeId: string;
  dependencyClosureDigest: string;
  spacetimeExecutableSha256: string;
  importEpoch: bigint;
  publicName: string;
  transport: PtrProductionImportTransport;
  assertCanStartWrite: () => void;
  maximumOperations?: number;
  testOnlyVerifyArtifacts?: (
    artifacts: GreaterRealmRuntimeReleaseArtifacts,
  ) => void;
}>): Promise<PtrProductionImportReceipt> {
  if (
    !SHA256.test(input.databaseIdentity)
    || input.databaseIdentity === PTR_PRODUCTION_IMPORT_TARGET.genesis001DatabaseIdentity
    || !COMMIT.test(input.moduleSourceCommit)
    || !SHA256.test(input.moduleSha256)
    || !COMMIT.test(input.moduleTreeId)
    || !SHA256.test(input.dependencyClosureDigest)
    || !SHA256.test(input.spacetimeExecutableSha256)
    || input.importEpoch < 1n
    || input.importEpoch > U64_MAXIMUM
    || typeof input.publicName !== 'string'
    || input.publicName.length < 1
    || input.publicName.length > 96
    || /[\u0000-\u001f\u007f]/u.test(input.publicName)
  ) fail('PTR_PRODUCTION_IMPORT_INPUT_INVALID');
  validateDisallowedIdentities(
    input.disallowedDatabaseIdentities,
    input.databaseIdentity,
  );
  const maximumOperations = input.maximumOperations ?? MAXIMUM_OPERATIONS;
  if (
    !Number.isSafeInteger(maximumOperations)
    || maximumOperations < 1
    || maximumOperations > MAXIMUM_OPERATIONS
  ) fail('PTR_PRODUCTION_IMPORT_INPUT_INVALID');
  const verifyArtifacts = input.testOnlyVerifyArtifacts
    ?? verifyPtrGreaterRealmRuntimeReleaseArtifacts;
  const authority = greaterRealmProductionImportEngine.importAuthority(
    input.artifacts,
    verifyArtifacts,
  );
  if (
    authority.atlasId !== PTR_PRODUCTION_IMPORT_TARGET.atlasId
    || !COMMIT.test(authority.sourceCommit)
    || !SHA256.test(authority.releaseSha256)
  ) fail('PTR_PRODUCTION_IMPORT_RELEASE_IDENTITY_INVALID');

  const inspect = async (submitted: boolean): Promise<PtrProductionStatus> => {
    try {
      const status = projectPtrProductionStatus(await input.transport.inspect());
      assertBoundStatus(status, authority, input.importEpoch);
      return status;
    } catch (error) {
      if (!submitted && error instanceof PtrProductionImportError) throw error;
      return fail(
        submitted
          ? 'PTR_PRODUCTION_IMPORT_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED'
          : 'PTR_PRODUCTION_IMPORT_INSPECTION_UNAVAILABLE',
        submitted,
      );
    }
  };
  let status = await inspect(false);
  if (exactReady(status, authority, input.importEpoch)) {
    fail('PTR_PRODUCTION_IMPORT_ALREADY_APPLIED');
  }
  let operationsSubmitted = 0;
  let chain = createHash('sha256')
    .update('warpkeep.ptr.production-import-operation-chain.v1\n')
    .update(canonical({
      databaseIdentity: input.databaseIdentity,
      moduleSourceCommit: input.moduleSourceCommit,
      moduleSha256: input.moduleSha256,
      moduleTreeId: input.moduleTreeId,
      dependencyClosureDigest: input.dependencyClosureDigest,
      spacetimeExecutableSha256: input.spacetimeExecutableSha256,
      atlasSourceCommit: authority.sourceCommit,
      releaseSha256: authority.releaseSha256,
      releaseVersion: PTR_PRODUCTION_IMPORT_TARGET.releaseVersion,
      moduleIdentity: PTR_PRODUCTION_IMPORT_TARGET.moduleIdentity,
    }))
    .digest('hex');

  const makeReceipt = (): PtrProductionImportReceipt => {
    if (!exactReady(status, authority, input.importEpoch)) {
      fail('PTR_PRODUCTION_IMPORT_READY_POSTCONDITION_FAILED', true);
    }
    const receipt = Object.freeze({
      schemaVersion: 1 as const,
      profile: 'warpkeep.ptr.production-import.v1' as const,
      outcome: 'ready' as const,
      databaseIdentity: input.databaseIdentity,
      moduleIdentity: PTR_PRODUCTION_IMPORT_TARGET.moduleIdentity,
      moduleSourceCommit: input.moduleSourceCommit,
      moduleSha256: input.moduleSha256,
      moduleTreeId: input.moduleTreeId,
      dependencyClosureDigest: input.dependencyClosureDigest,
      spacetimeExecutableSha256: input.spacetimeExecutableSha256,
      atlasId: PTR_PRODUCTION_IMPORT_TARGET.atlasId,
      atlasSourceCommit: authority.sourceCommit,
      publicReleaseId: authority.publicReleaseId,
      releaseManifestSha256: createHash('sha256')
        .update(input.artifacts.manifestBytes).digest('hex'),
      expectedReleaseSha256: authority.releaseSha256,
      releaseHeaderSha256: createHash('sha256')
        .update(authority.headerJson).digest('hex'),
      verificationDigest: status.verificationDigest,
      importEpoch: input.importEpoch.toString(),
      operationsSubmitted,
      operationChainDigest: chain,
      zeroPopulationBoundary: true as const,
      importsExact: true as const,
      ready: true as const,
      atlasFinalized: true as const,
      atlasWritesClosedByFinalization: true as const,
      importMutationsCompiled: true as const,
      activationMutationsCompiled: false as const,
    });
    return Object.freeze({
      ...receipt,
      importReceiptDigest: ptrProductionImportReceiptDigest(receipt),
    });
  };

  while (operationsSubmitted < maximumOperations) {
    const planned = greaterRealmProductionImportEngine.planNextOperation(
      baseStatus(status),
      authority,
      input.artifacts,
      input.importEpoch,
      input.publicName,
    );
    if (planned === undefined) return makeReceipt();
    if (!Object.values(PTR_PRODUCTION_IMPORT_REDUCERS).includes(
      planned.reducer as never,
    )) fail('PTR_PRODUCTION_IMPORT_REDUCER_FORBIDDEN');
    const fresh = await inspect(operationsSubmitted > 0);
    const freshPlan = greaterRealmProductionImportEngine.planNextOperation(
      baseStatus(fresh),
      authority,
      input.artifacts,
      input.importEpoch,
      input.publicName,
    );
    if (
      freshPlan === undefined
      || freshPlan.reducer !== planned.reducer
      || canonical(freshPlan.arguments) !== canonical(planned.arguments)
    ) {
      status = fresh;
      continue;
    }
    if (
      Object.hasOwn(planned.arguments, 'ptrReleaseVersion')
      || Object.hasOwn(planned.arguments, 'ptrModuleIdentity')
    ) fail('PTR_PRODUCTION_IMPORT_ARGUMENT_COLLISION');
    const submittedArguments = Object.freeze({
      ptrReleaseVersion: PTR_PRODUCTION_IMPORT_TARGET.releaseVersion,
      ptrModuleIdentity: PTR_PRODUCTION_IMPORT_TARGET.moduleIdentity,
      ...planned.arguments,
    });
    await input.transport.prepareSubmission?.();
    let submissionFailed = false;
    input.assertCanStartWrite();
    try {
      await input.transport.submit(
        planned.reducer as typeof PTR_PRODUCTION_IMPORT_REDUCERS[
          keyof typeof PTR_PRODUCTION_IMPORT_REDUCERS
        ],
        submittedArguments,
        input.assertCanStartWrite,
      );
    } catch {
      submissionFailed = true;
    }
    operationsSubmitted += 1;
    const after = await inspect(true);
    const advanced = greaterRealmProductionImportEngine
      .importOperationPostcondition({
        operation: planned,
        before: baseStatus(fresh),
        after: baseStatus(after),
        beforeAuthority: authorityStatus(fresh),
        afterAuthority: authorityStatus(after),
        authority,
        artifacts: input.artifacts,
      });
    if (!advanced) {
      fail(
        submissionFailed
          ? 'PTR_PRODUCTION_IMPORT_REJECTED_OR_UNCOMMITTED'
          : 'PTR_PRODUCTION_IMPORT_POSTCONDITION_FAILED',
        true,
      );
    }
    chain = createHash('sha256')
      .update('warpkeep.ptr.production-import-operation.v1\n')
      .update(chain)
      .update(canonical({
        ordinal: operationsSubmitted,
        reducer: planned.reducer,
        arguments: submittedArguments,
        before: fresh,
        after,
        outcome: submissionFailed
          ? 'verified-after-submission-error'
          : 'verified',
      }))
      .digest('hex');
    status = after;
    if (exactReady(status, authority, input.importEpoch)) return makeReceipt();
  }
  return fail('PTR_PRODUCTION_IMPORT_OPERATION_LIMIT', operationsSubmitted > 0);
}

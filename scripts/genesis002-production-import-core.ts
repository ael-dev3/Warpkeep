import { createHash } from 'node:crypto';

import {
  verifyGenesis002GreaterRealmRuntimeReleaseArtifacts,
  type GreaterRealmRuntimeReleaseArtifacts,
} from './atlas/greater-realm-runtime-release';
import {
  greaterRealmProductionImportEngine,
  type GreaterRealmProductionImportStatus,
} from './greater-realm-production-import-core';
import type { GreaterRealmProductionCutoverStatus } from './greater-realm-production-relocation-core';

export const GENESIS_002_PRODUCTION_IMPORT_TARGET = Object.freeze({
  uri: 'https://maincloud.spacetimedb.com',
  bridge: 'https://auth.warpkeep.com',
  databaseAlias: 'warpkeep-genesis-002',
  moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
  genesis001DatabaseIdentity:
    'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
  atlasId: 'GENESIS_002_GREATER_REALM',
  deleteData: 'never',
} as const);

/** The only mutations this operator can ever dispatch. */
export const GENESIS_002_PRODUCTION_IMPORT_REDUCERS = Object.freeze({
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

export class Genesis002ProductionImportError extends Error {
  constructor(readonly code: string, readonly submitted = false) {
    super(code);
    this.name = 'Genesis002ProductionImportError';
  }
}

function fail(code: string, submitted = false): never {
  throw new Genesis002ProductionImportError(code, submitted);
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getOwnPropertySymbols(value).length !== 0
  ) fail('GENESIS_002_PRODUCTION_IMPORT_STATUS_INVALID');
  const result = value as Readonly<Record<string, unknown>>;
  const descriptors = Object.getOwnPropertyDescriptors(result);
  if (Object.values(descriptors).some(descriptor => !('value' in descriptor))) {
    fail('GENESIS_002_PRODUCTION_IMPORT_STATUS_INVALID');
  }
  if (
    Object.keys(result).length !== STATUS_KEYS.length
    || STATUS_KEYS.some(key => !Object.hasOwn(result, key))
  ) fail('GENESIS_002_PRODUCTION_IMPORT_STATUS_SHAPE_CHANGED');
  return result;
}

function u32(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 0xffff_ffff) {
    fail('GENESIS_002_PRODUCTION_IMPORT_STATUS_INVALID');
  }
  return Number(value);
}

function u64(value: unknown): bigint {
  if (typeof value !== 'bigint' || value < 0n || value > U64_MAXIMUM) {
    fail('GENESIS_002_PRODUCTION_IMPORT_STATUS_INVALID');
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length < 1 || value.length > 512) {
    fail('GENESIS_002_PRODUCTION_IMPORT_STATUS_INVALID');
  }
  return value;
}

export type Genesis002ProductionImportStatus = Readonly<{
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
}>;

/** Exact server projection. Extra/missing fields and every public/population row fail closed. */
export function projectGenesis002ProductionImportStatus(
  value: unknown,
): Genesis002ProductionImportStatus {
  const source = record(value);
  const projected: Record<string, unknown> = {};
  for (const key of OPTIONAL_STRINGS) projected[key] = optionalString(source[key]);
  for (const key of U32_FIELDS) projected[key] = u32(source[key]);
  for (const key of U64_FIELDS) projected[key] = u64(source[key]);
  const importEpoch = source.importEpoch === undefined ? undefined : u64(source.importEpoch);
  if (
    typeof source.present !== 'boolean'
    || !STATES.includes(source.state as never)
    || !PHASES.includes(source.verificationPhase as never)
    || typeof source.verificationDigest !== 'string'
    || source.verificationDigest.length > 512
    || typeof source.importsExact !== 'boolean'
    || typeof source.ready !== 'boolean'
    || typeof source.importMutationsCompiled !== 'boolean'
    || typeof source.activationMutationsCompiled !== 'boolean'
  ) fail('GENESIS_002_PRODUCTION_IMPORT_STATUS_INVALID');
  Object.assign(projected, {
    present: source.present,
    state: source.state,
    importEpoch,
    verificationPhase: source.verificationPhase,
    verificationDigest: source.verificationDigest,
    importsExact: source.importsExact,
    ready: source.ready,
    importMutationsCompiled: source.importMutationsCompiled,
    activationMutationsCompiled: source.activationMutationsCompiled,
  });
  const status = Object.freeze(projected) as Genesis002ProductionImportStatus;
  if (ZERO_BOUNDARY_FIELDS.some(field => status[field] !== 0n)) {
    fail('GENESIS_002_PRODUCTION_IMPORT_ZERO_BOUNDARY_VIOLATED');
  }
  if (!status.importMutationsCompiled || status.activationMutationsCompiled) {
    fail('GENESIS_002_PRODUCTION_IMPORT_POLICY_INVALID');
  }
  const optionalPresence = OPTIONAL_STRINGS.every(key => (
    status.present ? status[key] !== undefined : status[key] === undefined
  ));
  if (
    status.present !== (status.state !== 'absent')
    || status.present !== (status.importEpoch !== undefined)
    || !optionalPresence
    || status.ready !== (status.state === 'ready')
  ) fail('GENESIS_002_PRODUCTION_IMPORT_STATUS_INCONSISTENT');
  return status;
}

type ParsedArguments = Readonly<{
  command: 'inspect' | 'apply';
  databaseIdentity: string;
  moduleSourceCommit: string;
  moduleSha256: string;
  moduleTreeId: string;
  dependencyClosureDigest: string;
  spacetimeExecutableSha256: string;
  atlasSourceCommit: string;
  releaseSha256: string;
  confirmationDigest?: string;
}>;

export function parseGenesis002ProductionImportArguments(
  values: readonly string[],
): ParsedArguments {
  const command = values[0];
  if (command !== 'inspect' && command !== 'apply') {
    fail('GENESIS_002_PRODUCTION_IMPORT_ARGUMENT_INVALID');
  }
  const patterns = Object.freeze({
    'database-identity': SHA256,
    'module-source-commit': COMMIT,
    'module-sha256': SHA256,
    'module-tree-id': COMMIT,
    'dependency-closure-digest': SHA256,
    'spacetime-executable-sha256': SHA256,
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
    ) fail('GENESIS_002_PRODUCTION_IMPORT_ARGUMENT_INVALID');
    parsed.set(match[1]!, match[2]!);
  }
  const required = [
    'database-identity', 'module-source-commit', 'module-sha256',
    'module-tree-id', 'dependency-closure-digest', 'spacetime-executable-sha256',
    'atlas-source-commit', 'release-sha256',
  ];
  if (
    required.some(key => !parsed.has(key))
    || (command === 'apply') !== parsed.has('confirm')
    || parsed.size !== required.length + (command === 'apply' ? 1 : 0)
  ) fail('GENESIS_002_PRODUCTION_IMPORT_ARGUMENT_INVALID');
  if (parsed.get('database-identity') === GENESIS_002_PRODUCTION_IMPORT_TARGET.genesis001DatabaseIdentity) {
    fail('GENESIS_002_PRODUCTION_IMPORT_TARGET_COLLIDES_WITH_GENESIS_001');
  }
  return Object.freeze({
    command,
    databaseIdentity: parsed.get('database-identity')!,
    moduleSourceCommit: parsed.get('module-source-commit')!,
    moduleSha256: parsed.get('module-sha256')!,
    moduleTreeId: parsed.get('module-tree-id')!,
    dependencyClosureDigest: parsed.get('dependency-closure-digest')!,
    spacetimeExecutableSha256: parsed.get('spacetime-executable-sha256')!,
    atlasSourceCommit: parsed.get('atlas-source-commit')!,
    releaseSha256: parsed.get('release-sha256')!,
    ...(command === 'apply' ? { confirmationDigest: parsed.get('confirm')! } : {}),
  });
}

function canonical(value: unknown): string {
  return `${JSON.stringify(value, (_key, child) => (
    typeof child === 'bigint' ? child.toString() : child
  ))}\n`;
}

export function genesis002ProductionImportConfirmationDigest(input: Readonly<{
  databaseIdentity: string;
  moduleSourceCommit: string;
  moduleSha256: string;
  moduleTreeId: string;
  dependencyClosureDigest: string;
  spacetimeExecutableSha256: string;
  atlasSourceCommit: string;
  releaseSha256: string;
  publicReleaseId: string;
  importEpoch: bigint;
}>): string {
  if (
    !SHA256.test(input.databaseIdentity)
    || input.databaseIdentity === GENESIS_002_PRODUCTION_IMPORT_TARGET.genesis001DatabaseIdentity
    || !COMMIT.test(input.moduleSourceCommit)
    || !SHA256.test(input.moduleSha256)
    || !COMMIT.test(input.moduleTreeId)
    || !SHA256.test(input.dependencyClosureDigest)
    || !SHA256.test(input.spacetimeExecutableSha256)
    || !COMMIT.test(input.atlasSourceCommit)
    || !SHA256.test(input.releaseSha256)
    || !/^GRR-[A-Z2-7]{26}$/u.test(input.publicReleaseId)
    || input.importEpoch < 1n
    || input.importEpoch > U64_MAXIMUM
  ) fail('GENESIS_002_PRODUCTION_IMPORT_IDENTITY_INVALID');
  return createHash('sha256')
    .update('warpkeep.genesis-002.production-import-confirmation.v1\n')
    .update(canonical({
      ...GENESIS_002_PRODUCTION_IMPORT_TARGET,
      ...input,
      importEpoch: input.importEpoch.toString(),
    }))
    .digest('hex');
}

function baseStatus(status: Genesis002ProductionImportStatus): GreaterRealmProductionImportStatus {
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

function authorityStatus(status: Genesis002ProductionImportStatus): GreaterRealmProductionCutoverStatus {
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

type Authority = ReturnType<typeof greaterRealmProductionImportEngine.importAuthority>;

function assertBoundStatus(
  status: Genesis002ProductionImportStatus,
  authority: Authority,
  importEpoch: bigint,
): void {
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
    ) fail('GENESIS_002_PRODUCTION_IMPORT_ABSENT_STATE_INVALID');
    return;
  }
  if (
    status.atlasId !== GENESIS_002_PRODUCTION_IMPORT_TARGET.atlasId
    || status.atlasId !== authority.atlasId
    || status.publicReleaseId !== authority.publicReleaseId
    || status.publicApprovalReceiptId !== authority.publicApprovalReceiptId
    || status.sourceCommit !== authority.sourceCommit
    || status.expectedReleaseSha256 !== authority.releaseSha256
    || status.releaseHeaderSha256 !== createHash('sha256').update(authority.headerJson).digest('hex')
    || status.importEpoch !== importEpoch
    || status.expectedRegionCount !== authority.totals.regionCount
    || status.expectedComponentCount !== authority.totals.componentCount
    || status.expectedChunkCount !== authority.totals.chunkCount
    || status.expectedCellCount !== authority.totals.cellCount
    || status.expectedSlotCount !== authority.totals.castleSlotCount
    || status.expectedResourceNodeCount !== authority.totals.resourceNodeCount
  ) fail('GENESIS_002_PRODUCTION_IMPORT_RELEASE_BINDING_INVALID');
}

function exactReady(
  status: Genesis002ProductionImportStatus,
  authority: Authority,
  importEpoch: bigint,
): boolean {
  return greaterRealmProductionImportEngine.readyPostcondition(
    baseStatus(status),
    authority,
    importEpoch,
  )
    && status.verifiedComponentCount === authority.totals.componentCount
    && status.verifiedChunkCount === authority.totals.chunkCount
    && status.verifiedCellCount === authority.totals.cellCount
    && status.verifiedSlotCount === authority.totals.castleSlotCount
    && status.verifiedResourceNodeCount === authority.totals.resourceNodeCount
    && status.componentExpectedCellCount === status.importedPassableCellCount
    && status.componentExpectedSlotCount === authority.totals.castleSlotCount
    && status.componentExpectedResourceNodeCount === authority.totals.resourceNodeCount;
}

export type Genesis002ProductionImportTransport = Readonly<{
  inspect: () => Promise<unknown>;
  prepareSubmission?: () => Promise<void>;
  submit: (
    reducer: typeof GENESIS_002_PRODUCTION_IMPORT_REDUCERS[keyof typeof GENESIS_002_PRODUCTION_IMPORT_REDUCERS],
    arguments_: Readonly<Record<string, unknown>>,
    assertCanStartWrite: () => void,
  ) => Promise<void>;
}>;

export type Genesis002ProductionImportReceipt = Readonly<{
  schemaVersion: 1;
  profile: 'warpkeep.genesis-002.production-import.v1';
  outcome: 'ready' | 'already-ready' | 'verified-after-submission-error';
  databaseIdentity: string;
  moduleIdentity: typeof GENESIS_002_PRODUCTION_IMPORT_TARGET.moduleIdentity;
  moduleSourceCommit: string;
  moduleSha256: string;
  moduleTreeId: string;
  dependencyClosureDigest: string;
  spacetimeExecutableSha256: string;
  atlasId: typeof GENESIS_002_PRODUCTION_IMPORT_TARGET.atlasId;
  atlasSourceCommit: string;
  publicReleaseId: string;
  expectedReleaseSha256: string;
  verificationDigest: string;
  importEpoch: string;
  operationsSubmitted: number;
  operationChainDigest: string;
  zeroPopulationBoundary: true;
  activationMutationsEnabled: false;
  playerPresentationEnabled: false;
  atlasWritesClosedByFinalization: true;
}>;

export async function executeGenesis002ProductionImport(input: Readonly<{
  artifacts: GreaterRealmRuntimeReleaseArtifacts;
  databaseIdentity: string;
  moduleSourceCommit: string;
  moduleSha256: string;
  moduleTreeId: string;
  dependencyClosureDigest: string;
  spacetimeExecutableSha256: string;
  importEpoch: bigint;
  publicName: string;
  transport: Genesis002ProductionImportTransport;
  assertCanStartWrite: () => void;
  maximumOperations?: number;
  testOnlyVerifyArtifacts?: (artifacts: GreaterRealmRuntimeReleaseArtifacts) => void;
}>): Promise<Genesis002ProductionImportReceipt> {
  if (
    !SHA256.test(input.databaseIdentity)
    || input.databaseIdentity === GENESIS_002_PRODUCTION_IMPORT_TARGET.genesis001DatabaseIdentity
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
  ) fail('GENESIS_002_PRODUCTION_IMPORT_INPUT_INVALID');
  const maximumOperations = input.maximumOperations ?? MAXIMUM_OPERATIONS;
  if (!Number.isSafeInteger(maximumOperations) || maximumOperations < 1 || maximumOperations > MAXIMUM_OPERATIONS) {
    fail('GENESIS_002_PRODUCTION_IMPORT_INPUT_INVALID');
  }
  const authority = greaterRealmProductionImportEngine.importAuthority(
    input.artifacts,
    input.testOnlyVerifyArtifacts ?? verifyGenesis002GreaterRealmRuntimeReleaseArtifacts,
  );
  if (
    authority.atlasId !== GENESIS_002_PRODUCTION_IMPORT_TARGET.atlasId
    || !COMMIT.test(authority.sourceCommit)
    || !SHA256.test(authority.releaseSha256)
  ) fail('GENESIS_002_PRODUCTION_IMPORT_RELEASE_IDENTITY_INVALID');

  const inspect = async (submitted: boolean) => {
    try {
      const status = projectGenesis002ProductionImportStatus(await input.transport.inspect());
      assertBoundStatus(status, authority, input.importEpoch);
      return status;
    } catch (error) {
      if (error instanceof Genesis002ProductionImportError) throw error;
      fail(
        submitted
          ? 'GENESIS_002_PRODUCTION_IMPORT_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED'
          : 'GENESIS_002_PRODUCTION_IMPORT_INSPECTION_UNAVAILABLE',
        submitted,
      );
    }
  };
  let status = await inspect(false);
  let operationsSubmitted = 0;
  let recovered = false;
  let chain = createHash('sha256')
    .update('warpkeep.genesis-002.production-import-operation-chain.v1\n')
    .update(canonical({
      databaseIdentity: input.databaseIdentity,
      moduleSourceCommit: input.moduleSourceCommit,
      moduleSha256: input.moduleSha256,
      moduleTreeId: input.moduleTreeId,
      dependencyClosureDigest: input.dependencyClosureDigest,
      spacetimeExecutableSha256: input.spacetimeExecutableSha256,
      atlasSourceCommit: authority.sourceCommit,
      releaseSha256: authority.releaseSha256,
    }))
    .digest('hex');

  const makeReceipt = (
    outcome: Genesis002ProductionImportReceipt['outcome'],
  ): Genesis002ProductionImportReceipt => Object.freeze({
    schemaVersion: 1,
    profile: 'warpkeep.genesis-002.production-import.v1',
    outcome,
    databaseIdentity: input.databaseIdentity,
    moduleIdentity: GENESIS_002_PRODUCTION_IMPORT_TARGET.moduleIdentity,
    moduleSourceCommit: input.moduleSourceCommit,
    moduleSha256: input.moduleSha256,
    moduleTreeId: input.moduleTreeId,
    dependencyClosureDigest: input.dependencyClosureDigest,
    spacetimeExecutableSha256: input.spacetimeExecutableSha256,
    atlasId: GENESIS_002_PRODUCTION_IMPORT_TARGET.atlasId,
    atlasSourceCommit: authority.sourceCommit,
    publicReleaseId: authority.publicReleaseId,
    expectedReleaseSha256: authority.releaseSha256,
    verificationDigest: status.verificationDigest,
    importEpoch: input.importEpoch.toString(),
    operationsSubmitted,
    operationChainDigest: chain,
    zeroPopulationBoundary: true,
    activationMutationsEnabled: false,
    playerPresentationEnabled: false,
    atlasWritesClosedByFinalization: true,
  });

  if (exactReady(status, authority, input.importEpoch)) return makeReceipt('already-ready');
  while (operationsSubmitted < maximumOperations) {
    const planned = greaterRealmProductionImportEngine.planNextOperation(
      baseStatus(status), authority, input.artifacts, input.importEpoch, input.publicName,
    );
    if (planned === undefined) {
      if (!exactReady(status, authority, input.importEpoch)) {
        fail('GENESIS_002_PRODUCTION_IMPORT_READY_POSTCONDITION_FAILED', operationsSubmitted > 0);
      }
      return makeReceipt(recovered ? 'verified-after-submission-error' : 'ready');
    }
    const fresh = await inspect(operationsSubmitted > 0);
    const freshPlan = greaterRealmProductionImportEngine.planNextOperation(
      baseStatus(fresh), authority, input.artifacts, input.importEpoch, input.publicName,
    );
    if (
      freshPlan === undefined
      || freshPlan.reducer !== planned.reducer
      || canonical(freshPlan.arguments) !== canonical(planned.arguments)
    ) {
      status = fresh;
      continue;
    }
    await input.transport.prepareSubmission?.();
    let submissionFailed = false;
    input.assertCanStartWrite();
    try {
      await input.transport.submit(
        planned.reducer,
        planned.arguments,
        input.assertCanStartWrite,
      );
    } catch {
      submissionFailed = true;
    }
    operationsSubmitted += 1;
    const after = await inspect(true);
    const advanced = greaterRealmProductionImportEngine.importOperationPostcondition({
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
          ? 'GENESIS_002_PRODUCTION_IMPORT_REJECTED_OR_UNCOMMITTED'
          : 'GENESIS_002_PRODUCTION_IMPORT_POSTCONDITION_FAILED',
        true,
      );
    }
    chain = createHash('sha256')
      .update('warpkeep.genesis-002.production-import-operation.v1\n')
      .update(chain)
      .update(canonical({
        ordinal: operationsSubmitted,
        reducer: planned.reducer,
        arguments: planned.arguments,
        before: fresh,
        after,
        outcome: submissionFailed ? 'verified-after-submission-error' : 'verified',
      }))
      .digest('hex');
    status = after;
    if (submissionFailed) recovered = true;
    if (exactReady(status, authority, input.importEpoch)) {
      return makeReceipt(recovered ? 'verified-after-submission-error' : 'ready');
    }
  }
  fail('GENESIS_002_PRODUCTION_IMPORT_OPERATION_LIMIT', operationsSubmitted > 0);
}

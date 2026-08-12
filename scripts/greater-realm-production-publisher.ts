import { execFileSync } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assertGreaterRealmPrivateInvocation } from './atlas/greater-realm-private-workspace';
import {
  cleanupGreaterRealmPublishSupervisor,
  attestPinnedSpacetimeCli,
  canonicalSchemaDescribeChildArguments,
  planGreaterRealmPublishSupervisor,
  inspectGreaterRealmPublishSupervisor,
  parseCanonicalSchemaDescription,
  publishChildEnvironment,
  publishModule,
  readFoundedPublishExpectations,
  type GreaterRealmPublishSupervisorPlan,
  type GreaterRealmPublishSupervisorIdentity,
  type MigrationArtifactReceipt,
} from './publish-spacetime-dev.mjs';
import {
  attestGreaterRealmRetainedImmutableArtifact,
  cleanupGreaterRealmRetainedImmutableArtifact,
  runGreaterRealmImmutableMigrationProof,
  type GreaterRealmImmutableProofRuntime,
  type GreaterRealmImmutableArtifactProof,
  type GreaterRealmImmutableArtifactRetentionRecord,
} from './greater-realm-production-immutable-artifact';
import { createGreaterRealmCutoverOperationJournalChain } from './greater-realm-cutover-operation-journal';
import {
  defaultGreaterRealmCutoverReceiptDirectory,
  GREATER_REALM_CUTOVER_RECEIPT_TARGET,
  inspectGreaterRealmCutoverOperatorJournalRecovery,
  recoverGreaterRealmCutoverOperatorJournal,
  recoverGreaterRealmCutoverOperatorLock,
  withGreaterRealmCutoverOperatorLock,
  writePrivateGreaterRealmCutoverReceipt,
} from './greater-realm-cutover-receipts';
import {
  executeGreaterRealmProductionPublishLane,
  greaterRealmProductionModuleDeltaPolicy,
  GREATER_REALM_PRODUCTION_PUBLISH_LANE,
  GREATER_REALM_PRODUCTION_RELEASE_FLAGS,
  GREATER_REALM_PRODUCTION_PUBLISH_TARGET,
  inspectGreaterRealmProductionPublisherRecoverySnapshot,
  requireGreaterRealmProductionPublishLane,
  type GreaterRealmProductionPublishLane,
} from './greater-realm-production-publisher-core';
import { inspectGreaterRealmLegacyProductionAggregate } from './greater-realm-production-legacy-aggregate';
import {
  attestGreaterRealmProductionAppendApprovalOnlyDelta,
  attestGreaterRealmProductionGateOnlyDelta,
  attestGreaterRealmProductionProtectedMain,
  inspectGreaterRealmProductionProvenance,
} from './greater-realm-production-provenance';
import {
  projectGreaterRealmProductionCutoverStatusForCompileMode,
  GREATER_REALM_PRODUCTION_CUTOVER_STATUS_PROCEDURE,
} from './greater-realm-production-relocation-core';
import {
  bindGreaterRealmProductionStatusTransport,
  createGreaterRealmAdminTransportSession,
  GREATER_REALM_PRODUCTION_TRANSPORT_TARGET,
  readGreaterRealmProductionAdminSecretFile,
  requireGreaterRealmProductionTransportTarget,
  type GreaterRealmProductionAdminSession,
} from './greater-realm-production-transport';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');
const STATUS_PROCEDURE = 'admin_get_greater_realm_status_v1';
const MAX_SCHEMA_DESCRIPTION_BYTES = 16 * 1024 * 1024;

export class GreaterRealmProductionPublisherCliError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmProductionPublisherCliError';
  }
}

function fail(code: string): never {
  throw new GreaterRealmProductionPublisherCliError(code);
}

async function withComposedCleanup<T>(
  operation: () => Promise<T>,
  cleanups: readonly (() => void | Promise<void>)[],
): Promise<T> {
  let result: T | undefined;
  const errors: unknown[] = [];
  try {
    result = await operation();
  } catch (error) {
    errors.push(error);
  }
  for (const cleanup of cleanups) {
    try { await cleanup(); } catch (error) { errors.push(error); }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, 'GREATER_REALM_PRODUCTION_PUBLISH_MULTIPLE_FAILURES');
  }
  return result as T;
}

export function parseGreaterRealmProductionPublisherArguments(
  arguments_: readonly string[],
): Readonly<
  | { lane: GreaterRealmProductionPublishLane; confirmed: true }
  | { command: 'recover-inspect'; confirmed: false }
  | { command: 'recover'; confirmed: true; recoveryConfirmationDigest: string }
> {
  if (arguments_.length === 1 && arguments_[0] === 'recover-inspect') {
    return Object.freeze({ command: 'recover-inspect', confirmed: false });
  }
  if (
    arguments_.length === 2
    && arguments_[0] === 'recover'
    && /^--confirm-recovery=[0-9a-f]{64}$/u.test(arguments_[1] ?? '')
  ) {
    return Object.freeze({
      command: 'recover',
      confirmed: true,
      recoveryConfirmationDigest: arguments_[1]!.slice('--confirm-recovery='.length),
    });
  }
  const lane = arguments_[0] as GreaterRealmProductionPublishLane | undefined;
  const flags = arguments_.slice(1);
  if (
    lane === undefined
    || !Object.values(GREATER_REALM_PRODUCTION_PUBLISH_LANE).includes(lane)
    || flags.length !== 1
    || flags[0] !== '--confirm'
  ) {
    fail(
      'GREATER_REALM_PRODUCTION_PUBLISH_USAGE: '
      + `<${Object.values(GREATER_REALM_PRODUCTION_PUBLISH_LANE).join('|')}> --confirm`
      + ' | recover-inspect | recover --confirm-recovery=<64hex>',
    );
  }
  return Object.freeze({ lane, confirmed: true });
}

function readSchema(executable: string): unknown {
  let output: string;
  try {
    output = execFileSync(
      executable,
      canonicalSchemaDescribeChildArguments(),
      {
        cwd: REPOSITORY_ROOT,
        encoding: 'utf8',
        env: publishChildEnvironment(),
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: MAX_SCHEMA_DESCRIPTION_BYTES,
        timeout: 30_000,
        killSignal: 'SIGKILL',
      },
    );
  } catch {
    fail('GREATER_REALM_PRODUCTION_SCHEMA_INSPECTION_UNAVAILABLE');
  }
  try {
    return parseCanonicalSchemaDescription(output);
  } catch {
    fail('GREATER_REALM_PRODUCTION_SCHEMA_INSPECTION_INVALID');
  }
}

function historicalAggregate(
  session: Parameters<typeof inspectGreaterRealmLegacyProductionAggregate>[0]['session'],
  expectations: ReturnType<typeof readFoundedPublishExpectations>,
): Promise<Readonly<Record<string, unknown>>> {
  return inspectGreaterRealmLegacyProductionAggregate({ session, expectations });
}

function cutoverHistoricalAggregate(
  value: unknown,
  expected: Readonly<{
    atlasSourceCommit: string;
    atlasId: string;
    publicReleaseId: string;
    expectedReleaseSha256: string;
  }>,
) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('GREATER_REALM_PRODUCTION_CUTOVER_AGGREGATE_INVALID');
  }
  const raw = value as Readonly<Record<string, unknown>>;
  const importMutationsCompiled = raw.importMutationsCompiled;
  const activationMutationsCompiled = raw.activationMutationsCompiled;
  if (
    typeof importMutationsCompiled !== 'boolean'
    || typeof activationMutationsCompiled !== 'boolean'
    || importMutationsCompiled === activationMutationsCompiled
  ) fail('GREATER_REALM_PRODUCTION_CUTOVER_AGGREGATE_COMPILE_MODE_INVALID');
  const status = projectGreaterRealmProductionCutoverStatusForCompileMode(value, {
    importMutationsCompiled,
    activationMutationsCompiled,
  });
  if (
    status.sourceCommit !== expected.atlasSourceCommit
    || status.atlasId !== expected.atlasId
    || status.publicReleaseId !== expected.publicReleaseId
    || status.expectedReleaseSha256 !== expected.expectedReleaseSha256
  ) {
    fail('GREATER_REALM_PRODUCTION_CUTOVER_AGGREGATE_RELEASE_MISMATCH');
  }
  return Object.freeze(Object.fromEntries(Object.entries(status).filter(([key]) => (
    key !== 'importMutationsCompiled' && key !== 'activationMutationsCompiled'
  ))));
}

function usesCutoverAggregateOnly(lane: GreaterRealmProductionPublishLane): boolean {
  return lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_ACTIVATION_CANARY_V17
    || lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_ACTIVATION_ACTIVE_V17
    || lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_ACTIVATION_HALTED_V17;
}

function usesCutoverAggregate(lane: GreaterRealmProductionPublishLane): boolean {
  return lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.HANDOFF_ACTIVATION_READY_V17
    || lane.startsWith('forward-activation-');
}

function canonicalPublisherRecoveryJson(value: unknown): string {
  const visit = (current: unknown): unknown => {
    if (typeof current === 'bigint') return current.toString();
    if (Array.isArray(current)) return current.map(visit);
    if (current !== null && typeof current === 'object') {
      return Object.fromEntries(Object.entries(current as Readonly<Record<string, unknown>>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, visit(child)]));
    }
    return current;
  };
  return JSON.stringify(visit(value));
}

function publisherRecoveryRecord(value: unknown, code: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Readonly<Record<string, unknown>>;
}

const PUBLISH_ARTIFACT_DIGEST_KEYS = Object.freeze([
  'artifactDigest',
  'v11TableSchemaDigest',
  'v12TableSchemaDigest',
  'v13TableSchemaDigest',
  'v14TableSchemaDigest',
  'v15TableSchemaDigest',
  'v16TableSchemaDigest',
  'v17TableSchemaDigest',
] as const);

function publisherRecoveryArtifactReceipt(
  auditValue: unknown,
  artifactPath: string,
): MigrationArtifactReceipt {
  const audit = publisherRecoveryRecord(
    auditValue,
    'GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_ARTIFACT_INVALID',
  );
  if (
    typeof artifactPath !== 'string' || !isAbsolute(artifactPath)
    || resolve(artifactPath) !== artifactPath
    || PUBLISH_ARTIFACT_DIGEST_KEYS.some(key => (
      typeof audit[key] !== 'string' || !/^[0-9a-f]{64}$/u.test(audit[key] as string)
    ))
  ) fail('GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_ARTIFACT_INVALID');
  return Object.freeze({
    artifactPath,
    artifactDigest: audit.artifactDigest as string,
    v11TableSchemaDigest: audit.v11TableSchemaDigest as string,
    v12TableSchemaDigest: audit.v12TableSchemaDigest as string,
    v13TableSchemaDigest: audit.v13TableSchemaDigest as string,
    v14TableSchemaDigest: audit.v14TableSchemaDigest as string,
    v15TableSchemaDigest: audit.v15TableSchemaDigest as string,
    v16TableSchemaDigest: audit.v16TableSchemaDigest as string,
    v17TableSchemaDigest: audit.v17TableSchemaDigest as string,
  });
}

function exactPublisherRecoveryArtifactReceipt(
  value: unknown,
): MigrationArtifactReceipt {
  const record = publisherRecoveryRecord(
    value,
    'GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_ARTIFACT_INVALID',
  );
  const receipt = publisherRecoveryArtifactReceipt(
    record,
    typeof record.artifactPath === 'string' ? record.artifactPath : '',
  );
  if (canonicalPublisherRecoveryJson(record) !== canonicalPublisherRecoveryJson(receipt)) {
    fail('GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_ARTIFACT_INVALID');
  }
  return receipt;
}

function assertPublisherRecoveryArtifactAudit(
  auditValue: unknown,
  receipt: MigrationArtifactReceipt,
): void {
  const fromAudit = publisherRecoveryArtifactReceipt(auditValue, receipt.artifactPath);
  if (canonicalPublisherRecoveryJson(fromAudit) !== canonicalPublisherRecoveryJson(receipt)) {
    fail('GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_ARTIFACT_INVALID');
  }
}

function publisherRecoveryOperationAuthority(input: Readonly<{
  command: unknown;
  operation: unknown;
  retention: GreaterRealmImmutableArtifactRetentionRecord;
}>) {
  const command = publisherRecoveryRecord(
    input.command,
    'GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_COMMAND_MISMATCH',
  );
  const operation = publisherRecoveryRecord(
    input.operation,
    'GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_COMMAND_MISMATCH',
  );
  const identity = publisherRecoveryRecord(
    operation.identity,
    'GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_COMMAND_MISMATCH',
  );
  const lane = command.name as GreaterRealmProductionPublishLane;
  if (
    command.kind !== 'publish'
    || !Object.values(GREATER_REALM_PRODUCTION_PUBLISH_LANE).includes(lane)
    || operation.kind !== 'publish' || operation.name !== lane
    || identity.lane !== lane
    || identity.moduleDeltaPolicy !== greaterRealmProductionModuleDeltaPolicy(lane)
  ) fail('GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_COMMAND_MISMATCH');
  const receipt = exactPublisherRecoveryArtifactReceipt(identity.artifactReceipt);
  if (
    receipt.artifactPath !== input.retention.artifactPath
    || identity.artifactDigest !== receipt.artifactDigest
    || identity.v14TableSchemaDigest !== receipt.v14TableSchemaDigest
    || identity.v17TableSchemaDigest !== receipt.v17TableSchemaDigest
    || input.retention.artifactDigest !== receipt.artifactDigest
  ) fail('GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_ARTIFACT_INVALID');
  return Object.freeze({
    lane,
    receipt,
    supervisorIdentity:
      identity.publishSupervisorIdentity as unknown as GreaterRealmPublishSupervisorIdentity,
    publishExecutableIdentity: identity.publishExecutableIdentity,
  });
}

type RecoveredPublisherChain = Parameters<NonNullable<
  Parameters<typeof recoverGreaterRealmCutoverOperatorJournal>[0]['commandReceiptForRecoveredChain']
>>[0];

function reconstructRecoveredPublisherReceipt(
  chain: RecoveredPublisherChain,
  retention: GreaterRealmImmutableArtifactRetentionRecord,
) {
  const lane = chain.command.name as GreaterRealmProductionPublishLane;
  const after = publisherRecoveryRecord(
    chain.afterStatus,
    'GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_RECEIPT_INVALID',
  );
  const afterAudit = publisherRecoveryRecord(
    chain.afterAudit,
    'GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_RECEIPT_INVALID',
  );
  const artifactReceipt = publisherRecoveryArtifactReceipt(
    afterAudit,
    retention.artifactPath,
  );
  const operation = chain.operations[0];
  const operationIdentity = operation === undefined
    ? undefined
    : publisherRecoveryRecord(
        operation.operation.identity,
        'GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_RECEIPT_INVALID',
      );
  const operationAfter = operation === undefined
    ? undefined
    : publisherRecoveryRecord(
        operation.afterStatus,
        'GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_RECEIPT_INVALID',
      );
  const operationArtifactReceipt = operationIdentity === undefined
    ? undefined
    : exactPublisherRecoveryArtifactReceipt(operationIdentity.artifactReceipt);
  if (
    chain.command.kind !== 'publish'
    || !Object.values(GREATER_REALM_PRODUCTION_PUBLISH_LANE).includes(lane)
    || chain.operations.length !== 1 || chain.operationReceiptCount !== 1
    || operation?.operationOrdinal !== 1
    || operation.operation.kind !== 'publish'
    || operation.operation.name !== lane
    || operationIdentity?.lane !== lane
    || operationIdentity.moduleDeltaPolicy !== greaterRealmProductionModuleDeltaPolicy(lane)
    || canonicalPublisherRecoveryJson(operationArtifactReceipt)
      !== canonicalPublisherRecoveryJson(artifactReceipt)
    || operationIdentity.artifactDigest !== artifactReceipt.artifactDigest
    || operationIdentity.v14TableSchemaDigest !== artifactReceipt.v14TableSchemaDigest
    || operationIdentity.v17TableSchemaDigest !== artifactReceipt.v17TableSchemaDigest
    || retention.moduleSourceCommit !== chain.sourceRelease.moduleSourceCommit
    || retention.artifactDigest !== artifactReceipt.artifactDigest
    || after.lane !== lane
    || after.moduleDeltaPolicy !== greaterRealmProductionModuleDeltaPolicy(lane)
    || typeof after.schemaDigest !== 'string'
    || after.schemaDigest !== artifactReceipt.v17TableSchemaDigest
    || typeof after.importMutationsCompiled !== 'boolean'
    || typeof after.activationMutationsCompiled !== 'boolean'
    || typeof after.releaseState !== 'string'
    || !(after.activationMode === null || typeof after.activationMode === 'string')
    || typeof after.historicalAggregateDigest !== 'string'
    || !/^[0-9a-f]{64}$/u.test(after.historicalAggregateDigest)
    || after.historicalAggregateDigest !== afterAudit.historicalAggregateDigest
    || operationAfter?.schemaDigest !== after.schemaDigest
    || operationAfter.importMutationsCompiled !== after.importMutationsCompiled
    || operationAfter.activationMutationsCompiled !== after.activationMutationsCompiled
  ) fail('GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_RECEIPT_INVALID');
  assertPublisherRecoveryArtifactAudit(chain.beforeAudit, artifactReceipt);
  assertPublisherRecoveryArtifactAudit(chain.afterAudit, artifactReceipt);
  assertPublisherRecoveryArtifactAudit(operation.beforeAudit, artifactReceipt);
  assertPublisherRecoveryArtifactAudit(operation.afterAudit, artifactReceipt);
  const recoveredAfterSubmissionError = operation.outcome !== 'verified';
  return Object.freeze({
    kind: 'warpkeep-greater-realm-production-publish-v1' as const,
    record: Object.freeze({
      schemaVersion: 1,
      kind: 'warpkeep-greater-realm-production-publish-v1',
      lane,
      outcome: recoveredAfterSubmissionError
        ? 'verified-after-submission-error'
        : 'verified',
      target: GREATER_REALM_PRODUCTION_PUBLISH_TARGET,
      atlasSourceCommit: chain.sourceRelease.atlasSourceCommit,
      atlasId: chain.sourceRelease.atlasId,
      publicReleaseId: chain.sourceRelease.publicReleaseId,
      expectedReleaseSha256: chain.sourceRelease.expectedReleaseSha256,
      moduleSourceCommit: chain.sourceRelease.moduleSourceCommit,
      moduleDeltaPolicy: greaterRealmProductionModuleDeltaPolicy(lane),
      artifactDigest: artifactReceipt.artifactDigest,
      v14TableSchemaDigest: artifactReceipt.v14TableSchemaDigest,
      v17TableSchemaDigest: artifactReceipt.v17TableSchemaDigest,
      predecessorTableCount:
        lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.APPEND_INERT_V17 ? 56 : 84,
      postTableCount: 84,
      schemaMutation:
        lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.APPEND_INERT_V17
          ? 'append-28'
          : 'none',
      importMutationsCompiled: after.importMutationsCompiled,
      activationMutationsCompiled: after.activationMutationsCompiled,
      releaseState: after.releaseState,
      ...(after.activationMode === null ? {} : { activationMode: after.activationMode }),
      historicalAggregateDigest: after.historicalAggregateDigest,
      operationReceiptChainDigest: chain.operationReceiptChainDigest,
      operationReceiptCount: chain.operationReceiptCount,
      moduleTreeId: retention.moduleTreeId,
      dependencyClosureDigest: retention.dependencyClosureDigest,
    }),
  });
}

/**
 * A module replacement can leave the pre-publish websocket looking live for a
 * short interval. This boundary is deliberately outside the publisher's
 * ambiguous-outcome logic: the write is attempted exactly once, then all
 * reconciliation reads authenticate a new connection whether the child
 * reported success or threw.
 */
export async function publishGreaterRealmModuleWithFreshPostflight(input: Readonly<{
  session: GreaterRealmProductionAdminSession;
  publish: () => Promise<void>;
}>): Promise<void> {
  try {
    await input.publish();
  } finally {
    await input.session.invalidate();
  }
}

function prepareGreaterRealmPublisherLocalAuthorities(input: Readonly<{
  supervisorRoot: string;
  spacetimeCliConfigPath?: string;
  adminSecret?: string;
  adminSecretPath?: string;
  planSupervisor?: typeof planGreaterRealmPublishSupervisor;
  readAdminSecretFile?: typeof readGreaterRealmProductionAdminSecretFile;
}>): Readonly<{
  supervisor: GreaterRealmPublishSupervisorPlan;
  adminSecret: string;
}> {
  if (input.spacetimeCliConfigPath === undefined) {
    fail('GREATER_REALM_PRODUCTION_SPACETIME_CLI_CONFIG_PATH_REQUIRED');
  }
  const supervisor = (input.planSupervisor ?? planGreaterRealmPublishSupervisor)(
    input.supervisorRoot,
    input.spacetimeCliConfigPath,
  );
  let adminSecret = input.adminSecret;
  if (adminSecret === undefined) {
    if (input.adminSecretPath === undefined) {
      fail('GREATER_REALM_PRODUCTION_ADMIN_SECRET_PATH_REQUIRED');
    }
    adminSecret = (input.readAdminSecretFile ?? readGreaterRealmProductionAdminSecretFile)(
      input.adminSecretPath,
    );
  }
  return Object.freeze({ supervisor, adminSecret });
}

export async function executeGreaterRealmProductionPublisherCli(input: Readonly<{
  lane: GreaterRealmProductionPublishLane;
  confirmed: true;
  adminSecret?: string;
  adminSecretPath?: string;
  spacetimeCliConfigPath?: string;
  dependencyCacheRoot?: string;
  proofRuntime?: GreaterRealmImmutableProofRuntime;
  environment: Readonly<Record<string, string | undefined>>;
  receiptDirectory?: string;
  workspaceRoot?: string;
  executable?: string;
  attestProtectedMain?: () => string;
  runMigrationProof?: (
    executable: string,
    moduleSourceCommit: string,
  ) => GreaterRealmImmutableArtifactProof;
}>): Promise<Readonly<Record<string, unknown>>> {
  requireGreaterRealmProductionPublishLane(
    input.lane,
    GREATER_REALM_PRODUCTION_RELEASE_FLAGS,
  );
  requireGreaterRealmProductionTransportTarget(input.environment);
  const provenance = inspectGreaterRealmProductionProvenance({
    repositoryRoot: REPOSITORY_ROOT,
    workspaceRoot: input.workspaceRoot,
    attestModuleSourceCommit: input.attestProtectedMain ?? (() => (
      attestGreaterRealmProductionProtectedMain(REPOSITORY_ROOT)
    )),
  });
  const {
    atlasSourceCommit,
    atlasId,
    publicReleaseId,
    expectedReleaseSha256,
    moduleSourceCommit,
  } = provenance;
  const expectedAtlasRelease = Object.freeze({
    atlasSourceCommit,
    atlasId,
    publicReleaseId,
    expectedReleaseSha256,
  });
  if (input.lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.APPEND_INERT_V17) {
    attestGreaterRealmProductionAppendApprovalOnlyDelta({
      repositoryRoot: REPOSITORY_ROOT,
      atlasSourceCommit,
      moduleSourceCommit,
    });
  }
  if (input.lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.ENABLE_IMPORT_ONLY_V17) {
    attestGreaterRealmProductionGateOnlyDelta({
      repositoryRoot: REPOSITORY_ROOT,
      atlasSourceCommit,
      moduleSourceCommit,
      gate: 'import',
    });
  }
  if (input.lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.HANDOFF_ACTIVATION_READY_V17) {
    attestGreaterRealmProductionGateOnlyDelta({
      repositoryRoot: REPOSITORY_ROOT,
      atlasSourceCommit,
      moduleSourceCommit,
      gate: 'activation',
    });
  }
  const receiptDirectory = input.receiptDirectory
    ?? defaultGreaterRealmCutoverReceiptDirectory();
  return withGreaterRealmCutoverOperatorLock({
    directory: receiptDirectory,
    repositoryRoot: REPOSITORY_ROOT,
    operation: async control => {
      const executableSnapshot = attestPinnedSpacetimeCli(
        input.executable ?? input.environment.SPACETIME_BIN ?? 'spacetime',
      );
      let immutableProof: GreaterRealmImmutableArtifactProof | undefined;
      let operationJournal: ReturnType<typeof createGreaterRealmCutoverOperationJournalChain>
        | undefined;
      let publishSupervisor: GreaterRealmPublishSupervisorPlan | undefined;
      let session: GreaterRealmProductionAdminSession | undefined;
      return withComposedCleanup(async () => {
        immutableProof = (
          input.runMigrationProof
          ?? ((executable, sourceCommit) => runGreaterRealmImmutableMigrationProof({
            repositoryRoot: REPOSITORY_ROOT,
            moduleSourceCommit: sourceCommit,
            executable,
            dependencyCacheRoot: input.dependencyCacheRoot,
            proofRuntime: input.proofRuntime,
            operatorAuthority: Object.freeze({
              receiptDirectory,
              lockIdentity: control.lockIdentity,
            }),
          }))
        )(executableSnapshot.path, moduleSourceCommit);
        if (immutableProof.moduleSourceCommit !== moduleSourceCommit) {
          fail('GREATER_REALM_PRODUCTION_IMMUTABLE_PROOF_SOURCE_MISMATCH');
        }
        if (immutableProof.artifactPath !== immutableProof.artifactReceipt.artifactPath) {
          fail('GREATER_REALM_PRODUCTION_IMMUTABLE_PROOF_ARTIFACT_MISMATCH');
        }
        const privateArtifactPath = immutableProof.artifactPath;
        const artifactReceipt = immutableProof.artifactReceipt;
        const expectations = readFoundedPublishExpectations(input.environment);
        // Validate every remaining local authority before opening the database
        // administrator secret. The supervisor plan only attests the source
        // cli.toml path; it allocates or spawns nothing until publish begins.
        const localAuthorities = prepareGreaterRealmPublisherLocalAuthorities({
          supervisorRoot: resolve(
            receiptDirectory,
            '..',
            'greater-realm-publish-supervisors-v1',
          ),
          spacetimeCliConfigPath: input.spacetimeCliConfigPath,
          adminSecret: input.adminSecret,
          adminSecretPath: input.adminSecretPath,
        });
        publishSupervisor = localAuthorities.supervisor;
        let adminSecret = localAuthorities.adminSecret;
        operationJournal = createGreaterRealmCutoverOperationJournalChain({
          directory: receiptDirectory,
          repositoryRoot: REPOSITORY_ROOT,
          control,
          command: Object.freeze({ kind: 'publish', name: input.lane }),
          target: GREATER_REALM_CUTOVER_RECEIPT_TARGET,
          sourceRelease: Object.freeze({
            atlasSourceCommit,
            moduleSourceCommit,
            atlasId,
            publicReleaseId,
            expectedReleaseSha256,
          }),
          artifactRetentionRecord: immutableProof.retentionRecord,
        });
        // The journal group is durable before the local build intent records
        // adoption. A crash on either side therefore leaves at least one exact
        // recovery authority for these artifact bytes.
        immutableProof.adoptJournalRetention(operationJournal.authority());
        session = createGreaterRealmAdminTransportSession({ adminSecret });
        const activeSession = session;
        adminSecret = '';
        const transport = bindGreaterRealmProductionStatusTransport(activeSession, STATUS_PROCEDURE);
        const cutoverTransport = bindGreaterRealmProductionStatusTransport(
          activeSession,
          GREATER_REALM_PRODUCTION_CUTOVER_STATUS_PROCEDURE,
        );
          const receipt = await executeGreaterRealmProductionPublishLane({
            lane: input.lane,
            expectedAtlasSourceCommit: atlasSourceCommit,
            expectedAtlasId: atlasId,
            expectedPublicReleaseId: publicReleaseId,
            expectedReleaseSha256,
            moduleSourceCommit,
            moduleDeltaPolicy: greaterRealmProductionModuleDeltaPolicy(input.lane),
            // These remain compile-time false until a separately reviewed release
            // changes the exact approval envelope.
            flags: GREATER_REALM_PRODUCTION_RELEASE_FLAGS,
            artifactReceipt,
            readSchema: () => Promise.resolve(readSchema(executableSnapshot.path)),
            readImportStatus: transport.inspect,
            readCutoverStatus: cutoverTransport.inspect,
            readHistoricalAggregate: async () => {
              if (!usesCutoverAggregate(input.lane)) {
                return historicalAggregate(activeSession, expectations);
              }
              const cutover = cutoverHistoricalAggregate(
                await cutoverTransport.inspect(),
                expectedAtlasRelease,
              );
              if (usesCutoverAggregateOnly(input.lane)) return cutover;
              return Object.freeze({
                cutover,
                legacy: await historicalAggregate(activeSession, expectations),
              });
            },
            assertCanStartWrite: control.assertCanStartWrite,
            operationJournal,
            publishExecutableIdentity: Object.freeze({
              path: executableSnapshot.path,
              digest: executableSnapshot.digest,
            }),
            publishSupervisorIdentity: publishSupervisor.identity,
            publish: writePermit => publishGreaterRealmModuleWithFreshPostflight({
              session: activeSession,
              publish: () => publishModule(
                  executableSnapshot.path,
                  GREATER_REALM_PRODUCTION_TRANSPORT_TARGET.database,
                  artifactReceipt,
                  undefined,
                  writePermit ?? control.assertCanStartWrite,
                  privateArtifactPath,
                  async () => {
                    const currentSourceCommit = (
                      input.attestProtectedMain
                      ?? (() => attestGreaterRealmProductionProtectedMain(REPOSITORY_ROOT))
                    )();
                    if (currentSourceCommit !== moduleSourceCommit) {
                      fail('GREATER_REALM_PRODUCTION_MODULE_SOURCE_ADVANCED');
                    }
                    // Mint the held reconciliation credential only after the
                    // immutable snapshot and protected-main reattestation.
                    await activeSession.prepareSubmission();
                  },
                  publishSupervisor,
                ),
            }),
          });
          const commandReceipt = operationJournal.prepareCommandReceipt({
            kind: 'warpkeep-greater-realm-production-publish-v1',
            record: Object.freeze({
              ...receipt,
              moduleTreeId: immutableProof.moduleTreeId,
              dependencyClosureDigest: immutableProof.dependencyClosureDigest,
            }),
          });
          const privateReceipt = writePrivateGreaterRealmCutoverReceipt({
            directory: receiptDirectory,
            repositoryRoot: REPOSITORY_ROOT,
            kind: 'warpkeep-greater-realm-production-publish-v1',
            record: {
              ...receipt,
              moduleTreeId: immutableProof.moduleTreeId,
              dependencyClosureDigest: immutableProof.dependencyClosureDigest,
            },
            now: new Date(commandReceipt.recordedAt),
          });
          if (
            privateReceipt.receiptDigest !== commandReceipt.receiptDigest
            || privateReceipt.path !== resolve(receiptDirectory, commandReceipt.receiptBasename)
          ) fail('GREATER_REALM_PRODUCTION_PUBLISH_RECEIPT_JOURNAL_MISMATCH');
          operationJournal.completeCommandReceipt({
            path: privateReceipt.path,
            receiptDigest: privateReceipt.receiptDigest,
            cleanupArtifact: (record, context) => {
              if (
                context.groupDigest !== operationJournal!.authority().groupDigest
                || context.command.kind !== 'publish'
                || context.command.name !== input.lane
                || context.operations.length !== 1
              ) fail('GREATER_REALM_PRODUCTION_PUBLISH_CLEANUP_AUTHORITY_INVALID');
              for (const completed of context.operations) {
                const authority = publisherRecoveryOperationAuthority({
                  command: context.command,
                  operation: completed.operation,
                  retention: record,
                });
                if (
                  canonicalPublisherRecoveryJson(authority.receipt)
                    !== canonicalPublisherRecoveryJson(artifactReceipt)
                ) fail('GREATER_REALM_PRODUCTION_PUBLISH_CLEANUP_AUTHORITY_INVALID');
                const inspection = inspectGreaterRealmPublishSupervisor(
                  authority.supervisorIdentity,
                );
                if (inspection.processGroupExists) {
                  fail('GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_PROCESS_GROUP_LIVE');
                }
                cleanupGreaterRealmPublishSupervisor(inspection.identity);
              }
              cleanupGreaterRealmRetainedImmutableArtifact({
                repositoryRoot: REPOSITORY_ROOT,
                record,
              });
            },
          });
          return Object.freeze({
            lane: receipt.lane,
            outcome: receipt.outcome,
            atlasSourceCommit: receipt.atlasSourceCommit,
            atlasId: receipt.atlasId,
            publicReleaseId: receipt.publicReleaseId,
            expectedReleaseSha256: receipt.expectedReleaseSha256,
            moduleSourceCommit: receipt.moduleSourceCommit,
            moduleTreeId: immutableProof.moduleTreeId,
            dependencyClosureDigest: immutableProof.dependencyClosureDigest,
            moduleDeltaPolicy: receipt.moduleDeltaPolicy,
            postTableCount: receipt.postTableCount,
            schemaMutation: receipt.schemaMutation,
            importMutationsCompiled: receipt.importMutationsCompiled,
            activationMutationsCompiled: receipt.activationMutationsCompiled,
            releaseState: receipt.releaseState,
            activationMode: receipt.activationMode,
            receiptDigest: privateReceipt.receiptDigest,
            deletion: 'disabled',
            clientActivation: 'separate',
            admissionNotifications: 'separate',
          });
      }, [
        async () => session?.close(),
        async () => {
          if (operationJournal?.retainsArtifact() !== true) {
            await publishSupervisor?.cleanup();
          }
        },
        () => {
          if (operationJournal?.retainsArtifact() !== true) immutableProof?.cleanup();
        },
        () => {
          if (operationJournal?.retainsArtifact() !== true) executableSnapshot.cleanup();
        },
      ]);
    },
  });
}

export async function executeGreaterRealmProductionPublisherRecovery(input: Readonly<{
  command: 'recover-inspect' | 'recover';
  confirmed: boolean;
  recoveryConfirmationDigest?: string;
  adminSecret?: string;
  adminSecretPath?: string;
  spacetimeCliConfigPath?: string;
  environment: Readonly<Record<string, string | undefined>>;
  receiptDirectory?: string;
  workspaceRoot?: string;
  executable?: string;
  attestProtectedMain?: () => string;
  testOnlyDependencies?: Readonly<{
    inspectRecovery?: typeof inspectGreaterRealmCutoverOperatorJournalRecovery;
    recoverLock?: typeof recoverGreaterRealmCutoverOperatorLock;
    recoverJournal?: typeof recoverGreaterRealmCutoverOperatorJournal;
    inspectProvenance?: typeof inspectGreaterRealmProductionProvenance;
    readExpectations?: typeof readFoundedPublishExpectations;
    attestCli?: typeof attestPinnedSpacetimeCli;
    createSession?: typeof createGreaterRealmAdminTransportSession;
    inspectSnapshot?: (
      lane: GreaterRealmProductionPublishLane,
      receipt: MigrationArtifactReceipt,
    ) => ReturnType<typeof inspectGreaterRealmProductionPublisherRecoverySnapshot>;
    planSupervisor?: typeof planGreaterRealmPublishSupervisor;
    inspectSupervisor?: typeof inspectGreaterRealmPublishSupervisor;
    cleanupSupervisor?: typeof cleanupGreaterRealmPublishSupervisor;
    attestArtifact?: typeof attestGreaterRealmRetainedImmutableArtifact;
    cleanupArtifact?: typeof cleanupGreaterRealmRetainedImmutableArtifact;
    executePublishLane?: typeof executeGreaterRealmProductionPublishLane;
    publishModule?: typeof publishModule;
  }>;
}>): Promise<Readonly<Record<string, unknown>>> {
  const dependencies = input.testOnlyDependencies;
  const inspectRecovery = dependencies?.inspectRecovery
    ?? inspectGreaterRealmCutoverOperatorJournalRecovery;
  const recoverLock = dependencies?.recoverLock ?? recoverGreaterRealmCutoverOperatorLock;
  const recoverJournal = dependencies?.recoverJournal
    ?? recoverGreaterRealmCutoverOperatorJournal;
  const inspectProvenance = dependencies?.inspectProvenance
    ?? inspectGreaterRealmProductionProvenance;
  const readExpectations = dependencies?.readExpectations ?? readFoundedPublishExpectations;
  const attestCli = dependencies?.attestCli ?? attestPinnedSpacetimeCli;
  const createSession = dependencies?.createSession ?? createGreaterRealmAdminTransportSession;
  const planSupervisor = dependencies?.planSupervisor ?? planGreaterRealmPublishSupervisor;
  const inspectSupervisor = dependencies?.inspectSupervisor
    ?? inspectGreaterRealmPublishSupervisor;
  const cleanupSupervisor = dependencies?.cleanupSupervisor
    ?? cleanupGreaterRealmPublishSupervisor;
  const attestArtifact = dependencies?.attestArtifact
    ?? attestGreaterRealmRetainedImmutableArtifact;
  const cleanupArtifact = dependencies?.cleanupArtifact
    ?? cleanupGreaterRealmRetainedImmutableArtifact;
  const executePublishLane = dependencies?.executePublishLane
    ?? executeGreaterRealmProductionPublishLane;
  const publishModuleForRecovery = dependencies?.publishModule ?? publishModule;
  const receiptDirectory = input.receiptDirectory
    ?? defaultGreaterRealmCutoverReceiptDirectory();
  const initial = inspectRecovery({
    directory: receiptDirectory,
    repositoryRoot: REPOSITORY_ROOT,
  });
  if (initial.plan !== null && initial.plan.command.kind !== 'publish') {
    fail('GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_COMMAND_MISMATCH');
  }
  if (input.command === 'recover-inspect') {
    return Object.freeze({
      command: 'recover-inspect',
      recoveryMode: initial.recoveryMode,
      recoveryEligible: initial.recoveryEligible,
      recoveryOwnerState: initial.recoveryOwnerState,
      recoveryOwnerExpiresAtMs: initial.recoveryOwnerExpiresAtMs,
      groupDigest: initial.plan?.groupDigest,
      operationReceiptChainDigest: initial.plan?.operationReceiptChainDigest,
      operationReceiptCount: initial.plan?.operationReceiptCount,
      confirmationDigest: initial.confirmationDigest,
      deletion: 'disabled',
      networkMode: 'read-only-local',
    });
  }
  if (
    !input.confirmed || input.recoveryConfirmationDigest === undefined
    || initial.confirmationDigest !== input.recoveryConfirmationDigest
  ) fail('GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_CONFIRMATION_REQUIRED');
  if (initial.recoveryMode === 'lock-only') {
    recoverLock({
      directory: receiptDirectory,
      repositoryRoot: REPOSITORY_ROOT,
      confirmationDigest: input.recoveryConfirmationDigest,
    });
    return Object.freeze({
      command: 'recover',
      recoveryMode: 'lock-only',
      outcome: 'cleared-dead-lock',
      deletion: 'disabled',
      networkMode: 'none',
    });
  }
  if (initial.recoveryMode === 'command-receipt') {
    const recovered = await recoverJournal({
      directory: receiptDirectory,
      repositoryRoot: REPOSITORY_ROOT,
      confirmationDigest: input.recoveryConfirmationDigest,
      inspect: async () => fail(
        'GREATER_REALM_PRODUCTION_PUBLISH_LOCAL_RECOVERY_INSPECTION_FORBIDDEN',
      ),
    });
    return Object.freeze({
      command: 'recover',
      recoveryMode: 'command-receipt',
      outcome: recovered.recovery.outcome,
      groupDigest: recovered.recovery.groupDigest,
      operationReceiptChainDigest: recovered.recovery.operationReceiptChainDigest,
      operationReceiptCount: recovered.recovery.operationReceiptCount,
      commandReceiptDigest: recovered.recovery.commandReceiptDigest,
      deletion: 'disabled',
      networkMode: 'none',
    });
  }
  const recoveryExecutable = input.executable ?? input.environment.SPACETIME_BIN;
  if (
    (input.adminSecret === undefined) === (input.adminSecretPath === undefined)
    || input.spacetimeCliConfigPath === undefined
    || recoveryExecutable === undefined
  ) fail('GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_AUTHORITY_REQUIRED');
  requireGreaterRealmProductionTransportTarget(input.environment);
  const provenance = inspectProvenance({
    repositoryRoot: REPOSITORY_ROOT,
    workspaceRoot: input.workspaceRoot,
    attestModuleSourceCommit: input.attestProtectedMain ?? (() => (
      attestGreaterRealmProductionProtectedMain(REPOSITORY_ROOT)
    )),
  });
  const expectations = readExpectations(input.environment);
  // This is the final local authority check before recovery claims ownership
  // and prepareRecovery opens the administrator secret. The plan is reusable
  // if a zero-write operation must resume, and remains unallocated otherwise.
  const recoverySupervisor = planSupervisor(
    resolve(receiptDirectory, '..', 'greater-realm-publish-supervisors-v1'),
    input.spacetimeCliConfigPath,
  );
  const executableSnapshot = attestCli(recoveryExecutable);
  let session: GreaterRealmProductionAdminSession | undefined;
  let statusTransport: ReturnType<typeof bindGreaterRealmProductionStatusTransport>
    | undefined;
  let cutoverTransport: ReturnType<typeof bindGreaterRealmProductionStatusTransport>
    | undefined;
  let retention: GreaterRealmImmutableArtifactRetentionRecord | undefined;
  let artifactReceipt: MigrationArtifactReceipt | undefined;
  let recoveryCompleted = false;
  let newExecutableBoundToIncompleteOperation = false;
  const supervisors = new Map<string, GreaterRealmPublishSupervisorIdentity>();
  const requireSession = (): GreaterRealmProductionAdminSession => {
    if (session !== undefined) return session;
    const secret = input.adminSecret
      ?? readGreaterRealmProductionAdminSecretFile(input.adminSecretPath!);
    session = createSession({ adminSecret: secret });
    return session;
  };
  const requireStatusTransport = () => {
    statusTransport ??= bindGreaterRealmProductionStatusTransport(
      requireSession(),
      STATUS_PROCEDURE,
    );
    return statusTransport;
  };
  const requireCutoverTransport = () => {
    cutoverTransport ??= bindGreaterRealmProductionStatusTransport(
      requireSession(),
      GREATER_REALM_PRODUCTION_CUTOVER_STATUS_PROCEDURE,
    );
    return cutoverTransport;
  };
  const assertSourceRelease = (sourceValue: unknown): void => {
    const source = publisherRecoveryRecord(
      sourceValue,
      'GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_SOURCE_MISMATCH',
    );
    if (
      source.atlasSourceCommit !== provenance.atlasSourceCommit
      || source.moduleSourceCommit !== provenance.moduleSourceCommit
      || source.atlasId !== provenance.atlasId
      || source.publicReleaseId !== provenance.publicReleaseId
      || source.expectedReleaseSha256 !== provenance.expectedReleaseSha256
    ) fail('GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_SOURCE_MISMATCH');
  };
  const expectedAtlasRelease = Object.freeze({
    atlasSourceCommit: provenance.atlasSourceCommit,
    atlasId: provenance.atlasId,
    publicReleaseId: provenance.publicReleaseId,
    expectedReleaseSha256: provenance.expectedReleaseSha256,
  });
  const readHistoricalAggregateForLane = async (
    lane: GreaterRealmProductionPublishLane,
  ): Promise<unknown> => {
    if (!usesCutoverAggregate(lane)) {
      return historicalAggregate(requireSession(), expectations);
    }
    const cutover = cutoverHistoricalAggregate(
      await requireCutoverTransport().inspect(),
      expectedAtlasRelease,
    );
    if (usesCutoverAggregateOnly(lane)) return cutover;
    return Object.freeze({
      cutover,
      legacy: await historicalAggregate(requireSession(), expectations),
    });
  };
  const operationIdentityContext = (
    commandValue: unknown,
    operationValue: unknown,
  ) => {
    if (retention === undefined) {
      fail('GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_ARTIFACT_INVALID');
    }
    return publisherRecoveryOperationAuthority({
      command: commandValue,
      operation: operationValue,
      retention,
    });
  };
  const operationContext = (record: Readonly<Record<string, unknown>>) => {
    const context = operationIdentityContext(record.command, record.operation);
    const beforeAudit = record.beforeAudit !== undefined
      ? record.beforeAudit
      : publisherRecoveryRecord(
          record.before,
          'GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_ARTIFACT_INVALID',
        ).audit;
    assertPublisherRecoveryArtifactAudit(beforeAudit, context.receipt);
    return context;
  };
  const registerSupervisorForOperation = (
    commandValue: unknown,
    operationValue: unknown,
  ): GreaterRealmPublishSupervisorIdentity => {
    const context = operationIdentityContext(commandValue, operationValue);
    const inspection = inspectSupervisor(context.supervisorIdentity);
    if (inspection.processGroupExists) {
      fail('GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_PROCESS_GROUP_LIVE');
    }
    supervisors.set(
      canonicalPublisherRecoveryJson(inspection.identity),
      inspection.identity,
    );
    return inspection.identity;
  };
  const defaultInspectSnapshot = async (
    lane: GreaterRealmProductionPublishLane,
    receipt: MigrationArtifactReceipt,
  ) => inspectGreaterRealmProductionPublisherRecoverySnapshot({
    lane,
    moduleDeltaPolicy: greaterRealmProductionModuleDeltaPolicy(lane),
    expectedAtlasSourceCommit: provenance.atlasSourceCommit,
    expectedAtlasId: provenance.atlasId,
    expectedPublicReleaseId: provenance.publicReleaseId,
    expectedReleaseSha256: provenance.expectedReleaseSha256,
    artifactReceipt: receipt,
    readSchema: () => Promise.resolve(readSchema(executableSnapshot.path)),
    readImportStatus: () => requireStatusTransport().inspect(),
    readCutoverStatus: () => requireCutoverTransport().inspect(),
    readHistoricalAggregate: () => readHistoricalAggregateForLane(lane),
  });
  const inspectSnapshot = dependencies?.inspectSnapshot ?? defaultInspectSnapshot;
  return withComposedCleanup(async () => {
    const recovered = await recoverJournal({
      directory: receiptDirectory,
      repositoryRoot: REPOSITORY_ROOT,
      confirmationDigest: input.recoveryConfirmationDigest!,
      prepareRecovery: () => { requireSession(); },
      revalidateArtifact: record => {
        attestArtifact({
          repositoryRoot: REPOSITORY_ROOT,
          record,
        });
        retention = record;
      },
      inspect: async record => {
        assertSourceRelease(record.sourceRelease);
        const context = operationContext(record as unknown as Readonly<Record<string, unknown>>);
        artifactReceipt = context.receipt;
        return inspectSnapshot(context.lane, context.receipt);
      },
      classifyPublishRecovery: async ({ record }) => {
        const context = operationContext(record as unknown as Readonly<Record<string, unknown>>);
        const supervisorInspection = inspectSupervisor(
          context.supervisorIdentity,
        );
        if (supervisorInspection.processGroupExists) {
          fail('GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_PROCESS_GROUP_LIVE');
        }
        if (
          supervisorInspection.incompleteInstallZeroWrite
          || supervisorInspection.status.state === 'not-allocated'
          || supervisorInspection.status.state === 'allocated-no-spawn'
          || supervisorInspection.status.state === 'spawn-authorized'
          || supervisorInspection.status.state === 'supervisor-bound'
          || supervisorInspection.status.state === 'prestart-zero-write'
          || supervisorInspection.status.state === 'bound-zero-write'
          || supervisorInspection.status.state === 'pre-gate-waiting'
          || supervisorInspection.status.state === 'pre-gate-zero-write'
        ) {
          cleanupSupervisor(supervisorInspection.identity);
          return 'definitive-zero' as const;
        }
        if (
          supervisorInspection.status.state === 'gate-consumed'
        ) {
          supervisors.set(
            canonicalPublisherRecoveryJson(supervisorInspection.identity),
            supervisorInspection.identity,
          );
          return 'gate-consumed' as const;
        }
        fail('GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_SUPERVISOR_AMBIGUOUS');
      },
      inspectCommand: async record => {
        assertSourceRelease(record.sourceRelease);
        if (retention === undefined) {
          fail('GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_ARTIFACT_INVALID');
        }
        const lane = record.command.name as GreaterRealmProductionPublishLane;
        if (
          record.command.kind !== 'publish'
          || !Object.values(GREATER_REALM_PRODUCTION_PUBLISH_LANE).includes(lane)
        ) fail('GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_COMMAND_MISMATCH');
        const receipt = publisherRecoveryArtifactReceipt(
          record.beforeAudit,
          retention.artifactPath,
        );
        artifactReceipt = receipt;
        const observed = await inspectSnapshot(lane, receipt);
        if (record.operationReceiptCount === 0 && (
          canonicalPublisherRecoveryJson(observed.status)
            !== canonicalPublisherRecoveryJson(record.beforeStatus)
          || canonicalPublisherRecoveryJson(observed.audit)
            !== canonicalPublisherRecoveryJson(record.beforeAudit)
        )) fail('GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_CONCURRENT_DRIFT');
        return observed;
      },
      resumeCommand: async resumed => {
        assertSourceRelease(resumed.sourceRelease);
        const lane = resumed.command.name as GreaterRealmProductionPublishLane;
        if (
          resumed.command.kind !== 'publish'
          || !Object.values(GREATER_REALM_PRODUCTION_PUBLISH_LANE).includes(lane)
          || artifactReceipt === undefined || retention === undefined
        ) fail('GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_COMMAND_MISMATCH');
        const supervisor = recoverySupervisor;
        supervisors.set(canonicalPublisherRecoveryJson(supervisor.identity), supervisor.identity);
        const activeSession = requireSession();
        const receipt = await executePublishLane({
          lane,
          expectedAtlasSourceCommit: provenance.atlasSourceCommit,
          expectedAtlasId: provenance.atlasId,
          expectedPublicReleaseId: provenance.publicReleaseId,
          expectedReleaseSha256: provenance.expectedReleaseSha256,
          moduleSourceCommit: provenance.moduleSourceCommit,
          moduleDeltaPolicy: greaterRealmProductionModuleDeltaPolicy(lane),
          flags: GREATER_REALM_PRODUCTION_RELEASE_FLAGS,
          artifactReceipt,
          readSchema: () => Promise.resolve(readSchema(executableSnapshot.path)),
          readImportStatus: () => requireStatusTransport().inspect(),
          readCutoverStatus: () => requireCutoverTransport().inspect(),
          readHistoricalAggregate: () => readHistoricalAggregateForLane(lane),
          assertCanStartWrite: resumed.assertCanStartWrite,
          operationJournal: resumed.operationJournal,
          operationJournalLifecycle: Object.freeze({
            prepared: () => { newExecutableBoundToIncompleteOperation = true; },
            settled: () => { newExecutableBoundToIncompleteOperation = false; },
          }),
          publishExecutableIdentity: Object.freeze({
            path: executableSnapshot.path,
            digest: executableSnapshot.digest,
          }),
          publishSupervisorIdentity: supervisor.identity,
          publish: writePermit => publishGreaterRealmModuleWithFreshPostflight({
            session: activeSession,
            publish: () => publishModuleForRecovery(
              executableSnapshot.path,
              GREATER_REALM_PRODUCTION_TRANSPORT_TARGET.database,
              artifactReceipt!,
              undefined,
              writePermit ?? resumed.assertCanStartWrite,
              retention!.artifactPath,
              async () => {
                const currentSourceCommit = (
                  input.attestProtectedMain
                  ?? (() => attestGreaterRealmProductionProtectedMain(REPOSITORY_ROOT))
                )();
                if (currentSourceCommit !== resumed.sourceRelease.moduleSourceCommit) {
                  fail('GREATER_REALM_PRODUCTION_MODULE_SOURCE_ADVANCED');
                }
                await activeSession.prepareSubmission();
              },
              supervisor,
            ),
          }),
        });
        return Object.freeze({ kind: receipt.kind, record: { ...receipt } });
      },
      commandReceiptForRecoveredChain: async chain => {
        if (retention === undefined) {
          fail('GREATER_REALM_PRODUCTION_PUBLISH_RECOVERY_ARTIFACT_INVALID');
        }
        for (const operation of chain.operations) {
          registerSupervisorForOperation(chain.command, operation.operation);
        }
        return reconstructRecoveredPublisherReceipt(chain, retention);
      },
      cleanupArtifact: (record, context) => {
        if (
          context.groupDigest !== initial.plan?.groupDigest
          || context.command.kind !== 'publish'
        ) fail('GREATER_REALM_PRODUCTION_PUBLISH_CLEANUP_AUTHORITY_INVALID');
        assertSourceRelease(context.sourceRelease);
        for (const completed of context.operations) {
          registerSupervisorForOperation(context.command, completed.operation);
        }
        for (const identity of supervisors.values()) {
          cleanupSupervisor(identity);
        }
        cleanupArtifact({
          repositoryRoot: REPOSITORY_ROOT,
          record,
        });
      },
    });
    recoveryCompleted = true;
    return Object.freeze({
      command: 'recover',
      recoveryMode: 'journal',
      outcome: recovered.recovery.outcome,
      groupDigest: recovered.recovery.groupDigest,
      operationReceiptChainDigest: recovered.recovery.operationReceiptChainDigest,
      operationReceiptCount: recovered.recovery.operationReceiptCount,
      commandReceiptDigest: recovered.recovery.commandReceiptDigest,
      deletion: 'disabled',
    });
  }, [
    async () => session?.close(),
    () => {
      if (recoveryCompleted || !newExecutableBoundToIncompleteOperation) {
        executableSnapshot.cleanup();
      }
    },
    () => {
      if (recoveryCompleted || !newExecutableBoundToIncompleteOperation) {
        cleanupSupervisor(recoverySupervisor.identity);
      }
    },
  ]);
}

export const greaterRealmProductionPublisherTestSeams = Object.freeze({
  prepareGreaterRealmPublisherLocalAuthorities,
});

async function main(): Promise<void> {
  assertGreaterRealmPrivateInvocation();
  const arguments_ = parseGreaterRealmProductionPublisherArguments(process.argv.slice(2));
  if (process.env.WKGR_PRODUCTION_BOOTSTRAP_PROFILE
    !== 'warpkeep-greater-realm-production-bootstrap-v1') {
    fail('GREATER_REALM_PRODUCTION_TRUSTED_BOOTSTRAP_REQUIRED');
  }
  const adminSecretPath = process.env.WKGR_PRODUCTION_ADMIN_SECRET_PATH;
  const dependencyCacheRoot = process.env.WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT;
  const proofNodeExecutable = process.env.WKGR_PRODUCTION_PROOF_NODE_EXECUTABLE;
  const proofHomeDirectory = process.env.WKGR_PRODUCTION_PROOF_HOME;
  const proofTemporaryDirectory = process.env.WKGR_PRODUCTION_PROOF_TMPDIR;
  const spacetimeCliConfigPath = process.env.WKGR_PRODUCTION_SPACETIME_CLI_CONFIG_PATH;
  delete process.env.WKGR_PRODUCTION_ADMIN_SECRET_PATH;
  delete process.env.WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT;
  delete process.env.WKGR_PRODUCTION_PROOF_NODE_EXECUTABLE;
  delete process.env.WKGR_PRODUCTION_PROOF_HOME;
  delete process.env.WKGR_PRODUCTION_PROOF_TMPDIR;
  delete process.env.WKGR_PRODUCTION_SPACETIME_CLI_CONFIG_PATH;
  delete process.env.WKGR_PRODUCTION_BOOTSTRAP_PROFILE;
  delete process.env.WKGR_PRODUCTION_PROTECTED_COMMIT;
  const result = 'command' in arguments_
    ? await executeGreaterRealmProductionPublisherRecovery({
        ...arguments_,
        adminSecretPath,
        spacetimeCliConfigPath,
        environment: process.env,
      })
    : await executeGreaterRealmProductionPublisherCli({
        ...arguments_,
        adminSecretPath,
        spacetimeCliConfigPath,
        dependencyCacheRoot,
        proofRuntime: proofNodeExecutable === undefined
          || proofHomeDirectory === undefined
          || proofTemporaryDirectory === undefined
          ? undefined
          : Object.freeze({
              nodeExecutable: proofNodeExecutable,
              homeDirectory: proofHomeDirectory,
              temporaryDirectory: proofTemporaryDirectory,
            }),
        environment: process.env,
      });
  console.log(JSON.stringify(result));
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch(error => {
    console.error(
      error !== null
      && typeof error === 'object'
      && 'code' in error
      && typeof error.code === 'string'
        ? error.code
        : 'GREATER_REALM_PRODUCTION_PUBLISH_FAILED',
    );
    process.exitCode = 1;
  });
}

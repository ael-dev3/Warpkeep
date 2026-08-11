import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  attestPinnedSpacetimeCli,
  canonicalSchemaDescribeChildArguments,
  parseCanonicalSchemaDescription,
  publishChildEnvironment,
  publishModule,
  readFoundedPublishExpectations,
  runCurrentAdditiveMigrationProof,
  type MigrationArtifactReceipt,
} from './publish-spacetime-dev.mjs';
import {
  defaultGreaterRealmCutoverReceiptDirectory,
  withGreaterRealmCutoverOperatorLock,
  writePrivateGreaterRealmCutoverReceipt,
} from './greater-realm-cutover-receipts';
import {
  executeGreaterRealmProductionPublishLane,
  greaterRealmProductionModuleDeltaPolicy,
  GREATER_REALM_PRODUCTION_PUBLISH_LANE,
  GREATER_REALM_PRODUCTION_RELEASE_FLAGS,
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
  readGreaterRealmProductionAdminSecret,
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

export function parseGreaterRealmProductionPublisherArguments(
  arguments_: readonly string[],
): Readonly<{ lane: GreaterRealmProductionPublishLane; confirmed: true }> {
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
      + `<${Object.values(GREATER_REALM_PRODUCTION_PUBLISH_LANE).join('|')}> --confirm`,
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

export async function executeGreaterRealmProductionPublisherCli(input: Readonly<{
  lane: GreaterRealmProductionPublishLane;
  confirmed: true;
  adminSecret: string;
  environment: Readonly<Record<string, string | undefined>>;
  receiptDirectory?: string;
  workspaceRoot?: string;
  executable?: string;
  attestProtectedMain?: () => string;
  runMigrationProof?: (executable: string) => MigrationArtifactReceipt;
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
    operation: async () => {
      const executableSnapshot = attestPinnedSpacetimeCli(
        input.executable ?? input.environment.SPACETIME_BIN ?? 'spacetime',
      );
      try {
        const artifactReceipt = (input.runMigrationProof ?? runCurrentAdditiveMigrationProof)(
          executableSnapshot.path,
        );
        const expectations = readFoundedPublishExpectations(input.environment);
        const session = createGreaterRealmAdminTransportSession({
          adminSecret: input.adminSecret,
        });
        const transport = bindGreaterRealmProductionStatusTransport(session, STATUS_PROCEDURE);
        const cutoverTransport = bindGreaterRealmProductionStatusTransport(
          session,
          GREATER_REALM_PRODUCTION_CUTOVER_STATUS_PROCEDURE,
        );
        try {
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
                return historicalAggregate(session, expectations);
              }
              const cutover = cutoverHistoricalAggregate(
                await cutoverTransport.inspect(),
                expectedAtlasRelease,
              );
              if (usesCutoverAggregateOnly(input.lane)) return cutover;
              return Object.freeze({
                cutover,
                legacy: await historicalAggregate(session, expectations),
              });
            },
            publish: () => publishGreaterRealmModuleWithFreshPostflight({
              session,
              publish: () => publishModule(
                  executableSnapshot.path,
                  GREATER_REALM_PRODUCTION_TRANSPORT_TARGET.database,
                  artifactReceipt,
                ),
            }),
          });
          const privateReceipt = writePrivateGreaterRealmCutoverReceipt({
            directory: receiptDirectory,
            repositoryRoot: REPOSITORY_ROOT,
            kind: 'warpkeep-greater-realm-production-publish-v1',
            record: { ...receipt },
          });
          return Object.freeze({
            lane: receipt.lane,
            outcome: receipt.outcome,
            atlasSourceCommit: receipt.atlasSourceCommit,
            atlasId: receipt.atlasId,
            publicReleaseId: receipt.publicReleaseId,
            expectedReleaseSha256: receipt.expectedReleaseSha256,
            moduleSourceCommit: receipt.moduleSourceCommit,
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
        } finally {
          await session.close();
        }
      } finally {
        executableSnapshot.cleanup();
      }
    },
  });
}

async function main(): Promise<void> {
  const arguments_ = parseGreaterRealmProductionPublisherArguments(process.argv.slice(2));
  const adminSecret = readGreaterRealmProductionAdminSecret(process.env);
  delete process.env.WARPKEEP_ADMIN_TOKEN_SECRET;
  const result = await executeGreaterRealmProductionPublisherCli({
    ...arguments_,
    adminSecret,
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

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DbConnection } from '../src/spacetime/module_bindings';
import {
  CANONICAL_GENESIS_WATER_REVISION_V1,
} from '../spacetimedb/src/waterRevision';
import {
  connect,
  privacySafeHermesErrorMessage,
  readAdminSecret,
  requestAdminToken,
  withOperationTimeout,
} from './hermes-admin';

const CANONICAL_URI = 'https://maincloud.spacetimedb.com';
const CANONICAL_DATABASE =
  'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const CANONICAL_BRIDGE = 'https://auth.warpkeep.com';

type WaterRevisionCommand = 'inspect' | 'seed' | 'activate';

export type WaterRevisionStatus = Readonly<{
  ready: boolean;
  activated: boolean;
  revisionRows: bigint;
  revisionVersion: number;
  policyVersion: string;
  baseLayoutVersion: number;
  baseLayoutDigest: string;
  oceanBodyCount: number;
  riverBodyCount: number;
  enabledBodyCount: number;
  oceanCellCount: number;
  riverCellCount: number;
  enabledCellCount: number;
  lakeBodyCount: number;
  lakeCellCount: number;
  riverWidthCells: number;
  navigationFogBoundaryDepthCells: number;
  hiddenBufferCells: number;
  revisionDigest: string;
  sourceCommit: string;
}>;

class WaterRevisionOperatorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WaterRevisionOperatorError';
  }
}

function fail(message: string): never {
  throw new WaterRevisionOperatorError(message);
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

export function projectWaterRevisionStatus(value: unknown): WaterRevisionStatus {
  const row = asRecord(value);
  const expected = CANONICAL_GENESIS_WATER_REVISION_V1;
  if (!row || typeof row.ready !== 'boolean' || typeof row.activated !== 'boolean') {
    fail('Water revision inspection returned an invalid aggregate.');
  }
  const revisionRows = row.revisionRows;
  if (
    typeof revisionRows !== 'bigint'
    || revisionRows < 0n
    || revisionRows > 1n
    || (row.ready && revisionRows !== 1n)
    || (!row.ready && revisionRows !== 0n)
    || (row.activated && !row.ready)
  ) fail('Water revision inspection returned an invalid aggregate.');
  const exactFields: readonly [keyof typeof expected, unknown][] = [
    ['revisionVersion', expected.revisionVersion],
    ['policyVersion', expected.policyVersion],
    ['baseLayoutVersion', expected.baseLayoutVersion],
    ['baseLayoutDigest', expected.baseLayoutDigest],
    ['oceanBodyCount', expected.oceanBodyCount],
    ['riverBodyCount', expected.riverBodyCount],
    ['enabledBodyCount', expected.enabledBodyCount],
    ['oceanCellCount', expected.oceanCellCount],
    ['riverCellCount', expected.riverCellCount],
    ['enabledCellCount', expected.enabledCellCount],
    ['lakeBodyCount', expected.lakeBodyCount],
    ['lakeCellCount', expected.lakeCellCount],
    ['riverWidthCells', expected.riverWidthCells],
    ['navigationFogBoundaryDepthCells', expected.navigationFogBoundaryDepthCells],
    ['hiddenBufferCells', expected.hiddenBufferCells],
    ['revisionDigest', expected.revisionDigest],
    ['sourceCommit', expected.sourceCommit],
  ];
  if (exactFields.some(([field, expectedValue]) => row[field] !== expectedValue)) {
    fail('Water revision inspection did not match the reviewed policy.');
  }
  return Object.freeze({
    ready: row.ready,
    activated: row.activated,
    revisionRows,
    revisionVersion: expected.revisionVersion,
    policyVersion: expected.policyVersion,
    baseLayoutVersion: expected.baseLayoutVersion,
    baseLayoutDigest: expected.baseLayoutDigest,
    oceanBodyCount: expected.oceanBodyCount,
    riverBodyCount: expected.riverBodyCount,
    enabledBodyCount: expected.enabledBodyCount,
    oceanCellCount: expected.oceanCellCount,
    riverCellCount: expected.riverCellCount,
    enabledCellCount: expected.enabledCellCount,
    lakeBodyCount: expected.lakeBodyCount,
    lakeCellCount: expected.lakeCellCount,
    riverWidthCells: expected.riverWidthCells,
    navigationFogBoundaryDepthCells: expected.navigationFogBoundaryDepthCells,
    hiddenBufferCells: expected.hiddenBufferCells,
    revisionDigest: expected.revisionDigest,
    sourceCommit: expected.sourceCommit,
  });
}

export function verifyWaterRevisionTransition(
  command: Exclude<WaterRevisionCommand, 'inspect'>,
  before: WaterRevisionStatus,
  after: WaterRevisionStatus,
): WaterRevisionStatus {
  if (command === 'seed') {
    if (!after.ready || after.revisionRows !== 1n || after.activated !== before.activated) {
      fail('Water revision seed postcondition failed. Inspect state before retrying.');
    }
  } else if (!before.ready || !after.ready || !after.activated || after.revisionRows !== 1n) {
    fail('Water revision activation postcondition failed. Inspect state before retrying.');
  }
  return after;
}

function printable(status: WaterRevisionStatus) {
  return Object.freeze({
    ...status,
    revisionRows: status.revisionRows.toString(),
  });
}

function argumentsFrom(argv = process.argv.slice(2)) {
  const command = argv[0] as WaterRevisionCommand | undefined;
  if (command !== 'inspect' && command !== 'seed' && command !== 'activate') {
    fail('Usage: water-revision-operator.ts <inspect|seed|activate> [--dry-run] [--confirm]');
  }
  const flags = argv.slice(1);
  if (flags.some((flag) => flag !== '--dry-run' && flag !== '--confirm')
    || new Set(flags).size !== flags.length) {
    fail('Water revision operator arguments are invalid.');
  }
  return Object.freeze({
    command,
    dryRun: flags.includes('--dry-run'),
    confirmed: flags.includes('--confirm'),
  });
}

function canonicalTarget() {
  const uri = process.env.WARPKEEP_SPACETIMEDB_URI ?? CANONICAL_URI;
  const database = process.env.WARPKEEP_SPACETIMEDB_DATABASE ?? CANONICAL_DATABASE;
  const bridge = process.env.WARPKEEP_AUTH_BRIDGE_URL ?? CANONICAL_BRIDGE;
  if (uri !== CANONICAL_URI || database !== CANONICAL_DATABASE || bridge !== CANONICAL_BRIDGE) {
    fail('Water revision operations require the immutable Warpkeep production target.');
  }
  return Object.freeze({ uri, database, bridge });
}

async function inspect(connection: DbConnection) {
  return projectWaterRevisionStatus(await withOperationTimeout(
    connection.procedures.adminInspectGenesisWaterRevisionV1({})
  ));
}

async function main() {
  const { command, dryRun, confirmed } = argumentsFrom();
  const target = canonicalTarget();
  if (command !== 'inspect' && !dryRun && !confirmed) {
    fail(`Refusing Water revision ${command} without --confirm.`);
  }
  if (dryRun) {
    console.log(JSON.stringify({
      command,
      target: target.database,
      revisionDigest: CANONICAL_GENESIS_WATER_REVISION_V1.revisionDigest,
      topologyMutation: false,
      dataDeletion: false,
    }));
    return;
  }

  const secret = readAdminSecret(
    process.env.WARPKEEP_ADMIN_TOKEN_SECRET,
    process.env.WARPKEEP_ADMIN_TOKEN_SECRET_STDIN,
  );
  const token = await requestAdminToken(target.bridge, secret);
  let connection: DbConnection | undefined;
  try {
    connection = await connect(target.uri, target.database, token);
    const before = await inspect(connection);
    if (command === 'seed' && !before.ready) {
      await withOperationTimeout(connection.reducers.adminSeedGenesisWaterRevisionV1({}));
    } else if (command === 'activate') {
      if (!before.ready) fail('Water revision must be seeded before activation.');
      if (!before.activated) {
        await withOperationTimeout(connection.reducers.adminActivateGenesisWaterRevisionV1({}));
      }
    }
    const after = command === 'inspect'
      ? before
      : verifyWaterRevisionTransition(command, before, await inspect(connection));
    console.log(JSON.stringify(printable(after)));
  } finally {
    try { connection?.disconnect(); } catch { /* Preserve the bounded operator boundary. */ }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof WaterRevisionOperatorError
      ? error.message
      : privacySafeHermesErrorMessage(error));
    process.exitCode = 1;
  });
}

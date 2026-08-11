import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import {
  chmod,
  lstat,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  createGreaterRealmRuntimeReleaseFixtureSource,
  greaterRealmRuntimeReleaseFixtureSeed,
  GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
} from './atlas/greater-realm-runtime-release-test-fixture';
import { createGreaterRealmRuntimeRelease } from './atlas/greater-realm-runtime-release';
import { parseGreaterRealmConnectedProductionGateMode } from './greater-realm-connected-gate-mode';
import {
  DISPOSABLE_RELOCATION_REDUCER_MODULE,
  assertCanonicalSeedCounts,
  callLoopback,
  childEnvironment,
  countWhere,
  createDisposableGreaterRealmRelocationModule,
  directoryDigest,
  importReadyGreaterRealmV17,
  manifestParts,
  publishDisposableDatabase,
  queryRows,
  readBoolean,
  readUnsigned,
  runActiveResumeScenario,
  runCommand,
  seedCanonicalLegacyV16,
  sha256,
  tableDigest,
  terminateProcess,
  type AdminCaller,
  type RuntimeControl,
} from './verify-greater-realm-connected-relocation';
import {
  acquireDisposableIdentity,
  adminServiceClaims,
  cleanupMigrationProofResources,
  containServerProcessErrors,
  createEphemeralJwt,
  freeLoopbackPort,
  installMigrationProofSignalCleanup,
// @ts-expect-error Shared loopback/JWT helpers are deliberately plain JavaScript.
} from './verify-spacetime-additive-migration.mjs';

export const GREATER_REALM_CONNECTED_ACTIVE_POPULATION_DATABASE =
  'warpkeep-greater-realm-active-population';
export const GREATER_REALM_CONNECTED_ACTIVE_POPULATION_TIMEOUT_MILLISECONDS =
  25 * 60 * 1_000;
export const GREATER_REALM_CONNECTED_ACTIVE_POPULATION_CONCURRENCY = 8;
export const GREATER_REALM_CONNECTED_CASTLE_CAPACITY = 600;
export const GREATER_REALM_CONNECTED_FINAL_WORKER_COUNT = 2_400;
export const GREATER_REALM_CONNECTED_POST_CANARY_FOUNDERS = 500;
export const GREATER_REALM_CONNECTED_PROFILE_POLICY_VERSION =
  'trusted-snapchain-profile-v3';
export const GREATER_REALM_CONNECTED_ENTRY_AGREEMENT_VERSION =
  '2026-08-03-hegemony-entry-agreement-v5';
export const GREATER_REALM_CONNECTED_EXPECTED_CLI_VERSION = '2.6.1';
export const GREATER_REALM_CONNECTED_EXPECTED_CLI_COMMIT =
  '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87';
export const GREATER_REALM_CONNECTED_PRIVATE_SQL_CREDENTIAL_SECONDS = 240;
export const GREATER_REALM_CONNECTED_EXPECTED_GATHER_QUANTA = 20n;
export const GREATER_REALM_CONNECTED_BOOTSTRAP_SLO_MILLISECONDS = 5_000;
export const GREATER_REALM_CONNECTED_WINDOW_SLO_MILLISECONDS = 5_000;
export const GREATER_REALM_CONNECTED_RESOURCE_LOCATIONS_SLO_MILLISECONDS = 8_000;
export const GREATER_REALM_CONNECTED_CHUNK_SLO_MILLISECONDS = 5_000;
export const GREATER_REALM_CONNECTED_READ_TOTAL_SLO_MILLISECONDS = 18_000;

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceModule = join(repositoryRoot, 'spacetimedb');
const productionPolicyPath = join(sourceModule, 'src', 'greaterRealmV17Policy.ts');
const productionIndexPath = join(sourceModule, 'src', 'index.ts');
const command = process.env.SPACETIME_BIN || 'spacetime';
const requestTimeoutMilliseconds = 30_000;
const rehearsalTravelMillisecondsPerStep = 50;
const rehearsalGatheringDurationMilliseconds = 2_000;
const lifecycleObservationMarginMilliseconds = 10_000;
const admissionFirstFid = 9_920_101;
const preflightArgument = '--preflight-101';

type TimingSubstitution = Readonly<{
  relativePath: string;
  production: string;
  rehearsal: string;
}>;

/** Copy-local timing only; every source declaration is exact-count checked. */
export const GREATER_REALM_CONNECTED_TIMING_SUBSTITUTIONS = Object.freeze([
  Object.freeze({
    relativePath: 'src/castleWorkerPolicy.ts',
    production: 'export const CASTLE_WORKER_TRAVEL_MICROS_PER_STEP = 30_000_000n;',
    rehearsal: 'export const CASTLE_WORKER_TRAVEL_MICROS_PER_STEP = 50_000n;',
  }),
  Object.freeze({
    relativePath: 'src/castleWorkerPolicy.ts',
    production: 'export const CASTLE_WORKER_MAX_GATHERING_DURATION_MICROS = 30n * 24n * 60n * 60n * 1_000_000n;',
    rehearsal: 'export const CASTLE_WORKER_MAX_GATHERING_DURATION_MICROS = 2_000_000n;',
  }),
  ...(['gold', 'food', 'wood', 'stone'] as const).flatMap(kind => {
    const upper = kind.toUpperCase();
    return [
      Object.freeze({
        relativePath: `src/${kind}ExpeditionPolicy.ts`,
        production: `export const ${upper}_GATHER_QUANTUM_MICROS = 60_000_000n;`,
        rehearsal: `export const ${upper}_GATHER_QUANTUM_MICROS = 100_000n;`,
      }),
      Object.freeze({
        relativePath: `src/${kind}ExpeditionPolicy.ts`,
        production: `export const ${upper}_GATHERING_DURATION_MICROS = 30n * 24n * 60n * 60n * 1_000_000n;`,
        rehearsal: `export const ${upper}_GATHERING_DURATION_MICROS = 2_000_000n;`,
      }),
    ];
  }),
] satisfies readonly TimingSubstitution[]);

class GreaterRealmConnectedActivePopulationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GreaterRealmConnectedActivePopulationError';
  }
}

function fail(message: string): never {
  throw new GreaterRealmConnectedActivePopulationError(message);
}

function safeUnexpectedDiagnostic(error: unknown): string {
  if (!(error instanceof Error) || error.message.length === 0) return 'unexpected error';
  return error.message
    .replace(/(?:GRN|GRC)-[A-Z2-7]{26}/g, '[private-opaque-id]')
    .replace(/[0-9a-f]{64}/g, '[private-digest]')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [credential]')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 300);
}

function occurrenceCount(value: string, needle: string): number {
  if (needle.length === 0) fail('Exact substitution needle was empty.');
  return value.split(needle).length - 1;
}

export function applyExactGreaterRealmConnectedTimingSubstitution(
  source: string,
  substitution: TimingSubstitution,
): string {
  if (
    occurrenceCount(source, substitution.production) !== 1
    || occurrenceCount(source, substitution.rehearsal) !== 0
  ) fail('Disposable Worker timing declaration drifted.');
  const result = source.replace(substitution.production, substitution.rehearsal);
  if (
    occurrenceCount(result, substitution.production) !== 0
    || occurrenceCount(result, substitution.rehearsal) !== 1
  ) fail('Disposable Worker timing substitution was not exact.');
  return result;
}

export async function accelerateDisposableGreaterRealmWorkerTiming(
  moduleDirectory: string,
): Promise<void> {
  const grouped = new Map<string, TimingSubstitution[]>();
  for (const substitution of GREATER_REALM_CONNECTED_TIMING_SUBSTITUTIONS) {
    const existing = grouped.get(substitution.relativePath) ?? [];
    existing.push(substitution);
    grouped.set(substitution.relativePath, existing);
  }
  for (const [relativePath, substitutions] of grouped) {
    const path = join(moduleDirectory, relativePath);
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      fail('Disposable Worker timing target was unsafe.');
    }
    let source = await readFile(path, 'utf8');
    for (const substitution of substitutions) {
      source = applyExactGreaterRealmConnectedTimingSubstitution(source, substitution);
    }
    await writeFile(path, source, { encoding: 'utf8', mode: 0o600, flag: 'w' });
  }
}

async function rotatePrivateSqlCredential(
  cliConfigPath: string,
  privateKey: string,
): Promise<string> {
  const claims = adminServiceClaims() as Readonly<Record<string, unknown>>;
  if (
    typeof claims.iat !== 'number'
    || typeof claims.exp !== 'number'
    || claims.exp - claims.iat !== GREATER_REALM_CONNECTED_PRIVATE_SQL_CREDENTIAL_SECONDS
  ) fail('Disposable owner-private credential lifetime drifted.');
  const credential = createEphemeralJwt(privateKey, claims);
  const temporaryPath = `${cliConfigPath}.${randomBytes(12).toString('hex')}.tmp`;
  try {
    await writeFile(
      temporaryPath,
      `spacetimedb_token = ${JSON.stringify(credential)}\n`,
      { encoding: 'utf8', mode: 0o600, flag: 'wx' },
    );
    const temporaryMetadata = await lstat(temporaryPath);
    if (
      !temporaryMetadata.isFile()
      || temporaryMetadata.isSymbolicLink()
      || (temporaryMetadata.mode & 0o777) !== 0o600
    ) fail('Disposable owner-private credential staging was unsafe.');
    await rename(temporaryPath, cliConfigPath);
    const installedMetadata = await lstat(cliConfigPath);
    if (
      !installedMetadata.isFile()
      || installedMetadata.isSymbolicLink()
      || (installedMetadata.mode & 0o777) !== 0o600
    ) fail('Disposable owner-private credential installation was unsafe.');
    return credential;
  } catch (error) {
    try { await rm(temporaryPath, { force: true }); } catch {
      fail('Disposable owner-private credential cleanup failed.');
    }
    if (error instanceof GreaterRealmConnectedActivePopulationError) throw error;
    fail('Disposable owner-private credential rotation failed safely.');
  }
}

function serviceClaims(subject: string, roles: readonly string[], lifetimeSeconds: number) {
  const issuedAt = Math.floor(Date.now() / 1_000);
  return {
    iss: 'https://auth.warpkeep.com',
    sub: subject,
    aud: ['warpkeep-spacetimedb'],
    token_type: 'spacetime-access',
    roles,
    iat: issuedAt,
    nbf: issuedAt,
    exp: issuedAt + lifetimeSeconds,
    jti: randomBytes(18).toString('base64url'),
  };
}

function playerClaims(fid: number) {
  const base = serviceClaims(`farcaster:${fid}`, [], 540);
  return {
    ...base,
    auth_version: 2,
    fid: String(fid),
    auth_epoch: 1,
    session_iat: base.iat,
    session_exp: base.exp,
  };
}

function accessRequestClaims(fid: number) {
  return {
    ...serviceClaims(
      'service:access-request-resolver',
      ['warpkeep-access-request-resolver'],
      15,
    ),
    request_fid: String(fid),
    request_operation: 'submit',
  };
}

function parseJson(text: string, label: string): unknown {
  try { return JSON.parse(text); } catch { return fail(`${label} was not exact JSON.`); }
}

function optionUnsigned(value: unknown, label: string): bigint | undefined {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    if (value.length === 1) return readUnsigned(value[0], label);
    if (
      value.length === 2
      && (value[0] === 0 || String(value[0]).toLowerCase() === 'some')
    ) return readUnsigned(value[1], label);
    if (
      value.length === 2
      && (value[0] === 1 || String(value[0]).toLowerCase() === 'none')
      && (value[1] === null || (Array.isArray(value[1]) && value[1].length === 0))
    ) return undefined;
    fail(`${label} option was invalid.`);
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    if (Object.keys(row).length === 1 && Object.hasOwn(row, 'some')) {
      return readUnsigned(row.some, label);
    }
    if (Object.keys(row).length === 1 && Object.hasOwn(row, 'none')) return undefined;
    if (
      String(row.tag).toLowerCase() === 'some'
      && Object.hasOwn(row, 'value')
    ) return readUnsigned(row.value, label);
    if (String(row.tag).toLowerCase() === 'none') return undefined;
  }
  return readUnsigned(value, label);
}

function optionString(value: unknown, label: string): string | undefined {
  if (value === null || value === undefined) return undefined;
  let selected: unknown = value;
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    if (value.length === 1) [selected] = value;
    else if (
      value.length === 2
      && (value[0] === 0 || String(value[0]).toLowerCase() === 'some')
    ) selected = value[1];
    else if (
      value.length === 2
      && (value[0] === 1 || String(value[0]).toLowerCase() === 'none')
      && (value[1] === null || (Array.isArray(value[1]) && value[1].length === 0))
    ) return undefined;
    else fail(`${label} option was invalid.`);
  } else if (typeof value === 'object') {
    const row = value as Record<string, unknown>;
    if (Object.keys(row).length === 1 && Object.hasOwn(row, 'some')) selected = row.some;
    else if (Object.keys(row).length === 1 && Object.hasOwn(row, 'none')) return undefined;
    else if (
      String(row.tag).toLowerCase() === 'some'
      && Object.hasOwn(row, 'value')
    ) selected = row.value;
    else if (String(row.tag).toLowerCase() === 'none') return undefined;
    else fail(`${label} option was invalid.`);
  }
  if (
    typeof selected !== 'string'
    || selected.length === 0
    || selected.length > 128
    || /[\r\n\0]/.test(selected)
  ) fail(`${label} option was invalid.`);
  return selected;
}

type RequestTuple = Readonly<{ requestCycle: bigint; requestedAtMicros: bigint }>;

function parseAccessRequest(text: string): RequestTuple {
  const value = parseJson(text, 'Access-request submission');
  if (!Array.isArray(value) || value.length !== 2 || value[0] !== 'requested') {
    fail('Access-request submission contract was invalid.');
  }
  const requestedAtMicros = optionUnsigned(value[1], 'Access-request timestamp');
  if (requestedAtMicros === undefined || requestedAtMicros <= 0n) {
    fail('Access-request submission omitted its timestamp.');
  }
  return Object.freeze({ requestCycle: 0n, requestedAtMicros });
}

function safeWireUnsigned(value: bigint, label: string): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail(`${label} exceeded the safe loopback wire.`);
  }
  return Number(value);
}

function admissionArguments(fid: number, tuple: RequestTuple): readonly unknown[] {
  const ordinal = String(fid - admissionFirstFid + 101).padStart(3, '0');
  return Object.freeze([
    fid,
    'disposable connected active-population rehearsal',
    safeWireUnsigned(tuple.requestCycle, 'Admission request cycle'),
    safeWireUnsigned(tuple.requestedAtMicros, 'Admission request timestamp'),
    `population.keeper.${ordinal}`,
    { some: `Population Keeper ${ordinal}` },
    'https://i.imgur.com/warpkeep-population-keeper.png',
    { some: 'Synthetic numeric-loopback-only active Greater Realm founder' },
    GREATER_REALM_CONNECTED_PROFILE_POLICY_VERSION,
  ]);
}

type ProofCallers = Readonly<{
  callAdmin: AdminCaller;
  callPlayer: (
    fid: number,
    name: string,
    arguments_?: readonly unknown[],
    expectedStatus?: number,
    timeout?: number,
  ) => Promise<string>;
  submitRequest: (fid: number) => Promise<RequestTuple>;
}>;

async function admitFounderViaCas(
  callers: ProofCallers,
  fid: number,
  tuple?: RequestTuple,
): Promise<RequestTuple> {
  const request = tuple ?? await callers.submitRequest(fid);
  await callers.callAdmin(
    'admin_admit_founder_for_access_request_v2',
    admissionArguments(fid, request),
  );
  return request;
}

function parseWorkerControl(text: string) {
  const value = parseJson(text, 'Worker control');
  if (!Array.isArray(value) || value.length !== 19 || !Array.isArray(value[5])) {
    fail('Worker control contract was invalid.');
  }
  const workers = value[5].map((worker, index) => {
    if (!Array.isArray(worker) || worker.length !== 10) {
      fail('Worker control row was invalid.');
    }
    const status = worker[2];
    if (!['idle', 'outbound', 'gathering', 'returning'].includes(String(status))) {
      fail('Worker control status was invalid.');
    }
    if (typeof worker[0] !== 'string') fail('Worker control identifier was invalid.');
    return Object.freeze({ workerId: worker[0], ordinal: index + 1, status: String(status) });
  });
  if (workers.length !== 4) fail('Worker control roster was not exact.');
  return Object.freeze({
    raw: text,
    atlasRevision: readUnsigned(value[1], 'Worker atlas revision'),
    fid: readUnsigned(value[2], 'Worker FID'),
    castleId: readUnsigned(value[3], 'Worker castle id'),
    workers: Object.freeze(workers),
    balances: Object.freeze({
      food: readUnsigned(value[6], 'Worker food'),
      wood: readUnsigned(value[7], 'Worker wood'),
      stone: readUnsigned(value[8], 'Worker stone'),
      gold: readUnsigned(value[9], 'Worker gold'),
    }),
    mode: value[18],
  });
}

function parseWorkerHealth(text: string) {
  const value = parseJson(text, 'Worker health');
  if (!Array.isArray(value) || value.length !== 39) {
    fail('Worker health contract was invalid.');
  }
  return Object.freeze({
    raw: text,
    mode: value[1],
    systemConfigValid: value[2],
    legacyDrainRequired: value[3],
    expectedCastleCount: readUnsigned(value[4], 'Worker health expected castles'),
    expectedWorkerCount: readUnsigned(value[5], 'Worker health expected workers'),
    actualWorkerCount: readUnsigned(value[6], 'Worker health actual workers'),
    expectedCountsMatch: value[7],
    rosterDigestMatches: value[8],
    idleWorkers: readUnsigned(value[14], 'Worker health idle workers'),
    outboundWorkers: readUnsigned(value[15], 'Worker health outbound workers'),
    gatheringWorkers: readUnsigned(value[16], 'Worker health gathering workers'),
    returningWorkers: readUnsigned(value[17], 'Worker health returning workers'),
    assignments: readUnsigned(value[18], 'Worker health assignments'),
    occupations: readUnsigned(value[19], 'Worker health occupations'),
    schedules: readUnsigned(value[20], 'Worker health schedules'),
    invalidTotal: [9, 10, 11, 12, 13, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 32, 33, 34, 35, 36]
      .reduce((sum, index) => sum + readUnsigned(value[index], 'Worker health invariant'), 0n),
  });
}

type PrivateResourceTarget = Readonly<{
  atlasId: string;
  originCellKey: string;
  originAtlasQ: number;
  originAtlasR: number;
  originElevation: number;
  originChunkHandle: string;
  originChunkBinQ: number;
  originChunkBinR: number;
  locationId: string;
  cellKey: string;
  chunkHandle: string;
  chunkBinQ: number;
  chunkBinR: number;
  resourceKind: string;
  nodeCount: number;
  firstNodeOrdinal: number;
  routeDepthBound: number;
  resourceReadChunkHandles: readonly string[];
  resourceReadRows: readonly Readonly<{
    chunkHandle: string;
    locationId: string;
    atlasQ: number;
    atlasR: number;
    resourceKind: string;
    nodeCount: number;
  }>[];
  resourceReadAccessibleCount: number;
  privateNodeIds: ReadonlySet<string>;
  privateComponentKeys: ReadonlySet<string>;
}>;

function safeInteger(value: string | undefined, label: string): number {
  let canonical = value;
  if (canonical !== undefined && !/^-?(?:0|[1-9][0-9]*)$/.test(canonical)) {
    const tagged = /^(?:(?:some|Some)\((-?(?:0|[1-9][0-9]*))\)|\(some = (-?(?:0|[1-9][0-9]*))\))$/.exec(canonical);
    if (tagged !== null) canonical = tagged[1] ?? tagged[2];
    else {
      try {
        const parsed: unknown = JSON.parse(canonical);
        const option = optionUnsigned(parsed, label);
        canonical = option?.toString();
      } catch {
        canonical = undefined;
      }
    }
  }
  if (canonical === undefined || !/^-?(?:0|[1-9][0-9]*)$/.test(canonical)) {
    const shape = value === undefined
      ? 'undefined'
      : value.replace(/[0-9]/g, '#').slice(0, 80);
    fail(`${label} was not an integer (encoding=${shape}).`);
  }
  const parsed = Number(canonical);
  if (!Number.isSafeInteger(parsed)) fail(`${label} was outside the safe range.`);
  return parsed;
}

function sqlOptionalString(value: string | undefined, label: string): string | undefined {
  if (value === undefined || /^(?:\(none\)|none)$/i.test(value)) return undefined;
  const tagged = /^(?:\(some = (.+)\)|some\((.+)\))$/i.exec(value);
  const wrapped = tagged?.[1] ?? tagged?.[2] ?? value;
  let result = wrapped;
  if (wrapped.startsWith('"') && wrapped.endsWith('"')) {
    try {
      const decoded: unknown = JSON.parse(wrapped);
      if (typeof decoded === 'string') result = decoded;
    } catch { /* The strict validation below rejects malformed quoted options. */ }
  }
  if (result.length === 0 || result.length > 128 || /[\r\n\0]/.test(result)) {
    fail(`${label} option was invalid.`);
  }
  return result;
}

export function parseGreaterRealmConnectedSqlTimestampNanoseconds(
  value: string | undefined,
  label: string,
): bigint | undefined {
  const selected = sqlOptionalString(value, label);
  if (selected === undefined) return undefined;
  const exact = /^\(__timestamp_micros_since_unix_epoch__ = (\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3}|\d{6})\+00:00\)$/.exec(selected)
    ?? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3}|\d{6})\+00:00$/.exec(selected);
  const invalidEncoding = (): never => {
    const encodingShape = selected.replace(/[A-Za-z0-9]/g, '#').slice(0, 128);
    fail(`${label} encoding was invalid (length=${selected.length};shape=${encodingShape}).`);
  };
  if (exact === null) return invalidEncoding();
  const [year, month, day, hour, minute, second] = exact.slice(1, 7).map(Number);
  if (
    year! < 1970
    || year! > 9999
    || month! < 1
    || month! > 12
    || day! < 1
    || day! > 31
    || hour! < 0
    || hour! > 23
    || minute! < 0
    || minute! > 59
    || second! < 0
    || second! > 59
  ) return invalidEncoding();
  const milliseconds = Date.UTC(year!, month! - 1, day!, hour!, minute!, second!, 0);
  const normalized = new Date(milliseconds);
  if (
    !Number.isSafeInteger(milliseconds)
    || normalized.getUTCFullYear() !== year
    || normalized.getUTCMonth() !== month! - 1
    || normalized.getUTCDate() !== day
    || normalized.getUTCHours() !== hour
    || normalized.getUTCMinutes() !== minute
    || normalized.getUTCSeconds() !== second
  ) {
    return invalidEncoding();
  }
  return BigInt(milliseconds) * 1_000_000n
    + BigInt(exact[7]!.padEnd(6, '0')) * 1_000n;
}

async function selectPrivateSecondLocation(
  control: RuntimeControl,
  server: string,
  database: string,
  ownerToken: string,
  fid: number,
): Promise<PrivateResourceTarget> {
  const castles = await queryRows(
    control, server, database, ownerToken,
    'SELECT owner_fid, tile_key FROM castle',
    ['owner_fid', 'tile_key'],
  );
  const castle = castles.find(row => row.owner_fid === String(fid));
  if (castle === undefined) fail('Target founder castle was missing.');
  const cells = await queryRows(
    control, server, database, ownerToken,
    'SELECT cell_key, atlas_id, chunk_handle, component_key, route_depth, '
      + 'atlas_q, atlas_r, elevation '
      + 'FROM greater_realm_cell_v1',
    [
      'cell_key', 'atlas_id', 'chunk_handle', 'component_key',
      'route_depth', 'atlas_q', 'atlas_r', 'elevation',
    ],
  );
  const cellByKey = new Map(cells.map(row => [row.cell_key!, row]));
  const origin = cellByKey.get(castle.tile_key!);
  if (origin === undefined) fail('Target founder origin cell was missing.');
  const atlasId = origin.atlas_id;
  if (
    atlasId === undefined
    || atlasId.length < 1
    || atlasId.length > 128
    || /[\r\n\0]/.test(atlasId)
  ) fail('Target founder atlas was invalid.');
  const originComponent = sqlOptionalString(origin.component_key, 'Origin component');
  if (originComponent === undefined || !/^GRC-[A-Z2-7]{26}$/.test(originComponent)) {
    fail('Target founder origin component was invalid.');
  }
  const nodes = await queryRows(
    control, server, database, ownerToken,
    'SELECT node_id, atlas_id, location_id, cell_key, region_id, component_key, resource_kind, '
      + 'node_ordinal, release_ordinal, allocation_rank, active '
      + 'FROM greater_realm_resource_node_v1',
    [
      'node_id', 'atlas_id', 'location_id', 'cell_key', 'region_id', 'component_key',
      'resource_kind', 'node_ordinal', 'release_ordinal', 'allocation_rank', 'active',
    ],
  );
  if (nodes.some(row => row.atlas_id !== atlasId)) {
    fail('Exporter-shaped resource nodes crossed the caller atlas.');
  }
  const privateNodeIds = new Set(nodes.map(row => row.node_id!));
  const privateComponentKeys = new Set(cells.flatMap(row => {
    const component = sqlOptionalString(row.component_key, 'Cell component');
    return component === undefined ? [] : [component];
  }));
  const groups = new Map<string, typeof nodes>();
  const chunkRows = await queryRows(
    control, server, database, ownerToken,
    'SELECT chunk_handle, atlas_id, bin_q, bin_r FROM greater_realm_chunk_v1',
    ['chunk_handle', 'atlas_id', 'bin_q', 'bin_r'],
  );
  const chunkByHandle = new Map(chunkRows.map(row => [row.chunk_handle!, row]));
  const originChunk = chunkByHandle.get(origin.chunk_handle!);
  if (originChunk === undefined || originChunk.atlas_id !== atlasId) {
    fail('Target founder origin chunk was missing from the caller atlas.');
  }
  const originChunkQ = safeInteger(originChunk.bin_q, 'Origin chunk Q');
  const originChunkR = safeInteger(originChunk.bin_r, 'Origin chunk R');
  const originAtlasQ = safeInteger(origin.atlas_q, 'Origin atlas Q');
  const originAtlasR = safeInteger(origin.atlas_r, 'Origin atlas R');
  for (const node of nodes) {
    if (node.component_key !== originComponent) continue;
    const key = `${node.region_id}:${node.resource_kind}:${node.location_id}`;
    groups.set(key, Object.freeze([...(groups.get(key) ?? []), node]));
  }
  const sequences = new Map<string, Array<Readonly<{ rows: typeof nodes; first: number }>>>();
  const validatedLocations: Array<PrivateResourceTarget['resourceReadRows'][number] & Readonly<{
    cellKey: string;
  }>> = [];
  for (const rows of groups.values()) {
    const sorted = [...rows].sort((left, right) => (
      safeInteger(left.node_ordinal, 'Resource node ordinal')
      - safeInteger(right.node_ordinal, 'Resource node ordinal')
    ));
    const first = safeInteger(sorted[0]!.node_ordinal, 'Resource first node ordinal');
    const firstRelease = safeInteger(sorted[0]!.release_ordinal, 'Resource first release ordinal');
    if (
      sorted.length < 1
      || sorted.length > 32
      || sorted.some((row, index) => (
        row.location_id !== sorted[0]!.location_id
        || row.cell_key !== sorted[0]!.cell_key
        || row.region_id !== sorted[0]!.region_id
        || row.component_key !== sorted[0]!.component_key
        || row.resource_kind !== sorted[0]!.resource_kind
        || safeInteger(row.node_ordinal, 'Resource node ordinal') !== first + index
        || safeInteger(row.release_ordinal, 'Resource release ordinal') !== firstRelease + index
        || safeInteger(row.allocation_rank, 'Resource allocation rank') !== 0xffff_ffff
        || row.active !== 'true'
      ))
    ) fail('Exporter-shaped resource location was invalid.');
    const sequenceKey = `${sorted[0]!.component_key}:${sorted[0]!.region_id}:${sorted[0]!.resource_kind}`;
    const sequence = sequences.get(sequenceKey) ?? [];
    sequence.push(Object.freeze({ rows: Object.freeze(sorted), first }));
    sequences.set(sequenceKey, sequence);
    const locationCell = cellByKey.get(sorted[0]!.cell_key!);
    if (locationCell === undefined || locationCell.atlas_id !== atlasId) {
      fail('Exporter-shaped resource cell was missing from the caller atlas.');
    }
    validatedLocations.push(Object.freeze({
      chunkHandle: locationCell.chunk_handle!,
      locationId: sorted[0]!.location_id!,
      atlasQ: safeInteger(locationCell.atlas_q, 'Resource atlas Q'),
      atlasR: safeInteger(locationCell.atlas_r, 'Resource atlas R'),
      resourceKind: sorted[0]!.resource_kind!,
      nodeCount: sorted.length,
      cellKey: sorted[0]!.cell_key!,
    }));
  }
  const locationsByChunk = new Map<
    string,
    readonly typeof validatedLocations[number][]
  >();
  for (const location of validatedLocations) {
    if (location.cellKey === castle.tile_key) continue;
    const chunk = chunkByHandle.get(location.chunkHandle);
    if (chunk === undefined || chunk.atlas_id !== atlasId) {
      fail('Exporter-shaped resource chunk was missing from the caller atlas.');
    }
    const binQ = safeInteger(chunk.bin_q, 'Resource chunk Q');
    const binR = safeInteger(chunk.bin_r, 'Resource chunk R');
    if (Math.abs(binQ - originChunkQ) > 4 || Math.abs(binR - originChunkR) > 4) continue;
    locationsByChunk.set(location.chunkHandle, Object.freeze([
      ...(locationsByChunk.get(location.chunkHandle) ?? []), location,
    ]));
  }
  const resourceReadChunkHandles = [...locationsByChunk]
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([handle]) => handle);
  const resourceReadAccessible = validatedLocations.filter(location => (
    location.cellKey !== castle.tile_key
    && resourceReadChunkHandles.includes(location.chunkHandle)
  )).sort((left, right) => {
    const leftQ = left.atlasQ - originAtlasQ;
    const leftR = left.atlasR - originAtlasR;
    const rightQ = right.atlasQ - originAtlasQ;
    const rightR = right.atlasR - originAtlasR;
    return Math.max(Math.abs(leftQ), Math.abs(leftR), Math.abs(leftQ + leftR))
      - Math.max(Math.abs(rightQ), Math.abs(rightR), Math.abs(rightQ + rightR))
      || left.resourceKind.localeCompare(right.resourceKind)
      || left.locationId.localeCompare(right.locationId);
  });
  if (
    resourceReadChunkHandles.length < 1
    || resourceReadChunkHandles.length > 8
    || resourceReadAccessible.length < 1
    || resourceReadAccessible.length > 128
    || new Set(resourceReadAccessible.map(row => row.locationId)).size
      !== resourceReadAccessible.length
  ) fail(`Bounded resource read was outside its exact non-truncated boundary (accessible=${resourceReadAccessible.length}).`);
  const reservedCounts = new Map<string, number>();
  const selectedLocationIds = new Set<string>();
  for (const location of resourceReadAccessible) {
    const count = reservedCounts.get(location.resourceKind) ?? 0;
    if (count >= 6) continue;
    reservedCounts.set(location.resourceKind, count + 1);
    selectedLocationIds.add(location.locationId);
  }
  for (const location of resourceReadAccessible) {
    if (selectedLocationIds.size >= 128) break;
    selectedLocationIds.add(location.locationId);
  }
  const resourceReadRows = Object.freeze(resourceReadAccessible.filter(location => (
    selectedLocationIds.has(location.locationId)
  )).map(({ cellKey: _cellKey, ...location }) => Object.freeze(location)));
  if (
    resourceReadRows.length !== resourceReadAccessible.length
    || resourceReadRows.length > 128
  ) fail('Bounded resource read projection was not exact.');
  const candidates: Array<PrivateResourceTarget> = [];
  const originDepth = safeInteger(origin.route_depth, 'Origin route depth');
  let sequencesWithSecond = 0;
  let secondWithCapacity = 0;
  let secondAwayFromOrigin = 0;
  for (const sequence of sequences.values()) {
    sequence.sort((left, right) => left.first - right.first);
    const second = sequence[1];
    if (second === undefined) continue;
    sequencesWithSecond += 1;
    if (second.first <= 0 || second.rows.length < 2) continue;
    secondWithCapacity += 1;
    const first = second.rows[0]!;
    if (first.cell_key === castle.tile_key) continue;
    secondAwayFromOrigin += 1;
    const cell = cellByKey.get(first.cell_key!);
    if (
      cell === undefined
      || sqlOptionalString(cell.component_key, 'Target component') !== originComponent
    ) continue;
    const targetDepth = safeInteger(cell.route_depth, 'Target route depth');
    const chunk = chunkByHandle.get(cell.chunk_handle!);
    if (chunk === undefined || chunk.atlas_id !== atlasId) {
      fail('Selected resource chunk was missing from the caller atlas.');
    }
    candidates.push(Object.freeze({
      atlasId,
      originCellKey: origin.cell_key!,
      originAtlasQ,
      originAtlasR,
      originElevation: safeInteger(origin.elevation, 'Origin elevation'),
      originChunkHandle: origin.chunk_handle!,
      originChunkBinQ: originChunkQ,
      originChunkBinR: originChunkR,
      locationId: first.location_id!,
      cellKey: first.cell_key!,
      chunkHandle: cell.chunk_handle!,
      chunkBinQ: safeInteger(chunk.bin_q, 'Target chunk Q'),
      chunkBinR: safeInteger(chunk.bin_r, 'Target chunk R'),
      resourceKind: first.resource_kind!,
      nodeCount: second.rows.length,
      firstNodeOrdinal: second.first,
      routeDepthBound: originDepth + targetDepth,
      resourceReadChunkHandles: Object.freeze(resourceReadChunkHandles),
      resourceReadRows,
      resourceReadAccessibleCount: resourceReadAccessible.length,
      privateNodeIds,
      privateComponentKeys,
    }));
  }
  candidates.sort((left, right) => left.routeDepthBound - right.routeDepthBound);
  const selected = candidates[0];
  if (selected === undefined) {
    fail(
      'No exporter-shaped nonzero-ordinal second resource location was available '
      + `(sequences=${sequences.size};second=${sequencesWithSecond};`
      + `capacity=${secondWithCapacity};away=${secondAwayFromOrigin}).`,
    );
  }
  if (
    !/^GRL-[A-Z2-7]{26}$/.test(selected.locationId)
    || selected.firstNodeOrdinal <= 0
    || selected.nodeCount < 2
    || !['food', 'wood', 'stone', 'gold'].includes(selected.resourceKind)
  ) fail('Selected second resource location was malformed.');
  if (selected.routeDepthBound > 8_192) {
    fail('Selected second resource route depth exceeded the production bound.');
  }
  return selected;
}

function activationCounters(rows: ReadonlyArray<Readonly<Record<string, string>>>) {
  if (rows.length !== 1) fail('Activation counter row cardinality was invalid.');
  return Object.freeze({
    mode: rows[0]!.mode,
    nextAllocationSequence: readUnsigned(rows[0]!.next_allocation_sequence, 'Allocation sequence'),
    founding: readUnsigned(rows[0]!.post_canary_founding_count, 'Founding counter'),
    dispatch: readUnsigned(rows[0]!.post_canary_dispatch_count, 'Dispatch counter'),
  });
}

async function readActivationCounters(
  control: RuntimeControl,
  server: string,
  database: string,
  ownerToken: string,
) {
  return activationCounters(await queryRows(
    control, server, database, ownerToken,
    'SELECT mode, next_allocation_sequence, post_canary_founding_count, '
      + 'post_canary_dispatch_count FROM greater_realm_activation_v1',
    ['mode', 'next_allocation_sequence', 'post_canary_founding_count', 'post_canary_dispatch_count'],
  ));
}

type ReceiptMetadata = Readonly<{
  requestKey: string;
  leaseId: string;
  nodeCount: number;
  capacityDigest: string;
}>;

async function readDispatchReceipts(
  control: RuntimeControl,
  server: string,
  database: string,
  ownerToken: string,
  fid: number,
): Promise<readonly ReceiptMetadata[]> {
  const rows = await queryRows(
    control, server, database, ownerToken,
    'SELECT request_key, fid, command_kind, site_id FROM worker_command_idempotency_v1',
    ['request_key', 'fid', 'command_kind', 'site_id'],
  );
  return Object.freeze(rows.filter(row => (
    row.fid === String(fid) && row.command_kind?.startsWith('dispatch-v2:')
  )).map(row => {
    const match = /^dispatch-v2:(?:0|[1-9][0-9]{0,19}):([1-9]|[12][0-9]|3[0-2]):([0-9a-f]{64}):[0-9a-f]{64}$/.exec(row.command_kind!);
    const leaseId = sqlOptionalString(row.site_id, 'Private dispatch lease');
    if (match === null || leaseId === undefined) fail('Private dispatch receipt was invalid.');
    return Object.freeze({
      requestKey: row.request_key!,
      leaseId,
      nodeCount: Number(match[1]),
      capacityDigest: match[2]!,
    });
  }));
}

function assertNoPrivateAuthority(
  outputs: readonly string[],
  target: PrivateResourceTarget,
  capacityDigests: ReadonlySet<string>,
): void {
  const combined = outputs.join('\n');
  const exposedOpaque = new Set(combined.match(/(?:GRN|GRC)-[A-Z2-7]{26}/g) ?? []);
  if (
    [...exposedOpaque].some(value => (
      target.privateNodeIds.has(value) || target.privateComponentKeys.has(value)
    ))
    || [...capacityDigests].some(value => combined.includes(value))
    || /(?:nodeId|node_id|componentKey|component_key|capacityDigest|capacity_digest)/.test(combined)
  ) fail('A public output exposed private Greater Realm authority.');
}

const monotonicNanosecondsPerMillisecond = 1_000_000n;

function monotonicNow(): bigint {
  return process.hrtime.bigint();
}

function monotonicElapsedMilliseconds(started: bigint, finished = monotonicNow()): number {
  if (finished < started) fail('Monotonic clock moved backwards.');
  return Number(
    (finished - started + monotonicNanosecondsPerMillisecond - 1n)
      / monotonicNanosecondsPerMillisecond,
  );
}

function routeObservationBudgetMilliseconds(
  routeSteps: number,
  travelLegs: 1 | 2,
  includesGathering: boolean,
): number {
  if (!Number.isSafeInteger(routeSteps) || routeSteps < 1 || routeSteps > 8_192) {
    fail('Worker route-step observation bound was invalid.');
  }
  return routeSteps * rehearsalTravelMillisecondsPerStep * travelLegs
    + (includesGathering ? rehearsalGatheringDurationMilliseconds : 0)
    + lifecycleObservationMarginMilliseconds;
}

type Observation<T> = Readonly<{
  promise: Promise<T>;
  cancel: () => void;
}>;

function startObservation<T>(run: (cancelled: () => boolean) => Promise<T>): Observation<T> {
  let cancelled = false;
  const promise = run(() => cancelled);
  void promise.catch(() => { /* The owning proof awaits and preserves the primary failure. */ });
  return Object.freeze({
    promise,
    cancel: () => { cancelled = true; },
  });
}

async function pollWorkerJourney(
  callers: ProofCallers,
  fid: number,
  workerId: string,
  requiredStatuses: readonly string[],
  routeSteps: number,
  cancelled: () => boolean,
): Promise<Readonly<{ outputs: readonly string[]; statuses: ReadonlySet<string> }>> {
  const deadline = monotonicNow() + BigInt(routeObservationBudgetMilliseconds(
    routeSteps, 2, true,
  )) * monotonicNanosecondsPerMillisecond;
  const statuses = new Set<string>();
  const outputs: string[] = [];
  while (!cancelled() && monotonicNow() < deadline) {
    const text = await callers.callPlayer(fid, 'get_my_worker_control_state_v2');
    outputs.push(text);
    const control = parseWorkerControl(text);
    const worker = control.workers.find(row => row.workerId === workerId);
    if (worker === undefined) fail('Journey Worker disappeared from its roster.');
    statuses.add(worker.status);
    if (
      worker.status === 'idle'
      && requiredStatuses.every(status => statuses.has(status))
    ) return Object.freeze({ outputs: Object.freeze(outputs), statuses });
    await new Promise(resolvePromise => setTimeout(resolvePromise, 25));
  }
  if (cancelled()) fail('Natural Worker lifecycle observation was cancelled.');
  fail('Natural Worker lifecycle exceeded its route-derived deadline.');
}

async function observeWorkersGathering(
  callers: ProofCallers,
  fid: number,
  workerIds: readonly string[],
  routeSteps: number,
  cancelled: () => boolean,
): Promise<readonly string[]> {
  const deadline = monotonicNow() + BigInt(routeObservationBudgetMilliseconds(
    routeSteps, 1, false,
  )) * monotonicNanosecondsPerMillisecond;
  const outputs: string[] = [];
  while (!cancelled() && monotonicNow() < deadline) {
    const text = await callers.callPlayer(fid, 'get_my_worker_control_state_v2');
    outputs.push(text);
    const control = parseWorkerControl(text);
    if (workerIds.every(id => control.workers.find(row => row.workerId === id)?.status === 'gathering')) {
      return Object.freeze(outputs);
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 25));
  }
  if (cancelled()) fail('Concurrent Worker gathering observation was cancelled.');
  fail('Concurrent Workers did not reach gathering within the route-derived deadline.');
}

async function observeWorkersReturn(
  callers: ProofCallers,
  fid: number,
  workerIds: readonly string[],
  routeSteps: number,
  cancelled: () => boolean,
): Promise<readonly string[]> {
  const deadline = monotonicNow() + BigInt(routeObservationBudgetMilliseconds(
    routeSteps, 1, false,
  )) * monotonicNanosecondsPerMillisecond;
  const outputs: string[] = [];
  const returning = new Set<string>();
  while (!cancelled() && monotonicNow() < deadline) {
    const text = await callers.callPlayer(fid, 'get_my_worker_control_state_v2');
    outputs.push(text);
    const control = parseWorkerControl(text);
    for (const workerId of workerIds) {
      if (control.workers.find(row => row.workerId === workerId)?.status === 'returning') {
        returning.add(workerId);
      }
    }
    if (
      returning.size === workerIds.length
      && workerIds.every(id => control.workers.find(row => row.workerId === id)?.status === 'idle')
    ) {
      return Object.freeze(outputs);
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 25));
  }
  if (cancelled()) fail('Worker return observation was cancelled.');
  fail('Recalled Workers did not complete the observed return within the route-derived deadline.');
}

const founderAtomicityQueries = Object.freeze([
  'SELECT * FROM allowed_fid',
  'SELECT * FROM access_request_v1',
  'SELECT * FROM castle',
  'SELECT * FROM realm_profile_v1',
  'SELECT * FROM mark_account_v1',
  'SELECT * FROM resource_account_v1',
  'SELECT * FROM greater_realm_castle_claim_v1',
  'SELECT * FROM greater_realm_cell_occupancy_v1',
  'SELECT * FROM castle_worker_v1',
  'SELECT * FROM realm_worker_system_v1',
  'SELECT * FROM realm_worker_system_v2',
  'SELECT * FROM castle_inner_builder_v1',
  'SELECT * FROM greater_realm_activation_v1',
  'SELECT * FROM daily_mark_grant_v1',
  'SELECT * FROM admin_audit',
]);

type PopulationWindowExpectation = Readonly<{
  atlasId: string;
  centerQ: number;
  centerR: number;
  callerCastleId: bigint;
  callerCellKey: string;
  callerAtlasQ: number;
  callerAtlasR: number;
  callerElevation: number;
  chunks: readonly Readonly<{
    chunkHandle: string;
    binQ: number;
    binR: number;
    coreCellCount: number;
    apronCellCount: number;
    lod0CellCount: number;
    lod1CellCount: number;
    lod2CellCount: number;
    lod3CellCount: number;
  }>[];
  castles: readonly Readonly<{
    castleId: bigint;
    chunkHandle: string;
    atlasQ: number;
    atlasR: number;
    level: number;
    elevation: number;
  }>[];
}>;

async function assertPopulationSqlShapeAt101(
  control: RuntimeControl,
  server: string,
  database: string,
  ownerToken: string,
): Promise<void> {
  const activations = await queryRows(
    control, server, database, ownerToken,
    'SELECT activation_id, atlas_id, mode, snapshot_castle_count, snapshot_claim_count, '
      + 'planned_at, canary_at, activated_at FROM greater_realm_activation_v1',
    [
      'activation_id', 'atlas_id', 'mode', 'snapshot_castle_count',
      'snapshot_claim_count', 'planned_at', 'canary_at', 'activated_at',
    ],
  );
  const claims = await queryRows(
    control, server, database, ownerToken,
    'SELECT slot_id, owner_fid, castle_id, atlas_id, activation_id, state, claim_kind, '
      + 'allocation_sequence, planned_at, activated_at '
      + 'FROM greater_realm_castle_claim_v1',
    [
      'slot_id', 'owner_fid', 'castle_id', 'atlas_id', 'activation_id', 'state',
      'claim_kind', 'allocation_sequence', 'planned_at', 'activated_at',
    ],
  );
  const slots = await queryRows(
    control, server, database, ownerToken,
    'SELECT slot_id, atlas_id, cell_key, region_id, component_key, tier, '
      + 'region_order_rank, allocation_rank, active FROM greater_realm_castle_slot_v1',
    [
      'slot_id', 'atlas_id', 'cell_key', 'region_id', 'component_key', 'tier',
      'region_order_rank', 'allocation_rank', 'active',
    ],
  );
  const occupancy = await queryRows(
    control, server, database, ownerToken,
    'SELECT cell_key, atlas_id, region_id, castle_id, atlas_revision, occupied_at '
      + 'FROM greater_realm_cell_occupancy_v1',
    ['cell_key', 'atlas_id', 'region_id', 'castle_id', 'atlas_revision', 'occupied_at'],
  );
  const castles = await queryRows(
    control, server, database, ownerToken,
    'SELECT castle_id, owner_fid, tile_key, q, r, level FROM castle',
    ['castle_id', 'owner_fid', 'tile_key', 'q', 'r', 'level'],
  );
  const cells = await queryRows(
    control, server, database, ownerToken,
    'SELECT cell_key, atlas_id, region_id, component_key, chunk_handle, atlas_q, atlas_r, '
      + 'tier, passable, elevation FROM greater_realm_cell_v1',
    [
      'cell_key', 'atlas_id', 'region_id', 'component_key', 'chunk_handle',
      'atlas_q', 'atlas_r', 'tier', 'passable', 'elevation',
    ],
  );
  const chunks = await queryRows(
    control, server, database, ownerToken,
    'SELECT chunk_handle, atlas_id, bin_q, bin_r, core_cell_count, apron_cell_count, '
      + 'lod_0_cell_count, lod_1_cell_count, lod_2_cell_count, lod_3_cell_count '
      + 'FROM greater_realm_chunk_v1',
    [
      'chunk_handle', 'atlas_id', 'bin_q', 'bin_r', 'core_cell_count',
      'apron_cell_count', 'lod_0_cell_count', 'lod_1_cell_count',
      'lod_2_cell_count', 'lod_3_cell_count',
    ],
  );
  const builders = await queryRows(
    control, server, database, ownerToken,
    'SELECT castle_id, fid FROM castle_inner_builder_v1',
    ['castle_id', 'fid'],
  );
  const workers = await queryRows(
    control, server, database, ownerToken,
    'SELECT worker_id, origin_castle_id, ordinal FROM castle_worker_v1',
    ['worker_id', 'origin_castle_id', 'ordinal'],
  );
  const roots = await queryRows(
    control, server, database, ownerToken,
    'SELECT current_castle_count, current_worker_count, workers_per_castle, '
      + 'castle_capacity, roster_digest, mode FROM realm_worker_system_v2',
    [
      'current_castle_count', 'current_worker_count', 'workers_per_castle',
      'castle_capacity', 'roster_digest', 'mode',
    ],
  );
  const legacyRoots = await queryRows(
    control, server, database, ownerToken,
    'SELECT expected_castle_count, expected_worker_count, roster_digest, mode '
      + 'FROM realm_worker_system_v1',
    ['expected_castle_count', 'expected_worker_count', 'roster_digest', 'mode'],
  );
  if (
    activations.length !== 1
    || claims.length !== 101
    || slots.length !== 600
    || occupancy.length !== 101
    || castles.length !== 101
    || cells.length !== 16_475
    || chunks.length !== 208
    || builders.length !== 101
    || workers.length !== 404
    || roots.length !== 1
    || legacyRoots.length !== 1
  ) fail('Founder 101 population SQL row shapes were invalid.');
  const requireText = (value: string | undefined, label: string): string => {
    if (value === undefined || value.length < 1 || value.length > 256 || /[\r\n\0]/.test(value)) {
      fail(`${label} text encoding was invalid.`);
    }
    return value;
  };
  const activation = activations[0]!;
  requireText(activation.activation_id, 'Probe activation id');
  requireText(activation.atlas_id, 'Probe activation atlas');
  requireText(activation.mode, 'Probe activation mode');
  readUnsigned(activation.snapshot_castle_count, 'Probe activation castles');
  readUnsigned(activation.snapshot_claim_count, 'Probe activation claims');
  for (const [value, label] of [
    [activation.planned_at, 'Probe activation planned'],
    [activation.canary_at, 'Probe activation canary'],
    [activation.activated_at, 'Probe activation committed'],
  ] as const) {
    if (parseGreaterRealmConnectedSqlTimestampNanoseconds(value, label) === undefined) {
      fail(`${label} was unavailable.`);
    }
  }
  for (const claim of claims) {
    for (const [value, label] of [
      [claim.slot_id, 'Probe claim slot'],
      [claim.atlas_id, 'Probe claim atlas'],
      [claim.activation_id, 'Probe claim activation'],
      [claim.state, 'Probe claim state'],
      [claim.claim_kind, 'Probe claim kind'],
    ] as const) requireText(value, label);
    readUnsigned(claim.owner_fid, 'Probe claim owner');
    readUnsigned(claim.castle_id, 'Probe claim castle');
    readUnsigned(claim.allocation_sequence, 'Probe claim sequence');
    if (
      parseGreaterRealmConnectedSqlTimestampNanoseconds(
        claim.planned_at, 'Probe claim planned',
      ) === undefined
      || parseGreaterRealmConnectedSqlTimestampNanoseconds(
        claim.activated_at, 'Probe claim activated',
      ) === undefined
    ) fail('Probe claim timestamp was unavailable.');
  }
  for (const slot of slots) {
    for (const [value, label] of [
      [slot.slot_id, 'Probe slot id'], [slot.atlas_id, 'Probe slot atlas'],
      [slot.cell_key, 'Probe slot cell'], [slot.region_id, 'Probe slot region'],
    ] as const) requireText(value, label);
    sqlOptionalString(slot.component_key, 'Probe slot component');
    readUnsigned(slot.tier, 'Probe slot tier');
    safeInteger(slot.region_order_rank, 'Probe slot region rank');
    safeInteger(slot.allocation_rank, 'Probe slot allocation rank');
    readBoolean(slot.active, 'Probe slot active');
  }
  for (const row of occupancy) {
    requireText(row.cell_key, 'Probe occupancy cell');
    requireText(row.atlas_id, 'Probe occupancy atlas');
    requireText(row.region_id, 'Probe occupancy region');
    readUnsigned(row.castle_id, 'Probe occupancy castle');
    readUnsigned(row.atlas_revision, 'Probe occupancy revision');
    if (parseGreaterRealmConnectedSqlTimestampNanoseconds(
      row.occupied_at, 'Probe occupancy timestamp',
    ) === undefined) fail('Probe occupancy timestamp was unavailable.');
  }
  for (const castle of castles) {
    requireText(castle.tile_key, 'Probe castle tile');
    readUnsigned(castle.castle_id, 'Probe castle id');
    readUnsigned(castle.owner_fid, 'Probe castle owner');
    safeInteger(castle.q, 'Probe castle q');
    safeInteger(castle.r, 'Probe castle r');
    safeInteger(castle.level, 'Probe castle level');
  }
  for (const cell of cells) {
    requireText(cell.cell_key, 'Probe cell key');
    requireText(cell.atlas_id, 'Probe cell atlas');
    requireText(cell.region_id, 'Probe cell region');
    sqlOptionalString(cell.component_key, 'Probe cell component');
    requireText(cell.chunk_handle, 'Probe cell chunk');
    safeInteger(cell.atlas_q, 'Probe cell q');
    safeInteger(cell.atlas_r, 'Probe cell r');
    readUnsigned(cell.tier, 'Probe cell tier');
    readBoolean(cell.passable, 'Probe cell passable');
    safeInteger(cell.elevation, 'Probe cell elevation');
  }
  for (const chunk of chunks) {
    requireText(chunk.chunk_handle, 'Probe chunk handle');
    requireText(chunk.atlas_id, 'Probe chunk atlas');
    for (const [value, label] of [
      [chunk.bin_q, 'Probe chunk q'], [chunk.bin_r, 'Probe chunk r'],
      [chunk.core_cell_count, 'Probe chunk core'],
      [chunk.apron_cell_count, 'Probe chunk apron'],
      [chunk.lod_0_cell_count, 'Probe chunk lod0'],
      [chunk.lod_1_cell_count, 'Probe chunk lod1'],
      [chunk.lod_2_cell_count, 'Probe chunk lod2'],
      [chunk.lod_3_cell_count, 'Probe chunk lod3'],
    ] as const) safeInteger(value, label);
  }
  for (const builder of builders) {
    readUnsigned(builder.castle_id, 'Probe builder castle');
    readUnsigned(builder.fid, 'Probe builder fid');
  }
  for (const worker of workers) {
    requireText(worker.worker_id, 'Probe Worker id');
    readUnsigned(worker.origin_castle_id, 'Probe Worker castle');
    readUnsigned(worker.ordinal, 'Probe Worker ordinal');
  }
  for (const root of [roots[0]!, legacyRoots[0]!]) {
    for (const [key, value] of Object.entries(root)) {
      if (key === 'roster_digest' || key === 'mode') requireText(value, `Probe root ${key}`);
      else readUnsigned(value, `Probe root ${key}`);
    }
  }
}

async function assertPopulationGraph(
  control: RuntimeControl,
  server: string,
  database: string,
  ownerToken: string,
  expectedDispatchCount: bigint,
  founderFid: number,
  target: PrivateResourceTarget,
): Promise<PopulationWindowExpectation> {
  for (const [table, count] of [
    ['allowed_fid', 600n],
    ['castle', 600n],
    ['realm_profile_v1', 600n],
    ['mark_account_v1', 600n],
    ['resource_account_v1', 600n],
    ['greater_realm_castle_slot_v1', 600n],
    ['greater_realm_castle_claim_v1', 600n],
    ['greater_realm_cell_occupancy_v1', 600n],
    ['castle_worker_v1', 2_400n],
    ['castle_inner_builder_v1', 600n],
    ['access_request_v1', 500n],
  ] as const) {
    if (await countWhere(control, server, database, ownerToken, table) !== count) {
      fail(`Final population count was invalid for ${table}.`);
    }
  }
  if (await countWhere(
    control, server, database, ownerToken, 'allowed_fid', 'enabled = true',
  ) !== 600n) fail('Final admission enablement count was invalid.');
  const activations = await queryRows(
    control, server, database, ownerToken,
    'SELECT activation_id, atlas_id, mode, snapshot_castle_count, snapshot_claim_count, '
      + 'planned_at, canary_at, activated_at FROM greater_realm_activation_v1',
    [
      'activation_id', 'atlas_id', 'mode', 'snapshot_castle_count',
      'snapshot_claim_count', 'planned_at', 'canary_at', 'activated_at',
    ],
  );
  const claims = await queryRows(
    control, server, database, ownerToken,
    'SELECT slot_id, owner_fid, castle_id, atlas_id, activation_id, state, claim_kind, '
      + 'allocation_sequence, planned_at, activated_at '
      + 'FROM greater_realm_castle_claim_v1',
    [
      'slot_id', 'owner_fid', 'castle_id', 'atlas_id', 'activation_id', 'state',
      'claim_kind', 'allocation_sequence', 'planned_at', 'activated_at',
    ],
  );
  const slots = await queryRows(
    control, server, database, ownerToken,
    'SELECT slot_id, atlas_id, cell_key, region_id, component_key, tier, '
      + 'region_order_rank, allocation_rank, active FROM greater_realm_castle_slot_v1',
    [
      'slot_id', 'atlas_id', 'cell_key', 'region_id', 'component_key', 'tier',
      'region_order_rank', 'allocation_rank', 'active',
    ],
  );
  const occupancy = await queryRows(
    control, server, database, ownerToken,
    'SELECT cell_key, atlas_id, region_id, castle_id, atlas_revision, occupied_at '
      + 'FROM greater_realm_cell_occupancy_v1',
    ['cell_key', 'atlas_id', 'region_id', 'castle_id', 'atlas_revision', 'occupied_at'],
  );
  const castles = await queryRows(
    control, server, database, ownerToken,
    'SELECT castle_id, owner_fid, tile_key, q, r, level FROM castle',
    ['castle_id', 'owner_fid', 'tile_key', 'q', 'r', 'level'],
  );
  const cells = await queryRows(
    control, server, database, ownerToken,
    'SELECT cell_key, atlas_id, region_id, component_key, chunk_handle, atlas_q, atlas_r, '
      + 'tier, passable, elevation '
      + 'FROM greater_realm_cell_v1',
    [
      'cell_key', 'atlas_id', 'region_id', 'component_key', 'chunk_handle',
      'atlas_q', 'atlas_r', 'tier', 'passable', 'elevation',
    ],
  );
  const chunks = await queryRows(
    control, server, database, ownerToken,
    'SELECT chunk_handle, atlas_id, bin_q, bin_r, core_cell_count, apron_cell_count, '
      + 'lod_0_cell_count, lod_1_cell_count, lod_2_cell_count, lod_3_cell_count '
      + 'FROM greater_realm_chunk_v1',
    [
      'chunk_handle', 'atlas_id', 'bin_q', 'bin_r', 'core_cell_count',
      'apron_cell_count', 'lod_0_cell_count', 'lod_1_cell_count',
      'lod_2_cell_count', 'lod_3_cell_count',
    ],
  );
  const builders = await queryRows(
    control, server, database, ownerToken,
    'SELECT castle_id, fid FROM castle_inner_builder_v1',
    ['castle_id', 'fid'],
  );
  const workers = await queryRows(
    control, server, database, ownerToken,
    'SELECT worker_id, origin_castle_id, ordinal FROM castle_worker_v1',
    ['worker_id', 'origin_castle_id', 'ordinal'],
  );
  const slotById = new Map(slots.map(row => [row.slot_id!, row]));
  const castleById = new Map(castles.map(row => [row.castle_id!, row]));
  const cellByKey = new Map(cells.map(row => [row.cell_key!, row]));
  const chunkByHandle = new Map(chunks.map(row => [row.chunk_handle!, row]));
  const occupancyByCell = new Map(occupancy.map(row => [row.cell_key!, row]));
  const builderByCastle = new Map(builders.map(row => [row.castle_id!, row]));
  const activation = activations[0];
  const activationPlannedAt = activation === undefined
    ? undefined
    : parseGreaterRealmConnectedSqlTimestampNanoseconds(
      activation.planned_at,
      'Activation planned timestamp',
    );
  const activationCanaryAt = activation === undefined
    ? undefined
    : parseGreaterRealmConnectedSqlTimestampNanoseconds(
      activation.canary_at,
      'Activation canary timestamp',
    );
  const activationActivatedAt = activation === undefined
    ? undefined
    : parseGreaterRealmConnectedSqlTimestampNanoseconds(
      activation.activated_at,
      'Activation committed timestamp',
    );
  if (
    activations.length !== 1
    || activation === undefined
    || activation.activation_id === undefined
    || activation.activation_id.length < 1
    || activation.atlas_id === undefined
    || activation.mode !== 'active'
    || readUnsigned(activation.snapshot_castle_count, 'Activation snapshot castles') !== 100n
    || readUnsigned(activation.snapshot_claim_count, 'Activation snapshot claims') !== 100n
    || activationPlannedAt === undefined
    || activationCanaryAt === undefined
    || activationActivatedAt === undefined
  ) fail('Final active allocation root was invalid.');
  const regionCounts = new Map<string, number>();
  const regionRanks = new Map<string, Set<number>>();
  const allocationRanks = new Set<number>();
  const sequences = new Set<string>();
  const claimedSlots = new Set<string>();
  const ownerFids = new Set<string>();
  const claimCastles = new Set<string>();
  for (const claim of claims) {
    const slot = slotById.get(claim.slot_id!);
    const castle = castleById.get(claim.castle_id!);
    const cell = slot === undefined ? undefined : cellByKey.get(slot.cell_key!);
    const occupied = slot === undefined ? undefined : occupancyByCell.get(slot.cell_key!);
    const builder = builderByCastle.get(claim.castle_id!);
    const sequence = readUnsigned(claim.allocation_sequence, 'Final allocation sequence');
    const claimPlannedAt = parseGreaterRealmConnectedSqlTimestampNanoseconds(
      claim.planned_at,
      'Claim planned timestamp',
    );
    const claimActivatedAt = parseGreaterRealmConnectedSqlTimestampNanoseconds(
      claim.activated_at,
      'Claim active timestamp',
    );
    const occupiedAt = occupied === undefined
      ? undefined
      : parseGreaterRealmConnectedSqlTimestampNanoseconds(
        occupied.occupied_at,
        'Occupancy timestamp',
      );
    const regionRank = slot === undefined
      ? -1
      : safeInteger(slot.region_order_rank, 'Slot region rank');
    const allocationRank = slot === undefined
      ? -1
      : safeInteger(slot.allocation_rank, 'Slot allocation rank');
    const cellElevation = cell === undefined
      ? undefined
      : safeInteger(cell.elevation, 'Final cell elevation');
    const existingRegionRanks = slot === undefined
      ? undefined
      : regionRanks.get(slot.region_id!) ?? new Set<number>();
    if (
      slot === undefined
      || castle === undefined
      || cell === undefined
      || occupied === undefined
      || builder === undefined
      || claim.activation_id !== activation.activation_id
      || claim.state !== 'active'
      || claimPlannedAt === undefined
      || claimActivatedAt === undefined
      || occupiedAt !== claimActivatedAt
      || (sequence < 100n
        ? claim.claim_kind !== 'relocated'
          || claimPlannedAt !== activationPlannedAt
          || claimActivatedAt !== activationCanaryAt
        : claim.claim_kind !== 'founded'
          || claimPlannedAt !== claimActivatedAt
          || claimActivatedAt < activationActivatedAt)
      || !readBoolean(slot.active, 'Final slot active flag')
      || claim.owner_fid !== castle.owner_fid
      || claim.owner_fid !== builder.fid
      || claim.castle_id !== occupied.castle_id
      || claim.castle_id !== builder.castle_id
      || castle.tile_key !== slot.cell_key
      || slot.cell_key !== cell.cell_key
      || slot.cell_key !== occupied.cell_key
      || claim.atlas_id !== slot.atlas_id
      || claim.atlas_id !== activation.atlas_id
      || claim.atlas_id !== cell.atlas_id
      || claim.atlas_id !== occupied.atlas_id
      || slot.region_id !== cell.region_id
      || slot.region_id !== occupied.region_id
      || slot.component_key !== sqlOptionalString(cell.component_key, 'Cell component')
      || readUnsigned(slot.tier, 'Final slot tier') !== 1n
      || readUnsigned(cell.tier, 'Final cell tier') !== 1n
      || !readBoolean(cell.passable, 'Final cell passability')
      || safeInteger(castle.q, 'Final castle Q') !== safeInteger(cell.atlas_q, 'Final cell Q')
      || safeInteger(castle.r, 'Final castle R') !== safeInteger(cell.atlas_r, 'Final cell R')
      || safeInteger(castle.level, 'Final castle level') < 1
      || cellElevation === undefined
      || cellElevation < -0x8000_0000
      || cellElevation > 0x7fff_ffff
      || readUnsigned(occupied.atlas_revision, 'Final occupancy revision') !== 1n
      || regionRank < 0
      || regionRank >= 100
      || allocationRank < 0
      || allocationRank >= 600
      || allocationRanks.has(allocationRank)
      || existingRegionRanks?.has(regionRank) === true
      || claimedSlots.has(claim.slot_id!)
      || ownerFids.has(claim.owner_fid!)
      || claimCastles.has(claim.castle_id!)
      || sequences.has(sequence.toString())
    ) fail('Final claim uniqueness was invalid.');
    allocationRanks.add(allocationRank);
    existingRegionRanks!.add(regionRank);
    regionRanks.set(slot.region_id!, existingRegionRanks!);
    claimedSlots.add(claim.slot_id!);
    ownerFids.add(claim.owner_fid!);
    claimCastles.add(claim.castle_id!);
    sequences.add(sequence.toString());
    regionCounts.set(slot.region_id!, (regionCounts.get(slot.region_id!) ?? 0) + 1);
  }
  const orderedSlots = [...slots].sort((left, right) => (
    safeInteger(left.allocation_rank, 'Selector slot allocation rank')
      - safeInteger(right.allocation_rank, 'Selector slot allocation rank')
  ));
  const orderedClaims = [...claims].sort((left, right) => {
    const leftSequence = readUnsigned(left.allocation_sequence, 'Selector claim sequence');
    const rightSequence = readUnsigned(right.allocation_sequence, 'Selector claim sequence');
    return leftSequence < rightSequence ? -1 : leftSequence > rightSequence ? 1 : 0;
  });
  const selectorRegionCounts = new Map<string, number>(
    [...regionCounts.keys()].map(regionId => [regionId, 0] as const),
  );
  const selectorClaimedSlots = new Set<string>();
  for (let index = 0; index < orderedClaims.length; index += 1) {
    const claim = orderedClaims[index]!;
    const sequence = readUnsigned(claim.allocation_sequence, 'Selector claim sequence');
    const minimumRegionPopulation = Math.min(...selectorRegionCounts.values());
    const expectedSlot = orderedSlots.find(slot => (
      !selectorClaimedSlots.has(slot.slot_id!)
      && selectorRegionCounts.get(slot.region_id!) === minimumRegionPopulation
    ));
    if (
      sequence !== BigInt(index)
      || expectedSlot === undefined
      || expectedSlot.slot_id !== claim.slot_id
    ) fail('Final frozen balanced selector replay was invalid.');
    selectorClaimedSlots.add(expectedSlot.slot_id!);
    selectorRegionCounts.set(
      expectedSlot.region_id!,
      selectorRegionCounts.get(expectedSlot.region_id!)! + 1,
    );
  }
  if (
    regionCounts.size !== 6
    || [...regionCounts.values()].some(count => count !== 100)
    || claims.filter(row => row.claim_kind === 'relocated').length !== 100
    || claims.filter(row => row.claim_kind === 'founded').length !== 500
    || claimedSlots.size !== 600
    || new Set(claims.map(row => row.atlas_id!)).size !== 1
    || allocationRanks.size !== 600
    || Array.from({ length: 600 }, (_, index) => index)
      .some(rank => !allocationRanks.has(rank))
    || regionRanks.size !== 6
    || [...regionRanks.values()].some(ranks => (
      ranks.size !== 100
      || Array.from({ length: 100 }, (_, index) => index).some(rank => !ranks.has(rank))
    ))
    || sequences.size !== 600
    || Array.from({ length: 600 }, (_, index) => String(index)).some(value => !sequences.has(value))
  ) fail('Final balanced allocation sequence was invalid.');
  const castleIds = new Set(castles.map(row => row.castle_id!));
  if (
    castleIds.size !== 600
    || slotById.size !== 600
    || occupancyByCell.size !== 600
    || builderByCastle.size !== 600
    || new Set(castles.map(row => row.owner_fid!)).size !== 600
    || new Set(castles.map(row => row.tile_key!)).size !== 600
    || new Set(occupancy.map(row => row.cell_key!)).size !== 600
    || new Set(occupancy.map(row => row.castle_id!)).size !== 600
    || new Set(builders.map(row => row.fid!)).size !== 600
    || occupancy.some(row => !castleIds.has(row.castle_id!))
    || builders.some(row => !castleIds.has(row.castle_id!))
  ) fail('Final castle/occupancy graph was not unique.');
  const workerOrdinals = new Map<string, Set<string>>();
  for (const worker of workers) {
    if (!castleIds.has(worker.origin_castle_id!)) fail('Final Worker was orphaned.');
    const ordinals = workerOrdinals.get(worker.origin_castle_id!) ?? new Set<string>();
    if (ordinals.has(worker.ordinal!)) fail('Final Worker ordinal was duplicated.');
    ordinals.add(worker.ordinal!);
    workerOrdinals.set(worker.origin_castle_id!, ordinals);
  }
  if (
    new Set(workers.map(row => row.worker_id!)).size !== 2_400
    || workerOrdinals.size !== 600
    || [...workerOrdinals.values()].some(ordinals => (
      ordinals.size !== 4 || ['1', '2', '3', '4'].some(value => !ordinals.has(value))
    ))
  ) fail('Final four-Worker rosters were invalid.');
  const roots = await queryRows(
    control, server, database, ownerToken,
    'SELECT current_castle_count, current_worker_count, workers_per_castle, '
      + 'castle_capacity, roster_digest, mode FROM realm_worker_system_v2',
    [
      'current_castle_count', 'current_worker_count', 'workers_per_castle',
      'castle_capacity', 'roster_digest', 'mode',
    ],
  );
  const legacyRoots = await queryRows(
    control, server, database, ownerToken,
    'SELECT expected_castle_count, expected_worker_count, roster_digest, mode '
      + 'FROM realm_worker_system_v1',
    ['expected_castle_count', 'expected_worker_count', 'roster_digest', 'mode'],
  );
  const counters = await readActivationCounters(control, server, database, ownerToken);
  if (
    roots.length !== 1
    || legacyRoots.length !== 1
    || roots[0]!.current_castle_count !== '600'
    || roots[0]!.current_worker_count !== '2400'
    || roots[0]!.workers_per_castle !== '4'
    || roots[0]!.castle_capacity !== '600'
    || roots[0]!.mode !== 'active'
    || legacyRoots[0]!.expected_castle_count !== '600'
    || legacyRoots[0]!.expected_worker_count !== '2400'
    || legacyRoots[0]!.mode !== 'active'
    || roots[0]!.roster_digest !== legacyRoots[0]!.roster_digest
    || !/^[0-9a-f]{16}$/.test(roots[0]!.roster_digest!)
    || counters.mode !== 'active'
    || counters.nextAllocationSequence !== 600n
    || counters.founding !== 500n
    || counters.dispatch !== expectedDispatchCount
  ) fail('Final current roots/counters were invalid.');

  const atlasId = claims[0]?.atlas_id;
  const windowChunk = chunkByHandle.get(target.originChunkHandle);
  const callerClaims = claims.filter(row => row.owner_fid === String(founderFid));
  const callerClaim = callerClaims[0];
  const callerSlot = callerClaim === undefined
    ? undefined
    : slotById.get(callerClaim.slot_id!);
  const callerCastle = callerClaim === undefined
    ? undefined
    : castleById.get(callerClaim.castle_id!);
  const callerCell = callerSlot === undefined
    ? undefined
    : cellByKey.get(callerSlot.cell_key!);
  const callerOccupancy = callerSlot === undefined
    ? undefined
    : occupancyByCell.get(callerSlot.cell_key!);
  const callerBuilder = callerClaim === undefined
    ? undefined
    : builderByCastle.get(callerClaim.castle_id!);
  const ownerCastles = castles.filter(row => row.owner_fid === String(founderFid));
  if (
    atlasId === undefined
    || atlasId !== target.atlasId
    || callerClaims.length !== 1
    || ownerCastles.length !== 1
    || callerClaim === undefined
    || callerSlot === undefined
    || callerCastle === undefined
    || callerCell === undefined
    || callerOccupancy === undefined
    || callerBuilder === undefined
    || ownerCastles[0]!.castle_id !== callerCastle.castle_id
    || callerClaim.castle_id !== callerCastle.castle_id
    || callerClaim.slot_id !== callerSlot.slot_id
    || callerClaim.owner_fid !== callerCastle.owner_fid
    || callerClaim.owner_fid !== callerBuilder.fid
    || callerCastle.tile_key !== callerCell.cell_key
    || callerOccupancy.cell_key !== callerCell.cell_key
    || callerOccupancy.castle_id !== callerCastle.castle_id
    || windowChunk === undefined
    || windowChunk.atlas_id !== atlasId
    || safeInteger(windowChunk.bin_q, 'Population window chunk Q') !== target.originChunkBinQ
    || safeInteger(windowChunk.bin_r, 'Population window chunk R') !== target.originChunkBinR
    || callerCell.cell_key !== target.originCellKey
    || callerCell.chunk_handle !== target.originChunkHandle
    || callerCell.atlas_id !== atlasId
    || safeInteger(callerCell.atlas_q, 'Population caller Q') !== target.originAtlasQ
    || safeInteger(callerCell.atlas_r, 'Population caller R') !== target.originAtlasR
    || safeInteger(callerCell.elevation, 'Population caller elevation')
      !== target.originElevation
  ) fail('Final caller window root was invalid.');
  const windowCastles = castles.flatMap(castle => {
    const cell = cellByKey.get(castle.tile_key!);
    if (cell === undefined) fail('Final window castle cell was missing.');
    if (cell.chunk_handle !== target.originChunkHandle) return [];
    if (cell.atlas_id !== atlasId) fail('Final window castle atlas was invalid.');
    return [Object.freeze({
      castleId: readUnsigned(castle.castle_id, 'Population window castle id'),
      chunkHandle: cell.chunk_handle!,
      atlasQ: safeInteger(cell.atlas_q, 'Population window castle Q'),
      atlasR: safeInteger(cell.atlas_r, 'Population window castle R'),
      level: safeInteger(castle.level, 'Population window castle level'),
      elevation: safeInteger(cell.elevation, 'Population window castle elevation'),
    })];
  }).sort((left, right) => (
    left.castleId < right.castleId ? -1 : left.castleId > right.castleId ? 1 : 0
  ));
  const callerCastleId = readUnsigned(
    callerCastle.castle_id,
    'Population window caller castle id',
  );
  if (
    windowCastles.length < 1
    || windowCastles.length > 600
    || new Set(windowCastles.map(row => row.castleId.toString())).size !== windowCastles.length
    || new Set(windowCastles.map(row => `${row.atlasQ}:${row.atlasR}`)).size
      !== windowCastles.length
    || windowCastles.filter(row => row.castleId === callerCastleId).length !== 1
  ) fail('Final exact-600 window castle topology was invalid.');
  return Object.freeze({
    atlasId,
    centerQ: target.originChunkBinQ,
    centerR: target.originChunkBinR,
    callerCastleId,
    callerCellKey: callerCell.cell_key!,
    callerAtlasQ: safeInteger(callerCell.atlas_q, 'Population caller Q'),
    callerAtlasR: safeInteger(callerCell.atlas_r, 'Population caller R'),
    callerElevation: safeInteger(callerCell.elevation, 'Population caller elevation'),
    chunks: Object.freeze([Object.freeze({
      chunkHandle: target.originChunkHandle,
      binQ: target.originChunkBinQ,
      binR: target.originChunkBinR,
      coreCellCount: safeInteger(windowChunk.core_cell_count, 'Population window core cells'),
      apronCellCount: safeInteger(windowChunk.apron_cell_count, 'Population window apron cells'),
      lod0CellCount: safeInteger(windowChunk.lod_0_cell_count, 'Population window LOD0 cells'),
      lod1CellCount: safeInteger(windowChunk.lod_1_cell_count, 'Population window LOD1 cells'),
      lod2CellCount: safeInteger(windowChunk.lod_2_cell_count, 'Population window LOD2 cells'),
      lod3CellCount: safeInteger(windowChunk.lod_3_cell_count, 'Population window LOD3 cells'),
    })]),
    castles: Object.freeze(windowCastles),
  });
}

async function verifyCurrentReads(
  callers: ProofCallers,
  fid: number,
  outputs: string[],
): Promise<ReturnType<typeof parseWorkerControl>> {
  const workerText = await callers.callPlayer(fid, 'get_my_worker_control_state_v2');
  const resourceText = await callers.callPlayer(fid, 'get_my_resource_state_v2');
  const innerKeepText = await callers.callPlayer(fid, 'get_my_inner_keep_state_v1');
  const healthText = await callers.callAdmin('admin_get_worker_system_status_v1');
  for (const text of [workerText, resourceText, innerKeepText, healthText]) {
    if (!Array.isArray(parseJson(text, 'Current gameplay read'))) {
      fail('Current gameplay read contract was invalid.');
    }
    outputs.push(text);
  }
  const health = parseWorkerHealth(healthText);
  if (
    health.systemConfigValid !== true
    || health.legacyDrainRequired !== false
    || health.expectedCountsMatch !== true
    || health.rosterDigestMatches !== true
    || health.invalidTotal !== 0n
  ) fail('Current Worker health was not exact.');
  return parseWorkerControl(workerText);
}

async function runNaturalLifecycle(
  coordinates: Readonly<{
    control: RuntimeControl;
    server: string;
    database: string;
    ownerToken: string;
    callers: ProofCallers;
    fid: number;
    target: PrivateResourceTarget;
    workerId: string;
    atlasRevision: bigint;
    routeSteps: number;
    outputs: string[];
  }>,
): Promise<Readonly<{ capacityDigest: string; elapsed: number }>> {
  const {
    control, server, database, ownerToken, callers, fid, target, workerId,
    atlasRevision, routeSteps, outputs,
  } = coordinates;
  const key = 'connected-natural-dispatch-0001';
  const before = await readActivationCounters(control, server, database, ownerToken);
  const started = monotonicNow();
  const journeyObservation = startObservation(cancelled => pollWorkerJourney(
    callers, fid, workerId, ['outbound', 'gathering', 'returning'], routeSteps, cancelled,
  ));
  try {
    await callers.callPlayer(fid, 'dispatch_greater_realm_worker_v1', [
      workerId, target.resourceKind, target.locationId,
      safeWireUnsigned(atlasRevision, 'Atlas revision'), key,
    ]);
    const afterDispatch = await readActivationCounters(control, server, database, ownerToken);
    if (afterDispatch.dispatch !== before.dispatch + 1n) {
      fail('Fresh natural dispatch did not advance exactly one counter.');
    }
    const receipts = await readDispatchReceipts(control, server, database, ownerToken, fid);
    const receipt = receipts.find(row => row.requestKey.endsWith(`:${key}`));
    if (
      receipt === undefined
      || receipt.nodeCount !== target.nodeCount
      || receipt.leaseId !== `${target.locationId}:1`
    ) fail('Fresh natural dispatch capacity receipt was invalid.');
    const journey = await journeyObservation.promise;
    outputs.push(...journey.outputs);
    const stableBefore = await tableDigest(
      control, server, database, ownerToken, 'active-population-terminal-replay', [
        'SELECT * FROM greater_realm_activation_v1',
        'SELECT * FROM resource_account_v1',
        'SELECT * FROM castle_worker_v1',
        'SELECT * FROM worker_assignment_v1',
        'SELECT * FROM worker_node_occupation_v1',
        'SELECT * FROM worker_assignment_schedule_v_1',
        'SELECT * FROM worker_command_idempotency_v1',
      ],
    );
    await callers.callPlayer(fid, 'dispatch_greater_realm_worker_v1', [
      workerId, target.resourceKind, target.locationId,
      safeWireUnsigned(atlasRevision, 'Atlas revision'), key,
    ]);
    const stableAfter = await tableDigest(
      control, server, database, ownerToken, 'active-population-terminal-replay', [
        'SELECT * FROM greater_realm_activation_v1',
        'SELECT * FROM resource_account_v1',
        'SELECT * FROM castle_worker_v1',
        'SELECT * FROM worker_assignment_v1',
        'SELECT * FROM worker_node_occupation_v1',
        'SELECT * FROM worker_assignment_schedule_v_1',
        'SELECT * FROM worker_command_idempotency_v1',
      ],
    );
    if (
      stableAfter !== stableBefore
      || (await readActivationCounters(control, server, database, ownerToken)).dispatch
        !== afterDispatch.dispatch
    ) fail('Terminal dispatch replay was not byte-stable.');
    return Object.freeze({
      capacityDigest: receipt.capacityDigest,
      elapsed: monotonicElapsedMilliseconds(started),
    });
  } catch (error) {
    journeyObservation.cancel();
    try { await journeyObservation.promise; } catch { /* Proof failure remains primary. */ }
    throw error;
  }
}

type PopulationReadAvailability = Readonly<{
  bootstrapMs: number;
  windowMs: number;
  resourceLocationsMs: number;
  chunkMs: number;
  totalMs: number;
  regionCount: number;
  windowChunkCount: number;
  windowCastleCount: number;
  coreCellCount: number;
  apronCellCount: number;
  chunkResourceLocationCount: number;
  projectedResourceLocationCount: number;
  resourceLocationsText: string;
}>;

function assertResourceLocationBatch(
  text: string,
  target: PrivateResourceTarget,
  atlasRevision: bigint,
): void {
  const batch = parseJson(text, 'Capacity resource-location batch');
  if (
    !Array.isArray(batch)
    || batch.length !== 5
    || batch[0] !== target.atlasId
    || readUnsigned(batch[1], 'Capacity resource-location revision') !== atlasRevision
    || !Array.isArray(batch[2])
    || batch[2].length !== target.resourceReadChunkHandles.length
    || batch[2].some((handle, index) => handle !== target.resourceReadChunkHandles[index])
    || batch[3] !== false
    || !Array.isArray(batch[4])
    || batch[4].length !== target.resourceReadAccessibleCount
    || batch[4].length !== target.resourceReadRows.length
    || batch[4].length > 128
  ) fail('Capacity resource-location non-truncation shape was invalid.');
  const locationIds = new Set<string>();
  for (let index = 0; index < batch[4].length; index += 1) {
    const row = batch[4][index];
    const expected = target.resourceReadRows[index];
    if (
      expected === undefined
      || !Array.isArray(row)
      || row.length !== 6
      || row[0] !== expected.chunkHandle
      || row[1] !== expected.locationId
      || row[2] !== expected.atlasQ
      || row[3] !== expected.atlasR
      || row[4] !== expected.resourceKind
      || row[5] !== expected.nodeCount
      || !target.resourceReadChunkHandles.includes(expected.chunkHandle)
      || locationIds.has(expected.locationId)
    ) fail('Capacity resource-location locality/order was invalid.');
    locationIds.add(expected.locationId);
  }
}

function assertPopulationWindow(
  text: string,
  expected: PopulationWindowExpectation,
  atlasRevision: bigint,
): Readonly<{ chunkCount: number; castleCount: number }> {
  const window = parseJson(text, 'Capacity atlas window');
  if (
    !Array.isArray(window)
    || window.length !== 7
    || window[0] !== expected.atlasId
    || readUnsigned(window[1], 'Capacity atlas window revision') !== atlasRevision
    || window[2] !== expected.centerQ
    || window[3] !== expected.centerR
    || window[4] !== 0
    || !Array.isArray(window[5])
    || window[5].length !== expected.chunks.length
    || !Array.isArray(window[6])
    || window[6].length !== expected.castles.length
  ) fail('Capacity exact-600 atlas window shape was invalid.');
  for (let index = 0; index < expected.chunks.length; index += 1) {
    const row = window[5][index];
    const chunk = expected.chunks[index]!;
    if (
      !Array.isArray(row)
      || row.length !== 9
      || row[0] !== chunk.chunkHandle
      || row[1] !== chunk.binQ
      || row[2] !== chunk.binR
      || row[3] !== chunk.coreCellCount
      || row[4] !== chunk.apronCellCount
      || row[5] !== chunk.lod0CellCount
      || row[6] !== chunk.lod1CellCount
      || row[7] !== chunk.lod2CellCount
      || row[8] !== chunk.lod3CellCount
    ) fail('Capacity exact-600 window chunk topology was invalid.');
  }
  let callerProjectionCount = 0;
  for (let index = 0; index < expected.castles.length; index += 1) {
    const row = window[6][index];
    const castle = expected.castles[index]!;
    if (
      !Array.isArray(row)
      || row.length !== 6
      || readUnsigned(row[0], 'Capacity atlas window castle id') !== castle.castleId
      || row[1] !== castle.chunkHandle
      || row[2] !== castle.atlasQ
      || row[3] !== castle.atlasR
      || row[4] !== castle.level
      || row[5] !== castle.elevation
    ) fail('Capacity exact-600 window castle topology was invalid.');
    if (castle.castleId === expected.callerCastleId) callerProjectionCount += 1;
  }
  if (callerProjectionCount !== 1) {
    fail('Capacity window did not contain the exact caller castle projection.');
  }
  return Object.freeze({
    chunkCount: window[5].length,
    castleCount: window[6].length,
  });
}

function assertReadSlo(label: string, elapsed: number, ceiling: number): void {
  if (
    !Number.isSafeInteger(elapsed)
    || elapsed < 0
    || !Number.isSafeInteger(ceiling)
    || ceiling < 1
    || elapsed > ceiling
  ) fail(`${label} exceeded its monotonic CI SLO.`);
}

async function measurePopulationReadAvailability(
  callers: ProofCallers,
  fid: number,
  target: PrivateResourceTarget,
  expectedWindow: PopulationWindowExpectation,
  atlasRevision: bigint,
  outputs: string[],
): Promise<PopulationReadAvailability> {
  const totalStarted = monotonicNow();
  const bootstrapStarted = monotonicNow();
  const bootstrapText = await callers.callPlayer(fid, 'get_realm_atlas_bootstrap_v1');
  const bootstrapMs = monotonicElapsedMilliseconds(bootstrapStarted);
  assertReadSlo(
    'Capacity atlas bootstrap', bootstrapMs,
    GREATER_REALM_CONNECTED_BOOTSTRAP_SLO_MILLISECONDS,
  );
  const bootstrap = parseJson(bootstrapText, 'Capacity atlas bootstrap');
  if (
    !Array.isArray(bootstrap)
    || bootstrap.length !== 22
    || bootstrap[0] !== expectedWindow.atlasId
    || bootstrap[15] !== 'active'
    || !Array.isArray(bootstrap[16])
    || bootstrap[16].length !== 6
    || readUnsigned(bootstrap[7], 'Capacity atlas revision') !== atlasRevision
    || readUnsigned(bootstrap[14], 'Capacity atlas castle count') !== 600n
    || readUnsigned(bootstrap[17], 'Capacity caller castle id')
      !== expectedWindow.callerCastleId
    || bootstrap[18] !== expectedWindow.callerCellKey
    || bootstrap[19] !== expectedWindow.callerAtlasQ
    || bootstrap[20] !== expectedWindow.callerAtlasR
    || bootstrap[21] !== expectedWindow.callerElevation
  ) fail('Capacity atlas bootstrap shape was invalid.');

  const windowStarted = monotonicNow();
  const windowText = await callers.callPlayer(fid, 'get_realm_atlas_window_v1', [
    expectedWindow.centerQ, expectedWindow.centerR, 0,
    safeWireUnsigned(atlasRevision, 'Capacity atlas revision'),
  ]);
  const windowMs = monotonicElapsedMilliseconds(windowStarted);
  assertReadSlo(
    'Capacity atlas window', windowMs,
    GREATER_REALM_CONNECTED_WINDOW_SLO_MILLISECONDS,
  );
  const windowShape = assertPopulationWindow(windowText, expectedWindow, atlasRevision);

  const resourceLocationsStarted = monotonicNow();
  const resourceLocationsText = await callers.callPlayer(
    fid,
    'get_realm_atlas_resource_locations_v1',
    [
      safeWireUnsigned(atlasRevision, 'Capacity atlas revision'),
      target.resourceReadChunkHandles,
    ],
  );
  const resourceLocationsMs = monotonicElapsedMilliseconds(resourceLocationsStarted);
  assertReadSlo(
    'Capacity resource locations', resourceLocationsMs,
    GREATER_REALM_CONNECTED_RESOURCE_LOCATIONS_SLO_MILLISECONDS,
  );
  assertResourceLocationBatch(resourceLocationsText, target, atlasRevision);

  const chunkStarted = monotonicNow();
  const chunkText = await callers.callPlayer(fid, 'get_realm_atlas_chunk_v1', [
    target.chunkHandle, 0, safeWireUnsigned(atlasRevision, 'Capacity atlas revision'),
  ]);
  const chunkMs = monotonicElapsedMilliseconds(chunkStarted);
  assertReadSlo(
    'Capacity atlas chunk', chunkMs,
    GREATER_REALM_CONNECTED_CHUNK_SLO_MILLISECONDS,
  );
  const chunk = parseJson(chunkText, 'Capacity atlas chunk');
  if (
    !Array.isArray(chunk)
    || chunk.length !== 8
    || chunk[0] !== target.atlasId
    || readUnsigned(chunk[1], 'Capacity atlas chunk revision') !== atlasRevision
    || chunk[2] !== target.chunkHandle
    || chunk[3] !== 0
    || !Array.isArray(chunk[5])
    || !Array.isArray(chunk[6])
    || !Array.isArray(chunk[7])
    || chunk[7].length !== 0
  ) fail('Capacity atlas chunk shape was invalid.');
  const totalMs = monotonicElapsedMilliseconds(totalStarted);
  if (totalMs + 4 < bootstrapMs + windowMs + resourceLocationsMs + chunkMs) {
    fail('Capacity public-read monotonic total was inconsistent.');
  }
  assertReadSlo(
    'Capacity public-read total', totalMs,
    GREATER_REALM_CONNECTED_READ_TOTAL_SLO_MILLISECONDS,
  );
  outputs.push(bootstrapText, windowText, resourceLocationsText, chunkText);
  return Object.freeze({
    bootstrapMs,
    windowMs,
    resourceLocationsMs,
    chunkMs,
    totalMs,
    regionCount: bootstrap[16].length,
    windowChunkCount: windowShape.chunkCount,
    windowCastleCount: windowShape.castleCount,
    coreCellCount: chunk[5].length,
    apronCellCount: chunk[6].length,
    chunkResourceLocationCount: chunk[7].length,
    projectedResourceLocationCount: target.resourceReadRows.length,
    resourceLocationsText,
  });
}

async function runAdmissionSuffix(
  callers: ProofCallers,
): Promise<number> {
  const started = Date.now();
  for (let ordinal = 102; ordinal <= 110; ordinal += 1) {
    const fid = admissionFirstFid + ordinal - 101;
    if (ordinal === 102) {
      const duplicates = await Promise.all([
        callers.submitRequest(fid), callers.submitRequest(fid),
      ]);
      if (duplicates[0]!.requestedAtMicros !== duplicates[1]!.requestedAtMicros) {
        fail('Concurrent request submission did not preserve its CAS timestamp.');
      }
      await admitFounderViaCas(callers, fid, duplicates[0]);
    } else {
      await admitFounderViaCas(callers, fid);
    }
  }
  for (
    let firstOrdinal = 111;
    firstOrdinal <= GREATER_REALM_CONNECTED_CASTLE_CAPACITY;
    firstOrdinal += GREATER_REALM_CONNECTED_ACTIVE_POPULATION_CONCURRENCY
  ) {
    const ordinals = Array.from(
      {
        length: Math.min(
          GREATER_REALM_CONNECTED_ACTIVE_POPULATION_CONCURRENCY,
          GREATER_REALM_CONNECTED_CASTLE_CAPACITY - firstOrdinal + 1,
        ),
      },
      (_, index) => firstOrdinal + index,
    );
    const fids = ordinals.map(ordinal => admissionFirstFid + ordinal - 101);
    const tuples = await Promise.all(fids.map(fid => callers.submitRequest(fid)));
    await Promise.all(fids.map((fid, index) => (
      admitFounderViaCas(callers, fid, tuples[index])
    )));
    const completed = ordinals.at(-1)!;
    if (completed % 50 === 0 || completed === 600) {
      console.log(`Connected active population: founders=${completed}/600.`);
    }
  }
  return Date.now() - started;
}

async function verifyCapacityFailure(
  control: RuntimeControl,
  server: string,
  database: string,
  ownerToken: string,
  callers: ProofCallers,
): Promise<void> {
  const fid = admissionFirstFid + 500;
  const tuple = await callers.submitRequest(fid);
  const before = await tableDigest(
    control, server, database, ownerToken, 'active-population-601-atomicity',
    founderAtomicityQueries,
  );
  const response = await callers.callAdmin(
    'admin_admit_founder_for_access_request_v2',
    admissionArguments(fid, tuple),
    530,
    120_000,
  );
  if (!response.includes('GREATER_REALM_CASTLE_CAPACITY_EXHAUSTED')) {
    fail('The 601st active founder did not reach the exact capacity boundary.');
  }
  const after = await tableDigest(
    control, server, database, ownerToken, 'active-population-601-atomicity',
    founderAtomicityQueries,
  );
  if (after !== before) fail('The 601st active founder rejection was not byte-atomic.');
}

async function runHaltedCapacityAndReturnProof(
  coordinates: Readonly<{
    control: RuntimeControl;
    server: string;
    database: string;
    ownerToken: string;
    callers: ProofCallers;
    fid: number;
    target: PrivateResourceTarget;
    workers: readonly string[];
    atlasRevision: bigint;
    routeSteps: number;
    activeResourceLocationsText: string;
    outputs: string[];
    capacityDigests: Set<string>;
  }>,
): Promise<number> {
  const {
    control, server, database, ownerToken, callers, fid, target, workers,
    atlasRevision, routeSteps, activeResourceLocationsText, outputs, capacityDigests,
  } = coordinates;
  const dispatchKeys = ['connected-capacity-dispatch-0002', 'connected-capacity-dispatch-0003'];
  const gatheringObservation = startObservation(cancelled => observeWorkersGathering(
    callers, fid, workers.slice(0, 2), routeSteps, cancelled,
  ));
  try {
    await Promise.all(workers.slice(0, 2).map((workerId, index) => callers.callPlayer(
      fid,
      'dispatch_greater_realm_worker_v1',
      [
        workerId, target.resourceKind, target.locationId,
        safeWireUnsigned(atlasRevision, 'Atlas revision'), dispatchKeys[index],
      ],
    )));
    outputs.push(...await gatheringObservation.promise);
  } catch (error) {
    gatheringObservation.cancel();
    try { await gatheringObservation.promise; } catch { /* Proof failure remains primary. */ }
    throw error;
  }
  const returnObservation = startObservation(cancelled => observeWorkersReturn(
    callers, fid, workers.slice(0, 2), routeSteps, cancelled,
  ));
  try {
    await callers.callPlayer(fid, 'dispatch_greater_realm_worker_v1', [
      workers[0], target.resourceKind, target.locationId,
      safeWireUnsigned(atlasRevision, 'Atlas revision'), dispatchKeys[0],
    ]);
    await callers.callAdmin('rehearsal_halt_greater_realm_activation_v1');
    await callers.callPlayer(fid, 'recall_worker_v1', [
      workers[0], 'connected-halted-recall-0001',
    ]);
    await callers.callPlayer(fid, 'recall_all_workers_v1', [
      'connected-halted-recall-all-0001',
    ]);
    const halted = await readActivationCounters(control, server, database, ownerToken);
    if (halted.mode !== 'halted' || halted.dispatch !== 3n || halted.founding !== 500n) {
      fail('Concurrent/replayed capacity counters or halted mode were invalid.');
    }
    const receipts = await readDispatchReceipts(control, server, database, ownerToken, fid);
    const selected = dispatchKeys.map(key => receipts.find(row => row.requestKey.endsWith(`:${key}`)));
    if (
      selected.some(row => row === undefined || row.nodeCount !== target.nodeCount)
      || new Set(selected.map(row => row!.leaseId)).size !== 2
      || !selected.some(row => row!.leaseId === `${target.locationId}:1`)
      || !selected.some(row => row!.leaseId === `${target.locationId}:2`)
    ) fail('Concurrent first-free public capacity leases were invalid.');
    selected.forEach(row => capacityDigests.add(row!.capacityDigest));

    const haltedResourceLocationsStarted = monotonicNow();
    const haltedResourceLocationsText = await callers.callPlayer(
      fid,
      'get_realm_atlas_resource_locations_v1',
      [
        safeWireUnsigned(atlasRevision, 'Halted atlas revision'),
        target.resourceReadChunkHandles,
      ],
    );
    const haltedResourceLocationsMs = monotonicElapsedMilliseconds(
      haltedResourceLocationsStarted,
    );
    assertReadSlo(
      'Halted resource locations', haltedResourceLocationsMs,
      GREATER_REALM_CONNECTED_RESOURCE_LOCATIONS_SLO_MILLISECONDS,
    );
    assertResourceLocationBatch(haltedResourceLocationsText, target, atlasRevision);
    if (haltedResourceLocationsText !== activeResourceLocationsText) {
      fail('Halted resource-location read was not stable/readable.');
    }
    outputs.push(haltedResourceLocationsText);

    // The halted read/recall proof intentionally overlaps the observed return. Settle that
    // non-vacuous lifecycle before taking any byte-level digest that includes Worker state.
    outputs.push(...await returnObservation.promise);

    const haltedFounderFid = admissionFirstFid + 501;
    const haltedTuple = await callers.submitRequest(haltedFounderFid);
    const founderBefore = await tableDigest(
      control, server, database, ownerToken, 'active-population-halted-founding',
      founderAtomicityQueries,
    );
    const founderResponse = await callers.callAdmin(
      'admin_admit_founder_for_access_request_v2',
      admissionArguments(haltedFounderFid, haltedTuple),
      530,
    );
    if (!founderResponse.includes('GREATER_REALM_CURRENT_WORLD_UNAVAILABLE')) {
      fail('Halted fresh founding did not reach current-world authority.');
    }
    const founderAfter = await tableDigest(
      control, server, database, ownerToken, 'active-population-halted-founding',
      founderAtomicityQueries,
    );
    if (founderAfter !== founderBefore) fail('Halted fresh founding was not byte-atomic.');

    const blockedKey = 'connected-halted-fresh-dispatch-0004';
    const blockedResponse = await callers.callPlayer(
      fid,
      'dispatch_greater_realm_worker_v1',
      [
        workers[2], target.resourceKind, target.locationId,
        safeWireUnsigned(atlasRevision, 'Atlas revision'), blockedKey,
      ],
      530,
    );
    if (!blockedResponse.includes('GREATER_REALM_CURRENT_WORLD_UNAVAILABLE')) {
      fail('Halted fresh dispatch did not fail closed.');
    }
    if (
      (await readActivationCounters(control, server, database, ownerToken)).dispatch !== 3n
      || (await readDispatchReceipts(control, server, database, ownerToken, fid))
        .some(row => row.requestKey.endsWith(`:${blockedKey}`))
    ) fail('Halted fresh dispatch changed receipt/counter authority.');

    await verifyCurrentReads(callers, fid, outputs);
    await callers.callPlayer(fid, 'dispatch_greater_realm_worker_v1', [
      workers[0], target.resourceKind, target.locationId,
      safeWireUnsigned(atlasRevision, 'Atlas revision'), dispatchKeys[0],
    ]);
    if ((await readActivationCounters(control, server, database, ownerToken)).dispatch !== 3n) {
      fail('Halted dispatch receipt replay advanced the counter.');
    }
    const health = parseWorkerHealth(await callers.callAdmin('admin_get_worker_system_status_v1'));
    outputs.push(health.raw);
    if (
      health.mode !== 'active'
      || health.expectedCastleCount !== 600n
      || health.expectedWorkerCount !== 2_400n
      || health.actualWorkerCount !== 2_400n
      || health.idleWorkers !== 2_400n
      || health.outboundWorkers !== 0n
      || health.gatheringWorkers !== 0n
      || health.returningWorkers !== 0n
      || health.assignments !== 0n
      || health.occupations !== 0n
      || health.schedules !== 0n
      || health.invalidTotal !== 0n
    ) fail('Halted return completion did not restore exact Worker health.');
    return haltedResourceLocationsMs;
  } catch (error) {
    returnObservation.cancel();
    try { await returnObservation.promise; } catch { /* Proof failure remains primary. */ }
    throw error;
  }
}

async function main(): Promise<void> {
  const preflightOnly = process.argv.length === 3 && process.argv[2] === preflightArgument;
  if (!preflightOnly && process.argv.length !== 2) {
    fail('Connected active-population proof accepts only its fixed preflight flag.');
  }
  const startedAt = Date.now();
  let stage = 'synthetic-release';
  const artifacts = createGreaterRealmRuntimeRelease({
    source: createGreaterRealmRuntimeReleaseFixtureSource(),
    sourceCommit: GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
    releaseSeed: greaterRealmRuntimeReleaseFixtureSeed(),
  });
  const parts = manifestParts(artifacts);
  if (
    parts.totals.regionCount !== 6
    || parts.totals.componentCount !== 8
    || parts.totals.chunkCount !== 208
    || parts.totals.cellCount !== 16_475
    || parts.totals.castleSlotCount !== 600
    || parts.totals.resourceNodeCount !== 12_000
    || artifacts.status.productionUntouched !== true
    || artifacts.status.tierOneOnly !== true
  ) fail('Tracked synthetic release was outside its exact Tier-I boundary.');

  const environment = childEnvironment();
  const control: RuntimeControl = {
    deadline: Date.now() + GREATER_REALM_CONNECTED_ACTIVE_POPULATION_TIMEOUT_MILLISECONDS,
    environment,
    deadlineExpired: false,
  };
  let runtimeDirectory: string | undefined;
  let serverProcess: ChildProcess | undefined;
  let receipt: string | undefined;
  let cleanupFailed = false;
  const forceCleanup = () => {
    terminateProcess(control.activeCliProcess);
    terminateProcess(serverProcess);
    if (runtimeDirectory !== undefined) {
      rmSync(runtimeDirectory, { recursive: true, force: true });
    }
  };
  const removeSignalCleanup = installMigrationProofSignalCleanup(forceCleanup);
  const totalDeadline = setTimeout(() => {
    control.deadlineExpired = true;
    terminateProcess(control.activeCliProcess);
    terminateProcess(serverProcess);
  }, GREATER_REALM_CONNECTED_ACTIVE_POPULATION_TIMEOUT_MILLISECONDS);

  try {
    stage = 'private-runtime-allocation';
    runtimeDirectory = mkdtempSync(join(
      tmpdir(), 'warpkeep-greater-realm-active-population-',
    ));
    const runtimeRoot = runtimeDirectory;
    await chmod(runtimeRoot, 0o700);
    const runtimeMetadata = await lstat(runtimeRoot);
    if (
      !runtimeMetadata.isDirectory()
      || runtimeMetadata.isSymbolicLink()
      || (runtimeMetadata.mode & 0o777) !== 0o700
    ) fail('Connected active-population runtime root was unsafe.');

    stage = 'cli-attestation';
    const version = await runCommand(control, ['--version'], { timeout: 10_000 });
    if (
      version.code !== 0
      || !version.stdout.includes(
        `spacetimedb tool version ${GREATER_REALM_CONNECTED_EXPECTED_CLI_VERSION};`,
      )
      || !version.stdout.includes(
        `Commit: ${GREATER_REALM_CONNECTED_EXPECTED_CLI_COMMIT}`,
      )
    ) fail('Pinned SpacetimeDB CLI 2.6.1 was not active.');

    stage = 'exact-disposable-module';
    const disposable = await createDisposableGreaterRealmRelocationModule(runtimeRoot);
    await accelerateDisposableGreaterRealmWorkerTiming(disposable.moduleDirectory);
    stage = 'disposable-build';
    const built = await runCommand(control, [
      'build', '--module-path', disposable.moduleDirectory,
    ], { timeout: 120_000 });
    if (built.code !== 0) fail('Disposable active-population module build failed safely.');
    const artifact = await readFile(disposable.artifactPath);
    if (artifact.byteLength < 1 || artifact.byteLength > 16 * 1_024 * 1_024) {
      fail('Disposable active-population module artifact was invalid.');
    }
    const artifactDigest = sha256(artifact);

    stage = 'ephemeral-authority';
    const generated = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const publicKeyPath = join(runtimeRoot, 'jwt-public.pem');
    const privateKeyPath = join(runtimeRoot, 'jwt-private.pem');
    await writeFile(publicKeyPath, generated.publicKey, {
      encoding: 'utf8', mode: 0o600, flag: 'wx',
    });
    await writeFile(privateKeyPath, generated.privateKey, {
      encoding: 'utf8', mode: 0o600, flag: 'wx',
    });
    for (const path of [publicKeyPath, privateKeyPath]) {
      const metadata = await stat(path);
      if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600) {
        fail('Disposable signing-key permissions were invalid.');
      }
    }

    stage = 'numeric-loopback-start';
    const port = await freeLoopbackPort();
    const server = `http://127.0.0.1:${port}`;
    if (!/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(server)) {
      fail('Connected active-population server was not numeric-loopback-only.');
    }
    serverProcess = containServerProcessErrors(spawn(command, [
      'start',
      '--listen-addr', `127.0.0.1:${port}`,
      '--in-memory',
      '--data-dir', join(runtimeRoot, 'database'),
      '--jwt-pub-key-path', publicKeyPath,
      '--jwt-priv-key-path', privateKeyPath,
      '--non-interactive',
    ], {
      cwd: repositoryRoot,
      env: environment,
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    }));
    await acquireDisposableIdentity(server);
    const cliConfigPath = join(runtimeRoot, 'spacetime-cli.toml');
    control.cliConfigPath = cliConfigPath;
    control.refreshPrivateSqlCredential = () => rotatePrivateSqlCredential(
      cliConfigPath, generated.privateKey,
    );
    const connectedOwnerToken = await control.refreshPrivateSqlCredential();

    stage = 'publication';
    const database = GREATER_REALM_CONNECTED_ACTIVE_POPULATION_DATABASE;
    await publishDisposableDatabase(
      control, server, database, disposable.artifactPath, connectedOwnerToken,
    );
    const adminCredential = () => createEphemeralJwt(
      generated.privateKey,
      adminServiceClaims(),
    );
    const playerCredential = (fid: number) => createEphemeralJwt(
      generated.privateKey,
      playerClaims(fid),
    );
    const callAdmin: AdminCaller = (
      name,
      arguments_ = [],
      expectedStatus = 200,
      timeout = requestTimeoutMilliseconds,
    ) => callLoopback(
      control, server, database, name, adminCredential(),
      JSON.stringify(arguments_), expectedStatus, timeout,
    );
    const callPlayer: ProofCallers['callPlayer'] = (
      fid,
      name,
      arguments_ = [],
      expectedStatus = 200,
      timeout = requestTimeoutMilliseconds,
    ) => callLoopback(
      control, server, database, name, playerCredential(fid),
      JSON.stringify(arguments_), expectedStatus, timeout,
    );
    const callers: ProofCallers = Object.freeze({
      callAdmin,
      callPlayer,
      submitRequest: async (fid: number) => parseAccessRequest(await callLoopback(
        control,
        server,
        database,
        'access_request_submit_v1',
        createEphemeralJwt(generated.privateKey, accessRequestClaims(fid)),
        '[]',
        200,
        requestTimeoutMilliseconds,
      )),
    });

    stage = 'canonical-v16-seed';
    await seedCanonicalLegacyV16(callAdmin, artifactDigest, database);
    await assertCanonicalSeedCounts(
      control, server, database, connectedOwnerToken,
    );
    stage = 'v17-import';
    const verificationCalls = await importReadyGreaterRealmV17(
      callAdmin, artifacts, database,
    );
    stage = 'active-relocation';
    const activationStarted = Date.now();
    const activation = await runActiveResumeScenario({
      control,
      server,
      database,
      ownerToken: connectedOwnerToken,
      callAdmin,
    });
    const activationElapsed = Date.now() - activationStarted;

    stage = 'founder-101-cas';
    const founderFid = admissionFirstFid;
    const founder101Started = Date.now();
    const founderTuple = await admitFounderViaCas(callers, founderFid);
    const replayBefore = await tableDigest(
      control, server, database, connectedOwnerToken,
      'active-population-founder-101-replay', founderAtomicityQueries,
    );
    const replayResponse = await callAdmin(
      'admin_admit_founder_for_access_request_v2',
      admissionArguments(founderFid, founderTuple),
      530,
    );
    if (!replayResponse.includes('ACCESS_REQUEST_ADMISSION_CAS_MISMATCH')) {
      fail('Founder 101 CAS replay did not fail at the production boundary.');
    }
    const replayAfter = await tableDigest(
      control, server, database, connectedOwnerToken,
      'active-population-founder-101-replay', founderAtomicityQueries,
    );
    if (replayAfter !== replayBefore) fail('Founder 101 CAS replay was not byte-stable.');
    const counters101 = await readActivationCounters(
      control, server, database, connectedOwnerToken,
    );
    if (
      counters101.mode !== 'active'
      || counters101.nextAllocationSequence !== 101n
      || counters101.founding !== 1n
      || counters101.dispatch !== 0n
    ) fail('Founder 101 active counters were invalid.');
    stage = 'population-sql-preflight';
    await assertPopulationSqlShapeAt101(
      control, server, database, connectedOwnerToken,
    );
    stage = 'founder-101-current-reads';
    await callPlayer(founderFid, 'bootstrap_player_v2');
    await callPlayer(founderFid, 'accept_alpha_terms_v1', [
      GREATER_REALM_CONNECTED_ENTRY_AGREEMENT_VERSION, true,
    ]);
    const publicOutputs: string[] = [];
    const worker101 = await verifyCurrentReads(callers, founderFid, publicOutputs);
    if (
      worker101.fid !== BigInt(founderFid)
      || worker101.mode !== 'active'
      || worker101.workers.some(worker => worker.status !== 'idle')
    ) fail('Founder 101 current Worker read was invalid.');

    stage = 'real-node-selection';
    const target = await selectPrivateSecondLocation(
      control, server, database, connectedOwnerToken, founderFid,
    );
    const bootstrapText = await callPlayer(founderFid, 'get_realm_atlas_bootstrap_v1');
    const bootstrap = parseJson(bootstrapText, 'Atlas bootstrap');
    if (
      !Array.isArray(bootstrap)
      || bootstrap.length !== 22
      || bootstrap[0] !== target.atlasId
      || readUnsigned(bootstrap[7], 'Atlas bootstrap revision') !== worker101.atlasRevision
      || bootstrap[15] !== 'active'
      || readUnsigned(bootstrap[17], 'Atlas bootstrap caller castle') !== worker101.castleId
      || bootstrap[18] !== target.originCellKey
      || bootstrap[19] !== target.originAtlasQ
      || bootstrap[20] !== target.originAtlasR
      || bootstrap[21] !== target.originElevation
    ) {
      fail('Founder 101 atlas bootstrap was invalid.');
    }
    const originCellKey = optionString(bootstrap[18], 'Atlas origin cell');
    if (
      originCellKey === undefined
      || !/^T1_[A-Z]+:-?(?:0|[1-9][0-9]*):-?(?:0|[1-9][0-9]*)$/.test(originCellKey)
    ) {
      fail('Founder 101 atlas origin cell was invalid.');
    }
    const routeText = await callPlayer(founderFid, 'plan_realm_route_v1', [
      originCellKey, target.cellKey, 0, 1,
      safeWireUnsigned(worker101.atlasRevision, 'Atlas revision'),
    ]);
    const route = parseJson(routeText, 'Atlas route');
    const routeLength = Array.isArray(route)
      ? readUnsigned(route[3], 'Atlas route length')
      : 0n;
    if (
      !Array.isArray(route)
      || route.length !== 6
      || routeLength < 2n
      || routeLength > 8_193n
    ) fail('Selected second resource location route was not bounded.');
    const routeSteps = Number(routeLength - 1n);
    const resourceLocationsText = await callPlayer(
      founderFid,
      'get_realm_atlas_resource_locations_v1',
      [
        safeWireUnsigned(worker101.atlasRevision, 'Atlas revision'),
        target.resourceReadChunkHandles,
      ],
    );
    assertResourceLocationBatch(resourceLocationsText, target, worker101.atlasRevision);
    const chunkText = await callPlayer(founderFid, 'get_realm_atlas_chunk_v1', [
      target.chunkHandle, 0, safeWireUnsigned(worker101.atlasRevision, 'Atlas revision'),
    ]);
    const founderChunk = parseJson(chunkText, 'Founder atlas chunk');
    if (
      !Array.isArray(founderChunk)
      || founderChunk.length !== 8
      || founderChunk[0] !== target.atlasId
      || readUnsigned(founderChunk[1], 'Founder atlas chunk revision')
        !== worker101.atlasRevision
      || founderChunk[2] !== target.chunkHandle
      || founderChunk[3] !== 0
      || !Array.isArray(founderChunk[7])
      || founderChunk[7].length !== 0
    ) fail('LOD0 atlas chunk was not location-authority-free.');
    publicOutputs.push(bootstrapText, routeText, resourceLocationsText, chunkText);

    stage = 'natural-worker-lifecycle';
    const natural = await runNaturalLifecycle({
      control,
      server,
      database,
      ownerToken: connectedOwnerToken,
      callers,
      fid: founderFid,
      target,
      workerId: worker101.workers[0]!.workerId,
      atlasRevision: worker101.atlasRevision,
      routeSteps,
      outputs: publicOutputs,
    });
    const capacityDigests = new Set([natural.capacityDigest]);
    const afterNatural = await verifyCurrentReads(callers, founderFid, publicOutputs);
    for (const resourceKind of ['food', 'wood', 'stone', 'gold'] as const) {
      const expectedDelta = resourceKind === target.resourceKind
        ? GREATER_REALM_CONNECTED_EXPECTED_GATHER_QUANTA
        : 0n;
      if (
        afterNatural.balances[resourceKind]
          !== worker101.balances[resourceKind] + expectedDelta
      ) fail('Natural Worker lifecycle resource quantum was not exact/isolated.');
    }
    assertNoPrivateAuthority(publicOutputs, target, capacityDigests);
    const founder101Elapsed = Date.now() - founder101Started;
    console.log(
      'Connected active population 101 preflight passed: '
      + `activation_ms=${activationElapsed} canary_ms=${activation.canaryElapsed} `
      + `founder_101_ms=${founder101Elapsed} lifecycle_ms=${natural.elapsed} `
      + `verification_calls=${verificationCalls} private_output=false.`,
    );

    if (!preflightOnly) {
      stage = 'bounded-admission-suffix';
      const suffixElapsed = await runAdmissionSuffix(callers);
      stage = 'population-graph';
      const expectedWindow = await assertPopulationGraph(
        control, server, database, connectedOwnerToken, 1n, founderFid, target,
      );
      const activeHealth = parseWorkerHealth(
        await callAdmin('admin_get_worker_system_status_v1'),
      );
      publicOutputs.push(activeHealth.raw);
      if (
        activeHealth.expectedCastleCount !== 600n
        || activeHealth.expectedWorkerCount !== 2_400n
        || activeHealth.actualWorkerCount !== 2_400n
        || activeHealth.invalidTotal !== 0n
      ) fail('Capacity Worker health was invalid.');
      const innerKeepStatus = await callAdmin('admin_get_inner_keep_status_v1');
      publicOutputs.push(innerKeepStatus);
      if (
        await countWhere(
          control, server, database, connectedOwnerToken, 'castle_inner_builder_v1',
        ) !== 600n
      ) fail('Capacity Inner Keep Builder count was invalid.');

      stage = 'population-public-read-availability';
      const availability = await measurePopulationReadAvailability(
        callers, founderFid, target, expectedWindow, worker101.atlasRevision, publicOutputs,
      );
      assertNoPrivateAuthority(publicOutputs, target, capacityDigests);
      console.log(
        'Connected active population public reads at 600: '
        + `bootstrap_ms=${availability.bootstrapMs} window_ms=${availability.windowMs} `
        + `resource_locations_ms=${availability.resourceLocationsMs} `
        + `chunk_ms=${availability.chunkMs} total_ms=${availability.totalMs} `
        + `bootstrap_fields=22 regions=${availability.regionCount} `
        + `window_chunks=${availability.windowChunkCount} `
        + `window_castles=${availability.windowCastleCount} `
        + `chunk_core_cells=${availability.coreCellCount} `
        + `chunk_apron_cells=${availability.apronCellCount} `
        + `chunk_resource_locations=${availability.chunkResourceLocationCount} `
        + `projected_resource_locations=${availability.projectedResourceLocationCount} `
        + 'resource_locations_truncated=false private_output=false.',
      );

      stage = 'founder-601-atomicity';
      await verifyCapacityFailure(
        control, server, database, connectedOwnerToken, callers,
      );
      stage = 'halted-capacity-return';
      const haltedResourceLocationsMs = await runHaltedCapacityAndReturnProof({
        control,
        server,
        database,
        ownerToken: connectedOwnerToken,
        callers,
        fid: founderFid,
        target,
        workers: worker101.workers.map(worker => worker.workerId),
        atlasRevision: worker101.atlasRevision,
        routeSteps,
        activeResourceLocationsText: availability.resourceLocationsText,
        outputs: publicOutputs,
        capacityDigests,
      });
      assertNoPrivateAuthority(publicOutputs, target, capacityDigests);
      receipt = 'Greater Realm connected active-population rehearsal passed: '
        + 'founders=600 workers=2400 regions=6x100 '
        + 'post_canary_founders=500 fresh_dispatches=3 '
        + `admission_suffix_ms=${suffixElapsed} natural_lifecycle_ms=${natural.elapsed} `
        + `read_bootstrap_ms=${availability.bootstrapMs} read_window_ms=${availability.windowMs} `
        + `read_resource_locations_ms=${availability.resourceLocationsMs} `
        + `read_chunk_ms=${availability.chunkMs} read_total_ms=${availability.totalMs} `
        + `halted_resource_locations_ms=${haltedResourceLocationsMs} `
        + `module_sha256=${artifactDigest} elapsed_ms=${Date.now() - startedAt}`;
    } else {
      receipt = 'Greater Realm connected active-population 101 preflight passed: '
        + 'founders=101 workers=404 fresh_dispatches=1 '
        + `module_sha256=${artifactDigest} elapsed_ms=${Date.now() - startedAt}`;
    }

    stage = 'production-source-attestation';
    if (
      (await readFile(productionPolicyPath)).compare(disposable.productionPolicyBytes) !== 0
      || (await readFile(productionIndexPath)).compare(disposable.productionIndexBytes) !== 0
      || await directoryDigest(join(sourceModule, 'src')) !== disposable.productionSourceDigest
    ) fail('Production module source changed during the disposable proof.');
    const productionPolicy = await readFile(productionPolicyPath, 'utf8');
    const productionIndex = await readFile(productionIndexPath, 'utf8');
    if (
      parseGreaterRealmConnectedProductionGateMode(productionPolicy).mode
        !== disposable.productionGateMode
      || occurrenceCount(productionIndex, DISPOSABLE_RELOCATION_REDUCER_MODULE) !== 0
    ) fail('Checked-in Greater Realm mutation mode did not remain exact.');
  } catch (error) {
    if (error instanceof GreaterRealmConnectedActivePopulationError) {
      throw new GreaterRealmConnectedActivePopulationError(
        `${error.message} [stage=${stage}]`,
      );
    }
    throw new GreaterRealmConnectedActivePopulationError(
      `Connected active-population proof failed closed at ${stage}: `
      + safeUnexpectedDiagnostic(error),
    );
  } finally {
    terminateProcess(control.activeCliProcess);
    terminateProcess(serverProcess);
    try {
      if (serverProcess !== undefined && runtimeDirectory !== undefined) {
        await cleanupMigrationProofResources(serverProcess, runtimeDirectory);
      } else if (runtimeDirectory !== undefined) {
        await rm(runtimeDirectory, { recursive: true, force: true });
      }
    } catch {
      cleanupFailed = true;
    } finally {
      clearTimeout(totalDeadline);
      removeSignalCleanup();
    }
    if (cleanupFailed) {
      throw new GreaterRealmConnectedActivePopulationError(
        'Connected active-population cleanup failed safely.',
      );
    }
  }
  if (runtimeDirectory !== undefined && existsSync(runtimeDirectory)) {
    fail('Connected active-population cleanup was incomplete.');
  }
  if (receipt === undefined) fail('Connected active-population proof produced no receipt.');
  console.log(receipt);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof GreaterRealmConnectedActivePopulationError
      ? error.message
      : 'Connected active-population proof failed closed.');
    process.exitCode = 1;
  });
}

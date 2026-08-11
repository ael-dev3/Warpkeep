import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
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
import {
  DISPOSABLE_ACTIVATION_GATE_DECLARATION,
  DISPOSABLE_IMPORT_GATE_DECLARATION,
  DISPOSABLE_RELOCATION_REDUCER_MODULE,
  PRODUCTION_ACTIVATION_GATE_DECLARATION,
  PRODUCTION_IMPORT_GATE_DECLARATION,
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

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceModule = join(repositoryRoot, 'spacetimedb');
const productionPolicyPath = join(sourceModule, 'src', 'greaterRealmV17Policy.ts');
const productionIndexPath = join(sourceModule, 'src', 'index.ts');
const command = process.env.SPACETIME_BIN || 'spacetime';
const requestTimeoutMilliseconds = 30_000;
const lifecycleTimeoutMilliseconds = 35_000;
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
  locationId: string;
  cellKey: string;
  chunkHandle: string;
  chunkBinQ: number;
  chunkBinR: number;
  resourceKind: string;
  nodeCount: number;
  firstNodeOrdinal: number;
  routeDepthBound: number;
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
  if (value === undefined || value === '(none)' || value === 'none') return undefined;
  const tagged = /^\(some = (.+)\)$/.exec(value);
  const wrapped = tagged?.[1] ?? value;
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
    'SELECT cell_key, chunk_handle, component_key, route_depth FROM greater_realm_cell_v1',
    ['cell_key', 'chunk_handle', 'component_key', 'route_depth'],
  );
  const cellByKey = new Map(cells.map(row => [row.cell_key!, row]));
  const origin = cellByKey.get(castle.tile_key!);
  if (origin === undefined) fail('Target founder origin cell was missing.');
  const originComponent = sqlOptionalString(origin.component_key, 'Origin component');
  if (originComponent === undefined || !/^GRC-[A-Z2-7]{26}$/.test(originComponent)) {
    fail('Target founder origin component was invalid.');
  }
  const nodes = await queryRows(
    control, server, database, ownerToken,
    'SELECT node_id, location_id, cell_key, region_id, component_key, resource_kind, '
      + 'node_ordinal, release_ordinal, allocation_rank, active '
      + 'FROM greater_realm_resource_node_v1',
    [
      'node_id', 'location_id', 'cell_key', 'region_id', 'component_key',
      'resource_kind', 'node_ordinal', 'release_ordinal', 'allocation_rank', 'active',
    ],
  );
  const privateNodeIds = new Set(nodes.map(row => row.node_id!));
  const privateComponentKeys = new Set(cells.flatMap(row => {
    const component = sqlOptionalString(row.component_key, 'Cell component');
    return component === undefined ? [] : [component];
  }));
  const groups = new Map<string, typeof nodes>();
  const chunkRows = await queryRows(
    control, server, database, ownerToken,
    'SELECT chunk_handle, bin_q, bin_r FROM greater_realm_chunk_v1',
    ['chunk_handle', 'bin_q', 'bin_r'],
  );
  const chunkByHandle = new Map(chunkRows.map(row => [row.chunk_handle!, row]));
  for (const node of nodes) {
    if (node.component_key !== originComponent) continue;
    const key = `${node.region_id}:${node.resource_kind}:${node.location_id}`;
    groups.set(key, Object.freeze([...(groups.get(key) ?? []), node]));
  }
  const sequences = new Map<string, Array<Readonly<{ rows: typeof nodes; first: number }>>>();
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
  }
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
    if (chunk === undefined) fail('Selected resource chunk was missing.');
    candidates.push(Object.freeze({
      locationId: first.location_id!,
      cellKey: first.cell_key!,
      chunkHandle: cell.chunk_handle!,
      chunkBinQ: safeInteger(chunk.bin_q, 'Target chunk Q'),
      chunkBinR: safeInteger(chunk.bin_r, 'Target chunk R'),
      resourceKind: first.resource_kind!,
      nodeCount: second.rows.length,
      firstNodeOrdinal: second.first,
      routeDepthBound: originDepth + targetDepth,
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

async function pollWorkerJourney(
  callers: ProofCallers,
  fid: number,
  workerId: string,
  requiredStatuses: readonly string[],
): Promise<Readonly<{ outputs: readonly string[]; statuses: ReadonlySet<string> }>> {
  const deadline = Date.now() + lifecycleTimeoutMilliseconds;
  const statuses = new Set<string>();
  const outputs: string[] = [];
  while (Date.now() < deadline) {
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
  fail('Natural Worker lifecycle exceeded its fixed deadline.');
}

async function waitForWorkersGathering(
  callers: ProofCallers,
  fid: number,
  workerIds: readonly string[],
  outputs: string[],
): Promise<void> {
  const deadline = Date.now() + lifecycleTimeoutMilliseconds;
  while (Date.now() < deadline) {
    const text = await callers.callPlayer(fid, 'get_my_worker_control_state_v2');
    outputs.push(text);
    const control = parseWorkerControl(text);
    if (workerIds.every(id => control.workers.find(row => row.workerId === id)?.status === 'gathering')) {
      return;
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 25));
  }
  fail('Concurrent Workers did not reach gathering within the fixed deadline.');
}

async function waitForWorkersIdle(
  callers: ProofCallers,
  fid: number,
  workerIds: readonly string[],
  outputs: string[],
): Promise<void> {
  const deadline = Date.now() + lifecycleTimeoutMilliseconds;
  while (Date.now() < deadline) {
    const text = await callers.callPlayer(fid, 'get_my_worker_control_state_v2');
    outputs.push(text);
    const control = parseWorkerControl(text);
    if (workerIds.every(id => control.workers.find(row => row.workerId === id)?.status === 'idle')) {
      return;
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 25));
  }
  fail('Recalled Workers did not return within the fixed deadline.');
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

async function assertPopulationGraph(
  control: RuntimeControl,
  server: string,
  database: string,
  ownerToken: string,
  expectedDispatchCount: bigint,
): Promise<void> {
  for (const [table, count] of [
    ['allowed_fid', 600n],
    ['castle', 600n],
    ['realm_profile_v1', 600n],
    ['mark_account_v1', 600n],
    ['resource_account_v1', 600n],
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
  const claims = await queryRows(
    control, server, database, ownerToken,
    'SELECT slot_id, owner_fid, castle_id, claim_kind, allocation_sequence '
      + 'FROM greater_realm_castle_claim_v1',
    ['slot_id', 'owner_fid', 'castle_id', 'claim_kind', 'allocation_sequence'],
  );
  const slots = await queryRows(
    control, server, database, ownerToken,
    'SELECT slot_id, region_id FROM greater_realm_castle_slot_v1',
    ['slot_id', 'region_id'],
  );
  const occupancy = await queryRows(
    control, server, database, ownerToken,
    'SELECT cell_key, castle_id FROM greater_realm_cell_occupancy_v1',
    ['cell_key', 'castle_id'],
  );
  const castles = await queryRows(
    control, server, database, ownerToken,
    'SELECT castle_id, owner_fid, tile_key FROM castle',
    ['castle_id', 'owner_fid', 'tile_key'],
  );
  const workers = await queryRows(
    control, server, database, ownerToken,
    'SELECT worker_id, origin_castle_id, ordinal FROM castle_worker_v1',
    ['worker_id', 'origin_castle_id', 'ordinal'],
  );
  const slotRegions = new Map(slots.map(row => [row.slot_id!, row.region_id!]));
  const regionCounts = new Map<string, number>();
  const sequences = new Set<string>();
  const ownerFids = new Set<string>();
  const claimCastles = new Set<string>();
  for (const claim of claims) {
    const region = slotRegions.get(claim.slot_id!);
    if (
      region === undefined
      || ownerFids.has(claim.owner_fid!)
      || claimCastles.has(claim.castle_id!)
      || sequences.has(claim.allocation_sequence!)
    ) fail('Final claim uniqueness was invalid.');
    ownerFids.add(claim.owner_fid!);
    claimCastles.add(claim.castle_id!);
    sequences.add(claim.allocation_sequence!);
    regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
  }
  if (
    regionCounts.size !== 6
    || [...regionCounts.values()].some(count => count !== 100)
    || claims.filter(row => row.claim_kind === 'relocated').length !== 100
    || claims.filter(row => row.claim_kind === 'founded').length !== 500
    || sequences.size !== 600
    || Array.from({ length: 600 }, (_, index) => String(index)).some(value => !sequences.has(value))
  ) fail('Final balanced allocation sequence was invalid.');
  const castleIds = new Set(castles.map(row => row.castle_id!));
  if (
    castleIds.size !== 600
    || new Set(castles.map(row => row.owner_fid!)).size !== 600
    || new Set(castles.map(row => row.tile_key!)).size !== 600
    || new Set(occupancy.map(row => row.cell_key!)).size !== 600
    || new Set(occupancy.map(row => row.castle_id!)).size !== 600
    || occupancy.some(row => !castleIds.has(row.castle_id!))
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
    outputs: string[];
  }>,
): Promise<Readonly<{ capacityDigest: string; elapsed: number }>> {
  const { control, server, database, ownerToken, callers, fid, target, workerId, atlasRevision, outputs } = coordinates;
  const key = 'connected-natural-dispatch-0001';
  const before = await readActivationCounters(control, server, database, ownerToken);
  const started = Date.now();
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
  const journey = await pollWorkerJourney(
    callers, fid, workerId, ['outbound', 'gathering', 'returning'],
  );
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
  return Object.freeze({ capacityDigest: receipt.capacityDigest, elapsed: Date.now() - started });
}

type PopulationReadAvailability = Readonly<{
  bootstrapMs: number;
  windowMs: number;
  chunkMs: number;
  totalMs: number;
  regionCount: number;
  windowChunkCount: number;
  coreCellCount: number;
  apronCellCount: number;
  resourceLocationCount: number;
}>;

async function measurePopulationReadAvailability(
  callers: ProofCallers,
  fid: number,
  target: PrivateResourceTarget,
  atlasRevision: bigint,
  outputs: string[],
): Promise<PopulationReadAvailability> {
  const totalStarted = Date.now();
  const bootstrapStarted = Date.now();
  const bootstrapText = await callers.callPlayer(fid, 'get_realm_atlas_bootstrap_v1');
  const bootstrapMs = Date.now() - bootstrapStarted;
  const bootstrap = parseJson(bootstrapText, 'Capacity atlas bootstrap');
  if (
    !Array.isArray(bootstrap)
    || bootstrap.length !== 19
    || bootstrap[15] !== 'active'
    || !Array.isArray(bootstrap[16])
    || bootstrap[16].length !== 6
    || readUnsigned(bootstrap[7], 'Capacity atlas revision') !== atlasRevision
    || readUnsigned(bootstrap[14], 'Capacity atlas castle count') !== 600n
  ) fail('Capacity atlas bootstrap shape was invalid.');

  const windowStarted = Date.now();
  const windowText = await callers.callPlayer(fid, 'get_realm_atlas_window_v1', [
    target.chunkBinQ, target.chunkBinR, 0,
    safeWireUnsigned(atlasRevision, 'Capacity atlas revision'),
  ]);
  const windowMs = Date.now() - windowStarted;
  const window = parseJson(windowText, 'Capacity atlas window');
  if (
    !Array.isArray(window)
    || window.length !== 6
    || window[2] !== target.chunkBinQ
    || window[3] !== target.chunkBinR
    || window[4] !== 0
    || !Array.isArray(window[5])
    || window[5].length !== 1
    || !Array.isArray(window[5][0])
    || window[5][0].length !== 9
    || window[5][0][0] !== target.chunkHandle
  ) fail('Capacity atlas window shape was invalid.');

  const chunkStarted = Date.now();
  const chunkText = await callers.callPlayer(fid, 'get_realm_atlas_chunk_v1', [
    target.chunkHandle, 0, safeWireUnsigned(atlasRevision, 'Capacity atlas revision'),
  ]);
  const chunkMs = Date.now() - chunkStarted;
  const chunk = parseJson(chunkText, 'Capacity atlas chunk');
  if (
    !Array.isArray(chunk)
    || chunk.length !== 8
    || chunk[2] !== target.chunkHandle
    || chunk[3] !== 0
    || !Array.isArray(chunk[5])
    || !Array.isArray(chunk[6])
    || !Array.isArray(chunk[7])
    || !chunk[7].some(location => (
      Array.isArray(location)
      && location.length === 8
      && location[0] === target.locationId
      && location[6] === target.nodeCount
    ))
  ) fail('Capacity atlas chunk shape was invalid.');
  outputs.push(bootstrapText, windowText, chunkText);
  return Object.freeze({
    bootstrapMs,
    windowMs,
    chunkMs,
    totalMs: Date.now() - totalStarted,
    regionCount: bootstrap[16].length,
    windowChunkCount: window[5].length,
    coreCellCount: chunk[5].length,
    apronCellCount: chunk[6].length,
    resourceLocationCount: chunk[7].length,
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
    outputs: string[];
    capacityDigests: Set<string>;
  }>,
): Promise<void> {
  const { control, server, database, ownerToken, callers, fid, target, workers, atlasRevision, outputs, capacityDigests } = coordinates;
  const dispatchKeys = ['connected-capacity-dispatch-0002', 'connected-capacity-dispatch-0003'];
  await Promise.all(workers.slice(0, 2).map((workerId, index) => callers.callPlayer(
    fid,
    'dispatch_greater_realm_worker_v1',
    [
      workerId, target.resourceKind, target.locationId,
      safeWireUnsigned(atlasRevision, 'Atlas revision'), dispatchKeys[index],
    ],
  )));
  const counters = await readActivationCounters(control, server, database, ownerToken);
  if (counters.dispatch !== 3n) fail('Concurrent capacity dispatch counter was not exact.');
  const receipts = await readDispatchReceipts(control, server, database, ownerToken, fid);
  const selected = dispatchKeys.map(key => receipts.find(row => row.requestKey.endsWith(`:${key}`)));
  if (
    selected.some(row => row === undefined || row.nodeCount !== target.nodeCount)
    || new Set(selected.map(row => row!.leaseId)).size !== 2
    || !selected.some(row => row!.leaseId === `${target.locationId}:1`)
    || !selected.some(row => row!.leaseId === `${target.locationId}:2`)
  ) fail('Concurrent first-free public capacity leases were invalid.');
  selected.forEach(row => capacityDigests.add(row!.capacityDigest));
  await callers.callPlayer(fid, 'dispatch_greater_realm_worker_v1', [
    workers[0], target.resourceKind, target.locationId,
    safeWireUnsigned(atlasRevision, 'Atlas revision'), dispatchKeys[0],
  ]);
  if ((await readActivationCounters(control, server, database, ownerToken)).dispatch !== 3n) {
    fail('Live capacity receipt replay advanced the dispatch counter.');
  }
  await waitForWorkersGathering(callers, fid, workers.slice(0, 2), outputs);
  await callers.callAdmin('rehearsal_halt_greater_realm_activation_v1');
  const halted = await readActivationCounters(control, server, database, ownerToken);
  if (halted.mode !== 'halted' || halted.dispatch !== 3n || halted.founding !== 500n) {
    fail('Halted current counters were invalid.');
  }
  await callers.callPlayer(fid, 'recall_worker_v1', [
    workers[0], 'connected-halted-recall-0001',
  ]);
  await callers.callPlayer(fid, 'recall_all_workers_v1', [
    'connected-halted-recall-all-0001',
  ]);
  const returning = parseWorkerControl(
    await callers.callPlayer(fid, 'get_my_worker_control_state_v2'),
  );
  outputs.push(returning.raw);
  if (workers.slice(0, 2).some(id => (
    returning.workers.find(row => row.workerId === id)?.status !== 'returning'
  ))) fail('Halted recall did not begin explicit return.');

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
  await waitForWorkersIdle(callers, fid, workers.slice(0, 2), outputs);
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

  stage = 'private-runtime-allocation';
  const runtimeDirectory = await mkdtemp(join(
    tmpdir(), 'warpkeep-greater-realm-active-population-',
  ));
  await chmod(runtimeDirectory, 0o700);
  const runtimeMetadata = await lstat(runtimeDirectory);
  if (
    !runtimeMetadata.isDirectory()
    || runtimeMetadata.isSymbolicLink()
    || (runtimeMetadata.mode & 0o777) !== 0o700
  ) fail('Connected active-population runtime root was unsafe.');

  const environment = childEnvironment();
  const control: RuntimeControl = {
    deadline: Date.now() + GREATER_REALM_CONNECTED_ACTIVE_POPULATION_TIMEOUT_MILLISECONDS,
    environment,
    deadlineExpired: false,
  };
  let serverProcess: ChildProcess | undefined;
  let receipt: string | undefined;
  const forceCleanup = () => {
    terminateProcess(control.activeCliProcess);
    terminateProcess(serverProcess);
    try { rmSync(runtimeDirectory, { recursive: true, force: true }); } catch {
      /* The final cleanup assertion remains authoritative. */
    }
  };
  const removeSignalCleanup = installMigrationProofSignalCleanup(forceCleanup);
  const totalDeadline = setTimeout(() => {
    control.deadlineExpired = true;
    terminateProcess(control.activeCliProcess);
    terminateProcess(serverProcess);
  }, GREATER_REALM_CONNECTED_ACTIVE_POPULATION_TIMEOUT_MILLISECONDS);

  try {
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
    const disposable = await createDisposableGreaterRealmRelocationModule(runtimeDirectory);
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
    const publicKeyPath = join(runtimeDirectory, 'jwt-public.pem');
    const privateKeyPath = join(runtimeDirectory, 'jwt-private.pem');
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
      '--data-dir', join(runtimeDirectory, 'database'),
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
    const connectedOwnerToken = createEphemeralJwt(
      generated.privateKey,
      adminServiceClaims(),
    );
    const cliConfigPath = join(runtimeDirectory, 'spacetime-cli.toml');
    await writeFile(
      cliConfigPath,
      `spacetimedb_token = ${JSON.stringify(connectedOwnerToken)}\n`,
      { encoding: 'utf8', mode: 0o600, flag: 'wx' },
    );
    const configMetadata = await stat(cliConfigPath);
    if (!configMetadata.isFile() || (configMetadata.mode & 0o777) !== 0o600) {
      fail('Disposable CLI credential permissions were invalid.');
    }
    control.cliConfigPath = cliConfigPath;

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
    if (!Array.isArray(bootstrap) || bootstrap.length !== 19 || bootstrap[15] !== 'active') {
      fail('Founder 101 atlas bootstrap was invalid.');
    }
    const originCellKey = optionString(bootstrap[18], 'Atlas origin cell');
    if (originCellKey === undefined || !/^T1_[A-Z]+:-?(?:0|[1-9][0-9]*):-?(?:0|[1-9][0-9]*)$/.test(originCellKey)) {
      fail('Founder 101 atlas origin cell was invalid.');
    }
    const routeText = await callPlayer(founderFid, 'plan_realm_route_v1', [
      originCellKey, target.cellKey, 0, 1,
      safeWireUnsigned(worker101.atlasRevision, 'Atlas revision'),
    ]);
    const route = parseJson(routeText, 'Atlas route');
    if (
      !Array.isArray(route)
      || route.length !== 6
      || readUnsigned(route[3], 'Atlas route length') < 2n
      || readUnsigned(route[3], 'Atlas route length') > 8_193n
    ) fail('Selected second resource location route was not bounded.');
    const chunkText = await callPlayer(founderFid, 'get_realm_atlas_chunk_v1', [
      target.chunkHandle, 0, safeWireUnsigned(worker101.atlasRevision, 'Atlas revision'),
    ]);
    if (!chunkText.includes(target.locationId)) {
      fail('LOD0 public location projection omitted the selected location.');
    }
    publicOutputs.push(bootstrapText, routeText, chunkText);

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
      outputs: publicOutputs,
    });
    const capacityDigests = new Set([natural.capacityDigest]);
    const afterNatural = await verifyCurrentReads(callers, founderFid, publicOutputs);
    if (afterNatural.balances[target.resourceKind as keyof typeof afterNatural.balances]
      <= worker101.balances[target.resourceKind as keyof typeof worker101.balances]) {
      fail('Natural Worker lifecycle did not gather a positive resource quantum.');
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
      await assertPopulationGraph(
        control, server, database, connectedOwnerToken, 1n,
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
        callers, founderFid, target, worker101.atlasRevision, publicOutputs,
      );
      assertNoPrivateAuthority(publicOutputs, target, capacityDigests);
      console.log(
        'Connected active population public reads at 600: '
        + `bootstrap_ms=${availability.bootstrapMs} window_ms=${availability.windowMs} `
        + `chunk_ms=${availability.chunkMs} total_ms=${availability.totalMs} `
        + `bootstrap_fields=19 regions=${availability.regionCount} `
        + `window_chunks=${availability.windowChunkCount} `
        + `chunk_core_cells=${availability.coreCellCount} `
        + `chunk_apron_cells=${availability.apronCellCount} `
        + `chunk_resource_locations=${availability.resourceLocationCount} private_output=false.`,
      );

      stage = 'founder-601-atomicity';
      await verifyCapacityFailure(
        control, server, database, connectedOwnerToken, callers,
      );
      stage = 'halted-capacity-return';
      await runHaltedCapacityAndReturnProof({
        control,
        server,
        database,
        ownerToken: connectedOwnerToken,
        callers,
        fid: founderFid,
        target,
        workers: worker101.workers.map(worker => worker.workerId),
        atlasRevision: worker101.atlasRevision,
        outputs: publicOutputs,
        capacityDigests,
      });
      assertNoPrivateAuthority(publicOutputs, target, capacityDigests);
      receipt = 'Greater Realm connected active-population rehearsal passed: '
        + 'founders=600 workers=2400 regions=6x100 '
        + 'post_canary_founders=500 fresh_dispatches=3 '
        + `admission_suffix_ms=${suffixElapsed} natural_lifecycle_ms=${natural.elapsed} `
        + `read_bootstrap_ms=${availability.bootstrapMs} read_window_ms=${availability.windowMs} `
        + `read_chunk_ms=${availability.chunkMs} read_total_ms=${availability.totalMs} `
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
      occurrenceCount(productionPolicy, PRODUCTION_IMPORT_GATE_DECLARATION) !== 1
      || occurrenceCount(productionPolicy, PRODUCTION_ACTIVATION_GATE_DECLARATION) !== 1
      || occurrenceCount(productionPolicy, DISPOSABLE_IMPORT_GATE_DECLARATION) !== 0
      || occurrenceCount(productionPolicy, DISPOSABLE_ACTIVATION_GATE_DECLARATION) !== 0
      || occurrenceCount(productionIndex, DISPOSABLE_RELOCATION_REDUCER_MODULE) !== 0
    ) fail('Checked-in Greater Realm mutations did not remain closed.');
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
    clearTimeout(totalDeadline);
    removeSignalCleanup();
    terminateProcess(control.activeCliProcess);
    if (serverProcess !== undefined) {
      await cleanupMigrationProofResources(serverProcess, runtimeDirectory);
    } else {
      await rm(runtimeDirectory, { recursive: true, force: true });
    }
  }
  if (existsSync(runtimeDirectory)) fail('Connected active-population cleanup was incomplete.');
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

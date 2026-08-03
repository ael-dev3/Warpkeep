import { Buffer } from 'node:buffer';

import {
  INNER_KEEP_ASSET_CATALOG_DIGEST,
  INNER_KEEP_LAYOUT_DIGEST,
  INNER_KEEP_LAYOUT_POLICY_VERSION,
} from '../spacetimedb/src/innerKeepLayoutPolicy';
import {
  INNER_KEEP_POLICY_DIGEST,
  INNER_KEEP_POLICY_VERSION,
  INNER_KEEP_PROTOCOL_CAPABILITY,
} from '../spacetimedb/src/innerKeepPolicy';

export const INNER_KEEP_CANONICAL_TARGET = Object.freeze({
  uri: 'https://maincloud.spacetimedb.com',
  database: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
  bridge: 'https://auth.warpkeep.com',
});

export const INNER_KEEP_PROTECTED_STATE_PROOF_PROTOCOL =
  'inner-keep-protected-state-proof-v1';

export type InnerKeepProtectedStateSurface =
  | 'castleState'
  | 'resources'
  | 'termsAcceptance'
  | 'genericWorkers'
  | 'marks';

export type InnerKeepProtectedStateQuery = Readonly<{
  surface: InnerKeepProtectedStateSurface;
  table: string;
  sql: string;
}>;

/**
 * Exact rows that an Inner Keep catalog, Builder, or lifecycle mutation is not
 * allowed to alter. These are private owner-SQL reads; their bytes stay in
 * memory and only the comparison booleans may enter operator output.
 */
export const INNER_KEEP_PROTECTED_STATE_QUERIES: readonly InnerKeepProtectedStateQuery[] =
  Object.freeze([
    Object.freeze({ surface: 'castleState', table: 'castle', sql: 'SELECT * FROM castle' }),
    Object.freeze({ surface: 'castleState', table: 'castle_slot_claim_v1', sql: 'SELECT * FROM castle_slot_claim_v1' }),
    Object.freeze({ surface: 'resources', table: 'resource_account_v1', sql: 'SELECT * FROM resource_account_v1' }),
    Object.freeze({ surface: 'termsAcceptance', table: 'alpha_terms_acceptance_v1', sql: 'SELECT * FROM alpha_terms_acceptance_v1' }),
    Object.freeze({ surface: 'genericWorkers', table: 'realm_worker_system_v1', sql: 'SELECT * FROM realm_worker_system_v1' }),
    Object.freeze({ surface: 'genericWorkers', table: 'castle_worker_v1', sql: 'SELECT * FROM castle_worker_v1' }),
    Object.freeze({ surface: 'genericWorkers', table: 'worker_assignment_v1', sql: 'SELECT * FROM worker_assignment_v1' }),
    Object.freeze({ surface: 'genericWorkers', table: 'worker_node_occupation_v1', sql: 'SELECT * FROM worker_node_occupation_v1' }),
    Object.freeze({ surface: 'genericWorkers', table: 'worker_assignment_schedule_v_1', sql: 'SELECT * FROM worker_assignment_schedule_v_1' }),
    Object.freeze({ surface: 'genericWorkers', table: 'worker_command_idempotency_v1', sql: 'SELECT * FROM worker_command_idempotency_v1' }),
    Object.freeze({ surface: 'marks', table: 'realm_profile_v1', sql: 'SELECT * FROM realm_profile_v1' }),
    Object.freeze({ surface: 'marks', table: 'mark_account_v1', sql: 'SELECT * FROM mark_account_v1' }),
    Object.freeze({ surface: 'marks', table: 'snap_burn_credit_v1', sql: 'SELECT * FROM snap_burn_credit_v1' }),
    Object.freeze({ surface: 'marks', table: 'daily_mark_grant_v1', sql: 'SELECT * FROM daily_mark_grant_v1' }),
    Object.freeze({ surface: 'marks', table: 'daily_mark_schedule_v_1', sql: 'SELECT * FROM daily_mark_schedule_v_1' }),
  ]);

const MAXIMUM_PROTECTED_TABLE_OUTPUT_BYTES = 1_000_000;
const MAXIMUM_PROTECTED_SNAPSHOT_OUTPUT_BYTES = 8_000_000;

type InnerKeepProtectedStateEntry = Readonly<{
  surface: InnerKeepProtectedStateSurface;
  table: string;
  /** Reversible private bytes. Never pass this snapshot to printable operator output. */
  exactSqlOutputBase64: string;
}>;

export type InnerKeepProtectedStateSnapshot = Readonly<{
  protocol: typeof INNER_KEEP_PROTECTED_STATE_PROOF_PROTOCOL;
  entries: readonly InnerKeepProtectedStateEntry[];
}>;

export type InnerKeepProtectedStateProof = Readonly<{
  protocol: typeof INNER_KEEP_PROTECTED_STATE_PROOF_PROTOCOL;
  comparison: 'exact-private-sql-bytes';
  tablesCompared: number;
  surfaces: Readonly<Record<InnerKeepProtectedStateSurface, true>>;
  privateRowsEmitted: false;
  verified: true;
}>;

const MAX_CASTLES = 100n;
const MAX_BUILDINGS = MAX_CASTLES * 4n;
const MAX_RECEIPTS = MAX_CASTLES * 20n;
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const GIT_COMMIT_HEX = /^[0-9a-f]{40}$/u;
const CLIENT_RELEASE = /^(?:alpha-)?0\.3\.[0-9]+(?:[-+][a-z0-9.-]+)?$/u;

export type InnerKeepOperatorCommand =
  | 'inspect-inner-keep'
  | 'plan-inner-keep-catalog'
  | 'seed-inner-keep-catalog'
  | 'plan-inner-keep-builders'
  | 'backfill-inner-keep-builders'
  | 'activate-inner-keep'
  | 'deactivate-inner-keep';

export type InnerKeepOperatorArguments = Readonly<{
  command: InnerKeepOperatorCommand;
  confirmed: boolean;
  expectedMissingLayout?: number;
  expectedMissingSlots?: number;
  expectedMissingBuildings?: number;
  expectedMissingLevels?: number;
  expectedCastles?: number;
  expectedExistingBuilders?: number;
  expectedMissingBuilders?: number;
  expectedActiveProjects?: number;
  clientRelease?: string;
  clientArtifactDigest?: string;
  moduleArtifactDigest?: string;
  sourceCommit?: string;
}>;

export type InnerKeepStatus = Readonly<{
  layoutRows: bigint;
  slotRows: bigint;
  buildingCatalogRows: bigint;
  levelPolicyRows: bigint;
  castleRows: bigint;
  builderRows: bigint;
  buildingRows: bigint;
  activeProjects: bigint;
  receiptRows: bigint;
  scheduleRows: bigint;
  missingBuilders: bigint;
  orphanBuilders: bigint;
  invalidBuilders: bigint;
  invalidBuildings: bigint;
  invalidSchedules: bigint;
  builderProjectMismatches: bigint;
  staticCatalogExact: boolean;
  workerSystemReady: boolean;
  readyForCatalogSeed: boolean;
  readyForBuilderBackfill: boolean;
  readyForActivation: boolean;
  active: boolean;
  policyVersion: string;
  policyDigest: string;
  layoutPolicyVersion: string;
  layoutDigest: string;
  assetCatalogDigest: string;
}>;

export type InnerKeepCatalogPlan = Readonly<{
  missingLayout: number;
  missingSlots: number;
  missingBuildings: number;
  missingLevels: number;
  ready: boolean;
}>;

export type InnerKeepBuilderPlan = Readonly<{
  expectedCastles: number;
  existingBuilders: number;
  missingBuilders: number;
  ready: boolean;
}>;

export class InnerKeepOperatorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InnerKeepOperatorError';
  }
}

function fail(message: string): never {
  throw new InnerKeepOperatorError(message);
}

const INNER_KEEP_PROTECTED_STATE_SURFACES = Object.freeze([
  'castleState',
  'resources',
  'termsAcceptance',
  'genericWorkers',
  'marks',
] as const satisfies readonly InnerKeepProtectedStateSurface[]);

function assertProtectedStateQueryContract(): void {
  const tables = new Set<string>();
  for (const query of INNER_KEEP_PROTECTED_STATE_QUERIES) {
    if (
      !INNER_KEEP_PROTECTED_STATE_SURFACES.includes(query.surface)
      || !/^[a-z][a-z0-9_]{0,63}$/u.test(query.table)
      || query.sql !== `SELECT * FROM ${query.table}`
      || tables.has(query.table)
    ) fail('Inner Keep protected-state query contract is invalid.');
    tables.add(query.table);
  }
  if (
    tables.size !== INNER_KEEP_PROTECTED_STATE_QUERIES.length
    || INNER_KEEP_PROTECTED_STATE_SURFACES.some((surface) => (
      !INNER_KEEP_PROTECTED_STATE_QUERIES.some((query) => query.surface === surface)
    ))
  ) fail('Inner Keep protected-state query contract is incomplete.');
}

assertProtectedStateQueryContract();

function privateProtectedSqlBytes(value: unknown): Buffer {
  if (typeof value !== 'string' && !ArrayBuffer.isView(value)) {
    fail('Inner Keep protected state could not be read safely.');
  }
  const bytes = typeof value === 'string'
    ? Buffer.from(value, 'utf8')
    : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (
    bytes.byteLength < 1
    || bytes.byteLength > MAXIMUM_PROTECTED_TABLE_OUTPUT_BYTES
    || bytes.includes(0)
  ) fail('Inner Keep protected state could not be read safely.');
  return bytes;
}

/**
 * Capture every protected table with fixed read-only SQL. The returned object
 * contains private row bytes and is deliberately unsuitable for serialization.
 */
export async function captureInnerKeepProtectedState(
  read: (query: InnerKeepProtectedStateQuery) => Promise<string | Uint8Array>,
): Promise<InnerKeepProtectedStateSnapshot> {
  if (typeof read !== 'function') fail('Inner Keep protected-state reader is unavailable.');
  const entries: InnerKeepProtectedStateEntry[] = [];
  let totalBytes = 0;
  for (const query of INNER_KEEP_PROTECTED_STATE_QUERIES) {
    let raw: string | Uint8Array;
    try {
      raw = await read(query);
    } catch {
      fail('Inner Keep protected state could not be read safely.');
    }
    const exactBytes = privateProtectedSqlBytes(raw);
    let exactSqlOutputBase64: string;
    try {
      totalBytes += exactBytes.byteLength;
      if (totalBytes > MAXIMUM_PROTECTED_SNAPSHOT_OUTPUT_BYTES) {
        fail('Inner Keep protected state exceeded its fixed evidence bound.');
      }
      exactSqlOutputBase64 = exactBytes.toString('base64');
    } finally {
      exactBytes.fill(0);
      if (Buffer.isBuffer(raw)) raw.fill(0);
    }
    entries.push(Object.freeze({
      surface: query.surface,
      table: query.table,
      exactSqlOutputBase64,
    }));
  }
  return Object.freeze({
    protocol: INNER_KEEP_PROTECTED_STATE_PROOF_PROTOCOL,
    entries: Object.freeze(entries),
  });
}

function assertProtectedStateSnapshot(snapshot: InnerKeepProtectedStateSnapshot): void {
  if (
    snapshot?.protocol !== INNER_KEEP_PROTECTED_STATE_PROOF_PROTOCOL
    || !Array.isArray(snapshot.entries)
    || snapshot.entries.length !== INNER_KEEP_PROTECTED_STATE_QUERIES.length
  ) fail('Inner Keep protected-state evidence is invalid.');
  for (let index = 0; index < INNER_KEEP_PROTECTED_STATE_QUERIES.length; index += 1) {
    const expected = INNER_KEEP_PROTECTED_STATE_QUERIES[index]!;
    const actual = snapshot.entries[index];
    if (
      actual?.surface !== expected.surface
      || actual.table !== expected.table
      || typeof actual.exactSqlOutputBase64 !== 'string'
    ) fail('Inner Keep protected-state evidence is invalid.');
    let exactBytes: Buffer | undefined;
    try {
      exactBytes = Buffer.from(actual.exactSqlOutputBase64, 'base64');
      if (
        exactBytes.byteLength < 1
        || exactBytes.byteLength > MAXIMUM_PROTECTED_TABLE_OUTPUT_BYTES
        || exactBytes.includes(0)
        || exactBytes.toString('base64') !== actual.exactSqlOutputBase64
      ) fail('Inner Keep protected-state evidence is invalid.');
    } finally {
      exactBytes?.fill(0);
    }
  }
}

/** Compare private pre/post bytes exactly and return only non-sensitive proof. */
export function verifyInnerKeepProtectedStatePreserved(
  before: InnerKeepProtectedStateSnapshot,
  after: InnerKeepProtectedStateSnapshot,
): InnerKeepProtectedStateProof {
  assertProtectedStateSnapshot(before);
  assertProtectedStateSnapshot(after);
  for (let index = 0; index < before.entries.length; index += 1) {
    if (
      before.entries[index]!.exactSqlOutputBase64
      !== after.entries[index]!.exactSqlOutputBase64
    ) {
      fail(
        `Inner Keep protected ${before.entries[index]!.surface} state changed during mutation. `
        + 'Stop and inspect before any retry.',
      );
    }
  }
  return Object.freeze({
    protocol: INNER_KEEP_PROTECTED_STATE_PROOF_PROTOCOL,
    comparison: 'exact-private-sql-bytes',
    tablesCompared: INNER_KEEP_PROTECTED_STATE_QUERIES.length,
    surfaces: Object.freeze({
      castleState: true,
      resources: true,
      termsAcceptance: true,
      genericWorkers: true,
      marks: true,
    }),
    privateRowsEmitted: false,
    verified: true,
  });
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function exactKeys(
  row: Readonly<Record<string, unknown>>,
  expected: ReadonlySet<string>,
  label: string,
): void {
  const keys = Object.keys(row);
  if (keys.length !== expected.size || keys.some((key) => !expected.has(key))) {
    fail(`${label} returned unexpected fields.`);
  }
}

const STATUS_COUNT_FIELDS = Object.freeze([
  'layoutRows',
  'slotRows',
  'buildingCatalogRows',
  'levelPolicyRows',
  'castleRows',
  'builderRows',
  'buildingRows',
  'activeProjects',
  'receiptRows',
  'scheduleRows',
  'missingBuilders',
  'orphanBuilders',
  'invalidBuilders',
  'invalidBuildings',
  'invalidSchedules',
  'builderProjectMismatches',
] as const satisfies readonly (keyof InnerKeepStatus)[]);

const STATUS_BOOLEAN_FIELDS = Object.freeze([
  'staticCatalogExact',
  'workerSystemReady',
  'readyForCatalogSeed',
  'readyForBuilderBackfill',
  'readyForActivation',
  'active',
] as const satisfies readonly (keyof InnerKeepStatus)[]);

const STATUS_STRING_FIELDS = Object.freeze([
  'policyVersion',
  'policyDigest',
  'layoutPolicyVersion',
  'layoutDigest',
  'assetCatalogDigest',
] as const satisfies readonly (keyof InnerKeepStatus)[]);

const STATUS_FIELDS = new Set<string>([
  ...STATUS_COUNT_FIELDS,
  ...STATUS_BOOLEAN_FIELDS,
  ...STATUS_STRING_FIELDS,
]);

export function projectInnerKeepStatus(value: unknown): InnerKeepStatus {
  const row = asRecord(value);
  if (row === undefined) fail('Inner Keep inspection returned an invalid aggregate.');
  exactKeys(row, STATUS_FIELDS, 'Inner Keep inspection');
  if (
    STATUS_COUNT_FIELDS.some((field) => typeof row[field] !== 'bigint' || row[field] < 0n)
    || STATUS_BOOLEAN_FIELDS.some((field) => typeof row[field] !== 'boolean')
    || row.policyVersion !== INNER_KEEP_POLICY_VERSION
    || row.policyDigest !== INNER_KEEP_POLICY_DIGEST
    || row.layoutPolicyVersion !== INNER_KEEP_LAYOUT_POLICY_VERSION
    || row.layoutDigest !== INNER_KEEP_LAYOUT_DIGEST
    || row.assetCatalogDigest !== INNER_KEEP_ASSET_CATALOG_DIGEST
  ) fail('Inner Keep inspection did not match protocol v15.');

  const status = row as unknown as InnerKeepStatus;
  if (
    status.layoutRows > 1n
    || status.slotRows > 12n
    || status.buildingCatalogRows > 4n
    || status.levelPolicyRows > 20n
    || status.castleRows > MAX_CASTLES
    || status.builderRows > MAX_CASTLES
    || status.buildingRows > MAX_BUILDINGS
    || status.activeProjects > status.buildingRows
    || status.receiptRows > MAX_RECEIPTS
    || status.scheduleRows > status.buildingRows
    || status.missingBuilders > status.castleRows
    || status.staticCatalogExact && (
      status.layoutRows !== 1n
      || status.slotRows !== 12n
      || status.buildingCatalogRows !== 4n
      || status.levelPolicyRows !== 20n
    )
    || status.readyForCatalogSeed && (
      status.layoutRows !== 0n
      || status.slotRows !== 0n
      || status.buildingCatalogRows !== 0n
      || status.levelPolicyRows !== 0n
      || status.builderRows !== 0n
      || status.buildingRows !== 0n
      || status.receiptRows !== 0n
      || status.scheduleRows !== 0n
    )
    || status.readyForBuilderBackfill && (
      !status.staticCatalogExact
      || status.active
      || status.buildingRows !== 0n
      || status.receiptRows !== 0n
      || status.scheduleRows !== 0n
    )
    || status.readyForActivation && (
      !status.staticCatalogExact
      || status.active
      || !status.workerSystemReady
      || status.builderRows !== status.castleRows
      || status.missingBuilders !== 0n
      || status.orphanBuilders !== 0n
      || status.invalidBuilders !== 0n
      || status.invalidBuildings !== 0n
      || status.invalidSchedules !== 0n
      || status.builderProjectMismatches !== 0n
    )
    || status.active && (
      !status.staticCatalogExact
      || !status.workerSystemReady
      || status.builderRows !== status.castleRows
      || status.missingBuilders !== 0n
      || status.orphanBuilders !== 0n
      || status.invalidBuilders !== 0n
      || status.invalidBuildings !== 0n
      || status.invalidSchedules !== 0n
      || status.builderProjectMismatches !== 0n
    )
  ) fail('Inner Keep inspection returned an inconsistent aggregate.');

  return Object.freeze({
    layoutRows: status.layoutRows,
    slotRows: status.slotRows,
    buildingCatalogRows: status.buildingCatalogRows,
    levelPolicyRows: status.levelPolicyRows,
    castleRows: status.castleRows,
    builderRows: status.builderRows,
    buildingRows: status.buildingRows,
    activeProjects: status.activeProjects,
    receiptRows: status.receiptRows,
    scheduleRows: status.scheduleRows,
    missingBuilders: status.missingBuilders,
    orphanBuilders: status.orphanBuilders,
    invalidBuilders: status.invalidBuilders,
    invalidBuildings: status.invalidBuildings,
    invalidSchedules: status.invalidSchedules,
    builderProjectMismatches: status.builderProjectMismatches,
    staticCatalogExact: status.staticCatalogExact,
    workerSystemReady: status.workerSystemReady,
    readyForCatalogSeed: status.readyForCatalogSeed,
    readyForBuilderBackfill: status.readyForBuilderBackfill,
    readyForActivation: status.readyForActivation,
    active: status.active,
    policyVersion: status.policyVersion,
    policyDigest: status.policyDigest,
    layoutPolicyVersion: status.layoutPolicyVersion,
    layoutDigest: status.layoutDigest,
    assetCatalogDigest: status.assetCatalogDigest,
  });
}

const CATALOG_PLAN_FIELDS = new Set([
  'missingLayout',
  'missingSlots',
  'missingBuildings',
  'missingLevels',
  'ready',
]);

export function projectInnerKeepCatalogPlan(value: unknown): InnerKeepCatalogPlan {
  const row = asRecord(value);
  if (row === undefined) fail('Inner Keep catalog plan returned an invalid aggregate.');
  exactKeys(row, CATALOG_PLAN_FIELDS, 'Inner Keep catalog plan');
  if (
    !Number.isInteger(row.missingLayout)
    || (row.missingLayout !== 0 && row.missingLayout !== 1)
    || !Number.isInteger(row.missingSlots)
    || Number(row.missingSlots) < 0
    || Number(row.missingSlots) > 12
    || !Number.isInteger(row.missingBuildings)
    || Number(row.missingBuildings) < 0
    || Number(row.missingBuildings) > 4
    || !Number.isInteger(row.missingLevels)
    || Number(row.missingLevels) < 0
    || Number(row.missingLevels) > 20
    || typeof row.ready !== 'boolean'
    || row.ready !== (
      row.missingLayout === 0
      && row.missingSlots === 0
      && row.missingBuildings === 0
      && row.missingLevels === 0
    )
  ) fail('Inner Keep catalog plan returned inconsistent counts.');
  return Object.freeze({
    missingLayout: row.missingLayout as number,
    missingSlots: row.missingSlots as number,
    missingBuildings: row.missingBuildings as number,
    missingLevels: row.missingLevels as number,
    ready: row.ready,
  });
}

const BUILDER_PLAN_FIELDS = new Set([
  'expectedCastles',
  'existingBuilders',
  'missingBuilders',
  'ready',
]);

export function projectInnerKeepBuilderPlan(value: unknown): InnerKeepBuilderPlan {
  const row = asRecord(value);
  if (row === undefined) fail('Inner Keep Builder plan returned an invalid aggregate.');
  exactKeys(row, BUILDER_PLAN_FIELDS, 'Inner Keep Builder plan');
  if (
    !Number.isInteger(row.expectedCastles)
    || Number(row.expectedCastles) < 0
    || Number(row.expectedCastles) > Number(MAX_CASTLES)
    || !Number.isInteger(row.existingBuilders)
    || Number(row.existingBuilders) < 0
    || Number(row.existingBuilders) > Number(MAX_CASTLES)
    || !Number.isInteger(row.missingBuilders)
    || Number(row.missingBuilders) < 0
    || Number(row.missingBuilders) > Number(row.expectedCastles)
    || Number(row.existingBuilders) + Number(row.missingBuilders) !== Number(row.expectedCastles)
    || typeof row.ready !== 'boolean'
    || row.ready !== (row.missingBuilders === 0 && row.existingBuilders === row.expectedCastles)
  ) fail('Inner Keep Builder plan returned inconsistent counts.');
  return Object.freeze({
    expectedCastles: row.expectedCastles as number,
    existingBuilders: row.existingBuilders as number,
    missingBuilders: row.missingBuilders as number,
    ready: row.ready,
  });
}

function readBoundedDecimal(
  value: string | undefined,
  label: string,
  maximum: number,
): number {
  if (value === undefined || !/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    fail(`${label} must be a decimal count from 0 to ${maximum}.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    fail(`${label} must be a decimal count from 0 to ${maximum}.`);
  }
  return parsed;
}

function readExactHex(value: string | undefined, label: string, pattern: RegExp): string {
  if (value === undefined || !pattern.test(value)) fail(`${label} is invalid.`);
  return value;
}

function readClientRelease(value: string | undefined): string {
  if (value === undefined || !CLIENT_RELEASE.test(value)) fail('--client-release is invalid.');
  return value;
}

const MUTATING_COMMANDS = new Set<InnerKeepOperatorCommand>([
  'seed-inner-keep-catalog',
  'backfill-inner-keep-builders',
  'activate-inner-keep',
  'deactivate-inner-keep',
]);

const KNOWN_COMMANDS = new Set<InnerKeepOperatorCommand>([
  'inspect-inner-keep',
  'plan-inner-keep-catalog',
  'seed-inner-keep-catalog',
  'plan-inner-keep-builders',
  'backfill-inner-keep-builders',
  'activate-inner-keep',
  'deactivate-inner-keep',
]);

const VALUE_FLAGS = new Set([
  '--expected-missing-layout',
  '--expected-missing-slots',
  '--expected-missing-buildings',
  '--expected-missing-levels',
  '--expected-castles',
  '--expected-existing-builders',
  '--expected-missing-builders',
  '--expected-active-projects',
  '--client-release',
  '--client-artifact-digest',
  '--module-artifact-digest',
  '--source-commit',
]);

export function parseInnerKeepOperatorArguments(
  argv = process.argv.slice(2),
): InnerKeepOperatorArguments {
  const command = argv[0] as InnerKeepOperatorCommand | undefined;
  if (command === undefined || !KNOWN_COMMANDS.has(command)) {
    fail(
      'Usage: inner-keep-operator.ts '
      + '<inspect-inner-keep|plan-inner-keep-catalog|seed-inner-keep-catalog|'
      + 'plan-inner-keep-builders|backfill-inner-keep-builders|activate-inner-keep|'
      + 'deactivate-inner-keep> [exact expected-state arguments] [--confirm].',
    );
  }

  const values = new Map<string, string>();
  let confirmed = false;
  let explicitDryRun = false;
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === '--confirm' || argument === '--dry-run') {
      if (argument === '--confirm' ? confirmed : explicitDryRun) {
        fail('Inner Keep operator arguments are duplicated.');
      }
      if (argument === '--confirm') confirmed = true;
      else explicitDryRun = true;
      continue;
    }
    if (!VALUE_FLAGS.has(argument) || values.has(argument)) {
      fail('Inner Keep operator arguments are invalid.');
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) {
      fail('Inner Keep operator arguments are invalid.');
    }
    values.set(argument, next);
    index += 1;
  }
  if (confirmed && explicitDryRun) fail('--confirm and --dry-run are mutually exclusive.');
  if (!MUTATING_COMMANDS.has(command) && (confirmed || explicitDryRun || values.size > 0)) {
    fail('Read-only Inner Keep commands do not accept mutation arguments.');
  }

  const result: {
    command: InnerKeepOperatorCommand;
    confirmed: boolean;
    expectedMissingLayout?: number;
    expectedMissingSlots?: number;
    expectedMissingBuildings?: number;
    expectedMissingLevels?: number;
    expectedCastles?: number;
    expectedExistingBuilders?: number;
    expectedMissingBuilders?: number;
    expectedActiveProjects?: number;
    clientRelease?: string;
    clientArtifactDigest?: string;
    moduleArtifactDigest?: string;
    sourceCommit?: string;
  } = { command, confirmed };

  if (command === 'seed-inner-keep-catalog') {
    result.expectedMissingLayout = readBoundedDecimal(
      values.get('--expected-missing-layout'), '--expected-missing-layout', 1,
    );
    result.expectedMissingSlots = readBoundedDecimal(
      values.get('--expected-missing-slots'), '--expected-missing-slots', 12,
    );
    result.expectedMissingBuildings = readBoundedDecimal(
      values.get('--expected-missing-buildings'), '--expected-missing-buildings', 4,
    );
    result.expectedMissingLevels = readBoundedDecimal(
      values.get('--expected-missing-levels'), '--expected-missing-levels', 20,
    );
    if (values.size !== 4) fail('Inner Keep catalog seed arguments are invalid.');
  } else if (command === 'backfill-inner-keep-builders') {
    result.expectedCastles = readBoundedDecimal(
      values.get('--expected-castles'), '--expected-castles', Number(MAX_CASTLES),
    );
    result.expectedExistingBuilders = readBoundedDecimal(
      values.get('--expected-existing-builders'), '--expected-existing-builders', Number(MAX_CASTLES),
    );
    result.expectedMissingBuilders = readBoundedDecimal(
      values.get('--expected-missing-builders'), '--expected-missing-builders', Number(MAX_CASTLES),
    );
    if (
      result.expectedExistingBuilders + result.expectedMissingBuilders !== result.expectedCastles
      || values.size !== 3
    ) fail('Inner Keep Builder backfill arguments are inconsistent.');
  } else if (command === 'activate-inner-keep') {
    result.expectedCastles = readBoundedDecimal(
      values.get('--expected-castles'), '--expected-castles', Number(MAX_CASTLES),
    );
    result.clientRelease = readClientRelease(values.get('--client-release'));
    result.clientArtifactDigest = readExactHex(
      values.get('--client-artifact-digest'), '--client-artifact-digest', SHA256_HEX,
    );
    result.moduleArtifactDigest = readExactHex(
      values.get('--module-artifact-digest'), '--module-artifact-digest', SHA256_HEX,
    );
    result.sourceCommit = readExactHex(
      values.get('--source-commit'), '--source-commit', GIT_COMMIT_HEX,
    );
    if (values.size !== 5) fail('Inner Keep activation arguments are invalid.');
  } else if (command === 'deactivate-inner-keep') {
    result.expectedCastles = readBoundedDecimal(
      values.get('--expected-castles'), '--expected-castles', Number(MAX_CASTLES),
    );
    result.expectedActiveProjects = readBoundedDecimal(
      values.get('--expected-active-projects'), '--expected-active-projects', Number(MAX_BUILDINGS),
    );
    if (values.size !== 2) fail('Inner Keep deactivation arguments are invalid.');
  }

  return Object.freeze(result);
}

export function assertCanonicalInnerKeepTarget(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): typeof INNER_KEEP_CANONICAL_TARGET {
  const uri = environment.WARPKEEP_SPACETIMEDB_URI ?? INNER_KEEP_CANONICAL_TARGET.uri;
  const database = environment.WARPKEEP_SPACETIMEDB_DATABASE
    ?? INNER_KEEP_CANONICAL_TARGET.database;
  const bridge = environment.WARPKEEP_AUTH_BRIDGE_URL ?? INNER_KEEP_CANONICAL_TARGET.bridge;
  if (
    uri !== INNER_KEEP_CANONICAL_TARGET.uri
    || database !== INNER_KEEP_CANONICAL_TARGET.database
    || bridge !== INNER_KEEP_CANONICAL_TARGET.bridge
  ) fail('Inner Keep operations require the immutable Warpkeep production target.');
  return INNER_KEEP_CANONICAL_TARGET;
}

export function innerKeepStaticAttestation() {
  return Object.freeze({
    capability: INNER_KEEP_PROTOCOL_CAPABILITY,
    policyVersion: INNER_KEEP_POLICY_VERSION,
    policyDigest: INNER_KEEP_POLICY_DIGEST,
    layoutPolicyVersion: INNER_KEEP_LAYOUT_POLICY_VERSION,
    layoutDigest: INNER_KEEP_LAYOUT_DIGEST,
    assetCatalogDigest: INNER_KEEP_ASSET_CATALOG_DIGEST,
  });
}

export function innerKeepDeactivationReducerArguments(
  args: InnerKeepOperatorArguments,
): Readonly<{
  capability: string;
  expectedCastleCount: number;
  expectedActiveProjects: number;
}> {
  if (
    args.command !== 'deactivate-inner-keep'
    || !Number.isSafeInteger(args.expectedCastles)
    || args.expectedCastles! < 0
    || args.expectedCastles! > Number(MAX_CASTLES)
    || !Number.isSafeInteger(args.expectedActiveProjects)
    || args.expectedActiveProjects! < 0
    || args.expectedActiveProjects! > Number(MAX_BUILDINGS)
  ) fail('Inner Keep deactivation reducer arguments are invalid.');
  return Object.freeze({
    capability: INNER_KEEP_PROTOCOL_CAPABILITY,
    expectedCastleCount: args.expectedCastles!,
    expectedActiveProjects: args.expectedActiveProjects!,
  });
}

export function printableInnerKeepRecord<T extends Readonly<Record<string, unknown>>>(
  value: T,
): Readonly<Record<string, unknown>> {
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    typeof entry === 'bigint' ? entry.toString() : entry,
  ])));
}

export function createInnerKeepDryRunRecord(args: InnerKeepOperatorArguments) {
  if (!MUTATING_COMMANDS.has(args.command)) {
    fail('Only mutating Inner Keep commands have dry-run records.');
  }
  const { confirmed: _confirmed, command: _command, ...expected } = args;
  return Object.freeze({
    command: args.command,
    mode: 'dry-run',
    targetDatabase: INNER_KEEP_CANONICAL_TARGET.database,
    ...innerKeepStaticAttestation(),
    ...expected,
    dataDeletion: false,
    secretsInOutput: false,
    publicIdentifiersInOutput: false,
    blindRetryAllowed: false,
  });
}

export function assertCatalogPlanMatchesArguments(
  plan: InnerKeepCatalogPlan,
  args: InnerKeepOperatorArguments,
): void {
  if (
    args.command !== 'seed-inner-keep-catalog'
    || plan.missingLayout !== args.expectedMissingLayout
    || plan.missingSlots !== args.expectedMissingSlots
    || plan.missingBuildings !== args.expectedMissingBuildings
    || plan.missingLevels !== args.expectedMissingLevels
  ) fail('Inner Keep catalog counts changed before mutation.');
}

export function assertBuilderPlanMatchesArguments(
  plan: InnerKeepBuilderPlan,
  args: InnerKeepOperatorArguments,
): void {
  if (
    args.command !== 'backfill-inner-keep-builders'
    || plan.expectedCastles !== args.expectedCastles
    || plan.existingBuilders !== args.expectedExistingBuilders
    || plan.missingBuilders !== args.expectedMissingBuilders
  ) fail('Inner Keep Builder counts changed before mutation.');
}

export function assertStatusMatchesMutationArguments(
  status: InnerKeepStatus,
  args: InnerKeepOperatorArguments,
): void {
  if (
    (args.command === 'activate-inner-keep' || args.command === 'deactivate-inner-keep')
    && status.castleRows !== BigInt(args.expectedCastles!)
  ) fail('Inner Keep castle count changed before mutation.');
  if (
    args.command === 'deactivate-inner-keep'
    && status.activeProjects !== BigInt(args.expectedActiveProjects!)
  ) fail('Inner Keep active-project count changed before deactivation.');
}

export function verifyInnerKeepMutationPostcondition(
  command: Extract<InnerKeepOperatorCommand,
    | 'seed-inner-keep-catalog'
    | 'backfill-inner-keep-builders'
    | 'activate-inner-keep'
    | 'deactivate-inner-keep'>,
  before: InnerKeepStatus,
  after: InnerKeepStatus,
): void {
  if (command === 'seed-inner-keep-catalog') {
    if (
      !after.staticCatalogExact
      || !after.readyForBuilderBackfill
      || after.active
      || after.castleRows !== before.castleRows
      || after.builderRows !== before.builderRows
      || after.buildingRows !== before.buildingRows
      || after.receiptRows !== before.receiptRows
      || after.scheduleRows !== before.scheduleRows
    ) fail('Inner Keep catalog seed postcondition failed. Inspect state before retrying.');
  } else if (command === 'backfill-inner-keep-builders') {
    if (
      after.builderRows !== after.castleRows
      || after.missingBuilders !== 0n
      || after.orphanBuilders !== 0n
      || after.invalidBuilders !== 0n
      || after.active
      || after.buildingRows !== before.buildingRows
      || after.receiptRows !== before.receiptRows
      || after.scheduleRows !== before.scheduleRows
    ) fail('Inner Keep Builder backfill postcondition failed. Inspect state before retrying.');
  } else if (command === 'activate-inner-keep') {
    if (
      !before.readyForActivation
      || !after.active
      || after.castleRows !== before.castleRows
      || after.builderRows !== before.builderRows
      || after.buildingRows !== before.buildingRows
      || after.receiptRows !== before.receiptRows
      || after.scheduleRows !== before.scheduleRows
    ) fail('Inner Keep activation postcondition failed. Inspect state before retrying.');
  } else if (
    !before.active
    || after.active
    || after.castleRows !== before.castleRows
    || after.builderRows !== before.builderRows
    || after.buildingRows !== before.buildingRows
    || after.receiptRows !== before.receiptRows
    || after.scheduleRows !== before.scheduleRows
  ) fail('Inner Keep deactivation postcondition failed. Inspect state before retrying.');
}

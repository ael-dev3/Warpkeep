import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setGlobalLogLevel } from 'spacetimedb';

import { DbConnection } from '../src/spacetime/module_bindings';
import { ADMITTED_DAILY_MARK_POLICY_VERSION } from '../spacetimedb/src/marksAuthorityPolicy';
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
const MAX_FOUNDERS = 100n;

type DailyMarksCommand = 'inspect' | 'backfill' | 'activate';

export type DailyMarksStatus = Readonly<{
  policyVersion: string;
  utcDay: bigint;
  allowedFids: bigint;
  enabledAllowedFids: bigint;
  markAccounts: bigint;
  dailyAccounts: bigint;
  legacyZeroAccounts: bigint;
  invalidAccounts: bigint;
  realmProfiles: bigint;
  profileProjectionViolations: bigint;
  missingFounderState: bigint;
  grants: bigint;
  currentDayGrants: bigint;
  grantInvariantViolations: bigint;
  grantAccountReconciliationViolations: bigint;
  scheduleRows: bigint;
  scheduleConfigValid: boolean;
  legacyCompatibilityRows: bigint;
  readyForBackfill: boolean;
  readyForActivation: boolean;
  active: boolean;
}>;

const COUNT_FIELDS = Object.freeze([
  'utcDay',
  'allowedFids',
  'enabledAllowedFids',
  'markAccounts',
  'dailyAccounts',
  'legacyZeroAccounts',
  'invalidAccounts',
  'realmProfiles',
  'profileProjectionViolations',
  'missingFounderState',
  'grants',
  'currentDayGrants',
  'grantInvariantViolations',
  'grantAccountReconciliationViolations',
  'scheduleRows',
  'legacyCompatibilityRows',
] as const satisfies readonly (keyof DailyMarksStatus)[]);

const BOOLEAN_FIELDS = Object.freeze([
  'scheduleConfigValid',
  'readyForBackfill',
  'readyForActivation',
  'active',
] as const satisfies readonly (keyof DailyMarksStatus)[]);

const STATUS_FIELDS = new Set<string>([
  'policyVersion',
  ...COUNT_FIELDS,
  ...BOOLEAN_FIELDS,
]);

class DailyMarksOperatorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DailyMarksOperatorError';
  }
}

function fail(message: string): never {
  throw new DailyMarksOperatorError(message);
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

export function projectDailyMarksStatus(value: unknown): DailyMarksStatus {
  const row = asRecord(value);
  if (
    row === undefined
    || row.policyVersion !== ADMITTED_DAILY_MARK_POLICY_VERSION
    || Object.keys(row).length !== STATUS_FIELDS.size
    || Object.keys(row).some(field => !STATUS_FIELDS.has(field))
    || COUNT_FIELDS.some(field => typeof row[field] !== 'bigint' || row[field] < 0n)
    || BOOLEAN_FIELDS.some(field => typeof row[field] !== 'boolean')
  ) fail('Daily Marks inspection returned an invalid aggregate.');
  const status = row as unknown as DailyMarksStatus;
  const exactFounderGraph = status.allowedFids === status.markAccounts
    && status.allowedFids === status.realmProfiles
    && status.missingFounderState === 0n;
  const commonReady = exactFounderGraph
    && status.invalidAccounts === 0n
    && status.profileProjectionViolations === 0n
    && status.grantInvariantViolations === 0n
    && status.grantAccountReconciliationViolations === 0n
    && status.legacyCompatibilityRows === 0n;
  if (
    status.allowedFids > MAX_FOUNDERS
    || status.enabledAllowedFids > status.allowedFids
    || status.dailyAccounts + status.legacyZeroAccounts > status.markAccounts
    || status.currentDayGrants > status.grants
    || status.scheduleRows > 1n && status.scheduleConfigValid
    || status.readyForBackfill && (
      !commonReady
      || status.grants !== 0n
      || status.scheduleRows !== 0n
    )
    || status.readyForActivation && (
      !commonReady
      || status.legacyZeroAccounts !== 0n
      || status.dailyAccounts !== status.markAccounts
      || status.grants !== 0n
      || status.scheduleRows !== 0n
    )
    || status.active && (
      !commonReady
      || !status.scheduleConfigValid
      || status.scheduleRows !== 1n
      || status.legacyZeroAccounts !== 0n
      || status.dailyAccounts !== status.markAccounts
    )
  ) fail('Daily Marks inspection returned an inconsistent aggregate.');
  // Re-project the exact reviewed aggregate rather than forwarding arbitrary
  // procedure keys into logs if a future wire shape changes unexpectedly.
  return Object.freeze({
    policyVersion: status.policyVersion,
    utcDay: status.utcDay,
    allowedFids: status.allowedFids,
    enabledAllowedFids: status.enabledAllowedFids,
    markAccounts: status.markAccounts,
    dailyAccounts: status.dailyAccounts,
    legacyZeroAccounts: status.legacyZeroAccounts,
    invalidAccounts: status.invalidAccounts,
    realmProfiles: status.realmProfiles,
    profileProjectionViolations: status.profileProjectionViolations,
    missingFounderState: status.missingFounderState,
    grants: status.grants,
    currentDayGrants: status.currentDayGrants,
    grantInvariantViolations: status.grantInvariantViolations,
    grantAccountReconciliationViolations: status.grantAccountReconciliationViolations,
    scheduleRows: status.scheduleRows,
    scheduleConfigValid: status.scheduleConfigValid,
    legacyCompatibilityRows: status.legacyCompatibilityRows,
    readyForBackfill: status.readyForBackfill,
    readyForActivation: status.readyForActivation,
    active: status.active,
  });
}

function readBoundedCount(value: string | undefined, label: string): bigint {
  if (value === undefined || !/^(?:0|[1-9][0-9]{0,2})$/.test(value)) {
    fail(`${label} must be a decimal count from 0 to 100.`);
  }
  const count = BigInt(value);
  if (count > MAX_FOUNDERS) fail(`${label} must be a decimal count from 0 to 100.`);
  return count;
}

function readUtcDay(value: string | undefined): bigint {
  if (value === undefined || !/^(?:0|[1-9][0-9]{0,7})$/.test(value)) {
    fail('--expected-utc-day must be a non-negative decimal UTC day.');
  }
  return BigInt(value);
}

export function parseDailyMarksArguments(argv = process.argv.slice(2)) {
  const command = argv[0] as DailyMarksCommand | undefined;
  if (command !== 'inspect' && command !== 'backfill' && command !== 'activate') {
    fail(
      'Usage: daily-marks-operator.ts <inspect|backfill|activate> '
      + '[--expected-founders N] [--expected-enabled N] [--expected-utc-day N] '
      + '[--dry-run] [--confirm]',
    );
  }
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === '--dry-run' || argument === '--confirm') {
      if (flags.has(argument)) fail('Daily Marks operator arguments are duplicated.');
      flags.add(argument);
      continue;
    }
    if (
      argument !== '--expected-founders'
      && argument !== '--expected-enabled'
      && argument !== '--expected-utc-day'
    ) fail('Daily Marks operator arguments are invalid.');
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--') || values.has(argument)) {
      fail('Daily Marks operator arguments are invalid.');
    }
    values.set(argument, next);
    index += 1;
  }
  if (command === 'inspect' && values.size !== 0) {
    fail('Daily Marks inspection does not accept expected-state arguments.');
  }
  const expectedFounders = command === 'inspect'
    ? undefined
    : readBoundedCount(values.get('--expected-founders'), '--expected-founders');
  const expectedEnabled = command === 'activate'
    ? readBoundedCount(values.get('--expected-enabled'), '--expected-enabled')
    : undefined;
  const expectedUtcDay = command === 'activate'
    ? readUtcDay(values.get('--expected-utc-day'))
    : undefined;
  const allowedKeys = command === 'activate'
    ? 3
    : command === 'backfill' ? 1 : 0;
  if (values.size !== allowedKeys) fail('Daily Marks operator arguments are invalid.');
  if (
    expectedFounders !== undefined
    && expectedEnabled !== undefined
    && expectedEnabled > expectedFounders
  ) fail('--expected-enabled cannot exceed --expected-founders.');
  return Object.freeze({
    command,
    expectedFounders,
    expectedEnabled,
    expectedUtcDay,
    dryRun: flags.has('--dry-run'),
    confirmed: flags.has('--confirm'),
  });
}

function canonicalTarget() {
  const uri = process.env.WARPKEEP_SPACETIMEDB_URI ?? CANONICAL_URI;
  const database = process.env.WARPKEEP_SPACETIMEDB_DATABASE ?? CANONICAL_DATABASE;
  const bridge = process.env.WARPKEEP_AUTH_BRIDGE_URL ?? CANONICAL_BRIDGE;
  if (uri !== CANONICAL_URI || database !== CANONICAL_DATABASE || bridge !== CANONICAL_BRIDGE) {
    fail('Daily Marks operations require the immutable Warpkeep production target.');
  }
  return Object.freeze({ uri, database, bridge });
}

async function inspect(connection: DbConnection): Promise<DailyMarksStatus> {
  return projectDailyMarksStatus(await withOperationTimeout(
    connection.procedures.adminGetDailyMarksStatusV1({}),
  ));
}

function printable(status: DailyMarksStatus) {
  return Object.fromEntries(Object.entries(status).map(([key, value]) => [
    key,
    typeof value === 'bigint' ? value.toString() : value,
  ]));
}

async function main() {
  // This operator's stdout is a closed JSON contract consumed by the guarded
  // publisher. Keep SDK connection notices from contaminating that channel;
  // operator failures still use the privacy-safe stderr boundary below.
  setGlobalLogLevel('error');
  const args = parseDailyMarksArguments();
  const target = canonicalTarget();
  if (args.command !== 'inspect' && !args.dryRun && !args.confirmed) {
    fail(`Refusing Daily Marks ${args.command} without --confirm.`);
  }
  if (args.dryRun) {
    console.log(JSON.stringify({
      ...args,
      expectedFounders: args.expectedFounders?.toString(),
      expectedEnabled: args.expectedEnabled?.toString(),
      expectedUtcDay: args.expectedUtcDay?.toString(),
      target: target.database,
      policyVersion: ADMITTED_DAILY_MARK_POLICY_VERSION,
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
    if (args.command !== 'inspect') {
      if (before.allowedFids !== args.expectedFounders) {
        fail('Daily Marks founder count changed before mutation.');
      }
      if (args.command === 'backfill') {
        if (!before.readyForBackfill) fail('Daily Marks backfill precondition is not ready.');
        await withOperationTimeout(connection.reducers.adminBackfillDailyMarkAccountsV1({
          expectedFounderCount: args.expectedFounders!,
        }));
      } else {
        if (before.enabledAllowedFids !== args.expectedEnabled) {
          fail('Daily Marks enabled-founder count changed before activation.');
        }
        if (before.utcDay !== args.expectedUtcDay) {
          fail('Daily Marks UTC day changed before activation.');
        }
        if (!before.readyForActivation && !before.active) {
          fail('Daily Marks activation precondition is not ready.');
        }
        await withOperationTimeout(connection.reducers.adminActivateDailyMarksV1({
          expectedFounderCount: args.expectedFounders!,
          expectedEnabledCount: args.expectedEnabled!,
          expectedUtcDay: args.expectedUtcDay!,
        }));
      }
    }
    const after = args.command === 'inspect' ? before : await inspect(connection);
    if (
      args.command === 'backfill' && !after.readyForActivation
      || args.command === 'activate' && (
        !after.active
        || after.scheduleRows !== 1n
        || after.currentDayGrants !== after.enabledAllowedFids
      )
    ) fail('Daily Marks mutation postcondition failed; inspect state before retrying.');
    console.log(JSON.stringify(printable(after)));
  } finally {
    try { connection?.disconnect(); } catch { /* Preserve the bounded operator boundary. */ }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof DailyMarksOperatorError
      ? error.message
      : privacySafeHermesErrorMessage(error));
    process.exitCode = 1;
  });
}

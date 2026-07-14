#!/usr/bin/env node

import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  MarksOperatorError,
  reconcilePrivacySafeAggregates,
  runDryScan,
  type CurrentWhitelistedWalletAttribution,
  type ReconciliationAggregate,
} from './operator-core';
import {
  inspectPrivateOperatorReports,
  withExclusiveOperatorLock,
  writePrivateOperatorReport,
  type JsonValue,
} from './operator-report';
import {
  BoundedEthereumRpcProvider,
  MarksTransportError,
  assertIndependentProviderEndpoints,
  fetchBoundedJson,
  type PrivateEndpoint,
} from './operator-transport';
import { SNAP_MARK_POLICY_ID, SnapBurnPolicyError } from './snap-burn-policy';

const MAX_PRIVATE_INPUT_BYTES = 2 * 1024 * 1024;
const DEFAULT_REPORT_DIRECTORY = join(homedir(), 'Library', 'Application Support', 'Warpkeep', 'marks', 'reports');
const COMMANDS = new Set(['plan', 'scan', 'apply', 'reconcile', 'inspect']);

type CommandName = 'plan' | 'scan' | 'apply' | 'reconcile' | 'inspect';
type ParsedArguments = Readonly<{
  command: CommandName;
  reportDirectory: string;
  inputStdin: boolean;
  dryRun: boolean;
  confirm: boolean;
}>;
type UnknownRecord = Record<string, unknown>;

function record(value: unknown, code = 'MARKS_PRIVATE_INPUT_INVALID'): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new MarksOperatorError(code);
  }
  return value as UnknownRecord;
}

function positiveInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new MarksOperatorError(code);
  return value as number;
}

function onlyKeys(value: UnknownRecord, allowed: readonly string[], code: string): void {
  const allowedKeys = new Set(allowed);
  if (Object.keys(value).some(key => !allowedKeys.has(key))) throw new MarksOperatorError(code);
}

function decimalBigInt(value: unknown, code: string): bigint {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new MarksOperatorError(code);
  }
  return BigInt(value);
}

function privateEndpoint(value: unknown): PrivateEndpoint {
  const endpoint = record(value);
  if (
    typeof endpoint.url !== 'string'
    || (endpoint.authorization !== undefined && typeof endpoint.authorization !== 'string')
    || Object.keys(endpoint).some(key => key !== 'url' && key !== 'authorization')
  ) {
    throw new MarksOperatorError('MARKS_PRIVATE_ENDPOINT_INVALID');
  }
  return Object.freeze({
    url: endpoint.url,
    ...(endpoint.authorization ? { authorization: endpoint.authorization } : {}),
  });
}

export function parseOperatorArguments(argv: readonly string[]): ParsedArguments {
  const [requestedCommand, ...rest] = argv;
  if (!requestedCommand || !COMMANDS.has(requestedCommand)) {
    throw new MarksOperatorError('MARKS_COMMAND_INVALID');
  }
  if (argv.some(value => /(?:https?:\/\/|--?(?:rpc|endpoint|secret|token|credential|authorization)(?:=|$))/i.test(value))) {
    throw new MarksOperatorError('MARKS_PRIVATE_INPUT_IN_ARGV');
  }
  let reportDirectory = DEFAULT_REPORT_DIRECTORY;
  let inputStdin = false;
  let dryRun = false;
  let confirm = false;
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === '--input-stdin') inputStdin = true;
    else if (argument === '--dry-run') dryRun = true;
    else if (argument === '--confirm') confirm = true;
    else if (argument === '--report-dir') {
      const path = rest[index + 1];
      if (!path || path.startsWith('-') || path.includes('\0')) {
        throw new MarksOperatorError('MARKS_REPORT_DIRECTORY_INVALID');
      }
      reportDirectory = path;
      index += 1;
    } else {
      throw new MarksOperatorError('MARKS_ARGUMENT_INVALID');
    }
  }
  return Object.freeze({
    command: requestedCommand as CommandName,
    reportDirectory,
    inputStdin,
    dryRun,
    confirm,
  });
}

async function readPrivateInput(): Promise<UnknownRecord> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_PRIVATE_INPUT_BYTES) throw new MarksOperatorError('MARKS_PRIVATE_INPUT_TOO_LARGE');
    chunks.push(buffer);
  }
  if (bytes === 0) throw new MarksOperatorError('MARKS_PRIVATE_INPUT_REQUIRED');
  const combined = Buffer.concat(chunks);
  try {
    return record(JSON.parse(combined.toString('utf8')));
  } catch (error) {
    if (error instanceof MarksOperatorError) throw error;
    throw new MarksOperatorError('MARKS_PRIVATE_INPUT_INVALID');
  } finally {
    combined.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
}

function assertCommandFlags(arguments_: ParsedArguments): void {
  const { command, inputStdin, dryRun, confirm } = arguments_;
  if (command === 'scan') {
    if (!inputStdin) throw new MarksOperatorError('MARKS_PRIVATE_INPUT_REQUIRED');
    if (!dryRun) throw new MarksOperatorError('MARKS_SCAN_DRY_RUN_REQUIRED');
    if (confirm) throw new MarksOperatorError('MARKS_ARGUMENT_INVALID');
    return;
  }
  if (command === 'reconcile') {
    if (!inputStdin) throw new MarksOperatorError('MARKS_PRIVATE_INPUT_REQUIRED');
    if (dryRun || confirm) throw new MarksOperatorError('MARKS_ARGUMENT_INVALID');
    return;
  }
  if (command === 'apply') {
    if (!confirm) throw new MarksOperatorError('MARKS_APPLY_CONFIRMATION_REQUIRED');
    if (dryRun) throw new MarksOperatorError('MARKS_ARGUMENT_INVALID');
    return;
  }
  if (inputStdin || dryRun || confirm) throw new MarksOperatorError('MARKS_ARGUMENT_INVALID');
}

function parseTrustedWallets(value: unknown): readonly CurrentWhitelistedWalletAttribution[] {
  if (!Array.isArray(value) || value.length > 10_000) {
    throw new MarksOperatorError('MARKS_ATTRIBUTION_INPUT_INVALID');
  }
  return Object.freeze(value.map(entry => {
    const wallet = record(entry, 'MARKS_ATTRIBUTION_INPUT_INVALID');
    onlyKeys(wallet, ['fid', 'address', 'active', 'whitelisted'], 'MARKS_ATTRIBUTION_INPUT_INVALID');
    if (
      typeof wallet.address !== 'string'
      || wallet.active !== true
      || wallet.whitelisted !== true
    ) {
      throw new MarksOperatorError('MARKS_ATTRIBUTION_INPUT_INVALID');
    }
    return Object.freeze({
      fid: decimalBigInt(wallet.fid, 'MARKS_ATTRIBUTION_INPUT_INVALID'),
      address: wallet.address,
      active: wallet.active,
      whitelisted: true,
    });
  }));
}

function parseAggregate(value: unknown): ReconciliationAggregate {
  const aggregate = record(value, 'MARKS_RECONCILIATION_INPUT_INVALID');
  onlyKeys(
    aggregate,
    ['policyId', 'creditedEvents', 'creditedAccounts', 'creditedMicros'],
    'MARKS_RECONCILIATION_INPUT_INVALID',
  );
  if (
    typeof aggregate.policyId !== 'string'
    || typeof aggregate.creditedMicros !== 'string'
  ) {
    throw new MarksOperatorError('MARKS_RECONCILIATION_INPUT_INVALID');
  }
  return Object.freeze({
    policyId: aggregate.policyId,
    creditedEvents: positiveIntegerOrZero(aggregate.creditedEvents),
    creditedAccounts: positiveIntegerOrZero(aggregate.creditedAccounts),
    creditedMicros: aggregate.creditedMicros,
  });
}

function positiveIntegerOrZero(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new MarksOperatorError('MARKS_RECONCILIATION_INPUT_INVALID');
  }
  return value as number;
}

function writeReport(
  arguments_: ParsedArguments,
  command: 'plan' | 'scan' | 'reconcile',
  report: unknown,
): void {
  writePrivateOperatorReport({
    reportDirectory: arguments_.reportDirectory,
    command,
    report: report as JsonValue,
  });
}

async function runPlan(arguments_: ParsedArguments) {
  const report = Object.freeze({
    schemaVersion: 1,
    command: 'plan',
    productVersion: '0.3.3',
    policyId: SNAP_MARK_POLICY_ID,
    networkDefault: false,
    productionMutationAvailable: false,
    applyGate: 'reviewed-application-transport-and-explicit-production-approval-required',
    requiredProviderCount: 2,
    maximumBlocksPerRange: 2_000,
    reportsPrivate: true,
  });
  writeReport(arguments_, 'plan', report);
  return Object.freeze({ reportWritten: true, applyAvailable: false, networkUsed: false });
}

async function runScan(arguments_: ParsedArguments, input: UnknownRecord) {
  onlyKeys(
    input,
    ['rpcProviders', 'trustedWallets', 'cursor', 'maximumRanges', 'reportAliasKey'],
    'MARKS_PRIVATE_INPUT_INVALID',
  );
  if (input.reportAliasKey !== undefined && typeof input.reportAliasKey !== 'string') {
    throw new MarksOperatorError('MARKS_ALIAS_KEY_INVALID');
  }
  if (!Array.isArray(input.rpcProviders)) throw new MarksOperatorError('MARKS_TWO_PROVIDERS_REQUIRED');
  const endpoints = input.rpcProviders.map(privateEndpoint);
  assertIndependentProviderEndpoints(endpoints);
  const cursorValue = input.cursor === undefined ? undefined : record(input.cursor, 'MARKS_CURSOR_INVALID');
  if (cursorValue) {
    onlyKeys(cursorValue, ['lastFinalizedBlock', 'lastFinalizedBlockHash'], 'MARKS_CURSOR_INVALID');
  }
  const report = await runDryScan({
    providers: [
      new BoundedEthereumRpcProvider(endpoints[0]),
      new BoundedEthereumRpcProvider(endpoints[1]),
    ],
    trustedWallets: parseTrustedWallets(input.trustedWallets),
    ...(cursorValue ? {
      cursor: {
        lastFinalizedBlock: decimalBigInt(cursorValue.lastFinalizedBlock, 'MARKS_CURSOR_INVALID'),
        lastFinalizedBlockHash: typeof cursorValue.lastFinalizedBlockHash === 'string'
          ? cursorValue.lastFinalizedBlockHash
          : '',
      },
    } : {}),
    ...(input.maximumRanges === undefined ? {} : {
      maximumRanges: positiveInteger(input.maximumRanges, 'MARKS_MAX_RANGES_INVALID'),
    }),
    ...(typeof input.reportAliasKey === 'string' ? { reportAliasKey: input.reportAliasKey } : {}),
  });
  writeReport(arguments_, 'scan', report);
  return Object.freeze({
    reportWritten: true,
    dryRun: true,
    networkUsed: true,
    completeThroughFinalizedHead: report.range.completeThroughFinalizedHead,
    attribution: report.attribution,
  });
}

async function runReconcile(arguments_: ParsedArguments, input: UnknownRecord) {
  onlyKeys(input, ['scan', 'database'], 'MARKS_RECONCILIATION_INPUT_INVALID');
  const report = reconcilePrivacySafeAggregates({
    scan: parseAggregate(input.scan),
    database: parseAggregate(input.database),
  });
  writeReport(arguments_, 'reconcile', report);
  return Object.freeze({ reportWritten: true, reconciled: true, networkUsed: false });
}

export async function executeOperator(arguments_: ParsedArguments): Promise<unknown> {
  assertCommandFlags(arguments_);
  if (arguments_.command === 'apply') {
    // Deliberately fail before stdin, network, or database access. The module
    // has an idempotent reducer, but this local utility has no reviewed admin
    // transport and no production-application authorization boundary yet.
    throw new MarksOperatorError('MARKS_APPLY_DISABLED');
  }
  if (arguments_.command === 'inspect') {
    return Object.freeze({
      networkUsed: false,
      ...inspectPrivateOperatorReports(arguments_.reportDirectory),
      applyAvailable: false,
    });
  }
  return withExclusiveOperatorLock(arguments_.reportDirectory, async () => {
    const input = arguments_.inputStdin ? await readPrivateInput() : undefined;
    if (arguments_.command === 'plan') return runPlan(arguments_);
    if (arguments_.command === 'scan') return runScan(arguments_, input as UnknownRecord);
    if (arguments_.command === 'reconcile') return runReconcile(arguments_, input as UnknownRecord);
    throw new MarksOperatorError('MARKS_COMMAND_INVALID');
  });
}

function publicErrorCode(error: unknown): string {
  if (
    error instanceof MarksOperatorError
    || error instanceof MarksTransportError
    || error instanceof SnapBurnPolicyError
  ) {
    return error.code;
  }
  return 'MARKS_OPERATOR_FAILED';
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const arguments_ = parseOperatorArguments(argv);
    const result = await executeOperator(arguments_);
    process.stdout.write(`${JSON.stringify({ ok: true, command: arguments_.command, result })}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, code: publicErrorCode(error) })}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}

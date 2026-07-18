import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DbConnection } from '../src/spacetime/module_bindings';
import { GENESIS_RESOURCE_POLICY_VERSION } from '../spacetimedb/src/resourceAuthorityPolicy';
import { configureHermesMachineOutput } from './hermes-machine-output';

type Command =
  | 'seed-world'
  | 'expand-world-v3'
  | 'allow-fid'
  | 'disable-fid'
  | 'bump-auth-epoch'
  | 'inspect-alpha'
  | 'inspect-alpha-v2'
  | 'inspect-alpha-v3'
  | 'inspect-alpha-v4'
  | 'backfill-resources';

type AlphaStatusVersion = 'v1' | 'v2' | 'v3' | 'v4';

const DEFAULT_DATABASE = 'warpkeep-89e4u';
const DEFAULT_DATABASE_IDENTITY = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const DEFAULT_URI = 'https://maincloud.spacetimedb.com';
const DEFAULT_BRIDGE = 'https://auth.warpkeep.com';
const CONNECT_TIMEOUT_MS = 10_000;
const OPERATION_TIMEOUT_MS = 15_000;
const MAX_ADMIN_TOKEN_RESPONSE_BYTES = 32 * 1_024;
const MAX_RESOURCE_BACKFILL_FOUNDERS = 100n;
const GENESIS_GENERATION_V2_WORLD_CELLS = 1_261n;
const GENESIS_GENERATION_V3_WORLD_CELLS = 10_000n;
const GENESIS_REALM_COUNT = 1n;
const GENESIS_CASTLE_SLOT_COUNT = 100n;
const GENESIS_GENERATION_V2_VERSION = 2;
const GENESIS_MAX_FOUNDERS = 100n;
const HEGEMONY_WORLD_SEED = 3_445_214_658;
const HEGEMONY_WORLD_SEED_NAME = 'HEGEMONY_GENESIS_001';

function fail(message: string): never {
  throw new Error(message);
}

function readHttpsUrl(value: string | undefined, label: string) {
  if (!value) fail(`${label} is required.`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail(`${label} must be a valid HTTPS URL.`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.hostname.endsWith('.invalid')) {
    fail(`${label} must be a stable public HTTPS base URL.`);
  }
  return url.pathname === '/' ? url.origin : url.toString().replace(/\/$/, '');
}

function readDatabase(value: string | undefined) {
  const database = value || DEFAULT_DATABASE;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(database)) {
    fail('WARPKEEP_SPACETIMEDB_DATABASE is invalid.');
  }
  return database;
}

function readFid(value: string | undefined) {
  if (!value || !/^[1-9][0-9]{0,15}$/.test(value)) {
    fail('A positive, JavaScript-safe decimal FID is required.');
  }
  const fid = BigInt(value);
  if (fid > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail('FID exceeds the supported safe range.');
  }
  return fid;
}

function readFounderCount(value: string | undefined) {
  if (!value || !/^[1-9][0-9]{0,2}$/.test(value)) {
    fail('An expected founder count from 1 to 100 is required.');
  }
  const count = BigInt(value);
  if (count > MAX_RESOURCE_BACKFILL_FOUNDERS) {
    fail('An expected founder count from 1 to 100 is required.');
  }
  return count;
}

function sanitizeNote(value: string | undefined, fallback?: string) {
  const note = (value ?? fallback ?? '').trim();
  if (!note || note.length > 512) fail('A non-empty note of at most 512 characters is required.');
  return note;
}

export function readAdminSecret(value: string | undefined, fromStdin: string | undefined) {
  if (fromStdin !== undefined && fromStdin !== '1') {
    fail('WARPKEEP_ADMIN_TOKEN_SECRET_STDIN must be exactly 1 when configured.');
  }
  if (fromStdin === '1') {
    if (value !== undefined) fail('The Hermes credential source was ambiguous.');
    try {
      value = readFileSync(0, 'utf8');
    } catch {
      fail('The Hermes credential pipe was unavailable.');
    }
  }
  const bytes = value === undefined ? 0 : new TextEncoder().encode(value).byteLength;
  if (bytes < 32 || bytes > 512) {
    fail('WARPKEEP_ADMIN_TOKEN_SECRET must contain 32 to 512 bytes.');
  }
  return value as string;
}

function commandFrom(value: string | undefined): Command {
  if (
    value === 'seed-world'
    || value === 'expand-world-v3'
    || value === 'allow-fid'
    || value === 'disable-fid'
    || value === 'bump-auth-epoch'
    || value === 'inspect-alpha'
    || value === 'inspect-alpha-v2'
    || value === 'inspect-alpha-v3'
    || value === 'inspect-alpha-v4'
    || value === 'backfill-resources'
  ) {
    return value;
  }
  fail('Usage: hermes-admin.ts <seed-world|expand-world-v3|allow-fid|disable-fid|bump-auth-epoch|backfill-resources|inspect-alpha|inspect-alpha-v2|inspect-alpha-v3|inspect-alpha-v4> [...args] [--dry-run] [--confirm]');
}

export function parseHermesArguments(arguments_: readonly string[] = process.argv.slice(2)) {
  const allowedFlags = new Set(['--dry-run', '--confirm', '--json']);
  const flags = new Set<string>();
  const positional: string[] = [];
  for (const argument of arguments_) {
    if (argument.startsWith('--')) {
      if (!allowedFlags.has(argument) || flags.has(argument)) {
        fail('Unknown or duplicate Hermes command-line argument.');
      }
      flags.add(argument);
    } else {
      positional.push(argument);
    }
  }

  const command = commandFrom(positional[0]);
  const inspection = command === 'inspect-alpha'
    || command === 'inspect-alpha-v2'
    || command === 'inspect-alpha-v3'
    || command === 'inspect-alpha-v4';
  const expectedPositionals = command === 'allow-fid'
    || command === 'disable-fid'
    || command === 'bump-auth-epoch'
    ? 3
    : command === 'backfill-resources'
      ? 2
    : 1;
  if (positional.length !== expectedPositionals) {
    fail('Hermes command received an unexpected number of positional arguments.');
  }
  if ((inspection && flags.has('--confirm')) || (!inspection && flags.has('--json'))) {
    fail('Hermes command received a flag that is invalid for this operation.');
  }

  return Object.freeze({
    command,
    positional: Object.freeze(positional),
    dryRun: flags.has('--dry-run'),
    confirmedByFlag: flags.has('--confirm'),
    inspection,
    machineReadableInspection: inspection && flags.has('--json'),
  });
}

function printable(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(printable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, printable(entry)]));
  }
  return value;
}

type ResourceAggregateV4 = Readonly<{
  allowedFids: bigint;
  castles: bigint;
  markAccounts: bigint;
  resourceAccounts: bigint;
  missingResourceAccounts: bigint;
  orphanedResourceAccounts: bigint;
  resourceInvariantViolations: bigint;
  protocolVersion: number;
  resourcePolicyVersion: string;
}>;

type GenesisExpansionResourceStatusV4 = ResourceAggregateV4;

type GenesisExpansionStatusV3 = Readonly<{
  worldTiles: bigint;
  occupiedWorldTiles: bigint;
  worldTileMeta: bigint;
  realms: bigint;
  castleSlots: bigint;
  castleSlotClaims: bigint;
  legacyPlayers: bigint;
  playersV2: bigint;
  playerOwnershipsV2: bigint;
  castles: bigint;
  realmProfiles: bigint;
  markAccounts: bigint;
  snapBurnCredits: bigint;
  walletAttributions: bigint;
  walletAttributionSnapshots: bigint;
  scanCursors: bigint;
  scanBatches: bigint;
  alphaTermsAcceptances: bigint;
  allowedFids: bigint;
  enabledAllowedFids: bigint;
  auditEntries: bigint;
  orphanedPlayerRowsV2: bigint;
  orphanedOwnershipRowsV2: bigint;
  orphanedCastleClaims: bigint;
  orphanedCastles: bigint;
  orphanedRealmProfiles: bigint;
  orphanedMarkAccounts: bigint;
  orphanedBurnCredits: bigint;
  orphanedTermsAcceptances: bigint;
  founderStateGaps: bigint;
  markAccountInvariantViolations: bigint;
  publicMarkProjectionViolations: bigint;
  duplicateBurnReferences: bigint;
  burnAccountReconciliationViolations: bigint;
  ambiguousActiveWalletAddresses: bigint;
  staticWorldDriftViolations: bigint;
  termsAcceptanceInvariantViolations: bigint;
  protocolVersion: number;
  worldSeed: number;
  worldSeedName: string;
}>;

const GENESIS_EXPANSION_ZERO_INVARIANT_FIELDS = Object.freeze([
  'orphanedPlayerRowsV2',
  'orphanedOwnershipRowsV2',
  'orphanedCastleClaims',
  'orphanedCastles',
  'orphanedRealmProfiles',
  'orphanedMarkAccounts',
  'orphanedBurnCredits',
  'orphanedTermsAcceptances',
  'founderStateGaps',
  'markAccountInvariantViolations',
  'publicMarkProjectionViolations',
  'duplicateBurnReferences',
  'burnAccountReconciliationViolations',
  'ambiguousActiveWalletAddresses',
  'staticWorldDriftViolations',
  'termsAcceptanceInvariantViolations',
] as const satisfies readonly (keyof GenesisExpansionStatusV3)[]);

const GENESIS_EXPANSION_PRESERVED_COUNT_FIELDS = Object.freeze([
  'occupiedWorldTiles',
  'castleSlotClaims',
  'legacyPlayers',
  'playersV2',
  'playerOwnershipsV2',
  'castles',
  'realmProfiles',
  'markAccounts',
  'snapBurnCredits',
  'walletAttributions',
  'walletAttributionSnapshots',
  'scanCursors',
  'scanBatches',
  'alphaTermsAcceptances',
  'allowedFids',
  'enabledAllowedFids',
] as const satisfies readonly (keyof GenesisExpansionStatusV3)[]);

function verifyGenesisExpansionIdentity(status: GenesisExpansionStatusV3): void {
  if (
    status.protocolVersion !== 3
    || status.worldSeed !== HEGEMONY_WORLD_SEED
    || status.worldSeedName !== HEGEMONY_WORLD_SEED_NAME
  ) {
    fail('Genesis world v3 expansion checkpoint had an unexpected backend identity.');
  }
  for (const field of GENESIS_EXPANSION_ZERO_INVARIANT_FIELDS) {
    if (status[field] !== 0n) {
      fail(`Genesis world v3 expansion checkpoint reported nonzero ${field}.`);
    }
  }
}

function verifyFoundedGenesisState(status: GenesisExpansionStatusV3): void {
  const founders = status.allowedFids;
  if (
    founders < 1n
    || founders > GENESIS_MAX_FOUNDERS
    || status.enabledAllowedFids !== founders
    || status.occupiedWorldTiles !== founders
    || status.castleSlotClaims !== founders
    || status.castles !== founders
    || status.realmProfiles !== founders
    || status.markAccounts !== founders
    || status.playersV2 !== status.playerOwnershipsV2
    || status.playersV2 > founders
    || status.alphaTermsAcceptances > status.playersV2
  ) {
    fail('Genesis world v3 expansion checkpoint did not contain an exact founded player graph.');
  }
}

export function verifyGenesisExpansionPreconditionV3(
  status: GenesisExpansionStatusV3,
): GenesisExpansionStatusV3 {
  verifyGenesisExpansionIdentity(status);
  verifyFoundedGenesisState(status);
  if (
    status.worldTiles !== GENESIS_GENERATION_V2_WORLD_CELLS
    || status.worldTileMeta !== GENESIS_GENERATION_V2_WORLD_CELLS
    || status.realms !== GENESIS_REALM_COUNT
    || status.castleSlots !== GENESIS_CASTLE_SLOT_COUNT
  ) {
    fail('Genesis world v3 expansion requires the exact generation-v2 static world checkpoint.');
  }
  return Object.freeze({ ...status });
}

export function verifyGenesisExpansionPostconditionV3(
  status: GenesisExpansionStatusV3,
  before: GenesisExpansionStatusV3,
): GenesisExpansionStatusV3 {
  verifyGenesisExpansionIdentity(status);
  verifyFoundedGenesisState(status);
  if (
    status.worldTiles !== GENESIS_GENERATION_V3_WORLD_CELLS
    || status.worldTileMeta !== GENESIS_GENERATION_V3_WORLD_CELLS
    || status.realms !== GENESIS_REALM_COUNT
    || status.castleSlots !== GENESIS_CASTLE_SLOT_COUNT
  ) {
    fail(
      'Genesis world v3 expansion postcondition failed. The mutation outcome may be indeterminate; '
      + 'perform a fresh read-only v3 inspection before any retry.',
    );
  }
  for (const field of GENESIS_EXPANSION_PRESERVED_COUNT_FIELDS) {
    if (status[field] !== before[field]) {
      fail(
        'Genesis world v3 expansion changed persistent player state. '
        + 'Do not retry before a bounded read-only investigation.',
      );
    }
  }
  if (status.auditEntries !== before.auditEntries + 1n) {
    fail(
      'Genesis world v3 expansion did not produce the exact audit transition. '
      + 'Do not retry before a bounded read-only investigation.',
    );
  }
  return Object.freeze({ ...status });
}

export function verifyGenesisExpansionResourceCheckpointV4(
  status: GenesisExpansionResourceStatusV4,
): GenesisExpansionResourceStatusV4 {
  const founders = status.allowedFids;
  const exactPrebackfill = status.resourceAccounts === 0n
    && status.missingResourceAccounts === founders;
  const exactReady = status.resourceAccounts === founders
    && status.missingResourceAccounts === 0n;
  if (
    founders < 1n
    || founders > GENESIS_MAX_FOUNDERS
    || status.castles !== founders
    || status.markAccounts !== founders
    || (!exactPrebackfill && !exactReady)
    || status.orphanedResourceAccounts !== 0n
    || status.resourceInvariantViolations !== 0n
    || status.protocolVersion !== 3
    || status.resourcePolicyVersion !== GENESIS_RESOURCE_POLICY_VERSION
  ) {
    fail('Genesis world v3 expansion resource checkpoint was not exact.');
  }
  return Object.freeze({ ...status });
}

export function verifyGenesisExpansionResourcePreservationV4(
  status: GenesisExpansionResourceStatusV4,
  before: GenesisExpansionResourceStatusV4,
): GenesisExpansionResourceStatusV4 {
  const verified = verifyGenesisExpansionResourceCheckpointV4(status);
  for (const field of Object.keys(before) as (keyof GenesisExpansionResourceStatusV4)[]) {
    if (verified[field] !== before[field]) {
      fail(
        'Genesis world v3 expansion changed private resource aggregate state. '
        + 'Do not retry before a bounded read-only investigation.',
      );
    }
  }
  return verified;
}

export function verifyExpectedResourceAggregateV4(
  status: ResourceAggregateV4,
  expectedFounderCount: bigint,
): ResourceAggregateV4 {
  if (
    expectedFounderCount < 1n
    || expectedFounderCount > MAX_RESOURCE_BACKFILL_FOUNDERS
    || status.allowedFids !== expectedFounderCount
    || status.castles !== expectedFounderCount
    || status.markAccounts !== expectedFounderCount
    || status.resourceAccounts !== expectedFounderCount
    || status.missingResourceAccounts !== 0n
    || status.orphanedResourceAccounts !== 0n
    || status.resourceInvariantViolations !== 0n
    || status.protocolVersion !== 3
    || status.resourcePolicyVersion !== GENESIS_RESOURCE_POLICY_VERSION
  ) {
    fail(
      'Resource backfill postcondition failed. The mutation outcome may be indeterminate; '
      + 'perform a fresh read-only v4 inspection before any retry.',
    );
  }
  return Object.freeze({ ...status });
}

async function readBoundedAdminResponse(response: Response): Promise<unknown> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type') ?? '')) {
    fail('The Warpkeep admin bridge returned an invalid response.');
  }
  const advertisedLength = response.headers.get('content-length');
  if (
    advertisedLength
    && (!/^\d+$/.test(advertisedLength) || Number(advertisedLength) > MAX_ADMIN_TOKEN_RESPONSE_BYTES)
  ) {
    fail('The Warpkeep admin bridge returned an invalid response.');
  }
  if (!response.body) fail('The Warpkeep admin bridge returned an invalid response.');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let exceededLimit = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_ADMIN_TOKEN_RESPONSE_BYTES) {
        try { await reader.cancel(); } catch { /* Keep the rejection generic. */ }
        exceededLimit = true;
        break;
      }
      chunks.push(value);
    }
  } catch {
    fail('The Warpkeep admin bridge returned an invalid response.');
  } finally {
    try { reader.releaseLock(); } catch { /* Keep the rejection generic. */ }
  }
  if (exceededLimit) fail('The Warpkeep admin bridge returned an invalid response.');

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('The Warpkeep admin bridge returned an invalid response.');
  }
}

export async function requestAdminToken(
  bridgeUrl: string,
  secret: string,
  fetchImpl: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await fetchImpl(new URL('v1/admin/token', `${bridgeUrl}/`), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        accept: 'application/json',
        'cache-control': 'no-store',
      },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    fail('Could not reach the Warpkeep admin bridge.');
  }
  if (!response.ok) fail('The Warpkeep admin bridge rejected the request.');
  const body = await readBoundedAdminResponse(response);
  const token = body && typeof body === 'object' ? (body as { token?: unknown }).token : undefined;
  if (
    !body
    || typeof body !== 'object'
    || typeof token !== 'string'
    || token.length < 24
    || token.length > 16_384
    || token.split('.').length !== 3
    || token.split('.').some(part => !/^[A-Za-z0-9_-]+$/.test(part))
    || (body as { tokenType?: unknown }).tokenType !== 'spacetime-access'
  ) {
    fail('The Warpkeep admin bridge returned an invalid session.');
  }
  return token;
}

export function requireCredentialedProductionTarget(
  uri: string,
  database: string,
  bridgeUrl: string,
): void {
  if (
    uri !== DEFAULT_URI
    || (database !== DEFAULT_DATABASE && database !== DEFAULT_DATABASE_IDENTITY)
    || bridgeUrl !== DEFAULT_BRIDGE
  ) {
    fail('Credentialed Hermes commands require the canonical Warpkeep production targets.');
  }
}

/** Durable resource migration may target only the attested immutable identity. */
export function requireResourceBackfillProductionTarget(database: string): void {
  if (database !== DEFAULT_DATABASE_IDENTITY) {
    fail('Resource backfill requires the immutable Warpkeep production database identity.');
  }
}

/** The one-time persistent world expansion may target only the attested identity. */
export function requireGenesisExpansionProductionTarget(database: string): void {
  if (database !== DEFAULT_DATABASE_IDENTITY) {
    fail('Genesis world v3 expansion requires the immutable Warpkeep production database identity.');
  }
}

function withOperationTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(
      'Warpkeep database operation timed out. A submitted mutation may still commit; inspect current state before retrying.',
    )), OPERATION_TIMEOUT_MS);
  });
  return Promise.race([operation, deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function disconnectSilently(connection: DbConnection | undefined): void {
  if (!connection || connection.isDisconnectRequested) return;
  try { connection.disconnect(); } catch { /* Preserve the generic connection boundary. */ }
}

export function connect(
  uri: string,
  database: string,
  token: string,
  builderFactory: () => ReturnType<typeof DbConnection.builder> = () => DbConnection.builder(),
): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let failed = false;
    let pendingConnection: DbConnection | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (callback: () => void) => {
      if (settled) return false;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      callback();
      return true;
    };
    const rejectUnavailable = () => {
      if (!settle(() => reject(new Error('Could not connect to the Warpkeep database.')))) return false;
      failed = true;
      disconnectSilently(pendingConnection);
      pendingConnection = undefined;
      return true;
    };
    timer = setTimeout(() => {
      rejectUnavailable();
    }, CONNECT_TIMEOUT_MS);
    try {
      const builder = builderFactory()
        .withUri(uri)
        .withDatabaseName(database)
        .withToken(token)
        .onConnect((connection) => {
          if (settle(() => resolve(connection))) pendingConnection = undefined;
          else disconnectSilently(connection);
        })
        .onConnectError(() => rejectUnavailable());
      const builtConnection = builder.build();
      if (failed) disconnectSilently(builtConnection);
      else if (!settled) pendingConnection = builtConnection;
    } catch {
      rejectUnavailable();
    }
  });
}

export async function readStatus(
  connection: DbConnection,
  version: AlphaStatusVersion = 'v1',
  machineReadable = false,
  expectedResourceFounderCount?: bigint,
) {
  if (version === 'v4') {
    const status = await withOperationTimeout(connection.procedures.adminGetAlphaStatusV4({}));
    const safeStatus = {
      allowedFids: status.allowedFids,
      castles: status.castles,
      markAccounts: status.markAccounts,
      resourceAccounts: status.resourceAccounts,
      missingResourceAccounts: status.missingResourceAccounts,
      orphanedResourceAccounts: status.orphanedResourceAccounts,
      resourceInvariantViolations: status.resourceInvariantViolations,
      protocolVersion: status.protocolVersion,
      resourcePolicyVersion: status.resourcePolicyVersion,
    };
    const verifiedStatus = expectedResourceFounderCount === undefined
      ? safeStatus
      : verifyExpectedResourceAggregateV4(safeStatus, expectedResourceFounderCount);
    console.log(JSON.stringify(printable(verifiedStatus)));
    return verifiedStatus;
  }
  if (version === 'v3') {
    const status = await withOperationTimeout(connection.procedures.adminGetAlphaStatusV3({}));
    const safeStatus = {
      worldTiles: status.worldTiles,
      occupiedWorldTiles: status.occupiedWorldTiles,
      worldTileMeta: status.worldTileMeta,
      realms: status.realms,
      castleSlots: status.castleSlots,
      castleSlotClaims: status.castleSlotClaims,
      legacyPlayers: status.legacyPlayers,
      playersV2: status.playersV2,
      playerOwnershipsV2: status.playerOwnershipsV2,
      castles: status.castles,
      realmProfiles: status.realmProfiles,
      markAccounts: status.markAccounts,
      snapBurnCredits: status.snapBurnCredits,
      walletAttributions: status.walletAttributions,
      walletAttributionSnapshots: status.walletAttributionSnapshots,
      scanCursors: status.scanCursors,
      scanBatches: status.scanBatches,
      alphaTermsAcceptances: status.alphaTermsAcceptances,
      allowedFids: status.allowedFids,
      enabledAllowedFids: status.enabledAllowedFids,
      auditEntries: status.auditEntries,
      orphanedPlayerRowsV2: status.orphanedPlayerRowsV2,
      orphanedOwnershipRowsV2: status.orphanedOwnershipRowsV2,
      orphanedCastleClaims: status.orphanedCastleClaims,
      orphanedCastles: status.orphanedCastles,
      orphanedRealmProfiles: status.orphanedRealmProfiles,
      orphanedMarkAccounts: status.orphanedMarkAccounts,
      orphanedBurnCredits: status.orphanedBurnCredits,
      orphanedTermsAcceptances: status.orphanedTermsAcceptances,
      founderStateGaps: status.founderStateGaps,
      markAccountInvariantViolations: status.markAccountInvariantViolations,
      publicMarkProjectionViolations: status.publicMarkProjectionViolations,
      duplicateBurnReferences: status.duplicateBurnReferences,
      burnAccountReconciliationViolations: status.burnAccountReconciliationViolations,
      ambiguousActiveWalletAddresses: status.ambiguousActiveWalletAddresses,
      staticWorldDriftViolations: status.staticWorldDriftViolations,
      termsAcceptanceInvariantViolations: status.termsAcceptanceInvariantViolations,
      protocolVersion: status.protocolVersion,
      worldSeed: status.worldSeed,
      worldSeedName: status.worldSeedName,
    };
    console.log(JSON.stringify(printable(safeStatus)));
    return Object.freeze(safeStatus);
  }
  if (version === 'v2') {
    const status = await withOperationTimeout(connection.procedures.adminGetAlphaStatusV2({}));
    const safeStatus = {
      worldTiles: status.worldTiles,
      legacyPlayers: status.legacyPlayers,
      playersV2: status.playersV2,
      playerOwnershipsV2: status.playerOwnershipsV2,
      consistentPlayerPairsV2: status.consistentPlayerPairsV2,
      orphanedPlayerRowsV2: status.orphanedPlayerRowsV2,
      orphanedOwnershipRowsV2: status.orphanedOwnershipRowsV2,
      castles: status.castles,
      allowedFids: status.allowedFids,
      enabledAllowedFids: status.enabledAllowedFids,
      auditEntries: status.auditEntries,
      protocolVersion: status.protocolVersion,
      worldSeed: status.worldSeed,
      worldSeedName: status.worldSeedName,
    };
    console.log(JSON.stringify(printable(safeStatus)));
    return;
  }

  const status = await withOperationTimeout(connection.procedures.adminGetAlphaStatus({}));
  if (machineReadable) {
    // Keep the verifier contract deliberately narrow: it needs aggregate
    // activation state, never audit records, targets, identities, or tokens.
    console.log(JSON.stringify(printable({
      worldTiles: status.worldTiles,
      allowedFids: status.allowedFids,
      enabledAllowedFids: status.enabledAllowedFids,
      players: status.players,
      castles: status.castles,
    })));
    return;
  }
  console.log(JSON.stringify(printable(status)));
}

async function main() {
  const {
    command,
    positional,
    dryRun,
    confirmedByFlag,
    inspection,
    machineReadableInspection,
  } = parseHermesArguments();
  configureHermesMachineOutput(machineReadableInspection);
  // Durable data migrations always require a visible command-line confirmation.
  // The legacy noninteractive switch remains available to older bounded
  // operators, but cannot silently authorize either one-time migration.
  const confirmed = confirmedByFlag || (
    command !== 'backfill-resources'
    && command !== 'expand-world-v3'
    && process.env.WARPKEEP_HERMES_NONINTERACTIVE === 'yes'
  );
  const mutation = !inspection;
  const database = readDatabase(process.env.WARPKEEP_SPACETIMEDB_DATABASE);
  const uri = readHttpsUrl(process.env.WARPKEEP_SPACETIMEDB_URI || DEFAULT_URI, 'WARPKEEP_SPACETIMEDB_URI');

  const fid = command === 'allow-fid' || command === 'disable-fid' || command === 'bump-auth-epoch'
    ? readFid(positional[1])
    : undefined;
  const expectedFounderCount = command === 'backfill-resources'
    ? readFounderCount(positional[1])
    : undefined;
  const note = command === 'allow-fid' || command === 'disable-fid'
    ? sanitizeNote(positional[2])
    : command === 'bump-auth-epoch'
      ? sanitizeNote(positional[2], 'auth epoch rotation')
      : undefined;

  if (command === 'expand-world-v3') {
    requireGenesisExpansionProductionTarget(database);
  }

  if (!machineReadableInspection) {
    console.log(`Warpkeep Hermes target: ${database} at ${uri}`);
  }
  if (dryRun) {
    console.log(JSON.stringify(printable({
      command,
      fid,
      note,
      expectedFounderCount,
      expectedWorldTiles: command === 'expand-world-v3'
        ? GENESIS_GENERATION_V2_WORLD_CELLS
        : undefined,
      expectedWorldTileMeta: command === 'expand-world-v3'
        ? GENESIS_GENERATION_V2_WORLD_CELLS
        : undefined,
      expectedGenerationVersion: command === 'expand-world-v3'
        ? GENESIS_GENERATION_V2_VERSION
        : undefined,
      targetWorldTiles: command === 'expand-world-v3'
        ? GENESIS_GENERATION_V3_WORLD_CELLS
        : undefined,
      resourcePolicyVersion: command === 'backfill-resources'
        ? GENESIS_RESOURCE_POLICY_VERSION
        : undefined,
      mutation,
      dryRun: true,
    })));
    return;
  }
  if (mutation && !confirmed) {
    fail(
      command === 'backfill-resources' || command === 'expand-world-v3'
        ? 'Refusing mutation without --confirm.'
        : 'Refusing mutation without --confirm (or WARPKEEP_HERMES_NONINTERACTIVE=yes).',
    );
  }
  if (command === 'backfill-resources') {
    requireResourceBackfillProductionTarget(database);
  }

  const bridgeUrl = readHttpsUrl(process.env.WARPKEEP_AUTH_BRIDGE_URL, 'WARPKEEP_AUTH_BRIDGE_URL');
  requireCredentialedProductionTarget(uri, database, bridgeUrl);
  const secret = readAdminSecret(
    process.env.WARPKEEP_ADMIN_TOKEN_SECRET,
    process.env.WARPKEEP_ADMIN_TOKEN_SECRET_STDIN,
  );
  const token = await requestAdminToken(bridgeUrl, secret);
  const connection = await connect(uri, database, token);
  try {
    let expansionStatusHandled = false;
    if (command === 'expand-world-v3') {
      const before = verifyGenesisExpansionPreconditionV3(
        await readStatus(connection, 'v3') as GenesisExpansionStatusV3,
      );
      const beforeResources = verifyGenesisExpansionResourceCheckpointV4(
        await readStatus(connection, 'v4') as GenesisExpansionResourceStatusV4,
      );
      await withOperationTimeout(connection.reducers.adminExpandGenesisWorldV3({
        expectedWorldTiles: GENESIS_GENERATION_V2_WORLD_CELLS,
        expectedWorldTileMeta: GENESIS_GENERATION_V2_WORLD_CELLS,
        expectedGenerationVersion: GENESIS_GENERATION_V2_VERSION,
      }));
      verifyGenesisExpansionPostconditionV3(
        await readStatus(connection, 'v3') as GenesisExpansionStatusV3,
        before,
      );
      verifyGenesisExpansionResourcePreservationV4(
        await readStatus(connection, 'v4') as GenesisExpansionResourceStatusV4,
        beforeResources,
      );
      expansionStatusHandled = true;
    } else if (command === 'seed-world') {
      await withOperationTimeout(connection.reducers.adminSeedWorld({}));
    } else if (command === 'allow-fid' && fid !== undefined && note !== undefined) {
      await withOperationTimeout(connection.reducers.adminAllowFid({ fid, note }));
    } else if (command === 'disable-fid' && fid !== undefined && note !== undefined) {
      await withOperationTimeout(connection.reducers.adminDisableFid({ fid, note }));
    } else if (command === 'bump-auth-epoch' && fid !== undefined && note !== undefined) {
      await withOperationTimeout(connection.reducers.adminBumpAuthEpoch({ fid, note }));
    } else if (command === 'backfill-resources' && expectedFounderCount !== undefined) {
      await withOperationTimeout(connection.reducers.adminBackfillResourceAccountsV1({
        expectedFounderCount,
        policyVersion: GENESIS_RESOURCE_POLICY_VERSION,
      }));
    }
    const statusVersion: AlphaStatusVersion = command === 'inspect-alpha-v2'
      ? 'v2'
      : command === 'inspect-alpha-v3'
        ? 'v3'
        : command === 'inspect-alpha-v4' || command === 'backfill-resources'
          ? 'v4'
          : 'v1';
    if (!expansionStatusHandled) {
      await readStatus(
        connection,
        statusVersion,
        machineReadableInspection,
        command === 'backfill-resources' ? expectedFounderCount : undefined,
      );
    }
  } finally {
    connection.disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    // Error messages are intentionally generic and never include a bridge token,
    // secret, request body, or server response body.
    console.error(error instanceof Error ? error.message : 'Hermes command failed.');
    process.exitCode = 1;
  });
}

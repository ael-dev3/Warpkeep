import { createHash } from 'node:crypto';

export const GENESIS_001_ADMITTED_PLAYER_CENSUS_PRIVATE_PROFILE =
  'warpkeep-genesis-001-admitted-player-census-private-proof-v1';
export const GENESIS_001_ADMITTED_PLAYER_CENSUS_PUBLIC_PROFILE =
  'warpkeep-genesis-001-admitted-player-census-privacy-safe-v1';
export const GENESIS_001_ADMITTED_PLAYER_CENSUS_PREFERRED_SQL =
  'SELECT fid, enabled, auth_epoch FROM allowed_fid';
export const GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_SQL =
  'SELECT fid FROM player_v2';
export const GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_PROCEDURE =
  'admin_get_access_request_admission_status_v1';
export const GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_ROWS = 4_096;
export const GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_QUERY_OUTPUT_BYTES =
  1_024 * 1_024;
export const GENESIS_001_ADMITTED_PLAYER_CENSUS_MINIMUM_STABLE_SEPARATION_MS =
  60_000;
export const GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_STABLE_SEPARATION_MS =
  300_000;
export const GENESIS_001_ADMITTED_PLAYER_CENSUS_NORMALIZED_SET_DOMAIN =
  'warpkeep.genesis-001.admitted-player-census.normalized-set.v1\n';
export const GENESIS_001_ADMITTED_PLAYER_CENSUS_RAW_EVIDENCE_DOMAIN =
  'warpkeep.genesis-001.admitted-player-census.raw-evidence.v1\n';
export const GENESIS_001_ADMITTED_PLAYER_CENSUS_OPAQUE_PROOF_DOMAIN =
  'warpkeep.genesis-001.admitted-player-census.private-proof.v1\n';

const GENESIS_001_DATABASE_IDENTITY =
  'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const COMMIT = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const CANONICAL_TIME =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/u;
const CANONICAL_FID = /^(?:[1-9][0-9]{0,15})$/u;
const CANONICAL_EPOCH = /^(?:[1-9][0-9]{0,9})$/u;
const CANONICAL_COUNT = /^(?:0|[1-9][0-9]{0,3})$/u;
const MAXIMUM_FID = 9_007_199_254_740_991n;
const MAXIMUM_AUTH_EPOCH = 4_294_967_295n;
const MAXIMUM_U64 = 18_446_744_073_709_551_615n;
const NONCE_BYTES = 32;
const PRIVATE_RECEIPT_KEYS = Object.freeze([
  'admittedPlayerCount',
  'afterAggregate',
  'beforeAggregate',
  'collectionMethod',
  'databaseIdentity',
  'entries',
  'nonceHex',
  'normalizedSetDigest',
  'observedAt',
  'opaqueProofDigest',
  'preparationSourceCommit',
  'profile',
  'rawEvidenceDigest',
  'realmId',
  'releaseVersion',
  'schemaVersion',
].sort());

export class Genesis001AdmittedPlayerCensusError extends Error {
  constructor(code) {
    super(code);
    this.name = 'Genesis001AdmittedPlayerCensusError';
    this.code = code;
  }
}

function fail(code) {
  throw new Genesis001AdmittedPlayerCensusError(code);
}

function exactObject(value, keys, code) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
    ) fail(code);
    const ownKeys = Reflect.ownKeys(value);
    const descriptors = Object.values(Object.getOwnPropertyDescriptors(value));
    if (
      ownKeys.some(key => typeof key !== 'string')
      || ownKeys.length !== keys.length
      || [...ownKeys].sort().some((key, index) => key !== keys[index])
      || descriptors.some(
        descriptor => !('value' in descriptor) || descriptor.enumerable !== true,
      )
    ) fail(code);
    return value;
  } catch (error) {
    if (error instanceof Genesis001AdmittedPlayerCensusError) throw error;
    return fail(code);
  }
}

function exactObservedAt(value) {
  if (
    typeof value !== 'string'
    || !CANONICAL_TIME.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value
  ) fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_TIME_INVALID');
  return value;
}

function exactDecimal(value, pattern, maximum, code) {
  if (typeof value !== 'string' || !pattern.test(value)) fail(code);
  const parsed = BigInt(value);
  if (parsed < 1n || parsed > maximum) fail(code);
  return parsed;
}

function exactFid(value) {
  return exactDecimal(
    value,
    CANONICAL_FID,
    MAXIMUM_FID,
    'GENESIS_001_ADMITTED_PLAYER_CENSUS_FID_INVALID',
  );
}

function exactEpoch(value) {
  return exactDecimal(
    value,
    CANONICAL_EPOCH,
    MAXIMUM_AUTH_EPOCH,
    'GENESIS_001_ADMITTED_PLAYER_CENSUS_AUTH_EPOCH_INVALID',
  );
}

function boundedCanonicalText(output, code) {
  if (
    !(output instanceof Uint8Array)
    || output.byteLength < 1
    || output.byteLength > GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_QUERY_OUTPUT_BYTES
  ) fail(code);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(output);
  } catch {
    return fail(code);
  }
  if (
    !text.endsWith('\n')
    || text.includes('\r')
    || text.includes('\0')
    || text.includes('\u001b')
    || output.some(byte => byte > 0x7f)
    || !/^[\u0009\u000a\u0020-\u007e]+$/u.test(text)
  ) fail(code);
  const lines = text.split('\n');
  if (lines.pop() !== '' || lines.some(line => line.length === 0)) fail(code);
  return Object.freeze({ bytes: Uint8Array.from(output), lines });
}

function normalizedEntries(entries) {
  entries.sort((left, right) => {
    const leftFid = BigInt(left.fid);
    const rightFid = BigInt(right.fid);
    return leftFid < rightFid ? -1 : leftFid > rightFid ? 1 : 0;
  });
  return Object.freeze(entries.map(entry => Object.freeze({ ...entry })));
}

function normalizedRows(entries) {
  return `${entries.map(entry => JSON.stringify(entry)).join('\n')}\n`;
}

function normalizedSetDigest(entries) {
  return createHash('sha256')
    .update(GENESIS_001_ADMITTED_PLAYER_CENSUS_NORMALIZED_SET_DOMAIN)
    .update(normalizedRows(entries), 'utf8')
    .digest('hex');
}

export function parseGenesis001AdmittedPlayerPreferredResult(output) {
  const parsed = boundedCanonicalText(
    output,
    'GENESIS_001_ADMITTED_PLAYER_CENSUS_PREFERRED_RESULT_INVALID',
  );
  if (parsed.lines.shift() !== 'fid\tenabled\tauth_epoch') {
    fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_PREFERRED_RESULT_INVALID');
  }
  if (
    parsed.lines.length < 1
    || parsed.lines.length > GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_ROWS
  ) fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_PREFERRED_RESULT_INVALID');
  const seen = new Set();
  const entries = [];
  for (const line of parsed.lines) {
    const fields = line.split('\t');
    if (fields.length !== 3) {
      fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_PREFERRED_RESULT_INVALID');
    }
    const [fid, enabled, authEpoch] = fields;
    exactFid(fid);
    exactEpoch(authEpoch);
    if (enabled !== 'true') {
      fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_ENABLED_INVALID');
    }
    if (seen.has(fid)) fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_DUPLICATE_FID');
    seen.add(fid);
    entries.push({ fid, authEpoch });
  }
  const normalized = normalizedEntries(entries);
  return Object.freeze({
    entries: normalized,
    normalizedSetDigest: normalizedSetDigest(normalized),
    rawEvidenceBytes: parsed.bytes,
  });
}

function parseFallbackFids(output) {
  const parsed = boundedCanonicalText(
    output,
    'GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_RESULT_INVALID',
  );
  if (parsed.lines.shift() !== 'fid') {
    fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_RESULT_INVALID');
  }
  if (
    parsed.lines.length < 1
    || parsed.lines.length > GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_ROWS
  ) fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_RESULT_INVALID');
  const seen = new Set();
  const fids = [];
  for (const fid of parsed.lines) {
    exactFid(fid);
    if (seen.has(fid)) fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_DUPLICATE_FID');
    seen.add(fid);
    fids.push(fid);
  }
  fids.sort((left, right) => BigInt(left) < BigInt(right) ? -1 : 1);
  return Object.freeze({ fids: Object.freeze(fids), rawEvidenceBytes: parsed.bytes });
}

function exactAggregate(value) {
  const aggregate = exactObject(
    value,
    ['allowedFids', 'enabledAllowedFids'],
    'GENESIS_001_ADMITTED_PLAYER_CENSUS_AGGREGATE_INVALID',
  );
  if (
    typeof aggregate.allowedFids !== 'string'
    || typeof aggregate.enabledAllowedFids !== 'string'
    || !CANONICAL_COUNT.test(aggregate.allowedFids)
    || !CANONICAL_COUNT.test(aggregate.enabledAllowedFids)
  ) fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_AGGREGATE_INVALID');
  const allowedFids = BigInt(aggregate.allowedFids);
  const enabledAllowedFids = BigInt(aggregate.enabledAllowedFids);
  if (
    allowedFids < 1n
    || allowedFids > BigInt(GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_ROWS)
    || enabledAllowedFids !== allowedFids
  ) fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_AGGREGATE_INVALID');
  return Object.freeze({
    allowedFids: aggregate.allowedFids,
    enabledAllowedFids: aggregate.enabledAllowedFids,
  });
}

function exactProcedureStatus(value) {
  const status = exactObject(
    value,
    [
      'admissionState',
      'authEpoch',
      'requestCycle',
      'requestState',
      'requestedAtMicros',
    ],
    'GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_STATUS_INVALID',
  );
  if (!['missing', 'enabled', 'disabled'].includes(status.admissionState)) {
    fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_STATUS_INVALID');
  }
  if (
    typeof status.authEpoch !== 'number'
    || !Number.isInteger(status.authEpoch)
    || status.authEpoch < 0
    || status.authEpoch > Number(MAXIMUM_AUTH_EPOCH)
    || (status.admissionState === 'missing' && status.authEpoch !== 0)
    || (status.admissionState !== 'missing' && status.authEpoch < 1)
  ) fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_STATUS_INVALID');
  const requestCycle = status.requestCycle;
  const requestedAtMicros = status.requestedAtMicros;
  if (
    (requestCycle === undefined) !== (requestedAtMicros === undefined)
    || (requestCycle !== undefined && (
      typeof requestCycle !== 'bigint'
      || requestCycle < 0n
      || requestCycle > MAXIMUM_U64
    ))
    || (requestedAtMicros !== undefined && (
      typeof requestedAtMicros !== 'bigint'
      || requestedAtMicros < 1n
      || requestedAtMicros > MAXIMUM_U64
    ))
  ) fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_STATUS_INVALID');
  if (!['not_requested', 'pending', 'resolved'].includes(status.requestState)) {
    fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_STATUS_INVALID');
  }
  const maximumCycle = status.admissionState === 'disabled'
    ? BigInt(status.authEpoch) + 1n
    : BigInt(status.authEpoch);
  if (requestCycle !== undefined && requestCycle > maximumCycle) {
    fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_STATUS_INVALID');
  }
  const currentCycle = status.admissionState === 'missing'
    ? 0n
    : status.admissionState === 'disabled'
      ? BigInt(status.authEpoch) + 1n
      : undefined;
  const expectedRequestState = requestCycle === undefined
    ? 'not_requested'
    : currentCycle !== undefined && requestCycle === currentCycle
      ? 'pending'
      : 'resolved';
  if (status.requestState !== expectedRequestState) {
    fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_STATUS_INVALID');
  }
  return Object.freeze({
    admissionState: status.admissionState,
    authEpoch: status.authEpoch,
    requestState: status.requestState,
    requestCycle,
    requestedAtMicros,
  });
}

function canonicalFallbackStatus(status) {
  return Object.freeze({
    admissionState: status.admissionState,
    authEpoch: String(status.authEpoch),
    requestState: status.requestState,
    requestCycle: status.requestCycle?.toString() ?? null,
    requestedAtMicros: status.requestedAtMicros?.toString() ?? null,
  });
}

function rawDigest(output, statuses = []) {
  const hash = createHash('sha256')
    .update(GENESIS_001_ADMITTED_PLAYER_CENSUS_RAW_EVIDENCE_DOMAIN)
    .update(output);
  for (const status of statuses) hash.update(`${JSON.stringify(status)}\n`, 'utf8');
  return hash.digest('hex');
}

function exactNonce(randomBytes) {
  if (typeof randomBytes !== 'function') {
    fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_NONCE_INVALID');
  }
  let output;
  try {
    output = randomBytes(NONCE_BYTES);
  } catch {
    return fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_NONCE_INVALID');
  }
  if (
    !(output instanceof Uint8Array)
    || output.byteLength !== NONCE_BYTES
    || output.every(byte => byte === 0)
  ) fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_NONCE_INVALID');
  return Buffer.from(output).toString('hex');
}

function privateProof(receipt) {
  return Object.freeze({
    schemaVersion: receipt.schemaVersion,
    profile: receipt.profile,
    realmId: receipt.realmId,
    releaseVersion: receipt.releaseVersion,
    databaseIdentity: receipt.databaseIdentity,
    preparationSourceCommit: receipt.preparationSourceCommit,
    observedAt: receipt.observedAt,
    collectionMethod: receipt.collectionMethod,
    beforeAggregate: receipt.beforeAggregate,
    afterAggregate: receipt.afterAggregate,
    admittedPlayerCount: receipt.admittedPlayerCount,
    entries: receipt.entries,
    normalizedSetDigest: receipt.normalizedSetDigest,
    rawEvidenceDigest: receipt.rawEvidenceDigest,
    nonceHex: receipt.nonceHex,
  });
}

function opaqueProofDigest(proof) {
  return createHash('sha256')
    .update(GENESIS_001_ADMITTED_PLAYER_CENSUS_OPAQUE_PROOF_DOMAIN)
    .update(`${JSON.stringify(proof)}\n`, 'utf8')
    .digest('hex');
}

function exactPreferredOutcome(value) {
  if (value?.outcome === 'unsupported-exact-query') {
    exactObject(
      value,
      ['outcome'],
      'GENESIS_001_ADMITTED_PLAYER_CENSUS_PREFERRED_OUTCOME_INVALID',
    );
    return value;
  }
  const result = exactObject(
    value,
    ['outcome', 'output'],
    'GENESIS_001_ADMITTED_PLAYER_CENSUS_PREFERRED_OUTCOME_INVALID',
  );
  if (result.outcome !== 'exact-query-supported') {
    fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_PREFERRED_OUTCOME_INVALID');
  }
  return result;
}

export async function collectGenesis001AdmittedPlayerCensus(input) {
  if (
    input === null
    || typeof input !== 'object'
    || !COMMIT.test(input.preparationSourceCommit ?? '')
    || typeof input.readAggregates !== 'function'
    || typeof input.queryPreferred !== 'function'
  ) fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_INPUT_INVALID');
  const observedAt = exactObservedAt(input.observedAt);
  const beforeAggregate = exactAggregate(await input.readAggregates());
  const preferredResult = exactPreferredOutcome(
    await input.queryPreferred(GENESIS_001_ADMITTED_PLAYER_CENSUS_PREFERRED_SQL),
  );
  let collectionMethod;
  let entries;
  let setDigest;
  let rawEvidenceDigest;
  if (preferredResult.outcome === 'exact-query-supported') {
    const parsed = parseGenesis001AdmittedPlayerPreferredResult(
      preferredResult.output,
    );
    collectionMethod = 'preferred-exact-query';
    entries = parsed.entries;
    setDigest = parsed.normalizedSetDigest;
    rawEvidenceDigest = rawDigest(parsed.rawEvidenceBytes);
  } else {
    if (
      typeof input.queryFallbackFids !== 'function'
      || typeof input.readAdmissionStatus !== 'function'
    ) fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_INPUT_INVALID');
    const enumeration = parseFallbackFids(
      await input.queryFallbackFids(
        GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_SQL,
      ),
    );
    const fallbackEntries = [];
    const statuses = [];
    for (const fid of enumeration.fids) {
      const status = exactProcedureStatus(await input.readAdmissionStatus(
        GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_PROCEDURE,
        fid,
      ));
      statuses.push(canonicalFallbackStatus(status));
      if (status.admissionState !== 'enabled') {
        fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_ADMISSION_INVALID');
      }
      fallbackEntries.push({ fid, authEpoch: String(status.authEpoch) });
    }
    collectionMethod = 'fallback-player-v2-status-v1';
    entries = normalizedEntries(fallbackEntries);
    setDigest = normalizedSetDigest(entries);
    rawEvidenceDigest = rawDigest(enumeration.rawEvidenceBytes, statuses);
  }
  const afterAggregate = exactAggregate(await input.readAggregates());
  if (
    JSON.stringify(beforeAggregate) !== JSON.stringify(afterAggregate)
    || BigInt(beforeAggregate.allowedFids) !== BigInt(entries.length)
  ) fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_AGGREGATE_MISMATCH');
  const proof = Object.freeze({
    schemaVersion: 1,
    profile: GENESIS_001_ADMITTED_PLAYER_CENSUS_PRIVATE_PROFILE,
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    databaseIdentity: GENESIS_001_DATABASE_IDENTITY,
    preparationSourceCommit: input.preparationSourceCommit,
    observedAt,
    collectionMethod,
    beforeAggregate,
    afterAggregate,
    admittedPlayerCount: beforeAggregate.allowedFids,
    entries,
    normalizedSetDigest: setDigest,
    rawEvidenceDigest,
    nonceHex: exactNonce(input.randomBytes),
  });
  return Object.freeze({ ...proof, opaqueProofDigest: opaqueProofDigest(proof) });
}

export function verifyGenesis001AdmittedPlayerCensusReceipt(value) {
  const receipt = exactObject(
    value,
    PRIVATE_RECEIPT_KEYS,
    'GENESIS_001_ADMITTED_PLAYER_CENSUS_RECEIPT_INVALID',
  );
  if (
    receipt.schemaVersion !== 1
    || receipt.profile !== GENESIS_001_ADMITTED_PLAYER_CENSUS_PRIVATE_PROFILE
    || receipt.realmId !== 'GENESIS_001'
    || receipt.releaseVersion !== '0.3.43'
    || receipt.databaseIdentity !== GENESIS_001_DATABASE_IDENTITY
    || !COMMIT.test(receipt.preparationSourceCommit ?? '')
    || !['preferred-exact-query', 'fallback-player-v2-status-v1']
      .includes(receipt.collectionMethod)
    || !SHA256.test(receipt.rawEvidenceDigest ?? '')
    || !SHA256.test(receipt.normalizedSetDigest ?? '')
    || !SHA256.test(receipt.opaqueProofDigest ?? '')
    || !SHA256.test(receipt.nonceHex ?? '')
    || /^0{64}$/u.test(receipt.nonceHex)
  ) fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_RECEIPT_INVALID');
  const observedAt = exactObservedAt(receipt.observedAt);
  const beforeAggregate = exactAggregate(receipt.beforeAggregate);
  const afterAggregate = exactAggregate(receipt.afterAggregate);
  if (JSON.stringify(beforeAggregate) !== JSON.stringify(afterAggregate)) {
    fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_RECEIPT_INVALID');
  }
  if (
    !Array.isArray(receipt.entries)
    || receipt.entries.length < 1
    || receipt.entries.length > GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_ROWS
    || receipt.admittedPlayerCount !== String(receipt.entries.length)
    || receipt.admittedPlayerCount !== beforeAggregate.allowedFids
  ) fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_RECEIPT_INVALID');
  const entries = [];
  let previousFid = 0n;
  for (const valueEntry of receipt.entries) {
    const entry = exactObject(
      valueEntry,
      ['authEpoch', 'fid'],
      'GENESIS_001_ADMITTED_PLAYER_CENSUS_RECEIPT_INVALID',
    );
    const fid = exactFid(entry.fid);
    exactEpoch(entry.authEpoch);
    if (fid <= previousFid) {
      fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_RECEIPT_INVALID');
    }
    previousFid = fid;
    entries.push(Object.freeze({ fid: entry.fid, authEpoch: entry.authEpoch }));
  }
  const normalized = Object.freeze(entries);
  if (normalizedSetDigest(normalized) !== receipt.normalizedSetDigest) {
    fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_RECEIPT_INVALID');
  }
  const canonicalReceipt = Object.freeze({
    schemaVersion: 1,
    profile: GENESIS_001_ADMITTED_PLAYER_CENSUS_PRIVATE_PROFILE,
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    databaseIdentity: GENESIS_001_DATABASE_IDENTITY,
    preparationSourceCommit: receipt.preparationSourceCommit,
    observedAt,
    collectionMethod: receipt.collectionMethod,
    beforeAggregate,
    afterAggregate,
    admittedPlayerCount: receipt.admittedPlayerCount,
    entries: normalized,
    normalizedSetDigest: receipt.normalizedSetDigest,
    rawEvidenceDigest: receipt.rawEvidenceDigest,
    nonceHex: receipt.nonceHex,
    opaqueProofDigest: receipt.opaqueProofDigest,
  });
  if (opaqueProofDigest(privateProof(canonicalReceipt)) !== receipt.opaqueProofDigest) {
    fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_RECEIPT_INVALID');
  }
  return canonicalReceipt;
}

export function serializeGenesis001AdmittedPlayerCensusPrivateReceipt(value) {
  const receipt = verifyGenesis001AdmittedPlayerCensusReceipt(value);
  return Buffer.from(`${JSON.stringify(receipt)}\n`, 'utf8');
}

export function projectGenesis001AdmittedPlayerCensusStablePair(value) {
  const pair = exactObject(
    value,
    ['first', 'second'],
    'GENESIS_001_ADMITTED_PLAYER_CENSUS_STABLE_PAIR_INVALID',
  );
  const first = verifyGenesis001AdmittedPlayerCensusReceipt(pair.first);
  const second = verifyGenesis001AdmittedPlayerCensusReceipt(pair.second);
  const separation = Date.parse(second.observedAt) - Date.parse(first.observedAt);
  if (
    separation < GENESIS_001_ADMITTED_PLAYER_CENSUS_MINIMUM_STABLE_SEPARATION_MS
    || separation > GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_STABLE_SEPARATION_MS
    || first.preparationSourceCommit !== second.preparationSourceCommit
    || first.databaseIdentity !== second.databaseIdentity
    || first.collectionMethod !== second.collectionMethod
    || first.admittedPlayerCount !== second.admittedPlayerCount
    || JSON.stringify(first.entries) !== JSON.stringify(second.entries)
    || first.normalizedSetDigest !== second.normalizedSetDigest
    || first.observedAt === second.observedAt
    || first.nonceHex === second.nonceHex
    || first.opaqueProofDigest === second.opaqueProofDigest
  ) fail('GENESIS_001_ADMITTED_PLAYER_CENSUS_STABLE_PAIR_INVALID');
  return Object.freeze({
    profile: GENESIS_001_ADMITTED_PLAYER_CENSUS_PUBLIC_PROFILE,
    opaqueProofDigest: second.opaqueProofDigest,
  });
}

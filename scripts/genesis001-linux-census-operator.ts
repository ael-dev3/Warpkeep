import { randomBytes } from 'node:crypto';
import { closeSync, fstatSync, mkdirSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { types } from 'node:util';
import { setGlobalLogLevel } from 'spacetimedb';
import type { DbConnection } from '../src/spacetime/module_bindings';
import { collectAccessRequestCensus, GENESIS_001_ADMISSION_FREEZE_ATTESTATION_DIGEST,
  projectAccessRequestResetStatus, writeAccessRequestCensusExport } from './hermes-admin';
import { collectGenesis001AdmittedPlayerCensus, Genesis001AdmittedPlayerCensusError,
  GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_SQL,
  GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_PROCEDURE,
  GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_ROWS,
  GENESIS_001_ADMITTED_PLAYER_CENSUS_PREFERRED_SQL } from './genesis001-admitted-player-census.mjs';
import { executeGenesis001CensusPrivacySafeReceipt } from './genesis001-census-privacy-safe-receipt.mjs';
import { GENESIS_001_DATABASE_IDENTITY, GENESIS_001_LIVE_POLICY_OBSERVATION_PROFILE,
  genesis001PolicyReceiptDigest } from './genesis001-sealed-launch-adoption.mjs';
import { createGreaterRealmAdminTransportSession, GREATER_REALM_PRODUCTION_TRANSPORT_TARGET,
  GreaterRealmProductionTransportError, readGreaterRealmProductionAdminSecret }
  from './greater-realm-production-transport';
import { withOperationTimeout } from './production-admin-connection';
import { parseWorkflowEvidenceJson } from './sealed-realms-production-workflow-evidence-json.mjs';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { attestPolicySource, G001_POLICY_ROOT, policyPrivateAncestors } from './genesis001-linux-policy-boundary.mjs';
import { createGenesis001LinuxCensusSample, validateGenesis001LinuxCensusPair,
  retainGenesis001LinuxCensusRecord } from './genesis001-linux-census-attempt.mjs';

const CENSUS_DIAGNOSTICS = new Set([
  'g001-admitted-identity', 'g001-admitted-aggregate', 'g001-admitted-enumeration',
  'g001-admitted-aggregate-empty', 'g001-admitted-aggregate-disabled',
  'g001-admitted-aggregate-invalid', 'g001-admitted-aggregate-mismatch',
  'g001-admitted-status', 'g001-admitted-reconciliation', 'g001-census-cross-proof',
  'g001-census-directory', 'g001-applicant-collection', 'g001-applicant-export', 'g001-applicant-proof',
  'g001-admitted-collection', 'g001-session-finalize',
]);
const CENSUS_STAGE_DIAGNOSTICS = Object.freeze({
  'sample-directory': 'g001-census-directory',
  'applicant-collection': 'g001-applicant-collection',
  'applicant-export': 'g001-applicant-export',
  'applicant-proof': 'g001-applicant-proof',
  'admitted-collection': 'g001-admitted-collection',
  'sample-reconciliation': 'g001-census-cross-proof',
  'session-finalize': 'g001-session-finalize',
});
const OWN_CENSUS_FAILURES = new WeakSet<Error>();
function existingCensusDiagnostic(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object' || types.isProxy(error)
    || !(error instanceof Error) || !OWN_CENSUS_FAILURES.has(error)) return undefined;
  try {
    const field = Object.getOwnPropertyDescriptor(error, 'diagnostic');
    return field !== undefined && 'value' in field && typeof field.value === 'string'
      && CENSUS_DIAGNOSTICS.has(field.value) ? field.value : undefined;
  } catch { return undefined; }
}
/** Projects only fixed stage names and previously admitted census diagnostics. */
export function projectGenesis001LinuxCensusStageDiagnostic(error: unknown, stage: string): string | undefined {
  const existing = existingCensusDiagnostic(error);
  if (existing !== undefined) return existing;
  return Object.hasOwn(CENSUS_STAGE_DIAGNOSTICS, stage)
    ? CENSUS_STAGE_DIAGNOSTICS[stage as keyof typeof CENSUS_STAGE_DIAGNOSTICS] : undefined;
}
function fail(diagnostic?: string): never {
  const error = Error('G001_LINUX_CENSUS_COLLECTION_FAILED');
  OWN_CENSUS_FAILURES.add(error);
  if (diagnostic !== undefined && CENSUS_DIAGNOSTICS.has(diagnostic)) {
    Object.defineProperty(error, 'diagnostic', { value: diagnostic, enumerable: false });
  }
  throw error;
}
const MAX_SQL_BYTES = 128 * 1024;
const SQL_URL = `${GREATER_REALM_PRODUCTION_TRANSPORT_TARGET.uri}/v1/database/${GENESIS_001_DATABASE_IDENTITY}/sql?confirmed=true`;
const COMMIT = /^[a-f0-9]{40}$/u, ID = /^[1-9][0-9]{0,19}$/u;

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) fail();
  return value as Record<string, unknown>;
}
function stamp(now: () => Date): string {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail();
  return value.toISOString();
}

/** The fixed SQL response becomes canonical collector bytes only after its
 * entire schema, zero-write statistics and every lossless FID are checked. */
export function parseGenesis001LinuxCensusFidSql(bytes: Uint8Array): Uint8Array {
  if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > MAX_SQL_BYTES) fail();
  // Reuse the existing bounded duplicate-key/lossless JSON parser. Wrapping the
  // one SQL statement avoids its REST-object root restriction; no GitHub ID
  // projection path occurs below the fixed sql member.
  const parsed = parseWorkflowEvidenceJson(Buffer.concat([Buffer.from('{"sql":'), bytes, Buffer.from('}')])).sql;
  if (!Array.isArray(parsed) || parsed.length !== 1) fail();
  const statement = exact(parsed[0], ['schema', 'rows', 'total_duration_micros', 'stats']);
  const stats = exact(statement.stats, ['rows_inserted', 'rows_deleted', 'rows_updated']);
  if (Object.values(stats).some(value => value !== 0)
    || !Number.isSafeInteger(statement.total_duration_micros) || (statement.total_duration_micros as number) < 0) fail();
  const schema = exact(statement.schema, ['elements']);
  if (!Array.isArray(schema.elements) || schema.elements.length !== 1) fail();
  const column = exact(schema.elements[0], ['name', 'algebraic_type']);
  if (exact(column.name, ['some']).some !== 'fid') fail();
  const type = exact(column.algebraic_type, ['U64']).U64;
  if (!Array.isArray(type) || type.length !== 0 || !Array.isArray(statement.rows)
    || statement.rows.length < 1 || statement.rows.length > 4096) fail();
  const fids = statement.rows.map(row => {
    if (!Array.isArray(row) || row.length !== 1 || typeof row[0] !== 'number'
      || !Number.isSafeInteger(row[0]) || row[0] < 1) fail();
    return String(row[0]);
  });
  if (new Set(fids).size !== fids.length) fail();
  return Buffer.from(`fid\n${fids.join('\n')}\n`);
}

function identity(connection: DbConnection): string {
  const value = connection.identity?.toHexString();
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)
    || typeof connection.token !== 'string' || connection.token.length < 1
    || connection.token.length > 16384 || connection.isDisconnectRequested) fail();
  return value;
}

async function fixedFidQuery(connection: DbConnection, fetcher: typeof fetch): Promise<Uint8Array> {
  const before = identity(connection), token = connection.token!;
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let response: Response | undefined;
  const chunks: Uint8Array[] = [];
  try {
    response = await fetcher(SQL_URL, { method: 'POST', headers: {
      authorization: `Bearer ${token}`, 'content-type': 'text/plain; charset=utf-8',
      accept: 'application/json', 'cache-control': 'no-store',
    }, body: GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_SQL, redirect: 'error',
    credentials: 'omit', signal: controller.signal });
    if (controller.signal.aborted || response.url !== SQL_URL || response.status !== 200
      || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(response.headers.get('content-type') ?? '')
      || (response.headers.has('content-length') && (!/^[0-9]+$/u.test(response.headers.get('content-length')!)
        || Number(response.headers.get('content-length')) > MAX_SQL_BYTES)) || !response.body) fail();
    reader = response.body.getReader();
    let count = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      count += next.value.byteLength;
      if (count > MAX_SQL_BYTES) fail();
      chunks.push(next.value);
    }
    if (controller.signal.aborted || identity(connection) !== before || connection.token !== token) fail();
    const bytes = Buffer.concat(chunks);
    try { return parseGenesis001LinuxCensusFidSql(bytes); } finally { bytes.fill(0); }
  } finally {
    clearTimeout(timeout); controller.abort();
    try { await reader?.cancel(); } catch { /* Preserve the original failure. */ }
    if (reader === undefined) { try { await response?.body?.cancel(); } catch { /* Already aborted. */ } }
    reader?.releaseLock();
    for (const chunk of chunks) chunk.fill(0);
  }
}

/** This adapter intentionally has no owner SQL credential. The SDK's fixed
 * administrator transport does not expose private-table one-off queries.
 * Unsupported is a capability decision after successful authenticated reads,
 * never a classification of an authentication, network or parsing failure. */
export async function collectGenesis001LinuxAdmittedCensus(connection: DbConnection,
  sourceCommit: string, observedAt: string, fetcher: typeof fetch = fetch) {
  let caller: string;
  try { caller = identity(connection); } catch { fail('g001-admitted-identity'); }
  try {
    const result = await collectGenesis001AdmittedPlayerCensus({ preparationSourceCommit: sourceCommit, observedAt,
    readAggregates: async () => {
      try {
        const status = await withOperationTimeout(connection.procedures.adminGetAlphaStatusV3({}));
        if (identity(connection) !== caller || typeof status.allowedFids !== 'bigint'
          || typeof status.enabledAllowedFids !== 'bigint') fail('g001-admitted-aggregate');
        // Reveal only the fixed state class; never project either live count.
        if (status.allowedFids === 0n && status.enabledAllowedFids === 0n) fail('g001-admitted-aggregate-empty');
        if (status.allowedFids > 0n && status.allowedFids <= BigInt(GENESIS_001_ADMITTED_PLAYER_CENSUS_MAXIMUM_ROWS)
          && status.enabledAllowedFids >= 0n && status.enabledAllowedFids < status.allowedFids) {
          fail('g001-admitted-aggregate-disabled');
        }
        return { allowedFids: status.allowedFids.toString(), enabledAllowedFids: status.enabledAllowedFids.toString() };
      } catch (error) {
        if (existingCensusDiagnostic(error) !== undefined) throw error;
        fail('g001-admitted-aggregate');
      }
    },
    queryPreferred: async sql => {
      if (sql !== GENESIS_001_ADMITTED_PLAYER_CENSUS_PREFERRED_SQL || identity(connection) !== caller) fail();
      return { outcome: 'unsupported-exact-query' };
    },
    queryFallbackFids: async sql => {
      if (sql !== GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_SQL) fail('g001-admitted-enumeration');
      try { return await fixedFidQuery(connection, fetcher); }
      catch (error) {
        if (existingCensusDiagnostic(error) !== undefined) throw error;
        fail('g001-admitted-enumeration');
      }
    },
    readAdmissionStatus: async (procedure, fid) => {
      if (procedure !== GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_PROCEDURE) fail('g001-admitted-status');
      try {
        const status = projectAccessRequestResetStatus(await withOperationTimeout(
          connection.procedures.adminGetAccessRequestResetStatusV1({ fid: BigInt(fid) })));
        if (identity(connection) !== caller) fail('g001-admitted-identity');
        return status;
      } catch (error) {
        if (existingCensusDiagnostic(error) !== undefined) throw error;
        fail('g001-admitted-status');
      }
    }, randomBytes,
    });
    if (identity(connection) !== caller) fail('g001-admitted-identity');
    return result;
  } catch (error) {
    if (existingCensusDiagnostic(error) !== undefined) throw error;
    // Match only exact collector codes; provider exception text is untrusted.
    const code = error instanceof Genesis001AdmittedPlayerCensusError ? error.code : undefined;
    if (code === 'GENESIS_001_ADMITTED_PLAYER_CENSUS_AGGREGATE_INVALID') fail('g001-admitted-aggregate-invalid');
    if (code === 'GENESIS_001_ADMITTED_PLAYER_CENSUS_AGGREGATE_MISMATCH') fail('g001-admitted-aggregate-mismatch');
    if (code === 'GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_STATUS_INVALID'
      || code === 'GENESIS_001_ADMITTED_PLAYER_CENSUS_FALLBACK_ADMISSION_INVALID') fail('g001-admitted-status');
    fail('g001-admitted-reconciliation');
  }
}

/** Keep a failed cross-domain sample check actionable without exposing either
 * private receipt. The public diagnostic names only the cross-proof gate. */
export function reconcileGenesis001LinuxCensusSample(input: { applicant: unknown; admitted: unknown },
  sourceCommit: string) {
  try { return createGenesis001LinuxCensusSample(input, sourceCommit); }
  catch { fail('g001-census-cross-proof'); }
}

type Session = ReturnType<typeof createGreaterRealmAdminTransportSession>;
type Scope = Readonly<{ sourceCommit: string; repositoryRoot: string; attemptId: string;
  githubRunId: string; githubRunAttempt: string }>;
type Dependencies = Readonly<{ now: () => Date; wait: (ms: number) => Promise<void>;
  createSession: (secret: string) => Session; attest: (root: string) => string;
  collectSample: (session: Session, scope: Scope, sample: 'first' | 'second') => Promise<any>;
  retainSample: (scope: Scope, sample: 'first' | 'second', value: unknown) => void }>;

/** Preserve only census diagnostics already reduced to the fixed allowlist.
 * The transport still invalidates the failed connection before rethrowing this
 * generic boundary error, while callers retain the safe stage discriminator. */
export async function withGenesis001LinuxCensusConnection<T>(
  session: Session,
  operation: (connection: DbConnection) => Promise<T>,
): Promise<T> {
  return session.withConnection(async connection => {
    try { return await operation(connection); }
    catch (error) {
      const diagnostic = existingCensusDiagnostic(error);
      if (diagnostic === undefined) throw error;
      const boundary = new GreaterRealmProductionTransportError('G001_LINUX_CENSUS_COLLECTION_FAILED');
      Object.defineProperty(boundary, 'diagnostic', { value: diagnostic, enumerable: false });
      OWN_CENSUS_FAILURES.add(boundary);
      throw boundary;
    }
  });
}

async function sample(session: Session, scope: Scope, kind: 'first' | 'second') {
  const directory = join(G001_POLICY_ROOT, 'attempts', scope.attemptId, kind);
  let stage = 'sample-directory';
  try {
    policyPrivateAncestors(join(G001_POLICY_ROOT, 'attempts', scope.attemptId));
    mkdirSync(directory, { mode: 0o700 }); policyPrivateAncestors(directory);
    stage = 'applicant-collection';
    return await withGenesis001LinuxCensusConnection(session, async connection => {
      let callerIdentity: string;
      try { callerIdentity = identity(connection); } catch { fail('g001-admitted-identity'); }
      const census = await collectAccessRequestCensus(connection, GENESIS_001_ADMISSION_FREEZE_ATTESTATION_DIGEST);
      stage = 'applicant-export';
      const exported = writeAccessRequestCensusExport({ censusDirectory: directory, referenceDirectory: directory,
        census, at: new Date() });
      stage = 'applicant-proof';
      const proof = executeGenesis001CensusPrivacySafeReceipt({ sourceCommit: scope.sourceCommit,
        censusPath: join(directory, exported.privateCensusBasename),
        exporterReceiptPath: join(directory, exported.privateExporterReferenceBasename), privateReceiptDirectory: directory });
      const bytes = readLocalBindingBoundedFile(join(directory, proof.privateReceiptBasename), {
        maximumBytes: 8192, expectedUid: 1000, expectedMode: 0o600 }).body;
      let applicant;
      try { applicant = JSON.parse(bytes.toString('utf8')); } finally { bytes.fill(0); }
      stage = 'admitted-collection';
      const admitted = await collectGenesis001LinuxAdmittedCensus(connection, scope.sourceCommit, new Date().toISOString());
      if (identity(connection) !== callerIdentity) fail('g001-admitted-identity');
      stage = 'sample-reconciliation';
      const record = reconcileGenesis001LinuxCensusSample({ applicant, admitted }, scope.sourceCommit);
      stage = 'session-finalize';
      return { callerIdentity, record };
    });
  } catch (error) {
    const diagnostic = projectGenesis001LinuxCensusStageDiagnostic(error, stage);
    if (diagnostic !== undefined) fail(diagnostic);
    throw error;
  }
}

const production: Dependencies = Object.freeze({ now: () => new Date(), wait: async ms => { await delay(ms); },
  createSession: adminSecret => createGreaterRealmAdminTransportSession({ adminSecret, readOnly: true }),
  // The protected workflow checks out the selected main commit in detached
  // state. Recheck that exact fixed Linux source, including origin/main and
  // this census operator, without requiring a local branch named main.
  attest: root => attestPolicySource(undefined, root, 'census').sourceCommit, collectSample: sample,
  retainSample: (scope, kind, value) => retainGenesis001LinuxCensusRecord(
    join(G001_POLICY_ROOT, 'attempts', scope.attemptId), `${kind}.json`, value),
});

async function collect(scope: Scope, secret: string, dependencies: Dependencies) {
  if (dependencies.attest(scope.repositoryRoot) !== scope.sourceCommit) fail();
  const session = dependencies.createSession(secret);
  secret = '';
  const observe = async () => {
    const policy = await session.inspect('genesis_001_access_policy_v1');
    const policyReceiptDigest = genesis001PolicyReceiptDigest(policy);
    return Object.freeze({ schemaVersion: 1, profile: GENESIS_001_LIVE_POLICY_OBSERVATION_PROFILE,
      sourceCommit: scope.sourceCommit, observedAt: stamp(dependencies.now), databaseIdentity: GENESIS_001_DATABASE_IDENTITY,
      procedure: 'genesis_001_access_policy_v1', mutationSubmitted: false, policy, policyReceiptDigest });
  };
  try {
    await session.invalidate();
    const initialPolicyObservation = await observe();
    // The existing applicant filename records whole seconds. Let that clock
    // boundary pass so it cannot appear to precede the initial live policy.
    await dependencies.wait(1000);
    const first = await dependencies.collectSample(session, scope, 'first');
    dependencies.retainSample(scope, 'first', first.record);
    // Wait from completed collection, then independently enforce all actual
    // timestamps. Scheduler delays never widen the original stability window.
    await dependencies.wait(60000);
    await session.invalidate();
    await observe();
    const second = await dependencies.collectSample(session, scope, 'second');
    if (first.callerIdentity !== second.callerIdentity) fail('g001-admitted-identity');
    validateGenesis001LinuxCensusPair(first.record, second.record, scope.sourceCommit);
    dependencies.retainSample(scope, 'second', second.record);
    const consumedAt = stamp(dependencies.now);
    const confirmationPolicyObservation = await observe();
    await dependencies.wait(1);
    const currentPolicyObservation = await observe();
    if (dependencies.attest(scope.repositoryRoot) !== scope.sourceCommit) fail();
    return Object.freeze({ schemaVersion: 1, profile: 'warpkeep-g001-linux-census-collected-v1',
      ...scope, callerIdentity: first.callerIdentity, mutationSubmitted: false,
      initialPolicyObservation, first: first.record, second: second.record, consumedAt,
      confirmationPolicyObservation, currentPolicyObservation });
  } finally { await session.close(); }
}

function scopeInput(input: Scope): void {
  if (!COMMIT.test(input.sourceCommit) || !/^[a-f0-9]{32}$/u.test(input.attemptId)
    || !ID.test(input.githubRunId) || !ID.test(input.githubRunAttempt)
    || !isAbsolute(input.repositoryRoot) || resolve(input.repositoryRoot) !== input.repositoryRoot) fail();
}

/** Tests exercise the real collectors and sequencing with explicit synthetic
 * transport dependencies; production never accepts injected authority. */
export async function executeGenesis001LinuxCensusForTesting(input: Scope, secret: string, dependencies: Dependencies) {
  if (process.env.NODE_ENV !== 'test') fail();
  scopeInput(input);
  return collect(input, secret, dependencies);
}

export async function executeGenesis001LinuxCensusFromDescriptor(input: Scope & { descriptor: 4 }) {
  exact(input, ['sourceCommit', 'repositoryRoot', 'attemptId', 'githubRunId', 'githubRunAttempt', 'descriptor']);
  scopeInput(input);
  if (input.descriptor !== 4) fail();
  let closed = false, secret = '';
  const close = () => { if (!closed) { closed = true; closeSync(4); } };
  try {
    if (process.platform !== 'linux' || process.getuid?.() !== 1000) fail();
    setGlobalLogLevel('error');
    const before = fstatSync(4, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.uid !== 1000n || before.gid !== 1000n
      || (before.mode & 0o7777n) !== 0o600n || before.size < 32n || before.size > 514n) fail();
    secret = readGreaterRealmProductionAdminSecret({ WARPKEEP_ADMIN_TOKEN_SECRET_FD: '3' }, 4);
    const after = fstatSync(4, { bigint: true });
    if (['dev', 'ino', 'uid', 'gid', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
      .some(key => before[key as keyof typeof before] !== after[key as keyof typeof after])) fail();
    close();
    const { descriptor: _descriptor, ...scope } = input;
    return await collect(scope, secret, production);
  } finally { secret = ''; close(); }
}

// @vitest-environment node
import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
const descriptorFixture = vi.hoisted(() => ({ active: false, source: 'a'.repeat(40),
  sourceFailure: false, calls: [] as string[] }));
vi.mock('node:fs', async original => {
  const actual = await original<typeof import('node:fs')>();
  return { ...actual,
    fstatSync: (fd: number, options: any) => descriptorFixture.active && fd === 4
      ? { isFile: () => true, nlink: 1n, uid: 1000n, gid: 1000n, mode: 0o100600n, size: 40n,
        dev: 1n, ino: 2n, mtimeNs: 3n, ctimeNs: 4n }
      : actual.fstatSync(fd, options),
    closeSync: (fd: number) => {
      if (descriptorFixture.active && fd === 4) descriptorFixture.calls.push('close-descriptor');
      else actual.closeSync(fd);
    },
  };
});
vi.mock('../scripts/genesis001-linux-policy-boundary.mjs', async original => ({
  ...await original<object>(),
  attestPolicySource: (expected: unknown, root: string, kind: string) => {
    expect(expected).toBeUndefined(); expect(root).toBe(process.cwd()); expect(kind).toBe('census');
    descriptorFixture.calls.push('attest-fixed-source');
    if (descriptorFixture.sourceFailure) throw Error('fixed source changed');
    return { sourceCommit: descriptorFixture.source };
  },
}));
vi.mock('../scripts/greater-realm-production-transport', async original => {
  const actual = await original<typeof import('../scripts/greater-realm-production-transport')>();
  return { ...actual,
    readGreaterRealmProductionAdminSecret: (...args: Parameters<typeof actual.readGreaterRealmProductionAdminSecret>) => {
      if (!descriptorFixture.active) return actual.readGreaterRealmProductionAdminSecret(...args);
      expect(args).toEqual([{ WARPKEEP_ADMIN_TOKEN_SECRET_FD: '3' }, 4]);
      descriptorFixture.calls.push('read-descriptor'); return 's'.repeat(40);
    },
    createGreaterRealmAdminTransportSession: (...args: Parameters<typeof actual.createGreaterRealmAdminTransportSession>) => {
      if (!descriptorFixture.active) return actual.createGreaterRealmAdminTransportSession(...args);
      expect(args).toEqual([{ adminSecret: 's'.repeat(40) }]); descriptorFixture.calls.push('create-session');
      return { invalidate: async () => {},
        inspect: async () => { descriptorFixture.calls.push('observe'); throw Error('synthetic transport boundary'); },
        close: async () => { descriptorFixture.calls.push('close-session'); } };
    },
  };
});
import { collectGenesis001LinuxAdmittedCensus, executeGenesis001LinuxCensusForTesting,
  executeGenesis001LinuxCensusFromDescriptor, parseGenesis001LinuxCensusFidSql,
  projectGenesis001LinuxCensusStageDiagnostic, reconcileGenesis001LinuxCensusSample } from '../scripts/genesis001-linux-census-operator';
import { collectGenesis001AdmittedPlayerCensus } from '../scripts/genesis001-admitted-player-census.mjs';
import { createGenesis001LinuxCensusSample } from '../scripts/genesis001-linux-census-attempt.mjs';
import { GENESIS_001_DATABASE_IDENTITY, GENESIS_001_FREEZE_RELEASE_NONCE, GENESIS_001_SOURCE_BASELINE_COMMIT,
  genesis001CensusOpaqueProofDigest } from '../scripts/genesis001-sealed-launch-adoption.mjs';

const SOURCE = 'a'.repeat(40), CALLER = '8'.repeat(64);
it.each([
  ['sample-directory', 'g001-census-directory'],
  ['applicant-collection', 'g001-applicant-collection'], ['applicant-export', 'g001-applicant-export'],
  ['applicant-proof', 'g001-applicant-proof'], ['admitted-collection', 'g001-admitted-collection'],
  ['session-finalize', 'g001-session-finalize'],
])('projects an untyped census error at the fixed %s stage', (stage, expected) => {
  const sentinel = 'PRIVATE_APPLICANT_OR_PROVIDER_DETAIL';
  expect(projectGenesis001LinuxCensusStageDiagnostic(Error(sentinel), stage)).toBe(expected);
  expect(expected).not.toContain(sentinel);
});
it('preserves existing fixed diagnostics and ignores arbitrary stages and error getters', () => {
  expect(projectGenesis001LinuxCensusStageDiagnostic(Object.assign(Error('private'), {
    diagnostic: 'g001-admitted-enumeration',
  }), 'applicant-proof')).toBe('g001-admitted-enumeration');
  expect(projectGenesis001LinuxCensusStageDiagnostic(Error('private'), 'unknown')).toBeUndefined();
  const error = Object.defineProperty({}, 'diagnostic', { get: () => { throw Error('private'); } });
  expect(projectGenesis001LinuxCensusStageDiagnostic(error, 'admitted-collection')).toBe('g001-admitted-collection');
});
const SQL_URL = `https://maincloud.spacetimedb.com/v1/database/${GENESIS_001_DATABASE_IDENTITY}/sql?confirmed=true`;
it.each(['accepted', 'rejected', 'mismatched'])('checks fixed source before descriptor census transport: %s', async sourceState => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const uid = Object.getOwnPropertyDescriptor(process, 'getuid');
  descriptorFixture.active = true; descriptorFixture.sourceFailure = sourceState === 'rejected'; descriptorFixture.calls = [];
  descriptorFixture.source = sourceState === 'mismatched' ? 'b'.repeat(40) : SOURCE;
  Object.defineProperty(process, 'platform', { ...platform, value: 'linux' });
  Object.defineProperty(process, 'getuid', { configurable: true, value: () => 1000 });
  try {
    await expect(executeGenesis001LinuxCensusFromDescriptor({ sourceCommit: SOURCE, repositoryRoot: process.cwd(),
      attemptId: '1'.repeat(32), githubRunId: '1234', githubRunAttempt: '1', descriptor: 4 }))
      .rejects.toThrow(sourceState === 'rejected' ? 'fixed source changed'
        : sourceState === 'mismatched' ? 'G001_LINUX_CENSUS_COLLECTION_FAILED' : 'synthetic transport boundary');
    expect(descriptorFixture.calls).toEqual(['read-descriptor', 'close-descriptor', 'attest-fixed-source',
      ...(sourceState === 'accepted' ? ['create-session', 'observe', 'close-session'] : [])]);
  } finally {
    descriptorFixture.active = false;
    Object.defineProperty(process, 'platform', platform);
    if (uid) Object.defineProperty(process, 'getuid', uid); else Reflect.deleteProperty(process, 'getuid');
  }
});
function sql(rows: unknown[] = [[17]]) {
  return [{ schema: { elements: [{ name: { some: 'fid' }, algebraic_type: { U64: [] } }] },
    rows, total_duration_micros: 5, stats: { rows_inserted: 0, rows_deleted: 0, rows_updated: 0 } }];
}
function response(body = JSON.stringify(sql()), status = 200) {
  const value = new Response(body, { status, headers: { 'content-type': 'application/json' } });
  Object.defineProperty(value, 'url', { value: SQL_URL, configurable: true });
  return value;
}
function connection() {
  return { identity: { toHexString: () => CALLER }, token: 'synthetic-admin-jwt', isDisconnectRequested: false,
    procedures: {
      adminGetAlphaStatusV3: vi.fn(async () => ({ allowedFids: 1n, enabledAllowedFids: 1n })),
      adminGetAccessRequestAdmissionStatusV1: vi.fn(async () => ({ admissionState: 'enabled', authEpoch: 1,
        requestState: 'not_requested', requestCycle: undefined, requestedAtMicros: undefined })),
    }, reducers: new Proxy({}, { get() { throw Error('no reducer may be read'); } }) };
}
it('uses only exact public SQL with the authenticated connection JWT and authoritative per-FID procedures', async () => {
  const db = connection(), fetcher = vi.fn(async () => response());
  const result = await collectGenesis001LinuxAdmittedCensus(db as never, SOURCE, '2026-09-19T00:00:00.000Z', fetcher as never);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]).toEqual([SQL_URL, expect.objectContaining({ method: 'POST', body: 'SELECT fid FROM player_v2',
    redirect: 'error', credentials: 'omit', headers: expect.objectContaining({ authorization: 'Bearer synthetic-admin-jwt' }) })]);
  expect(db.procedures.adminGetAlphaStatusV3).toHaveBeenCalledTimes(2);
  expect(db.procedures.adminGetAccessRequestAdmissionStatusV1).toHaveBeenCalledExactlyOnceWith({ fid: 17n });
  expect(result.collectionMethod).toBe('fallback-player-v2-status-v1');
  expect(result.entries).toEqual([{ fid: '17', authEpoch: '1' }]);
});
it.each(['authentication', 'network', 'schema', 'redirect', 'identity', 'token'] as const)(
  'does not reinterpret %s failure as unsupported or retry another query', async failure => {
    const db = connection();
    const fetcher = vi.fn(async () => {
      if (failure === 'network') throw Error('network unavailable');
      if (failure === 'identity') db.identity.toHexString = () => '9'.repeat(64);
      if (failure === 'token') db.token = 'changed-token';
      if (failure === 'redirect') {
        const changed = response(); Object.defineProperty(changed, 'url', { value: 'https://other.invalid/sql' }); return changed;
      }
      return response(failure === 'schema' ? '{}' : JSON.stringify(sql()), failure === 'authentication' ? 401 : 200);
    });
    await expect(collectGenesis001LinuxAdmittedCensus(db as never, SOURCE, '2026-09-19T00:00:00.000Z', fetcher as never))
      .rejects.toMatchObject({ diagnostic: 'g001-admitted-enumeration' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(db.procedures.adminGetAccessRequestAdmissionStatusV1).not.toHaveBeenCalled();
  });
it('requires successful administrator aggregate authentication before querying any table', async () => {
  const db = connection(), fetcher = vi.fn();
  db.procedures.adminGetAlphaStatusV3.mockRejectedValueOnce(Error('not administrator'));
  await expect(collectGenesis001LinuxAdmittedCensus(db as never, SOURCE, '2026-09-19T00:00:00.000Z', fetcher))
    .rejects.toMatchObject({ diagnostic: 'g001-admitted-aggregate' });
  expect(fetcher).not.toHaveBeenCalled();
});
it('reports a safe reconciliation diagnostic for invalid cross-domain samples', async () => {
  const admitted = await collectGenesis001AdmittedPlayerCensus({ preparationSourceCommit: SOURCE,
    observedAt: '2026-09-19T00:00:00.000Z',
    readAggregates: () => ({ allowedFids: '1', enabledAllowedFids: '1' }),
    queryPreferred: () => ({ outcome: 'exact-query-supported', output: Buffer.from('fid\tenabled\tauth_epoch\n17\ttrue\t1\n') }),
    randomBytes: () => Buffer.alloc(32, 0x31) });
  const proof = { schemaVersion: 1, profile: 'warpkeep-genesis-001-census-export-private-proof-v1',
    realmId: 'GENESIS_001', releaseVersion: '0.3.43', sourceCommit: SOURCE,
    privateCensusReference: { count: 0, size: 7, sha256: createHash('sha256').update('private').digest('hex'),
      pathBasename: 'warpkeep-access-request-census-20260919T000000Z.txt' },
    privateBlindingNonceHex: admitted.nonceHex };
  const applicant = { ...proof, opaqueProofDigest: genesis001CensusOpaqueProofDigest(proof) };
  expect(() => reconcileGenesis001LinuxCensusSample({ applicant, admitted }, SOURCE))
    .toThrow(expect.objectContaining({ message: 'G001_LINUX_CENSUS_COLLECTION_FAILED',
      diagnostic: 'g001-admitted-reconciliation' }));
});
it.each(['missing', 'disabled', 'count-change', 'status-error'] as const)('rejects incomplete admission evidence: %s', async mode => {
  const db = connection();
  if (mode === 'missing' || mode === 'disabled') db.procedures.adminGetAccessRequestAdmissionStatusV1.mockResolvedValueOnce({
    admissionState: mode, authEpoch: mode === 'missing' ? 0 : 1, requestState: 'not_requested', requestCycle: undefined, requestedAtMicros: undefined });
  if (mode === 'count-change') db.procedures.adminGetAlphaStatusV3.mockResolvedValueOnce({ allowedFids: 1n, enabledAllowedFids: 1n })
    .mockResolvedValueOnce({ allowedFids: 2n, enabledAllowedFids: 2n });
  if (mode === 'status-error') db.procedures.adminGetAccessRequestAdmissionStatusV1.mockRejectedValueOnce(Error('status failed'));
  await expect(collectGenesis001LinuxAdmittedCensus(db as never, SOURCE, '2026-09-19T00:00:00.000Z', vi.fn(async () => response()) as never))
    .rejects.toMatchObject({ diagnostic: mode === 'count-change' ? 'g001-admitted-reconciliation' :
      mode === 'status-error' || mode === 'missing' || mode === 'disabled' ? 'g001-admitted-status' : 'g001-admitted-reconciliation' });
});
it('validates exact SQL schema, duplicate keys, safe FIDs and zero mutation statistics', () => {
  expect(Buffer.from(parseGenesis001LinuxCensusFidSql(Buffer.from(JSON.stringify(sql([[9007199254740991], [17]]))))).toString())
    .toBe('fid\n9007199254740991\n17\n');
  const bad = [sql([]), sql([[0]]), sql([[17], [17]]), sql([['17']]), sql([[9007199254740992]]), sql([[17, 18]])];
  const wrongName: any = sql(); wrongName[0].schema.elements[0].name.some = 'auth_epoch'; bad.push(wrongName);
  const write = sql(); write[0].stats.rows_updated = 1; bad.push(write);
  for (const value of bad) expect(() => parseGenesis001LinuxCensusFidSql(Buffer.from(JSON.stringify(value)))).toThrow();
  expect(() => parseGenesis001LinuxCensusFidSql(Buffer.from(JSON.stringify(sql()).replace('"rows":', '"rows":[],"rows":')))).toThrow();
});

const policy = { realmId: 'GENESIS_001', releaseVersion: '0.3.43', playerAccessEnabled: true,
  admissionStateMutationsEnabled: false, accessRequestSubmissionsEnabled: false,
  sourceBaselineCommit: GENESIS_001_SOURCE_BASELINE_COMMIT, freezeReleaseNonce: GENESIS_001_FREEZE_RELEASE_NONCE };
async function sequence(mode = '') {
  let now = Date.parse('2026-09-19T00:00:00.000Z'), calls = 0;
  const retained: string[] = [];
  const inspect = vi.fn(async () => ({ ...policy }));
  if (mode === 'policy') inspect.mockResolvedValueOnce({ ...policy, playerAccessEnabled: false });
  const session = { invalidate: vi.fn(async () => {}), inspect, close: vi.fn(async () => {}) };
  const dependencies = { now: () => new Date(now), wait: vi.fn(async (ms: number) => { now += mode === 'late' && ms === 60000 ? 301000 : ms; }),
    createSession: () => session, attest: () => SOURCE,
    collectSample: async (_session: unknown, _scope: unknown, kind: string) => {
      const nonce = ++calls * 2, at = new Date(now).toISOString();
      const admitted = await collectGenesis001AdmittedPlayerCensus({ preparationSourceCommit: SOURCE, observedAt: at,
        readAggregates: () => ({ allowedFids: '1', enabledAllowedFids: '1' }), queryPreferred: () => ({ outcome: 'exact-query-supported',
          output: Buffer.from(`fid\tenabled\tauth_epoch\n${mode === 'unstable' && kind === 'second' ? '18' : '17'}\ttrue\t1\n`) }),
        randomBytes: () => Buffer.alloc(32, nonce + 1) });
      const proof = { schemaVersion: 1, profile: 'warpkeep-genesis-001-census-export-private-proof-v1', realmId: 'GENESIS_001',
        releaseVersion: '0.3.43', sourceCommit: SOURCE, privateCensusReference: { count: 0, size: 7,
          sha256: createHash('sha256').update('private').digest('hex'), pathBasename: `warpkeep-access-request-census-${at.replace(/[-:]/gu, '').replace('.000', '')}.txt` },
        privateBlindingNonceHex: Buffer.alloc(32, nonce).toString('hex') };
      return { callerIdentity: mode === 'caller' && kind === 'second' ? '9'.repeat(64) : CALLER,
        record: createGenesis001LinuxCensusSample({ applicant: { ...proof, opaqueProofDigest: genesis001CensusOpaqueProofDigest(proof) }, admitted }, SOURCE) };
    }, retainSample: (_scope: unknown, kind: string) => { retained.push(kind); } };
  const running = executeGenesis001LinuxCensusForTesting({ sourceCommit: SOURCE, repositoryRoot: process.cwd(), attemptId: '1'.repeat(32),
    githubRunId: '1234', githubRunAttempt: '1' }, 'synthetic-private-secret', dependencies as never);
  return { running, session, dependencies, retained };
}
it('collects one two-pass attempt with independent fresh policy reads, original timing and no suspension call', async () => {
  const test = await sequence();
  const result = await test.running;
  expect(test.retained).toEqual(['first', 'second']);
  expect(test.dependencies.wait.mock.calls).toEqual([[1000], [60000], [1]]);
  expect(test.session.inspect).toHaveBeenCalledTimes(4);
  expect(test.session.close).toHaveBeenCalledTimes(1);
  expect(result.currentPolicyObservation.observedAt > result.confirmationPolicyObservation.observedAt).toBe(true);
  expect(result.mutationSubmitted).toBe(false);
});
it.each(['late', 'unstable', 'caller', 'policy'])('keeps incomplete evidence unselected and closes the session after %s', async mode => {
  const test = await sequence(mode);
  if (mode === 'caller') await expect(test.running).rejects.toMatchObject({ message: 'G001_LINUX_CENSUS_COLLECTION_FAILED',
    diagnostic: 'g001-admitted-identity' });
  else await expect(test.running).rejects.toThrow();
  expect(test.retained).toEqual(mode === 'policy' ? [] : ['first']);
  expect(test.session.close).toHaveBeenCalledTimes(1);
});

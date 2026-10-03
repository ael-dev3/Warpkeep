// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
const sourceMocks = vi.hoisted(() => ({ git: vi.fn(), read: vi.fn() }));
vi.mock('../scripts/atlas/greater-realm-git', () => ({ runGreaterRealmTrustedGit: sourceMocks.git }));
vi.mock('../scripts/local-binding-bounded-file.mjs', () => ({ readLocalBindingBoundedFile: sourceMocks.read }));
afterEach(() => { vi.clearAllMocks(); });
import { capturePtrInitialOwnerSource, readPtrInitialOwnerSourceReference, inspectPtrInitialOwnerState, observePtrInitialOwnerAnchor, observePtrInitialOwnerAtlas,
  type PtrInitialOwnerReadDependencies } from '../scripts/ptr-initial-owner-operator';
import { parseExistingUpdateSql } from '../scripts/sealed-realms-existing-update-protocol.mjs';
import type { AuthBridgeRpcRoleAttestation } from '../scripts/auth-bridge-config-attestation.mjs';

const PROGRAM = 'a'.repeat(64), SOURCE = 'b'.repeat(40), FID = 123456789;
const element = (name: string, kind: string) => ({ name: { some: name }, algebraic_type: { [kind]: [] } });
const OWNER = { elements: [element('singleton_key', 'String'), element('owner_fid', 'U64'), element('auth_epoch', 'U32'), element('enabled', 'Bool')] };
const ATLAS = { elements: [element('atlas_id', 'String'), element('state', 'String'), element('verification_phase', 'String'),
  element('source_commit', 'String'), element('expected_release_sha_256', 'String'), element('import_epoch', 'U64')] };
const CASTLE = { elements: [element('key', 'String'), element('value', 'U64')] };
const encoded = (value: unknown) => Buffer.from(JSON.stringify(value));
const sql = (schema: unknown, rows: unknown[], stats = { rows_inserted: 0, rows_deleted: 0, rows_updated: 0 }) => encoded([
  { schema, rows, total_duration_micros: 1, stats },
]);
const schema = () => ({ typespace: { types: [{ Product: OWNER }, { Product: ATLAS }, { Product: CASTLE }] },
  tables: ['ptr_owner_anchor_v1', 'greater_realm_release_v1', 'castle'].map((name, product_type_ref) => ({
    name, product_type_ref, primary_key: [0], indexes: [], constraints: [], sequences: [], schedule: { none: [] },
    table_type: { User: [] }, table_access: { Private: [] },
  })), reducers: [], types: [], misc_exports: [], row_level_security: [],
});
const bridge = (): AuthBridgeRpcRoleAttestation => ({ profile: 'warpkeep-auth-v2', digest: 'c'.repeat(64),
  farcasterRpcEndpointRoleFingerprints: { primary: 'd'.repeat(64), secondary: 'e'.repeat(64) },
  notificationDeliveryEnabled: true, notificationTransportConfigured: true, notificationClientCount: 1,
  publicAuthEnabled: true, accessExpectedFidRequired: true, ptrEnabled: true,
  ptrSpacetimeDbDatabase: 'c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e', ptrAudience: 'warpkeep-ptr-spacetimedb' });
function fixture() {
  const buffers: Uint8Array[] = [];
  const state = { programCalls: 0, ownerCalls: 0, castleCalls: 0, schema: schema(), programChange: false,
    ownerChange: false, rowChange: false, ownerRows: [['PTR_OWNER_V1', FID, 3, true]] as unknown[],
    atlasRows: [['PTR_GREATER_REALM', 'ready', 'complete', SOURCE, 'f'.repeat(64), '1']] as unknown[],
    schemaChange: false, malformedRows: false, configChange: false, configMissing: false };
  const request = vi.fn(async (operation: string) => {
    let body: Buffer;
    if (operation === 'program') {
      const count = ++state.programCalls;
      body = sql({ elements: [element('program_hash', 'U256')] }, [['0x' + (state.programChange && count > 1 ? '9'.repeat(64) : PROGRAM)]]);
    } else if (operation === 'schema-v9') {
      const value = structuredClone(state.schema);
      if (state.schemaChange && state.programCalls >= 3) value.tables[2]!.primary_key = [];
      body = encoded(value);
    } else if (operation === 'rows:ptr_owner_anchor_v1') {
      ++state.ownerCalls; const rows = structuredClone(state.ownerRows);
      if (state.ownerChange && state.ownerCalls > 1) (rows[0] as unknown[])[2] = 4;
      body = sql(OWNER, rows);
    } else if (operation === 'rows:greater_realm_release_v1') body = sql(ATLAS, state.atlasRows);
    else if (operation === 'rows:castle') {
      ++state.castleCalls; body = sql(state.malformedRows ? OWNER : CASTLE, [['synthetic-castle', state.rowChange && state.castleCalls > 1 ? 2 : 1]]);
    } else throw Error(`unexpected operation ${operation}`);
    buffers.push(body); return body;
  });
  let configCalls = 0;
  const configuration = vi.fn(async () => {
    if (state.configMissing) throw Error('synthetic-private-token');
    const value = { ...bridge() }; if (state.configChange && ++configCalls > 1) value.notificationDeliveryEnabled = false;
    return value;
  });
  const assertSource = vi.fn();
  const dependencies: PtrInitialOwnerReadDependencies = { request, configuration, assertSource };
  return { state, buffers, request, configuration, assertSource, dependencies };
}

describe('initial owner fixed read-only observation', () => {
  it('reads the real program/schema/table protocol twice, preserves notification mode and never exposes raw rows or FID', async () => {
    const f = fixture(), result = await inspectPtrInitialOwnerState(f.dependencies);
    expect(result.status).toBe('observed'); expect(result.blockers).toEqual([]);
    expect(result.before.program).toBe(PROGRAM); expect(result.after.owner).toEqual({ state: 'enabled', enabled: true, authEpoch: 3 });
    expect(result.beforeConfiguration?.notificationDeliveryEnabled).toBe(true);
    expect(result.preservation).toEqual({ installedStateObservedEqual: true, privateConfigurationObservedEqual: true,
      comparison: 'two-sequential-program-bounded-snapshots', atomicDatabaseSnapshot: false });
    expect(result.productionAuthorized).toBe(false); expect(result.globalReleaseAuthority).toBe(false);
    expect(result.fullNativeAuthority).toBe(false); expect(result.ownerAuthTokenVerified).toBe(false);
    expect(result.candidateArtifactComparison).toBe('not-performed'); expect(result.providerWritesAttempted).toBe(false);
    expect(f.request.mock.calls.map(call => call[0])).toEqual(['program', 'schema-v9', 'rows:castle',
      'rows:greater_realm_release_v1', 'rows:ptr_owner_anchor_v1', 'program', 'program', 'schema-v9',
      'rows:castle', 'rows:greater_realm_release_v1', 'rows:ptr_owner_anchor_v1', 'program']);
    expect(JSON.stringify(result)).not.toContain(String(FID)); expect(JSON.stringify(result)).not.toContain('synthetic-castle');
    expect(f.buffers.every(buffer => buffer.every(byte => byte === 0))).toBe(true);
  });
  it.each(['rowChange', 'ownerChange', 'schemaChange'] as const)('retains %s as an actual changed-state blocker', async kind => {
    const f = fixture(); f.state[kind] = true;
    const result = await inspectPtrInitialOwnerState(f.dependencies);
    expect(result.status).toBe('blocked'); expect(result.blockers).toContain('INSTALLED_STATE_CHANGED');
    expect(result.preservation.installedStateObservedEqual).toBe(false);
  });
  it('rejects program changes within either read pass', async () => {
    const f = fixture(); f.state.programChange = true;
    await expect(inspectPtrInitialOwnerState(f.dependencies)).rejects.toThrow('PROGRAM_CHANGED_DURING_READ');
    expect(f.buffers.every(buffer => buffer.every(byte => byte === 0))).toBe(true);
  });
  it('records configuration change without rewriting it or claiming preservation', async () => {
    const f = fixture(); f.state.configChange = true;
    const result = await inspectPtrInitialOwnerState(f.dependencies);
    expect(result.blockers).toContain('PRIVATE_BRIDGE_CONFIG_CHANGED');
    expect(result.preservation.privateConfigurationObservedEqual).toBe(false);
    expect(result.beforeConfiguration?.notificationDeliveryEnabled).toBe(true);
    expect(result.afterConfiguration?.notificationDeliveryEnabled).toBe(false);
  });
  it('keeps useful owner observations when private bridge config is unavailable', async () => {
    const f = fixture(); f.state.configMissing = true;
    const result = await inspectPtrInitialOwnerState(f.dependencies);
    expect(result.status).toBe('blocked'); expect(result.blockers).toContain('PRIVATE_BRIDGE_CONFIG_UNOBSERVED');
    expect(result.after.owner?.authEpoch).toBe(3); expect(result.afterConfiguration).toBeNull();
    expect(JSON.stringify(result)).not.toContain('synthetic-private-token');
  });
  it.each(['ownerless', 'disabled', 'unrecognized'] as const)('records %s owner without fabricating its identity', async kind => {
    const f = fixture();
    f.state.ownerRows = kind === 'ownerless' ? [] : [['PTR_OWNER_V1', kind === 'unrecognized' ? 'unsafe-fid' : FID, 3, kind !== 'disabled']];
    const result = await inspectPtrInitialOwnerState(f.dependencies);
    expect(result.status).toBe('blocked'); expect(result.after.owner?.state).toBe(kind);
    expect(result.blockers).toContain('OWNER_NOT_ENABLED');
  });
  it('preserves observations but refuses to treat missing or importing atlas as ready', async () => {
    const f = fixture(); f.state.atlasRows[0] = ['PTR_GREATER_REALM', 'importing', 'cells', SOURCE, 'f'.repeat(64), '1'];
    const result = await inspectPtrInitialOwnerState(f.dependencies);
    expect(result.after.atlas?.state).toBe('importing'); expect(result.blockers).toContain('ATLAS_READY_NOT_OBSERVED');
  });
  it('refuses unknown installed tables rather than silently skipping old rows', async () => {
    const f = fixture(); f.state.schema.tables[2]!.name = 'unknown_future_table';
    await expect(inspectPtrInitialOwnerState(f.dependencies)).rejects.toThrow('TABLE_INVENTORY_UNSUPPORTED');
    expect(f.request.mock.calls).toHaveLength(2);
  });
  it('refuses a result schema inconsistent with the actual installed definition', async () => {
    const f = fixture(); f.state.malformedRows = true;
    await expect(inspectPtrInitialOwnerState(f.dependencies)).rejects.toThrow('ROW_SCHEMA_DIFFERENT');
  });
  it('propagates source preservation failure after awaiting a real response and erases bytes', async () => {
    const f = fixture(); f.assertSource.mockImplementationOnce(() => {}).mockImplementation(() => { throw Error('source changed'); });
    await expect(inspectPtrInitialOwnerState(f.dependencies)).rejects.toThrow('source changed');
    expect(f.buffers.every(buffer => buffer.every(byte => byte === 0))).toBe(true);
  });
  it('accepts exact big-u64 string rows but refuses unsafe numbers, epochs, duplicate owners or SQL writes', () => {
    const parse = (rows: unknown[], stats?: { rows_inserted: number; rows_deleted: number; rows_updated: number }) =>
      parseExistingUpdateSql(sql(OWNER, rows, stats));
    expect(observePtrInitialOwnerAnchor(parse([['PTR_OWNER_V1', String(FID), '3', true]]))).toEqual({ state: 'enabled', enabled: true, authEpoch: 3 });
    for (const rows of [ [['PTR_OWNER_V1', '9007199254740992', 3, true]], [['PTR_OWNER_V1', 1, 0, true]],
      [['PTR_OWNER_V1', 1, 4294967296, true]], [['other-key', 1, 1, true]],
      [['PTR_OWNER_V1', 1, 1, true], ['PTR_OWNER_V1', 2, 1, true]], [['PTR_OWNER_V1', 1, 1, 'true']] ]) {
      expect(() => observePtrInitialOwnerAnchor(parse(rows))).toThrow();
    }
    expect(() => parse([], { rows_inserted: 1, rows_deleted: 0, rows_updated: 0 })).toThrow();
  });
  it.each(['verifying', 'canary', 'active', 'halted', 'rolled-back'])('records maintained atlas state %s exactly while leaving initial ready acceptance blocked', async state => {
    const f = fixture(); f.state.atlasRows[0] = ['PTR_GREATER_REALM', state, 'complete', SOURCE, 'f'.repeat(64), '1'];
    const result = await inspectPtrInitialOwnerState(f.dependencies);
    expect(result.after.atlas?.state).toBe(state); expect(result.blockers).toContain('ATLAS_READY_NOT_OBSERVED');
    expect(result.productionAuthorized).toBe(false); expect(result.providerWritesAttempted).toBe(false);
  });
  it('validates atlas cardinality and preserves exact import epoch without assigning import authority', () => {
    const rows = [['PTR_GREATER_REALM', 'ready', 'complete', SOURCE, 'f'.repeat(64), '18446744073709551615']];
    const result = observePtrInitialOwnerAtlas(parseExistingUpdateSql(sql(ATLAS, rows)));
    expect(result).toMatchObject({ importEpoch: '18446744073709551615', fullImportStatusAuthority: false });
    expect(() => observePtrInitialOwnerAtlas(parseExistingUpdateSql(sql(ATLAS, [...rows, ...rows])))).toThrow('ATLAS_CARDINALITY_INVALID');
  });
});


describe('local source binding without invented main/full-native authority', () => {
  const source = { sourceCommit: SOURCE, sourceTree: '8'.repeat(40), signerFingerprint: `SHA256:${'A'.repeat(43)}`,
    signerIdentity: 'synthetic-signer@example.invalid' };
  const identity = { dev: '1', ino: '2', mode: '33188', uid: '1000', nlink: '1', size: '17', mtimeNs: '3', ctimeNs: '4' };
  function setup() {
    const state = { head: SOURCE, refs: 'refs/heads/quality\0' + SOURCE + '\n', status: '', index: 'held normal index',
      signature: `G\n${source.signerFingerprint}\n${source.signerIdentity}\n` };
    sourceMocks.read.mockImplementation(() => ({ body: Buffer.from(state.index), identity }));
    sourceMocks.git.mockImplementation((args: string[]) => ({ error: undefined, status: 0, signal: null, stderr: '',
      stdout: args[0] === 'status' ? state.status : args[0] === 'for-each-ref' ? state.refs : args[0] === 'log' ? state.signature
        : args[0] === 'verify-commit' ? '' : args.includes('--git-path') ? '.git/index' : args.includes('HEAD^{tree}') ? source.sourceTree + '\n' : state.head + '\n' }));
    return state;
  }
  it('binds an actual checked local source/index/ref/signature observation and rechecks it', () => {
    setup(); const value = capturePtrInitialOwnerSource(process.cwd(), source);
    expect(value.facts.acceptedMainAuthority).toBe(false); expect(value.facts.productionAuthorized).toBe(false);
    expect(value.facts.nativeEvidence).toBeNull(); expect(() => value.assert()).not.toThrow();
    expect(sourceMocks.git).toHaveBeenCalledWith(['verify-commit', '--raw', SOURCE], process.cwd());
  });
  it.each(['head', 'refs', 'status', 'index'] as const)('refuses actual %s change in the held source observation', kind => {
    const state = setup(); const value = capturePtrInitialOwnerSource(process.cwd(), source);
    state[kind] = 'changed'; expect(() => value.assert()).toThrow('SOURCE_CHANGED');
  });
  it('rejects signature identity mismatch instead of relying on a caller echoed source', () => {
    const state = setup(); state.signature = `G\n${source.signerFingerprint}\nother-signer\n`;
    expect(() => capturePtrInitialOwnerSource(process.cwd(), source)).toThrow('SOURCE_SIGNATURE_INVALID');
  });
  it('binds only a content-addressed private source reference, ignoring echoed success/coverage flags', () => {
    const digest = '1'.repeat(64);
    sourceMocks.read.mockReturnValue({ body: encoded({ schemaVersion: 1, profile: 'warpkeep-native-service-checks-v1',
      repositoryRoot: process.cwd(), source: { sourceCommit: SOURCE, sourceTree: source.sourceTree },
      allTestsPassed: true, productionAuthorized: true, completeCoverage: true }), identity });
    const reference = readPtrInitialOwnerSourceReference(process.cwd(), { ...source, nativeEvidence: digest });
    expect(reference?.authority).toBe(false);
    expect(sourceMocks.read).toHaveBeenCalledWith(expect.stringContaining(`native-source-verification-${digest}.json`),
      expect.objectContaining({ expectedMode: 0o600, expectedSha256: digest, maximumBytes: 32 * 1024 * 1024 }));
  });
  it.each(['profile', 'sourceCommit', 'sourceTree', 'repositoryRoot'] as const)('refuses mismatched native reference %s', kind => {
    const value: any = { schemaVersion: 1, profile: 'warpkeep-native-service-checks-v1', repositoryRoot: process.cwd(),
      source: { sourceCommit: SOURCE, sourceTree: source.sourceTree } };
    if (kind === 'profile' || kind === 'repositoryRoot') value[kind] = 'other'; else value.source[kind] = 'other';
    sourceMocks.read.mockReturnValue({ body: encoded(value), identity });
    expect(() => readPtrInitialOwnerSourceReference(process.cwd(), { ...source, nativeEvidence: '1'.repeat(64) })).toThrow('SOURCE_REFERENCE_INVALID');
  });
});

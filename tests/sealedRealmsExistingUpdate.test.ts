import { sealedRealmsPrivateBase } from './helpers/sealedRealmsPrivateRoots';
// @vitest-environment node
import observedPlans from './fixtures/existing-update-plans-2.6.1.json';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readSyntheticNetworkIdentity } from '../scripts/sealed-realms-synthetic-network.mjs';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSealedRealmsProductionPrivateState, SEALED_REALMS_PRIVATE_STATE_VERSION } from '../scripts/sealed-realms-production-private-state.mjs';
import { authenticateSealedRealmsProductionSourceAuthority } from '../scripts/sealed-realms-production-source-authority.mjs';
import { issueSealedRealmsProductionWorkflowPermit } from '../scripts/sealed-realms-production-workflow-authority.mjs';
import { createSealedRealmsProductionContinuationStore } from '../scripts/sealed-realms-production-continuation.mjs';
import { createSealedRealmsProductionAuthBridgeState } from '../scripts/sealed-realms-production-auth-bridge-state.mjs';
import { createSealedRealmsProductionPublicationReconciler } from '../scripts/sealed-realms-production-reconciliation.mjs';
import { createSealedRealmsProductionG002Lane, createSealedRealmsProductionG002DispatchContext, createSealedRealmsProductionG002Dispatcher } from '../scripts/sealed-realms-production-g002-lane-entry.mjs';
import { createSealedRealmsProductionPtrLane, createSealedRealmsProductionPtrDispatchContext, createSealedRealmsProductionPtrDispatcher } from '../scripts/sealed-realms-production-ptr-lane-entry.mjs';
import { createSyntheticExistingUpdateAdapter, createSealedRealmsProductionExistingUpdateAdapter } from '../scripts/sealed-realms-production-existing-update.mjs';
import type { SyntheticExistingUpdateAdapter } from '../scripts/sealed-realms-production-existing-update.mjs';
import { decodeExistingUpdateToken, existingUpdateTokenDigest, parseExistingUpdateJson, parseExistingUpdatePlan,
  parseExistingUpdateSuccess, updateCanonical, updateProgramHash, updateDigest } from '../scripts/sealed-realms-existing-update-protocol.mjs';

const PLAN_HEADER = `${'━'.repeat(60)}\nDatabase Migration Plan\n${'━'.repeat(60)}\n\n`;
const SOURCE = '1'.repeat(40), ID = 'd'.repeat(64);
const A = Buffer.from('synthetic module A'), B = Buffer.from('synthetic module B'), C = Buffer.from('synthetic module C');
const SECRET = ['synthetic', 'local', 'fixture', 'credential'].join('.');
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
const wire = (value: string) => `0x${Buffer.from(value, 'hex').reverse().toString('hex')}`;
function schema(names: string[]) {
  return { reducers: [], types: [], misc_exports: [], row_level_security: [], tables: names.map((name, product_type_ref) => ({ name, product_type_ref, primary_key: [0],
    table_type: { User: [] }, table_access: { Private: [] }, indexes: [], constraints: [], sequences: [], schedule: { none: [] } })),
  typespace: { types: names.map(() => ({ Product: { elements: [{ name: { some: 'key' }, algebraic_type: { String: [] } },
    { name: { some: 'value' }, algebraic_type: { U64: [] } }] } })) } };
}
function authority(operation: string, source = SOURCE) {
  return authenticateSealedRealmsProductionSourceAuthority({ operation: operation as never, workflowInputSha: source,
    readGit: args => { if (args[0] !== 'rev-parse') throw new Error('Unexpected Git query'); return `${source}\n`; },
    readBinding: () => ({ schemaVersion: 1, profile: 'warpkeep-0.4.0-sealed-launch-v1', pagesDeploymentApproved: false, preparationSourceCommit: null }),
    verifyEvidence: verifiedSha => ({ verifiedSha }) });
}
function response(url: string, value: unknown) {
  const result = new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
  Object.defineProperty(result, 'url', { value: url }); return result;
}
const supported = (() => {
  try { readSyntheticNetworkIdentity(); return true; } catch { return false; }
})();
const native = it.skipIf(!supported);
if (process.env.WARPKEEP_REQUIRE_SYNTHETIC_NETWORK === '1' && !supported) {
  throw new Error('Required isolated existing-update coverage is unavailable');
}

// Share the exact child launch contract with the always-running import regression.
function startInspector(arguments_: string[]) {
  const child = spawn(process.execPath, ['--import', 'tsx', join(process.cwd(), 'tests/fixtures/sealedRealmsExistingUpdateInspector.mjs'), ...arguments_],
    { env: { ...process.env, NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let failure: Error | undefined, completed = false;
  const outcome = new Promise<string>((resolve, reject) => {
    let output = '', errors = '';
    child.stdout!.on('data', chunk => { output += chunk; });
    child.stderr!.on('data', chunk => { errors += chunk; });
    child.once('error', reject);
    child.once('close', (code, signal) => code === 0 ? resolve(output.trim())
      : reject(new Error(`Inspector exited ${code} (${signal ?? 'no signal'}): ${errors}`)));
  });
  void outcome.then(() => { completed = true; }, error => { failure = error; });
  return { child, outcome, assertRunning() {
    if (failure) throw failure;
    if (completed) throw new Error('Inspector exited successfully before predecessor barrier');
  } };
}
async function waitForInspectorBarrier(inspectors: ReturnType<typeof startInspector>[], ready: () => boolean) {
  const deadline = Date.now() + 8000;
  while (!ready()) {
    for (const inspector of inspectors) inspector.assertRunning();
    if (Date.now() >= deadline) throw new Error('Inspectors did not reach the same predecessor barrier');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
it('imports the real inspector dependency graph in a separate Node process without native isolation', async () => {
  const inspector = startInspector(['--import-only']);
  try { expect(await inspector.outcome).toBe('inspector-imported'); }
  finally { if (inspector.child.exitCode === null && inspector.child.signalCode === null) inspector.child.kill('SIGKILL'); }
});
it('reports a terminal child error before masking it as a predecessor barrier timeout', async () => {
  const inspector = startInspector(['unused', 'invalid-label']);
  try {
    await expect(waitForInspectorBarrier([inspector], () => false)).rejects.toThrow('Invalid test process label');
    await expect(inspector.outcome).rejects.toThrow('Invalid test process label');
  } finally { if (inspector.child.exitCode === null && inspector.child.signalCode === null) inspector.child.kill('SIGKILL'); }
});

async function fixture(lane: 'g002' | 'ptr' = 'g002') {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-existing-update-test-')); chmodSync(root, 0o700);
  const home = join(root, 'home');
  for (const suffix of ['audit/private', 'runtime', 'cache']) mkdirSync(join(sealedRealmsPrivateBase(home), suffix), { recursive: true, mode: 0o700 });
  const privateState = createSealedRealmsProductionPrivateState({ reportedHome: home,
    testOnlyOwnerUid: statSync(root).uid, testOnlyAllowPlatformMode: true });
  const state = { program: updateProgramHash(A), names: ['ledger'], rows: { ledger: [['earned', 9]] } as Record<string, unknown[][]>,
    schemaChange: undefined as ((value: ReturnType<typeof schema>) => unknown) | undefined, puts: 0, plans: 0, mode: '', planChange: undefined as (() => void) | undefined, beforePut: undefined as (() => void) | undefined };
  const trace: string[] = [], runStatus = new Map<string, 'in_progress' | 'completed'>();
  const runRevoked = new Set<string>(); let runSequence = 300;
  const server = createServer(async (request, res) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks), url = new URL(request.url!, 'http://127.0.0.1');
    trace.push(`${request.method} ${url.pathname}`);
    const send = (value: unknown) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (request.headers.authorization !== `Bearer ${SECRET}` || !url.pathname.startsWith(`/v1/database/${ID}`)) { res.writeHead(403); res.end(); return; }
    if (state.mode === 'reflect') { send({ reflected: SECRET }); return; }
    if (state.mode === 'redirect') { res.writeHead(302, { Location: 'http://127.0.0.1:1/' }); res.end(); return; }
    if (url.pathname.endsWith('/schema')) { send(state.schemaChange ? state.schemaChange(schema(state.names)) : schema(state.names)); return; }
    if (url.pathname.endsWith('/sql')) {
      const query = body.toString();
      const program = query === 'SELECT program_hash FROM st_module';
      const name = /^SELECT \* FROM ([a-z][a-z0-9_]*)$/u.exec(query)?.[1];
      if (!program && (!name || !state.names.includes(name))) { res.writeHead(400); res.end(); return; }
      send([{ schema: program ? { elements: [{ name: { some: 'program_hash' }, algebraic_type: { U256: [] } }] }
        : { elements: [{ name: { some: 'row' }, algebraic_type: { String: [] } }] },
      rows: program ? [[wire(state.program)]] : state.rows[name!], total_duration_micros: 1,
      stats: { rows_inserted: 0, rows_deleted: 0, rows_updated: 0 } }]); return;
    }
    if (url.pathname.endsWith('/pre_publish')) {
      state.plans++; const candidate = updateProgramHash(body);
      const value = { AutoMigrate: { break_clients: false as boolean | string, major_version_upgrade: false,
        migrate_plan: `${PLAN_HEADER}▸ Created user table: ${candidate === updateProgramHash(B) ? 'gameplay04_receipt_v1' : 'maintenance'} (private)\n    Columns:\n        • key: String\n        • value: U64\n\n`, token: wire(existingUpdateTokenDigest(ID, state.program, candidate)) } };
      if (state.mode === 'wrong-token') value.AutoMigrate.token = wire('a'.repeat(64));
      if (state.mode === 'string-flag') value.AutoMigrate.break_clients = 'false';
      state.planChange?.(); send(value); return;
    }
    if (request.method === 'PUT' && url.pathname === `/v1/database/${ID}`) {
      state.puts++; state.beforePut?.();
      const candidate = updateProgramHash(body);
      if (url.searchParams.get('policy') !== 'BreakClients' || url.searchParams.get('host_type') !== 'Js'
        || url.searchParams.get('token') !== wire(existingUpdateTokenDigest(ID, state.program, candidate))) {
        res.writeHead(400); res.end('state token rejected'); return;
      }
      if (state.mode !== 'lost-before-update') {
        state.program = candidate;
        if (candidate === updateProgramHash(B)) { state.names = ['ledger', 'gameplay04_receipt_v1']; state.rows.gameplay04_receipt_v1 = []; }
        else if (candidate === updateProgramHash(C)) {
          state.names = ['ledger', 'gameplay04_receipt_v1', 'maintenance'];
          state.rows.gameplay04_receipt_v1 ??= []; state.rows.maintenance = [];
        }
        if (state.mode === 'corrupt-row') state.rows.ledger = [['earned', 0]];
        if (state.mode === 'aba') state.program = updateProgramHash(A);
      }
      if (['lost-ack', 'lost-before-update', 'aba'].includes(state.mode)) { res.destroy(); return; }
      send({ Success: { domain: null, database_identity: ID, op: 'updated' } }); return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing server address');
  const origin = `http://127.0.0.1:${address.port}`;
  const adapters = new Set<SyntheticExistingUpdateAdapter>();
  let tokenHook: (() => void) | undefined;
  const make = (candidate = B, overrides: Record<string, unknown> = {}) => {
    const value = createSyntheticExistingUpdateAdapter({ lane, origin, databaseIdentity: ID, sourceCommit: SOURCE,
      candidateBytes: candidate, candidateSchemaBytes: bytes(schema(candidate.equals(C)
        ? ['ledger', 'gameplay04_receipt_v1', 'maintenance'] : ['ledger', 'gameplay04_receipt_v1'])),
      readAdminToken: () => { tokenHook?.(); return SECRET; }, privateState, runtimeRoot: root, ...overrides });
    adapters.add(value); return value;
  };
  const unavailable = () => { throw new Error('Creation/import/provision must never run'); };
  async function dispatcher(operation: string, adapter?: SyntheticExistingUpdateAdapter) {
    const runId = String(++runSequence); runStatus.set(runId, 'in_progress');
    const selectedAuthority = authority(operation);
    const permit = await issueSealedRealmsProductionWorkflowPermit({ sourceAuthority: selectedAuthority,
      githubToken: 'synthetic-github-fixture-credential', runId, runAttempt: 1,
      fetchImpl: async target => {
        const url = String(target);
        if (url.endsWith('/branches/main')) return response(url, { name: 'main', protected: true, commit: { sha: SOURCE } });
        const id = /\/actions\/runs\/([1-9][0-9]*)$/u.exec(url)?.[1]; if (!id) throw new Error('Unexpected GitHub path');
        const status = runStatus.get(id) ?? 'completed';
        return response(url, { id: Number(id), run_attempt: 1, event: 'workflow_dispatch', status,
          conclusion: status === 'completed' ? 'failure' : null, head_branch: 'main',
          head_sha: runRevoked.has(id) ? '2'.repeat(40) : SOURCE,
          path: '.github/workflows/sealed-realms-production.yml', repository: { full_name: 'ael-dev3/Warpkeep' } });
      } });
    const bridgeState = createSealedRealmsProductionAuthBridgeState({ authority: selectedAuthority, privateState, repositoryRoot: process.cwd(),
      deploymentAttester: unavailable, bindingAttester: unavailable, fetchImpl: unavailable,
      inspectImportReceipt: unavailable, authenticateImportResult: unavailable, resolveOwnerProvisionReceipt: unavailable });
    const common = { existingUpdate: adapter, bridgeState,
      reconciler: createSealedRealmsProductionPublicationReconciler({ privateState, lane, postflight: unavailable }),
      createPublishMarker: unavailable, publish: unavailable, importCore: unavailable, liveInspect: unavailable };
    const context = { readGit: (args: readonly string[]) => { if (args[0] !== 'rev-parse') throw new Error('Unexpected Git'); return `${SOURCE}\n`; },
      readBinding: () => ({ schemaVersion: 1, profile: 'warpkeep-0.4.0-sealed-launch-v1', pagesDeploymentApproved: false, preparationSourceCommit: null }),
      verifyEvidence: (verifiedSha: string) => ({ verifiedSha }), permit,
      continuationStore: createSealedRealmsProductionContinuationStore({ privateState }), runId, runAttempt: '1', sourceAuthority: selectedAuthority };
    const target = lane === 'g002' ? createSealedRealmsProductionG002Dispatcher({ context: createSealedRealmsProductionG002DispatchContext(context), lane: createSealedRealmsProductionG002Lane(common) })
      : createSealedRealmsProductionPtrDispatcher({ context: createSealedRealmsProductionPtrDispatchContext(context), lane: createSealedRealmsProductionPtrLane({ ...common, inspectOwnerProvision: unavailable, provisionOwner: unavailable }) });
    return { runId, call: () => target.dispatch({ operation: operation as never, workflowInputSha: SOURCE }) };
  }
  const inspect = async (adapter: SyntheticExistingUpdateAdapter) => {
    const run = await dispatcher(`${lane}-update-inspect`, adapter); const result = await run.call(); runStatus.set(run.runId, 'completed'); return result;
  };
  return { root, origin, privateState, state, trace, make, dispatcher, inspect, runStatus, runRevoked,
    setTokenHook: (hook: () => void) => { tokenHook = hook; },
    directory: join(sealedRealmsPrivateBase(home), 'runtime', SEALED_REALMS_PRIVATE_STATE_VERSION, 'existing-updates-synthetic-v3', lane, ID),
    async cleanup() { for (const adapter of adapters) adapter.dispose(); server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      if (!root.startsWith(join(tmpdir(), 'warpkeep-existing-update-test-'))) throw new Error('Invalid cleanup root');
      rmSync(root, { recursive: true }); },
  };
}

describe('existing-update native protocol', () => {
  it('refuses production construction without authenticated inputs', () => {
    expect(createSealedRealmsProductionExistingUpdateAdapter).toThrow('PTR_PRODUCTION_EXISTING_UPDATE_INVALID');
  });
  it('matches the pinned Keccak and wire-order contract', () => {
    expect(updateProgramHash(Buffer.alloc(0))).toBe('c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
    const digest = existingUpdateTokenDigest(ID, updateProgramHash(A), updateProgramHash(B));
    expect(decodeExistingUpdateToken(wire(digest))).toBe(digest);
    expect(existingUpdateTokenDigest('e'.repeat(64), updateProgramHash(A), updateProgramHash(B))).not.toBe(digest);
    expect(existingUpdateTokenDigest(ID, updateProgramHash(C), updateProgramHash(B))).not.toBe(digest);
  });
  it.each(['{"x":1,"x":2}', '{"x":{"a":1,"a":2}}', '{"value":9007199254740993}', '{"__proto__":1,"__proto__":2}', '\ufeff{}', '{"value":"\\ud800"}', 'true false'])('rejects lossy/duplicate JSON %s', text => {
    expect(() => parseExistingUpdateJson(Buffer.from(text))).toThrow();
  });
  it('requires exact success identity, operation and no alias', () => {
    const good = { Success: { domain: null, database_identity: ID, op: 'updated' } };
    expect(parseExistingUpdateSuccess(bytes(good), ID)).toBe(updateDigest(good));
    for (const changed of [{ ...good.Success, domain: 'alias' }, { ...good.Success, op: 'created' }, { ...good.Success, database_identity: 'e'.repeat(64) }]) {
      expect(() => parseExistingUpdateSuccess(bytes({ Success: changed }), ID)).toThrow();
    }
  });
  it('rejects a string migration flag and a changed state token', () => {
    const plan = { AutoMigrate: { break_clients: false as boolean | string, major_version_upgrade: false, migrate_plan: PLAN_HEADER, token: wire(existingUpdateTokenDigest(ID, updateProgramHash(A), updateProgramHash(B))) } };
    expect(parseExistingUpdatePlan(bytes(plan), ID, updateProgramHash(A), updateProgramHash(B))).toHaveProperty('planDigest');
    plan.AutoMigrate.break_clients = 'false'; expect(() => parseExistingUpdatePlan(bytes(plan), ID, updateProgramHash(A), updateProgramHash(B))).toThrow();
  });

  it.each(observedPlans)('accepts captured pinned native plan $name', sample => {
    const result = parseExistingUpdatePlan(bytes(sample.response), sample.databaseIdentity, sample.predecessorProgram, sample.candidateProgram);
    expect(result.planDigest).toBe(updateDigest(sample.response));
    expect(result.token).toBe(sample.response.AutoMigrate.token);
  });
  it.each([
    '▸ Created user table: empty (public)\n\n',
    '▸ Created user table: sample (private)\n    Columns:\n        • key: U64\n        • data: Array<(0: Bool, 1: (some: String | none: ()))>\n        • never: (|)\n    Unique constraints:\n        • sample_key on [key]\n    Indexes:\n        • sample_data on [key, data]\n    Auto-increment constraints:\n        • sample_seq on key\n    Schedule:\n        • Calls reducer: run_sample\n\n',
  ])('accepts supported formatter structures %#', suffix => {
    const sample = observedPlans[0];
    const response = { AutoMigrate: { ...sample.response.AutoMigrate, migrate_plan: PLAN_HEADER + suffix } };
    expect(parseExistingUpdatePlan(bytes(response), sample.databaseIdentity, sample.predecessorProgram, sample.candidateProgram).planDigest).toBe(updateDigest(response));
  });
  it('keeps all program/target token bindings and strict flags despite accepted text', () => {
    const sample = observedPlans[0];
    const args = [sample.databaseIdentity, sample.predecessorProgram, sample.candidateProgram] as const;
    for (let index = 0; index < args.length; index++) {
      const changed = [...args]; changed[index] = 'e'.repeat(64);
      expect(() => parseExistingUpdatePlan(bytes(sample.response), changed[0], changed[1], changed[2])).toThrow();
    }
    for (const patch of [{ break_clients: true }, { major_version_upgrade: true }, { token: '0x1' }]) {
      expect(() => parseExistingUpdatePlan(bytes({ AutoMigrate: { ...sample.response.AutoMigrate, ...patch } }), ...args)).toThrow();
    }
  });
  it.each([
    '', 'synthetic additive table plan', PLAN_HEADER.trimEnd(), `${PLAN_HEADER}unexpected`,
    `${PLAN_HEADER}▸ Removed table: notes\n\n`,
    `${PLAN_HEADER}▸ Changed access for table notes (private → public)\n`,
    `${PLAN_HEADER}▸ Created index notes_id on [id] of table notes\n`,
    `${PLAN_HEADER}▸ Removed schedule for table notes calling reducer run_notes\n`,
    `${PLAN_HEADER}▸ Created user table: notes (private)\n    Unknown section:\n        • id: U32\n\n`,
    `${PLAN_HEADER}▸ Created system table: notes (private)\n\n`,
  ])('rejects unsupported migration plan text %#', text => {
    const sample = observedPlans[0];
    const response = { AutoMigrate: { ...sample.response.AutoMigrate, migrate_plan: text } };
    expect(() => parseExistingUpdatePlan(bytes(response), sample.databaseIdentity, sample.predecessorProgram, sample.candidateProgram))
      .toThrow('SEALED_REALMS_EXISTING_UPDATE_PROTOCOL_INVALID');
  });
  it.each([
    (text: string) => `${text}▸ Removed table: old_state\n\n`,
    (text: string) => text.replace('    Columns:', '    Columns:\n▸ Removed table: old_state'),
    (text: string) => text.replace('• building_id: String', '• building_id: Mystery'),
    (text: string) => text.replace('• building_id: String', '• building_id: Array<U64'),
    (text: string) => text.replace('• building_id: String', '• building_id: String\n        • building_id: U64'),
    (text: string) => text.replace('on [building_id]', 'on [unknown_column]'),
    (text: string) => text.replace('    Indexes:', '    Columns:'),
    (text: string) => text.replace('private)', 'private)\u001b[0m'),
    (text: string) => text.replaceAll('\n', '\r\n'),
    (text: string) => text + text.slice(PLAN_HEADER.length),
    (text: string) => text.replace('String', `${'Array<'.repeat(65)}U64${'>'.repeat(65)}`),
    (text: string) => text.replace('on [building_id]', 'on [building_id, building_id]'),
    (text: string) => text.replace('    Columns:\n', '    Columns:\n    Indexes:\n'),
    (text: string) => text.replace('• building_id: String', '• building_id: (x: U64, y: String | z: Bool)'),
    (text: string) => text.replace('• building_id: String', '• building_id: (x: U64, x: String)'),
    (text: string) => text.replace('• Calls reducer: run_gameplay_04_schedule_v_1', '• Calls reducer: run_gameplay_04_schedule_v_1\n        • Calls reducer: another'),
    (text: string) => text.slice(0, -1),
  ])('rejects hostile edits to the captured additive plan %#', mutate => {
    const sample = observedPlans[0];
    const response = { AutoMigrate: { ...sample.response.AutoMigrate, migrate_plan: mutate(sample.response.AutoMigrate.migrate_plan) } };
    expect(() => parseExistingUpdatePlan(bytes(response), sample.databaseIdentity, sample.predecessorProgram, sample.candidateProgram))
      .toThrow('SEALED_REALMS_EXISTING_UPDATE_PROTOCOL_INVALID');
  });
  it.skipIf(supported)('refuses unsupported runtime before reading credentials or any response', () => {
    let read = 0;
    expect(() => createSyntheticExistingUpdateAdapter({ lane: 'g002', origin: 'http://127.0.0.1:43210', databaseIdentity: ID,
      sourceCommit: SOURCE, candidateBytes: B, candidateSchemaBytes: bytes(schema(['ledger'])), runtimeRoot: '/tmp/warpkeep-unavailable',
      readAdminToken: () => { read++; return SECRET; }, privateState: {} as never })).toThrow();
    expect(read).toBe(0);
  });
});

describe('actual update dispatcher, private continuation and isolated HTTP adapter', () => {
  native.each(['candidate', 'observed', 'repeated', 'before-apply'])('rejects hidden views at %s before module submission', async phase => {
    const f = await fixture();
    const changed = (value: unknown) => ({ ...(value as object), misc_exports: [{ View: { name: 'hidden_view' } }] });
    try {
      if (phase === 'candidate') {
        let credentials = 0;
        expect(() => f.make(B, { candidateSchemaBytes: bytes(changed(schema(['ledger', 'gameplay04_receipt_v1']))), readAdminToken: () => { credentials++; return SECRET; } })).toThrow();
        expect(credentials).toBe(0);
      } else {
        const adapter = f.make();
        if (phase === 'observed') f.state.schemaChange = changed;
        if (phase === 'repeated') f.state.planChange = () => { f.state.schemaChange = changed; };
        if (phase === 'before-apply') {
          await f.inspect(adapter);
          f.state.schemaChange = changed;
          await expect((await f.dispatcher('g002-update-apply', adapter)).call()).rejects.toThrow();
        } else await expect(f.inspect(adapter)).rejects.toThrow();
      }
      expect(f.state.puts).toBe(0);
      expect(f.state.rows.ledger).toEqual([['earned', 9]]);
    } finally { await f.cleanup(); }
  });
  native('does not silently attest or ignore older synthetic records', async () => {
    const f = await fixture();
    try {
      const legacy = f.directory.replace('existing-updates-synthetic-v3', 'existing-updates-synthetic-v2');
      mkdirSync(legacy, { recursive: true, mode: 0o700 });
      writeFileSync(join(legacy, `${'a'.repeat(64)}.inspection.json`), 'preserved old evidence', { mode: 0o600 });
      const adapter = f.make();
      await expect(f.inspect(adapter)).rejects.toThrow('SEALED_REALMS_DISPATCH_LANE_FAILED');
      await expect(adapter.inspectForContinuation({ authority: authority('g002-update-inspect') })).rejects.toThrow('LEGACY_RECORDS_UNSUPPORTED');
      expect(f.state.puts).toBe(0); expect(f.trace).toEqual([]);
      expect(readFileSync(join(legacy, `${'a'.repeat(64)}.inspection.json`), 'utf8')).toBe('preserved old evidence');
    } finally { await f.cleanup(); }
  });
  native.each(['missing-policy', 'wrong-policy', 'old-profile'])('rejects %s while reopening durable inspection', async changed => {
    const f = await fixture();
    try {
      const adapter = f.make(); await f.inspect(adapter);
      const filename = join(f.directory, readdirSync(f.directory).find(name => name.endsWith('.inspection.json'))!);
      const record = JSON.parse(readFileSync(filename, 'utf8'));
      if (changed === 'missing-policy') delete record.value.before.definitionPolicy;
      else if (changed === 'wrong-policy') record.value.before.definitionPolicy = 'table-only';
      else record.profile = 'warpkeep-synthetic-quiescent-existing-update-v2';
      record.inspectionDigest = updateDigest(record.value);
      writeFileSync(filename, `${updateCanonical(record)}\n`);
      expect(() => adapter.reopenContinuation({ authority: authority('g002-update-apply') })).toThrow(changed === 'missing-policy' ? 'PROTOCOL_INVALID' : 'RECORD_INVALID');
      expect(f.state.puts).toBe(0);
    } finally { await f.cleanup(); }
  });
  native('rejects a postflight procedure-description mismatch even with unchanged tables', async () => {
    const f = await fixture();
    try {
      const adapter = f.make(); await f.inspect(adapter);
      f.state.beforePut = () => { f.state.schemaChange = value => ({ ...value,
        misc_exports: [{ Procedure: { name: 'unexpected_procedure', params: { elements: [] }, return_type: { String: [] } } }] }); };
      await expect((await f.dispatcher('g002-update-apply', adapter)).call()).rejects.toThrow('SEALED_REALMS_DISPATCH_LANE_FAILED');
      expect(f.state.puts).toBe(1);
      expect(adapter.inspectResult()).toBeUndefined();
    } finally { await f.cleanup(); }
  });

  native.each([false, true])('serializes independent inspections after an accepted predecessor=%s', async afterAccepted => {
    const f = await fixture();
    const children: ReturnType<typeof spawn>[] = [];
    try {
      if (afterAccepted) {
        const previous = f.make(); await f.inspect(previous);
        expect(await (await f.dispatcher('g002-update-apply', previous)).call()).toMatchObject({ status: 'completed' });
      }
      mkdirSync(f.directory, { recursive: true, mode: 0o700 });
      const candidates = afterAccepted ? [C, C] : [B, C];
      const outcomes = ['first', 'second'].map((label, index) => {
        const configuration = join(f.root, `${label}.json`), candidate = candidates[index];
        writeFileSync(configuration, bytes({ root: f.root, origin: f.origin, lane: 'g002', sourceCommit: SOURCE,
          databaseIdentity: ID, candidateBase64: candidate.toString('base64'), credential: SECRET,
          schema: schema(candidate.equals(C) ? ['ledger', 'gameplay04_receipt_v1', 'maintenance'] : ['ledger', 'gameplay04_receipt_v1']) }), { mode: 0o600 });
        const inspector = startInspector([configuration, label]);
        children.push(inspector.child);
        return inspector;
      });
      // Observe all rejection paths immediately while the parent serves both HTTP clients.
      const settled = Promise.allSettled(outcomes.map(inspector => inspector.outcome));
      await waitForInspectorBarrier(outcomes, () => ['first', 'second'].every(label => existsSync(join(f.root, `${label}.ready`))));
      writeFileSync(join(f.root, 'release-inspectors'), '', { flag: 'wx', mode: 0o600 });
      const results = await settled;
      expect(results.every(result => result.status === 'fulfilled')).toBe(true);
      expect(results.map(result => result.status === 'fulfilled' ? result.value : 'child-failed').sort())
        .toEqual(['SEALED_REALMS_PRIVATE_STATE_FILE_EXISTS', 'inspected']);
      expect(readdirSync(f.directory).filter(name => name.endsWith('.inspection.json'))).toHaveLength(afterAccepted ? 2 : 1);
      expect(f.state.puts).toBe(afterAccepted ? 1 : 0);
      const winner = results.findIndex(result => result.status === 'fulfilled' && result.value === 'inspected');
      const reopened = f.make(candidates[winner]); await f.inspect(reopened);
      const apply = await f.dispatcher('g002-update-apply', reopened);
      expect(await apply.call()).toMatchObject({ status: 'completed' });
      expect(f.state.puts).toBe(afterAccepted ? 2 : 1);
    } finally {
      await Promise.all(children.filter(child => child.exitCode === null && child.signalCode === null).map(child =>
        new Promise<void>(resolve => { child.once('exit', () => resolve()); child.kill('SIGKILL'); })));
      await f.cleanup();
    }
  }, 20_000);
  native.each(['g002', 'ptr'] as const)('updates %s once and preserves every existing row through the real lane', async lane => {
    const f = await fixture(lane); try {
      const adapter = f.make(); expect(await f.inspect(adapter)).toEqual({ operation: `${lane}-update-inspect`, status: 'update-inspected' });
      const apply = await f.dispatcher(`${lane}-update-apply`, adapter);
      expect(await apply.call()).toEqual({ operation: `${lane}-update-apply`, status: 'completed' });
      expect(f.state.puts).toBe(1); expect(f.state.rows.ledger).toEqual([['earned', 9]]);
      expect(adapter.inspectResult()).toMatchObject({ profile: 'warpkeep-synthetic-quiescent-existing-update-v3', outcome: 'observed-preserved-candidate' });
      const duplicate = await f.dispatcher(`${lane}-update-apply`, adapter); await expect(duplicate.call()).rejects.toThrow(); expect(f.state.puts).toBe(1);
      expect(f.trace.every(value => value.includes(`/v1/database/${ID}`))).toBe(true);
    } finally { await f.cleanup(); }
  });
  native.each(['wrong-token', 'string-flag', 'reflect', 'redirect'])('rejects %s before any module update', async mode => {
    const f = await fixture(); try { f.state.mode = mode; await expect(f.inspect(f.make())).rejects.toThrow(); expect(f.state.puts).toBe(0); }
    finally { await f.cleanup(); }
  });
  native('never makes creation available when no update adapter was installed', async () => {
    const f = await fixture(); try { const run = await f.dispatcher('g002-update-inspect'); await expect(run.call()).rejects.toThrow(); expect(f.trace).toEqual([]); }
    finally { await f.cleanup(); }
  });
  native('refuses all three production identities and non-loopback URLs', async () => {
    const f = await fixture(); try {
      for (const databaseIdentity of ['c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e', 'c2003223f6e3c86e988775ddd458c3a45635d0d021e11131551471617c392194', 'c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e']) expect(() => f.make(B, { databaseIdentity })).toThrow();
      for (const origin of ['https://maincloud.spacetimedb.com', 'http://localhost:3000', 'http://127.0.0.1:3000/']) expect(() => f.make(B, { origin })).toThrow();
      expect(f.trace).toEqual([]);
    } finally { await f.cleanup(); }
  });
  native('detects a write while planning instead of claiming a stable snapshot', async () => {
    const f = await fixture(); try { f.state.planChange = () => { f.state.rows.ledger.push(['later', 2]); };
      await expect(f.inspect(f.make())).rejects.toThrow(); expect(f.state.puts).toBe(0);
    } finally { await f.cleanup(); }
  });
  native('retains a write after inspection, proves local non-submission and permits a fresh inspection', async () => {
    const f = await fixture(); try {
      const adapter = f.make(); await f.inspect(adapter); f.state.rows.ledger.push(['later', 2]);
      const apply = await f.dispatcher('g002-update-apply', adapter); await expect(apply.call()).rejects.toThrow(); f.runStatus.set(apply.runId, 'completed');
      expect(f.state.puts).toBe(0); expect(readdirSync(f.directory).some(name => name.endsWith('.not-submitted.json'))).toBe(true);
      const retry = await f.dispatcher('g002-update-apply', f.make()); expect(await retry.call()).toMatchObject({ status: 'completed' });
      const fresh = f.make(); await f.inspect(fresh); const newApply = await f.dispatcher('g002-update-apply', fresh); await newApply.call();
      expect(f.state.rows.ledger).toEqual([['earned', 9], ['later', 2]]); expect(f.state.puts).toBe(1);
    } finally { await f.cleanup(); }
  });
  native('adopts a lost acknowledgement through fresh readback without a second PUT', async () => {
    const f = await fixture(); try {
      const first = f.make(); await f.inspect(first); f.state.mode = 'lost-ack';
      const run = await f.dispatcher('g002-update-apply', first); await expect(run.call()).rejects.toThrow(); f.runStatus.set(run.runId, 'completed');
      expect(f.state.puts).toBe(1); expect(first.inspectResult()).toBeUndefined();
      const reopened = f.make(), retry = await f.dispatcher('g002-update-apply', reopened);
      expect(await retry.call()).toMatchObject({ status: 'completed' }); expect(f.state.puts).toBe(1);
      expect(reopened.inspectResult()).toHaveProperty('outcome', 'observed-preserved-candidate');
    } finally { await f.cleanup(); }
  });
  native.each(['lost-before-update', 'aba', 'corrupt-row'])('keeps %s unresolved and never retries submission', async mode => {
    const f = await fixture(); try {
      const first = f.make(); await f.inspect(first); f.state.mode = mode;
      const run = await f.dispatcher('g002-update-apply', first); await expect(run.call()).rejects.toThrow(); f.runStatus.set(run.runId, 'completed');
      const retry = await f.dispatcher('g002-update-apply', f.make()); await expect(retry.call()).rejects.toThrow(); expect(f.state.puts).toBe(1);
    } finally { await f.cleanup(); }
  });
  native('rejects candidate substitution and forged opaque adapters', async () => {
    const f = await fixture(); try {
      const first = f.make(); await f.inspect(first);
      const changed = await f.dispatcher('g002-update-apply', f.make(C)); await expect(changed.call()).rejects.toThrow();
      await expect(f.dispatcher('g002-update-apply', {} as never)).rejects.toThrow(); expect(f.state.puts).toBe(0);
    } finally { await f.cleanup(); }
  });
  native('a second compatible update retains gameplay writes created after the first update', async () => {
    const f = await fixture('ptr'); try {
      const first = f.make(); await f.inspect(first); await (await f.dispatcher('ptr-update-apply', first)).call();
      f.state.rows.gameplay04_receipt_v1 = [['exact-command-1', 17]];
      const second = f.make(C); await f.inspect(second); await (await f.dispatcher('ptr-update-apply', second)).call();
      expect(f.state.puts).toBe(2); expect(f.state.rows.gameplay04_receipt_v1).toEqual([['exact-command-1', 17]]);
      const records = readdirSync(f.directory).filter(name => name.endsWith('.inspection.json')).map(name => JSON.parse(readFileSync(join(f.directory, name), 'utf8')));
      expect(records.filter(record => record.value.predecessorDigest !== null)).toHaveLength(1);
    } finally { await f.cleanup(); }
  });
  native('revocation while acquiring the final credential cannot begin the pending PUT', async () => {
    const f = await fixture(); try {
      const first = f.make(); await f.inspect(first); const run = await f.dispatcher('g002-update-apply', first);
      f.setTokenHook(() => { if (readdirSync(f.directory).some(name => name.endsWith('.submission.json'))) f.runRevoked.add(run.runId); });
      await expect(run.call()).rejects.toThrow(); expect(f.state.puts).toBe(0);
      expect(readdirSync(f.directory).some(name => name.endsWith('.submission.json'))).toBe(true);
      expect(first.inspectResult()).toBeUndefined();
    } finally { await f.cleanup(); }
  });
  native('rejects altered private intent and unexpected members before submission', async () => {
    const f = await fixture(); try {
      const first = f.make(); await f.inspect(first);
      const filename = readdirSync(f.directory).find(name => name.endsWith('.inspection.json'))!;
      const file = join(f.directory, filename), document = JSON.parse(readFileSync(file, 'utf8'));
      document.value.before.program = 'a'.repeat(64); writeFileSync(file, `${updateCanonical(document)}\n`, { mode: 0o600 });
      await expect((await f.dispatcher('g002-update-apply', first)).call()).rejects.toThrow(); expect(f.state.puts).toBe(0);
    } finally { await f.cleanup(); }
  });
});

import { sealedRealmsPrivateBase } from './helpers/sealedRealmsPrivateRoots';
// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSealedRealmsProductionWorkflowEvidence as create,
  refreshSealedRealmsProductionWorkflowEvidence as refresh,
  revokeSealedRealmsProductionWorkflowEvidence as revoke,
  verifySealedRealmsProductionWorkflowEvidence as verify,
} from '../scripts/sealed-realms-production-workflow-evidence.mjs';
import { parseWorkflowEvidenceJson } from '../scripts/sealed-realms-production-workflow-evidence-json.mjs';

// Windows-only test launcher adapter: preserve real Git objects and commands,
// but supply Windows executable discovery to the production Linux Git environment.
// This does not exercise or change native Linux executable/environment attestation.
vi.mock('node:child_process', async importOriginal => {
  const actual=await importOriginal<typeof import('node:child_process')>();
  return {...actual, execFileSync: ((file: string,args: string[],options: any) => {
    if(process.platform === 'win32' && file === 'git' && options?.env?.PATH === '/usr/bin:/bin') {
      const executable=actual.execFileSync('where.exe',['git.exe'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/)[0];
      return actual.execFileSync(executable,args,{...options,env:{...options.env,PATH:process.env.PATH,SystemRoot:process.env.SystemRoot}});
    }
    return actual.execFileSync(file,args,options);
  })};
});

const API = 'https://api.github.com/repos/ael-dev3/Warpkeep';
const BINDING = 'config/releases/0.4.0-sealed-launch.json';
const INITIAL_CWD = process.cwd();
const INERT = readFileSync(new URL(`../${BINDING}`, import.meta.url), 'utf8');
const roots: string[] = [];
const json = (value: unknown) => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? `__integer_${item}` : item)
  .replace(/"__integer_([0-9]+)"/gu, '$1');
function response(url: string, value: unknown, raw?: string) {
  const body = raw ?? json(value);
  const result = new Response(body, { headers: { 'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(body)) } });
  Object.defineProperty(result, 'url', { value: url, configurable: true });
  return result;
}
function git(root: string, args: string[]) {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=Evidence Fixture',
    '-c', 'user.email=evidence@example.invalid', ...args], { cwd: root, encoding: 'utf8', timeout: process.platform === 'win32' ? 30_000 : 5_000 }).trim();
}
const repository = () => ({ id: 1273513252, name: 'Warpkeep', full_name: 'ael-dev3/Warpkeep',
  default_branch: 'main', archived: false, disabled: false, owner: { id: 183124839, login: 'ael-dev3' } });
function run(commit: string, id: number, number: number, operation = false) {
  return { id, run_attempt: 1, run_number: number, workflow_id: operation ? 200 : 100,
    name: operation ? 'Sealed Realms Production' : 'Verify',
    path: operation ? '.github/workflows/sealed-realms-production.yml' : '.github/workflows/verify.yml',
    event: operation ? 'workflow_dispatch' : 'push', status: operation ? 'in_progress' : 'completed',
    conclusion: operation ? null as string | null : 'success', head_branch: 'main', head_sha: commit,
    url: `${API}/actions/runs/${id}`, workflow_url: `${API}/actions/workflows/${operation ? 200 : 100}`,
    repository: repository(), head_repository: repository(),
    head_commit: { id: commit, tree_id: 'a'.repeat(40), message: 'actual REST commit shape' },
    actor: { id: 183124839, login: 'ael-dev3' }, check_suite_id: 123 };
}
function fixture(activated = false) {
  const root = mkdtempSync(join(tmpdir(), 'workflow-evidence-')); roots.push(root);
  git(root, ['init', '--quiet']); git(root, ['config', 'core.autocrlf', 'false']);
  mkdirSync(join(root, 'config/releases'), { recursive: true });
  writeFileSync(join(root, BINDING), INERT);
  writeFileSync(join(root, 'package.json'), '{"fixture":1}\n');
  writeFileSync(join(root, 'package-lock.json'), '{"fixture":1}\n');
  git(root, ['add', '.']); git(root, ['commit', '--quiet', '-m', 'inert S']);
  const parent = git(root, ['rev-parse', 'HEAD']);
  if (activated) {
    writeFileSync(join(root, BINDING), json({ ...JSON.parse(INERT), pagesDeploymentApproved: true, preparationSourceCommit: parent }) + '\n');
    writeFileSync(join(root, 'package.json'), '{"fixture":2}\n');
    writeFileSync(join(root, 'package-lock.json'), '{"fixture":2}\n');
    git(root, ['add', '.']); git(root, ['commit', '--quiet', '-m', 'A']);
  }
  const commit = git(root, ['rev-parse', 'HEAD']);
  git(root, ['update-ref', 'refs/remotes/origin/main', commit]);
  process.chdir(root);
  for (const [key, value] of Object.entries({ GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'ael-dev3/Warpkeep',
    GITHUB_REF: 'refs/heads/main', GITHUB_SHA: commit, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_JOB: 'operate_readonly', WARPKEEP_OPERATION: 'preflight',
    GITHUB_WORKFLOW: 'Sealed Realms Production', GITHUB_WORKFLOW_REF: 'ael-dev3/Warpkeep/.github/workflows/sealed-realms-production.yml@refs/heads/main',
    GITHUB_RUN_ID: '7001', GITHUB_RUN_ATTEMPT: '1', GITHUB_TOKEN: 'fixture-' + 'x'.repeat(32) })) vi.stubEnv(key, value);
  const operation = run(commit, 7001, 30, true);
  const main = { name: 'main', protected: true, commit: { sha: commit } };
  const runs = new Map<string, ReturnType<typeof run>[]>([[commit, [run(commit, 4001, 21)]]]);
  if (activated) runs.set(parent, [run(parent, 4000, 20)]);
  const override = { respond: undefined as undefined | ((url: string, value: any, options: RequestInit) => Response | Promise<Response>) };
  const fetch = vi.fn(async (input: string | URL | Request, options: RequestInit) => {
    const url = String(input);
    let value: unknown;
    if (url === API) value = repository();
    else if (url === `${API}/branches/main`) value = main;
    else if (url === operation.url) value = operation;
    else if (url.startsWith(`${API}/actions/workflows/verify.yml/runs?`)) {
      const source = new URL(url).searchParams.get('head_sha')!;
      const members = runs.get(source) ?? [];
      value = { total_count: members.length, workflow_runs: members };
    } else {
      const match = /\/actions\/runs\/([0-9]+)(?:\/attempts\/([0-9]+))?$/u.exec(url);
      const selected = [...runs.values()].flat().find(item => String(item.id) === match?.[1]);
      if (!selected) throw new Error('unexpected fixed endpoint');
      value = selected;
    }
    return override.respond ? override.respond(url, structuredClone(value), options) : response(url, value);
  });
  vi.stubGlobal('fetch', fetch);
  return { root, commit, parent, runs, operation, main, fetch, override };
}
afterEach(() => {
  process.chdir(INITIAL_CWD); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
  vi.doUnmock('../scripts/sealed-realms-production-workflow-private-state.mjs'); vi.resetModules();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe.sequential('fixed workflow Verify evidence', () => {
  it.each([
    ['activation-evidence-generate', 'operate_readonly'],
    ['activation-evidence-inspect', 'operate'],
    ['preflight', 'operate'],
    ['arbitrary', 'operate_readonly'],
  ])('rejects mismatched operation/job before GitHub reads: %s/%s', async (operation, job) => {
    const commit='a'.repeat(40), fetch=vi.fn();
    for(const [key,value] of Object.entries({GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'ael-dev3/Warpkeep',GITHUB_REF:'refs/heads/main',GITHUB_SHA:commit,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_JOB:job,GITHUB_WORKFLOW:'Sealed Realms Production',GITHUB_WORKFLOW_REF:'ael-dev3/Warpkeep/.github/workflows/sealed-realms-production.yml@refs/heads/main',GITHUB_RUN_ID:'7001',GITHUB_RUN_ATTEMPT:'1',GITHUB_TOKEN:'x'.repeat(32),WARPKEEP_OPERATION:operation}))vi.stubEnv(key,value);
    vi.stubGlobal('fetch',fetch);
    await expect(create({ workflowInputSha: commit })).rejects.toThrow('SEALED_REALMS_WORKFLOW_EVIDENCE_CONTEXT_INVALID');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('invalidates captured evidence when the operation changes within the same readonly job', async () => {
    const f = fixture(); const scope = await create({ workflowInputSha: f.commit });
    vi.stubEnv('WARPKEEP_OPERATION', 'activation-evidence-inspect');
    expect(() => verify(scope, f.commit)).toThrow(/WORKFLOW_EVIDENCE/u);
    await expect(refresh(scope)).rejects.toThrow('SEALED_REALMS_WORKFLOW_EVIDENCE_UNAVAILABLE');
    revoke(scope);
  }, process.platform === 'win32' ? 60000 : 10000);

  it.each([false, true])('loads source and actual activated-parent proofs through fixed GETs: %s', async activated => {
    const f = fixture(activated); const scope = await create({ workflowInputSha: f.commit });
    expect(Object.keys(scope)).toEqual([]); expect(Object.isFrozen(scope)).toBe(true);
    expect(verify(scope, f.commit)).toEqual({ verifiedSha: f.commit });
    if (activated) expect(verify(scope, f.parent)).toEqual({ verifiedSha: f.parent });
    expect(() => verify(scope, '0'.repeat(40))).toThrow(/WORKFLOW_EVIDENCE/u);
    for (const [url, options] of f.fetch.mock.calls) {
      expect(String(url).startsWith(`${API}`)).toBe(true);
      expect(options).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store', credentials: 'omit' });
    }
    const before = f.fetch.mock.calls.length;
    await refresh(scope); expect(f.fetch.mock.calls.length).toBeGreaterThan(before);
    revoke(scope); expect(() => verify(scope, f.commit)).toThrow(/SCOPE_INVALID/u);
  });
  it('selects the newest authenticated run number, never an arbitrary older success', async () => {
    const f = fixture(); f.runs.get(f.commit)!.unshift(run(f.commit, 3999, 19));
    const scope = await create({ workflowInputSha: f.commit });
    expect(verify(scope, f.commit).verifiedSha).toBe(f.commit);
    expect(f.fetch.mock.calls.some(([url]) => String(url) === `${API}/actions/runs/3999`)).toBe(false);
    revoke(scope);
  });
  it.each(['success', 'failure', 'in_progress'])('rejects a newly created Verify run during readback: %s', async status => {
    const f = fixture(); let changed = false;
    f.override.respond = (url, value) => {
      if (!changed && url.endsWith('/attempts/1')) {
        changed = true;
        const newer = run(f.commit, 4002, 22);
        newer.status = status === 'in_progress' ? status : 'completed';
        newer.conclusion = status === 'in_progress' ? null : status;
        f.runs.get(f.commit)!.push(newer);
      }
      return response(url, value);
    };
    await expect(create({ workflowInputSha: f.commit })).rejects.toThrow(/WORKFLOW_EVIDENCE_UNAVAILABLE/u);
    expect(changed).toBe(true);
  });
  it.each(['failure', 'in-progress', 'duplicate-id', 'tied-number', 'wrong-sha', 'wrong-repository',
    'fork', 'wrong-owner', 'pull-request', 'wrong-branch', 'wrong-workflow', 'older-attempt', 'replace-attempt',
    'missing', 'pagination', 'duplicate-json', 'quoted-id', 'fraction-id', 'unsafe-number', 'bad-utf8',
    'redirect', 'wrong-origin', 'wrong-content-type', 'oversize', 'wrong-length', 'http-failure', 'extra-parent'])(
    'rejects untrusted or incomplete evidence without a proof: %s', async scenario => {
      const f = fixture(scenario === 'extra-parent');
      if (scenario === 'extra-parent') {
        // A declared parent is only a locator when it is the actual sole parent.
        writeFileSync(join(f.root, BINDING), json({ ...JSON.parse(INERT), pagesDeploymentApproved: true, preparationSourceCommit: '0'.repeat(40) }));
        git(f.root, ['add', BINDING]); git(f.root, ['commit', '--quiet', '-m', 'wrong declared parent']);
        f.commit = git(f.root, ['rev-parse', 'HEAD']); git(f.root, ['update-ref', 'refs/remotes/origin/main', f.commit]);
        vi.stubEnv('GITHUB_SHA', f.commit);
      }
      const selected = f.runs.get(f.commit)?.[0];
      if (scenario === 'failure' || scenario === 'in-progress') {
        f.runs.get(f.commit)!.unshift(run(f.commit, 3999, 19));
        selected!.status = scenario === 'failure' ? 'completed' : 'in_progress';
        selected!.conclusion = scenario === 'failure' ? 'failure' : null;
      }
      if (scenario === 'duplicate-id') f.runs.get(f.commit)!.push({ ...selected! });
      if (scenario === 'tied-number') f.runs.get(f.commit)!.push(run(f.commit, 4999, 21));
      if (scenario === 'missing') f.runs.set(f.commit, []);
      let directReads = 0;
      f.override.respond = (url, value) => {
        if (url.startsWith(`${API}/actions/workflows/verify.yml/runs?`) && value.workflow_runs.length) {
          const current = value.workflow_runs.at(-1);
          if (scenario === 'wrong-sha') current.head_sha = '0'.repeat(40);
          if (scenario === 'wrong-repository') current.repository.id++;
          if (scenario === 'fork') current.head_repository.id++;
          if (scenario === 'wrong-owner') current.repository.owner.id++;
          if (scenario === 'pull-request') current.event = 'pull_request';
          if (scenario === 'wrong-branch') current.head_branch = 'topic';
          if (scenario === 'wrong-workflow') current.path = '.github/workflows/other.yml';
        }
        if (url === `${API}/actions/runs/4001`) {
          directReads++;
          if (scenario === 'older-attempt' || (scenario === 'replace-attempt' && directReads === 2)) value.run_attempt = 2;
        }
        if (url === API) {
          if (scenario === 'duplicate-json') return response(url, null, json(value).replace('"id":1273513252', '"id":1273513252,"id":1273513252'));
          if (scenario === 'quoted-id') return response(url, null, json(value).replace('"id":1273513252', '"id":"1273513252"'));
          if (scenario === 'fraction-id') return response(url, null, json(value).replace('"id":1273513252', '"id":1273513252.0'));
          if (scenario === 'unsafe-number') return response(url, null, json(value).replace('"archived":false', '"unused":9007199254740993,"archived":false'));
          if (scenario === 'oversize') return response(url, null, ' '.repeat(512 * 1024 + 1));
          if (scenario === 'http-failure') return new Response('private failure', { status: 503 });
          if (scenario === 'bad-utf8') { const result = new Response(new Uint8Array([255]), { headers: { 'content-type': 'application/json' } }); Object.defineProperty(result, 'url', { value: url }); return result; }
          const result = response(url, value);
          if (scenario === 'pagination') result.headers.set('link', '<https://api.github.com/next>; rel="next"');
          if (scenario === 'redirect') Object.defineProperty(result, 'redirected', { value: true });
          if (scenario === 'wrong-origin') Object.defineProperty(result, 'url', { value: 'https://example.invalid/data' });
          if (scenario === 'wrong-content-type') result.headers.set('content-type', 'text/plain');
          if (scenario === 'wrong-length') result.headers.set('content-length', '1');
          return result;
        }
        return response(url, value);
      };
      await expect(create({ workflowInputSha: f.commit })).rejects.toThrow(/SEALED_REALMS_WORKFLOW_EVIDENCE_/u);
    });
  it('invalidates stale proofs before a failed refresh or changed workflow identity', async () => {
    const f = fixture(); const scope = await create({ workflowInputSha: f.commit });
    f.runs.get(f.commit)![0].conclusion = 'failure';
    await expect(refresh(scope)).rejects.toThrow(/WORKFLOW_EVIDENCE/u);
    expect(() => verify(scope, f.commit)).toThrow(/WORKFLOW_EVIDENCE/u);
    f.runs.get(f.commit)![0].conclusion = 'success'; await refresh(scope);
    vi.stubEnv('GITHUB_RUN_ATTEMPT', '2'); expect(() => verify(scope, f.commit)).toThrow(/WORKFLOW_EVIDENCE/u);
    revoke(scope);
  });
  it('requires real context and rejects caller callbacks/forged scopes before transport', async () => {
    const f = fixture(); vi.stubEnv('GITHUB_TOKEN', '');
    await expect(create({ workflowInputSha: f.commit })).rejects.toThrow(/CONTEXT_INVALID/u);
    await expect(create({ workflowInputSha: f.commit, verifyEvidence: () => ({ verifiedSha: f.commit }) } as never)).rejects.toThrow();
    expect(() => verify({} as never, f.commit)).toThrow(/SCOPE_INVALID/u); expect(f.fetch).not.toHaveBeenCalled();
  });
  it('rejects proxy, hidden and accessor inputs without evaluating caller hooks', async () => {
    const f = fixture(); const hook = vi.fn(() => f.commit);
    const proxy = Proxy.revocable({}, {}); proxy.revoke();
    for (const input of [proxy.proxy, Object.defineProperty({}, 'workflowInputSha', { value: f.commit }),
      Object.defineProperty({}, 'workflowInputSha', { enumerable: true, get: hook })]) {
      await expect(create(input as never)).rejects.toThrow('SEALED_REALMS_WORKFLOW_EVIDENCE_INVALID');
    }
    expect(hook).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled();
  });
  it('bounds a stalled fixed fetch and rejects late completion', async () => {
    const f = fixture(); vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    f.override.respond = () => new Promise<Response>(() => {});
    const operation = create({ workflowInputSha: f.commit });
    const assertion = expect(operation).rejects.toThrow(/WORKFLOW_EVIDENCE_UNAVAILABLE/u);
    await vi.advanceTimersByTimeAsync(30_001); await assertion;
  });
  it('rejects stale proof age and clears authority on concurrent refresh cancellation', async () => {
    const f = fixture(); const scope = await create({ workflowInputSha: f.commit });
    vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 31_000);
    expect(() => verify(scope, f.commit)).toThrow(); vi.restoreAllMocks();
    f.override.respond = () => new Promise<Response>(() => {});
    const first = refresh(scope); const rejected = expect(first).rejects.toThrow(/WORKFLOW_EVIDENCE/u);
    await expect(refresh(scope)).rejects.toThrow(/SCOPE_INVALID/u); await rejected;
    expect(() => verify(scope, f.commit)).toThrow(/SCOPE_INVALID/u);
  });
  it('preserves exact large identifier lexemes and rejects duplicate nested keys', () => {
    expect(parseWorkflowEvidenceJson(Buffer.from('{"id":9007199254740993}'))).toEqual({ id: '9007199254740993' });
    expect(() => parseWorkflowEvidenceJson(Buffer.from('{"repository":{"id":1,"\\u0069d":2}}'))).toThrow();
  });
  it('ignores replacement objects and never accepts a substituted S tree as its source', async () => {
    const f = fixture();
    writeFileSync(join(f.root, BINDING), json({ ...JSON.parse(INERT), pagesDeploymentApproved: true, preparationSourceCommit: '0'.repeat(40) }));
    git(f.root, ['add', BINDING]);
    const tree = git(f.root, ['write-tree']);
    const replacement = git(f.root, ['commit-tree', tree, '-m', 'synthetic substituted source']);
    git(f.root, ['replace', f.commit, replacement]);
    expect(JSON.parse(git(f.root, ['show', `HEAD:${BINDING}`])).pagesDeploymentApproved).toBe(true);
    const scope = await create({ workflowInputSha: f.commit });
    expect(verify(scope, f.commit)).toEqual({ verifiedSha: f.commit }); revoke(scope);
  });
  it('rejects a real local HEAD replacement while asynchronous evidence is being read', async () => {
    const f = fixture(); let changed = false;
    f.override.respond = (url, value) => {
      if (!changed && url.endsWith('/attempts/1')) {
        changed = true; git(f.root, ['commit', '--quiet', '--allow-empty', '-m', 'changed while reading']);
      }
      return response(url, value);
    };
    await expect(create({ workflowInputSha: f.commit })).rejects.toThrow(/WORKFLOW_EVIDENCE_UNAVAILABLE/u);
    expect(changed).toBe(true);
  });
});

async function privateResolver() {
  const home = mkdtempSync(join(tmpdir(), 'workflow-evidence-private-')); roots.push(home);
  const directories = ['runtime', 'cache', 'audit/private'].map(name =>
    join(sealedRealmsPrivateBase(home), name));
  for (const directory of directories) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const resolved: unknown[] = [];
  vi.doMock('../scripts/sealed-realms-production-workflow-private-state.mjs', async () => {
    const actual = await vi.importActual<typeof import('../scripts/sealed-realms-production-private-state.mjs')>(
      '../scripts/sealed-realms-production-private-state.mjs');
    return { resolveSealedRealmsProductionWorkflowPrivateState: () => {
      const state = actual.createSealedRealmsProductionPrivateState({ reportedHome: home,
        testOnlyOwnerUid: statSync(home).uid, testOnlyAllowPlatformMode: true, testOnlyFsync: () => {} });
      resolved.push(state); return state;
    } };
  });
  return { resolved, directories };
}

const ENTRY_CASES = [
  ['g001', 'G001', 'preflight', 'runSealedRealmsProductionG001Operation'],
  ['g002', 'G002', 'g002-publish-inspect', 'runSealedRealmsProductionG002Operation'],
  ['ptr', 'Ptr', 'ptr-publish-inspect', 'runSealedRealmsProductionPtrOperation'],
  ['activation', 'Activation', 'activation-evidence-inspect', 'runSealedRealmsProductionActivationOperation'],
] as const;
describe.sequential('actual workflow composition with fixed Verify transport', () => {
  it.each(ENTRY_CASES)('refreshes %s evidence before its actual dispatcher and preserves runtime guards', async (lane, label, operation, runName) => {
    const f = fixture(); vi.stubEnv('WARPKEEP_OPERATION', operation);
    if (lane === 'g002' || lane === 'ptr') {
      const module = await import(`../scripts/sealed-realms-production-${lane}-workflow-entry.mjs`);
      await expect(module[`createSealedRealmsProduction${label}WorkflowRuntime`]({operation,workflowInputSha:f.commit})).rejects.toThrow('SEALED_REALMS_WORKFLOW_EVIDENCE_CONTEXT_INVALID');
      expect(f.fetch).not.toHaveBeenCalled(); return;
    }
    const privateState = await privateResolver();
    vi.stubGlobal('WebSocket', class WebSocket {});
    const module = await import(`../scripts/sealed-realms-production-${lane}-workflow-entry.mjs`);
    const factory = module[`createSealedRealmsProduction${label}WorkflowRuntime`];
    const runtime = await factory({ operation, workflowInputSha: f.commit });
    const before = f.fetch.mock.calls.length;
    await expect(module[runName]({ runtime, operation, workflowInputSha: '0'.repeat(40) })).rejects.toThrow(/WORKFLOW_SOURCE_INVALID/u);
    expect(f.fetch).toHaveBeenCalledTimes(before);
    const result = module[runName]({ runtime, operation, workflowInputSha: f.commit });
    if (lane === 'g001') await expect(result).resolves.toEqual({ operation: 'preflight', status: 'preflight-inspected' });
    else await expect(result).rejects.toThrow('SEALED_REALMS_DISPATCH_LANE_FAILED');
    const discovery = f.fetch.mock.calls.filter(([url]) => String(url).includes('/actions/workflows/verify.yml/runs?'));
    expect(discovery).toHaveLength(4); expect(privateState.resolved).toHaveLength(1);
    const finished = f.fetch.mock.calls.length;
    await expect(module[runName]({ runtime, operation, workflowInputSha: f.commit })).rejects.toThrow(/RUNTIME_CONSUMED/u);
    expect(f.fetch).toHaveBeenCalledTimes(finished);
  });
  it('refuses a newer failed Verify at run time before a previously constructed lane can proceed', async () => {
    const f = fixture(); const privateState = await privateResolver();
    const module = await import('../scripts/sealed-realms-production-g001-workflow-entry.mjs');
    const runtime = await module.createSealedRealmsProductionG001WorkflowRuntime({ operation: 'preflight', workflowInputSha: f.commit });
    const newer = run(f.commit, 4002, 22); newer.conclusion = 'failure'; f.runs.get(f.commit)!.push(newer);
    await expect(module.runSealedRealmsProductionG001Operation({ runtime, operation: 'preflight', workflowInputSha: f.commit }))
      .rejects.toThrow('SEALED_REALMS_WORKFLOW_EVIDENCE_UNAVAILABLE');
    expect(privateState.resolved).toHaveLength(1);
    for (const directory of privateState.directories) expect(readdirSync(directory)).toEqual([]);
  });
  it('rejects missing fixed program provenance after genuine fixed GitHub evidence readback', async () => {
    const f = fixture(); vi.stubEnv('WARPKEEP_OPERATION','activation-evidence-generate'); vi.stubEnv('GITHUB_JOB','operate'); const privateState = await privateResolver();
    const module = await import('../scripts/sealed-realms-production-activation-workflow-entry.mjs');
    await expect(module.createSealedRealmsProductionActivationWorkflowRuntime({ operation: 'activation-evidence-generate', workflowInputSha: f.commit }))
      .rejects.toThrow('SEALED_REALMS_RECOVERY_PROGRAM_ARTIFACTS_INVALID');
    expect(privateState.resolved).toHaveLength(1);
    for (const directory of privateState.directories) expect(readdirSync(directory)).toEqual([]);
    expect(f.fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
  });
});

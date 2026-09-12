// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  git: vi.fn(), lstat: vi.fn(), realpath: vi.fn(), node: vi.fn(), prepare: vi.fn(), adapter: vi.fn(),
  cleanup: vi.fn(), dispose: vi.fn(), dispatch: vi.fn(), lane: vi.fn(), authenticate: vi.fn(),
  evidence: vi.fn(), refresh: vi.fn(), revoke: vi.fn(), issue: vi.fn(), attest: vi.fn(),
  completion: vi.fn(), adoption: vi.fn(), bridge: vi.fn(), provider: vi.fn(),
  privateState: Object.freeze({ privateState: true }), store: Object.freeze({ store: true }),
  account: { uid: 1000, gid: 1000, username: 'warpkeep', homedir: '/home/warpkeep' },
}));
vi.mock('node:child_process', () => ({ execFileSync: m.git }));
vi.mock('node:fs', () => ({ lstatSync: m.lstat, realpathSync: m.realpath }));
vi.mock('node:os', () => ({ userInfo: () => m.account }));
vi.mock('../scripts/local-binding-bounded-file.mjs', () => ({ readLocalBindingBoundedFile: m.node }));
vi.mock('../scripts/genesis002-production-publisher.mjs', () => ({ prepareGenesis002SourceBuiltArtifact: m.prepare }));
vi.mock('../scripts/ptr-production-existing-update-adapter.mjs', () => ({
  createG002ProductionExistingUpdateAdapter: m.adapter, exportG002ExistingUpdateCompletion: m.completion,
  captureG002ExistingUpdateAdoption: m.adoption,
}));
vi.mock('../scripts/sealed-realms-production-source-authority.mjs', () => ({
  authenticateSealedRealmsProductionSourceAuthority: m.authenticate,
  sourceCommitFromSealedRealmsProductionAuthority: (a: { sha: string }) => a.sha,
  preparationSourceCommitFromSealedRealmsProductionAuthority: (a: { sha: string }) => a.sha,
}));
vi.mock('../scripts/sealed-realms-production-workflow-evidence.mjs', () => ({
  createSealedRealmsProductionWorkflowEvidence: m.evidence, refreshSealedRealmsProductionWorkflowEvidence: m.refresh,
  revokeSealedRealmsProductionWorkflowEvidence: m.revoke, verifySealedRealmsProductionWorkflowEvidence: vi.fn(),
}));
vi.mock('../scripts/sealed-realms-production-workflow-authority.mjs', () => ({
  issueSealedRealmsProductionWorkflowPermit: m.issue, attestSealedRealmsProductionWorkflowPermit: m.attest,
}));
vi.mock('../scripts/sealed-realms-production-workflow-private-state.mjs', () => ({ resolveSealedRealmsProductionWorkflowPrivateState: () => m.privateState }));
vi.mock('../scripts/sealed-realms-production-continuation.mjs', () => ({ createSealedRealmsProductionContinuationStore: () => m.store }));
vi.mock('../scripts/sealed-realms-production-auth-bridge-state.mjs', () => ({ createSealedRealmsProductionAuthBridgeState: m.bridge }));
vi.mock('../scripts/sealed-realms-production-bridge-provider.mjs', () => ({ createSealedRealmsProductionBridgeProvider: m.provider }));
vi.mock('../scripts/sealed-realms-production-reconciliation.mjs', () => ({ createSealedRealmsProductionPublicationReconciler: () => ({}) }));
vi.mock('../scripts/sealed-realms-production-g002-lane-entry.mjs', () => ({
  createSealedRealmsProductionG002Lane: m.lane,
  createSealedRealmsProductionG002DispatchContext: (value: unknown) => value,
  createSealedRealmsProductionG002Dispatcher: () => ({ dispatch: m.dispatch }),
}));
import { createSealedRealmsProductionG002WorkflowRuntime as create,
  runSealedRealmsProductionG002Operation as run } from '../scripts/sealed-realms-production-g002-workflow-entry.mjs';
const sha = 'a'.repeat(40), tree = 'b'.repeat(40);
const materializationParent = '/home/warpkeep/.warpkeep/private/sealed-realms-v1/runtime';
const saved = new Map<string, PropertyDescriptor | undefined>();
beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(m.account, { uid: 1000, gid: 1000, username: 'warpkeep', homedir: '/home/warpkeep' });
  for (const [name, value] of Object.entries({ platform: 'linux', arch: 'x64',
    execPath: '/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node',
    getuid: (): number => 1000, geteuid: (): number => 1000, getgid: (): number => 1000, getegid: (): number => 1000 })) {
    saved.set(name, Object.getOwnPropertyDescriptor(process, name)); Object.defineProperty(process, name, { configurable: true, value });
  }
  vi.stubEnv('GITHUB_RUN_ID', '12345'); vi.stubEnv('GITHUB_RUN_ATTEMPT', '2');
  vi.stubEnv('WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT', '/home/warpkeep/.warpkeep/release-preparation-v1/cache/genesis002');
  vi.stubEnv('WARPKEEP_SPACETIME_CLI_CONFIG_PATH', '/home/warpkeep/.warpkeep/private/production-admin-v1/spacetime-cli.toml');
  vi.stubEnv('SPACETIME_BIN', '/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/spacetime-2.6.1/spacetimedb-cli');
  m.realpath.mockImplementation(path => path);
  m.lstat.mockImplementation((path: string, options?: { bigint?: boolean }) => {
    const file = path.endsWith('.toml') || path.endsWith('/node') || path.endsWith('/spacetimedb-cli');
    const number = (value: number) => options?.bigint ? BigInt(value) : value;
    return { isSymbolicLink: () => false, isDirectory: () => !file, isFile: () => file,
      uid: number(path === '/' || path === '/home' ? 0 : 1000), gid: number(1000),
      dev: number(1), ino: number(2), nlink: number(1),
      mode: number(path.endsWith('.toml') ? 0o600 : path.endsWith('/node') ? 0o500 : 0o700) };
  });
  m.node.mockReturnValue({ identity: { node: 'fixed' } }); m.git.mockReturnValue(tree);
  m.authenticate.mockImplementation(({ operation }) => ({ operation, mode: 'S', sha }));
  m.evidence.mockResolvedValue({ evidence: true }); m.issue.mockResolvedValue({ permit: true });
  m.prepare.mockReturnValue({ cleanup: m.cleanup }); m.adapter.mockReturnValue({ dispose: m.dispose });
  m.bridge.mockReturnValue({}); m.provider.mockReturnValue({}); m.lane.mockReturnValue({});
  m.dispatch.mockImplementation(async ({ operation }) => ({ operation, status: operation.endsWith('inspect') ? 'update-inspected' : 'completed' }));
  m.completion.mockReturnValue({ completion: true }); m.adoption.mockResolvedValue({ adoption: true });
});
afterEach(() => {
  for (const [name, descriptor] of saved) if (descriptor) Object.defineProperty(process, name, descriptor); else Reflect.deleteProperty(process, name);
  saved.clear(); vi.unstubAllEnvs();
});

it.each(['g002-update-inspect', 'g002-update-apply'] as const)('constructs %s through the fixed G002 producer and cleans owned resources', async operation => {
  const runtime = await create({ operation, workflowInputSha: sha });
  expect(m.prepare).toHaveBeenCalledWith(expect.objectContaining({ sourceCommit: sha,
    materializationParent,
    dependencyCacheRoot: '/home/warpkeep/.warpkeep/release-preparation-v1/cache/genesis002',
    cliConfigSourcePath: '/home/warpkeep/.warpkeep/private/production-admin-v1/spacetime-cli.toml',
    executable: '/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/spacetime-2.6.1/spacetimedb-cli',
    environment: { PATH: '/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin:/usr/bin:/bin' } }));
  expect(m.prepare.mock.calls[0][0].reattestSource()).toBe(sha);
  expect(m.adapter).toHaveBeenCalledWith({ authority: m.authenticate.mock.results[0].value, privateState: m.privateState,
    artifact: m.prepare.mock.results[0].value, observation: { sourceTree: tree, runId: '12345', runAttempt: '2' } });
  expect(m.lane.mock.calls[0][0].existingUpdate).toBe(m.adapter.mock.results[0].value);
  expect(await run({ runtime, operation, workflowInputSha: sha })).toEqual({ operation, status: operation.endsWith('inspect') ? 'update-inspected' : 'completed' });
  expect(m.cleanup).toHaveBeenCalledOnce(); expect(m.dispose).toHaveBeenCalledOnce(); expect(m.revoke).toHaveBeenCalledOnce();
  expect(m.adoption).toHaveBeenCalledTimes(operation.endsWith('apply') ? 1 : 0);
  await expect(run({ runtime, operation, workflowInputSha: sha })).rejects.toThrow('SEALED_REALMS_G002_WORKFLOW_RUNTIME_CONSUMED');
});
it('reopens authentic completion before recovering a lost acknowledgement and retaining post observation', async () => {
  m.dispatch.mockRejectedValue(Object.assign(new Error('lost acknowledgement'), { code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' }));
  const operation = 'g002-update-apply', runtime = await create({ operation, workflowInputSha: sha });
  await expect(run({ runtime, operation, workflowInputSha: sha })).resolves.toEqual({ operation, status: 'completed' });
  expect(m.attest).toHaveBeenCalledWith(expect.objectContaining({ phase: 'continuation-terminal', runId: '12345', runAttempt: '2' }));
  expect(m.completion).toHaveBeenCalledWith({ adapter: m.adapter.mock.results[0].value,
    authority: m.authenticate.mock.results[0].value, store: m.store });
  expect(m.adoption).toHaveBeenCalledWith({ adapter: m.adapter.mock.results[0].value,
    authority: m.authenticate.mock.results[0].value, store: m.store, permit: { permit: true }, runId: '12345', runAttempt: '2' });
  expect(m.dispatch).toHaveBeenCalledOnce(); expect(m.cleanup).toHaveBeenCalledOnce();
});
it.each(['constructor', 'dispatch', 'completion', 'post'])('cleans owned resources on %s failure without inventing completion', async phase => {
  const operation = 'g002-update-apply';
  if (phase === 'constructor') m.adapter.mockImplementation(() => { throw new Error('adapter failure'); });
  if (phase === 'dispatch') { m.dispatch.mockRejectedValue(Object.assign(new Error('dispatch failure'), { code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' })); m.completion.mockImplementation(() => { throw new Error('no completion'); }); }
  if (phase === 'completion') m.completion.mockImplementation(() => { throw new Error('no completion'); });
  if (phase === 'post') m.adoption.mockRejectedValue(new Error('post unavailable'));
  if (phase === 'constructor') await expect(create({ operation, workflowInputSha: sha })).rejects.toThrow();
  else { const runtime = await create({ operation, workflowInputSha: sha }); await expect(run({ runtime, operation, workflowInputSha: sha })).rejects.toThrow(); }
  expect(m.cleanup).toHaveBeenCalledOnce(); expect(m.dispose).toHaveBeenCalledTimes(phase === 'constructor' ? 0 : 1);
  expect(m.revoke).toHaveBeenCalledOnce();
  if (phase !== 'post') expect(m.adoption).not.toHaveBeenCalled();
});
it('rejects changed configuration and source when the owning artifact reattests', async () => {
  const runtime = await create({ operation: 'g002-update-inspect', workflowInputSha: sha });
  const reattest = m.prepare.mock.calls[0][0].reattestSource;
  m.node.mockReturnValue({ identity: { node: 'different' } }); expect(reattest).toThrow('SEALED_REALMS_G002_WORKFLOW_UPDATE_CONFIG_INVALID');
  m.node.mockReturnValue({ identity: { node: 'fixed' } });
  m.authenticate.mockReturnValue({ operation: 'g002-update-inspect', mode: 'S', sha: 'c'.repeat(40) });
  expect(reattest).toThrow('SEALED_REALMS_G002_WORKFLOW_SOURCE_INVALID');
  m.authenticate.mockImplementation(({ operation }) => ({ operation, mode: 'S', sha }));
  await run({ runtime, operation: 'g002-update-inspect', workflowInputSha: sha });
});
it.each(['account', 'missing-path', 'symlink', 'writable-parent', 'credential-mode', 'node-owner'])(
  'rejects invalid %s before opening a source-built artifact', async kind => {
    if (kind === 'account') m.account.homedir = '/home/other';
    if (kind === 'missing-path') vi.stubEnv('WARPKEEP_SPACETIME_CLI_CONFIG_PATH', '');
    const original = m.lstat.getMockImplementation()!;
    m.lstat.mockImplementation((path: string, options?: { bigint?: boolean }) => ({ ...original(path, options),
      ...(kind === 'symlink' && path.endsWith('.toml') ? { isSymbolicLink: () => true } : {}),
      ...(kind === 'writable-parent' && path === '/home' ? { mode: 0o777 } : {}),
      ...(kind === 'credential-mode' && path.endsWith('.toml') ? { mode: 0o644 } : {}),
      ...(kind === 'node-owner' && path.endsWith('/node') ? { uid: 0 } : {}),
    }));
    await expect(create({ operation: 'g002-update-inspect', workflowInputSha: sha }))
      .rejects.toThrow('SEALED_REALMS_G002_WORKFLOW_UPDATE_CONFIG_INVALID');
    expect(m.prepare).not.toHaveBeenCalled(); expect(m.adapter).not.toHaveBeenCalled(); expect(m.revoke).toHaveBeenCalledOnce();
  });

it.each(['missing', 'symlink', 'noncanonical', 'file', 'owner', 'group', 'mode'])(
  'rejects a %s fixed materialization parent before opening a source-built artifact', async kind => {
    const original = m.lstat.getMockImplementation()!;
    m.lstat.mockImplementation((path: string, options?: { bigint?: boolean }) => {
      if (path !== materializationParent) return original(path, options);
      if (kind === 'missing') throw Object.assign(new Error('missing directory'), { code: 'ENOENT' });
      const number = (value: number) => options?.bigint ? BigInt(value) : value;
      return { ...original(path, options),
        ...(kind === 'symlink' ? { isSymbolicLink: () => true } : {}),
        ...(kind === 'file' ? { isDirectory: () => false, isFile: () => true } : {}),
        ...(kind === 'owner' ? { uid: number(0) } : {}),
        ...(kind === 'group' ? { gid: number(0) } : {}),
        ...(kind === 'mode' ? { mode: number(0o750) } : {}),
      };
    });
    if (kind === 'noncanonical') m.realpath.mockImplementation(path => path === materializationParent ? '/elsewhere' : path);
    await expect(create({ operation: 'g002-update-inspect', workflowInputSha: sha }))
      .rejects.toThrow('SEALED_REALMS_G002_WORKFLOW_UPDATE_CONFIG_INVALID');
    expect(m.prepare).not.toHaveBeenCalled(); expect(m.adapter).not.toHaveBeenCalled(); expect(m.revoke).toHaveBeenCalledOnce();
  });

it('revalidates the fixed materialization parent identity when the source artifact reopens', async () => {
  const operation = 'g002-update-inspect', runtime = await create({ operation, workflowInputSha: sha });
  const original = m.lstat.getMockImplementation()!;
  m.lstat.mockImplementation((path: string, options?: { bigint?: boolean }) => ({ ...original(path, options),
    ...(path === materializationParent ? { ino: options?.bigint ? 3n : 3 } : {}),
  }));
  expect(m.prepare.mock.calls[0][0].reattestSource).toThrow('SEALED_REALMS_G002_WORKFLOW_UPDATE_CONFIG_INVALID');
  m.lstat.mockImplementation(original);
  await run({ runtime, operation, workflowInputSha: sha });
  expect(m.cleanup).toHaveBeenCalledOnce(); expect(m.dispose).toHaveBeenCalledOnce();
});

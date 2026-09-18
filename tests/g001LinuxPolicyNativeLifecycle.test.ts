// @vitest-environment node
// Workflow/source/compiler boundaries are explicit mocks. Descriptor ownership
// uses an actual temporary file; this is not native production authority proof.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => {
  const sep = process.platform === 'win32' ? '\\' : '/';
  const root = `${process.env.TEMP ?? '/tmp'}${sep}warpkeep-policy-lifecycle-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const home = `${root}${sep}home`, privateRoot = `${home}${sep}private`;
  return { root, home, privateRoot, opened: 0, cleanup: 0, calls: [] as string[], fd: undefined as number | undefined,
    clock: 0, advanceDuringAttestation: false, sourceChanged: false, childFailed: false, secretChanged: false,
    censusMismatch: false, retainedChanged: false,
    source: { sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), operatorBlob: 'c'.repeat(40), operatorSha256: 'd'.repeat(64) } };
});
vi.mock('../scripts/genesis001-linux-policy-boundary.mjs', () => ({
  G001_POLICY_ENV: { HOME: fixture.home }, G001_POLICY_HOME: fixture.home,
  G001_POLICY_ROOT: fixture.privateRoot, G001_POLICY_NODE: 'fixed-node', G001_POLICY_NODE_SHA: 'e'.repeat(64),
  attestPolicyHost: () => ({}), attestPolicySource: () => { if (fixture.sourceChanged) throw Error('source changed'); return fixture.source; },
  policyFail: () => { throw Error('G001_LINUX_POLICY_NATIVE_FAILED'); },
  policyDirectory: (path: string) => ({ path }), policyPrivateAncestors: () => {}, policyOwnedRun: () => {},
  policyDigest: () => 'f'.repeat(64), policyGit: () => Buffer.from('source fixture'),
  cleanupPolicyRun: (_root: string, runId: string) => { fixture.cleanup++; return { outcome: 'cleaned', runId, namespaceInventorySha256: 'f'.repeat(64) }; },
}));
vi.mock('../scripts/local-binding-bounded-file.mjs', () => ({
  readLocalBindingBoundedFile: () => { if (fixture.advanceDuringAttestation) fixture.clock = 30001; return { body: Buffer.from('attested fixture'), identity: {} }; },
}));
vi.mock('../scripts/auth-bridge-notification-prepared-deploy-closure.mjs', () => ({
  verifyAuthBridgeNotificationPreparedDeployClosure: () => ({}),
}));
vi.mock('../scripts/genesis001-linux-census-attempt.mjs', () => ({
  verifyGenesis001LinuxCensusRetainedSamples: () => {
    fixture.calls.push('reopen'); if (fixture.retainedChanged) throw Error('retained bytes changed');
  },
  createGenesis001LinuxCensusAttempt: (receipt: any, execution: any, completedAt: string) => {
    expect(fixture.cleanup).toBe(1); expect(execution.execution.runId).toBe(receipt.attemptId);
    return { receiptDigest: '7'.repeat(64), completedAt, first: { admitted: 'private-fid' } };
  },
  retainGenesis001LinuxCensusRecord: (_root: string, basename: string) => {
    expect(basename).toBe('complete.json'); fixture.calls.push('retain-complete');
  },
}));
vi.mock('../scripts/sealed-realms-production-workflow-evidence.mjs', () => ({
  verifySealedRealmsProductionWorkflowEvidence: (scope: unknown, commit: string) => {
    if (scope !== fixture.source || commit !== fixture.source.sourceCommit || fixture.clock > 30000) throw Error('expired or invalid evidence');
    return { verifiedSha: commit };
  },
}));
vi.mock('node:fs', async original => {
  const actual = await original<typeof import('node:fs')>();
  const stat = (value: any) => Object.assign(Object.create(Object.getPrototypeOf(value)), value,
    { uid: 1000n, gid: 1000n, mode: 0o100600n });
  return { ...actual,
    openSync: (...args: Parameters<typeof actual.openSync>) => { fixture.opened++; return actual.openSync(...args); },
    lstatSync: (path: string, options: any) => stat(actual.lstatSync(path, options)),
    fstatSync: (fd: number, options: any) => stat(actual.fstatSync(fd, options)),
  };
});
vi.mock('../scripts/local-binding-runtime-process.mjs', async () => {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  return { runLocalBindingBoundedProcess: async (_executable: string, args: string[], options: any) => {
    expect(JSON.stringify({ args, env: options.env, request: options.fd3 })).not.toContain('synthetic-credential');
    if (args[0] === '--experimental-vm-modules') {
      fixture.calls.push('build'); expect(fixture.opened).toBe(0); expect(options.inheritedFd4).toBeUndefined();
      return { stdout: JSON.stringify({ bundleSha256: '1'.repeat(64), bundleBytes: 100,
        sourceClosureSha256: '2'.repeat(64), dependencyClosureSha256: '3'.repeat(64) }) + '\n', stderr: '' };
    }
    fixture.calls.push('observe'); fixture.fd = options.inheritedFd4;
    expect(Number.isInteger(fixture.fd)).toBe(true);
    if (fixture.childFailed) throw Error('child failed');
    if (fixture.secretChanged) writeFileSync(join(fixture.privateRoot, 'admin-token'), 'synthetic-credential-replaced-with-longer-bytes');
    const request = JSON.parse(options.fd3);
    if (request.kind === 'census') {
      expect(options.timeout).toBe(600000); expect(options.maxOutput).toBe(4 * 1024 * 1024);
      expect(readFileSync(options.inheritedFd4, 'utf8')).toBe('synthetic-workflow-census-credential-000000');
      expect(JSON.stringify({ args, env: options.env, request: options.fd3 })).not.toContain('synthetic-workflow-census-credential');
      return { stdout: JSON.stringify({ sourceCommit: fixture.source.sourceCommit, mutationSubmitted: false,
        repositoryRoot: process.cwd(), attemptId: request.runId, githubRunId: fixture.censusMismatch ? '999' : request.githubRunId,
        githubRunAttempt: request.githubRunAttempt, first: {}, second: {} }) + '\n', stderr: '' };
    }
    return { stdout: JSON.stringify({ sourceCommit: fixture.source.sourceCommit, mutationSubmitted: false }) + '\n', stderr: '' };
  } };
});
import { fstatSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertFixedLinuxG001PolicyPreparation, disposeFixedLinuxG001PolicyObservation,
  executeFixedLinuxG001PolicyObservation, prepareFixedLinuxG001PolicyObservation,
  assertFixedLinuxG001CensusPreparation, executeFixedLinuxG001CensusObservation,
  prepareFixedLinuxG001CensusObservation } from '../scripts/genesis001-linux-policy-native.mjs';

describe('opaque policy preparation and final descriptor boundary', () => {
  beforeEach(() => {
    fixture.clock = 0; fixture.advanceDuringAttestation = false; fixture.opened = 0; fixture.cleanup = 0; fixture.calls = []; fixture.fd = undefined;
    fixture.sourceChanged = false; fixture.childFailed = false; fixture.secretChanged = false;
    fixture.censusMismatch = false; fixture.retainedChanged = false;
    mkdirSync(fixture.privateRoot, { recursive: true });
    writeFileSync(join(fixture.privateRoot, 'admin-token'), 'synthetic-credential-for-test-only-000000', { mode: 0o600 });
    vi.stubEnv('WARPKEEP_OPERATION', 'g001-policy-observe'); vi.stubEnv('GITHUB_JOB', 'operate_readonly');
    vi.stubEnv('GITHUB_SHA', fixture.source.sourceCommit);
  });
  afterEach(() => { vi.unstubAllEnvs(); rmSync(fixture.root, { recursive: true, force: true }); });
  it('prepares without reading a credential and consumes the opaque handle once after a separate boundary', async () => {
    const handle = await prepareFixedLinuxG001PolicyObservation();
    expect(Object.keys(handle)).toEqual([]); expect(Object.isFrozen(handle)).toBe(true);
    expect(fixture.opened).toBe(0); assertFixedLinuxG001PolicyPreparation(handle);
    const result = await executeFixedLinuxG001PolicyObservation(handle, fixture.source as never);
    expect(result.cleanup.outcome).toBe('cleaned'); expect(fixture.calls).toEqual(['build', 'observe']);
    expect(fixture.cleanup).toBe(1); expect(() => fstatSync(fixture.fd!)).toThrow();
    await expect(executeFixedLinuxG001PolicyObservation(handle, fixture.source as never)).rejects.toThrow('G001_LINUX_POLICY_NATIVE_FAILED');
    disposeFixedLinuxG001PolicyObservation(handle); expect(fixture.cleanup).toBe(1);
  });
  it('disposes a preparation after a workflow refresh failure without opening its credential', async () => {
    const handle = await prepareFixedLinuxG001PolicyObservation();
    disposeFixedLinuxG001PolicyObservation(handle);
    expect(fixture.cleanup).toBe(1); expect(fixture.opened).toBe(0);
    await expect(executeFixedLinuxG001PolicyObservation(handle, fixture.source as never)).rejects.toThrow();
  });
  it('refuses changed source before opening a descriptor and cleans the authentic preparation', async () => {
    const handle = await prepareFixedLinuxG001PolicyObservation(); fixture.sourceChanged = true;
    await expect(executeFixedLinuxG001PolicyObservation(handle, fixture.source as never)).rejects.toThrow();
    expect(fixture.opened).toBe(0); expect(fixture.cleanup).toBe(1);
  });
  it.each(['childFailed', 'secretChanged'] as const)('closes the parent descriptor and emits no receipt after %s', async mode => {
    const handle = await prepareFixedLinuxG001PolicyObservation(); fixture[mode] = true;
    await expect(executeFixedLinuxG001PolicyObservation(handle, fixture.source as never)).rejects.toThrow();
    expect(fixture.cleanup).toBe(1); expect(() => fstatSync(fixture.fd!)).toThrow();
  });
  it('refuses evidence that expires during expensive attestation before opening the credential', async () => {
    const handle = await prepareFixedLinuxG001PolicyObservation(); fixture.advanceDuringAttestation = true;
    await expect(executeFixedLinuxG001PolicyObservation(handle, fixture.source as never)).rejects.toThrow();
    expect(fixture.clock).toBe(30001); expect(fixture.opened).toBe(0);
    expect(fixture.calls).toEqual(['build']); expect(fixture.cleanup).toBe(1);
  });
  it('rejects forged authority and caller-selected preparation arguments before any build', async () => {
    await expect(executeFixedLinuxG001PolicyObservation({} as never, fixture.source as never)).rejects.toThrow();
    await expect(Reflect.apply(prepareFixedLinuxG001PolicyObservation, undefined, [{ secretPath: 'alternate' }])).rejects.toThrow();
    expect(() => disposeFixedLinuxG001PolicyObservation({} as never)).toThrow(); expect(fixture.calls).toEqual([]);
  });
  it('retains a complete census only after exact readback/cleanup and returns no private collection data', async () => {
    vi.stubEnv('WARPKEEP_OPERATION', 'g001-freeze-census'); vi.stubEnv('GITHUB_RUN_ID', '1234'); vi.stubEnv('GITHUB_RUN_ATTEMPT', '1');
    const handle = await prepareFixedLinuxG001CensusObservation('synthetic-workflow-census-credential-000000');
    assertFixedLinuxG001CensusPreparation(handle);
    expect(() => assertFixedLinuxG001PolicyPreparation(handle as never)).toThrow();
    await expect(executeFixedLinuxG001PolicyObservation(handle as never, fixture.source as never)).rejects.toThrow();
    const result = await executeFixedLinuxG001CensusObservation(handle, fixture.source as never);
    expect(result).toMatchObject({ profile: 'warpkeep-g001-linux-census-completed-v1', githubRunId: '1234',
      githubRunAttempt: '1', receiptDigest: '7'.repeat(64), mutationSubmitted: false });
    expect(JSON.stringify(result)).not.toMatch(/private-fid|admitted|first|token/iu);
    expect(fixture.calls).toEqual(['build', 'observe', 'reopen', 'reopen', 'retain-complete']);
    expect(() => fstatSync(fixture.fd!)).toThrow();
    await expect(executeFixedLinuxG001CensusObservation(handle, fixture.source as never)).rejects.toThrow();
    disposeFixedLinuxG001PolicyObservation(handle);
  });
  it.each(['censusMismatch', 'retainedChanged', 'childFailed'] as const)('leaves a failed census unselected after %s', async mode => {
    vi.stubEnv('WARPKEEP_OPERATION', 'g001-freeze-census'); vi.stubEnv('GITHUB_RUN_ID', '1234'); vi.stubEnv('GITHUB_RUN_ATTEMPT', '1');
    const handle = await prepareFixedLinuxG001CensusObservation('synthetic-workflow-census-credential-000000'); fixture[mode] = true;
    await expect(executeFixedLinuxG001CensusObservation(handle, fixture.source as never)).rejects.toThrow();
    expect(fixture.calls).not.toContain('retain-complete'); expect(fixture.cleanup).toBe(1);
    expect(() => fstatSync(fixture.fd!)).toThrow();
    disposeFixedLinuxG001PolicyObservation(handle);
  });
  it('refuses a missing workflow identity before opening the census administrator credential', async () => {
    vi.stubEnv('WARPKEEP_OPERATION', 'g001-freeze-census'); vi.stubEnv('GITHUB_RUN_ID', ''); vi.stubEnv('GITHUB_RUN_ATTEMPT', '1');
    const handle = await prepareFixedLinuxG001CensusObservation('synthetic-workflow-census-credential-000000');
    await expect(executeFixedLinuxG001CensusObservation(handle, fixture.source as never)).rejects.toThrow();
    expect(fixture.opened).toBe(0); expect(fixture.calls).toEqual(['build']);
    disposeFixedLinuxG001PolicyObservation(handle);
  });
  it('does not materialize the copied census credential after workflow evidence expires', async () => {
    vi.stubEnv('WARPKEEP_OPERATION', 'g001-freeze-census'); vi.stubEnv('GITHUB_RUN_ID', '1234'); vi.stubEnv('GITHUB_RUN_ATTEMPT', '1');
    const handle = await prepareFixedLinuxG001CensusObservation('synthetic-workflow-census-credential-000000');
    fixture.advanceDuringAttestation = true;
    await expect(executeFixedLinuxG001CensusObservation(handle, fixture.source as never)).rejects.toThrow();
    expect(fixture.opened).toBe(0); expect(fixture.calls).toEqual(['build']);
    disposeFixedLinuxG001PolicyObservation(handle);
  });
  it.each(['', 'short', 'x'.repeat(513), `x${'y'.repeat(31)}\n`])('rejects an invalid copied protected credential before building', async secret => {
    vi.stubEnv('WARPKEEP_OPERATION', 'g001-freeze-census');
    await expect(prepareFixedLinuxG001CensusObservation(secret)).rejects.toThrow();
    expect(fixture.calls).toEqual([]); expect(fixture.opened).toBe(0);
  });
});

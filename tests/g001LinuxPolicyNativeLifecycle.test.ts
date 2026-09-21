// @vitest-environment node
// Workflow/source/compiler boundaries are explicit mocks. Descriptor ownership
// uses an actual temporary file; this is not native production authority proof.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => {
  const sep = process.platform === 'win32' ? '\\' : '/';
  const root = `${process.env.TEMP ?? '/tmp'}${sep}warpkeep-policy-lifecycle-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const home = `${root}${sep}home`, privateRoot = `${home}${sep}private`;
  return { root, home, privateRoot, opened: 0, cleanup: 0, calls: [] as string[], fd: undefined as number | undefined,
    clock: 0, advanceDuringAttestation: false, sourceChanged: false, childFailed: false, childStderr: undefined as string | undefined, secretChanged: false,
    censusMismatch: false, retainedChanged: false, complete: undefined as any,
    authority: { mode: 'S', operation: 'activation-evidence-inspect' }, permit: Object.freeze({}),
    refreshes: 0, liveAttestations: 0, failAttestation: 0, revoked: false,
    prepareFailure: '',
    afterCollection: undefined as undefined | (() => void), changeRetainedDigest: false,
    source: { sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), operatorBlob: 'c'.repeat(40), operatorSha256: 'd'.repeat(64) } };
});
vi.mock('../scripts/genesis001-linux-policy-boundary.mjs', async original => ({
  G001_POLICY_ENV: { HOME: fixture.home }, G001_POLICY_HOME: fixture.home,
  G001_POLICY_ROOT: fixture.privateRoot, G001_POLICY_NODE: 'fixed-node', G001_POLICY_NODE_SHA: 'e'.repeat(64),
  attestPolicyHost: () => { if (fixture.prepareFailure === 'host') throw Error('PRIVATE_DIAGNOSTIC_DO_NOT_COPY'); return {}; },
  attestPolicySource: () => { if (fixture.sourceChanged || fixture.prepareFailure === 'source') throw Error('PRIVATE_DIAGNOSTIC_DO_NOT_COPY'); return fixture.source; },
  policyFail: (await original<typeof import('../scripts/genesis001-linux-policy-boundary.mjs')>()).policyFail,
  policyDirectory: (path: string) => ({ path }),
  policyPrivateAncestors: () => { if (fixture.prepareFailure === 'private-root') throw Error('PRIVATE_DIAGNOSTIC_DO_NOT_COPY'); },
  policyOwnedRun: () => {},
  policyDigest: () => 'f'.repeat(64), policyGit: () => Buffer.from('source fixture'),
  cleanupPolicyRun: (_root: string, runId: string) => { fixture.cleanup++; return { outcome: 'cleaned', runId, namespaceInventorySha256: 'f'.repeat(64) }; },
}));
vi.mock('../scripts/local-binding-bounded-file.mjs', () => ({
  readLocalBindingBoundedFile: (path: string) => {
    if ((path.endsWith('first.mjs') || path.endsWith('spacetimedb\\genesis002\\dist\\bundle.js')
      || path.endsWith('spacetimedb/genesis002/dist/bundle.js')) && fixture.prepareFailure === 'prepared-verification') {
      throw Error('PRIVATE_DIAGNOSTIC_DO_NOT_COPY');
    }
    if (fixture.advanceDuringAttestation) fixture.clock = 30001;
    return { body: Buffer.from('attested fixture'), identity: {} };
  },
}));
vi.mock('../scripts/auth-bridge-notification-prepared-deploy-closure.mjs', () => ({
  verifyAuthBridgeNotificationPreparedDeployClosure: () => {
    if (fixture.prepareFailure === 'closure') throw Error('PRIVATE_DIAGNOSTIC_DO_NOT_COPY');
    return {};
  },
}));
vi.mock('../scripts/genesis001-linux-census-attempt.mjs', () => ({
  verifyGenesis001LinuxCensusRetainedSamples: () => {
    fixture.calls.push('reopen'); if (fixture.retainedChanged) throw Error('retained bytes changed');
  },
  createGenesis001LinuxCensusAttempt: (receipt: any, execution: any, completedAt: string) => {
    expect(fixture.cleanup).toBe(1); expect(execution.execution.runId).toBe(receipt.attemptId);
    return { ...receipt, receiptDigest: '7'.repeat(64), completedAt, first: { admitted: 'private-fid' } };
  },
  retainGenesis001LinuxCensusRecord: (_root: string, basename: string, value: any) => {
    expect(basename).toBe('complete.json'); fixture.calls.push('retain-complete'); fixture.complete = value;
  },
  readFixedLinuxG001CensusAttempt: (attemptId: string, sourceCommit: string) => {
    if (fixture.retainedChanged || !fixture.complete || fixture.complete.attemptId !== attemptId
      || fixture.complete.sourceCommit !== sourceCommit) throw Error('retained evidence changed');
    return { selector: { profile: 'warpkeep-g001-linux-census-completed-v1', sourceCommit, attemptId,
      githubRunId: fixture.complete.githubRunId, githubRunAttempt: fixture.complete.githubRunAttempt,
      receiptDigest: (fixture.changeRetainedDigest ? '8' : '7').repeat(64),
      completedAt: fixture.complete.completedAt, mutationSubmitted: false }, receipt: fixture.complete };
  },
}));
vi.mock('../scripts/sealed-realms-production-workflow-evidence.mjs', () => ({
  refreshSealedRealmsProductionWorkflowEvidence: async (scope: unknown) => {
    if (scope !== fixture.source || fixture.revoked) throw Error('invalid workflow evidence');
    fixture.refreshes++; fixture.clock = 0;
  },
  verifySealedRealmsProductionWorkflowEvidence: (scope: unknown, commit: string) => {
    if (scope !== fixture.source || commit !== fixture.source.sourceCommit || fixture.clock > 30000 || fixture.revoked) throw Error('expired or invalid evidence');
    return { verifiedSha: commit };
  },
}));
vi.mock('../scripts/sealed-realms-production-source-authority.mjs', () => ({
  sourceCommitFromSealedRealmsProductionAuthority: (authority: unknown) => {
    if (authority !== fixture.authority) throw Error('invalid source authority');
    return fixture.source.sourceCommit;
  },
}));
vi.mock('../scripts/sealed-realms-production-workflow-authority.mjs', () => ({
  assertSealedRealmsProductionWorkflowPermit: (permit: unknown) => {
    if (permit !== fixture.permit) throw Error('invalid permit'); return permit;
  },
  attestSealedRealmsProductionActivationRead: async (input: any) => {
    fixture.liveAttestations++;
    if (input.sourceAuthority !== fixture.authority || input.permit !== fixture.permit
      || input.runId !== process.env.GITHUB_RUN_ID || input.runAttempt !== process.env.GITHUB_RUN_ATTEMPT
      || fixture.liveAttestations === fixture.failAttestation) throw Error('live attestation failed');
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
      if (fixture.prepareFailure === 'materialization') throw Error('PRIVATE_DIAGNOSTIC_DO_NOT_COPY');
      return { stdout: JSON.stringify({ bundleSha256: '1'.repeat(64), bundleBytes: 100,
        sourceClosureSha256: '2'.repeat(64), dependencyClosureSha256: '3'.repeat(64) }) + '\n', stderr: '' };
    }
    fixture.calls.push('observe'); fixture.fd = options.inheritedFd4;
    expect(Number.isInteger(fixture.fd)).toBe(true);
    if (fixture.childFailed) throw Error('child failed');
    if (fixture.childStderr !== undefined) return { stdout: '', stderr: fixture.childStderr };
    if (fixture.secretChanged) writeFileSync(join(fixture.privateRoot, 'admin-token'), 'synthetic-credential-replaced-with-longer-bytes');
    const request = JSON.parse(options.fd3);
    if (request.kind === 'census') {
      expect(options.timeout).toBe(600000); expect(options.maxOutput).toBe(4 * 1024 * 1024);
      expect(readFileSync(options.inheritedFd4, 'utf8')).toBe('synthetic-workflow-census-credential-000000');
      expect(JSON.stringify({ args, env: options.env, request: options.fd3 })).not.toContain('synthetic-workflow-census-credential');
      fixture.afterCollection?.();
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
  prepareFixedLinuxG001CensusObservation, executeFixedLinuxG001ActivationCensusObservation,
  readFixedLinuxG001ActivationCensusEvidence } from '../scripts/genesis001-linux-policy-native.mjs';

describe('opaque policy preparation and final descriptor boundary', () => {
  beforeEach(() => {
    fixture.clock = 0; fixture.advanceDuringAttestation = false; fixture.opened = 0; fixture.cleanup = 0; fixture.calls = []; fixture.fd = undefined;
    fixture.sourceChanged = false; fixture.childFailed = false; fixture.childStderr = undefined; fixture.secretChanged = false;
    fixture.censusMismatch = false; fixture.retainedChanged = false;
    fixture.complete = undefined; fixture.refreshes = 0; fixture.liveAttestations = 0; fixture.failAttestation = 0;
    fixture.revoked = false; fixture.afterCollection = undefined; fixture.changeRetainedDigest = false;
    fixture.prepareFailure = '';
    fixture.authority.operation = 'activation-evidence-inspect';
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
    await expect(executeFixedLinuxG001PolicyObservation(handle, fixture.source as never)).rejects.toMatchObject({ diagnostic: 'g001-prepared-verification' });
    expect(fixture.opened).toBe(0); expect(fixture.cleanup).toBe(1);
  });
  it.each(['childFailed', 'secretChanged'] as const)('closes the parent descriptor and emits no receipt after %s', async mode => {
    const handle = await prepareFixedLinuxG001PolicyObservation(); fixture[mode] = true;
    await expect(executeFixedLinuxG001PolicyObservation(handle, fixture.source as never)).rejects.toMatchObject({
      diagnostic: mode === 'childFailed' ? 'g001-observation' : 'g001-receipt' });
    expect(fixture.cleanup).toBe(1); expect(() => fstatSync(fixture.fd!)).toThrow();
  });
  it('retains an allowlisted admitted diagnostic when runner stderr adds warning noise', async () => {
    vi.stubEnv('WARPKEEP_OPERATION', 'g001-freeze-census'); vi.stubEnv('GITHUB_RUN_ID', '1234'); vi.stubEnv('GITHUB_RUN_ATTEMPT', '1');
    fixture.childStderr = 'node: warning: runner notice\nG001_LINUX_POLICY_NATIVE_FAILED:g001-admitted-enumeration\n';
    const handle = await prepareFixedLinuxG001CensusObservation('synthetic-workflow-census-credential-000000');
    await expect(executeFixedLinuxG001CensusObservation(handle, fixture.source as never)).rejects.toMatchObject({
      diagnostic: 'g001-admitted-enumeration' });
    expect(fixture.cleanup).toBe(1); expect(() => fstatSync(fixture.fd!)).toThrow();
  });
  it('refuses evidence that expires during expensive attestation before opening the credential', async () => {
    const handle = await prepareFixedLinuxG001PolicyObservation(); fixture.advanceDuringAttestation = true;
    await expect(executeFixedLinuxG001PolicyObservation(handle, fixture.source as never)).rejects.toMatchObject({ diagnostic: 'g001-authority' });
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
    await expect(prepareFixedLinuxG001CensusObservation(secret)).rejects.toMatchObject({
      message: 'G001_LINUX_POLICY_NATIVE_FAILED', diagnostic: 'g001-credential' });
    expect(fixture.calls).toEqual([]); expect(fixture.opened).toBe(0);
  });

  it.each(['host', 'source', 'closure', 'private-root', 'materialization', 'prepared-verification'])(
    'identifies failed native preparation at %s without exposing its private error', async stage => {
      fixture.prepareFailure = stage;
      vi.stubEnv('WARPKEEP_OPERATION', 'g001-freeze-census');
      const failure = await prepareFixedLinuxG001CensusObservation('synthetic-workflow-census-credential-000000')
        .then(() => { throw Error('preparation unexpectedly succeeded'); }, error => error);
      expect(failure).toMatchObject({ message: 'G001_LINUX_POLICY_NATIVE_FAILED', diagnostic: `g001-${stage}` });
      expect(failure.cause).toBeUndefined();
      expect(`${String(failure)}${JSON.stringify(failure)}`).not.toMatch(/PRIVATE_DIAGNOSTIC|synthetic-workflow|\/home|\\private/);
      expect(fixture.opened).toBe(0);
    });

  function activation(operation = 'activation-evidence-inspect') {
    fixture.authority.operation = operation;
    vi.stubEnv('WARPKEEP_OPERATION', operation);
    vi.stubEnv('GITHUB_JOB', operation === 'activation-evidence-generate' ? 'operate' : 'operate_readonly');
    vi.stubEnv('GITHUB_RUN_ID', '1234'); vi.stubEnv('GITHUB_RUN_ATTEMPT', '1');
    return { sourceAuthority: fixture.authority as never, workflowPermit: fixture.permit as never,
      workflowEvidence: fixture.source as never };
  }
  it.each(['activation-evidence-inspect', 'activation-evidence-generate'])(
    'collects under the actual %s run and returns only genuine process-local evidence', async operation => {
      const input = activation(operation);
      const handle = await prepareFixedLinuxG001CensusObservation('synthetic-workflow-census-credential-000000');
      expect(fixture.opened).toBe(0); expect(fixture.calls).toEqual(['build']);
      // The diagnostic operation cannot select this activation preparation.
      await expect(executeFixedLinuxG001CensusObservation(handle, fixture.source as never)).rejects.toThrow();
      fixture.afterCollection = () => { fixture.clock = 60001; };
      const cap = await executeFixedLinuxG001ActivationCensusObservation(handle, input);
      expect(Object.keys(cap)).toEqual([]); expect(Object.isFrozen(cap)).toBe(true);
      expect(fixture.refreshes).toBe(2); expect(fixture.liveAttestations).toBe(2);
      expect(fixture.calls).toEqual(['build', 'observe', 'reopen', 'reopen', 'retain-complete']);
      expect(process.env.WARPKEEP_OPERATION).toBe(operation);
      const binding = { sourceAuthority: input.sourceAuthority, workflowPermit: input.workflowPermit };
      const retained = readFixedLinuxG001ActivationCensusEvidence(cap, binding);
      expect(retained.selector.githubRunId).toBe('1234'); expect(retained.receipt).toBe(fixture.complete);
      expect(() => readFixedLinuxG001ActivationCensusEvidence({ ...cap } as never, binding)).toThrow();
      expect(() => readFixedLinuxG001ActivationCensusEvidence(retained as never, binding)).toThrow();
      await expect(executeFixedLinuxG001ActivationCensusObservation(handle, input)).rejects.toThrow();
      expect(fixture.calls.filter(value => value === 'observe')).toHaveLength(1);
      expect(() => fstatSync(fixture.fd!)).toThrow(); disposeFixedLinuxG001PolicyObservation(handle);
    });

  it.each(['forged-source', 'wrong-operation', 'forged-permit', 'forged-evidence', 'wrong-job', 'changed-run-context', 'failed-live-run'])(
    'refuses inline %s before opening the administrator credential', async scenario => {
      const input = activation();
      const handle = await prepareFixedLinuxG001CensusObservation('synthetic-workflow-census-credential-000000');
      if (scenario === 'forged-source') input.sourceAuthority = {} as never;
      if (scenario === 'wrong-operation') fixture.authority.operation = 'activation-evidence-generate';
      if (scenario === 'forged-permit') input.workflowPermit = {} as never;
      if (scenario === 'forged-evidence') input.workflowEvidence = {} as never;
      if (scenario === 'wrong-job') vi.stubEnv('GITHUB_JOB', 'operate');
      if (scenario === 'changed-run-context') vi.stubEnv('WARPKEEP_OPERATION', 'g001-freeze-census');
      if (scenario === 'failed-live-run') fixture.failAttestation = 1;
      await expect(executeFixedLinuxG001ActivationCensusObservation(handle, input)).rejects.toThrow();
      expect(fixture.opened).toBe(0); expect(fixture.calls).toEqual(['build']);
      disposeFixedLinuxG001PolicyObservation(handle);
    });

  it.each(['operation', 'job', 'attempt', 'source', 'revoked-evidence', 'failed-final-live-run', 'retained-digest'])(
    'mints no inline proof after %s changes during collection', async scenario => {
      const input = activation();
      const handle = await prepareFixedLinuxG001CensusObservation('synthetic-workflow-census-credential-000000');
      fixture.afterCollection = () => {
        if (scenario === 'operation') vi.stubEnv('WARPKEEP_OPERATION', 'g001-freeze-census');
        if (scenario === 'job') vi.stubEnv('GITHUB_JOB', 'operate');
        if (scenario === 'attempt') vi.stubEnv('GITHUB_RUN_ATTEMPT', '2');
        if (scenario === 'source') fixture.sourceChanged = true;
        if (scenario === 'revoked-evidence') fixture.revoked = true;
        if (scenario === 'failed-final-live-run') fixture.failAttestation = 2;
        if (scenario === 'retained-digest') fixture.changeRetainedDigest = true;
      };
      await expect(executeFixedLinuxG001ActivationCensusObservation(handle, input)).rejects.toThrow();
      if (['revoked-evidence', 'failed-final-live-run', 'retained-digest'].includes(scenario)) {
        expect(fixture.complete).toBeDefined(); // Retain actual completed read; it is not promoted to proof.
      }
      expect(fixture.calls.filter(value => value === 'observe')).toHaveLength(1);
      expect(() => fstatSync(fixture.fd!)).toThrow(); disposeFixedLinuxG001PolicyObservation(handle);
      await expect(executeFixedLinuxG001ActivationCensusObservation(handle, input)).rejects.toThrow();
    });

  it.each(['forged-source', 'forged-permit', 'expired', 'revoked', 'changed-operation', 'changed-attempt', 'changed-source', 'retained-bytes', 'retained-digest'])(
    'reopens exact same-run evidence and rejects %s at the private join', async scenario => {
      const input = activation();
      const handle = await prepareFixedLinuxG001CensusObservation('synthetic-workflow-census-credential-000000');
      const cap = await executeFixedLinuxG001ActivationCensusObservation(handle, input);
      const binding = { sourceAuthority: input.sourceAuthority, workflowPermit: input.workflowPermit };
      if (scenario === 'forged-source') binding.sourceAuthority = {} as never;
      if (scenario === 'forged-permit') binding.workflowPermit = {} as never;
      if (scenario === 'expired') fixture.clock = 30001;
      if (scenario === 'revoked') fixture.revoked = true;
      if (scenario === 'changed-operation') vi.stubEnv('WARPKEEP_OPERATION', 'g001-freeze-census');
      if (scenario === 'changed-attempt') vi.stubEnv('GITHUB_RUN_ATTEMPT', '2');
      if (scenario === 'changed-source') fixture.sourceChanged = true;
      if (scenario === 'retained-bytes') fixture.retainedChanged = true;
      if (scenario === 'retained-digest') fixture.changeRetainedDigest = true;
      expect(() => readFixedLinuxG001ActivationCensusEvidence(cap, binding)).toThrow();
      disposeFixedLinuxG001PolicyObservation(handle);
    });
});

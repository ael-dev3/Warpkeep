// @vitest-environment node
// Explicit workflow/native mocks establish sequencing only. Live completed-run
// authority and private POSIX evidence are tested by their own boundaries.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ calls: [] as string[], failAt: '', permit: 0, source: 'a'.repeat(40),
  secret: 'synthetic-workflow-census-credential-000000', handle: Object.freeze({}), evidence: Object.freeze({}) }));
vi.mock('../scripts/sealed-realms-production-workflow-evidence.mjs', () => ({
  createSealedRealmsProductionWorkflowEvidence: async () => {
    expect(process.env.WARPKEEP_PRODUCTION_ADMIN_TOKEN).toBeUndefined(); fixture.calls.push('evidence'); return fixture.evidence;
  },
  refreshSealedRealmsProductionWorkflowEvidence: async () => { fixture.calls.push('refresh'); },
  verifySealedRealmsProductionWorkflowEvidence: (_scope: unknown, source: string) => ({ verifiedSha: source }),
  revokeSealedRealmsProductionWorkflowEvidence: () => { fixture.calls.push('revoke'); },
}));
vi.mock('../scripts/sealed-realms-production-source-authority.mjs', async original => ({
  ...await original<object>(),
  authenticateSealedRealmsProductionSourceAuthority: (input: any) => {
    expect(input.operation).toBe('g001-freeze-census'); expect(input.workflowInputSha).toBe(fixture.source);
    fixture.calls.push('source'); return { mode: fixture.failAt === 'activated' ? 'A' : 'S' };
  },
}));
vi.mock('../scripts/sealed-realms-production-workflow-authority.mjs', async original => ({
  ...await original<object>(),
  issueSealedRealmsProductionWorkflowPermit: async (input: any) => {
    expect(input.runId).toBe('1234'); expect(input.runAttempt).toBe('1');
    fixture.calls.push('permit'); fixture.permit++;
    if ((fixture.failAt === 'initial-permit' && fixture.permit === 1)
      || (fixture.failAt === 'final-permit' && fixture.permit === 3)) throw Error('workflow not active');
    return {};
  },
}));
vi.mock('../scripts/genesis001-linux-policy-native.mjs', async original => ({
  ...await original<object>(),
  prepareFixedLinuxG001CensusObservation: async (secret: string) => {
    expect(secret).toBe(fixture.secret); expect(process.env.WARPKEEP_PRODUCTION_ADMIN_TOKEN).toBeUndefined();
    fixture.calls.push('build'); if (fixture.failAt === 'build') throw Error('build failed'); return fixture.handle;
  },
  executeFixedLinuxG001CensusObservation: async (handle: unknown, evidence: unknown) => {
    expect(handle).toBe(fixture.handle); expect(evidence).toBe(fixture.evidence); fixture.calls.push('collect');
    if (fixture.failAt === 'collect') throw Error('collection failed');
    return Object.freeze({ profile: 'warpkeep-g001-linux-census-completed-v1', sourceCommit: fixture.source,
      attemptId: '1'.repeat(32), githubRunId: '1234', githubRunAttempt: '1', receiptDigest: '2'.repeat(64),
      completedAt: '2026-09-19T00:01:00.000Z', mutationSubmitted: false });
  },
  disposeFixedLinuxG001PolicyObservation: (handle: unknown) => { expect(handle).toBe(fixture.handle); fixture.calls.push('dispose'); },
}));
vi.mock('../scripts/sealed-realms-production-workflow-private-state.mjs', () => ({
  resolveSealedRealmsProductionWorkflowPrivateState: () => { throw Error('legacy state path must not run'); },
}));
import { createSealedRealmsProductionG001WorkflowRuntime, runSealedRealmsProductionG001Operation } from '../scripts/sealed-realms-production-g001-workflow-entry.mjs';
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const input = () => ({ operation: 'g001-freeze-census' as const, workflowInputSha: fixture.source });
beforeEach(() => {
  Object.defineProperty(process, 'platform', { ...originalPlatform, value: 'linux' });
  fixture.calls = []; fixture.failAt = ''; fixture.permit = 0;
  vi.stubEnv('WARPKEEP_PRODUCTION_ADMIN_TOKEN', fixture.secret); vi.stubEnv('GITHUB_RUN_ID', '1234'); vi.stubEnv('GITHUB_RUN_ATTEMPT', '1');
  vi.stubEnv('GITHUB_TOKEN', 'synthetic-github-token');
});
afterEach(() => { Object.defineProperty(process, 'platform', originalPlatform); vi.unstubAllEnvs(); });
it('scrubs before building, refreshes source/workflow at both collection boundaries and returns only the safe selector', async () => {
  const runtime = await createSealedRealmsProductionG001WorkflowRuntime(input());
  const result = await runSealedRealmsProductionG001Operation({ runtime, ...input() });
  expect(result).toMatchObject({ operation: 'g001-freeze-census', status: 'completed', censusAttempt: {
    attemptId: '1'.repeat(32), githubRunId: '1234', githubRunAttempt: '1', mutationSubmitted: false } });
  expect(fixture.calls).toEqual(['evidence', 'build', 'refresh', 'source', 'permit', 'refresh', 'source', 'permit',
    'collect', 'refresh', 'source', 'permit', 'revoke', 'dispose']);
  expect(JSON.stringify(result)).not.toContain('synthetic');
  await expect(runSealedRealmsProductionG001Operation({ runtime, ...input() })).rejects.toThrow('RUNTIME_CONSUMED');
});
it.each(['build', 'initial-permit', 'activated'])('never collects after %s failure and cleans authentic preparation', async failure => {
  fixture.failAt = failure;
  await expect(createSealedRealmsProductionG001WorkflowRuntime(input())).rejects.toThrow();
  expect(fixture.calls).not.toContain('collect'); expect(fixture.calls).toContain('revoke');
  if (failure !== 'build') expect(fixture.calls).toContain('dispose');
  expect(process.env.WARPKEEP_PRODUCTION_ADMIN_TOKEN).toBeUndefined();
});
it.each(['collect', 'final-permit'])('does not announce success after %s failure or replay the spent runtime', async failure => {
  const runtime = await createSealedRealmsProductionG001WorkflowRuntime(input()); fixture.failAt = failure;
  await expect(runSealedRealmsProductionG001Operation({ runtime, ...input() })).rejects.toThrow();
  expect(fixture.calls.slice(-2)).toEqual(['revoke', 'dispose']);
  await expect(runSealedRealmsProductionG001Operation({ runtime, ...input() })).rejects.toThrow('RUNTIME_CONSUMED');
  expect(fixture.calls.filter(call => call === 'collect')).toHaveLength(1);
});
it('rejects non-native execution before preparation while clearing the passed workflow secret', async () => {
  Object.defineProperty(process, 'platform', { ...originalPlatform, value: 'win32' });
  await expect(createSealedRealmsProductionG001WorkflowRuntime(input())).rejects.toThrow('NATIVE_REQUIRED');
  expect(fixture.calls).toEqual(['evidence', 'revoke']); expect(process.env.WARPKEEP_PRODUCTION_ADMIN_TOKEN).toBeUndefined();
});

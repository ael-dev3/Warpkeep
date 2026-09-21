// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ source: vi.fn(), metadata: vi.fn(), run: vi.fn(), prior: vi.fn(), local: vi.fn(), directory: vi.fn(), history: vi.fn(), file: vi.fn() }));
vi.mock('../scripts/recovery-attestation-source.mjs', () => ({ readRecoveryAttestationSource: mocks.source }));
vi.mock('../scripts/recovery-workflow-run-context.mjs', () => ({ readRecoveryWorkflowArtifactMetadata: mocks.metadata, readRecoveryWorkflowRunContext: mocks.run }));
vi.mock('../scripts/generate-warpkeep-deployment-attestation.mjs', () => ({ verifyWarpkeepDeploymentAttestation: mocks.local }));
vi.mock('../scripts/recovery-workflow-private-directory.mjs', () => ({ resolveRecoveryWorkflowPrivateDirectory: mocks.directory, findRecoveryWorkflowPriorDirectory: mocks.prior }));
vi.mock('../scripts/recovery-claim-handoff.mjs', () => ({ readRecoveryClaimHandoffHistory: mocks.history }));
vi.mock('../scripts/local-binding-bounded-file.mjs', () => ({ readLocalBindingBoundedFile: mocks.file }));
import { readRecoveryWorkflowCurrentContext as read, readRecoveryWorkflowPriorContext as prior } from '../scripts/recovery-workflow-current-context.mjs';
const identity = { candidateCommit: 'a'.repeat(40), candidateTree: 'b'.repeat(40) };
const metadata = { pagesRunId: '123', pagesRunAttempt: '1', sourceVerifyRunId: '456', sourceVerifyRunAttempt: '2',
  candidateCommit: identity.candidateCommit, artifactId: '789', advertisedArchiveSha256: '3'.repeat(64), artifactEtag: 'stable' };
const local = { contentManifestSha256: '5'.repeat(64), deploymentAttestationSha256: '6'.repeat(64) };
const context = { pagesRunId: '123', pagesRunAttempt: '1', sourceVerifyRunId: '456', sourceVerifyRunAttempt: '2',
  ...identity, artifactId: '789', githubArtifactArchiveSha256: '3'.repeat(64), innerArtifactTarSha256: '4'.repeat(64), ...local };
const history = { purpose: 'signed-history-only', contextSource: JSON.stringify(context) };
beforeEach(() => {
  vi.resetAllMocks(); mocks.source.mockReturnValue(identity); mocks.metadata.mockResolvedValue(metadata);
  mocks.local.mockReturnValue(local); mocks.directory.mockReturnValue('/private/run'); mocks.history.mockReturnValue(history);
  mocks.file.mockImplementation(() => ({ body: Buffer.from('binding') }));
  mocks.run.mockResolvedValue({ ...metadata, pagesRunAttempt: '2' });
  mocks.prior.mockReturnValue('/private/run');
});
it('binds a rerun only to the original signed claim of the same run/source without a new artifact', async () => {
  expect(await prior()).toEqual({ privateRoot: '/private/run', contextSource: history.contextSource });
  expect(mocks.prior).toHaveBeenCalledWith('123', '2');
  expect(mocks.directory).toHaveBeenCalledWith('123', '1');
  expect(mocks.metadata).not.toHaveBeenCalled();
  expect(mocks.local).not.toHaveBeenCalled();
});
it('rejects an authentic original receipt stored under a different attempt directory', async () => {
  mocks.directory.mockReturnValue('/private/different-attempt');
  await expect(prior()).rejects.toThrow('RECOVERY_WORKFLOW_CURRENT_CONTEXT_INVALID');
});
it('continues ordinary preparation only when no previous attempt is retained', async () => {
  mocks.prior.mockReturnValue(null);
  expect(await prior()).toBe(null);
  expect(mocks.history).not.toHaveBeenCalled();
});
it.each(['pagesRunId', 'pagesRunAttempt', 'sourceVerifyRunId', 'sourceVerifyRunAttempt', 'candidateCommit', 'candidateTree'])
('rejects substituted prior claim %s before reconciliation', async key => {
  mocks.history.mockReturnValue({ ...history, contextSource: JSON.stringify({ ...context, [key]: '999' }) });
  await expect(prior()).rejects.toThrow('RECOVERY_WORKFLOW_CURRENT_CONTEXT_INVALID');
});
it('joins fresh evidence to signed history with no archive or authority transport', async () => {
  expect(await read()).toEqual({ privateRoot: '/private/run', bindingSource: 'binding', contextSource: history.contextSource });
  expect(mocks.metadata).toHaveBeenCalledTimes(2); expect(mocks.history).toHaveBeenCalledTimes(2);
  expect(mocks.directory).toHaveBeenCalledExactlyOnceWith('123', '1');
});
it.each(Object.keys(context).filter(key => key !== 'innerArtifactTarSha256'))('rejects historical %s mismatch', async key => {
  mocks.history.mockReturnValue({ ...history, contextSource: JSON.stringify({ ...context, [key]: 'changed' }) });
  await expect(read()).rejects.toThrow('RECOVERY_WORKFLOW_CURRENT_CONTEXT_INVALID');
});
it.each(['metadata', 'source', 'local', 'history'] as const)('rejects %s changing across revalidation', async key => {
  const values = { metadata, source: identity, local, history };
  if (key === 'metadata') mocks.metadata.mockResolvedValueOnce(metadata).mockResolvedValueOnce({ ...metadata, artifactEtag: 'changed' });
  else mocks[key].mockReturnValueOnce(values[key]).mockReturnValueOnce(key === 'history'
    ? { ...history, contextSource: 'changed' } : { ...values[key], changed: true });
  await expect(read()).rejects.toThrow('RECOVERY_WORKFLOW_CURRENT_CONTEXT_INVALID');
});
it('rejects caller overrides before I/O', async () => {
  await expect(Reflect.apply(read, null, ['override'])).rejects.toThrow('RECOVERY_WORKFLOW_CURRENT_CONTEXT_INVALID');
  expect(mocks.source).not.toHaveBeenCalled();
});
it('redacts private read errors', async () => {
  mocks.history.mockImplementation(() => { throw new Error('private receipt'); });
  await expect(read()).rejects.toThrow(/^RECOVERY_WORKFLOW_CURRENT_CONTEXT_INVALID$/);
});

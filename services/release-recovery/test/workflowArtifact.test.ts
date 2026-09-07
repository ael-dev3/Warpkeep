import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ archive: vi.fn(), redirect: vi.fn(), metadata: vi.fn(), source: vi.fn(), local: vi.fn(), file: vi.fn() }));
vi.mock('../src/archive.js', () => ({ inspectPagesArtifact: mocks.archive }));
vi.mock('../src/http.js', () => ({ githubRedirect: mocks.redirect }));
vi.mock('../../../scripts/recovery-workflow-run-context.mjs', () => ({ readRecoveryWorkflowArtifactMetadata: mocks.metadata }));
vi.mock('../../../scripts/recovery-attestation-source.mjs', () => ({ readRecoveryAttestationSource: mocks.source }));
vi.mock('../../../scripts/generate-warpkeep-deployment-attestation.mjs', () => ({ verifyWarpkeepDeploymentAttestation: mocks.local }));
vi.mock('../../../scripts/local-binding-bounded-file.mjs', () => ({ readLocalBindingBoundedFile: mocks.file }));
import { readRecoveryWorkflowArtifact as read } from '../scripts/read-recovery-workflow-artifact.js';
const identity = { candidateCommit: 'a'.repeat(40), candidateTree: 'b'.repeat(40), recoveryAuthorizationCoreSha256: '1'.repeat(64),
  sourceClosureProfile: 'warpkeep-0.4.0-recovery-source-closure-v1', sourceClosureSha256: '2'.repeat(64) };
const metadata = { pagesRunId: '123', pagesRunAttempt: '1', sourceVerifyRunId: '456', sourceVerifyRunAttempt: '2',
  candidateCommit: identity.candidateCommit, artifactId: '789', artifactName: 'github-pages-recovery-123-1',
  artifactSize: 1000, advertisedArchiveSha256: '3'.repeat(64), artifactEtag: 'stable' };
let bytes: Uint8Array;
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('GITHUB_TOKEN', 'test-only-token');
  mocks.source.mockReturnValue(identity); mocks.metadata.mockResolvedValue(metadata);
  mocks.local.mockReturnValue({ deploymentAttestationSha256: '6'.repeat(64), contentManifestSha256: '5'.repeat(64) });
  mocks.redirect.mockResolvedValue(new Response('test-archive'));
  bytes = new Uint8Array([1, 2, 3]);
  mocks.archive.mockResolvedValue({ githubArtifactArchiveSha256: '3'.repeat(64), innerArtifactTarSha256: '4'.repeat(64),
    contentManifestSha256: '5'.repeat(64), deploymentAttestationSha256: '6'.repeat(64), deploymentAttestationBytes: bytes });
  mocks.file.mockReturnValue({ body: Buffer.from('test-binding') });
});
afterEach(() => vi.unstubAllEnvs());
it('assembles the full ordered context after one archive download and metadata revalidation', async () => {
  const result = await read();
  expect(result.bindingSource).toBe('test-binding');
  expect(Object.keys(JSON.parse(result.contextSource))).toEqual(['pagesRunId', 'pagesRunAttempt', 'sourceVerifyRunId',
    'sourceVerifyRunAttempt', 'candidateCommit', 'candidateTree', 'artifactId', 'githubArtifactArchiveSha256',
    'innerArtifactTarSha256', 'contentManifestSha256', 'deploymentAttestationSha256']);
  expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith(globalThis.fetch,
    'https://api.github.com/repos/ael-dev3/Warpkeep/actions/artifacts/789/zip', 'Bearer test-only-token');
  expect(mocks.archive).toHaveBeenCalledWith(expect.any(Response), identity, undefined, { archiveByteLength: 1000 });
  expect(mocks.metadata).toHaveBeenCalledTimes(2); expect(mocks.local).toHaveBeenCalledTimes(2);
  expect(bytes).toEqual(new Uint8Array(3));
});
it('rejects local/candidate mismatch before downloading', async () => {
  mocks.metadata.mockResolvedValue({ ...metadata, candidateCommit: 'c'.repeat(40) });
  await expect(read()).rejects.toThrow('RECOVERY_WORKFLOW_ARTIFACT_INVALID'); expect(mocks.redirect).not.toHaveBeenCalled();
});
it.each(['githubArtifactArchiveSha256', 'deploymentAttestationSha256', 'contentManifestSha256'])('rejects mismatched %s', async key => {
  const value = await mocks.archive(); mocks.archive.mockClear(); mocks.archive.mockResolvedValue({ ...value, [key]: 'f'.repeat(64) });
  await expect(read()).rejects.toThrow('RECOVERY_WORKFLOW_ARTIFACT_INVALID'); expect(bytes).toEqual(new Uint8Array(3));
});
it.each(['metadata', 'source', 'local'] as const)('rejects %s changing while verifying the archive', async boundary => {
  if (boundary === 'metadata') mocks.metadata.mockResolvedValueOnce(metadata).mockResolvedValueOnce({ ...metadata, artifactEtag: 'changed' });
  if (boundary === 'source') mocks.source.mockReturnValueOnce(identity).mockReturnValueOnce({ ...identity, candidateTree: 'c'.repeat(40) });
  if (boundary === 'local') mocks.local.mockReturnValueOnce({ deploymentAttestationSha256: '6'.repeat(64), contentManifestSha256: '5'.repeat(64) }).mockReturnValueOnce({ deploymentAttestationSha256: 'f'.repeat(64), contentManifestSha256: '5'.repeat(64) });
  await expect(read()).rejects.toThrow('RECOVERY_WORKFLOW_ARTIFACT_INVALID'); expect(mocks.redirect).toHaveBeenCalledTimes(1);
});
it.each(['redirect', 'archive', 'file'] as const)('redacts %s failures', async boundary => {
  mocks[boundary].mockImplementationOnce(() => { throw new Error('private-test-token'); });
  await expect(read()).rejects.toThrow(/^RECOVERY_WORKFLOW_ARTIFACT_INVALID$/);
});
it('rejects a changed re-read content manifest without downloading again', async () => {
  mocks.local.mockReturnValueOnce({ deploymentAttestationSha256: '6'.repeat(64), contentManifestSha256: '5'.repeat(64) })
    .mockReturnValueOnce({ deploymentAttestationSha256: '6'.repeat(64), contentManifestSha256: 'f'.repeat(64) });
  await expect(read()).rejects.toThrow('RECOVERY_WORKFLOW_ARTIFACT_INVALID');
  expect(mocks.redirect).toHaveBeenCalledTimes(1);
});
it('rejects a changed binding after its bounded read', async () => {
  mocks.source.mockReturnValueOnce(identity).mockReturnValueOnce(identity).mockReturnValueOnce({ ...identity, candidateTree: 'c'.repeat(40) });
  await expect(read()).rejects.toThrow('RECOVERY_WORKFLOW_ARTIFACT_INVALID');
});
it('rejects caller overrides before filesystem or network access', async () => {
  await expect(read({ artifactId: 'other' })).rejects.toThrow('RECOVERY_WORKFLOW_ARTIFACT_INVALID');
  expect(mocks.source).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
});

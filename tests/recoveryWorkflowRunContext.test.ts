// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), fetch: vi.fn() }));
vi.mock('../scripts/local-binding-bounded-file.mjs', () => ({ readLocalBindingBoundedFile: mocks.read }));
import { readRecoveryWorkflowRunContext as read } from '../scripts/recovery-workflow-run-context.mjs';
import { readRecoveryWorkflowArtifactMetadata as readArtifact } from '../scripts/recovery-workflow-run-context.mjs';
const API = 'https://api.github.com/repos/ael-dev3/Warpkeep';
const sha = 'a'.repeat(40);
const repository = { id: 1273513252, full_name: 'ael-dev3/Warpkeep', owner: { id: 183124839 } };
const sourceRun = () => ({ id: 456, run_attempt: 2, repository, head_repository: repository, name: 'Verify',
  path: '.github/workflows/verify.yml', event: 'push', head_branch: 'main', head_sha: sha, status: 'completed', conclusion: 'success' });
let source: Record<string, unknown>, pages: Record<string, unknown>, main: Record<string, unknown>, artifact: Record<string, unknown>;
function response(url: string, value: unknown, headers: Record<string, string> = {}) {
  const result = new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json', ...headers } });
  Object.defineProperty(result, 'url', { value: url }); return result;
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('fetch', mocks.fetch);
  for (const [key, value] of Object.entries({ GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'ael-dev3/Warpkeep',
    GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_run', GITHUB_JOB: 'deploy-recovery',
    GITHUB_WORKFLOW_REF: 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main',
    GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: sha, GITHUB_TOKEN: 'test-only-token',
    GITHUB_EVENT_PATH: process.platform === 'win32' ? 'C:/runner/event.json' : '/runner/event.json' })) vi.stubEnv(key, value);
  source = sourceRun();
  pages = { ...sourceRun(), id: 123, run_attempt: 1, name: 'Deploy GitHub Pages', path: '.github/workflows/deploy-pages.yml',
    event: 'workflow_run', status: 'in_progress', conclusion: null };
  main = { name: 'main', protected: true, commit: { sha } };
  artifact = { id: 789, name: 'github-pages-recovery-123-1', node_id: 'artifact-node', expired: false,
    size_in_bytes: 1024, url: `${API}/actions/artifacts/789`, archive_download_url: `${API}/actions/artifacts/789/zip`,
    digest: `sha256:${'b'.repeat(64)}`, created_at: '2026-01-01T00:00:00Z', expires_at: '2099-01-01T00:00:00Z',
    workflow_run: { id: 123, repository_id: 1273513252, head_repository_id: 1273513252, head_branch: 'main', head_sha: sha } };
  mocks.read.mockImplementation(() => ({ body: Buffer.from(JSON.stringify({ action: 'completed', repository, workflow_run: sourceRun() })) }));
  mocks.fetch.mockImplementation(async (url: string) => response(url,
    url.includes('/artifacts?') ? { total_count: 1, artifacts: [artifact] } : url.endsWith('/artifacts/789') ? artifact
      : url.endsWith('/branches/main') ? main : url.includes('/456/') ? source : pages, { etag: '"stable"' }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('cross-checks source and current run with protected main before and after', async () => {
  await expect(read()).resolves.toEqual({ pagesRunId: '123', pagesRunAttempt: '1', sourceVerifyRunId: '456', sourceVerifyRunAttempt: '2', candidateCommit: sha });
  expect(mocks.fetch.mock.calls.map(call => call[0])).toEqual([
    `${API}/branches/main`, `${API}/actions/runs/456/attempts/2`, `${API}/actions/runs/123/attempts/1`, `${API}/branches/main`,
  ]);
  for (const [, init] of mocks.fetch.mock.calls) {
    expect(init).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store', credentials: 'omit' });
    expect(init.headers.authorization).toBe('Bearer test-only-token');
  }
});
it.each(['GITHUB_JOB', 'GITHUB_SHA', 'GITHUB_EVENT_NAME', 'GITHUB_RUN_ID', 'GITHUB_TOKEN'])('rejects wrong %s before network', async key => {
  vi.stubEnv(key, key === 'GITHUB_TOKEN' ? '' : 'invalid');
  await expect(read()).rejects.toThrow(/^RECOVERY_WORKFLOW_RUN_CONTEXT_INVALID$/);
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it('rejects a forged event repository before network', async () => {
  mocks.read.mockReturnValue({ body: Buffer.from(JSON.stringify({ action: 'completed', repository: { ...repository, id: 1 }, workflow_run: sourceRun() })) });
  await expect(read()).rejects.toThrow('RECOVERY_WORKFLOW_RUN_CONTEXT_INVALID');
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it.each([
  ['source', 'conclusion', 'failure'], ['source', 'run_attempt', 3], ['source', 'event', 'pull_request'],
  ['source', 'path', '.github/workflows/other.yml'], ['source', 'id', 9007199254740992],
  ['pages', 'head_sha', 'b'.repeat(40)], ['pages', 'event', 'workflow_dispatch'],
  ['pages', 'status', 'completed'], ['pages', 'run_attempt', 2], ['main', 'protected', false],
] as const)('rejects mismatched %s %s', async (object, key, value) => {
  ({ source, pages, main }[object])[key] = value;
  await expect(read()).rejects.toThrow('RECOVERY_WORKFLOW_RUN_CONTEXT_INVALID');
});
it('rejects main advancing during the evidence read', async () => {
  let count = 0;
  mocks.fetch.mockImplementation(async (url: string) => response(url, url.endsWith('/branches/main')
    ? (++count === 1 ? main : { ...main, commit: { sha: 'b'.repeat(40) } }) : url.includes('/456/') ? source : pages));
  await expect(read()).rejects.toThrow('RECOVERY_WORKFLOW_RUN_CONTEXT_INVALID');
});
it.each([
  { 'content-type': 'text/html' }, { 'content-encoding': 'gzip' }, { 'content-length': '524289' }, { 'content-length': '1' },
] as Record<string, string>[])('rejects invalid response metadata %j', async headers => {
  mocks.fetch.mockImplementationOnce(async (url: string) => response(url, main, headers));
  await expect(read()).rejects.toThrow('RECOVERY_WORKFLOW_RUN_CONTEXT_INVALID');
});
it('rejects wrong response URL and redacts upstream failures', async () => {
  mocks.fetch.mockResolvedValueOnce(response('https://example.invalid/', main));
  await expect(read()).rejects.toThrow(/^RECOVERY_WORKFLOW_RUN_CONTEXT_INVALID$/);
  mocks.fetch.mockRejectedValueOnce(new Error('private-test-token'));
  await expect(read()).rejects.toThrow(/^RECOVERY_WORKFLOW_RUN_CONTEXT_INVALID$/);
});
it('rejects oversized streamed metadata without a length header', async () => {
  mocks.fetch.mockImplementationOnce(async (url: string) => response(url, 'a'.repeat(524289)));
  await expect(read()).rejects.toThrow('RECOVERY_WORKFLOW_RUN_CONTEXT_INVALID');
});
it('does not accept caller URL, run, or token overrides', async () => {
  await expect(Reflect.apply(read, null, [{ token: 'other' }])).rejects.toThrow('RECOVERY_WORKFLOW_RUN_CONTEXT_INVALID');
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it('bounds a stalled transport even when it ignores cancellation', async () => {
  vi.useFakeTimers(); mocks.fetch.mockImplementationOnce(() => new Promise(() => {}));
  const result = expect(read()).rejects.toThrow(/^RECOVERY_WORKFLOW_RUN_CONTEXT_INVALID$/);
  await vi.advanceTimersByTimeAsync(10000); await result;
  expect(mocks.fetch.mock.calls[0]![1].signal.aborted).toBe(true);
});
it('discovers one exact artifact and compares two stable direct metadata reads', async () => {
  await expect(readArtifact()).resolves.toMatchObject({ artifactId: '789', artifactName: 'github-pages-recovery-123-1',
    artifactSize: 1024, advertisedArchiveSha256: 'b'.repeat(64), artifactEtag: '"stable"' });
  expect(mocks.fetch.mock.calls.map(call => call[0]).filter(url => url.includes('/artifacts'))).toEqual([
    `${API}/actions/runs/123/artifacts?name=github-pages-recovery-123-1&per_page=100&page=1`,
    `${API}/actions/artifacts/789`, `${API}/actions/artifacts/789`,
  ]);
  expect(mocks.fetch.mock.calls.some(([url]) => url.endsWith('/zip'))).toBe(false);
});
it.each([['name', 'github-pages-recovery-123-2'], ['expired', true], ['size_in_bytes', 0],
  ['digest', 'sha256:invalid'], ['url', 'https://example.invalid'], ['expires_at', '2020-01-01T00:00:00Z'],
  ['workflow_run', { id: 999 }]] as const)('rejects substituted artifact %s', async (key, value) => {
  artifact[key] = value; await expect(readArtifact()).rejects.toThrow('RECOVERY_WORKFLOW_RUN_CONTEXT_INVALID');
});
it.each(['pagination', 'duplicate', 'etag', 'bytes'])('rejects ambiguous or unstable artifact metadata: %s', async mode => {
  const normal = mocks.fetch.getMockImplementation()!; let direct = 0;
  mocks.fetch.mockImplementation(async (url: string, init: unknown) => {
    if (url.includes('/artifacts?') && mode === 'pagination') return response(url, { total_count: 1, artifacts: [artifact] }, { link: '<https://api.github.com/next>; rel="next"' });
    if (url.includes('/artifacts?') && mode === 'duplicate') return response(url, { total_count: 2, artifacts: [artifact, artifact] });
    if (url.endsWith('/artifacts/789') && ++direct === 2) return response(url,
      mode === 'bytes' ? { ...artifact, unrecognized_change: true } : artifact, { etag: mode === 'etag' ? '"changed"' : '"stable"' });
    return normal(url, init);
  });
  await expect(readArtifact()).rejects.toThrow('RECOVERY_WORKFLOW_RUN_CONTEXT_INVALID');
});

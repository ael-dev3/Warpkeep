// @vitest-environment node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// @ts-expect-error Standalone release utilities expose named test seams.
import { allowedGeneratedPath, verifyPublicPagesPostflight } from '../scripts/verify-public-pages-postflight.mjs';
// @ts-expect-error Standalone release utility exposes reviewed document and README policy.
import { PUBLIC_PAGES_MIRROR_MANIFEST_PATH, PUBLIC_PAGES_WORKFLOW_PATH, PUBLIC_PAGES_WORKFLOW_TEMPLATE_PATH, renderPublicPagesMirrorReadme, SOURCE_PUBLIC_DOCUMENTS } from '../scripts/verify-public-pages-mirror-plan.mjs';

const temporaryRoots: string[] = [];
const sourceCommit = 'a'.repeat(40);
const sourceTree = 'b'.repeat(40);
const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const workflowTemplateBytes = readFileSync(resolve(process.cwd(), PUBLIC_PAGES_WORKFLOW_TEMPLATE_PATH));

function write(root: string, path: string, bytes: Uint8Array | string) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
}

function command(binary: string, args: string[], cwd: string) {
  const result = spawnSync(binary, args, {
    cwd, encoding: 'utf8', windowsHide: true, timeout: 30_000,
  });
  if (result.error || result.status !== 0 || result.signal) {
    throw new Error(`${binary} ${args.join(' ')}: ${result.stderr || result.error}`);
  }
  return result.stdout.trim();
}

const git = (root: string, args: string[]) => command('git', args, root);

function fixture(mutateGenerated?: (files: Map<string, Buffer>) => void) {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-public-postflight-'));
  const signerRoot = mkdtempSync(join(tmpdir(), 'warpkeep-public-postflight-signer-'));
  temporaryRoots.push(root, signerRoot);
  git(root, ['init', '--quiet']);
  git(root, ['branch', '-M', 'main']);
  git(root, ['remote', 'add', 'origin', 'https://github.com/ael-dev3/Warpkeep-Live.git']);
  git(root, ['config', 'user.name', 'Warpkeep Fixture']);
  git(root, ['config', 'user.email', 'fixture@example.invalid']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  const preservedRoot = new Map<string, Buffer>([
    ['.nojekyll', Buffer.alloc(0)],
    ['.well-known/farcaster.json', Buffer.from('{"accountAssociation":{}}\n')],
    ['404.html', Buffer.from('<!doctype html><script type="module" src="/assets/alpha.js"></script><title>Old Alpha</title>')],
    ['CNAME', Buffer.from('warpkeep.com\n')],
    ['index.html', Buffer.from('<!doctype html><script type="module" src="/assets/alpha.js"></script><title>Old Alpha</title>')],
    ['assets/alpha.js', Buffer.from('console.info("Alpha remains live");')],
    ['audio/warpkeep-genesis-002-theme.m4a', Buffer.from('preserved Genesis 002 soundtrack')],
    ['models/greater-realm/biome-trees/v3/manifest.json', Buffer.from('{"preserved":true}')],
  ]);
  for (const [path, bytes] of preservedRoot) write(root, path, bytes);
  write(root, 'README.md', 'Old public host\n');
  for (const path of SOURCE_PUBLIC_DOCUMENTS as readonly string[]) {
    write(root, path, `old reviewed ${path}\n`);
  }
  git(root, ['add', '--all']);
  git(root, ['commit', '--quiet', '-m', 'Existing public host']);
  const publicParentCommit = git(root, ['rev-parse', 'HEAD']);
  const publicParentTree = git(root, ['rev-parse', 'HEAD^{tree}']);

  const generated = new Map<string, Buffer>([
    ['.well-known/farcaster.json', Buffer.from('{"name":"Warpkeep"}\n')],
    ['apple-touch-icon-180-fe27e8dc1c97cc36.png', Buffer.from('apple-icon')],
    ['assets/app.js', Buffer.from(`console.info("${sourceCommit}");\n`)],
    ['audio/warpkeep-genesis-002-theme.m4a', Buffer.from('reviewed Genesis 002 soundtrack')],
    ['models/greater-realm/biome-trees/v3/manifest.json',
      Buffer.from('{"schema":"warpkeep-greater-realm-biome-trees.runtime.v1"}')],
    ['favicon-64-7b82ca973fe757f5.png', Buffer.from('favicon')],
    ['index.html', Buffer.from('<!doctype html><link rel="canonical" href="https://warpkeep.com/"><title>Warpkeep 0.4</title>')],
    ['legal/warpkeep-legal.css', Buffer.from('body{color:white}')],
    ['owner-canary/index.html', Buffer.from('<!doctype html><title>Owner canary</title>')],
    ['privacy/index.html', Buffer.from('<!doctype html><title>Warpkeep privacy</title>')],
    ['social-contract/index.html', Buffer.from('<!doctype html><title>Social contract</title>')],
    ['terms/index.html', Buffer.from('<!doctype html><title>Terms</title>')],
    ['warpkeep-boot.css', Buffer.from('body{background:black}')],
    ['warpkeep-noscript.css', Buffer.from('noscript{display:block}')],
  ]);
  mutateGenerated?.(generated);
  const payloadFiles = [...generated].map(([path, bytes]) => ({
    path, byteLength: bytes.length, sha256: sha(bytes),
  })).sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  const manifest = {
    schemaVersion: 1,
    profile: 'warpkeep-public-pages-payload-v1',
    canonicalOrigin: 'https://warpkeep.com',
    sourceCommit,
    sourceTree,
    publicationPath: '/ptr/',
    fileCount: payloadFiles.length,
    totalByteLength: payloadFiles.reduce((sum, file) => sum + file.byteLength, 0),
    rootHtmlSha256: sha(generated.get('index.html')!),
    contentManifestSha256: sha(JSON.stringify(payloadFiles)),
    files: payloadFiles,
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest)}\n`);
  const ptrGenerated = new Map([...generated].map(([path, bytes]) => [`ptr/${path}`, bytes]));
  const hosting = new Map<string, Buffer>([
    ['ptr/404.html', generated.get('index.html')!],
    ['README.md', renderPublicPagesMirrorReadme(manifest, sha(manifestBytes))],
    [PUBLIC_PAGES_MIRROR_MANIFEST_PATH, manifestBytes],
  ]);
  const documents = new Map((SOURCE_PUBLIC_DOCUMENTS as readonly string[]).map(path => [
    path, Buffer.from(`current reviewed ${path}\n`),
  ]));
  const all = new Map([...preservedRoot, ...ptrGenerated, ...hosting, ...documents]);
  for (const [path, bytes] of all) write(root, path, bytes);
  const targetEntries = [...all].map(([path, bytes]) => ({
    path, byteLength: bytes.length, sha256: sha(bytes),
    origin: ptrGenerated.has(path) ? 'generated' : hosting.has(path) ? 'hosting'
      : documents.has(path) ? 'reviewed-source' : 'preserved-existing',
  })).sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  const plan = {
    schemaVersion: 2,
    profile: 'warpkeep-public-pages-ptr-mirror-plan-v1',
    publicationPath: '/ptr/',
    sourceCommit,
    sourceTree,
    publicParentCommit,
    publicParentTree,
    payloadManifestSha256: sha(manifestBytes),
    preservedRootEntryCount: targetEntries.filter(entry => entry.origin === 'preserved-existing').length,
    preservedRootManifestSha256: sha(JSON.stringify(
      targetEntries.filter(entry => entry.origin === 'preserved-existing'),
    )),
    targetFileCount: targetEntries.length,
    targetEntries,
    obsoleteGeneratedPaths: [],
  };
  const reviewedPlanBytes = Buffer.from(`${JSON.stringify(plan)}\n`);
  const expectedReviewedPlanSha256 = sha(reviewedPlanBytes);

  const key = join(signerRoot, 'release-signing-key');
  command('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key], signerRoot);
  const publicKey = command('ssh-keygen', ['-y', '-f', key], signerRoot);
  const allowedSigners = join(signerRoot, 'allowed_signers');
  writeFileSync(allowedSigners, `fixture@example.invalid ${publicKey}\n`);
  git(root, ['config', 'gpg.format', 'ssh']);
  git(root, ['config', 'user.signingkey', key]);
  git(root, ['config', 'gpg.ssh.allowedSignersFile', allowedSigners]);
  git(root, ['config', 'commit.gpgsign', 'true']);
  git(root, ['add', '--all']);
  git(root, ['commit', '--quiet', '-m', 'Publish reviewed 0.4 public mirror']);
  const expectedPublicCommit = git(root, ['rev-parse', 'HEAD']);
  const expectedPublicTree = git(root, ['rev-parse', 'HEAD^{tree}']);
  expect(git(root, ['log', '-1', '--format=%G?'])).toBe('G');
  const expectedSignerFingerprint = git(root, ['log', '-1', '--format=%GK']);
  const expectedSignerIdentity = git(root, ['log', '-1', '--format=%GS']);
  const routeBytes = new Map([...generated].map(([path, bytes]) => [`/ptr/${path}`, bytes]));
  routeBytes.set('/ptr/', generated.get('index.html')!);
  routeBytes.set('/ptr/index.html', generated.get('index.html')!);
  routeBytes.set('/ptr/404.html', generated.get('index.html')!);
  for (const [path, bytes] of generated) {
    if (path.endsWith('/index.html')) routeBytes.set(`/ptr/${path.slice(0, -'index.html'.length)}`, bytes);
  }
  for (const [path, bytes] of preservedRoot) {
    if (path === '.well-known/farcaster.json') {
      routeBytes.set('/.well-known/farcaster.json', bytes);
      continue;
    }
    if (path === '404.html') {
      routeBytes.set('/404.html', bytes);
      continue;
    }
    // The preserved Alpha fixture HTML references only this application asset.
    // Audio/model files stay byte-verified preserved entries, not root HTTP routes.
    if (path !== 'index.html' && path !== 'assets/alpha.js') continue;
    routeBytes.set(`/${path}`, bytes);
    if (path === 'index.html') routeBytes.set('/', bytes);
  }
  const fetchImpl = vi.fn(async (url: string, _options: RequestInit) => {
    const bytes = routeBytes.get(new URL(url).pathname);
    if (!bytes) throw new Error(`Unexpected live request: ${url}`);
    const response = new Response(Uint8Array.from(bytes), { status: 200 });
    Object.defineProperty(response, 'url', { value: url });
    return response;
  });
  const remoteState = {
    main: { ref: 'refs/heads/main', object: { type: 'commit', sha: expectedPublicCommit } },
    pages: { build_type: 'legacy', source: { branch: 'main', path: '/' },
      html_url: 'https://warpkeep.com/', status: 'built' },
    latestBuild: { commit: expectedPublicCommit, status: 'built', error: { message: null } },
    runs: { total_count: 1, workflow_runs: [{ id: 31, name: 'pages build and deployment',
      path: 'dynamic/pages/pages-build-deployment', event: 'dynamic', head_branch: 'main',
      head_sha: expectedPublicCommit, status: 'completed', conclusion: 'success',
      repository: { full_name: 'ael-dev3/Warpkeep-Live' },
      head_repository: { full_name: 'ael-dev3/Warpkeep-Live' } }] },
  };
  const readRemoteState = vi.fn(async (_commit: string) => remoteState);
  const options = {
    publicRoot: root,
    expectedPublicCommit,
    expectedPublicTree,
    reviewedPlanBytes,
    expectedReviewedPlanSha256,
    expectedSignerFingerprint,
    expectedSignerIdentity,
    readRemoteState,
    fetchImpl,
  };
  return { root, plan, manifest, generated, routeBytes, remoteState, readRemoteState, fetchImpl, options };
}

function workflowFixture() {
  const f = fixture();
  write(f.root, PUBLIC_PAGES_WORKFLOW_PATH, workflowTemplateBytes);
  git(f.root, ['add', PUBLIC_PAGES_WORKFLOW_PATH]);
  git(f.root, ['commit', '--amend', '--no-edit', '--quiet']);
  const expectedPublicCommit = git(f.root, ['rev-parse', 'HEAD']);
  const expectedPublicTree = git(f.root, ['rev-parse', 'HEAD^{tree}']);
  const targetEntries = [...f.plan.targetEntries, { path: PUBLIC_PAGES_WORKFLOW_PATH,
    byteLength: workflowTemplateBytes.length, sha256: sha(workflowTemplateBytes), origin: 'reviewed-control' }]
    .sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  const plan = { ...f.plan, deploymentMode: 'workflow', targetEntries, targetFileCount: targetEntries.length };
  const reviewedPlanBytes = Buffer.from(`${JSON.stringify(plan)}\n`);
  const run = { id: 41, run_attempt: 1, name: 'Publish signed public PTR',
    path: PUBLIC_PAGES_WORKFLOW_PATH, event: 'workflow_dispatch', head_branch: 'main',
    head_sha: expectedPublicCommit, status: 'completed', conclusion: 'success',
    repository: { full_name: 'ael-dev3/Warpkeep-Live' },
    head_repository: { full_name: 'ael-dev3/Warpkeep-Live' } };
  const steps = ['Validate exact manual main request', 'Check out the exact public commit',
    'Attest signed tree and stage existing served files', 'Upload the already built site',
    'Recheck exact current public main', 'Deploy the exact Pages artifact']
    .map((name, index) => ({ name, number: index + 1, status: 'completed', conclusion: 'success',
      started_at: '2026-10-03T00:10:00Z', completed_at: '2026-10-03T00:11:00Z' }));
  const remoteState = {
    main: { ref: 'refs/heads/main', object: { type: 'commit', sha: expectedPublicCommit } },
    pages: { build_type: 'workflow', html_url: 'https://warpkeep.com/', status: 'built',
      cname: 'warpkeep.com', https_enforced: true },
    commit: { sha: expectedPublicCommit, tree: { sha: expectedPublicTree },
      verification: { verified: true, reason: 'valid' } },
    runs: { total_count: 1, workflow_runs: [{ ...run }] },
    currentRun: { ...run }, currentAttempt: { ...run }, currentRunAfter: { ...run },
    jobs: { total_count: 1, jobs: [{ id: 101, run_id: 41, run_attempt: 1, name: 'deploy-pages',
      status: 'completed', conclusion: 'success', runner_id: 999,
      labels: ['ubuntu-24.04'], started_at: '2026-10-03T00:10:00Z', completed_at: '2026-10-03T00:11:00Z', steps }] },
  };
  const readRemoteState = vi.fn(async (_commit: string, _mode?: unknown) => remoteState);
  const options = { ...f.options, expectedPublicCommit, expectedPublicTree, reviewedPlanBytes,
    expectedReviewedPlanSha256: sha(reviewedPlanBytes), readRemoteState };
  return { ...f, plan, remoteState, readRemoteState, options };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('read-only public Pages postflight', () => {
  it('attests a genuine workflow-mode run and its exact job while still proving all live Alpha and PTR hashes', async () => {
    const f = workflowFixture();
    const result = await verifyPublicPagesPostflight(f.options);
    expect(result).toMatchObject({ publicCommit: f.options.expectedPublicCommit,
      publicTree: f.options.expectedPublicTree, deploymentMode: 'workflow',
      pagesRunId: 41, pagesRunAttempt: 1, pagesJobId: 101, verifiedRouteCount: f.routeBytes.size });
    expect(f.readRemoteState).toHaveBeenCalledTimes(2);
    expect(f.readRemoteState.mock.calls.every(([, mode]) => JSON.stringify(mode) === '{"deploymentMode":"workflow"}')).toBe(true);
    expect(f.fetchImpl.mock.calls.map(([url]) => url).sort()).toEqual(
      [...f.routeBytes.keys()].map(path => `https://warpkeep.com${path}`).sort());
    expect(f.fetchImpl.mock.calls.some(([url]) => url.includes('/.github/'))).toBe(false);
  }, 30_000);

  it('rejects incomplete run/job pages, a stale successful attempt and mismatched dispatch or tree authority', async () => {
    const f = workflowFixture();
    const state = f.remoteState;
    state.runs.total_count = 2;
    await expect(verifyPublicPagesPostflight(f.options)).rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_REMOTE_INVALID');
    state.runs.total_count = 1;
    state.jobs.total_count = 2;
    await expect(verifyPublicPagesPostflight(f.options)).rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_REMOTE_INVALID');
    state.jobs.total_count = 1;
    state.currentRun.run_attempt = 2;
    await expect(verifyPublicPagesPostflight(f.options)).rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_REMOTE_INVALID');
    state.currentRun.run_attempt = 1;
    state.currentAttempt.event = 'push';
    await expect(verifyPublicPagesPostflight(f.options)).rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_REMOTE_INVALID');
    state.currentAttempt.event = 'workflow_dispatch';
    state.commit.tree.sha = '0'.repeat(40);
    await expect(verifyPublicPagesPostflight(f.options)).rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_REMOTE_INVALID');
    state.commit.tree.sha = f.options.expectedPublicTree;
    state.jobs.jobs[0].steps.at(-1)!.conclusion = 'failure';
    await expect(verifyPublicPagesPostflight(f.options)).rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_REMOTE_INVALID');
    expect(f.fetchImpl).not.toHaveBeenCalled();
  }, 45_000);

  it('does not accept successful run metadata when current Pages content is stale', async () => {
    const f = workflowFixture();
    f.routeBytes.set('/ptr/index.html', Buffer.alloc(f.routeBytes.get('/ptr/index.html')!.length, 0x78));
    await expect(verifyPublicPagesPostflight(f.options)).rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_HTTP_HASH_INVALID');
    expect(f.readRemoteState).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('rejects unsupported deployment mode or a substituted workflow digest before remote reads', async () => {
    const f = workflowFixture();
    for (const mutate of [
      (plan: { deploymentMode: string }) => { plan.deploymentMode = 'workflow-v2'; },
      (plan: { targetEntries: { path: string; sha256: string }[] }) => {
        plan.targetEntries.find(entry => entry.path === PUBLIC_PAGES_WORKFLOW_PATH)!.sha256 = '0'.repeat(64);
      },
    ]) {
      const plan = JSON.parse(f.options.reviewedPlanBytes.toString('utf8'));
      mutate(plan);
      const bytes = Buffer.from(`${JSON.stringify(plan)}\n`);
      await expect(verifyPublicPagesPostflight({ ...f.options, reviewedPlanBytes: bytes,
        expectedReviewedPlanSha256: sha(bytes) })).rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_PLAN_INVALID');
    }
    expect(f.readRemoteState).not.toHaveBeenCalled();
    expect(f.fetchImpl).not.toHaveBeenCalled();
  }, 30_000);

  it('attests the exact signed tree, PTR assets and preserved Alpha entry routes', async () => {
    const f = fixture();
    const before = git(f.root, ['rev-parse', 'HEAD']);
    const result = await verifyPublicPagesPostflight(f.options);
    expect(result).toMatchObject({
      publicCommit: before,
      publicTree: f.options.expectedPublicTree,
      sourceCommit,
      verifiedFileCount: f.manifest.fileCount,
      verifiedPreservedRootFileCount: f.plan.preservedRootEntryCount,
      verifiedRouteCount: f.routeBytes.size,
    });
    expect(f.fetchImpl.mock.calls.map(([url]) => url).sort()).toEqual(
      [...f.routeBytes.keys()].map(path => `https://warpkeep.com${path}`).sort(),
    );
    expect(f.fetchImpl.mock.calls.every(([, options]) => options.redirect === 'manual')).toBe(true);
    expect(f.fetchImpl.mock.calls.some(([url]) => url === 'https://warpkeep.com/404.html')).toBe(true);
    expect(f.fetchImpl.mock.calls.some(([url]) => url === 'https://warpkeep.com/ptr/404.html')).toBe(true);
    expect(f.fetchImpl.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([
      'https://warpkeep.com/ptr/audio/warpkeep-genesis-002-theme.m4a',
      'https://warpkeep.com/ptr/models/greater-realm/biome-trees/v3/manifest.json',
    ]));
    const fetchedUrls = f.fetchImpl.mock.calls.map(([url]) => url);
    expect(fetchedUrls).not.toContain('https://warpkeep.com/audio/warpkeep-genesis-002-theme.m4a');
    expect(fetchedUrls).not.toContain('https://warpkeep.com/models/greater-realm/biome-trees/v3/manifest.json');
    for (const path of [
      'audio/warpkeep-genesis-002-theme.m4a',
      'models/greater-realm/biome-trees/v3/manifest.json',
    ]) {
      expect(git(f.root, ['show', f.options.expectedPublicCommit + ':' + path]))
        .toBe(git(f.root, ['show', f.plan.publicParentCommit + ':' + path]));
    }
    expect(f.readRemoteState).toHaveBeenCalledTimes(2);
    expect(f.readRemoteState.mock.calls.every(([commit]) => commit === before)).toBe(true);
    expect(git(f.root, ['rev-parse', 'HEAD'])).toBe(before);
    expect(git(f.root, ['status', '--porcelain=v1', '--untracked-files=all'])).toBe('');
  }, 30_000);

  it('rejects a changed reviewed plan digest before any live request', async () => {
    const f = fixture();
    await expect(verifyPublicPagesPostflight({
      ...f.options, expectedReviewedPlanSha256: '0'.repeat(64),
    })).rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_PLAN_INVALID');
    expect(f.fetchImpl).not.toHaveBeenCalled();
  }, 30_000);

  it('independently rejects a generated path outside the payload policy or a missing required file', async () => {
    expect(allowedGeneratedPath('assets/../app.js')).toBe(false);
    expect(allowedGeneratedPath('video/index.html')).toBe(false);
    expect(allowedGeneratedPath('assets/app.js')).toBe(true);
    expect(allowedGeneratedPath('audio/warpkeep-verdant-menu-theme.m4a')).toBe(true);
    expect(allowedGeneratedPath('audio/warpkeep-title-theme-a.mp3')).toBe(true);
    expect(allowedGeneratedPath('audio/other.m4a')).toBe(false);
    expect(allowedGeneratedPath('audio/nested/warpkeep-verdant-menu-theme.m4a')).toBe(false);
    expect(allowedGeneratedPath('audio/warpkeep-verdant-menu-theme.M4A')).toBe(false);
    expect(allowedGeneratedPath('audio/warpkeep-genesis-002-theme.m4a')).toBe(true);
    expect(allowedGeneratedPath('models/greater-realm/biome-trees/v3/manifest.json')).toBe(true);
    for (const path of [
      'audio/nested/warpkeep-genesis-002-theme.m4a', 'audio/warpkeep-genesis-002-theme.M4A',
      'audio/../warpkeep-genesis-002-theme.m4a', 'models/other/manifest.json',
      'models/greater-realm/biome-trees/v2/manifest.json',
      'models/greater-realm/biome-trees/v3/manifest.JSON',
      'models/greater-realm/biome-trees/v3/../manifest.json',
      'ptr/audio/warpkeep-genesis-002-theme.m4a',
      'ptr/ptr/models/greater-realm/biome-trees/v3/manifest.json',
    ]) expect(allowedGeneratedPath(path)).toBe(false);
    const extra = fixture(files => files.set('video/index.html', Buffer.from('unexpected HTML')));
    await expect(verifyPublicPagesPostflight(extra.options))
      .rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_PLAN_INVALID');
    expect(extra.readRemoteState).not.toHaveBeenCalled();
    const missing = fixture(files => files.delete('favicon-64-7b82ca973fe757f5.png'));
    await expect(verifyPublicPagesPostflight(missing.options))
      .rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_MANIFEST_INVALID');
    expect(missing.readRemoteState).not.toHaveBeenCalled();
  }, 30_000);

  it.each(['audio/other.m4a', 'models/other/manifest.json'])(
    'rejects unreviewed generated %s before remote or live requests', async (path) => {
      const unreviewed = fixture(files => files.set(path, Buffer.from('unreviewed')));
      await expect(verifyPublicPagesPostflight(unreviewed.options))
        .rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_PLAN_INVALID');
      expect(unreviewed.readRemoteState).not.toHaveBeenCalled();
      expect(unreviewed.fetchImpl).not.toHaveBeenCalled();
    }, 30_000,
  );

  it('rejects a stale remote main, stale latest Pages build, or failed exact Pages run', async () => {
    const f = fixture();
    f.remoteState.main.object.sha = '0'.repeat(40);
    await expect(verifyPublicPagesPostflight(f.options))
      .rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_REMOTE_INVALID');
    f.remoteState.main.object.sha = f.options.expectedPublicCommit;
    f.remoteState.latestBuild.commit = '0'.repeat(40);
    await expect(verifyPublicPagesPostflight(f.options))
      .rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_REMOTE_INVALID');
    f.remoteState.latestBuild.commit = f.options.expectedPublicCommit;
    f.remoteState.runs.workflow_runs[0].head_sha = '0'.repeat(40);
    await expect(verifyPublicPagesPostflight(f.options))
      .rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_REMOTE_INVALID');
    f.remoteState.runs.workflow_runs[0].head_sha = f.options.expectedPublicCommit;
    f.remoteState.runs.workflow_runs[0].conclusion = 'failure';
    await expect(verifyPublicPagesPostflight(f.options))
      .rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_REMOTE_INVALID');
    expect(f.fetchImpl).not.toHaveBeenCalled();
  }, 45_000);

  it('rechecks remote main and Pages state after all live hashes', async () => {
    const f = fixture();
    let reads = 0;
    const readRemoteState = vi.fn(async () => {
      reads += 1;
      if (reads === 2) f.remoteState.main.object.sha = '0'.repeat(40);
      return f.remoteState;
    });
    await expect(verifyPublicPagesPostflight({ ...f.options, readRemoteState }))
      .rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_REMOTE_INVALID');
    expect(readRemoteState).toHaveBeenCalledTimes(2);
    expect(f.fetchImpl).toHaveBeenCalled();
  }, 20_000);

  it('rejects the wrong public tree or signer before any live request', async () => {
    const f = fixture();
    await expect(verifyPublicPagesPostflight({
      ...f.options, expectedPublicTree: '0'.repeat(40),
    })).rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_TREE_INVALID');
    await expect(verifyPublicPagesPostflight({
      ...f.options, expectedSignerFingerprint: `SHA256:${'A'.repeat(43)}`,
    })).rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_SIGNATURE_INVALID');
    expect(f.fetchImpl).not.toHaveBeenCalled();
  }, 30_000);

  it('rejects an unsigned public commit with the same approved tree', async () => {
    const f = fixture();
    git(f.root, ['-c', 'commit.gpgsign=false', 'commit', '--amend', '--no-gpg-sign', '--no-edit', '--quiet']);
    await expect(verifyPublicPagesPostflight({
      ...f.options,
      expectedPublicCommit: git(f.root, ['rev-parse', 'HEAD']),
    })).rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_GIT_INVALID');
    expect(f.fetchImpl).not.toHaveBeenCalled();
  }, 30_000);

  it('rejects a committed legal-document substitution even when the commit is signed', async () => {
    const f = fixture();
    write(f.root, 'ASSETS-LICENSE.md', 'different attribution\n');
    git(f.root, ['add', '--all']);
    git(f.root, ['commit', '--amend', '--no-edit', '--quiet']);
    await expect(verifyPublicPagesPostflight({
      ...f.options,
      expectedPublicCommit: git(f.root, ['rev-parse', 'HEAD']),
      expectedPublicTree: git(f.root, ['rev-parse', 'HEAD^{tree}']),
    })).rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_TREE_INVALID');
    expect(f.fetchImpl).not.toHaveBeenCalled();
  }, 30_000);

  it('rejects a signed plan and commit that replace the preserved Alpha root', async () => {
    const f = fixture();
    const changedRoot = Buffer.from('<!doctype html><title>Unreviewed root</title>');
    write(f.root, 'index.html', changedRoot);
    write(f.root, '404.html', changedRoot);
    git(f.root, ['add', 'index.html', '404.html']);
    git(f.root, ['commit', '--amend', '--no-edit', '--quiet']);
    for (const entry of f.plan.targetEntries) {
      if (entry.path === 'index.html' || entry.path === '404.html') {
        entry.byteLength = changedRoot.length;
        entry.sha256 = sha(changedRoot);
      }
    }
    f.plan.preservedRootManifestSha256 = sha(JSON.stringify(
      f.plan.targetEntries.filter(entry => entry.origin === 'preserved-existing'),
    ));
    const reviewedPlanBytes = Buffer.from(`${JSON.stringify(f.plan)}\n`);
    await expect(verifyPublicPagesPostflight({
      ...f.options,
      expectedPublicCommit: git(f.root, ['rev-parse', 'HEAD']),
      expectedPublicTree: git(f.root, ['rev-parse', 'HEAD^{tree}']),
      reviewedPlanBytes,
      expectedReviewedPlanSha256: sha(reviewedPlanBytes),
    })).rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_ROOT_PRESERVATION_INVALID');
    expect(f.fetchImpl).not.toHaveBeenCalled();
  }, 30_000);

  it('rejects a live redirect and changed or oversized generated bytes', async () => {
    const f = fixture();
    const redirect = vi.fn(async (url: string) => {
      const response = new Response(null, {
        status: 302, headers: { location: 'https://example.invalid/' },
      });
      Object.defineProperty(response, 'url', { value: url });
      return response;
    });
    await expect(verifyPublicPagesPostflight({
      ...f.options, fetchImpl: redirect,
    })).rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_HTTP_ROUTE_INVALID');
    const wrongBytes = vi.fn(async (url: string) => {
      const original = f.routeBytes.get(new URL(url).pathname)!;
      const response = new Response(Uint8Array.from(Buffer.alloc(original.length, 0x78)), { status: 200 });
      Object.defineProperty(response, 'url', { value: url });
      return response;
    });
    await expect(verifyPublicPagesPostflight({
      ...f.options, fetchImpl: wrongBytes,
    })).rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_HTTP_HASH_INVALID');
    const oversized = vi.fn(async (url: string) => {
      const original = f.routeBytes.get(new URL(url).pathname)!;
      const response = new Response(Uint8Array.from(Buffer.alloc(original.length + 1, 0x78)), { status: 200 });
      Object.defineProperty(response, 'url', { value: url });
      return response;
    });
    await expect(verifyPublicPagesPostflight({
      ...f.options, fetchImpl: oversized,
    })).rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_HTTP_SIZE_INVALID');
  }, 30_000);

  it('rejects live /404.html bytes that do not match the planned SPA fallback', async () => {
    const f = fixture();
    const fetchImpl = vi.fn(async (url: string) => {
      const bytes = url.endsWith('/ptr/404.html')
        ? Buffer.from('stale fallback') : f.routeBytes.get(new URL(url).pathname)!;
      const response = new Response(Uint8Array.from(bytes), { status: 200 });
      Object.defineProperty(response, 'url', { value: url });
      return response;
    });
    await expect(verifyPublicPagesPostflight({ ...f.options, fetchImpl }))
      .rejects.toThrow(/PUBLIC_PAGES_POSTFLIGHT_HTTP_(?:SIZE|HASH)_INVALID/u);
    expect(fetchImpl.mock.calls.some(([url]) => url === 'https://warpkeep.com/ptr/404.html')).toBe(true);
  }, 20_000);
});

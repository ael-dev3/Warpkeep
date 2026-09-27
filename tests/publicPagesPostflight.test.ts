// @vitest-environment node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// @ts-expect-error Standalone release utilities expose named test seams.
import { allowedGeneratedPath, verifyPublicPagesPostflight } from '../scripts/verify-public-pages-postflight.mjs';
// @ts-expect-error Standalone release utility exposes reviewed document and README policy.
import { PUBLIC_PAGES_MIRROR_MANIFEST_PATH, renderPublicPagesMirrorReadme, SOURCE_PUBLIC_DOCUMENTS } from '../scripts/verify-public-pages-mirror-plan.mjs';

const temporaryRoots: string[] = [];
const sourceCommit = 'a'.repeat(40);
const sourceTree = 'b'.repeat(40);
const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');

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
  write(root, 'CNAME', 'warpkeep.com\n');
  write(root, '.nojekyll', '');
  write(root, 'index.html', '<!doctype html><title>Old Alpha</title>');
  write(root, '404.html', '<!doctype html><title>Old Alpha</title>');
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
    publicationPath: '/',
    fileCount: payloadFiles.length,
    totalByteLength: payloadFiles.reduce((sum, file) => sum + file.byteLength, 0),
    rootHtmlSha256: sha(generated.get('index.html')!),
    contentManifestSha256: sha(JSON.stringify(payloadFiles)),
    files: payloadFiles,
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest)}\n`);
  const hosting = new Map<string, Buffer>([
    ['.nojekyll', Buffer.alloc(0)],
    ['404.html', generated.get('index.html')!],
    ['CNAME', Buffer.from('warpkeep.com\n')],
    ['README.md', renderPublicPagesMirrorReadme(manifest, sha(manifestBytes))],
    [PUBLIC_PAGES_MIRROR_MANIFEST_PATH, manifestBytes],
  ]);
  const documents = new Map((SOURCE_PUBLIC_DOCUMENTS as readonly string[]).map(path => [
    path, Buffer.from(`current reviewed ${path}\n`),
  ]));
  const all = new Map([...generated, ...hosting, ...documents]);
  for (const [path, bytes] of all) write(root, path, bytes);
  const targetEntries = [...all].map(([path, bytes]) => ({
    path, byteLength: bytes.length, sha256: sha(bytes),
    origin: generated.has(path) ? 'generated' : hosting.has(path) ? 'hosting' : 'reviewed-source',
  })).sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  const plan = {
    schemaVersion: 1,
    profile: 'warpkeep-public-pages-mirror-plan-v1',
    sourceCommit,
    sourceTree,
    publicParentCommit,
    publicParentTree,
    payloadManifestSha256: sha(manifestBytes),
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
  const routeBytes = new Map([...generated].map(([path, bytes]) => [`/${path}`, bytes]));
  routeBytes.set('/', generated.get('index.html')!);
  routeBytes.set('/404.html', generated.get('index.html')!);
  routeBytes.set('/owner-canary/', generated.get('owner-canary/index.html')!);
  routeBytes.set('/privacy/', generated.get('privacy/index.html')!);
  routeBytes.set('/social-contract/', generated.get('social-contract/index.html')!);
  routeBytes.set('/terms/', generated.get('terms/index.html')!);
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

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('read-only public Pages postflight', () => {
  it('attests the exact signed public tree and only live generated routes', async () => {
    const f = fixture();
    const before = git(f.root, ['rev-parse', 'HEAD']);
    const result = await verifyPublicPagesPostflight(f.options);
    expect(result).toMatchObject({
      publicCommit: before,
      publicTree: f.options.expectedPublicTree,
      sourceCommit,
      verifiedFileCount: f.manifest.fileCount,
      verifiedRouteCount: f.routeBytes.size,
    });
    expect(f.fetchImpl.mock.calls.map(([url]) => url).sort()).toEqual(
      [...f.routeBytes.keys()].map(path => `https://warpkeep.com${path}`).sort(),
    );
    expect(f.fetchImpl.mock.calls.every(([, options]) => options.redirect === 'manual')).toBe(true);
    expect(f.fetchImpl.mock.calls.some(([url]) => url === 'https://warpkeep.com/404.html')).toBe(true);
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
  });

  it('independently rejects a generated path outside the payload policy or a missing required file', async () => {
    expect(allowedGeneratedPath('video/index.html')).toBe(false);
    expect(allowedGeneratedPath('assets/app.js')).toBe(true);
    const extra = fixture(files => files.set('video/index.html', Buffer.from('unexpected HTML')));
    await expect(verifyPublicPagesPostflight(extra.options))
      .rejects.toThrow('PUBLIC_PAGES_MIRROR_FILE_BOUNDARY_INVALID');
    expect(extra.readRemoteState).not.toHaveBeenCalled();
    const missing = fixture(files => files.delete('favicon-64-7b82ca973fe757f5.png'));
    await expect(verifyPublicPagesPostflight(missing.options))
      .rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_MANIFEST_INVALID');
    expect(missing.readRemoteState).not.toHaveBeenCalled();
  }, 30_000);

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
  });

  it('rejects an unsigned public commit with the same approved tree', async () => {
    const f = fixture();
    git(f.root, ['-c', 'commit.gpgsign=false', 'commit', '--amend', '--no-gpg-sign', '--no-edit', '--quiet']);
    await expect(verifyPublicPagesPostflight({
      ...f.options,
      expectedPublicCommit: git(f.root, ['rev-parse', 'HEAD']),
    })).rejects.toThrow('PUBLIC_PAGES_POSTFLIGHT_GIT_INVALID');
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });

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
  });

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
      const bytes = url.endsWith('/404.html')
        ? Buffer.from('stale fallback') : f.routeBytes.get(new URL(url).pathname)!;
      const response = new Response(Uint8Array.from(bytes), { status: 200 });
      Object.defineProperty(response, 'url', { value: url });
      return response;
    });
    await expect(verifyPublicPagesPostflight({ ...f.options, fetchImpl }))
      .rejects.toThrow(/PUBLIC_PAGES_POSTFLIGHT_HTTP_(?:SIZE|HASH)_INVALID/u);
    expect(fetchImpl.mock.calls.some(([url]) => url === 'https://warpkeep.com/404.html')).toBe(true);
  }, 20_000);
});

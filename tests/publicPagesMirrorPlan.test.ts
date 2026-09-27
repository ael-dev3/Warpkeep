// @vitest-environment node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// @ts-expect-error Standalone release utility has named test seams.
import { writePublicPagesPayloadManifest } from '../scripts/verify-public-pages-payload.mjs';
// @ts-expect-error Standalone release utility has named test seams.
import { SOURCE_PUBLIC_DOCUMENTS, renderPublicPagesMirrorReadme, verifyPublicPagesMirrorPlan } from '../scripts/verify-public-pages-mirror-plan.mjs';
// @ts-expect-error Production output policy is an executable ESM module.
import { allowedProductionHtmlPaths, expectedProductionCspByPath } from '../scripts/verify-production-dist-exclusions.mjs';

const sourceIndex = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const sourceOwnerCanary = readFileSync(resolve(process.cwd(), 'owner-canary/index.html'), 'utf8');
const temporaryRoots: string[] = [];
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

function write(path: string, bytes: Uint8Array | string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

function git(root: string, args: string[]) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 64 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Fixture Git failed: ${args.join(' ')}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function commit(root: string, message: string) {
  git(root, ['add', '--all']);
  git(root, [
    '-c', 'user.name=Warpkeep Fixture',
    '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false',
    'commit', '--quiet', '-m', message,
  ]);
  return git(root, ['rev-parse', 'HEAD']);
}

function candidate() {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-mirror-source-'));
  temporaryRoots.push(root);
  git(root, ['init', '--quiet']);
  write(join(root, '.gitignore'), 'dist/\nartifacts/\n');
  write(join(root, 'README.md'), 'private source fixture\n');
  for (const path of SOURCE_PUBLIC_DOCUMENTS as readonly string[]) {
    write(join(root, path), `source-reviewed ${path}\n`);
  }
  const expectedSourceCommit = commit(root, 'Create exact source fixture');
  const dist = join(root, 'dist');
  for (const path of allowedProductionHtmlPaths as readonly string[]) {
    const document = path === 'index.html'
      ? sourceIndex.replace('/src/main.tsx', '/assets/application-reviewed.js')
      : path === 'owner-canary/index.html'
        ? sourceOwnerCanary.replace('/src/owner-canary/main.tsx', '/assets/ownerCanary-reviewed.js')
        : `<!doctype html><meta http-equiv="Content-Security-Policy" content="${
          expectedProductionCspByPath[path]
        }"><title>Warpkeep</title>`;
    write(join(dist, path), document);
  }
  write(join(dist, 'assets/application-reviewed.js'),
    `const buildSha="${expectedSourceCommit}"; console.info(buildSha);`);
  write(join(dist, 'assets/ownerCanary-reviewed.js'), 'console.info("owner canary");');
  write(join(dist, '.well-known/farcaster.json'), '{}');
  write(join(dist, 'apple-touch-icon-180-fe27e8dc1c97cc36.png'), 'icon');
  write(join(dist, 'favicon-64-7b82ca973fe757f5.png'), 'favicon');
  write(join(dist, 'legal/warpkeep-legal.css'), 'body{color:white}');
  write(join(dist, 'warpkeep-boot.css'), 'body{background:black}');
  write(join(dist, 'warpkeep-noscript.css'), 'noscript{display:block}');
  write(join(dist, 'models/keep.glb'), Buffer.from([0x67, 0x6c, 0x54, 0x46]));
  writePublicPagesPayloadManifest({ repositoryRoot: root, expectedSourceCommit });
  return { root, dist, expectedSourceCommit };
}

function publicMirror(source: ReturnType<typeof candidate>) {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-mirror-public-'));
  temporaryRoots.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['remote', 'add', 'origin', 'https://github.com/ael-dev3/Warpkeep-Live.git']);
  write(join(root, 'CNAME'), 'warpkeep.com\n');
  write(join(root, '.nojekyll'), '');
  write(join(root, 'index.html'), '<!doctype html><title>Old Alpha</title>');
  write(join(root, '404.html'), '<!doctype html><title>Old Alpha</title>');
  write(join(root, 'assets/application-old.js'), 'console.info("old Alpha");');
  write(join(root, 'README.md'), 'Old Alpha public host\n');
  for (const path of SOURCE_PUBLIC_DOCUMENTS as readonly string[]) {
    write(join(root, path), `prior-reviewed ${path}\n`);
  }
  const expectedPublicHead = commit(root, 'Create existing public mirror');
  git(root, ['branch', '-M', 'main']);
  return {
    root,
    expectedPublicHead,
    plan: () => verifyPublicPagesMirrorPlan({
      sourceRoot: source.root,
      expectedSourceCommit: source.expectedSourceCommit,
      publicRoot: root,
      expectedPublicHead,
    }),
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe('read-only public Pages mirror plan', () => {
  it('plans only verified dist, exact hosting files, and current-source legal records', () => {
    const source = candidate();
    const mirror = publicMirror(source);
    const before = git(mirror.root, ['rev-parse', 'HEAD']);
    const plan = mirror.plan();
    expect(plan).toMatchObject({
      profile: 'warpkeep-public-pages-mirror-plan-v1',
      sourceCommit: source.expectedSourceCommit,
      publicParentCommit: mirror.expectedPublicHead,
      obsoleteGeneratedPaths: ['assets/application-old.js'],
    });
    expect(plan.targetFileCount).toBe(plan.targetEntries.length);
    expect(plan.targetEntries.find((entry: { path: string }) => entry.path === '404.html').sha256)
      .toBe(sha(readFileSync(join(source.dist, 'index.html'))));
    expect(plan.targetEntries.find((entry: { path: string }) => entry.path === 'CNAME').sha256)
      .toBe(sha('warpkeep.com\n'));
    expect(plan.targetEntries.find((entry: { path: string }) => entry.path === 'ASSETS-LICENSE.md'))
      .toMatchObject({
        origin: 'reviewed-source',
        sha256: sha('source-reviewed ASSETS-LICENSE.md\n'),
      });
    expect(plan.targetEntries.find((entry: { path: string }) => entry.path === 'README.md'))
      .toMatchObject({
        origin: 'hosting',
        sha256: sha(renderPublicPagesMirrorReadme({
          sourceCommit: plan.sourceCommit,
          sourceTree: plan.sourceTree,
        }, plan.payloadManifestSha256)),
      });
    expect(plan.targetEntries.find((entry: { path: string }) => (
      entry.path === 'docs/releases/0.4.0/public-pages-payload-v1.json'
    ))).toMatchObject({ sha256: plan.payloadManifestSha256 });
    expect(git(mirror.root, ['rev-parse', 'HEAD'])).toBe(before);
    expect(git(mirror.root, ['status', '--porcelain=v1', '--untracked-files=all'])).toBe('');
  });

  it('refuses an untracked file, stale public head, or non-allowlisted tracked file', () => {
    const source = candidate();
    const mirror = publicMirror(source);
    expect(() => verifyPublicPagesMirrorPlan({
      sourceRoot: source.root,
      expectedSourceCommit: source.expectedSourceCommit,
      publicRoot: mirror.root,
      expectedPublicHead: '0'.repeat(40),
    })).toThrow('PUBLIC_PAGES_MIRROR_CHECKOUT_INVALID');
    write(join(mirror.root, '.env'), 'should never become public');
    expect(mirror.plan).toThrow('PUBLIC_PAGES_MIRROR_CHECKOUT_INVALID');
    rmSync(join(mirror.root, '.env'));
    write(join(mirror.root, 'debug.html'), 'unreviewed');
    const newest = commit(mirror.root, 'Add unreviewed file');
    expect(() => verifyPublicPagesMirrorPlan({
      sourceRoot: source.root,
      expectedSourceCommit: source.expectedSourceCommit,
      publicRoot: mirror.root,
      expectedPublicHead: newest,
    })).toThrow('PUBLIC_PAGES_MIRROR_FILE_BOUNDARY_INVALID');
  });

  it('refuses hosting drift and a changed saved candidate manifest', () => {
    const source = candidate();
    const mirror = publicMirror(source);
    write(join(mirror.root, '404.html'), 'not the SPA document');
    expect(mirror.plan).toThrow('PUBLIC_PAGES_MIRROR_CHECKOUT_INVALID');
    write(join(mirror.root, '404.html'), '<!doctype html><title>Old Alpha</title>');
    write(join(source.root, 'artifacts/delivery/0.4.0/public-pages-payload-v1.json'), '{}\n');
    expect(mirror.plan).toThrow('PUBLIC_PAGES_PAYLOAD_MANIFEST_MISMATCH');
  });

  it('accepts the existing public host CNAME line ending while planning canonical LF', () => {
    const source = candidate();
    const mirror = publicMirror(source);
    git(mirror.root, ['config', 'core.autocrlf', 'false']);
    write(join(mirror.root, 'CNAME'), 'warpkeep.com\r\n');
    const revisedPublicHead = commit(mirror.root, 'Use the existing public CNAME form');
    const plan = verifyPublicPagesMirrorPlan({
      sourceRoot: source.root,
      expectedSourceCommit: source.expectedSourceCommit,
      publicRoot: mirror.root,
      expectedPublicHead: revisedPublicHead,
    });
    expect(plan.targetEntries.find((entry: { path: string }) => entry.path === 'CNAME'))
      .toMatchObject({ sha256: sha('warpkeep.com\n') });
  });

  it('refuses a redirected public push URL despite the expected fetch URL', () => {
    const source = candidate();
    const mirror = publicMirror(source);
    git(mirror.root, ['config', 'remote.origin.pushurl', 'https://example.invalid/other.git']);
    expect(mirror.plan).toThrow('PUBLIC_PAGES_MIRROR_CHECKOUT_INVALID');
  });

  it.each(['--assume-unchanged', '--skip-worktree'])(
    'refuses a public README hidden with %s even when Git status omits its edit',
    flag => {
      const source = candidate();
      const mirror = publicMirror(source);
      git(mirror.root, ['update-index', flag, '--', 'README.md']);
      write(join(mirror.root, 'README.md'), 'hidden unreviewed text\n');
      expect(git(mirror.root, ['status', '--porcelain=v1', '--untracked-files=all'])).toBe('');
      expect(mirror.plan).toThrow('PUBLIC_PAGES_MIRROR_CHECKOUT_INVALID');
    },
  );
});

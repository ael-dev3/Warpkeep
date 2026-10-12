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
import { parse } from 'yaml';

// @ts-expect-error Standalone release utility has named test seams.
import { writePublicPagesPayloadManifest } from '../scripts/verify-public-pages-payload.mjs';
// @ts-expect-error Standalone release utility has named test seams.
import { PUBLIC_PAGES_LEGAL_HEADERS_PATH, PUBLIC_PAGES_LEGAL_PLAIN_PATHS, SOURCE_PUBLIC_DOCUMENTS, PUBLIC_PAGES_WORKFLOW_PATH, PUBLIC_PAGES_WORKFLOW_TEMPLATE_PATH, generatedPath, inspectPublicMirror, publicPagesLegalHeadersBytes, renderPublicPagesMirrorReadme, verifyPublicPagesMirrorPlan } from '../scripts/verify-public-pages-mirror-plan.mjs';
import { allowedProductionHtmlPaths, expectedProductionCspByPath } from '../scripts/verify-production-dist-exclusions.mjs';

const workflowTemplateBytes = readFileSync(resolve(process.cwd(), PUBLIC_PAGES_WORKFLOW_TEMPLATE_PATH));
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
  write(join(root, PUBLIC_PAGES_WORKFLOW_TEMPLATE_PATH), workflowTemplateBytes);
  const expectedSourceCommit = commit(root, 'Create exact source fixture');
  const dist = join(root, 'dist');
  for (const path of allowedProductionHtmlPaths) {
    const document = path === 'index.html'
      ? sourceIndex.replace('/src/main.tsx', '/assets/application-reviewed.js')
      : path === 'owner-canary/index.html'
        ? sourceOwnerCanary.replace('/src/owner-canary/main.tsx', '/assets/ownerCanary-reviewed.js')
        : `<!doctype html><meta http-equiv="Content-Security-Policy" content="${
          expectedProductionCspByPath[path]
        }"><title>Warpkeep</title>`;
    write(join(dist, path), document.replaceAll('/assets/', '/ptr/assets/'));
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
  write(join(dist, 'audio/warpkeep-genesis-002-theme.m4a'), 'reviewed Genesis 002 soundtrack');
  write(join(dist, 'models/greater-realm/biome-trees/v3/manifest.json'),
    '{"schema":"warpkeep-greater-realm-biome-trees.runtime.v1"}');
  writePublicPagesPayloadManifest({ repositoryRoot: root, expectedSourceCommit, publicationPath: '/ptr/' });
  return { root, dist, expectedSourceCommit };
}

function publicMirror(source: ReturnType<typeof candidate>) {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-mirror-public-'));
  temporaryRoots.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['remote', 'add', 'origin', 'https://github.com/ael-dev3/Warpkeep-Live.git']);
  write(join(root, 'CNAME'), 'warpkeep.com\n');
  write(join(root, '.nojekyll'), '');
  write(join(root, 'index.html'), '<!doctype html><title>Old Alpha</title>');
  write(join(root, '404.html'), '<!doctype html><title>Old Alpha</title>');
  write(join(root, 'assets/application-old.js'), 'console.info("old Alpha");');
  write(join(root, 'audio/warpkeep-genesis-002-theme.m4a'), 'preserved Genesis 002 soundtrack');
  write(join(root, 'models/greater-realm/biome-trees/v3/manifest.json'), '{"preserved":true}');
  write(join(root, 'README.md'), 'Old Alpha public host\n');
  for (const path of SOURCE_PUBLIC_DOCUMENTS as readonly string[]) {
    write(join(root, path), `prior-reviewed ${path}\n`);
  }
  const expectedPublicHead = commit(root, 'Create existing public mirror');
  git(root, ['branch', '-M', 'main']);
  return {
    root,
    expectedPublicHead,
    plan: (deploymentMode?: 'workflow') => verifyPublicPagesMirrorPlan({
      sourceRoot: source.root,
      expectedSourceCommit: source.expectedSourceCommit,
      publicRoot: root,
      expectedPublicHead,
      ...(deploymentMode ? { deploymentMode } : {}),
    }),
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe('read-only public Pages mirror plan', () => {
  it('adds the exact source-reviewed control only through explicit workflow opt-in', () => {
    const source = candidate();
    const mirror = publicMirror(source);
    const legacy = mirror.plan();
    expect(legacy).not.toHaveProperty('deploymentMode');
    expect(legacy.targetEntries.some((entry: { path: string }) => entry.path.startsWith('.github/'))).toBe(false);
    const controlled = mirror.plan('workflow');
    expect(controlled.deploymentMode).toBe('workflow');
    expect(controlled.targetEntries.find((entry: { path: string }) => entry.path === PUBLIC_PAGES_WORKFLOW_PATH))
      .toEqual({ path: PUBLIC_PAGES_WORKFLOW_PATH, origin: 'reviewed-control',
        byteLength: workflowTemplateBytes.length, sha256: sha(workflowTemplateBytes) });
    expect(controlled.preservedRootManifestSha256).toBe(legacy.preservedRootManifestSha256);
    expect(controlled.payloadManifestSha256).toBe(legacy.payloadManifestSha256);
    const workflow = parse(workflowTemplateBytes.toString('utf8'));
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
    expect(Object.keys(workflow.jobs)).toEqual(['deploy-pages']);
    expect(workflow.jobs['deploy-pages']['timeout-minutes']).toBe(3);
    expect(workflow.jobs['deploy-pages'].steps.filter((step: { uses?: string }) => step.uses)
      .map((step: { uses: string }) => step.uses)).toEqual([
      'actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0',
      'actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9',
      'actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128',
    ]);
    expect(workflow.jobs['deploy-pages'].steps.filter((step: { run?: string }) => step.run)
      .every((step: { run: string }) => !step.run.includes('${{'))).toBe(true);
    expect(git(mirror.root, ['rev-parse', 'HEAD'])).toBe(mirror.expectedPublicHead);
  }, 30_000);

  it('accepts only the exact committed template and never silently removes an existing workflow', () => {
    const source = candidate();
    const mirror = publicMirror(source);
    write(join(mirror.root, PUBLIC_PAGES_WORKFLOW_PATH), workflowTemplateBytes);
    const publicHead = commit(mirror.root, 'Install exact fixture control');
    expect(inspectPublicMirror(mirror.root, publicHead).tracked).toContain(PUBLIC_PAGES_WORKFLOW_PATH);
    const options = { sourceRoot: source.root, expectedSourceCommit: source.expectedSourceCommit,
      publicRoot: mirror.root, expectedPublicHead: publicHead };
    expect(() => verifyPublicPagesMirrorPlan(options)).toThrow('PUBLIC_PAGES_MIRROR_DEPLOYMENT_MODE_INVALID');
    expect(verifyPublicPagesMirrorPlan({ ...options, deploymentMode: 'workflow' }).deploymentMode).toBe('workflow');
    write(join(mirror.root, PUBLIC_PAGES_WORKFLOW_PATH), Buffer.concat([workflowTemplateBytes, Buffer.from('# unreviewed\n')]));
    const changed = commit(mirror.root, 'Mutate fixture control');
    expect(() => inspectPublicMirror(mirror.root, changed)).toThrow('PUBLIC_PAGES_MIRROR_WORKFLOW_INVALID');
  }, 30_000);

  it.each(['.github/workflows/other.yml', '.github/WORKFLOWS/ptr-pages.yml', '.github/workflows/nested/ptr-pages.yml'])(
    'rejects a copied control at %s', path => {
      const source = candidate();
      const mirror = publicMirror(source);
      write(join(mirror.root, path), workflowTemplateBytes);
      const changed = commit(mirror.root, 'Copy fixture control to an unapproved path');
      expect(() => inspectPublicMirror(mirror.root, changed)).toThrow('PUBLIC_PAGES_MIRROR_FILE_BOUNDARY_INVALID');
    }, 30_000,
  );

  it.each(['legacy', 'workflow-v2', null])('rejects unsupported explicit deployment mode %s', deploymentMode => {
    const source = candidate();
    const mirror = publicMirror(source);
    expect(() => verifyPublicPagesMirrorPlan({ sourceRoot: source.root,
      expectedSourceCommit: source.expectedSourceCommit, publicRoot: mirror.root,
      expectedPublicHead: mirror.expectedPublicHead, deploymentMode }))
      .toThrow('PUBLIC_PAGES_MIRROR_DEPLOYMENT_MODE_INVALID');
  });

  it('recognizes only the reviewed M4A tracks and exact tree metadata at root and PTR paths', () => {
    expect(generatedPath('ptr/assets/../application.js')).toBe(false);
    expect(generatedPath('ptr/ptr/assets/application.js')).toBe(false);
    expect(generatedPath('audio/warpkeep-verdant-menu-theme.m4a')).toBe(true);
    expect(generatedPath('audio/warpkeep-title-theme-a.mp3')).toBe(true);
    expect(generatedPath('audio/other.m4a')).toBe(false);
    expect(generatedPath('audio/nested/warpkeep-verdant-menu-theme.m4a')).toBe(false);
    expect(generatedPath('audio/warpkeep-verdant-menu-theme.M4A')).toBe(false);
    for (const path of [
      'audio/warpkeep-genesis-002-theme.m4a',
      'models/greater-realm/biome-trees/v3/manifest.json',
    ]) {
      expect(generatedPath(path)).toBe(true);
      expect(generatedPath(`ptr/${path}`)).toBe(true);
      expect(generatedPath(`ptr/ptr/${path}`)).toBe(false);
    }
    for (const path of [
      'audio/other.m4a', 'audio/nested/warpkeep-genesis-002-theme.m4a',
      'audio/warpkeep-genesis-002-theme.M4A', 'audio/../warpkeep-genesis-002-theme.m4a',
      'models/other/manifest.json', 'models/greater-realm/biome-trees/v2/manifest.json',
      'models/greater-realm/biome-trees/v3/manifest.JSON',
      'models/greater-realm/biome-trees/v3/../manifest.json',
    ]) {
      expect(generatedPath(path)).toBe(false);
      expect(generatedPath(`ptr/${path}`)).toBe(false);
    }
  });

  it('plans only verified dist, exact hosting files, and current-source legal records', () => {
    const source = candidate();
    const mirror = publicMirror(source);
    const before = git(mirror.root, ['rev-parse', 'HEAD']);
    const plan = mirror.plan();
    expect(plan).toMatchObject({
      profile: 'warpkeep-public-pages-ptr-mirror-plan-v1',
      publicationPath: '/ptr/',
      sourceCommit: source.expectedSourceCommit,
      publicParentCommit: mirror.expectedPublicHead,
      obsoleteGeneratedPaths: [],
    });
    expect(plan.targetFileCount).toBe(plan.targetEntries.length);
    for (const path of [
      'audio/warpkeep-genesis-002-theme.m4a',
      'models/greater-realm/biome-trees/v3/manifest.json',
    ]) {
      expect(plan.targetEntries.find((entry: { path: string }) => entry.path === `ptr/${path}`))
        .toMatchObject({ origin: 'generated', sha256: sha(readFileSync(join(source.dist, path))) });
      expect(plan.targetEntries.find((entry: { path: string }) => entry.path === path))
        .toMatchObject({ origin: 'preserved-existing', sha256: sha(readFileSync(join(mirror.root, path))) });
    }
    expect(plan.targetEntries.find((entry: { path: string }) => entry.path === 'ptr/404.html').sha256)
      .toBe(sha(readFileSync(join(source.dist, 'index.html'))));
    expect(plan.targetEntries.find((entry: { path: string }) => entry.path === 'index.html'))
      .toMatchObject({ origin: 'preserved-existing', sha256: sha('<!doctype html><title>Old Alpha</title>') });
    expect(plan.targetEntries.find((entry: { path: string }) => entry.path === 'assets/application-old.js'))
      .toMatchObject({ origin: 'preserved-existing', sha256: sha('console.info("old Alpha");') });
    expect(plan.targetEntries.find((entry: { path: string }) => entry.path === 'CNAME').origin)
      .toBe('preserved-existing');
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
    const legalHeaders = publicPagesLegalHeadersBytes();
    expect(plan.targetEntries.find((entry: { path: string }) => entry.path === PUBLIC_PAGES_LEGAL_HEADERS_PATH))
      .toMatchObject({ origin: 'hosting', byteLength: legalHeaders.length, sha256: sha(legalHeaders) });
    const headerText = legalHeaders.toString('utf8');
    expect(headerText).toContain('Content-Type: text/plain; charset=utf-8');
    for (const path of PUBLIC_PAGES_LEGAL_PLAIN_PATHS as readonly string[]) {
      expect(headerText).toContain(`/${path}\n  Content-Type: text/plain; charset=utf-8\n`);
    }
    for (const path of PUBLIC_PAGES_LEGAL_PLAIN_PATHS as readonly string[]) {
      expect(plan.targetEntries.find((entry: { path: string }) => entry.path === path))
        .toMatchObject({ origin: 'reviewed-source', sha256: sha(`source-reviewed ${path}\n`) });
    }
    expect(plan.targetEntries.find((entry: { path: string }) => (
      entry.path === 'docs/releases/0.4.0/public-pages-ptr-payload-v1.json'
    ))).toMatchObject({ origin: 'hosting', sha256: plan.payloadManifestSha256 });
    expect(git(mirror.root, ['rev-parse', 'HEAD'])).toBe(before);
    expect(git(mirror.root, ['status', '--porcelain=v1', '--untracked-files=all'])).toBe('');
  }, 30_000);

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

  it('serves extensionless legal files as text through hosting metadata without preserving or rewriting them', () => {
    const source = candidate();
    const mirror = publicMirror(source);
    const before = mirror.plan();
    write(join(mirror.root, '_redirects'), '/ /ptr/ 302\n');
    const redirected = commit(mirror.root, 'Add an unapproved headers sibling');
    expect(() => verifyPublicPagesMirrorPlan({
      sourceRoot: source.root,
      expectedSourceCommit: source.expectedSourceCommit,
      publicRoot: mirror.root,
      expectedPublicHead: redirected,
    })).toThrow('PUBLIC_PAGES_MIRROR_FILE_BOUNDARY_INVALID');
    rmSync(join(mirror.root, '_redirects'));
    write(join(mirror.root, PUBLIC_PAGES_LEGAL_HEADERS_PATH), 'not the reviewed rule\n');
    const replaced = commit(mirror.root, 'Replace generated legal headers');
    const plan = verifyPublicPagesMirrorPlan({
      sourceRoot: source.root,
      expectedSourceCommit: source.expectedSourceCommit,
      publicRoot: mirror.root,
      expectedPublicHead: replaced,
    });
    const legalHeaders = publicPagesLegalHeadersBytes();
    expect(plan.preservedRootEntryCount).toBe(before.preservedRootEntryCount);
    expect(plan.preservedRootManifestSha256).toBe(before.preservedRootManifestSha256);
    expect(plan.targetEntries.find((entry: { path: string }) => entry.path === PUBLIC_PAGES_LEGAL_HEADERS_PATH))
      .toMatchObject({ origin: 'hosting', sha256: sha(legalHeaders) });
    for (const path of PUBLIC_PAGES_LEGAL_PLAIN_PATHS as readonly string[]) {
      expect(plan.targetEntries.find((entry: { path: string }) => entry.path === path))
        .toMatchObject({ origin: 'reviewed-source', sha256: sha(readFileSync(join(source.root, path))) });
    }
  }, 30_000);

  it('refuses hosting drift and a changed saved candidate manifest', () => {
    const source = candidate();
    const mirror = publicMirror(source);
    write(join(mirror.root, '404.html'), 'not the SPA document');
    expect(mirror.plan).toThrow('PUBLIC_PAGES_MIRROR_CHECKOUT_INVALID');
    write(join(mirror.root, '404.html'), '<!doctype html><title>Old Alpha</title>');
    write(join(source.root, 'artifacts/delivery/0.4.0/public-pages-payload-v1.json'), '{}\n');
    expect(mirror.plan).toThrow('PUBLIC_PAGES_PAYLOAD_MANIFEST_MISMATCH');
  });

  it('preserves the existing public host CNAME bytes and line ending', () => {
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
      .toMatchObject({ origin: 'preserved-existing', sha256: sha('warpkeep.com\r\n') });
  }, 30_000);

  it('preserves committed LF CNAME bytes when a clean autocrlf checkout uses CRLF', () => {
    const source = candidate();
    const mirror = publicMirror(source);
    git(mirror.root, ['config', 'core.autocrlf', 'true']);
    rmSync(join(mirror.root, 'CNAME'));
    git(mirror.root, ['checkout-index', '--force', '--', 'CNAME']);
    git(mirror.root, ['add', '--renormalize', '--', 'CNAME']);
    expect(readFileSync(join(mirror.root, 'CNAME'))).toEqual(Buffer.from('warpkeep.com\r\n'));
    expect(git(mirror.root, ['diff', '--cached', '--exit-code', 'HEAD', '--', 'CNAME'])).toBe('');
    expect(git(mirror.root, ['status', '--porcelain=v1', '--untracked-files=all'])).toBe('');
    expect(git(mirror.root, ['rev-parse', 'HEAD'])).toBe(mirror.expectedPublicHead);
    const plan = mirror.plan();
    expect(plan.targetEntries.find((entry: { path: string }) => entry.path === 'CNAME'))
      .toMatchObject({ origin: 'preserved-existing', byteLength: 13, sha256: sha('warpkeep.com\n') });
  }, 30_000);

  it('preserves binary Alpha Git blob bytes without decoding them as UTF-8', () => {
    const source = candidate();
    const mirror = publicMirror(source);
    const bytes = Buffer.from([0x67, 0x6c, 0x54, 0x46, 0x00, 0xff, 0xc3, 0x28, 0x0d, 0x0a]);
    write(join(mirror.root, 'models/alpha.glb'), bytes);
    const revisedPublicHead = commit(mirror.root, 'Add existing binary Alpha model');
    const plan = verifyPublicPagesMirrorPlan({
      sourceRoot: source.root,
      expectedSourceCommit: source.expectedSourceCommit,
      publicRoot: mirror.root,
      expectedPublicHead: revisedPublicHead,
    });
    expect(plan.targetEntries.find((entry: { path: string }) => entry.path === 'models/alpha.glb'))
      .toMatchObject({ origin: 'preserved-existing', byteLength: bytes.length, sha256: sha(bytes) });
  }, 30_000);

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

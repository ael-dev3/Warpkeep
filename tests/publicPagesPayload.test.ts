// @vitest-environment node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// @ts-expect-error Standalone release utility has named test seams.
import { checkPublicPagesPayloadManifest, verifyPublicPagesPayload, writePublicPagesPayloadManifest } from '../scripts/verify-public-pages-payload.mjs';
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

function createCandidate() {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-public-payload-'));
  temporaryRoots.push(root);
  git(root, ['init', '--quiet']);
  write(join(root, '.gitignore'), 'dist/\nartifacts/\n');
  write(join(root, 'README.md'), 'reviewed source fixture\n');
  git(root, ['add', '--', '.gitignore', 'README.md']);
  git(root, [
    '-c', 'user.name=Warpkeep Fixture',
    '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false',
    'commit', '--quiet', '-m', 'Create source fixture',
  ]);
  const expectedSourceCommit = git(root, ['rev-parse', 'HEAD']);
  const dist = join(root, 'dist');
  for (const htmlPath of allowedProductionHtmlPaths as readonly string[]) {
    let document: string;
    if (htmlPath === 'index.html') {
      document = sourceIndex.replace(
        '/src/main.tsx',
        '/assets/application-reviewed.js',
      );
    } else if (htmlPath === 'owner-canary/index.html') {
      document = sourceOwnerCanary.replace(
        '/src/owner-canary/main.tsx',
        '/assets/ownerCanary-reviewed.js',
      );
    } else {
      document = `<!doctype html><meta http-equiv="Content-Security-Policy" content="${
        expectedProductionCspByPath[htmlPath]
      }"><title>Warpkeep</title>`;
    }
    write(join(dist, htmlPath), document);
  }
  write(join(dist, 'assets/application-reviewed.js'),
    `const buildSha = "${expectedSourceCommit}"; console.info(buildSha);`);
  write(join(dist, 'assets/ownerCanary-reviewed.js'),
    'document.documentElement.dataset.ownerCanary = "v1";');
  write(join(dist, '.well-known/farcaster.json'), '{"miniapp":{"version":"1"}}');
  write(join(dist, 'apple-touch-icon-180-fe27e8dc1c97cc36.png'), 'fixture icon');
  write(join(dist, 'favicon-64-7b82ca973fe757f5.png'), 'fixture favicon');
  write(join(dist, 'legal/warpkeep-legal.css'), 'body{color:white}');
  write(join(dist, 'warpkeep-boot.css'), 'body{background:black}');
  write(join(dist, 'warpkeep-noscript.css'), 'noscript{display:block}');
  write(join(dist, 'models/keep.glb'), Buffer.from([0x67, 0x6c, 0x54, 0x46]));
  return { root, dist, expectedSourceCommit };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('public Pages candidate payload', () => {
  it('derives stable source, tree, and every public file hash without modifying dist', () => {
    const candidate = createCandidate();
    const first = verifyPublicPagesPayload({
      repositoryRoot: candidate.root,
      expectedSourceCommit: candidate.expectedSourceCommit,
    });
    const second = verifyPublicPagesPayload({
      repositoryRoot: candidate.root,
      expectedSourceCommit: candidate.expectedSourceCommit,
    });
    expect(first.bytes).toEqual(second.bytes);
    expect(first.manifest).toMatchObject({
      schemaVersion: 1,
      profile: 'warpkeep-public-pages-payload-v1',
      canonicalOrigin: 'https://warpkeep.com',
      sourceCommit: candidate.expectedSourceCommit,
      sourceTree: git(candidate.root, ['rev-parse', 'HEAD^{tree}']),
      publicationPath: '/',
      fileCount: first.manifest.files.length,
    });
    expect(first.manifest.contentManifestSha256)
      .toBe(sha(JSON.stringify(first.manifest.files)));
    expect(first.manifest.files.find((entry: { path: string }) => entry.path === 'index.html'))
      .toMatchObject({ sha256: sha(readFileSync(join(candidate.dist, 'index.html'))) });
    expect(first.manifest.files.map((entry: { path: string }) => entry.path))
      .toEqual([...first.manifest.files.map((entry: { path: string }) => entry.path)].sort());
    expect(existsSync(join(candidate.dist, '404.html'))).toBe(false);
    expect(existsSync(join(candidate.dist, 'CNAME'))).toBe(false);
    expect(existsSync(join(candidate.root, 'artifacts'))).toBe(false);
  });

  it('writes one ignored deterministic manifest outside dist and reads it back', () => {
    const candidate = createCandidate();
    const expected = verifyPublicPagesPayload({
      repositoryRoot: candidate.root,
      expectedSourceCommit: candidate.expectedSourceCommit,
    });
    const first = writePublicPagesPayloadManifest({
      repositoryRoot: candidate.root,
      expectedSourceCommit: candidate.expectedSourceCommit,
    });
    const second = writePublicPagesPayloadManifest({
      repositoryRoot: candidate.root,
      expectedSourceCommit: candidate.expectedSourceCommit,
    });
    expect(first).toEqual(second);
    expect(first.path).toBe(join(
      candidate.root, 'artifacts/delivery/0.4.0/public-pages-payload-v1.json',
    ));
    expect(readFileSync(first.path)).toEqual(expected.bytes);
    expect(first.manifestSha256).toBe(sha(expected.bytes));
    expect(checkPublicPagesPayloadManifest({
      repositoryRoot: candidate.root,
      expectedSourceCommit: candidate.expectedSourceCommit,
    })).toEqual(first);
    expect(git(candidate.root, ['status', '--porcelain=v1', '--untracked-files=all'])).toBe('');
    expect(existsSync(join(candidate.dist, 'artifacts'))).toBe(false);

    write(join(candidate.dist, 'models/keep.glb'), Buffer.from([0x67, 0x6c, 0x54, 0x47]));
    expect(() => checkPublicPagesPayloadManifest({
      repositoryRoot: candidate.root,
      expectedSourceCommit: candidate.expectedSourceCommit,
    })).toThrow('PUBLIC_PAGES_PAYLOAD_MANIFEST_MISMATCH');
  });

  it('rejects a stale source, dirty tracked source, or wrong embedded build SHA', () => {
    const stale = createCandidate();
    expect(() => verifyPublicPagesPayload({
      repositoryRoot: stale.root,
      expectedSourceCommit: '0'.repeat(40),
    })).toThrow('PUBLIC_PAGES_PAYLOAD_SOURCE_CHANGED');

    const dirty = createCandidate();
    write(join(dirty.root, 'README.md'), 'uncommitted change\n');
    expect(() => verifyPublicPagesPayload({
      repositoryRoot: dirty.root,
      expectedSourceCommit: dirty.expectedSourceCommit,
    })).toThrow('PUBLIC_PAGES_PAYLOAD_SOURCE_CHANGED');

    const wrongBuild = createCandidate();
    write(join(wrongBuild.dist, 'assets/application-reviewed.js'),
      `const buildSha = "${'f'.repeat(40)}";`);
    expect(() => verifyPublicPagesPayload({
      repositoryRoot: wrongBuild.root,
      expectedSourceCommit: wrongBuild.expectedSourceCommit,
    })).toThrow('PUBLIC_PAGES_PAYLOAD_BUILD_IDENTITY_INVALID');
  });

  it('accepts a build SHA in a JavaScript chunk reached through static or Vite split imports', () => {
    const staticImport = createCandidate();
    write(join(staticImport.dist, 'assets/application-reviewed.js'),
      'import "./realmReleaseIdentity-reviewed.js";');
    write(join(staticImport.dist, 'assets/realmReleaseIdentity-reviewed.js'),
      `const buildSha = "${staticImport.expectedSourceCommit}";`);
    expect(() => verifyPublicPagesPayload({
      repositoryRoot: staticImport.root,
      expectedSourceCommit: staticImport.expectedSourceCommit,
    })).not.toThrow();

    const viteSplit = createCandidate();
    write(join(viteSplit.dist, 'assets/application-reviewed.js'),
      'const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/runtime-reviewed.js","assets/realmReleaseIdentity-reviewed.js"])))=>i.map(i=>d[i]);'
      + 'import("./runtime-reviewed.js");__vite__mapDeps([0,1]);');
    write(join(viteSplit.dist, 'assets/runtime-reviewed.js'), 'console.info("runtime");');
    write(join(viteSplit.dist, 'assets/realmReleaseIdentity-reviewed.js'),
      `const buildSha = "${viteSplit.expectedSourceCommit}";`);
    expect(() => verifyPublicPagesPayload({
      repositoryRoot: viteSplit.root,
      expectedSourceCommit: viteSplit.expectedSourceCommit,
    })).not.toThrow();
  });

  it('rejects a SHA-bearing decoy outside the reachable JavaScript graph', () => {
    const unreferenced = createCandidate();
    write(join(unreferenced.dist, 'assets/application-reviewed.js'),
      'console.info("ordinary root script");');
    write(join(unreferenced.dist, 'assets/unreferenced-reviewed.js'),
      `const buildSha = "${unreferenced.expectedSourceCommit}";`);
    expect(() => verifyPublicPagesPayload({
      repositoryRoot: unreferenced.root,
      expectedSourceCommit: unreferenced.expectedSourceCommit,
    })).toThrow('PUBLIC_PAGES_PAYLOAD_BUILD_IDENTITY_INVALID');

    const unusedViteEntry = createCandidate();
    write(join(unusedViteEntry.dist, 'assets/application-reviewed.js'),
      'const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/unreferenced-reviewed.js"])))=>i.map(i=>d[i]);'
      + '__vite__mapDeps([]);');
    write(join(unusedViteEntry.dist, 'assets/unreferenced-reviewed.js'),
      `const buildSha = "${unusedViteEntry.expectedSourceCommit}";`);
    expect(() => verifyPublicPagesPayload({
      repositoryRoot: unusedViteEntry.root,
      expectedSourceCommit: unusedViteEntry.expectedSourceCommit,
    })).toThrow('PUBLIC_PAGES_PAYLOAD_BUILD_IDENTITY_INVALID');
  });

  it('rejects source-like files, unexpected root metadata, and missing public documents', () => {
    for (const extra of ['.env', 'CNAME', '.nojekyll', '404.html', 'README.md', 'assets/application-reviewed.js.map']) {
      const candidate = createCandidate();
      write(join(candidate.dist, extra), 'unexpected public file');
      expect(() => verifyPublicPagesPayload({
        repositoryRoot: candidate.root,
        expectedSourceCommit: candidate.expectedSourceCommit,
      })).toThrow();
    }
    const missing = createCandidate();
    rmSync(join(missing.dist, 'legal/warpkeep-legal.css'));
    expect(() => verifyPublicPagesPayload({
      repositoryRoot: missing.root,
      expectedSourceCommit: missing.expectedSourceCommit,
    })).toThrow('PUBLIC_PAGES_PAYLOAD_REQUIRED_FILE_MISSING');
  });

  it('rejects a local QA marker even in an otherwise allowed JavaScript path', () => {
    const candidate = createCandidate();
    write(join(candidate.dist, 'assets/qa.js'), 'const marker = "warpkeep-local-";');
    expect(() => verifyPublicPagesPayload({
      repositoryRoot: candidate.root,
      expectedSourceCommit: candidate.expectedSourceCommit,
    })).toThrow(/Local QA marker/i);
  });

  it('rejects directory junctions and refuses redirected manifest output', () => {
    const candidate = createCandidate();
    const modelTarget = join(candidate.root, 'artifacts/model-target');
    mkdirSync(modelTarget, { recursive: true });
    symlinkSync(
      modelTarget,
      join(candidate.dist, 'models/linked'),
      'junction',
    );
    expect(() => verifyPublicPagesPayload({
      repositoryRoot: candidate.root,
      expectedSourceCommit: candidate.expectedSourceCommit,
    })).toThrow();

    const redirected = createCandidate();
    const outside = join(redirected.root, 'artifacts/outside');
    mkdirSync(outside, { recursive: true });
    write(join(outside, 'sentinel'), 'must remain untouched');
    symlinkSync(outside, join(redirected.root, 'artifacts/delivery'), 'junction');
    expect(() => writePublicPagesPayloadManifest({
      repositoryRoot: redirected.root,
      expectedSourceCommit: redirected.expectedSourceCommit,
    })).toThrow('PUBLIC_PAGES_PAYLOAD_OUTPUT_INVALID');
    expect(readFileSync(join(outside, 'sentinel'), 'utf8')).toBe('must remain untouched');
  });
});

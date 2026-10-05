// @vitest-environment node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// @ts-expect-error Standalone release utility exposes named test seams.
import { writePublicPagesPayloadManifest } from '../scripts/verify-public-pages-payload.mjs';
// @ts-expect-error Standalone release utility exposes named test seams.
import { inspectPublicMirror, PUBLIC_PAGES_LEGAL_HEADERS_PATH, PUBLIC_PAGES_LEGAL_PLAIN_PATHS, publicPagesLegalHeadersBytes, SOURCE_PUBLIC_DOCUMENTS, PUBLIC_PAGES_WORKFLOW_PATH, PUBLIC_PAGES_WORKFLOW_TEMPLATE_PATH, writePublicPagesMirrorPlan } from '../scripts/verify-public-pages-mirror-plan.mjs';
import {
  preparePublicPagesPublication,
  preparePublicPagesRollback,
  publishPublicPagesPublication,
  publishPublicPagesRollback,
} from '../scripts/public-pages-publication-operator.mjs';
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

function fixture(workflowDeployment = false) {
  const source = mkdtempSync(join(tmpdir(), 'warpkeep-pages-operator-source-'));
  const publicRoot = mkdtempSync(join(tmpdir(), 'warpkeep-pages-operator-public-'));
  const signer = mkdtempSync(join(tmpdir(), 'warpkeep-pages-operator-signer-'));
  temporaryRoots.push(source, publicRoot, signer);
  const key = join(signer, 'signing-key');
  command('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key], signer);
  const publicKey = command('ssh-keygen', ['-y', '-f', key], signer);
  const allowedSigners = join(signer, 'allowed_signers');
  write(allowedSigners, `fixture@example.invalid ${publicKey}\n`);
  for (const root of [source, publicRoot]) {
    git(root, ['init', '--quiet']);
    git(root, ['config', 'core.autocrlf', 'false']);
    git(root, ['config', 'user.name', 'Warpkeep Fixture']);
    git(root, ['config', 'user.email', 'fixture@example.invalid']);
    git(root, ['config', 'gpg.format', 'ssh']);
    git(root, ['config', 'user.signingkey', key]);
    git(root, ['config', 'gpg.ssh.allowedSignersFile', allowedSigners]);
    git(root, ['config', 'commit.gpgsign', 'true']);
  }
  write(join(source, '.gitignore'), 'dist/\nartifacts/\n');
  write(join(source, 'README.md'), 'private source fixture\n');
  for (const path of SOURCE_PUBLIC_DOCUMENTS as readonly string[]) {
    write(join(source, path), `source-reviewed ${path}\n`);
  }
  write(join(source, PUBLIC_PAGES_WORKFLOW_TEMPLATE_PATH), workflowTemplateBytes);
  git(source, ['add', '--all']);
  git(source, ['commit', '--quiet', '-m', 'Exact signed source fixture']);
  const sourceCommit = git(source, ['rev-parse', 'HEAD']);
  const dist = join(source, 'dist');
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
    `const buildSha="${sourceCommit}"; console.info(buildSha);`);
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
  writePublicPagesPayloadManifest({ repositoryRoot: source, expectedSourceCommit: sourceCommit,
    publicationPath: '/ptr/' });

  git(publicRoot, ['remote', 'add', 'origin', 'https://github.com/ael-dev3/Warpkeep-Live.git']);
  write(join(publicRoot, 'CNAME'), 'warpkeep.com\n');
  write(join(publicRoot, '.nojekyll'), '');
  write(join(publicRoot, 'index.html'), '<!doctype html><title>Old Alpha</title>');
  write(join(publicRoot, '404.html'), '<!doctype html><title>Old Alpha</title>');
  write(join(publicRoot, 'assets/application-old.js'), 'console.info("old Alpha");');
  write(join(publicRoot, 'audio/warpkeep-genesis-002-theme.m4a'), 'preserved Genesis 002 soundtrack');
  write(join(publicRoot, 'models/greater-realm/biome-trees/v3/manifest.json'), '{"preserved":true}');
  write(join(publicRoot, 'README.md'), 'Old Alpha public host\n');
  for (const path of SOURCE_PUBLIC_DOCUMENTS as readonly string[]) {
    write(join(publicRoot, path), `prior-reviewed ${path}\n`);
  }
  git(publicRoot, ['add', '--all']);
  git(publicRoot, ['commit', '--quiet', '-m', 'Signed existing public host']);
  const parent = git(publicRoot, ['rev-parse', 'HEAD']);
  const parentTree = git(publicRoot, ['rev-parse', 'HEAD^{tree}']);
  git(publicRoot, ['branch', '-M', 'main']);
  const savedPlan = writePublicPagesMirrorPlan({ sourceRoot: source,
    expectedSourceCommit: sourceCommit, publicRoot, expectedPublicHead: parent,
    ...(workflowDeployment ? { deploymentMode: 'workflow' } : {}) });
  const planBytes = readFileSync(savedPlan.path);
  expect(savedPlan.planSha256).toBe(sha(planBytes));
  const signerFingerprint = git(source, ['log', '-1', '--format=%GK']);
  const signerIdentity = git(source, ['log', '-1', '--format=%GS']);
  const common = {
    publicRoot, reviewedPlanBytes: planBytes,
    expectedReviewedPlanSha256: savedPlan.planSha256,
    expectedSignerFingerprint: signerFingerprint,
    expectedSignerIdentity: signerIdentity,
  };
  return { source, dist, publicRoot, parent, parentTree, sourceCommit, common };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('signed public Pages publication and rollback operator', () => {
  it('prepares and publishes the source-bound workflow control while preserving Alpha and PTR bytes', () => {
    const f = fixture(true);
    const prepared = preparePublicPagesPublication({ ...f.common, sourceRoot: f.source });
    expect(git(f.publicRoot, ['rev-parse', 'HEAD'])).toBe(f.parent);
    let remote = f.parent;
    const pushCommit = (_root: string, commit: string) => { remote = commit; };
    publishPublicPagesPublication({ ...f.common, expectedPublicCommit: prepared.publicCommit,
      readRemoteHead: () => remote, pushCommit });
    expect(readFileSync(join(f.publicRoot, PUBLIC_PAGES_WORKFLOW_PATH)))
      .toEqual(workflowTemplateBytes);
    expect(inspectPublicMirror(f.publicRoot, prepared.publicCommit).tracked).toContain(PUBLIC_PAGES_WORKFLOW_PATH);
    for (const path of ['index.html', '404.html', 'CNAME', 'assets/application-old.js',
      'audio/warpkeep-genesis-002-theme.m4a', 'models/greater-realm/biome-trees/v3/manifest.json']) {
      expect(git(f.publicRoot, ['rev-parse', `${prepared.publicCommit}:${path}`]))
        .toBe(git(f.publicRoot, ['rev-parse', `${f.parent}:${path}`]));
    }
    expect(readFileSync(join(f.publicRoot, PUBLIC_PAGES_LEGAL_HEADERS_PATH)))
      .toEqual(publicPagesLegalHeadersBytes());
    for (const path of PUBLIC_PAGES_LEGAL_PLAIN_PATHS as readonly string[]) {
      expect(readFileSync(join(f.publicRoot, path))).toEqual(Buffer.from(`source-reviewed ${path}\n`));
    }
    expect(readFileSync(join(f.publicRoot, 'ptr/index.html'), 'utf8')).toContain('/ptr/assets/');
    expect(JSON.parse(readFileSync(join(f.publicRoot,
      'docs/releases/0.4.0/public-pages-ptr-payload-v1.json'), 'utf8')).files
      .some((entry: { path: string }) => entry.path.startsWith('.github/'))).toBe(false);
  }, 60_000);

  it('rejects changed, copied or incorrectly declared workflow controls before a source or signer read', () => {
    const f = fixture(true);
    for (const change of [
      (plan: { deploymentMode?: string }) => { plan.deploymentMode = 'workflow-v2'; },
      (plan: { deploymentMode?: string }) => { delete plan.deploymentMode; },
      (plan: { targetEntries: { path: string; sha256: string }[] }) => {
        plan.targetEntries.find(entry => entry.path === PUBLIC_PAGES_WORKFLOW_PATH)!.sha256 = '0'.repeat(64);
      },
      (plan: { targetEntries: { path: string }[] }) => {
        plan.targetEntries.find(entry => entry.path === PUBLIC_PAGES_WORKFLOW_PATH)!.path = '.github/workflows/other.yml';
      },
    ]) {
      const plan = JSON.parse(f.common.reviewedPlanBytes.toString('utf8'));
      change(plan);
      plan.targetEntries.sort((a: { path: string }, b: { path: string }) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
      const bytes = Buffer.from(`${JSON.stringify(plan)}\n`);
      expect(() => preparePublicPagesPublication({ ...f.common, sourceRoot: join(f.source, 'missing-source'),
        reviewedPlanBytes: bytes, expectedReviewedPlanSha256: sha(bytes) }))
        .toThrow('PUBLIC_PAGES_PUBLICATION_PLAN_INVALID');
    }
    expect(git(f.publicRoot, ['rev-parse', 'HEAD'])).toBe(f.parent);
  }, 60_000);

  it('prepares the signed LF parent CNAME from a clean CRLF checkout without changing the public ref', () => {
    const f = fixture();
    const workingCname = join(f.publicRoot, 'CNAME');
    git(f.publicRoot, ['config', 'core.autocrlf', 'true']);
    rmSync(workingCname);
    git(f.publicRoot, ['checkout-index', '--force', '--', 'CNAME']);
    git(f.publicRoot, ['add', '--renormalize', '--', 'CNAME']);
    expect(readFileSync(workingCname)).toEqual(Buffer.from('warpkeep.com\r\n'));
    expect(git(f.publicRoot, ['diff', '--cached', '--exit-code', 'HEAD', '--', 'CNAME'])).toBe('');
    expect(git(f.publicRoot, ['status', '--porcelain=v1', '--untracked-files=all'])).toBe('');
    expect(git(f.publicRoot, ['rev-parse', 'HEAD'])).toBe(f.parent);
    const savedPlan = writePublicPagesMirrorPlan({ sourceRoot: f.source,
      expectedSourceCommit: f.sourceCommit, publicRoot: f.publicRoot, expectedPublicHead: f.parent });
    const prepared = preparePublicPagesPublication({ ...f.common, sourceRoot: f.source,
      reviewedPlanBytes: readFileSync(savedPlan.path),
      expectedReviewedPlanSha256: savedPlan.planSha256 });
    const candidateCname = spawnSync('git', ['show', `${prepared.publicCommit}:CNAME`], {
      cwd: f.publicRoot, encoding: null, windowsHide: true, timeout: 30_000,
    });
    expect(candidateCname.status).toBe(0);
    expect(candidateCname.stdout).toEqual(Buffer.from('warpkeep.com\n'));
    expect(git(f.publicRoot, ['rev-parse', `${prepared.publicCommit}:CNAME`]))
      .toBe(git(f.publicRoot, ['rev-parse', `${f.parent}:CNAME`]));
    expect(git(f.publicRoot, ['log', '-1', '--format=%G?', prepared.publicCommit])).toBe('G');
    expect(prepared.publicParentCommit).toBe(f.parent);
    expect(git(f.publicRoot, ['branch', '--show-current'])).toBe('main');
    expect(git(f.publicRoot, ['rev-parse', 'refs/heads/main'])).toBe(f.parent);
    expect(git(f.publicRoot, ['rev-parse', 'HEAD'])).toBe(f.parent);
    expect(git(f.publicRoot, ['status', '--porcelain=v1', '--untracked-files=all'])).toBe('');
    expect(readFileSync(workingCname)).toEqual(Buffer.from('warpkeep.com\r\n'));
  }, 60_000);

  it('prepares an exact signed tree without changing the checkout, then publishes and synchronizes locally', () => {
    const f = fixture();
    const prepared = preparePublicPagesPublication({ ...f.common, sourceRoot: f.source });
    expect(prepared.publicParentCommit).toBe(f.parent);
    expect(prepared.publicTree).not.toBe(f.parentTree);
    expect(git(f.publicRoot, ['rev-parse', 'HEAD'])).toBe(f.parent);
    expect(git(f.publicRoot, ['status', '--porcelain=v1', '--untracked-files=all'])).toBe('');
    expect(git(f.publicRoot, ['log', '-1', '--format=%G?', prepared.publicCommit])).toBe('G');
    let remote = f.parent;
    const pushed: string[] = [];
    const options = { ...f.common, expectedPublicCommit: prepared.publicCommit,
      readRemoteHead: () => remote,
      pushCommit: (_root: string, commit: string) => { pushed.push(commit); remote = commit; } };
    const result = publishPublicPagesPublication(options);
    expect(result).toMatchObject({ publicCommit: prepared.publicCommit,
      localHead: prepared.publicCommit, remoteHead: prepared.publicCommit });
    expect(pushed).toEqual([prepared.publicCommit]);
    expect(git(f.publicRoot, ['status', '--porcelain=v1', '--untracked-files=all'])).toBe('');
    expect(readFileSync(join(f.publicRoot, 'index.html'), 'utf8'))
      .toBe('<!doctype html><title>Old Alpha</title>');
    expect(readFileSync(join(f.publicRoot, 'assets/application-old.js'), 'utf8'))
      .toBe('console.info("old Alpha");');
    expect(readFileSync(join(f.publicRoot, 'ptr/index.html'), 'utf8'))
      .toContain('/ptr/assets/application-reviewed.js');
    expect(readFileSync(join(f.publicRoot, 'ptr/audio/warpkeep-genesis-002-theme.m4a'), 'utf8'))
      .toBe('reviewed Genesis 002 soundtrack');
    expect(readFileSync(join(f.publicRoot, 'audio/warpkeep-genesis-002-theme.m4a'), 'utf8'))
      .toBe('preserved Genesis 002 soundtrack');
    expect(readFileSync(join(f.publicRoot, 'ptr/models/greater-realm/biome-trees/v3/manifest.json'), 'utf8'))
      .toBe('{"schema":"warpkeep-greater-realm-biome-trees.runtime.v1"}');
    expect(readFileSync(join(f.publicRoot, 'models/greater-realm/biome-trees/v3/manifest.json'), 'utf8'))
      .toBe('{"preserved":true}');
    expect(inspectPublicMirror(f.publicRoot, prepared.publicCommit).tracked).toEqual(expect.arrayContaining([
      'ptr/audio/warpkeep-genesis-002-theme.m4a',
      'ptr/models/greater-realm/biome-trees/v3/manifest.json',
    ]));
    expect(publishPublicPagesPublication(options).localHead).toBe(prepared.publicCommit);
    expect(pushed).toEqual([prepared.publicCommit]);
  }, 60_000);

  it('rejects arbitrary audio and model metadata in canonical plans before reading source or signer authority', () => {
    const f = fixture();
    for (const [originalPath, substitutedPath] of [
      ['ptr/audio/warpkeep-genesis-002-theme.m4a', 'ptr/audio/other.m4a'],
      ['ptr/models/greater-realm/biome-trees/v3/manifest.json', 'ptr/models/other/manifest.json'],
      ['ptr/audio/warpkeep-genesis-002-theme.m4a', 'ptr/ptr/audio/warpkeep-genesis-002-theme.m4a'],
    ]) {
      const plan = JSON.parse(f.common.reviewedPlanBytes.toString('utf8'));
      const entry = plan.targetEntries.find((candidate: { path: string }) => candidate.path === originalPath);
      expect(entry).toBeDefined();
      entry.path = substitutedPath;
      plan.targetEntries.sort((a: { path: string }, b: { path: string }) => (
        Buffer.compare(Buffer.from(a.path), Buffer.from(b.path))
      ));
      const reviewedPlanBytes = Buffer.from(`${JSON.stringify(plan)}\n`);
      expect(() => preparePublicPagesPublication({ ...f.common,
        sourceRoot: join(f.source, 'source-root-that-does-not-exist'),
        reviewedPlanBytes, expectedReviewedPlanSha256: sha(reviewedPlanBytes),
      })).toThrow('PUBLIC_PAGES_PUBLICATION_PLAN_INVALID');
    }
    expect(git(f.publicRoot, ['rev-parse', 'HEAD'])).toBe(f.parent);
  }, 60_000);

  it('rejects reviewed-plan, source/build, public checkout and signer drift before publication', () => {
    const f = fixture();
    expect(() => preparePublicPagesPublication({ ...f.common, sourceRoot: f.source,
      expectedReviewedPlanSha256: '0'.repeat(64) }))
      .toThrow('PUBLIC_PAGES_PUBLICATION_PLAN_INVALID');
    expect(() => preparePublicPagesPublication({ ...f.common, sourceRoot: f.source,
      expectedSignerFingerprint: 'SHA256:' + 'A'.repeat(43) }))
      .toThrow('PUBLIC_PAGES_PUBLICATION_SIGNATURE_INVALID');
    write(join(f.dist, 'warpkeep-boot.css'), 'changed after review');
    expect(() => preparePublicPagesPublication({ ...f.common, sourceRoot: f.source }))
      .toThrow();
    write(join(f.dist, 'warpkeep-boot.css'), 'body{background:black}');
    write(join(f.publicRoot, '.env'), 'unreviewed');
    expect(() => preparePublicPagesPublication({ ...f.common, sourceRoot: f.source }))
      .toThrow('PUBLIC_PAGES_MIRROR_CHECKOUT_INVALID');
    expect(git(f.publicRoot, ['rev-parse', 'HEAD'])).toBe(f.parent);
  }, 60_000);

  it('refuses remote drift or failed push without moving local HEAD', () => {
    const f = fixture();
    const prepared = preparePublicPagesPublication({ ...f.common, sourceRoot: f.source });
    const options = { ...f.common, expectedPublicCommit: prepared.publicCommit };
    expect(() => publishPublicPagesPublication({ ...options,
      readRemoteHead: () => '0'.repeat(40), pushCommit: () => { throw new Error('unexpected'); } }))
      .toThrow('PUBLIC_PAGES_PUBLICATION_REMOTE_CHANGED');
    expect(() => publishPublicPagesPublication({ ...options,
      readRemoteHead: () => f.parent, pushCommit: () => { throw new Error('transport'); } }))
      .toThrow('PUBLIC_PAGES_PUBLICATION_PUSH_FAILED');
    expect(git(f.publicRoot, ['rev-parse', 'HEAD'])).toBe(f.parent);
    expect(git(f.publicRoot, ['status', '--porcelain=v1', '--untracked-files=all'])).toBe('');
  }, 60_000);

  it('recovers a transport interruption after remote acceptance and a blocked local sync', () => {
    const f = fixture();
    const prepared = preparePublicPagesPublication({ ...f.common, sourceRoot: f.source });
    let remote = f.parent;
    const options = { ...f.common, expectedPublicCommit: prepared.publicCommit,
      readRemoteHead: () => remote,
      pushCommit: (_root: string, commit: string) => {
        remote = commit;
        throw new Error('response lost after push');
      } };
    expect(publishPublicPagesPublication(options).localHead).toBe(prepared.publicCommit);
    expect(remote).toBe(prepared.publicCommit);
    expect(git(f.publicRoot, ['status', '--porcelain=v1', '--untracked-files=all'])).toBe('');

    const second = fixture();
    const preparedSecond = preparePublicPagesPublication({ ...second.common, sourceRoot: second.source });
    let remoteSecond = second.parent;
    const oldIndex = readFileSync(join(second.publicRoot, 'index.html'));
    const collidingPath = join(second.publicRoot, 'ptr/models/keep.glb');
    const secondOptions = { ...second.common, expectedPublicCommit: preparedSecond.publicCommit,
      readRemoteHead: () => remoteSecond,
      pushCommit: (_root: string, commit: string) => {
        remoteSecond = commit;
        write(join(second.publicRoot, 'index.html'), 'concurrent tracked edit');
        write(collidingPath, 'concurrent untracked collision');
      } };
    expect(() => publishPublicPagesPublication(secondOptions))
      .toThrow('PUBLIC_PAGES_PUBLICATION_LOCAL_SYNC_FAILED');
    expect(git(second.publicRoot, ['rev-parse', 'HEAD'])).toBe(second.parent);
    expect(readFileSync(join(second.publicRoot, 'index.html'), 'utf8'))
      .toBe('concurrent tracked edit');
    expect(readFileSync(collidingPath, 'utf8')).toBe('concurrent untracked collision');
    write(join(second.publicRoot, 'index.html'), oldIndex);
    rmSync(collidingPath);
    expect(publishPublicPagesPublication(secondOptions).localHead).toBe(preparedSecond.publicCommit);
    expect(remoteSecond).toBe(preparedSecond.publicCommit);
  }, 90_000);

  it('publishes a new signed inverse commit and rejects rollback remote drift', () => {
    const f = fixture();
    const prepared = preparePublicPagesPublication({ ...f.common, sourceRoot: f.source });
    let remote = f.parent;
    const pushCommit = (_root: string, commit: string) => { remote = commit; };
    publishPublicPagesPublication({ ...f.common, expectedPublicCommit: prepared.publicCommit,
      readRemoteHead: () => remote, pushCommit });
    const rollback = preparePublicPagesRollback({ ...f.common,
      expectedPublishedCommit: prepared.publicCommit });
    expect(rollback.rollbackTree).toBe(f.parentTree);
    expect(rollback.rollbackCommit).not.toBe(f.parent);
    expect(git(f.publicRoot, ['rev-list', '--parents', '-n', '1', rollback.rollbackCommit]))
      .toBe(`${rollback.rollbackCommit} ${prepared.publicCommit}`);
    expect(git(f.publicRoot, ['rev-parse', 'HEAD'])).toBe(prepared.publicCommit);
    expect(() => publishPublicPagesRollback({ ...f.common,
      expectedPublishedCommit: prepared.publicCommit,
      expectedRollbackCommit: rollback.rollbackCommit,
      readRemoteHead: () => '0'.repeat(40), pushCommit }))
      .toThrow('PUBLIC_PAGES_PUBLICATION_REMOTE_CHANGED');
    const restored = publishPublicPagesRollback({ ...f.common,
      expectedPublishedCommit: prepared.publicCommit,
      expectedRollbackCommit: rollback.rollbackCommit,
      readRemoteHead: () => remote, pushCommit });
    expect(restored).toMatchObject({ publicCommit: rollback.rollbackCommit,
      publicTree: f.parentTree, localHead: rollback.rollbackCommit,
      remoteHead: rollback.rollbackCommit });
    expect(git(f.publicRoot, ['status', '--porcelain=v1', '--untracked-files=all'])).toBe('');
  }, 90_000);

  it('accepts its documented argument names on the command line in every mode', () => {
    // The CLI once rejected `--plan-sha256` (a digit in the name), so no mode could run.
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-pages-operator-cli-'));
    temporaryRoots.push(root);
    const plan = join(root, 'plan.json');
    write(plan, '{}\n');
    const signer = ['--signer-fingerprint', `SHA256:${'A'.repeat(43)}`, '--signer-identity', 'fixture@example.invalid'];
    const modes: Array<[string, string[]]> = [
      ['prepare', ['--source-root', root, '--public-root', root]],
      ['publish', ['--public-root', root, '--commit', 'a'.repeat(40)]],
      ['prepare-rollback', ['--public-root', root, '--published-commit', 'a'.repeat(40)]],
      ['publish-rollback', ['--public-root', root, '--published-commit', 'a'.repeat(40), '--commit', 'b'.repeat(40)]],
    ];
    for (const [mode, args] of modes) {
      const result = spawnSync(process.execPath, [
        resolve(process.cwd(), 'scripts/public-pages-publication-operator.mjs'), mode,
        ...args, '--plan', plan, '--plan-sha256', '0'.repeat(64), ...signer,
      ], { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
      // Argument parsing passes; the deliberately wrong plan digest is what fails.
      expect(result.status).toBe(1);
      expect(result.stderr.trim()).toBe('PUBLIC_PAGES_PUBLICATION_PLAN_INVALID');
    }
  }, 60_000);
});

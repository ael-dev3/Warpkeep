// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync,
  readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const observations = vi.hoisted(() => ({ calls: [] as { args: string[]; cwd: string }[],
  clone: '', fault: '' }));
vi.mock('../scripts/atlas/greater-realm-git.ts', async importOriginal => {
  const actual = await importOriginal<typeof import('../scripts/atlas/greater-realm-git.ts')>();
  return { ...actual, runGreaterRealmTrustedGit(args: readonly string[], cwd: string) {
    observations.calls.push({ args: [...args], cwd });
    const clone = args.includes('clone');
    if (clone) observations.clone = args.at(-1)!;
    const result = actual.runGreaterRealmTrustedGit(args, cwd);
    if (clone && result.status === 0 && observations.fault === 'clone-exit') {
      return { ...result, status: 1, stderr: 'injected local clone failure' };
    }
    if (clone && result.status === 0 && observations.fault === 'clone-signal') {
      return { ...result, status: null, signal: 'SIGTERM' as const };
    }
    if (clone && result.status === 0 && observations.fault === 'hardlink') {
      linkSync(join(cwd, 'unshared-data'), join(observations.clone, '.git', 'objects', 'linked'));
    }
    if (cwd === observations.clone && args.includes('rev-parse')) {
      if (observations.fault === 'wrong-head' && args.at(-1) === 'HEAD') {
        return { ...result, stdout: `${'a'.repeat(40)}\n` };
      }
      if (observations.fault === 'wrong-tree' && args.at(-1) !== 'HEAD') {
        return { ...result, stdout: `${'b'.repeat(40)}\n` };
      }
    }
    return result;
  } };
});
import { runGreaterRealmTrustedGit } from '../scripts/atlas/greater-realm-git';
import { withPtrIndependentSourceRepository } from '../scripts/ptr-production-publisher.mjs';

const roots: string[] = [];
const privateDirectory = (path: string) => {
  mkdirSync(path, { mode: 0o700 }); chmodSync(path, 0o700); return realpathSync(path);
};
const git = (root: string, args: readonly string[]) => {
  const result = runGreaterRealmTrustedGit(args, root);
  expect(result.error).toBeUndefined(); expect(result.status).toBe(0); expect(result.signal).toBeNull();
  return result.stdout.trim();
};
const fixture = () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'warpkeep-ptr-clone-test-')));
  chmodSync(root, 0o700); roots.push(root);
  const repository = privateDirectory(join(root, 'source'));
  const template = privateDirectory(join(root, 'template'));
  git(repository, ['init', `--template=${template}`, '.']);
  git(repository, ['config', 'user.name', 'Local Fixture']);
  git(repository, ['config', 'user.email', 'fixture@example.invalid']);
  writeFileSync(join(repository, 'data.txt'), 'committed data\n', { mode: 0o644 });
  writeFileSync(join(repository, 'script.sh'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  chmodSync(join(repository, 'script.sh'), 0o755);
  git(repository, ['add', '--', 'data.txt', 'script.sh']);
  git(repository, ['commit', '--no-gpg-sign', '-m', 'fixture source']);
  const commit = git(repository, ['rev-parse', 'HEAD']);
  const tree = git(repository, ['rev-parse', 'HEAD^{tree}']);
  const capsule = privateDirectory(join(root, 'capsule'));
  writeFileSync(join(capsule, 'unshared-data'), 'only fixture data\n', { mode: 0o600 });
  observations.calls.length = 0;
  return { root, repository, capsule, commit, tree };
};
const state = (root: string) => ({
  config: readFileSync(join(root, '.git', 'config')),
  index: readFileSync(join(root, '.git', 'index')),
  head: readFileSync(join(root, '.git', 'HEAD')),
  data: readFileSync(join(root, 'data.txt')),
});
const input = (value: ReturnType<typeof fixture>, operation: Parameters<typeof withPtrIndependentSourceRepository>[0]['operation']) => ({
  repositoryRoot: value.repository, sourceCommit: value.commit, privateDirectory: value.capsule, operation,
});
afterEach(() => {
  observations.clone = ''; observations.fault = ''; observations.calls.length = 0;
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// Actual local Git objects and modes; no CLI, dependencies, provider, signing or artifact authority.
describe.skipIf(process.platform === 'win32')('PTR independent committed source repository', () => {
  it('clones independent objects without checkout, copied signing config, hooks, helpers or retained clutter', () => {
    const value = fixture();
    const marker = join(value.root, 'must-not-run');
    const signer = join(value.root, 'local-allowed-signers');
    writeFileSync(signer, 'fixture only\n', { mode: 0o600 });
    git(value.repository, ['config', 'commit.gpgsign', 'true']);
    git(value.repository, ['config', 'gpg.format', 'ssh']);
    git(value.repository, ['config', 'user.signingkey', join(value.root, 'not-a-real-key')]);
    git(value.repository, ['config', 'gpg.ssh.allowedSignersFile', signer]);
    git(value.repository, ['config', 'credential.helper', `!printf forbidden > '${marker}'`]);
    const hooks = join(value.repository, '.git', 'hooks');
    mkdirSync(hooks, { mode: 0o700 });
    writeFileSync(join(hooks, 'post-checkout'), `#!/bin/sh\nprintf forbidden > '${marker}'\n`, { mode: 0o755 });
    vi.stubEnv('GIT_EXEC_PATH', hooks);
    vi.stubEnv('GIT_CONFIG_GLOBAL', signer);
    vi.stubEnv('GIT_CONFIG_COUNT', '1');
    vi.stubEnv('GIT_CONFIG_KEY_0', 'credential.helper');
    vi.stubEnv('GIT_CONFIG_VALUE_0', '!exit 99');
    const before = state(value.repository);
    let clone = '';
    const result = withPtrIndependentSourceRepository(input(value, source => {
      clone = source.repositoryRoot;
      expect(source.sourceCommit).toBe(value.commit); expect(source.sourceTree).toBe(value.tree);
      expect(lstatSync(clone).mode & 0o777).toBe(0o700);
      expect(lstatSync(clone).uid).toBe(process.getuid!());
      expect(readdirSync(clone)).toEqual(['.git']);
      expect(existsSync(join(clone, '.git', 'hooks'))).toBe(false);
      expect(existsSync(join(clone, '.git', 'objects', 'info', 'alternates'))).toBe(false);
      const config = readFileSync(join(clone, '.git', 'config'), 'utf8');
      expect(config).not.toMatch(/user|signing|gpg|credential|allowedSigners|include/iu);
      expect(config).toContain('https://github.com/ael-dev3/Warpkeep.git');
      expect(git(clone, ['show', `${value.commit}:data.txt`])).toBe('committed data');
      expect(git(clone, ['ls-tree', value.commit, '--', 'script.sh'])).toMatch(/^100755 blob /u);
      const blob = git(clone, ['rev-parse', `${value.commit}:data.txt`]);
      const original = lstatSync(join(value.repository, '.git', 'objects', blob.slice(0, 2), blob.slice(2)));
      const copied = lstatSync(join(clone, '.git', 'objects', blob.slice(0, 2), blob.slice(2)));
      expect(copied.nlink).toBe(1); expect([copied.dev, copied.ino]).not.toEqual([original.dev, original.ino]);
      return 'actual independent committed objects';
    }));
    expect(result).toBe('actual independent committed objects');
    expect(state(value.repository)).toEqual(before);
    expect(existsSync(marker)).toBe(false); expect(existsSync(signer)).toBe(true);
    expect(existsSync(clone)).toBe(false); expect(existsSync(join(value.capsule, 'independent-source'))).toBe(false);
    const call = observations.calls.find(row => row.args.includes('clone'))!;
    expect(call.args).toContain('--local'); expect(call.args).toContain('--no-hardlinks');
    expect(call.args).toContain('--no-checkout'); expect(call.args).toContain('credential.helper=');
    expect(call.args).toContain('protocol.allow=never'); expect(call.args).toContain('protocol.ext.allow=never');
    expect(call.args.some(arg => arg.startsWith('--template='))).toBe(true);
    expect(call.args).not.toContain('checkout');
  });

  it('rejects a commit that is not the source HEAD before clone', () => {
    const value = fixture();
    const old = value.commit;
    writeFileSync(join(value.repository, 'data.txt'), 'second version\n');
    git(value.repository, ['add', 'data.txt']); git(value.repository, ['commit', '--no-gpg-sign', '-m', 'next fixture']);
    observations.calls.length = 0;
    const operation = vi.fn();
    expect(() => withPtrIndependentSourceRepository({ ...input(value, operation), sourceCommit: old }))
      .toThrow('PTR_PRODUCTION_SOURCE_CLONE_IDENTITY_INVALID');
    expect(operation).not.toHaveBeenCalled(); expect(observations.calls.some(row => row.args.includes('clone'))).toBe(false);
    expect(existsSync(join(value.capsule, 'independent-source'))).toBe(false);
  });

  it.each(['wrong-head', 'wrong-tree', 'clone-exit', 'clone-signal', 'hardlink'])(
    'refuses altered clone identity/terminal/independence and removes partial objects (%s)', fault => {
      const value = fixture(); const before = state(value.repository); const operation = vi.fn();
      observations.fault = fault;
      expect(() => withPtrIndependentSourceRepository(input(value, operation))).toThrow();
      expect(operation).not.toHaveBeenCalled(); expect(state(value.repository)).toEqual(before);
      expect(existsSync(join(value.capsule, 'independent-source'))).toBe(false);
    },
  );

  it('preserves a thrown build error, removes the clone and keeps canonical metadata', () => {
    const value = fixture(); const before = state(value.repository); const failure = new Error('actual fixture operation failure');
    expect(() => withPtrIndependentSourceRepository(input(value, () => { throw failure; }))).toThrow(failure);
    expect(state(value.repository)).toEqual(before); expect(existsSync(join(value.capsule, 'independent-source'))).toBe(false);
  });

  it('refuses post-build clone mutation instead of accepting a changed context', () => {
    const value = fixture(); const before = state(value.repository);
    expect(() => withPtrIndependentSourceRepository(input(value, source => {
      writeFileSync(join(source.repositoryRoot, '.git', 'config'), '[core]\nfilemode = false\n');
    }))).toThrow('PTR_PRODUCTION_SOURCE_CLONE_CHANGED');
    expect(state(value.repository)).toEqual(before); expect(existsSync(join(value.capsule, 'independent-source'))).toBe(false);
  });

  it('detects canonical ref movement while the operation is running', () => {
    const value = fixture();
    const otherTree = git(value.repository, ['mktree']);
    const otherCommit = git(value.repository, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      'commit-tree', otherTree, '-m', 'other fixture']);
    expect(() => withPtrIndependentSourceRepository(input(value, () => {
      git(value.repository, ['update-ref', 'HEAD', otherCommit, value.commit]);
    }))).toThrow('PTR_PRODUCTION_SOURCE_CLONE_IDENTITY_INVALID');
    expect(existsSync(join(value.capsule, 'independent-source'))).toBe(false);
  });

  it('rejects alternate object provenance before local clone', () => {
    const value = fixture(); const info = join(value.repository, '.git', 'objects', 'info');
    writeFileSync(join(info, 'alternates'), `${join(value.root, 'unreviewed-objects')}\n`, { mode: 0o600 });
    observations.calls.length = 0;
    expect(() => withPtrIndependentSourceRepository(input(value, vi.fn())))
      .toThrow('PTR_PRODUCTION_SOURCE_CLONE_INVENTORY_INVALID');
    expect(observations.calls.some(row => row.args.includes('clone'))).toBe(false);
  });

  it('rejects symlinked source objects without touching the target', () => {
    const value = fixture(); const outside = join(value.root, 'outside');
    writeFileSync(outside, 'not an object\n', { mode: 0o600 });
    const digest = createHash('sha256').update(readFileSync(outside)).digest('hex');
    symlinkSync(outside, join(value.repository, '.git', 'objects', 'info', 'linked'));
    expect(() => withPtrIndependentSourceRepository(input(value, vi.fn())))
      .toThrow('PTR_PRODUCTION_SOURCE_CLONE_INVENTORY_INVALID');
    expect(createHash('sha256').update(readFileSync(outside)).digest('hex')).toBe(digest);
  });


  it('refuses writable source objects before clone', () => {
    const value = fixture(); const objects = join(value.repository, '.git', 'objects');
    chmodSync(objects, 0o777); observations.calls.length = 0;
    expect(() => withPtrIndependentSourceRepository(input(value, vi.fn())))
      .toThrow('PTR_PRODUCTION_SOURCE_CLONE_INVENTORY_INVALID');
    expect(observations.calls.some(row => row.args.includes('clone'))).toBe(false);
    chmodSync(objects, 0o700);
  });
  it('does not follow a clone directory replaced during the build', () => {
    const value = fixture(); const outside = privateDirectory(join(value.root, 'outside'));
    writeFileSync(join(outside, 'held'), 'unchanged\n', { mode: 0o600 });
    expect(() => withPtrIndependentSourceRepository(input(value, source => {
      renameSync(source.repositoryRoot, `${source.repositoryRoot}.displaced`);
      symlinkSync(outside, source.repositoryRoot);
    }))).toThrow('PTR_PRODUCTION_SOURCE_CLONE_INVENTORY_INVALID');
    expect(readFileSync(join(outside, 'held'), 'utf8')).toBe('unchanged\n');
    expect(existsSync(join(value.capsule, 'independent-source'))).toBe(false);
  });
});

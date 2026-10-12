// @vitest-environment node

import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runGreaterRealmTrustedGit } from '../scripts/atlas/greater-realm-git';
import {
  attestGreaterRealmProductionSourceAncestry,
  cleanupGreaterRealmProductionCommitMaterialization,
  createGreaterRealmProductionCommitMaterialization,
} from '../scripts/greater-realm-production-provenance';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function git(repositoryRoot: string, arguments_: readonly string[]): string {
  const result = runGreaterRealmTrustedGit(arguments_, repositoryRoot);
  if (result.error !== undefined || result.status !== 0 || result.stderr !== '') {
    throw new Error('GREATER_REALM_TEST_GIT_UNAVAILABLE');
  }
  return result.stdout;
}

function checkoutFixture() {
  const repositoryRoot = mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-gr-checkout-config-'));
  temporaryDirectories.push(repositoryRoot);
  chmodSync(repositoryRoot, 0o700);
  git(repositoryRoot, ['init', '--quiet']);
  writeFileSync(join(repositoryRoot, 'source.txt'), 'committed source\n', { mode: 0o600 });
  git(repositoryRoot, ['add', 'source.txt']);
  git(repositoryRoot, [
    '-c', 'user.name=Warpkeep Test', '-c', 'user.email=warpkeep-test@example.invalid',
    'commit', '--quiet', '-m', 'source',
  ]);
  git(repositoryRoot, ['remote', 'add', 'origin', 'https://github.com/ael-dev3/Warpkeep.git']);
  for (const relative of ['.git', '.git/info', '.git/objects/info']) {
    chmodSync(join(repositoryRoot, relative), 0o700);
  }
  for (const relative of ['.git/config', '.git/info/exclude']) {
    chmodSync(join(repositoryRoot, relative), 0o600);
  }
  const sourceCommit = git(repositoryRoot, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  return {
    repositoryRoot,
    attest: () => attestGreaterRealmProductionSourceAncestry({
      repositoryRoot, atlasSourceCommit: sourceCommit, moduleSourceCommit: sourceCommit,
    }),
  };
}

describe.skipIf(process.platform !== 'linux')('production source Linux Git checkout configuration', () => {
  it('accepts the actual Actions checkout names with one exact gc.auto=0 without changing config', () => {
    const { repositoryRoot, attest } = checkoutFixture();
    expect(attest).not.toThrow();
    git(repositoryRoot, ['config', '--local', 'gc.auto', '0']);
    chmodSync(join(repositoryRoot, '.git/config'), 0o600);
    expect(git(repositoryRoot, ['config', '--local', '--null', '--name-only', '--list'])
      .split('\0').filter(Boolean).sort()).toEqual([
      'core.bare', 'core.filemode', 'core.logallrefupdates', 'core.repositoryformatversion',
      'gc.auto', 'remote.origin.fetch', 'remote.origin.url',
    ]);
    const before = readFileSync(join(repositoryRoot, '.git/config'));
    expect(attest).not.toThrow();
    expect(readFileSync(join(repositoryRoot, '.git/config'))).toEqual(before);
  });

  it.each(['1', '-1', 'false', '00', '', ' 0', '0\n0'])(
    'rejects noncanonical or enabled automatic GC value %j',
    value => {
      const { repositoryRoot, attest } = checkoutFixture();
      if (value === '') {
        const config = join(repositoryRoot, '.git/config');
        writeFileSync(config, `${readFileSync(config, 'utf8')}\n[gc]\n\tauto =\n`);
      } else {
        git(repositoryRoot, ['config', '--local', 'gc.auto', value]);
      }
      chmodSync(join(repositoryRoot, '.git/config'), 0o600);
      expect(attest).toThrowError('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
    },
  );

  it('rejects duplicate gc.auto=0 entries', () => {
    const { repositoryRoot, attest } = checkoutFixture();
    git(repositoryRoot, ['config', '--local', '--add', 'gc.auto', '0']);
    git(repositoryRoot, ['config', '--local', '--add', 'gc.auto', '0']);
    chmodSync(join(repositoryRoot, '.git/config'), 0o600);
    expect(attest).toThrowError('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
  });

  it.each([
    ['gc.autoDetach', 'false'],
    ['http.proxy', 'http://127.0.0.1:9'],
    ['credential.helper', 'unapproved-helper'],
  ])('still rejects unapproved %s alongside gc.auto=0', (name, value) => {
    const { repositoryRoot, attest } = checkoutFixture();
    git(repositoryRoot, ['config', '--local', 'gc.auto', '0']);
    git(repositoryRoot, ['config', '--local', name, value]);
    chmodSync(join(repositoryRoot, '.git/config'), 0o600);
    expect(attest).toThrowError('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
  });
});


const executableBody = '#!/bin/sh\nprintf preserved\n';

function materializationFixture() {
  const fixture = checkoutFixture();
  mkdirSync(join(fixture.repositoryRoot, 'bin'), { mode: 0o700 });
  writeFileSync(join(fixture.repositoryRoot, 'bin/run.sh'), executableBody, { mode: 0o755 });
  chmodSync(join(fixture.repositoryRoot, 'bin/run.sh'), 0o755);
  writeFileSync(join(fixture.repositoryRoot, 'empty.txt'), '', { mode: 0o644 });
  git(fixture.repositoryRoot, ['add', 'bin/run.sh', 'empty.txt']);
  git(fixture.repositoryRoot, [
    '-c', 'commit.gpgsign=false',
    '-c', 'user.name=Warpkeep Test', '-c', 'user.email=warpkeep-test@example.invalid',
    'commit', '--quiet', '-m', 'executable source',
  ]);
  const sourceCommit = git(fixture.repositoryRoot, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  const parent = mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-gr-materialization-modes-'));
  temporaryDirectories.push(parent);
  chmodSync(parent, 0o700);
  const destination = join(parent, 'tree');
  return {
    ...fixture,
    sourceCommit,
    destination,
    create: () => createGreaterRealmProductionCommitMaterialization({
      repositoryRoot: fixture.repositoryRoot,
      moduleSourceCommit: sourceCommit,
      destination,
    }),
  };
}

function materializationErrorCodes(error: unknown): readonly string[] {
  if (error instanceof AggregateError) {
    return [error.message, ...error.errors.flatMap(materializationErrorCodes)];
  }
  return error instanceof Error ? [error.message] : [];
}

describe.skipIf(process.platform !== 'linux')('production Git regular-file materialization modes', () => {
  it('preserves actual committed executable/data/empty bytes and modes without changing the source index', () => {
    const fixture = materializationFixture();
    expect(git(fixture.repositoryRoot, ['ls-tree', 'HEAD', '--', 'bin/run.sh']))
      .toMatch(/^100755 blob [0-9a-f]{40}\tbin\/run\.sh\n$/u);
    const index = readFileSync(join(fixture.repositoryRoot, '.git/index'));
    const materialization = fixture.create();
    for (const [relative, mode, body] of [
      ['bin/run.sh', 0o755, executableBody],
      ['source.txt', 0o644, 'committed source\n'],
      ['empty.txt', 0o644, ''],
    ] as const) {
      const path = join(materialization.root, relative);
      const status = lstatSync(path);
      expect(status.isFile()).toBe(true);
      expect(status.isSymbolicLink()).toBe(false);
      expect(status.nlink).toBe(1);
      expect(status.mode & 0o7777).toBe(mode);
      expect(readFileSync(path, 'utf8')).toBe(body);
    }
    expect(materialization.verify).not.toThrow();
    materialization.cleanup();
    expect(existsSync(fixture.destination)).toBe(false);
    expect(readFileSync(join(fixture.repositoryRoot, '.git/index'))).toEqual(index);
  });

  it.each([
    ['bin/run.sh', 0o644, 0o755],
    ['bin/run.sh', 0o4755, 0o755],
    ['source.txt', 0o755, 0o644],
  ] as const)('rejects a changed tracked mode %s %o during verification and cleanup', (relative, changed, original) => {
    const fixture = materializationFixture();
    const materialization = fixture.create();
    const path = join(materialization.root, relative);
    chmodSync(path, changed);
    expect(materialization.verify).toThrowError('GREATER_REALM_PRODUCTION_MATERIALIZATION_TRACKED_FILE_INVALID');
    expect(materialization.cleanup).toThrowError('GREATER_REALM_PRODUCTION_MATERIALIZATION_TRACKED_FILE_INVALID');
    expect(existsSync(materialization.root)).toBe(true);
    chmodSync(path, original);
    materialization.cleanup();
    expect(existsSync(materialization.root)).toBe(false);
  });

  it('permits only an exact-mode partial tracked subset and validates every leaf before deleting any', () => {
    const fixture = materializationFixture();
    const materialization = fixture.create();
    const shell = join(materialization.root, 'bin/run.sh');
    const root = lstatSync(materialization.root);
    unlinkSync(join(materialization.root, 'source.txt'));
    writeFileSync(shell, '# partial\n');
    const cleanup = () => cleanupGreaterRealmProductionCommitMaterialization({
      repositoryRoot: fixture.repositoryRoot,
      moduleSourceCommit: materialization.moduleSourceCommit,
      moduleTreeId: materialization.moduleTreeId,
      destination: materialization.root,
      expectedRootIdentity: { dev: root.dev, ino: root.ino },
      allowPartialTracked: true,
    });
    chmodSync(shell, 0o644);
    expect(cleanup).toThrowError('GREATER_REALM_PRODUCTION_MATERIALIZATION_TRACKED_FILE_INVALID');
    expect(existsSync(join(materialization.root, 'empty.txt'))).toBe(true);
    chmodSync(shell, 0o755);
    cleanup();
    expect(existsSync(materialization.root)).toBe(false);
  });

  it.each(['symlink', 'hardlink'] as const)('rejects %s replacement of an executable tracked leaf', kind => {
    const fixture = materializationFixture();
    const materialization = fixture.create();
    const shell = join(materialization.root, 'bin/run.sh');
    unlinkSync(shell);
    if (kind === 'symlink') symlinkSync('../source.txt', shell);
    else linkSync(join(materialization.root, 'source.txt'), shell);
    expect(materialization.verify).toThrowError('GREATER_REALM_PRODUCTION_MATERIALIZATION_TRACKED_FILE_INVALID');
    expect(materialization.cleanup).toThrowError('GREATER_REALM_PRODUCTION_MATERIALIZATION_TRACKED_FILE_INVALID');
    expect(existsSync(materialization.root)).toBe(true);
    unlinkSync(shell);
    writeFileSync(shell, executableBody, { mode: 0o755 });
    chmodSync(shell, 0o755);
    materialization.cleanup();
    expect(existsSync(materialization.root)).toBe(false);
  });

  it.each(['120000', '160000'] as const)('rejects actual nonregular Git mode %s before creating the raw tree', mode => {
    const fixture = materializationFixture();
    if (mode === '120000') {
      symlinkSync('source.txt', join(fixture.repositoryRoot, 'unsupported'));
      git(fixture.repositoryRoot, ['add', 'unsupported']);
    } else {
      git(fixture.repositoryRoot, [
        'update-index', '--add', '--cacheinfo', '160000,' + fixture.sourceCommit + ',unsupported',
      ]);
    }
    git(fixture.repositoryRoot, [
      '-c', 'commit.gpgsign=false',
      '-c', 'user.name=Warpkeep Test', '-c', 'user.email=warpkeep-test@example.invalid',
      'commit', '--quiet', '-m', 'unsupported tree entry',
    ]);
    const sourceCommit = git(fixture.repositoryRoot, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
    expect(git(fixture.repositoryRoot, ['ls-tree', 'HEAD', '--', 'unsupported'])).toMatch(new RegExp('^' + mode + ' '));
    let error: unknown;
    try {
      createGreaterRealmProductionCommitMaterialization({
        repositoryRoot: fixture.repositoryRoot,
        moduleSourceCommit: sourceCommit,
        destination: fixture.destination,
      });
    } catch (caught) { error = caught; }
    expect(materializationErrorCodes(error)).toContain('GREATER_REALM_PRODUCTION_MATERIALIZATION_TREE_INVALID');
    expect(existsSync(fixture.destination)).toBe(false);
  });
});

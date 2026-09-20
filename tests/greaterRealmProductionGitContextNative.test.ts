// @vitest-environment node

import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runGreaterRealmTrustedGit } from '../scripts/atlas/greater-realm-git';
import { attestGreaterRealmProductionSourceAncestry } from '../scripts/greater-realm-production-provenance';

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

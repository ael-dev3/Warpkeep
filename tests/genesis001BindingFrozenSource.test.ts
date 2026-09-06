// @vitest-environment node

import { spawnSync } from 'node:child_process';
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, realpathSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  GENESIS001_FROZEN_SOURCE_COMMIT,
  GENESIS001_FROZEN_SOURCE_INVENTORY_SHA256,
  GENESIS001_FROZEN_SOURCE_TREE,
  createGenesis001FrozenSourceMaterialization,
} from '../scripts/genesis001-binding-frozen-source.mjs';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const root of temporaryDirectories.splice(0)) rmSync(root, { recursive: true, force: true });
});

function privateParent(label = 'warpkeep-g001-frozen-test-'): string {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), label)));
  chmodSync(root, 0o700);
  temporaryDirectories.push(root);
  return root;
}

function materialize() {
  const parent = privateParent();
  const destination = join(parent, 'source');
  return {
    destination,
    value: createGenesis001FrozenSourceMaterialization({
      repositoryRoot: realpathSync(process.cwd()), destination,
    }),
  };
}

function regularFileCount(root: string): number {
  let count = 0;
  const visit = (path: string) => {
    const status = lstatSync(path);
    if (status.isFile()) count += 1;
    else if (status.isDirectory()) for (const name of readdirSync(path)) visit(join(path, name));
  };
  visit(root);
  return count;
}

describe('Genesis 001 authenticated frozen-source materialization', () => {
  it('keeps commit and post-freeze source inventory as distinct authorities', () => {
    expect(GENESIS001_FROZEN_SOURCE_COMMIT).toBe('2ae51984e1fa6ce5b0028c1a250359fed79d819b');
    expect(GENESIS001_FROZEN_SOURCE_TREE).toBe('90deebb5faf4129282f5c35999244f540001b27d');
    expect(GENESIS001_FROZEN_SOURCE_INVENTORY_SHA256)
      .toBe('0e12b32f90f91a80993c52998ef8764109ce926528a71b1933ba527605ff41f9');
    expect(typeof createGenesis001FrozenSourceMaterialization).toBe('function');
  });

  it.skipIf(process.platform !== 'linux')(
    'executes the authenticated materializer, verifies exact frozen bytes, and cleans by identity',
    () => {
      const first = materialize();
      const second = materialize();
      for (const candidate of [first, second]) {
        expect(candidate.value).toMatchObject({
          moduleSourceCommit: GENESIS001_FROZEN_SOURCE_COMMIT,
          moduleTreeId: GENESIS001_FROZEN_SOURCE_TREE,
          sourceClosureDigest: GENESIS001_FROZEN_SOURCE_INVENTORY_SHA256,
        });
        expect(regularFileCount(candidate.destination)).toBe(174);
        const policy = readFileSync(join(
          candidate.destination, 'spacetimedb', 'src', 'genesis001FrozenPolicy.ts',
        ), 'utf8');
        expect(policy).toContain('GENESIS_001_ADMISSION_STATE_MUTATIONS_DISABLED');
        expect(policy).toContain('GENESIS_001_ACCESS_REQUEST_SUBMISSIONS_DISABLED');
        candidate.value.verify();
        candidate.value.cleanup();
        expect(existsSync(candidate.destination)).toBe(false);
      }
    },
  );

  it.skipIf(process.platform !== 'linux')(
    'rejects extra source, content/inode changes, and symlink replacement without broad cleanup',
    () => {
      const extra = materialize();
      writeFileSync(join(extra.destination, 'extra'), 'x', { mode: 0o600 });
      expect(() => extra.value.verify()).toThrow('GENESIS001_FROZEN_SOURCE_UNEXPECTED_ENTRY');
      expect(existsSync(extra.destination)).toBe(true);

      const content = materialize();
      writeFileSync(join(content.destination, 'spacetimedb', 'package.json'), 'changed');
      expect(() => content.value.verify()).toThrow('GENESIS001_FROZEN_SOURCE_CHANGED');
      expect(existsSync(content.destination)).toBe(true);

      const inode = materialize();
      const packagePath = join(inode.destination, 'spacetimedb', 'package.json');
      const replacement = join(inode.destination, 'spacetimedb', 'replacement');
      writeFileSync(replacement, readFileSync(packagePath), { mode: 0o600 });
      unlinkSync(packagePath);
      renameSync(replacement, packagePath);
      expect(() => inode.value.verify()).toThrow('GENESIS001_FROZEN_SOURCE_CHANGED');

      const link = materialize();
      const fixtures = join(link.destination, 'spacetimedb', 'migration-fixtures');
      rmSync(fixtures, { recursive: true, force: false });
      symlinkSync('/tmp', fixtures, 'dir');
      expect(() => link.value.verify()).toThrow('GENESIS001_FROZEN_SOURCE_CHANGED');
      expect(existsSync(link.destination)).toBe(true);
    },
  );

  it.skipIf(process.platform !== 'linux')(
    'rejects a repository missing the pinned commit before creating a destination',
    () => {
      const repositoryRoot = privateParent('warpkeep-g001-empty-repo-');
      const init = spawnSync('/usr/bin/git', ['init', '--quiet'], { cwd: repositoryRoot });
      expect(init.status).toBe(0);
      const parent = privateParent();
      const destination = join(parent, 'source');
      expect(() => createGenesis001FrozenSourceMaterialization({ repositoryRoot, destination }))
        .toThrow();
      expect(existsSync(destination)).toBe(false);
    },
  );

  it.skipIf(process.platform !== 'linux')(
    'rejects corrupt pinned commit, tree, dependency, and materializer objects',
    () => {
      const parent = privateParent('warpkeep-g001-corrupt-objects-');
      const repositoryRoot = join(parent, 'repository');
      expect(spawnSync('/usr/bin/git', [
        'clone', '--quiet', '--no-hardlinks', '--no-checkout', process.cwd(), repositoryRoot,
      ]).status).toBe(0);
      const packRoot = join(repositoryRoot, '.git', 'objects', 'pack');
      const disabledPackRoot = join(repositoryRoot, '.git', 'disabled-packs');
      mkdirSync(disabledPackRoot, { mode: 0o700 });
      const packs = readdirSync(packRoot).filter(name => name.endsWith('.pack'));
      for (const name of readdirSync(packRoot)) renameSync(
        join(packRoot, name), join(disabledPackRoot, name),
      );
      for (const pack of packs) {
        const command = `'/usr/bin/git' unpack-objects -r < '${join(disabledPackRoot, pack)}'`;
        expect(spawnSync('/bin/sh', ['-c', command], { cwd: repositoryRoot }).status).toBe(0);
      }
      for (const objectId of [
        GENESIS001_FROZEN_SOURCE_COMMIT,
        GENESIS001_FROZEN_SOURCE_TREE,
        'faf7214653f1248a3f9231fd6a13dda130821014',
        'c50182e99ed2e2fab1ca994c905818d383782cfc',
      ]) {
        const objectPath = join(repositoryRoot, '.git', 'objects', objectId.slice(0, 2), objectId.slice(2));
        const original = readFileSync(objectPath);
        writeFileSync(objectPath, 'corrupt-object');
        const destination = join(parent, `source-${objectId.slice(0, 8)}`);
        expect(() => createGenesis001FrozenSourceMaterialization({ repositoryRoot, destination }))
          .toThrow();
        expect(existsSync(destination)).toBe(false);
        writeFileSync(objectPath, original);
      }
    },
  );
});

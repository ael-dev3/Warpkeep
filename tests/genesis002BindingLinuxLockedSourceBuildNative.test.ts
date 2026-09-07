// @vitest-environment node

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { withGenesis002LinuxLockedSourceBuild } from '../scripts/genesis002-binding-linux-locked-source-build';
import {
  GENESIS002_PACKAGE_KEYS,
  createGenesis002Fixture,
} from './fixtures/genesis002LockedSourceBuildFixture';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const root of temporaryDirectories.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Genesis 002 Linux locked-source build native lifecycle', () => {
  it.skipIf(process.platform !== 'linux')(
    'materializes an actual committed tree through the real descriptor writer',
    () => {
      const fixture = createGenesis002Fixture();
      temporaryDirectories.push(...fixture.cleanupRoots);
      const commit = fixture.commitSource();
      for (const path of ['config', 'info/exclude']) {
        const contextPath = join(fixture.input.repositoryRoot, '.git', path);
        if (existsSync(contextPath)) expect(lstatSync(contextPath).mode & 0o777).toBe(0o600);
      }
      const before = fixture.sourceSnapshot();
      let materializedRoot = '';
      const output = withGenesis002LinuxLockedSourceBuild({
        ...fixture.input,
        moduleSourceCommit: commit,
        operation: context => {
          materializedRoot = context.materializedRoot;
          const g002Root = join(materializedRoot, 'spacetimedb', 'genesis002');
          const nodeModules = join(g002Root, 'node_modules');
          fixture.assertInstalledG002(materializedRoot);
          expect(context.dependencyClosureDigest).toBe(fixture.expectedClosureDigest());
          expect(existsSync(join(materializedRoot, 'spacetimedb', 'node_modules'))).toBe(false);
          expect(existsSync(join(materializedRoot, 'spacetimedb', 'ptr', 'node_modules'))).toBe(false);
          expect(existsSync(join(nodeModules, '.pnpm', 'fsevents@2.3.3'))).toBe(false);
          expect(existsSync(join(
            nodeModules, '.pnpm', '@esbuild+darwin-arm64@0.25.12',
          ))).toBe(false);
          expect(lstatSync(nodeModules).mode & 0o7777).toBe(0o700);
          expect(lstatSync(join(nodeModules, '.pnpm', 'lock.yaml')).mode & 0o7777).toBe(0o600);
          for (const name of ['esbuild', 'spacetimedb', 'tsx', 'typescript']) {
            const path = join(nodeModules, name);
            expect(lstatSync(path).isSymbolicLink(), name).toBe(true);
            expect(isAbsolute(readlinkSync(path)), name).toBe(false);
          }
          expect(GENESIS002_PACKAGE_KEYS).toHaveLength(15);
          const dist = join(g002Root, 'dist');
          mkdirSync(dist, { mode: 0o700 });
          writeFileSync(join(dist, 'bundle.js'), 'native-bundle', { mode: 0o600 });
          return 'native-g002-built';
        },
      });
      expect(output).toEqual({
        result: 'native-g002-built',
        dependencyClosureDigest: fixture.expectedClosureDigest(),
        moduleTreeId: expect.stringMatching(/^[0-9a-f]{40}$/u),
      });
      expect(fixture.sourceSnapshot()).toEqual(before);
      expect(existsSync(materializedRoot)).toBe(false);
    },
  );
});

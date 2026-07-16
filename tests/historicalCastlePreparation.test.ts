import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync
} from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ensureContainedDirectory } from '../scripts/atomic-install-file-family.mjs';

const source = readFileSync(resolve(
  import.meta.dirname,
  '../scripts/prepare-hegemony-main-castle.mjs'
), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve(
  import.meta.dirname,
  '../package.json'
), 'utf8')) as { scripts?: Record<string, string> };

let temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.map((path) => rm(path, { recursive: true, force: true })));
  temporaryRoots = [];
});

describe('historical Alpha 0.3.4 castle preparation', () => {
  it('cannot overwrite an active public runtime coordinate', () => {
    expect(source).toContain("'historical-alpha-0.3.4-runtime'");
    expect(source).not.toContain("const outputDirectory = resolve(root, 'public/");
    expect(source).toContain('ensureContainedDirectory');
    expect(source).toContain('installAtomicFileFamily');
    expect(source).not.toContain('copyFileSync');
    expect(source).not.toContain('mkdirSync(outputDirectory, { recursive: true })');
  });

  it('rejects a cache ancestor redirected to the public model directory', async () => {
    const root = await mkdtemp(resolve(
      realpathSync(tmpdir()),
      'warpkeep-historical-castle-'
    ));
    temporaryRoots.push(root);
    const cacheRoot = resolve(root, '.cache/warpkeep-assets');
    const publicModels = resolve(root, 'public/models/hegemony');
    mkdirSync(cacheRoot, { recursive: true });
    mkdirSync(publicModels, { recursive: true });
    symlinkSync(publicModels, resolve(cacheRoot, 'hegemony-frontier-keep-3d-2026-07-14'));

    expect(() => ensureContainedDirectory({
      root,
      relativePath: [
        '.cache',
        'warpkeep-assets',
        'hegemony-frontier-keep-3d-2026-07-14',
        'historical-alpha-0.3.4-runtime'
      ].join('/'),
      label: 'Historical Alpha 0.3.4 output directory'
    })).toThrow(/symbolic-link component/);
  });

  it('retires the unpinned unresolved-rights Frontier Keep generator', () => {
    expect(existsSync(resolve(
      import.meta.dirname,
      '../scripts/prepare-hegemony-frontier-keep.mjs'
    ))).toBe(false);
    expect(packageJson.scripts?.['prepare:hegemony-frontier-keep:historical'])
      .toBeUndefined();
  });
});

import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createAssetToolEnvironment } from '../scripts/asset-tool-process.mjs';

describe('asset tool process environment', () => {
  it('provides only deterministic local process variables', () => {
    const environment = createAssetToolEnvironment('/private/tmp/warpkeep-assets');
    expect(environment).toEqual({
      HOME: resolve('/private/tmp/warpkeep-assets'),
      TMPDIR: resolve('/private/tmp/warpkeep-assets'),
      PATH: '/usr/bin:/bin',
      LANG: 'C',
      LC_ALL: 'C'
    });
    expect(Object.keys(environment).sort()).toEqual(['HOME', 'LANG', 'LC_ALL', 'PATH', 'TMPDIR']);
    expect(Object.isFrozen(environment)).toBe(true);
  });
});

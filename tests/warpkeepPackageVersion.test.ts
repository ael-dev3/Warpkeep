import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  parseWarpkeepPackageVersion,
  readWarpkeepPackageVersion,
} from '../scripts/warpkeep-package-version.mjs';

describe('Warpkeep package version reader', () => {
  it('uses the fixed repository manifest as the shared version source', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '..', 'package.json'), 'utf8'),
    ) as { version: unknown };

    expect(readWarpkeepPackageVersion()).toBe(packageJson.version);
  });

  it('rejects malformed values before they can be used in headers or reports', () => {
    expect(parseWarpkeepPackageVersion({ version: '1.2.3-alpha.1+build.7' }))
      .toBe('1.2.3-alpha.1+build.7');
    expect(() => parseWarpkeepPackageVersion({ version: '1.2.3\r\nunsafe' }))
      .toThrow('Warpkeep package version is missing or invalid.');
    expect(() => parseWarpkeepPackageVersion({ version: '1.2' }))
      .toThrow('Warpkeep package version is missing or invalid.');
    expect(() => parseWarpkeepPackageVersion([]))
      .toThrow('Warpkeep package version is missing or invalid.');
  });
});

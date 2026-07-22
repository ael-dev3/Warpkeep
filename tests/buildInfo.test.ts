import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createWarpkeepBuildInfo,
  formatWarpkeepBuildStamp,
  normalizeWarpkeepReleaseChannel,
  readWarpkeepBuildSha,
  readWarpkeepProductVersion,
  readWarpkeepRepositoryUrl,
  WARPKEEP_REALM_SEED
} from '../src/build/buildInfo';

const FULL_SHA = '0123456789abcdef0123456789abcdef01234567';

describe('Warpkeep build identity', () => {
  it('opts the document viewport into device safe-area composition', () => {
    const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

    expect(indexHtml).toMatch(
      /<meta\s+name="viewport"\s+content="[^"]*\bviewport-fit=cover\b[^"]*"\s*\/>/
    );
  });

  it('reads the 0.3.14 product version from package metadata', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
    ) as { version?: unknown };
    const packageLock = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package-lock.json'), 'utf8')
    ) as { version?: unknown; packages?: Record<string, { version?: unknown }> };

    expect(readWarpkeepProductVersion(packageJson.version)).toBe('0.3.14');
    expect(packageLock.version).toBe(packageJson.version);
    expect(packageLock.packages?.['']?.version).toBe(packageJson.version);
    expect(readWarpkeepProductVersion('1.0.0-alpha.1+build.7')).toBe('1.0.0-alpha.1+build.7');
    expect(readWarpkeepProductVersion('0.2')).toBeUndefined();
  });

  it('normalizes the public alpha channel and accepts only full commit SHAs', () => {
    expect(normalizeWarpkeepReleaseChannel(' ALPHA ')).toBe('alpha');
    expect(normalizeWarpkeepReleaseChannel('beta')).toBe('alpha');
    expect(readWarpkeepBuildSha(FULL_SHA.toUpperCase())).toBe(FULL_SHA);
    expect(readWarpkeepBuildSha('abc1234')).toBeUndefined();
  });

  it('derives a safe commit URL and exact visible deployed-build copy', () => {
    const buildInfo = createWarpkeepBuildInfo({
      productVersion: '0.2.0',
      releaseChannel: 'alpha',
      buildSha: FULL_SHA,
      repositoryUrl: 'https://github.com/ael-dev3/Warpkeep/'
    });

    expect(buildInfo).toMatchObject({
      channel: 'alpha',
      version: '0.2.0',
      fullSha: FULL_SHA,
      shortSha: '0123456',
      commitUrl: `https://github.com/ael-dev3/Warpkeep/commit/${FULL_SHA}`,
      realm: WARPKEEP_REALM_SEED
    });
    expect(formatWarpkeepBuildStamp(buildInfo)).toBe('ALPHA 0.2.0 · BUILD 0123456');
    expect(readWarpkeepRepositoryUrl('https://attacker.example/Warpkeep')).toBeUndefined();
  });

  it('falls back to a non-clickable local build label for missing or invalid build SHA values', () => {
    const buildInfo = createWarpkeepBuildInfo({
      productVersion: '0.2.0',
      releaseChannel: undefined,
      buildSha: 'not-a-full-sha'
    });

    expect(buildInfo.fullSha).toBeUndefined();
    expect(buildInfo.commitUrl).toBeUndefined();
    expect(buildInfo.shortSha).toBe('LOCAL');
    expect(formatWarpkeepBuildStamp(buildInfo)).toBe('ALPHA 0.2.0 · LOCAL');
    expect(formatWarpkeepBuildStamp(buildInfo)).not.toContain(WARPKEEP_REALM_SEED);
  });
});

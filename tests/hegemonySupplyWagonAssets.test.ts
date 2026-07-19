import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  HEGEMONY_SUPPLY_WAGON_PROFILES,
  HEGEMONY_SUPPLY_WAGON_RELEASE,
  HEGEMONY_SUPPLY_WAGON_RUNTIME_DIRECTORY,
  HEGEMONY_SUPPLY_WAGON_SOURCE,
  verifyHegemonySupplyWagonBytes
} from '../scripts/hegemony-supply-wagon-contract.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const RECORD = 'docs/reference/factions/hegemony/2026-07-18-hegemony-supply-wagon/manifest.json';

describe('Hegemony Supply Wagon runtime assets', () => {
  it('ships exactly the reviewed public wagon LOD family', async () => {
    const publicNames = readdirSync(resolve(ROOT, HEGEMONY_SUPPLY_WAGON_RUNTIME_DIRECTORY))
      .filter((name) => name.startsWith('hegemony-supply-wagon-'))
      .sort();
    expect(publicNames).toEqual(
      HEGEMONY_SUPPLY_WAGON_PROFILES.map(({ filename }) => filename).sort()
    );

    for (const profile of HEGEMONY_SUPPLY_WAGON_PROFILES) {
      const relativePath = `${HEGEMONY_SUPPLY_WAGON_RUNTIME_DIRECTORY}/${profile.filename}`;
      const path = resolve(ROOT, relativePath);
      const bytes = readFileSync(path);
      expect(statSync(path).isFile(), relativePath).toBe(true);
      expect(basename(path), relativePath).toBe(
        `hegemony-supply-wagon-${profile.id}-${profile.sha256.slice(0, 16)}.glb`
      );
      await expect(
        verifyHegemonySupplyWagonBytes(bytes, profile, relativePath)
      ).resolves.toBeUndefined();
    }
  });

  it('pins the release source, LOD derivations, and visual-only boundary', () => {
    const record = JSON.parse(readFileSync(resolve(ROOT, RECORD), 'utf8'));
    expect(record).toMatchObject({
      schema: 'warpkeep.runtime-unit-asset.v1',
      assetId: 'hegemony-supply-wagon',
      sourceRelease: {
        repository: HEGEMONY_SUPPLY_WAGON_RELEASE.repository,
        tag: HEGEMONY_SUPPLY_WAGON_RELEASE.tag,
        attachment: {
          name: HEGEMONY_SUPPLY_WAGON_RELEASE.attachment,
          bytes: HEGEMONY_SUPPLY_WAGON_RELEASE.bytes,
          sha256: HEGEMONY_SUPPLY_WAGON_RELEASE.sha256
        },
        selectedSource: {
          bytes: HEGEMONY_SUPPLY_WAGON_SOURCE.bytes,
          sha256: HEGEMONY_SUPPLY_WAGON_SOURCE.sha256
        }
      },
      runtimeContract: {
        gltfUp: '+Y',
        frontFacing: '+Z',
        animation: { jointCount: 47 }
      }
    });
    expect(record.runtimeAssets).toEqual(HEGEMONY_SUPPLY_WAGON_PROFILES.map((profile) => (
      expect.objectContaining({
        id: profile.id,
        path: `${HEGEMONY_SUPPLY_WAGON_RUNTIME_DIRECTORY}/${profile.filename}`,
        bytes: profile.bytes,
        sha256: profile.sha256,
        triangles: profile.triangles,
        uploadedVertices: profile.vertices
      })
    )));
    expect(record.runtimeAssets[0].derivation).toContain('exact selected source bytes');
    expect(record.runtimeAssets[1].derivation).toContain('gltfpack 1.2');
    expect(record.runtimeAssets[2].derivation).toContain('gltfpack 1.2');
    expect(record.scopeBoundary).toContain('visual');
    expect(record.scopeBoundary).toContain('SpacetimeDB');
  });

  it('requires verification rather than release fetching or transformation during ordinary builds', () => {
    const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts.build).toContain('verify-hegemony-supply-wagon-assets.mjs');
    expect(packageJson.scripts.build).not.toContain('fetch-hegemony-supply-wagon-assets.mjs');
    expect(packageJson.scripts.build).not.toContain('prepare-hegemony-supply-wagon.mjs');
    expect(packageJson.scripts['assets:fetch:hegemony-supply-wagon'])
      .toBe('node scripts/fetch-hegemony-supply-wagon-assets.mjs');
    expect(packageJson.scripts['prepare:hegemony-supply-wagon'])
      .toBe('node scripts/prepare-hegemony-supply-wagon.mjs');

    const notice = readFileSync(resolve(ROOT, 'ASSETS-LICENSE.md'), 'utf8');
    for (const profile of HEGEMONY_SUPPLY_WAGON_PROFILES) {
      expect(notice).toContain(`${HEGEMONY_SUPPLY_WAGON_RUNTIME_DIRECTORY}/${profile.filename}`);
      expect(notice).toContain(profile.sha256);
    }
  });

  it('keeps manual source preparation checksum- and archive-membership-pinned', () => {
    const preparation = readFileSync(
      resolve(ROOT, 'scripts/prepare-hegemony-supply-wagon.mjs'),
      'utf8'
    );
    const fetcher = readFileSync(
      resolve(ROOT, 'scripts/fetch-hegemony-supply-wagon-assets.mjs'),
      'utf8'
    );
    expect(preparation).toContain('readExactOrdinaryFile(archive, HEGEMONY_SUPPLY_WAGON_RELEASE');
    expect(preparation).toContain('assertSafeArchive()');
    expect(preparation).toContain('sortedEntries.length !== expectedMembers.length');
    expect(preparation).toContain('assertHegemonySupplyWagonSourceManifest');
    expect(preparation).toContain('assertHegemonySupplyWagonSha256Sums');
    expect(preparation).toContain('verifyHegemonySupplyWagonBytes');
    expect(preparation).toContain('installAtomicFileFamily');
    expect(fetcher).toContain('fetchPinnedGithubReleaseAsset');
    expect(fetcher).toContain('readExactResponseBody');
    expect(fetcher).toContain('writePinnedCacheFile');
  });
});

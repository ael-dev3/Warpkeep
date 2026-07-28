import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  aggregateHegemonySupplyWagonAudits,
  auditHegemonySupplyWagonBytes,
  HEGEMONY_SUPPLY_WAGON_PROFILES,
  HEGEMONY_SUPPLY_WAGON_RELEASE,
  HEGEMONY_SUPPLY_WAGON_RIG_JOINT_NAMES,
  HEGEMONY_SUPPLY_WAGON_RUNTIME_DIRECTORY,
  HEGEMONY_SUPPLY_WAGON_SOURCE,
  HEGEMONY_SUPPLY_WAGON_WHEEL_SEMANTICS,
  type HegemonySupplyWagonSemanticAudit
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

    const audits: HegemonySupplyWagonSemanticAudit[] = [];
    for (const profile of HEGEMONY_SUPPLY_WAGON_PROFILES) {
      const relativePath = `${HEGEMONY_SUPPLY_WAGON_RUNTIME_DIRECTORY}/${profile.filename}`;
      const path = resolve(ROOT, relativePath);
      const bytes = readFileSync(path);
      expect(statSync(path).isFile(), relativePath).toBe(true);
      expect(basename(path), relativePath).toBe(
        `hegemony-supply-wagon-${profile.id}-${profile.sha256.slice(0, 16)}.glb`
      );
      audits.push(await auditHegemonySupplyWagonBytes(bytes, profile, relativePath));
    }

    const aggregate = aggregateHegemonySupplyWagonAudits(audits);
    expect(aggregate.profiles.map(({ profile }: { profile: string }) => profile))
      .toEqual(['high', 'balanced', 'compact']);
    expect(aggregate).toMatchObject({
      coordinateSystem: { up: '+Y', forward: '+Z' },
      skinName: 'RIG_WK_Hegemony_Draft_Wagon_47J',
      jointNames: HEGEMONY_SUPPLY_WAGON_RIG_JOINT_NAMES,
      wheelSemantics: HEGEMONY_SUPPLY_WAGON_WHEEL_SEMANTICS,
      routeRootTranslationTracks: [],
      routeRootRotationTracks: [],
      compatibleRigAndClipContract: true
    });
    expect(aggregate.jointNames).toHaveLength(47);
    expect(aggregate.clips).toEqual([
      expect.objectContaining({
        name: 'Idle',
        duration: 2,
        trackFamily: 'idle',
        hRootVerticalBobLocalZ: [0.759765625, 0.76416015625]
      }),
      expect.objectContaining({
        name: 'Start',
        duration: 0.8,
        trackFamily: 'gait',
        hRootVerticalBobLocalZ: [0.759765625, 0.77197265625]
      }),
      expect.objectContaining({
        name: 'Stop',
        duration: 0.8,
        trackFamily: 'gait',
        hRootVerticalBobLocalZ: [0.759765625, 0.77197265625]
      }),
      expect.objectContaining({
        name: 'Turn_Left',
        duration: 1,
        trackFamily: 'turn',
        hRootVerticalBobLocalZ: [0.759765625, 0.7685546875]
      }),
      expect.objectContaining({
        name: 'Turn_Right',
        duration: 1,
        trackFamily: 'turn',
        hRootVerticalBobLocalZ: [0.759765625, 0.7685546875]
      }),
      expect.objectContaining({
        name: 'Walk',
        duration: 1,
        trackFamily: 'gait',
        hRootVerticalBobLocalZ: [0.759765625, 0.77392578125]
      })
    ]);
    aggregate.clips.forEach((clip) => {
      expect(clip).toMatchObject({
        hasRootTranslation: true,
        hasRootRotation: false,
        routeConflictingRootMotion: false,
        wheelNodesAnimated: false,
        usable: true
      });
    });
    expect(Object.values(aggregate.trackFamilies)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          trackNames: expect.arrayContaining(['H_Root.translation']),
          affectedNodes: expect.arrayContaining(['H_Root'])
        })
      ])
    );
    expect(JSON.stringify(aggregate.trackFamilies)).not.toContain('W_Wheel_');
    expect(aggregate.wheelSemantics.preparedRadius).toBeCloseTo(
      aggregate.wheelSemantics.authoredRadiusMeters
        * aggregate.wheelSemantics.preparedFootprint
        / aggregate.wheelSemantics.authoredFootprintMeters,
      14
    );
    console.info(
      'Supply Wagon GLB semantic audit: '
      + `${aggregate.profiles.length} LODs / ${aggregate.jointNames.length} joints / `
      + `${aggregate.clips.length} clips / in-place root / untracked named wheels.`
    );
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
        authoredBoundsMeters: {
          dimensions: [1.886, 2.41437826, HEGEMONY_SUPPLY_WAGON_WHEEL_SEMANTICS.authoredFootprintMeters]
        },
        animation: {
          jointCount: 47,
          wheelBones: HEGEMONY_SUPPLY_WAGON_WHEEL_SEMANTICS.nodeNames,
          wheelRadiusMeters: HEGEMONY_SUPPLY_WAGON_WHEEL_SEMANTICS.authoredRadiusMeters,
          rootMotion: 'in_place; world position is an interpolation of server-owned journey timestamps, not animation data'
        }
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

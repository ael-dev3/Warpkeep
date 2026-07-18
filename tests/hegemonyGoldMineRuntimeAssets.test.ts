import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  HEGEMONY_GOLD_MINE_RUNTIME_DIRECTORY,
  HEGEMONY_GOLD_MINE_RUNTIME_PROFILES,
  verifyHegemonyGoldMineRuntimeBytes
} from '../scripts/hegemony-gold-mine-runtime-contract.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const RECORD = 'docs/reference/resources/2026-07-18-hegemony-gold-mine/runtime/manifest.json';

describe('Hegemony Gold Mine runtime assets', () => {
  it('ships exactly the reviewed digest-bearing public LOD family', async () => {
    const directory = resolve(ROOT, HEGEMONY_GOLD_MINE_RUNTIME_DIRECTORY);
    expect(readdirSync(directory).sort()).toEqual(
      HEGEMONY_GOLD_MINE_RUNTIME_PROFILES.map(({ filename }) => filename).sort()
    );

    for (const profile of HEGEMONY_GOLD_MINE_RUNTIME_PROFILES) {
      const relativePath = `${HEGEMONY_GOLD_MINE_RUNTIME_DIRECTORY}/${profile.filename}`;
      const path = resolve(ROOT, relativePath);
      const bytes = readFileSync(path);
      expect(statSync(path).isFile(), relativePath).toBe(true);
      expect(basename(path), relativePath).toBe(
        `hegemony-gold-mine-${profile.id}-${profile.sha256.slice(0, 16)}.glb`
      );
      await expect(
        verifyHegemonyGoldMineRuntimeBytes(bytes, profile, relativePath)
      ).resolves.toBeUndefined();
    }
  });

  it('records the bounded promotion without mutating historical candidates', () => {
    const record = JSON.parse(readFileSync(resolve(ROOT, RECORD), 'utf8'));
    expect(record).toMatchObject({
      schema: 'warpkeep.resource-node-runtime.v1',
      assetId: 'warpkeep.gold-mine-node',
      sourcePackage: {
        sourceVersion: '1.4.0',
        contract: { gltfUp: '+Y', frontFacing: '+Z' }
      },
      reviewHistory: {
        candidateRecord: '../manifest.json',
        candidateFiles: '../runtime-candidates/'
      }
    });
    expect(record.runtimeAssets).toEqual(HEGEMONY_GOLD_MINE_RUNTIME_PROFILES.map((profile) => (
      expect.objectContaining({
        id: profile.id,
        path: `${HEGEMONY_GOLD_MINE_RUNTIME_DIRECTORY}/${profile.filename}`,
        bytes: profile.bytes,
        sha256: profile.sha256,
        triangles: profile.triangles,
        uploadedVertices: profile.vertices,
        atlasSize: profile.textureSize
      })
    )));
    expect(record.runtimeAssets[0].derivation).toContain('exact owner-supplied High');
    expect(record.runtimeAssets[1].derivation).toContain('wk_atlas_size 1024 → 512');
    expect(record.runtimeAssets[2].derivation).toContain('wk_atlas_size 1024 → 256');
  });

  it('requires validation rather than source acquisition during ordinary builds', () => {
    const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts.build).toContain('verify-hegemony-gold-mine-runtime.mjs');
    expect(packageJson.scripts.build).not.toContain('install-hegemony-gold-mine-runtime.mjs');
    expect(packageJson.scripts['prepare:hegemony-gold-mine-runtime'])
      .toBe('node scripts/install-hegemony-gold-mine-runtime.mjs');

    const notice = readFileSync(resolve(ROOT, 'ASSETS-LICENSE.md'), 'utf8');
    for (const profile of HEGEMONY_GOLD_MINE_RUNTIME_PROFILES) {
      expect(notice).toContain(`${HEGEMONY_GOLD_MINE_RUNTIME_DIRECTORY}/${profile.filename}`);
      expect(notice).toContain(profile.sha256);
    }
  });
});

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  calculateKeepNormalization,
  keepAssetPathForQuality,
  resolveRealmAssetUrl
} from '../src/components/realm/loadHegemonyKeep';

const ROOT = resolve(import.meta.dirname, '..');

const ASSETS = [
  {
    quality: 'high' as const,
    path: 'public/models/hegemony/hegemony-frontier-keep-high.glb',
    bytes: 2_256_092,
    sha256: 'ed2593a2e427c496c2eaa582f56c20290816d272c5d5b8800cdf554ecc8a296c',
    maxBytes: 10_000_000
  },
  {
    quality: 'compact' as const,
    path: 'public/models/hegemony/hegemony-frontier-keep-compact.glb',
    bytes: 760_916,
    sha256: '9de356095b314c3d43fee072c31115bb265699913991ac6aa3f656a2b8bde33b',
    maxBytes: 4_000_000
  }
];

function readGlbJson(path: string) {
  const bytes = readFileSync(path);
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trim());
}

describe('Hegemony keep runtime assets', () => {
  it('ships validated high and compact assets inside their transfer budgets', () => {
    ASSETS.forEach((asset) => {
      const path = resolve(ROOT, asset.path);
      const bytes = readFileSync(path);
      expect(statSync(path).size).toBe(asset.bytes);
      expect(asset.bytes).toBeLessThan(asset.maxBytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
      const json = readGlbJson(path);
      expect(json.extensionsRequired).toEqual(expect.arrayContaining([
        'EXT_meshopt_compression',
        'EXT_texture_webp',
        'KHR_mesh_quantization'
      ]));
      expect(json.scenes).toHaveLength(1);
      expect(json.meshes).toHaveLength(1);
      expect(json.images).toHaveLength(4);
    });
  });

  it('selects only one LOD and resolves it under the active Vite base path', () => {
    expect(keepAssetPathForQuality('high')).toContain('-high.glb');
    expect(keepAssetPathForQuality('compact')).toContain('-compact.glb');
    expect(keepAssetPathForQuality('reduced')).toContain('-compact.glb');
    expect(resolveRealmAssetUrl('/Warpkeep/', keepAssetPathForQuality('high')))
      .toBe('/Warpkeep/models/hegemony/hegemony-frontier-keep-high.glb');
  });

  it('normalizes the source footprint to 74 percent of one hex diameter', () => {
    const normalization = calculateKeepNormalization({
      minX: -0.94968,
      minY: -0.67927,
      minZ: -0.66523,
      maxX: 0.94756,
      maxY: 0.67433,
      maxZ: 0.6629
    });

    expect(normalization.scale).toBeCloseTo(0.78, 2);
    expect(normalization.footprintDiameter).toBeCloseTo(1.48, 6);
    expect(normalization.visualHeight).toBeGreaterThan(1);
    expect(normalization.offsetY).toBeGreaterThan(0);
    expect(Object.values(normalization).every(Number.isFinite)).toBe(true);
  });
});

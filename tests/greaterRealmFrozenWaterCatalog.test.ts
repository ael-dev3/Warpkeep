import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { GENESIS_WATER_CELLS_V1 } from '../spacetimedb/src/waterWorld';
import { GENESIS_WATER_REVISION_ENABLED_CELLS_V1 } from '../spacetimedb/src/waterRevision';
import {
  canonicalOceanDepthAt,
  isCanonicalWaterCoordinate,
} from '../spacetimedb/ptr/src/greaterRealmFrozenWaterCatalog';

const CATALOG_SOURCE = resolve(
  process.cwd(),
  'spacetimedb/ptr/src/greaterRealmFrozenWaterCatalog.ts',
);

describe('standalone frozen water catalog', () => {
  it('matches every authoritative water row and the full active coordinate set', () => {
    const activeCoordinates = new Set(
      GENESIS_WATER_REVISION_ENABLED_CELLS_V1.map(row => `${row.q},${row.r}`),
    );
    const oceanDepths = new Map(
      GENESIS_WATER_REVISION_ENABLED_CELLS_V1
        .filter(row => row.regime === 'ocean')
        .map(row => [`${row.q},${row.r}`, row.depthCells]),
    );

    for (const row of GENESIS_WATER_CELLS_V1) {
      const key = `${row.q},${row.r}`;
      const expectedActive = row.regime === 'ocean' || row.regime === 'river';
      expect(isCanonicalWaterCoordinate(row.q, row.r), key).toBe(expectedActive);
      expect(activeCoordinates.has(key), key).toBe(expectedActive);

      const expectedDepth = row.regime === 'ocean' ? row.depthCells : undefined;
      expect(canonicalOceanDepthAt(row.q, row.r), key).toBe(expectedDepth);
      expect(oceanDepths.get(key), key).toBe(expectedDepth);

      if (row.regime === 'ocean') {
        const forgedDepth = row.depthCells + 1;
        expect(canonicalOceanDepthAt(row.q, row.r), `${key}: forged depth`).not.toBe(forgedDepth);
      }
    }
  });

  it('has no unlisted active or ocean coordinates within the canonical radius', () => {
    const activeCoordinates = new Set(
      GENESIS_WATER_REVISION_ENABLED_CELLS_V1.map(row => `${row.q},${row.r}`),
    );
    const oceanDepths = new Map(
      GENESIS_WATER_REVISION_ENABLED_CELLS_V1
        .filter(row => row.regime === 'ocean')
        .map(row => [`${row.q},${row.r}`, row.depthCells]),
    );

    for (let q = -65; q <= 65; q += 1) {
      const minimumR = Math.max(-65, -q - 65);
      const maximumR = Math.min(65, -q + 65);
      for (let r = minimumR; r <= maximumR; r += 1) {
        const key = `${q},${r}`;
        expect(isCanonicalWaterCoordinate(q, r), key).toBe(activeCoordinates.has(key));
        expect(canonicalOceanDepthAt(q, r), key).toBe(oceanDepths.get(key));
      }
    }
  });

  it('rejects out-of-range and malformed coordinates', () => {
    for (const [q, r] of [
      [66, 0],
      [-66, 0],
      [0, 66],
      [0, -66],
      [65, 1],
    ]) {
      expect(canonicalOceanDepthAt(q!, r!)).toBeUndefined();
      expect(isCanonicalWaterCoordinate(q!, r!)).toBe(false);
    }

    for (const [q, r] of [
      [Number.NaN, 0],
      [0, Number.POSITIVE_INFINITY],
      [0.5, 0],
      [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    ]) {
      expect(canonicalOceanDepthAt(q!, r!)).toBeUndefined();
      expect(isCanonicalWaterCoordinate(q!, r!)).toBe(false);
    }
  });

  it('stays dependency-free and excludes the shared active-revision policy', () => {
    const source = readFileSync(CATALOG_SOURCE, 'utf8');
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toContain('GENESIS_WATER_REVISION');
  });
});

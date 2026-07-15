import { describe, expect, it } from 'vitest';

import {
  indexRealmTerrainSemantics,
  realmTerrainLabel
} from '../src/game/map/realmTerrainSemantics';
import { createRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';
import { createCanonicalGenesisSnapshot } from './fixtures/canonicalGenesisSnapshot';

function canonicalInput() {
  const snapshot = createCanonicalGenesisSnapshot();
  const surface = createRealmTerrainSurface(
    snapshot.realm.numericSeed,
    snapshot.realm.authoritativeRadius,
    snapshot.realm.renderRadius
  );
  return { snapshot, surface };
}

describe('realm terrain semantic index', () => {
  it('projects every canonical Genesis 001 cell with exact seven-kind counts', () => {
    const { snapshot, surface } = canonicalInput();
    const index = indexRealmTerrainSemantics(surface, snapshot.tileMetadata);

    expect(index.terrainKindsByKey.size).toBe(1_261);
    expect(index.castleSlotKeys.size).toBe(100);
    expect(index.terrainKindCounts).toEqual({
      lowland: 266,
      meadow: 274,
      forest: 280,
      heath: 281,
      ridge: 59,
      lake: 48,
      'ancient-stone': 53
    });
    expect(new Set(index.terrainKindsByKey.values()).size).toBe(7);
  });

  it('fails closed for missing, duplicate, off-surface, or unknown rows', () => {
    const { snapshot, surface } = canonicalInput();
    const missing = snapshot.tileMetadata.slice(1);
    const duplicate = [
      ...snapshot.tileMetadata.slice(0, -1),
      snapshot.tileMetadata[0]!
    ];
    const unknownTerrain = snapshot.tileMetadata.map((row, index) => (
      index === 0 ? { ...row, terrainKind: 'future-biome' } : row
    ));
    const unknownContent = snapshot.tileMetadata.map((row, index) => (
      index === 0 ? { ...row, staticContentKind: 'active-treasure' } : row
    ));
    const offSurface = snapshot.tileMetadata.map((row, index) => (
      index === 0 ? { ...row, tileKey: '99,99' } : row
    ));

    expect(() => indexRealmTerrainSemantics(surface, missing))
      .toThrow('REALM_TERRAIN_SEMANTIC_COVERAGE_INVALID');
    expect(() => indexRealmTerrainSemantics(surface, duplicate))
      .toThrow('REALM_TERRAIN_SEMANTIC_ROW_INVALID');
    expect(() => indexRealmTerrainSemantics(surface, unknownTerrain))
      .toThrow('REALM_TERRAIN_SEMANTIC_ROW_INVALID');
    expect(() => indexRealmTerrainSemantics(surface, unknownContent))
      .toThrow('REALM_TERRAIN_SEMANTIC_ROW_INVALID');
    expect(() => indexRealmTerrainSemantics(surface, offSurface))
      .toThrow('REALM_TERRAIN_SEMANTIC_ROW_INVALID');
  });

  it('keeps player-facing names concise and intentionally non-economic', () => {
    expect(realmTerrainLabel('lowland')).toBe('Temperate Lowlands');
    expect(realmTerrainLabel('meadow')).toBe('Sunlit Meadow');
    expect(realmTerrainLabel('forest')).toBe('Lowland Forest');
    expect(realmTerrainLabel('heath')).toBe('Amethyst Heath');
    expect(realmTerrainLabel('ridge')).toBe('Weathered Ridge');
    expect(realmTerrainLabel('lake')).toBe('Stillwater Lake');
    expect(realmTerrainLabel('ancient-stone')).toBe('Ancient Stone');
    expect(realmTerrainLabel(undefined)).toBe('Temperate Lowlands');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GENESIS_WATER_CELLS_V1 } from '../spacetimedb/src/waterWorld';
import { GENESIS_WATER_REVISION_ENABLED_CELLS_V1 } from '../spacetimedb/src/waterRevision';
import { hexDistance } from '../src/game/map/hexCoordinates';
import { createRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';
import {
  proveRealmWaterBoundaryCoverage,
  realmLandPresentationMap,
  realmNoLakeRevisionActive,
  realmWaterNavigationEnvelope
} from '../src/components/realm/realmWaterNavigation';

const LAND_BOUNDS = Object.freeze({
  minX: -90,
  maxX: 90,
  minY: -0.4,
  maxY: 1.2,
  minZ: -86,
  maxZ: 86
});

describe('persistent Water camera envelope', () => {
  it('proves the hidden buffer and curtain cover measured frustum extents', () => {
    expect(proveRealmWaterBoundaryCoverage({
      maximumVisibleHexRadius: 28,
      hiddenBufferCells: 2,
      maximumWaveDisplacement: 0.12,
      curtainBottom: -20,
      curtainTop: 38,
      projectedMinimumY: -5,
      projectedMaximumY: 25
    }).covered).toBe(true);
    expect(proveRealmWaterBoundaryCoverage({
      maximumVisibleHexRadius: 28,
      hiddenBufferCells: 1,
      maximumWaveDisplacement: 0.12,
      curtainBottom: -20,
      curtainTop: 38,
      projectedMinimumY: -5,
      projectedMaximumY: 25
    }).covered).toBe(false);
  });

  it('extends navigation across the ocean apron but stops the center at full fog', () => {
    const envelope = realmWaterNavigationEnvelope(GENESIS_WATER_CELLS_V1, LAND_BOUNDS);
    expect(envelope).toBeDefined();
    expect(envelope!.bounds.minX).toBeLessThan(LAND_BOUNDS.minX);
    expect(envelope!.bounds.maxX).toBeGreaterThan(LAND_BOUNDS.maxX);
    expect(envelope!.bounds.minZ).toBeLessThan(LAND_BOUNDS.minZ);
    expect(envelope!.bounds.maxZ).toBeGreaterThan(LAND_BOUNDS.maxZ);

    const expectedRadius = Math.max(...GENESIS_WATER_CELLS_V1
      .filter((cell) => (
        cell.regime === 'ocean'
        && cell.fogBand !== 'full'
      ))
      .map((cell) => hexDistance({ q: 0, r: 0 }, cell)));
    expect(envelope!.maximumCenterHexRadius).toBe(expectedRadius);
    const fullFogCellIds = GENESIS_WATER_CELLS_V1
      .filter((cell) => cell.regime === 'ocean' && cell.fogBand === 'full')
      .map((cell) => cell.cellKey);
    expect(envelope!.blockedCenterCellKeys.size).toBe(fullFogCellIds.length);
    expect(fullFogCellIds.every((key) => envelope!.blockedCenterCellKeys.has(key))).toBe(true);
  });

  it('fails closed when no validated ocean projection is available', () => {
    expect(realmWaterNavigationEnvelope(undefined, LAND_BOUNDS)).toBeUndefined();
    expect(realmWaterNavigationEnvelope(
      GENESIS_WATER_CELLS_V1.filter((cell) => cell.regime !== 'ocean'),
      LAND_BOUNDS
    )).toBeUndefined();
  });

  it('removes validated ocean overlap from visual terrain without removing rivers or lakes', () => {
    const surface = createRealmTerrainSurface('water-navigation-land', 58, 60);
    const land = realmLandPresentationMap(surface.renderMap, GENESIS_WATER_CELLS_V1);
    const oceanKeys = new Set(GENESIS_WATER_CELLS_V1
      .filter((cell) => cell.regime === 'ocean')
      .map((cell) => cell.cellKey));
    const riverKey = GENESIS_WATER_CELLS_V1.find((cell) => cell.regime === 'river')!.cellKey;
    const lakeKey = GENESIS_WATER_CELLS_V1.find((cell) => cell.regime === 'lake')!.cellKey;
    const landKeys = new Set(land.cells.map((cell) => `${cell.coord.q},${cell.coord.r}`));

    expect(land.cells.length).toBeLessThan(surface.renderMap.cells.length);
    expect(land.cells.every((cell) => !oceanKeys.has(`${cell.coord.q},${cell.coord.r}`))).toBe(true);
    expect(landKeys.has(riverKey)).toBe(true);
    expect(landKeys.has(lakeKey)).toBe(true);
    expect(surface.renderMap.cells).toHaveLength(10_981);
  });

  it('wires the validated envelope into camera navigation without rewriting the water array', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      'src/components/realm/createRealmScene.ts'
    ), 'utf8');

    expect(source).toContain('cells: options.waterCells');
    expect(source).not.toContain("filter((cell) => cell.regime !== 'lake')");
    expect(source).toContain('bounds: waterNavigationEnvelope?.bounds ?? terrainData.bounds');
    expect(source).toContain('maximumCenterHexRadius: waterNavigationEnvelope.maximumCenterHexRadius');
    expect(source).toContain('hexSize: waterNavigationEnvelope.hexSize');
    expect(source).toContain('blockedCenterCellKeys: waterNavigationEnvelope.blockedCenterCellKeys');
    expect(source).toContain('overviewHull: createTerrainOverviewHull(strategicOverviewMap, HEX_SIZE)');
  });

  it('gates every former-lake presentation flag on the exact activated catalog', () => {
    expect(realmNoLakeRevisionActive(GENESIS_WATER_CELLS_V1)).toBe(false);
    expect(realmNoLakeRevisionActive(GENESIS_WATER_REVISION_ENABLED_CELLS_V1)).toBe(true);
    expect(realmNoLakeRevisionActive([...GENESIS_WATER_REVISION_ENABLED_CELLS_V1])).toBe(false);

    const source = readFileSync(resolve(
      process.cwd(),
      'src/components/realm/createRealmScene.ts'
    ), 'utf8');
    expect(source).toContain('includeLakeSheen: !noLakeRevisionActive');
    expect(source).toContain('visualizeLegacyLakesAsLand: noLakeRevisionActive');
    expect(source).toContain('visualizeLegacyLakes: noLakeRevisionActive');
  });
});

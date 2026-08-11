// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { greaterRealmSurfaceSplitTestSeams } from '../scripts/atlas/greater-realm-candidate-generator';
import {
  GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1,
  transformLegacyLowlandsToGlobal,
  type LegacyLowlandsAtlasTransform,
} from '../scripts/atlas/greater-realm-legacy-lowlands';
import {
  GREATER_REALM_BIOME_ID,
  GREATER_REALM_LANDFORM_ID,
} from '../scripts/atlas/greater-realm-biomes';
import {
  indexGreaterRealmAxialGrid,
  type AxialCoordinate,
} from '../scripts/atlas/greater-realm-terrain';

function hexDisc(radius: number): readonly AxialCoordinate[] {
  const coordinates: AxialCoordinate[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const minimumR = Math.max(-radius, -q - radius);
    const maximumR = Math.min(radius, -q + radius);
    for (let r = minimumR; r <= maximumR; r += 1) coordinates.push({ q, r });
  }
  return coordinates;
}

const visualClass = Object.freeze({
  lowland: Object.freeze([
    GREATER_REALM_BIOME_ID.TEMPERATE_LOWLAND,
    GREATER_REALM_LANDFORM_ID.LOWLAND,
  ] as const),
  meadow: Object.freeze([
    GREATER_REALM_BIOME_ID.FLOWER_MEADOW,
    GREATER_REALM_LANDFORM_ID.LOWLAND,
  ] as const),
  forest: Object.freeze([
    GREATER_REALM_BIOME_ID.OLD_GROWTH_FOREST,
    GREATER_REALM_LANDFORM_ID.LOWLAND,
  ] as const),
  heath: Object.freeze([
    GREATER_REALM_BIOME_ID.SAVANNA,
    GREATER_REALM_LANDFORM_ID.LOWLAND,
  ] as const),
  ridge: Object.freeze([
    GREATER_REALM_BIOME_ID.ROCKY_HIGHLAND,
    GREATER_REALM_LANDFORM_ID.HIGHLAND,
  ] as const),
  lake: Object.freeze([
    GREATER_REALM_BIOME_ID.TEMPERATE_LOWLAND,
    GREATER_REALM_LANDFORM_ID.LOWLAND,
  ] as const),
  'ancient-stone': Object.freeze([
    GREATER_REALM_BIOME_ID.ROCKY_HIGHLAND,
    GREATER_REALM_LANDFORM_ID.HILL,
  ] as const),
});

describe('Greater Realm generated-surface split', () => {
  it('derives replay-stable water independently from tier-labelled visuals', () => {
    const grid = indexGreaterRealmAxialGrid(hexDisc(4));
    const elevation = new Int32Array(grid.cellCount);
    elevation.fill(500);
    const filledElevation = new Int32Array(elevation);
    const flowReceiver = new Int32Array(grid.cellCount);
    flowReceiver.fill(-1);
    const accumulation = new BigUint64Array(grid.cellCount);
    accumulation.fill(1n);
    const legacyProtectedCell = new Uint8Array(grid.cellCount);
    const oceanCell = grid.indexOf({ q: 4, r: 0 });
    const streamCell = grid.indexOf({ q: 0, r: 0 });
    elevation[oceanCell] = -100;
    filledElevation[oceanCell] = -100;
    accumulation[streamCell] = 128n;
    const tierOne = new Uint8Array(grid.cellCount);
    tierOne.fill(1);
    const tierThree = new Uint8Array(grid.cellCount);
    tierThree.fill(3);
    const temperature = new Int32Array(grid.cellCount);
    temperature.fill(3_000);
    const moisture = new Int32Array(grid.cellCount);
    let firstWater:
      | ReturnType<
          typeof greaterRealmSurfaceSplitTestSeams.deriveGeneratedWaterSurface
        >
      | undefined;
    let replayWater: typeof firstWater;
    let firstVisuals:
      | ReturnType<
          typeof greaterRealmSurfaceSplitTestSeams.deriveGeneratedSurfaceVisuals
        >
      | undefined;
    let thirdVisuals: typeof firstVisuals;
    try {
      firstWater =
        greaterRealmSurfaceSplitTestSeams.deriveGeneratedWaterSurface(
          grid,
          73,
          elevation,
          filledElevation,
          flowReceiver,
          accumulation,
          legacyProtectedCell,
        );
      replayWater =
        greaterRealmSurfaceSplitTestSeams.deriveGeneratedWaterSurface(
          grid,
          73,
          elevation,
          filledElevation,
          flowReceiver,
          accumulation,
          legacyProtectedCell,
        );
      expect(replayWater.waterRegime).toEqual(firstWater.waterRegime);
      expect(replayWater.lakeBasinCandidates).toBe(
        firstWater.lakeBasinCandidates,
      );

      firstVisuals =
        greaterRealmSurfaceSplitTestSeams.deriveGeneratedSurfaceVisuals(
          grid,
          elevation,
          firstWater.waterRegime,
          tierOne,
          temperature,
          moisture,
        );
      thirdVisuals =
        greaterRealmSurfaceSplitTestSeams.deriveGeneratedSurfaceVisuals(
          grid,
          elevation,
          firstWater.waterRegime,
          tierThree,
          temperature,
          moisture,
        );
      expect(firstWater.waterRegime).toEqual(replayWater.waterRegime);
      const dryCell = grid.indexOf({ q: -1, r: 0 });
      expect(firstVisuals.biomeId[dryCell]).not.toBe(
        thirdVisuals.biomeId[dryCell],
      );
      expect(firstVisuals.biomeId[oceanCell]).toBe(
        thirdVisuals.biomeId[oceanCell],
      );
    } finally {
      firstWater?.waterRegime.fill(0);
      replayWater?.waterRegime.fill(0);
      firstVisuals?.biomeId.fill(0);
      firstVisuals?.landformId.fill(0);
      thirdVisuals?.biomeId.fill(0);
      thirdVisuals?.landformId.fill(0);
      elevation.fill(0);
      filledElevation.fill(0);
      flowReceiver.fill(0);
      accumulation.fill(0n);
      legacyProtectedCell.fill(0);
      tierOne.fill(0);
      tierThree.fill(0);
      temperature.fill(0);
      moisture.fill(0);
      grid.clearIndex?.();
    }
  });

  it('retires water scratch and an unadopted output on late seed validation failure', () => {
    const grid = indexGreaterRealmAxialGrid(hexDisc(2));
    const elevation = new Int32Array(grid.cellCount);
    elevation.fill(100);
    const filledElevation = new Int32Array(elevation);
    const receiver = new Int32Array(grid.cellCount);
    receiver.fill(-1);
    const accumulation = new BigUint64Array(grid.cellCount);
    accumulation.fill(1n);
    const fillSpy = vi.spyOn(Uint8Array.prototype, 'fill');
    try {
      expect(() =>
        greaterRealmSurfaceSplitTestSeams.deriveGeneratedWaterSurface(
          grid,
          [1, 2, 3] as never,
          elevation,
          filledElevation,
          receiver,
          accumulation,
          new Uint8Array(grid.cellCount),
        ),
      ).toThrow('GREATER_REALM_TERRAIN_SEED_INVALID');
      const retired = (
        fillSpy.mock.instances as unknown as Uint8Array[]
      ).filter((values) => values.length === grid.cellCount);
      expect(retired.length).toBeGreaterThanOrEqual(5);
      expect(
        retired.every((values) => values.every((value) => value === 0)),
      ).toBe(true);
    } finally {
      fillSpy.mockRestore();
      elevation.fill(0);
      filledElevation.fill(0);
      receiver.fill(0);
      accumulation.fill(0n);
      grid.clearIndex?.();
    }
  });

  it('recombines exact Lowlands water and visual authority', () => {
    const patch = GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1;
    const transform: LegacyLowlandsAtlasTransform = Object.freeze({
      rotationSteps: 0,
      globalOffsetQ: 0,
      globalOffsetR: 0,
    });
    const coordinatesByKey = new Map<string, AxialCoordinate>();
    for (const tile of patch.world.tiles)
      coordinatesByKey.set(`${tile.q},${tile.r}`, tile);
    for (const cell of patch.water.cells)
      coordinatesByKey.set(`${cell.q},${cell.r}`, cell);
    const grid = indexGreaterRealmAxialGrid([...coordinatesByKey.values()]);
    const protectedCell = new Uint8Array(grid.cellCount);
    protectedCell.fill(1);
    const castleSlot = new Uint8Array(grid.cellCount);
    for (const slot of patch.castleSlots.rows) {
      const cell = grid.indexOf(
        transformLegacyLowlandsToGlobal(slot, transform),
      );
      expect(cell).toBeGreaterThanOrEqual(0);
      castleSlot[cell] = 1;
    }
    const legacy = Object.freeze({ transform, protectedCell, castleSlot });
    const waterRegime = new Uint8Array(grid.cellCount);
    waterRegime.fill(2);
    const biomeId = new Uint8Array(grid.cellCount);
    const landformId = new Uint8Array(grid.cellCount);
    biomeId.fill(0xff);
    landformId.fill(0xff);
    const enabledWaterByCell = new Map<
      number,
      (typeof patch.water.enabledCells)[number]
    >();
    const tileByKey = new Map(
      patch.world.tiles.map((tile) => [tile.key, tile] as const),
    );
    try {
      expect(
        greaterRealmSurfaceSplitTestSeams.overlayLegacyLowlandsWaterAuthority(
          grid,
          legacy,
          waterRegime,
        ),
      ).toBe(true);
      expect(
        greaterRealmSurfaceSplitTestSeams.overlayLegacyLowlandsVisualAuthority(
          grid,
          legacy,
          biomeId,
          landformId,
        ),
      ).toBe(true);

      for (const waterCell of patch.water.enabledCells) {
        const cell = grid.indexOf(
          transformLegacyLowlandsToGlobal(waterCell, transform),
        );
        enabledWaterByCell.set(cell, waterCell);
      }
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        const waterCell = enabledWaterByCell.get(cell);
        const expectedRegime =
          waterCell?.regime === 'ocean'
            ? 1
            : waterCell?.regime === 'river'
              ? 3
              : waterCell
                ? 2
                : 0;
        expect(waterRegime[cell]).toBe(expectedRegime);
        if (castleSlot[cell] === 1) expect(waterRegime[cell]).toBe(0);
      }
      for (const metadata of patch.world.metadata) {
        const tile = tileByKey.get(metadata.tileKey)!;
        const cell = grid.indexOf(
          transformLegacyLowlandsToGlobal(tile, transform),
        );
        const waterCell = enabledWaterByCell.get(cell);
        const expected =
          waterCell?.regime === 'ocean'
            ? [
                GREATER_REALM_BIOME_ID.SALTWATER,
                GREATER_REALM_LANDFORM_ID.ISLAND_SHELF,
              ]
            : waterCell?.regime === 'river'
              ? [
                  GREATER_REALM_BIOME_ID.RIVER_STREAM,
                  GREATER_REALM_LANDFORM_ID.WATERCOURSE,
                ]
              : waterCell
                ? [
                    GREATER_REALM_BIOME_ID.LAKE,
                    GREATER_REALM_LANDFORM_ID.LAKE_BASIN,
                  ]
                : visualClass[metadata.terrainKind];
        expect([biomeId[cell], landformId[cell]]).toEqual(expected);
      }
    } finally {
      enabledWaterByCell.clear();
      tileByKey.clear();
      coordinatesByKey.clear();
      protectedCell.fill(0);
      castleSlot.fill(0);
      waterRegime.fill(0);
      biomeId.fill(0);
      landformId.fill(0);
      grid.clearIndex?.();
    }
  });
});

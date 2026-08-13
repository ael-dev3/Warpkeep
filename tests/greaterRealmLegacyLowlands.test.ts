import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1,
  GREATER_REALM_LOWLANDS_REGION_ID,
  GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_CLASSIFICATION,
  GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1,
  LEGACY_LOWLANDS_AXIAL_ROTATION_STEPS,
  assertAxialKeyCollisionFree,
  assertGreaterRealmLegacyLowlandsPatchLocked,
  inverseGlobalToLegacyLowlands,
  privateAxialCoordinateKey,
  privateRegionAxialCoordinateKey,
  rotateAxialCoordinate60,
  transformLegacyLowlandsToGlobal,
  type LegacyLowlandsAtlasTransform,
} from '../scripts/atlas/greater-realm-legacy-lowlands';
import { GREATER_REALM_AXIAL_DIRECTIONS } from '../scripts/atlas/greater-realm-terrain';
import { canonicalTierIFoodSiteDigestInput } from '../spacetimedb/src/foodSitePolicy';
import { canonicalTierIGoldSiteDigestInput } from '../spacetimedb/src/goldSitePolicy';
import { canonicalTierIStoneSiteDigestInput } from '../spacetimedb/src/stoneSitePolicy';
import { canonicalTierIWoodSiteDigestInput } from '../spacetimedb/src/woodSitePolicy';
import {
  canonicalGenesisForestAssetCatalogV1DigestInput,
  canonicalGenesisForestLayoutV1DigestInput,
} from '../spacetimedb/src/forestLayoutPolicy';
import { canonicalGenesisWaterRevisionV1DigestInput } from '../spacetimedb/src/waterRevision';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('Greater Realm private legacy Lowlands bridge input', () => {
  it('locks exact deployed catalogs behind a private-only descriptor', () => {
    const patch = GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1;
    const pins = GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1;

    expect(patch.classification).toBe(GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_CLASSIFICATION);
    expect(patch.classification).toBe('private-generator-input-only-never-public-report');
    expect(patch.regionId).toBe('T1_LOWLANDS');
    expect(patch.coordinateSpace).toBe('region-local-axial');
    expect(Object.isFrozen(patch)).toBe(true);

    expect(patch.world.tiles).toHaveLength(10_000);
    expect(patch.world.metadata).toHaveLength(10_000);
    expect(patch.castleSlots.rows).toHaveLength(100);
    expect(patch.water.cells).toHaveLength(3_680);
    expect(patch.water.enabledBodies).toHaveLength(13);
    expect(patch.water.enabledCells).toHaveLength(3_271);
    expect(patch.water.reclaimedLakeCellKeys).toHaveLength(409);
    expect(patch.resources.gold.sites).toHaveLength(24);
    expect(patch.resources.food.sites).toHaveLength(96);
    expect(patch.resources.wood.sites).toHaveLength(96);
    expect(patch.resources.stone.sites).toHaveLength(96);
    expect(patch.forest.instances).toHaveLength(210);

    expect(pins.worldGenerationDigest).toBe(
      '4c111ec1f5e127c7cfd8f42f87c4085f94a4bc46bdacbdc9779866dfdb3edab6',
    );
    expect(pins.castleSlotDigest).toBe(
      'd770a084b7c8f59abbc505239a026a98e17bd55d3507c204cd1517858db017ed',
    );
    expect(patch.water.layoutDigest).toBe(
      'e6e3601063254a232a80bcc2921e6717b7564f8fce7b276207ffca39c1843dba',
    );
    expect(patch.water.activeRevision.revisionDigest).toBe(
      '82c18efe71afff1e1dcd4db17b2f6bd1815042d88c7471793bf6cd6d03780aec',
    );
    expect(patch.resources.gold.catalogDigest).toBe(
      '84ea3eed9ff5cd3eb7e4704aee6fb562ef3f969c490e95d3bf88645abded7d7d',
    );
    expect(patch.resources.food.catalogDigest).toBe(
      '10756337e27138b536a250ad6bf704c603a8c3946c72a1f0d3a041630610ce72',
    );
    expect(patch.resources.wood.catalogDigest).toBe(
      '3f0ae99d2052c32b7fec9aec6126e86f53031c13d619fcef12dd42a02b4063d6',
    );
    expect(patch.resources.stone.catalogDigest).toBe(
      '22c902d5bfb033e7faf3eaa303e89228d9aad0cff712853618dc34b994d28467',
    );
    expect(patch.forest.layoutDigest).toBe(
      '8a7e7c290e319f9495c3ca2485114659a52f84411e7864a4ed0127ac248b52b2',
    );
    expect(patch.forest.assetCatalogDigest).toBe(
      'e544942ee29a61215c2afce360b8a19f943ff703957e84b20973452f1b93cde7',
    );
    expect(() => assertGreaterRealmLegacyLowlandsPatchLocked()).not.toThrow();
  });

  it('recomputes every existing SHA-256 catalog pin from its canonical input', () => {
    const pins = GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1;
    expect(sha256(canonicalGenesisWaterRevisionV1DigestInput())).toBe(
      pins.waterRevisionDigest,
    );
    expect(sha256(canonicalTierIGoldSiteDigestInput())).toBe(pins.goldSiteDigest);
    expect(sha256(canonicalTierIFoodSiteDigestInput())).toBe(pins.foodSiteDigest);
    expect(sha256(canonicalTierIWoodSiteDigestInput())).toBe(pins.woodSiteDigest);
    expect(sha256(canonicalTierIStoneSiteDigestInput())).toBe(pins.stoneSiteDigest);
    expect(sha256(canonicalGenesisForestLayoutV1DigestInput())).toBe(
      pins.forestLayoutDigest,
    );
    expect(sha256(canonicalGenesisForestAssetCatalogV1DigestInput())).toBe(
      pins.forestAssetCatalogDigest,
    );
  });

  it('locks a complete enabled-ocean frontier and exterior contact ring', () => {
    const patch = GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1;
    const protectedByKey = new Map<string, Readonly<{ q: number; r: number }>>();
    for (const tile of patch.world.tiles) protectedByKey.set(tile.key, tile);
    for (const cell of patch.water.cells) protectedByKey.set(cell.cellKey, cell);
    const enabledOceanKeys = new Set(
      patch.water.enabledCells
        .filter(cell => cell.regime === 'ocean')
        .map(cell => cell.cellKey),
    );
    const protectedFrontierKeys = new Set<string>();
    const exteriorContactKeys = new Set<string>();
    for (const [key, coordinate] of protectedByKey) {
      for (const direction of GREATER_REALM_AXIAL_DIRECTIONS) {
        const exteriorKey = privateAxialCoordinateKey({
          q: coordinate.q + direction.q,
          r: coordinate.r + direction.r,
        });
        if (protectedByKey.has(exteriorKey)) continue;
        protectedFrontierKeys.add(key);
        if (enabledOceanKeys.has(key)) exteriorContactKeys.add(exteriorKey);
      }
    }

    expect(protectedByKey.size).toBe(12_871);
    expect(protectedFrontierKeys.size).toBe(390);
    expect(exteriorContactKeys.size).toBe(396);
    expect([...protectedFrontierKeys].every(key => enabledOceanKeys.has(key))).toBe(true);
    expect([...exteriorContactKeys].every(key => !protectedByKey.has(key))).toBe(true);
  });

  it('round-trips every Lowlands tile through all six exact rotations', () => {
    const tiles = GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.world.tiles;
    for (const rotationSteps of LEGACY_LOWLANDS_AXIAL_ROTATION_STEPS) {
      const transform: LegacyLowlandsAtlasTransform = Object.freeze({
        rotationSteps,
        globalOffsetQ: 183_271,
        globalOffsetR: -97_403,
      });
      const globalCoordinates = tiles.map((tile) => (
        transformLegacyLowlandsToGlobal(tile, transform)
      ));
      expect(assertAxialKeyCollisionFree(globalCoordinates)).toBe(10_000);
      for (let index = 0; index < tiles.length; index += 1) {
        const local = tiles[index]!;
        const roundTrip = inverseGlobalToLegacyLowlands(globalCoordinates[index]!, transform);
        expect(privateAxialCoordinateKey(roundTrip)).toBe(local.key);
      }
    }
  });

  it('keeps all six rotations bijective, cyclic, and region-key collision-free', () => {
    const tiles = GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.world.tiles;
    for (const rotationSteps of LEGACY_LOWLANDS_AXIAL_ROTATION_STEPS) {
      const rotated = tiles.map((tile) => rotateAxialCoordinate60(tile, rotationSteps));
      expect(assertAxialKeyCollisionFree(rotated)).toBe(10_000);
      expect(new Set(rotated.map((coordinate) => (
        privateRegionAxialCoordinateKey(GREATER_REALM_LOWLANDS_REGION_ID, coordinate)
      ))).size).toBe(10_000);
    }

    for (const tile of tiles) {
      let rotated = { q: tile.q, r: tile.r };
      for (let step = 0; step < 6; step += 1) {
        rotated = rotateAxialCoordinate60(rotated, 1);
      }
      expect(privateAxialCoordinateKey(rotated)).toBe(tile.key);
    }
  });

  it('fails closed on ambiguous rotations and axial key collisions', () => {
    expect(() => rotateAxialCoordinate60({ q: 0, r: 0 }, 6 as never)).toThrow(
      'GREATER_REALM_LEGACY_LOWLANDS_ROTATION_STEPS',
    );
    expect(() => assertAxialKeyCollisionFree([
      { q: 3, r: -2 },
      { q: 3, r: -2 },
    ])).toThrow('GREATER_REALM_LEGACY_LOWLANDS_AXIAL_KEY_COLLISION');
    expect(() => privateRegionAxialCoordinateKey('T1_LOWLANDS:LEAK', { q: 0, r: 0 })).toThrow(
      'GREATER_REALM_LEGACY_LOWLANDS_REGION_ID',
    );
  });
});

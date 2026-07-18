import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createRealmGrassLayer,
  type RealmGrassLayer
} from '../src/components/realm/createRealmGrassLayer';
import { grassExclusionsForTerrainFeatures } from '../src/components/realm/createRealmScene';
import { REALM_GRASS_RENDER_PLANS, REALM_QUALITY_SPECS } from '../src/components/realm/realmQuality';
import { axialToWorld } from '../src/game/map/hexCoordinates';
import { generateRealmTerrainFeatures } from '../src/game/map/realmTerrainFeatures';
import { indexRealmTerrainSemantics } from '../src/game/map/realmTerrainSemantics';
import { createAuthoritativeRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';
import { createHegemonyCastlePlacements } from '../src/game/map/terrainPlacements';
import { createCanonicalGenesisSnapshot } from './fixtures/canonicalGenesisSnapshot';

function digestPackedGrass(layer: RealmGrassLayer) {
  const digest = createHash('sha256');
  const count = layer.mesh.count;
  digest.update(String(count));
  const matrixValues = layer.mesh.instanceMatrix.array;
  digest.update(new Uint8Array(
    matrixValues.buffer,
    matrixValues.byteOffset,
    count * 16 * matrixValues.BYTES_PER_ELEMENT
  ));
  const phases = layer.mesh.geometry.getAttribute('grassPhase').array;
  digest.update(new Uint8Array(
    phases.buffer,
    phases.byteOffset,
    count * phases.BYTES_PER_ELEMENT
  ));
  return digest.digest('hex');
}

describe('canonical Genesis 001 grass bounds', () => {
  it('keeps the live 10,000-cell realm camera-local, deterministic, and under the High ceiling', () => {
    const snapshot = createCanonicalGenesisSnapshot();
    const surface = createAuthoritativeRealmTerrainSurface(
      snapshot.realm.numericSeed,
      snapshot.tiles,
      snapshot.realm.authoritativeRadius,
      snapshot.realm.renderRadius
    );
    const semantics = indexRealmTerrainSemantics(surface, snapshot.tileMetadata);
    const placements = createHegemonyCastlePlacements(snapshot.castles.map((castle) => ({
      id: `castle:${castle.castleId}`,
      coord: { q: castle.q, r: castle.r }
    })));
    const features = generateRealmTerrainFeatures(
      surface.renderMap,
      semantics.terrainKindsByKey,
      'high',
      1,
      placements,
      semantics.castleSlotKeys
    );
    const layer = createRealmGrassLayer({
      surface,
      terrainKindsByKey: semantics.terrainKindsByKey,
      castleSlotKeys: semantics.castleSlotKeys,
      placements,
      exclusions: grassExclusionsForTerrainFeatures(features.points),
      plan: REALM_GRASS_RENDER_PLANS.high,
      reducedMotion: false
    });

    expect(surface.playableMap.cells).toHaveLength(10_000);
    expect(surface.renderMap.cells).toHaveLength(10_981);
    layer.updateView({ x: 0, z: 0 }, 'realm');
    expect(layer.getTelemetry()).toMatchObject({
      activeCellCount: 0,
      instanceCount: 0,
      overviewHidden: true
    });

    layer.updateView({ x: 0, z: 0 }, 'keep');
    const first = layer.getTelemetry();
    expect(first.activeCellCount).toBe(469);
    expect(first.cacheEntries).toBeLessThanOrEqual(REALM_GRASS_RENDER_PLANS.high.cacheLimit);
    expect(first.cacheEntries).toBeLessThan(10_000);
    expect(first.instanceCount).toBeLessThanOrEqual(
      REALM_GRASS_RENDER_PLANS.high.maximumActiveInstances
    );
    expect(first.triangleCount).toBeLessThanOrEqual(
      REALM_GRASS_RENDER_PLANS.high.maximumActiveTriangles
    );
    expect(first.drawCalls).toBeLessThanOrEqual(1);
    expect(digestPackedGrass(layer)).toBe(
      'd096966756353ad1d09c90c68ef51a23a6348dc8b8105b638a47a624844401c3'
    );

    layer.updateView(axialToWorld({ q: 30, r: -10 }, 1), 'keep');
    const traversed = layer.getTelemetry();
    expect(traversed.activeCellCount).toBe(469);
    expect(traversed.cacheEntries).toBeLessThanOrEqual(REALM_GRASS_RENDER_PLANS.high.cacheLimit);
    expect(traversed.cacheEntries).toBeLessThan(10_000);
    expect(traversed.instanceCount).toBeLessThanOrEqual(
      REALM_GRASS_RENDER_PLANS.high.maximumActiveInstances
    );
    layer.dispose();
  });
});

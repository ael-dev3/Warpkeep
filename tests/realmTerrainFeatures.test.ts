import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  GENESIS_GENERATION_V2_REALM,
  GENESIS_GENERATION_V2_WORLD_TILES,
  GENESIS_GENERATION_V2_WORLD_TILE_META
} from '../spacetimedb/src/world';
import { createRealmTerrainFeatureLayers } from '../src/components/realm/createRealmTerrainFeatures';
import {
  REALM_QUALITY_SPECS,
  resolveRealmRenderPlan
} from '../src/components/realm/realmQuality';
import { hexKey, parseHexKey } from '../src/game/map/hexCoordinates';
import {
  generateRealmTerrainFeatures,
  REALM_TERRAIN_FEATURE_BUDGETS
} from '../src/game/map/realmTerrainFeatures';
import { indexRealmTerrainSemantics } from '../src/game/map/realmTerrainSemantics';
import {
  createAuthoritativeRealmTerrainSurface
} from '../src/game/map/realmTerrainSurface';
import { generateTerrainDecorations } from '../src/game/map/terrainDecorations';
import { createHegemonyCastlePlacements } from '../src/game/map/terrainPlacements';
import { createCanonicalGenesisSnapshot } from './fixtures/canonicalGenesisSnapshot';

function canonicalInput() {
  const snapshot = createCanonicalGenesisSnapshot();
  const surface = createAuthoritativeRealmTerrainSurface(
    snapshot.realm.numericSeed,
    snapshot.tiles,
    snapshot.realm.authoritativeRadius,
    snapshot.realm.renderRadius
  );
  const semantics = indexRealmTerrainSemantics(surface, snapshot.tileMetadata);
  const castleSlotCoords = [...semantics.castleSlotKeys].map((key) => {
    const coord = parseHexKey(key);
    if (!coord) throw new Error(`invalid canonical tile key ${key}`);
    return coord;
  });
  const placements = createHegemonyCastlePlacements(castleSlotCoords.map((coord, index) => ({
    id: `castle-slot-${index + 1}`,
    coord
  })));
  return { placements, semantics, snapshot, surface };
}

describe('semantic realm terrain features', () => {
  it('is deterministic, quality-bounded, and suppresses every founding slot', () => {
    const { placements, semantics, surface } = canonicalInput();
    const high = generateRealmTerrainFeatures(
      surface.renderMap,
      semantics.terrainKindsByKey,
      'high',
      1,
      placements,
      semantics.castleSlotKeys
    );
    const repeat = generateRealmTerrainFeatures(
      surface.renderMap,
      semantics.terrainKindsByKey,
      'high',
      1,
      placements,
      semantics.castleSlotKeys
    );
    const balanced = generateRealmTerrainFeatures(
      surface.renderMap,
      semantics.terrainKindsByKey,
      'balanced',
      1,
      placements,
      semantics.castleSlotKeys
    );
    const reduced = generateRealmTerrainFeatures(
      surface.renderMap,
      semantics.terrainKindsByKey,
      'reduced',
      1,
      placements,
      semantics.castleSlotKeys
    );

    expect(high).toEqual(repeat);
    expect(high.points.length).toBeGreaterThan(balanced.points.length);
    expect(balanced.points.length).toBeGreaterThan(reduced.points.length);
    expect(high.points.length).toBeLessThanOrEqual(REALM_TERRAIN_FEATURE_BUDGETS.high);
    expect(balanced.points.length).toBeLessThanOrEqual(REALM_TERRAIN_FEATURE_BUDGETS.balanced);
    expect(reduced.points.length).toBeLessThanOrEqual(REALM_TERRAIN_FEATURE_BUDGETS.reduced);
    expect(high.counts['heath-bloom']).toBe(0);
    expect(Object.entries(high.counts)
      .filter(([kind]) => kind !== 'heath-bloom')
      .every(([, count]) => count > 0)).toBe(true);
    expect(high.points.every((point) => !semantics.castleSlotKeys.has(hexKey(point.coord))))
      .toBe(true);
    expect(high.points.every((point) => (
      Number.isFinite(point.world.x)
      && Number.isFinite(point.world.z)
      && Number.isFinite(point.rotation)
      && Number.isFinite(point.scale)
    ))).toBe(true);
  });

  it('reallocates rather than exceeds the fixed radius-sixty detail budget', () => {
    const { placements, semantics, surface } = canonicalInput();
    for (const quality of ['high', 'balanced', 'reduced'] as const) {
      const spec = REALM_QUALITY_SPECS[quality];
      const plan = resolveRealmRenderPlan(spec, {
        playableRadius: surface.playableMap.radius,
        renderRadius: surface.renderMap.radius,
        playableCellCount: surface.playableMap.cells.length,
        renderCellCount: surface.renderMap.cells.length
      });
      const generic = generateTerrainDecorations(
        surface.renderMap,
        { ...plan.stoneDecorationDensity, playableRadius: surface.playableMap.radius },
        1,
        placements,
        semantics.terrainKindsByKey,
        {
          maximumPoints: plan.stoneDecorationInstanceBudget,
          preserveRadius: 20,
          playableKeys: surface.playableKeys
        }
      );
      const semantic = generateRealmTerrainFeatures(
        surface.renderMap,
        semantics.terrainKindsByKey,
        quality,
        1,
        placements,
        semantics.castleSlotKeys
      );

      expect(generic.points.length + semantic.points.length)
        .toBeLessThanOrEqual(plan.decorationInstanceBudget);
      expect(generic.points.length).toBeLessThanOrEqual(plan.stoneDecorationInstanceBudget);
    }
  });

  it('removes ordinary heath bloom geometry while keeping ancient stone readable', () => {
    const { placements, semantics, surface } = canonicalInput();
    const high = generateRealmTerrainFeatures(
      surface.renderMap,
      semantics.terrainKindsByKey,
      'high',
      1,
      placements,
      semantics.castleSlotKeys
    );
    expect(high.counts['heath-bloom']).toBe(0);
    expect(high.points.some((point) => point.kind === 'heath-bloom')).toBe(false);

    const layer = createRealmTerrainFeatureLayers(
      high,
      surface.renderMap,
      REALM_QUALITY_SPECS.high,
      1,
      placements
    );
    const monolith = layer.group.children.find(
      (child) => child.name === 'realm-ancient-monoliths'
    ) as THREE.InstancedMesh | undefined;
    expect(monolith).toBeDefined();
    expect((monolith!.material as THREE.MeshStandardMaterial).color.g).toBeGreaterThan(
      (monolith!.material as THREE.MeshStandardMaterial).color.r
    );
    layer.dispose();
  });

  it('preserves established generation-v2 semantic features and order inside radius twenty', () => {
    const { placements, semantics, snapshot, surface } = canonicalInput();
    const establishedSurface = createAuthoritativeRealmTerrainSurface(
      snapshot.realm.numericSeed,
      GENESIS_GENERATION_V2_WORLD_TILES,
      GENESIS_GENERATION_V2_REALM.authoritativeRadius,
      GENESIS_GENERATION_V2_REALM.renderRadius
    );
    const establishedSemantics = indexRealmTerrainSemantics(
      establishedSurface,
      GENESIS_GENERATION_V2_WORLD_TILE_META
    );

    for (const quality of ['high', 'balanced', 'reduced'] as const) {
      const established = generateRealmTerrainFeatures(
        establishedSurface.renderMap,
        establishedSemantics.terrainKindsByKey,
        quality,
        1,
        placements,
        establishedSemantics.castleSlotKeys
      );
      const expanded = generateRealmTerrainFeatures(
        surface.renderMap,
        semantics.terrainKindsByKey,
        quality,
        1,
        placements,
        semantics.castleSlotKeys
      );

      expect(expanded.points.filter((point) => (
        Math.max(
          Math.abs(point.coord.q),
          Math.abs(point.coord.r),
          Math.abs(-point.coord.q - point.coord.r)
        ) <= 20
      )), quality).toEqual(established.points);
      expect(expanded.points.length).toBeLessThanOrEqual(expanded.budget);
    }
  });

  it('allocates at most one instanced draw call per feature family and disposes once', () => {
    const { placements, semantics, surface } = canonicalInput();
    const data = generateRealmTerrainFeatures(
      surface.renderMap,
      semantics.terrainKindsByKey,
      'reduced',
      1,
      placements,
      semantics.castleSlotKeys
    );
    const instanceDispose = vi.spyOn(THREE.InstancedMesh.prototype, 'dispose');
    const layer = createRealmTerrainFeatureLayers(
      data,
      surface.renderMap,
      REALM_QUALITY_SPECS.reduced,
      1,
      placements
    );

    expect(layer.group.name).toBe('realm-semantic-terrain-features');
    expect(layer.instanceCount).toBe(data.points.length);
    expect(layer.drawCalls).toBeGreaterThan(0);
    expect(layer.drawCalls).toBeLessThanOrEqual(4);
    layer.group.children.forEach((child) => {
      const mesh = child as THREE.InstancedMesh;
      expect(mesh.boundingBox).not.toBeNull();
      expect(mesh.boundingSphere).not.toBeNull();
      expect((mesh.material as THREE.Material).transparent).toBe(false);
    });

    layer.dispose();
    layer.dispose();
    expect(instanceDispose).toHaveBeenCalledTimes(layer.drawCalls);
    instanceDispose.mockRestore();
  });
});

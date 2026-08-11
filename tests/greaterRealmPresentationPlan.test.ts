import { describe, expect, it } from 'vitest';

import { POINTY_TOP_AXIAL_DIRECTIONS, axialToWorld } from '../src/game/map/hexCoordinates';
import {
  GREATER_REALM_SYNTHETIC_REVISION,
  GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE,
  createGreaterRealmSyntheticTransport
} from '../src/dev/greaterRealmSyntheticTierOneFixture';
import {
  GREATER_REALM_TRAVEL_CLASS,
  decodeGreaterRealmChunkDto,
  greaterRealmCoordinateKey
} from '../src/greater-realm/greaterRealmPublicContract';
import { createGreaterRealmChunkPresentationPlan } from '../src/greater-realm/greaterRealmPresentationPlan';
import { GREATER_REALM_GRAPHICS_BUDGETS } from '../src/greater-realm/greaterRealmRuntimePolicy';

describe('Greater Realm presentation plan', () => {
  it('derives deterministic living-world visuals only from returned public rows', () => {
    const chunk = GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks[0];
    const input = { chunk, graphicsProfile: 'high' as const, cellSize: 1 };
    const first = createGreaterRealmChunkPresentationPlan(input);
    const second = createGreaterRealmChunkPresentationPlan(input);

    expect(first).toEqual(second);
    expect(first.waterCells.length).toBeGreaterThan(0);
    expect(first.routeSegments.some((segment) => segment.kind === 'road')).toBe(true);
    expect(first.routeSegments.some((segment) => segment.kind === 'river')).toBe(true);
    expect(first.routeSegments.some((segment) => segment.kind === 'boat-lane')).toBe(true);
    expect(first.crossings.some((crossing) => crossing.kind === 'bridge')).toBe(true);
    expect(first.actors.some((actor) => actor.kind === 'boat')).toBe(true);
    expect(first.actors.some((actor) => actor.kind === 'canopy')).toBe(true);
    expect(first.actors.some((actor) => actor.kind === 'grass')).toBe(true);
    expect(first.resources).toHaveLength(1);
    expect(first.resources[0]?.kind).toBe('wood');
    expect(first.instanceCount).toBeLessThanOrEqual(
      GREATER_REALM_GRAPHICS_BUDGETS.high.maximumSceneInstances
    );
    expect(first.grassPatchCount).toBeLessThanOrEqual(7_000);
    expect(first.grassBladeCount).toBeLessThanOrEqual(63_000);
    expect(first.grassTriangleCount).toBeLessThanOrEqual(189_000);
    expect(first.flowerCount).toBeLessThanOrEqual(512);
    expect(first.flowerGeometryBytes).toBeLessThanOrEqual(1_048_576);
  });

  it('keeps visual road adjacency separate from explicit movement authority', () => {
    const baseline = createGreaterRealmChunkPresentationPlan({
      chunk: GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks[0],
      graphicsProfile: 'balanced',
      cellSize: 1
    });
    const raw = structuredClone(GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks[0]) as any;
    const blocked = raw.coreCells.find((cell: any) => !cell.passable);
    blocked.travelClass = GREATER_REALM_TRAVEL_CLASS.ROAD;
    const chunk = decodeGreaterRealmChunkDto(raw);
    const plan = createGreaterRealmChunkPresentationPlan({
      chunk,
      graphicsProfile: 'balanced',
      cellSize: 1
    });
    const access = plan.cellAccess.find((cell) => cell.cellKey === blocked.cellKey)!;
    expect(access.passable).toBe(false);
    expect(plan.blockedCoordinateKeys).toContain(access.coordinateKey);
    const visualRoadCount = (value: typeof plan) => value.routeSegments.filter((segment) => (
      segment.kind === 'road' || segment.kind === 'track' || segment.kind === 'carriageway'
    )).length;
    expect(visualRoadCount(plan)).toBeGreaterThan(visualRoadCount(baseline));
    const ford = chunk.coreCells.find((cell) => (
      cell.travelClass === GREATER_REALM_TRAVEL_CLASS.FORD
    ))!;
    expect(plan.cellAccess.find((cell) => (
      cell.coordinateKey === greaterRealmCoordinateKey(ford)
    ))?.passable).toBe(true);
  });

  it('creates skirts only from six-bit seals and never fills hidden LOD cells', async () => {
    const transport = createGreaterRealmSyntheticTransport();
    const descriptor = GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.window.chunks[0]!;
    const chunk = await transport.getChunk({
      chunkHandle: descriptor.chunkHandle,
      lod: 3,
      expectedRevision: GREATER_REALM_SYNTHETIC_REVISION
    }, new AbortController().signal);
    const plan = createGreaterRealmChunkPresentationPlan({
      chunk,
      graphicsProfile: 'reduced',
      cellSize: 1
    });
    const explicitCells = [...chunk.coreCells, ...chunk.apronCells];
    const explicitEdges = explicitCells.reduce((total, cell) => {
      let count = 0;
      for (let bit = 0; bit < 6; bit += 1) count += (cell.sealedBoundaryMask >> bit) & 1;
      return total + count;
    }, 0);
    expect(plan.terrainCells).toHaveLength(2);
    expect(plan.terrainCells).toEqual(explicitCells);
    expect(plan.sealedEdges).toHaveLength(explicitEdges);
    expect(plan.actors).toEqual([]);
    expect(plan.resources).toEqual([]);
  });

  it('maps each sealed-mask bit to the matching pointy-top neighbor side', () => {
    for (let direction = 0; direction < POINTY_TOP_AXIAL_DIRECTIONS.length; direction += 1) {
      const raw = structuredClone(
        GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks[0]
      ) as any;
      [...raw.coreCells, ...raw.apronCells].forEach((cell: any) => {
        cell.sealedBoundaryMask = 0;
      });
      raw.coreCells[0].sealedBoundaryMask = 1 << direction;
      const chunk = decodeGreaterRealmChunkDto(raw);
      const plan = createGreaterRealmChunkPresentationPlan({
        chunk,
        graphicsProfile: 'balanced',
        cellSize: 1
      });
      expect(plan.sealedEdges).toHaveLength(1);
      const edge = plan.sealedEdges[0]!;
      const cell = chunk.coreCells[0]!;
      const delta = POINTY_TOP_AXIAL_DIRECTIONS[direction]!;
      const center = axialToWorld({ q: cell.atlasQ, r: cell.atlasR }, 1);
      const neighbor = axialToWorld({
        q: cell.atlasQ + delta.q,
        r: cell.atlasR + delta.r
      }, 1);
      expect((edge.from.x + edge.to.x) / 2).toBeCloseTo((center.x + neighbor.x) / 2, 12);
      expect((edge.from.z + edge.to.z) / 2).toBeCloseTo((center.z + neighbor.z) / 2, 12);
    }
  });

  it('pins the exact High/Balanced/Reduced grass, flower, and upload ceilings', () => {
    expect(GREATER_REALM_GRAPHICS_BUDGETS.high).toMatchObject({
      grassPatchCount: 7_000,
      grassBladeCount: 63_000,
      grassTriangleCount: 189_000,
      grassDrawCalls: 3,
      flowerCount: 512,
      flowerDrawCalls: 2,
      flowerGeometryBytes: 1_048_576,
      maximumUploadBytesPerFrame: 1_048_576
    });
    expect(GREATER_REALM_GRAPHICS_BUDGETS.balanced).toMatchObject({
      grassPatchCount: 4_000,
      grassBladeCount: 28_000,
      grassTriangleCount: 84_000,
      grassDrawCalls: 2,
      flowerCount: 256,
      flowerDrawCalls: 1,
      flowerGeometryBytes: 524_288,
      maximumUploadBytesPerFrame: 524_288
    });
    expect(GREATER_REALM_GRAPHICS_BUDGETS.reduced).toMatchObject({
      grassPatchCount: 1_200,
      grassBladeCount: 6_000,
      grassTriangleCount: 18_000,
      grassDrawCalls: 1,
      flowerCount: 0,
      flowerDrawCalls: 0,
      flowerGeometryBytes: 0,
      maximumUploadBytesPerFrame: 196_608
    });
  });
});

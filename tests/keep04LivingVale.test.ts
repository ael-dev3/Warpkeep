import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createKeep04Scene, type VisualState04 } from '../src/components/keep04/createKeep04Scene';
import { createKeep04Landscape } from '../src/components/keep04/createKeep04Landscape';
import { createKeep04Life, type Keep04WorkerVisual } from '../src/components/keep04/createKeep04Life';
import { KEEP04_CIVIC_COMMONS, KEEP04_CIVIC_SPINE, KEEP04_DECK, keep04DoorPoint, keep04FootprintRect, planKeep04Walkways } from '../src/components/keep04/keep04InnerPaths';
import {
  distanceToPlinth, distanceToPolyline, keep04RoadHeight, keep04TerrainHeight, KEEP04_BRIDGES, KEEP04_BRIDGE_DECK_Y, KEEP04_FIELDS, KEEP04_LOTS,
  KEEP04_PLINTH, KEEP04_RIVER, KEEP04_RIVER_HALF_WIDTH, KEEP04_RIVER_SURFACE_Y, KEEP04_ROADS, KEEP04_VALLEY_FLOOR_Y, createKeep04TerrainGeometry,
} from '../src/components/keep04/keep04Terrain';
import { KEEP04_VISUAL_PROFILE } from '../src/components/keep04/keep04VisualProfile';
import { INNER_KEEP_STATIC_RUNTIME_ASSETS } from '../src/components/inner-keep/innerKeepRuntimeAssetCatalog.generated';
import type { InnerKeepRuntimeAssetBundle, InnerKeepRuntimePrefab } from '../src/components/inner-keep/loadInnerKeepRuntimeAssets';
import { evaluatePlacement04, type Placement04 } from '../spacetimedb/gameplay04/placement';
import { KEEP04_QA_LAYOUT } from '../src/dev/keep04QaScenarios';
import type { Building04 } from '../spacetimedb/gameplay04/policy';

afterEach(() => vi.restoreAllMocks());

const QUALITIES = ['high', 'balanced', 'reduced'] as const;
const empty = (): InnerKeepRuntimeAssetBundle => ({ staticPrefabs: new Map(), populationPrefabs: new Map(), failures: [], dispose: vi.fn() });
const building = (placement: Placement04, phase: 'complete' | 'constructing' = 'complete', level = 3) => ({
  kind: placement.kind, placement, completedLevel: level, targetLevel: phase === 'constructing' ? level + 1 : level, phase,
  startsAtMicros: phase === 'constructing' ? 1n : null, completesAtMicros: phase === 'constructing' ? 2n : null,
}) as const;

it('plans walkways from every real door to the reserved civic network without crossing another site', () => {
  const walkways = planKeep04Walkways(KEEP04_QA_LAYOUT);
  expect(walkways.map(walkway => walkway.kind).sort()).toEqual(KEEP04_QA_LAYOUT.map(placement => placement.kind).sort());
  for (const walkway of walkways) {
    const own = KEEP04_QA_LAYOUT.find(placement => placement.kind === walkway.kind)!;
    expect(walkway.points[0]).toEqual(keep04DoorPoint(own));
    const end = walkway.points.at(-1)!;
    const onCivic = [KEEP04_CIVIC_SPINE, KEEP04_CIVIC_COMMONS].some(rect => end[0] >= rect.minX - 1e-9 && end[0] <= rect.maxX + 1e-9 && end[1] >= rect.minZ - 1e-9 && end[1] <= rect.maxZ + 1e-9);
    expect(onCivic).toBe(true);
    for (const [x, z] of walkway.points) {
      expect(x).toBeGreaterThanOrEqual(KEEP04_DECK.minX); expect(x).toBeLessThanOrEqual(KEEP04_DECK.maxX);
      expect(z).toBeGreaterThanOrEqual(KEEP04_DECK.minZ); expect(z).toBeLessThanOrEqual(KEEP04_DECK.maxZ);
    }
    // Sample each leg: no walkway point may stand inside another building's footprint.
    for (let i = 0; i < walkway.points.length - 1; i++) for (let t = 0; t <= 1; t += .05) {
      const x = walkway.points[i][0] + (walkway.points[i + 1][0] - walkway.points[i][0]) * t;
      const z = walkway.points[i][1] + (walkway.points[i + 1][1] - walkway.points[i][1]) * t;
      for (const other of KEEP04_QA_LAYOUT.filter(placement => placement !== own)) {
        const rect = keep04FootprintRect(other);
        expect(x > rect.minX && x < rect.maxX && z > rect.minZ && z < rect.maxZ, `${walkway.kind} crosses ${other.kind}`).toBe(false);
      }
    }
  }
  expect(planKeep04Walkways(KEEP04_QA_LAYOUT)).toEqual(walkways);
});

it.each([0, 90_000, 180_000, 270_000])('places the door outside its own footprint for rotation %s', rotation => {
  const placement = { kind: 'city-barracks', x: 20_000_000n, z: -14_000_000n, rotation } as Placement04;
  expect(evaluatePlacement04(placement, []).valid).toBe(true);
  const rect = keep04FootprintRect(placement); const [x, z] = keep04DoorPoint(placement);
  expect(x <= rect.minX || x >= rect.maxX || z <= rect.minZ || z >= rect.maxZ).toBe(true);
});

it('keeps the vale outside the plinth, the river below its banks and every lane on a bridge over water', () => {
  for (let x = -260; x <= 260; x += 20) for (let z = -260; z <= 260; z += 20) {
    const height = keep04TerrainHeight(x, z);
    expect(Number.isFinite(height)).toBe(true);
    if (distanceToPlinth(x, z) < 2) expect(height).toBeCloseTo(KEEP04_VALLEY_FLOOR_Y, 6);
  }
  for (const [x, z] of KEEP04_RIVER) expect(keep04TerrainHeight(x, z)).toBeLessThan(KEEP04_RIVER_SURFACE_Y);
  expect(KEEP04_BRIDGES.length).toBeGreaterThanOrEqual(1);
  for (const road of KEEP04_ROADS) for (const [x, z] of road) {
    if (distanceToPolyline(x, z, KEEP04_RIVER).distance < KEEP04_RIVER_HALF_WIDTH) {
      expect(keep04RoadHeight(x, z)).toBeGreaterThan(KEEP04_RIVER_SURFACE_Y);
      expect(keep04RoadHeight(x, z)).toBeCloseTo(KEEP04_BRIDGE_DECK_Y - .05, 1);
    }
  }
  for (const field of KEEP04_FIELDS) expect(distanceToPlinth(field.x, field.z)).toBeGreaterThan(10);
  for (const lot of KEEP04_LOTS) expect(distanceToPlinth(lot.x, lot.z)).toBeGreaterThan(10);
});

it('opens the plinth footprint in the valley mesh and thins it by quality', () => {
  const triangles = QUALITIES.map(quality => {
    const geometry = createKeep04TerrainGeometry(quality);
    const positions = geometry.getAttribute('position'); const index = geometry.index!;
    for (let i = 0; i < index.count; i += 3) {
      const corners = [0, 1, 2].map(k => [positions.getX(index.getX(i + k)), positions.getZ(index.getX(i + k))]);
      const inside = corners.every(([x, z]) => x > KEEP04_PLINTH.minX + 3 && x < KEEP04_PLINTH.maxX - 3 && z > KEEP04_PLINTH.minZ + 3 && z < KEEP04_PLINTH.maxZ - 3);
      expect(inside).toBe(false);
    }
    const count = index.count / 3; geometry.dispose(); return count;
  });
  expect(triangles[0]).toBeGreaterThan(triangles[1]); expect(triangles[1]).toBeGreaterThan(triangles[2]);
});

it.each(QUALITIES)('builds a deterministic, non-pickable %s vale whose lower tiers keep a stable population prefix', quality => {
  const first = createKeep04Landscape({ quality, reducedMotion: true, plinthGroundAt: () => 0 });
  const second = createKeep04Landscape({ quality, reducedMotion: true, plinthGroundAt: () => 0 });
  try {
    expect(first.instanceCount).toBe(second.instanceCount);
    first.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const ray = new THREE.Raycaster(new THREE.Vector3(0, 50, 0), new THREE.Vector3(0, -1, 0)); const hits: THREE.Intersection[] = [];
      object.raycast(ray, hits); expect(hits).toHaveLength(0);
    });
    const names = (group: THREE.Group) => { const list: string[] = []; group.traverse(object => { if (object.name) list.push(object.name); }); return list; };
    expect(names(first.group)).toEqual(names(second.group));
    expect(first.update(1)).toBe(false); // Reduced motion: mills stay still.
    expect(first.emitters.banners.length).toBe(6);
    expect(first.emitters.chimneys.length).toBeGreaterThan(10);
  } finally { first.dispose(); second.dispose(); }
  const high = createKeep04Landscape({ quality: 'high', reducedMotion: true, plinthGroundAt: () => 0 });
  const tier = createKeep04Landscape({ quality, reducedMotion: true, plinthGroundAt: () => 0 });
  try {
    for (const species of ['conifer', 'broadleaf', 'bush']) {
      const full = high.group.getObjectByName(`keep04-vale-${species}`) as THREE.InstancedMesh;
      const thin = tier.group.getObjectByName(`keep04-vale-${species}`) as THREE.InstancedMesh;
      expect(thin.count).toBeLessThanOrEqual(full.count);
      for (let i = 0; i < thin.count; i++) {
        const a = new THREE.Matrix4(); const b = new THREE.Matrix4(); full.getMatrixAt(i, a); thin.getMatrixAt(i, b);
        expect(b.elements).toEqual(a.elements);
      }
    }
  } finally { high.dispose(); tier.dispose(); }
});

it('turns the mills only when motion is allowed and disposes every vale resource once', () => {
  const vale = createKeep04Landscape({ quality: 'balanced', reducedMotion: false, plinthGroundAt: () => 0 });
  const sails = vale.group.getObjectByName('keep04-windmill-sails:15')!;
  expect(vale.update(0)).toBe(true); const before = sails.rotation.z; vale.update(2);
  expect(sails.rotation.z).not.toBe(before);
  const geometries = new Set<THREE.BufferGeometry>(); const disposed: number[] = [];
  vale.group.traverse(object => { if (object instanceof THREE.Mesh) geometries.add(object.geometry); });
  geometries.forEach(geometry => geometry.addEventListener('dispose', () => disposed.push(geometry.id)));
  vale.dispose(); vale.dispose();
  // Every owned geometry is released exactly once, and the group is emptied.
  expect(disposed).toHaveLength(geometries.size); expect(new Set(disposed).size).toBe(geometries.size);
  expect(vale.group.children).toHaveLength(0);
  expect(vale.cost()).toEqual({ drawCalls: 0, triangles: 0, shadowDrawCalls: 0, shadowTriangles: 0 });
});

function workerAt(life: ReturnType<typeof createKeep04Life>, ordinal: number) {
  // Workers are written first, in ordinal order, by the life module.
  const bodies = life.group.getObjectByName('keep04-life-villager-bodies') as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4(); bodies.getMatrixAt(ordinal, matrix); return new THREE.Vector3().setFromMatrixPosition(matrix);
}

it('walks outbound Workers out through the gate, returning Workers home with cargo and hides gathering Workers', () => {
  let clock = 1_000_000;
  const life = createKeep04Life({ quality: 'high', animate: true, landscape: null, now: () => clock });
  try {
    const workers: Keep04WorkerVisual[] = [
      { ordinal: 0, phase: 'outbound', resource: 'wood', phaseStartedAtMs: clock, phaseEndsAtMs: clock + 40_000 },
      { ordinal: 1, phase: 'returning', resource: 'food', phaseStartedAtMs: clock - 30_000, phaseEndsAtMs: clock + 4_000 },
      { ordinal: 2, phase: 'gathering', resource: 'stone', phaseStartedAtMs: clock - 10_000, phaseEndsAtMs: clock + 60_000 },
      { ordinal: 3, phase: 'idle', resource: null, phaseStartedAtMs: null, phaseEndsAtMs: null },
    ];
    life.reconcile({ buildings: [], workers });
    const start = workerAt(life, 0); const homeward = workerAt(life, 1);
    expect(start.z).toBeLessThan(10); // Just leaving the commons.
    clock += 6_000; life.update(1); life.update(7);
    const later = workerAt(life, 0);
    expect(later.z).toBeGreaterThan(start.z + 15); // Out along the gate spine.
    const homeLater = workerAt(life, 1);
    expect(homeLater.z).toBeLessThan(homeward.z); // Closer to the commons.
    const cargo = life.group.getObjectByName('keep04-life-worker-cargo') as THREE.InstancedMesh;
    const carts = life.group.getObjectByName('keep04-life-worker-carts') as THREE.InstancedMesh;
    // Outbound, returning and idle Workers have carts; only the returning cart carries cargo.
    expect(carts.count).toBe(3);
    const scales = Array.from({ length: cargo.count }, (_, i) => { const m = new THREE.Matrix4(); cargo.getMatrixAt(i, m); return new THREE.Vector3().setFromMatrixScale(m).x; });
    expect(scales.filter(value => value > .5)).toHaveLength(1);
  } finally { life.dispose(); }
});

it('gathers builders at an active project, grows the inner population with prosperity and stays still when not animating', () => {
  const life = createKeep04Life({ quality: 'balanced', animate: false, landscape: null, now: () => 0 });
  try {
    life.reconcile({ buildings: [], workers: [] });
    const quiet = life.actors();
    life.reconcile({ buildings: KEEP04_QA_LAYOUT.map(placement => building(placement)), workers: [] });
    const busy = life.actors();
    expect(busy).toBeGreaterThan(quiet);
    life.reconcile({ buildings: [building(KEEP04_QA_LAYOUT[0], 'constructing', 0)], workers: [] });
    expect(life.actors()).toBeGreaterThanOrEqual(quiet + 3 - 1);
    expect(life.update(5)).toBe(false);
    const walkways = life.group.getObjectByName('keep04-life-walkways') as THREE.Mesh;
    expect(walkways).toBeDefined();
  } finally { life.dispose(); }
  expect(life.actors()).toBe(0);
});

it('rejects economic or unknown worker fields at the visual boundary', () => {
  const scene = createKeep04Scene({ quality: 'reduced', reducedMotion: true, assets: empty() });
  try {
    const base: VisualState04 = { buildings: [], selectedKind: null, draft: null, draftValid: false, workers: [] };
    expect(() => scene.reconcile(base)).not.toThrow();
    expect(() => scene.reconcile({ ...base, workers: [{ ordinal: 0, phase: 'idle', resource: null, phaseStartedAtMs: null, phaseEndsAtMs: null, pendingYield: 10n } as unknown as Keep04WorkerVisual] })).toThrow(/visual/i);
    expect(scene.telemetry().pickTargetCount).toBe(0);
  } finally { scene.dispose(); }
});

function catalogPrefab(id: string, quality: 'balanced' | 'compact'): InnerKeepRuntimePrefab {
  // A stand-in carrying the pinned catalog triangle and draw counts of the real model.
  const asset = INNER_KEEP_STATIC_RUNTIME_ASSETS.find(entry => entry.id === id)!; const model = asset.models[quality];
  const root = new THREE.Group(); const perMesh = Math.max(1, Math.floor(model.triangles / model.drawCalls));
  for (let i = 0; i < model.drawCalls; i++) {
    const positions = new Float32Array(perMesh * 9).map((_, index) => (index % 3 === 1 ? index % 7 : index % 5) * .1);
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    root.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));
  }
  root.updateMatrixWorld(true);
  return { id, root, clips: [], boundsMeters: asset.boundsMeters as [number, number, number], triangles: perMesh * model.drawCalls, drawCalls: model.drawCalls,
    animated: false, mounted: false, clone: () => root.clone(true) };
}

it.each(QUALITIES)('still admits every authored %s building model alongside the vale and its life', quality => {
  const source = quality === 'high' ? 'balanced' : 'compact';
  const assets = empty();
  for (const id of ['courtyard-linden-teardrop', 'pruned-ornamental-three-tier']) (assets.staticPrefabs as Map<string, InnerKeepRuntimePrefab>).set(id, catalogPrefab(id, source));
  const scene = createKeep04Scene({ quality, reducedMotion: true, assets, ambient: true });
  try {
    const kinds = KEEP04_QA_LAYOUT.map(placement => placement.kind as Building04);
    for (const kind of kinds) expect(scene.admitBuildingPrefab(kind, catalogPrefab(kind, source)), `${quality} ${kind}`).toBe(true);
    scene.reconcile({ buildings: KEEP04_QA_LAYOUT.map(placement => building(placement, 'complete', 5)), selectedKind: null, draft: null, draftValid: true });
    const telemetry = scene.telemetry();
    expect(telemetry.fallback).toBe('none');
    expect(telemetry.drawCalls).toBeLessThanOrEqual(KEEP04_VISUAL_PROFILE.budgets[quality].draws);
    expect(telemetry.triangles).toBeLessThanOrEqual(KEEP04_VISUAL_PROFILE.budgets[quality].triangles);
    expect(telemetry.landscapeInstances).toBeGreaterThan(0); expect(telemetry.lifeActors).toBeGreaterThan(0);
    expect(telemetry.pickTargetCount).toBe(6);
  } finally { scene.dispose(); assets.staticPrefabs.forEach(prefab => prefab.root.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); })); }
});

it('animates ambient life only when asked and allowed, while reveals keep their existing contract', () => {
  const still = createKeep04Scene({ quality: 'high', reducedMotion: false, assets: empty() });
  const living = createKeep04Scene({ quality: 'high', reducedMotion: false, assets: empty(), ambient: true });
  const calm = createKeep04Scene({ quality: 'high', reducedMotion: true, assets: empty(), ambient: true });
  try {
    for (const scene of [still, living, calm]) scene.reconcile({ buildings: [], selectedKind: null, draft: null, draftValid: false });
    expect(still.update(1)).toBe(false);
    expect(living.update(1)).toBe(true);
    expect(living.update(2, false)).toBe(false); // The host's sleep window can pause decoration.
    expect(calm.update(1)).toBe(false);
  } finally { still.dispose(); living.dispose(); calm.dispose(); }
});

import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createGreaterRealmAtmosphere, GREATER_REALM_ATMOSPHERE_MAXIMUM_DRAW_CALLS, GREATER_REALM_ATMOSPHERE_MAXIMUM_INSTANCES } from '../src/greater-realm/greaterRealmAtmosphere';
import { createGreaterRealmJourneyLayer, type GreaterRealmJourney } from '../src/greater-realm/greaterRealmJourneyLayer';
import { greaterRealmBoatGeometry, greaterRealmGeometryBytes, greaterRealmRabbitGeometry, greaterRealmVillagerGeometry } from '../src/greater-realm/greaterRealmActorGeometry';
import { GREATER_REALM_HOST_DRAW_CALL_RESERVE } from '../src/components/realm/createGreaterRealmWorldCanvasHost';
import { gameplay04Journeys } from '../src/ptr/gameplay04/gameplay04Journeys';
import { createKeep04QaScenario } from '../src/dev/keep04QaScenarios';
import { axialToWorld } from '../src/game/map/hexCoordinates';
import { createGreaterRealmVoxelPrefabPlan } from '../src/components/realm/greaterRealmVoxelPresentation';

afterEach(() => vi.restoreAllMocks());

it('keeps the world actor byte estimates equal to the geometry actually uploaded', async () => {
  // The presentation plan budgets per-chunk uploads from these constants.
  const source = await import('node:fs').then(fs => fs.readFileSync('src/greater-realm/greaterRealmPresentationPlan.ts', 'utf8'));
  const runtime = await import('node:fs').then(fs => fs.readFileSync('src/greater-realm/createGreaterRealmSceneRuntime.ts', 'utf8'));
  const constant = (name: string) => Number(new RegExp(`${name}: ([0-9_]+),`).exec(source)![1].replaceAll('_', ''));
  for (const [name, make] of [['npc', greaterRealmVillagerGeometry], ['wildlife', greaterRealmRabbitGeometry], ['boat', greaterRealmBoatGeometry]] as const) {
    const geometry = make(); expect(greaterRealmGeometryBytes(geometry), name).toBe(constant(name)); geometry.dispose();
  }
  const boat = greaterRealmBoatGeometry();
  expect(Number(/GREATER_REALM_BOAT_GEOMETRY_UPLOAD_BYTES = ([0-9_]+);/.exec(runtime)![1].replaceAll('_', ''))).toBe(greaterRealmGeometryBytes(boat));
  // Hulls stay centred like the previous box hull, long axis on Z.
  boat.computeBoundingBox(); const size = boat.boundingBox!.getSize(new THREE.Vector3());
  expect(size.z).toBeGreaterThan(size.x); expect(boat.boundingBox!.min.y).toBeCloseTo(-.0225, 4); boat.dispose();
});

it('keeps the redesigned castle inside the 600-castle upload reserve with a pale masonry palette', () => {
  const castle = createGreaterRealmVoxelPrefabPlan({ kind: 'castle', graphicsProfile: 'balanced', cellSize: 1 });
  expect(castle.uploadBytes + 600 * (16 * 4 + 3 * 4)).toBeLessThanOrEqual(65_536);
  expect(castle.description).toBe('keep-four-towers-battlements');
});

it.each(['high', 'balanced', 'reduced'] as const)('frames the %s known world with a cloud sea and birds that never pick or move under reduced motion', profile => {
  const atmosphere = createGreaterRealmAtmosphere({ profile, reducedMotion: false });
  try {
    atmosphere.setFrame(30, -12, 60);
    expect(atmosphere.drawCalls()).toBeLessThanOrEqual(GREATER_REALM_ATMOSPHERE_MAXIMUM_DRAW_CALLS);
    expect(atmosphere.instanceCount()).toBeLessThanOrEqual(GREATER_REALM_ATMOSPHERE_MAXIMUM_INSTANCES);
    const clouds = atmosphere.group.getObjectByName('greater-realm-atmosphere-clouds') as THREE.InstancedMesh;
    const ray = new THREE.Raycaster(new THREE.Vector3(30, 50, -12), new THREE.Vector3(0, -1, 0)); const hits: THREE.Intersection[] = [];
    clouds.raycast(ray, hits); expect(hits).toHaveLength(0);
    // Low banks lie well below the land and beyond the returned window's centre.
    for (let i = 0; i < clouds.count; i++) {
      const matrix = new THREE.Matrix4(); clouds.getMatrixAt(i, matrix); const p = new THREE.Vector3().setFromMatrixPosition(matrix);
      expect(Math.hypot(p.x - 30, p.z + 12)).toBeGreaterThan(60 * .3);
    }
    expect(atmosphere.update(3)).toBe(true);
    atmosphere.configure(profile, true); expect(atmosphere.update(4)).toBe(false);
  } finally { atmosphere.dispose(); atmosphere.dispose(); }
  expect(atmosphere.drawCalls()).toBe(0); expect(atmosphere.group.children).toHaveLength(0);
  expect(GREATER_REALM_HOST_DRAW_CALL_RESERVE).toBeGreaterThanOrEqual(6 + GREATER_REALM_ATMOSPHERE_MAXIMUM_DRAW_CALLS);
});

const route = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }];
const journey = (overrides: Partial<GreaterRealmJourney>): GreaterRealmJourney => ({
  ordinal: 0, phase: 'outbound', resource: 'wood', route, dispatchedAtMs: 0, arrivesAtMs: 30_000, gatheringStopsAtMs: 90_000, returnsAtMs: 120_000, recalledAtMs: null, ...overrides,
});
function walker(layer: ReturnType<typeof createGreaterRealmJourneyLayer>) {
  const walkers = layer.group.getObjectByName('greater-realm-own-journey-workers') as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4(); walkers.getMatrixAt(0, matrix); return new THREE.Vector3().setFromMatrixPosition(matrix);
}

it('walks an own Worker out, works at the site, turns back after a recall and returns with cargo', () => {
  const layer = createGreaterRealmJourneyLayer({ reducedMotion: () => true });
  const start = axialToWorld(route[0], 1); const end = axialToWorld(route.at(-1)!, 1);
  try {
    vi.spyOn(Date, 'now').mockReturnValue(15_000);
    layer.setJourneys([journey({})], () => 0);
    expect(walker(layer).x).toBeCloseTo((start.x + end.x) / 2, 1);
    layer.update(30_000); expect(walker(layer).x).toBeCloseTo(end.x, 3);
    layer.setJourneys([journey({ phase: 'gathering' })], () => 0); layer.update(60_000);
    expect(walker(layer).x).toBeCloseTo(end.x, 3);
    layer.setJourneys([journey({ phase: 'returning' })], () => 0);
    layer.update(105_000); expect(walker(layer).x).toBeCloseTo((start.x + end.x) / 2, 1);
    layer.update(120_000); expect(walker(layer).x).toBeCloseTo(start.x, 3);
    // Recalled a third of the way out: the return starts from that point, not the site.
    layer.setJourneys([journey({ phase: 'returning', recalledAtMs: 10_000, gatheringStopsAtMs: 10_000, returnsAtMs: 20_000 })], () => 0);
    layer.update(10_000); expect(walker(layer).x).toBeCloseTo(start.x + (end.x - start.x) / 3, 1);
    const cargo = layer.group.getObjectByName('greater-realm-own-journey-cargo') as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4(); cargo.getMatrixAt(0, matrix); expect(new THREE.Vector3().setFromMatrixScale(matrix).x).toBe(1);
    expect(layer.drawCalls()).toBe(3); expect(layer.instanceCount()).toBe(2);
  } finally { layer.dispose(); }
  expect(layer.drawCalls()).toBe(0);
});

it('skips route cells outside the returned window and draws nothing for a journey it cannot ground', () => {
  const layer = createGreaterRealmJourneyLayer({ reducedMotion: () => true });
  try {
    layer.setJourneys([journey({})], q => (q < 2 ? .4 : undefined));
    expect(layer.drawCalls()).toBe(3);
    layer.setJourneys([journey({})], () => undefined);
    expect(layer.drawCalls()).toBe(0); expect(layer.instanceCount()).toBe(0);
  } finally { layer.dispose(); }
});

it('derives journeys from the validated keep state with captured times only', () => {
  const scenario = createKeep04QaScenario('living-keep', 1_800_000_000_000);
  const journeys = gameplay04Journeys(scenario.snapshot.view);
  expect(journeys.map(entry => [entry.ordinal, entry.phase, entry.resource])).toEqual([[0, 'outbound', 'wood'], [1, 'gathering', 'food'], [2, 'returning', 'stone']]);
  for (const entry of journeys) {
    expect(Object.keys(entry).sort()).toEqual(['arrivesAtMs', 'dispatchedAtMs', 'gatheringStopsAtMs', 'ordinal', 'phase', 'recalledAtMs', 'resource', 'returnsAtMs', 'route']);
    expect(entry.dispatchedAtMs).toBeLessThanOrEqual(entry.arrivesAtMs);
    expect(entry.arrivesAtMs).toBeLessThanOrEqual(entry.gatheringStopsAtMs);
    expect(entry.gatheringStopsAtMs).toBeLessThanOrEqual(entry.returnsAtMs);
    expect(entry.route[0]).toEqual({ q: 0, r: 0 });
  }
  expect(gameplay04Journeys(null)).toEqual([]);
});

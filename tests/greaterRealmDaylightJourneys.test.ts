import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createGreaterRealmAtmosphere, GREATER_REALM_ATMOSPHERE_MAXIMUM_DRAW_CALLS, GREATER_REALM_ATMOSPHERE_MAXIMUM_INSTANCES } from '../src/greater-realm/greaterRealmAtmosphere';
import { createGreaterRealmJourneyLayer, type GreaterRealmJourney } from '../src/greater-realm/greaterRealmJourneyLayer';
import { greaterRealmBoatGeometry, greaterRealmGeometryBytes, greaterRealmRabbitGeometry, greaterRealmVillagerGeometry } from '../src/greater-realm/greaterRealmActorGeometry';
import { GREATER_REALM_HOST_DRAW_CALL_RESERVE, GREATER_REALM_HOST_UPLOAD_RESERVE_BYTES } from '../src/components/realm/createGreaterRealmWorldCanvasHost';
import { gameplay04Journeys } from '../src/ptr/gameplay04/gameplay04Journeys';
import { keep04WorkerVisuals } from '../src/components/keep04/Keep04Screen';
import { decodeState04 } from '../src/ptr/gameplay04/gameplay04State';
import { presentState04 } from '../src/ptr/gameplay04/gameplay04Presentation';
import { observeJourney04, recallJourney04, type Journey04 } from '../spacetimedb/gameplay04/workerJourney';
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
  const layer = createGreaterRealmJourneyLayer({ reducedMotion: () => true, maximumUploadBytes: GREATER_REALM_HOST_UPLOAD_RESERVE_BYTES });
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
    layer.setJourneys([journey({ phase: 'returning', resource: null, recalledAtMs: 10_000, gatheringStopsAtMs: 10_000, returnsAtMs: 20_000 })], () => 0);
    layer.update(10_000); expect(walker(layer).x).toBeCloseTo(start.x + (end.x - start.x) / 3, 1);
    const cargo = layer.group.getObjectByName('greater-realm-own-journey-cargo') as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4(); cargo.getMatrixAt(0, matrix); expect(new THREE.Vector3().setFromMatrixScale(matrix).x).toBe(0);
    layer.setJourneys([journey({ phase: 'returning', recalledAtMs: 60_000, gatheringStopsAtMs: 60_000, returnsAtMs: 90_000 })], () => 0);
    layer.update(60_000); cargo.getMatrixAt(0, matrix); expect(new THREE.Vector3().setFromMatrixScale(matrix).x).toBe(1);
    expect(layer.drawCalls()).toBe(3); expect(layer.instanceCount()).toBe(2);
  } finally { layer.dispose(); }
  expect(layer.drawCalls()).toBe(0);
});

it('skips route cells outside the returned window and draws nothing for a journey it cannot ground', () => {
  const layer = createGreaterRealmJourneyLayer({ reducedMotion: () => true, maximumUploadBytes: GREATER_REALM_HOST_UPLOAD_RESERVE_BYTES });
  try {
    vi.spyOn(Date, 'now').mockReturnValue(5_000);
    layer.setJourneys([journey({})], q => (q < 2 ? .4 : undefined));
    expect(layer.drawCalls()).toBe(3);
    expect(walker(layer).x).toBeCloseTo(axialToWorld({ q: .5, r: 0 }, 1).x, 3);
    const trail = layer.group.getObjectByName('greater-realm-own-journey-trails') as THREE.Mesh;
    expect(trail.geometry.getAttribute('position').count).toBe(6); // One known edge, no invented destination ring.
    layer.update(15_000); expect(layer.instanceCount()).toBe(0); expect(layer.drawCalls()).toBe(1);
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

it('keeps captured route timing when only the destination end is returned', () => {
  const layer = createGreaterRealmJourneyLayer({ reducedMotion: () => true, maximumUploadBytes: GREATER_REALM_HOST_UPLOAD_RESERVE_BYTES });
  try {
    vi.spyOn(Date, 'now').mockReturnValue(0);
    layer.setJourneys([journey({})], q => q >= 2 ? .7 : undefined);
    expect(layer.instanceCount()).toBe(0);
    layer.update(25_000);
    expect(layer.instanceCount()).toBe(2);
    expect(walker(layer).x).toBeCloseTo(axialToWorld({ q: 2.5, r: 0 }, 1).x, 3);
    expect(walker(layer).y).toBeCloseTo(.76, 3);
  } finally { layer.dispose(); }
});

it('never bridges an unknown middle cell or moves an off-window Worker onto the trail', () => {
  const layer = createGreaterRealmJourneyLayer({ reducedMotion: () => true, maximumUploadBytes: GREATER_REALM_HOST_UPLOAD_RESERVE_BYTES });
  try {
    vi.spyOn(Date, 'now').mockReturnValue(15_000);
    layer.setJourneys([journey({})], q => q === 0 || q === 3 ? 0 : undefined);
    const trail = layer.group.getObjectByName('greater-realm-own-journey-trails') as THREE.Mesh;
    expect(trail.geometry.getAttribute('position').count).toBe(36); // Actual destination ring only.
    expect(layer.instanceCount()).toBe(0);
    layer.update(0); expect(layer.instanceCount()).toBe(2); expect(walker(layer).x).toBeCloseTo(axialToWorld(route[0], 1).x, 3);
    layer.update(30_000); expect(layer.instanceCount()).toBe(2); expect(walker(layer).x).toBeCloseTo(axialToWorld(route[3], 1).x, 3);
  } finally { layer.dispose(); }
});

it('positions travel by horizontal captured route distance without slope-dependent speed', () => {
  const layer = createGreaterRealmJourneyLayer({ reducedMotion: () => true, maximumUploadBytes: GREATER_REALM_HOST_UPLOAD_RESERVE_BYTES });
  try {
    vi.spyOn(Date, 'now').mockReturnValue(15_000);
    layer.setJourneys([journey({})], q => q === 3 ? 10 : 0);
    expect(walker(layer).x).toBeCloseTo(axialToWorld({ q: 1.5, r: 0 }, 1).x, 3);
  } finally { layer.dispose(); }
});

it('projects empty outbound and sub-quantum recalls without inventing cargo', () => {
  const nowMs = 1_800_000_000_000; const now = BigInt(nowMs) * 1000n;
  const view = createKeep04QaScenario('living-keep', nowMs).snapshot.view!;
  const workers = view.state.workers.map(worker => {
    if (worker.ordinal === 3) return worker;
    const assignment = worker.assignment!; const travel = BigInt(assignment.routeEdges) * assignment.travelPerEdgeMicros;
    const dispatchedAt = worker.ordinal === 0 ? now - 5_000_000n
      : now - travel - (worker.ordinal === 1 ? 5_000_000n : 30_000_000n);
    const recalledAt = now - (worker.ordinal === 0 ? 1_000_000n : worker.ordinal === 1 ? 4_000_000n : 10_000_000n);
    const confirmed = recallJourney04({ resource: assignment.resource as Journey04['resource'], dispatchedAt,
      routeEdges: assignment.routeEdges, travelPerEdgeMicros: assignment.travelPerEdgeMicros,
      gatheringDurationMicros: assignment.gatheringDurationMicros, yieldPerQuantum: assignment.yieldPerQuantum,
      recalledAt: null }, recalledAt);
    const observed = observeJourney04(confirmed, now);
    if (observed.phase !== 'returning') throw new Error('Recall fixture must still be returning.');
    return { ...worker, assignment: { ...assignment, dispatchedAt, recalledAt,
      phase: observed.phase, arrivesAt: observed.arrivesAt, gatheringStopsAt: observed.gatheringStopsAt,
      returnsAt: observed.returnsAt, earned: observed.earned } };
  });
  const state = decodeState04({ ...view.state, workers }, { generation: 0,
    databaseIdentity: 'synthetic-local-qa-not-an-identity', anchorQ: 0, anchorR: 0 });
  expect(state.workers.slice(0, 2).map(worker => worker.assignment!.earned)).toEqual([0n, 0n]);
  expect(state.workers[2].assignment!.earned).toBeGreaterThan(0n);
  expect(state.workers[0].assignment!.recalledAt!).toBeLessThan(state.workers[0].assignment!.arrivesAt);
  expect(state.workers[1].assignment!.recalledAt!).toBeGreaterThan(state.workers[1].assignment!.arrivesAt);
  const presented = presentState04(state, null, nowMs);
  const projected = gameplay04Journeys(presented);
  expect(projected.map(entry => entry.resource)).toEqual([null, null, 'stone']);
  expect(keep04WorkerVisuals(presented).map(entry => entry.resource)).toEqual([null, null, 'stone', null]);
  for (const entry of projected) expect(Object.keys(entry).sort()).toEqual(['arrivesAtMs', 'dispatchedAtMs', 'gatheringStopsAtMs', 'ordinal', 'phase', 'recalledAtMs', 'resource', 'returnsAtMs', 'route']);
  const layer = createGreaterRealmJourneyLayer({ reducedMotion: () => true, maximumUploadBytes: GREATER_REALM_HOST_UPLOAD_RESERVE_BYTES });
  try {
    vi.spyOn(Date, 'now').mockReturnValue(nowMs);
    layer.setJourneys(projected, () => 0);
    const cargo = layer.group.getObjectByName('greater-realm-own-journey-cargo') as THREE.InstancedMesh;
    expect(cargo.count).toBe(3);
    const matrix = new THREE.Matrix4();
    for (const index of [0, 1]) { cargo.getMatrixAt(index, matrix); expect(matrix.getMaxScaleOnAxis()).toBe(0); }
    cargo.getMatrixAt(2, matrix); expect(matrix.getMaxScaleOnAxis()).toBe(1);
  } finally { layer.dispose(); }
});

// GPU transfer boundary: only rendered visible meshes invoke Three's actual
// upload acknowledgement; this test does not create an independent render loop.
function transferLayer(group: THREE.Group) {
  let bytes = 0;
  if (!group.visible) return bytes;
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    if (object instanceof THREE.InstancedMesh && object.count === 0) return;
    const attributes = Object.values(object.geometry.attributes) as THREE.BufferAttribute[];
    if (object.geometry.index) attributes.push(object.geometry.index);
    if (object instanceof THREE.InstancedMesh) { attributes.push(object.instanceMatrix); if (object.instanceColor) attributes.push(object.instanceColor); }
    for (const attribute of attributes) { bytes += attribute.array.byteLength; attribute.onUploadCallback(); }
  });
  return bytes;
}

it('admits first sky arrays, defers them intact, and acknowledges transfers only after rendering', () => {
  const sky = createGreaterRealmAtmosphere({ profile: 'high', reducedMotion: false });
  try {
    expect(sky.prepareForUpload(0)).toBe(0); expect(sky.group.visible).toBe(false);
    expect(sky.drawCalls()).toBe(0); expect(sky.instanceCount()).toBe(0); expect(transferLayer(sky.group)).toBe(0);
    expect(sky.consumePendingUploadBytes()).toBe(0);
    expect(sky.prepareForUpload(sky.maximumUploadBytes)).toBe(sky.maximumUploadBytes);
    expect(transferLayer(sky.group)).toBe(sky.maximumUploadBytes);
    expect(sky.consumePendingUploadBytes()).toBe(sky.maximumUploadBytes);
    expect(sky.consumePendingUploadBytes()).toBe(0);
    sky.update(1); const dynamic = (sky.group.getObjectByName('greater-realm-atmosphere-clouds') as THREE.InstancedMesh).instanceMatrix.array.byteLength
      + (sky.group.getObjectByName('greater-realm-atmosphere-birds') as THREE.InstancedMesh).instanceMatrix.array.byteLength;
    expect(sky.prepareForUpload(dynamic - 1)).toBe(0); expect(sky.consumePendingUploadBytes()).toBe(0);
    expect(sky.prepareForUpload(dynamic)).toBe(dynamic);
    // A real GPU only reuploads dirty versions; acknowledge just those matrices.
    for (const name of ['greater-realm-atmosphere-clouds', 'greater-realm-atmosphere-birds']) (sky.group.getObjectByName(name) as THREE.InstancedMesh).instanceMatrix.onUploadCallback();
    expect(sky.consumePendingUploadBytes()).toBe(dynamic);
    sky.invalidateUploads(); expect(sky.prepareForUpload(sky.maximumUploadBytes)).toBe(sky.maximumUploadBytes);
  } finally { sky.dispose(); }
});

it('bounds long decorative trails while preserving full-route worker progress and pending geometry', () => {
  const limit = GREATER_REALM_HOST_UPLOAD_RESERVE_BYTES;
  const layer = createGreaterRealmJourneyLayer({ reducedMotion: () => true, maximumUploadBytes: limit });
  try {
    vi.spyOn(Date, 'now').mockReturnValue(15_000);
    const long = Array.from({ length: 8193 }, (_, q) => ({ q, r: 0 }));
    layer.setJourneys([journey({ route: long })], () => 0);
    expect(walker(layer).x).toBeCloseTo(axialToWorld({ q: 4096, r: 0 }, 1).x, 1);
    const admitted = layer.prepareForUpload(limit); expect(admitted).toBeGreaterThan(0); expect(admitted).toBeLessThanOrEqual(limit);
    expect(transferLayer(layer.group)).toBe(admitted); expect(layer.consumePendingUploadBytes()).toBe(admitted);
    layer.update(16_000); expect(layer.prepareForUpload(0)).toBe(0); expect(layer.drawCalls()).toBe(0); expect(layer.instanceCount()).toBe(0);
    expect(layer.consumePendingUploadBytes()).toBe(0);
    expect(layer.prepareForUpload(limit)).toBeGreaterThan(0); expect(layer.drawCalls()).toBe(3);
    layer.invalidateUploads(); expect(layer.prepareForUpload(limit)).toBeLessThanOrEqual(limit);
  } finally { layer.dispose(); }
});

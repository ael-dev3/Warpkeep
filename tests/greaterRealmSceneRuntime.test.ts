import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import { GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE } from '../src/dev/greaterRealmSyntheticTierOneFixture';
import { createGreaterRealmSceneRuntime } from '../src/greater-realm/createGreaterRealmSceneRuntime';
import { GREATER_REALM_CASTLE_UPLOAD_RESERVE_BYTES } from '../src/components/realm/createGreaterRealmWorldCanvasHost';
import { createGreaterRealmChunkPresentationPlan } from '../src/greater-realm/greaterRealmPresentationPlan';
import {
  GREATER_REALM_AMBIENCE_CLASS,
  GREATER_REALM_FEATURE_CLASS,
  GREATER_REALM_HYDRO_REGIME,
  GREATER_REALM_TRAVEL_CLASS,
  decodeGreaterRealmChunkDto
} from '../src/greater-realm/greaterRealmPublicContract';
import { GREATER_REALM_GRAPHICS_BUDGETS } from '../src/greater-realm/greaterRealmRuntimePolicy';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function handle(ordinal: number) {
  let value = ordinal;
  let encoded = '';
  do {
    encoded = BASE32[value % 32]! + encoded;
    value = Math.trunc(value / 32);
  } while (value > 0);
  return `GRK-${encoded.padStart(26, 'A')}`;
}

function viewChunks() {
  return GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks.map((chunk, index) => ({
    chunk,
    distanceChunks: index
  }));
}

function shiftedChunk(ordinal: number) {
  const raw = structuredClone(
    GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks[ordinal % 2]
  ) as any;
  const nextHandle = handle(100 + ordinal);
  const shift = ordinal * 20;
  const cellKeys = new Map<string, string>();
  raw.chunkHandle = nextHandle;
  for (const cell of [...raw.coreCells, ...raw.apronCells]) {
    const previous = cell.cellKey;
    cell.atlasQ += shift;
    cell.cellKey = `T1_LOWLANDS:${cell.atlasQ}:${cell.atlasR}`;
    cellKeys.set(previous, cell.cellKey);
  }
  raw.coreCells.forEach((cell: any) => { cell.chunkHandle = nextHandle; });
  raw.resourceLocations.forEach((location: any, index: number) => {
    location.atlasQ += shift;
    location.cellKey = cellKeys.get(location.cellKey) ?? location.cellKey;
    location.locationId = `GRL-${BASE32[(ordinal * 2 + index) % 32]!.repeat(26)}`;
  });
  return decodeGreaterRealmChunkDto(raw);
}

function oceanChunk(ordinal: number) {
  const base = GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks[1].coreCells[4]!;
  const chunkHandle = handle(500 + ordinal);
  const apronOwner = handle(700 + ordinal);
  const cells = Array.from({ length: 243 }, (_, index) => {
    const atlasQ = ordinal * 1_000 + index % 25;
    const atlasR = Math.trunc(index / 25);
    return {
      ...base,
      cellKey: `T1_LOWLANDS:${atlasQ}:${atlasR}`,
      chunkHandle: index < 225 ? chunkHandle : apronOwner,
      atlasQ,
      atlasR,
      travelClass: GREATER_REALM_TRAVEL_CLASS.NONE,
      ambienceClass: GREATER_REALM_AMBIENCE_CLASS.NONE,
      sealedBoundaryMask: 0,
      canopyBasisPoints: 0,
      groundcoverBasisPoints: 0,
      wildflowerBasisPoints: 0,
      presentationVariant: index
    };
  });
  return decodeGreaterRealmChunkDto({
    atlasId: base.regionId,
    revision: 1n,
    chunkHandle,
    lod: 0,
    sourceCellCount: 225,
    coreCells: cells.slice(0, 225),
    apronCells: cells.slice(225),
    resourceLocations: []
  });
}

function navigableLocalVesselChunk() {
  const raw = structuredClone(
    GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks[1]
  ) as any;
  const source = raw.coreCells.find((cell: any) => cell.atlasQ === 0 && cell.atlasR === 0);
  const destination = raw.coreCells.find((cell: any) => cell.atlasQ === 1 && cell.atlasR === 0);
  Object.assign(source, {
    elevation: -2_500,
    hydroSurfaceMilli: 750
  });
  source.hydroFlowDirection = 0;
  Object.assign(destination, {
    passable: true,
    elevation: -2_250,
    geologicalBarrierBand: 0,
    hydroRegime: GREATER_REALM_HYDRO_REGIME.RIVER,
    hydroBodyId: source.hydroBodyId,
    hydroDepthClass: 2,
    hydroSurfaceMilli: source.hydroSurfaceMilli,
    hydroFlowDirection: 0,
    flowAccumulation: 2_048n,
    wetness: 10_000,
    featureClass: GREATER_REALM_FEATURE_CLASS.LAMP_POST
  });
  return decodeGreaterRealmChunkDto(raw);
}

function missingAmbientDestinationChunk() {
  const raw = structuredClone(navigableLocalVesselChunk()) as any;
  const destination = raw.coreCells.find((cell: any) => (
    cell.atlasQ === 1 && cell.atlasR === 0
  ));
  destination.hydroDepthClass = 1;
  return decodeGreaterRealmChunkDto(raw);
}

function shiftedNavigableChunk(ordinal: number) {
  const raw = structuredClone(navigableLocalVesselChunk()) as any;
  const nextHandle = handle(800 + ordinal);
  const shift = ordinal * 20;
  const cellKeys = new Map<string, string>();
  raw.chunkHandle = nextHandle;
  for (const cell of [...raw.coreCells, ...raw.apronCells]) {
    const previous = cell.cellKey;
    cell.atlasQ += shift;
    cell.cellKey = `T1_LOWLANDS:${cell.atlasQ}:${cell.atlasR}`;
    cellKeys.set(previous, cell.cellKey);
  }
  raw.coreCells.forEach((cell: any) => { cell.chunkHandle = nextHandle; });
  raw.resourceLocations.forEach((location: any, index: number) => {
    location.atlasQ += shift;
    location.cellKey = cellKeys.get(location.cellKey) ?? location.cellKey;
    location.locationId = `GRL-${BASE32[(ordinal * 2 + index) % 32]!.repeat(26)}`;
  });
  return decodeGreaterRealmChunkDto(raw);
}

function ambientBoatMesh(runtime: ReturnType<typeof createGreaterRealmSceneRuntime>) {
  const mesh = runtime.group.getObjectByName('greater-realm-ambient-river-boats');
  expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
  return mesh as THREE.InstancedMesh;
}

function instancePosition(mesh: THREE.InstancedMesh, index = 0) {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  return new THREE.Vector3().setFromMatrixPosition(matrix);
}

function geometryUploadBytes(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  let bytes = 0;
  root.traverse((object) => {
    const renderable = object as THREE.Mesh;
    if (renderable.geometry instanceof THREE.BufferGeometry) {
      geometries.add(renderable.geometry);
    }
    if (object instanceof THREE.InstancedMesh) {
      bytes += object.instanceMatrix.array.byteLength;
      bytes += object.instanceColor?.array.byteLength ?? 0;
    }
  });
  geometries.forEach((geometry) => {
    Object.values(geometry.attributes).forEach((attribute) => {
      bytes += (attribute.array as ArrayBufferView).byteLength;
    });
    bytes += geometry.index
      ? (geometry.index.array as ArrayBufferView).byteLength
      : 0;
  });
  return bytes;
}

describe('Greater Realm scene runtime', () => {
  it('uploads bounded per-chunk resources and preserves explicit cell access', () => {
    const invalidate = vi.fn();
    const runtime = createGreaterRealmSceneRuntime({
      deviceClass: 'desktop',
      graphicsProfile: 'high',
      onInvalidate: invalidate
    });
    runtime.setView({ revision: 1n, cellSize: 1, chunks: viewChunks() });
    expect(runtime.flushUploads()).toBeLessThanOrEqual(
      GREATER_REALM_GRAPHICS_BUDGETS.high.maximumUploadsPerFrame
    );
    const telemetry = runtime.getTelemetry();
    expect(telemetry.uploadedChunkCount).toBe(2);
    expect(telemetry.drawCallCount).toBeLessThanOrEqual(
      GREATER_REALM_GRAPHICS_BUDGETS.high.maximumDrawCalls
    );
    expect(telemetry.instanceCount).toBeLessThanOrEqual(
      GREATER_REALM_GRAPHICS_BUDGETS.high.maximumSceneInstances
    );
    expect(telemetry.uploadBytesThisFrame).toBeLessThanOrEqual(
      telemetry.maximumUploadBytesPerFrame
    );
    expect(geometryUploadBytes(runtime.group)).toBeLessThanOrEqual(
      telemetry.uploadBytesThisFrame
    );
    expect(runtime.isCoordinatePassable({ atlasQ: 0, atlasR: 0 })).toBe(true);
    expect(runtime.isCoordinatePassable({ atlasQ: 2, atlasR: 2 })).toBe(false);
    expect(runtime.getCellAccess({ atlasQ: 2, atlasR: 2 })?.passable).toBe(false);
    expect(runtime.group.children.some((chunk) => (
      chunk.children.some((child) => child.name.startsWith('greater-realm-feature-waystone:'))
    ))).toBe(true);
    expect(runtime.group.children.some((chunk) => (
      chunk.children.some((child) => child.name.startsWith('greater-realm-feature-signpost:'))
    ))).toBe(true);
    expect(runtime.group.children.some((chunk) => (
      chunk.children.some((child) => child.name.startsWith('greater-realm-shoreline-fence:'))
    ))).toBe(true);
    expect(runtime.update(1.5)).toBe(true);
    expect(invalidate).toHaveBeenCalled();
    runtime.dispose();
    expect(runtime.group.children).toHaveLength(0);
  });

  it('drops resources on context loss and rebuilds only after restoration', () => {
    const runtime = createGreaterRealmSceneRuntime({
      deviceClass: 'desktop',
      graphicsProfile: 'high'
    });
    const canvas = document.createElement('canvas');
    runtime.bindCanvas(canvas);
    runtime.setView({ revision: 1n, cellSize: 1, chunks: viewChunks() });
    runtime.flushUploads();
    expect(runtime.getTelemetry().uploadedChunkCount).toBe(2);

    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(runtime.getTelemetry()).toMatchObject({
      contextLost: true,
      uploadedChunkCount: 0,
      pendingUploadCount: 2
    });
    expect(runtime.flushUploads()).toBe(0);

    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(runtime.getTelemetry().contextLost).toBe(false);
    runtime.flushUploads();
    expect(runtime.getTelemetry().uploadedChunkCount).toBe(2);
    runtime.dispose();
  });

  it('resolves a detached canvas loss when a fresh canvas is bound', () => {
    const runtime = createGreaterRealmSceneRuntime({
      deviceClass: 'desktop',
      graphicsProfile: 'high'
    });
    const lostCanvas = document.createElement('canvas');
    runtime.bindCanvas(lostCanvas);
    runtime.setView({ revision: 1n, cellSize: 1, chunks: viewChunks() });
    runtime.flushUploads();
    lostCanvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(runtime.getTelemetry()).toMatchObject({
      contextLost: true,
      uploadedChunkCount: 0,
      pendingUploadCount: 2
    });
    expect(runtime.update(2)).toBe(false);

    runtime.bindCanvas(document.createElement('canvas'));
    expect(runtime.getTelemetry().contextLost).toBe(false);
    expect(runtime.flushUploads()).toBe(2);
    expect(runtime.getTelemetry()).toMatchObject({
      uploadedChunkCount: 2,
      pendingUploadCount: 0
    });
    expect(runtime.update(2)).toBe(true);
    runtime.dispose();
  });

  it('turns moving water and ephemeral actors static under reduced motion', () => {
    const runtime = createGreaterRealmSceneRuntime({
      deviceClass: 'desktop',
      graphicsProfile: 'high',
      reducedMotion: true
    });
    runtime.setView({ revision: 1n, cellSize: 1, chunks: viewChunks() });
    runtime.flushUploads();
    expect(runtime.update(42)).toBe(false);
    expect(runtime.getTelemetry().reducedMotion).toBe(true);
    runtime.setReducedMotion(false);
    expect(runtime.update(42)).toBe(true);
    runtime.dispose();
  });

  it('moves bounded ambient boats only between returned river cells and keeps the helm local', () => {
    const runtime = createGreaterRealmSceneRuntime({
      deviceClass: 'desktop',
      graphicsProfile: 'balanced',
      localVesselOrigin: { atlasQ: 0, atlasR: 0 }
    });
    runtime.setView({
      revision: 1n,
      cellSize: 1,
      chunks: [{ chunk: navigableLocalVesselChunk(), distanceChunks: 0 }]
    });
    runtime.flushUploads();
    expect(runtime.group.children.some((chunk) => (
      chunk.children.some((child) => child.name.startsWith('greater-realm-feature-lamp-post:'))
    ))).toBe(true);
    expect(runtime.getTelemetry()).toMatchObject({
      ambientBoatCount: 1,
      localVesselCount: 0,
      boatCount: 1
    });
    const ambient = ambientBoatMesh(runtime);
    const ambientGeometry = ambient.geometry as THREE.BoxGeometry;
    expect(ambientGeometry.parameters.depth).toBeGreaterThan(
      ambientGeometry.parameters.width
    );
    expect(ambient.userData).toMatchObject({
      greaterRealmPresentationOnly: true,
      greaterRealmReturnedLaneCount: 1
    });
    const before = instancePosition(ambient);
    expect(runtime.update(8)).toBe(true);
    const after = instancePosition(ambient);
    expect(after.distanceTo(before)).toBeGreaterThan(0.01);
    const source = new THREE.Vector3();
    const destination = new THREE.Vector3();
    const plan = createGreaterRealmChunkPresentationPlan({
      chunk: navigableLocalVesselChunk(),
      graphicsProfile: 'balanced',
      cellSize: 1
    });
    const cells = new Map(plan.boatCells.map((cell) => [cell.coordinateKey, cell]));
    const sourceCell = cells.get('0,0')!;
    const destinationCell = cells.get('1,0')!;
    const waterPlane = 0.75 + 0.035;
    expect(sourceCell.position.y).toBeCloseTo(0.75 + 0.08, 8);
    expect(destinationCell.position.y).toBeCloseTo(0.75 + 0.08, 8);
    expect(sourceCell.position.y - (-2.5)).toBeGreaterThan(3);
    source.set(sourceCell.position.x, sourceCell.position.y, sourceCell.position.z);
    destination.set(
      destinationCell.position.x,
      destinationCell.position.y,
      destinationCell.position.z
    );
    expect(after.x).toBeGreaterThanOrEqual(Math.min(source.x, destination.x) - 1e-6);
    expect(after.x).toBeLessThanOrEqual(Math.max(source.x, destination.x) + 1e-6);
    expect(after.z).toBeGreaterThanOrEqual(Math.min(source.z, destination.z) - 1e-6);
    expect(after.z).toBeLessThanOrEqual(Math.max(source.z, destination.z) + 1e-6);
    expect(after.y - ambientGeometry.parameters.height / 2).toBeGreaterThan(waterPlane);
    expect(runtime.getLocalVesselState()).toMatchObject({
      status: 'available',
      persisted: false
    });
    expect(runtime.selectLocalVessel()).toMatchObject({
      status: 'selected',
      atlasQ: 0,
      atlasR: 0,
      persisted: false
    });
    expect(runtime.group.getObjectByName('greater-realm-local-player-vessel')).toBeDefined();
    expect(runtime.getTelemetry()).toMatchObject({
      ambientBoatCount: 1,
      localVesselCount: 1,
      boatCount: 2
    });
    expect(runtime.moveLocalVessel('forward')).toMatchObject({
      status: 'selected',
      atlasQ: 1,
      atlasR: 0
    });
    expect(runtime.moveLocalVessel('forward')).toMatchObject({
      status: 'blocked',
      atlasQ: 1,
      atlasR: 0,
      message: expect.stringContaining('not returned')
    });
    runtime.releaseLocalVessel();
    expect(runtime.getTelemetry()).toMatchObject({
      ambientBoatCount: 1,
      localVesselCount: 0,
      boatCount: 1
    });
    expect(runtime.group.getObjectByName('greater-realm-local-player-vessel')).toBeUndefined();
    runtime.dispose();
  });

  it('never creates ambient traffic across an unreturned deep-water endpoint', () => {
    const runtime = createGreaterRealmSceneRuntime({
      deviceClass: 'desktop',
      graphicsProfile: 'high'
    });
    runtime.setView({
      revision: 1n,
      cellSize: 1,
      chunks: [{ chunk: missingAmbientDestinationChunk(), distanceChunks: 0 }]
    });
    runtime.flushUploads();
    expect(runtime.getTelemetry()).toMatchObject({
      ambientBoatCount: 0,
      localVesselCount: 0,
      boatCount: 0
    });
    expect(runtime.group.getObjectByName('greater-realm-ambient-river-boats')).toBeUndefined();
    runtime.dispose();
  });

  it('holds ambient river boats static under reduced motion', () => {
    const runtime = createGreaterRealmSceneRuntime({
      deviceClass: 'mobile',
      graphicsProfile: 'reduced',
      reducedMotion: true
    });
    runtime.setView({
      revision: 1n,
      cellSize: 1,
      chunks: [{ chunk: navigableLocalVesselChunk(), distanceChunks: 0 }]
    });
    runtime.flushUploads();
    const ambient = ambientBoatMesh(runtime);
    const before = instancePosition(ambient);
    expect(runtime.update(42)).toBe(false);
    expect(instancePosition(ambient)).toEqual(before);
    runtime.setReducedMotion(false);
    expect(runtime.update(42)).toBe(true);
    expect(instancePosition(ambient).distanceTo(before)).toBeGreaterThan(0.01);
    runtime.dispose();
  });

  it('drops the ambient fleet on context loss and rebuilds it from returned lanes', () => {
    const runtime = createGreaterRealmSceneRuntime({
      deviceClass: 'desktop',
      graphicsProfile: 'balanced'
    });
    const canvas = document.createElement('canvas');
    runtime.bindCanvas(canvas);
    runtime.setView({
      revision: 1n,
      cellSize: 1,
      chunks: [{ chunk: navigableLocalVesselChunk(), distanceChunks: 0 }]
    });
    runtime.flushUploads();
    const original = ambientBoatMesh(runtime);
    const disposeGeometry = vi.spyOn(original.geometry, 'dispose');
    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(runtime.getTelemetry()).toMatchObject({
      contextLost: true,
      ambientBoatCount: 0
    });
    expect(runtime.group.getObjectByName('greater-realm-ambient-river-boats')).toBeUndefined();

    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(runtime.getTelemetry()).toMatchObject({
      contextLost: false,
      ambientBoatCount: 1
    });
    expect(ambientBoatMesh(runtime)).not.toBe(original);
    runtime.flushUploads();
    runtime.dispose();
    expect(runtime.group.children).toHaveLength(0);
  });

  it('caps the ambient fleet to the reviewed profile budget', () => {
    const runtime = createGreaterRealmSceneRuntime({
      deviceClass: 'mobile',
      graphicsProfile: 'reduced',
      localVesselOrigin: { atlasQ: 0, atlasR: 0 }
    });
    runtime.setView({
      revision: 1n,
      cellSize: 1,
      chunks: Array.from({ length: 10 }, (_, ordinal) => ({
        chunk: shiftedNavigableChunk(ordinal),
        distanceChunks: ordinal
      }))
    });
    const telemetry = runtime.getTelemetry();
    expect(telemetry.ambientBoatCount).toBe(
      GREATER_REALM_GRAPHICS_BUDGETS.reduced.boatCount - 1
    );
    expect(telemetry.localVesselCount).toBe(0);
    expect(telemetry.boatCount).toBeLessThanOrEqual(
      GREATER_REALM_GRAPHICS_BUDGETS.reduced.boatCount
    );
    expect(ambientBoatMesh(runtime).count).toBe(telemetry.ambientBoatCount);
    const ambient = ambientBoatMesh(runtime);
    const initialProgress = Array.from({ length: ambient.count }, (_, index) => {
      const xInAxialCells = instancePosition(ambient, index).x / Math.sqrt(3);
      return xInAxialCells - Math.floor(xInAxialCells / 20) * 20;
    });
    expect(Math.max(...initialProgress) - Math.min(...initialProgress)).toBeGreaterThan(0.5);
    expect(runtime.flushUploads()).toBeGreaterThan(0);
    expect(runtime.update(4)).toBe(true);
    const progressDeltas = Array.from({ length: ambient.count }, (_, index) => {
      const xInAxialCells = instancePosition(ambient, index).x / Math.sqrt(3);
      const progress = xInAxialCells - Math.floor(xInAxialCells / 20) * 20;
      return progress - initialProgress[index]!;
    });
    expect(Math.max(...progressDeltas) - Math.min(...progressDeltas)).toBeGreaterThan(0.25);
    expect(runtime.selectLocalVessel().status).toBe('selected');
    expect(runtime.getTelemetry()).toMatchObject({
      ambientBoatCount: GREATER_REALM_GRAPHICS_BUDGETS.reduced.boatCount - 1,
      localVesselCount: 1,
      boatCount: GREATER_REALM_GRAPHICS_BUDGETS.reduced.boatCount
    });
    runtime.dispose();
    expect(runtime.group.children).toHaveLength(0);
  });

  it('caps a large requested view before allocation on Reduced', () => {
    const runtime = createGreaterRealmSceneRuntime({
      deviceClass: 'mobile',
      graphicsProfile: 'reduced'
    });
    const chunks = Array.from({ length: 15 }, (_, ordinal) => ({
      chunk: shiftedChunk(ordinal),
      distanceChunks: ordinal
    }));
    runtime.setView({ revision: 1n, cellSize: 1, chunks });
    const beforeUpload = runtime.getTelemetry();
    expect(beforeUpload.selectedChunkCount).toBeLessThanOrEqual(
      GREATER_REALM_GRAPHICS_BUDGETS.reduced.maximumVisibleChunks
    );
    expect(beforeUpload.skippedByBudgetCount).toBeGreaterThan(0);
    let guard = 0;
    while (runtime.getTelemetry().pendingUploadCount > 0 && guard < 20) {
      guard += 1;
      expect(runtime.flushUploads()).toBeLessThanOrEqual(1);
      expect(runtime.getTelemetry().uploadBytesThisFrame).toBeLessThanOrEqual(196_608);
    }
    expect(runtime.getTelemetry().pendingUploadCount).toBe(0);
    expect(runtime.getTelemetry().flowerCount).toBe(0);
    expect(runtime.getTelemetry().flowerGeometryBytes).toBe(0);
    runtime.dispose();
  });

  it('accounts every GPU buffer before a 2x243-ocean Balanced upload', () => {
    const runtime = createGreaterRealmSceneRuntime({
      deviceClass: 'desktop',
      graphicsProfile: 'balanced'
    });
    const oceanChunks = [oceanChunk(0), oceanChunk(1)];
    const plans = oceanChunks.map((chunk) => createGreaterRealmChunkPresentationPlan({
      chunk,
      graphicsProfile: 'balanced',
      cellSize: 1
    }));
    expect(plans.map((plan) => plan.estimatedUploadBytes)).toEqual([262_440, 262_440]);
    expect(plans.reduce((total, plan) => total + plan.estimatedUploadBytes, 0)).toBe(524_880);
    expect(GREATER_REALM_GRAPHICS_BUDGETS.balanced.maximumUploadBytesPerFrame).toBe(524_288);

    const chunks = oceanChunks.map((chunk, index) => ({
      chunk,
      distanceChunks: index
    }));
    runtime.setView({ revision: 1n, cellSize: 1, chunks });
    expect(runtime.getTelemetry().pendingUploadCount).toBe(2);
    expect(runtime.flushUploads()).toBe(1);
    const firstFrame = runtime.getTelemetry();
    expect(firstFrame.uploadBytesThisFrame).toBe(262_440);
    expect(firstFrame.uploadBytesThisFrame).toBeLessThanOrEqual(524_288);
    expect(geometryUploadBytes(runtime.group)).toBeLessThanOrEqual(firstFrame.uploadBytesThisFrame);
    expect(runtime.getTelemetry().pendingUploadCount).toBe(1);
    expect(runtime.flushUploads()).toBe(1);
    expect(runtime.getTelemetry().uploadBytesThisFrame).toBeLessThanOrEqual(524_288);
    runtime.dispose();
  });

  it('reserves total-scene castle draw, instances, and upload bytes on Reduced', () => {
    const budget = GREATER_REALM_GRAPHICS_BUDGETS.reduced;
    const runtime = createGreaterRealmSceneRuntime({
      deviceClass: 'mobile',
      graphicsProfile: 'reduced',
      reservedDrawCalls: 1,
      reservedSceneInstances: 600,
      reservedUploadBytesPerFrame: GREATER_REALM_CASTLE_UPLOAD_RESERVE_BYTES
    });
    runtime.setView({ revision: 1n, cellSize: 1, chunks: viewChunks() });
    for (let frame = 0; frame < 10 && runtime.getTelemetry().pendingUploadCount > 0; frame += 1) {
      runtime.flushUploads();
    }
    const telemetry = runtime.getTelemetry();
    expect(telemetry.pendingUploadCount).toBe(0);
    expect(telemetry.drawCallCount + 1).toBeLessThanOrEqual(budget.maximumDrawCalls);
    expect(telemetry.instanceCount + 600).toBeLessThanOrEqual(
      budget.maximumSceneInstances
    );
    expect(telemetry.uploadBytesThisFrame + GREATER_REALM_CASTLE_UPLOAD_RESERVE_BYTES)
      .toBeLessThanOrEqual(budget.maximumUploadBytesPerFrame);
    runtime.dispose();
  });
});

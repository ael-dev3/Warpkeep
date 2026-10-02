import * as THREE from 'three';
import { axialToWorld } from '../game/map/hexCoordinates';
import { greaterRealmGeometryBytes, greaterRealmVillagerGeometry } from './greaterRealmActorGeometry';

// The player's own Worker journeys drawn on the 0.4 Greater Realm: each active
// route as a violet trail with a destination ring, and each Worker walking it
// according to the confirmed journey times (outbound, gathering at the site,
// returning with cargo). Presentation of already-validated keep state only:
// nothing here can dispatch, recall, select or change an outcome.

export type GreaterRealmJourney = Readonly<{
  ordinal: number;
  phase: 'outbound' | 'gathering' | 'returning';
  resource: 'food' | 'wood' | 'stone' | 'gold' | null;
  route: readonly Readonly<{ q: number; r: number }>[];
  dispatchedAtMs: number; arrivesAtMs: number; gatheringStopsAtMs: number; returnsAtMs: number;
  /** A recall during the outbound leg turns the Worker around part-way along the route. */
  recalledAtMs: number | null;
}>;

export const GREATER_REALM_JOURNEY_MAXIMUM_DRAW_CALLS = 3;
export const GREATER_REALM_JOURNEY_MAXIMUM_INSTANCES = 8;
const MAXIMUM_JOURNEYS = 4;
const CARGO_COLORS = Object.freeze({ food: '#d8b458', wood: '#8a5a3a', stone: '#aeb0a8', gold: '#ecc24a' });
const TRAIL_COLOR = new THREE.Color('#9d7fe0');

export type GreaterRealmJourneyLayer = Readonly<{
  group: THREE.Group;
  prepareForUpload: (availableBytes: number) => number;
  consumePendingUploadBytes: () => number;
  invalidateUploads: () => void;
  /** Replace the drawn journeys; `surfaceY` grounds route cells that are currently returned. */
  setJourneys: (journeys: readonly GreaterRealmJourney[], surfaceY: (q: number, r: number) => number | undefined) => void;
  update: (nowMs: number) => boolean;
  drawCalls: () => number;
  instanceCount: () => number;
  dispose: () => void;
}>;

type GroundedJourney = Readonly<{ journey: GreaterRealmJourney; points: readonly THREE.Vector3[]; known: readonly boolean[]; lengths: readonly number[]; total: number }>;

// Timing follows every server-captured horizontal route edge. A clipped window
// may hide that position; it must never compress the journey or invent terrain.
function pointAlong(grounded: GroundedJourney, fraction: number, target: THREE.Vector3, requireSurface = true): boolean {
  const distance = Math.max(0, Math.min(1, fraction)) * grounded.total;
  let travelled = 0;
  for (let i = 0; i < grounded.lengths.length; i++) {
    const length = grounded.lengths[i];
    if (travelled + length >= distance || i === grounded.lengths.length - 1) {
      const t = length === 0 ? 0 : Math.max(0, Math.min(1, (distance - travelled) / length));
      const visible = (t === 0 && grounded.known[i]) || (t === 1 && grounded.known[i + 1])
        || (grounded.known[i] && grounded.known[i + 1]);
      if (requireSurface && !visible) return false;
      target.copy(grounded.points[i]).lerp(grounded.points[i + 1], t);
      return true;
    }
    travelled += length;
  }
  const index = grounded.points.length - 1;
  if (index < 0 || (requireSurface && !grounded.known[index])) return false;
  target.copy(grounded.points[index]); return true;
}

export function createGreaterRealmJourneyLayer(options: Readonly<{ reducedMotion: () => boolean; maximumUploadBytes: number }>): GreaterRealmJourneyLayer {
  const group = new THREE.Group(); group.name = 'greater-realm-own-journeys';
  const trailMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, transparent: true, opacity: .85, depthWrite: false, fog: true });
  const walkerGeometry = greaterRealmVillagerGeometry();
  const walkerMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .8, fog: true });
  const cargoGeometry = new THREE.BoxGeometry(.09, .07, .09);
  const cargoMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .85, fog: true });
  const walkers = new THREE.InstancedMesh(walkerGeometry, walkerMaterial, MAXIMUM_JOURNEYS);
  const cargo = new THREE.InstancedMesh(cargoGeometry, cargoMaterial, MAXIMUM_JOURNEYS);
  walkers.name = 'greater-realm-own-journey-workers'; cargo.name = 'greater-realm-own-journey-cargo';
  for (const mesh of [walkers, cargo]) { mesh.count = 0; mesh.frustumCulled = false; mesh.raycast = () => {}; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(mesh); }
  let trail: THREE.Mesh | undefined; let grounded: GroundedJourney[] = []; let disposed = false;
  const matrix = new THREE.Matrix4(); const quaternion = new THREE.Quaternion(); const tint = new THREE.Color();
  const position = new THREE.Vector3(); const ahead = new THREE.Vector3(); const lifted = new THREE.Vector3(); const pack = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0); const walkerScale = new THREE.Vector3(1.35, 1.35, 1.35);
  const shown = new THREE.Vector3(1, 1, 1); const hidden = new THREE.Vector3(0, 0, 0);
  // The host supplies the remainder of its existing reservation after sky.
  // A long authoritative route keeps its full timing but cannot allocate an
  // unbounded decorative BufferGeometry. Each trail quad uploads two XYZ arrays.
  const fixedUploadBytes = greaterRealmGeometryBytes(walkerGeometry) + greaterRealmGeometryBytes(cargoGeometry)
    + walkers.instanceMatrix.array.byteLength + cargo.instanceMatrix.array.byteLength
    + MAXIMUM_JOURNEYS * 3 * Float32Array.BYTES_PER_ELEMENT * 2;
  if (!Number.isFinite(options.maximumUploadBytes) || options.maximumUploadBytes < fixedUploadBytes) {
    throw new RangeError('Greater Realm journey upload reservation cannot fit its actors.');
  }
  const maximumTrailQuads = Math.floor((options.maximumUploadBytes - fixedUploadBytes)
    / (6 * 3 * Float32Array.BYTES_PER_ELEMENT * 2));
  walkers.visible = cargo.visible = false;

  // These owned attributes acknowledge a transfer only when Three uploads it.
  // A hidden/deferred group retains every dirty version for a later frame.
  let uploadedVersions = new WeakMap<THREE.BufferAttribute, number>();
  const observedAttributes = new WeakSet<THREE.BufferAttribute>();
  let uploadedThisFrame = 0;
  const attributes = () => {
    const values: THREE.BufferAttribute[] = [];
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !object.visible) return;
      if (object instanceof THREE.InstancedMesh && object.count === 0) return;
      values.push(...Object.values(object.geometry.attributes) as THREE.BufferAttribute[]);
      if (object.geometry.index) values.push(object.geometry.index);
      if (object instanceof THREE.InstancedMesh) {
        values.push(object.instanceMatrix);
        if (object.instanceColor) values.push(object.instanceColor);
      }
    });
    return values;
  };
  const pendingUploadBytes = () => attributes().reduce((bytes, attribute) =>
    bytes + (uploadedVersions.get(attribute) === attribute.version ? 0 : attribute.array.byteLength), 0);
  const prepareForUpload = (availableBytes: number) => {
    const values = attributes();
    const pending = pendingUploadBytes();
    group.visible = Number.isFinite(availableBytes) && availableBytes >= pending;
    for (const attribute of values) {
      if (observedAttributes.has(attribute)) continue;
      observedAttributes.add(attribute);
      const previous = attribute.onUploadCallback;
      attribute.onUpload(() => {
        previous.call(attribute);
        if (disposed) return;
        uploadedVersions.set(attribute, attribute.version);
        uploadedThisFrame += attribute.array.byteLength;
      });
    }
    return group.visible ? pending : 0;
  };
  const consumePendingUploadBytes = () => {
    const value = uploadedThisFrame; uploadedThisFrame = 0; return value;
  };
  const invalidateUploads = () => { uploadedVersions = new WeakMap(); uploadedThisFrame = 0; };

  const rebuildTrail = () => {
    if (trail) { trail.removeFromParent(); trail.geometry.dispose(); trail = undefined; }
    const positions: number[] = []; const colors: number[] = []; let quads = 0;
    const quad = (a: THREE.Vector3, b: THREE.Vector3, width: number, shade: number) => {
      if (quads >= maximumTrailQuads) return;
      quads++;
      const dx = b.x - a.x; const dz = b.z - a.z; const length = Math.hypot(dx, dz) || 1;
      const nx = -dz / length * width; const nz = dx / length * width;
      const corners = [[a.x + nx, a.y, a.z + nz], [a.x - nx, a.y, a.z - nz], [b.x - nx, b.y, b.z - nz], [b.x + nx, b.y, b.z + nz]];
      // Counter-clockwise from above so the trail faces the sky.
      for (const index of [0, 2, 1, 0, 3, 2]) { positions.push(...corners[index]); colors.push(TRAIL_COLOR.r * shade, TRAIL_COLOR.g * shade, TRAIL_COLOR.b * shade); }
    };
    for (const entry of grounded) {
      // Destination ring: six short segments around the gathering site.
      if (!entry.known[entry.points.length - 1]) continue;
      const end = entry.points[entry.points.length - 1];
      for (let side = 0; side < 6; side++) {
        const a = side / 6 * Math.PI * 2; const b = (side + 1) / 6 * Math.PI * 2;
        quad(new THREE.Vector3(end.x + Math.sin(a) * .32, end.y, end.z + Math.cos(a) * .32), new THREE.Vector3(end.x + Math.sin(b) * .32, end.y, end.z + Math.cos(b) * .32), .03, 1.1);
      }
    }
    // Rings retain the real known destination even when decoration is clipped.
    // Duplicate routes/loops share an edge; no omitted cells are bridged.
    const edges = new Set<string>();
    for (const entry of grounded) {
      for (let i = 0; i < entry.points.length - 1 && quads < maximumTrailQuads; i++) {
        if (!entry.known[i] || !entry.known[i + 1]) continue;
        const a = entry.points[i]; const b = entry.points[i + 1];
        const key = [a.toArray().join(','), b.toArray().join(',')].sort().join('|');
        if (edges.has(key)) continue;
        edges.add(key); quad(a, b, .06, i % 2 === 0 ? 1 : .82);
      }
    }
    if (!positions.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    trail = new THREE.Mesh(geometry, trailMaterial); trail.name = 'greater-realm-own-journey-trails'; trail.raycast = () => {};
    trail.renderOrder = 1; trail.frustumCulled = false; group.add(trail);
  };
  const update = (nowMs: number) => {
    if (disposed) return false;
    let index = 0;
    for (const entry of grounded) {
      if (index >= MAXIMUM_JOURNEYS) break;
      const { journey } = entry;
      let fraction: number; let homeward = false;
      if (journey.phase === 'outbound') fraction = (nowMs - journey.dispatchedAtMs) / Math.max(1, journey.arrivesAtMs - journey.dispatchedAtMs);
      else if (journey.phase === 'gathering') fraction = 1;
      else {
        homeward = true;
        const turnedAt = journey.recalledAtMs !== null && journey.recalledAtMs < journey.arrivesAtMs
          ? (journey.recalledAtMs - journey.dispatchedAtMs) / Math.max(1, journey.arrivesAtMs - journey.dispatchedAtMs) : 1;
        fraction = Math.max(0, Math.min(1, turnedAt)) * (journey.returnsAtMs - nowMs) / Math.max(1, journey.returnsAtMs - journey.gatheringStopsAtMs);
      }
      fraction = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
      if (!pointAlong(entry, fraction, position)) continue;
      pointAlong(entry, Math.max(0, Math.min(1, fraction + (homeward ? -.02 : .02))), ahead, false);
      const yaw = Math.atan2(ahead.x - position.x, ahead.z - position.z) || 0;
      const working = journey.phase === 'gathering' && !options.reducedMotion();
      const bob = options.reducedMotion() ? 0 : working ? Math.max(0, Math.sin(nowMs / 160 + index)) * .04 : Math.abs(Math.sin(nowMs / 140 + index)) * .02;
      matrix.compose(lifted.set(position.x, position.y + bob, position.z), quaternion.setFromAxisAngle(up, yaw), walkerScale);
      walkers.setMatrixAt(index, matrix); walkers.setColorAt(index, tint.set('#c9b4ff'));
      // Cargo rides home on the Worker's back once gathering has begun.
      const carrying = journey.phase !== 'outbound' && journey.resource !== null;
      pack.set(position.x - Math.sin(yaw) * .07, position.y + .33 + bob, position.z - Math.cos(yaw) * .07);
      matrix.compose(pack, quaternion, carrying ? shown : hidden);
      cargo.setMatrixAt(index, matrix); cargo.setColorAt(index, tint.set(journey.resource === null ? '#ffffff' : CARGO_COLORS[journey.resource]));
      index++;
    }
    walkers.count = cargo.count = index;
    walkers.visible = cargo.visible = index > 0;
    walkers.instanceMatrix.needsUpdate = true; cargo.instanceMatrix.needsUpdate = true;
    if (walkers.instanceColor) walkers.instanceColor.needsUpdate = true; if (cargo.instanceColor) cargo.instanceColor.needsUpdate = true;
    return index > 0 && !options.reducedMotion();
  };
  return Object.freeze({
    group, prepareForUpload, consumePendingUploadBytes, invalidateUploads,
    setJourneys: (journeys, surfaceY) => {
      if (disposed) return;
      grounded = journeys.slice(0, MAXIMUM_JOURNEYS).flatMap(journey => {
        const points: THREE.Vector3[] = []; const known: boolean[] = [];
        for (const { q, r } of journey.route) {
          const y = surfaceY(q, r); const returned = y !== undefined && Number.isFinite(y);
          const world = axialToWorld({ q, r }, 1);
          // Unknown heights are never rendered; these coordinates retain only route distance.
          points.push(new THREE.Vector3(world.x, returned ? y + .06 : 0, world.z)); known.push(returned);
        }
        if (!known.some(Boolean)) return [];
        const lengths = points.slice(1).map((point, i) => Math.hypot(point.x - points[i].x, point.z - points[i].z));
        return [Object.freeze({ journey, points, known, lengths, total: lengths.reduce((sum, value) => sum + value, 0) || 1 })];
      });
      rebuildTrail(); update(Date.now());
    },
    update,
    drawCalls: () => disposed || !group.visible ? 0 : (trail ? 1 : 0) + (walkers.count ? 2 : 0),
    instanceCount: () => disposed || !group.visible ? 0 : walkers.count * 2,
    dispose: () => {
      if (disposed) return; disposed = true;
      if (trail) trail.geometry.dispose();
      walkers.dispose(); cargo.dispose(); walkerGeometry.dispose(); cargoGeometry.dispose();
      trailMaterial.dispose(); walkerMaterial.dispose(); cargoMaterial.dispose();
      invalidateUploads(); group.clear(); group.removeFromParent(); grounded = [];
    },
  });
}

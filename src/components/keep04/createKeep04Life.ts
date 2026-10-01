import * as THREE from 'three';
import type { Building04, Resource04 } from '../../../spacetimedb/gameplay04/policy';
import type { BuildingView04 } from '../../ptr/gameplay04/gameplay04Presentation';
import { KEEP04_FOOTPRINTS } from './createKeep04Buildings';
import type { Keep04Landscape } from './createKeep04Landscape';
import { planKeep04Walkways } from './keep04InnerPaths';
import { createKeep04Kit, KEEP04_LIFE_PALETTE as C } from './keep04ModelKit';
import {
  addBench, addLampPost, addObelisk, addPlanter, bannerGeometry, birdGeometry, boatGeometry, cargoGeometry, handcartGeometry,
  horseCartGeometry, sheepGeometry, smokePuffGeometry, villagerBodyGeometry, villagerHeadGeometry, warpCrystalGeometry,
} from './keep04Models';
import { keep04Random } from './keep04Random';
import { keep04RoadHeight, polylineLength, samplePolyline, type Point2 } from './keep04Terrain';
import type { Quality04 } from './keep04VisualProfile';

// Ambient life for the Verdant Citadel. Everything is presentation derived
// from validated keep state: villagers follow walkways to real building doors,
// the four Workers leave and return through the gate according to their
// confirmed journey phase, and a construction project gathers builders.
// Nothing here can select, place, command or change an outcome.

export type Keep04WorkerVisual = Readonly<{
  ordinal: number; phase: 'idle' | 'outbound' | 'gathering' | 'returning'; resource: Resource04 | null;
  /** Wall-clock milliseconds; outbound starts at dispatch, returning ends at the confirmed return time. */
  phaseStartedAtMs: number | null; phaseEndsAtMs: number | null;
}>;
export type Keep04LifeState = Readonly<{ buildings: readonly BuildingView04[]; workers: readonly Keep04WorkerVisual[] }>;

export type Keep04Life = Readonly<{
  group: THREE.Group;
  reconcile: (state: Keep04LifeState) => void;
  update: (elapsedSeconds: number) => boolean;
  actors: () => number;
  cost: () => Readonly<{ drawCalls: number; triangles: number }>;
  dispose: () => void;
}>;

const LIFE_LIMITS: Readonly<Record<Quality04, { people: number; inner: number; outer: number; farmers: number; sheep: number; birds: number; chimneys: number; carts: number; boats: number }>> = {
  high: { people: 64, inner: 18, outer: 22, farmers: 6, sheep: 9, birds: 18, chimneys: 22, carts: 3, boats: 2 },
  balanced: { people: 44, inner: 12, outer: 12, farmers: 4, sheep: 6, birds: 10, chimneys: 10, carts: 2, boats: 1 },
  reduced: { people: 28, inner: 8, outer: 6, farmers: 2, sheep: 4, birds: 0, chimneys: 0, carts: 1, boats: 0 },
};

const TUNICS = ['#5a7fa8', '#a8584e', '#6c8f4f', '#c9a14f', '#7f6aa8', '#4f8a86', '#b0745a', '#8a8f96', '#d8cfb8', '#9c6f9a'] as const;
const SKINS = ['#ffffff', '#f2dcc8', '#d4ad8f', '#a07a5e'] as const;
const WORKER_TUNIC = '#7b5cb5'; const BUILDER_TUNIC = '#c08a46'; const GUARD_TUNIC = '#5d4a8f';
export const KEEP04_CARGO_COLORS: Readonly<Record<Resource04, string>> = { food: '#d8b458', wood: '#8a5a3a', stone: '#aeb0a8', gold: '#ecc24a' };
const WALK_SPEED = 2.6; const WORKER_SPEED = 4.2;
/** Gate route for Workers: commons → spine → causeway → ramp foot → approach road. */
const GATE_ROUTE_HEAD: readonly Point2[] = [[0, 8], [0, 32], [0, 44], [0, 57.2]];

type Person = {
  role: 'walker' | 'worker' | 'builder' | 'guard' | 'farmer' | 'shepherd';
  route?: readonly Point2[]; length?: number; offset: number; speed: number; lateral: number;
  x?: number; z?: number; yaw?: number; tunic: string; skin: string;
  heightAt: (x: number, z: number) => number; worker?: Keep04WorkerVisual;
};

const pingPong = (value: number, length: number) => { const period = value % (length * 2); return period <= length ? period : length * 2 - period; };

/** Rendered height for actors on the plinth: deck, causeway pier and ramp. */
function plinthWalkHeight(x: number, z: number) {
  if (z <= 32.2) return .04;
  if (z <= 44) return .12;
  if (z <= 57.2) return .12 + (z - 44) / 13.2 * (-5.2 - .12) + .02;
  return keep04RoadHeight(x, z);
}

export function createKeep04Life(options: Readonly<{
  quality: Quality04; animate: boolean; landscape: Keep04Landscape | null; now?: () => number;
}>): Keep04Life {
  const { quality, landscape } = options; const limits = LIFE_LIMITS[quality]; const now = options.now ?? Date.now;
  const group = new THREE.Group(); group.name = 'keep04-life';
  const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>();
  let disposed = false; let people: Person[] = []; let state: Keep04LifeState = { buildings: [], workers: [] };
  let walkwayGeometry: THREE.BufferGeometry | null = null; let walkwayMesh: THREE.Mesh | null = null;
  const material = <T extends THREE.Material>(value: T) => { materials.add(value); return value; };
  const own = (geometry: THREE.BufferGeometry) => { geometries.add(geometry); return geometry; };
  const batch = (name: string, geometry: THREE.BufferGeometry, mat: THREE.Material, capacity: number, castShadow = false) => {
    const mesh = new THREE.InstancedMesh(own(geometry), mat, Math.max(1, capacity)); mesh.name = name; mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.raycast = () => {};
    mesh.castShadow = castShadow && quality === 'high'; mesh.receiveShadow = false; group.add(mesh); return mesh;
  };
  const dispose = () => {
    if (disposed) return; disposed = true;
    group.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
    geometries.forEach(geometry => geometry.dispose()); geometries.clear(); materials.forEach(value => value.dispose()); materials.clear();
    group.clear(); group.removeFromParent(); people = [];
  };
  try {
    const lit = material(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85, flatShading: true }));
    const bodies = batch('keep04-life-villager-bodies', villagerBodyGeometry(), lit, limits.people, true);
    const heads = batch('keep04-life-villager-heads', villagerHeadGeometry(), lit, limits.people, true);
    const carts = batch('keep04-life-worker-carts', handcartGeometry(), lit, 4);
    const cargo = batch('keep04-life-worker-cargo', cargoGeometry(), lit, 4);
    const sheep = landscape && limits.sheep ? batch('keep04-life-sheep', sheepGeometry(), lit, limits.sheep * landscape.emitters.pastures.length) : null;
    const birds = limits.birds ? batch('keep04-life-birds', birdGeometry(), material(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })), limits.birds) : null;
    const smoke = landscape && limits.chimneys ? batch('keep04-life-chimney-smoke', smokePuffGeometry(), material(new THREE.MeshLambertMaterial({
      vertexColors: true, transparent: true, opacity: .5, depthWrite: false, flatShading: true })), Math.min(limits.chimneys, landscape.emitters.chimneys.length) * 3) : null;
    const banners = landscape ? batch('keep04-life-banners', bannerGeometry(), material(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, side: THREE.DoubleSide })), landscape.emitters.banners.length) : null;
    const horseCarts = landscape && limits.carts ? batch('keep04-life-road-carts', horseCartGeometry(), lit, limits.carts) : null;
    const boats = landscape && limits.boats ? batch('keep04-life-river-boats', boatGeometry(), lit, limits.boats) : null;
    // Civic dressing on the reserved commons and spine (never placement space).
    const civic = createKeep04Kit();
    let crystal: THREE.Mesh;
    try {
      civic.push([0, .04, 2]); const crystalBase = addObelisk(civic); civic.pop();
      for (const z of [11, 17.5, 24, 30.5]) for (const x of [-2.65, 2.65]) addLampPost(civic, x, z);
      for (const side of [-1, 1]) {
        addBench(civic, side * 4.35, 2, side * Math.PI / 2 * -1);
        addPlanter(civic, side * 4.25, -2.25, 300 + side); addPlanter(civic, side * 4.25, 6.25, 310 + side);
      }
      const civicGeometry = civic.build()!; own(civicGeometry);
      const civicMesh = new THREE.Mesh(civicGeometry, lit); civicMesh.name = 'keep04-civic-dressing'; civicMesh.raycast = () => {};
      civicMesh.castShadow = quality === 'high'; civicMesh.receiveShadow = true; group.add(civicMesh);
      crystal = new THREE.Mesh(own(warpCrystalGeometry()), material(new THREE.MeshStandardMaterial({
        vertexColors: true, emissive: C.warpViolet, emissiveIntensity: .85, roughness: .25, metalness: .1, flatShading: true })));
      crystal.name = 'keep04-warp-crystal'; crystal.raycast = () => {}; crystal.position.set(0, .04 + crystalBase + .7, 2); group.add(crystal);
    } catch (error) { civic.dispose(); throw error; }
    const walkwayMaterial = material(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));

    // ---- Fixed outer population ----
    const random = keep04Random(9907);
    const outer: Person[] = [];
    if (landscape) {
      const stretches: Array<[number, number, number]> = [[0, 8, 120], [1, 4, 110], [2, 6, 120], [1, 150, 230], [0, 120, 200]];
      for (let i = 0; i < limits.outer; i++) {
        const [roadIndex, from, to] = stretches[i % stretches.length]; const road = landscape.roads[roadIndex];
        const start = random.range(from, to - 30); const span = random.range(24, 60);
        const total = polylineLength(road);
        const clipped = Math.min(total, start + span);
        const route: Point2[] = [];
        for (let d = start; d <= clipped; d += 4) { const p = samplePolyline(road, d); route.push([p.x, p.z]); }
        if (route.length < 2) continue;
        outer.push({ role: 'walker', route, length: polylineLength(route), offset: random.range(0, 200), speed: WALK_SPEED * random.range(.75, 1.15),
          lateral: random.range(-.9, .9), tunic: random.pick(TUNICS), skin: random.pick(SKINS), heightAt: keep04RoadHeight });
      }
      // Farmers working the nearer fields and shepherds by the pastures.
      const fieldSpots: Array<[number, number]> = [[-96, 66], [-88, -32], [-126, 30], [150, 40], [140, 84], [-62, 96]];
      for (let i = 0; i < limits.farmers; i++) {
        const [fx, fz] = fieldSpots[i % fieldSpots.length]; const x = fx + random.range(-7, 7); const z = fz + random.range(-5, 5);
        outer.push({ role: 'farmer', x, z, yaw: random.range(0, 6.28), offset: random.range(0, 10), speed: 1, lateral: 0, tunic: random.pick(TUNICS), skin: random.pick(SKINS), heightAt: landscape.heightAt });
      }
      for (const pasture of landscape.emitters.pastures) {
        outer.push({ role: 'shepherd', x: pasture.x + pasture.radius * .7, z: pasture.z - pasture.radius * .5, yaw: -2.2, offset: random.range(0, 10), speed: 1, lateral: 0,
          tunic: '#6c8f4f', skin: random.pick(SKINS), heightAt: landscape.heightAt });
      }
    }
    // Gate wardens stand inside the reserved gate approach, never on placement space.
    const guards: Person[] = [-1, 1].map(side => ({ role: 'guard', x: side * 3.4, z: 30.6, yaw: Math.PI * .02 * side, offset: side * 3, speed: 1, lateral: 0, tunic: GUARD_TUNIC, skin: SKINS[side < 0 ? 0 : 2], heightAt: () => .04 }));

    // ---- Instance writers ----
    const matrix = new THREE.Matrix4(); const quaternion = new THREE.Quaternion(); const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    const position = new THREE.Vector3(); const scale = new THREE.Vector3(1, 1, 1); const tint = new THREE.Color();
    let personIndex = 0; let cartIndex = 0;
    const writePerson = (x: number, y: number, z: number, yaw: number, pitch: number, tunic: string, skin: string) => {
      if (personIndex >= limits.people) return;
      euler.set(pitch, yaw, 0); matrix.compose(position.set(x, y, z), quaternion.setFromEuler(euler), scale.set(1, 1, 1));
      bodies.setMatrixAt(personIndex, matrix); heads.setMatrixAt(personIndex, matrix);
      bodies.setColorAt(personIndex, tint.set(tunic)); heads.setColorAt(personIndex, tint.set(skin)); personIndex++;
    };
    const writeCart = (x: number, y: number, z: number, yaw: number, resource: Resource04 | null) => {
      if (cartIndex >= 4) return;
      matrix.compose(position.set(x, y, z), quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw), scale.set(1, 1, 1));
      carts.setMatrixAt(cartIndex, matrix);
      cargo.setMatrixAt(cartIndex, resource ? matrix : matrix.clone().scale(new THREE.Vector3(0, 0, 0)));
      cargo.setColorAt(cartIndex, tint.set(resource ? KEEP04_CARGO_COLORS[resource] : '#000000')); cartIndex++;
    };
    const workerRoute: Point2[] = landscape ? [...GATE_ROUTE_HEAD, ...landscape.roads[0].slice(1)] : [...GATE_ROUTE_HEAD];
    const workerRouteLength = polylineLength(workerRoute);
    const workerHeight = (x: number, z: number) => plinthWalkHeight(x, z);
    function placeWalker(person: Person, time: number) {
      const route = person.route!; const length = person.length!;
      const travelled = pingPong(person.offset + time * person.speed, length);
      const sample = samplePolyline(route, travelled); const forward = Math.floor((person.offset + time * person.speed) / length) % 2 === 0;
      const yaw = forward ? sample.yaw : sample.yaw + Math.PI;
      const x = sample.x + Math.cos(sample.yaw) * person.lateral; const z = sample.z - Math.sin(sample.yaw) * person.lateral;
      writePerson(x, person.heightAt(x, z) + Math.abs(Math.sin(time * 7 + person.offset)) * .07, z, yaw, 0, person.tunic, person.skin);
    }
    function placeWorker(person: Person, time: number, wallClock: number) {
      const worker = person.worker!; const resource = worker.resource;
      if (worker.phase === 'idle' || worker.phase === 'gathering') {
        if (worker.phase === 'gathering') return;
        // Idle Workers wait in a tidy row at the front of the commons, carts beside them, facing the gate.
        const x = -3.75 + worker.ordinal * 2.5; const z = 6.1;
        writePerson(x, .04, z, Math.sin(time * .6 + worker.ordinal) * .3, 0, WORKER_TUNIC, SKINS[worker.ordinal % SKINS.length]);
        writeCart(x + .55, .04, z - 1.9, 0, null);
        return;
      }
      let distance: number;
      if (worker.phase === 'outbound') distance = worker.phaseStartedAtMs === null ? 0 : Math.max(0, (wallClock - worker.phaseStartedAtMs) / 1000 * WORKER_SPEED);
      else distance = worker.phaseEndsAtMs === null ? 0 : Math.max(0, (worker.phaseEndsAtMs - wallClock) / 1000 * WORKER_SPEED);
      if (distance >= workerRouteLength - 2) return; // Beyond the vale: on the Realm road.
      const sample = samplePolyline(workerRoute, distance); const heading = worker.phase === 'outbound' ? sample.yaw : sample.yaw + Math.PI;
      const lane = worker.phase === 'outbound' ? .9 : -.9;
      const x = sample.x + Math.cos(sample.yaw) * lane; const z = sample.z - Math.sin(sample.yaw) * lane; const y = workerHeight(x, z);
      writePerson(x, y + Math.abs(Math.sin(time * 8 + worker.ordinal)) * .06, z, heading, 0, WORKER_TUNIC, SKINS[worker.ordinal % SKINS.length]);
      writeCart(x + Math.sin(heading) * 1.7, workerHeight(x + Math.sin(heading) * 1.7, z + Math.cos(heading) * 1.7), z + Math.cos(heading) * 1.7, heading,
        worker.phase === 'returning' ? resource : null);
    }
    function rebuild() {
      const placements = state.buildings.map(building => building.placement);
      const walkways = planKeep04Walkways(placements);
      // Walkway ribbons: pale worn flagstones from each door to the civic network.
      walkwayMesh?.removeFromParent(); if (walkwayGeometry) { walkwayGeometry.dispose(); geometries.delete(walkwayGeometry); }
      walkwayGeometry = null; walkwayMesh = null;
      if (walkways.length) {
        const positions: number[] = []; const colors: number[] = []; const stone = new THREE.Color('#cfc7ad'); const worn = new THREE.Color('#b4a986');
        for (const walkway of walkways) for (let i = 0; i < walkway.points.length - 1; i++) {
          const [ax, az] = walkway.points[i]; const [bx, bz] = walkway.points[i + 1]; const length = Math.hypot(bx - ax, bz - az); if (length < .01) continue;
          const nx = -(bz - az) / length * .95; const nz = (bx - ax) / length * .95; const y = .03;
          const corners = [[ax + nx, az + nz], [ax - nx, az - nz], [bx - nx, bz - nz], [bx + nx, bz + nz]];
          // Extend each leg slightly past its joint so turns read as one path.
          const ex = (bx - ax) / length * .9; const ez = (bz - az) / length * .9;
          corners[0] = [corners[0][0] - ex, corners[0][1] - ez]; corners[1] = [corners[1][0] - ex, corners[1][1] - ez];
          corners[2] = [corners[2][0] + ex, corners[2][1] + ez]; corners[3] = [corners[3][0] + ex, corners[3][1] + ez];
          for (const index of [0, 2, 1, 0, 3, 2]) {
            const [x, z] = corners[index]; positions.push(x, y, z);
            tint.copy(stone).lerp(worn, (Math.sin(x * 1.7 + z * 2.3) + 1) * .3); colors.push(tint.r, tint.g, tint.b);
          }
        }
        if (positions.length) {
          walkwayGeometry = own(new THREE.BufferGeometry());
          walkwayGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          walkwayGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); walkwayGeometry.computeVertexNormals();
          walkwayMesh = new THREE.Mesh(walkwayGeometry, walkwayMaterial); walkwayMesh.name = 'keep04-life-walkways'; walkwayMesh.raycast = () => {};
          walkwayMesh.receiveShadow = true; group.add(walkwayMesh);
        }
      }
      // Inner population grows with the settled keep: a quiet empty keep, a busy mature one.
      const settled = state.buildings.filter(building => building.completedLevel > 0);
      const prosperity = settled.reduce((sum, building) => sum + building.completedLevel, 0);
      const innerCount = Math.min(limits.inner, 4 + settled.length * 2 + Math.floor(prosperity / 3));
      const innerRandom = keep04Random(1201 + prosperity * 7 + settled.length);
      const inner: Person[] = [];
      // Each walkway ends where it joins the civic network, spreading people around the commons.
      const routes: Point2[][] = walkways.map(walkway => walkway.points.map(point => [point[0], point[1]] as Point2));
      routes.push([[-1.6, 6.5], [-1.6, 30.5]], [[1.6, 30.5], [1.6, 6.5]], [[-4, -2.4], [4, -2.4], [4, 6.4], [-4, 6.4], [-4, -2.4]]);
      for (let i = 0; i < innerCount; i++) {
        const route = routes[i % routes.length];
        inner.push({ role: 'walker', route, length: polylineLength(route), offset: innerRandom.range(0, 120), speed: WALK_SPEED * innerRandom.range(.6, 1),
          lateral: innerRandom.range(-.5, .5), tunic: innerRandom.pick(TUNICS), skin: innerRandom.pick(SKINS), heightAt: () => .04 });
      }
      // Builders gather around an active project.
      const builders: Person[] = [];
      for (const building of state.buildings) {
        if (building.phase !== 'constructing') continue;
        const [w, d] = KEEP04_FOOTPRINTS[building.kind as Building04]; const x = Number(building.placement.x) / 1e6; const z = Number(building.placement.z) / 1e6;
        const swap = building.placement.rotation === 90_000 || building.placement.rotation === 270_000; const hx = (swap ? d : w) / 2 + .7; const hz = (swap ? w : d) / 2 + .7;
        for (const [bx, bz] of [[-hx, hz], [hx, hz * .2], [-hx * .3, -hz]] as const) {
          builders.push({ role: 'builder', x: x + bx, z: z + bz, yaw: Math.atan2(-bx, -bz), offset: bx * 3 + bz, speed: 1, lateral: 0, tunic: BUILDER_TUNIC, skin: innerRandom.pick(SKINS), heightAt: () => .04 });
        }
      }
      const workers: Person[] = state.workers.map(worker => ({ role: 'worker', worker, offset: worker.ordinal, speed: WORKER_SPEED, lateral: 0, tunic: WORKER_TUNIC, skin: SKINS[0], heightAt: workerHeight }));
      people = [...workers, ...builders, ...guards, ...inner, ...outer];
    }
    // Still scenes use one composed moment; animated scenes start from it.
    const stillTime = 7.3; let lifeTime = stillTime;
    function write(time: number) {
      personIndex = 0; cartIndex = 0;
      const wallClock = now();
      for (const person of people) {
        if (person.role === 'walker') placeWalker(person, time);
        else if (person.role === 'worker') placeWorker(person, time, wallClock);
        else {
          const work = person.role === 'builder' ? Math.max(0, Math.sin(time * 5.5 + person.offset)) * .35
            : person.role === 'farmer' ? (Math.sin(time * 1.4 + person.offset) * .5 + .5) * .5 : 0;
          const sway = person.role === 'guard' || person.role === 'shepherd' ? Math.sin(time * .5 + person.offset) * .2 : 0;
          writePerson(person.x!, person.heightAt(person.x!, person.z!), person.z!, person.yaw! + sway, work, person.tunic, person.skin);
        }
      }
      bodies.count = heads.count = personIndex; carts.count = cargo.count = cartIndex;
      for (const mesh of [bodies, heads, carts, cargo]) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
      if (landscape) {
        if (sheep) {
          let index = 0;
          landscape.emitters.pastures.forEach((pasture, p) => {
            for (let i = 0; i < limits.sheep; i++) {
              const seed = p * 31 + i * 7.3; const angle = seed + time * (.035 + (i % 3) * .01) * (i % 2 ? 1 : -1);
              const radius = pasture.radius * (.25 + .6 * (.5 + .5 * Math.sin(seed * 1.7 + time * .05)));
              const x = pasture.x + Math.sin(angle) * radius; const z = pasture.z + Math.cos(angle) * radius;
              const graze = Math.max(0, Math.sin(time * .9 + seed)) * .35;
              euler.set(graze, angle + (i % 2 ? Math.PI / 2 : -Math.PI / 2), 0);
              matrix.compose(position.set(x, landscape.heightAt(x, z), z), quaternion.setFromEuler(euler), scale.set(1, 1, 1));
              sheep.setMatrixAt(index++, matrix);
            }
          });
          sheep.count = index; sheep.instanceMatrix.needsUpdate = true;
        }
        if (birds) {
          const flocks: Array<[number, number, number]> = [[-70, -70, 30], [70, -105, 36], [120, 30, 28], [-150, -10, 32]];
          for (let i = 0; i < limits.birds; i++) {
            const [cx, cz, cy] = flocks[i % flocks.length]; const radius = 10 + (i * 7) % 15; const angle = time * (.32 + (i % 5) * .03) + i * 1.3;
            const x = cx + Math.cos(angle) * radius; const z = cz + Math.sin(angle) * radius;
            euler.set(0, -angle, Math.sin(angle) * .25);
            matrix.compose(position.set(x, cy + Math.sin(time * .7 + i) * 2, z), quaternion.setFromEuler(euler), scale.set(1, Math.cos(time * 9 + i * 1.7), 1));
            birds.setMatrixAt(i, matrix);
          }
          birds.count = limits.birds; birds.instanceMatrix.needsUpdate = true;
        }
        if (smoke) {
          const chimneys = landscape.emitters.chimneys.slice(0, limits.chimneys); let index = 0;
          chimneys.forEach((chimney, c) => {
            for (let puff = 0; puff < 3; puff++) {
              const life = ((time + c * 1.37) / 7 + puff / 3) % 1;
              const size = (.45 + 1.15 * life) * (life > .75 ? (1 - life) / .25 : 1);
              matrix.compose(position.set(chimney.x + life * 3.2, chimney.y + life * 6.5, chimney.z - life * 1.4), quaternion.identity(), scale.setScalar(Math.max(.001, size)));
              smoke.setMatrixAt(index++, matrix);
            }
          });
          smoke.count = index; smoke.instanceMatrix.needsUpdate = true;
        }
        if (banners) {
          landscape.emitters.banners.forEach((banner, i) => {
            euler.set(0, banner.yaw + Math.sin(time * 1.25 + i * 1.9) * .32, 0);
            matrix.compose(position.copy(banner.position), quaternion.setFromEuler(euler), scale.set(.88 + .12 * Math.sin(time * 3.6 + i), 1, 1));
            banners.setMatrixAt(i, matrix);
          });
          banners.count = landscape.emitters.banners.length; banners.instanceMatrix.needsUpdate = true;
        }
        if (horseCarts) {
          const runs: Array<[number, number, number]> = [[1, 20, 140], [0, 15, 150], [2, 18, 130]];
          for (let i = 0; i < limits.carts; i++) {
            const [roadIndex, from, to] = runs[i % runs.length]; const road = landscape.roads[roadIndex];
            const travelled = from + pingPong(time * 3 + i * 40, to - from); const sample = samplePolyline(road, travelled);
            const forward = Math.floor((time * 3 + i * 40) / (to - from)) % 2 === 0; const yaw = forward ? sample.yaw : sample.yaw + Math.PI;
            const lateral = forward ? -1 : 1; const x = sample.x + Math.cos(sample.yaw) * lateral; const z = sample.z - Math.sin(sample.yaw) * lateral;
            matrix.compose(position.set(x, keep04RoadHeight(x, z) + Math.abs(Math.sin(time * 6 + i)) * .05, z), quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw), scale.set(1, 1, 1));
            horseCarts.setMatrixAt(i, matrix);
          }
          horseCarts.count = limits.carts; horseCarts.instanceMatrix.needsUpdate = true;
        }
        if (boats) {
          const total = polylineLength(landscape.river);
          for (let i = 0; i < limits.boats; i++) {
            const span = total * .6; const travelled = total * .15 + pingPong(time * 1.6 + i * 90, span); const sample = samplePolyline(landscape.river, travelled);
            const forward = Math.floor((time * 1.6 + i * 90) / span) % 2 === 0; const yaw = forward ? sample.yaw : sample.yaw + Math.PI;
            matrix.compose(position.set(sample.x, -5.85 - .05 + Math.sin(time * 1.3 + i) * .05, sample.z), quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw), scale.set(1.2, 1.2, 1.2));
            boats.setMatrixAt(i, matrix);
          }
          boats.count = limits.boats; boats.instanceMatrix.needsUpdate = true;
        }
      }
      crystal.rotation.y = time * .8; crystal.position.y = .04 + 6.1 + .7 + Math.sin(time * 1.6) * .15;
    }
    let started: number | null = null;
    return Object.freeze({
      group,
      reconcile: next => {
        if (disposed) return;
        state = { buildings: next.buildings.map(building => building), workers: next.workers.map(worker => Object.freeze({ ...worker })) };
        rebuild();
        write(options.animate ? lifeTime : stillTime);
      },
      update: elapsed => {
        if (disposed || !options.animate) return false;
        if (started === null) started = elapsed;
        lifeTime = elapsed - started + stillTime;
        write(lifeTime); return true;
      },
      actors: () => disposed ? 0 : people.length,
      cost: () => {
        if (disposed) return { drawCalls: 0, triangles: 0 };
        // Count reserved capacity, not the momentary visible count.
        let drawCalls = 0; let triangles = 0;
        group.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          drawCalls += 1;
          const perInstance = (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
          triangles += perInstance * (object instanceof THREE.InstancedMesh ? object.instanceMatrix.count : 1);
        });
        return { drawCalls, triangles };
      },
      dispose,
    });
  } catch (error) { dispose(); throw error; }
}


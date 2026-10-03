import * as THREE from 'three';
import { measureKeep04Object } from './createKeep04Buildings';
import {
  createKeep04Kit, keep04ContactShadowGeometry, keep04ContactShadowMaterial, keep04GlowMaterial, KEEP04_LIFE_PALETTE as C, type Keep04GlowUniform,
} from './keep04ModelKit';
import {
  addBarn, addBridge, addCottage, addFence, addGateTower, addHaystack, addTower, addWall, addWindmillBody,
  birchGeometry, broadleafGeometry, bushGeometry, coniferGeometry, cropRowGeometry, poplarGeometry, reedClumpGeometry, rockGeometry, windmillSailsGeometry,
} from './keep04Models';
import { keep04Fbm, keep04Random, smoothstep } from './keep04Random';
import {
  createKeep04RibbonGeometry, createKeep04TerrainGeometry, distanceToPlinth, insideField, keep04ForestDensity,
  keep04RiverDistance, keep04RoadDistance,
  keep04RoadHeight, keep04TerrainHeight, KEEP04_BRIDGES, KEEP04_BRIDGE_DECK_Y, KEEP04_FIELDS, KEEP04_LOTS, KEEP04_RIVER, KEEP04_RIVER_HALF_WIDTH,
  KEEP04_RIVER_SURFACE_Y, KEEP04_ROADS, KEEP04_ROAD_HALF_WIDTH, nearLot, type Point2,
} from './keep04Terrain';
import type { Quality04 } from './keep04VisualProfile';

// The vale around the citadel: valley, river, roads, fields, hamlets, mills,
// woods and the outer fortifications. One static batch per material family,
// a few instanced vegetation batches and two small rotating mill parts.

export type Keep04LandscapeEmitters = Readonly<{
  chimneys: readonly THREE.Vector3[]; banners: readonly Readonly<{ position: THREE.Vector3; yaw: number }>[];
  pastures: readonly Readonly<{ x: number; z: number; radius: number }>[];
}>;

export type Keep04Landscape = Readonly<{
  group: THREE.Group;
  emitters: Keep04LandscapeEmitters;
  roads: readonly (readonly Point2[])[];
  river: readonly Point2[];
  /** Height of the decorative valley floor at a point outside the plinth. */
  heightAt: (x: number, z: number) => number;
  update: (elapsedSeconds: number) => boolean;
  cost: () => Readonly<{ drawCalls: number; triangles: number; shadowDrawCalls: number; shadowTriangles: number }>;
  /** 0 by day … 1 at night: lights the authored windows of cottages, mills and towers. */
  setNightGlow: (value: number) => void;
  instanceCount: number;
  dispose: () => void;
}>;

// Reduced thins its woods slightly so the ground contact under every structure,
// its only shadow, fits the same triangle target as before.
const LANDSCAPE_DENSITY: Readonly<Record<Quality04, number>> = { high: 1, balanced: .58, reduced: .24 };

export function createKeep04Landscape(options: Readonly<{
  quality: Quality04; reducedMotion: boolean;
  /** Rendered height of the raised terraces, for structures standing on the plinth. */
  plinthGroundAt: (x: number, z: number) => number;
}>): Keep04Landscape {
  const { quality } = options; const density = LANDSCAPE_DENSITY[quality];
  const group = new THREE.Group(); group.name = 'keep04-landscape';
  const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>();
  const spinners: Array<{ object: THREE.Object3D; axis: 'x' | 'z'; speed: number }> = [];
  const chimneys: THREE.Vector3[] = []; const banners: Array<{ position: THREE.Vector3; yaw: number }> = [];
  const pastures: Array<{ x: number; z: number; radius: number }> = [];
  // Soft ground contact follows the exact base height already chosen for each structure.
  const contacts: Array<readonly [x: number, y: number, z: number, radiusX: number, radiusZ: number, yaw: number]> = [];
  const glow: Keep04GlowUniform = { value: 0 };
  let instanceCount = 0; let disposed = false;
  const material = (parameters: THREE.MeshStandardMaterialParameters) => { const value = new THREE.MeshStandardMaterial(parameters); materials.add(value); return value; };
  const add = (geometry: THREE.BufferGeometry, mat: THREE.Material, name: string, castShadow = false) => {
    geometries.add(geometry); const mesh = new THREE.Mesh(geometry, mat); mesh.name = name; mesh.receiveShadow = true; mesh.castShadow = castShadow && quality === 'high';
    mesh.raycast = () => {}; group.add(mesh); return mesh;
  };
  const dispose = () => {
    if (disposed) return; disposed = true;
    group.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
    geometries.forEach(geometry => geometry.dispose()); geometries.clear(); materials.forEach(value => value.dispose()); materials.clear();
    group.clear(); group.removeFromParent(); spinners.length = 0;
  };
  try {
    const vertexColored = material({ vertexColors: true, roughness: .96, metalness: 0 });
    const flatColored = material({ vertexColors: true, roughness: .9, metalness: 0, flatShading: true });
    // Same look by day; authored windows glow warm from dusk to dawn.
    const glowColored = keep04GlowMaterial({ vertexColors: true, roughness: .9, metalness: 0, flatShading: true }, glow); materials.add(glowColored);
    // ---- Valley terrain ----
    add(createKeep04TerrainGeometry(quality), vertexColored, 'keep04-vale-terrain');
    // ---- Water: river ribbon and the farm pond share one calm material ----
    const waterTint = new THREE.Color();
    const river = createKeep04RibbonGeometry(KEEP04_RIVER, KEEP04_RIVER_HALF_WIDTH + 7, {
      y: () => KEEP04_RIVER_SURFACE_Y, lift: 0,
      colorAt: (t, side, target) => side === 0
        ? target.set('#3b787d').lerp(waterTint.set(C.water), .25 * keep04Fbm(t * 40, 1, 2, 7))
        : target.set('#86b9b0').lerp(waterTint.set(C.water), .3 + .25 * keep04Fbm(t * 40, side, 2, 7)),
    });
    const pond = new THREE.CircleGeometry(12, 18); pond.rotateX(-Math.PI / 2); pond.translate(62, KEEP04_RIVER_SURFACE_Y, 116);
    const pondColors = new Float32Array(pond.getAttribute('position').count * 3); const pondDeep = new THREE.Color('#3f8086'); const pondShallow = new THREE.Color('#7fb4ac');
    const pondPositions = pond.getAttribute('position'); const pondColor = new THREE.Color();
    for (let i = 0; i < pondPositions.count; i++) {
      pondColor.copy(pondDeep).lerp(pondShallow, Math.hypot(pondPositions.getX(i) - 62, pondPositions.getZ(i) - 116) / 12);
      pondColors.set([pondColor.r, pondColor.g, pondColor.b], i * 3);
    }
    pond.setAttribute('color', new THREE.BufferAttribute(pondColors, 3)); pond.deleteAttribute('uv');
    const waterParts = [river, pond.toNonIndexed()]; pond.dispose();
    const waterGeometry = new THREE.BufferGeometry();
    {
      const flat = waterParts.map(part => part.index ? part.toNonIndexed() : part);
      const positions: number[] = []; const colors: number[] = [];
      for (const part of flat) { positions.push(...part.getAttribute('position').array); colors.push(...part.getAttribute('color').array); }
      waterGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      waterGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); waterGeometry.computeVertexNormals();
      new Set([...waterParts, ...flat]).forEach(part => part.dispose());
    }
    add(waterGeometry, material({ vertexColors: true, color: '#ffffff', emissive: '#16393b', emissiveIntensity: .25, roughness: .22, metalness: .05, transparent: true, opacity: .9 }), 'keep04-vale-water');
    // ---- Roads ----
    const dirt = new THREE.Color('#b19b74'); const dirtEdge = new THREE.Color('#8f7d5a');
    const roadPositions: number[] = []; const roadColors: number[] = []; const roadIndices: number[] = [];
    for (const road of KEEP04_ROADS) {
      const ribbon = createKeep04RibbonGeometry(road, KEEP04_ROAD_HALF_WIDTH, { lift: .14, y: keep04RoadHeight,
        colorAt: (t, side, target) => target.copy(dirt).lerp(dirtEdge, Math.abs(side) * .7 + keep04Fbm(t * 60, side * 3, 2, 3) * .2) });
      const offset = roadPositions.length / 3;
      roadPositions.push(...ribbon.getAttribute('position').array); roadColors.push(...ribbon.getAttribute('color').array);
      roadIndices.push(...Array.from(ribbon.index!.array, index => index + offset)); ribbon.dispose();
    }
    const roadGeometry = new THREE.BufferGeometry();
    roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3));
    roadGeometry.setAttribute('color', new THREE.Float32BufferAttribute(roadColors, 3));
    roadGeometry.setIndex(roadIndices); roadGeometry.computeVertexNormals();
    add(roadGeometry, material({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 'keep04-vale-roads');
    // ---- Field crop rows (one instanced batch, tinted per crop) ----
    const cropColors: Record<string, readonly [string, string]> = {
      wheat: [C.wheat, C.wheatDark], sprout: [C.sprout, C.sproutDark], soil: [C.soil, C.soilDark], lavender: [C.lavender, C.lavenderDark],
    };
    const rows: Array<{ matrix: THREE.Matrix4; color: THREE.Color }> = [];
    for (const field of KEEP04_FIELDS) {
      const spacing = field.crop === 'soil' ? 1.9 : 1.6; const count = Math.floor(field.d / spacing);
      for (let i = 0; i < count; i++) {
        const v = -field.d / 2 + (i + .5) * spacing;
        const x = field.x + Math.sin(field.yaw) * v; const z = field.z + Math.cos(field.yaw) * v;
        const y = keep04TerrainHeight(x, z) - (field.crop === 'soil' ? .32 : .05);
        const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), field.yaw), new THREE.Vector3(field.w, field.crop === 'soil' ? .9 : 1, field.crop === 'lavender' ? 1.15 : 1));
        rows.push({ matrix, color: new THREE.Color(cropColors[field.crop][i % 2]) });
      }
    }
    if (rows.length) {
      const rowGeometry = cropRowGeometry(); geometries.add(rowGeometry);
      const crops = new THREE.InstancedMesh(rowGeometry, material({ vertexColors: true, roughness: 1 }), rows.length);
      crops.name = 'keep04-vale-crops'; crops.raycast = () => {}; crops.receiveShadow = true;
      rows.forEach((row, index) => { crops.setMatrixAt(index, row.matrix); crops.setColorAt(index, row.color); });
      crops.instanceMatrix.needsUpdate = true; if (crops.instanceColor) crops.instanceColor.needsUpdate = true;
      group.add(crops); instanceCount += rows.length;
    }
    // ---- Hamlets, farms and mills (one merged static mesh) ----
    const settlement = createKeep04Kit({ glowMask: true });
    try {
      KEEP04_LOTS.forEach((authoredLot, index) => {
        let lot = authoredLot;
        const y = keep04TerrainHeight(lot.x, lot.z);
        if (lot.kind === 'cottage') {
          settlement.push([lot.x, y, lot.z], lot.yaw);
          const cottage = addCottage(settlement, 7000 + index * 31);
          chimneys.push(new THREE.Vector3(...cottage.chimney).applyAxisAngle(new THREE.Vector3(0, 1, 0), lot.yaw).add(new THREE.Vector3(lot.x, y, lot.z)));
          // A small kitchen garden fence beside most cottages.
          if (index % 3 !== 0) addFence(settlement, [[cottage.width / 2 + .6, 0, -1.8], [cottage.width / 2 + 4.4, 0, -1.8], [cottage.width / 2 + 4.4, 0, 2.2], [cottage.width / 2 + .6, 0, 2.2]]);
          settlement.pop(); contacts.push([lot.x, y, lot.z, cottage.width * .62 + 1, cottage.depth * .62 + 1, lot.yaw]);
        } else if (lot.kind === 'barn') {
          settlement.push([lot.x, y, lot.z], lot.yaw); addBarn(settlement); contacts.push([lot.x, y, lot.z, 6.4, 4.6, lot.yaw]);
          addHaystack(settlement, 6.2, 0, 1.5); addHaystack(settlement, 6.6, 0, -2.2, .85); settlement.pop();
        } else if (lot.kind === 'windmill') {
          settlement.push([lot.x, y, lot.z], lot.yaw); const hub = addWindmillBody(settlement); settlement.pop(); contacts.push([lot.x, y, lot.z, 4.4, 4.4, 0]);
          const sailsGeometry = windmillSailsGeometry(); geometries.add(sailsGeometry);
          const sails = new THREE.Mesh(sailsGeometry, flatColored); sails.name = `keep04-windmill-sails:${index}`; sails.raycast = () => {};
          const pivot = new THREE.Group(); pivot.position.set(lot.x, y, lot.z); pivot.rotation.y = lot.yaw; group.add(pivot);
          sails.position.set(...hub); pivot.add(sails); spinners.push({ object: sails, axis: 'z', speed: .55 + index % 3 * .08 });
        } else if (lot.kind === 'watermill') {
          // Face the wheel toward the nearest river reach, standing on the dry bank.
          const reach = KEEP04_RIVER.reduce((best, point) => Math.hypot(point[0] - lot.x, point[1] - lot.z) < Math.hypot(best[0] - lot.x, best[1] - lot.z) ? point : best);
          const toward = Math.atan2(-(reach[1] - lot.z), reach[0] - lot.x);
          const millY = Math.max(y, KEEP04_RIVER_SURFACE_Y + .5);
          settlement.push([lot.x, millY, lot.z], toward);
          addCottage(settlement, 9100, 'slate'); settlement.box(1.2, 3.2, 1.2, C.stone, 3.4, 1.6, 0);
          settlement.pop(); contacts.push([lot.x, millY, lot.z, 5.6, 4.2, toward]);
          lot = { ...lot, yaw: toward };
          const wheel = new THREE.Mesh((() => {
            const kit = createKeep04Kit();
            kit.add(new THREE.CylinderGeometry(2.1, 2.1, .5, 10, 1, true), C.timber, [0, 0, 0], [0, 0, Math.PI / 2]);
            for (let i = 0; i < 8; i++) kit.add(new THREE.BoxGeometry(.6, 4.4, .12), C.timberDark, [0, 0, 0], [i * Math.PI / 8, 0, 0]);
            const geometry = kit.build()!; geometries.add(geometry); return geometry;
          })(), flatColored);
          wheel.name = 'keep04-watermill-wheel'; wheel.raycast = () => {};
          const pivot = new THREE.Group(); pivot.position.set(lot.x, millY, lot.z); pivot.rotation.y = lot.yaw; group.add(pivot);
          wheel.position.set(4.3, 1.1, 0); pivot.add(wheel); spinners.push({ object: wheel, axis: 'x', speed: -.7 });
        } else if (lot.kind === 'pasture') {
          const radius = 12; const corners: Array<[number, number, number]> = [];
          for (let i = 0; i < 7; i++) {
            const a = i / 7 * Math.PI * 2 + .3; const r = radius * (.88 + .12 * Math.sin(i * 2.7));
            const x = lot.x + Math.sin(a) * r; const z = lot.z + Math.cos(a) * r; corners.push([x, keep04TerrainHeight(x, z), z]);
          }
          addFence(settlement, corners, true); pastures.push({ x: lot.x, z: lot.z, radius: radius - 2 });
        }
      });
      // Stone bridges wherever a lane crosses the river; decks meet the road surface.
      for (const bridge of KEEP04_BRIDGES) {
        settlement.push([bridge.x, KEEP04_BRIDGE_DECK_Y - 1.9, bridge.z], bridge.yaw + Math.PI / 2);
        addBridge(settlement, KEEP04_RIVER_HALF_WIDTH * 2 + 9, 5.4); settlement.pop();
      }
      const settlementGeometry = settlement.build();
      if (settlementGeometry) add(settlementGeometry, glowColored, 'keep04-vale-settlement');
    } catch (error) { settlement.dispose(); throw error; }
    // ---- Outer fortifications on the plinth: towers, gatehouse, low walls, causeway ----
    const fort = createKeep04Kit({ glowMask: true });
    try {
      const ground = options.plinthGroundAt;
      // Rear towers may be tall; the two camera-side corners stay low so they never hide the deck.
      const towers: Array<[number, number, number, number]> = [[-49, -50, 10, 3], [49, -50, 10, 3], [-49, 37.5, 4.6, 2.3], [49, 37.5, 4.6, 2.3]];
      for (const [x, z, height, radius] of towers) {
        const y = ground(x, z); fort.push([x, y, z]); const top = addTower(fort, height, radius); fort.pop(); contacts.push([x, y, z, radius * 1.55, radius * 1.55, 0]);
        banners.push({ position: new THREE.Vector3(x, y + top, z), yaw: Math.atan2(-x, -z) });
      }
      for (const side of [-1, 1]) {
        const x = side * 8.6; const z = 35.6; const y = ground(x, z);
        fort.push([x, y, z]); const top = addGateTower(fort); fort.pop(); contacts.push([x, y, z, 3.4, 3.4, 0]);
        banners.push({ position: new THREE.Vector3(x, y + top, z), yaw: side * .4 });
        const wallStart = 10.8; const wallEnd = 46.4; const wallZ = 36.8; const wallX = side * (wallStart + wallEnd) / 2;
        fort.push([wallX, ground(wallX, wallZ), wallZ]); addWall(fort, wallEnd - wallStart, 2.4); fort.pop();
      }
      fort.push([0, ground(0, -50.6), -50.6]); addWall(fort, 92, 3.2); fort.pop();
      // Causeway: a solid pier across the terraces, then a broad ramp to the vale road.
      fort.box(6.6, 5.2, 12, C.masonryShade, 0, -2.55, 38);
      fort.box(6.2, .12, 12, C.masonry, 0, .06, 38);
      for (const side of [-1, 1]) fort.box(.5, .9, 12, C.masonry, side * 3.2, .45, 38);
      const rampLength = Math.hypot(13, 5.25); const rampAngle = Math.atan2(5.25, 13);
      fort.add(new THREE.BoxGeometry(6.2, .5, rampLength), C.masonry, [0, -2.62 - .2, 50.5], [rampAngle, 0, 0]);
      for (const side of [-1, 1]) fort.add(new THREE.BoxGeometry(.5, 1.1, rampLength), C.masonryShade, [side * 3.2, -2.1, 50.5], [rampAngle, 0, 0]);
      for (let step = 1; step < 9; step++) fort.box(6.2, .06, .14, C.masonryShade, 0, .1 - (step / 9) * 5.25, 44 + step / 9 * 13);
      const fortGeometry = fort.build();
      if (fortGeometry) add(fortGeometry, glowColored, 'keep04-fortifications', true);
    } catch (error) { fort.dispose(); throw error; }
    // ---- Woods, avenues, hedgerows and stones (instanced) ----
    type Species = 'conifer' | 'broadleaf' | 'birch' | 'poplar' | 'bush' | 'rock' | 'reed';
    const placements: Record<Species, Array<{ x: number; z: number; scale: number; yaw: number; tint: number }>> = { conifer: [], broadleaf: [], birch: [], poplar: [], bush: [], rock: [], reed: [] };
    const random = keep04Random(4049);
    const roadDistance = keep04RoadDistance;
    const riverDistance = keep04RiverDistance;
    const clearOfCivil = (x: number, z: number, margin: number) => distanceToPlinth(x, z) > 6 + margin && !insideField(x, z, 1.5 + margin * .3)
      && !nearLot(x, z, margin) && roadDistance(x, z) > KEEP04_ROAD_HALF_WIDTH + 1.6 + margin * .5 && riverDistance(x, z) > KEEP04_RIVER_HALF_WIDTH + 2.5 + margin * .5;
    // Woods: jittered grid sampled against the forest density field.
    const spacing = 7.2;
    for (let gz = -258; gz <= 258; gz += spacing) for (let gx = -258; gx <= 258; gx += spacing) {
      const x = gx + random.range(-3, 3); const z = gz + random.range(-3, 3); const forest = keep04ForestDensity(x, z); const roll = random.next();
      const meadowTree = roll < .018 && clearOfCivil(x, z, 2);
      if (!(meadowTree || roll < forest * .92) || !clearOfCivil(x, z, 0)) continue;
      const height = keep04TerrainHeight(x, z); const nearRiver = riverDistance(x, z) < KEEP04_RIVER_HALF_WIDTH + 16;
      const species: Species = nearRiver && random.next() < .55 ? 'birch' : meadowTree ? 'broadleaf'
        : (height > 3 || keep04Fbm(x / 40, z / 40, 2, 71) > .52) && random.next() < .78 ? 'conifer' : 'broadleaf';
      placements[species].push({ x, z, scale: random.range(.85, 1.35) * (meadowTree ? 1.2 : 1), yaw: random.range(0, Math.PI * 2), tint: random.range(.86, 1.1) });
      if (forest > .55 && random.next() < .35) {
        const bx = x + random.range(-3, 3); const bz = z + random.range(-3, 3);
        if (clearOfCivil(bx, bz, 0)) placements.bush.push({ x: bx, z: bz, scale: random.range(.7, 1.2), yaw: random.range(0, 6.28), tint: random.range(.85, 1.1) });
      }
    }
    // Poplar avenues along the approach roads, alternating sides.
    KEEP04_ROADS.forEach((road, roadIndex) => {
      for (let i = 2; i < road.length - 1; i += 2) {
        const [x0, z0] = road[i - 1]; const [x1, z1] = road[i + 1]; const length = Math.hypot(x1 - x0, z1 - z0) || 1;
        const side = (i / 2 + roadIndex) % 2 === 0 ? 1 : -1; const offset = KEEP04_ROAD_HALF_WIDTH + 3.2;
        const x = road[i][0] + -(z1 - z0) / length * offset * side; const z = road[i][1] + (x1 - x0) / length * offset * side;
        if (distanceToPlinth(x, z) < 12 || insideField(x, z, 1) || nearLot(x, z, 1) || riverDistance(x, z) < KEEP04_RIVER_HALF_WIDTH + 3) continue;
        placements[roadIndex === 0 ? 'poplar' : random.next() < .5 ? 'poplar' : 'broadleaf'].push({ x, z, scale: random.range(.9, 1.2), yaw: random.range(0, 6.28), tint: random.range(.9, 1.06) });
      }
    });
    // Hedgerows around fields.
    for (const field of KEEP04_FIELDS) {
      const perimeter = 2 * (field.w + field.d); const steps = Math.floor(perimeter / 4.2);
      for (let i = 0; i < steps; i++) {
        let t = i / steps * perimeter; let u = 0; let v = 0; const hw = field.w / 2 + 1.6; const hd = field.d / 2 + 1.6;
        if (t < field.w) { u = -field.w / 2 + t; v = -hd; } else if ((t -= field.w) < field.d) { u = hw; v = -field.d / 2 + t; }
        else if ((t -= field.d) < field.w) { u = field.w / 2 - t; v = hd; } else { t -= field.w; u = -hw; v = field.d / 2 - t; }
        const x = field.x + Math.cos(field.yaw) * u + Math.sin(field.yaw) * v; const z = field.z - Math.sin(field.yaw) * u + Math.cos(field.yaw) * v;
        if (roadDistance(x, z) < KEEP04_ROAD_HALF_WIDTH + 1.2 || riverDistance(x, z) < KEEP04_RIVER_HALF_WIDTH + 2 || random.next() < .25) continue;
        placements[random.next() < .12 ? 'broadleaf' : 'bush'].push({ x, z, scale: random.range(.75, 1.1), yaw: random.range(0, 6.28), tint: random.range(.88, 1.08) });
      }
    }
    // Stones on slopes and along the banks.
    for (let i = 0; i < 260; i++) {
      const x = random.range(-255, 255); const z = random.range(-255, 255);
      if (!clearOfCivil(x, z, 0)) continue;
      const rise = smoothstep(2, 14, keep04TerrainHeight(x, z)); const bank = riverDistance(x, z) < KEEP04_RIVER_HALF_WIDTH + 10 ? .5 : 0;
      if (random.next() < .12 + rise * .5 + bank) placements.rock.push({ x, z, scale: random.range(.6, 1.6), yaw: random.range(0, 6.28), tint: random.range(.85, 1.1) });
    }
    // Reed clumps soften the shore: sampled along both banks of the river and around the pond,
    // standing just above the waterline and clear of bridges and the mill race.
    for (let i = 0; i < KEEP04_RIVER.length - 1; i++) {
      const [ax, az] = KEEP04_RIVER[i]; const [bx, bz] = KEEP04_RIVER[i + 1]; const length = Math.hypot(bx - ax, bz - az) || 1;
      const nx = -(bz - az) / length; const nz = (bx - ax) / length;
      for (const side of [-1, 1]) for (let step = 0; step < 2; step++) {
        if (random.next() < .35) continue;
        const t = random.range(0, 1); const cx = ax + (bx - ax) * t; const cz = az + (bz - az) * t;
        // Walk outward from the channel to the first ground just above the water.
        for (let offset = KEEP04_RIVER_HALF_WIDTH; offset < KEEP04_RIVER_HALF_WIDTH + 12; offset += .5) {
          const x = cx + nx * offset * side; const z = cz + nz * offset * side;
          const above = keep04TerrainHeight(x, z) - KEEP04_RIVER_SURFACE_Y;
          if (above < .05) continue;
          if (above <= .6 && distanceToPlinth(x, z) >= 8 && !KEEP04_BRIDGES.some(bridge => Math.hypot(x - bridge.x, z - bridge.z) < 14)) {
            placements.reed.push({ x, z, scale: random.range(.75, 1.25), yaw: random.range(0, 6.28), tint: random.range(.85, 1.08) });
          }
          break;
        }
      }
    }
    for (let i = 0; i < 16; i++) {
      const angle = i / 16 * Math.PI * 2 + random.range(-.15, .15); const radius = random.range(11.4, 13.2);
      placements.reed.push({ x: 62 + Math.cos(angle) * radius, z: 116 + Math.sin(angle) * radius, scale: random.range(.75, 1.2), yaw: random.range(0, 6.28), tint: random.range(.85, 1.08) });
    }
    const speciesGeometry: Record<Species, () => THREE.BufferGeometry> = {
      conifer: coniferGeometry, broadleaf: broadleafGeometry, birch: birchGeometry, poplar: poplarGeometry, bush: bushGeometry, rock: rockGeometry, reed: reedClumpGeometry,
    };
    const caps: Record<Species, number> = { conifer: 360, broadleaf: 230, birch: 80, poplar: 70, bush: 260, rock: 90, reed: quality === 'reduced' ? 0 : 150 };
    const matrix = new THREE.Matrix4(); const quaternion = new THREE.Quaternion(); const up = new THREE.Vector3(0, 1, 0); const tint = new THREE.Color();
    for (const species of Object.keys(placements) as Species[]) {
      // Stable ranking: lower tiers keep a deterministic prefix of the same population.
      const ranked = placements[species]
        .map(item => ({ item, rank: keep04Fbm(item.x * 1.7, item.z * 1.3, 1, 89) }))
        .sort((left, right) => left.rank - right.rank).map(entry => entry.item);
      const count = Math.min(ranked.length, Math.round(caps[species] * density));
      if (count === 0) continue;
      const geometry = speciesGeometry[species](); geometries.add(geometry);
      const batch = new THREE.InstancedMesh(geometry, flatColored, count);
      batch.name = `keep04-vale-${species}`; batch.raycast = () => {}; batch.receiveShadow = true;
      for (let i = 0; i < count; i++) {
        const { x, z, scale, yaw, tint: shade } = ranked[i];
        matrix.compose(new THREE.Vector3(x, keep04TerrainHeight(x, z) - .1, z), quaternion.setFromAxisAngle(up, yaw), new THREE.Vector3(scale, scale, scale));
        batch.setMatrixAt(i, matrix); batch.setColorAt(i, tint.setScalar(shade));
      }
      batch.instanceMatrix.needsUpdate = true; if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
      batch.computeBoundingSphere(); group.add(batch); instanceCount += count;
    }
    // ---- Ground contact: one soft instanced batch under every structure ----
    if (contacts.length) {
      const contactGeometry = keep04ContactShadowGeometry(quality === 'reduced' ? 8 : 18); geometries.add(contactGeometry);
      const contactMaterial = keep04ContactShadowMaterial(); materials.add(contactMaterial);
      const contactBatch = new THREE.InstancedMesh(contactGeometry, contactMaterial, contacts.length);
      contactBatch.name = 'keep04-vale-contact-shadows'; contactBatch.raycast = () => {}; contactBatch.renderOrder = -1;
      contacts.forEach(([x, y, z, radiusX, radiusZ, yaw], index) => {
        matrix.compose(new THREE.Vector3(x, y + .06, z),
          quaternion.setFromAxisAngle(up, yaw), new THREE.Vector3(radiusX, 1, radiusZ));
        contactBatch.setMatrixAt(index, matrix);
      });
      contactBatch.instanceMatrix.needsUpdate = true; contactBatch.computeBoundingSphere();
      group.add(contactBatch); instanceCount += contacts.length;
    }
    group.updateMatrixWorld(true);
    return Object.freeze({
      group,
      emitters: Object.freeze({ chimneys: Object.freeze(chimneys), banners: Object.freeze(banners.map(entry => Object.freeze(entry))), pastures: Object.freeze(pastures.map(entry => Object.freeze(entry))) }),
      roads: KEEP04_ROADS, river: KEEP04_RIVER, heightAt: keep04TerrainHeight,
      update: elapsed => {
        if (disposed || options.reducedMotion || !spinners.length) return false;
        for (const spinner of spinners) spinner.object.rotation[spinner.axis] = elapsed * spinner.speed;
        return true;
      },
      cost: () => {
        if (disposed) return { drawCalls: 0, triangles: 0, shadowDrawCalls: 0, shadowTriangles: 0 };
        const measured = measureKeep04Object(group); let shadowDrawCalls = 0; let shadowTriangles = 0;
        group.traverse(object => { if (object instanceof THREE.Mesh && object.castShadow) { const part = measureKeep04Object(object); shadowDrawCalls += part.drawCalls; shadowTriangles += part.triangles; } });
        return { drawCalls: measured.drawCalls, triangles: measured.triangles, shadowDrawCalls, shadowTriangles };
      },
      setNightGlow: value => { glow.value = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 1.7; },
      instanceCount,
      dispose,
    });
  } catch (error) { dispose(); throw error; }
}

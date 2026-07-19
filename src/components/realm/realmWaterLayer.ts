import * as THREE from 'three';

import {
  axialToWorld,
  hexDistance,
  type HexCoord
} from '../../game/map/hexCoordinates';
import {
  GENESIS_OCEAN_DEPTH_BY_KEY,
  GENESIS_RIVERS_V1,
  GENESIS_WATER_LAYOUT_VERSION,
  type GenesisWaterCellV1
} from '../../../spacetimedb/src/waterWorld';
import type { RealmQualitySpec } from './realmQuality';
import { pointyHexCorners } from './createTerrainGeometry';

const WATER_Y_LIFT = 0.035;
const RIVER_WIDTH = 0.58;
const RIVER_BANK_BLEND = 0.28;

export const REALM_WATER_RENDER_BUDGETS = Object.freeze({
  high: Object.freeze({ triangles: 220_000, draws: 4, waveComponents: 8 }),
  balanced: Object.freeze({ triangles: 105_000, draws: 4, waveComponents: 5 }),
  reduced: Object.freeze({ triangles: 35_000, draws: 3, waveComponents: 0 })
});

export type RealmWaterLayerTelemetry = Readonly<{
  layoutVersion: number;
  oceanCellCount: number;
  lakeCellCount: number;
  riverCellCount: number;
  triangleCount: number;
  drawCalls: number;
  animated: boolean;
  hiddenOceanCellCount: number;
}>;

export type RealmWaterLayer = Readonly<{
  group: THREE.Group;
  updateEnvironment: (elapsedSeconds: number) => boolean;
  isAnimationActive: () => boolean;
  getTelemetry: () => RealmWaterLayerTelemetry;
  dispose: () => void;
}>;

type WaterLayerOptions = Readonly<{
  cells: readonly GenesisWaterCellV1[];
  quality: RealmQualitySpec;
  reducedMotion: boolean;
  hexSize: number;
  heightAt: (coord: HexCoord) => number;
}>;

function regimeColor(cell: GenesisWaterCellV1): THREE.Color {
  if (cell.regime === 'river') return new THREE.Color('#5eabc4');
  if (cell.regime === 'lake') return new THREE.Color('#548eac');
  const depth = GENESIS_OCEAN_DEPTH_BY_KEY.get(cell.cellKey) ?? cell.depthCells;
  return depth >= 5 ? new THREE.Color('#315b78') : depth >= 3
    ? new THREE.Color('#3c7691') : new THREE.Color('#4f91ab');
}

function surfaceGeometry(
  cells: readonly GenesisWaterCellV1[],
  hexSize: number,
  heightAt: (coord: HexCoord) => number
) {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const waterDepth: number[] = [];
  const waterBankBlend: number[] = [];
  const indices: number[] = [];
  cells.forEach((cell) => {
    const center = axialToWorld({ q: cell.q, r: cell.r }, hexSize);
    const ground = cell.regime === 'ocean'
      ? cell.surfaceLevelMilli / 1_000
      : Math.max(cell.surfaceLevelMilli / 1_000, heightAt({ q: cell.q, r: cell.r }) + WATER_Y_LIFT);
    const color = regimeColor(cell);
    const base = positions.length / 3;
    positions.push(center.x, ground, center.z);
    colors.push(color.r, color.g, color.b);
    waterDepth.push(Math.min(1, cell.depthCells / 5));
    waterBankBlend.push(cell.regime === 'river' ? RIVER_BANK_BLEND : 0);
    normals.push(0, 1, 0);
    pointyHexCorners({ q: cell.q, r: cell.r }, hexSize).forEach((corner) => {
      positions.push(corner.x, ground, corner.z);
      colors.push(color.r, color.g, color.b);
      waterDepth.push(Math.min(1, cell.depthCells / 5));
      waterBankBlend.push(cell.regime === 'river' ? RIVER_BANK_BLEND : 0);
      normals.push(0, 1, 0);
    });
    for (let corner = 0; corner < 6; corner += 1) {
      indices.push(base, base + corner + 1, base + ((corner + 1) % 6) + 1);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('waterDepth', new THREE.Float32BufferAttribute(waterDepth, 1));
  geometry.setAttribute('waterBankBlend', new THREE.Float32BufferAttribute(waterBankBlend, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function riverGeometry(
  riverCells: readonly GenesisWaterCellV1[],
  hexSize: number,
  heightAt: (coord: HexCoord) => number
) {
  const rowsByKey = new Map(riverCells.map((cell) => [cell.cellKey, cell]));
  const positions: number[] = [];
  const colors: number[] = [];
  const waterDepth: number[] = [];
  const waterBankBlend: number[] = [];
  const indices: number[] = [];
  for (const river of GENESIS_RIVERS_V1) {
    const path = river.orderedCellKeys
      .map((key) => rowsByKey.get(key))
      .filter((cell): cell is GenesisWaterCellV1 => cell !== undefined);
    for (let index = 0; index < path.length; index += 1) {
      const cell = path[index]!;
      const center = axialToWorld({ q: cell.q, r: cell.r }, hexSize);
      const previous = path[Math.max(0, index - 1)]!;
      const next = path[Math.min(path.length - 1, index + 1)]!;
      const previousWorld = axialToWorld({ q: previous.q, r: previous.r }, hexSize);
      const nextWorld = axialToWorld({ q: next.q, r: next.r }, hexSize);
      const dx = nextWorld.x - previousWorld.x;
      const dz = nextWorld.z - previousWorld.z;
      const length = Math.max(0.001, Math.hypot(dx, dz));
      const nx = -dz / length;
      const nz = dx / length;
      const width = RIVER_WIDTH * (1 + Math.sin((index + 1) * 1.71) * 0.07);
      // River heights come from the frozen downstream surface profile, not
      // per-frame terrain samples. This keeps every segment grade-monotonic
      // and prevents apparent waterfalls when the camera or terrain LOD shifts.
      const y = cell.surfaceLevelMilli / 1_000 + WATER_Y_LIFT + 0.008;
      const left = { x: center.x + nx * width * 0.5, z: center.z + nz * width * 0.5 };
      const right = { x: center.x - nx * width * 0.5, z: center.z - nz * width * 0.5 };
      const base = positions.length / 3;
      positions.push(left.x, y, left.z, right.x, y, right.z);
      const color = regimeColor(cell);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      waterDepth.push(0.08, 0.08);
      waterBankBlend.push(RIVER_BANK_BLEND, RIVER_BANK_BLEND);
      if (index > 0) indices.push(base - 2, base - 1, base, base - 1, base + 1, base);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('waterDepth', new THREE.Float32BufferAttribute(waterDepth, 1));
  geometry.setAttribute('waterBankBlend', new THREE.Float32BufferAttribute(waterBankBlend, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function outerSkirtGeometry(cells: readonly GenesisWaterCellV1[], hexSize: number) {
  const keys = new Set(cells.map((cell) => cell.cellKey));
  const positions: number[] = [];
  const indices: number[] = [];
  const bottom = -1.25;
  for (const cell of cells) {
    if (cell.regime !== 'ocean' || hexDistance(cell, { q: 0, r: 0 }) !== 65) continue;
    const corners = pointyHexCorners({ q: cell.q, r: cell.r }, hexSize);
    for (let side = 0; side < 6; side += 1) {
      const direction = [{ q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }][side]!;
      const neighborKey = `${cell.q + direction.q},${cell.r + direction.r}`;
      if (keys.has(neighborKey)) continue;
      const a = corners[side]!;
      const b = corners[(side + 1) % 6]!;
      const base = positions.length / 3;
      positions.push(a.x, cell.surfaceLevelMilli / 1_000, a.z, b.x, cell.surfaceLevelMilli / 1_000, b.z, b.x, bottom, b.z, a.x, bottom, a.z);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createWaterMaterial(quality: RealmQualitySpec, reducedMotion: boolean) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    color: '#8bcde1',
    roughness: 0.28,
    metalness: 0.04,
    transparent: false,
    depthWrite: true,
    fog: true
  });
  const uniforms = {
    uWaterTime: { value: 0 },
    uWaterMotion: { value: reducedMotion || quality.id === 'reduced' ? 0 : 1 },
    uWaterWaveComponents: { value: REALM_WATER_RENDER_BUDGETS[quality.id].waveComponents }
  };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = uniforms.uWaterTime;
    shader.uniforms.uWaterMotion = uniforms.uWaterMotion;
    shader.uniforms.uWaterWaveComponents = uniforms.uWaterWaveComponents;
    shader.vertexShader = `attribute float waterDepth;\nattribute float waterBankBlend;\nvarying float vWarpkeepWaterDepth;\nvarying float vWarpkeepWaterBankBlend;\n${shader.vertexShader}`
      .replace('#include <color_vertex>', '#include <color_vertex>\n  vWarpkeepWaterDepth = waterDepth;\n  vWarpkeepWaterBankBlend = waterBankBlend;');
    shader.fragmentShader = `uniform float uWaterTime;\nuniform float uWaterMotion;\nuniform float uWaterWaveComponents;\nvarying float vWarpkeepWaterDepth;\nvarying float vWarpkeepWaterBankBlend;\n${shader.fragmentShader}`
      .replace('#include <dithering_fragment>', `
        float waterGlimmer = sin((vViewPosition.x + vViewPosition.z) * 3.1 + uWaterTime * 0.32) * 0.018;
        float waterFresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewPosition)), 0.0), 3.0) * 0.08;
        float waterDepthTint = mix(1.0, 0.72, clamp(vWarpkeepWaterDepth, 0.0, 1.0));
        float bankSoftness = 1.0 - clamp(vWarpkeepWaterBankBlend, 0.0, 1.0) * 0.18;
        outgoingLight += vec3(waterGlimmer + waterFresnel) * uWaterMotion * waterDepthTint * bankSoftness;
        #include <dithering_fragment>`);
    material.userData.waterShaderContract = 'three-r185-reviewed';
  };
  material.userData.waterUniforms = uniforms;
  return material;
}

export function createRealmWaterLayer(options: WaterLayerOptions): RealmWaterLayer {
  const ocean = options.cells.filter((cell) => cell.regime === 'ocean');
  const lakes = options.cells.filter((cell) => cell.regime === 'lake');
  const rivers = options.cells.filter((cell) => cell.regime === 'river');
  const budget = REALM_WATER_RENDER_BUDGETS[options.quality.id];
  const group = new THREE.Group();
  group.name = 'genesis-canonical-water';
  const oceanGeometry = surfaceGeometry(ocean, options.hexSize, options.heightAt);
  const lakeGeometry = surfaceGeometry(lakes, options.hexSize, options.heightAt);
  const riverGeometryData = riverGeometry(rivers, options.hexSize, options.heightAt);
  const skirtGeometry = outerSkirtGeometry(ocean, options.hexSize);
  const waterMaterial = createWaterMaterial(options.quality, options.reducedMotion);
  const lakeMaterial = createWaterMaterial(options.quality, options.reducedMotion);
  const riverMaterial = createWaterMaterial(options.quality, options.reducedMotion);
  const skirtMaterial = new THREE.MeshBasicMaterial({
    color: '#26485e',
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide
  });
  const oceanMesh = new THREE.Mesh(oceanGeometry, waterMaterial);
  const lakeMesh = new THREE.Mesh(lakeGeometry, lakeMaterial);
  const riverMesh = new THREE.Mesh(riverGeometryData, riverMaterial);
  const skirtMesh = new THREE.Mesh(skirtGeometry, skirtMaterial);
  oceanMesh.name = 'canonical-ocean-surface';
  lakeMesh.name = 'canonical-lake-surfaces';
  riverMesh.name = 'canonical-river-ribbons';
  skirtMesh.name = 'canonical-ocean-downward-skirt';
  riverMesh.renderOrder = 2;
  skirtMesh.renderOrder = 1;
  group.add(oceanMesh, lakeMesh, riverMesh, skirtMesh);
  const triangleCount = (oceanGeometry.index?.count ?? 0) / 3
    + (lakeGeometry.index?.count ?? 0) / 3
    + (riverGeometryData.index?.count ?? 0) / 3
    + (skirtGeometry.index?.count ?? 0) / 3;
  const drawCalls = [oceanMesh, lakeMesh, riverMesh, skirtMesh]
    .filter((mesh) => (mesh.geometry.index?.count ?? 0) > 0).length;
  if (triangleCount > budget.triangles || drawCalls > budget.draws) {
    throw new Error('REALM_WATER_RENDER_BUDGET_EXCEEDED');
  }
  const uniforms = [waterMaterial, lakeMaterial, riverMaterial]
    .map((material) => material.userData.waterUniforms as { uWaterTime: { value: number } });
  const animated = !options.reducedMotion && options.quality.id !== 'reduced';
  let lastTime = -1;
  const telemetry = Object.freeze({
    layoutVersion: GENESIS_WATER_LAYOUT_VERSION,
    oceanCellCount: ocean.length,
    lakeCellCount: lakes.length,
    riverCellCount: rivers.length,
    triangleCount,
    drawCalls,
    animated,
    hiddenOceanCellCount: ocean.filter((cell) => cell.fogBand === 'full').length
  });
  return {
    group,
    updateEnvironment: (elapsedSeconds) => {
      if (!animated || !Number.isFinite(elapsedSeconds) || elapsedSeconds === lastTime) return false;
      lastTime = elapsedSeconds;
      uniforms.forEach((uniform) => { uniform.uWaterTime.value = elapsedSeconds; });
      return true;
    },
    isAnimationActive: () => animated,
    getTelemetry: () => telemetry,
    dispose: () => {
      oceanGeometry.dispose();
      lakeGeometry.dispose();
      riverGeometryData.dispose();
      skirtGeometry.dispose();
      waterMaterial.dispose();
      lakeMaterial.dispose();
      riverMaterial.dispose();
      skirtMaterial.dispose();
    }
  };
}

import * as THREE from 'three';

import {
  axialToWorld,
  hexDistance,
  hexNeighbors,
  hexKey,
  type HexCoord
} from '../../game/map/hexCoordinates';
import {
  GENESIS_OCEAN_DEPTH_BY_KEY,
  GENESIS_RIVERS_V1,
  GENESIS_WATER_LAYOUT_VERSION,
  genesisWaterWorldHeightFromMilli,
  type GenesisWaterCellV1
} from '../../../spacetimedb/src/waterWorld';
import type { RealmQualitySpec } from './realmQuality';
import { pointyHexCorners } from './createTerrainGeometry';

const WATER_Y_LIFT = 0.035;
const RIVER_WIDTH = 0.58;
const RIVER_BANK_BLEND = 0.28;
const RIVER_MOUTH_LIFT = 0.003;
const RIVER_MOUTH_BLEND_CELLS = 4;

/** Convert the persisted +1000 fixed-point datum into the terrain's world-Y space. */
export function waterSurfaceLevelToWorldY(surfaceLevelMilli: number): number {
  return genesisWaterWorldHeightFromMilli(surfaceLevelMilli);
}

function fogMixForCell(cell: GenesisWaterCellV1): number {
  if (cell.regime !== 'ocean') return 0;
  if (cell.fogBand === 'full') return 1;
  if (cell.fogBand === 'haze') return 0.45;
  return 0;
}

export const REALM_WATER_RENDER_BUDGETS = Object.freeze({
  high: Object.freeze({ triangles: 220_000, draws: 4, waveComponents: 8 }),
  balanced: Object.freeze({ triangles: 105_000, draws: 4, waveComponents: 5 }),
  reduced: Object.freeze({ triangles: 35_000, draws: 4, waveComponents: 0 })
});

export type RealmWaterLayerTelemetry = Readonly<{
  layoutVersion: number;
  oceanCellCount: number;
  lakeCellCount: number;
  riverCellCount: number;
  triangleCount: number;
  drawCalls: number;
  animated: boolean;
  fullFogOceanCellCount: number;
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
  const waterFogMix: number[] = [];
  const indices: number[] = [];
  cells.forEach((cell) => {
    const center = axialToWorld({ q: cell.q, r: cell.r }, hexSize);
    const authoritativeSurfaceY = waterSurfaceLevelToWorldY(cell.surfaceLevelMilli);
    const ground = cell.regime === 'ocean'
      ? authoritativeSurfaceY
      : authoritativeSurfaceY + WATER_Y_LIFT;
    if (cell.regime !== 'ocean' && ground < heightAt({ q: cell.q, r: cell.r })) {
      throw new Error('REALM_WATER_SURFACE_BELOW_TERRAIN');
    }
    const color = regimeColor(cell);
    const base = positions.length / 3;
    positions.push(center.x, ground, center.z);
    colors.push(color.r, color.g, color.b);
    waterDepth.push(Math.min(1, cell.depthCells / 5));
    waterBankBlend.push(cell.regime === 'river' ? RIVER_BANK_BLEND : 0);
    waterFogMix.push(fogMixForCell(cell));
    normals.push(0, 1, 0);
    pointyHexCorners({ q: cell.q, r: cell.r }, hexSize).forEach((corner) => {
      positions.push(corner.x, ground, corner.z);
      colors.push(color.r, color.g, color.b);
      waterDepth.push(Math.min(1, cell.depthCells / 5));
      waterBankBlend.push(cell.regime === 'river' ? RIVER_BANK_BLEND : 0);
      waterFogMix.push(fogMixForCell(cell));
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
  geometry.setAttribute('waterFogMix', new THREE.Float32BufferAttribute(waterFogMix, 1));
  try {
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    return geometry;
  } catch (error) {
    geometry.dispose();
    throw error;
  }
}

function riverGeometry(
  riverCells: readonly GenesisWaterCellV1[],
  hexSize: number,
  heightAt: (coord: HexCoord) => number
) {
  const rowsByKey = new Map(riverCells.map((cell) => [cell.cellKey, cell]));
  const oceanByKey = new Map(
    riverCells.filter((cell) => cell.regime === 'ocean').map((cell) => [cell.cellKey, cell])
  );
  const positions: number[] = [];
  const colors: number[] = [];
  const waterDepth: number[] = [];
  const waterBankBlend: number[] = [];
  const waterFogMix: number[] = [];
  const indices: number[] = [];
  for (const river of GENESIS_RIVERS_V1) {
    const riverPath = river.orderedCellKeys
      .map((key) => rowsByKey.get(key))
      .filter((cell): cell is GenesisWaterCellV1 => cell !== undefined);
    const mouth = riverPath.at(-1);
    const beforeMouth = riverPath.at(-2);
    const oceanContinuation = mouth === undefined
      ? undefined
      : hexNeighbors(mouth)
        .map((coord) => oceanByKey.get(hexKey(coord)))
        .filter((cell): cell is GenesisWaterCellV1 => cell !== undefined)
        .sort((left, right) => {
          if (beforeMouth === undefined) return left.cellKey.localeCompare(right.cellKey);
          const incoming = axialToWorld({ q: mouth.q - beforeMouth.q, r: mouth.r - beforeMouth.r }, hexSize);
          const leftDirection = axialToWorld({ q: left.q - mouth.q, r: left.r - mouth.r }, hexSize);
          const rightDirection = axialToWorld({ q: right.q - mouth.q, r: right.r - mouth.r }, hexSize);
          const leftAlignment = incoming.x * leftDirection.x + incoming.z * leftDirection.z;
          const rightAlignment = incoming.x * rightDirection.x + incoming.z * rightDirection.z;
          return rightAlignment - leftAlignment || left.cellKey.localeCompare(right.cellKey);
        })[0];
    const path = oceanContinuation === undefined
      ? riverPath
      : [...riverPath, oceanContinuation];
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
      const cellsFromMouth = Math.max(0, riverPath.length - 1 - index);
      const mouthBlend = Math.min(1, cellsFromMouth / RIVER_MOUTH_BLEND_CELLS);
      const lift = THREE.MathUtils.lerp(RIVER_MOUTH_LIFT, WATER_Y_LIFT + 0.008, mouthBlend);
      const y = waterSurfaceLevelToWorldY(cell.surfaceLevelMilli) + lift;
      if (cell.regime === 'river' && y < heightAt({ q: cell.q, r: cell.r })) {
        throw new Error('REALM_WATER_RIVER_BELOW_TERRAIN');
      }
      const left = { x: center.x + nx * width * 0.5, z: center.z + nz * width * 0.5 };
      const right = { x: center.x - nx * width * 0.5, z: center.z - nz * width * 0.5 };
      const base = positions.length / 3;
      positions.push(left.x, y, left.z, right.x, y, right.z);
      const color = regimeColor(cell);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      waterDepth.push(0.08, 0.08);
      waterBankBlend.push(RIVER_BANK_BLEND, RIVER_BANK_BLEND);
      waterFogMix.push(0, 0);
      if (index > 0) indices.push(base - 2, base - 1, base, base - 1, base + 1, base);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('waterDepth', new THREE.Float32BufferAttribute(waterDepth, 1));
  geometry.setAttribute('waterBankBlend', new THREE.Float32BufferAttribute(waterBankBlend, 1));
  geometry.setAttribute('waterFogMix', new THREE.Float32BufferAttribute(waterFogMix, 1));
  try {
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  } catch (error) {
    geometry.dispose();
    throw error;
  }
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
      const surfaceY = waterSurfaceLevelToWorldY(cell.surfaceLevelMilli);
      positions.push(a.x, surfaceY, a.z, b.x, surfaceY, b.z, b.x, bottom, b.z, a.x, bottom, a.z);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  try {
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  } catch (error) {
    geometry.dispose();
    throw error;
  }
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
  const activeWaveComponents = reducedMotion
    ? 0
    : REALM_WATER_RENDER_BUDGETS[quality.id].waveComponents;
  const uniforms = {
    uWaterTime: { value: 0 },
    uWaterHorizonColor: { value: new THREE.Color('#b9cad8') }
  };
  const waveTerms = Array.from({ length: activeWaveComponents }, (_, index) => {
    const ordinal = index + 1;
    const xFrequency = (2.25 + ordinal * 0.37).toFixed(2);
    const zFrequency = (1.65 + ordinal * 0.29).toFixed(2);
    const timeFrequency = (0.19 + ordinal * 0.035).toFixed(3);
    return `sin(vViewPosition.x * ${xFrequency} + vViewPosition.z * ${zFrequency} + uWaterTime * ${timeFrequency})`;
  });
  const waveSource = waveTerms.length === 0
    ? 'float waterGlimmer = 0.0;'
    : `float waterGlimmer = (${waveTerms.join(' + ')}) * ${(0.018 / waveTerms.length).toFixed(8)};`;
  material.onBeforeCompile = (shader) => {
    if (activeWaveComponents > 0) shader.uniforms.uWaterTime = uniforms.uWaterTime;
    shader.uniforms.uWaterHorizonColor = uniforms.uWaterHorizonColor;
    shader.vertexShader = `attribute float waterDepth;\nattribute float waterBankBlend;\nattribute float waterFogMix;\nvarying float vWarpkeepWaterDepth;\nvarying float vWarpkeepWaterBankBlend;\nvarying float vWarpkeepWaterFogMix;\n${shader.vertexShader}`
      .replace('#include <color_vertex>', '#include <color_vertex>\n  vWarpkeepWaterDepth = waterDepth;\n  vWarpkeepWaterBankBlend = waterBankBlend;\n  vWarpkeepWaterFogMix = waterFogMix;');
    const timeUniform = activeWaveComponents > 0 ? 'uniform float uWaterTime;\n' : '';
    shader.fragmentShader = `${timeUniform}uniform vec3 uWaterHorizonColor;\nvarying float vWarpkeepWaterDepth;\nvarying float vWarpkeepWaterBankBlend;\nvarying float vWarpkeepWaterFogMix;\n${shader.fragmentShader}`
      .replace('#include <opaque_fragment>', `
        ${waveSource}
        float waterFresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(-vViewPosition)), 0.0), 3.0) * 0.08;
        float waterDepthTint = mix(1.0, 0.72, clamp(vWarpkeepWaterDepth, 0.0, 1.0));
        float bankSoftness = 1.0 - clamp(vWarpkeepWaterBankBlend, 0.0, 1.0) * 0.18;
        outgoingLight += vec3(waterGlimmer + waterFresnel) * waterDepthTint * bankSoftness;
        outgoingLight = mix(outgoingLight, uWaterHorizonColor, clamp(vWarpkeepWaterFogMix, 0.0, 1.0) * 0.62);
        #include <opaque_fragment>`);
    material.userData.waterShaderContract = 'three-r185-reviewed';
  };
  material.userData.waterUniforms = uniforms;
  material.userData.waterWaveComponents = activeWaveComponents;
  return material;
}

export function createRealmWaterLayer(options: WaterLayerOptions): RealmWaterLayer {
  const ocean = options.cells.filter((cell) => cell.regime === 'ocean');
  const lakes = options.cells.filter((cell) => cell.regime === 'lake');
  const rivers = options.cells.filter((cell) => cell.regime === 'river');
  const budget = REALM_WATER_RENDER_BUDGETS[options.quality.id];
  const group = new THREE.Group();
  group.name = 'genesis-canonical-water';
  let oceanGeometry: THREE.BufferGeometry | undefined;
  let lakeGeometry: THREE.BufferGeometry | undefined;
  let riverGeometryData: THREE.BufferGeometry | undefined;
  let skirtGeometry: THREE.BufferGeometry | undefined;
  let waterMaterial: THREE.MeshStandardMaterial | undefined;
  let lakeMaterial: THREE.MeshStandardMaterial | undefined;
  let riverMaterial: THREE.MeshStandardMaterial | undefined;
  let skirtMaterial: THREE.MeshBasicMaterial | undefined;
  const disposeResources = () => {
    oceanGeometry?.dispose();
    lakeGeometry?.dispose();
    riverGeometryData?.dispose();
    skirtGeometry?.dispose();
    waterMaterial?.dispose();
    lakeMaterial?.dispose();
    riverMaterial?.dispose();
    skirtMaterial?.dispose();
  };
  try {
    oceanGeometry = surfaceGeometry(ocean, options.hexSize, options.heightAt);
    lakeGeometry = surfaceGeometry(lakes, options.hexSize, options.heightAt);
    riverGeometryData = riverGeometry(options.cells, options.hexSize, options.heightAt);
    skirtGeometry = outerSkirtGeometry(ocean, options.hexSize);
    waterMaterial = createWaterMaterial(options.quality, options.reducedMotion);
    lakeMaterial = createWaterMaterial(options.quality, options.reducedMotion);
    riverMaterial = createWaterMaterial(options.quality, options.reducedMotion);
    skirtMaterial = new THREE.MeshBasicMaterial({
      color: '#26485e',
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      fog: true,
      side: THREE.DoubleSide
    });
  } catch (error) {
    disposeResources();
    throw error;
  }
  if (!oceanGeometry || !lakeGeometry || !riverGeometryData || !skirtGeometry
    || !waterMaterial || !lakeMaterial || !riverMaterial || !skirtMaterial) {
    disposeResources();
    throw new Error('REALM_WATER_RESOURCE_CONSTRUCTION_FAILED');
  }
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
    disposeResources();
    throw new Error('REALM_WATER_RENDER_BUDGET_EXCEEDED');
  }
  const uniforms = [waterMaterial, lakeMaterial, riverMaterial]
    .filter((material) => (material.userData.waterWaveComponents as number) > 0)
    .map((material) => material.userData.waterUniforms as { uWaterTime: { value: number } });
  const animated = uniforms.length > 0;
  let lastTime = -1;
  let disposed = false;
  const telemetry = Object.freeze({
    layoutVersion: GENESIS_WATER_LAYOUT_VERSION,
    oceanCellCount: ocean.length,
    lakeCellCount: lakes.length,
    riverCellCount: rivers.length,
    triangleCount,
    drawCalls,
    animated,
    fullFogOceanCellCount: ocean.filter((cell) => cell.fogBand === 'full').length
  });
  return {
    group,
    updateEnvironment: (elapsedSeconds) => {
      if (disposed || !animated || !Number.isFinite(elapsedSeconds) || elapsedSeconds === lastTime) return false;
      lastTime = elapsedSeconds;
      uniforms.forEach((uniform) => { uniform.uWaterTime.value = elapsedSeconds; });
      return true;
    },
    isAnimationActive: () => animated,
    getTelemetry: () => telemetry,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      disposeResources();
    }
  };
}

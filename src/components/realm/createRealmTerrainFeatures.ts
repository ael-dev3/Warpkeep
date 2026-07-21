import * as THREE from 'three';

import type {
  RealmTerrainFeatureData,
  RealmTerrainFeatureKind
} from '../../game/map/realmTerrainFeatures';
import { terrainHeightAtWorld } from '../../game/map/terrainHeight';
import {
  EMPTY_TERRAIN_PLACEMENTS,
  type TerrainStructurePlacement
} from '../../game/map/terrainPlacements';
import type { RealmTerrainMap } from '../../game/map/terrainTypes';
import type { RealmQualitySpec } from './realmQuality';

export type RealmTerrainFeatureLayers = Readonly<{
  group: THREE.Group;
  counts: RealmTerrainFeatureData['counts'];
  drawCalls: number;
  instanceCount: number;
  dispose: () => void;
}>;

function geometryForKind(kind: RealmTerrainFeatureKind) {
  if (kind === 'forest-tree') {
    const geometry = new THREE.ConeGeometry(0.095, 0.34, 6, 1);
    geometry.translate(0, 0.17, 0);
    return geometry;
  }
  if (kind === 'ridge-outcrop') {
    const geometry = new THREE.DodecahedronGeometry(0.14, 0);
    geometry.scale(1.28, 0.7, 0.92);
    geometry.translate(0, 0.098, 0);
    return geometry;
  }
  if (kind === 'lake-sheen') {
    const geometry = new THREE.CircleGeometry(0.5, 12);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }
  const geometry = new THREE.BoxGeometry(0.12, 0.36, 0.12);
  geometry.translate(0, 0.18, 0);
  return geometry;
}

function materialForKind(kind: RealmTerrainFeatureKind): THREE.Material {
  if (kind === 'forest-tree') {
    return new THREE.MeshStandardMaterial({
      color: '#274936',
      roughness: 0.9,
      metalness: 0
    });
  }
  if (kind === 'ridge-outcrop') {
    return new THREE.MeshStandardMaterial({
      color: '#625f5b',
      roughness: 0.94,
      metalness: 0
    });
  }
  if (kind === 'lake-sheen') {
    return new THREE.MeshStandardMaterial({
      color: '#426b79',
      roughness: 0.36,
      metalness: 0.03,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
  }
  return new THREE.MeshStandardMaterial({
    color: '#667263',
    emissive: '#1d2a20',
    emissiveIntensity: 0.035,
    roughness: 0.86,
    metalness: 0.02
  });
}

export function createRealmTerrainFeatureLayers(
  data: RealmTerrainFeatureData,
  map: RealmTerrainMap,
  quality: RealmQualitySpec,
  hexSize = 1,
  placements: readonly TerrainStructurePlacement[] = EMPTY_TERRAIN_PLACEMENTS
): RealmTerrainFeatureLayers {
  const group = new THREE.Group();
  group.name = 'realm-semantic-terrain-features';
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  const meshes: THREE.InstancedMesh[] = [];
  // Heath bloom remains in the historical type union for replay/fixture
  // compatibility, but is no longer a live presentation primitive.
  const renderablePoints = data.points.filter((point) => point.kind !== 'heath-bloom');
  const counts = Object.freeze({ ...data.counts, 'heath-bloom': 0 });
  let disposed = false;

  try {
    (Object.keys(counts) as RealmTerrainFeatureKind[]).forEach((kind) => {
      const points = renderablePoints.filter((point) => point.kind === kind);
      if (points.length === 0) return;
      const geometry = geometryForKind(kind);
      const material = materialForKind(kind);
      let mesh: THREE.InstancedMesh;
      try {
        mesh = new THREE.InstancedMesh(geometry, material, points.length);
      } catch (error) {
        geometry.dispose();
        material.dispose();
        throw error;
      }
      meshes.push(mesh);
      mesh.name = `realm-${kind}s`;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      mesh.castShadow = quality.dynamicShadows && kind !== 'lake-sheen';
      mesh.receiveShadow = kind !== 'lake-sheen';
      mesh.renderOrder = kind === 'lake-sheen' ? 1 : 0;
      points.forEach((point, index) => {
        const lift = kind === 'lake-sheen' ? 0.012 : 0.003;
        position.set(
          point.world.x,
          terrainHeightAtWorld(map, point.world, hexSize, placements) + lift,
          point.world.z
        );
        quaternion.setFromAxisAngle(axis, point.rotation);
        const verticalScale = kind === 'forest-tree'
          ? point.scale * 1.06
          : kind === 'ancient-monolith'
            ? point.scale * 1.12
            : point.scale;
        if (kind === 'lake-sheen') {
          scale.set(point.scale * 0.94, 1, point.scale * 0.68);
        } else {
          scale.set(point.scale, verticalScale, point.scale);
        }
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      group.add(mesh);
    });
  } catch (error) {
    meshes.forEach((mesh) => {
      for (const dispose of [
        () => mesh.dispose(),
        () => mesh.geometry.dispose(),
        () => (mesh.material as THREE.Material).dispose()
      ]) {
        try {
          dispose();
        } catch {
          // Preserve the setup failure after best-effort partial cleanup.
        }
      }
    });
    throw error;
  }

  return Object.freeze({
    group,
    counts,
    drawCalls: meshes.length,
    instanceCount: renderablePoints.length,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      let firstError: unknown;
      meshes.forEach((mesh) => {
        for (const dispose of [
          () => mesh.dispose(),
          () => mesh.geometry.dispose(),
          () => (mesh.material as THREE.Material).dispose()
        ]) {
          try {
            dispose();
          } catch (error) {
            firstError ??= error;
          }
        }
      });
      if (firstError) throw firstError;
    }
  });
}

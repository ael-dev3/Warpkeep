import * as THREE from 'three';

import type { TerrainDecorationData, TerrainDecorationKind } from '../../game/map/terrainDecorations';
import { terrainHeightAtWorld } from '../../game/map/terrainHeight';
import {
  EMPTY_TERRAIN_PLACEMENTS,
  type TerrainStructurePlacement
} from '../../game/map/terrainPlacements';
import type { RealmTerrainMap } from '../../game/map/terrainTypes';
import type { RealmQualitySpec } from './realmQuality';

export type TerrainDecorationLayers = Readonly<{
  group: THREE.Group;
  counts: TerrainDecorationData['counts'];
  drawCalls: number;
  dispose: () => void;
}>;

function geometryForKind(kind: TerrainDecorationKind) {
  if (kind === 'stone') {
    const geometry = new THREE.DodecahedronGeometry(0.07, 0);
    geometry.scale(1, 0.62, 0.84);
    geometry.translate(0, 0.045, 0);
    return geometry;
  }
  const height = kind === 'green-tuft' ? 0.125 : 0.105;
  const halfWidth = kind === 'green-tuft' ? 0.026 : 0.03;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let blade = 0; blade < 4; blade += 1) {
    const angle = (blade * Math.PI) / 4;
    const acrossX = Math.cos(angle) * halfWidth;
    const acrossZ = Math.sin(angle) * halfWidth;
    const leanX = -Math.sin(angle) * height * 0.19;
    const leanZ = Math.cos(angle) * height * 0.19;
    const offset = positions.length / 3;
    positions.push(
      -acrossX, 0, -acrossZ,
      acrossX, 0, acrossZ,
      leanX, height, leanZ
    );
    indices.push(offset, offset + 1, offset + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function materialForKind(kind: TerrainDecorationKind) {
  if (kind === 'green-tuft') {
    return new THREE.MeshStandardMaterial({
      color: '#587238',
      roughness: 0.93,
      metalness: 0,
      side: THREE.DoubleSide
    });
  }
  if (kind === 'dry-tuft') {
    return new THREE.MeshStandardMaterial({
      color: '#a98d46',
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide
    });
  }
  return new THREE.MeshStandardMaterial({ color: '#77756b', roughness: 0.87, metalness: 0 });
}

export function createTerrainDecorationLayers(
  data: TerrainDecorationData,
  map: RealmTerrainMap,
  quality: RealmQualitySpec,
  hexSize = 1,
  placements: readonly TerrainStructurePlacement[] = EMPTY_TERRAIN_PLACEMENTS
): TerrainDecorationLayers {
  const group = new THREE.Group();
  group.name = 'hegemony-lowland-details';
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  const meshes: THREE.InstancedMesh[] = [];

  (['green-tuft', 'dry-tuft', 'stone'] as const).forEach((kind) => {
    const points = data.points.filter((point) => point.kind === kind);
    if (points.length === 0) return;
    const mesh = new THREE.InstancedMesh(
      geometryForKind(kind),
      materialForKind(kind),
      points.length
    );
    mesh.name = `terrain-${kind}s`;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.receiveShadow = kind === 'stone';
    mesh.castShadow = kind === 'stone' && quality.dynamicShadows;
    points.forEach((point, index) => {
      position.set(
        point.world.x,
        terrainHeightAtWorld(map, point.world, hexSize, placements) + 0.002,
        point.world.z
      );
      quaternion.setFromAxisAngle(axis, point.rotation);
      if (kind === 'stone') {
        scale.set(point.scale, point.scale, point.scale);
      } else {
        scale.set(0.78 + point.scale * 0.12, point.scale, 0.78 + point.scale * 0.12);
      }
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    meshes.push(mesh);
    group.add(mesh);
  });

  return {
    group,
    counts: data.counts,
    drawCalls: meshes.length,
    dispose: () => {
      meshes.forEach((mesh) => {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
    }
  };
}

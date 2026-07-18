import * as THREE from 'three';

import type { TerrainDecorationData } from '../../game/map/terrainDecorations';
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

/** The legacy tuft renderer is gone; this family now owns static stones only. */
export function createTerrainDecorationLayers(
  data: TerrainDecorationData,
  map: RealmTerrainMap,
  quality: RealmQualitySpec,
  hexSize = 1,
  placements: readonly TerrainStructurePlacement[] = EMPTY_TERRAIN_PLACEMENTS
): TerrainDecorationLayers {
  const group = new THREE.Group();
  group.name = 'hegemony-lowland-stones';
  if (data.points.length === 0) {
    return Object.freeze({ group, counts: data.counts, drawCalls: 0, dispose: () => {} });
  }
  const geometry = new THREE.DodecahedronGeometry(0.07, 0);
  geometry.scale(1, 0.62, 0.84);
  geometry.translate(0, 0.045, 0);
  const material = new THREE.MeshStandardMaterial({
    color: '#77756b',
    roughness: 0.87,
    metalness: 0
  });
  const mesh = new THREE.InstancedMesh(geometry, material, data.points.length);
  mesh.name = 'terrain-stones';
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.receiveShadow = true;
  mesh.castShadow = quality.dynamicShadows;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  data.points.forEach((point, index) => {
    position.set(
      point.world.x,
      terrainHeightAtWorld(map, point.world, hexSize, placements) + 0.002,
      point.world.z
    );
    rotation.setFromAxisAngle(axis, point.rotation);
    scale.set(point.scale, point.scale, point.scale);
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  group.add(mesh);
  let disposed = false;
  return Object.freeze({
    group,
    counts: data.counts,
    drawCalls: 1,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    }
  });
}

import * as THREE from 'three';

export type InnerKeepDrapedEllipsePlacement = Readonly<{
  center: Readonly<{ x: number; z: number }>;
  radiiMeters: readonly [number, number];
  rotationYRadians: number;
  surfaceLiftMeters: number;
}>;

/**
 * Builds one merged, world-space mesh whose vertices follow the analytic
 * terrain. Rings keep broad paths and wet-ground patches from hovering or
 * disappearing on the rolling lowlands.
 */
export function createInnerKeepTerrainDrapedEllipseGeometry(options: Readonly<{
  placements: readonly InnerKeepDrapedEllipsePlacement[];
  terrainHeightAt: (x: number, z: number) => number;
  angularSegments?: number;
  radialSegments?: number;
}>) {
  const angularSegments = Math.max(12, Math.floor(options.angularSegments ?? 24));
  const radialSegments = Math.max(2, Math.floor(options.radialSegments ?? 4));
  const positions: number[] = [];
  const indices: number[] = [];

  for (const placement of options.placements) {
    const vertexOffset = positions.length / 3;
    const cosine = Math.cos(placement.rotationYRadians);
    const sine = Math.sin(placement.rotationYRadians);
    const appendVertex = (localX: number, localZ: number) => {
      const x = placement.center.x + localX * cosine + localZ * sine;
      const z = placement.center.z - localX * sine + localZ * cosine;
      positions.push(
        x,
        options.terrainHeightAt(x, z) + placement.surfaceLiftMeters,
        z,
      );
    };
    appendVertex(0, 0);
    for (let ring = 1; ring <= radialSegments; ring += 1) {
      const radius = ring / radialSegments;
      for (let segment = 0; segment < angularSegments; segment += 1) {
        const angle = segment / angularSegments * Math.PI * 2;
        appendVertex(
          Math.cos(angle) * placement.radiiMeters[0] * radius,
          Math.sin(angle) * placement.radiiMeters[1] * radius,
        );
      }
    }

    for (let segment = 0; segment < angularSegments; segment += 1) {
      const current = vertexOffset + 1 + segment;
      const next = vertexOffset + 1 + (segment + 1) % angularSegments;
      indices.push(vertexOffset, next, current);
    }
    for (let ring = 1; ring < radialSegments; ring += 1) {
      const innerOffset = vertexOffset + 1 + (ring - 1) * angularSegments;
      const outerOffset = innerOffset + angularSegments;
      for (let segment = 0; segment < angularSegments; segment += 1) {
        const nextSegment = (segment + 1) % angularSegments;
        const innerCurrent = innerOffset + segment;
        const innerNext = innerOffset + nextSegment;
        const outerCurrent = outerOffset + segment;
        const outerNext = outerOffset + nextSegment;
        indices.push(
          innerCurrent,
          innerNext,
          outerCurrent,
          innerNext,
          outerNext,
          outerCurrent,
        );
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.innerKeepDrapedEllipseCount = options.placements.length;
  return geometry;
}

import * as THREE from 'three';
import type {
  BrutalistGlyphDefinition,
  BrutalistGlyphPoint
} from './brutalistGlyphs';

export type BrutalistGlyphGeometryOptions = {
  readonly height: number;
  readonly depth: number;
  readonly bevelSize: number;
  readonly bevelThickness: number;
  /** A numeric value offsets U; a tuple offsets U and V. */
  readonly uvOffset?: number | readonly [u: number, v: number];
};

function assertFiniteNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number.`);
  }
}

function appendLoop(
  path: THREE.Path,
  points: ReadonlyArray<BrutalistGlyphPoint>,
  height: number
) {
  points.forEach(([x, y], index) => {
    const pointX = x * height;
    const pointY = (y - 0.5) * height;
    if (index === 0) {
      path.moveTo(pointX, pointY);
    } else {
      path.lineTo(pointX, pointY);
    }
  });
  path.closePath();
}

function offsetUvs(
  geometry: THREE.BufferGeometry,
  uvOffset: BrutalistGlyphGeometryOptions['uvOffset']
) {
  if (uvOffset === undefined) {
    return;
  }

  const uOffset = typeof uvOffset === 'number' ? uvOffset : uvOffset[0];
  const vOffset = typeof uvOffset === 'number' ? 0 : uvOffset[1];
  if (!Number.isFinite(uOffset) || !Number.isFinite(vOffset)) {
    throw new RangeError('Glyph UV offsets must be finite numbers.');
  }

  const uvs = geometry.getAttribute('uv');
  if (!uvs) {
    return;
  }

  for (let index = 0; index < uvs.count; index += 1) {
    uvs.setXY(index, uvs.getX(index) + uOffset, uvs.getY(index) + vOffset);
  }
  uvs.needsUpdate = true;
}

/**
 * Extrudes one complete architectural glyph, including its counters, as one
 * geometry. All glyphs built with the same options share an identical,
 * centered front/back plane and a single controlled bevel treatment.
 */
export function createBrutalistGlyphGeometry(
  glyph: BrutalistGlyphDefinition,
  options: BrutalistGlyphGeometryOptions
): THREE.ExtrudeGeometry {
  const { height, depth, bevelSize, bevelThickness, uvOffset } = options;
  if (!Number.isFinite(height) || height <= 0) {
    throw new RangeError('Glyph height must be a finite positive number.');
  }
  if (!Number.isFinite(depth) || depth <= 0) {
    throw new RangeError('Glyph depth must be a finite positive number.');
  }
  assertFiniteNonNegative(bevelSize, 'Glyph bevel size');
  assertFiniteNonNegative(bevelThickness, 'Glyph bevel thickness');

  const shape = new THREE.Shape();
  appendLoop(shape, glyph.outer, height);
  glyph.holes.forEach((holePoints) => {
    const hole = new THREE.Path();
    appendLoop(hole, holePoints, height);
    shape.holes.push(hole);
  });

  const bevelEnabled = bevelSize > 0 && bevelThickness > 0;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: 1,
    bevelEnabled,
    bevelSegments: bevelEnabled ? 1 : 0,
    bevelSize,
    bevelThickness
  });

  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) {
    geometry.dispose();
    throw new Error('Unable to calculate architectural glyph bounds.');
  }
  geometry.translate(0, 0, -(bounds.min.z + bounds.max.z) * 0.5);
  offsetUvs(geometry, uvOffset);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

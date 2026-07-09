import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  brutalistGlyphCharacters,
  getBrutalistGlyph
} from '../src/components/title/brutalistGlyphs';
import { createBrutalistGlyphGeometry } from '../src/components/title/titleGeometry';

const geometryOptions = {
  height: 2.18,
  depth: 0.98,
  bevelSize: 0.012,
  bevelThickness: 0.018
} as const;

describe('Warpkeep unified glyph extrusion', () => {
  it('returns one finite ExtrudeGeometry per complete glyph', () => {
    brutalistGlyphCharacters.forEach((character) => {
      const geometry = createBrutalistGlyphGeometry(getBrutalistGlyph(character), geometryOptions);
      expect(geometry).toBeInstanceOf(THREE.ExtrudeGeometry);
      expect(Array.isArray(geometry.parameters.shapes)).toBe(false);
      const positions = geometry.getAttribute('position');
      expect(positions.count).toBeGreaterThan(0);
      for (let index = 0; index < positions.count; index += 1) {
        expect(Number.isFinite(positions.getX(index))).toBe(true);
        expect(Number.isFinite(positions.getY(index))).toBe(true);
        expect(Number.isFinite(positions.getZ(index))).toBe(true);
      }
      geometry.dispose();
    });
  });

  it('uses one common centered front/back plane and consistent cap height', () => {
    const zBounds: Array<readonly [number, number]> = [];
    brutalistGlyphCharacters.forEach((character) => {
      const geometry = createBrutalistGlyphGeometry(getBrutalistGlyph(character), geometryOptions);
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      expect(bounds).not.toBeNull();
      const beveledHalfHeight = geometryOptions.height * 0.5 + geometryOptions.bevelSize;
      expect(bounds!.min.y).toBeCloseTo(-beveledHalfHeight, 7);
      expect(bounds!.max.y).toBeCloseTo(beveledHalfHeight, 7);
      expect(bounds!.min.z + bounds!.max.z).toBeCloseTo(0, 10);
      zBounds.push([bounds!.min.z, bounds!.max.z]);
      geometry.dispose();
    });
    zBounds.slice(1).forEach(([minimum, maximum]) => {
      expect(minimum).toBeCloseTo(zBounds[0][0], 10);
      expect(maximum).toBeCloseTo(zBounds[0][1], 10);
    });
  });

  it('preserves front and side material groups for controlled architectural shading', () => {
    const geometry = createBrutalistGlyphGeometry(getBrutalistGlyph('E'), geometryOptions);
    expect(new Set(geometry.groups.map(({ materialIndex }) => materialIndex))).toEqual(new Set([0, 1]));
    geometry.dispose();
  });

  it('carves counters through the full A, R, and P extrusions', () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    for (const character of ['A', 'R', 'P'] as const) {
      const glyph = getBrutalistGlyph(character);
      const geometry = createBrutalistGlyphGeometry(glyph, geometryOptions);
      const mesh = new THREE.Mesh(geometry, material);
      const hole = glyph.holes[0];
      const holeCenter = hole.reduce(
        ([x, y], [pointX, pointY]) => [x + pointX / hole.length, y + pointY / hole.length] as const,
        [0, 0] as const
      );
      const raycaster = new THREE.Raycaster(
        new THREE.Vector3(holeCenter[0] * geometryOptions.height, (holeCenter[1] - 0.5) * geometryOptions.height, 2),
        new THREE.Vector3(0, 0, -1)
      );
      expect(raycaster.intersectObject(mesh)).toHaveLength(0);

      const solidPoint = character === 'A' ? [0.43, 0.9] as const : [0.08, 0.5] as const;
      raycaster.set(
        new THREE.Vector3(
          solidPoint[0] * geometryOptions.height,
          (solidPoint[1] - 0.5) * geometryOptions.height,
          2
        ),
        new THREE.Vector3(0, 0, -1)
      );
      expect(raycaster.intersectObject(mesh).length).toBeGreaterThan(0);
      geometry.dispose();
    }
    material.dispose();
  });

  it('supports deterministic U-only and two-axis UV offsets', () => {
    const base = createBrutalistGlyphGeometry(getBrutalistGlyph('W'), geometryOptions);
    const uOnly = createBrutalistGlyphGeometry(getBrutalistGlyph('W'), {
      ...geometryOptions,
      uvOffset: 0.25
    });
    const twoAxis = createBrutalistGlyphGeometry(getBrutalistGlyph('W'), {
      ...geometryOptions,
      uvOffset: [0.25, 0.5]
    });
    const baseUvs = base.getAttribute('uv');
    const uOnlyUvs = uOnly.getAttribute('uv');
    const twoAxisUvs = twoAxis.getAttribute('uv');
    expect(uOnlyUvs.getX(0) - baseUvs.getX(0)).toBeCloseTo(0.25, 7);
    expect(uOnlyUvs.getY(0) - baseUvs.getY(0)).toBeCloseTo(0, 7);
    expect(twoAxisUvs.getX(0) - baseUvs.getX(0)).toBeCloseTo(0.25, 7);
    expect(twoAxisUvs.getY(0) - baseUvs.getY(0)).toBeCloseTo(0.5, 7);
    base.dispose();
    uOnly.dispose();
    twoAxis.dispose();
  });

  it('rejects non-finite or physically invalid geometry settings', () => {
    const glyph = getBrutalistGlyph('W');
    expect(() => createBrutalistGlyphGeometry(glyph, { ...geometryOptions, height: 0 })).toThrow(/height/);
    expect(() => createBrutalistGlyphGeometry(glyph, { ...geometryOptions, depth: Number.NaN })).toThrow(/depth/);
    expect(() => createBrutalistGlyphGeometry(glyph, { ...geometryOptions, bevelSize: -1 })).toThrow(/bevel size/);
    expect(() => createBrutalistGlyphGeometry(glyph, { ...geometryOptions, uvOffset: [0, Infinity] })).toThrow(/UV offsets/);
  });
});

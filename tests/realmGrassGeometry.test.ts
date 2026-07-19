import { describe, expect, it } from 'vitest';

import {
  createLowPolyGrassGeometry,
  REALM_GRASS_RIBBONS,
  REALM_GRASS_TRIANGLES_PER_RIBBON,
  type RealmGrassGeometryProfile
} from '../src/components/realm/createLowPolyGrassGeometry';

const profiles: readonly RealmGrassGeometryProfile[] = ['high', 'balanced', 'reduced'];

describe('low-poly grass geometry', () => {
  it.each(profiles)('pins %s ribbon, triangle, and planted-root contracts', (profile) => {
    const geometry = createLowPolyGrassGeometry(profile);
    const ribbons = REALM_GRASS_RIBBONS[profile];
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const bladeData = geometry.getAttribute('grassBladeData');
    const index = geometry.getIndex();

    expect(geometry.userData.realmGrassGeometryProfile).toBe(profile);
    expect(geometry.userData.realmGrassTriangleCount)
      .toBe(ribbons * REALM_GRASS_TRIANGLES_PER_RIBBON);
    expect(positions.count).toBe(ribbons * 5);
    expect(normals.count).toBe(positions.count);
    expect(bladeData.itemSize).toBe(4);
    expect(bladeData.count).toBe(positions.count);
    expect(geometry.getAttribute('grassFlex')).toBeUndefined();
    expect(geometry.getAttribute('grassBladeAcross')).toBeUndefined();
    expect(geometry.getAttribute('grassBladeVertical')).toBeUndefined();
    expect(geometry.getAttribute('grassBladePhase')).toBeUndefined();
    expect(geometry.getAttribute('grassBladeStiffness')).toBeUndefined();
    expect(index?.count).toBe(ribbons * REALM_GRASS_TRIANGLES_PER_RIBBON * 3);
    expect(Array.from(index?.array ?? []).every((vertex) => (
      vertex >= 0 && vertex < positions.count
    ))).toBe(true);

    for (let ribbon = 0; ribbon < ribbons; ribbon += 1) {
      const base = ribbon * 5;
      expect(Array.from({ length: 5 }, (_, vertex) => bladeData.getX(base + vertex)))
        .toEqual([-1, 1, -1, 1, 0]);
      expect(bladeData.getY(base)).toBe(0);
      expect(bladeData.getY(base + 1)).toBe(0);
      expect(bladeData.getY(base + 2)).toBeCloseTo(0.56, 6);
      expect(bladeData.getY(base + 3)).toBeCloseTo(0.56, 6);
      expect(bladeData.getY(base + 4)).toBe(1);
      expect(new Set(Array.from({ length: 5 }, (_, vertex) => bladeData.getZ(base + vertex))).size)
        .toBe(1);
      expect(new Set(Array.from({ length: 5 }, (_, vertex) => bladeData.getW(base + vertex))).size)
        .toBe(1);
      expect(positions.getY(base)).toBe(0);
      expect(positions.getY(base + 1)).toBe(0);
      expect(positions.getY(base + 2)).toBeCloseTo(0.56, 6);
      expect(positions.getY(base + 3)).toBeCloseTo(0.56, 6);
      expect(positions.getY(base + 4)).toBe(1);
    }
    expect(Array.from({ length: normals.count }, (_, vertex) => normals.getY(vertex))
      .every((vertical) => vertical > 0.8)).toBe(true);
    expect(geometry.boundingBox).not.toBeNull();
    expect(geometry.boundingSphere).not.toBeNull();

    geometry.dispose();
  });

  it('keeps the exact quality triangle ladder', () => {
    const trianglesByQuality = Object.fromEntries(profiles.map((profile) => [
      profile,
      REALM_GRASS_RIBBONS[profile] * REALM_GRASS_TRIANGLES_PER_RIBBON
    ]));

    expect(trianglesByQuality).toEqual({ high: 27, balanced: 21, reduced: 15 });
  });
});

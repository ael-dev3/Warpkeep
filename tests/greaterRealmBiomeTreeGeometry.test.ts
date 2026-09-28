import { describe, expect, it } from 'vitest';

import { GREATER_REALM_BIOME_ID } from '../scripts/atlas/greater-realm-biomes';
import {
  biomeTreeTriangleCount,
  createBiomeTreeGeometry,
  isTreeBiome
} from '../src/greater-realm/biomeTreeGeometry';

describe('Greater Realm biome tree family', () => {
  it('covers every land and coastal biome with a unique geometric silhouette', () => {
    const land = Object.values(GREATER_REALM_BIOME_ID)
      .filter((id) => id >= 1 && (id <= 19 || id === 23));
    expect(land).toHaveLength(20);
    const silhouettes = new Set<string>();
    for (const id of land) {
      expect(isTreeBiome(id)).toBe(true);
      const geometry = createBiomeTreeGeometry(id, 'high');
      const positions = geometry.getAttribute('position');
      expect(geometry.getAttribute('color').count).toBe(positions.count);
      expect(geometry.getAttribute('normal').count).toBe(positions.count);
      expect(geometry.boundingBox).toBeNull();
      geometry.computeBoundingBox();
      expect(geometry.boundingBox!.min.y).toBe(0);
      silhouettes.add(Array.from(positions.array).join(','));
      geometry.dispose();
    }
    expect(silhouettes.size).toBe(land.length);
  });

  it('omits open water and keeps the mobile mesh below the legacy compact cap', () => {
    for (const id of [0, 20, 21, 22]) {
      expect(isTreeBiome(id)).toBe(false);
      expect(() => createBiomeTreeGeometry(id, 'reduced')).toThrow();
    }
    const land = Object.values(GREATER_REALM_BIOME_ID)
      .filter((id) => isTreeBiome(id));
    for (const id of land) {
      expect(biomeTreeTriangleCount(id, 'reduced')).toBeLessThanOrEqual(220);
    }
  });
});

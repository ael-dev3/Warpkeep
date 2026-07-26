import { describe, expect, it } from 'vitest';

import {
  createLowPolyGrassGeometry,
  REALM_GRASS_BLADES_PER_PATCH,
  REALM_GRASS_VARIANT_COUNTS
} from '../src/components/realm/createLowPolyGrassGeometry';
import {
  createRealmGrassMaterial,
  injectRealmGrassFragmentShader
} from '../src/components/realm/createRealmGrassMaterial';
import { REALM_GRASS_BIOME_PROFILES } from '../src/game/map/realmGrass';
import {
  REALM_GRASS_COLOR_BOUNDS,
  realmGrassColorIsWithinBounds,
  realmGrassColorMetrics
} from '../src/game/map/realmGrassPalette';

describe('natural broad grass visual contract', () => {
  it('keeps every patch root distributed across the planted local disk', () => {
    (Object.keys(REALM_GRASS_BLADES_PER_PATCH) as Array<'high' | 'balanced' | 'reduced'>).forEach((profile) => {
      const first = createLowPolyGrassGeometry(profile, 0);
      const second = createLowPolyGrassGeometry(profile, Math.min(1, REALM_GRASS_VARIANT_COUNTS[profile] - 1));
      const roots = first.userData.realmGrassRootPositions as readonly (readonly [number, number])[];
      const secondRoots = second.userData.realmGrassRootPositions as readonly (readonly [number, number])[];
      expect(roots).toHaveLength(REALM_GRASS_BLADES_PER_PATCH[profile]);
      expect(new Set(roots.map(([x, z]) => `${x.toFixed(5)},${z.toFixed(5)}`)).size).toBe(roots.length);
      roots.forEach(([x, z]) => {
        const radius = Math.hypot(x, z);
        expect(radius).toBeGreaterThanOrEqual(0.08);
        expect(radius).toBeLessThanOrEqual(0.46);
      });
      if (REALM_GRASS_VARIANT_COUNTS[profile] > 1) {
        expect(secondRoots).not.toEqual(roots);
      }
      first.dispose();
      second.dispose();
    });
  });

  it('stores restrained authored palettes in linear space within display-sRGB bounds', () => {
    const meadow = REALM_GRASS_BIOME_PROFILES.meadow.palette;
    expect(meadow).toHaveLength(4);
    expect(meadow[0]!.r).toBeCloseTo(0.2232, 3);
    meadow.forEach((colour) => expect(colour.g).toBeGreaterThan(colour.r));
    const heath = REALM_GRASS_BIOME_PROFILES.heath;
    expect(heath.palette).toHaveLength(3);
    heath.palette.forEach((colour) => {
      expect(colour.g).toBeGreaterThan(colour.r);
      expect(colour.g).toBeGreaterThan(colour.b);
    });
    expect(heath.highCandidateCount).toBe(22);
    expect(heath.completelyBareThreshold).toBe(0.39);
    expect(heath.retention).toBe(0.8);
    expect(REALM_GRASS_BIOME_PROFILES.lake.highCandidateCount).toBe(0);
    expect(REALM_GRASS_BIOME_PROFILES.lake.retention).toBe(0);

    const authoredColours = Object.values(REALM_GRASS_BIOME_PROFILES)
      .flatMap((profile) => profile.palette);
    expect(authoredColours.length).toBeGreaterThan(0);
    authoredColours.forEach((colour) => {
      const metrics = realmGrassColorMetrics(colour);
      expect(realmGrassColorIsWithinBounds(colour)).toBe(true);
      expect(metrics.displaySrgbSaturation)
        .toBeGreaterThanOrEqual(REALM_GRASS_COLOR_BOUNDS.displaySrgbSaturationMin);
      expect(metrics.displaySrgbSaturation)
        .toBeLessThanOrEqual(REALM_GRASS_COLOR_BOUNDS.displaySrgbSaturationMax);
      expect(metrics.linearLuminance)
        .toBeGreaterThanOrEqual(REALM_GRASS_COLOR_BOUNDS.linearLuminanceMin);
      expect(metrics.linearLuminance)
        .toBeLessThanOrEqual(REALM_GRASS_COLOR_BOUNDS.linearLuminanceMax);
    });
  });

  it('uses coverage alpha without switching the foliage layer to blending', () => {
    const fragment = injectRealmGrassFragmentShader([
      '#include <color_fragment>',
      '#include <alphahash_fragment>',
      '#include <opaque_fragment>'
    ].join('\n'));
    expect(fragment).toContain('realmGrassCoverage()');
    expect(fragment).toContain('diffuseColor.rgb *= mix(0.94, 1.015, grassVerticalLift);');
    expect(fragment).not.toContain('diffuseColor.rgb +=');
    expect(fragment).toContain('diffuseColor.a *= realmGrassCoverage();');
    const material = createRealmGrassMaterial(1, true, false).material;
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
    expect(material.depthTest).toBe(true);
    expect((material as typeof material & { alphaHash?: boolean }).alphaHash).toBe(true);
    expect((material as typeof material & { alphaToCoverage?: boolean }).alphaToCoverage).toBe(false);
    material.dispose();
  });
});

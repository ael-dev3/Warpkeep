import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CANONICAL_TIER_I_FOOD_SITES_V1 } from '../spacetimedb/src/foodSitePolicy';
import { CANONICAL_TIER_I_STONE_SITES_V1 } from '../spacetimedb/src/stoneSitePolicy';
import {
  CANONICAL_REALM,
  canonicalMetaForKey
} from '../spacetimedb/src/world';
import { GENESIS_WATER_REVISION_ENABLED_CELLS_V1 } from '../spacetimedb/src/waterRevision';
import { createRealmNorthernSnowField } from '../src/game/map/realmNorthernSnow';

// @ts-ignore Executable QA helpers are intentionally authored as native ESM.
import { NORTHERN_REACH_RENDERED_TARGET_MANIFEST, assertNorthernReachRenderedTarget } from '../scripts/qa-observer/northern-reach-rendered-evidence.mjs';

const source = readFileSync(
  resolve('scripts/qa-observer/northern-reach-rendered-evidence.mjs'),
  'utf8'
);

function observedTarget(
  target: (typeof NORTHERN_REACH_RENDERED_TARGET_MANIFEST)['transition']
) {
  return {
    coverage: target.expectedCoverage,
    terrainKind: target.expectedTerrainKind,
    passable: target.expectedPassable,
    water: target.expectedWater,
    resourceKind: target.neighborResource.kind,
    resourceSiteId: target.neighborResource.siteId,
    resourceQ: target.neighborResource.q,
    resourceR: target.neighborResource.r,
    resourceTier: 1,
    resourceActive: true
  };
}

describe('Northern Reach rendered target manifest', () => {
  it('freezes the reviewed transition and deep observation cells host-side', () => {
    expect(NORTHERN_REACH_RENDERED_TARGET_MANIFEST).toEqual({
      transition: {
        q: -13,
        r: -36,
        expectedCoverage: 0.5972293087793965,
        expectedTerrainKind: 'heath',
        expectedPassable: true,
        expectedWater: false,
        neighborResource: {
          kind: 'stone',
          siteId: 'genesis-001-tier1-stone-043',
          q: -13,
          r: -35
        }
      },
      deep: {
        q: -3,
        r: -38,
        expectedCoverage: 0.7696110263652703,
        expectedTerrainKind: 'forest',
        expectedPassable: true,
        expectedWater: false,
        neighborResource: {
          kind: 'food',
          siteId: 'genesis-001-tier1-food-044',
          q: -4,
          r: -38
        }
      }
    });
    expect(Object.isFrozen(NORTHERN_REACH_RENDERED_TARGET_MANIFEST)).toBe(true);
    for (const target of [
      NORTHERN_REACH_RENDERED_TARGET_MANIFEST.transition,
      NORTHERN_REACH_RENDERED_TARGET_MANIFEST.deep
    ]) {
      expect(Object.isFrozen(target)).toBe(true);
      expect(Object.isFrozen(target.neighborResource)).toBe(true);
    }
    expect(source).not.toContain('CANONICAL_WORLD_TILES');
    expect(source).not.toMatch(/\blet\s+target\b/u);
  });

  it('accepts only the exact reviewed target observations', () => {
    const transition = NORTHERN_REACH_RENDERED_TARGET_MANIFEST.transition;
    const deep = NORTHERN_REACH_RENDERED_TARGET_MANIFEST.deep;
    expect(() => assertNorthernReachRenderedTarget(
      transition,
      observedTarget(transition)
    )).not.toThrow();
    expect(() => assertNorthernReachRenderedTarget(
      deep,
      observedTarget(deep)
    )).not.toThrow();
  });

  it('matches the canonical snow, terrain, active-Water, and resource catalogs', () => {
    const water = new Set(
      GENESIS_WATER_REVISION_ENABLED_CELLS_V1.map((cell) => cell.cellKey)
    );
    const snow = createRealmNorthernSnowField({
      worldSeed: CANONICAL_REALM.numericSeed,
      hexSize: 1,
      playableRadius: CANONICAL_REALM.authoritativeRadius,
      renderRadius: CANONICAL_REALM.renderRadius
    });
    for (const target of [
      NORTHERN_REACH_RENDERED_TARGET_MANIFEST.transition,
      NORTHERN_REACH_RENDERED_TARGET_MANIFEST.deep
    ]) {
      const key = `${target.q},${target.r}`;
      const metadata = canonicalMetaForKey(key);
      const resources = target.neighborResource.kind === 'stone'
        ? CANONICAL_TIER_I_STONE_SITES_V1
        : CANONICAL_TIER_I_FOOD_SITES_V1;
      const resource = resources.find(
        (candidate) => candidate.siteId === target.neighborResource.siteId
      );
      expect(() => assertNorthernReachRenderedTarget(target, {
        coverage: snow.sampleCoord(target).coverage,
        terrainKind: metadata?.terrainKind,
        passable: metadata?.passable,
        water: water.has(key),
        resourceKind: target.neighborResource.kind,
        resourceSiteId: resource?.siteId,
        resourceQ: resource?.q,
        resourceR: resource?.r,
        resourceTier: resource?.tier,
        resourceActive: resource?.active
      })).not.toThrow();
    }
  });

  it('fails closed on coverage, passability, terrain, Water, or site drift', () => {
    const target = NORTHERN_REACH_RENDERED_TARGET_MANIFEST.transition;
    const observed = observedTarget(target);
    expect(() => assertNorthernReachRenderedTarget(target, {
      ...observed,
      coverage: observed.coverage + Number.EPSILON
    })).toThrow(/rendered target/i);
    expect(() => assertNorthernReachRenderedTarget(target, {
      ...observed,
      passable: false
    })).toThrow(/rendered target/i);
    expect(() => assertNorthernReachRenderedTarget(target, {
      ...observed,
      terrainKind: 'forest'
    })).toThrow(/rendered target/i);
    expect(() => assertNorthernReachRenderedTarget(target, {
      ...observed,
      water: true
    })).toThrow(/rendered target/i);
    expect(() => assertNorthernReachRenderedTarget(target, {
      ...observed,
      resourceSiteId: 'genesis-001-tier1-stone-044'
    })).toThrow(/rendered target/i);
    expect(() => assertNorthernReachRenderedTarget(target, {
      ...observed,
      resourceR: -34
    })).toThrow(/rendered target/i);
  });
});

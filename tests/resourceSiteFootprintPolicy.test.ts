import { describe, expect, it } from 'vitest';

import {
  HEGEMONY_EXPEDITION_ASSET_BUDGETS
} from '../src/components/realm/realmGoldNodeLayer';
import {
  HEGEMONY_FOOD_FARM_ASSET_BUDGETS
} from '../src/components/realm/realmFoodNodeLayer';
import {
  HEGEMONY_LOGGING_CAMP_ASSET_BUDGETS
} from '../src/components/realm/realmWoodNodeLayer';
import {
  HEGEMONY_TREE_RUNTIME_ASSET_BY_ID
} from '../src/components/realm/hegemonyTreeRuntimeAssets';
import { axialToWorld } from '../src/game/map/hexCoordinates';
import { HEGEMONY_MAIN_CASTLE } from '../src/game/map/hegemonyLandmarks';
import { CANONICAL_TIER_I_FOOD_SITES_V1 } from '../spacetimedb/src/foodSitePolicy';
import { CANONICAL_GENESIS_FOREST_INSTANCES_V1 } from '../spacetimedb/src/forestLayoutPolicy';
import { CANONICAL_TIER_I_GOLD_SITES_V1 } from '../spacetimedb/src/goldSitePolicy';
import { CANONICAL_TIER_I_WOOD_SITES_V1 } from '../spacetimedb/src/woodSitePolicy';
import { CANONICAL_CASTLE_SLOTS } from '../spacetimedb/src/world';

const FIXED_POINT_SCALE = 1_000_000;
const SCALE_BASIS_POINTS = 10_000;
const DISTANCE_EPSILON = 1e-9;

type Circle = Readonly<{
  id: string;
  x: number;
  z: number;
  radius: number;
}>;

function siteCircles(
  family: string,
  diameter: number,
  sites: readonly Readonly<{ siteId: string; q: number; r: number }>[]
): readonly Circle[] {
  return sites.map((site) => {
    const world = axialToWorld(site, 1);
    return Object.freeze({
      id: `${family}:${site.siteId}`,
      x: world.x,
      z: world.z,
      radius: diameter / 2
    });
  });
}

function forestCircles(): readonly Circle[] {
  return CANONICAL_GENESIS_FOREST_INSTANCES_V1.map((instance) => {
    const asset = HEGEMONY_TREE_RUNTIME_ASSET_BY_ID[instance.speciesId];
    expect(asset, `missing runtime tree asset ${instance.speciesId}`).toBeDefined();
    const maximumLodDiameter = Math.max(
      asset!.models.high.normalizedFootprintDiameter,
      asset!.models.balanced.normalizedFootprintDiameter,
      asset!.models.compact.normalizedFootprintDiameter
    );
    return Object.freeze({
      id: `forest:${instance.treeId}`,
      x: Number(instance.worldXMicrounits) / FIXED_POINT_SCALE,
      z: Number(instance.worldZMicrounits) / FIXED_POINT_SCALE,
      radius: maximumLodDiameter
        * (instance.scaleBasisPoints / SCALE_BASIS_POINTS)
        / 2
    });
  });
}

function castleCircles(): readonly Circle[] {
  return CANONICAL_CASTLE_SLOTS.map((slot, index) => {
    const world = axialToWorld(slot, 1);
    return Object.freeze({
      id: `castle-slot:${index + 1}`,
      x: world.x,
      z: world.z,
      // The landscape base is broader than the normalized keep and is the
      // true static presentation envelope that resource structures must clear.
      radius: HEGEMONY_MAIN_CASTLE.landscapeBaseFootprintDiameter / 2
    });
  });
}

function expectNoCircleOverlap(left: Circle, right: Circle) {
  const distance = Math.hypot(left.x - right.x, left.z - right.z);
  expect(
    distance + DISTANCE_EPSILON,
    `${left.id} overlaps ${right.id}: ${distance} < ${left.radius + right.radius}`
  ).toBeGreaterThanOrEqual(left.radius + right.radius);
}

describe('canonical resource structure footprint policy', () => {
  const resourceCircles = Object.freeze([
    ...siteCircles(
      'gold',
      HEGEMONY_EXPEDITION_ASSET_BUDGETS.goldMineTargetFootprint,
      CANONICAL_TIER_I_GOLD_SITES_V1
    ),
    ...siteCircles(
      'food',
      HEGEMONY_FOOD_FARM_ASSET_BUDGETS.wheatFarmTargetFootprint,
      CANONICAL_TIER_I_FOOD_SITES_V1
    ),
    ...siteCircles(
      'wood',
      HEGEMONY_LOGGING_CAMP_ASSET_BUDGETS.loggingCampTargetFootprint,
      CANONICAL_TIER_I_WOOD_SITES_V1
    )
  ]);

  it('keeps every structure outside every exact shared-tree and castle envelope', () => {
    const protectedCircles = [...forestCircles(), ...castleCircles()];
    for (const resource of resourceCircles) {
      for (const protectedCircle of protectedCircles) {
        expectNoCircleOverlap(resource, protectedCircle);
      }
    }
  });

  it('keeps all Gold, Food, and Wood structure envelopes mutually disjoint', () => {
    for (let leftIndex = 0; leftIndex < resourceCircles.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < resourceCircles.length;
        rightIndex += 1
      ) {
        expectNoCircleOverlap(
          resourceCircles[leftIndex]!,
          resourceCircles[rightIndex]!
        );
      }
    }
  });
});

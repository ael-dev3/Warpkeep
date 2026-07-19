import { CANONICAL_GENESIS_FOREST_INSTANCES_V1 } from './forestLayoutPolicy';
import {
  CANONICAL_CASTLE_SLOTS,
  hasCanonicalTravelCorridorClearance,
  hexDistance,
  hexKey,
  neighboringHexes,
} from './world';

export const RESOURCE_SITE_CASTLE_CLEARANCE_STEPS = 2;
export const RESOURCE_SITE_CORRIDOR_CLEARANCE_STEPS = 1;
export const RESOURCE_SITE_FOREST_CLEARANCE_STEPS = 1;

const canonicalForestClearanceTileKeys = new Set(
  CANONICAL_GENESIS_FOREST_INSTANCES_V1.flatMap(instance => [
    instance.tileKey,
    ...neighboringHexes(instance).map(neighbor => hexKey(neighbor.q, neighbor.r)),
  ]),
);

export function hasCanonicalForestClearance(
  candidate: Readonly<{ q: number; r: number }>,
): boolean {
  return canonicalForestClearanceTileKeys.has(hexKey(candidate.q, candidate.r));
}

export function hasCanonicalCastleClearance(
  candidate: Readonly<{ q: number; r: number }>,
): boolean {
  return CANONICAL_CASTLE_SLOTS.some(slot => (
    hexDistance(candidate, slot) <= RESOURCE_SITE_CASTLE_CLEARANCE_STEPS
  ));
}

/** Static cross-family placement boundary shared by Gold, Food, Wood, and Stone. */
export function hasCanonicalResourceSiteStaticConflict(
  candidate: Readonly<{ q: number; r: number }>,
): boolean {
  return hasCanonicalForestClearance(candidate)
    || hasCanonicalCastleClearance(candidate)
    || hasCanonicalTravelCorridorClearance(candidate, RESOURCE_SITE_CORRIDOR_CLEARANCE_STEPS);
}

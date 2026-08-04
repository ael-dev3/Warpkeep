import {
  INNER_KEEP_PRESENTATION_ASSETS,
  INNER_KEEP_PRESENTATION_PLACEMENTS,
} from './innerKeepPresentationLayoutPolicy';

export type InnerKeepFixedPlacementExclusion = Readonly<{
  placementId: string;
  center: Readonly<{ x: number; z: number }>;
  halfExtentsMeters: readonly [number, number];
  clearanceMarginMeters: number;
  isRoadSurface: boolean;
}>;

const PRESENTATION_ASSET_BY_ID = new Map(
  INNER_KEEP_PRESENTATION_ASSETS.map((asset) => [asset.assetId, asset] as const),
);

/**
 * Canonical physical X/Z bounds for every deterministic fixed authored
 * placement. Ecology, ambient navigation, and QA all consume this one derived
 * set so the rendered layout cannot drift from its collision proof.
 */
export const INNER_KEEP_FIXED_PLACEMENT_EXCLUSIONS:
readonly InnerKeepFixedPlacementExclusion[] = Object.freeze(
  INNER_KEEP_PRESENTATION_PLACEMENTS.flatMap((placement) => {
    if (placement.anchor !== 'fixed') return [];
    const asset = PRESENTATION_ASSET_BY_ID.get(placement.assetId);
    if (!asset) return [];
    return placement.instances.map((instance) => {
      const radians = instance.rotationMilliDegrees[1] / 1_000 * Math.PI / 180;
      const cosine = Math.abs(Math.cos(radians));
      const sine = Math.abs(Math.sin(radians));
      const unrotatedHalfX = asset.boundsMeters[0]
        * instance.scalePermille[0] / 2_000;
      const unrotatedHalfZ = asset.boundsMeters[2]
        * instance.scalePermille[2] / 2_000;
      return Object.freeze({
        placementId: instance.placementId,
        center: Object.freeze({
          x: instance.positionMeters[0],
          z: instance.positionMeters[2],
        }),
        halfExtentsMeters: Object.freeze([
          cosine * unrotatedHalfX + sine * unrotatedHalfZ,
          sine * unrotatedHalfX + cosine * unrotatedHalfZ,
        ] as const),
        clearanceMarginMeters: placement.footprint.clearanceMarginMeters,
        isRoadSurface: placement.collisionClearanceRole === 'road-surface',
      });
    });
  }),
);

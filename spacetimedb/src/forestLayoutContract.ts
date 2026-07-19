/**
 * Shared, browser-safe contract for the immutable Genesis 001 forest layout.
 *
 * This module deliberately contains only reviewed scalar policy values and no
 * SpacetimeDB server import. Browser code may use it to fail closed when a
 * public forest subscription is incomplete or belongs to another layout.
 */
export const GENESIS_FOREST_LAYOUT_V1_REALM_ID = 'GENESIS_001';
export const GENESIS_FOREST_LAYOUT_V1_VERSION = 1;
export const GENESIS_FOREST_LAYOUT_V1_POLICY_VERSION =
  'genesis-001-shared-forest-layout-v1';
export const GENESIS_FOREST_LAYOUT_V1_TREE_COUNT = 210;

/** Fixed-point transforms are intentionally shared rather than client-random. */
export const GENESIS_FOREST_LAYOUT_V1_TRANSFORM_MICROUNITS = 1_000_000;
export const GENESIS_FOREST_LAYOUT_V1_ROTATION_MILLIDEGREE_SCALE = 1_000;
export const GENESIS_FOREST_LAYOUT_V1_SCALE_BASIS_POINTS = 10_000;

/** SHA-256 over the line-oriented canonical instance records, excluding seed time. */
export const GENESIS_FOREST_LAYOUT_V1_DIGEST =
  '8a7e7c290e319f9495c3ca2485114659a52f84411e7864a4ed0127ac248b52b2';

/**
 * SHA-256 over the reviewed ordered species identifier catalog. Runtime GLB
 * integrity remains separately pinned by the browser's local asset catalog.
 */
export const GENESIS_FOREST_LAYOUT_V1_ASSET_CATALOG_DIGEST =
  'e544942ee29a61215c2afce360b8a19f943ff703957e84b20973452f1b93cde7';

export const GENESIS_FOREST_LAYOUT_V1_HABITATS = Object.freeze([
  'grove',
  'forest',
  'fringe',
] as const);

export type GenesisForestLayoutV1Habitat =
  (typeof GENESIS_FOREST_LAYOUT_V1_HABITATS)[number];

export function isGenesisForestLayoutV1Habitat(
  value: unknown,
): value is GenesisForestLayoutV1Habitat {
  return typeof value === 'string'
    && (GENESIS_FOREST_LAYOUT_V1_HABITATS as readonly string[]).includes(value);
}

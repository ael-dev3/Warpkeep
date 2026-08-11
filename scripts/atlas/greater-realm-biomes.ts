/**
 * Stable private-atlas visual classification identifiers.
 *
 * These numeric values are serialized into Greater Realm candidate authority.
 * Renaming a key is a format change; changing a value is an authority-breaking
 * migration. Keep the catalogs complete and ordered by ID so omissions and
 * accidental reuse are mechanically testable.
 */
export const GREATER_REALM_BIOME_ID = Object.freeze({
  UNCLASSIFIED: 0,
  TEMPERATE_LOWLAND: 1,
  FLOWER_MEADOW: 2,
  OAK_FOREST: 3,
  OLD_GROWTH_FOREST: 4,
  PINE_FOREST: 5,
  ALPINE_SNOW: 6,
  TUNDRA: 7,
  HEATHLAND: 8,
  SAVANNA: 9,
  WARM_SCRUB: 10,
  DUNE_DESERT: 11,
  ROCKY_DESERT: 12,
  RED_BADLANDS: 13,
  VOLCANIC_UPLAND: 14,
  ASH_MEADOW: 15,
  FRESHWATER_MARSH: 16,
  SALT_MARSH: 17,
  RIVER_DELTA: 18,
  ROCKY_HIGHLAND: 19,
  SALTWATER: 20,
  LAKE: 21,
  RIVER_STREAM: 22,
  COASTAL: 23,
} as const);

export const GREATER_REALM_LANDFORM_ID = Object.freeze({
  COASTAL_PLAIN: 0,
  FLOODPLAIN: 1,
  WATERCOURSE: 2,
  LOWLAND: 3,
  ROLLING_LOWLAND: 4,
  HILL: 5,
  HIGHLAND: 6,
  MOUNTAIN: 7,
  CANYON: 8,
  BADLANDS: 9,
  LAKE_BASIN: 10,
  DELTA: 11,
  BASIN: 12,
  DUNE: 13,
  ALPINE_PLATEAU: 14,
  GLACIAL_VALLEY: 15,
  ISLAND_SHELF: 16,
  SEA_CLIFF: 17,
} as const);

export type GreaterRealmBiomeId =
  (typeof GREATER_REALM_BIOME_ID)[keyof typeof GREATER_REALM_BIOME_ID];

export type GreaterRealmLandformId =
  (typeof GREATER_REALM_LANDFORM_ID)[keyof typeof GREATER_REALM_LANDFORM_ID];

export type GreaterRealmBiomeCatalogEntry = Readonly<{
  id: GreaterRealmBiomeId;
  key: string;
  label: string;
}>;

export type GreaterRealmLandformCatalogEntry = Readonly<{
  id: GreaterRealmLandformId;
  key: string;
  label: string;
}>;

function biome(
  id: GreaterRealmBiomeId,
  key: string,
  label: string,
): GreaterRealmBiomeCatalogEntry {
  return Object.freeze({ id, key, label });
}

function landform(
  id: GreaterRealmLandformId,
  key: string,
  label: string,
): GreaterRealmLandformCatalogEntry {
  return Object.freeze({ id, key, label });
}

export const GREATER_REALM_BIOME_CATALOG = Object.freeze([
  biome(GREATER_REALM_BIOME_ID.UNCLASSIFIED, "unclassified", "Unclassified"),
  biome(
    GREATER_REALM_BIOME_ID.TEMPERATE_LOWLAND,
    "temperate-lowland",
    "Temperate lowland",
  ),
  biome(GREATER_REALM_BIOME_ID.FLOWER_MEADOW, "flower-meadow", "Flower meadow"),
  biome(GREATER_REALM_BIOME_ID.OAK_FOREST, "oak-forest", "Oak forest"),
  biome(
    GREATER_REALM_BIOME_ID.OLD_GROWTH_FOREST,
    "old-growth-forest",
    "Old-growth forest",
  ),
  biome(GREATER_REALM_BIOME_ID.PINE_FOREST, "pine-forest", "Pine forest"),
  biome(GREATER_REALM_BIOME_ID.ALPINE_SNOW, "alpine-snow", "Alpine snow"),
  biome(GREATER_REALM_BIOME_ID.TUNDRA, "tundra", "Tundra"),
  biome(GREATER_REALM_BIOME_ID.HEATHLAND, "heathland", "Heathland"),
  biome(GREATER_REALM_BIOME_ID.SAVANNA, "savanna", "Savanna"),
  biome(GREATER_REALM_BIOME_ID.WARM_SCRUB, "warm-scrub", "Warm scrub"),
  biome(GREATER_REALM_BIOME_ID.DUNE_DESERT, "dune-desert", "Dune desert"),
  biome(GREATER_REALM_BIOME_ID.ROCKY_DESERT, "rocky-desert", "Rocky desert"),
  biome(GREATER_REALM_BIOME_ID.RED_BADLANDS, "red-badlands", "Red badlands"),
  biome(
    GREATER_REALM_BIOME_ID.VOLCANIC_UPLAND,
    "volcanic-upland",
    "Volcanic upland",
  ),
  biome(GREATER_REALM_BIOME_ID.ASH_MEADOW, "ash-meadow", "Ash meadow"),
  biome(
    GREATER_REALM_BIOME_ID.FRESHWATER_MARSH,
    "freshwater-marsh",
    "Freshwater marsh",
  ),
  biome(GREATER_REALM_BIOME_ID.SALT_MARSH, "salt-marsh", "Salt marsh"),
  biome(GREATER_REALM_BIOME_ID.RIVER_DELTA, "river-delta", "River delta"),
  biome(
    GREATER_REALM_BIOME_ID.ROCKY_HIGHLAND,
    "rocky-highland",
    "Rocky highland",
  ),
  biome(GREATER_REALM_BIOME_ID.SALTWATER, "saltwater", "Saltwater"),
  biome(GREATER_REALM_BIOME_ID.LAKE, "lake", "Lake"),
  biome(GREATER_REALM_BIOME_ID.RIVER_STREAM, "river-stream", "River or stream"),
  biome(GREATER_REALM_BIOME_ID.COASTAL, "coastal", "Coastal"),
] satisfies readonly GreaterRealmBiomeCatalogEntry[]);

export const GREATER_REALM_LANDFORM_CATALOG = Object.freeze([
  landform(
    GREATER_REALM_LANDFORM_ID.COASTAL_PLAIN,
    "coastal-plain",
    "Coastal plain",
  ),
  landform(GREATER_REALM_LANDFORM_ID.FLOODPLAIN, "floodplain", "Floodplain"),
  landform(GREATER_REALM_LANDFORM_ID.WATERCOURSE, "watercourse", "Watercourse"),
  landform(GREATER_REALM_LANDFORM_ID.LOWLAND, "lowland", "Lowland"),
  landform(
    GREATER_REALM_LANDFORM_ID.ROLLING_LOWLAND,
    "rolling-lowland",
    "Rolling lowland",
  ),
  landform(GREATER_REALM_LANDFORM_ID.HILL, "hill", "Hill"),
  landform(GREATER_REALM_LANDFORM_ID.HIGHLAND, "highland", "Highland"),
  landform(GREATER_REALM_LANDFORM_ID.MOUNTAIN, "mountain", "Mountain"),
  landform(GREATER_REALM_LANDFORM_ID.CANYON, "canyon", "Canyon"),
  landform(GREATER_REALM_LANDFORM_ID.BADLANDS, "badlands", "Badlands"),
  landform(GREATER_REALM_LANDFORM_ID.LAKE_BASIN, "lake-basin", "Lake basin"),
  landform(GREATER_REALM_LANDFORM_ID.DELTA, "delta", "Delta"),
  landform(GREATER_REALM_LANDFORM_ID.BASIN, "basin", "Basin"),
  landform(GREATER_REALM_LANDFORM_ID.DUNE, "dune", "Dune"),
  landform(
    GREATER_REALM_LANDFORM_ID.ALPINE_PLATEAU,
    "alpine-plateau",
    "Alpine plateau",
  ),
  landform(
    GREATER_REALM_LANDFORM_ID.GLACIAL_VALLEY,
    "glacial-valley",
    "Glacial valley",
  ),
  landform(
    GREATER_REALM_LANDFORM_ID.ISLAND_SHELF,
    "island-shelf",
    "Island shelf",
  ),
  landform(GREATER_REALM_LANDFORM_ID.SEA_CLIFF, "sea-cliff", "Sea cliff"),
] satisfies readonly GreaterRealmLandformCatalogEntry[]);

export const GREATER_REALM_BIOME_CLASS_COUNT =
  GREATER_REALM_BIOME_CATALOG.length;
export const GREATER_REALM_LANDFORM_CLASS_COUNT =
  GREATER_REALM_LANDFORM_CATALOG.length;

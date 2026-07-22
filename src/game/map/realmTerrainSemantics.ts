import { hexKey } from './hexCoordinates';
import type { RealmTerrainSurface } from './realmTerrainSurface';

export const REALM_TERRAIN_KINDS = Object.freeze([
  'lowland',
  'meadow',
  'forest',
  'heath',
  'ridge',
  'lake',
  'ancient-stone'
] as const);

export type RealmTerrainKind = (typeof REALM_TERRAIN_KINDS)[number];

export const REALM_STATIC_CONTENT_KINDS = Object.freeze([
  'empty',
  'castle-slot',
  'resource-capable',
  'core-capable',
  'scenic-blocker',
  'reserve'
] as const);

export type RealmStaticContentKind = (typeof REALM_STATIC_CONTENT_KINDS)[number];

export type RealmTerrainSemanticRow = Readonly<{
  tileKey: string;
  terrainKind: string;
  staticContentKind: string;
  /** Present on canonical public metadata; optional for renderer-only fixtures. */
  passable?: boolean;
}>;

const TERRAIN_KIND_SET = new Set<string>(REALM_TERRAIN_KINDS);
const STATIC_CONTENT_KIND_SET = new Set<string>(REALM_STATIC_CONTENT_KINDS);

const TERRAIN_LABELS: Readonly<Record<RealmTerrainKind, string>> = Object.freeze({
  lowland: 'Temperate Lowlands',
  meadow: 'Sunlit Meadow',
  forest: 'Lowland Forest',
  heath: 'Amethyst Heath',
  ridge: 'Weathered Ridge',
  lake: 'Stillwater Lake',
  'ancient-stone': 'Ancient Stone'
});

export function isRealmTerrainKind(value: unknown): value is RealmTerrainKind {
  return typeof value === 'string' && TERRAIN_KIND_SET.has(value);
}

export function isRealmStaticContentKind(value: unknown): value is RealmStaticContentKind {
  return typeof value === 'string' && STATIC_CONTENT_KIND_SET.has(value);
}

export function realmTerrainLabel(kind: RealmTerrainKind | undefined) {
  return kind === undefined ? 'Temperate Lowlands' : TERRAIN_LABELS[kind];
}

/**
 * Build the exact renderer-facing semantic index from an already canonical
 * snapshot. The scene still validates the closed seven-kind shape and full
 * playable-cell coverage so a direct/test caller cannot silently flatten an
 * incomplete world into generic terrain.
 */
export function indexRealmTerrainSemantics(
  surface: RealmTerrainSurface,
  rows: readonly RealmTerrainSemanticRow[]
): Readonly<{
  terrainKindsByKey: ReadonlyMap<string, RealmTerrainKind>;
  castleSlotKeys: ReadonlySet<string>;
  terrainKindCounts: Readonly<Record<RealmTerrainKind, number>>;
}> {
  if (rows.length !== surface.playableKeys.size) {
    throw new Error('REALM_TERRAIN_SEMANTIC_COVERAGE_INVALID');
  }
  const indexed = new Map<string, RealmTerrainKind>();
  const castleSlotKeys = new Set<string>();
  rows.forEach((row) => {
    if (
      !surface.playableKeys.has(row.tileKey)
      || indexed.has(row.tileKey)
      || !isRealmTerrainKind(row.terrainKind)
      || !isRealmStaticContentKind(row.staticContentKind)
    ) throw new Error('REALM_TERRAIN_SEMANTIC_ROW_INVALID');
    indexed.set(row.tileKey, row.terrainKind);
    if (row.staticContentKind === 'castle-slot') castleSlotKeys.add(row.tileKey);
  });
  for (const cell of surface.playableMap.cells) {
    if (!indexed.has(hexKey(cell.coord))) {
      throw new Error('REALM_TERRAIN_SEMANTIC_COVERAGE_INVALID');
    }
  }
  return Object.freeze({
    terrainKindsByKey: indexed,
    castleSlotKeys,
    terrainKindCounts: realmTerrainKindCounts(indexed)
  });
}

export function realmTerrainKindCounts(
  indexed: ReadonlyMap<string, RealmTerrainKind>
): Readonly<Record<RealmTerrainKind, number>> {
  const counts: Record<RealmTerrainKind, number> = {
    lowland: 0,
    meadow: 0,
    forest: 0,
    heath: 0,
    ridge: 0,
    lake: 0,
    'ancient-stone': 0
  };
  indexed.forEach((kind) => { counts[kind] += 1; });
  return Object.freeze(counts);
}

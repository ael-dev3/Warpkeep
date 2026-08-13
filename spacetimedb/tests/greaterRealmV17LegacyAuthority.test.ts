import assert from 'node:assert/strict';
import test from 'node:test';

import { CANONICAL_TIER_I_FOOD_SITES_V1 } from '../src/foodSitePolicy';
import { CANONICAL_TIER_I_GOLD_SITES_V1 } from '../src/goldSitePolicy';
import {
  GREATER_REALM_LEGACY_WATER_BODY_COUNT,
  GREATER_REALM_LEGACY_WATER_CELL_COUNT,
  deriveGreaterRealmLegacyRotation,
  emptyGreaterRealmLegacyResourceVerificationV1,
  emptyGreaterRealmLegacyWaterBodyVerificationV1,
  hasGreaterRealmHydrologyTerminalOutletV1,
  isGreaterRealmLegacyAuthorityCoordinateV1,
  isGreaterRealmLegacyCoordinateV1,
  isGreaterRealmLegacyTerminalOutletNeighborV1,
  recordGreaterRealmLegacyResourceVerificationV1,
  recordGreaterRealmLegacyWaterBodyVerificationV1,
  requireGreaterRealmLegacyResourceCatalogV1,
  requireGreaterRealmHydrologyLinkV1,
  requireGreaterRealmHydrologyTerminalOutletV1,
  requireGreaterRealmLegacyCellAuthorityV1,
  requireGreaterRealmLegacyCoverageCompleteV1,
  requireGreaterRealmLegacyResourceVerificationCompleteV1,
  requireGreaterRealmLegacyWaterVerificationCompleteV1,
  rotateGreaterRealmLegacyCoordinate,
  type GreaterRealmLegacyCellProjectionV1,
} from '../src/greaterRealmV17LegacyAuthority';
import {
  GREATER_REALM_HYDRO_REGIME,
  GREATER_REALM_TRAVEL_CLASS,
  greaterRealmV17ErrorCode,
} from '../src/greaterRealmV17Policy';
import { CANONICAL_TIER_I_STONE_SITES_V1 } from '../src/stoneSitePolicy';
import { GENESIS_WATER_REVISION_ENABLED_CELLS_V1 } from '../src/waterRevision';
import {
  CANONICAL_WORLD_TILES,
  GENESIS_AUTHORITATIVE_CELL_COUNT,
  canonicalMetaForKey,
  canonicalTileForKey,
} from '../src/world';
import { CANONICAL_TIER_I_WOOD_SITES_V1 } from '../src/woodSitePolicy';

const ROTATION = 2;
const OFFSET_Q = 700;
const OFFSET_R = -311;
const DIRECTIONS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] as const;
const WATER_BY_KEY = new Map(
  GENESIS_WATER_REVISION_ENABLED_CELLS_V1.map(row => [row.cellKey, row] as const),
);
const VISUAL_CLASS: Readonly<Record<string, readonly [number, number]>> = {
  lowland: [1, 3],
  meadow: [2, 3],
  forest: [4, 3],
  heath: [9, 3],
  ridge: [19, 6],
  lake: [1, 3],
  'ancient-stone': [19, 5],
};

function code(action: () => void): string | undefined {
  try {
    action();
  } catch (error) {
    return greaterRealmV17ErrorCode(error);
  }
  return undefined;
}

function projectionFor(q: number, r: number): GreaterRealmLegacyCellProjectionV1 {
  const key = `${q},${r}`;
  const metadata = canonicalMetaForKey(key);
  const water = WATER_BY_KEY.get(key);
  const rotated = rotateGreaterRealmLegacyCoordinate(q, r, ROTATION);
  const travelClass = GREATER_REALM_TRAVEL_CLASS.NONE;
  const passable = metadata?.passable === true && water === undefined;
  const baseVisual = metadata === undefined ? [0, 0] as const : VISUAL_CLASS[metadata.terrainKind]!;
  const biomeClass = water?.regime === 'ocean' ? 20 : water?.regime === 'lake' ? 21
    : water?.regime === 'river' ? 22 : baseVisual[0];
  const landformClass = water?.regime === 'ocean' ? 16 : water?.regime === 'lake' ? 10
    : water?.regime === 'river' ? 2 : baseVisual[1];
  let hydroFlowDirection: number | undefined;
  if (water?.downstreamWaterCellKey !== undefined) {
    const downstream = WATER_BY_KEY.get(water.downstreamWaterCellKey)!;
    const target = rotateGreaterRealmLegacyCoordinate(downstream.q, downstream.r, ROTATION);
    hydroFlowDirection = DIRECTIONS.findIndex(
      direction => direction[0] === target.q - rotated.q && direction[1] === target.r - rotated.r,
    );
  }
  return {
    regionId: 'T1_LOWLANDS',
    localQ: q,
    localR: r,
    atlasQ: rotated.q + OFFSET_Q,
    atlasR: rotated.r + OFFSET_R,
    passable,
    movementCost: passable ? metadata!.movementCost : 1_000_000,
    geologicalBarrierBand: 0,
    biomeClass,
    landformClass,
    yieldClass: !passable || metadata === undefined || !metadata.passable
      ? 0
      : metadata.staticContentKind === 'resource-capable'
        || metadata.staticContentKind === 'core-capable'
        ? 2
        : 1,
    hydroRegime: water?.regime === 'ocean' ? GREATER_REALM_HYDRO_REGIME.OCEAN
      : water?.regime === 'lake' ? GREATER_REALM_HYDRO_REGIME.LAKE
        : water?.regime === 'river' ? GREATER_REALM_HYDRO_REGIME.RIVER
          : GREATER_REALM_HYDRO_REGIME.DRY,
    ...(water === undefined ? {} : { hydroBodyId: `GRW-${water.bodyId}` }),
    hydroDepthClass: water?.depthClass ?? 0,
    hydroSurfaceMilli: water?.surfaceLevelMilli ?? -0x8000_0000,
    ...(hydroFlowDirection === undefined ? {} : { hydroFlowDirection }),
    flowAccumulation: BigInt(water?.flowAccumulation ?? 0),
    hydrologyRevision: water?.generationVersion ?? 0,
    travelClass,
  };
}

test('the server-owned Lowlands authority contains the exact world and active Water sets', () => {
  assert.equal(CANONICAL_WORLD_TILES.length, GENESIS_AUTHORITATIVE_CELL_COUNT);
  assert.equal(GENESIS_AUTHORITATIVE_CELL_COUNT, 10_000);
  assert.equal(GREATER_REALM_LEGACY_WATER_CELL_COUNT, 3_271);
  assert.equal(GREATER_REALM_LEGACY_WATER_BODY_COUNT, 13);
  assert.equal(new Set(CANONICAL_WORLD_TILES.map(tile => tile.key)).size, 10_000);
  for (const tile of CANONICAL_WORLD_TILES) {
    assert.equal(isGreaterRealmLegacyCoordinateV1(tile.q, tile.r), true);
  }
  for (const water of GENESIS_WATER_REVISION_ENABLED_CELLS_V1) {
    assert.equal(isGreaterRealmLegacyAuthorityCoordinateV1(water.q, water.r), true);
  }
  assert.equal(isGreaterRealmLegacyAuthorityCoordinateV1(999_999, -999_999), false);
  requireGreaterRealmLegacyCoverageCompleteV1(10_000, 3_271, 5);
  assert.equal(
    code(() => requireGreaterRealmLegacyCoverageCompleteV1(9_999, 3_271, 5)),
    'GREATER_REALM_LEGACY_CELL_SET_INVALID',
  );
  assert.equal(
    code(() => requireGreaterRealmLegacyCoverageCompleteV1(10_000, 3_270, 5)),
    'GREATER_REALM_LEGACY_CELL_SET_INVALID',
  );
});

test('Lowlands rows bind one transform and frozen terrain classifications', () => {
  const impassableDry = CANONICAL_WORLD_TILES.find(tile => {
    const meta = canonicalMetaForKey(tile.key);
    return meta?.passable === false && !WATER_BY_KEY.has(tile.key);
  })!;
  const row = projectionFor(impassableDry.q, impassableDry.r);
  assert.equal(row.passable, false);
  assert.equal(
    deriveGreaterRealmLegacyRotation(
      row.localQ,
      row.localR,
      row.atlasQ,
      row.atlasR,
      OFFSET_Q,
      OFFSET_R,
    ),
    ROTATION,
  );
  const result = requireGreaterRealmLegacyCellAuthorityV1(row, ROTATION, OFFSET_Q, OFFSET_R);
  assert.equal(result.canonicalWorld, true);
  assert.equal(result.legacyWater, false);
  assert.equal(result.terminalFlow, false);
  assert.equal(result.waterBodyOrdinal, undefined);
  assert.equal(
    code(() => requireGreaterRealmLegacyCellAuthorityV1(
      { ...row, atlasQ: row.atlasQ + 1 },
      ROTATION,
      OFFSET_Q,
      OFFSET_R,
    )),
    'GREATER_REALM_LEGACY_TRANSFORM_MISMATCH',
  );
  assert.equal(
    code(() => requireGreaterRealmLegacyCellAuthorityV1(
      { ...row, biomeClass: row.biomeClass + 1 },
      ROTATION,
      OFFSET_Q,
      OFFSET_R,
    )),
    'GREATER_REALM_LEGACY_CELL_CLASSIFICATION_MISMATCH',
  );
  assert.equal(
    code(() => requireGreaterRealmLegacyCellAuthorityV1(
      { ...row, movementCost: 1 },
      ROTATION,
      OFFSET_Q,
      OFFSET_R,
    )),
    'GREATER_REALM_LEGACY_CELL_CLASSIFICATION_MISMATCH',
  );
});

test('frozen river directions and terminals are exact and ocean remaps are included', () => {
  const river = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.find(
    row => row.regime === 'river' && row.downstreamWaterCellKey !== undefined,
  )!;
  const riverResult = requireGreaterRealmLegacyCellAuthorityV1(
    projectionFor(river.q, river.r),
    ROTATION,
    OFFSET_Q,
    OFFSET_R,
  );
  assert.equal(riverResult.legacyWater, true);
  assert.equal(
    code(() => requireGreaterRealmLegacyCellAuthorityV1(
      { ...projectionFor(river.q, river.r), flowAccumulation: BigInt(river.flowAccumulation + 1) },
      ROTATION,
      OFFSET_Q,
      OFFSET_R,
    )),
    'GREATER_REALM_LEGACY_CELL_CLASSIFICATION_MISMATCH',
  );
  const terminal = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.find(
    row => row.regime === 'river' && row.downstreamWaterCellKey === undefined,
  )!;
  const terminalRow = projectionFor(terminal.q, terminal.r);
  assert.equal(
    requireGreaterRealmLegacyCellAuthorityV1(terminalRow, ROTATION, OFFSET_Q, OFFSET_R)
      .terminalFlow,
    true,
  );
  assert.equal(
    code(() => requireGreaterRealmLegacyCellAuthorityV1(
      { ...terminalRow, hydroFlowDirection: 0 },
      ROTATION,
      OFFSET_Q,
      OFFSET_R,
    )),
    'GREATER_REALM_LEGACY_HYDROLOGY_DIRECTION_INVALID',
  );
  assert.equal(
    code(() => requireGreaterRealmLegacyCellAuthorityV1(
      {
        ...projectionFor(river.q, river.r),
        passable: true,
        travelClass: GREATER_REALM_TRAVEL_CLASS.FORD,
        movementCost: canonicalMetaForKey(river.cellKey)?.movementCost ?? 1,
      },
      ROTATION,
      OFFSET_Q,
      OFFSET_R,
    )),
    'GREATER_REALM_LEGACY_CELL_CLASSIFICATION_MISMATCH',
  );
  const ocean = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.find(
    row => row.regime === 'ocean' && canonicalTileForKey(row.cellKey) === undefined,
  )!;
  const oceanResult = requireGreaterRealmLegacyCellAuthorityV1(
    projectionFor(ocean.q, ocean.r),
    ROTATION,
    OFFSET_Q,
    OFFSET_R,
  );
  assert.equal(oceanResult.canonicalWorld, false);
  assert.equal(oceanResult.legacyWater, true);
  assert.notEqual(oceanResult.waterBodyOrdinal, riverResult.waterBodyOrdinal);

  let waterState = emptyGreaterRealmLegacyWaterBodyVerificationV1();
  waterState = recordGreaterRealmLegacyWaterBodyVerificationV1(
    waterState,
    riverResult.waterBodyOrdinal!,
    'GRW-RIVER',
  );
  assert.equal(
    code(() => recordGreaterRealmLegacyWaterBodyVerificationV1(
      waterState,
      oceanResult.waterBodyOrdinal!,
      'GRW-RIVER',
    )),
    'GREATER_REALM_LEGACY_WATER_BODY_REMAP_INVALID',
  );
  for (let ordinal = 0; ordinal < GREATER_REALM_LEGACY_WATER_BODY_COUNT; ordinal += 1) {
    const publicBodyId = ordinal === riverResult.waterBodyOrdinal
      ? 'GRW-RIVER'
      : `GRW-BODY-${ordinal}`;
    waterState = recordGreaterRealmLegacyWaterBodyVerificationV1(
      waterState,
      ordinal,
      publicBodyId,
    );
  }
  requireGreaterRealmLegacyWaterVerificationCompleteV1(waterState);
});

test('every frozen Lowlands river edge is non-uphill, strictly accumulating, and authority-bound', () => {
  let internalEdges = 0;
  let terminalMouths = 0;
  for (const water of GENESIS_WATER_REVISION_ENABLED_CELLS_V1) {
    if (water.regime !== 'river') continue;
    const source = projectionFor(water.q, water.r);
    requireGreaterRealmLegacyCellAuthorityV1(source, ROTATION, OFFSET_Q, OFFSET_R);
    if (water.downstreamWaterCellKey === undefined) {
      terminalMouths += 1;
      continue;
    }
    const downstreamAuthority = WATER_BY_KEY.get(water.downstreamWaterCellKey)!;
    const downstream = projectionFor(downstreamAuthority.q, downstreamAuthority.r);
    assert.ok(downstream.hydroSurfaceMilli <= source.hydroSurfaceMilli);
    assert.ok(downstream.flowAccumulation > source.flowAccumulation);
    requireGreaterRealmHydrologyLinkV1(source, downstream);
    internalEdges += 1;
  }
  assert.equal(internalEdges, 388);
  assert.equal(terminalMouths, 12);
});

test('legacy resource locations cover each exact catalog once while allowing concrete nodes', () => {
  const catalogs = {
    food: CANONICAL_TIER_I_FOOD_SITES_V1,
    wood: CANONICAL_TIER_I_WOOD_SITES_V1,
    stone: CANONICAL_TIER_I_STONE_SITES_V1,
    gold: CANONICAL_TIER_I_GOLD_SITES_V1,
  } as const;
  assert.deepEqual(Object.fromEntries(
    Object.entries(catalogs).map(([kind, rows]) => [kind, rows.length]),
  ), { food: 96, wood: 96, stone: 96, gold: 24 });
  let state = emptyGreaterRealmLegacyResourceVerificationV1();
  const first = catalogs.food[0]!;
  state = recordGreaterRealmLegacyResourceVerificationV1(
    state,
    'food',
    first.siteId,
    'GRL-food-0',
  );
  state = recordGreaterRealmLegacyResourceVerificationV1(
    state,
    'food',
    first.siteId,
    'GRL-food-0',
  );
  assert.equal(
    code(() => recordGreaterRealmLegacyResourceVerificationV1(
      state,
      'food',
      first.siteId,
      'GRL-FOOD-OTHER',
    )),
    'GREATER_REALM_LEGACY_RESOURCE_LOCATION_REPEATED',
  );
  assert.equal(
    code(() => requireGreaterRealmLegacyResourceVerificationCompleteV1(state)),
    'GREATER_REALM_LEGACY_RESOURCE_SET_INCOMPLETE',
  );
  assert.equal(
    code(() => requireGreaterRealmLegacyResourceCatalogV1('food', 'UNKNOWN-LEGACY-SITE')),
    'GREATER_REALM_LEGACY_RESOURCE_CATALOG_INVALID',
  );
  for (const kind of ['food', 'wood', 'stone', 'gold'] as const) {
    for (let ordinal = 0; ordinal < catalogs[kind].length; ordinal += 1) {
      state = recordGreaterRealmLegacyResourceVerificationV1(
        state,
        kind,
        catalogs[kind][ordinal]!.siteId,
        `GRL-${kind}-${ordinal}`,
      );
    }
  }
  requireGreaterRealmLegacyResourceVerificationCompleteV1(state);
});

test('hydrology edges reject dry, uphill, non-increasing, and invalid transitions', () => {
  const source = {
    hydroRegime: GREATER_REALM_HYDRO_REGIME.RIVER,
    hydroBodyId: 'GRW-RIVER',
    hydroSurfaceMilli: 100,
    flowAccumulation: 10n,
  } as const;
  const valid = {
    ...source,
    hydroSurfaceMilli: 90,
    flowAccumulation: 11n,
  };
  requireGreaterRealmHydrologyLinkV1(source, valid);
  assert.equal(code(() => requireGreaterRealmHydrologyLinkV1(source, {
    ...valid,
    hydroRegime: GREATER_REALM_HYDRO_REGIME.DRY,
    hydroBodyId: undefined,
  })), 'GREATER_REALM_HYDROLOGY_DRY_TARGET_INVALID');
  assert.equal(code(() => requireGreaterRealmHydrologyLinkV1(source, {
    ...valid,
    hydroSurfaceMilli: 101,
  })), 'GREATER_REALM_HYDROLOGY_UPHILL_INVALID');
  assert.equal(code(() => requireGreaterRealmHydrologyLinkV1(source, {
    ...valid,
    flowAccumulation: 10n,
  })), 'GREATER_REALM_HYDROLOGY_ACCUMULATION_INVALID');
  assert.equal(code(() => requireGreaterRealmHydrologyLinkV1(source, {
    ...valid,
    hydroRegime: GREATER_REALM_HYDRO_REGIME.STREAM,
    hydroBodyId: 'GRW-STREAM',
  })), 'GREATER_REALM_HYDROLOGY_TRANSITION_INVALID');

  const marsh = {
    hydroRegime: GREATER_REALM_HYDRO_REGIME.MARSH,
    hydroBodyId: 'GRW-MARSH',
    hydroSurfaceMilli: 100,
    flowAccumulation: 10n,
  } as const;
  requireGreaterRealmHydrologyLinkV1(marsh, {
    hydroRegime: GREATER_REALM_HYDRO_REGIME.DRY,
    hydroSurfaceMilli: 90,
    flowAccumulation: 11n,
  });
});

test('a frozen directionless river mouth is valid only beside its released standing-water outlet', () => {
  const terminal = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.find(
    row => row.regime === 'river' && row.downstreamWaterCellKey === undefined,
  )!;
  const source = projectionFor(terminal.q, terminal.r);
  const validOutlets = DIRECTIONS.flatMap(([q, r]) => {
    const neighbor = WATER_BY_KEY.get(`${terminal.q + q},${terminal.r + r}`);
    return neighbor !== undefined && (neighbor.regime === 'ocean' || neighbor.regime === 'lake')
      ? [projectionFor(neighbor.q, neighbor.r)]
      : [];
  });
  assert.ok(validOutlets.length >= 1 && validOutlets.length <= 2);
  assert.equal(source.hydroSurfaceMilli, 975);
  assert.equal(
    validOutlets.every(outlet => outlet.hydroSurfaceMilli <= source.hydroSurfaceMilli),
    true,
  );
  assert.equal(hasGreaterRealmHydrologyTerminalOutletV1(source, validOutlets), true);
  assert.equal(
    validOutlets.every(outlet => isGreaterRealmLegacyTerminalOutletNeighborV1(
      source.localQ,
      source.localR,
      outlet.localQ,
      outlet.localR,
    )),
    true,
  );
  assert.equal(
    isGreaterRealmLegacyTerminalOutletNeighborV1(
      source.localQ,
      source.localR,
      source.localQ + 2,
      source.localR,
    ),
    false,
  );
  requireGreaterRealmHydrologyTerminalOutletV1(true, source, validOutlets);
  assert.equal(
    code(() => requireGreaterRealmHydrologyTerminalOutletV1(false, source, validOutlets)),
    'GREATER_REALM_HYDROLOGY_TERMINAL_OUTLET_INVALID',
  );
  assert.equal(
    code(() => requireGreaterRealmHydrologyTerminalOutletV1(true, source, [])),
    'GREATER_REALM_HYDROLOGY_TERMINAL_OUTLET_INVALID',
  );
  assert.equal(hasGreaterRealmHydrologyTerminalOutletV1(source, [{
    hydroRegime: GREATER_REALM_HYDRO_REGIME.DRY,
    hydroSurfaceMilli: 90,
    flowAccumulation: 1n,
  }]), false);
  assert.equal(hasGreaterRealmHydrologyTerminalOutletV1(source, [{
    hydroRegime: GREATER_REALM_HYDRO_REGIME.LAKE,
    hydroBodyId: 'GRW-LAKE',
    hydroSurfaceMilli: source.hydroSurfaceMilli + 1,
    flowAccumulation: 11n,
  }]), false);
});

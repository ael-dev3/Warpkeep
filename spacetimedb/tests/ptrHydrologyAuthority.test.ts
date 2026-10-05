import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalOceanDepthAt,
  isCanonicalWaterCoordinate,
} from '../ptr/src/greaterRealmFrozenWaterCatalog';
import { requireGreaterRealmPtrHydrologyLinkV1 } from '../ptr/src/greaterRealmHydrologyAuthority';
import { GENESIS_WATER_REVISION_ENABLED_CELLS_V1 } from '../src/waterRevision';

const HYDRO = Object.freeze({ DRY: 0, OCEAN: 1, RIVER: 3 } as const);

function code(action: () => void): string | undefined {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return undefined;
}

function generatedRiver(
  regionId: string,
  surface: number,
  accumulation: bigint,
  atlasQ: number,
  atlasR: number,
): Parameters<typeof requireGreaterRealmPtrHydrologyLinkV1>[0] {
  return {
    regionId,
    localQ: 0,
    localR: 0,
    atlasQ,
    atlasR,
    hydroRegime: HYDRO.RIVER,
    hydroBodyId: 'GRW-GENERATED-RIVER',
    hydroDepthClass: 2,
    hydroSurfaceMilli: surface,
    flowAccumulation: accumulation,
    hydrologyRevision: 1,
    passable: false,
    movementCost: 1_000_000,
    geologicalBarrierBand: 0,
    biomeClass: 22,
    landformClass: 2,
    yieldClass: 0,
  };
}

function rotate(q: number, r: number, rotation: number): readonly [number, number] {
  for (let step = 0; step < rotation; step += 1) [q, r] = [-r, q + r];
  return [q, r];
}

test('PTR accepts equal discharge only when generated flow moves strictly downhill', () => {
  const source = generatedRiver('T1_FROSTMERE', 1_000, 12n, 300, -40);
  const downstream = {
    ...generatedRiver('T1_FROSTMERE', 999, 12n, 301, -40),
    hydroBodyId: source.hydroBodyId,
  };
  assert.doesNotThrow(() => requireGreaterRealmPtrHydrologyLinkV1(source, downstream));

  assert.equal(code(() => requireGreaterRealmPtrHydrologyLinkV1(source, {
    ...downstream,
    hydroSurfaceMilli: source.hydroSurfaceMilli,
  })), 'GREATER_REALM_HYDROLOGY_ACCUMULATION_INVALID');
  assert.equal(code(() => requireGreaterRealmPtrHydrologyLinkV1(source, {
    ...downstream,
    hydroSurfaceMilli: source.hydroSurfaceMilli + 1,
  })), 'GREATER_REALM_HYDROLOGY_UPHILL_INVALID');
  assert.equal(code(() => requireGreaterRealmPtrHydrologyLinkV1(
    { ...source, regionId: 'T1_LOWLANDS' },
    downstream,
  )), 'GREATER_REALM_HYDROLOGY_ACCUMULATION_INVALID');
});

test('PTR accepts lower discharge only into an exactly classified frozen Alpha ocean terminal', () => {
  const canonicalOcean = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.find(
    row => row.regime === 'ocean',
  )!;
  const depthCells = canonicalOceanDepthAt(canonicalOcean.q, canonicalOcean.r);
  assert.notEqual(depthCells, undefined);
  assert.equal(isCanonicalWaterCoordinate(canonicalOcean.q, canonicalOcean.r), true);

  const rotation = 2;
  const offsetQ = 700;
  const offsetR = -311;
  const [rotatedQ, rotatedR] = rotate(canonicalOcean.q, canonicalOcean.r, rotation);
  const ocean = {
    regionId: 'T1_LOWLANDS',
    localQ: canonicalOcean.q,
    localR: canonicalOcean.r,
    atlasQ: rotatedQ + offsetQ,
    atlasR: rotatedR + offsetR,
    hydroRegime: HYDRO.OCEAN,
    hydroBodyId: 'GRW-FROZEN-ALPHA-OCEAN',
    hydroDepthClass: canonicalOcean.depthClass,
    hydroSurfaceMilli: canonicalOcean.surfaceLevelMilli,
    flowAccumulation: BigInt(canonicalOcean.flowAccumulation),
    hydrologyRevision: canonicalOcean.generationVersion,
    passable: false,
    movementCost: 1_000_000,
    geologicalBarrierBand: 0,
    biomeClass: 20,
    landformClass: 16,
    yieldClass: 0,
  } as const;
  const source = generatedRiver(
    'T1_FROSTMERE',
    ocean.hydroSurfaceMilli + 1,
    ocean.flowAccumulation + 12n,
    ocean.atlasQ - 1,
    ocean.atlasR,
  );
  const transform = { rotation, offsetQ, offsetR } as const;
  assert.doesNotThrow(() => requireGreaterRealmPtrHydrologyLinkV1(
    source,
    ocean,
    transform,
  ));

  assert.equal(code(() => requireGreaterRealmPtrHydrologyLinkV1(
    source,
    ocean,
  )), 'GREATER_REALM_HYDROLOGY_ACCUMULATION_INVALID');
  assert.equal(code(() => requireGreaterRealmPtrHydrologyLinkV1(
    source,
    { ...ocean, hydrologyRevision: ocean.hydrologyRevision + 1 },
    transform,
  )), 'GREATER_REALM_HYDROLOGY_ACCUMULATION_INVALID');
  assert.equal(code(() => requireGreaterRealmPtrHydrologyLinkV1(
    { ...source, regionId: 'T1_LOWLANDS' },
    ocean,
    transform,
  )), 'GREATER_REALM_HYDROLOGY_ACCUMULATION_INVALID');
});

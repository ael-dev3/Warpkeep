import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  CANONICAL_GENESIS_WATER_REVISION_V1,
  GENESIS_WATER_NAVIGATION_FOG_BOUNDARY_DEPTH_CELLS,
  GENESIS_WATER_REVISION_DIGEST,
  GENESIS_WATER_REVISION_ENABLED_BODIES_V1,
  GENESIS_WATER_REVISION_ENABLED_BODY_COUNT,
  GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
  GENESIS_WATER_REVISION_ENABLED_CELL_COUNT,
  GENESIS_WATER_REVISION_RECLAIMED_LAKE_CELL_COUNT,
  GENESIS_WATER_REVISION_RECLAIMED_LAKE_KEYS_V1,
  GENESIS_WATER_REVISION_RECLAIMED_MOVEMENT_COST,
  GENESIS_WATER_REVISION_RECLAIMED_PASSABLE,
  GENESIS_WATER_REVISION_RECLAIMED_STATIC_CONTENT_KIND,
  GENESIS_WATER_REVISION_RECLAIMED_TERRAIN_KIND,
  GENESIS_WATER_REVISION_RIVER_WIDTH_CELLS,
  canonicalGenesisWaterRevisionV1DigestInput,
  matchesCanonicalGenesisWaterRevisionV1,
} from '../src/waterRevision';
import {
  GENESIS_OCEAN_FOG_FULL_DEPTH_CELLS,
  GENESIS_WATER_BODIES_V1,
  GENESIS_WATER_CELLS_V1,
  GENESIS_WATER_LAYOUT_V1,
  GENESIS_RIVERS_V1,
} from '../src/waterWorld';
import { hexDistance } from '../src/world';

test('Water revision v1 pins the exact ocean-and-river subset of Water v1', () => {
  const bodies = GENESIS_WATER_BODIES_V1.filter(body => body.regime !== 'lake');
  const cells = GENESIS_WATER_CELLS_V1.filter(cell => cell.regime !== 'lake');
  const revision = CANONICAL_GENESIS_WATER_REVISION_V1;

  assert.equal(bodies.length, GENESIS_WATER_REVISION_ENABLED_BODY_COUNT);
  assert.equal(cells.length, GENESIS_WATER_REVISION_ENABLED_CELL_COUNT);
  assert.deepEqual(GENESIS_WATER_REVISION_ENABLED_BODIES_V1, bodies);
  assert.deepEqual(GENESIS_WATER_REVISION_ENABLED_CELLS_V1, cells);
  assert.equal(Object.isFrozen(GENESIS_WATER_REVISION_ENABLED_BODIES_V1), true);
  assert.equal(Object.isFrozen(GENESIS_WATER_REVISION_ENABLED_CELLS_V1), true);
  assert.deepEqual(new Set(bodies.map(body => body.regime)), new Set(['ocean', 'river']));
  assert.deepEqual(new Set(cells.map(cell => cell.regime)), new Set(['ocean', 'river']));
  assert.equal(revision.oceanBodyCount, 1);
  assert.equal(revision.riverBodyCount, GENESIS_RIVERS_V1.length);
  assert.equal(revision.riverCellCount, 400);
  assert.equal(revision.lakeBodyCount, 0);
  assert.equal(revision.lakeCellCount, 0);
  assert.equal(revision.riverWidthCells, GENESIS_WATER_REVISION_RIVER_WIDTH_CELLS);
  assert.equal(GENESIS_WATER_REVISION_RIVER_WIDTH_CELLS, 1);
  assert.equal(
    GENESIS_WATER_NAVIGATION_FOG_BOUNDARY_DEPTH_CELLS,
    GENESIS_OCEAN_FOG_FULL_DEPTH_CELLS,
  );
  assert.equal(revision.baseLayoutVersion, GENESIS_WATER_LAYOUT_V1.layoutVersion);
  assert.equal(revision.baseLayoutDigest, GENESIS_WATER_LAYOUT_V1.layoutDigest);

  const reclaimedLakeCellIds = GENESIS_WATER_CELLS_V1
    .filter(cell => cell.regime === 'lake')
    .map(cell => cell.cellKey)
    .sort();
  assert.equal(GENESIS_WATER_REVISION_RECLAIMED_LAKE_CELL_COUNT, 409);
  assert.deepEqual(GENESIS_WATER_REVISION_RECLAIMED_LAKE_KEYS_V1, reclaimedLakeCellIds);
  assert.equal(GENESIS_WATER_REVISION_RECLAIMED_TERRAIN_KIND, 'lowland');
  assert.equal(GENESIS_WATER_REVISION_RECLAIMED_PASSABLE, true);
  assert.equal(GENESIS_WATER_REVISION_RECLAIMED_MOVEMENT_COST, 1);
  assert.equal(GENESIS_WATER_REVISION_RECLAIMED_STATIC_CONTENT_KIND, 'empty');

});

test('the enabled river network remains structurally one cell wide', () => {
  const paths = GENESIS_RIVERS_V1.map(river => (
    river.orderedCellKeys.map((cellKey, order) => {
      const [q, r] = cellKey.split(',').map(Number);
      assert.equal(Number.isSafeInteger(q) && Number.isSafeInteger(r), true);
      return { riverId: river.riverId, order, q: q!, r: r! };
    })
  ));
  const riverRows = paths.flat();
  assert.equal(riverRows.length, CANONICAL_GENESIS_WATER_REVISION_V1.riverCellCount);
  for (const path of paths) {
    for (let index = 1; index < path.length; index += 1) {
      assert.equal(hexDistance(path[index - 1]!, path[index]!), 1);
    }
  }

  let crossRiverAdjacencyCount = 0;
  let samePathNonconsecutiveAdjacencyCount = 0;
  for (let left = 0; left < riverRows.length; left += 1) {
    for (let right = left + 1; right < riverRows.length; right += 1) {
      const first = riverRows[left]!;
      const second = riverRows[right]!;
      if (hexDistance(first, second) !== 1) continue;
      if (first.riverId !== second.riverId) crossRiverAdjacencyCount += 1;
      else if (Math.abs(first.order - second.order) !== 1) {
        samePathNonconsecutiveAdjacencyCount += 1;
      }
    }
  }
  assert.equal(crossRiverAdjacencyCount, 0);
  assert.equal(samePathNonconsecutiveAdjacencyCount, 0);
});

test('Water revision digest and exact matcher fail closed on policy drift', () => {
  const digestInput = canonicalGenesisWaterRevisionV1DigestInput();
  assert.equal(
    createHash('sha256')
      .update(digestInput)
      .digest('hex'),
    GENESIS_WATER_REVISION_DIGEST,
  );
  assert.equal(digestInput.includes([
    GENESIS_WATER_REVISION_RECLAIMED_LAKE_CELL_COUNT,
    GENESIS_WATER_REVISION_RECLAIMED_TERRAIN_KIND,
    GENESIS_WATER_REVISION_RECLAIMED_PASSABLE,
    GENESIS_WATER_REVISION_RECLAIMED_MOVEMENT_COST,
    GENESIS_WATER_REVISION_RECLAIMED_STATIC_CONTENT_KIND,
    ...GENESIS_WATER_REVISION_RECLAIMED_LAKE_KEYS_V1,
  ].join('|')), true);
  assert.equal(
    matchesCanonicalGenesisWaterRevisionV1(CANONICAL_GENESIS_WATER_REVISION_V1),
    true,
  );
  assert.equal(matchesCanonicalGenesisWaterRevisionV1({
    ...CANONICAL_GENESIS_WATER_REVISION_V1,
    lakeCellCount: 1,
  }), false);
  assert.equal(matchesCanonicalGenesisWaterRevisionV1({
    ...CANONICAL_GENESIS_WATER_REVISION_V1,
    baseLayoutDigest: `${GENESIS_WATER_LAYOUT_V1.layoutDigest.slice(0, -1)}0`,
  }), false);
  assert.equal(matchesCanonicalGenesisWaterRevisionV1({
    ...CANONICAL_GENESIS_WATER_REVISION_V1,
    navigationFogBoundaryDepthCells:
      CANONICAL_GENESIS_WATER_REVISION_V1.navigationFogBoundaryDepthCells + 1,
  }), false);
});

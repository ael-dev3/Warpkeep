import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  GENESIS_WATER_BODIES_V1,
  type GenesisWaterCellV1
} from '../spacetimedb/src/waterWorld';
import {
  GENESIS_WATER_REVISION_ENABLED_BODIES_V1,
  GENESIS_WATER_REVISION_ENABLED_CELLS_V1
} from '../spacetimedb/src/waterRevision';
import { CANONICAL_CASTLE_SLOTS } from '../spacetimedb/src/world';
import {
  CANONICAL_WATER_NAVIGATION_MAX_CELL_ROWS,
  CANONICAL_WATER_NAVIGATION_ROUTE_CACHE_LIMIT,
  createCanonicalWaterNavigationGraph,
  type CanonicalWaterRoute
} from '../src/game/map/canonicalWaterNavigation';
import {
  hexDistance,
  hexKey,
  hexNeighbors
} from '../src/game/map/hexCoordinates';
import {
  canonicalPassableRoute,
  type CanonicalPassableRoute
} from '../src/game/map/canonicalPassableRoute';

function canonicalGraph() {
  return createCanonicalWaterNavigationGraph(
    GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
    GENESIS_WATER_BODIES_V1
  );
}

function riverCells(bodyId: string) {
  return GENESIS_WATER_REVISION_ENABLED_CELLS_V1
    .filter((cell) => cell.bodyId === bodyId && cell.regime === 'river')
    .sort((left, right) => (
      (left.riverOrder ?? Number.MAX_SAFE_INTEGER)
      - (right.riverOrder ?? Number.MAX_SAFE_INTEGER)
    ));
}

const SYNTHETIC_REALM_ID = 'synthetic-water-realm';
const SYNTHETIC_RIVER_BODY_ID = 'synthetic-river';
const SYNTHETIC_OCEAN_BODY_ID = 'synthetic-ocean';

function syntheticRiverCell(
  q: number,
  r: number,
  riverOrder: number,
  downstreamWaterCellKey?: string
) {
  return Object.freeze({
    realmId: SYNTHETIC_REALM_ID,
    cellKey: hexKey({ q, r }),
    q,
    r,
    regime: 'river',
    bodyId: SYNTHETIC_RIVER_BODY_ID,
    fogBand: 'clear',
    riverOrder,
    ...(downstreamWaterCellKey === undefined ? {} : { downstreamWaterCellKey })
  });
}

function syntheticOceanCell(q: number, r: number) {
  return Object.freeze({
    realmId: SYNTHETIC_REALM_ID,
    cellKey: hexKey({ q, r }),
    q,
    r,
    regime: 'ocean',
    bodyId: SYNTHETIC_OCEAN_BODY_ID,
    fogBand: 'clear'
  });
}

function syntheticRiverBody(cellCount: number) {
  return Object.freeze({
    realmId: SYNTHETIC_REALM_ID,
    bodyId: SYNTHETIC_RIVER_BODY_ID,
    regime: 'river',
    cellCount,
    sourceCellKey: '0,0',
    mouthCellKey: '2,0'
  });
}

const SYNTHETIC_OCEAN_BODY = Object.freeze({
  realmId: SYNTHETIC_REALM_ID,
  bodyId: SYNTHETIC_OCEAN_BODY_ID,
  regime: 'ocean',
  cellCount: 1,
  sourceCellKey: '3,0',
  mouthCellKey: '3,0'
});

describe('canonical Water navigation graph', () => {
  it('builds the exact bounded public Genesis graph without exposing full fog', () => {
    const graph = canonicalGraph();

    expect(graph.status).toBe('exact');
    expect(graph.issues).toEqual([]);
    expect(graph.telemetry).toEqual({
      status: 'exact',
      inputCellRowCount: 3_271,
      inputBodyRowCount: 375,
      nodeCount: 1_852,
      riverNodeCount: 400,
      oceanNodeCount: 1_452,
      riverBodyCount: 12,
      oceanBodyCount: 1,
      downstreamEdgeCount: 388,
      oceanAdjacencyCount: 3_630,
      riverOceanConnectionCount: 23,
      invalidBodyCount: 0,
      issueCount: 0,
      issuesTruncated: false,
      routeCacheLimit: CANONICAL_WATER_NAVIGATION_ROUTE_CACHE_LIMIT
    });
    expect(Object.isFrozen(graph)).toBe(true);
    expect(Object.isFrozen(graph.nodes)).toBe(true);
    expect(graph.nodes.every((node) => (
      Object.isFrozen(node)
      && Object.isFrozen(node.coord)
      && Object.isFrozen(node.upstream)
      && Object.isFrozen(node.navigableNeighbors)
    ))).toBe(true);

    const hiddenKeys = GENESIS_WATER_REVISION_ENABLED_CELLS_V1
      .filter((cell) => cell.regime === 'ocean' && cell.fogBand === 'full')
      .map((cell) => cell.cellKey);
    expect(hiddenKeys.length).toBeGreaterThan(0);
    expect(hiddenKeys.every((cellKey) => graph.node(cellKey) === undefined)).toBe(true);
    expect(graph.nodes.every((node) => (
      GENESIS_WATER_REVISION_ENABLED_CELLS_V1.some((cell) => (
        cell.cellKey === node.cellKey && cell.fogBand !== 'full'
      ))
    ))).toBe(true);
  });

  it('reconstructs every exact source-to-mouth and mouth-to-source river route', () => {
    const graph = canonicalGraph();
    const riverBodies = GENESIS_WATER_REVISION_ENABLED_BODIES_V1
      .filter((body) => body.regime === 'river');

    for (const body of riverBodies) {
      const cells = riverCells(body.bodyId);
      const expectedKeys = cells.map((cell) => cell.cellKey);
      expect(expectedKeys[0], body.bodyId).toBe(body.sourceCellKey);
      expect(expectedKeys.at(-1), body.bodyId).toBe(body.mouthCellKey);

      const downstream = graph.downstreamRouteToMouth(body.sourceCellKey);
      const upstream = graph.upstreamRouteToSource(body.mouthCellKey);
      expect(downstream?.cellKeys, body.bodyId).toEqual(expectedKeys);
      expect(upstream?.cellKeys, body.bodyId).toEqual([...expectedKeys].reverse());
      expect(downstream?.kind).toBe('canonical-water-route');
      expect(Object.isFrozen(downstream)).toBe(true);
      expect(Object.isFrozen(downstream?.cellKeys)).toBe(true);
      expect(Object.isFrozen(downstream?.coords)).toBe(true);

      cells.forEach((cell, index) => {
        expect(
          graph.downstreamRouteToMouth(cell.cellKey)?.cellKeys,
          `${body.bodyId}:${cell.cellKey}:downstream`
        ).toEqual(expectedKeys.slice(index));
        expect(
          graph.upstreamRouteToSource(cell.cellKey)?.cellKeys,
          `${body.bodyId}:${cell.cellKey}:upstream`
        ).toEqual(expectedKeys.slice(0, index + 1).reverse());
      });
    }
  });

  it('derives exact reverse links and never invents a river edge from proximity', () => {
    const graph = canonicalGraph();
    const riverRows = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.filter(
      (cell) => cell.regime === 'river'
    );
    const riverRowByKey = new Map(riverRows.map((cell) => [cell.cellKey, cell] as const));

    for (const cell of riverRows) {
      const node = graph.node(cell.cellKey)!;
      const expectedUpstream = riverRows
        .filter((candidate) => candidate.downstreamWaterCellKey === cell.cellKey)
        .map((candidate) => candidate.cellKey);
      expect(new Set(node.upstream), `${cell.cellKey}:upstream`)
        .toEqual(new Set(expectedUpstream));
      expect(graph.previousUpstreamCellKeys(cell.cellKey)).toBe(node.upstream);
      expect(graph.nextDownstreamCellKey(cell.cellKey))
        .toBe(cell.downstreamWaterCellKey);

      const expectedRiverNeighbors = new Set([
        ...expectedUpstream,
        ...(cell.downstreamWaterCellKey ? [cell.downstreamWaterCellKey] : [])
      ]);
      const actualRiverNeighbors = node.navigableNeighbors.filter(
        (cellKey) => riverRowByKey.has(cellKey)
      );
      expect(new Set(actualRiverNeighbors), `${cell.cellKey}:river-neighbors`)
        .toEqual(expectedRiverNeighbors);
      actualRiverNeighbors.forEach((neighborKey) => {
        expect(hexDistance(node.coord, graph.node(neighborKey)!.coord)).toBe(1);
      });
    }
  });

  it('connects every published ocean adjacency and only exact river mouths', () => {
    const graph = canonicalGraph();
    const publicOceanKeys = new Set(GENESIS_WATER_REVISION_ENABLED_CELLS_V1
      .filter((cell) => cell.regime === 'ocean' && cell.fogBand !== 'full')
      .map((cell) => cell.cellKey));
    const riverMouthKeys = new Set(GENESIS_WATER_REVISION_ENABLED_BODIES_V1
      .filter((body) => body.regime === 'river')
      .map((body) => body.mouthCellKey));

    for (const oceanKey of publicOceanKeys) {
      const node = graph.node(oceanKey)!;
      const expected = new Set(hexNeighbors(node.coord)
        .map((coord) => hexKey(coord))
        .filter((cellKey) => publicOceanKeys.has(cellKey) || riverMouthKeys.has(cellKey)));
      expect(new Set(node.navigableNeighbors), oceanKey).toEqual(expected);
      for (const neighborKey of node.navigableNeighbors) {
        const neighbor = graph.node(neighborKey)!;
        expect(neighbor.navigableNeighbors, `${oceanKey}:${neighborKey}`)
          .toContain(oceanKey);
        expect(hexDistance(node.coord, neighbor.coord)).toBe(1);
      }
    }

    for (const mouthKey of riverMouthKeys) {
      const mouth = graph.node(mouthKey)!;
      const expectedOcean = hexNeighbors(mouth.coord)
        .map((coord) => hexKey(coord))
        .filter((cellKey) => publicOceanKeys.has(cellKey));
      const actualOcean = mouth.navigableNeighbors.filter(
        (cellKey) => graph.node(cellKey)?.regime === 'ocean'
      );
      expect(new Set(actualOcean), mouthKey).toEqual(new Set(expectedOcean));
      expect(actualOcean.length, mouthKey).toBeGreaterThan(0);
    }
  });

  it('preserves global body, headwater, endpoint, and reciprocal-edge invariants', () => {
    const graph = canonicalGraph();
    const bodyById = new Map(
      GENESIS_WATER_REVISION_ENABLED_BODIES_V1.map((body) => [body.bodyId, body] as const)
    );

    for (const node of graph.nodes) {
      const body = bodyById.get(node.bodyId);
      expect(body, `${node.cellKey}:published-body`).toBeDefined();
      expect(body?.regime, `${node.cellKey}:body-regime`).toBe(node.regime);
      for (const neighborKey of node.navigableNeighbors) {
        const neighbor = graph.node(neighborKey);
        expect(neighbor, `${node.cellKey}:${neighborKey}:published-neighbor`).toBeDefined();
        expect(neighbor?.navigableNeighbors, `${node.cellKey}:${neighborKey}:reciprocal`)
          .toContain(node.cellKey);
      }
      if (node.downstream) {
        const downstream = graph.node(node.downstream);
        expect(downstream, `${node.cellKey}:published-downstream`).toBeDefined();
        expect(downstream?.bodyId, `${node.cellKey}:downstream-body`).toBe(node.bodyId);
        expect(downstream?.regime, `${node.cellKey}:downstream-regime`).toBe('river');
      }
    }

    for (const body of GENESIS_WATER_REVISION_ENABLED_BODIES_V1) {
      if (body.regime !== 'river') continue;
      const bodyNodes = graph.nodes.filter((node) => node.bodyId === body.bodyId);
      const headwaters = bodyNodes.filter((node) => node.upstream.length === 0);
      expect(headwaters.map((node) => node.cellKey), `${body.bodyId}:headwater`)
        .toEqual([body.sourceCellKey]);
      const mouth = graph.node(body.mouthCellKey);
      expect(mouth, `${body.bodyId}:mouth`).toBeDefined();
      expect(
        mouth?.navigableNeighbors.some((cellKey) => graph.node(cellKey)?.regime === 'ocean'),
        `${body.bodyId}:mouth-ocean`
      ).toBe(true);
    }
  });

  it('rejects a second headwater even when every branch reaches the declared mouth', () => {
    const cells = [
      syntheticRiverCell(0, 0, 0, '1,0'),
      syntheticRiverCell(0, 1, 1, '1,0'),
      syntheticRiverCell(1, 0, 2, '2,0'),
      syntheticRiverCell(2, 0, 3),
      syntheticOceanCell(3, 0)
    ];
    const graph = createCanonicalWaterNavigationGraph(
      cells,
      [syntheticRiverBody(4), SYNTHETIC_OCEAN_BODY]
    );

    expect(graph.status).not.toBe('exact');
    expect(graph.issues).toContainEqual({
      code: 'river-headwater-mismatch',
      scope: 'body',
      bodyId: SYNTHETIC_RIVER_BODY_ID,
      cellKey: '0,0'
    });
    expect(graph.nodes.some((node) => node.bodyId === SYNTHETIC_RIVER_BODY_ID))
      .toBe(false);
    expect(graph.upstreamRouteToSource('0,1')).toBeUndefined();
    expect(graph.node('3,0')?.bodyId).toBe(SYNTHETIC_OCEAN_BODY_ID);
  });

  it('purges a river whose otherwise-valid mouth has no published ocean adjacency', () => {
    const riverCells = [
      syntheticRiverCell(0, 0, 0, '1,0'),
      syntheticRiverCell(1, 0, 1, '2,0'),
      syntheticRiverCell(2, 0, 2)
    ];
    const bodies = [syntheticRiverBody(riverCells.length)];
    const graph = createCanonicalWaterNavigationGraph(riverCells, bodies);
    const publishedBodyIds = new Set<string>(bodies.map((body) => body.bodyId));

    expect(graph.issues).toContainEqual({
      code: 'river-mouth-ocean-missing',
      scope: 'body',
      bodyId: SYNTHETIC_RIVER_BODY_ID,
      cellKey: '2,0'
    });
    expect(graph.nodes).toEqual([]);
    expect(graph.node('0,0')).toBeUndefined();
    expect(graph.shortestRoute('0,0', '2,0')).toBeUndefined();
    expect(graph.nodes.every((node) => publishedBodyIds.has(node.bodyId))).toBe(true);
  });

  it('finds stable shortest routes only through adjacent published Water', () => {
    const graph = canonicalGraph();
    const riverBodies = GENESIS_WATER_REVISION_ENABLED_BODIES_V1
      .filter((body) => body.regime === 'river');
    const origin = riverBodies[0]!.sourceCellKey;
    const destination = riverBodies.at(-1)!.sourceCellKey;
    const first = graph.shortestRoute(origin, destination);
    const second = graph.shortestRoute(origin, destination);

    expect(first).toBeDefined();
    expect(second).toBe(first);
    expect(first?.cellKeys[0]).toBe(origin);
    expect(first?.cellKeys.at(-1)).toBe(destination);
    first?.cellKeys.forEach((cellKey, index) => {
      expect(graph.node(cellKey)).toBeDefined();
      if (index === 0) return;
      const previous = graph.node(first.cellKeys[index - 1]!)!;
      const current = graph.node(cellKey)!;
      expect(previous.navigableNeighbors).toContain(cellKey);
      expect(hexDistance(previous.coord, current.coord)).toBe(1);
    });
    expect(graph.shortestRoute(origin, '0,0-not-water')).toBeUndefined();
  });

  it('bounds route memoization without changing deterministic route results', () => {
    const graph = canonicalGraph();
    const riverNodes = graph.nodes.filter((node) => node.regime === 'river');
    expect(riverNodes.length).toBeGreaterThan(
      CANONICAL_WATER_NAVIGATION_ROUTE_CACHE_LIMIT
    );
    const firstNode = riverNodes[0]!;
    const firstRoute = graph.downstreamRouteToMouth(firstNode.cellKey)!;

    riverNodes
      .slice(1, CANONICAL_WATER_NAVIGATION_ROUTE_CACHE_LIMIT + 1)
      .forEach((node) => {
        expect(graph.downstreamRouteToMouth(node.cellKey)).toBeDefined();
      });

    const recomputed = graph.downstreamRouteToMouth(firstNode.cellKey)!;
    expect(recomputed).not.toBe(firstRoute);
    expect(recomputed).toEqual(firstRoute);
    expect(Object.isFrozen(recomputed)).toBe(true);
    expect(Object.isFrozen(recomputed.cellKeys)).toBe(true);
    expect(Object.isFrozen(recomputed.coords)).toBe(true);
  });

  it('keeps Water routes structurally distinct and all Water destinations dry-route blocked', () => {
    expectTypeOf<CanonicalWaterRoute>().not.toMatchTypeOf<CanonicalPassableRoute>();
    const graph = canonicalGraph();
    const dryOrigin = CANONICAL_CASTLE_SLOTS[0]!;

    for (const node of graph.nodes) {
      expect(canonicalPassableRoute(dryOrigin, node.coord), node.cellKey).toBeUndefined();
    }
  });

  it('fails one malformed river body locally while retaining unrelated navigation', () => {
    const targetBody = GENESIS_WATER_REVISION_ENABLED_BODIES_V1.find(
      (body) => body.regime === 'river'
    )!;
    const targetCell = riverCells(targetBody.bodyId)[0]!;
    const changedRows = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.map((cell) => (
      cell.cellKey === targetCell.cellKey
        ? {
            ...cell,
            downstreamWaterCellKey: '511,-511'
          }
        : cell
    ));
    const untouchedBody = GENESIS_WATER_REVISION_ENABLED_BODIES_V1.find(
      (body) => body.regime === 'river' && body.bodyId !== targetBody.bodyId
    )!;
    const graph = createCanonicalWaterNavigationGraph(changedRows, GENESIS_WATER_BODIES_V1);

    expect(graph.status).toBe('partial');
    expect(graph.telemetry.invalidBodyCount).toBe(1);
    expect(graph.nodes.some((node) => node.bodyId === targetBody.bodyId)).toBe(false);
    expect(graph.issues.some((issue) => (
      issue.bodyId === targetBody.bodyId
      && issue.code === 'river-downstream-missing'
    ))).toBe(true);
    expect(graph.downstreamRouteToMouth(untouchedBody.sourceCellKey)?.cellKeys.at(-1))
      .toBe(untouchedBody.mouthCellKey);
    expect(graph.telemetry.oceanNodeCount).toBe(1_452);
  });

  it('rejects duplicate identity, non-adjacent downstream links, and oversized input', () => {
    const riverBody = GENESIS_WATER_REVISION_ENABLED_BODIES_V1.find(
      (body) => body.regime === 'river'
    )!;
    const cells = riverCells(riverBody.bodyId);
    const nonAdjacent = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.map((cell) => (
      cell.cellKey === cells[0]!.cellKey
        ? { ...cell, downstreamWaterCellKey: cells[2]!.cellKey }
        : cell
    ));
    const nonAdjacentGraph = createCanonicalWaterNavigationGraph(
      nonAdjacent,
      GENESIS_WATER_BODIES_V1
    );
    expect(nonAdjacentGraph.issues.some((issue) => (
      issue.bodyId === riverBody.bodyId
      && issue.code === 'river-downstream-not-adjacent'
    ))).toBe(true);
    expect(nonAdjacentGraph.nodes.some((node) => node.bodyId === riverBody.bodyId))
      .toBe(false);

    const duplicatedRiverCell = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.find(
      (cell) => cell.regime === 'river'
    )!;
    const duplicateGraph = createCanonicalWaterNavigationGraph(
      [
        ...GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
        duplicatedRiverCell
      ],
      GENESIS_WATER_BODIES_V1
    );
    expect(duplicateGraph.status).toBe('partial');
    expect(duplicateGraph.issues.some((issue) => issue.code === 'duplicate-cell-key'))
      .toBe(true);

    const oversized = Array.from(
      { length: CANONICAL_WATER_NAVIGATION_MAX_CELL_ROWS + 1 },
      () => null
    );
    const oversizedGraph = createCanonicalWaterNavigationGraph(
      oversized,
      GENESIS_WATER_BODIES_V1
    );
    expect(oversizedGraph.status).toBe('unavailable');
    expect(oversizedGraph.nodes).toEqual([]);
    expect(oversizedGraph.issues).toEqual([{
      code: 'cell-row-limit',
      scope: 'catalog'
    }]);
  });

  it('does not mutate caller rows while deriving and caching routes', () => {
    const cells = GENESIS_WATER_REVISION_ENABLED_CELLS_V1.map(
      (cell): GenesisWaterCellV1 => ({ ...cell })
    );
    const before = JSON.stringify(cells);
    const graph = createCanonicalWaterNavigationGraph(cells, GENESIS_WATER_BODIES_V1);
    const river = graph.nodes.find((node) => node.regime === 'river')!;

    graph.downstreamRouteToMouth(river.cellKey);
    graph.upstreamRouteToSource(river.cellKey);
    expect(JSON.stringify(cells)).toBe(before);
  });
});

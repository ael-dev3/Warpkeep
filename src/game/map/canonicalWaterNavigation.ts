import {
  hexDistance,
  hexKey,
  hexNeighbors,
  type HexCoord
} from './hexCoordinates';

export const CANONICAL_WATER_NAVIGATION_MAX_CELL_ROWS = 16_384;
export const CANONICAL_WATER_NAVIGATION_MAX_BODY_ROWS = 512;
export const CANONICAL_WATER_NAVIGATION_MAX_COORDINATE = 512;
export const CANONICAL_WATER_NAVIGATION_MAX_KEY_LENGTH = 192;
export const CANONICAL_WATER_NAVIGATION_MAX_ISSUES = 256;
export const CANONICAL_WATER_NAVIGATION_ROUTE_CACHE_LIMIT = 256;

export type CanonicalWaterNavigationRegime = 'river' | 'ocean';

export type CanonicalWaterNavigationIssueCode =
  | 'catalog-unavailable'
  | 'cell-row-limit'
  | 'body-row-limit'
  | 'malformed-cell'
  | 'unsupported-cell-regime'
  | 'duplicate-cell-key'
  | 'missing-body'
  | 'malformed-body'
  | 'duplicate-body-id'
  | 'body-regime-mismatch'
  | 'body-realm-mismatch'
  | 'body-cell-count-mismatch'
  | 'ocean-downstream-link'
  | 'river-order-invalid'
  | 'river-downstream-missing'
  | 'river-downstream-body-mismatch'
  | 'river-downstream-order'
  | 'river-downstream-not-adjacent'
  | 'river-cycle'
  | 'river-route-does-not-reach-mouth'
  | 'river-source-mismatch'
  | 'river-mouth-mismatch'
  | 'river-source-has-upstream'
  | 'river-mouth-ocean-missing';

export type CanonicalWaterNavigationIssue = Readonly<{
  code: CanonicalWaterNavigationIssueCode;
  scope: 'catalog' | 'body' | 'cell';
  bodyId?: string;
  cellKey?: string;
}>;

export type CanonicalWaterNavigationNode = Readonly<{
  cellKey: string;
  coord: HexCoord;
  regime: CanonicalWaterNavigationRegime;
  bodyId: string;
  downstream?: string;
  upstream: readonly string[];
  navigableNeighbors: readonly string[];
  riverOrder?: number;
}>;

declare const canonicalWaterRouteBrand: unique symbol;

/**
 * Water routes are intentionally not arrays. The branded record prevents a
 * Water path from being passed to dry Worker routing by structural accident.
 */
export type CanonicalWaterRoute = Readonly<{
  kind: 'canonical-water-route';
  cellKeys: readonly string[];
  coords: readonly HexCoord[];
  readonly [canonicalWaterRouteBrand]: true;
}>;

export type CanonicalWaterNavigationTelemetry = Readonly<{
  status: 'exact' | 'partial' | 'unavailable';
  inputCellRowCount: number;
  inputBodyRowCount: number;
  nodeCount: number;
  riverNodeCount: number;
  oceanNodeCount: number;
  riverBodyCount: number;
  oceanBodyCount: number;
  downstreamEdgeCount: number;
  oceanAdjacencyCount: number;
  riverOceanConnectionCount: number;
  invalidBodyCount: number;
  issueCount: number;
  issuesTruncated: boolean;
  routeCacheLimit: number;
}>;

export type CanonicalWaterNavigationGraph = Readonly<{
  status: CanonicalWaterNavigationTelemetry['status'];
  nodes: readonly CanonicalWaterNavigationNode[];
  issues: readonly CanonicalWaterNavigationIssue[];
  telemetry: CanonicalWaterNavigationTelemetry;
  node: (cellKey: string) => CanonicalWaterNavigationNode | undefined;
  nextDownstreamCellKey: (cellKey: string) => string | undefined;
  previousUpstreamCellKeys: (cellKey: string) => readonly string[];
  downstreamRouteToMouth: (cellKey: string) => CanonicalWaterRoute | undefined;
  upstreamRouteToSource: (cellKey: string) => CanonicalWaterRoute | undefined;
  shortestRoute: (
    originCellKey: string,
    destinationCellKey: string
  ) => CanonicalWaterRoute | undefined;
}>;

type ParsedWaterCell = Readonly<{
  realmId: string;
  cellKey: string;
  q: number;
  r: number;
  regime: CanonicalWaterNavigationRegime;
  bodyId: string;
  fogBand: 'clear' | 'haze' | 'full';
  riverOrder?: number;
  downstreamWaterCellKey?: string;
}>;

type ParsedWaterBody = Readonly<{
  realmId: string;
  bodyId: string;
  regime: CanonicalWaterNavigationRegime;
  cellCount: number;
  sourceCellKey: string;
  mouthCellKey: string;
}>;

type MutableNode = {
  cell: ParsedWaterCell;
  upstream: Set<string>;
  neighbors: Set<string>;
};

function objectRow(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function boundedKey(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= CANONICAL_WATER_NAVIGATION_MAX_KEY_LENGTH;
}

function boundedCoordinate(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && Math.abs(value as number) <= CANONICAL_WATER_NAVIGATION_MAX_COORDINATE;
}

function parseCell(value: unknown): ParsedWaterCell | undefined {
  const row = objectRow(value);
  if (!row || !boundedKey(row.bodyId) || !boundedKey(row.cellKey)) return undefined;
  if (!boundedKey(row.realmId) || !boundedCoordinate(row.q) || !boundedCoordinate(row.r)) {
    return undefined;
  }
  if (row.cellKey !== hexKey({ q: row.q, r: row.r })) return undefined;
  if (row.regime !== 'river' && row.regime !== 'ocean') return undefined;
  if (row.fogBand !== 'clear' && row.fogBand !== 'haze' && row.fogBand !== 'full') {
    return undefined;
  }
  if (
    row.downstreamWaterCellKey !== undefined
    && !boundedKey(row.downstreamWaterCellKey)
  ) return undefined;
  if (
    row.riverOrder !== undefined
    && (!Number.isSafeInteger(row.riverOrder) || (row.riverOrder as number) < 0)
  ) return undefined;
  return Object.freeze({
    realmId: row.realmId,
    cellKey: row.cellKey,
    q: row.q,
    r: row.r,
    regime: row.regime,
    bodyId: row.bodyId,
    fogBand: row.fogBand,
    ...(row.riverOrder === undefined
      ? {}
      : { riverOrder: row.riverOrder as number }),
    ...(row.downstreamWaterCellKey === undefined
      ? {}
      : { downstreamWaterCellKey: row.downstreamWaterCellKey })
  });
}

function parseBody(value: unknown): ParsedWaterBody | undefined {
  const row = objectRow(value);
  if (
    !row
    || !boundedKey(row.realmId)
    || !boundedKey(row.bodyId)
    || (row.regime !== 'river' && row.regime !== 'ocean')
    || !Number.isSafeInteger(row.cellCount)
    || (row.cellCount as number) <= 0
    || (row.cellCount as number) > CANONICAL_WATER_NAVIGATION_MAX_CELL_ROWS
    || !boundedKey(row.sourceCellKey)
    || !boundedKey(row.mouthCellKey)
  ) return undefined;
  return Object.freeze({
    realmId: row.realmId,
    bodyId: row.bodyId,
    regime: row.regime,
    cellCount: row.cellCount as number,
    sourceCellKey: row.sourceCellKey,
    mouthCellKey: row.mouthCellKey
  });
}

function compareCells(left: ParsedWaterCell, right: ParsedWaterCell) {
  return left.q - right.q
    || left.r - right.r
    || left.cellKey.localeCompare(right.cellKey);
}

function compareRiverCells(left: ParsedWaterCell, right: ParsedWaterCell) {
  return (left.riverOrder ?? Number.MAX_SAFE_INTEGER)
    - (right.riverOrder ?? Number.MAX_SAFE_INTEGER)
    || compareCells(left, right);
}

function frozenStrings(values: Iterable<string>): readonly string[] {
  return Object.freeze([...values]);
}

function frozenRoute(
  cellKeys: readonly string[],
  nodesByKey: ReadonlyMap<string, CanonicalWaterNavigationNode>
): CanonicalWaterRoute | undefined {
  if (cellKeys.length === 0) return undefined;
  const coords: HexCoord[] = [];
  for (const cellKey of cellKeys) {
    const node = nodesByKey.get(cellKey);
    if (!node) return undefined;
    coords.push(Object.freeze({ q: node.coord.q, r: node.coord.r }));
  }
  return Object.freeze({
    kind: 'canonical-water-route',
    cellKeys: Object.freeze([...cellKeys]),
    coords: Object.freeze(coords)
  }) as CanonicalWaterRoute;
}

function emptyGraph(
  inputCellRowCount: number,
  inputBodyRowCount: number,
  issuesInput: readonly CanonicalWaterNavigationIssue[],
  issuesTruncated = false
): CanonicalWaterNavigationGraph {
  const issues = Object.freeze([...issuesInput]);
  const telemetry: CanonicalWaterNavigationTelemetry = Object.freeze({
    status: 'unavailable',
    inputCellRowCount,
    inputBodyRowCount,
    nodeCount: 0,
    riverNodeCount: 0,
    oceanNodeCount: 0,
    riverBodyCount: 0,
    oceanBodyCount: 0,
    downstreamEdgeCount: 0,
    oceanAdjacencyCount: 0,
    riverOceanConnectionCount: 0,
    invalidBodyCount: 0,
    issueCount: issues.length,
    issuesTruncated,
    routeCacheLimit: CANONICAL_WATER_NAVIGATION_ROUTE_CACHE_LIMIT
  });
  const noStrings = Object.freeze([]) as readonly string[];
  return Object.freeze({
    status: 'unavailable',
    nodes: Object.freeze([]),
    issues,
    telemetry,
    node: () => undefined,
    nextDownstreamCellKey: () => undefined,
    previousUpstreamCellKeys: () => noStrings,
    downstreamRouteToMouth: () => undefined,
    upstreamRouteToSource: () => undefined,
    shortestRoute: () => undefined
  });
}

/**
 * Builds a bounded immutable graph from public Water body and cell rows.
 *
 * Full-fog ocean rows participate in body validation but are never projected
 * as nodes. A malformed body is removed without invalidating unrelated Water
 * bodies, and every issue is represented by a stable code rather than a
 * renderer-derived fallback route.
 */
export function createCanonicalWaterNavigationGraph(
  cellRows: readonly unknown[] | undefined,
  bodyRows: readonly unknown[] | undefined
): CanonicalWaterNavigationGraph {
  const inputCellRowCount = cellRows?.length ?? 0;
  const inputBodyRowCount = bodyRows?.length ?? 0;
  if (!cellRows || !bodyRows || cellRows.length === 0 || bodyRows.length === 0) {
    return emptyGraph(inputCellRowCount, inputBodyRowCount, [Object.freeze({
      code: 'catalog-unavailable',
      scope: 'catalog'
    })]);
  }
  if (cellRows.length > CANONICAL_WATER_NAVIGATION_MAX_CELL_ROWS) {
    return emptyGraph(inputCellRowCount, inputBodyRowCount, [Object.freeze({
      code: 'cell-row-limit',
      scope: 'catalog'
    })]);
  }
  if (bodyRows.length > CANONICAL_WATER_NAVIGATION_MAX_BODY_ROWS) {
    return emptyGraph(inputCellRowCount, inputBodyRowCount, [Object.freeze({
      code: 'body-row-limit',
      scope: 'catalog'
    })]);
  }

  const issues: CanonicalWaterNavigationIssue[] = [];
  let issuesTruncated = false;
  const addIssue = (
    code: CanonicalWaterNavigationIssueCode,
    scope: CanonicalWaterNavigationIssue['scope'],
    bodyId?: string,
    cellKey?: string
  ) => {
    if (issues.length >= CANONICAL_WATER_NAVIGATION_MAX_ISSUES) {
      issuesTruncated = true;
      return;
    }
    issues.push(Object.freeze({
      code,
      scope,
      ...(bodyId === undefined ? {} : { bodyId }),
      ...(cellKey === undefined ? {} : { cellKey })
    }));
  };
  const invalidBodies = new Set<string>();
  const cellsByKey = new Map<string, ParsedWaterCell>();
  const cellsByBody = new Map<string, ParsedWaterCell[]>();
  const referencedBodyIds = new Set<string>();

  for (const value of cellRows) {
    const raw = objectRow(value);
    const rawBodyId = boundedKey(raw?.bodyId) ? raw.bodyId : undefined;
    const rawCellKey = boundedKey(raw?.cellKey) ? raw.cellKey : undefined;
    if (raw?.regime !== 'river' && raw?.regime !== 'ocean') {
      addIssue('unsupported-cell-regime', rawBodyId ? 'body' : 'cell', rawBodyId, rawCellKey);
      if (rawBodyId) invalidBodies.add(rawBodyId);
      continue;
    }
    const cell = parseCell(value);
    if (!cell) {
      addIssue('malformed-cell', rawBodyId ? 'body' : 'cell', rawBodyId, rawCellKey);
      if (rawBodyId) invalidBodies.add(rawBodyId);
      continue;
    }
    referencedBodyIds.add(cell.bodyId);
    const duplicate = cellsByKey.get(cell.cellKey);
    if (duplicate) {
      addIssue('duplicate-cell-key', 'cell', cell.bodyId, cell.cellKey);
      invalidBodies.add(duplicate.bodyId);
      invalidBodies.add(cell.bodyId);
      continue;
    }
    cellsByKey.set(cell.cellKey, cell);
    const bodyCells = cellsByBody.get(cell.bodyId) ?? [];
    bodyCells.push(cell);
    cellsByBody.set(cell.bodyId, bodyCells);
  }

  const bodiesById = new Map<string, ParsedWaterBody>();
  const duplicateBodyIds = new Set<string>();
  for (const value of bodyRows) {
    const raw = objectRow(value);
    const bodyId = boundedKey(raw?.bodyId) ? raw.bodyId : undefined;
    if (!bodyId || !referencedBodyIds.has(bodyId)) continue;
    const body = parseBody(value);
    if (!body) {
      addIssue('malformed-body', 'body', bodyId);
      invalidBodies.add(bodyId);
      continue;
    }
    if (bodiesById.has(bodyId)) {
      duplicateBodyIds.add(bodyId);
      invalidBodies.add(bodyId);
      addIssue('duplicate-body-id', 'body', bodyId);
      continue;
    }
    bodiesById.set(bodyId, body);
  }
  duplicateBodyIds.forEach((bodyId) => bodiesById.delete(bodyId));

  for (const bodyId of referencedBodyIds) {
    const body = bodiesById.get(bodyId);
    const bodyCells = cellsByBody.get(bodyId) ?? [];
    if (!body) {
      addIssue('missing-body', 'body', bodyId);
      invalidBodies.add(bodyId);
      continue;
    }
    if (bodyCells.length !== body.cellCount) {
      addIssue('body-cell-count-mismatch', 'body', bodyId);
      invalidBodies.add(bodyId);
    }
    for (const cell of bodyCells) {
      if (cell.regime !== body.regime) {
        addIssue('body-regime-mismatch', 'cell', bodyId, cell.cellKey);
        invalidBodies.add(bodyId);
      }
      if (cell.realmId !== body.realmId) {
        addIssue('body-realm-mismatch', 'cell', bodyId, cell.cellKey);
        invalidBodies.add(bodyId);
      }
    }
  }

  const riverBodies = [...bodiesById.values()]
    .filter((body) => body.regime === 'river')
    .sort((left, right) => left.bodyId.localeCompare(right.bodyId));
  for (const body of riverBodies) {
    if (invalidBodies.has(body.bodyId)) continue;
    const cells = [...(cellsByBody.get(body.bodyId) ?? [])].sort(compareRiverCells);
    const byKey = new Map(cells.map((cell) => [cell.cellKey, cell] as const));
    const upstream = new Map(cells.map((cell) => [cell.cellKey, [] as string[]] as const));
    const source = byKey.get(body.sourceCellKey);
    const mouth = byKey.get(body.mouthCellKey);
    if (!source || source.riverOrder !== 0) {
      addIssue('river-source-mismatch', 'body', body.bodyId, body.sourceCellKey);
      invalidBodies.add(body.bodyId);
      continue;
    }
    if (!mouth || mouth.downstreamWaterCellKey !== undefined) {
      addIssue('river-mouth-mismatch', 'body', body.bodyId, body.mouthCellKey);
      invalidBodies.add(body.bodyId);
      continue;
    }

    for (const cell of cells) {
      if (cell.riverOrder === undefined) {
        addIssue('river-order-invalid', 'cell', body.bodyId, cell.cellKey);
        invalidBodies.add(body.bodyId);
        continue;
      }
      const downstreamKey = cell.downstreamWaterCellKey;
      if (cell.cellKey === body.mouthCellKey) continue;
      if (!downstreamKey) {
        addIssue('river-downstream-missing', 'cell', body.bodyId, cell.cellKey);
        invalidBodies.add(body.bodyId);
        continue;
      }
      const downstream = byKey.get(downstreamKey);
      if (!downstream) {
        const foreign = cellsByKey.get(downstreamKey);
        addIssue(
          foreign ? 'river-downstream-body-mismatch' : 'river-downstream-missing',
          'cell',
          body.bodyId,
          cell.cellKey
        );
        invalidBodies.add(body.bodyId);
        continue;
      }
      if (
        downstream.riverOrder === undefined
        || downstream.riverOrder <= cell.riverOrder
      ) {
        addIssue('river-downstream-order', 'cell', body.bodyId, cell.cellKey);
        invalidBodies.add(body.bodyId);
      }
      if (hexDistance(cell, downstream) !== 1) {
        addIssue('river-downstream-not-adjacent', 'cell', body.bodyId, cell.cellKey);
        invalidBodies.add(body.bodyId);
      }
      upstream.get(downstreamKey)?.push(cell.cellKey);
    }
    if (invalidBodies.has(body.bodyId)) continue;
    if ((upstream.get(body.sourceCellKey)?.length ?? 0) !== 0) {
      addIssue('river-source-has-upstream', 'body', body.bodyId, body.sourceCellKey);
      invalidBodies.add(body.bodyId);
      continue;
    }

    for (const cell of cells) {
      const seen = new Set<string>();
      let cursor: ParsedWaterCell | undefined = cell;
      while (cursor && cursor.cellKey !== body.mouthCellKey) {
        if (seen.has(cursor.cellKey)) {
          addIssue('river-cycle', 'body', body.bodyId, cursor.cellKey);
          invalidBodies.add(body.bodyId);
          break;
        }
        seen.add(cursor.cellKey);
        cursor = cursor.downstreamWaterCellKey
          ? byKey.get(cursor.downstreamWaterCellKey)
          : undefined;
      }
      if (!invalidBodies.has(body.bodyId) && cursor?.cellKey !== body.mouthCellKey) {
        addIssue('river-route-does-not-reach-mouth', 'body', body.bodyId, cell.cellKey);
        invalidBodies.add(body.bodyId);
      }
      if (invalidBodies.has(body.bodyId)) break;
    }
  }

  for (const body of bodiesById.values()) {
    if (invalidBodies.has(body.bodyId) || body.regime !== 'ocean') continue;
    for (const cell of cellsByBody.get(body.bodyId) ?? []) {
      if (cell.downstreamWaterCellKey !== undefined || cell.riverOrder !== undefined) {
        addIssue('ocean-downstream-link', 'cell', body.bodyId, cell.cellKey);
        invalidBodies.add(body.bodyId);
        break;
      }
    }
  }

  const validPublishedCells = [...cellsByKey.values()]
    .filter((cell) => (
      cell.fogBand !== 'full'
      && !invalidBodies.has(cell.bodyId)
      && bodiesById.has(cell.bodyId)
    ))
    .sort(compareCells);
  const mutableNodes = new Map<string, MutableNode>(validPublishedCells.map((cell) => [
    cell.cellKey,
    { cell, upstream: new Set<string>(), neighbors: new Set<string>() }
  ]));

  for (const mutable of mutableNodes.values()) {
    const { cell } = mutable;
    if (cell.regime === 'ocean') {
      for (const neighborCoord of hexNeighbors(cell)) {
        const neighbor = mutableNodes.get(hexKey(neighborCoord));
        if (!neighbor || neighbor.cell.regime !== 'ocean') continue;
        mutable.neighbors.add(neighbor.cell.cellKey);
      }
      continue;
    }
    if (!cell.downstreamWaterCellKey) continue;
    const downstream = mutableNodes.get(cell.downstreamWaterCellKey);
    if (!downstream || downstream.cell.regime !== 'river') continue;
    mutable.neighbors.add(downstream.cell.cellKey);
    downstream.neighbors.add(cell.cellKey);
    downstream.upstream.add(cell.cellKey);
  }

  const mouthOceanNeighbors = new Map<string, readonly string[]>();
  for (const body of riverBodies) {
    if (invalidBodies.has(body.bodyId)) continue;
    const mouth = mutableNodes.get(body.mouthCellKey);
    if (!mouth) continue;
    const oceanNeighbors = hexNeighbors(mouth.cell)
      .map((coord) => mutableNodes.get(hexKey(coord)))
      .filter((candidate): candidate is MutableNode => candidate?.cell.regime === 'ocean')
      .sort((left, right) => compareCells(left.cell, right.cell));
    if (oceanNeighbors.length === 0) {
      addIssue('river-mouth-ocean-missing', 'body', body.bodyId, body.mouthCellKey);
      invalidBodies.add(body.bodyId);
      continue;
    }
    const keys = Object.freeze(oceanNeighbors.map((neighbor) => neighbor.cell.cellKey));
    mouthOceanNeighbors.set(body.bodyId, keys);
  }

  if (mouthOceanNeighbors.size !== riverBodies.filter(
    (body) => !invalidBodies.has(body.bodyId)
  ).length) {
    for (const [cellKey, mutable] of mutableNodes) {
      if (invalidBodies.has(mutable.cell.bodyId)) mutableNodes.delete(cellKey);
    }
  }

  for (const [bodyId, oceanKeys] of mouthOceanNeighbors) {
    if (invalidBodies.has(bodyId)) continue;
    const body = bodiesById.get(bodyId);
    const mouth = body ? mutableNodes.get(body.mouthCellKey) : undefined;
    if (!mouth) continue;
    for (const oceanKey of oceanKeys) {
      const ocean = mutableNodes.get(oceanKey);
      if (!ocean) continue;
      mouth.neighbors.add(oceanKey);
      ocean.neighbors.add(mouth.cell.cellKey);
    }
  }

  const compareNodeKey = (leftKey: string, rightKey: string) => {
    const left = mutableNodes.get(leftKey)?.cell;
    const right = mutableNodes.get(rightKey)?.cell;
    if (!left || !right) return leftKey.localeCompare(rightKey);
    return compareRiverCells(left, right);
  };
  const nodes: CanonicalWaterNavigationNode[] = [...mutableNodes.values()]
    .sort((left, right) => compareCells(left.cell, right.cell))
    .map(({ cell, upstream, neighbors }) => Object.freeze({
      cellKey: cell.cellKey,
      coord: Object.freeze({ q: cell.q, r: cell.r }),
      regime: cell.regime,
      bodyId: cell.bodyId,
      ...(cell.downstreamWaterCellKey === undefined
        ? {}
        : { downstream: cell.downstreamWaterCellKey }),
      upstream: frozenStrings([...upstream].sort(compareNodeKey)),
      navigableNeighbors: frozenStrings([...neighbors].sort(compareNodeKey)),
      ...(cell.riverOrder === undefined ? {} : { riverOrder: cell.riverOrder })
    }));
  const frozenNodes = Object.freeze(nodes);
  const nodesByKey = new Map(nodes.map((node) => [node.cellKey, node] as const));
  const bodyById = new Map([...bodiesById.entries()].filter(
    ([bodyId]) => !invalidBodies.has(bodyId)
  ));
  const routeCache = new Map<string, CanonicalWaterRoute | null>();
  const cacheRoute = (cacheKey: string, route: CanonicalWaterRoute | undefined) => {
    if (routeCache.size >= CANONICAL_WATER_NAVIGATION_ROUTE_CACHE_LIMIT) {
      const oldest = routeCache.keys().next().value;
      if (typeof oldest === 'string') routeCache.delete(oldest);
    }
    routeCache.set(cacheKey, route ?? null);
    return route;
  };

  const followDownstreamKeys = (cellKey: string): readonly string[] | undefined => {
    const start = nodesByKey.get(cellKey);
    const body = start ? bodyById.get(start.bodyId) : undefined;
    if (!start || start.regime !== 'river' || body?.regime !== 'river') return undefined;
    const route: string[] = [];
    const seen = new Set<string>();
    let cursor: CanonicalWaterNavigationNode | undefined = start;
    while (cursor) {
      if (seen.has(cursor.cellKey)) return undefined;
      seen.add(cursor.cellKey);
      route.push(cursor.cellKey);
      if (cursor.cellKey === body.mouthCellKey) return Object.freeze(route);
      cursor = cursor.downstream ? nodesByKey.get(cursor.downstream) : undefined;
    }
    return undefined;
  };

  const shortestKeys = (
    originCellKey: string,
    destinationCellKey: string,
    upstreamOnly = false
  ): readonly string[] | undefined => {
    const origin = nodesByKey.get(originCellKey);
    const destination = nodesByKey.get(destinationCellKey);
    if (!origin || !destination) return undefined;
    if (originCellKey === destinationCellKey) return Object.freeze([originCellKey]);
    const queue = [originCellKey];
    const parentByKey = new Map<string, string | undefined>([[originCellKey, undefined]]);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const currentKey = queue[cursor]!;
      const current = nodesByKey.get(currentKey)!;
      const nextKeys = upstreamOnly ? current.upstream : current.navigableNeighbors;
      for (const nextKey of nextKeys) {
        if (parentByKey.has(nextKey)) continue;
        parentByKey.set(nextKey, currentKey);
        if (nextKey === destinationCellKey) {
          const reversed = [destinationCellKey];
          let parent = currentKey;
          while (parent !== originCellKey) {
            reversed.push(parent);
            parent = parentByKey.get(parent)!;
          }
          reversed.push(originCellKey);
          return Object.freeze(reversed.reverse());
        }
        queue.push(nextKey);
      }
    }
    return undefined;
  };

  const downstreamRouteToMouth = (cellKey: string) => {
    const cacheKey = `downstream:${cellKey}`;
    const cached = routeCache.get(cacheKey);
    if (cached !== undefined) return cached ?? undefined;
    const keys = followDownstreamKeys(cellKey);
    return cacheRoute(cacheKey, keys ? frozenRoute(keys, nodesByKey) : undefined);
  };
  const upstreamRouteToSource = (cellKey: string) => {
    const cacheKey = `upstream:${cellKey}`;
    const cached = routeCache.get(cacheKey);
    if (cached !== undefined) return cached ?? undefined;
    const node = nodesByKey.get(cellKey);
    const body = node ? bodyById.get(node.bodyId) : undefined;
    const keys = node?.regime === 'river' && body?.regime === 'river'
      ? shortestKeys(cellKey, body.sourceCellKey, true)
      : undefined;
    return cacheRoute(cacheKey, keys ? frozenRoute(keys, nodesByKey) : undefined);
  };
  const shortestRoute = (originCellKey: string, destinationCellKey: string) => {
    const cacheKey = `shortest:${originCellKey}>${destinationCellKey}`;
    const cached = routeCache.get(cacheKey);
    if (cached !== undefined) return cached ?? undefined;
    const keys = shortestKeys(originCellKey, destinationCellKey);
    return cacheRoute(cacheKey, keys ? frozenRoute(keys, nodesByKey) : undefined);
  };

  const frozenIssues = Object.freeze([...issues]);
  const status: CanonicalWaterNavigationTelemetry['status'] = nodes.length === 0
    ? 'unavailable'
    : invalidBodies.size === 0 && issues.length === 0
      ? 'exact'
      : 'partial';
  const riverBodyIds = new Set(nodes
    .filter((node) => node.regime === 'river')
    .map((node) => node.bodyId));
  const oceanBodyIds = new Set(nodes
    .filter((node) => node.regime === 'ocean')
    .map((node) => node.bodyId));
  const downstreamEdgeCount = nodes.filter((node) => node.downstream !== undefined).length;
  const oceanAdjacencyCount = nodes
    .filter((node) => node.regime === 'ocean')
    .reduce((total, node) => total + node.navigableNeighbors.filter(
      (neighborKey) => nodesByKey.get(neighborKey)?.regime === 'ocean'
    ).length, 0) / 2;
  const riverOceanConnectionCount = nodes
    .filter((node) => node.regime === 'river')
    .reduce((total, node) => total + node.navigableNeighbors.filter(
      (neighborKey) => nodesByKey.get(neighborKey)?.regime === 'ocean'
    ).length, 0);
  const telemetry: CanonicalWaterNavigationTelemetry = Object.freeze({
    status,
    inputCellRowCount,
    inputBodyRowCount,
    nodeCount: nodes.length,
    riverNodeCount: nodes.filter((node) => node.regime === 'river').length,
    oceanNodeCount: nodes.filter((node) => node.regime === 'ocean').length,
    riverBodyCount: riverBodyIds.size,
    oceanBodyCount: oceanBodyIds.size,
    downstreamEdgeCount,
    oceanAdjacencyCount,
    riverOceanConnectionCount,
    invalidBodyCount: invalidBodies.size,
    issueCount: frozenIssues.length,
    issuesTruncated,
    routeCacheLimit: CANONICAL_WATER_NAVIGATION_ROUTE_CACHE_LIMIT
  });

  return Object.freeze({
    status,
    nodes: frozenNodes,
    issues: frozenIssues,
    telemetry,
    node: (cellKey: string) => nodesByKey.get(cellKey),
    nextDownstreamCellKey: (cellKey: string) => nodesByKey.get(cellKey)?.downstream,
    previousUpstreamCellKeys: (cellKey: string) => (
      nodesByKey.get(cellKey)?.upstream ?? Object.freeze([])
    ),
    downstreamRouteToMouth,
    upstreamRouteToSource,
    shortestRoute
  });
}

import {
  GREATER_REALM_CHUNK_HANDLE_PATTERN,
  GREATER_REALM_MAX_ROUTE_DEPTH,
  GREATER_REALM_MAX_ROUTE_PAGE,
  GREATER_REALM_MAX_WINDOW_RADIUS,
} from './atlasPolicy';

export const PTR_ATLAS_MAX_RESOURCE_CHUNK_HANDLES = 8;
const U32_MAX = 0xffff_ffff;

export class PtrAtlasReadPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'PtrAtlasReadPolicyError';
  }
}

function fail(code: string): never {
  throw new PtrAtlasReadPolicyError(code);
}

function safeInteger(value: number, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

export function requirePtrWindowRequest(radius: number) {
  if (!safeInteger(radius, 0, GREATER_REALM_MAX_WINDOW_RADIUS)) {
    fail('PTR_ATLAS_WINDOW_INVALID');
  }
  return Object.freeze({ radius });
}

export function requirePtrChunkRequest(chunkHandle: string, lod: number) {
  if (!GREATER_REALM_CHUNK_HANDLE_PATTERN.test(chunkHandle)) {
    fail('PTR_ATLAS_CHUNK_HANDLE_INVALID');
  }
  if (!safeInteger(lod, 0, 3)) fail('PTR_ATLAS_LOD_INVALID');
  return Object.freeze({ chunkHandle, lod });
}

export function requirePtrResourceChunkHandles(
  chunkHandles: readonly string[],
): readonly string[] {
  for (let index = 0; index < chunkHandles.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(chunkHandles, index)) {
      fail('PTR_ATLAS_RESOURCE_BATCH_INVALID');
    }
  }
  if (
    chunkHandles.length < 1
    || chunkHandles.length > PTR_ATLAS_MAX_RESOURCE_CHUNK_HANDLES
    || new Set(chunkHandles).size !== chunkHandles.length
    || chunkHandles.some(handle => !GREATER_REALM_CHUNK_HANDLE_PATTERN.test(handle))
  ) fail('PTR_ATLAS_RESOURCE_BATCH_INVALID');
  return Object.freeze([...chunkHandles]);
}

export function requirePtrRoutePageRequest(offset: number, limit: number) {
  if (
    !safeInteger(offset, 0, U32_MAX)
    || !safeInteger(limit, 1, GREATER_REALM_MAX_ROUTE_PAGE)
  ) fail('PTR_ATLAS_ROUTE_PAGE_INVALID');
  return Object.freeze({ offset, limit });
}

export type PtrRouteNode = Readonly<{
  cellKey: string;
  atlasId: string;
  componentKey: string | undefined;
  atlasQ: number;
  atlasR: number;
  passable: boolean;
  routeDepth: number | undefined;
  routeParentDirection: number | undefined;
}>;

const AXIAL_DIRECTIONS = Object.freeze([
  Object.freeze([1, 0]),
  Object.freeze([1, -1]),
  Object.freeze([0, -1]),
  Object.freeze([-1, 0]),
  Object.freeze([-1, 1]),
  Object.freeze([0, 1]),
] as const);

function routeNodeValid(
  node: PtrRouteNode,
  atlasId: string,
  componentKey: string,
): boolean {
  return node.atlasId === atlasId
    && node.componentKey === componentKey
    && node.passable
    && safeInteger(node.routeDepth ?? -1, 0, GREATER_REALM_MAX_ROUTE_DEPTH)
    && safeInteger(node.atlasQ, -0x8000_0000, 0x7fff_ffff)
    && safeInteger(node.atlasR, -0x8000_0000, 0x7fff_ffff);
}

/** Build one bounded page over the verified parent tree without graph search. */
export function planPtrTreeRoutePage<T extends PtrRouteNode>(
  origin: T,
  destination: T,
  offset: number,
  limit: number,
  findAtCoordinate: (q: number, r: number) => T | null,
): Readonly<{
  cells: readonly T[];
  totalLength: number;
  nextOffset: number | undefined;
  complete: boolean;
}> {
  requirePtrRoutePageRequest(offset, limit);
  const atlasId = origin.atlasId;
  const componentKey = origin.componentKey;
  if (
    componentKey === undefined
    || destination.componentKey !== componentKey
    || !routeNodeValid(origin, atlasId, componentKey)
    || !routeNodeValid(destination, atlasId, componentKey)
  ) fail('PTR_ATLAS_ROUTE_UNAVAILABLE');

  const chainToRoot = (start: T): readonly T[] => {
    const chain: T[] = [];
    const seen = new Set<string>();
    let current: T | null = start;
    while (current !== null) {
      const expectedDepth = start.routeDepth! - chain.length;
      if (
        chain.length > GREATER_REALM_MAX_ROUTE_DEPTH
        || seen.has(current.cellKey)
        || !routeNodeValid(current, atlasId, componentKey)
        || current.routeDepth !== expectedDepth
      ) fail('PTR_ATLAS_ROUTE_UNAVAILABLE');
      seen.add(current.cellKey);
      chain.push(current);
      if (current.routeDepth === 0) {
        if (current.routeParentDirection !== undefined) {
          fail('PTR_ATLAS_ROUTE_UNAVAILABLE');
        }
        break;
      }
      const direction = AXIAL_DIRECTIONS[current.routeParentDirection ?? -1];
      if (direction === undefined) fail('PTR_ATLAS_ROUTE_UNAVAILABLE');
      const parent = findAtCoordinate(
        current.atlasQ + direction[0],
        current.atlasR + direction[1],
      );
      if (parent === null || parent.routeDepth !== current.routeDepth - 1) {
        fail('PTR_ATLAS_ROUTE_UNAVAILABLE');
      }
      current = parent;
    }
    if (chain[chain.length - 1]?.routeDepth !== 0) {
      fail('PTR_ATLAS_ROUTE_UNAVAILABLE');
    }
    return Object.freeze(chain);
  };

  const originChain = chainToRoot(origin);
  const destinationChain = chainToRoot(destination);
  const originIndexes = new Map(
    originChain.map((cell, index) => [cell.cellKey, index] as const),
  );
  let originLcaIndex = -1;
  let destinationLcaIndex = -1;
  for (let index = 0; index < destinationChain.length; index += 1) {
    const candidate = originIndexes.get(destinationChain[index]!.cellKey);
    if (candidate !== undefined) {
      originLcaIndex = candidate;
      destinationLcaIndex = index;
      break;
    }
  }
  if (originLcaIndex < 0 || destinationLcaIndex < 0) {
    fail('PTR_ATLAS_ROUTE_UNAVAILABLE');
  }
  const path = [
    ...originChain.slice(0, originLcaIndex + 1),
    ...destinationChain.slice(0, destinationLcaIndex).reverse(),
  ];
  if (
    path.length > GREATER_REALM_MAX_ROUTE_DEPTH * 2 + 1
    || offset > path.length
  ) fail('PTR_ATLAS_ROUTE_UNAVAILABLE');
  const cells = Object.freeze(path.slice(offset, offset + limit));
  const nextOffset = offset + cells.length < path.length
    ? offset + cells.length
    : undefined;
  return Object.freeze({
    cells,
    totalLength: path.length,
    nextOffset,
    complete: nextOffset === undefined,
  });
}

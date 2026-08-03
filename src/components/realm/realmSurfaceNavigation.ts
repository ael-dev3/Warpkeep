import type { RealmEconomicResourceKey } from './realmResourcePresentation';

export type RealmSurfaceResourceKey = RealmEconomicResourceKey | 'marks';

export type RealmSurfaceRoute =
  | Readonly<{ kind: 'commands' }>
  | Readonly<{ kind: 'settings' }>
  | Readonly<{ kind: 'explore' }>
  | Readonly<{ kind: 'inner-keep' }>
  | Readonly<{ kind: 'inner-keep-slot'; slotId: string }>
  | Readonly<{ kind: 'inner-keep-building'; buildingKind: string }>
  | Readonly<{ kind: 'workers' }>
  | Readonly<{ kind: 'worker'; workerId: string }>
  | Readonly<{ kind: 'keep'; castleId: number }>
  | Readonly<{ kind: 'resource-balance'; resource: RealmSurfaceResourceKey }>
  | Readonly<{
      kind: 'resource-site';
      resource: RealmEconomicResourceKey;
      siteId: string;
    }>
  | Readonly<{ kind: 'water'; cellKey: string }>
  | Readonly<{ kind: 'terrain'; tileKey: string }>;

export type RealmSurfaceHistoryState = Readonly<{
  version: 1;
  session: string;
  stack: readonly RealmSurfaceRoute[];
}>;

export const REALM_SURFACE_HISTORY_KEY = 'warpkeepRealmNavigation';
export const REALM_SURFACE_MAX_DEPTH = 8;

const SAFE_ROUTE_ID = /^[A-Za-z0-9:,_-]{1,160}$/;
const RESOURCE_KEYS = new Set<RealmSurfaceResourceKey>([
  'food',
  'wood',
  'stone',
  'gold',
  'marks'
]);
const ECONOMIC_RESOURCE_KEYS = new Set<RealmEconomicResourceKey>([
  'food',
  'wood',
  'stone',
  'gold'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function isSafeRouteId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ROUTE_ID.test(value);
}

export function readRealmSurfaceRoute(value: unknown): RealmSurfaceRoute | undefined {
  if (!isRecord(value) || typeof value.kind !== 'string') return undefined;
  if (
    value.kind === 'commands'
    || value.kind === 'settings'
    || value.kind === 'explore'
    || value.kind === 'inner-keep'
    || value.kind === 'workers'
  ) {
    return hasExactKeys(value, ['kind'])
      ? Object.freeze({ kind: value.kind })
      : undefined;
  }
  if (value.kind === 'inner-keep-slot') {
    return hasExactKeys(value, ['kind', 'slotId']) && isSafeRouteId(value.slotId)
      ? Object.freeze({ kind: 'inner-keep-slot', slotId: value.slotId })
      : undefined;
  }
  if (value.kind === 'inner-keep-building') {
    return hasExactKeys(value, ['kind', 'buildingKind'])
      && isSafeRouteId(value.buildingKind)
      ? Object.freeze({
          kind: 'inner-keep-building',
          buildingKind: value.buildingKind
        })
      : undefined;
  }
  if (value.kind === 'worker') {
    return hasExactKeys(value, ['kind', 'workerId']) && isSafeRouteId(value.workerId)
      ? Object.freeze({ kind: 'worker', workerId: value.workerId })
      : undefined;
  }
  if (value.kind === 'keep') {
    return hasExactKeys(value, ['kind', 'castleId'])
      && typeof value.castleId === 'number'
      && Number.isSafeInteger(value.castleId)
      && value.castleId > 0
      ? Object.freeze({ kind: 'keep', castleId: value.castleId })
      : undefined;
  }
  if (value.kind === 'resource-balance') {
    return hasExactKeys(value, ['kind', 'resource'])
      && typeof value.resource === 'string'
      && RESOURCE_KEYS.has(value.resource as RealmSurfaceResourceKey)
      ? Object.freeze({
          kind: 'resource-balance',
          resource: value.resource as RealmSurfaceResourceKey
        })
      : undefined;
  }
  if (value.kind === 'resource-site') {
    return hasExactKeys(value, ['kind', 'resource', 'siteId'])
      && typeof value.resource === 'string'
      && ECONOMIC_RESOURCE_KEYS.has(value.resource as RealmEconomicResourceKey)
      && isSafeRouteId(value.siteId)
      ? Object.freeze({
          kind: 'resource-site',
          resource: value.resource as RealmEconomicResourceKey,
          siteId: value.siteId
        })
      : undefined;
  }
  if (value.kind === 'water') {
    return hasExactKeys(value, ['kind', 'cellKey']) && isSafeRouteId(value.cellKey)
      ? Object.freeze({ kind: 'water', cellKey: value.cellKey })
      : undefined;
  }
  if (value.kind === 'terrain') {
    return hasExactKeys(value, ['kind', 'tileKey']) && isSafeRouteId(value.tileKey)
      ? Object.freeze({ kind: 'terrain', tileKey: value.tileKey })
      : undefined;
  }
  return undefined;
}

export function readRealmSurfaceStack(value: unknown): readonly RealmSurfaceRoute[] | undefined {
  if (!Array.isArray(value) || value.length > REALM_SURFACE_MAX_DEPTH) return undefined;
  const stack: RealmSurfaceRoute[] = [];
  for (const candidate of value) {
    const route = readRealmSurfaceRoute(candidate);
    if (!route) return undefined;
    stack.push(route);
  }
  return Object.freeze(stack);
}

export function readRealmSurfaceHistoryState(
  value: unknown,
  expectedSession?: string
): RealmSurfaceHistoryState | undefined {
  if (
    !isRecord(value)
    || !hasExactKeys(value, ['version', 'session', 'stack'])
    || value.version !== 1
    || !isSafeRouteId(value.session)
    || (expectedSession !== undefined && value.session !== expectedSession)
  ) {
    return undefined;
  }
  const stack = readRealmSurfaceStack(value.stack);
  return stack
    ? Object.freeze({ version: 1, session: value.session, stack })
    : undefined;
}

export function sameRealmSurfaceRoute(
  left: RealmSurfaceRoute | undefined,
  right: RealmSurfaceRoute | undefined
) {
  if (!left || !right || left.kind !== right.kind) return left === right;
  return JSON.stringify(left) === JSON.stringify(right);
}

export function pushRealmSurfaceRoute(
  stack: readonly RealmSurfaceRoute[],
  route: RealmSurfaceRoute
) {
  const validated = readRealmSurfaceRoute(route);
  if (!validated) return stack;
  if (sameRealmSurfaceRoute(stack.at(-1), validated)) return stack;
  return Object.freeze([...stack.slice(0, REALM_SURFACE_MAX_DEPTH - 1), validated]);
}

export function replaceRealmSurfaceRoute(
  stack: readonly RealmSurfaceRoute[],
  route: RealmSurfaceRoute
) {
  const validated = readRealmSurfaceRoute(route);
  if (!validated) return stack;
  if (stack.length === 0) return Object.freeze([validated]);
  if (sameRealmSurfaceRoute(stack.at(-1), validated)) return stack;
  return Object.freeze([...stack.slice(0, -1), validated]);
}

export function popRealmSurfaceRoute(stack: readonly RealmSurfaceRoute[]) {
  return stack.length === 0 ? stack : Object.freeze(stack.slice(0, -1));
}

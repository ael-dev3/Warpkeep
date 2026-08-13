export const OWNER_CANARY_RESOURCE_KINDS = Object.freeze([
  'food',
  'wood',
  'stone',
  'gold',
] as const);

export type OwnerCanaryResourceKind = typeof OWNER_CANARY_RESOURCE_KINDS[number];
export type OwnerCanaryWorkerStatus = 'idle' | 'outbound' | 'gathering' | 'returning';

export type OwnerCanaryWorkerEvidence = Readonly<{
  ordinal: number;
  status: OwnerCanaryWorkerStatus;
  resourceKind: OwnerCanaryResourceKind | null;
  accruedAmount: string;
  materializedAmount: string;
  availableAmount: string;
}>;

export type OwnerCanaryStateEvidence = Readonly<{
  tier: number;
  atlasRevision: string;
  observedAtMicros: string;
  workers: readonly OwnerCanaryWorkerEvidence[];
  resources: Readonly<Record<OwnerCanaryResourceKind, string>>;
}>;

export type OwnerCanaryJourneyEvidence = Readonly<{
  baseline: OwnerCanaryStateEvidence;
  terminal: OwnerCanaryStateEvidence;
  routes: readonly Readonly<{
    resourceKind: OwnerCanaryResourceKind;
    routeLength: number;
    nodeCount: number;
  }>[];
  dispatches: readonly Readonly<{
    ordinal: number;
    resourceKind: OwnerCanaryResourceKind;
    accepted: boolean;
  }>[];
  replays: readonly boolean[];
  gathering: readonly Readonly<{
    ordinal: number;
    resourceKind: OwnerCanaryResourceKind;
    gatheringElapsedMs: number;
    completedQuantumCount: number;
  }>[];
}>;

export type OwnerCanarySanitizedEvidence = OwnerCanaryJourneyEvidence & Readonly<{
  sameSubjectCommitment: string;
  freshAuthenticationStageCount: 10;
  tokenPersisted: false;
  adminImpersonation: false;
  notificationBypass: false;
}>;

const U64_MAX = 18_446_744_073_709_551_615n;
const DECIMAL_PATTERN = /^(?:0|[1-9]\d{0,19})$/;
const WORKER_STATUSES = new Set<OwnerCanaryWorkerStatus>([
  'idle',
  'outbound',
  'gathering',
  'returning',
]);
const RESOURCE_KINDS = new Set<OwnerCanaryResourceKind>(OWNER_CANARY_RESOURCE_KINDS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key))
    ? value
    : undefined;
}

function decimal(value: unknown, positive = false): string | undefined {
  if (typeof value !== 'string' || !DECIMAL_PATTERN.test(value)) return undefined;
  try {
    const parsed = BigInt(value);
    return parsed <= U64_MAX && (!positive || parsed > 0n) ? value : undefined;
  } catch {
    return undefined;
  }
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number | undefined {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= minimum
    && value <= maximum
    ? value
    : undefined;
}

function resourceKind(value: unknown): OwnerCanaryResourceKind | undefined {
  return typeof value === 'string' && RESOURCE_KINDS.has(value as OwnerCanaryResourceKind)
    ? value as OwnerCanaryResourceKind
    : undefined;
}

function worker(value: unknown): OwnerCanaryWorkerEvidence | undefined {
  const record = exactRecord(value, [
    'ordinal',
    'status',
    'resourceKind',
    'accruedAmount',
    'materializedAmount',
    'availableAmount',
  ]);
  if (!record) return undefined;
  const ordinal = boundedInteger(record.ordinal, 1, 4);
  const status = typeof record.status === 'string'
    && WORKER_STATUSES.has(record.status as OwnerCanaryWorkerStatus)
    ? record.status as OwnerCanaryWorkerStatus
    : undefined;
  const kind = record.resourceKind === null ? null : resourceKind(record.resourceKind);
  const accruedAmount = decimal(record.accruedAmount);
  const materializedAmount = decimal(record.materializedAmount);
  const availableAmount = decimal(record.availableAmount);
  if (
    ordinal === undefined
    || status === undefined
    || kind === undefined
    || accruedAmount === undefined
    || materializedAmount === undefined
    || availableAmount === undefined
  ) return undefined;
  if (status === 'idle' ? kind !== null : kind === null) return undefined;
  return Object.freeze({
    ordinal,
    status,
    resourceKind: kind,
    accruedAmount,
    materializedAmount,
    availableAmount,
  });
}

function stateEvidence(value: unknown): OwnerCanaryStateEvidence | undefined {
  const record = exactRecord(value, [
    'tier',
    'atlasRevision',
    'observedAtMicros',
    'workers',
    'resources',
  ]);
  if (!record || !Array.isArray(record.workers) || record.workers.length > 4) return undefined;
  const tier = boundedInteger(record.tier, 0, 255);
  const atlasRevision = decimal(record.atlasRevision);
  const observedAtMicros = decimal(record.observedAtMicros, true);
  const workers = record.workers.map(worker);
  if (
    tier === undefined
    || atlasRevision === undefined
    || observedAtMicros === undefined
    || workers.some((entry) => entry === undefined)
  ) return undefined;
  const exactWorkers = workers as OwnerCanaryWorkerEvidence[];
  if (new Set(exactWorkers.map((entry) => entry.ordinal)).size !== exactWorkers.length) return undefined;

  const resources = exactRecord(record.resources, OWNER_CANARY_RESOURCE_KINDS);
  if (!resources) return undefined;
  const food = decimal(resources.food);
  const wood = decimal(resources.wood);
  const stone = decimal(resources.stone);
  const gold = decimal(resources.gold);
  if (food === undefined || wood === undefined || stone === undefined || gold === undefined) {
    return undefined;
  }
  return Object.freeze({
    tier,
    atlasRevision,
    observedAtMicros,
    workers: Object.freeze(exactWorkers),
    resources: Object.freeze({ food, wood, stone, gold }),
  });
}

function exactFourByResource<Value extends Readonly<{ resourceKind: OwnerCanaryResourceKind }>>(
  values: readonly Value[],
): boolean {
  return values.length === OWNER_CANARY_RESOURCE_KINDS.length
    && new Set(values.map((entry) => entry.resourceKind)).size === OWNER_CANARY_RESOURCE_KINDS.length
    && OWNER_CANARY_RESOURCE_KINDS.every((kind) => values.some((entry) => entry.resourceKind === kind));
}

function routes(value: unknown): OwnerCanaryJourneyEvidence['routes'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed = value.map((entry) => {
    const record = exactRecord(entry, ['resourceKind', 'routeLength', 'nodeCount']);
    if (!record) return undefined;
    const kind = resourceKind(record.resourceKind);
    const routeLength = boundedInteger(record.routeLength, 1, 1_000_000);
    const nodeCount = boundedInteger(record.nodeCount, 1, 1_000_000);
    return kind && routeLength !== undefined && nodeCount !== undefined
      ? Object.freeze({ resourceKind: kind, routeLength, nodeCount })
      : undefined;
  });
  if (parsed.some((entry) => entry === undefined)) return undefined;
  const exact = parsed as Array<NonNullable<typeof parsed[number]>>;
  return exactFourByResource(exact) ? Object.freeze(exact) : undefined;
}

function dispatches(value: unknown): OwnerCanaryJourneyEvidence['dispatches'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed = value.map((entry) => {
    const record = exactRecord(entry, ['ordinal', 'resourceKind', 'accepted']);
    if (!record) return undefined;
    const ordinal = boundedInteger(record.ordinal, 1, 4);
    const kind = resourceKind(record.resourceKind);
    return ordinal !== undefined && kind && typeof record.accepted === 'boolean'
      ? Object.freeze({ ordinal, resourceKind: kind, accepted: record.accepted })
      : undefined;
  });
  if (parsed.some((entry) => entry === undefined)) return undefined;
  const exact = parsed as Array<NonNullable<typeof parsed[number]>>;
  return exactFourByResource(exact) && new Set(exact.map((entry) => entry.ordinal)).size === 4
    ? Object.freeze(exact)
    : undefined;
}

function gathering(value: unknown): OwnerCanaryJourneyEvidence['gathering'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed = value.map((entry) => {
    const record = exactRecord(entry, [
      'ordinal',
      'resourceKind',
      'gatheringElapsedMs',
      'completedQuantumCount',
    ]);
    if (!record) return undefined;
    const ordinal = boundedInteger(record.ordinal, 1, 4);
    const kind = resourceKind(record.resourceKind);
    const gatheringElapsedMs = boundedInteger(record.gatheringElapsedMs, 0, 86_400_000);
    const completedQuantumCount = boundedInteger(record.completedQuantumCount, 0, 1_000_000);
    return ordinal !== undefined
      && kind
      && gatheringElapsedMs !== undefined
      && completedQuantumCount !== undefined
      ? Object.freeze({ ordinal, resourceKind: kind, gatheringElapsedMs, completedQuantumCount })
      : undefined;
  });
  if (parsed.some((entry) => entry === undefined)) return undefined;
  const exact = parsed as Array<NonNullable<typeof parsed[number]>>;
  return exactFourByResource(exact) && new Set(exact.map((entry) => entry.ordinal)).size === 4
    ? Object.freeze(exact)
    : undefined;
}

export function sanitizeOwnerCanaryJourneyEvidence(
  value: unknown,
): OwnerCanaryJourneyEvidence | undefined {
  const record = exactRecord(value, [
    'baseline',
    'terminal',
    'routes',
    'dispatches',
    'replays',
    'gathering',
  ]);
  if (!record) return undefined;
  const baseline = stateEvidence(record.baseline);
  const terminal = stateEvidence(record.terminal);
  const safeRoutes = routes(record.routes);
  const safeDispatches = dispatches(record.dispatches);
  const safeGathering = gathering(record.gathering);
  const replays = Array.isArray(record.replays)
    && record.replays.length === 4
    && record.replays.every((entry) => typeof entry === 'boolean')
    ? Object.freeze([...record.replays] as boolean[])
    : undefined;
  return baseline && terminal && safeRoutes && safeDispatches && replays && safeGathering
    ? Object.freeze({
        baseline,
        terminal,
        routes: safeRoutes,
        dispatches: safeDispatches,
        replays,
        gathering: safeGathering,
      })
    : undefined;
}

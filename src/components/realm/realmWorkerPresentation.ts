import {
  REALM_RESOURCE_POLICY_VERSION,
  type RealmEconomicResourceKey
} from './realmResourcePresentation';

export const CASTLE_WORKER_ORDINALS = Object.freeze([1, 2, 3, 4] as const);
export const CASTLE_WORKER_POLICY_VERSION = 'genesis-001-castle-workers-v1';
export const CASTLE_WORKER_REALM_ID = 'GENESIS_001';
export type RealmWorkerOrdinal = typeof CASTLE_WORKER_ORDINALS[number];
export type RealmWorkerStatus = 'idle' | 'outbound' | 'gathering' | 'returning';
export type RealmWorkerSystemMode = 'staged' | 'active';

export type RealmWorkerSystemPresentation = Readonly<{
  realmId: string;
  policyVersion: string;
  workersPerCastle: 4;
  expectedCastleCount: number;
  expectedWorkerCount: number;
  rosterDigest: string;
  mode: RealmWorkerSystemMode;
  legacyDrainRequired: boolean;
}>;

export type RealmWorkerPublicPresentation = Readonly<{
  workerId: string;
  ordinal: RealmWorkerOrdinal;
  originCastleId: number;
  originCastleName: string;
  status: RealmWorkerStatus;
  resourceKind?: RealmEconomicResourceKey;
  siteId?: string;
  startedAtMicros?: bigint;
  arrivesAtMicros?: bigint;
  gatheringEndsAtMicros?: bigint;
  returnStartedAtMicros?: bigint;
  returnsAtMicros?: bigint;
  routeSteps?: number;
  returnStartProgressBasisPoints?: number;
  timelineRevision: number;
  revision: bigint;
  ownedByViewer: boolean;
}>;

/** Browser-safe public lease containing only public worker/resource coordinates. */
export type RealmWorkerNodeOccupation = Readonly<{
  nodeKey: string;
  resourceKind: RealmEconomicResourceKey;
  siteId: string;
  workerId: string;
  workerOrdinal: RealmWorkerOrdinal;
  originCastleId: number;
  phase: 'outbound' | 'gathering';
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  timelineRevision: number;
}>;

export type WorkerRosterPresentation = Readonly<{
  castleId: number;
  observedAtMicros: bigint;
  workers: readonly Readonly<{
    workerId: string;
    ordinal: RealmWorkerOrdinal;
    status: RealmWorkerStatus;
    resourceKind?: RealmEconomicResourceKey;
    siteId?: string;
    accruedAmount: bigint;
    materializedAmount: bigint;
    availableAmount: bigint;
    observedAtMicros: bigint;
    revision: bigint;
  }>[];
}>;

export type ReadyWorkerResourceState = Readonly<{
  status: 'ready';
  fid: bigint;
  available: Readonly<Record<RealmEconomicResourceKey, bigint>>;
  pending: Readonly<Record<RealmEconomicResourceKey, bigint>>;
  observedAtMicros: bigint;
  settledThroughMicros: bigint;
  revision: bigint;
  resourcePolicyVersion: string;
  workerPolicyVersion: string;
  workerSystemMode: RealmWorkerSystemMode;
}>;

export type ReadyPublicWorkerProjection = Readonly<{
  mode: 'active';
  system: RealmWorkerSystemPresentation;
  workers: readonly RealmWorkerPublicPresentation[];
  occupations: readonly RealmWorkerNodeOccupation[];
}>;

export type ReadyWorkerProjection = ReadyPublicWorkerProjection & Readonly<{
  /** The only four workers permitted in owner command surfaces. */
  ownedWorkers: readonly RealmWorkerPublicPresentation[];
}>;

export type RealmWorkerDestinationPresentation = Readonly<{
  resourceKind: RealmEconomicResourceKey;
  siteId: string;
  label: string;
}>;

export type RealmWorkerDestinationNode = Readonly<{
  siteId: string;
  coord: Readonly<{ q: number; r: number }>;
  tier: number;
  availability: string;
}>;

const resourceKinds = new Set<RealmEconomicResourceKey>(['food', 'wood', 'stone', 'gold']);
const workerStatuses = new Set<RealmWorkerStatus>(['idle', 'outbound', 'gathering', 'returning']);
const occupationPhases = new Set<RealmWorkerNodeOccupation['phase']>(['outbound', 'gathering']);
const RESOURCE_ORDER = Object.freeze(['food', 'wood', 'stone', 'gold'] as const);
const U64_MAX = (1n << 64n) - 1n;

/**
 * Resource type is intentionally not a worker capacity. Four workers may all
 * target (for example) Wood, provided they select four different available
 * node keys. The canonical node lease remains the single-occupancy boundary.
 */
export function resolveRealmWorkerDestinations(input: Readonly<{
  resourceKind: RealmEconomicResourceKey;
  resourceLabel: string;
  nodes: readonly RealmWorkerDestinationNode[];
  occupiedNodeKeys: ReadonlySet<string>;
}>): readonly RealmWorkerDestinationPresentation[] {
  const destinations: RealmWorkerDestinationPresentation[] = [];
  for (const node of input.nodes) {
    const nodeKey = `${input.resourceKind}:${node.siteId}`;
    if (node.availability !== 'available' || input.occupiedNodeKeys.has(nodeKey)) continue;
    destinations.push(Object.freeze({
      resourceKind: input.resourceKind,
      siteId: node.siteId,
      label: `${input.resourceLabel} · Tier ${node.tier} · cell ${node.coord.q}, ${node.coord.r}`
    }));
  }
  return Object.freeze(destinations);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeNumber(value: unknown, positive = false) {
  const number = typeof value === 'bigint'
    && value >= 0n
    && value <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(value)
    : value;
  return typeof number === 'number'
    && Number.isSafeInteger(number)
    && number >= 0
    && (!positive || number > 0)
    ? number
    : undefined;
}

function safeBigInt(value: unknown) {
  return typeof value === 'bigint' && value >= 0n && value <= U64_MAX ? value : undefined;
}

function optionalBigInt(value: unknown): bigint | undefined | null {
  return value === undefined || value === null ? undefined : safeBigInt(value) ?? null;
}

function optionalNumber(value: unknown): number | undefined | null {
  return value === undefined || value === null ? undefined : safeNumber(value) ?? null;
}

function optionalResource(value: unknown) {
  return typeof value === 'string' && resourceKinds.has(value as RealmEconomicResourceKey)
    ? value as RealmEconomicResourceKey
    : value === undefined || value === null ? undefined : null;
}

function optionalString(value: unknown) {
  return value === undefined || value === null
    ? undefined
    : typeof value === 'string' && value.length > 0 ? value : null;
}

export function canonicalWorkerId(castleId: number, ordinal: RealmWorkerOrdinal) {
  return `genesis-001-castle-${castleId}-worker-${String(ordinal).padStart(2, '0')}`;
}

export function workerRosterDigestForCastleIds(castleIds: readonly number[]) {
  let hash = 0xcbf29ce484222325n;
  for (const castleId of [...castleIds].sort((left, right) => left - right)) {
    for (const ordinal of CASTLE_WORKER_ORDINALS) {
      for (const byte of new TextEncoder().encode(canonicalWorkerId(castleId, ordinal))) {
        hash ^= BigInt(byte);
        hash = (hash * 0x100000001b3n) & U64_MAX;
      }
    }
  }
  return hash.toString(16).padStart(16, '0');
}

function assignedWorkerStateIsConsistent(worker: RealmWorkerPublicPresentation) {
  const assigned = worker.status !== 'idle';
  if (!assigned) {
    return worker.resourceKind === undefined
      && worker.siteId === undefined
      && worker.startedAtMicros === undefined
      && worker.arrivesAtMicros === undefined
      && worker.gatheringEndsAtMicros === undefined
      && worker.returnStartedAtMicros === undefined
      && worker.returnsAtMicros === undefined
      && worker.routeSteps === undefined
      && worker.returnStartProgressBasisPoints === undefined;
  }
  if (
    worker.resourceKind === undefined
    || worker.siteId === undefined
    || worker.startedAtMicros === undefined
    || worker.arrivesAtMicros === undefined
    || worker.gatheringEndsAtMicros === undefined
    || worker.returnsAtMicros === undefined
    || worker.routeSteps === undefined
    || worker.routeSteps <= 0
    || !(worker.startedAtMicros < worker.arrivesAtMicros
      && worker.arrivesAtMicros < worker.gatheringEndsAtMicros)
  ) return false;
  if (worker.status !== 'returning') {
    return worker.returnStartedAtMicros === undefined
      && worker.returnStartProgressBasisPoints === undefined
      && worker.gatheringEndsAtMicros < worker.returnsAtMicros;
  }
  if (
    worker.returnStartedAtMicros === undefined
    || worker.returnStartedAtMicros < worker.startedAtMicros
    || worker.returnStartedAtMicros > worker.gatheringEndsAtMicros
    || worker.returnStartProgressBasisPoints === undefined
    || worker.returnStartProgressBasisPoints > 10_000
  ) return false;
  const outboundDuration = worker.arrivesAtMicros - worker.startedAtMicros;
  const expectedProgress = worker.returnStartedAtMicros >= worker.arrivesAtMicros
    ? 10_000
    : Number(
      ((worker.returnStartedAtMicros - worker.startedAtMicros) * 10_000n)
      / outboundDuration
    );
  const expectedReturnsAtMicros = worker.returnStartedAtMicros
    + (outboundDuration * BigInt(expectedProgress)) / 10_000n;
  return worker.returnStartProgressBasisPoints === expectedProgress
    && worker.returnsAtMicros === expectedReturnsAtMicros;
}

export function decodeRealmWorkerSystem(value: unknown): RealmWorkerSystemPresentation | undefined {
  if (!record(value)) return undefined;
  const workersPerCastle = safeNumber(value.workersPerCastle);
  const expectedCastleCount = safeNumber(value.expectedCastleCount);
  const expectedWorkerCount = safeNumber(value.expectedWorkerCount);
  const mode = value.mode === 'active' || value.mode === 'staged' ? value.mode : undefined;
  if (
    typeof value.realmId !== 'string' || value.realmId.length === 0
    || typeof value.policyVersion !== 'string' || value.policyVersion.length === 0
    || workersPerCastle !== 4 || expectedCastleCount === undefined || expectedWorkerCount === undefined
    || expectedWorkerCount !== expectedCastleCount * 4
    || typeof value.rosterDigest !== 'string' || !/^[0-9a-f]{16}$/.test(value.rosterDigest)
    || mode === undefined || typeof value.legacyDrainRequired !== 'boolean'
  ) return undefined;
  return Object.freeze({
    realmId: value.realmId,
    policyVersion: value.policyVersion,
    workersPerCastle: 4 as const,
    expectedCastleCount,
    expectedWorkerCount,
    rosterDigest: value.rosterDigest,
    mode,
    legacyDrainRequired: value.legacyDrainRequired
  });
}

export function decodeRealmWorkerPublicRows(
  rows: readonly unknown[],
  castleNames: ReadonlyMap<number, string>,
  ownCastleId: number
): readonly RealmWorkerPublicPresentation[] | undefined {
  const decoded: RealmWorkerPublicPresentation[] = [];
  const ids = new Set<string>();
  const castleOrdinals = new Set<string>();
  for (const value of rows) {
    if (!record(value)) return undefined;
    const ordinal = safeNumber(value.ordinal);
    const originCastleId = safeNumber(value.originCastleId, true);
    const timelineRevision = safeNumber(value.timelineRevision);
    const revision = safeBigInt(value.revision);
    const status = workerStatuses.has(value.status as RealmWorkerStatus)
      ? value.status as RealmWorkerStatus
      : undefined;
    const resourceKind = optionalResource(value.resourceKind);
    const siteId = optionalString(value.siteId);
    const startedAtMicros = optionalBigInt(value.startedAtMicros);
    const arrivesAtMicros = optionalBigInt(value.arrivesAtMicros);
    const gatheringEndsAtMicros = optionalBigInt(value.gatheringEndsAtMicros);
    const returnStartedAtMicros = optionalBigInt(value.returnStartedAtMicros);
    const returnsAtMicros = optionalBigInt(value.returnsAtMicros);
    const routeSteps = optionalNumber(value.routeSteps);
    const returnStartProgressBasisPoints = optionalNumber(value.returnStartProgressBasisPoints);
    if (
      typeof value.workerId !== 'string' || ids.has(value.workerId)
      || ordinal === undefined || !CASTLE_WORKER_ORDINALS.includes(ordinal as RealmWorkerOrdinal)
      || originCastleId === undefined || status === undefined || resourceKind === null || siteId === null
      || startedAtMicros === null || arrivesAtMicros === null || gatheringEndsAtMicros === null
      || returnStartedAtMicros === null || returnsAtMicros === null || routeSteps === null
      || returnStartProgressBasisPoints === null || timelineRevision === undefined || revision === undefined
      || !castleNames.has(originCastleId)
      || value.workerId !== canonicalWorkerId(originCastleId, ordinal as RealmWorkerOrdinal)
      || castleOrdinals.has(`${originCastleId}:${ordinal}`)
    ) return undefined;
    const worker: RealmWorkerPublicPresentation = Object.freeze({
      workerId: value.workerId,
      ordinal: ordinal as RealmWorkerOrdinal,
      originCastleId,
      originCastleName: castleNames.get(originCastleId)!,
      status,
      ...(resourceKind === undefined ? {} : { resourceKind }),
      ...(siteId === undefined ? {} : { siteId }),
      ...(startedAtMicros === undefined ? {} : { startedAtMicros }),
      ...(arrivesAtMicros === undefined ? {} : { arrivesAtMicros }),
      ...(gatheringEndsAtMicros === undefined ? {} : { gatheringEndsAtMicros }),
      ...(returnStartedAtMicros === undefined ? {} : { returnStartedAtMicros }),
      ...(returnsAtMicros === undefined ? {} : { returnsAtMicros }),
      ...(routeSteps === undefined ? {} : { routeSteps }),
      ...(returnStartProgressBasisPoints === undefined ? {} : { returnStartProgressBasisPoints }),
      timelineRevision,
      revision,
      ownedByViewer: originCastleId === ownCastleId
    });
    if (!assignedWorkerStateIsConsistent(worker)) return undefined;
    ids.add(value.workerId);
    castleOrdinals.add(`${originCastleId}:${ordinal}`);
    decoded.push(worker);
  }
  const byCastle = new Map<number, number>();
  for (const worker of decoded) {
    byCastle.set(worker.originCastleId, (byCastle.get(worker.originCastleId) ?? 0) + 1);
  }
  if (decoded.length > 0 && [...byCastle.values()].some((count) => count !== 4)) return undefined;
  return Object.freeze(decoded.sort((left, right) => (
    left.originCastleId - right.originCastleId || left.ordinal - right.ordinal
  )));
}

export function decodeRealmWorkerOccupations(rows: readonly unknown[]): readonly RealmWorkerNodeOccupation[] | undefined {
  const decoded: RealmWorkerNodeOccupation[] = [];
  const keys = new Set<string>();
  const workerIds = new Set<string>();
  for (const value of rows) {
    if (!record(value)) return undefined;
    const workerOrdinal = safeNumber(value.workerOrdinal);
    const originCastleId = safeNumber(value.originCastleId, true);
    const timelineRevision = safeNumber(value.timelineRevision);
    const resourceKind = optionalResource(value.resourceKind);
    const phase = occupationPhases.has(value.phase as RealmWorkerNodeOccupation['phase'])
      ? value.phase as RealmWorkerNodeOccupation['phase'] : undefined;
    const startedAtMicros = safeBigInt(value.startedAtMicros);
    const arrivesAtMicros = safeBigInt(value.arrivesAtMicros);
    const gatheringEndsAtMicros = safeBigInt(value.gatheringEndsAtMicros);
    if (
      typeof value.nodeKey !== 'string' || value.nodeKey.length === 0 || keys.has(value.nodeKey)
      || typeof value.siteId !== 'string' || value.siteId.length === 0
      || typeof value.workerId !== 'string' || workerIds.has(value.workerId)
      || resourceKind === undefined || resourceKind === null || phase === undefined
      || workerOrdinal === undefined || !CASTLE_WORKER_ORDINALS.includes(workerOrdinal as RealmWorkerOrdinal)
      || originCastleId === undefined || timelineRevision === undefined
      || startedAtMicros === undefined || arrivesAtMicros === undefined || gatheringEndsAtMicros === undefined
      || !(startedAtMicros < arrivesAtMicros && arrivesAtMicros < gatheringEndsAtMicros)
      || value.nodeKey !== `${resourceKind}:${value.siteId}`
    ) return undefined;
    keys.add(value.nodeKey);
    workerIds.add(value.workerId);
    decoded.push(Object.freeze({
      nodeKey: value.nodeKey,
      resourceKind,
      siteId: value.siteId,
      workerId: value.workerId,
      workerOrdinal: workerOrdinal as RealmWorkerOrdinal,
      originCastleId,
      phase,
      startedAtMicros,
      arrivesAtMicros,
      gatheringEndsAtMicros,
      timelineRevision
    }));
  }
  return Object.freeze(decoded.sort((left, right) => left.nodeKey.localeCompare(right.nodeKey)));
}

export function decodeWorkerRoster(value: unknown, expectedFid: bigint): WorkerRosterPresentation | undefined {
  const castleId = record(value) ? safeNumber(value.castleId, true) : undefined;
  const observedAtMicros = record(value) ? safeBigInt(value.observedAtMicros) : undefined;
  if (!record(value) || value.fid !== expectedFid || castleId === undefined
    || observedAtMicros === undefined || !Array.isArray(value.workers)) return undefined;
  const workers: WorkerRosterPresentation['workers'][number][] = [];
  const ids = new Set<string>();
  const ordinals = new Set<number>();
  for (const workerValue of value.workers) {
    if (!record(workerValue)) return undefined;
    const ordinal = safeNumber(workerValue.ordinal);
    const resourceKind = optionalResource(workerValue.resourceKind);
    const siteId = optionalString(workerValue.siteId);
    const accruedAmount = safeBigInt(workerValue.accruedAmount);
    const materializedAmount = safeBigInt(workerValue.materializedAmount);
    const availableAmount = safeBigInt(workerValue.availableAmount);
    const workerObservedAtMicros = safeBigInt(workerValue.observedAtMicros);
    const revision = safeBigInt(workerValue.revision);
    const status = workerStatuses.has(workerValue.status as RealmWorkerStatus)
      ? workerValue.status as RealmWorkerStatus : undefined;
    if (
      typeof workerValue.workerId !== 'string' || ids.has(workerValue.workerId)
      || ordinal === undefined || !CASTLE_WORKER_ORDINALS.includes(ordinal as RealmWorkerOrdinal)
      || ordinals.has(ordinal) || status === undefined || resourceKind === null || siteId === null
      || accruedAmount === undefined || materializedAmount === undefined || availableAmount === undefined
      || workerObservedAtMicros !== observedAtMicros || revision === undefined
      || workerValue.workerId !== canonicalWorkerId(castleId, ordinal as RealmWorkerOrdinal)
      || materializedAmount > accruedAmount || availableAmount !== accruedAmount - materializedAmount
      || (status === 'idle' ? resourceKind !== undefined || siteId !== undefined : resourceKind === undefined || siteId === undefined)
    ) return undefined;
    ids.add(workerValue.workerId);
    ordinals.add(ordinal);
    workers.push(Object.freeze({
      workerId: workerValue.workerId,
      ordinal: ordinal as RealmWorkerOrdinal,
      status,
      ...(resourceKind === undefined ? {} : { resourceKind }),
      ...(siteId === undefined ? {} : { siteId }),
      accruedAmount,
      materializedAmount,
      availableAmount,
      observedAtMicros: workerObservedAtMicros,
      revision
    }));
  }
  if (workers.length !== 4 || CASTLE_WORKER_ORDINALS.some((ordinal) => !ordinals.has(ordinal))) {
    return undefined;
  }
  return Object.freeze({
    castleId,
    observedAtMicros,
    workers: Object.freeze(workers.sort((left, right) => left.ordinal - right.ordinal))
  });
}

export function decodeWorkerResourceState(value: unknown, expectedFid: bigint): ReadyWorkerResourceState | undefined {
  if (!record(value) || value.fid !== expectedFid) return undefined;
  const mode = value.workerSystemMode === 'active' || value.workerSystemMode === 'staged'
    ? value.workerSystemMode : undefined;
  const available = {} as Record<RealmEconomicResourceKey, bigint>;
  const pending = {} as Record<RealmEconomicResourceKey, bigint>;
  const observedAtMicros = safeBigInt(value.observedAtMicros);
  const settledThroughMicros = safeBigInt(value.settledThroughMicros);
  const revision = safeBigInt(value.revision);
  for (const name of RESOURCE_ORDER) {
    const availableValue = safeBigInt(value[name]);
    const pendingValue = safeBigInt(value[`workerPending${name[0]!.toUpperCase()}${name.slice(1)}`]);
    if (availableValue === undefined || pendingValue === undefined) return undefined;
    available[name] = availableValue;
    pending[name] = pendingValue;
  }
  if (
    mode === undefined
    || typeof value.resourcePolicyVersion !== 'string' || value.resourcePolicyVersion.length === 0
    || typeof value.workerPolicyVersion !== 'string' || value.workerPolicyVersion.length === 0
    || observedAtMicros === undefined || settledThroughMicros === undefined || revision === undefined
    || settledThroughMicros > observedAtMicros
  ) return undefined;
  return Object.freeze({
    status: 'ready' as const,
    fid: expectedFid,
    available: Object.freeze(available),
    pending: Object.freeze(pending),
    observedAtMicros,
    settledThroughMicros,
    revision,
    resourcePolicyVersion: value.resourcePolicyVersion,
    workerPolicyVersion: value.workerPolicyVersion,
    workerSystemMode: mode
  });
}

export function resolveReadyPublicWorkerProjection(input: Readonly<{
  realmId: string;
  castleIds: readonly number[];
  ownCastleId: number;
  system?: RealmWorkerSystemPresentation;
  workers?: readonly RealmWorkerPublicPresentation[];
  occupations?: readonly RealmWorkerNodeOccupation[];
}>): ReadyPublicWorkerProjection | undefined {
  const { system, workers, occupations } = input;
  const castleIds = [...input.castleIds].sort((left, right) => left - right);
  if (
    system?.mode !== 'active'
    || system.legacyDrainRequired
    || system.realmId !== input.realmId
    || system.realmId !== CASTLE_WORKER_REALM_ID
    || system.policyVersion !== CASTLE_WORKER_POLICY_VERSION
    || new Set(castleIds).size !== castleIds.length
    || system.expectedCastleCount !== castleIds.length
    || system.expectedWorkerCount !== castleIds.length * 4
    || system.rosterDigest !== workerRosterDigestForCastleIds(castleIds)
    || workers === undefined || workers.length !== system.expectedWorkerCount
    || occupations === undefined
  ) return undefined;

  const castleSet = new Set(castleIds);
  const workersById = new Map<string, RealmWorkerPublicPresentation>();
  const ordinalsByCastle = new Map<number, Set<number>>();
  for (const worker of workers) {
    if (
      !castleSet.has(worker.originCastleId)
      || workersById.has(worker.workerId)
      || worker.workerId !== canonicalWorkerId(worker.originCastleId, worker.ordinal)
      || !assignedWorkerStateIsConsistent(worker)
      || worker.ownedByViewer !== (worker.originCastleId === input.ownCastleId)
    ) return undefined;
    const ordinals = ordinalsByCastle.get(worker.originCastleId) ?? new Set<number>();
    if (ordinals.has(worker.ordinal)) return undefined;
    ordinals.add(worker.ordinal);
    ordinalsByCastle.set(worker.originCastleId, ordinals);
    workersById.set(worker.workerId, worker);
  }
  if (castleIds.some((castleId) => (
    ordinalsByCastle.get(castleId)?.size !== 4
    || CASTLE_WORKER_ORDINALS.some((ordinal) => !ordinalsByCastle.get(castleId)?.has(ordinal))
  ))) return undefined;

  const occupationByWorker = new Map<string, RealmWorkerNodeOccupation>();
  const occupationKeys = new Set<string>();
  for (const occupation of occupations) {
    const worker = workersById.get(occupation.workerId);
    if (
      worker === undefined || occupationByWorker.has(occupation.workerId)
      || occupationKeys.has(occupation.nodeKey)
      || occupation.nodeKey !== `${occupation.resourceKind}:${occupation.siteId}`
      || occupation.originCastleId !== worker.originCastleId
      || occupation.workerOrdinal !== worker.ordinal
      || occupation.phase !== worker.status
      || occupation.resourceKind !== worker.resourceKind
      || occupation.siteId !== worker.siteId
      || occupation.startedAtMicros !== worker.startedAtMicros
      || occupation.arrivesAtMicros !== worker.arrivesAtMicros
      || occupation.gatheringEndsAtMicros !== worker.gatheringEndsAtMicros
      || occupation.timelineRevision !== worker.timelineRevision
    ) return undefined;
    occupationByWorker.set(occupation.workerId, occupation);
    occupationKeys.add(occupation.nodeKey);
  }
  if (workers.some((worker) => (
    (worker.status === 'outbound' || worker.status === 'gathering')
      ? !occupationByWorker.has(worker.workerId)
      : occupationByWorker.has(worker.workerId)
  ))) return undefined;

  return Object.freeze({
    mode: 'active' as const,
    system,
    workers,
    occupations
  });
}

export function resolveReadyWorkerProjection(input: Readonly<{
  realmId: string;
  castleIds: readonly number[];
  ownCastleId: number;
  system?: RealmWorkerSystemPresentation;
  workers?: readonly RealmWorkerPublicPresentation[];
  occupations?: readonly RealmWorkerNodeOccupation[];
  roster?: WorkerRosterPresentation;
  resourceState?: ReadyWorkerResourceState;
}>): ReadyWorkerProjection | undefined {
  const { roster, resourceState } = input;
  const publicProjection = resolveReadyPublicWorkerProjection(input);
  if (
    publicProjection === undefined
    || roster?.castleId !== input.ownCastleId
    || resourceState?.workerSystemMode !== 'active'
    || resourceState.resourcePolicyVersion !== REALM_RESOURCE_POLICY_VERSION
    || resourceState.workerPolicyVersion !== publicProjection.system.policyVersion
  ) return undefined;

  const ownedWorkers = publicProjection.workers.filter(
    (worker) => worker.originCastleId === input.ownCastleId
  );
  if (ownedWorkers.length !== 4 || roster.workers.length !== 4) return undefined;
  const rosterById = new Map(roster.workers.map((worker) => [worker.workerId, worker] as const));
  for (const worker of ownedWorkers) {
    const privateWorker = rosterById.get(worker.workerId);
    if (
      privateWorker === undefined
      || privateWorker.ordinal !== worker.ordinal
      || privateWorker.status !== worker.status
      || privateWorker.resourceKind !== worker.resourceKind
      || privateWorker.siteId !== worker.siteId
      || privateWorker.revision !== worker.revision
    ) return undefined;
  }
  const expectedPending: Record<RealmEconomicResourceKey, bigint> = {
    food: 0n,
    wood: 0n,
    stone: 0n,
    gold: 0n
  };
  for (const worker of roster.workers) {
    if (worker.resourceKind !== undefined) {
      expectedPending[worker.resourceKind] += worker.availableAmount;
    }
  }
  if (RESOURCE_ORDER.some((resource) => resourceState.pending[resource] !== expectedPending[resource])) {
    return undefined;
  }
  return Object.freeze({
    ...publicProjection,
    ownedWorkers: Object.freeze(ownedWorkers.slice().sort((left, right) => left.ordinal - right.ordinal)),
  });
}

export function workerAvailabilityCount(workers: readonly RealmWorkerPublicPresentation[]) {
  return workers.filter((worker) => worker.status === 'idle').length;
}

export function realmWorkerLabel(ordinal: RealmWorkerOrdinal) { return `Worker ${ordinal}`; }
export function realmWorkerStatusLabel(worker: RealmWorkerPublicPresentation) {
  if (worker.status === 'outbound' && worker.resourceKind) return `TRAVELLING TO ${worker.resourceKind.toUpperCase()} SITE`;
  if (worker.status === 'gathering' && worker.resourceKind) return `GATHERING ${worker.resourceKind.toUpperCase()}`;
  return ({ idle: 'READY AT KEEP', outbound: 'TRAVELLING TO RESOURCE', gathering: 'GATHERING RESOURCE', returning: 'RETURNING TO KEEP' } as const)[worker.status];
}
export function realmWorkerCanRecall(worker: RealmWorkerPublicPresentation) {
  return worker.ownedByViewer && (worker.status === 'outbound' || worker.status === 'gathering');
}

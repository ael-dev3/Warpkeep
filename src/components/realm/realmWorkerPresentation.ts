import type { RealmEconomicResourceKey } from './realmResourcePresentation';

export const CASTLE_WORKER_ORDINALS = Object.freeze([1, 2, 3, 4] as const);
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
  destinationLabel?: string;
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
  claimableAmount?: bigint;
}>;

export type RealmWorkerNodeOccupation = Readonly<{
  nodeKey: string;
  resourceKind: RealmEconomicResourceKey;
  siteId: string;
  workerId: string;
  workerOrdinal: RealmWorkerOrdinal;
  originCastleId: number;
  assignmentId: string;
  phase: Exclude<RealmWorkerStatus, 'idle'>;
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
  workerPolicyVersion: string;
  workerSystemMode: RealmWorkerSystemMode;
}>;

export type ReadyWorkerProjection = Readonly<{
  mode: RealmWorkerSystemMode;
  system: RealmWorkerSystemPresentation;
  workers: readonly RealmWorkerPublicPresentation[];
  occupations: readonly RealmWorkerNodeOccupation[];
}>;

const resourceKinds = new Set<RealmEconomicResourceKey>(['food', 'wood', 'stone', 'gold']);
const workerStatuses = new Set<RealmWorkerStatus>(['idle', 'outbound', 'gathering', 'returning']);
const occupationPhases = new Set<RealmWorkerNodeOccupation['phase']>(['outbound', 'gathering', 'returning']);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeNumber(value: unknown, positive = false) {
  const number = typeof value === 'bigint'
    && value <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(value)
    : value;
  return typeof number === 'number'
    && Number.isSafeInteger(number)
    && (!positive || number > 0)
    ? number
    : undefined;
}

function safeBigInt(value: unknown) {
  return typeof value === 'bigint' && value >= 0n ? value : undefined;
}

function optionalBigInt(value: unknown) {
  return value === undefined || value === null ? undefined : safeBigInt(value);
}

function optionalResource(value: unknown) {
  return typeof value === 'string' && resourceKinds.has(value as RealmEconomicResourceKey)
    ? value as RealmEconomicResourceKey
    : value === undefined || value === null ? undefined : null;
}

function optionalString(value: unknown) {
  return value === undefined || value === null ? undefined : typeof value === 'string' ? value : null;
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
    || expectedWorkerCount !== expectedCastleCount * 4 || typeof value.rosterDigest !== 'string'
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
    if (
      typeof value.workerId !== 'string' || value.workerId.length === 0 || ids.has(value.workerId)
      || ordinal === undefined || !CASTLE_WORKER_ORDINALS.includes(ordinal as RealmWorkerOrdinal)
      || originCastleId === undefined || status === undefined || resourceKind === null
      || siteId === null || timelineRevision === undefined || revision === undefined
      || !castleNames.has(originCastleId)
    ) return undefined;
    ids.add(value.workerId);
    const optional = (key: string) => optionalBigInt(value[key]);
    const worker: RealmWorkerPublicPresentation = {
      workerId: value.workerId,
      ordinal: ordinal as RealmWorkerOrdinal,
      originCastleId,
      originCastleName: castleNames.get(originCastleId)!,
      status,
      ...(resourceKind === undefined ? {} : { resourceKind }),
      ...(siteId === undefined ? {} : { destinationLabel: siteId }),
      ...(optional('startedAtMicros') === undefined ? {} : { startedAtMicros: optional('startedAtMicros') }),
      ...(optional('arrivesAtMicros') === undefined ? {} : { arrivesAtMicros: optional('arrivesAtMicros') }),
      ...(optional('gatheringEndsAtMicros') === undefined ? {} : { gatheringEndsAtMicros: optional('gatheringEndsAtMicros') }),
      ...(optional('returnStartedAtMicros') === undefined ? {} : { returnStartedAtMicros: optional('returnStartedAtMicros') }),
      ...(optional('returnsAtMicros') === undefined ? {} : { returnsAtMicros: optional('returnsAtMicros') }),
      ...(safeNumber(value.routeSteps) === undefined ? {} : { routeSteps: safeNumber(value.routeSteps) }),
      ...(safeNumber(value.returnStartProgressBasisPoints) === undefined ? {} : { returnStartProgressBasisPoints: safeNumber(value.returnStartProgressBasisPoints) }),
      timelineRevision,
      revision,
      ownedByViewer: originCastleId === ownCastleId
    };
    decoded.push(Object.freeze(worker));
  }
  const byCastle = new Map<number, number>();
  for (const worker of decoded) byCastle.set(worker.originCastleId, (byCastle.get(worker.originCastleId) ?? 0) + 1);
  if (decoded.length > 0 && [...byCastle.values()].some((count) => count !== 4)) return undefined;
  return Object.freeze(decoded);
}

export function decodeRealmWorkerOccupations(rows: readonly unknown[]): readonly RealmWorkerNodeOccupation[] | undefined {
  const decoded: RealmWorkerNodeOccupation[] = [];
  const keys = new Set<string>();
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
      typeof value.nodeKey !== 'string' || keys.has(value.nodeKey)
      || typeof value.siteId !== 'string' || typeof value.workerId !== 'string'
      || typeof value.assignmentId !== 'string' || resourceKind === undefined || phase === undefined
      || workerOrdinal === undefined || !CASTLE_WORKER_ORDINALS.includes(workerOrdinal as RealmWorkerOrdinal)
      || originCastleId === undefined || timelineRevision === undefined
      || startedAtMicros === undefined || arrivesAtMicros === undefined || gatheringEndsAtMicros === undefined
    ) return undefined;
    const resourceKindValue = resourceKind as RealmEconomicResourceKey;
    keys.add(value.nodeKey);
    decoded.push(Object.freeze({
      nodeKey: value.nodeKey,
      resourceKind: resourceKindValue,
      siteId: value.siteId,
      workerId: value.workerId,
      workerOrdinal: workerOrdinal as RealmWorkerOrdinal,
      originCastleId,
      assignmentId: value.assignmentId,
      phase,
      startedAtMicros,
      arrivesAtMicros,
      gatheringEndsAtMicros,
      timelineRevision
    }));
  }
  return Object.freeze(decoded);
}

export function decodeWorkerRoster(value: unknown, expectedFid: bigint): WorkerRosterPresentation | undefined {
  if (!record(value) || value.fid !== expectedFid || safeNumber(value.castleId, true) === undefined
    || safeBigInt(value.observedAtMicros) === undefined || !Array.isArray(value.workers)) return undefined;
  const workers: WorkerRosterPresentation['workers'][number][] = [];
  const ids = new Set<string>();
  for (const workerValue of value.workers) {
    if (!record(workerValue)) return undefined;
    const ordinal = safeNumber(workerValue.ordinal);
    const resourceKind = optionalResource(workerValue.resourceKind);
    const siteId = optionalString(workerValue.siteId);
    if (
      typeof workerValue.workerId !== 'string' || ids.has(workerValue.workerId)
      || ordinal === undefined || !CASTLE_WORKER_ORDINALS.includes(ordinal as RealmWorkerOrdinal)
      || !workerStatuses.has(workerValue.status as RealmWorkerStatus) || resourceKind === null || siteId === null
      || safeBigInt(workerValue.accruedAmount) === undefined || safeBigInt(workerValue.materializedAmount) === undefined
      || safeBigInt(workerValue.availableAmount) === undefined || safeBigInt(workerValue.observedAtMicros) === undefined
      || safeBigInt(workerValue.revision) === undefined
    ) return undefined;
    const accruedAmount = safeBigInt(workerValue.accruedAmount)!;
    const materializedAmount = safeBigInt(workerValue.materializedAmount)!;
    const availableAmount = safeBigInt(workerValue.availableAmount)!;
    const observedAtMicros = safeBigInt(workerValue.observedAtMicros)!;
    const revision = safeBigInt(workerValue.revision)!;
    ids.add(workerValue.workerId);
    workers.push(Object.freeze({
      workerId: workerValue.workerId,
      ordinal: ordinal as RealmWorkerOrdinal,
      status: workerValue.status as RealmWorkerStatus,
      ...(resourceKind === undefined ? {} : { resourceKind }),
      ...(siteId === undefined ? {} : { siteId }),
      accruedAmount,
      materializedAmount,
      availableAmount,
      observedAtMicros,
      revision
    }));
  }
  if (workers.length !== 4) return undefined;
  const castleId = safeNumber(value.castleId, true)!;
  const observedAtMicros = safeBigInt(value.observedAtMicros)!;
  return Object.freeze({
    castleId,
    observedAtMicros,
    workers: Object.freeze(workers)
  });
}

export function decodeWorkerResourceState(value: unknown, expectedFid: bigint): ReadyWorkerResourceState | undefined {
  if (!record(value) || value.fid !== expectedFid) return undefined;
  const mode = value.workerSystemMode === 'active' || value.workerSystemMode === 'staged'
    ? value.workerSystemMode : undefined;
  const names = ['food', 'wood', 'stone', 'gold'] as const;
  const available = {} as Record<RealmEconomicResourceKey, bigint>;
  const pending = {} as Record<RealmEconomicResourceKey, bigint>;
  const observedAtMicros = safeBigInt(value.observedAtMicros);
  const settledThroughMicros = safeBigInt(value.settledThroughMicros);
  const revision = safeBigInt(value.revision);
  for (const name of names) {
    const availableValue = safeBigInt(value[name]);
    const pendingValue = safeBigInt(value[`workerPending${name[0]!.toUpperCase()}${name.slice(1)}`]);
    if (availableValue === undefined || pendingValue === undefined) return undefined;
    available[name] = availableValue;
    pending[name] = pendingValue;
  }
  if (
    mode === undefined || typeof value.resourcePolicyVersion !== 'string'
    || typeof value.workerPolicyVersion !== 'string' || observedAtMicros === undefined
    || settledThroughMicros === undefined || revision === undefined
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
    workerPolicyVersion: value.workerPolicyVersion,
    workerSystemMode: mode
  });
}

export function workerAvailabilityCount(workers: readonly RealmWorkerPublicPresentation[]) {
  return workers.filter((worker) => worker.status === 'idle').length;
}

export function realmWorkerLabel(ordinal: RealmWorkerOrdinal) { return `Worker ${ordinal}`; }
export function realmWorkerStatusLabel(worker: RealmWorkerPublicPresentation) {
  if (worker.status === 'outbound' && worker.destinationLabel) return `TRAVELLING TO ${worker.destinationLabel.toUpperCase()}`;
  if (worker.status === 'gathering' && worker.resourceKind) return `GATHERING ${worker.resourceKind.toUpperCase()}`;
  return ({ idle: 'READY AT KEEP', outbound: 'TRAVELLING TO RESOURCE', gathering: 'GATHERING RESOURCE', returning: 'RETURNING TO KEEP' } as const)[worker.status];
}
export function realmWorkerCanRecall(worker: RealmWorkerPublicPresentation) {
  return worker.ownedByViewer && (worker.status === 'outbound' || worker.status === 'gathering');
}

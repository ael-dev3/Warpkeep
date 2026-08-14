import { createHash } from 'node:crypto';

import {
  CASTLE_WORKER_GATHER_QUANTUM_MICROS,
  CASTLE_WORKERS_PER_CASTLE,
  workerResourceKinds,
  workerResourcePolicy,
  type WorkerResourceKind,
} from '../spacetimedb/src/castleWorkerPolicy';

export const PRODUCTION_PLAYER_CANARY_FRESH_AUTHENTICATION_STAGES = Object.freeze([
  'baseline',
  'founder',
  'routes',
  'dispatch',
  'dispatch-replay',
  'gathering',
  'recall',
  'returning',
  'terminal',
  'evidence',
] as const);

export type ProductionPlayerCanaryStage =
  typeof PRODUCTION_PLAYER_CANARY_FRESH_AUTHENTICATION_STAGES[number];

export type SanitizedWorker = Readonly<{
  ordinal: number;
  status: 'idle' | 'outbound' | 'gathering' | 'returning';
  resourceKind: WorkerResourceKind | '';
  accruedAmount: bigint;
  materializedAmount: bigint;
  availableAmount: bigint;
}>;

export type SanitizedPlayerState = Readonly<{
  tier: number;
  atlasRevision: bigint;
  observedAtMicros: bigint;
  workers: readonly SanitizedWorker[];
  resources: Readonly<Record<WorkerResourceKind, bigint>>;
}>;

export type SanitizedRoute = Readonly<{
  resourceKind: WorkerResourceKind;
  routeLength: number;
  nodeCount: number;
}>;

export type ProductionPlayerCanaryProof = Readonly<{
  tierOneFounded: true;
  workerCount: 4;
  distinctReachableResourceKindCount: 4;
  dispatchAcceptedCount: 4;
  idempotentReplayCount: 4;
  minimumGatheringElapsedMs: number;
  returnedIdleWorkerCount: 4;
  isolatedResourceKindCount: 4;
  resourceQuantumCount: 4;
  workerJourneyDigest: string;
  resourceIsolationDigest: string;
  terminalStateDigest: string;
}>;

export class ProductionPlayerCanaryCoreError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ProductionPlayerCanaryCoreError';
  }
}

function fail(code: string): never {
  throw new ProductionPlayerCanaryCoreError(code);
}

function sha256(domain: string, value: unknown): string {
  return createHash('sha256')
    .update(`${domain}\0${JSON.stringify(value)}`, 'utf8')
    .digest('hex');
}

function canonicalResources(resources: Readonly<Record<WorkerResourceKind, bigint>>) {
  return Object.fromEntries(workerResourceKinds().map(kind => [kind, resources[kind].toString()]));
}

function canonicalWorkers(workers: readonly SanitizedWorker[]) {
  return workers.map(worker => Object.freeze({
    ordinal: worker.ordinal,
    status: worker.status,
    resourceKind: worker.resourceKind,
    accruedAmount: worker.accruedAmount.toString(),
    materializedAmount: worker.materializedAmount.toString(),
    availableAmount: worker.availableAmount.toString(),
  }));
}

function assertState(state: SanitizedPlayerState, terminal: boolean): void {
  if (
    state.tier !== 1
    || typeof state.atlasRevision !== 'bigint' || state.atlasRevision < 1n
    || typeof state.observedAtMicros !== 'bigint' || state.observedAtMicros < 1n
    || state.workers.length !== CASTLE_WORKERS_PER_CASTLE
    || state.workers.some((worker, index) => (
      worker.ordinal !== index + 1
      || !['idle', 'outbound', 'gathering', 'returning'].includes(worker.status)
      || typeof worker.accruedAmount !== 'bigint' || worker.accruedAmount < 0n
      || typeof worker.materializedAmount !== 'bigint' || worker.materializedAmount < 0n
      || typeof worker.availableAmount !== 'bigint' || worker.availableAmount < 0n
      || (terminal && (
        worker.status !== 'idle' || worker.resourceKind !== ''
        || worker.accruedAmount !== 0n || worker.materializedAmount !== 0n
        || worker.availableAmount !== 0n
      ))
    ))
    || workerResourceKinds().some(kind => (
      typeof state.resources[kind] !== 'bigint' || state.resources[kind] < 0n
    ))
  ) fail('PRODUCTION_PLAYER_CANARY_STATE_INVALID');
}

export function verifyProductionPlayerCanaryProof(input: Readonly<{
  before: SanitizedPlayerState;
  routes: readonly SanitizedRoute[];
  dispatched: readonly Readonly<{
    ordinal: number;
    resourceKind: WorkerResourceKind;
    accepted: boolean;
  }>[];
  replayStateUnchanged: readonly boolean[];
  gatheringObservations: readonly Readonly<{
    ordinal: number;
    resourceKind: WorkerResourceKind;
    gatheringElapsedMs: number;
    completedQuantumCount: number;
  }>[];
  after: SanitizedPlayerState;
}>): ProductionPlayerCanaryProof {
  assertState(input.before, true);
  assertState(input.after, true);
  const kinds = workerResourceKinds();
  const exactKinds = (rows: readonly { resourceKind: WorkerResourceKind }[]) => (
    rows.length === kinds.length
    && new Set(rows.map(row => row.resourceKind)).size === kinds.length
    && kinds.every(kind => rows.some(row => row.resourceKind === kind))
  );
  if (
    input.before.atlasRevision !== input.after.atlasRevision
    || input.after.observedAtMicros <= input.before.observedAtMicros
    || !exactKinds(input.routes)
    || input.routes.some(route => (
      !Number.isSafeInteger(route.routeLength) || route.routeLength < 2 || route.routeLength > 8_193
      || !Number.isSafeInteger(route.nodeCount) || route.nodeCount < 1 || route.nodeCount > 32
    ))
    || !exactKinds(input.dispatched)
    || input.dispatched.some((dispatch, index) => (
      dispatch.ordinal !== index + 1
      || dispatch.resourceKind !== input.routes[index]?.resourceKind
      || dispatch.accepted !== true
    ))
    || input.replayStateUnchanged.length !== 4
    || input.replayStateUnchanged.some(value => value !== true)
    || !exactKinds(input.gatheringObservations)
    || input.gatheringObservations.some((observation, index) => (
      observation.ordinal !== index + 1
      || observation.resourceKind !== input.routes[index]?.resourceKind
      || observation.resourceKind !== input.dispatched[index]?.resourceKind
      || !Number.isSafeInteger(observation.gatheringElapsedMs)
      || observation.gatheringElapsedMs < Number(CASTLE_WORKER_GATHER_QUANTUM_MICROS / 1_000n)
      || observation.gatheringElapsedMs
        >= Number((CASTLE_WORKER_GATHER_QUANTUM_MICROS * 2n) / 1_000n)
      || observation.completedQuantumCount !== 1
    ))
  ) fail('PRODUCTION_PLAYER_CANARY_PROOF_INVALID');
  for (const kind of kinds) {
    const expected = workerResourcePolicy(kind).ratePerQuantum;
    if (input.after.resources[kind] - input.before.resources[kind] !== expected) {
      fail('PRODUCTION_PLAYER_CANARY_RESOURCE_ISOLATION_INVALID');
    }
  }
  const minimumGatheringElapsedMs = Math.min(
    ...input.gatheringObservations.map(observation => observation.gatheringElapsedMs),
  );
  return Object.freeze({
    tierOneFounded: true,
    workerCount: 4,
    distinctReachableResourceKindCount: 4,
    dispatchAcceptedCount: 4,
    idempotentReplayCount: 4,
    minimumGatheringElapsedMs,
    returnedIdleWorkerCount: 4,
    isolatedResourceKindCount: 4,
    resourceQuantumCount: 4,
    workerJourneyDigest: sha256('warpkeep-production-player-canary-worker-journey-v1', {
      routes: input.routes,
      dispatched: input.dispatched,
      gathering: input.gatheringObservations,
    }),
    resourceIsolationDigest: sha256('warpkeep-production-player-canary-resource-isolation-v1', {
      before: canonicalResources(input.before.resources),
      after: canonicalResources(input.after.resources),
    }),
    terminalStateDigest: sha256('warpkeep-production-player-canary-terminal-state-v1', {
      atlasRevision: input.after.atlasRevision.toString(),
      workers: canonicalWorkers(input.after.workers),
      resources: canonicalResources(input.after.resources),
    }),
  });
}

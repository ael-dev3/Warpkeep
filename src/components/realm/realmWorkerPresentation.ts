import type { RealmEconomicResourceKey } from './realmResourcePresentation';

export const CASTLE_WORKER_ORDINALS = Object.freeze([1, 2, 3, 4] as const);

export type RealmWorkerOrdinal = typeof CASTLE_WORKER_ORDINALS[number];

export type RealmWorkerStatus = 'idle' | 'outbound' | 'gathering' | 'returning';

export type RealmWorkerPublicPresentation = Readonly<{
  /** Stable server identity; never derive this from a username or assignment. */
  workerId: string;
  ordinal: RealmWorkerOrdinal;
  originCastleId: number;
  originCastleName: string;
  status: RealmWorkerStatus;
  resourceKind?: RealmEconomicResourceKey;
  destinationLabel?: string;
  /** Caller-only context. Public worker rows must never contain this value. */
  ownedByViewer: boolean;
  /** Caller-only settled amount; never render for another player's worker. */
  claimableAmount?: bigint;
}>;

export const REALM_WORKER_STATUS_LABELS: Readonly<Record<RealmWorkerStatus, string>> = Object.freeze({
  idle: 'READY AT KEEP',
  outbound: 'TRAVELLING TO RESOURCE',
  gathering: 'GATHERING RESOURCE',
  returning: 'RETURNING TO KEEP'
});

export const REALM_WORKER_RESOURCE_LABELS: Readonly<Record<RealmEconomicResourceKey, string>> = Object.freeze({
  food: 'FOOD',
  wood: 'WOOD',
  stone: 'STONE',
  gold: 'GOLD'
});

export function realmWorkerLabel(ordinal: RealmWorkerOrdinal) {
  return `Worker ${ordinal}`;
}

export function realmWorkerStatusLabel(worker: RealmWorkerPublicPresentation) {
  if (worker.status === 'outbound' && worker.destinationLabel) {
    return `TRAVELLING TO ${worker.destinationLabel.toUpperCase()}`;
  }
  if (worker.status === 'gathering' && worker.resourceKind) {
    return `GATHERING ${REALM_WORKER_RESOURCE_LABELS[worker.resourceKind]}`;
  }
  return REALM_WORKER_STATUS_LABELS[worker.status];
}

export function realmWorkerCanRecall(worker: RealmWorkerPublicPresentation) {
  return worker.ownedByViewer && (
    worker.status === 'outbound' || worker.status === 'gathering'
  );
}

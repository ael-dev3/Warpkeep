import {
  decodeWorkerControlState,
  type ReadyWorkerControlState,
  type WorkerControlStateDecodeFailure
} from '../components/realm/realmWorkerPresentation';

const PUBLIC_CAPACITY_LEASE = /^GRL-[A-Z2-7]{26}:(?:[1-9]|[12][0-9]|3[0-2])$/;
const U64_MAX = (1n << 64n) - 1n;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export type ReadyGreaterRealmWorkerControlState = Readonly<{
  status: 'ready';
  atlasId: string;
  atlasRevision: bigint;
  value: ReadyWorkerControlState;
}>;

export type GreaterRealmWorkerControlDecodeResult =
  | ReadyGreaterRealmWorkerControlState
  | Readonly<{
      status: 'invalid';
      reason: WorkerControlStateDecodeFailure | 'greater-realm-context-invalid';
    }>;

/** Decode only the current v17 atlas context and its public capacity leases. */
export function decodeGreaterRealmWorkerControlState(
  value: unknown,
  expectedFid: bigint
): GreaterRealmWorkerControlDecodeResult {
  if (!record(value)) {
    return Object.freeze({ status: 'invalid', reason: 'greater-realm-context-invalid' });
  }
  const control = decodeWorkerControlState(value, expectedFid);
  if (control.status !== 'ready') return control;
  if (
    typeof value.atlasId !== 'string'
    || value.atlasId.length < 1
    || value.atlasId.length > 128
    || typeof value.atlasRevision !== 'bigint'
    || value.atlasRevision < 0n
    || value.atlasRevision > U64_MAX
    || control.value.resourceState.workerSystemMode === 'staged'
    || control.value.roster.workers.some(worker => (
      worker.siteId !== undefined && !PUBLIC_CAPACITY_LEASE.test(worker.siteId)
    ))
  ) {
    return Object.freeze({ status: 'invalid', reason: 'greater-realm-context-invalid' });
  }
  return Object.freeze({
    status: 'ready',
    atlasId: value.atlasId,
    atlasRevision: value.atlasRevision,
    value: control.value
  });
}

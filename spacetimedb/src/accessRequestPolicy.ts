/**
 * Invite-only Alpha containment boundary. The deployed v1 table has no
 * cursor-order index, so every administrative review must remain bounded by
 * this exact maximum until an additive indexed queue supersedes it.
 */
export const ACCESS_REQUEST_QUEUE_CAPACITY = 4_096;

function assertCapacity(capacity: number): void {
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new Error('ACCESS_REQUEST_QUEUE_CAPACITY_INVALID');
  }
}

/**
 * Existing rows may always retry or advance to a later admission cycle because
 * neither operation increases storage. Only a first insert consumes capacity.
 */
export function accessRequestQueueAcceptsSubmission(
  currentCount: bigint,
  requestExists: boolean,
  capacity = ACCESS_REQUEST_QUEUE_CAPACITY,
): boolean {
  assertCapacity(capacity);
  if (currentCount < 0n) {
    throw new Error('ACCESS_REQUEST_QUEUE_COUNT_INVALID');
  }
  return requestExists || currentCount < BigInt(capacity);
}

/**
 * Consume at most the configured capacity plus one proof-of-overflow row.
 * This keeps malformed or unexpectedly oversized state from turning an
 * administrative page into unbounded memory use.
 */
export function takeBoundedAccessRequestRows<Row>(
  rows: Iterable<Row>,
  capacity = ACCESS_REQUEST_QUEUE_CAPACITY,
): Readonly<{ rows: readonly Row[]; overflow: boolean }> {
  assertCapacity(capacity);
  const bounded: Row[] = [];
  for (const row of rows) {
    if (bounded.length >= capacity) {
      return Object.freeze({
        rows: Object.freeze(bounded),
        overflow: true,
      });
    }
    bounded.push(row);
  }
  return Object.freeze({
    rows: Object.freeze(bounded),
    overflow: false,
  });
}

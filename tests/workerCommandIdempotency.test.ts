import { describe, expect, it, vi } from 'vitest';

import {
  serializeWorkerCommandFingerprint,
  workerCommandAttemptFor,
  workerCommandAttemptMatchesLifecycle,
  type WorkerCommandLifecycleState
} from '../src/spacetime/workerCommandIdempotency';

const lifecycle = (
  revision: bigint,
  status = 'idle'
): WorkerCommandLifecycleState => Object.freeze({
  castleId: 7,
  workers: Object.freeze([
    Object.freeze({
      workerId: 'genesis-001-castle-7-worker-01',
      status,
      revision
    }),
    Object.freeze({
      workerId: 'genesis-001-castle-7-worker-02',
      status: 'idle',
      revision: 0n
    })
  ])
});

describe('worker command idempotency', () => {
  it('reuses a key only for an exact command fingerprint in one connection generation', () => {
    const createKey = vi.fn()
      .mockReturnValueOnce('first-command-key')
      .mockReturnValueOnce('second-command-key')
      .mockReturnValueOnce('third-command-key');
    const dispatch = {
      kind: 'dispatch' as const,
      workerId: 'genesis-001-castle-7-worker-01',
      resourceKind: 'stone' as const,
      siteId: 'genesis-001:stone:0001'
    };
    const first = workerCommandAttemptFor(undefined, 4, dispatch, lifecycle(0n), createKey);
    expect(workerCommandAttemptFor(first, 4, { ...dispatch }, lifecycle(0n), createKey)).toBe(first);
    expect(workerCommandAttemptFor(first, 4, {
      ...dispatch,
      siteId: 'genesis-001:stone:0002'
    }, lifecycle(0n), createKey)?.idempotencyKey).toBe('second-command-key');
    expect(workerCommandAttemptFor(first, 5, dispatch, lifecycle(0n), createKey)?.idempotencyKey)
      .toBe('third-command-key');
    expect(createKey).toHaveBeenCalledTimes(3);
  });

  it('separates dispatch, individual recall, and recall-all fingerprints', () => {
    const workerId = 'genesis-001-castle-7-worker-01';
    expect(new Set([
      serializeWorkerCommandFingerprint({
        kind: 'dispatch',
        workerId,
        resourceKind: 'wood',
        siteId: 'genesis-001:wood:0001'
      }),
      serializeWorkerCommandFingerprint({ kind: 'recall', workerId }),
      serializeWorkerCommandFingerprint({ kind: 'recall-all', castleId: 7 })
    ]).size).toBe(3);
  });

  it('reuses an ambiguous key only while the private worker lifecycle is unchanged', () => {
    const createKey = vi.fn()
      .mockReturnValueOnce('ambiguous-command-key')
      .mockReturnValueOnce('later-lifecycle-key');
    const command = {
      kind: 'dispatch' as const,
      workerId: 'genesis-001-castle-7-worker-01',
      resourceKind: 'stone' as const,
      siteId: 'genesis-001:stone:0001'
    };
    const initial = workerCommandAttemptFor(
      undefined,
      4,
      command,
      lifecycle(0n),
      createKey
    );
    expect(workerCommandAttemptFor(
      initial,
      4,
      command,
      lifecycle(0n),
      createKey
    )).toBe(initial);
    const later = workerCommandAttemptFor(
      initial,
      4,
      command,
      lifecycle(2n, 'idle'),
      createKey
    );
    expect(later?.idempotencyKey).toBe('later-lifecycle-key');
    expect(workerCommandAttemptMatchesLifecycle(initial!, 4, lifecycle(2n, 'idle'))).toBe(false);
    expect(workerCommandAttemptMatchesLifecycle(later!, 4, lifecycle(2n, 'idle'))).toBe(true);
    expect(createKey).toHaveBeenCalledTimes(2);
  });

  it('invalidates recall-all after any owned worker lifecycle changes', () => {
    const command = { kind: 'recall-all' as const, castleId: 7 };
    const attempt = workerCommandAttemptFor(
      undefined,
      9,
      command,
      lifecycle(0n, 'outbound'),
      () => 'recall-all-key'
    );
    expect(attempt).toBeDefined();
    expect(workerCommandAttemptMatchesLifecycle(
      attempt!,
      9,
      lifecycle(1n, 'returning')
    )).toBe(false);
    expect(workerCommandAttemptMatchesLifecycle(
      attempt!,
      10,
      lifecycle(0n, 'outbound')
    )).toBe(false);
  });

  it('refuses a lifecycle scope that does not contain the commanded worker or castle', () => {
    expect(workerCommandAttemptFor(
      undefined,
      1,
      { kind: 'recall', workerId: 'missing-worker' },
      lifecycle(0n),
      () => 'must-not-be-used'
    )).toBeUndefined();
    expect(workerCommandAttemptFor(
      undefined,
      1,
      { kind: 'recall-all', castleId: 8 },
      lifecycle(0n),
      () => 'must-not-be-used'
    )).toBeUndefined();
  });
});

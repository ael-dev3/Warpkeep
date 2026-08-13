import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { decodeGreaterRealmWorkerControlState } from '../src/greater-realm/greaterRealmWorkerControl';
import {
  dispatchWarpkeepGreaterRealmWorker,
  readWarpkeepGreaterRealmWorkerControlState,
  type WarpkeepConnection
} from '../src/spacetime/warpkeepConnection';
import {
  serializeWorkerCommandFingerprint,
  workerCommandAttemptFor,
  type WorkerCommandLifecycleState
} from '../src/spacetime/workerCommandIdempotency';

const LOCATION_ID = `GRL-${'A'.repeat(25)}B`;

function rawControl(mode: 'active' | 'canary' | 'halted' = 'active') {
  const observedAtMicros = 10_000n;
  return {
    atlasId: 'GRA-PUBLIC-V17',
    atlasRevision: 17n,
    fid: 42n,
    castleId: 7n,
    observedAtMicros,
    workers: Array.from({ length: 4 }, (_unused, index) => ({
      workerId: `genesis-001-castle-7-worker-0${index + 1}`,
      ordinal: index + 1,
      status: index === 0 ? 'outbound' : 'idle',
      resourceKind: index === 0 ? 'wood' : undefined,
      siteId: index === 0 ? `${LOCATION_ID}:1` : undefined,
      accruedAmount: 0n,
      materializedAmount: 0n,
      availableAmount: 0n,
      observedAtMicros,
      revision: index === 0 ? 1n : 0n
    })),
    food: 100n,
    wood: 100n,
    stone: 100n,
    gold: 100n,
    workerPendingFood: 0n,
    workerPendingWood: 0n,
    workerPendingStone: 0n,
    workerPendingGold: 0n,
    settledThroughMicros: observedAtMicros,
    revision: 1n,
    resourcePolicyVersion: 'genesis-001-resource-v1',
    workerPolicyVersion: 'greater-realm-workers-v2',
    workerSystemMode: mode
  };
}

describe('Greater Realm own-worker browser control', () => {
  it.each(['active', 'canary', 'halted'] as const)(
    'decodes %s mode with public capacity leases only',
    (mode) => {
      const decoded = decodeGreaterRealmWorkerControlState(rawControl(mode), 42n);
      expect(decoded.status).toBe('ready');
      if (decoded.status !== 'ready') return;
      expect(decoded.atlasId).toBe('GRA-PUBLIC-V17');
      expect(decoded.atlasRevision).toBe(17n);
      expect(decoded.value.roster.workers[0]?.siteId).toBe(`${LOCATION_ID}:1`);
      expect(JSON.stringify(decoded, (_key, value) => (
        typeof value === 'bigint' ? value.toString() : value
      ))).not.toContain('PRIVATE-NODE');
    }
  );

  it('fails closed on staged mode, wrong caller, wrong atlas context, or a legacy site id', () => {
    const staged = { ...rawControl(), workerSystemMode: 'staged' };
    const wrongAtlas = { ...rawControl(), atlasRevision: -1n };
    const legacy = structuredClone(rawControl());
    legacy.workers[0]!.siteId = 'genesis-001:wood:0001';
    expect(decodeGreaterRealmWorkerControlState(staged, 42n).status).toBe('invalid');
    expect(decodeGreaterRealmWorkerControlState(rawControl(), 43n).status).toBe('invalid');
    expect(decodeGreaterRealmWorkerControlState(wrongAtlas, 42n).status).toBe('invalid');
    expect(decodeGreaterRealmWorkerControlState(legacy, 42n).status).toBe('invalid');
  });

  it('reads V2 and sends only selected public location inputs to the new reducer', async () => {
    const procedure = vi.fn().mockResolvedValue(rawControl());
    const reducer = vi.fn().mockResolvedValue(undefined);
    const connection = {
      procedures: { getMyWorkerControlStateV2: procedure },
      reducers: { dispatchGreaterRealmWorkerV1: reducer }
    } as unknown as WarpkeepConnection;
    const control = await readWarpkeepGreaterRealmWorkerControlState(connection, 42);
    expect(control?.status).toBe('ready');
    await dispatchWarpkeepGreaterRealmWorker(
      connection,
      'genesis-001-castle-7-worker-02',
      'gold',
      LOCATION_ID,
      17n,
      'worker-v2-request-0001'
    );
    expect(procedure).toHaveBeenCalledWith({});
    expect(reducer).toHaveBeenCalledWith({
      workerId: 'genesis-001-castle-7-worker-02',
      resourceKind: 'gold',
      locationId: LOCATION_ID,
      expectedRevision: 17n,
      idempotencyKey: 'worker-v2-request-0001'
    });
    const sent = reducer.mock.calls[0]![0] as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual([
      'expectedRevision',
      'idempotencyKey',
      'locationId',
      'resourceKind',
      'workerId'
    ]);
  });

  it('retains an ambiguous dispatch-v2 key only for the exact location and revision', () => {
    const lifecycle: WorkerCommandLifecycleState = {
      castleId: 7,
      workers: [{
        workerId: 'genesis-001-castle-7-worker-02',
        status: 'idle',
        revision: 0n
      }]
    };
    const command = {
      kind: 'dispatch-v2' as const,
      workerId: 'genesis-001-castle-7-worker-02',
      resourceKind: 'gold' as const,
      locationId: LOCATION_ID,
      expectedRevision: 17n
    };
    const first = workerCommandAttemptFor(undefined, 5, command, lifecycle, () => 'first-key');
    expect(workerCommandAttemptFor(first, 5, command, lifecycle, () => 'wrong-key')).toBe(first);
    expect(workerCommandAttemptFor(
      first,
      5,
      { ...command, expectedRevision: 18n },
      lifecycle,
      () => 'revision-key'
    )?.idempotencyKey).toBe('revision-key');
    expect(serializeWorkerCommandFingerprint(command)).toContain('dispatch-v2');
  });

  it('keeps V2 polling and reducer reachability on the retired provider seam', () => {
    const provider = readFileSync(resolve(
      process.cwd(),
      'src/spacetime/WarpkeepSpacetimeProvider.tsx'
    ), 'utf8');
    const bridge = readFileSync(resolve(
      process.cwd(),
      'src/spacetime/greaterRealmProviderBridge.ts'
    ), 'utf8');
    const playerBindings = readFileSync(resolve(
      process.cwd(),
      'src/spacetime/playerModuleBindings.ts'
    ), 'utf8');
    expect(provider).toContain('runtime.readGreaterRealmWorkerControlState(activeConnection, bridgeFid!)');
    expect(provider).toContain(
      'GREATER_REALM_WORKER_CONTROL_POLL_INTERVAL_MILLISECONDS = 60_000'
    );
    expect(provider).toContain("currentState.legacyRealmAuthority !== 'retired'");
    expect(provider).toContain('clearInterval(greaterRealmWorkerRefreshInterval)');
    expect(provider).toContain('removeGreaterRealmWorkerLifecycleListeners?.()');
    expect(provider).toContain("document.addEventListener('visibilitychange', onVisibilityChange)");
    expect(provider).toContain("document.removeEventListener('visibilitychange', onVisibilityChange)");
    expect(provider).toContain(
      'requestGreaterRealmWorkerControlRef.current = () => undefined'
    );
    expect(provider).toContain('runtime.dispatchGreaterRealmWorker(');
    expect(bridge).toContain('dispatchWorker: input.workerControls?.dispatch');
    expect(bridge).toContain('getWorkerControl: () => input.workerControls?.get()');
    expect(playerBindings).toContain("'get_my_worker_control_state_v2'");
    expect(playerBindings).toContain('DispatchGreaterRealmWorkerV1Reducer');
    expect(playerBindings).not.toContain('GreaterRealmResourceNodeV1');
  });
});

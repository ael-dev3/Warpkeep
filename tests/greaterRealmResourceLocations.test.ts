import { describe, expect, it, vi } from 'vitest';

import {
  GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE,
  createGreaterRealmSyntheticTransport
} from '../src/dev/greaterRealmSyntheticTierOneFixture';
import {
  GREATER_REALM_MAXIMUM_RESOURCE_AFFORDANCES,
  GREATER_REALM_RESOURCE_AFFORDANCES_PER_KIND,
  GREATER_REALM_RESOURCE_LOCATION_TIMEOUT_MILLISECONDS,
  createGreaterRealmClientRuntime,
  selectGreaterRealmResourceAffordances
} from '../src/greater-realm/greaterRealmClientRuntime';
import type {
  GreaterRealmResourceKind,
  GreaterRealmResourceLocationBatchDto,
  GreaterRealmResourceLocationRequest,
  GreaterRealmResourceLocationSummaryDto
} from '../src/greater-realm/greaterRealmPublicContract';
import type { GreaterRealmPublicTransport } from '../src/greater-realm/greaterRealmTransport';

const RESOURCE_KINDS = Object.freeze([
  'food', 'wood', 'stone', 'gold'
] as const satisfies readonly GreaterRealmResourceKind[]);
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function locationId(ordinal: number): string {
  let value = ordinal + 1;
  let suffix = '';
  while (value > 0) {
    suffix = BASE32[value % BASE32.length]! + suffix;
    value = Math.floor(value / BASE32.length);
  }
  return `GRL-${suffix.padStart(26, 'A')}`;
}

function emptyBatch(
  request: GreaterRealmResourceLocationRequest
): GreaterRealmResourceLocationBatchDto {
  return Object.freeze({
    atlasId: GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.bootstrap.atlasId,
    revision: request.expectedRevision,
    chunkHandles: Object.freeze([...request.chunkHandles]),
    truncated: false,
    resourceLocations: Object.freeze([])
  });
}

function skewedBalancedRows(): readonly GreaterRealmResourceLocationSummaryDto[] {
  const chunkHandle = GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.window.chunks
    .find(descriptor => descriptor.binQ === -1)!.chunkHandle;
  const rows: GreaterRealmResourceLocationSummaryDto[] = [];
  for (let index = 0; index < 110; index += 1) {
    rows.push(Object.freeze({
      chunkHandle,
      locationId: locationId(rows.length),
      atlasQ: -1 - index % 15,
      atlasR: Math.floor(index / 15),
      resourceKind: 'food',
      nodeCount: index % 32 + 1
    }));
  }
  for (const resourceKind of ['wood', 'stone', 'gold'] as const) {
    for (let index = 0; index < 6; index += 1) {
      rows.push(Object.freeze({
        chunkHandle,
        locationId: locationId(rows.length),
        atlasQ: -1 - index,
        atlasR: 8,
        resourceKind,
        nodeCount: index + 1
      }));
    }
  }
  return Object.freeze(rows);
}

function runtimeWith(
  getResourceLocations: GreaterRealmPublicTransport['getResourceLocations'],
  isSessionCurrent: () => boolean = () => true
) {
  const synthetic = createGreaterRealmSyntheticTransport();
  return createGreaterRealmClientRuntime({
    sessionGeneration: 71,
    isSessionCurrent,
    transport: Object.freeze({ ...synthetic, getResourceLocations }),
    deviceClass: 'mobile',
    graphicsProfile: 'balanced'
  });
}

describe('Greater Realm resource-location runtime seam', () => {
  it('lets terrain become ready while the optional resource read remains delayed', async () => {
    let resolveLocations: (() => void) | undefined;
    const getResourceLocations = vi.fn((request: GreaterRealmResourceLocationRequest) => (
      new Promise<GreaterRealmResourceLocationBatchDto>((resolve) => {
        resolveLocations = () => resolve(emptyBatch(request));
      })
    ));
    const runtime = runtimeWith(getResourceLocations);

    const map = await runtime.loadView({ centerQ: 0, centerR: 0, radius: 1, lod: 1 });
    expect(map).toMatchObject({
      phase: 'ready',
      resourceLocationPhase: 'loading',
      resourceLocations: []
    });
    expect(resolveLocations).toBeTypeOf('function');

    resolveLocations?.();
    await vi.waitFor(() => {
      expect(runtime.getSnapshot().resourceLocationPhase).toBe('ready');
    });
    expect(runtime.getSnapshot().phase).toBe('ready');
    runtime.dispose();
  });

  it('fails an independently hung resource read at its deadline without failing terrain', async () => {
    vi.useFakeTimers();
    let resolveLocations: (() => void) | undefined;
    let resourceSignal: AbortSignal | undefined;
    const getResourceLocations = vi.fn((
      request: GreaterRealmResourceLocationRequest,
      signal: AbortSignal
    ) => {
      resourceSignal = signal;
      return new Promise<GreaterRealmResourceLocationBatchDto>((resolve) => {
        resolveLocations = () => resolve(emptyBatch(request));
      });
    });
    const runtime = runtimeWith(getResourceLocations);
    const publications: unknown[] = [];
    runtime.subscribe(snapshot => { publications.push(snapshot); });

    try {
      await runtime.loadView({ centerQ: 0, centerR: 0, radius: 1, lod: 1 });
      expect(runtime.getSnapshot().resourceLocationPhase).toBe('loading');
      expect(getResourceLocations).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(GREATER_REALM_RESOURCE_LOCATION_TIMEOUT_MILLISECONDS - 1);
      expect(runtime.getSnapshot().resourceLocationPhase).toBe('loading');
      expect(resourceSignal?.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      expect(resourceSignal?.aborted).toBe(true);
      expect(runtime.getSnapshot()).toMatchObject({
        phase: 'ready',
        resourceLocationPhase: 'failed',
        resourceLocations: [],
        resourceLocationsTruncated: false
      });
      expect(vi.getTimerCount()).toBe(0);
      const publicationsAtDeadline = publications.length;
      resolveLocations?.();
      await vi.advanceTimersByTimeAsync(0);
      expect(publications).toHaveLength(publicationsAtDeadline);
      expect(getResourceLocations).toHaveBeenCalledOnce();
    } finally {
      runtime.dispose();
      vi.useRealTimers();
    }
  });

  it('clears the deadline after a successful resource read', async () => {
    vi.useFakeTimers();
    const getResourceLocations = vi.fn(async (request: GreaterRealmResourceLocationRequest) => (
      emptyBatch(request)
    ));
    const runtime = runtimeWith(getResourceLocations);

    try {
      await runtime.loadView({ centerQ: 0, centerR: 0, radius: 1, lod: 1 });
      await vi.advanceTimersByTimeAsync(0);
      expect(runtime.getSnapshot().resourceLocationPhase).toBe('ready');
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(GREATER_REALM_RESOURCE_LOCATION_TIMEOUT_MILLISECONDS);
      expect(runtime.getSnapshot().resourceLocationPhase).toBe('ready');
    } finally {
      runtime.dispose();
      vi.useRealTimers();
    }
  });

  it('clears the old deadline when a new view supersedes the resource read', async () => {
    vi.useFakeTimers();
    const resourceSignals: AbortSignal[] = [];
    const resolveLocations: Array<() => void> = [];
    const getResourceLocations = vi.fn((
      request: GreaterRealmResourceLocationRequest,
      signal: AbortSignal
    ) => {
      resourceSignals.push(signal);
      return new Promise<GreaterRealmResourceLocationBatchDto>((resolve) => {
        resolveLocations.push(() => resolve(emptyBatch(request)));
      });
    });
    const runtime = runtimeWith(getResourceLocations);

    try {
      await runtime.loadView({ centerQ: 0, centerR: 0, radius: 1, lod: 1 });
      await vi.advanceTimersByTimeAsync(5_000);
      await runtime.loadView({ centerQ: 0, centerR: 0, radius: 1, lod: 2 });
      expect(getResourceLocations).toHaveBeenCalledTimes(2);
      expect(resourceSignals[0]?.aborted).toBe(true);
      expect(resourceSignals[1]?.aborted).toBe(false);
      expect(vi.getTimerCount()).toBe(1);
      resolveLocations[0]?.();
      await vi.advanceTimersByTimeAsync(0);
      expect(runtime.getSnapshot().resourceLocationPhase).toBe('loading');
      expect(vi.getTimerCount()).toBe(1);

      await vi.advanceTimersByTimeAsync(GREATER_REALM_RESOURCE_LOCATION_TIMEOUT_MILLISECONDS - 5_000);
      expect(runtime.getSnapshot().resourceLocationPhase).toBe('loading');
      expect(resourceSignals[1]?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(runtime.getSnapshot().resourceLocationPhase).toBe('failed');
      expect(resourceSignals[1]?.aborted).toBe(true);
    } finally {
      runtime.dispose();
      vi.useRealTimers();
    }
  });

  it('clears a pending deadline when the runtime is disposed', async () => {
    vi.useFakeTimers();
    let resourceSignal: AbortSignal | undefined;
    const getResourceLocations = vi.fn((
      _request: GreaterRealmResourceLocationRequest,
      signal: AbortSignal
    ) => {
      resourceSignal = signal;
      return new Promise<GreaterRealmResourceLocationBatchDto>(() => undefined);
    });
    const runtime = runtimeWith(getResourceLocations);

    try {
      await runtime.loadView({ centerQ: 0, centerR: 0, radius: 1, lod: 1 });
      expect(vi.getTimerCount()).toBe(1);
      runtime.dispose();
      expect(resourceSignal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(GREATER_REALM_RESOURCE_LOCATION_TIMEOUT_MILLISECONDS);
      expect(runtime.getSnapshot().phase).toBe('disposed');
    } finally {
      runtime.dispose();
      vi.useRealTimers();
    }
  });

  it('keeps the map ready when the optional resource read rejects', async () => {
    vi.useFakeTimers();
    const getResourceLocations = vi.fn(async () => {
      throw new Error('RESOURCE_READ_FAILED');
    });
    const runtime = runtimeWith(getResourceLocations);

    try {
      await runtime.loadView({ centerQ: 0, centerR: 0, radius: 1, lod: 2 });
      await vi.advanceTimersByTimeAsync(0);
      expect(runtime.getSnapshot().resourceLocationPhase).toBe('failed');
      expect(runtime.getSnapshot()).toMatchObject({
        phase: 'ready',
        resourceLocations: [],
        resourceLocationsTruncated: false
      });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      runtime.dispose();
      vi.useRealTimers();
    }
  });

  it('fails a transport AbortError that was not caused by this read controller', async () => {
    vi.useFakeTimers();
    let resourceSignal: AbortSignal | undefined;
    const getResourceLocations = vi.fn(async (
      _request: GreaterRealmResourceLocationRequest,
      signal: AbortSignal
    ): Promise<GreaterRealmResourceLocationBatchDto> => {
      resourceSignal = signal;
      const error = new Error('UPSTREAM_ABORTED');
      error.name = 'AbortError';
      throw error;
    });
    const runtime = runtimeWith(getResourceLocations);

    try {
      await runtime.loadView({ centerQ: 0, centerR: 0, radius: 1, lod: 2 });
      await vi.advanceTimersByTimeAsync(0);
      expect(resourceSignal?.aborted).toBe(false);
      expect(runtime.getSnapshot()).toMatchObject({
        phase: 'ready',
        resourceLocationPhase: 'failed',
        resourceLocations: []
      });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      runtime.dispose();
      vi.useRealTimers();
    }
  });

  it('aborts at the deadline without publishing failure for a replaced session', async () => {
    vi.useFakeTimers();
    let current = true;
    let resourceSignal: AbortSignal | undefined;
    const getResourceLocations = vi.fn((
      _request: GreaterRealmResourceLocationRequest,
      signal: AbortSignal
    ) => {
      resourceSignal = signal;
      return new Promise<GreaterRealmResourceLocationBatchDto>(() => undefined);
    });
    const runtime = runtimeWith(getResourceLocations, () => current);
    const publications: unknown[] = [];
    runtime.subscribe(snapshot => { publications.push(snapshot); });

    try {
      await runtime.loadView({ centerQ: 0, centerR: 0, radius: 1, lod: 1 });
      const publicationsBeforeDeadline = publications.length;
      current = false;
      await vi.advanceTimersByTimeAsync(GREATER_REALM_RESOURCE_LOCATION_TIMEOUT_MILLISECONDS);
      expect(resourceSignal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      expect(publications).toHaveLength(publicationsBeforeDeadline);
      expect(runtime.getSnapshot().resourceLocationPhase).toBe('loading');
    } finally {
      runtime.dispose();
      vi.useRealTimers();
    }
  });

  it('publishes nothing when a delayed response resolves for a stale session', async () => {
    let current = true;
    let resolveLocations: (() => void) | undefined;
    const getResourceLocations = vi.fn((request: GreaterRealmResourceLocationRequest) => (
      new Promise<GreaterRealmResourceLocationBatchDto>((resolve) => {
        resolveLocations = () => resolve(emptyBatch(request));
      })
    ));
    const runtime = runtimeWith(getResourceLocations, () => current);
    const snapshots: unknown[] = [];
    runtime.subscribe(snapshot => { snapshots.push(snapshot); });

    await runtime.loadView({ centerQ: 0, centerR: 0, radius: 1, lod: 3 });
    expect(runtime.getSnapshot().resourceLocationPhase).toBe('loading');
    const publicationsBeforeResolution = snapshots.length;
    current = false;
    resolveLocations?.();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(snapshots).toHaveLength(publicationsBeforeResolution);
    expect(runtime.getSnapshot()).toMatchObject({
      phase: 'ready',
      resourceLocationPhase: 'loading',
      resourceLocations: []
    });
    runtime.dispose();
  });

  it('uses the caller-filtered procedure at LOD0 instead of chunk aggregates', async () => {
    const getResourceLocations = vi.fn(async (request: GreaterRealmResourceLocationRequest) => (
      emptyBatch(request)
    ));
    const runtime = runtimeWith(getResourceLocations);

    await runtime.loadView({ centerQ: 0, centerR: 0, radius: 1, lod: 0 });
    await vi.waitFor(() => {
      expect(runtime.getSnapshot().resourceLocationPhase).toBe('ready');
    });
    const snapshot = runtime.getSnapshot();
    expect(getResourceLocations).toHaveBeenCalledOnce();
    expect(snapshot.chunks.every(({ chunk }) => chunk.resourceLocations.length === 0)).toBe(true);
    expect(snapshot.resourceLocations).toEqual([]);
    runtime.dispose();
  });

  it('preserves server order while selecting nearest six of all four kinds', async () => {
    const rows = skewedBalancedRows();
    const expected = selectGreaterRealmResourceAffordances(rows);
    const getResourceLocations = vi.fn(async (
      request: GreaterRealmResourceLocationRequest
    ): Promise<GreaterRealmResourceLocationBatchDto> => Object.freeze({
      atlasId: GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.bootstrap.atlasId,
      revision: request.expectedRevision,
      chunkHandles: Object.freeze([...request.chunkHandles]),
      truncated: true,
      resourceLocations: rows
    }));
    const runtime = runtimeWith(getResourceLocations);

    await runtime.loadView({ centerQ: 0, centerR: 0, radius: 1, lod: 3 });
    await vi.waitFor(() => {
      expect(runtime.getSnapshot().resourceLocationPhase).toBe('ready');
    });
    const snapshot = runtime.getSnapshot();
    expect(snapshot.resourceLocations).toEqual(expected);
    expect(snapshot.resourceLocations).toHaveLength(
      GREATER_REALM_MAXIMUM_RESOURCE_AFFORDANCES
    );
    for (const kind of RESOURCE_KINDS) {
      expect(snapshot.resourceLocations.filter(row => row.resourceKind === kind)).toHaveLength(
        GREATER_REALM_RESOURCE_AFFORDANCES_PER_KIND
      );
    }
    expect(snapshot.resourceLocationsTruncated).toBe(true);
    runtime.dispose();
  });
});

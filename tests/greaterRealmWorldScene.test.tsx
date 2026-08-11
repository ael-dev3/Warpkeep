import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const canvasHostHarness = vi.hoisted(() => ({
  create: vi.fn()
}));

vi.mock('../src/components/realm/createGreaterRealmWorldCanvasHost', () => ({
  createGreaterRealmWorldCanvasHost: canvasHostHarness.create
}));

import {
  GREATER_REALM_RELEASE_REFRESH_INTERVAL_MILLISECONDS,
  GreaterRealmWorldScene
} from '../src/components/realm/GreaterRealmWorldScene';
import {
  GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE
} from '../src/dev/greaterRealmSyntheticTierOneFixture';
import type {
  GreaterRealmClientSnapshot
} from '../src/greater-realm/greaterRealmClientRuntime';
import type {
  AvailableGreaterRealmProviderBridge
} from '../src/spacetime/greaterRealmProviderBridge';

const OWN_CASTLE = Object.freeze({ castleId: 1, q: -2, r: 1 });
const VIEW = Object.freeze({ centerQ: -1, centerR: 0, radius: 3, lod: 1 });

type RuntimeListener = (snapshot: GreaterRealmClientSnapshot) => void;

function readySnapshot(input: Readonly<{
  mode?: string;
  generation?: number;
  resources?: boolean;
  resourceLocationPhase?: 'idle' | 'loading' | 'ready' | 'failed';
}> = {}) {
  const chunks = GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks.map((chunk, index) => ({
    chunk: {
      ...chunk,
      lod: 1 as const,
      // Reduced LOD chunk aggregates are renderer-only and intentionally empty.
      resourceLocations: []
    },
    distanceChunks: index
  }));
  const resourceLocations = input.resources === false
    ? []
    : GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.resourceLocations;
  return {
    phase: 'ready',
    sessionGeneration: input.generation ?? 17,
    deviceClass: 'desktop',
    graphicsProfile: 'balanced',
    cellSize: 1,
    bootstrap: {
      ...GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.bootstrap,
      mode: input.mode ?? 'active',
      myCastleId: 1n
    },
    window: {
      ...GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.window,
      centerQ: VIEW.centerQ,
      centerR: VIEW.centerR,
      radius: VIEW.radius
    },
    view: VIEW,
    chunks,
    selectedChunkCount: chunks.length,
    resourceLocationPhase: input.resourceLocationPhase ?? 'ready',
    resourceLocations,
    resourceLocationsTruncated: false,
    stream: {}
  } as unknown as GreaterRealmClientSnapshot;
}

function workerControl(statuses: readonly ('idle' | 'outbound' | 'gathering' | 'returning')[]) {
  return {
    status: 'ready' as const,
    atlasId: GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.bootstrap.atlasId,
    atlasRevision: GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.bootstrap.revision,
    value: {
      roster: {
        castleId: 1,
        workers: statuses.map((status, index) => ({
          workerId: `GRW-${index + 1}`,
          ordinal: index + 1,
          status
        }))
      },
      resourceState: {
        fid: 77n,
        workerSystemMode: 'active'
      }
    }
  };
}

function bridge(input: Readonly<{
  generation?: number;
  snapshot?: GreaterRealmClientSnapshot;
  control?: ReturnType<typeof workerControl>;
  refreshRelease?: (
    listener: RuntimeListener,
    view: unknown
  ) => Promise<GreaterRealmClientSnapshot>;
  holdLoad?: boolean;
  dispose?: () => void;
  captureListener?: (listener: RuntimeListener) => void;
  dispatchWorker?: (input: unknown) => Promise<void>;
  recallWorker?: (workerId: string) => Promise<void>;
  recallAllWorkers?: () => Promise<void>;
}> = {}) {
  const generation = input.generation ?? 17;
  const snapshot = input.snapshot ?? readySnapshot({ generation });
  return Object.freeze({
    phase: 'available' as const,
    presentationAllowed: true as const,
    sessionGeneration: generation,
    createRuntime: () => {
      let listener: RuntimeListener = () => undefined;
      return Object.freeze({
        getSnapshot: () => ({ phase: 'idle', sessionGeneration: generation }) as never,
        subscribe: (next: RuntimeListener) => {
          listener = next;
          input.captureListener?.(next);
          next({ phase: 'idle', sessionGeneration: generation } as never);
          return () => { listener = () => undefined; };
        },
        bootstrap: vi.fn(),
        loadView: async () => {
          if (input.holdLoad) return new Promise<GreaterRealmClientSnapshot>(() => undefined);
          listener(snapshot);
          return snapshot;
        },
        refreshRelease: (view: unknown) => input.refreshRelease?.(listener, view)
          ?? Promise.resolve(snapshot),
        retryFailedChunks: vi.fn(),
        planRoute: vi.fn(),
        dispose: input.dispose ?? vi.fn()
      });
    },
    getWorkerControl: () => input.control,
    dispatchWorker: input.dispatchWorker,
    recallWorker: input.recallWorker,
    recallAllWorkers: input.recallAllWorkers
  }) as unknown as AvailableGreaterRealmProviderBridge;
}

function renderScene(
  greaterRealm: AvailableGreaterRealmProviderBridge,
  options: Readonly<{
    onPhaseChange?: (phase: string) => void;
  }> = {}
) {
  return render(
    <GreaterRealmWorldScene
      bridge={greaterRealm}
      identityFid={77}
      identityKey="77:1"
      ownCastle={OWN_CASTLE}
      resolvedGraphicsQuality="balanced"
      onPhaseChange={options.onPhaseChange ?? vi.fn()}
    />
  );
}

beforeEach(() => {
  canvasHostHarness.create.mockReset();
  canvasHostHarness.create.mockImplementation(() => ({
    applySnapshot: vi.fn(),
    schedule: vi.fn(),
    getTelemetry: vi.fn(),
    dispose: vi.fn()
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Greater Realm world scene lifecycle', () => {
  it('clears resource-read authority in the layout phase before controls are interactive', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/realm/GreaterRealmWorldScene.tsx'),
      'utf8'
    );
    const layoutReset = [
      'useLayoutEffect(() => {',
      '    setResourceSelection(undefined);',
      '  }, [publicResourceSource, resourceAtlasId, resourceRevision]);'
    ].join('\n');
    const passiveReset = layoutReset.replace('useLayoutEffect', 'useEffect');
    const commandReset = 'useEffect(() => {\n    commandGenerationRef.current += 1;';
    expect(source.split(layoutReset)).toHaveLength(2);
    expect(source).not.toContain(passiveReset);
    expect(source.indexOf(layoutReset)).toBeLessThan(source.indexOf(commandReset));
  });

  it('renders canary and halted atlas reads while dispatch remains active-only', async () => {
    for (const mode of ['canary', 'halted', 'active']) {
      const dispatchWorker = vi.fn(async () => undefined);
      const view = renderScene(bridge({
        snapshot: readySnapshot({ mode }),
        control: workerControl(['idle']),
        dispatchWorker
      }));
      const location = GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.resourceLocations[0]!;
      fireEvent.click(await screen.findByRole('button', {
        name: `${location.resourceKind} at ${location.atlasQ}, ${location.atlasR} · ${location.nodeCount} nodes`
      }));
      const send = screen.getByRole('button', { name: 'SEND WORKER 1' }) as HTMLButtonElement;
      expect(send.disabled).toBe(mode !== 'active');
      expect(canvasHostHarness.create.mock.results.at(-1)?.value.applySnapshot)
        .toHaveBeenCalledWith(expect.objectContaining({
          phase: 'ready',
          bootstrap: expect.objectContaining({ mode })
        }));
      if (mode === 'active') {
        fireEvent.click(send);
        await waitFor(() => expect(dispatchWorker).toHaveBeenCalledOnce());
      }
      view.unmount();
    }
  });

  it('keeps the map ready while withholding non-ready resource reads', async () => {
    const location = GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.resourceLocations[0]!;
    for (const resourceLocationPhase of ['loading', 'failed'] as const) {
      const onPhaseChange = vi.fn();
      const snapshot = readySnapshot({ resourceLocationPhase });
      expect(snapshot.chunks.every(({ chunk }) => (
        chunk.resourceLocations.length === 0
      ))).toBe(true);
      const view = renderScene(bridge({ snapshot }), { onPhaseChange });
      await waitFor(() => expect(onPhaseChange).toHaveBeenLastCalledWith('ready'));
      expect(canvasHostHarness.create.mock.results.at(-1)?.value.applySnapshot)
        .toHaveBeenCalledWith(snapshot);
      expect(screen.queryByRole('button', {
        name: `${location.resourceKind} at ${location.atlasQ}, ${location.atlasR} · ${location.nodeCount} nodes`
      })).toBeNull();
      view.unmount();
    }
  });

  it('clears a replaced resource read before allowing an immediate current dispatch', async () => {
    let emit: RuntimeListener = () => undefined;
    const snapshot = readySnapshot();
    const dispatchWorker = vi.fn(async () => undefined);
    renderScene(bridge({
      snapshot,
      control: workerControl(['idle']),
      dispatchWorker,
      captureListener: (listener) => { emit = listener; }
    }));
    const location = snapshot.resourceLocations[0]!;
    const locationButton = await screen.findByRole('button', {
      name: `${location.resourceKind} at ${location.atlasQ}, ${location.atlasR} · ${location.nodeCount} nodes`
    });
    fireEvent.click(locationButton);
    expect(screen.getByRole('button', { name: 'SEND WORKER 1' })).not.toBeNull();

    const replacement = snapshot.resourceLocations.map((row) => ({ ...row }));
    act(() => emit({
      ...snapshot,
      resourceLocations: replacement
    }));

    expect(screen.queryByRole('button', { name: 'SEND WORKER 1' })).toBeNull();
    expect(locationButton.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', {
      name: `${location.resourceKind} at ${location.atlasQ}, ${location.atlasR} · ${location.nodeCount} nodes`
    }));
    fireEvent.click(screen.getByRole('button', { name: 'SEND WORKER 1' }));
    await waitFor(() => expect(dispatchWorker).toHaveBeenCalledWith({
      workerId: 'GRW-1',
      resourceKind: location.resourceKind,
      locationId: location.locationId,
      expectedRevision: snapshot.bootstrap!.revision
    }));
  });

  it('keeps recall controls available when the bounded resource read is empty', async () => {
    const recallWorker = vi.fn(async () => undefined);
    renderScene(bridge({
      snapshot: readySnapshot({ resources: false }),
      control: workerControl(['outbound', 'returning', 'idle']),
      recallWorker
    }));

    const recall = await screen.findByRole('button', {
      name: 'RECALL WORKER 1 · outbound'
    });
    expect(screen.queryByText('Nearby resources')).toBeNull();
    expect((screen.getByRole('button', {
      name: 'WORKER 2 · returning'
    }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(recall);
    await waitFor(() => expect(recallWorker).toHaveBeenCalledWith('GRW-1'));
  });

  it('keeps halted recall available while fresh dispatch remains disabled', async () => {
    const recallWorker = vi.fn(async () => undefined);
    const dispatchWorker = vi.fn(async () => undefined);
    renderScene(bridge({
      snapshot: readySnapshot({ mode: 'halted' }),
      control: workerControl(['outbound', 'idle']),
      recallWorker,
      dispatchWorker
    }));
    const location = GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.resourceLocations[0]!;
    fireEvent.click(await screen.findByRole('button', {
      name: `${location.resourceKind} at ${location.atlasQ}, ${location.atlasR} · ${location.nodeCount} nodes`
    }));
    expect((screen.getByRole('button', {
      name: 'SEND WORKER 2'
    }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', {
      name: 'RECALL WORKER 1 · outbound'
    }));
    await waitFor(() => expect(recallWorker).toHaveBeenCalledWith('GRW-1'));
    expect(dispatchWorker).not.toHaveBeenCalled();
  });

  it.each(['atlas', 'revision'] as const)(
    'withholds all Worker controls on stale %s authority',
    async (mismatch) => {
      const control = structuredClone(workerControl(['outbound', 'idle']));
      if (mismatch === 'atlas') control.atlasId = 'greater.realm.other.v17';
      else control.atlasRevision += 1n;
      const recallWorker = vi.fn(async () => undefined);
      const dispatchWorker = vi.fn(async () => undefined);
      renderScene(bridge({ control, recallWorker, dispatchWorker }));
      const location = GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.resourceLocations[0]!;
      fireEvent.click(await screen.findByRole('button', {
        name: `${location.resourceKind} at ${location.atlasQ}, ${location.atlasR} · ${location.nodeCount} nodes`
      }));
      expect((screen.getByRole('button', {
        name: 'NO IDLE WORKER'
      }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.queryByLabelText('Active workers')).toBeNull();
      expect(recallWorker).not.toHaveBeenCalled();
      expect(dispatchWorker).not.toHaveBeenCalled();
    }
  );

  it('does not rebuild WebGL for equal own-castle values', async () => {
    const greaterRealm = bridge();
    const onPhaseChange = vi.fn();
    const view = renderScene(greaterRealm, { onPhaseChange });
    await waitFor(() => expect(canvasHostHarness.create).toHaveBeenCalledOnce());
    const firstHost = canvasHostHarness.create.mock.results[0]!.value;
    view.rerender(
      <GreaterRealmWorldScene
        bridge={greaterRealm}
        identityFid={77}
        identityKey="77:1"
        ownCastle={{ ...OWN_CASTLE }}
        resolvedGraphicsQuality="balanced"
        onPhaseChange={onPhaseChange}
      />
    );
    expect(canvasHostHarness.create).toHaveBeenCalledOnce();
    expect(firstHost.dispose).not.toHaveBeenCalled();
  });

  it('clears old-generation resources and recreates the same-coordinate host', async () => {
    const oldRuntimeDispose = vi.fn();
    const view = renderScene(bridge({ dispose: oldRuntimeDispose }));
    const location = GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.resourceLocations[0]!;
    expect(await screen.findByRole('button', {
      name: `${location.resourceKind} at ${location.atlasQ}, ${location.atlasR} · ${location.nodeCount} nodes`
    })).not.toBeNull();
    const oldHost = canvasHostHarness.create.mock.results[0]!.value;

    view.rerender(
      <GreaterRealmWorldScene
        bridge={bridge({ generation: 18, holdLoad: true })}
        identityFid={77}
        identityKey="77:1"
        ownCastle={OWN_CASTLE}
        resolvedGraphicsQuality="balanced"
        onPhaseChange={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', {
      name: `${location.resourceKind} at ${location.atlasQ}, ${location.atlasR} · ${location.nodeCount} nodes`
    })).toBeNull();
    expect(oldRuntimeDispose).toHaveBeenCalledOnce();
    expect(oldHost.dispose).toHaveBeenCalledOnce();
    expect(canvasHostHarness.create).toHaveBeenCalledTimes(2);
  });

  it('rejects old atlas rows immediately after same-castle coordinate drift', async () => {
    const dispatchWorker = vi.fn(async () => undefined);
    const greaterRealm = bridge({
      control: workerControl(['idle']),
      dispatchWorker
    });
    const onPhaseChange = vi.fn();
    const view = renderScene(greaterRealm, { onPhaseChange });
    const location = GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.resourceLocations[0]!;
    const locationButton = await screen.findByRole('button', {
      name: `${location.resourceKind} at ${location.atlasQ}, ${location.atlasR} · ${location.nodeCount} nodes`
    });
    fireEvent.click(locationButton);
    expect(screen.getByRole('button', { name: 'SEND WORKER 1' })).not.toBeNull();
    const firstHost = canvasHostHarness.create.mock.results[0]!.value;

    view.rerender(
      <GreaterRealmWorldScene
        bridge={greaterRealm}
        identityFid={77}
        identityKey="77:1"
        ownCastle={{ ...OWN_CASTLE, q: -3 }}
        resolvedGraphicsQuality="balanced"
        onPhaseChange={onPhaseChange}
      />
    );

    expect(screen.queryByRole('button', {
      name: `${location.resourceKind} at ${location.atlasQ}, ${location.atlasR} · ${location.nodeCount} nodes`
    })).toBeNull();
    expect(screen.queryByRole('button', { name: 'SEND WORKER 1' })).toBeNull();
    expect(dispatchWorker).not.toHaveBeenCalled();
    expect(firstHost.dispose).toHaveBeenCalledOnce();
    expect(canvasHostHarness.create).toHaveBeenCalledTimes(2);
    await act(async () => { await Promise.resolve(); });
    expect(canvasHostHarness.create.mock.results[1]!.value.applySnapshot)
      .not.toHaveBeenCalled();
  });

  it('retains the last validated read after a non-overlapping refresh failure', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    let rejectRefresh: (reason?: unknown) => void = () => undefined;
    const refreshRelease = vi.fn((listener: RuntimeListener) => {
      listener({ phase: 'idle', sessionGeneration: 17 } as never);
      return new Promise<GreaterRealmClientSnapshot>((_resolve, reject) => {
        rejectRefresh = reject;
      });
    });
    const onPhaseChange = vi.fn();
    renderScene(bridge({
      control: workerControl(['idle']),
      refreshRelease,
      dispatchWorker: async () => undefined
    }), { onPhaseChange });
    const location = GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.resourceLocations[0]!;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', {
      name: `${location.resourceKind} at ${location.atlasQ}, ${location.atlasR} · ${location.nodeCount} nodes`
    }));
    expect((screen.getByRole('button', {
      name: 'SEND WORKER 1'
    }) as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(GREATER_REALM_RELEASE_REFRESH_INTERVAL_MILLISECONDS);
      await Promise.resolve();
    });
    expect(refreshRelease).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', {
      name: `${location.resourceKind} at ${location.atlasQ}, ${location.atlasR} · ${location.nodeCount} nodes`
    })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'SEND WORKER 1' })).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(GREATER_REALM_RELEASE_REFRESH_INTERVAL_MILLISECONDS);
      await Promise.resolve();
    });
    expect(refreshRelease).toHaveBeenCalledOnce();
    await act(async () => {
      rejectRefresh(new Error('offline'));
      await Promise.resolve();
    });
    expect(onPhaseChange).toHaveBeenLastCalledWith('failed');
    expect(screen.getByRole('button', {
      name: `${location.resourceKind} at ${location.atlasQ}, ${location.atlasR} · ${location.nodeCount} nodes`
    })).not.toBeNull();
  });

  it('defers a due release refresh while hidden and resumes on visibility', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const refreshRelease = vi.fn(async (
      _listener: RuntimeListener,
      _view: unknown
    ) => readySnapshot());
    renderScene(bridge({ refreshRelease }));
    await act(async () => { await Promise.resolve(); });

    hidden = true;
    await act(async () => {
      vi.advanceTimersByTime(GREATER_REALM_RELEASE_REFRESH_INTERVAL_MILLISECONDS);
      await Promise.resolve();
    });
    expect(refreshRelease).not.toHaveBeenCalled();
    hidden = false;
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(refreshRelease).toHaveBeenCalledOnce();
    expect(refreshRelease.mock.calls[0]?.[1]).toEqual(VIEW);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  GREATER_REALM_SYNTHETIC_REVISION,
  GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE,
  createGreaterRealmSyntheticTransport
} from '../src/dev/greaterRealmSyntheticTierOneFixture';
import {
  createGreaterRealmClientRuntime
} from '../src/greater-realm/greaterRealmClientRuntime';
import type {
  GreaterRealmChunkDto,
  GreaterRealmWindowChunkDto
} from '../src/greater-realm/greaterRealmPublicContract';
import {
  GREATER_REALM_GRAPHICS_BUDGETS,
  GREATER_REALM_NETWORK_BUDGETS,
  type GreaterRealmDeviceClass,
  type GreaterRealmGraphicsProfile
} from '../src/greater-realm/greaterRealmRuntimePolicy';
import {
  GREATER_REALM_PUBLIC_PROCEDURES,
  type GreaterRealmPublicTransport
} from '../src/greater-realm/greaterRealmTransport';
import {
  resolveRealmWorldSceneStrategy,
  resolveRealmWorldSceneStrategyForPolicy
} from '../src/components/realm/greaterRealmSceneStrategy';
import {
  DORMANT_GREATER_REALM_PROVIDER_BRIDGE,
  GREATER_REALM_CLIENT_PRESENTATION_ALLOWED,
  createWarpkeepGreaterRealmProviderBridge
} from '../src/spacetime/greaterRealmProviderBridge';
import {
  createWarpkeepGreaterRealmProcedureInvoker,
  type WarpkeepConnection
} from '../src/spacetime/warpkeepConnection';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function handle(ordinal: number) {
  let value = ordinal;
  let encoded = '';
  do {
    encoded = BASE32[value % 32]! + encoded;
    value = Math.trunc(value / 32);
  } while (value > 0);
  return `GRK-${encoded.padStart(26, 'A')}`;
}

function delay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds);
    const abort = () => {
      clearTimeout(timeout);
      reject(signal.reason);
    };
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

function windowCoordinates(count: number) {
  const output: Array<Readonly<{ q: number; r: number }>> = [];
  for (let q = -4; q <= 4; q += 1) {
    for (let r = -4; r <= 4; r += 1) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 4) {
        output.push(Object.freeze({ q, r }));
      }
    }
  }
  return output.slice(0, count);
}

function productionShapedWindowTransport(input: Readonly<{
  descriptorCount: number;
  onFetchConcurrency: (active: number) => void;
}>): GreaterRealmPublicTransport {
  const synthetic = createGreaterRealmSyntheticTransport();
  const baseDescriptor = GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.window.chunks[0]!;
  const descriptors = Object.freeze(windowCoordinates(input.descriptorCount).map(
    (coordinate, index): GreaterRealmWindowChunkDto => Object.freeze({
      ...baseDescriptor,
      chunkHandle: handle(100 + index),
      binQ: coordinate.q,
      binR: coordinate.r
    })
  ));
  let activeFetches = 0;
  return Object.freeze({
    getBootstrap: synthetic.getBootstrap,
    getWindow: async (request, signal) => {
      if (signal.aborted) throw signal.reason;
      if (
        request.centerQ !== 0
        || request.centerR !== 0
        || request.radius !== 4
        || request.expectedRevision !== GREATER_REALM_SYNTHETIC_REVISION
      ) throw new Error('TEST_WINDOW_UNAVAILABLE');
      return Object.freeze({
        ...GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.window,
        radius: 4,
        chunks: descriptors
      });
    },
    getChunk: async (request, signal) => {
      activeFetches += 1;
      input.onFetchConcurrency(activeFetches);
      try {
        await delay(2, signal);
        const raw = structuredClone(
          GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks[0]
        ) as unknown as {
          chunkHandle: string;
          coreCells: Array<{ chunkHandle: string }>;
        };
        raw.chunkHandle = request.chunkHandle;
        raw.coreCells.forEach((cell) => { cell.chunkHandle = request.chunkHandle; });
        return raw as unknown as GreaterRealmChunkDto;
      } finally {
        activeFetches -= 1;
      }
    },
    planRoute: synthetic.planRoute
  });
}

describe('Greater Realm client/provider bridge', () => {
  it('pins the independent client presentation gate to a compile-time literal false', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      'src/spacetime/greaterRealmProviderBridge.ts'
    ), 'utf8');
    expect(source).toContain(
      'export const GREATER_REALM_CLIENT_PRESENTATION_ALLOWED = false as const;'
    );
  });

  it('keeps both provider and RealmMapScreen selection dormant behind the literal gate', () => {
    const forbiddenProcedure = vi.fn(() => {
      throw new Error('V17_PROCEDURE_MUST_NOT_RUN');
    });
    const connection = {
      procedures: new Proxy({}, { get: () => forbiddenProcedure })
    } as unknown as WarpkeepConnection;
    const bridge = createWarpkeepGreaterRealmProviderBridge({
      connection,
      authority: Object.freeze({ generation: 7, fid: 42, isCurrent: () => true })
    });

    expect(GREATER_REALM_CLIENT_PRESENTATION_ALLOWED).toBe(false);
    expect(bridge).toBe(DORMANT_GREATER_REALM_PROVIDER_BRIDGE);
    expect(resolveRealmWorldSceneStrategy({
      bridge,
      legacyAuthorityActive: true
    })).toEqual({
      kind: 'legacy-lowlands',
      reason: 'client-gate-closed'
    });
    expect(forbiddenProcedure).not.toHaveBeenCalled();
  });

  it('never resurrects Lowlands after v17 cutover loses its connection', () => {
    const connectionLost = Object.freeze({
      phase: 'dormant',
      reason: 'connection-unavailable',
      presentationAllowed: false
    } as const);
    expect(resolveRealmWorldSceneStrategy({
      bridge: connectionLost,
      legacyAuthorityActive: false
    })).toEqual({
      kind: 'connection-hold',
      reason: 'legacy-authority-inactive'
    });
  });

  it('exercises the future scene branch only through the explicit policy seam', () => {
    const bridge = Object.freeze({
      phase: 'available' as const,
      presentationAllowed: true as const,
      sessionGeneration: 17,
      createRuntime: vi.fn()
    });
    expect(resolveRealmWorldSceneStrategyForPolicy({
      bridge,
      legacyAuthorityActive: false
    }, {
      clientPresentationAllowed: true,
      serverPresentationAllowed: true
    })).toMatchObject({
      kind: 'greater-realm',
      sessionGeneration: 17
    });
    expect(resolveRealmWorldSceneStrategy({
      bridge,
      legacyAuthorityActive: false
    })).toEqual({
      kind: 'connection-hold',
      reason: 'legacy-authority-inactive'
    });
  });

  it('can validate a public bootstrap without selecting a window or private state', async () => {
    const synthetic = createGreaterRealmSyntheticTransport();
    const getWindow = vi.fn(synthetic.getWindow);
    const runtime = createGreaterRealmClientRuntime({
      sessionGeneration: 10,
      isSessionCurrent: () => true,
      transport: Object.freeze({ ...synthetic, getWindow }),
      deviceClass: 'mobile',
      graphicsProfile: 'balanced'
    });
    const snapshot = await runtime.bootstrap();
    expect(snapshot).toMatchObject({
      phase: 'bootstrap-ready',
      sessionGeneration: 10,
      selectedChunkCount: 0,
      chunks: []
    });
    expect(snapshot.bootstrap?.revision).toBe(GREATER_REALM_SYNTHETIC_REVISION);
    expect(getWindow).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it('maps only the four reviewed procedures and rejects stale generations', async () => {
    let current = true;
    let resolvePending: ((value: unknown) => void) | undefined;
    const procedures = {
      getRealmAtlasBootstrapV1: vi.fn(async () => (
        GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.bootstrap
      )),
      getRealmAtlasWindowV1: vi.fn(async () => (
        GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.window
      )),
      getRealmAtlasChunkV1: vi.fn(async () => (
        GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks[0]
      )),
      planRealmRouteV1: vi.fn(async () => new Promise((resolve) => {
        resolvePending = resolve;
      }))
    };
    const invoker = createWarpkeepGreaterRealmProcedureInvoker(
      { procedures } as unknown as WarpkeepConnection,
      Object.freeze({ generation: 9, fid: 42, isCurrent: () => current })
    );
    const signal = new AbortController().signal;

    await expect(invoker.call(
      GREATER_REALM_PUBLIC_PROCEDURES.bootstrap,
      Object.freeze({}),
      signal
    )).resolves.toBe(GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.bootstrap);
    await expect(invoker.call(
      GREATER_REALM_PUBLIC_PROCEDURES.window,
      Object.freeze({ centerQ: 0, centerR: 0, radius: 1, expectedRevision: 1n }),
      signal
    )).resolves.toBe(GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.window);
    await expect(invoker.call(
      GREATER_REALM_PUBLIC_PROCEDURES.chunk,
      Object.freeze({
        chunkHandle: GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.window.chunks[0]!.chunkHandle,
        lod: 0,
        expectedRevision: 1n
      }),
      signal
    )).resolves.toBe(GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks[0]);
    await expect(invoker.call(
      'admin_get_greater_realm_status_v1',
      Object.freeze({}),
      signal
    )).rejects.toThrow('GREATER_REALM_PUBLIC_PROCEDURE_NOT_ALLOWED');
    await expect(invoker.call(
      GREATER_REALM_PUBLIC_PROCEDURES.workerControlState,
      Object.freeze({}),
      signal
    )).rejects.toThrow('GREATER_REALM_PUBLIC_PROCEDURE_NOT_ALLOWED');

    const pendingRoute = invoker.call(
      GREATER_REALM_PUBLIC_PROCEDURES.planRoute,
      Object.freeze({
        originCellKey: 'T1_LOWLANDS:0:0',
        destinationCellKey: 'T1_LOWLANDS:1:0',
        offset: 0,
        limit: 2,
        expectedRevision: 1n
      }),
      signal
    );
    await vi.waitFor(() => expect(resolvePending).toBeTypeOf('function'));
    current = false;
    resolvePending?.(Object.freeze({}));
    await expect(pendingRoute).rejects.toThrow('GREATER_REALM_CONNECTION_GENERATION_STALE');
    await expect(invoker.call(
      GREATER_REALM_PUBLIC_PROCEDURES.bootstrap,
      Object.freeze({}),
      signal
    )).rejects.toThrow('GREATER_REALM_CONNECTION_GENERATION_STALE');
    expect(procedures.getRealmAtlasBootstrapV1).toHaveBeenCalledOnce();
  });

  it.each([
    ['desktop', 'high'],
    ['mobile', 'balanced']
  ] as const)(
    'bounds the %s production-shaped window with the existing %s policies',
    async (deviceClass: GreaterRealmDeviceClass, graphicsProfile: GreaterRealmGraphicsProfile) => {
      let peakFetches = 0;
      const runtime = createGreaterRealmClientRuntime({
        sessionGeneration: 11,
        isSessionCurrent: () => true,
        transport: productionShapedWindowTransport({
          descriptorCount: 40,
          onFetchConcurrency: (active) => { peakFetches = Math.max(peakFetches, active); }
        }),
        deviceClass,
        graphicsProfile
      });

      const snapshot = await runtime.loadView({ centerQ: 0, centerR: 0, radius: 4, lod: 0 });
      expect(snapshot.phase).toBe('ready');
      expect(snapshot.selectedChunkCount).toBe(
        GREATER_REALM_GRAPHICS_BUDGETS[graphicsProfile].maximumVisibleChunks
      );
      expect(snapshot.chunks).toHaveLength(snapshot.selectedChunkCount);
      expect(snapshot.stream.residentChunkCount).toBe(snapshot.selectedChunkCount);
      expect(peakFetches).toBeLessThanOrEqual(
        GREATER_REALM_NETWORK_BUDGETS[deviceClass].fetchConcurrency
      );
      expect(snapshot.stream.peakDecodeConcurrency).toBeLessThanOrEqual(
        GREATER_REALM_NETWORK_BUDGETS[deviceClass].decodeConcurrency
      );
      runtime.dispose();
      expect(runtime.getSnapshot()).toMatchObject({
        phase: 'disposed',
        selectedChunkCount: 0,
        chunks: []
      });
    }
  );

  it('isolates reconnect generations and drops the prior public cache', async () => {
    let firstGenerationCurrent = true;
    const first = createGreaterRealmClientRuntime({
      sessionGeneration: 21,
      isSessionCurrent: () => firstGenerationCurrent,
      transport: createGreaterRealmSyntheticTransport(),
      deviceClass: 'desktop',
      graphicsProfile: 'high'
    });
    expect((await first.loadView({ centerQ: 0, centerR: 0, radius: 1, lod: 0 })).chunks)
      .toHaveLength(2);

    firstGenerationCurrent = false;
    const stale = await first.refreshRelease({ centerQ: 0, centerR: 0, radius: 1, lod: 0 });
    expect(stale).toMatchObject({
      phase: 'failed',
      failureReason: 'stale-generation',
      selectedChunkCount: 0,
      chunks: []
    });

    const replacement = createGreaterRealmClientRuntime({
      sessionGeneration: 22,
      isSessionCurrent: () => true,
      transport: createGreaterRealmSyntheticTransport(),
      deviceClass: 'desktop',
      graphicsProfile: 'high'
    });
    expect(replacement.getSnapshot()).toMatchObject({
      phase: 'idle',
      sessionGeneration: 22,
      selectedChunkCount: 0,
      chunks: []
    });
    expect((await replacement.loadView({ centerQ: 0, centerR: 0, radius: 1, lod: 1 })))
      .toMatchObject({ phase: 'ready', sessionGeneration: 22 });
    expect(replacement.getSnapshot().chunks.every(({ chunk }) => chunk.lod === 1)).toBe(true);
    const routeKeys = GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.routeCellKeys;
    const route = await replacement.planRoute({
      originCellKey: routeKeys[0]!,
      destinationCellKey: routeKeys.at(-1)!,
      offset: 0,
      limit: 3
    });
    expect(route).toMatchObject({
      revision: GREATER_REALM_SYNTHETIC_REVISION,
      complete: false,
      nextOffset: 3
    });
    expect(route.cells).toHaveLength(3);
    first.dispose();
    replacement.dispose();
  });

  it('reloads an atlas revision without retaining an older chunk', async () => {
    const synthetic = createGreaterRealmSyntheticTransport();
    let revision = 1n;
    const versionedTransport: GreaterRealmPublicTransport = Object.freeze({
      getBootstrap: async (signal) => Object.freeze({
        ...await synthetic.getBootstrap(signal),
        revision
      }),
      getWindow: async (request, signal) => Object.freeze({
        ...await synthetic.getWindow({ ...request, expectedRevision: 1n }, signal),
        revision
      }),
      getChunk: async (request, signal) => Object.freeze({
        ...await synthetic.getChunk({ ...request, expectedRevision: 1n }, signal),
        revision
      }),
      planRoute: async (request, signal) => Object.freeze({
        ...await synthetic.planRoute({ ...request, expectedRevision: 1n }, signal),
        revision
      })
    });
    const runtime = createGreaterRealmClientRuntime({
      sessionGeneration: 31,
      isSessionCurrent: () => true,
      transport: versionedTransport,
      deviceClass: 'desktop',
      graphicsProfile: 'high'
    });
    expect((await runtime.loadView({ centerQ: 0, centerR: 0, radius: 1, lod: 0 }))
      .chunks.every(({ chunk }) => chunk.revision === 1n)).toBe(true);

    revision = 2n;
    const refreshed = await runtime.refreshRelease();
    expect(refreshed).toMatchObject({ phase: 'ready' });
    expect(refreshed.bootstrap?.revision).toBe(2n);
    expect(refreshed.window?.revision).toBe(2n);
    expect(refreshed.chunks.every(({ chunk }) => chunk.revision === 2n)).toBe(true);
    expect(refreshed.stream.residentChunkCount).toBe(2);
    runtime.dispose();
  });
});

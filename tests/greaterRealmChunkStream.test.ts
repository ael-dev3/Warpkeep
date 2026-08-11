import { describe, expect, it } from 'vitest';

import { GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE } from '../src/dev/greaterRealmSyntheticTierOneFixture';
import { createGreaterRealmChunkStream } from '../src/greater-realm/greaterRealmChunkStream';
import { decodeGreaterRealmChunkDto, type GreaterRealmLod } from '../src/greater-realm/greaterRealmPublicContract';
import {
  GREATER_REALM_GRAPHICS_BUDGETS,
  GREATER_REALM_NETWORK_BUDGETS,
  type GreaterRealmDeviceClass,
  type GreaterRealmGraphicsProfile
} from '../src/greater-realm/greaterRealmRuntimePolicy';

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

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

function rawChunk(chunkHandle: string, lod: GreaterRealmLod = 0) {
  const raw = structuredClone(GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks[0]) as any;
  raw.chunkHandle = chunkHandle;
  raw.lod = lod;
  raw.coreCells.forEach((cell: any) => { cell.chunkHandle = chunkHandle; });
  return raw;
}

function demands(start: number, count: number, lod: GreaterRealmLod = 0) {
  return Array.from({ length: count }, (_, offset) => Object.freeze({
    chunkHandle: handle(start + offset),
    distanceChunks: offset,
    lod
  }));
}

describe('Greater Realm chunk stream', () => {
  it.each([
    ['desktop', 'high'],
    ['mobile', 'balanced']
  ] as const)('bounds %s fetch and decode pools independently', async (deviceClass, graphicsProfile) => {
    let activeFetches = 0;
    let activeDecodes = 0;
    let observedFetches = 0;
    let observedDecodes = 0;
    const stream = createGreaterRealmChunkStream({
      deviceClass,
      graphicsProfile,
      fetchChunk: async (request) => {
        activeFetches += 1;
        observedFetches = Math.max(observedFetches, activeFetches);
        await delay(4);
        activeFetches -= 1;
        return rawChunk(request.chunkHandle, request.lod);
      },
      decodeChunk: async (value, signal) => {
        activeDecodes += 1;
        observedDecodes = Math.max(observedDecodes, activeDecodes);
        try {
          await delay(4);
          if (signal.aborted) throw signal.reason;
          return decodeGreaterRealmChunkDto(value);
        } finally {
          activeDecodes -= 1;
        }
      }
    });

    stream.setDesired(1n, demands(0, 10));
    await stream.awaitIdle();
    const budget = GREATER_REALM_NETWORK_BUDGETS[deviceClass];
    const snapshot = stream.getSnapshot();
    expect(observedFetches).toBe(budget.fetchConcurrency);
    expect(observedDecodes).toBe(budget.decodeConcurrency);
    expect(snapshot.peakFetchConcurrency).toBeLessThanOrEqual(budget.fetchConcurrency);
    expect(snapshot.peakDecodeConcurrency).toBeLessThanOrEqual(budget.decodeConcurrency);
    expect(snapshot.residentChunkCount).toBe(10);
    stream.dispose();
  });

  it('cancels a stale LOD before decode and retains only the replacement', async () => {
    let staleSignal: AbortSignal | undefined;
    let staleDecoded = false;
    const target = handle(20);
    const stream = createGreaterRealmChunkStream({
      deviceClass: 'mobile',
      graphicsProfile: 'balanced',
      fetchChunk: (request, signal) => {
        if (request.lod === 0) {
          staleSignal = signal;
          return new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          });
        }
        return Promise.resolve(rawChunk(request.chunkHandle, request.lod));
      },
      decodeChunk: (value) => {
        const decoded = decodeGreaterRealmChunkDto(value);
        if (decoded.lod === 0) staleDecoded = true;
        return decoded;
      }
    });
    stream.setDesired(1n, [{ chunkHandle: target, distanceChunks: 0, lod: 0 }]);
    expect(staleSignal?.aborted).toBe(false);
    stream.setDesired(1n, [{ chunkHandle: target, distanceChunks: 0, lod: 1 }]);
    await stream.awaitIdle();
    expect(staleSignal?.aborted).toBe(true);
    expect(staleDecoded).toBe(false);
    expect(stream.getChunk(target)?.lod).toBe(1);
    stream.dispose();
  });

  it('pins High/Balanced/Reduced resident LRU ceilings at 128/72/36', async () => {
    expect(Object.fromEntries(Object.entries(GREATER_REALM_GRAPHICS_BUDGETS).map(
      ([profile, budget]) => [profile, budget.maximumResidentChunks]
    ))).toEqual({ high: 128, balanced: 72, reduced: 36 });

    const evicted: string[] = [];
    const profile: GreaterRealmGraphicsProfile = 'reduced';
    const deviceClass: GreaterRealmDeviceClass = 'desktop';
    const stream = createGreaterRealmChunkStream({
      deviceClass,
      graphicsProfile: profile,
      fetchChunk: async (request) => rawChunk(request.chunkHandle, request.lod),
      onChunkEvicted: (chunk) => { evicted.push(chunk.chunkHandle); }
    });
    stream.setDesired(1n, demands(0, 40));
    await stream.awaitIdle();
    expect(stream.getSnapshot().desiredCount).toBe(36);
    stream.setDesired(1n, demands(100, 36));
    await stream.awaitIdle();
    expect(stream.getSnapshot().residentChunkCount).toBeLessThanOrEqual(36);
    expect(evicted.length).toBeGreaterThan(0);
    stream.dispose();
  });
});

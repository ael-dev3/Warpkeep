import {
  createGreaterRealmChunkRequest,
  decodeGreaterRealmChunkDto,
  type GreaterRealmChunkDto,
  type GreaterRealmLod
} from './greaterRealmPublicContract';
import {
  GREATER_REALM_GRAPHICS_BUDGETS,
  GREATER_REALM_NETWORK_BUDGETS,
  type GreaterRealmDeviceClass,
  type GreaterRealmGraphicsProfile
} from './greaterRealmRuntimePolicy';

export type GreaterRealmChunkDemand = Readonly<{
  chunkHandle: string;
  distanceChunks: number;
  lod: GreaterRealmLod;
}>;

export type GreaterRealmChunkStreamSnapshot = Readonly<{
  disposed: boolean;
  desiredCount: number;
  residentChunkCount: number;
  residentCellCount: number;
  queuedFetchCount: number;
  activeFetchCount: number;
  queuedDecodeCount: number;
  activeDecodeCount: number;
  failedCount: number;
  peakFetchConcurrency: number;
  peakDecodeConcurrency: number;
}>;

export type GreaterRealmChunkStream = Readonly<{
  setDesired: (revision: bigint, values: readonly GreaterRealmChunkDemand[]) => void;
  getChunk: (chunkHandle: string) => GreaterRealmChunkDto | undefined;
  retryFailed: () => void;
  awaitIdle: () => Promise<void>;
  getSnapshot: () => GreaterRealmChunkStreamSnapshot;
  dispose: () => void;
}>;

export type CreateGreaterRealmChunkStreamOptions = Readonly<{
  deviceClass: GreaterRealmDeviceClass;
  graphicsProfile: GreaterRealmGraphicsProfile;
  fetchChunk: (
    request: Readonly<{
      chunkHandle: string;
      lod: GreaterRealmLod;
      expectedRevision: bigint;
    }>,
    signal: AbortSignal
  ) => Promise<unknown>;
  decodeChunk?: (
    value: unknown,
    signal: AbortSignal
  ) => GreaterRealmChunkDto | Promise<GreaterRealmChunkDto>;
  onChunkReady?: (chunk: GreaterRealmChunkDto) => void;
  onChunkEvicted?: (chunk: GreaterRealmChunkDto) => void;
  onError?: (chunkHandle: string, error: unknown) => void;
}>;

type Demand = Readonly<{ priority: number; lod: GreaterRealmLod; revision: bigint }>;
type Operation = Readonly<{
  controller: AbortController;
  lod: GreaterRealmLod;
  revision: bigint;
}>;
type DecodeQueueEntry = Readonly<{
  chunkHandle: string;
  priority: number;
  lod: GreaterRealmLod;
  revision: bigint;
  raw: unknown;
  controller: AbortController;
}>;
type ResidentEntry = { chunk: GreaterRealmChunkDto; touched: number };

function abortError() {
  const error = new Error('GREATER_REALM_CHUNK_REQUEST_CANCELLED');
  error.name = 'AbortError';
  return error;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function safePriority(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : Number.MAX_SAFE_INTEGER;
}

/** Independent cancellable fetch/decode pools with a graphics-profile LRU. */
export function createGreaterRealmChunkStream(
  options: CreateGreaterRealmChunkStreamOptions
): GreaterRealmChunkStream {
  const network = GREATER_REALM_NETWORK_BUDGETS[options.deviceClass];
  const graphics = GREATER_REALM_GRAPHICS_BUDGETS[options.graphicsProfile];
  const decodeChunk = options.decodeChunk ?? ((value: unknown) => decodeGreaterRealmChunkDto(value));
  let disposed = false;
  let revision: bigint | undefined;
  let touchSequence = 0;
  let residentCellCount = 0;
  let peakFetchConcurrency = 0;
  let peakDecodeConcurrency = 0;
  const desired = new Map<string, Demand>();
  const resident = new Map<string, ResidentEntry>();
  const fetching = new Map<string, Operation>();
  const decoding = new Map<string, Operation>();
  const failed = new Set<string>();
  const decodeQueue: DecodeQueueEntry[] = [];
  const idleWaiters = new Set<() => void>();

  const queuedForDecode = (handle: string) => decodeQueue.some((row) => (
    row.chunkHandle === handle
  ));
  const alreadyResident = (handle: string) => {
    const entry = resident.get(handle);
    const demand = desired.get(handle);
    return entry !== undefined
      && demand !== undefined
      && entry.chunk.lod === demand.lod
      && entry.chunk.revision === demand.revision;
  };
  const pendingFetch = () => [...desired.keys()].some((handle) => (
    !alreadyResident(handle)
    && !fetching.has(handle)
    && !decoding.has(handle)
    && !queuedForDecode(handle)
    && !failed.has(handle)
  ));
  const idle = () => (
    fetching.size === 0
    && decoding.size === 0
    && decodeQueue.length === 0
    && !pendingFetch()
  );
  const settleIdle = () => {
    if (!idle()) return;
    for (const resolve of idleWaiters) resolve();
    idleWaiters.clear();
  };

  const evict = (handle: string) => {
    const entry = resident.get(handle);
    if (!entry) return;
    resident.delete(handle);
    residentCellCount -= entry.chunk.coreCells.length + entry.chunk.apronCells.length;
    options.onChunkEvicted?.(entry.chunk);
  };

  const enforceLru = (protectedHandle: string) => {
    while (resident.size > graphics.maximumResidentChunks) {
      const oldest = [...resident.entries()]
        .filter(([handle]) => handle !== protectedHandle)
        .sort((left, right) => (
          Number(desired.has(left[0])) - Number(desired.has(right[0]))
          || left[1].touched - right[1].touched
          || left[0].localeCompare(right[0])
        ))[0];
      if (!oldest) break;
      evict(oldest[0]);
    }
  };

  const store = (chunk: GreaterRealmChunkDto) => {
    // Treat onChunkReady as a synchronous validator before committing the
    // resident entry. A throwing descriptor check is retryable and cannot
    // leave an invalid chunk satisfying future demand.
    options.onChunkReady?.(chunk);
    const previous = resident.get(chunk.chunkHandle);
    if (previous) {
      residentCellCount -= previous.chunk.coreCells.length + previous.chunk.apronCells.length;
    }
    resident.set(chunk.chunkHandle, { chunk, touched: ++touchSequence });
    residentCellCount += chunk.coreCells.length + chunk.apronCells.length;
    enforceLru(chunk.chunkHandle);
  };

  const operationActive = (
    handle: string,
    lod: GreaterRealmLod,
    expectedRevision: bigint,
    controller: AbortController
  ) => (
    !disposed
    && desired.get(handle)?.lod === lod
    && desired.get(handle)?.revision === expectedRevision
    && revision === expectedRevision
    && !controller.signal.aborted
  );

  const pumpDecode = () => {
    if (disposed) return;
    while (decoding.size < network.decodeConcurrency && decodeQueue.length > 0) {
      decodeQueue.sort((left, right) => (
        left.priority - right.priority || left.chunkHandle.localeCompare(right.chunkHandle)
      ));
      const entry = decodeQueue.shift()!;
      if (!operationActive(
        entry.chunkHandle,
        entry.lod,
        entry.revision,
        entry.controller
      )) continue;
      decoding.set(entry.chunkHandle, Object.freeze({
        controller: entry.controller,
        lod: entry.lod,
        revision: entry.revision
      }));
      peakDecodeConcurrency = Math.max(peakDecodeConcurrency, decoding.size);
      void Promise.resolve()
        .then(() => decodeChunk(entry.raw, entry.controller.signal))
        .then((chunk) => {
          if (!operationActive(
            entry.chunkHandle,
            entry.lod,
            entry.revision,
            entry.controller
          )) return;
          if (
            chunk.chunkHandle !== entry.chunkHandle
            || chunk.lod !== entry.lod
            || chunk.revision !== entry.revision
          ) throw new Error('GREATER_REALM_CHUNK_RESPONSE_MISMATCH');
          store(chunk);
        })
        .catch((error: unknown) => {
          if (entry.controller.signal.aborted || isAbortError(error)) return;
          failed.add(entry.chunkHandle);
          options.onError?.(entry.chunkHandle, error);
        })
        .finally(() => {
          if (decoding.get(entry.chunkHandle)?.controller === entry.controller) {
            decoding.delete(entry.chunkHandle);
          }
          pumpDecode();
          pumpFetch();
          settleIdle();
        });
    }
    settleIdle();
  };

  const nextFetch = () => [...desired.entries()]
    .filter(([handle]) => (
      !alreadyResident(handle)
      && !fetching.has(handle)
      && !decoding.has(handle)
      && !queuedForDecode(handle)
      && !failed.has(handle)
    ))
    .sort((left, right) => left[1].priority - right[1].priority || left[0].localeCompare(right[0]))[0];

  function pumpFetch() {
    if (disposed) return;
    while (fetching.size < network.fetchConcurrency) {
      const row = nextFetch();
      if (!row) break;
      const [chunkHandle, demand] = row;
      const controller = new AbortController();
      fetching.set(chunkHandle, Object.freeze({
        controller,
        lod: demand.lod,
        revision: demand.revision
      }));
      peakFetchConcurrency = Math.max(peakFetchConcurrency, fetching.size);
      const request = createGreaterRealmChunkRequest({
        chunkHandle,
        lod: demand.lod,
        expectedRevision: demand.revision
      });
      void options.fetchChunk(request, controller.signal)
        .then((raw) => {
          if (!operationActive(
            chunkHandle,
            demand.lod,
            demand.revision,
            controller
          )) return;
          decodeQueue.push(Object.freeze({
            chunkHandle,
            priority: demand.priority,
            lod: demand.lod,
            revision: demand.revision,
            raw,
            controller
          }));
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || isAbortError(error)) return;
          failed.add(chunkHandle);
          options.onError?.(chunkHandle, error);
        })
        .finally(() => {
          if (fetching.get(chunkHandle)?.controller === controller) fetching.delete(chunkHandle);
          pumpDecode();
          pumpFetch();
          settleIdle();
        });
    }
    settleIdle();
  }

  const cancelStale = (keep: ReadonlyMap<string, Demand> = new Map()) => {
    const cancel = (handle: string, operation: Operation) => {
      const demand = keep.get(handle);
      if (
        !demand
        || demand.lod !== operation.lod
        || demand.revision !== operation.revision
      ) operation.controller.abort(abortError());
    };
    fetching.forEach((operation, handle) => cancel(handle, operation));
    decoding.forEach((operation, handle) => cancel(handle, operation));
    for (let index = decodeQueue.length - 1; index >= 0; index -= 1) {
      const entry = decodeQueue[index]!;
      const demand = keep.get(entry.chunkHandle);
      if (demand?.lod === entry.lod && demand.revision === entry.revision) continue;
      entry.controller.abort(abortError());
      decodeQueue.splice(index, 1);
    }
  };

  return Object.freeze({
    setDesired: (nextWorldRevision, values) => {
      if (disposed) return;
      const normalized = values.map((row) => {
        const request = createGreaterRealmChunkRequest({
          chunkHandle: row.chunkHandle,
          lod: row.lod,
          expectedRevision: nextWorldRevision
        });
        return Object.freeze({
          chunkHandle: request.chunkHandle,
          lod: request.lod,
          priority: safePriority(row.distanceChunks),
          revision: request.expectedRevision
        });
      });
      if (new Set(normalized.map((row) => row.chunkHandle)).size !== normalized.length) {
        throw new Error('GREATER_REALM_CHUNK_DEMAND_DUPLICATE');
      }
      const bounded = normalized
        .sort((left, right) => (
          left.priority - right.priority || left.chunkHandle.localeCompare(right.chunkHandle)
        ))
        .slice(0, graphics.maximumResidentChunks);
      const nextRevision = bounded[0]?.revision
        ?? createGreaterRealmChunkRequest({
          chunkHandle: 'GRK-AAAAAAAAAAAAAAAAAAAAAAAAAA',
          lod: 0,
          expectedRevision: nextWorldRevision
        }).expectedRevision;
      const keep = new Map(bounded.map((row) => [row.chunkHandle, Object.freeze({
        priority: row.priority,
        lod: row.lod,
        revision: row.revision
      })] as const));
      if (revision !== undefined && revision !== nextRevision) {
        cancelStale();
        for (const handle of [...resident.keys()]) evict(handle);
      } else {
        cancelStale(keep);
      }
      revision = nextRevision;
      desired.clear();
      bounded.forEach((row) => desired.set(row.chunkHandle, Object.freeze({
        priority: row.priority,
        lod: row.lod,
        revision: row.revision
      })));
      for (const [handle, entry] of resident) {
        const demand = desired.get(handle);
        if (demand && (
          demand.lod !== entry.chunk.lod
          || demand.revision !== entry.chunk.revision
        )) evict(handle);
      }
      failed.clear();
      pumpDecode();
      pumpFetch();
    },
    getChunk: (chunkHandle) => {
      const entry = resident.get(chunkHandle);
      if (!entry || revision === undefined || entry.chunk.revision !== revision) {
        if (entry) evict(chunkHandle);
        return undefined;
      }
      entry.touched = ++touchSequence;
      return entry.chunk;
    },
    retryFailed: () => {
      if (disposed || failed.size === 0) return;
      failed.clear();
      pumpFetch();
    },
    awaitIdle: () => idle()
      ? Promise.resolve()
      : new Promise<void>((resolve) => idleWaiters.add(resolve)),
    getSnapshot: () => Object.freeze({
      disposed,
      desiredCount: desired.size,
      residentChunkCount: resident.size,
      residentCellCount,
      queuedFetchCount: [...desired.keys()].filter((handle) => (
        !alreadyResident(handle)
        && !fetching.has(handle)
        && !decoding.has(handle)
        && !queuedForDecode(handle)
        && !failed.has(handle)
      )).length,
      activeFetchCount: fetching.size,
      queuedDecodeCount: decodeQueue.length,
      activeDecodeCount: decoding.size,
      failedCount: failed.size,
      peakFetchConcurrency,
      peakDecodeConcurrency
    }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      desired.clear();
      cancelStale();
      decodeQueue.length = 0;
      for (const handle of [...resident.keys()]) evict(handle);
      failed.clear();
      settleIdle();
    }
  });
}

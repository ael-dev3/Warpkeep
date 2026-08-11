import {
  assertGreaterRealmChunkMatchesDescriptor,
  assertGreaterRealmResourceLocationBatchMatchesRequest,
  createGreaterRealmRoutePlanRequest,
  createGreaterRealmWindowRequest,
  GREATER_REALM_PUBLIC_LIMITS,
  type GreaterRealmBootstrapDto,
  type GreaterRealmChunkDto,
  type GreaterRealmLod,
  type GreaterRealmResourceKind,
  type GreaterRealmRoutePageDto,
  type GreaterRealmResourceLocationSummaryDto,
  type GreaterRealmWindowChunkDto,
  type GreaterRealmWindowDto
} from './greaterRealmPublicContract';
import {
  createGreaterRealmChunkStream,
  type GreaterRealmChunkStreamSnapshot
} from './greaterRealmChunkStream';
import {
  GREATER_REALM_GRAPHICS_BUDGETS,
  type GreaterRealmDeviceClass,
  type GreaterRealmGraphicsProfile
} from './greaterRealmRuntimePolicy';
import type { GreaterRealmPublicTransport } from './greaterRealmTransport';

export const GREATER_REALM_CLIENT_CELL_SIZE = 1 as const;
export const GREATER_REALM_RESOURCE_AFFORDANCES_PER_KIND = 6 as const;
export const GREATER_REALM_MAXIMUM_RESOURCE_AFFORDANCES = 24 as const;

/**
 * The server orders locations by caller-relative distance. Retaining that
 * order while taking at most six of each kind gives small clients a stable,
 * balanced control surface without recomputing or exposing private topology.
 */
export function selectGreaterRealmResourceAffordances(
  locations: readonly GreaterRealmResourceLocationSummaryDto[]
): readonly GreaterRealmResourceLocationSummaryDto[] {
  const counts: Record<GreaterRealmResourceKind, number> = {
    food: 0,
    wood: 0,
    stone: 0,
    gold: 0
  };
  return Object.freeze(locations.filter((location) => {
    const count = counts[location.resourceKind];
    if (count >= GREATER_REALM_RESOURCE_AFFORDANCES_PER_KIND) return false;
    counts[location.resourceKind] = count + 1;
    return true;
  }));
}

export type GreaterRealmClientPhase =
  | 'idle'
  | 'bootstrapping'
  | 'bootstrap-ready'
  | 'loading-window'
  | 'streaming-chunks'
  | 'ready'
  | 'failed'
  | 'disposed';

export type GreaterRealmClientFailureReason =
  | 'stale-generation'
  | 'bootstrap-failed'
  | 'window-failed'
  | 'chunk-load-failed';

export type GreaterRealmResourceLocationPhase =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'failed';

export type GreaterRealmClientViewRequest = Readonly<{
  centerQ: number;
  centerR: number;
  radius: number;
  lod: GreaterRealmLod;
}>;

export type GreaterRealmClientRouteRequest = Readonly<{
  originCellKey: string;
  destinationCellKey: string;
  offset: number;
  limit: number;
}>;

export type GreaterRealmClientViewChunk = Readonly<{
  chunk: GreaterRealmChunkDto;
  distanceChunks: number;
}>;

export type GreaterRealmClientSnapshot = Readonly<{
  phase: GreaterRealmClientPhase;
  sessionGeneration: number;
  deviceClass: GreaterRealmDeviceClass;
  graphicsProfile: GreaterRealmGraphicsProfile;
  cellSize: typeof GREATER_REALM_CLIENT_CELL_SIZE;
  bootstrap?: GreaterRealmBootstrapDto;
  window?: GreaterRealmWindowDto;
  view?: GreaterRealmClientViewRequest;
  chunks: readonly GreaterRealmClientViewChunk[];
  selectedChunkCount: number;
  resourceLocationPhase: GreaterRealmResourceLocationPhase;
  resourceLocations: readonly GreaterRealmResourceLocationSummaryDto[];
  resourceLocationsTruncated: boolean;
  stream: GreaterRealmChunkStreamSnapshot;
  failureReason?: GreaterRealmClientFailureReason;
}>;

export type GreaterRealmClientRuntime = Readonly<{
  getSnapshot: () => GreaterRealmClientSnapshot;
  subscribe: (listener: (snapshot: GreaterRealmClientSnapshot) => void) => () => void;
  /** Authenticate and validate only the bounded public release header. */
  bootstrap: () => Promise<GreaterRealmClientSnapshot>;
  loadView: (view: GreaterRealmClientViewRequest) => Promise<GreaterRealmClientSnapshot>;
  refreshRelease: (
    view?: GreaterRealmClientViewRequest
  ) => Promise<GreaterRealmClientSnapshot>;
  retryFailedChunks: () => Promise<GreaterRealmClientSnapshot>;
  planRoute: (
    request: GreaterRealmClientRouteRequest,
    signal?: AbortSignal
  ) => Promise<GreaterRealmRoutePageDto>;
  dispose: () => void;
}>;

export type CreateGreaterRealmClientRuntimeOptions = Readonly<{
  sessionGeneration: number;
  isSessionCurrent: () => boolean;
  transport: GreaterRealmPublicTransport;
  deviceClass: GreaterRealmDeviceClass;
  graphicsProfile: GreaterRealmGraphicsProfile;
}>;

export class GreaterRealmClientRuntimeError extends Error {
  constructor(readonly code: GreaterRealmClientFailureReason | 'route-failed' | 'disposed') {
    super(code);
    this.name = 'GreaterRealmClientRuntimeError';
  }
}

function cancellation(message: string) {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function isCancellation(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function normalizeView(value: GreaterRealmClientViewRequest): GreaterRealmClientViewRequest {
  const request = createGreaterRealmWindowRequest({
    centerQ: value.centerQ,
    centerR: value.centerR,
    radius: value.radius,
    expectedRevision: 0n
  });
  if (![0, 1, 2, 3].includes(value.lod)) {
    throw new GreaterRealmClientRuntimeError('window-failed');
  }
  return Object.freeze({
    centerQ: request.centerQ,
    centerR: request.centerR,
    radius: request.radius,
    lod: value.lod
  });
}

function chunkDistance(
  descriptor: GreaterRealmWindowChunkDto,
  view: GreaterRealmClientViewRequest
) {
  const deltaQ = descriptor.binQ - view.centerQ;
  const deltaR = descriptor.binR - view.centerR;
  return Math.max(Math.abs(deltaQ), Math.abs(deltaR), Math.abs(deltaQ + deltaR));
}

/**
 * Public-data-only v17 session controller. Provider code creates one instance
 * per authenticated socket generation; reconnects and identity changes must
 * replace it rather than transplanting its bootstrap, routes, or chunk cache.
 */
export function createGreaterRealmClientRuntime(
  options: CreateGreaterRealmClientRuntimeOptions
): GreaterRealmClientRuntime {
  if (!Number.isSafeInteger(options.sessionGeneration) || options.sessionGeneration < 1) {
    throw new GreaterRealmClientRuntimeError('stale-generation');
  }

  let disposed = false;
  let phase: GreaterRealmClientPhase = 'idle';
  let failureReason: GreaterRealmClientFailureReason | undefined;
  let bootstrap: GreaterRealmBootstrapDto | undefined;
  let windowDto: GreaterRealmWindowDto | undefined;
  let view: GreaterRealmClientViewRequest | undefined;
  let selectedDescriptors: readonly GreaterRealmWindowChunkDto[] = Object.freeze([]);
  let resourceLocationPhase: GreaterRealmResourceLocationPhase = 'idle';
  let resourceLocations: readonly GreaterRealmResourceLocationSummaryDto[] = Object.freeze([]);
  let resourceLocationsTruncated = false;
  let snapshot: GreaterRealmClientSnapshot;
  let requestSequence = 0;
  let releaseSequence = 0;
  let bootstrapController: AbortController | undefined;
  let bootstrapPromise: Promise<GreaterRealmBootstrapDto> | undefined;
  let windowController: AbortController | undefined;
  let resourceLocationController: AbortController | undefined;
  let routeController: AbortController | undefined;
  const loaded = new Map<string, GreaterRealmChunkDto>();
  const listeners = new Set<(value: GreaterRealmClientSnapshot) => void>();

  const sessionCurrent = () => !disposed && options.isSessionCurrent();
  const assertSessionCurrent = () => {
    if (disposed) throw new GreaterRealmClientRuntimeError('disposed');
    if (!options.isSessionCurrent()) {
      throw new GreaterRealmClientRuntimeError('stale-generation');
    }
  };
  const selectedDistance = (descriptor: GreaterRealmWindowChunkDto) => (
    view === undefined ? Number.MAX_SAFE_INTEGER : chunkDistance(descriptor, view)
  );
  const currentChunks = () => Object.freeze(selectedDescriptors.flatMap((descriptor) => {
    const chunk = loaded.get(descriptor.chunkHandle);
    return chunk === undefined ? [] : [Object.freeze({
      chunk,
      distanceChunks: selectedDistance(descriptor)
    })];
  }));

  const stream = createGreaterRealmChunkStream({
    deviceClass: options.deviceClass,
    graphicsProfile: options.graphicsProfile,
    fetchChunk: (request, signal) => options.transport.getChunk(request, signal),
    onChunkReady: (chunk) => {
      assertSessionCurrent();
      const descriptor = selectedDescriptors.find((row) => (
        row.chunkHandle === chunk.chunkHandle
      ));
      if (descriptor === undefined) {
        throw new Error('GREATER_REALM_CHUNK_OUTSIDE_CURRENT_WINDOW');
      }
      assertGreaterRealmChunkMatchesDescriptor(chunk, descriptor);
      loaded.set(chunk.chunkHandle, chunk);
      publish();
    },
    onChunkEvicted: (chunk) => {
      if (loaded.get(chunk.chunkHandle) === chunk) loaded.delete(chunk.chunkHandle);
      if (!disposed) publish();
    },
    onError: () => {
      if (sessionCurrent()) {
        failureReason = 'chunk-load-failed';
        publish();
      }
    }
  });

  function buildSnapshot(): GreaterRealmClientSnapshot {
    return Object.freeze({
      phase,
      sessionGeneration: options.sessionGeneration,
      deviceClass: options.deviceClass,
      graphicsProfile: options.graphicsProfile,
      cellSize: GREATER_REALM_CLIENT_CELL_SIZE,
      ...(bootstrap === undefined ? {} : { bootstrap }),
      ...(windowDto === undefined ? {} : { window: windowDto }),
      ...(view === undefined ? {} : { view }),
      chunks: currentChunks(),
      selectedChunkCount: selectedDescriptors.length,
      resourceLocationPhase,
      resourceLocations,
      resourceLocationsTruncated,
      stream: stream.getSnapshot(),
      ...(failureReason === undefined ? {} : { failureReason })
    });
  }

  function publish() {
    snapshot = buildSnapshot();
    for (const listener of listeners) {
      try {
        listener(snapshot);
      } catch {
        // A presentation subscriber cannot corrupt cache or lifecycle authority.
      }
    }
  }

  snapshot = buildSnapshot();

  const fail = (
    reason: GreaterRealmClientFailureReason,
    sequence: number
  ): GreaterRealmClientSnapshot => {
    if (disposed || sequence !== requestSequence) return snapshot;
    phase = 'failed';
    failureReason = reason;
    if (
      reason === 'stale-generation'
      || reason === 'bootstrap-failed'
      || reason === 'window-failed'
    ) {
      windowController?.abort(cancellation('GREATER_REALM_GENERATION_REPLACED'));
      resourceLocationController?.abort(cancellation('GREATER_REALM_GENERATION_REPLACED'));
      routeController?.abort(cancellation('GREATER_REALM_GENERATION_REPLACED'));
      windowDto = undefined;
      loaded.clear();
      selectedDescriptors = Object.freeze([]);
      resourceLocationPhase = 'idle';
      resourceLocations = Object.freeze([]);
      resourceLocationsTruncated = false;
      stream.setDesired(bootstrap?.revision ?? 0n, []);
    }
    publish();
    return snapshot;
  };

  const ensureBootstrap = async (): Promise<GreaterRealmBootstrapDto> => {
    assertSessionCurrent();
    if (bootstrap !== undefined) return bootstrap;
    if (bootstrapPromise !== undefined) return bootstrapPromise;
    phase = 'bootstrapping';
    failureReason = undefined;
    publish();
    const controller = new AbortController();
    const expectedReleaseSequence = releaseSequence;
    bootstrapController = controller;
    const pending = options.transport.getBootstrap(controller.signal).then((value) => {
      assertSessionCurrent();
      if (
        controller.signal.aborted
        || releaseSequence !== expectedReleaseSequence
      ) throw cancellation('GREATER_REALM_RELEASE_SUPERSEDED');
      if (value.revision <= 0n) {
        throw new GreaterRealmClientRuntimeError('bootstrap-failed');
      }
      bootstrap = value;
      return value;
    }).finally(() => {
      if (bootstrapController === controller) bootstrapController = undefined;
      if (bootstrapPromise === pending) bootstrapPromise = undefined;
    });
    bootstrapPromise = pending;
    return pending;
  };

  const finishChunkLoad = async (sequence: number) => {
    await stream.awaitIdle();
    if (disposed || sequence !== requestSequence) return snapshot;
    try {
      assertSessionCurrent();
    } catch {
      return fail('stale-generation', sequence);
    }
    for (const descriptor of selectedDescriptors) {
      const resident = stream.getChunk(descriptor.chunkHandle);
      if (resident !== undefined) loaded.set(descriptor.chunkHandle, resident);
    }
    const streamSnapshot = stream.getSnapshot();
    const complete = selectedDescriptors.every((descriptor) => (
      loaded.get(descriptor.chunkHandle) !== undefined
    ));
    if (!complete || streamSnapshot.failedCount > 0) {
      return fail('chunk-load-failed', sequence);
    }
    phase = 'ready';
    failureReason = undefined;
    publish();
    return snapshot;
  };

  const bootstrapRelease = async () => {
    const sequence = ++requestSequence;
    try {
      await ensureBootstrap();
      if (disposed || sequence !== requestSequence) return snapshot;
      assertSessionCurrent();
      phase = 'bootstrap-ready';
      failureReason = undefined;
      publish();
      return snapshot;
    } catch (error) {
      if (disposed || sequence !== requestSequence || isCancellation(error)) return snapshot;
      if (!options.isSessionCurrent()) return fail('stale-generation', sequence);
      return fail('bootstrap-failed', sequence);
    }
  };

  const loadView = async (
    requestedView: GreaterRealmClientViewRequest
  ): Promise<GreaterRealmClientSnapshot> => {
    const normalizedView = normalizeView(requestedView);
    const sequence = ++requestSequence;
    windowController?.abort(cancellation('GREATER_REALM_WINDOW_SUPERSEDED'));
    resourceLocationController?.abort(cancellation('GREATER_REALM_WINDOW_SUPERSEDED'));
    windowController = undefined;
    resourceLocationController = undefined;
    resourceLocationPhase = 'idle';
    resourceLocations = Object.freeze([]);
    resourceLocationsTruncated = false;
    try {
      const release = await ensureBootstrap();
      if (disposed || sequence !== requestSequence) return snapshot;
      assertSessionCurrent();
      const controller = new AbortController();
      windowController = controller;
      phase = 'loading-window';
      failureReason = undefined;
      publish();
      const nextWindow = await options.transport.getWindow({
        centerQ: normalizedView.centerQ,
        centerR: normalizedView.centerR,
        radius: normalizedView.radius,
        expectedRevision: release.revision
      }, controller.signal);
      if (disposed || sequence !== requestSequence || controller.signal.aborted) return snapshot;
      assertSessionCurrent();
      if (nextWindow.atlasId !== release.atlasId || nextWindow.revision !== release.revision) {
        throw new GreaterRealmClientRuntimeError('window-failed');
      }
      const visibleLimit = GREATER_REALM_GRAPHICS_BUDGETS[
        options.graphicsProfile
      ].maximumVisibleChunks;
      const selected = Object.freeze([...nextWindow.chunks]
        .sort((left, right) => (
          chunkDistance(left, normalizedView) - chunkDistance(right, normalizedView)
          || left.chunkHandle.localeCompare(right.chunkHandle)
        ))
        .slice(0, visibleLimit));
      windowDto = nextWindow;
      view = normalizedView;
      selectedDescriptors = selected;
      loaded.clear();
      const resourceHandles = selected
        .slice(0, GREATER_REALM_PUBLIC_LIMITS.maximumResourceLocationChunkHandles)
        .map(descriptor => descriptor.chunkHandle);
      if (resourceHandles.length === 0) {
        resourceLocationPhase = 'ready';
      } else {
        const resourceController = new AbortController();
        resourceLocationController = resourceController;
        resourceLocationPhase = 'loading';
        const resourceRequest = Object.freeze({
          expectedRevision: release.revision,
          chunkHandles: Object.freeze(resourceHandles)
        });
        void Promise.resolve().then(() => options.transport.getResourceLocations(
          resourceRequest,
          resourceController.signal
        )).then((batch) => {
          if (
            disposed
            || sequence !== requestSequence
            || resourceController.signal.aborted
            || !options.isSessionCurrent()
          ) return;
          assertSessionCurrent();
          assertGreaterRealmResourceLocationBatchMatchesRequest(
            batch,
            resourceRequest,
            release.atlasId,
            selected
          );
          const affordances = selectGreaterRealmResourceAffordances(
            batch.resourceLocations
          );
          resourceLocations = affordances;
          resourceLocationsTruncated = batch.truncated
            || batch.resourceLocations.length > affordances.length
            || selected.length > resourceHandles.length;
          resourceLocationPhase = 'ready';
          publish();
        }).catch((error: unknown) => {
          if (
            disposed
            || sequence !== requestSequence
            || isCancellation(error)
            || resourceController.signal.aborted
            || !options.isSessionCurrent()
          ) return;
          resourceLocations = Object.freeze([]);
          resourceLocationsTruncated = false;
          resourceLocationPhase = 'failed';
          publish();
        }).finally(() => {
          if (resourceLocationController === resourceController) {
            resourceLocationController = undefined;
          }
        });
      }
      phase = 'streaming-chunks';
      failureReason = undefined;
      stream.setDesired(release.revision, selected.map((descriptor) => ({
        chunkHandle: descriptor.chunkHandle,
        distanceChunks: chunkDistance(descriptor, normalizedView),
        lod: normalizedView.lod
      })));
      for (const descriptor of selected) {
        const resident = stream.getChunk(descriptor.chunkHandle);
        if (resident !== undefined) loaded.set(descriptor.chunkHandle, resident);
      }
      publish();
      return await finishChunkLoad(sequence);
    } catch (error) {
      if (disposed || sequence !== requestSequence || isCancellation(error)) return snapshot;
      if (!options.isSessionCurrent()) return fail('stale-generation', sequence);
      return fail(bootstrap === undefined ? 'bootstrap-failed' : 'window-failed', sequence);
    }
  };

  const refreshRelease = async (
    requestedView: GreaterRealmClientViewRequest | undefined = view
  ) => {
    if (disposed) return snapshot;
    if (requestedView === undefined) return snapshot;
    ++requestSequence;
    releaseSequence += 1;
    bootstrapController?.abort(cancellation('GREATER_REALM_RELEASE_REFRESHED'));
    windowController?.abort(cancellation('GREATER_REALM_RELEASE_REFRESHED'));
    resourceLocationController?.abort(cancellation('GREATER_REALM_RELEASE_REFRESHED'));
    routeController?.abort(cancellation('GREATER_REALM_RELEASE_REFRESHED'));
    bootstrapController = undefined;
    bootstrapPromise = undefined;
    windowController = undefined;
    resourceLocationController = undefined;
    routeController = undefined;
    bootstrap = undefined;
    windowDto = undefined;
    selectedDescriptors = Object.freeze([]);
    loaded.clear();
    resourceLocationPhase = 'idle';
    resourceLocations = Object.freeze([]);
    resourceLocationsTruncated = false;
    stream.setDesired(0n, []);
    phase = 'idle';
    failureReason = undefined;
    publish();
    return loadView(requestedView);
  };

  const retryFailedChunks = async () => {
    assertSessionCurrent();
    if (disposed || windowDto === undefined || bootstrap === undefined) return snapshot;
    const sequence = requestSequence;
    phase = 'streaming-chunks';
    failureReason = undefined;
    stream.retryFailed();
    publish();
    return finishChunkLoad(sequence);
  };

  const planRoute = async (
    requested: GreaterRealmClientRouteRequest,
    externalSignal?: AbortSignal
  ): Promise<GreaterRealmRoutePageDto> => {
    assertSessionCurrent();
    routeController?.abort(cancellation('GREATER_REALM_ROUTE_SUPERSEDED'));
    const controller = new AbortController();
    routeController = controller;
    const forwardAbort = () => controller.abort(
      externalSignal?.reason ?? cancellation('GREATER_REALM_ROUTE_CANCELLED')
    );
    if (externalSignal?.aborted) forwardAbort();
    else externalSignal?.addEventListener('abort', forwardAbort, { once: true });
    try {
      if (controller.signal.aborted) throw cancellation('GREATER_REALM_ROUTE_CANCELLED');
      const release = await ensureBootstrap();
      assertSessionCurrent();
      if (controller.signal.aborted) throw cancellation('GREATER_REALM_ROUTE_CANCELLED');
      const request = createGreaterRealmRoutePlanRequest({
        ...requested,
        expectedRevision: release.revision
      });
      const page = await options.transport.planRoute(request, controller.signal);
      assertSessionCurrent();
      if (controller.signal.aborted || routeController !== controller) {
        throw cancellation('GREATER_REALM_ROUTE_SUPERSEDED');
      }
      return page;
    } catch (error) {
      if (isCancellation(error)) throw error;
      if (!options.isSessionCurrent()) {
        throw new GreaterRealmClientRuntimeError('stale-generation');
      }
      throw new GreaterRealmClientRuntimeError('route-failed');
    } finally {
      externalSignal?.removeEventListener('abort', forwardAbort);
      if (routeController === controller) routeController = undefined;
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    requestSequence += 1;
    releaseSequence += 1;
    bootstrapController?.abort(cancellation('GREATER_REALM_CLIENT_DISPOSED'));
    windowController?.abort(cancellation('GREATER_REALM_CLIENT_DISPOSED'));
    resourceLocationController?.abort(cancellation('GREATER_REALM_CLIENT_DISPOSED'));
    routeController?.abort(cancellation('GREATER_REALM_CLIENT_DISPOSED'));
    bootstrapController = undefined;
    windowController = undefined;
    resourceLocationController = undefined;
    routeController = undefined;
    bootstrapPromise = undefined;
    stream.dispose();
    loaded.clear();
    selectedDescriptors = Object.freeze([]);
    resourceLocationPhase = 'idle';
    resourceLocations = Object.freeze([]);
    resourceLocationsTruncated = false;
    phase = 'disposed';
    failureReason = undefined;
    publish();
    listeners.clear();
  };

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listener(snapshot);
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    bootstrap: bootstrapRelease,
    loadView,
    refreshRelease,
    retryFailedChunks,
    planRoute,
    dispose
  });
}

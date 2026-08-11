import {
  createGreaterRealmChunkRequest,
  createGreaterRealmRoutePlanRequest,
  createGreaterRealmWindowRequest,
  decodeGreaterRealmBootstrapDto,
  decodeGreaterRealmChunkDto,
  decodeGreaterRealmRoutePageDto,
  decodeGreaterRealmWindowDto,
  type GreaterRealmBootstrapDto,
  type GreaterRealmChunkDto,
  type GreaterRealmChunkRequest,
  type GreaterRealmRoutePageDto,
  type GreaterRealmRoutePlanRequest,
  type GreaterRealmWindowDto,
  type GreaterRealmWindowRequest
} from './greaterRealmPublicContract';

/** Closed until the additive v17 server contract and production postflight exist. */
export const GREATER_REALM_SERVER_PRESENTATION_ALLOWED = false as const;

export const GREATER_REALM_PUBLIC_PROCEDURES = Object.freeze({
  bootstrap: 'get_realm_atlas_bootstrap_v1',
  window: 'get_realm_atlas_window_v1',
  chunk: 'get_realm_atlas_chunk_v1',
  planRoute: 'plan_realm_route_v1',
  workerControlState: 'get_my_worker_control_state_v2'
});

export type GreaterRealmProcedureInvoker = Readonly<{
  call: (
    procedure: string,
    input: Readonly<Record<string, unknown>>,
    signal: AbortSignal
  ) => Promise<unknown>;
}>;

export type GreaterRealmPublicTransport = Readonly<{
  getBootstrap: (signal: AbortSignal) => Promise<GreaterRealmBootstrapDto>;
  getWindow: (
    request: GreaterRealmWindowRequest,
    signal: AbortSignal
  ) => Promise<GreaterRealmWindowDto>;
  getChunk: (
    request: GreaterRealmChunkRequest,
    signal: AbortSignal
  ) => Promise<GreaterRealmChunkDto>;
  planRoute: (
    request: GreaterRealmRoutePlanRequest,
    signal: AbortSignal
  ) => Promise<GreaterRealmRoutePageDto>;
}>;

export class GreaterRealmTransportUnavailableError extends Error {
  readonly code = 'GREATER_REALM_SERVER_V17_REQUIRED';

  constructor() {
    super('GREATER_REALM_SERVER_V17_REQUIRED');
    this.name = 'GreaterRealmTransportUnavailableError';
  }
}

function unavailable<T>(signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return Promise.reject(new GreaterRealmTransportUnavailableError());
}

function ensureNotAborted(signal: AbortSignal) {
  if (signal.aborted) throw signal.reason;
}

/**
 * Procedure-facing seam for v17. While the literal gate is closed, a supplied
 * invoker is unreachable and current production behavior remains inert.
 */
export function createGreaterRealmProcedureTransport(
  invoker: GreaterRealmProcedureInvoker
): GreaterRealmPublicTransport {
  return Object.freeze({
    getBootstrap: async (signal) => {
      if (!GREATER_REALM_SERVER_PRESENTATION_ALLOWED) return unavailable(signal);
      ensureNotAborted(signal);
      const decoded = decodeGreaterRealmBootstrapDto(await invoker.call(
        GREATER_REALM_PUBLIC_PROCEDURES.bootstrap,
        Object.freeze({}),
        signal
      ));
      ensureNotAborted(signal);
      return decoded;
    },
    getWindow: async (requested, signal) => {
      if (!GREATER_REALM_SERVER_PRESENTATION_ALLOWED) return unavailable(signal);
      const request = createGreaterRealmWindowRequest(requested);
      ensureNotAborted(signal);
      const decoded = decodeGreaterRealmWindowDto(await invoker.call(
        GREATER_REALM_PUBLIC_PROCEDURES.window,
        request,
        signal
      ));
      ensureNotAborted(signal);
      if (
        decoded.revision !== request.expectedRevision
        || decoded.centerQ !== request.centerQ
        || decoded.centerR !== request.centerR
        || decoded.radius !== request.radius
      ) throw new Error('GREATER_REALM_WINDOW_RESPONSE_MISMATCH');
      return decoded;
    },
    getChunk: async (requested, signal) => {
      if (!GREATER_REALM_SERVER_PRESENTATION_ALLOWED) return unavailable(signal);
      const request = createGreaterRealmChunkRequest(requested);
      ensureNotAborted(signal);
      const decoded = decodeGreaterRealmChunkDto(await invoker.call(
        GREATER_REALM_PUBLIC_PROCEDURES.chunk,
        request,
        signal
      ));
      ensureNotAborted(signal);
      if (
        decoded.chunkHandle !== request.chunkHandle
        || decoded.lod !== request.lod
        || decoded.revision !== request.expectedRevision
      ) throw new Error('GREATER_REALM_CHUNK_RESPONSE_MISMATCH');
      return decoded;
    },
    planRoute: async (requested, signal) => {
      if (!GREATER_REALM_SERVER_PRESENTATION_ALLOWED) return unavailable(signal);
      const request = createGreaterRealmRoutePlanRequest(requested);
      ensureNotAborted(signal);
      const decoded = decodeGreaterRealmRoutePageDto(await invoker.call(
        GREATER_REALM_PUBLIC_PROCEDURES.planRoute,
        request,
        signal
      ));
      ensureNotAborted(signal);
      const pageEnd = request.offset + decoded.cells.length;
      if (
        decoded.revision !== request.expectedRevision
        || decoded.cells.length > request.limit
        || pageEnd > decoded.totalLength
        || (request.offset === 0
          && decoded.cells[0]?.cellKey !== request.originCellKey)
        || (decoded.complete
          && decoded.cells.at(-1)?.cellKey !== request.destinationCellKey)
        || (decoded.complete
          ? pageEnd !== decoded.totalLength
          : decoded.nextOffset !== pageEnd)
      ) throw new Error('GREATER_REALM_ROUTE_PLAN_RESPONSE_MISMATCH');
      return decoded;
    }
  });
}

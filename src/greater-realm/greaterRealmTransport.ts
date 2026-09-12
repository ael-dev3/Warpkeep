import {
  assertGreaterRealmRoutePageMatchesRequest,
  assertGreaterRealmResourceLocationBatchMatchesRequest,
  createGreaterRealmChunkRequest,
  createGreaterRealmResourceLocationRequest,
  createGreaterRealmRoutePlanRequest,
  createGreaterRealmWindowRequest,
  decodeGreaterRealmBootstrapDto,
  decodeGreaterRealmChunkDto,
  decodeGreaterRealmResourceLocationBatchDto,
  decodeGreaterRealmRoutePageDto,
  decodeGreaterRealmWindowDto,
  type GreaterRealmBootstrapDto,
  type GreaterRealmChunkDto,
  type GreaterRealmChunkRequest,
  type GreaterRealmResourceLocationBatchDto,
  type GreaterRealmResourceLocationRequest,
  type GreaterRealmRoutePageDto,
  type GreaterRealmRoutePlanRequest,
  type GreaterRealmWindowDto,
  type GreaterRealmWindowRequest
} from './greaterRealmPublicContract';
import {
  isCurrentPtrRealmAuthority,
  type PtrRealmAuthority
} from '../ptr/ptrRealmAuthClient';

/** Closed until the additive v17 server contract and production postflight exist. */
export const GREATER_REALM_SERVER_PRESENTATION_ALLOWED = false as const;

export const GREATER_REALM_PUBLIC_PROCEDURES = Object.freeze({
  bootstrap: 'get_realm_atlas_bootstrap_v1',
  window: 'get_realm_atlas_window_v1',
  chunk: 'get_realm_atlas_chunk_v1',
  resourceLocations: 'get_realm_atlas_resource_locations_v1',
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
  getResourceLocations: (
    request: GreaterRealmResourceLocationRequest,
    signal: AbortSignal
  ) => Promise<GreaterRealmResourceLocationBatchDto>;
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
function createGreaterRealmProcedureTransportForAuthority(
  invoker: GreaterRealmProcedureInvoker,
  presentationAllowed: () => boolean
): GreaterRealmPublicTransport {
  let atlasContext: Readonly<{ atlasId: string; revision: bigint }> | undefined;
  const assertContextRevision = (expectedRevision: bigint) => {
    if (atlasContext && atlasContext.revision !== expectedRevision) {
      throw new Error('GREATER_REALM_ATLAS_CONTEXT_MISMATCH');
    }
  };
  return Object.freeze({
    getBootstrap: async (signal) => {
      if (!presentationAllowed()) return unavailable(signal);
      ensureNotAborted(signal);
      const decoded = decodeGreaterRealmBootstrapDto(await invoker.call(
        GREATER_REALM_PUBLIC_PROCEDURES.bootstrap,
        Object.freeze({}),
        signal
      ));
      ensureNotAborted(signal);
      atlasContext = Object.freeze({ atlasId: decoded.atlasId, revision: decoded.revision });
      return decoded;
    },
    getWindow: async (requested, signal) => {
      if (!presentationAllowed()) return unavailable(signal);
      const request = createGreaterRealmWindowRequest(requested);
      assertContextRevision(request.expectedRevision);
      ensureNotAborted(signal);
      const decoded = decodeGreaterRealmWindowDto(await invoker.call(
        GREATER_REALM_PUBLIC_PROCEDURES.window,
        request,
        signal
      ));
      ensureNotAborted(signal);
      if (
        decoded.revision !== request.expectedRevision
        || (atlasContext !== undefined && decoded.atlasId !== atlasContext.atlasId)
        || decoded.centerQ !== request.centerQ
        || decoded.centerR !== request.centerR
        || decoded.radius !== request.radius
      ) throw new Error('GREATER_REALM_WINDOW_RESPONSE_MISMATCH');
      return decoded;
    },
    getChunk: async (requested, signal) => {
      if (!presentationAllowed()) return unavailable(signal);
      const request = createGreaterRealmChunkRequest(requested);
      assertContextRevision(request.expectedRevision);
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
        || (atlasContext !== undefined && decoded.atlasId !== atlasContext.atlasId)
      ) throw new Error('GREATER_REALM_CHUNK_RESPONSE_MISMATCH');
      return decoded;
    },
    getResourceLocations: async (requested, signal) => {
      if (!presentationAllowed()) return unavailable(signal);
      const request = createGreaterRealmResourceLocationRequest(requested);
      assertContextRevision(request.expectedRevision);
      ensureNotAborted(signal);
      const decoded = decodeGreaterRealmResourceLocationBatchDto(await invoker.call(
        GREATER_REALM_PUBLIC_PROCEDURES.resourceLocations,
        request,
        signal
      ));
      ensureNotAborted(signal);
      assertGreaterRealmResourceLocationBatchMatchesRequest(
        decoded,
        request,
        atlasContext?.atlasId
      );
      return decoded;
    },
    planRoute: async (requested, signal) => {
      if (!presentationAllowed()) return unavailable(signal);
      const request = createGreaterRealmRoutePlanRequest(requested);
      assertContextRevision(request.expectedRevision);
      ensureNotAborted(signal);
      const decoded = decodeGreaterRealmRoutePageDto(await invoker.call(
        GREATER_REALM_PUBLIC_PROCEDURES.planRoute,
        request,
        signal
      ));
      ensureNotAborted(signal);
      assertGreaterRealmRoutePageMatchesRequest(decoded, request, atlasContext?.atlasId);
      return decoded;
    }
  });
}

export function createGreaterRealmProcedureTransport(
  invoker: GreaterRealmProcedureInvoker
): GreaterRealmPublicTransport {
  return createGreaterRealmProcedureTransportForAuthority(
    invoker,
    () => GREATER_REALM_SERVER_PRESENTATION_ALLOWED
  );
}

/**
 * PTR does not open the Genesis v17 gate. Its independent transport becomes
 * callable only while the exact server-issued, memory-branded owner authority
 * remains current; structural lookalikes and expired authorities stay inert.
 */
export function createPtrGreaterRealmProcedureTransport(
  invoker: GreaterRealmProcedureInvoker,
  authority: PtrRealmAuthority
): GreaterRealmPublicTransport {
  return createGreaterRealmProcedureTransportForAuthority(
    invoker,
    () => isCurrentPtrRealmAuthority(authority)
  );
}

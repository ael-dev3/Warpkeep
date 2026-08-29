import { createGreaterRealmClientRuntime } from '../greater-realm/greaterRealmClientRuntime';
import type {
  GreaterRealmChunkRequest,
  GreaterRealmResourceLocationRequest,
  GreaterRealmRoutePlanRequest,
  GreaterRealmWindowRequest,
} from '../greater-realm/greaterRealmPublicContract';
import {
  createPtrGreaterRealmProcedureTransport,
  type GreaterRealmPublicTransport,
} from '../greater-realm/greaterRealmTransport';
import type { GreaterRealmProviderBridge } from '../spacetime/greaterRealmProviderBridge';
import {
  isCurrentPtrRealmAuthority,
  type PtrRealmAuthority,
} from './ptrRealmAuthClient';
import {
  createPtrRealmProcedureInvoker,
  isCurrentPtrRealmConnectionSession,
  reportPtrRealmTransportFailure,
  type PtrRealmConnectionSession,
} from './ptrRealmConnection';

export type PtrRealmViewAnchor = Readonly<{
  castleId: number;
  q: number;
  r: number;
}>;

const preflightedSessions = new WeakMap<object, PtrRealmAuthority>();

function presentationUnavailable() {
  return new Error('PTR realm presentation is unavailable.');
}

function createSessionBoundTransport(
  session: PtrRealmConnectionSession,
  authority: PtrRealmAuthority,
  now: () => number,
): GreaterRealmPublicTransport {
  const transport = createPtrGreaterRealmProcedureTransport(
    createPtrRealmProcedureInvoker(session, authority, now),
    authority,
  );
  const requireCurrent = () => {
    if (
      !isCurrentPtrRealmAuthority(authority, now())
      || !isCurrentPtrRealmConnectionSession(session, authority, now())
    ) throw presentationUnavailable();
  };
  const guarded = async <T>(
    signal: AbortSignal,
    operation: () => Promise<T>,
  ): Promise<T> => {
    try {
      requireCurrent();
      if (signal.aborted) throw presentationUnavailable();
      const value = await operation();
      requireCurrent();
      if (signal.aborted) throw presentationUnavailable();
      return value;
    } catch {
      if (!signal.aborted) reportPtrRealmTransportFailure(session);
      throw presentationUnavailable();
    }
  };
  return Object.freeze({
    getBootstrap: signal => guarded(signal, () => transport.getBootstrap(signal)),
    getWindow: (request: GreaterRealmWindowRequest, signal) => guarded(
      signal,
      () => transport.getWindow(request, signal),
    ),
    getChunk: (request: GreaterRealmChunkRequest, signal) => guarded(
      signal,
      () => transport.getChunk(request, signal),
    ),
    getResourceLocations: (
      request: GreaterRealmResourceLocationRequest,
      signal,
    ) => guarded(signal, () => transport.getResourceLocations(request, signal)),
    planRoute: (request: GreaterRealmRoutePlanRequest, signal) => guarded(
      signal,
      () => transport.planRoute(request, signal),
    ),
  });
}

export async function preflightPtrRealmView(
  session: PtrRealmConnectionSession,
  authority: PtrRealmAuthority,
  signal: AbortSignal,
  now: () => number = Date.now,
): Promise<PtrRealmViewAnchor> {
  try {
    const bootstrap = await createSessionBoundTransport(
      session,
      authority,
      now,
    ).getBootstrap(signal);
    const castleId = Number(bootstrap.myCastleId);
    if (
      !Number.isSafeInteger(castleId)
      || castleId < 1
      || castleId !== authority.fid
    ) throw presentationUnavailable();
    preflightedSessions.set(session, authority);
    return Object.freeze({
      castleId,
      q: bootstrap.myAtlasQ,
      r: bootstrap.myAtlasR,
    });
  } catch {
    if (!signal.aborted) reportPtrRealmTransportFailure(session);
    throw presentationUnavailable();
  }
}

export function createPtrGreaterRealmProviderBridge(
  session: PtrRealmConnectionSession,
  authority: PtrRealmAuthority,
  now: () => number = Date.now,
): GreaterRealmProviderBridge {
  if (
    preflightedSessions.get(session) !== authority
    || !isCurrentPtrRealmConnectionSession(session, authority, now())
  ) {
    return Object.freeze({
      phase: 'dormant',
      reason: 'connection-unavailable',
      presentationAllowed: false,
    });
  }
  return Object.freeze({
    phase: 'available',
    presentationAllowed: true,
    sessionGeneration: session.generation,
    createRuntime: ({ deviceClass, graphicsProfile }) => {
      if (!isCurrentPtrRealmConnectionSession(session, authority, now())) {
        throw presentationUnavailable();
      }
      return createGreaterRealmClientRuntime({
        sessionGeneration: session.generation,
        isSessionCurrent: () => isCurrentPtrRealmConnectionSession(
          session,
          authority,
          now(),
        ),
        transport: createSessionBoundTransport(session, authority, now),
        deviceClass,
        graphicsProfile,
      });
    },
  });
}

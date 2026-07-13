import type {
  FarcasterAuthError,
  FarcasterAuthViewState,
  FarcasterQrState,
  PublicFarcasterIdentity,
  VerifiedFarcasterIdentity
} from './farcasterAuthTypes';

export type FarcasterRememberedMachineSession = Readonly<{
  /** Compatibility-only input; browser storage restoration is retired. */
  identity: VerifiedFarcasterIdentity;
  expiresAt: number;
  sessionExpiresAt?: number;
}>;

export type FarcasterAuthMachineState = Readonly<{
  /**
   * Monotonic request generation. Async work must carry the generation it
   * started under so late results can be ignored after cancel or retry.
   */
  generation: number;
  /** Proof-free state that is safe to expose to presentation components. */
  view: FarcasterAuthViewState;
}>;

export type FarcasterAuthMachineAction =
  | Readonly<{ type: 'begin'; generation: number }>
  | Readonly<{
      type: 'channel-ready';
      generation: number;
      channelUrl: string;
      expiresAt: number;
    }>
  | Readonly<{ type: 'qr-loading'; generation: number }>
  | Readonly<{
      type: 'qr-ready';
      generation: number;
      dataUrl: string;
    }>
  | Readonly<{ type: 'qr-failed'; generation: number }>
  | Readonly<{ type: 'verifying'; generation: number }>
  | Readonly<{
      type: 'authenticated';
      generation: number;
      identity: VerifiedFarcasterIdentity;
      assurance: 'live-client-verified';
    }>
  | Readonly<{
      type: 'authenticated';
      generation: number;
      identity: VerifiedFarcasterIdentity;
      assurance: 'bridge-oidc-alpha';
      expiresAt: number;
      sessionExpiresAt: number;
    }>
  | Readonly<{
      type: 'pending-admission';
      generation: number;
      identity: VerifiedFarcasterIdentity;
      sessionExpiresAt: number;
    }>
  | Readonly<{
      type: 'session-authorized';
      generation: number;
      identity: VerifiedFarcasterIdentity;
      expiresAt: number;
      sessionExpiresAt: number;
    }>
  | Readonly<{
      type: 'session-pending';
      generation: number;
      identity: VerifiedFarcasterIdentity;
      sessionExpiresAt: number;
    }>
  | Readonly<{
      type: 'restore';
      identity: VerifiedFarcasterIdentity;
      expiresAt: number;
    }>
  | Readonly<{
      type: 'expired';
      generation: number;
      error: FarcasterAuthError;
    }>
  | Readonly<{
      type: 'failed';
      generation: number;
      error: FarcasterAuthError;
    }>
  | Readonly<{ type: 'cancel'; generation: number }>
  | Readonly<{ type: 'sign-out'; generation: number }>;

function isValidGeneration(generation: number) {
  return Number.isSafeInteger(generation) && generation >= 0;
}

function isCurrentGeneration(
  state: FarcasterAuthMachineState,
  generation: number
) {
  return isValidGeneration(generation) && generation === state.generation;
}

function isActivePhase(phase: FarcasterAuthViewState['phase']) {
  return phase === 'creating-channel'
    || phase === 'awaiting-approval'
    || phase === 'verifying';
}

function canBeginFrom(phase: FarcasterAuthViewState['phase']) {
  return phase === 'anonymous' || phase === 'expired' || phase === 'error';
}

function canReturnToAnonymous(phase: FarcasterAuthViewState['phase']) {
  return isActivePhase(phase) || phase === 'expired' || phase === 'error';
}

function anonymousState(generation: number): FarcasterAuthMachineState {
  return {
    generation,
    view: { phase: 'anonymous' }
  };
}

function isNonEmpty(value: string) {
  return value.trim().length > 0;
}

function isValidIdentity(identity: VerifiedFarcasterIdentity) {
  return Number.isSafeInteger(identity.fid)
    && identity.fid > 0
    && Number.isFinite(identity.verifiedAt)
    && Array.isArray(identity.verifications);
}

function isValidRememberedExpiry(identity: VerifiedFarcasterIdentity, expiresAt: number) {
  return Number.isFinite(expiresAt)
    && expiresAt > identity.verifiedAt
    && expiresAt > 0;
}

function isValidSessionExpiry(identity: VerifiedFarcasterIdentity, sessionExpiresAt: number) {
  return Number.isFinite(sessionExpiresAt)
    && sessionExpiresAt > identity.verifiedAt
    && sessionExpiresAt > 0;
}

function publicIdentity(
  identity: VerifiedFarcasterIdentity
): PublicFarcasterIdentity {
  return {
    fid: identity.fid,
    ...(identity.username === undefined ? {} : { username: identity.username }),
    ...(identity.displayName === undefined ? {} : { displayName: identity.displayName }),
    ...(identity.pfpUrl === undefined ? {} : { pfpUrl: identity.pfpUrl }),
    verifications: Object.freeze([]) as readonly [],
    verifiedAt: identity.verifiedAt
  };
}

function publicError(error: FarcasterAuthError): FarcasterAuthError {
  return {
    code: error.code,
    message: error.message
  };
}

function isQrState(
  state: FarcasterQrState,
  expected: FarcasterQrState['state']
) {
  return state.state === expected;
}

function rememberedView(
  session: FarcasterRememberedMachineSession
): FarcasterAuthViewState | undefined {
  if (!isValidIdentity(session.identity) || !isValidRememberedExpiry(session.identity, session.expiresAt)) {
    return undefined;
  }

  return {
    phase: 'authenticated',
    identity: publicIdentity(session.identity),
    assurance: 'bridge-oidc-alpha',
    expiresAt: session.expiresAt,
    sessionExpiresAt: session.sessionExpiresAt ?? session.expiresAt
  };
}

/**
 * Pure, generation-tagged auth reducer. The reducer deliberately has no
 * action fields for channel tokens, nonces, messages, or signatures, making
 * it impossible for proof material to enter public machine state by design.
 */
export function createFarcasterAuthMachineState(
  restored?: FarcasterRememberedMachineSession
): FarcasterAuthMachineState {
  const restoredView = restored ? rememberedView(restored) : undefined;
  return {
    generation: 0,
    view: restoredView ?? { phase: 'anonymous' }
  };
}

export function farcasterAuthMachineReducer(
  state: FarcasterAuthMachineState,
  action: FarcasterAuthMachineAction
): FarcasterAuthMachineState {
  switch (action.type) {
    case 'begin':
      if (
        !canBeginFrom(state.view.phase)
        || !isValidGeneration(action.generation)
        || action.generation <= state.generation
      ) {
        return state;
      }
      return {
        generation: action.generation,
        view: { phase: 'creating-channel' }
      };

    case 'channel-ready':
      if (
        state.view.phase !== 'creating-channel'
        || !isCurrentGeneration(state, action.generation)
        || !isNonEmpty(action.channelUrl)
        || !Number.isFinite(action.expiresAt)
        || action.expiresAt <= 0
      ) {
        return state;
      }
      return {
        generation: state.generation,
        view: {
          phase: 'awaiting-approval',
          channelUrl: action.channelUrl,
          qr: { state: 'not-requested' },
          expiresAt: action.expiresAt
        }
      };

    case 'qr-loading':
      if (
        state.view.phase !== 'awaiting-approval'
        || !isCurrentGeneration(state, action.generation)
        || (
          !isQrState(state.view.qr, 'not-requested')
          && !isQrState(state.view.qr, 'error')
        )
      ) {
        return state;
      }
      return {
        generation: state.generation,
        view: { ...state.view, qr: { state: 'loading' } }
      };

    case 'qr-ready':
      if (
        state.view.phase !== 'awaiting-approval'
        || !isCurrentGeneration(state, action.generation)
        || !isQrState(state.view.qr, 'loading')
        || !isNonEmpty(action.dataUrl)
      ) {
        return state;
      }
      return {
        generation: state.generation,
        view: { ...state.view, qr: { state: 'ready', dataUrl: action.dataUrl } }
      };

    case 'qr-failed':
      if (
        state.view.phase !== 'awaiting-approval'
        || !isCurrentGeneration(state, action.generation)
        || !isQrState(state.view.qr, 'loading')
      ) {
        return state;
      }
      return {
        generation: state.generation,
        view: { ...state.view, qr: { state: 'error' } }
      };

    case 'verifying':
      if (
        state.view.phase !== 'awaiting-approval'
        || !isCurrentGeneration(state, action.generation)
      ) {
        return state;
      }
      return {
        generation: state.generation,
        view: {
          phase: 'verifying',
          expiresAt: state.view.expiresAt
        }
      };

    case 'authenticated':
      if (
        state.view.phase !== 'verifying'
        || !isCurrentGeneration(state, action.generation)
        || !isValidIdentity(action.identity)
        || (
          action.assurance === 'bridge-oidc-alpha'
          && (
            !isValidRememberedExpiry(action.identity, action.expiresAt)
            || !isValidSessionExpiry(action.identity, action.sessionExpiresAt)
            || action.expiresAt > action.sessionExpiresAt
          )
        )
      ) {
        return state;
      }
      return {
        generation: state.generation,
        view: {
          phase: 'authenticated',
          identity: publicIdentity(action.identity),
          assurance: action.assurance,
          ...(action.assurance === 'bridge-oidc-alpha'
            ? {
                expiresAt: action.expiresAt,
                sessionExpiresAt: action.sessionExpiresAt
              }
            : {})
        }
      };

    case 'pending-admission':
      if (
        state.view.phase !== 'verifying'
        || !isCurrentGeneration(state, action.generation)
        || !isValidIdentity(action.identity)
        || !isValidSessionExpiry(action.identity, action.sessionExpiresAt)
      ) {
        return state;
      }
      return {
        generation: state.generation,
        view: {
          phase: 'pending-admission',
          identity: publicIdentity(action.identity),
          sessionExpiresAt: action.sessionExpiresAt
        }
      };

    case 'session-authorized':
      if (
        (state.view.phase !== 'anonymous'
          && state.view.phase !== 'authenticated'
          && state.view.phase !== 'pending-admission')
        || !isCurrentGeneration(state, action.generation)
        || !isValidIdentity(action.identity)
        || !isValidRememberedExpiry(action.identity, action.expiresAt)
        || !isValidSessionExpiry(action.identity, action.sessionExpiresAt)
        || action.expiresAt > action.sessionExpiresAt
      ) {
        return state;
      }
      return {
        generation: state.generation,
        view: {
          phase: 'authenticated',
          identity: publicIdentity(action.identity),
          assurance: 'bridge-oidc-alpha',
          expiresAt: action.expiresAt,
          sessionExpiresAt: action.sessionExpiresAt
        }
      };

    case 'session-pending':
      if (
        (state.view.phase !== 'anonymous'
          && state.view.phase !== 'authenticated'
          && state.view.phase !== 'pending-admission')
        || !isCurrentGeneration(state, action.generation)
        || !isValidIdentity(action.identity)
        || !isValidSessionExpiry(action.identity, action.sessionExpiresAt)
      ) {
        return state;
      }
      return {
        generation: state.generation,
        view: {
          phase: 'pending-admission',
          identity: publicIdentity(action.identity),
          sessionExpiresAt: action.sessionExpiresAt
        }
      };

    case 'restore': {
      if (state.view.phase !== 'anonymous') {
        return state;
      }
      const view = rememberedView({
        identity: action.identity,
        expiresAt: action.expiresAt
      });
      return view ? { generation: state.generation, view } : state;
    }

    case 'expired':
      if (
        !isActivePhase(state.view.phase)
        || !isCurrentGeneration(state, action.generation)
      ) {
        return state;
      }
      return {
        generation: state.generation,
        view: {
          phase: 'expired',
          error: publicError(action.error)
        }
      };

    case 'failed':
      if (
        !isActivePhase(state.view.phase)
        || !isCurrentGeneration(state, action.generation)
      ) {
        return state;
      }
      return {
        generation: state.generation,
        view: {
          phase: 'error',
          error: publicError(action.error)
        }
      };

    case 'cancel':
      if (
        !canReturnToAnonymous(state.view.phase)
        || !isCurrentGeneration(state, action.generation)
      ) {
        return state;
      }
      return anonymousState(state.generation + 1);

    case 'sign-out':
      if (
        (state.view.phase !== 'authenticated' && state.view.phase !== 'pending-admission')
        || !isCurrentGeneration(state, action.generation)
      ) {
        return state;
      }
      return anonymousState(state.generation + 1);
  }
}

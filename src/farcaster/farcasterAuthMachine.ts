import type {
  FarcasterAuthError,
  FarcasterAuthViewState,
  VerifiedFarcasterIdentity
} from './farcasterAuthTypes';

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
      qrDataUrl: string;
      expiresAt: number;
    }>
  | Readonly<{ type: 'verifying'; generation: number }>
  | Readonly<{
      type: 'authenticated';
      generation: number;
      identity: VerifiedFarcasterIdentity;
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

export function createFarcasterAuthMachineState(): FarcasterAuthMachineState {
  return {
    generation: 0,
    view: { phase: 'anonymous' }
  };
}

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

function publicIdentity(
  identity: VerifiedFarcasterIdentity
): VerifiedFarcasterIdentity {
  return {
    fid: identity.fid,
    ...(identity.username === undefined ? {} : { username: identity.username }),
    ...(identity.displayName === undefined ? {} : { displayName: identity.displayName }),
    ...(identity.pfpUrl === undefined ? {} : { pfpUrl: identity.pfpUrl }),
    ...(identity.custody === undefined ? {} : { custody: identity.custody }),
    verifications: [...identity.verifications],
    ...(identity.authMethod === undefined ? {} : { authMethod: identity.authMethod }),
    verifiedAt: identity.verifiedAt
  };
}

function publicError(error: FarcasterAuthError): FarcasterAuthError {
  return {
    code: error.code,
    message: error.message
  };
}

/**
 * Pure, generation-tagged auth reducer. The reducer deliberately has no
 * action fields for channel tokens, nonces, messages, or signatures, making
 * it impossible for proof material to enter public machine state by design.
 */
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
        || !isNonEmpty(action.qrDataUrl)
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
          qrDataUrl: action.qrDataUrl,
          expiresAt: action.expiresAt
        }
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
      ) {
        return state;
      }
      return {
        generation: state.generation,
        view: {
          phase: 'authenticated',
          identity: publicIdentity(action.identity)
        }
      };

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
      return anonymousState(state.generation);

    case 'sign-out':
      if (
        state.view.phase !== 'authenticated'
        || !isCurrentGeneration(state, action.generation)
      ) {
        return state;
      }
      return anonymousState(state.generation);
  }
}

/**
 * Backward-compatible type entry point. Production runtime identity now comes
 * only from verified Sign In with Farcaster; there is intentionally no mock or
 * fallback authenticated session in this module.
 */
export type {
  FarcasterAuthError,
  FarcasterAuthErrorCode,
  FarcasterAuthPresentation,
  FarcasterAuthPhase,
  FarcasterAuthViewState,
  FarcasterBrowserBinding,
  FarcasterBrowserBindingFactory,
  FarcasterBrowserBindingMethod,
  FarcasterQrState,
  FarcasterSessionAssurance,
  FarcasterBridgeChallenge,
  FarcasterBridgeChallengeRequest,
  FarcasterBridgeDisplayIdentity,
  FarcasterBridgeExchangeRequest,
  FarcasterBridgeRequestOptions,
  FarcasterOidcBridgeClient,
  FarcasterOidcSession,
  VerifiedFarcasterIdentity
} from './farcasterAuthTypes';

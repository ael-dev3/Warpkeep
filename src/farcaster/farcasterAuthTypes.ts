export type FarcasterAuthPhase =
  | 'anonymous'
  | 'creating-channel'
  | 'awaiting-approval'
  | 'verifying'
  | 'authenticated'
  | 'expired'
  | 'error';

export type FarcasterAuthErrorCode =
  | 'network'
  | 'relay'
  | 'bridge'
  | 'expired'
  | 'invalid-response'
  | 'verification'
  | 'fid-mismatch'
  | 'qr'
  | 'cancelled'
  | 'unknown';

export type FarcasterAuthError = Readonly<{
  code: FarcasterAuthErrorCode;
  message: string;
}>;

export type FarcasterAuthMethod = 'custody' | 'authAddress';

export type FarcasterHex = `0x${string}`;

/** The presentation that best fits the player's current device. */
export type FarcasterAuthPresentation = 'qr-first' | 'deep-link-first';

/**
 * QR encoding is intentionally independent from a live SIWF channel. A
 * mobile player can use the relay-provided universal link without loading the
 * QR encoder or exposing an image on their own screen.
 */
export type FarcasterQrState =
  | Readonly<{ state: 'not-requested' }>
  | Readonly<{ state: 'loading' }>
  | Readonly<{ state: 'ready'; dataUrl: string }>
  | Readonly<{ state: 'error' }>;

/**
 * Only bridge-oidc-alpha carries the bearer session accepted by the shared
 * realm. The two older values remain representable for compatibility and UI
 * messaging, but never gain backend authority on their own.
 */
export type FarcasterSessionAssurance =
  | 'live-client-verified'
  | 'bridge-oidc-alpha'
  | 'remembered-device-prototype';

/**
 * The only browser-held bearer credential accepted by the shared realm.
 *
 * This object intentionally contains no SIWF proof material. The JWT is kept
 * out of FarcasterAuthViewState so normal presentation code cannot
 * accidentally serialize it into the DOM, logs, or analytics payloads.
 */
export type FarcasterOidcSession = Readonly<{
  jwt: string;
  issuer: string;
  audience: string;
  expiresAt: number;
}>;

/**
 * The verified FID is the stable identity key. Every other field is optional,
 * untrusted display metadata returned by the relay.
 */
export type VerifiedFarcasterIdentity = Readonly<{
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  custody?: FarcasterHex;
  verifications: readonly string[];
  authMethod?: FarcasterAuthMethod;
  verifiedAt: number;
}>;

/** Presentation-only identity. Verification addresses and method never enter React state. */
export type PublicFarcasterIdentity = Readonly<
  Omit<VerifiedFarcasterIdentity, 'custody' | 'verifications' | 'authMethod'> & {
    verifications: readonly [];
  }
>;

/** Public state safe to expose to React presentation components. */
export type FarcasterAuthViewState =
  | Readonly<{ phase: 'anonymous' }>
  | Readonly<{ phase: 'creating-channel' }>
  | Readonly<{
      phase: 'awaiting-approval';
      channelUrl: string;
      qr: FarcasterQrState;
      expiresAt: number;
    }>
  | Readonly<{
      phase: 'verifying';
      expiresAt: number;
    }>
  | Readonly<{
      phase: 'authenticated';
      identity: PublicFarcasterIdentity;
      assurance: FarcasterSessionAssurance;
      /** Present for an expiring restored authoritative session. */
      expiresAt?: number;
    }>
  | Readonly<{
      phase: 'expired';
      error: FarcasterAuthError;
    }>
  | Readonly<{
      phase: 'error';
      error: FarcasterAuthError;
    }>;

export type FarcasterAuthContext = Readonly<{
  /** Current location host, including a localhost port when present. */
  domain: string;
  /** Canonical, hash-free Warpkeep login surface. */
  siweUri: string;
}>;

/**
 * Private channel material returned only to the auth controller. The
 * channelToken must never be copied into FarcasterAuthViewState or persisted.
 */
export type FarcasterSignInChannel = Readonly<{
  channelToken: string;
  url: string;
  nonce: string;
  requestId: string;
  domain: string;
  siweUri: string;
  createdAt: number;
  expiresAt: number;
}>;

export type FarcasterExpectedSignInRequest = Readonly<
  Pick<
    FarcasterSignInChannel,
    'nonce' | 'requestId' | 'domain' | 'siweUri' | 'createdAt' | 'expiresAt'
  >
>;

/**
 * An optional, bridge-issued SIWF request envelope. It contains only request
 * correlation values and never a relay channel token or an OIDC credential.
 */
export type FarcasterBridgeChallenge = Readonly<{
  nonce: string;
  requestId: string;
  createdAt: number;
  expiresAt: number;
}>;

export type FarcasterPendingChannelStatus = Readonly<{
  state: 'pending';
  nonce: string;
}>;

export type FarcasterCompletedChannelStatus = Readonly<{
  state: 'completed';
  nonce: string;
  message: string;
  signature: FarcasterHex;
  fid: number;
  signatureParams: Readonly<{
    siweUri: string;
    domain: string;
    nonce: string;
    expirationTime: string;
    requestId: string;
  }>;
  acceptAuthAddress: true;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  custody?: FarcasterHex;
  verifications: readonly string[];
  authMethod?: FarcasterAuthMethod;
}>;

export type FarcasterChannelStatus =
  | FarcasterPendingChannelStatus
  | FarcasterCompletedChannelStatus;

/** The non-sensitive identity subset the bridge may include in its token. */
export type FarcasterBridgeDisplayIdentity = Readonly<{
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
}>;

/**
 * Private controller-to-bridge boundary. The completed SIWF proof is needed
 * for independent server verification, but it must never enter React view
 * state, local storage, or a channel URL.
 */
export type FarcasterBridgeExchangeRequest = Readonly<{
  message: string;
  signature: FarcasterHex;
  nonce: string;
  fid: number;
  requestId: string;
  domain: string;
  siweUri: string;
  expirationTime: string;
  expiresAt: number;
  identity: FarcasterBridgeDisplayIdentity;
}>;

export type FarcasterBridgeChallengeRequest = Readonly<{
  domain: string;
  siweUri: string;
}>;

/**
 * The authenticated bridge boundary. Implementations must independently
 * verify the proof passed to exchangeCompletedSignIn before issuing the OIDC
 * session. Challenge loading is optional for compatible bridge deployments.
 */
export interface FarcasterOidcBridgeClient {
  createChallenge?(
    request: FarcasterBridgeChallengeRequest
  ): Promise<FarcasterBridgeChallenge>;
  exchangeCompletedSignIn(
    request: FarcasterBridgeExchangeRequest
  ): Promise<FarcasterOidcSession>;
}

/** Network/verification boundary consumed by the React auth controller. */
export interface FarcasterSessionAuthority {
  beginSignIn(
    context?: FarcasterAuthContext,
    bridgeChallenge?: FarcasterBridgeChallenge
  ): Promise<FarcasterSignInChannel>;
  getStatus(channelToken: string): Promise<FarcasterChannelStatus>;
  verifyCompletedRequest(
    expected: FarcasterExpectedSignInRequest,
    completed: FarcasterCompletedChannelStatus
  ): Promise<VerifiedFarcasterIdentity>;
}

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
 * A restored device record is deliberately less authoritative than a live
 * signature verification. It is a local prototype convenience only.
 */
export type FarcasterSessionAssurance =
  | 'live-client-verified'
  | 'remembered-device-prototype';

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
      identity: VerifiedFarcasterIdentity;
      assurance: FarcasterSessionAssurance;
      /** Present only for a locally remembered-device prototype session. */
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

/** Network/verification boundary consumed by the React auth controller. */
export interface FarcasterSessionAuthority {
  beginSignIn(context?: FarcasterAuthContext): Promise<FarcasterSignInChannel>;
  getStatus(channelToken: string): Promise<FarcasterChannelStatus>;
  verifyCompletedRequest(
    expected: FarcasterExpectedSignInRequest,
    completed: FarcasterCompletedChannelStatus
  ): Promise<VerifiedFarcasterIdentity>;
}

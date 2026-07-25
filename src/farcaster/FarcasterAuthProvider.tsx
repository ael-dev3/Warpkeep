import type { ReactNode } from 'react';

import {
  createFarcasterBrowserBinding
} from './farcasterBrowserBinding';
import {
  getDefaultFarcasterSessionAuthority,
  toFarcasterAuthError
} from './farcasterAuthClient';
import {
  FARCASTER_AUTH_POLL_INTERVAL_MS,
  FarcasterAuthProviderCore,
  type FarcasterAuthControllerValue,
  type FarcasterAuthorityLoader,
  type FarcasterOidcBridgeLoader,
  type FarcasterQrEncoder
} from './FarcasterAuthProviderCore';
import {
  getBrowserFarcasterAuthContext
} from './farcasterAuthContext';
import type {
  FarcasterDeviceSessionEnvironment
} from './farcasterDeviceSession';
import { getDefaultFarcasterOidcBridgeClient } from './farcasterOidcBridgeClient';
import type {
  FarcasterAuthContext,
  FarcasterBrowserBindingFactory
} from './farcasterAuthTypes';

export type FarcasterAuthProviderProps = Readonly<{
  children: ReactNode;
  loadAuthority?: FarcasterAuthorityLoader;
  /** Lazy injection seam for the trusted Farcaster → OIDC bridge. */
  loadBridgeClient?: FarcasterOidcBridgeLoader;
  /** Kept injectable so a challenge and SIWF request share one exact context. */
  resolveAuthContext?: () => FarcasterAuthContext;
  encodeQrCode?: FarcasterQrEncoder;
  /** Generates the one-request browser-held S256 verifier in private memory. */
  createBrowserBinding?: FarcasterBrowserBindingFactory;
  now?: () => number;
  pollIntervalMs?: number;
  /** Injection seam for storage-denied and cross-tab lifecycle tests. */
  deviceSessionEnvironment?: FarcasterDeviceSessionEnvironment;
}>;

function defaultEncodeQrCode(channelUrl: string) {
  return import('./farcasterQrCode').then(({ encodeFarcasterQrCode }) => (
    encodeFarcasterQrCode(channelUrl)
  ));
}

export function FarcasterAuthProvider({
  children,
  loadAuthority = getDefaultFarcasterSessionAuthority,
  loadBridgeClient = getDefaultFarcasterOidcBridgeClient,
  resolveAuthContext = getBrowserFarcasterAuthContext,
  encodeQrCode = defaultEncodeQrCode,
  createBrowserBinding = createFarcasterBrowserBinding,
  now = Date.now,
  pollIntervalMs,
  deviceSessionEnvironment
}: FarcasterAuthProviderProps) {
  return (
    <FarcasterAuthProviderCore
      createBrowserBinding={createBrowserBinding}
      deviceSessionEnvironment={deviceSessionEnvironment}
      encodeQrCode={encodeQrCode}
      loadAuthority={loadAuthority}
      loadBridgeClient={loadBridgeClient}
      normalizeAuthError={toFarcasterAuthError}
      now={now}
      pollIntervalMs={pollIntervalMs}
      resolveAuthContext={resolveAuthContext}
    >
      {children}
    </FarcasterAuthProviderCore>
  );
}

export {
  FARCASTER_AUTH_POLL_INTERVAL_MS,
  useFarcasterAuth
} from './FarcasterAuthProviderCore';
export type {
  FarcasterAuthControllerValue,
  FarcasterAuthorityLoader,
  FarcasterOidcBridgeLoader,
  FarcasterQrEncoder
} from './FarcasterAuthProviderCore';

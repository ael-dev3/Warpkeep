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
  type FarcasterBridgeFailureClassifier,
  type FarcasterOidcBridgeLoader,
  type FarcasterQuickAuthTokenLoader,
  type FarcasterQrEncoder
} from './FarcasterAuthProviderCore';
import {
  getBrowserFarcasterAuthContext
} from './farcasterAuthContext';
import type {
  FarcasterDeviceSessionEnvironment
} from './farcasterDeviceSession';
import {
  farcasterOidcBridgeFailureKind,
  getDefaultFarcasterOidcBridgeClient
} from './farcasterOidcBridgeClient';
import type {
  FarcasterAuthContext,
  FarcasterBrowserBindingFactory
} from './farcasterAuthTypes';
import { useMiniAppHost } from './miniapp';
import { useMiniAppAdmissionGrant } from './miniapp/MiniAppHostProvider';

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
  const miniAppHost = useMiniAppHost();
  const admissionGrant = useMiniAppAdmissionGrant();
  const loadQuickAuthToken: FarcasterQuickAuthTokenLoader | undefined =
    miniAppHost.isMiniApp
      ? miniAppHost.quickAuth.getToken
      : undefined;

  return (
    <FarcasterAuthProviderCore
      classifyBridgeFailure={farcasterOidcBridgeFailureKind}
      createBrowserBinding={createBrowserBinding}
      deviceSessionEnvironment={deviceSessionEnvironment}
      encodeQrCode={encodeQrCode}
      loadAuthority={loadAuthority}
      loadBridgeClient={loadBridgeClient}
      loadQuickAuthToken={loadQuickAuthToken}
      admissionGrantAvailable={admissionGrant !== undefined}
      readAdmissionGrantTicket={admissionGrant?.read}
      onAdmissionGrantCapabilityConsumed={admissionGrant?.clear}
      quickAuthPresentationIdentity={
        miniAppHost.isMiniApp
          ? miniAppHost.context?.user
          : undefined
      }
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
  FarcasterBridgeFailureClassifier,
  FarcasterOidcBridgeLoader,
  FarcasterQuickAuthTokenLoader,
  FarcasterQrEncoder
} from './FarcasterAuthProviderCore';

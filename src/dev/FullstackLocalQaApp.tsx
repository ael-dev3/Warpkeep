import { useMemo } from 'react';

import bootstrapValue from 'virtual:warpkeep-local-fullstack-bootstrap';

import { WarpkeepExperience } from '../components/WarpkeepExperience';
import {
  FarcasterAuthProviderCore,
  useFarcasterAuth
} from '../farcaster/FarcasterAuthProviderCore';
import type {
  FarcasterAuthContext,
  FarcasterBridgeChallenge,
  FarcasterOidcBridgeClient,
  FarcasterSessionAuthority,
  FarcasterSignInChannel,
  VerifiedFarcasterIdentity
} from '../farcaster/farcasterAuthTypes';
import {
  WarpkeepSpacetimeProvider,
  useWarpkeepBackend
} from '../spacetime/WarpkeepSpacetimeProvider';
import {
  localFullstackQaRuntimeConfig,
  readLocalFullstackQaBootstrap,
  type LocalFullstackQaBootstrap
} from './fullstackLocalQaBootstrap';

const LOCAL_BINDING_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const LOCAL_BINDING_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const LOCAL_QR_DATA_URL =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22256%22 height=%22256%22 viewBox=%220 0 256 256%22%3E%3Crect width=%22256%22 height=%22256%22 fill=%22%230d1017%22/%3E%3Cpath d=%22M32 32h72v72H32zM152 32h72v72h-72zM32 152h72v72H32z%22 fill=%22%23d5aa55%22/%3E%3Cpath d=%22M56 56h24v24H56zM176 56h24v24h-24zM56 176h24v24H56zM144 144h24v24h-24zM184 144h40v16h-40zM144 184h16v40h-16zM184 184h40v40h-40z%22 fill=%22%230d1017%22/%3E%3C/svg%3E';
const DISABLED_BROWSER_STORAGE = Object.freeze({
  storage: null,
  localStorage: null,
  sessionStorage: null
});
const LOCAL_AUTH_ERROR = Object.freeze({
  code: 'unknown' as const,
  message: 'Disposable local authentication could not be completed.'
});

function syntheticIdentity(
  bootstrap: LocalFullstackQaBootstrap
): VerifiedFarcasterIdentity {
  return Object.freeze({
    fid: bootstrap.fid,
    username: bootstrap.username,
    displayName: bootstrap.displayName,
    pfpUrl: bootstrap.pfpUrl,
    verifications: Object.freeze([]),
    authMethod: 'authAddress',
    verifiedAt: Date.now()
  });
}

function createLocalAuthority(
  bootstrap: LocalFullstackQaBootstrap
): FarcasterSessionAuthority {
  const identity = syntheticIdentity(bootstrap);
  let activeChannel: FarcasterSignInChannel | undefined;
  return Object.freeze({
    async beginSignIn(
      context?: FarcasterAuthContext,
      challenge?: FarcasterBridgeChallenge
    ) {
      if (!context || !challenge) {
        throw new Error('Local QA challenge context is unavailable.');
      }
      activeChannel = Object.freeze({
        channelToken: 'LOCAL_QA_CHANNEL_NOT_A_REAL_PROOF',
        url: 'farcaster://connect?channelToken=LOCAL_QA_NOT_SCANNABLE',
        nonce: challenge.nonce,
        requestId: challenge.requestId,
        domain: context.domain,
        siweUri: context.siweUri,
        createdAt: challenge.createdAt,
        expiresAt: challenge.expiresAt
      });
      return activeChannel;
    },
    async getStatus() {
      if (!activeChannel) throw new Error('Local QA channel is unavailable.');
      return Object.freeze({
        state: 'completed',
        nonce: activeChannel.nonce,
        message: 'LOCAL_QA_SYNTHETIC_MESSAGE',
        signature: `0x${'ab'.repeat(65)}` as const,
        fid: bootstrap.fid,
        signatureParams: Object.freeze({
          siweUri: activeChannel.siweUri,
          domain: activeChannel.domain,
          nonce: activeChannel.nonce,
          expirationTime: new Date(activeChannel.expiresAt).toISOString(),
          requestId: activeChannel.requestId
        }),
        acceptAuthAddress: true,
        username: bootstrap.username,
        displayName: bootstrap.displayName,
        pfpUrl: bootstrap.pfpUrl,
        verifications: Object.freeze([]),
        authMethod: 'authAddress'
      });
    },
    async verifyCompletedRequest() {
      return identity;
    }
  });
}

function createLocalBridge(
  bootstrap: LocalFullstackQaBootstrap
): FarcasterOidcBridgeClient {
  return Object.freeze({
    issuer: bootstrap.issuer,
    audience: bootstrap.audience,
    async createChallenge() {
      const createdAt = Date.now();
      return Object.freeze({
        nonce: 'ab'.repeat(24),
        requestId: 'local-fullstack-request-0001',
        createdAt,
        expiresAt: createdAt + 5 * 60 * 1_000
      });
    },
    async exchangeCompletedSignIn() {
      return Object.freeze({
        version: 2,
        status: 'authorized',
        identity: Object.freeze({ fid: bootstrap.fid }),
        sessionExpiresAt: bootstrap.sessionExpiresAt,
        accessToken: bootstrap.accessToken,
        tokenType: 'spacetime-access',
        accessExpiresAt: bootstrap.accessExpiresAt
      });
    },
    async refreshSession() {
      throw new Error('No disposable local session is retained.');
    },
    async logoutSession() {}
  });
}

function LocalFullstackStateProbe() {
  const auth = useFarcasterAuth();
  const backend = useWarpkeepBackend();
  const dispatchSite = backend.state.realm?.goldSites?.find((site) => (
    site.active
    && !backend.state.realm?.goldNodeOccupations?.some(
      (occupation) => occupation.siteId === site.siteId
    )
  ));
  const workerCount = backend.state.workerRoster?.workers.length ?? 0;
  const deployedWorkerCount = backend.state.workerProjection?.workers.filter(
    (worker) => worker.status !== 'idle'
  ).length ?? 0;
  const recallableWorkerCount = backend.state.workerProjection?.ownedWorkers.filter(
    (worker) => worker.status === 'outbound' || worker.status === 'gathering'
  ).length ?? 0;
  return (
    <output
      data-local-fullstack-auth={auth.state.phase}
      data-local-fullstack-backend={backend.state.phase}
      data-local-fullstack-deployed-workers={String(deployedWorkerCount)}
      data-local-fullstack-recallable-workers={String(recallableWorkerCount)}
      data-local-fullstack-workers={String(workerCount)}
      data-local-fullstack-dispatch-q={dispatchSite?.q}
      data-local-fullstack-dispatch-r={dispatchSite?.r}
      hidden
    >
      Disposable local full-stack state
    </output>
  );
}

export function FullstackLocalQaApp() {
  const bootstrap = useMemo(
    () => readLocalFullstackQaBootstrap(bootstrapValue),
    []
  );
  const authority = useMemo(() => createLocalAuthority(bootstrap), [bootstrap]);
  const bridge = useMemo(() => createLocalBridge(bootstrap), [bootstrap]);
  const config = useMemo(() => localFullstackQaRuntimeConfig(bootstrap), [bootstrap]);

  return (
    <FarcasterAuthProviderCore
      createBrowserBinding={async () => Object.freeze({
        verifier: LOCAL_BINDING_VERIFIER,
        challenge: LOCAL_BINDING_CHALLENGE,
        method: 'S256'
      })}
      deviceSessionEnvironment={DISABLED_BROWSER_STORAGE}
      encodeQrCode={async () => LOCAL_QR_DATA_URL}
      loadAuthority={async () => authority}
      loadBridgeClient={async () => bridge}
      normalizeAuthError={() => LOCAL_AUTH_ERROR}
      pollIntervalMs={25}
      resolveAuthContext={() => Object.freeze({
        domain: window.location.host,
        siweUri: `${window.location.origin}/`
      })}
    >
      <WarpkeepSpacetimeProvider config={config}>
        <LocalFullstackStateProbe />
        <WarpkeepExperience />
      </WarpkeepSpacetimeProvider>
    </FarcasterAuthProviderCore>
  );
}

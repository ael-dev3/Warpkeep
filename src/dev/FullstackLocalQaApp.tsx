import { useEffect, useMemo, useState } from 'react';

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
  DEFAULT_WARPKEEP_BACKEND_RUNTIME,
  WarpkeepSpacetimeProvider,
  type WarpkeepBackendRuntime,
  useWarpkeepBackend
} from '../spacetime/WarpkeepSpacetimeProvider';
import { REALM_HEX_SIZE } from '../components/realm/realmMapPresentationHelpers';
import { resolveRealmWorkerRoutePose } from '../components/realm/realmWorkerRoutePresentation';
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
const LOCAL_PERSISTENT_WORKER_REENTRY_SEARCH =
  '?persistent-worker-reentry=delayed-private-v1';
const LOCAL_WORKER_PRIVATE_SEAM_MATRIX_SEARCH =
  '?worker-private-seams=continuity-matrix-v1';
const LOCAL_RELEASE_PRIVATE_WORKER_READS_EVENT =
  'warpkeep-local-release-private-worker-reads';
const LOCAL_SET_PRIVATE_WORKER_SEAM_EVENT =
  'warpkeep-local-set-private-worker-seam';
const LOCAL_RELEASE_PRIVATE_WORKER_SEAM_EVENT =
  'warpkeep-local-release-private-worker-seam';
const LOCAL_RESTORE_TIMEOUT_VISIBILITY_EVENT =
  'warpkeep-local-restore-timeout-visibility';
const LOCAL_REFRESH_ACCESS_EVENT = 'warpkeep-local-refresh-access';
const LOCAL_FULLSTACK_DISPATCH_TARGETS = Object.freeze([
  Object.freeze({
    ordinal: 1,
    resourceKind: 'gold' as const,
    siteId: 'genesis-001-tier1-gold-02'
  }),
  Object.freeze({
    ordinal: 2,
    resourceKind: 'food' as const,
    siteId: 'genesis-001-tier1-food-002'
  }),
  Object.freeze({
    ordinal: 3,
    resourceKind: 'wood' as const,
    siteId: 'genesis-001-tier1-wood-012'
  }),
  Object.freeze({
    ordinal: 4,
    resourceKind: 'stone' as const,
    siteId: 'genesis-001-tier1-stone-002'
  })
]);

type LocalWorkerPrivateSeam =
  | 'normal'
  | 'resource-missing'
  | 'torn-pair'
  | 'visibility-gated'
  | 'reconnect-gated'
  | 'timeout-retry';

function privateReadGate(marker: string, releaseEvent: string) {
  document.documentElement.setAttribute(marker, 'waiting');
  return new Promise<void>((resolve) => {
    window.addEventListener(releaseEvent, () => {
      document.documentElement.setAttribute(marker, 'released');
      resolve();
    }, { once: true });
  });
}

function createLocalFullstackBackendRuntime(): WarpkeepBackendRuntime {
  const collectResources =
    DEFAULT_WARPKEEP_BACKEND_RUNTIME.collectResources;
  let resourceSettlementAttempt = 0;
  const instrumentedRuntime = Object.freeze({
    ...DEFAULT_WARPKEEP_BACKEND_RUNTIME,
    async collectResources(...args) {
      resourceSettlementAttempt += 1;
      const attempt = resourceSettlementAttempt;
      document.documentElement.setAttribute(
        'data-local-fullstack-resource-settlement-attempt',
        String(attempt)
      );
      document.documentElement.setAttribute(
        'data-local-fullstack-resource-settlement-state',
        'pending'
      );
      try {
        const result = await collectResources(...args);
        document.documentElement.setAttribute(
          'data-local-fullstack-resource-settlement-completed',
          String(attempt)
        );
        document.documentElement.setAttribute(
          'data-local-fullstack-resource-settlement-revision',
          result.revision.toString()
        );
        document.documentElement.setAttribute(
          'data-local-fullstack-resource-settlement-state',
          'completed'
        );
        return result;
      } catch (error) {
        document.documentElement.setAttribute(
          'data-local-fullstack-resource-settlement-state',
          'failed'
        );
        throw error;
      }
    }
  } satisfies WarpkeepBackendRuntime);
  const reentryScenario =
    window.location.search === LOCAL_PERSISTENT_WORKER_REENTRY_SEARCH;
  const seamMatrixScenario =
    window.location.search === LOCAL_WORKER_PRIVATE_SEAM_MATRIX_SEARCH;
  if (!reentryScenario && !seamMatrixScenario) {
    return instrumentedRuntime;
  }
  const readWorkerRoster = instrumentedRuntime.readWorkerRoster;
  const readResourceStateV2 = instrumentedRuntime.readResourceStateV2;
  if (!readWorkerRoster || !readResourceStateV2) {
    throw new Error('Disposable local Worker procedures are unavailable.');
  }
  if (reentryScenario) {
    let firstRosterRead = true;
    const initialPrivateReadGate = privateReadGate(
      'data-local-fullstack-private-read-gate',
      LOCAL_RELEASE_PRIVATE_WORKER_READS_EVENT
    );
    let seam: LocalWorkerPrivateSeam = 'normal';
    let seamGate: Promise<void> | undefined;
    let releaseSeamGate: (() => void) | undefined;
    window.addEventListener(LOCAL_SET_PRIVATE_WORKER_SEAM_EVENT, (event) => {
      if (!(event instanceof CustomEvent)) return;
      if (event.detail !== 'reconnect-gated') return;
      seam = event.detail;
      seamGate = new Promise<void>((resolve) => {
        releaseSeamGate = resolve;
      });
      document.documentElement.setAttribute(
        'data-local-fullstack-private-seam',
        'reconnect-waiting'
      );
    });
    window.addEventListener(LOCAL_RELEASE_PRIVATE_WORKER_SEAM_EVENT, () => {
      seam = 'normal';
      document.documentElement.setAttribute(
        'data-local-fullstack-private-seam',
        'reconnect-released'
      );
      releaseSeamGate?.();
      releaseSeamGate = undefined;
      seamGate = undefined;
    });
    return Object.freeze({
      ...instrumentedRuntime,
      async readWorkerRoster(...args) {
        await initialPrivateReadGate;
        if (seam === 'reconnect-gated') await seamGate;
        if (firstRosterRead) {
          firstRosterRead = false;
          document.documentElement.setAttribute(
            'data-local-fullstack-private-roster-failure',
            'injected'
          );
          throw new Error('Disposable local first private Worker read failed.');
        }
        return readWorkerRoster(...args);
      },
      async readResourceStateV2(...args) {
        await initialPrivateReadGate;
        if (seam === 'reconnect-gated') await seamGate;
        return readResourceStateV2(...args);
      }
    });
  }

  let seam: LocalWorkerPrivateSeam = 'timeout-retry';
  let resourceMissing = true;
  let tornPair = true;
  let seamGate: Promise<void> | undefined;
  let releaseSeamGate: (() => void) | undefined;
  let timeoutRead: Promise<never> | undefined;
  let timeoutVisibilityTimer: number | undefined;
  const ownHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
  const ownVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  const restoreVisibilityWithoutEvent = () => {
    if (timeoutVisibilityTimer !== undefined) {
      window.clearTimeout(timeoutVisibilityTimer);
      timeoutVisibilityTimer = undefined;
    }
    if (ownHidden) Object.defineProperty(document, 'hidden', ownHidden);
    else Reflect.deleteProperty(document, 'hidden');
    if (ownVisibility) {
      Object.defineProperty(document, 'visibilityState', ownVisibility);
    } else {
      Reflect.deleteProperty(document, 'visibilityState');
    }
  };
  const beginTimeoutRead = () => {
    if (!timeoutRead) {
      document.documentElement.setAttribute(
        'data-local-fullstack-private-timeout',
        'waiting'
      );
      timeoutVisibilityTimer = window.setTimeout(() => {
        try {
          Object.defineProperty(document, 'hidden', {
            configurable: true,
            get: () => true
          });
          Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => 'hidden'
          });
          document.documentElement.setAttribute(
            'data-local-fullstack-private-timeout',
            'timed-out-hidden'
          );
        } catch {
          document.documentElement.setAttribute(
            'data-local-fullstack-private-timeout',
            'visibility-injection-failed'
          );
        }
      }, 14_750);
      timeoutRead = new Promise<never>(() => undefined);
    }
    return timeoutRead;
  };
  window.addEventListener(LOCAL_RESTORE_TIMEOUT_VISIBILITY_EVENT, () => {
    restoreVisibilityWithoutEvent();
    seam = 'normal';
    document.documentElement.setAttribute(
      'data-local-fullstack-private-timeout',
      'retry-released'
    );
  });
  window.addEventListener(LOCAL_SET_PRIVATE_WORKER_SEAM_EVENT, (event) => {
    if (!(event instanceof CustomEvent)) return;
    if (![
      'resource-missing',
      'torn-pair',
      'visibility-gated'
    ].includes(String(event.detail))) return;
    seam = event.detail as LocalWorkerPrivateSeam;
    resourceMissing = seam === 'resource-missing';
    tornPair = seam === 'torn-pair';
    if (seam === 'visibility-gated') {
      seamGate = new Promise<void>((resolve) => {
        releaseSeamGate = resolve;
      });
      document.documentElement.setAttribute(
        'data-local-fullstack-private-seam',
        'visibility-waiting'
      );
    }
  });
  window.addEventListener(LOCAL_RELEASE_PRIVATE_WORKER_SEAM_EVENT, () => {
    seam = 'normal';
    document.documentElement.setAttribute(
      'data-local-fullstack-private-seam',
      'visibility-released'
    );
    releaseSeamGate?.();
    releaseSeamGate = undefined;
    seamGate = undefined;
  });
  return Object.freeze({
    ...instrumentedRuntime,
    async readWorkerRoster(...args) {
      if (seam === 'timeout-retry') return beginTimeoutRead();
      if (seam === 'visibility-gated') await seamGate;
      const roster = await readWorkerRoster(...args);
      if (seam === 'torn-pair' && tornPair && roster) {
        tornPair = false;
        document.documentElement.setAttribute(
          'data-local-fullstack-private-torn-pair',
          'injected'
        );
        return Object.freeze({
          ...roster,
          workers: Object.freeze(roster.workers.map((worker, index) => (
            index === 0
              ? Object.freeze({ ...worker, revision: worker.revision + 1n })
              : worker
          )))
        });
      }
      return roster;
    },
    async readResourceStateV2(...args) {
      if (seam === 'timeout-retry') return beginTimeoutRead();
      if (seam === 'visibility-gated') await seamGate;
      if (seam === 'resource-missing' && resourceMissing) {
        resourceMissing = false;
        document.documentElement.setAttribute(
          'data-local-fullstack-private-resource-missing',
          'injected'
        );
        return undefined;
      }
      return readResourceStateV2(...args);
    }
  });
}

// The disposable QA page owns one module realm. Constructing the seam runtime
// here keeps its global listeners and one-shot gates singular even when React
// StrictMode intentionally invokes component initializers more than once.
const LOCAL_FULLSTACK_BACKEND_RUNTIME = createLocalFullstackBackendRuntime();

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
  let authorized = false;
  const authorizedResponse = () => Object.freeze({
    version: 2 as const,
    status: 'authorized' as const,
    identity: Object.freeze({ fid: bootstrap.fid }),
    sessionExpiresAt: bootstrap.sessionExpiresAt,
    accessToken: bootstrap.accessToken,
    tokenType: 'spacetime-access' as const,
    accessExpiresAt: bootstrap.accessExpiresAt
  });
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
      authorized = true;
      return authorizedResponse();
    },
    async refreshSession() {
      if (!authorized) throw new Error('No disposable local session is retained.');
      const current = Number(
        document.documentElement.getAttribute(
          'data-local-fullstack-access-refresh-count'
        ) ?? '0'
      );
      document.documentElement.setAttribute(
        'data-local-fullstack-access-refresh-count',
        String(Number.isSafeInteger(current) ? current + 1 : 1)
      );
      return authorizedResponse();
    },
    async logoutSession() {}
  });
}

function LocalFullstackStateProbe() {
  const auth = useFarcasterAuth();
  const backend = useWarpkeepBackend();
  const [routeClockMilliseconds, setRouteClockMilliseconds] = useState(
    () => Date.now()
  );
  useEffect(() => {
    const interval = window.setInterval(
      () => setRouteClockMilliseconds(Date.now()),
      128
    );
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    const refresh = () => auth.refreshSession();
    window.addEventListener(LOCAL_REFRESH_ACCESS_EVENT, refresh);
    return () => window.removeEventListener(LOCAL_REFRESH_ACCESS_EVENT, refresh);
  }, [auth.refreshSession]);
  const realm = backend.state.realm;
  const genericOccupations = new Set(realm?.workerOccupations?.map(
    (occupation) => `${occupation.resourceKind}:${occupation.siteId}`
  ));
  const exactAvailableSite = (
    target: typeof LOCAL_FULLSTACK_DISPATCH_TARGETS[number],
    sites: readonly Readonly<{
      active: boolean;
      siteId: string;
      q: number;
      r: number;
    }>[] | undefined,
    legacyOccupations: readonly Readonly<{ siteId: string }>[] | undefined
  ) => sites?.find((site) => (
    site.siteId === target.siteId
    && site.active
    && !genericOccupations.has(`${target.resourceKind}:${site.siteId}`)
    && !legacyOccupations?.some((occupation) => occupation.siteId === site.siteId)
  ));
  const siteCatalogs = {
    gold: [realm?.goldSites, realm?.goldNodeOccupations],
    food: [realm?.foodSites, realm?.foodNodeOccupations],
    wood: [realm?.woodSites, realm?.woodNodeOccupations],
    stone: [realm?.stoneSites, realm?.stoneNodeOccupations]
  } as const;
  const dispatchSites = LOCAL_FULLSTACK_DISPATCH_TARGETS.map((target) => {
    const [sites, legacyOccupations] = siteCatalogs[target.resourceKind];
    return [
      target.resourceKind,
      exactAvailableSite(target, sites, legacyOccupations)
    ] as const;
  });
  const dispatchSiteProjection = dispatchSites.flatMap(([resourceKind, site]) => (
    site ? [`${resourceKind}:${site.q},${site.r}`] : []
  )).join(';');
  const dispatchSite = realm?.goldSites?.find((site) => (
    site.active
    && !realm?.goldNodeOccupations?.some(
      (occupation) => occupation.siteId === site.siteId
    )
  ));
  const workerCount = backend.state.workerRoster?.workers.length ?? 0;
  const publicOwnedWorkers = realm?.workerWorkers?.filter(
    (worker) => worker.ownedByViewer
  ) ?? [];
  const exactDispatchTargetCount = publicOwnedWorkers.filter((worker) => {
    if (worker.status === 'idle') return false;
    const target = LOCAL_FULLSTACK_DISPATCH_TARGETS.find(
      (candidate) => candidate.ordinal === worker.ordinal
    );
    return target !== undefined
      && worker.resourceKind === target.resourceKind
      && worker.siteId === target.siteId;
  }).length;
  const deployedWorkerCount = publicOwnedWorkers.filter(
    (worker) => worker.status !== 'idle'
  ).length ?? 0;
  const recallableWorkerCount = publicOwnedWorkers.filter(
    (worker) => worker.status === 'outbound' || worker.status === 'gathering'
  ).length ?? 0;
  const publicAssignmentRevisions = publicOwnedWorkers
    .map((worker) => (
      `${worker.ordinal}:${worker.status}:${worker.timelineRevision}:${worker.revision}`
    ))
    .sort()
    .join(',');
  const privateAssignmentRevisions = (backend.state.workerRoster?.workers ?? [])
    .map((worker) => `${worker.ordinal}:${worker.status}:${worker.revision}`)
    .sort()
    .join(',');
  const privateResourceHasPending = Object.values(
    backend.state.workerResourceState?.pending ?? {}
  ).some((value) => value > 0n);
  const sitesByResource = {
    gold: realm?.goldSites,
    food: realm?.foodSites,
    wood: realm?.woodSites,
    stone: realm?.stoneSites
  } as const;
  const routeEvidence = publicOwnedWorkers.flatMap((worker) => {
    if (
      worker.status === 'idle'
      || !worker.resourceKind
      || !worker.siteId
      || !realm?.ownCastle
    ) return [];
    const destination = sitesByResource[worker.resourceKind]?.find(
      (site) => site.siteId === worker.siteId
    );
    if (!destination) return [];
    const pose = resolveRealmWorkerRoutePose(
      Object.freeze({
        ...worker,
        originCoord: Object.freeze({
          q: realm.ownCastle.q,
          r: realm.ownCastle.r
        }),
        destinationCoord: Object.freeze({ q: destination.q, r: destination.r })
      }),
      BigInt(routeClockMilliseconds) * 1_000n,
      REALM_HEX_SIZE
    );
    if (!pose) return [];
    return [[
      worker.ordinal,
      worker.status,
      worker.timelineRevision,
      worker.revision.toString(),
      Math.round(pose.world.x * 10_000),
      Math.round(pose.world.z * 10_000),
      Math.round(pose.forwardProgress * 10_000),
      Math.round(pose.phaseProgress * 10_000)
    ].join(':')];
  }).sort().join(',');
  return (
    <output
      data-local-fullstack-auth={auth.state.phase}
      data-local-fullstack-backend={backend.state.phase}
      data-local-fullstack-deployed-workers={String(deployedWorkerCount)}
      data-local-fullstack-exact-dispatch-target-count={
        String(exactDispatchTargetCount)
      }
      data-local-fullstack-recallable-workers={String(recallableWorkerCount)}
      data-local-fullstack-workers={String(workerCount)}
      data-local-fullstack-worker-commands={String(
        backend.workerPrivateSync.commandsEnabled
      )}
      data-local-fullstack-worker-private-sync={backend.workerPrivateSync.phase}
      data-local-fullstack-public-assignment-revisions={publicAssignmentRevisions}
      data-local-fullstack-public-worker-occupation-count={
        String(realm?.workerOccupations?.length ?? 0)
      }
      data-local-fullstack-private-assignment-revisions={privateAssignmentRevisions}
      data-local-fullstack-private-resource-revision={
        backend.state.workerResourceState?.revision.toString() ?? ''
      }
      data-local-fullstack-private-resource-has-pending={
        String(privateResourceHasPending)
      }
      data-local-fullstack-public-route-evidence={routeEvidence}
      data-local-fullstack-dispatch-q={dispatchSite?.q}
      data-local-fullstack-dispatch-r={dispatchSite?.r}
      data-local-fullstack-dispatch-sites={dispatchSiteProjection}
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
      <WarpkeepSpacetimeProvider
        config={config}
        runtime={LOCAL_FULLSTACK_BACKEND_RUNTIME}
      >
        <LocalFullstackStateProbe />
        <WarpkeepExperience />
      </WarpkeepSpacetimeProvider>
    </FarcasterAuthProviderCore>
  );
}

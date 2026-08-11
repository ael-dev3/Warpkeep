import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import {
  GREATER_REALM_MAXIMUM_RESOURCE_AFFORDANCES,
  type GreaterRealmClientPhase,
  type GreaterRealmClientSnapshot
} from '../../greater-realm/greaterRealmClientRuntime';
import type {
  GreaterRealmResourceLocationSummaryDto
} from '../../greater-realm/greaterRealmPublicContract';
import { useMiniAppHost } from '../../farcaster/miniapp';
import type { GraphicsQualityTier } from '../../settings/graphicsPreference';
import type { AvailableGreaterRealmProviderBridge } from '../../spacetime/greaterRealmProviderBridge';
import { useReducedMotionPreference } from './realmMapPresentationHelpers';
import {
  createGreaterRealmWorldCanvasHost,
  type GreaterRealmWorldCanvasHost
} from './createGreaterRealmWorldCanvasHost';
import {
  isCurrentGreaterRealmSceneSnapshot
} from './greaterRealmWorldSnapshotAuthority';
import { resolveGreaterRealmWorldViewPolicy } from './greaterRealmWorldViewPolicy';

export { isCurrentGreaterRealmSceneSnapshot } from './greaterRealmWorldSnapshotAuthority';

type BrowserPresentation = Readonly<{
  width: number;
  coarsePointer: boolean;
}>;

export const GREATER_REALM_RELEASE_REFRESH_INTERVAL_MILLISECONDS = 60_000;

function readWorkerControl(bridge: AvailableGreaterRealmProviderBridge) {
  try {
    return bridge.getWorkerControl?.();
  } catch {
    return undefined;
  }
}

function boundedPublicResources(
  locations: readonly GreaterRealmResourceLocationSummaryDto[] | undefined
) {
  if (locations === undefined) return Object.freeze([]);
  return Object.freeze(locations.slice(0, GREATER_REALM_MAXIMUM_RESOURCE_AFFORDANCES));
}

type GreaterRealmResourceSelection = Readonly<{
  locationId: string;
  atlasId: string;
  revision: bigint;
  source: readonly GreaterRealmResourceLocationSummaryDto[];
}>;

function readBrowserPresentation(): BrowserPresentation {
  if (typeof window === 'undefined') {
    return Object.freeze({ width: 1_280, coarsePointer: false });
  }
  return Object.freeze({
    width: Math.max(1, window.innerWidth || 1_280),
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches === true
  });
}

function useBrowserPresentation() {
  const [presentation, setPresentation] = useState(readBrowserPresentation);
  useEffect(() => {
    const pointer = window.matchMedia?.('(pointer: coarse)');
    const update = () => setPresentation(readBrowserPresentation());
    window.addEventListener('resize', update);
    pointer?.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('resize', update);
      pointer?.removeEventListener?.('change', update);
    };
  }, []);
  return presentation;
}

export type GreaterRealmWorldSceneProps = Readonly<{
  bridge: AvailableGreaterRealmProviderBridge;
  identityFid: number;
  identityKey: string;
  ownCastle: Readonly<{ castleId: number; q: number; r: number }>;
  resolvedGraphicsQuality?: GraphicsQualityTier;
  onPhaseChange: (phase: GreaterRealmClientPhase) => void;
}>;

/**
 * Generation- and identity-bound client scene. Every dependency that can
 * change authority or public-window policy disposes both controller lives.
 */
export function GreaterRealmWorldScene({
  bridge,
  identityFid,
  identityKey,
  ownCastle,
  resolvedGraphicsQuality,
  onPhaseChange
}: GreaterRealmWorldSceneProps) {
  const miniAppHost = useMiniAppHost();
  const reducedMotion = useReducedMotionPreference();
  const browser = useBrowserPresentation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasHostRef = useRef<GreaterRealmWorldCanvasHost | undefined>(undefined);
  const commandGenerationRef = useRef(0);
  const snapshotIdentityKeyRef = useRef<string | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<GreaterRealmClientSnapshot>();
  const [commandSnapshot, setCommandSnapshot] = useState<GreaterRealmClientSnapshot>();
  const [renderer, setRenderer] = useState<'loading' | 'webgl' | 'unavailable'>('loading');
  const [resourceSelection, setResourceSelection] =
    useState<GreaterRealmResourceSelection>();
  const [pendingWorkerId, setPendingWorkerId] = useState<string>();
  const [commandError, setCommandError] = useState(false);
  const policy = useMemo(() => resolveGreaterRealmWorldViewPolicy({
    atlasQ: ownCastle.q,
    atlasR: ownCastle.r,
    viewportWidth: browser.width,
    coarsePointer: browser.coarsePointer,
    farcasterMiniApp: miniAppHost.isMiniApp,
    resolvedGraphicsQuality,
    reducedMotion
  }), [
    browser.coarsePointer,
    browser.width,
    miniAppHost.isMiniApp,
    ownCastle.q,
    ownCastle.r,
    reducedMotion,
    resolvedGraphicsQuality
  ]);
  const snapshotCurrent = useMemo(() => (
    snapshotIdentityKeyRef.current === identityKey
    && snapshot !== undefined
    && isCurrentGreaterRealmSceneSnapshot({
      snapshot,
      sessionGeneration: bridge.sessionGeneration,
      ownCastle,
      view: policy
    })
      ? snapshot
      : undefined
  ), [
    bridge.sessionGeneration,
    identityKey,
    ownCastle.castleId,
    ownCastle.q,
    ownCastle.r,
    policy.centerQ,
    policy.centerR,
    policy.lod,
    policy.radius,
    snapshot
  ]);
  const commandSnapshotCurrent = useMemo(() => {
    if (
      snapshotIdentityKeyRef.current !== identityKey
      || commandSnapshot === undefined
    ) return undefined;
    if (commandSnapshot === snapshot) return snapshotCurrent;
    return isCurrentGreaterRealmSceneSnapshot({
      snapshot: commandSnapshot,
      sessionGeneration: bridge.sessionGeneration,
      ownCastle,
      view: policy
    }) ? commandSnapshot : undefined;
  }, [
    bridge.sessionGeneration,
    commandSnapshot,
    identityKey,
    ownCastle.castleId,
    ownCastle.q,
    ownCastle.r,
    policy.centerQ,
    policy.centerR,
    policy.lod,
    policy.radius,
    snapshot,
    snapshotCurrent
  ]);
  const currentSnapshotRef = useRef<GreaterRealmClientSnapshot | undefined>(undefined);
  currentSnapshotRef.current = snapshotCurrent;
  const publicResourceSource = snapshotCurrent?.resourceLocationPhase === 'ready'
    ? snapshotCurrent.resourceLocations
    : undefined;
  const publicResources = useMemo(
    () => boundedPublicResources(publicResourceSource),
    [publicResourceSource]
  );
  const resourceAtlasId = snapshotCurrent?.bootstrap?.atlasId;
  const resourceRevision = snapshotCurrent?.bootstrap?.revision;
  const selectedLocation = publicResources.find(
    (location) => (
      resourceSelection !== undefined
      && publicResourceSource !== undefined
      && resourceSelection.source === publicResourceSource
      && resourceSelection.atlasId === resourceAtlasId
      && resourceSelection.revision === resourceRevision
      && location.locationId === resourceSelection.locationId
    )
  );
  const workerBridge = bridge;
  const candidateWorkerControl = readWorkerControl(workerBridge);
  const identityFidAuthority = Number.isSafeInteger(identityFid) && identityFid > 0
    ? BigInt(identityFid)
    : undefined;
  const workerControl = identityFidAuthority !== undefined
    && snapshotCurrent?.bootstrap !== undefined
    && candidateWorkerControl?.value.roster.castleId === ownCastle.castleId
    && candidateWorkerControl.value.resourceState.fid === identityFidAuthority
    && candidateWorkerControl.atlasId === snapshotCurrent.bootstrap.atlasId
    && candidateWorkerControl.atlasRevision === snapshotCurrent.bootstrap.revision
      ? candidateWorkerControl
      : undefined;
  const idleWorker = workerControl?.value.roster.workers.find(
    (worker) => worker.status === 'idle'
  );
  const activeWorkers = workerControl?.value.roster.workers.filter(
    (worker) => worker.status !== 'idle'
  ) ?? [];
  const recallableWorkers = activeWorkers.filter(
    (worker) => worker.status === 'outbound' || worker.status === 'gathering'
  );
  const dispatchCurrent = commandSnapshotCurrent?.bootstrap !== undefined
    && commandSnapshotCurrent.bootstrap.mode === 'active'
    && workerControl?.value.resourceState.workerSystemMode === 'active'
    && workerControl.atlasId === commandSnapshotCurrent.bootstrap.atlasId
    && workerControl.atlasRevision === commandSnapshotCurrent.bootstrap.revision;
  const runWorkerCommand = (workerId: string, command: () => Promise<void>) => {
    const generation = commandGenerationRef.current;
    setPendingWorkerId(workerId);
    setCommandError(false);
    void Promise.resolve().then(command).catch(() => {
      if (commandGenerationRef.current === generation) setCommandError(true);
    }).finally(() => {
      if (commandGenerationRef.current === generation) setPendingWorkerId(undefined);
    });
  };

  useLayoutEffect(() => {
    setResourceSelection(undefined);
  }, [publicResourceSource, resourceAtlasId, resourceRevision]);

  useEffect(() => {
    commandGenerationRef.current += 1;
    setResourceSelection(undefined);
    setPendingWorkerId(undefined);
    setCommandError(false);
    return () => {
      commandGenerationRef.current += 1;
    };
  }, [
    bridge.sessionGeneration,
    identityKey,
    ownCastle.castleId,
    ownCastle.q,
    ownCastle.r,
    policy.centerQ,
    policy.centerR,
    policy.deviceClass,
    policy.graphicsProfile,
    policy.lod,
    policy.radius
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return undefined;
    setRenderer('loading');
    const host = createGreaterRealmWorldCanvasHost({
      canvas,
      atlasQ: ownCastle.q,
      atlasR: ownCastle.r,
      ownCastleId: ownCastle.castleId,
      policy,
      onTelemetry: (telemetry) => {
        canvas.dataset.greaterRealmUploadedChunks = String(
          telemetry.scene.uploadedChunkCount
        );
        canvas.dataset.greaterRealmSelectedChunks = String(
          telemetry.scene.selectedChunkCount
        );
        canvas.dataset.greaterRealmDrawCalls = String(telemetry.scene.drawCallCount);
        canvas.dataset.greaterRealmContextLost = String(telemetry.scene.contextLost);
        canvas.dataset.greaterRealmPublicCastles = String(telemetry.publicCastleCount);
        canvas.dataset.greaterRealmGrassPatches = String(telemetry.scene.grassPatchCount);
        canvas.dataset.greaterRealmNpcs = String(telemetry.scene.npcCount);
        canvas.dataset.greaterRealmWildlife = String(telemetry.scene.wildlifeCount);
        canvas.dataset.greaterRealmBoats = String(telemetry.scene.boatCount);
      },
      onFailure: () => setRenderer('unavailable')
    });
    canvasHostRef.current = host;
    setRenderer(host === undefined ? 'unavailable' : 'webgl');
    if (host !== undefined && currentSnapshotRef.current !== undefined) {
      host.applySnapshot(currentSnapshotRef.current);
    }
    return () => {
      if (canvasHostRef.current === host) canvasHostRef.current = undefined;
      host?.dispose();
    };
  }, [
    bridge.sessionGeneration,
    identityKey,
    ownCastle.castleId,
    ownCastle.q,
    ownCastle.r,
    policy.deviceClass,
    policy.graphicsProfile,
    policy.pixelRatioCap,
    policy.radius,
    policy.reducedMotion
  ]);

  useEffect(() => {
    if (snapshotCurrent !== undefined) {
      canvasHostRef.current?.applySnapshot(snapshotCurrent);
    }
  }, [snapshotCurrent]);

  useEffect(() => {
    let active = true;
    let initialLoadComplete = false;
    let refreshInFlight = false;
    let lastReleaseAttemptAt = Date.now();
    let runtime: ReturnType<typeof bridge.createRuntime> | undefined;
    let unsubscribe: (() => void) | undefined;
    let refreshTimer: number | undefined;
    const requestedView = Object.freeze({
      centerQ: policy.centerQ,
      centerR: policy.centerR,
      radius: policy.radius,
      lod: policy.lod
    });
    snapshotIdentityKeyRef.current = undefined;
    setResourceSelection(undefined);
    setSnapshot(undefined);
    setCommandSnapshot(undefined);
    onPhaseChange('idle');
    try {
      runtime = bridge.createRuntime({
        deviceClass: policy.deviceClass,
        graphicsProfile: policy.graphicsProfile
      });
      unsubscribe = runtime.subscribe((next) => {
        if (!active) return;
        const generationCurrent = next.sessionGeneration === bridge.sessionGeneration;
        const usable = generationCurrent && isCurrentGreaterRealmSceneSnapshot({
          snapshot: next,
          sessionGeneration: bridge.sessionGeneration,
          ownCastle,
          view: policy
        });
        if (!generationCurrent) {
          snapshotIdentityKeyRef.current = undefined;
          setResourceSelection(undefined);
          setSnapshot(undefined);
          setCommandSnapshot(undefined);
          onPhaseChange('failed');
          return;
        }
        if (usable) {
          snapshotIdentityKeyRef.current = identityKey;
          setSnapshot(next);
          setCommandSnapshot(next);
          onPhaseChange('ready');
          return;
        }
        // Refresh clears the controller while it obtains a new release. Keep
        // the last validated public atlas visible, but remove command authority
        // until a new exact ready snapshot arrives.
        setResourceSelection(undefined);
        setCommandSnapshot(undefined);
        onPhaseChange(next.phase === 'ready' ? 'failed' : next.phase);
      });
      void Promise.resolve().then(() => runtime!.loadView(requestedView)).catch(() => {
        if (active) {
          setResourceSelection(undefined);
          setCommandSnapshot(undefined);
          onPhaseChange('failed');
        }
      }).finally(() => {
        initialLoadComplete = true;
      });
      const refreshIfDue = () => {
        if (
          !active
          || !initialLoadComplete
          || refreshInFlight
          || document.hidden
          || runtime === undefined
          || Date.now() - lastReleaseAttemptAt
            < GREATER_REALM_RELEASE_REFRESH_INTERVAL_MILLISECONDS
        ) return;
        refreshInFlight = true;
        lastReleaseAttemptAt = Date.now();
        void Promise.resolve().then(() => runtime!.refreshRelease(requestedView)).catch(() => {
          if (active) {
            setResourceSelection(undefined);
            setCommandSnapshot(undefined);
            onPhaseChange('failed');
          }
        }).finally(() => {
          refreshInFlight = false;
        });
      };
      const visibilityChange = () => {
        if (!document.hidden) refreshIfDue();
      };
      document.addEventListener('visibilitychange', visibilityChange);
      refreshTimer = window.setInterval(
        refreshIfDue,
        GREATER_REALM_RELEASE_REFRESH_INTERVAL_MILLISECONDS
      );
      const removeRefreshListeners = () => {
        document.removeEventListener('visibilitychange', visibilityChange);
        if (refreshTimer !== undefined) window.clearInterval(refreshTimer);
      };
      return () => {
        active = false;
        removeRefreshListeners();
        unsubscribe?.();
        runtime?.dispose();
      };
    } catch {
      if (active) onPhaseChange('failed');
    }
    return () => {
      active = false;
      if (refreshTimer !== undefined) window.clearInterval(refreshTimer);
      unsubscribe?.();
      runtime?.dispose();
    };
  }, [
    bridge,
    bridge.sessionGeneration,
    identityKey,
    identityFid,
    onPhaseChange,
    ownCastle.castleId,
    ownCastle.q,
    ownCastle.r,
    policy.centerQ,
    policy.centerR,
    policy.deviceClass,
    policy.graphicsProfile,
    policy.lod,
    policy.radius
  ]);

  return (
    <div
      className="greater-realm-world"
      data-greater-realm-renderer={renderer}
      data-greater-realm-device-class={policy.deviceClass}
      data-greater-realm-graphics-profile={policy.graphicsProfile}
      data-greater-realm-window-center={`${policy.centerQ}:${policy.centerR}`}
      data-greater-realm-window-radius={policy.radius}
      data-greater-realm-lod={policy.lod}
      data-greater-realm-reduced-motion={policy.reducedMotion}
      data-greater-realm-farcaster={miniAppHost.isMiniApp}
    >
      <canvas
        ref={canvasRef}
        className="greater-realm-world__canvas"
        role="img"
        aria-label="Greater Realm public atlas"
        data-testid="greater-realm-world-canvas"
      />
      {publicResources.length === 0 && activeWorkers.length === 0 ? null : (
        <aside
          className="greater-realm-world__resources"
          aria-label={publicResources.length === 0
            ? 'Greater Realm Worker controls'
            : 'Nearby public resources'}
        >
          {publicResources.length === 0 ? null : (
            <>
              <strong>Nearby resources</strong>
              <div className="greater-realm-world__resource-list">
                {publicResources.map((location) => (
                  <button
                    key={location.locationId}
                    type="button"
                    aria-label={`${location.resourceKind} at ${location.atlasQ}, ${location.atlasR} · ${location.nodeCount} nodes`}
                    aria-pressed={selectedLocation?.locationId === location.locationId}
                    onClick={() => {
                      if (
                        publicResourceSource === undefined
                        || resourceAtlasId === undefined
                        || resourceRevision === undefined
                      ) return;
                      setResourceSelection(Object.freeze({
                        locationId: location.locationId,
                        atlasId: resourceAtlasId,
                        revision: resourceRevision,
                        source: publicResourceSource
                      }));
                      setCommandError(false);
                    }}
                  >
                    {location.resourceKind} · {location.nodeCount} nodes
                  </button>
                ))}
              </div>
              {selectedLocation === undefined ? null : (
                <div className="greater-realm-world__worker-command">
                  <span>
                    {selectedLocation.resourceKind} at {selectedLocation.atlasQ}, {selectedLocation.atlasR}
                  </span>
                  <button
                    type="button"
                    disabled={
                      pendingWorkerId !== undefined
                      || idleWorker === undefined
                      || workerBridge.dispatchWorker === undefined
                      || !dispatchCurrent
                    }
                    onClick={() => {
                      if (
                        idleWorker === undefined
                        || workerBridge.dispatchWorker === undefined
                        || workerControl === undefined
                        || !dispatchCurrent
                      ) return;
                      runWorkerCommand(idleWorker.workerId, () => workerBridge.dispatchWorker!({
                        workerId: idleWorker.workerId,
                        resourceKind: selectedLocation.resourceKind,
                        locationId: selectedLocation.locationId,
                        expectedRevision: workerControl.atlasRevision
                      }));
                    }}
                  >
                    {pendingWorkerId === undefined
                      ? idleWorker === undefined ? 'NO IDLE WORKER' : `SEND WORKER ${idleWorker.ordinal}`
                      : 'SENDING…'}
                  </button>
                </div>
              )}
            </>
          )}
          {activeWorkers.length === 0 ? null : (
            <div className="greater-realm-world__active-workers" aria-label="Active workers">
              {activeWorkers.map((worker) => (
                <button
                  key={worker.workerId}
                  type="button"
                  disabled={
                    pendingWorkerId !== undefined
                    || workerBridge.recallWorker === undefined
                    || worker.status === 'returning'
                  }
                  onClick={() => {
                    if (
                      workerBridge.recallWorker === undefined
                      || worker.status === 'returning'
                    ) return;
                    runWorkerCommand(worker.workerId, () => (
                      workerBridge.recallWorker!(worker.workerId)
                    ));
                  }}
                >
                  {worker.status === 'returning' ? 'WORKER' : 'RECALL WORKER'}
                  {' '}{worker.ordinal} · {worker.status}
                </button>
              ))}
              {recallableWorkers.length < 2 || workerBridge.recallAllWorkers === undefined ? null : (
                <button
                  type="button"
                  disabled={pendingWorkerId !== undefined}
                  onClick={() => {
                    runWorkerCommand('all', () => workerBridge.recallAllWorkers!());
                  }}
                >
                  RECALL ALL
                </button>
              )}
            </div>
          )}
          {commandError ? <span role="alert">Worker command was not accepted.</span> : null}
        </aside>
      )}
      {renderer === 'unavailable' ? (
        <p className="greater-realm-world__renderer-note" role="note">
          WebGL 2 is unavailable on this device. Public Realm controls do not depend on the canvas.
        </p>
      ) : null}
    </div>
  );
}

import {
  useLayoutEffect,
  useMemo,
  useRef,
  type RefObject,
  type CSSProperties
} from 'react';

import { CastleProfileAvatar } from './RealmCastleLabels';
import { castleProfileLabel } from './realmCastlePresentation';
import type { RealmWorkerSceneRecord } from './realmWorkerLayer';
import './RealmWorkerPresenceMarkers.css';

function documentFocusIsOrphaned(activeElement: Element | null) {
  return activeElement === null
    || activeElement === document.body
    || activeElement === document.documentElement
    || !activeElement.isConnected;
}

/**
 * Accessible portraits attached to wagons that are physically travelling.
 * Gathering portraits remain owned by the resource-node marker lane, so a
 * keeper is never represented at both the route and its destination.
 */
export function RealmWorkerPresenceMarkers({
  workers,
  visibleWorkerIds,
  selectedWorkerId,
  focusFallbackRef,
  onLayout,
  onHover,
  onSelect
}: Readonly<{
  workers: readonly RealmWorkerSceneRecord[];
  visibleWorkerIds: readonly string[];
  selectedWorkerId?: string;
  /** Stable Realm control used only when a focused moving portrait disappears. */
  focusFallbackRef?: RefObject<HTMLElement | null>;
  onLayout: () => void;
  onHover: (workerId: string | null) => void;
  onSelect: (worker: RealmWorkerSceneRecord) => void;
}>) {
  const focusedWorkerIdRef = useRef<string | null>(null);
  const workersById = useMemo(
    () => new Map(workers.map((worker) => [worker.workerId, worker] as const)),
    [workers]
  );
  const visibleWorkers = useMemo(() => {
    const seen = new Set<string>();
    return visibleWorkerIds.flatMap((workerId) => {
      if (seen.has(workerId)) return [];
      seen.add(workerId);
      const worker = workersById.get(workerId);
      return worker && (worker.status === 'outbound' || worker.status === 'returning')
        ? [worker]
        : [];
    });
  }, [visibleWorkerIds, workersById]);
  const visibleWorkerIdSet = useMemo(
    () => new Set(visibleWorkers.map((worker) => worker.workerId)),
    [visibleWorkers]
  );

  useLayoutEffect(() => {
    // React owns membership; the renderer owns moving coordinates. Reapply the
    // latest frame whenever a public snapshot changes the travelling roster.
    onLayout();
  }, [onLayout, visibleWorkers]);

  useLayoutEffect(() => {
    const focusedWorkerId = focusedWorkerIdRef.current;
    const activeElement = document.activeElement;
    if (
      focusedWorkerId === null
      || visibleWorkerIdSet.has(focusedWorkerId)
      || !documentFocusIsOrphaned(activeElement)
    ) return;
    focusedWorkerIdRef.current = null;
    onHover(null);
    const fallback = focusFallbackRef?.current;
    if (fallback?.isConnected) fallback.focus({ preventScroll: true });
  }, [focusFallbackRef, onHover, visibleWorkerIdSet]);

  return (
    <div
      aria-label="Workers travelling through the Realm"
      className="realm-worker-presence-markers"
      data-worker-presence-markers="true"
      role="group"
    >
      {visibleWorkers.map((worker) => {
        const keeperLabel = castleProfileLabel(worker.profile ?? {
          communityStatsVisible: false
        });
        const phaseLabel = worker.status === 'returning'
          ? 'returning to keep'
          : 'travelling to a resource node';
        return (
          <button
            aria-label={`${keeperLabel}, Worker ${worker.ordinal}, ${phaseLabel}`}
            className="realm-worker-presence-marker"
            data-owned-by-viewer={worker.ownedByViewer ? 'true' : 'false'}
            data-phase={worker.status}
            data-projected-visible="false"
            data-selected={selectedWorkerId === worker.workerId ? 'true' : 'false'}
            data-worker-presence-id={worker.workerId}
            data-warpkeep-sfx="none"
            key={worker.workerId}
            onBlur={() => onHover(null)}
            onClick={() => onSelect(worker)}
            onFocus={() => {
              focusedWorkerIdRef.current = worker.workerId;
              onHover(worker.workerId);
            }}
            onPointerEnter={() => onHover(worker.workerId)}
            onPointerLeave={() => onHover(null)}
            style={{
              '--realm-worker-presence-x': '0px',
              '--realm-worker-presence-y': '0px'
            } as CSSProperties}
            title={`${keeperLabel} · Worker ${worker.ordinal} · ${phaseLabel}`}
            type="button"
          >
            <CastleProfileAvatar
              profile={worker.profile ?? { communityStatsVisible: false }}
              size="compact"
            />
            <span
              aria-hidden="true"
              className="realm-worker-presence-marker__phase"
              title={worker.status === 'returning' ? 'Returning' : 'En route'}
            >
              {worker.status === 'returning' ? '↙' : '↗'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

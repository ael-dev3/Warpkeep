import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from 'react';

import type {
  RealmEconomicResourceKey
} from './realmResourcePresentation';
import {
  realmWorkerLabel,
  realmWorkerStatusLabel,
  type RealmWorkerPublicPresentation
} from './realmWorkerPresentation';
import './RealmNodeWorkerDispatch.css';

const RESOURCE_LABELS: Readonly<Record<RealmEconomicResourceKey, string>> = Object.freeze({
  food: 'Food',
  wood: 'Wood',
  stone: 'Stone',
  gold: 'Gold'
});

export type RealmNodeWorkerDispatchHandler = (
  workerId: string,
  resourceKind: RealmEconomicResourceKey,
  siteId: string
) => Promise<void>;

export type RealmNodeWorkerDispatchProps = Readonly<{
  id: string;
  resourceKind: RealmEconomicResourceKey;
  siteId: string;
  workers: readonly RealmWorkerPublicPresentation[];
  onDispatchWorker: RealmNodeWorkerDispatchHandler;
  /** Stable inspector control used only to recover genuinely orphaned focus. */
  focusFallbackRef?: RefObject<HTMLButtonElement | null>;
}>;

type DispatchTarget = Readonly<{
  workerId: string;
  resourceKind: RealmEconomicResourceKey;
  siteId: string;
  workerLifecycle: string;
}>;

type DispatchState =
  | Readonly<{ phase: 'idle' }>
  | (Readonly<{ phase: 'submitting' | 'submitted' | 'failed' }> & DispatchTarget);

function workerLifecycleFingerprint(worker: RealmWorkerPublicPresentation) {
  return [
    worker.workerId,
    worker.status,
    worker.resourceKind ?? '',
    worker.siteId ?? '',
    worker.timelineRevision.toString(),
    worker.revision.toString()
  ].join('\u0000');
}

function exactOwnerRoster(
  workers: readonly RealmWorkerPublicPresentation[]
): readonly RealmWorkerPublicPresentation[] | undefined {
  const ordinals = workers.map((worker) => worker.ordinal).sort((left, right) => left - right);
  if (
    workers.length !== 4
    || workers.some((worker) => !worker.ownedByViewer)
    || new Set(workers.map((worker) => worker.workerId)).size !== 4
    || ordinals.join(',') !== '1,2,3,4'
    || new Set(workers.map((worker) => worker.originCastleId)).size !== 1
  ) return undefined;
  return [...workers].sort((left, right) => left.ordinal - right.ordinal);
}

/**
 * A map-local command surface. The caller supplies one validated canonical
 * resource node; the player can choose only from the exact owner roster.
 */
export function RealmNodeWorkerDispatch({
  id,
  resourceKind,
  siteId,
  workers,
  onDispatchWorker,
  focusFallbackRef
}: RealmNodeWorkerDispatchProps) {
  const [state, setState] = useState<DispatchState>({ phase: 'idle' });
  const [commandInFlight, setCommandInFlight] = useState(false);
  const dispatchRootRef = useRef<HTMLElement>(null);
  const commandInFlightRef = useRef(false);
  const commandSequenceRef = useRef(0);
  const activeCommandRef = useRef<number | undefined>(undefined);
  const mountedRef = useRef(true);
  const latestCommandContextRef = useRef({ resourceKind, siteId, workers });
  latestCommandContextRef.current = { resourceKind, siteId, workers };
  const roster = useMemo(() => exactOwnerRoster(workers), [workers]);
  const rosterRevision = workers
    .map(workerLifecycleFingerprint)
    .sort()
    .join('|');
  const statusId = `${id}-worker-dispatch-status`;
  const resourceLabel = RESOURCE_LABELS[resourceKind];

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeCommandRef.current = undefined;
      commandInFlightRef.current = false;
    };
  }, []);

  useEffect(() => {
    setState((current) => {
      if (current.phase === 'idle') return current;
      if (
        !roster
        || current.resourceKind !== resourceKind
        || current.siteId !== siteId
      ) return { phase: 'idle' };
      const targetedWorker = roster.find((worker) => worker.workerId === current.workerId);
      return targetedWorker
        && workerLifecycleFingerprint(targetedWorker) === current.workerLifecycle
        ? current
        : { phase: 'idle' };
    });
  }, [resourceKind, roster, rosterRevision, siteId]);

  useLayoutEffect(() => {
    const dispatchRoot = dispatchRootRef.current;
    return () => {
      const activeElement = document.activeElement;
      if (
        !dispatchRoot
        || !activeElement
        || !dispatchRoot.contains(activeElement)
      ) return;

      queueMicrotask(() => {
        const fallback = focusFallbackRef?.current;
        const current = document.activeElement;
        const focusIsOrphaned = current === null
          || current === document.body
          || current === document.documentElement
          || !current.isConnected;
        if (fallback?.isConnected && focusIsOrphaned) {
          fallback.focus({ preventScroll: true });
        }
      });
    };
  }, [focusFallbackRef, roster !== undefined]);

  if (!roster) {
    return (
      <p className="realm-node-worker-dispatch__unavailable" role="status">
        Your authoritative four-worker roster is unavailable. Dispatch remains closed.
      </p>
    );
  }

  const dispatch = async (worker: RealmWorkerPublicPresentation) => {
    if (
      worker.status !== 'idle'
      || commandInFlightRef.current
      || state.phase === 'submitting'
      || state.phase === 'submitted'
    ) return;
    const commandId = commandSequenceRef.current + 1;
    commandSequenceRef.current = commandId;
    activeCommandRef.current = commandId;
    const target: DispatchTarget = Object.freeze({
      workerId: worker.workerId,
      resourceKind,
      siteId,
      workerLifecycle: workerLifecycleFingerprint(worker)
    });
    commandInFlightRef.current = true;
    setCommandInFlight(true);
    setState({ phase: 'submitting', ...target });
    const targetStillCurrent = () => {
      const latest = latestCommandContextRef.current;
      const latestWorker = exactOwnerRoster(latest.workers)?.find(
        (candidate) => candidate.workerId === target.workerId
      );
      return latest.resourceKind === target.resourceKind
        && latest.siteId === target.siteId
        && latestWorker !== undefined
        && workerLifecycleFingerprint(latestWorker) === target.workerLifecycle;
    };
    try {
      await onDispatchWorker(worker.workerId, resourceKind, siteId);
      if (
        !mountedRef.current
        || activeCommandRef.current !== commandId
        || !targetStillCurrent()
      ) return;
      setState({ phase: 'submitted', ...target });
    } catch {
      if (
        !mountedRef.current
        || activeCommandRef.current !== commandId
        || !targetStillCurrent()
      ) return;
      setState({ phase: 'failed', ...target });
    } finally {
      if (activeCommandRef.current === commandId) {
        activeCommandRef.current = undefined;
        commandInFlightRef.current = false;
        if (mountedRef.current) setCommandInFlight(false);
      }
    }
  };

  return (
    <section
      aria-labelledby={`${id}-worker-dispatch-title`}
      className="realm-node-worker-dispatch"
      ref={dispatchRootRef}
    >
      <div className="realm-node-worker-dispatch__heading">
        <p>KEEP WORKERS</p>
        <h3 id={`${id}-worker-dispatch-title`}>Send a worker for {resourceLabel}</h3>
      </div>
      <p className="realm-node-worker-dispatch__guidance">
        Choose a ready worker. Busy workers remain visible but cannot be reassigned.
      </p>
      <ol aria-label={`Your workers for this ${resourceLabel} site`}>
        {roster.map((worker) => {
          const submitting = state.phase === 'submitting' && state.workerId === worker.workerId;
          const ready = worker.status === 'idle';
          const disabled = !ready
            || commandInFlight
            || state.phase === 'submitting'
            || state.phase === 'submitted';
          return (
            <li key={worker.workerId}>
              <button
                aria-describedby={statusId}
                aria-label={`${realmWorkerLabel(worker.ordinal)} — ${
                  submitting ? 'DISPATCHING' : realmWorkerStatusLabel(worker)
                }`}
                data-worker-status={worker.status}
                disabled={disabled}
                onClick={() => void dispatch(worker)}
                type="button"
              >
                <span aria-hidden="true" className="realm-node-worker-dispatch__ordinal">
                  {worker.ordinal}
                </span>
                <span className="realm-node-worker-dispatch__identity">
                  <strong>{realmWorkerLabel(worker.ordinal)}</strong>
                  <small>{submitting ? 'DISPATCHING…' : realmWorkerStatusLabel(worker)}</small>
                </span>
                <span aria-hidden="true" className="realm-node-worker-dispatch__availability">
                  {ready ? 'SEND' : 'BUSY'}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p
        aria-live="polite"
        className="realm-node-worker-dispatch__status"
        id={statusId}
        role={state.phase === 'failed' ? 'alert' : 'status'}
      >
        {state.phase === 'submitted'
          ? 'Command sent. Awaiting the authoritative Realm assignment.'
          : state.phase === 'failed'
            ? 'The Realm could not confirm this assignment. The ready worker may be tried again.'
            : 'Assignment begins only after the Realm confirms the selected worker and node.'}
      </p>
    </section>
  );
}

import { useEffect, useRef, useState, type Ref } from 'react';

import { useModalFocusBoundary } from '../menu/useModalFocusBoundary';
import {
  realmWorkerCanRecall,
  realmWorkerLabel,
  realmWorkerStatusLabel,
  type RealmWorkerDestinationPresentation,
  type RealmWorkerPublicPresentation
} from './realmWorkerPresentation';
import './WorkerInspectionPanel.css';

function publicAssetUrl(path: string) {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`;
}

export type WorkerInspectionPanelProps = Readonly<{
  id: string;
  worker: RealmWorkerPublicPresentation;
  destinations: readonly RealmWorkerDestinationPresentation[];
  onDispatchWorker?: (
    workerId: string,
    destination: RealmWorkerDestinationPresentation
  ) => Promise<void>;
  onRecallWorker?: (workerId: string) => Promise<void>;
  onRequestClose: () => void;
  focusTargetRef?: Ref<HTMLHeadingElement>;
}>;

export function WorkerInspectionPanel({
  id,
  worker,
  destinations,
  onDispatchWorker,
  onRecallWorker,
  onRequestClose,
  focusTargetRef
}: WorkerInspectionPanelProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [state, setState] = useState<'idle' | 'dispatching' | 'recalling' | 'failed'>('idle');
  const [selectedDestinationKey, setSelectedDestinationKey] = useState('');
  const commandPending = state === 'dispatching' || state === 'recalling';
  const canRecall = realmWorkerCanRecall(worker) && onRecallWorker !== undefined;
  const canDispatch = worker.ownedByViewer
    && worker.status === 'idle'
    && onDispatchWorker !== undefined
    && destinations.length > 0;
  const selectedDestination = destinations.find((destination) => (
    `${destination.resourceKind}|${destination.siteId}` === selectedDestinationKey
  ));
  useModalFocusBoundary({
    dialogRef,
    initialFocusRef: headingRef,
    onEscape: () => {
      if (!commandPending) onRequestClose();
    }
  });

  useEffect(() => {
    setState((current) => (
      current === 'dispatching' || current === 'recalling' ? current : 'idle'
    ));
    if (worker.status !== 'idle') setSelectedDestinationKey('');
  }, [worker.workerId, worker.status, worker.revision]);

  const assignHeadingRef = (element: HTMLHeadingElement | null) => {
    headingRef.current = element;
    if (typeof focusTargetRef === 'function') focusTargetRef(element);
    else if (focusTargetRef) focusTargetRef.current = element;
  };

  const dispatch = async () => {
    if (!canDispatch || !selectedDestination || state === 'dispatching' || !onDispatchWorker) return;
    setState('dispatching');
    try {
      await onDispatchWorker(worker.workerId, selectedDestination);
      setState('idle');
    } catch {
      setState('failed');
    }
  };

  const recall = async () => {
    if (!canRecall || !onRecallWorker || state === 'recalling') return;
    setState('recalling');
    try {
      await onRecallWorker(worker.workerId);
      setState('idle');
    } catch {
      setState('failed');
    }
  };

  const title = realmWorkerLabel(worker.ordinal);
  return (
    <aside
      aria-labelledby={`${id}-title`}
      aria-modal="true"
      className="worker-inspection realm-camera-neutral-inspector"
      id={id}
      ref={dialogRef}
      role="dialog"
    >
      <div aria-hidden="true" className="worker-inspection__art-stage">
        <img
          alt=""
          className="worker-inspection__hero-art"
          decoding="async"
          draggable={false}
          height="1024"
          src={publicAssetUrl('images/realm/hegemony-worker-record.webp')}
          width="1024"
        />
      </div>
      <div className="worker-inspection__drawer">
        <header className="worker-inspection__hero">
          <button
            aria-label="Back to workers"
            className="worker-inspection__dismiss"
            disabled={commandPending}
            onClick={onRequestClose}
            type="button"
          >×</button>
          <div className="worker-inspection__title-lockup">
            <p>CASTLE WORKER</p>
            <h2 id={`${id}-title`} ref={assignHeadingRef} tabIndex={-1}>{title}</h2>
          </div>
        </header>
        <div className="worker-inspection__body">
          <p className="worker-inspection__description">
            A permanent attendant of your keep. Commands and cargo settle only through the Realm.
          </p>
          <dl className="worker-inspection__fields">
            <div><dt>Origin keep</dt><dd>{worker.originCastleName}</dd></div>
            <div><dt>Status</dt><dd>{realmWorkerStatusLabel(worker)}</dd></div>
            {worker.resourceKind ? (
              <div><dt>Assignment</dt><dd>{worker.resourceKind.toUpperCase()}</dd></div>
            ) : null}
          </dl>
          {!worker.ownedByViewer ? (
            <p className="worker-inspection__read-only">
              Read-only public identity. Commands belong to the owning keeper.
            </p>
          ) : null}
          {canDispatch ? (
            <div className="worker-inspection__dispatch">
              <label htmlFor={`${id}-destination`}>ASSIGN TO RESOURCE SITE</label>
              <select
                disabled={commandPending}
                id={`${id}-destination`}
                onChange={(event) => {
                  setSelectedDestinationKey(event.currentTarget.value);
                  if (state === 'failed') setState('idle');
                }}
                value={selectedDestinationKey}
              >
                <option value="">Choose a destination</option>
                {destinations.map((destination) => (
                  <option
                    key={`${destination.resourceKind}:${destination.siteId}`}
                    value={`${destination.resourceKind}|${destination.siteId}`}
                  >
                    {destination.label}
                  </option>
                ))}
              </select>
              <button
                disabled={commandPending || selectedDestination === undefined}
                onClick={() => void dispatch()}
                type="button"
              >
                {state === 'dispatching' ? 'ASSIGNING…' : 'ASSIGN WORKER'}
              </button>
            </div>
          ) : null}
          {worker.status === 'idle' && worker.ownedByViewer && destinations.length === 0 ? (
            <p className="worker-inspection__read-only">No compatible unoccupied resource site is available.</p>
          ) : null}
          {canRecall ? (
            <button
              className="worker-inspection__recall"
              disabled={commandPending}
              onClick={() => void recall()}
              type="button"
            >
              {state === 'recalling' ? 'RETURNING…' : 'RETURN TO KEEP'}
            </button>
          ) : null}
          {state === 'failed' ? (
            <p className="worker-inspection__error" role="alert">
              The command could not be confirmed. Try the same action again.
            </p>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

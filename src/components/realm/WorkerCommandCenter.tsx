import { useEffect, useRef, useState } from 'react';
import {
  realmWorkerCanRecall,
  realmWorkerLabel,
  realmWorkerStatusLabel,
  workerAvailabilityCount,
  type RealmWorkerPublicPresentation,
  type WorkerRosterPresentation
} from './realmWorkerPresentation';
import './WorkerCommandCenter.css';

export type WorkerCommandCenterProps = Readonly<{
  id: string;
  workers: readonly RealmWorkerPublicPresentation[];
  roster?: WorkerRosterPresentation;
  onRecallWorker?: (workerId: string) => Promise<void>;
  onRecallAllWorkers?: () => Promise<void>;
  onSelectWorker: (worker: RealmWorkerPublicPresentation) => void;
  onClose: () => void;
}>;

export function WorkerCommandCenter({ id, workers, roster, onRecallWorker, onRecallAllWorkers, onSelectWorker, onClose }: WorkerCommandCenterProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [recallingAll, setRecallingAll] = useState(false);
  const available = workerAvailabilityCount(workers);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [id]);
  const recallAll = async () => {
    if (!onRecallAllWorkers || recallingAll) return;
    setRecallingAll(true);
    try { await onRecallAllWorkers(); } finally { setRecallingAll(false); }
  };
  return (
    <div className="worker-command-center__scrim" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-labelledby={`${id}-title`} aria-modal="true" className="worker-command-center" id={id} role="dialog">
        <header className="worker-command-center__header">
          <div><p>KEEP AUTHORITY</p><h2 id={`${id}-title`} ref={headingRef} tabIndex={-1}>WORKERS</h2><span>{available}/4 available</span></div>
          <button aria-label="Close workers" onClick={onClose} type="button">×</button>
        </header>
        <p className="worker-command-center__summary">Four permanent attendants. Select a worker to inspect identity, timing, and owner-only commands.</p>
        <ol className="worker-command-center__roster" aria-label="Worker roster">
          {workers.slice().sort((a, b) => a.ordinal - b.ordinal).map((worker) => {
            const privateWorker = roster?.workers.find((candidate) => candidate.workerId === worker.workerId);
            const canRecall = realmWorkerCanRecall(worker) && onRecallWorker !== undefined;
            return <li key={worker.workerId}>
              <button className="worker-command-center__worker" onClick={() => onSelectWorker(worker)} type="button">
                <span className="worker-command-center__ordinal">{worker.ordinal}</span>
                <span className="worker-command-center__identity"><strong>{realmWorkerLabel(worker.ordinal)}</strong><small>{realmWorkerStatusLabel(worker)}</small></span>
                <span className="worker-command-center__amount">{privateWorker?.availableAmount !== undefined ? `${privateWorker.availableAmount}` : worker.ownedByViewer ? 'OWNER' : 'PUBLIC'}</span>
              </button>
              {canRecall ? <button className="worker-command-center__recall" onClick={() => void onRecallWorker(worker.workerId).catch(() => undefined)} type="button">RETURN</button> : null}
            </li>;
          })}
        </ol>
        <footer className="worker-command-center__footer">
          <button disabled={!onRecallAllWorkers || recallingAll} onClick={() => void recallAll()} type="button">{recallingAll ? 'RETURNING…' : 'RETURN ALL TO KEEP'}</button>
        </footer>
      </section>
    </div>
  );
}

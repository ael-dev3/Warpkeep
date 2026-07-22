import { useRef, useState } from 'react';

import { useModalFocusBoundary } from '../menu/useModalFocusBoundary';
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
  roster: WorkerRosterPresentation;
  onRecallWorker?: (workerId: string) => Promise<void>;
  onRecallAllWorkers?: () => Promise<void>;
  onSelectWorker: (worker: RealmWorkerPublicPresentation) => void;
  onClose: () => void;
}>;

type PendingCommand = 'all' | string | undefined;

function privateAmountLabel(worker: WorkerRosterPresentation['workers'][number]) {
  const unit = worker.resourceKind
    ? `${worker.resourceKind.slice(0, 1).toUpperCase()}${worker.resourceKind.slice(1)}`
    : 'resource units';
  return `${worker.availableAmount.toString()} ${unit}`;
}

export function WorkerCommandCenter({
  id,
  workers,
  roster,
  onRecallWorker,
  onRecallAllWorkers,
  onSelectWorker,
  onClose
}: WorkerCommandCenterProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [pendingCommand, setPendingCommand] = useState<PendingCommand>(undefined);
  const [commandFailed, setCommandFailed] = useState(false);
  const available = workerAvailabilityCount(workers);
  const hasRecallableWorker = workers.some(realmWorkerCanRecall);
  useModalFocusBoundary({
    dialogRef,
    initialFocusRef: headingRef,
    onEscape: () => {
      if (pendingCommand === undefined) onClose();
    }
  });

  const recall = async (workerId: string) => {
    if (!onRecallWorker || pendingCommand !== undefined) return;
    setPendingCommand(workerId);
    setCommandFailed(false);
    try {
      await onRecallWorker(workerId);
    } catch {
      setCommandFailed(true);
    } finally {
      setPendingCommand(undefined);
    }
  };

  const recallAll = async () => {
    if (!onRecallAllWorkers || pendingCommand !== undefined) return;
    setPendingCommand('all');
    setCommandFailed(false);
    try {
      await onRecallAllWorkers();
    } catch {
      setCommandFailed(true);
    } finally {
      setPendingCommand(undefined);
    }
  };

  return (
    <div
      className="worker-command-center__scrim"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && pendingCommand === undefined) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby={`${id}-title`}
        aria-modal="true"
        className="worker-command-center"
        id={id}
        ref={dialogRef}
        role="dialog"
      >
        <header className="worker-command-center__header">
          <div>
            <p>KEEP AUTHORITY</p>
            <h2 id={`${id}-title`} ref={headingRef} tabIndex={-1}>WORKERS</h2>
            <span>{available}/4 available</span>
          </div>
          <button
            aria-label="Back to Realm menu"
            disabled={pendingCommand !== undefined}
            onClick={onClose}
            type="button"
          >×</button>
        </header>
        <p className="worker-command-center__summary">
          Four permanent attendants of your keep. Select one to inspect or assign it.
        </p>
        {commandFailed ? (
          <p className="worker-command-center__error" role="alert">
            The command could not be confirmed. Try the same action again.
          </p>
        ) : null}
        <ol className="worker-command-center__roster" aria-label="Your four workers">
          {workers.map((worker) => {
            const privateWorker = roster.workers.find((candidate) => candidate.workerId === worker.workerId)!;
            const availableAmountLabel = privateAmountLabel(privateWorker);
            const canRecall = realmWorkerCanRecall(worker) && onRecallWorker !== undefined;
            const recalling = pendingCommand === worker.workerId;
            return (
              <li key={worker.workerId}>
                <button
                  className="worker-command-center__worker"
                  disabled={pendingCommand !== undefined}
                  onClick={() => onSelectWorker(worker)}
                  type="button"
                >
                  <span className="worker-command-center__ordinal">{worker.ordinal}</span>
                  <span className="worker-command-center__identity">
                    <strong>{realmWorkerLabel(worker.ordinal)}</strong>
                    <small>{realmWorkerStatusLabel(worker)}</small>
                  </span>
                  <span
                    aria-label={`${availableAmountLabel} available`}
                    className="worker-command-center__amount"
                  >{availableAmountLabel}</span>
                </button>
                {canRecall ? (
                  <button
                    className="worker-command-center__recall"
                    disabled={pendingCommand !== undefined}
                    onClick={() => void recall(worker.workerId)}
                    type="button"
                  >
                    {recalling ? 'RETURNING…' : 'RETURN'}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>
        <footer className="worker-command-center__footer">
          <button
            disabled={!onRecallAllWorkers || pendingCommand !== undefined || !hasRecallableWorker}
            onClick={() => void recallAll()}
            type="button"
          >
            {pendingCommand === 'all' ? 'RETURNING…' : 'RETURN ALL TO KEEP'}
          </button>
        </footer>
      </section>
    </div>
  );
}

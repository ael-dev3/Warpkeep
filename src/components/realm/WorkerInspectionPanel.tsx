import { useEffect, useRef, useState, type Ref } from 'react';
import {
  realmWorkerCanRecall,
  realmWorkerLabel,
  realmWorkerStatusLabel,
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
  onRecallWorker?: (workerId: string) => Promise<void>;
  onRequestClose: () => void;
  focusTargetRef?: Ref<HTMLButtonElement>;
}>;

export function WorkerInspectionPanel({ id, worker, onRecallWorker, onRequestClose, focusTargetRef }: WorkerInspectionPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<'idle' | 'submitting' | 'failed'>('idle');
  const canRecall = realmWorkerCanRecall(worker) && onRecallWorker !== undefined;
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    setState('idle');
  }, [id, worker.workerId, worker.status]);
  const recall = async () => {
    if (!canRecall || !onRecallWorker) return;
    setState('submitting');
    try { await onRecallWorker(worker.workerId); setState('idle'); }
    catch { setState('failed'); }
  };
  const ref = (element: HTMLButtonElement | null) => {
    closeRef.current = element;
    if (typeof focusTargetRef === 'function') focusTargetRef(element);
    else if (focusTargetRef) focusTargetRef.current = element;
  };
  const title = realmWorkerLabel(worker.ordinal);
  return (
    <aside aria-labelledby={`${id}-title`} className="worker-inspection" id={id} role="dialog">
      <div aria-hidden="true" className="worker-inspection__art-stage">
        <img alt="" className="worker-inspection__hero-art" decoding="async" draggable={false} height="1024" src={publicAssetUrl('images/realm/hegemony-worker-record.webp')} width="1024" />
      </div>
      <div className="worker-inspection__drawer">
        <header className="worker-inspection__hero">
          <button aria-label="Close worker record" className="worker-inspection__dismiss" onClick={onRequestClose} ref={ref} type="button">×</button>
          <div className="worker-inspection__title-lockup"><p>CASTLE WORKER</p><h2 id={`${id}-title`}>{title}</h2></div>
        </header>
        <div className="worker-inspection__body">
          <p className="worker-inspection__description">Permanent attendants of a keep. Commands and cargo settle only through the server.</p>
          <dl className="worker-inspection__fields">
            <div><dt>Origin keep</dt><dd>{worker.originCastleName}</dd></div>
            <div><dt>Status</dt><dd>{realmWorkerStatusLabel(worker)}</dd></div>
            {worker.resourceKind ? <div><dt>Assignment</dt><dd>{worker.resourceKind.toUpperCase()}</dd></div> : null}
          </dl>
          {!worker.ownedByViewer ? <p className="worker-inspection__read-only">Read-only public identity. Private cargo and commands belong to the owning keeper.</p> : null}
          {canRecall ? <button className="worker-inspection__recall" disabled={state === 'submitting'} onClick={() => void recall()} type="button">{state === 'submitting' ? 'RETURNING…' : state === 'failed' ? 'TRY RETURN AGAIN' : 'RETURN TO KEEP'}</button> : null}
        </div>
      </div>
    </aside>
  );
}

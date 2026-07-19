import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref
} from 'react';

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

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

function InspectionField({
  label,
  children
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="worker-inspection__field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function formatClaimableAmount(amount: bigint | undefined) {
  if (amount === undefined) return undefined;
  return amount.toLocaleString('en-US');
}

export type WorkerInspectionPanelProps = Readonly<{
  id: string;
  /** Public worker identity plus caller-only fields already gated by the provider. */
  worker: RealmWorkerPublicPresentation;
  /** Owner-only server-authoritative recall boundary. */
  onRecallWorker?: (workerId: string) => Promise<void>;
  /** Owner-only server-authoritative collection boundary. */
  onCollectWorker?: (workerId: string) => Promise<void>;
  onRequestClose: () => void;
  focusTargetRef?: Ref<HTMLButtonElement>;
}>;

/**
 * One privacy-safe worker inspector. The illustration is decorative and never
 * supplies identity, route, cargo, assignment, or reducer authority.
 */
export function WorkerInspectionPanel({
  id,
  worker,
  onRecallWorker,
  onCollectWorker,
  onRequestClose,
  focusTargetRef
}: WorkerInspectionPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [recallState, setRecallState] = useState<'idle' | 'submitting' | 'failed'>('idle');
  const [collectState, setCollectState] = useState<'idle' | 'submitting' | 'failed'>('idle');
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const canRecall = realmWorkerCanRecall(worker) && onRecallWorker !== undefined;
  const claimableAmount = worker.ownedByViewer
    ? formatClaimableAmount(worker.claimableAmount)
    : undefined;
  const canCollect = worker.ownedByViewer
    && worker.claimableAmount !== undefined
    && worker.claimableAmount > 0n
    && onCollectWorker !== undefined;

  const setCloseButtonRef = useCallback((element: HTMLButtonElement | null) => {
    closeButtonRef.current = element;
    assignRef(focusTargetRef, element);
  }, [focusTargetRef]);

  useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
  }, [id, worker.workerId]);

  useEffect(() => {
    setRecallState('idle');
    setCollectState('idle');
  }, [worker.status, worker.workerId]);

  const recall = useCallback(async () => {
    if (!canRecall || !onRecallWorker) return;
    setRecallState('submitting');
    try {
      await onRecallWorker(worker.workerId);
      setRecallState('idle');
    } catch {
      setRecallState('failed');
    }
  }, [canRecall, onRecallWorker, worker.workerId]);

  const collect = useCallback(async () => {
    if (!canCollect || !onCollectWorker) return;
    setCollectState('submitting');
    try {
      await onCollectWorker(worker.workerId);
      setCollectState('idle');
    } catch {
      setCollectState('failed');
    }
  }, [canCollect, onCollectWorker, worker.workerId]);

  const workerName = realmWorkerLabel(worker.ordinal);
  const statusLabel = realmWorkerStatusLabel(worker);
  const recallLabel = recallState === 'submitting'
    ? 'RETURNING…'
    : recallState === 'failed'
      ? 'TRY RETURN AGAIN'
      : 'RETURN TO KEEP';
  const collectLabel = collectState === 'submitting'
    ? 'COLLECTING…'
    : collectState === 'failed'
      ? 'TRY COLLECT AGAIN'
      : 'COLLECT';

  return (
    <aside
      id={id}
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="false"
      className="worker-inspection"
      data-open="true"
      role="dialog"
    >
      <div aria-hidden="true" className="worker-inspection__art-stage">
        <img
          alt=""
          aria-hidden="true"
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
            ref={setCloseButtonRef}
            aria-label="CLOSE WORKER RECORD"
            className="worker-inspection__dismiss"
            onClick={onRequestClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
          <div className="worker-inspection__title-lockup">
            <p>CASTLE WORKER</p>
            <h2 id={titleId}>{workerName}</h2>
          </div>
        </header>

        <div className="worker-inspection__body">
          <p id={descriptionId} className="worker-inspection__description">
            Workers are permanent attendants of a keep. Each worker holds one
            assignment at a time and returns only through server-confirmed timing.
          </p>
          <dl className="worker-inspection__fields" aria-label={`${workerName} details`}>
            <InspectionField label="Origin keep">{worker.originCastleName}</InspectionField>
            <InspectionField label="Status">{statusLabel}</InspectionField>
            {worker.resourceKind ? (
              <InspectionField label="Assignment">
                {worker.destinationLabel ?? worker.resourceKind.toUpperCase()}
              </InspectionField>
            ) : null}
            {worker.ownedByViewer && claimableAmount !== undefined ? (
              <InspectionField label="Claimable cargo">{claimableAmount}</InspectionField>
            ) : null}
          </dl>

          {!worker.ownedByViewer ? (
            <p className="worker-inspection__read-only">
              Serving {worker.originCastleName}. This view is read-only; private cargo and
              worker commands belong only to the owning keeper.
            </p>
          ) : null}

          {worker.ownedByViewer && (canCollect || canRecall) ? (
            <div className="worker-inspection__actions">
              {canCollect ? (
                <button
                  disabled={collectState === 'submitting'}
                  onClick={() => void collect()}
                  type="button"
                >
                  {collectLabel}
                </button>
              ) : null}
              {canRecall ? (
                <button
                  disabled={recallState === 'submitting'}
                  onClick={() => void recall()}
                  type="button"
                >
                  {recallLabel}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

import { useEffect, useMemo, useRef, useState, type Ref } from 'react';

import { normalizePublicProfileText } from '../../security/publicProfileText';
import { useModalFocusBoundary } from '../menu/useModalFocusBoundary';
import { CastleProfileAvatar } from './RealmCastleLabels';
import { useRealmRemainingDuration } from './realmAuthoritySchedule';
import {
  castleProfileLabel,
  castleProfileUsername,
  normalizeRealmUsername,
  safeRealmProfileImageUrl,
  type RealmCastlePublicPresentation
} from './realmCastlePresentation';
import { RESOURCE_KIND_LABELS } from './realmResourceOccupantPresentation';
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
  /**
   * Public profile already joined through `publicProfileForCastle`. This
   * surface re-sanitizes the narrow identity fields and fails to the neutral
   * Hegemony presentation when the join is absent.
   */
  keeperProfile?: RealmCastlePublicPresentation;
  /** Optional canonical display name for the assigned node; opaque site IDs stay hidden. */
  resourceTargetLabel?: string;
  /** Read-only camera command. Idle workers resolve to their origin keep. */
  onLocateWorker?: (workerId: string) => void;
  /** Centers the worker's keeper without changing the current camera zoom. */
  onLocateKeeper?: (castleId: number) => void;
  onRecallWorker?: (workerId: string) => Promise<void>;
  onRequestClose: () => void;
  focusTargetRef?: Ref<HTMLHeadingElement>;
}>;

function sanitizeWorkerKeeperProfile(
  profile: RealmCastlePublicPresentation | undefined
): RealmCastlePublicPresentation {
  const canonicalUsername = normalizeRealmUsername(profile?.canonicalUsername);
  const displayName = normalizePublicProfileText(profile?.displayName, 80);
  const pfpUrl = safeRealmProfileImageUrl(profile?.pfpUrl);
  const publicBio = normalizePublicProfileText(profile?.publicBio, 320);
  return Object.freeze({
    ...(canonicalUsername === undefined ? {} : { canonicalUsername }),
    ...(displayName === undefined ? {} : { displayName }),
    ...(pfpUrl === undefined ? {} : { pfpUrl }),
    ...(publicBio === undefined ? {} : { publicBio }),
    communityStatsVisible: false
  });
}

function workerAuthoritySchedule(worker: RealmWorkerPublicPresentation) {
  if (worker.status === 'outbound') {
    return Object.freeze({
      label: 'Arrival time left',
      deadlineMicros: worker.arrivesAtMicros
    });
  }
  if (worker.status === 'gathering') {
    return Object.freeze({
      label: 'Gathering time left',
      deadlineMicros: worker.gatheringEndsAtMicros
    });
  }
  if (worker.status === 'returning') {
    return Object.freeze({
      label: 'Return time left',
      deadlineMicros: worker.returnsAtMicros
    });
  }
  return undefined;
}

export function WorkerInspectionPanel({
  id,
  worker,
  keeperProfile,
  resourceTargetLabel,
  onLocateWorker,
  onLocateKeeper,
  onRecallWorker,
  onRequestClose,
  focusTargetRef
}: WorkerInspectionPanelProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [state, setState] = useState<'idle' | 'recalling' | 'failed'>('idle');
  const commandPending = state === 'recalling';
  const canRecall = realmWorkerCanRecall(worker) && onRecallWorker !== undefined;
  const profile = useMemo(
    () => sanitizeWorkerKeeperProfile(keeperProfile),
    [
      keeperProfile?.canonicalUsername,
      keeperProfile?.displayName,
      keeperProfile?.pfpUrl,
      keeperProfile?.publicBio
    ]
  );
  const keeperLabel = castleProfileLabel(profile);
  const keeperName = profile.displayName ?? keeperLabel;
  const keeperUsername = castleProfileUsername(profile);
  const originCastleName = normalizePublicProfileText(worker.originCastleName, 80)
    ?? 'Hegemony Keep';
  const targetLabel = worker.resourceKind
    ? normalizePublicProfileText(resourceTargetLabel, 96)
      ?? RESOURCE_KIND_LABELS[worker.resourceKind]
    : undefined;
  const schedule = workerAuthoritySchedule(worker);
  const scheduleRemaining = useRealmRemainingDuration(schedule?.deadlineMicros);
  const locateLabel = worker.status === 'idle' ? 'Locate at Keep' : 'Locate Worker';
  useModalFocusBoundary({
    dialogRef,
    initialFocusRef: headingRef,
    onEscape: () => {
      if (!commandPending) onRequestClose();
    }
  });

  useEffect(() => {
    setState((current) => current === 'recalling' ? current : 'idle');
  }, [worker.workerId, worker.status, worker.revision]);

  const assignHeadingRef = (element: HTMLHeadingElement | null) => {
    headingRef.current = element;
    if (typeof focusTargetRef === 'function') focusTargetRef(element);
    else if (focusTargetRef) focusTargetRef.current = element;
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
            A permanent attendant of its keep. This public record follows only
            movement and gathering state confirmed by the Realm.
          </p>
          <div className="worker-inspection__identity">
            {onLocateKeeper ? (
              <button
                aria-label={`Locate ${keeperName}'s keep`}
                className="worker-inspection__keeper-locate"
                onClick={() => onLocateKeeper(worker.originCastleId)}
                type="button"
              >
                <CastleProfileAvatar profile={profile} size="large" />
              </button>
            ) : (
              <CastleProfileAvatar profile={profile} size="large" />
            )}
            <div>
              <span>{worker.ownedByViewer ? 'YOUR KEEPER' : 'KEEPER'}</span>
              <strong>{keeperName}</strong>
              {keeperUsername && keeperUsername !== keeperName ? (
                <small>{keeperUsername}</small>
              ) : null}
            </div>
          </div>
          {profile.publicBio ? (
            <p className="worker-inspection__bio">{profile.publicBio}</p>
          ) : null}
          <dl className="worker-inspection__fields">
            <div><dt>Origin castle</dt><dd>{originCastleName}</dd></div>
            <div>
              <dt>Worker</dt>
              <dd>{String(worker.ordinal).padStart(2, '0')} of 04</dd>
            </div>
            <div><dt>Status</dt><dd>{realmWorkerStatusLabel(worker)}</dd></div>
            {targetLabel ? (
              <div><dt>Resource target</dt><dd>{targetLabel}</dd></div>
            ) : null}
            {schedule ? (
              <div>
                <dt>{schedule.label}</dt>
                <dd role="timer">{scheduleRemaining ?? 'Schedule unavailable'}</dd>
              </div>
            ) : null}
          </dl>
          {!worker.ownedByViewer ? (
            <p className="worker-inspection__read-only">
              Read-only public identity. Commands belong to the owning keeper.
            </p>
          ) : null}
          {worker.status === 'idle' && worker.ownedByViewer ? (
            <p className="worker-inspection__read-only">
              Select an available resource node in the Realm to send this worker.
            </p>
          ) : null}
          <div className="worker-inspection__actions">
            {onLocateWorker ? (
              <button
                aria-label={locateLabel}
                className="worker-inspection__locate"
                onClick={() => onLocateWorker(worker.workerId)}
                type="button"
              >
                {locateLabel.toUpperCase()}
              </button>
            ) : null}
            {canRecall ? (
              <button
                aria-label={state === 'recalling' ? 'Recalling Worker' : 'Recall Worker'}
                className="worker-inspection__recall"
                disabled={commandPending}
                onClick={() => void recall()}
                type="button"
              >
                {state === 'recalling' ? 'RECALLING…' : 'RECALL WORKER'}
              </button>
            ) : null}
          </div>
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

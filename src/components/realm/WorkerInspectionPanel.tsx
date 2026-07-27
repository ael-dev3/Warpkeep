import { useEffect, useMemo, useRef, useState, type Ref } from 'react';

import { normalizePublicProfileText } from '../../security/publicProfileText';
import { useModalFocusBoundary } from '../menu/useModalFocusBoundary';
import { CastleProfileAvatar } from './RealmCastleLabels';
import { RealmRecordField, RealmRecordStatus } from './RealmRecordPrimitives';
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
  /** Localized explanation shown while owner commands are read-only. */
  controlsStatus?: string;
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
  controlsStatus,
  onRecallWorker,
  onRequestClose,
  focusTargetRef
}: WorkerInspectionPanelProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [state, setState] = useState<'idle' | 'recalling' | 'failed'>('idle');
  const commandPending = state === 'recalling';
  const recallableByOwner = worker.ownedByViewer && realmWorkerCanRecall(worker);
  const canRecall = recallableByOwner && onRecallWorker !== undefined;
  const controlsStatusId = `${id}-controls-status`;
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
            <RealmRecordField label="Origin castle">{originCastleName}</RealmRecordField>
            <RealmRecordField label="Worker">
              {String(worker.ordinal).padStart(2, '0')} of 04
            </RealmRecordField>
            <RealmRecordField label="Status">
              {realmWorkerStatusLabel(worker)}
            </RealmRecordField>
            {targetLabel ? (
              <RealmRecordField label="Resource target">{targetLabel}</RealmRecordField>
            ) : null}
            {schedule ? (
              <RealmRecordField label={schedule.label} valueRole="timer">
                {scheduleRemaining ?? 'Schedule unavailable'}
              </RealmRecordField>
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
          {recallableByOwner && controlsStatus ? (
            <RealmRecordStatus
              className="worker-inspection__read-only"
              id={controlsStatusId}
              state="informational"
            >
              {controlsStatus}
            </RealmRecordStatus>
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
            {recallableByOwner ? (
              <button
                aria-describedby={!canRecall && controlsStatus
                  ? controlsStatusId
                  : undefined}
                aria-label={state === 'recalling' ? 'Recalling Worker' : 'Recall Worker'}
                className="worker-inspection__recall"
                disabled={!canRecall || commandPending}
                onClick={() => void recall()}
                type="button"
              >
                {state === 'recalling' ? 'RECALLING…' : 'RECALL WORKER'}
              </button>
            ) : null}
          </div>
          {state === 'failed' ? (
            <RealmRecordStatus className="worker-inspection__error" state="error">
              The command could not be confirmed. Try the same action again.
            </RealmRecordStatus>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

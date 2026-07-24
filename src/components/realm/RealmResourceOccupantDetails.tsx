import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject
} from 'react';

import { CastleProfileAvatar } from './RealmCastleLabels';
import { castleProfileLabel } from './realmCastlePresentation';
import { useRealmRemainingDuration } from './realmAuthoritySchedule';
import {
  realmResourceOccupantNextAuthorityTimestamp
} from './realmResourceOccupantInspector';
import {
  realmResourceOccupantRecallWorkerId,
  RESOURCE_WORKER_PHASE_LABELS,
  RESOURCE_WORKER_RATE_LABELS,
  type RealmResourceOccupantMarker
} from './realmResourceOccupantPresentation';

function publicAssetUrl(path: string) {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`;
}

export type RealmResourceOccupantDetailsProps = Readonly<{
  marker: RealmResourceOccupantMarker;
  /** Stable inspector control used only to recover genuinely orphaned focus. */
  focusFallbackRef?: RefObject<HTMLButtonElement | null>;
  onFocusCastle?: (marker: RealmResourceOccupantMarker) => void;
  onRecallWorker?: (workerId: string) => Promise<void>;
}>;

/**
 * Shared occupied-site content for every resource inspector. The marker has
 * already passed the public site/castle/profile join; this component neither
 * derives authority nor owns a second dialog.
 */
export function RealmResourceOccupantDetails({
  marker,
  focusFallbackRef,
  onFocusCastle,
  onRecallWorker
}: RealmResourceOccupantDetailsProps) {
  const detailsRef = useRef<HTMLElement>(null);
  const recallPendingRef = useRef(false);
  const [recallState, setRecallState] = useState<
    'idle' | 'pending' | 'confirmed' | 'failed'
  >('idle');
  const playerLabel = castleProfileLabel(marker.profile);
  const keeperName = marker.profile.displayName ?? playerLabel;
  const ownRecordLabel = marker.source === 'generic-worker'
    ? 'YOUR WORKER'
    : 'YOUR EXPEDITION';
  const recordLabel = marker.occupiedByViewer
    ? ownRecordLabel
    : marker.source === 'generic-worker'
      ? 'PUBLIC WORKER RECORD'
      : 'PUBLIC EXPEDITION RECORD';
  const unitLabel = marker.workerOrdinal === undefined
    ? 'EXPEDITION WAGON'
    : `WORKER ${String(marker.workerOrdinal).padStart(2, '0')}`;
  const recallWorkerId = realmResourceOccupantRecallWorkerId(marker);
  const canRecall = recallWorkerId !== undefined && onRecallWorker !== undefined;
  const scheduleLabel = marker.workerPhase === 'outbound'
    ? 'Arrival time left'
    : marker.workerPhase === 'gathering'
      ? 'Gathering time left'
      : 'Return time left';
  const scheduleRemaining = useRealmRemainingDuration(
    realmResourceOccupantNextAuthorityTimestamp(marker)
  );

  useEffect(() => {
    recallPendingRef.current = false;
    setRecallState('idle');
  }, [marker.timelineRevision, marker.workerId, marker.workerPhase]);

  useLayoutEffect(() => () => {
    const details = detailsRef.current;
    const activeElement = document.activeElement;
    if (!details || !activeElement || !details.contains(activeElement)) return;

    // Layout cleanup can observe ownership before React removes the focused
    // control. Defer restoration until after the commit so a whole-inspector
    // close does not focus a control that is itself being removed.
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
  }, [focusFallbackRef]);

  const recallWorker = async () => {
    if (
      recallWorkerId === undefined
      || onRecallWorker === undefined
      || recallPendingRef.current
    ) return;
    recallPendingRef.current = true;
    setRecallState('pending');
    try {
      await onRecallWorker(recallWorkerId);
      setRecallState('confirmed');
    } catch {
      recallPendingRef.current = false;
      setRecallState('failed');
    }
  };

  return (
    <section
      aria-label={`${recordLabel}: ${playerLabel}`}
      className="realm-resource-occupant-details"
      data-resource-occupant-details="true"
      ref={detailsRef}
    >
      <div className="realm-resource-occupant-details__record">
        <span>{recordLabel}</span>
        <strong>{unitLabel}</strong>
      </div>

      <div className="realm-resource-occupant-details__worker">
        <div className="realm-resource-occupant-details__worker-art" aria-hidden="true">
          <img
            alt=""
            decoding="async"
            draggable={false}
            height="1024"
            src={publicAssetUrl('images/realm/hegemony-worker-record.webp')}
            width="1024"
          />
        </div>
        <div>
          <span>{unitLabel}</span>
          <strong>{RESOURCE_WORKER_PHASE_LABELS[marker.workerPhase]}</strong>
          <small>{RESOURCE_WORKER_RATE_LABELS[marker.resource]}</small>
        </div>
      </div>

      <div className="realm-resource-occupant-details__identity">
        {onFocusCastle ? (
          <button
            aria-label={`Focus ${playerLabel}'s castle on the map`}
            className="realm-resource-occupant-details__identity-focus"
            onClick={() => onFocusCastle(marker)}
            title="Focus castle on the map"
            type="button"
          >
            <CastleProfileAvatar profile={marker.profile} size="large" />
          </button>
        ) : (
          <CastleProfileAvatar profile={marker.profile} size="large" />
        )}
        <div>
          <span>{marker.occupiedByViewer ? 'YOUR KEEP' : 'GATHERING BY'}</span>
          <strong>{keeperName}</strong>
          {keeperName !== playerLabel ? <small>{playerLabel}</small> : null}
        </div>
      </div>

      {marker.profile.publicBio ? (
        <p className="realm-resource-occupant-details__bio">{marker.profile.publicBio}</p>
      ) : null}

      <dl className="realm-resource-occupant-details__facts">
        <div>
          <dt>Home castle</dt>
          <dd>{marker.castle.name}</dd>
        </div>
        <div>
          <dt>Castle location</dt>
          <dd>q {marker.castle.q} · r {marker.castle.r}</dd>
        </div>
        <div>
          <dt>{scheduleLabel}</dt>
          <dd role="timer">{scheduleRemaining ?? 'Schedule unavailable'}</dd>
        </div>
      </dl>

      {recallState === 'failed' ? (
        <p className="realm-resource-occupant-details__command-error" role="alert">
          The recall could not be confirmed. Try the same command again.
        </p>
      ) : null}

      {canRecall ? (
        <button
          className="realm-resource-occupant-details__recall"
          disabled={recallState === 'pending' || recallState === 'confirmed'}
          onClick={() => void recallWorker()}
          type="button"
        >
          <span aria-atomic="true" aria-live="polite">
            {recallState === 'pending'
              ? 'Recalling worker…'
              : recallState === 'confirmed'
                ? 'Worker returning…'
                : 'Recall Worker to Keep'}
          </span>
          <span aria-hidden="true">↩</span>
        </button>
      ) : null}
    </section>
  );
}

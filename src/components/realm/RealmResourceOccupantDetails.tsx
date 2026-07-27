import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject
} from 'react';

import { CastleProfileAvatar } from './RealmCastleLabels';
import { RealmRecordField, RealmRecordStatus } from './RealmRecordPrimitives';
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
import type { RealmResourceKind } from './realmTypes';

const WORKER_RECONCILIATION_TIMEOUT_MILLISECONDS = 12_000;

function publicAssetUrl(path: string) {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`;
}

export type RealmResourceOccupantDetailsProps = Readonly<{
  marker: RealmResourceOccupantMarker;
  /** Stable inspector control used only to recover genuinely orphaned focus. */
  focusFallbackRef?: RefObject<HTMLButtonElement | null>;
  onFocusCastle?: (marker: RealmResourceOccupantMarker) => void;
  /** Map-level pending state retained if this inspector is closed and reopened. */
  awaitingAuthoritativeRecall?: boolean;
  onRecallWorker?: (workerId: string) => Promise<void>;
  /** Localized reason generic-worker owner commands remain read-only. */
  controlsStatus?: string;
  /** Present only after the owner-private/public legacy timeline joins exactly. */
  legacyExpeditionId?: string;
  onReturnLegacyExpedition?: (
    resourceKind: RealmResourceKind,
    expeditionId: string
  ) => Promise<void>;
  /** Enables operator-only spatial diagnostics. */
  showDiagnostics?: boolean;
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
  awaitingAuthoritativeRecall = false,
  onRecallWorker,
  controlsStatus,
  legacyExpeditionId,
  onReturnLegacyExpedition,
  showDiagnostics = false
}: RealmResourceOccupantDetailsProps) {
  const detailsRef = useRef<HTMLElement>(null);
  const controlsStatusId = `realm-resource-controls-${useId().replace(/:/g, '')}`;
  const recallPendingRef = useRef(false);
  const recallAttemptRef = useRef(0);
  const recallLifecycleKeyRef = useRef<string | undefined>(undefined);
  const presentedLifecycleKeyRef = useRef<string | undefined>(undefined);
  const markerRef = useRef(marker);
  const [recallState, setRecallState] = useState<
    'idle' | 'pending' | 'confirmed' | 'failed'
  >('idle');
  markerRef.current = marker;
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
  const returnLegacyExpeditionId = marker.source === 'legacy-expedition'
    && marker.occupiedByViewer
    && (marker.workerPhase === 'outbound' || marker.workerPhase === 'gathering')
    && typeof legacyExpeditionId === 'string'
    && /^[a-z0-9][a-z0-9:_-]{0,95}$/i.test(legacyExpeditionId)
    ? legacyExpeditionId
    : undefined;
  const recallsLegacyExpedition = returnLegacyExpeditionId !== undefined;
  const recallableByOwner = recallWorkerId !== undefined
    || returnLegacyExpeditionId !== undefined;
  const canRecall = (
    recallWorkerId !== undefined
    && onRecallWorker !== undefined
    && !awaitingAuthoritativeRecall
  ) || (
    recallsLegacyExpedition && onReturnLegacyExpedition !== undefined
  );
  const showRecall = canRecall
    || (recallWorkerId !== undefined && awaitingAuthoritativeRecall)
    || (recallWorkerId !== undefined && controlsStatus !== undefined);
  const scheduleLabel = marker.workerPhase === 'outbound'
    ? 'Arrival time left'
    : marker.workerPhase === 'gathering'
      ? 'Gathering time left'
      : 'Return time left';
  const scheduleRemaining = useRealmRemainingDuration(
    realmResourceOccupantNextAuthorityTimestamp(marker)
  );
  const recallLifecycleKey = [
    marker.source,
    marker.resource,
    marker.siteId,
    marker.workerId ?? '',
    legacyExpeditionId ?? ''
  ].join(':');

  useEffect(() => {
    const presentedLifecycleChanged =
      presentedLifecycleKeyRef.current !== recallLifecycleKey;
    presentedLifecycleKeyRef.current = recallLifecycleKey;
    const submittedLifecycle = recallLifecycleKeyRef.current;
    if (
      submittedLifecycle !== undefined
      && (
        submittedLifecycle !== recallLifecycleKey
        || marker.workerPhase === 'returning'
      )
    ) {
      recallAttemptRef.current += 1;
      recallLifecycleKeyRef.current = undefined;
      recallPendingRef.current = false;
      setRecallState('idle');
      return;
    }
    if (submittedLifecycle === undefined) {
      setRecallState((current) => (
        presentedLifecycleChanged || marker.workerPhase === 'returning'
          ? 'idle'
          : current
      ));
    }
  }, [
    recallLifecycleKey,
    marker.workerPhase
  ]);

  useEffect(() => {
    if (recallState !== 'confirmed') return undefined;
    const attempt = recallAttemptRef.current;
    const timeout = window.setTimeout(() => {
      if (recallAttemptRef.current !== attempt) return;
      recallLifecycleKeyRef.current = undefined;
      recallPendingRef.current = false;
      setRecallState('failed');
    }, WORKER_RECONCILIATION_TIMEOUT_MILLISECONDS);
    return () => window.clearTimeout(timeout);
  }, [recallState]);

  useEffect(() => () => {
    recallAttemptRef.current += 1;
    recallLifecycleKeyRef.current = undefined;
    recallPendingRef.current = false;
  }, []);

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

  const recallAssignment = async () => {
    if (recallPendingRef.current) return;
    let command: (() => Promise<void>) | undefined;
    if (recallWorkerId !== undefined && onRecallWorker !== undefined) {
      command = () => onRecallWorker(recallWorkerId);
    } else if (
      returnLegacyExpeditionId !== undefined
      && onReturnLegacyExpedition !== undefined
    ) {
      command = () => onReturnLegacyExpedition(
        marker.resource,
        returnLegacyExpeditionId
      );
    }
    if (command === undefined) return;
    const submittedLifecycle = recallLifecycleKey;
    const attempt = recallAttemptRef.current + 1;
    recallAttemptRef.current = attempt;
    recallLifecycleKeyRef.current = submittedLifecycle;
    recallPendingRef.current = true;
    setRecallState('pending');
    try {
      await command();
      if (
        recallAttemptRef.current !== attempt
        || recallLifecycleKeyRef.current !== submittedLifecycle
      ) return;
      const currentMarker = markerRef.current;
      const currentLifecycle = [
        currentMarker.source,
        currentMarker.resource,
        currentMarker.siteId,
        currentMarker.workerId ?? '',
        legacyExpeditionId ?? ''
      ].join(':');
      if (
        currentLifecycle !== submittedLifecycle
        || currentMarker.workerPhase === 'returning'
      ) {
        recallLifecycleKeyRef.current = undefined;
        recallPendingRef.current = false;
        setRecallState('idle');
        return;
      }
      setRecallState('confirmed');
    } catch {
      if (
        recallAttemptRef.current === attempt
        && recallLifecycleKeyRef.current === submittedLifecycle
      ) {
        recallLifecycleKeyRef.current = undefined;
        recallPendingRef.current = false;
        setRecallState('failed');
      }
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
        <RealmRecordField label="Home castle">{marker.castle.name}</RealmRecordField>
        {showDiagnostics ? (
          <RealmRecordField label="Castle location">
            q {marker.castle.q} · r {marker.castle.r}
          </RealmRecordField>
        ) : null}
        <RealmRecordField label={scheduleLabel} valueRole="timer">
          {scheduleRemaining ?? 'Schedule unavailable'}
        </RealmRecordField>
      </dl>

      {recallState === 'failed' ? (
        <RealmRecordStatus
          className="realm-resource-occupant-details__command-error"
          state="error"
        >
          The recall could not be confirmed. Try the same command again.
        </RealmRecordStatus>
      ) : null}

      {recallableByOwner && controlsStatus && !canRecall ? (
        <RealmRecordStatus
          className="realm-resource-occupant-details__command-error"
          id={controlsStatusId}
          state="informational"
        >
          {controlsStatus}
        </RealmRecordStatus>
      ) : null}

      {showRecall ? (
        <button
          aria-describedby={!canRecall && controlsStatus
            ? controlsStatusId
            : undefined}
          className="realm-resource-occupant-details__recall"
          disabled={
            !canRecall
            || awaitingAuthoritativeRecall
            || recallState === 'pending'
            || recallState === 'confirmed'
          }
          onClick={() => void recallAssignment()}
          type="button"
        >
          <span aria-atomic="true" aria-live="polite">
            {recallState === 'pending'
              ? recallsLegacyExpedition
                ? 'Recalling expedition…'
                : 'Recalling worker…'
              : recallState === 'confirmed' || awaitingAuthoritativeRecall
                ? recallsLegacyExpedition
                  ? 'Expedition returning…'
                  : 'Worker returning…'
                : recallsLegacyExpedition
                  ? 'Recall Expedition to Keep'
                  : 'Recall Worker to Keep'}
          </span>
          <span aria-hidden="true">↩</span>
        </button>
      ) : null}
    </section>
  );
}

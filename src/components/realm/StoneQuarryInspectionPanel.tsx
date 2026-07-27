import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Ref
} from 'react';

import type { StoneExpeditionPresentation } from './realmStoneExpeditionPresentation';
import {
  stoneNodeAvailabilityLabel,
  stoneNodeNextAuthorityTimestamp,
  type RealmStoneNodePresentation
} from './realmStoneNodePresentation';
import {
  matchingRealmResourceOccupant,
  realmResourceOccupantOwnerLabel,
  realmResourceOccupantSiteStateLabel
} from './realmResourceOccupantInspector';
import { useRealmRemainingDuration } from './realmAuthoritySchedule';
import { RealmResourceOccupantDetails } from './RealmResourceOccupantDetails';
import { RealmRecordField } from './RealmRecordPrimitives';
import {
  RealmNodeWorkerDispatch,
  type RealmNodeWorkerDispatchHandler
} from './RealmNodeWorkerDispatch';
import type {
  RealmResourceOccupantMarker
} from './realmResourceOccupantPresentation';
import type {
  RealmWorkerPublicPresentation
} from './realmWorkerPresentation';
import './StoneQuarryInspectionPanel.css';

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

function publicAssetUrl(path: string) {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`;
}

export type StoneQuarryInspectionRecord = Readonly<{
  name: string;
  tier: number;
}>;

export type StoneQuarryInspectionPanelProps = Readonly<{
  id: string;
  quarry: StoneQuarryInspectionRecord;
  /** Validated public Stone site only; no balances or reducer authority. */
  node?: RealmStoneNodePresentation;
  /** Normalized public legacy/generic occupancy for this exact site. */
  publicOccupant?: RealmResourceOccupantMarker;
  /** Active generic mode retires legacy dispatch/claim even if its public join degrades. */
  legacyDispatchBlocked?: boolean;
  /** Active generic authority exists, but its public occupancy join failed validation. */
  occupancyUnavailable?: boolean;
  /** Explicit portrait navigation; opening the record itself remains camera-neutral. */
  onFocusOccupantCastle?: (occupant: RealmResourceOccupantMarker) => void;
  /** Exact owner-only generic worker recall boundary. */
  onRecallWorker?: (workerId: string) => Promise<void>;
  /** Exact owner roster used only for map-node dispatch in active generic mode. */
  workers?: readonly RealmWorkerPublicPresentation[];
  /** Authenticated generic-worker reducer boundary. */
  onDispatchWorker?: RealmNodeWorkerDispatchHandler;
  /** Localized generic-worker command synchronization state. */
  workerControlsStatus?: string;
  /** Exact owner-private legacy expedition joined to this public site. */
  legacyExpeditionId?: string;
  onReturnLegacyExpedition?: (
    resourceKind: RealmResourceOccupantMarker['resource'],
    expeditionId: string
  ) => Promise<void>;
  /** Exact caller-only procedure data used only to gate legacy dispatch. */
  privateExpedition?: StoneExpeditionPresentation;
  /** Authenticated provider boundary; no optimistic public node mutation. */
  onDispatchStoneExpedition?: (siteId: string) => Promise<void>;
  onRequestClose: () => void;
  focusTargetRef?: Ref<HTMLButtonElement>;
  /** Enables operator-only spatial diagnostics in nested public records. */
  showDiagnostics?: boolean;
}>;

function nodeNotice(
  node: RealmStoneNodePresentation | undefined,
  publicOccupant: RealmResourceOccupantMarker | undefined,
  legacyDispatchBlocked: boolean,
  occupancyUnavailable: boolean
) {
  if (!node) {
    return 'This record presents the Stone Quarry only; it does not disclose player inventory or gathering authority.';
  }
  if (occupancyUnavailable) {
    return 'Authoritative worker occupancy is temporarily unavailable. This site is not presented as available and all gathering commands remain closed.';
  }
  if (publicOccupant) {
    return publicOccupant.occupiedByViewer
      ? 'Your gathering assignment is recorded by the Realm. Stone settlement remains server-authoritative.'
      : 'This Quarry is occupied. The gathering keeper is public, while their resources and commands remain private.';
  }
  if (legacyDispatchBlocked) {
    return 'Worker assignments are managed by the authoritative worker roster. Legacy wagon dispatch is unavailable.';
  }
  if (node.availability === 'available') {
    return 'This Quarry is available. A dispatch exists only after the Realm records the occupation.';
  }
  if (node.availability === 'unavailable') {
    return 'The public Stone state is incomplete. The Realm has not presented this Quarry as available.';
  }
  if (node.occupiedByViewer) {
    return 'Your expedition is recorded by the Realm. Stone settlement remains server-authoritative.';
  }
  return 'This Quarry is occupied. Public occupancy is visible, but another player’s resources remain private.';
}

/**
 * The Stone Quarry inspector uses the established public/private split:
 * public rows choose availability, the owner-only procedure chooses pending
 * Stone, and the only action crosses an authenticated provider boundary.
 * The compact HUD Stone glyph is intentionally not represented as record art.
 */
export function StoneQuarryInspectionPanel({
  id,
  quarry,
  node,
  publicOccupant,
  legacyDispatchBlocked = false,
  occupancyUnavailable = false,
  onFocusOccupantCastle,
  onRecallWorker,
  workers,
  onDispatchWorker,
  workerControlsStatus,
  legacyExpeditionId,
  onReturnLegacyExpedition,
  privateExpedition,
  onDispatchStoneExpedition,
  onRequestClose,
  focusTargetRef,
  showDiagnostics = false
}: StoneQuarryInspectionPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [dispatchState, setDispatchState] = useState<
    'idle' | 'submitting' | 'submitted' | 'failed'
  >('idle');
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const occupant = occupancyUnavailable || !node
    ? undefined
    : matchingRealmResourceOccupant(publicOccupant, 'stone', node.siteId);
  const dispatchBlocked = legacyDispatchBlocked || occupancyUnavailable;
  const genericWorkerDispatch = occupant === undefined
    && !occupancyUnavailable
    && node?.availability === 'available'
    && workers !== undefined;
  const scheduleTimestamp = occupant
    ? undefined
    : node ? stoneNodeNextAuthorityTimestamp(node) : undefined;
  const remainingSchedule = useRealmRemainingDuration(scheduleTimestamp);
  const scheduleLabel = occupancyUnavailable
    ? undefined
    : remainingSchedule;
  const privateExpeditionActive = privateExpedition?.status === 'ready'
    && privateExpedition.active;
  const privateActiveSiteId = privateExpeditionActive
    ? privateExpedition?.expedition?.siteId
    : undefined;
  const awaitingPublicOccupation = !dispatchBlocked
    && occupant === undefined && node?.availability === 'available'
    && (
      privateActiveSiteId === node.siteId
      || (!privateExpeditionActive && dispatchState === 'submitted')
    );
  const expeditionActiveElsewhere = !dispatchBlocked
    && occupant === undefined && node?.availability === 'available'
    && privateExpeditionActive
    && privateActiveSiteId !== node.siteId;
  const canDispatch = !dispatchBlocked
    && occupant === undefined
    && node?.availability === 'available'
    && onDispatchStoneExpedition !== undefined
    && !privateExpeditionActive
    && (dispatchState === 'idle' || dispatchState === 'failed');
  const dispatchLabel = dispatchState === 'submitting'
    ? 'DISPATCHING WAGON…'
    : awaitingPublicOccupation
      ? 'AWAITING REALM…'
      : expeditionActiveElsewhere
        ? 'EXPEDITION ACTIVE'
        : 'DISPATCH WAGON';
  const dispatchStatus = awaitingPublicOccupation
    ? 'The private Realm record is confirmed; awaiting the public occupation.'
    : expeditionActiveElsewhere
      ? 'Your Stone wagon already has an active expedition.'
      : dispatchState === 'failed'
        ? 'The Realm could not confirm this dispatch. Check the Quarry state and try again.'
        : 'Dispatch is confirmed only when the Realm publishes the occupation.';

  const setCloseButtonRef = useCallback((element: HTMLButtonElement | null) => {
    closeButtonRef.current = element;
    assignRef(focusTargetRef, element);
  }, [focusTargetRef]);

  useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
  }, [quarry.name, quarry.tier, id]);

  useEffect(() => {
    setDispatchState('idle');
  }, [node?.availability, node?.siteId]);

  const dispatch = useCallback(async () => {
    if (
      dispatchBlocked
      || occupant
      || !node
      || node.availability !== 'available'
      || !onDispatchStoneExpedition
    ) return;
    setDispatchState('submitting');
    try {
      await onDispatchStoneExpedition(node.siteId);
      setDispatchState('submitted');
    } catch {
      setDispatchState('failed');
    }
  }, [dispatchBlocked, node, occupant, onDispatchStoneExpedition]);

  return (
    <aside
      id={id}
      className="gold-mine-inspection stone-quarry-inspection realm-camera-neutral-inspector"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-open="true"
    >
      <div
        aria-hidden="true"
        className="gold-mine-inspection__art-stage stone-quarry-inspection__art-stage"
      >
        <img
          alt=""
          aria-hidden="true"
          className="gold-mine-inspection__hero-art stone-quarry-inspection__hero-art"
          decoding="async"
          draggable={false}
          height="1254"
          src={publicAssetUrl('images/realm/hegemony-stone-quarry-record.webp')}
          width="1254"
        />
      </div>

      <div className="gold-mine-inspection__drawer">
        <header className="gold-mine-inspection__hero">
          <button
            ref={setCloseButtonRef}
            className="gold-mine-inspection__dismiss"
            aria-label="CLOSE STONE QUARRY RECORD"
            onClick={onRequestClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
          <div className="gold-mine-inspection__title-lockup">
            <p>TIER {quarry.tier} GATHERING SITE</p>
            <h2 id={titleId}>{quarry.name}</h2>
          </div>
        </header>

        <div className="gold-mine-inspection__body">
          <p id={descriptionId} className="gold-mine-inspection__description">
            A Hegemony Stone Quarry positioned beneath the Realm canopy. Availability and
            all gathering operations are determined by the Realm.
          </p>
          <dl className="gold-mine-inspection__fields" aria-label="Stone Quarry record">
            <RealmRecordField className="gold-mine-inspection__field" label="Resource">
              Stone
            </RealmRecordField>
            <RealmRecordField className="gold-mine-inspection__field" label="Node tier">
              {quarry.tier}
            </RealmRecordField>
            {node ? (
              <RealmRecordField className="gold-mine-inspection__field" label="Site state">
                {occupancyUnavailable
                  ? 'OCCUPANCY UNAVAILABLE'
                  : occupant
                  ? realmResourceOccupantSiteStateLabel(occupant)
                  : stoneNodeAvailabilityLabel(node.availability)}
              </RealmRecordField>
            ) : null}
            {!occupancyUnavailable && (occupant || node?.originCastle) ? (
              <RealmRecordField className="gold-mine-inspection__field" label="Occupied by">
                {occupant
                  ? realmResourceOccupantOwnerLabel(occupant)
                  : node?.occupiedByViewer ? 'Your expedition' : node?.originCastle?.name}
              </RealmRecordField>
            ) : null}
            {!occupancyUnavailable && node ? (
              <RealmRecordField className="gold-mine-inspection__field" label="Gather rate">
                +1 Stone / minute
              </RealmRecordField>
            ) : null}
            {scheduleLabel ? (
              <RealmRecordField className="gold-mine-inspection__field" label="Realm schedule">
                {scheduleLabel}
              </RealmRecordField>
            ) : null}
          </dl>
          {occupant ? (
            <RealmResourceOccupantDetails
              focusFallbackRef={closeButtonRef}
              marker={occupant}
              onFocusCastle={onFocusOccupantCastle}
              onRecallWorker={onRecallWorker}
              controlsStatus={workerControlsStatus}
              legacyExpeditionId={legacyExpeditionId}
              onReturnLegacyExpedition={onReturnLegacyExpedition}
              showDiagnostics={showDiagnostics}
            />
          ) : null}
          <p className="gold-mine-inspection__notice">
            {genericWorkerDispatch
              ? workerControlsStatus
                ? 'This Quarry is available. Public workers remain visible while dispatch controls synchronize.'
                : 'This Quarry is available. Choose a ready worker below; the Realm confirms the assignment.'
              : nodeNotice(node, occupant, dispatchBlocked, occupancyUnavailable)}
          </p>
          {genericWorkerDispatch ? (
            <RealmNodeWorkerDispatch
              focusFallbackRef={closeButtonRef}
              id={`${id}-stone`}
              controlsStatus={workerControlsStatus}
              onDispatchWorker={onDispatchWorker}
              resourceKind="stone"
              siteId={node.siteId}
              workers={workers}
            />
          ) : null}
          {!dispatchBlocked
            && !genericWorkerDispatch
            && occupant === undefined
            && node?.availability === 'available'
            && onDispatchStoneExpedition ? (
            <div className="gold-mine-inspection__action">
              <button
                aria-describedby={descriptionId}
                disabled={!canDispatch}
                onClick={() => void dispatch()}
                type="button"
              >
                {dispatchLabel}
              </button>
              <p aria-live="polite" className="gold-mine-inspection__action-status">
                {dispatchStatus}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

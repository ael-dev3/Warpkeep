import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref
} from 'react';

import type { WoodExpeditionPresentation } from './realmWoodExpeditionPresentation';
import {
  woodNodeAvailabilityLabel,
  woodNodeNextAuthorityTimestamp,
  type RealmWoodNodePresentation
} from './realmWoodNodePresentation';
import {
  matchingRealmResourceOccupant,
  realmResourceOccupantOwnerLabel,
  realmResourceOccupantSiteStateLabel
} from './realmResourceOccupantInspector';
import { useRealmRemainingDuration } from './realmAuthoritySchedule';
import { RealmResourceOccupantDetails } from './RealmResourceOccupantDetails';
import type {
  RealmResourceOccupantMarker
} from './realmResourceOccupantPresentation';
import './LoggingCampInspectionPanel.css';

function InspectionField({
  label,
  children
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="gold-mine-inspection__field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

function publicAssetUrl(path: string) {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`;
}

export type LoggingCampInspectionRecord = Readonly<{
  name: string;
  tier: number;
}>;

export type LoggingCampInspectionPanelProps = Readonly<{
  id: string;
  camp: LoggingCampInspectionRecord;
  /** Validated public Wood site only; no balances or reducer authority. */
  node?: RealmWoodNodePresentation;
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
  /** Exact owner-private legacy expedition joined to this public site. */
  legacyExpeditionId?: string;
  onReturnLegacyExpedition?: (
    resourceKind: RealmResourceOccupantMarker['resource'],
    expeditionId: string
  ) => Promise<void>;
  /** Exact caller-only procedure data used only to gate legacy dispatch. */
  privateExpedition?: WoodExpeditionPresentation;
  /** Authenticated provider boundary; no optimistic public node mutation. */
  onDispatchWoodExpedition?: (siteId: string) => Promise<void>;
  onRequestClose: () => void;
  focusTargetRef?: Ref<HTMLButtonElement>;
}>;

function nodeNotice(
  node: RealmWoodNodePresentation | undefined,
  publicOccupant: RealmResourceOccupantMarker | undefined,
  legacyDispatchBlocked: boolean,
  occupancyUnavailable: boolean
) {
  if (!node) {
    return 'This record presents the Logging Camp only; it does not disclose player inventory or gathering authority.';
  }
  if (occupancyUnavailable) {
    return 'Authoritative worker occupancy is temporarily unavailable. This site is not presented as available and all gathering commands remain closed.';
  }
  if (publicOccupant) {
    return publicOccupant.occupiedByViewer
      ? 'Your gathering assignment is recorded by the Realm. Wood settlement remains server-authoritative.'
      : 'This Camp is occupied. The gathering keeper is public, while their resources and commands remain private.';
  }
  if (legacyDispatchBlocked) {
    return 'Worker assignments are managed by the authoritative worker roster. Legacy wagon dispatch is unavailable.';
  }
  if (node.availability === 'available') {
    return 'This Camp is available. A dispatch exists only after the Realm records the occupation.';
  }
  if (node.availability === 'unavailable') {
    return 'The public Wood state is incomplete. The Realm has not presented this Camp as available.';
  }
  if (node.occupiedByViewer) {
    return 'Your expedition is recorded by the Realm. Wood settlement remains server-authoritative.';
  }
  return 'This Camp is occupied. Public occupancy is visible, but another player’s resources remain private.';
}

/**
 * The Logging Camp inspector uses the established public/private split:
 * public rows choose availability, the owner-only procedure chooses pending
 * Wood, and the only action crosses an authenticated provider boundary.
 * The compact HUD Wood glyph is intentionally not represented as record art.
 */
export function LoggingCampInspectionPanel({
  id,
  camp,
  node,
  publicOccupant,
  legacyDispatchBlocked = false,
  occupancyUnavailable = false,
  onFocusOccupantCastle,
  onRecallWorker,
  legacyExpeditionId,
  onReturnLegacyExpedition,
  privateExpedition,
  onDispatchWoodExpedition,
  onRequestClose,
  focusTargetRef
}: LoggingCampInspectionPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [dispatchState, setDispatchState] = useState<
    'idle' | 'submitting' | 'submitted' | 'failed'
  >('idle');
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const occupant = occupancyUnavailable || !node
    ? undefined
    : matchingRealmResourceOccupant(publicOccupant, 'wood', node.siteId);
  const dispatchBlocked = legacyDispatchBlocked || occupancyUnavailable;
  const scheduleTimestamp = occupant
    ? undefined
    : node ? woodNodeNextAuthorityTimestamp(node) : undefined;
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
    && onDispatchWoodExpedition !== undefined
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
      ? 'Your Wood wagon already has an active expedition.'
      : dispatchState === 'failed'
        ? 'The Realm could not confirm this dispatch. Check the Camp state and try again.'
        : 'Dispatch is confirmed only when the Realm publishes the occupation.';

  const setCloseButtonRef = useCallback((element: HTMLButtonElement | null) => {
    closeButtonRef.current = element;
    assignRef(focusTargetRef, element);
  }, [focusTargetRef]);

  useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
  }, [camp.name, camp.tier, id]);

  useEffect(() => {
    setDispatchState('idle');
  }, [node?.availability, node?.siteId]);

  const dispatch = useCallback(async () => {
    if (
      dispatchBlocked
      || occupant
      || !node
      || node.availability !== 'available'
      || !onDispatchWoodExpedition
    ) return;
    setDispatchState('submitting');
    try {
      await onDispatchWoodExpedition(node.siteId);
      setDispatchState('submitted');
    } catch {
      setDispatchState('failed');
    }
  }, [dispatchBlocked, node, occupant, onDispatchWoodExpedition]);

  return (
    <aside
      id={id}
      className="gold-mine-inspection logging-camp-inspection realm-camera-neutral-inspector"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-open="true"
    >
      <div
        aria-hidden="true"
        className="gold-mine-inspection__art-stage logging-camp-inspection__art-stage"
      >
        <img
          alt=""
          aria-hidden="true"
          className="gold-mine-inspection__hero-art logging-camp-inspection__hero-art"
          decoding="async"
          draggable={false}
          height="1254"
          src={publicAssetUrl('images/realm/hegemony-logging-camp-record.webp')}
          width="1254"
        />
      </div>

      <div className="gold-mine-inspection__drawer">
        <header className="gold-mine-inspection__hero">
          <button
            ref={setCloseButtonRef}
            className="gold-mine-inspection__dismiss"
            aria-label="CLOSE LOGGING CAMP RECORD"
            onClick={onRequestClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
          <div className="gold-mine-inspection__title-lockup">
            <p>TIER {camp.tier} GATHERING SITE</p>
            <h2 id={titleId}>{camp.name}</h2>
          </div>
        </header>

        <div className="gold-mine-inspection__body">
          <p id={descriptionId} className="gold-mine-inspection__description">
            A Hegemony Logging Camp positioned beneath the Realm canopy. Availability and
            all gathering operations are determined by the Realm.
          </p>
          <dl className="gold-mine-inspection__fields" aria-label="Logging Camp record">
            <InspectionField label="Resource">Wood</InspectionField>
            <InspectionField label="Node tier">{camp.tier}</InspectionField>
            {node ? (
              <InspectionField label="Site state">
                {occupancyUnavailable
                  ? 'OCCUPANCY UNAVAILABLE'
                  : occupant
                  ? realmResourceOccupantSiteStateLabel(occupant)
                  : woodNodeAvailabilityLabel(node.availability)}
              </InspectionField>
            ) : null}
            {!occupancyUnavailable && (occupant || node?.originCastle) ? (
              <InspectionField label="Occupied by">
                {occupant
                  ? realmResourceOccupantOwnerLabel(occupant)
                  : node?.occupiedByViewer ? 'Your expedition' : node?.originCastle?.name}
              </InspectionField>
            ) : null}
            {!occupancyUnavailable && node ? (
              <InspectionField label="Gather rate">+1 Wood / minute</InspectionField>
            ) : null}
            {scheduleLabel ? (
              <InspectionField label="Realm schedule">{scheduleLabel}</InspectionField>
            ) : null}
          </dl>
          {occupant ? (
            <RealmResourceOccupantDetails
              focusFallbackRef={closeButtonRef}
              marker={occupant}
              onFocusCastle={onFocusOccupantCastle}
              onRecallWorker={onRecallWorker}
              legacyExpeditionId={legacyExpeditionId}
              onReturnLegacyExpedition={onReturnLegacyExpedition}
            />
          ) : null}
          <p className="gold-mine-inspection__notice">
            {nodeNotice(node, occupant, dispatchBlocked, occupancyUnavailable)}
          </p>
          {!dispatchBlocked
            && occupant === undefined
            && node?.availability === 'available'
            && onDispatchWoodExpedition ? (
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

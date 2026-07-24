import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref
} from 'react';

import type { GoldExpeditionPresentation } from './realmGoldExpeditionPresentation';
import {
  goldNodeAvailabilityLabel,
  goldNodeNextAuthorityTimestamp,
  type RealmGoldNodePresentation
} from './realmGoldNodePresentation';
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
import './GoldMineInspectionPanel.css';

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
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref) {
    (ref as { current: T | null }).current = value;
  }
}

function publicAssetUrl(path: string) {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`;
}

export type GoldMineInspectionRecord = Readonly<{
  name: string;
  tier: number;
}>;

export type GoldMineInspectionPanelProps = Readonly<{
  id: string;
  mine: GoldMineInspectionRecord;
  /**
   * A validated public-site projection. It never includes balance, reward,
   * wallet, FID, or dispatch capability. Omit it for a generic record card.
   */
  node?: RealmGoldNodePresentation;
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
  /**
   * Exact caller-only procedure data used only to gate legacy dispatch.
   */
  privateExpedition?: GoldExpeditionPresentation;
  /**
   * A guarded server reducer boundary supplied by the authenticated provider.
   * The panel never changes public occupation, Gold, or node availability.
   */
  onDispatchGoldExpedition?: (siteId: string) => Promise<void>;
  onRequestClose: () => void;
  focusTargetRef?: Ref<HTMLButtonElement>;
}>;

function nodeNotice(
  node: RealmGoldNodePresentation | undefined,
  publicOccupant: RealmResourceOccupantMarker | undefined,
  legacyDispatchBlocked: boolean,
  occupancyUnavailable: boolean
) {
  if (!node) {
    return 'This record presents the site only; it does not disclose player inventory or gathering authority.';
  }
  if (occupancyUnavailable) {
    return 'Authoritative worker occupancy is temporarily unavailable. This site is not presented as available and all gathering commands remain closed.';
  }
  if (publicOccupant) {
    return publicOccupant.occupiedByViewer
      ? 'Your gathering assignment is recorded by the Realm. Gold settlement remains server-authoritative.'
      : 'This node is occupied. The gathering keeper is public, while their resources and commands remain private.';
  }
  if (legacyDispatchBlocked) {
    return 'Worker assignments are managed by the authoritative worker roster. Legacy wagon dispatch is unavailable.';
  }
  if (node.availability === 'available') {
    return 'This site is available. Dispatch is confirmed only when the Realm records it.';
  }
  if (node.availability === 'unavailable') {
    return 'The public site state is incomplete. The Realm has not presented this node as available.';
  }
  if (node.occupiedByViewer) {
    return 'Your expedition is recorded by the Realm. Gold settlement remains server-authoritative.';
  }
  return 'This node is occupied. Public occupancy is visible, but another player’s resources remain private.';
}

/**
 * A public Gold Mine record with narrowly injected, authenticated actions.
 * Presentation never owns map state, resource settlement, or node occupancy.
 */
export function GoldMineInspectionPanel({
  id,
  mine,
  node,
  publicOccupant,
  legacyDispatchBlocked = false,
  occupancyUnavailable = false,
  onFocusOccupantCastle,
  onRecallWorker,
  legacyExpeditionId,
  onReturnLegacyExpedition,
  privateExpedition,
  onDispatchGoldExpedition,
  onRequestClose,
  focusTargetRef
}: GoldMineInspectionPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [dispatchState, setDispatchState] = useState<
    'idle' | 'submitting' | 'submitted' | 'failed'
  >('idle');
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const occupant = occupancyUnavailable || !node
    ? undefined
    : matchingRealmResourceOccupant(publicOccupant, 'gold', node.siteId);
  const dispatchBlocked = legacyDispatchBlocked || occupancyUnavailable;
  const scheduleTimestamp = occupant
    ? undefined
    : node ? goldNodeNextAuthorityTimestamp(node) : undefined;
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
    && onDispatchGoldExpedition !== undefined
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
      ? 'Your Gold wagon already has an active expedition.'
      : dispatchState === 'failed'
        ? 'The Realm could not confirm this dispatch. Check the site state and try again.'
        : 'Dispatch is confirmed only when the Realm publishes the occupation.';

  const setCloseButtonRef = useCallback((element: HTMLButtonElement | null) => {
    closeButtonRef.current = element;
    assignRef(focusTargetRef, element);
  }, [focusTargetRef]);

  useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
  }, [id, mine.name, mine.tier]);

  useEffect(() => {
    setDispatchState('idle');
  }, [node?.siteId, node?.availability]);

  const dispatch = useCallback(async () => {
    if (
      dispatchBlocked
      || occupant
      || !node
      || node.availability !== 'available'
      || !onDispatchGoldExpedition
    ) return;
    setDispatchState('submitting');
    try {
      // The reducer result is intentionally not reflected into this card.
      // Public subscription plus the exact private procedure are the only
      // paths that may confirm occupation/pending Gold afterward.
      await onDispatchGoldExpedition(node.siteId);
      setDispatchState('submitted');
    } catch {
      setDispatchState('failed');
    }
  }, [dispatchBlocked, node, occupant, onDispatchGoldExpedition]);

  return (
    <aside
      id={id}
      className="gold-mine-inspection realm-camera-neutral-inspector"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-open="true"
    >
      <div aria-hidden="true" className="gold-mine-inspection__art-stage">
        <img
          alt=""
          aria-hidden="true"
          className="gold-mine-inspection__hero-art"
          decoding="async"
          draggable={false}
          height="1254"
          src={publicAssetUrl('images/realm/hegemony-gold-mine-record.webp')}
          width="1254"
        />
      </div>

      <div className="gold-mine-inspection__drawer">
        <header className="gold-mine-inspection__hero">
          <button
            ref={setCloseButtonRef}
            className="gold-mine-inspection__dismiss"
            aria-label="CLOSE GOLD MINE RECORD"
            onClick={onRequestClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
          <div className="gold-mine-inspection__title-lockup">
            <p>TIER {mine.tier} GATHERING SITE</p>
            <h2 id={titleId}>{mine.name}</h2>
          </div>
        </header>

        <div className="gold-mine-inspection__body">
          <p id={descriptionId} className="gold-mine-inspection__description">
            A Hegemony mineral prospect marked by bright auric ore. Site availability and
            gathering operations are determined in the Realm.
          </p>
          <dl className="gold-mine-inspection__fields" aria-label="Gold Mine record">
            <InspectionField label="Resource">Gold</InspectionField>
            <InspectionField label="Node tier">{mine.tier}</InspectionField>
            {node ? (
              <InspectionField label="Site state">
                {occupancyUnavailable
                  ? 'OCCUPANCY UNAVAILABLE'
                  : occupant
                  ? realmResourceOccupantSiteStateLabel(occupant)
                  : goldNodeAvailabilityLabel(node.availability)}
              </InspectionField>
            ) : null}
            {!occupancyUnavailable && (occupant || node?.originCastle) ? (
              <InspectionField label="Occupied by">
                {occupant
                  ? realmResourceOccupantOwnerLabel(occupant)
                  : node?.occupiedByViewer ? 'Your expedition' : node?.originCastle?.name}
              </InspectionField>
            ) : null}
            {!occupancyUnavailable && (occupant || node?.occupation) ? (
              <InspectionField label="Gather rate">+1 Gold / minute</InspectionField>
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
            && onDispatchGoldExpedition ? (
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

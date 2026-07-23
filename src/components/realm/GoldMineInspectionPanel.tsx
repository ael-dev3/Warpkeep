import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref
} from 'react';

import {
  goldExpeditionForNode,
  type GoldExpeditionPresentation,
  type ReadyGoldExpeditionPresentation
} from './realmGoldExpeditionPresentation';
import {
  goldNodeAvailabilityLabel,
  goldNodeNextAuthorityTimestamp,
  type RealmGoldNodePresentation
} from './realmGoldNodePresentation';
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
  /**
   * Exact caller-only procedure data. It is rendered only after its active
   * expedition is joined to this public site and public origin castle.
   */
  privateExpedition?: GoldExpeditionPresentation;
  /**
   * A guarded server reducer boundary supplied by the authenticated provider.
   * The panel never changes public occupation, Gold, or node availability.
   */
  onDispatchGoldExpedition?: (siteId: string) => Promise<void>;
  /** Guarded owner-only settlement reducer; no browser balance mutation. */
  onClaimGoldExpedition?: () => Promise<void>;
  onRequestClose: () => void;
  focusTargetRef?: Ref<HTMLButtonElement>;
}>;

function localNowMicros() {
  return BigInt(Date.now()) * 1_000n;
}

function formatRemainingDuration(timestampMicros: bigint | undefined) {
  if (timestampMicros === undefined) return undefined;
  const remaining = timestampMicros - localNowMicros();
  if (remaining <= 0n) return 'Awaiting Realm confirmation';
  const totalMinutes = remaining / 60_000_000n;
  const days = totalMinutes / 1_440n;
  const hours = (totalMinutes % 1_440n) / 60n;
  const minutes = totalMinutes % 60n;
  if (days > 0n) return `${days}d ${hours}h remaining`;
  if (hours > 0n) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

function nodeNotice(node: RealmGoldNodePresentation | undefined) {
  if (!node) {
    return 'This record presents the site only; it does not disclose player inventory or gathering authority.';
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

function visibleOwnerExpedition(
  node: RealmGoldNodePresentation | undefined,
  privateExpedition: GoldExpeditionPresentation | undefined
): ReadyGoldExpeditionPresentation | undefined {
  if (!node?.originCastle || !node.occupation || !node.occupiedByViewer) return undefined;
  return goldExpeditionForNode(privateExpedition, {
    siteId: node.siteId,
    originCastleId: node.originCastle.castleId,
    phase: node.occupation.phase,
    startedAtMicros: node.occupation.startedAtMicros,
    arrivesAtMicros: node.occupation.arrivesAtMicros,
    gatheringEndsAtMicros: node.occupation.gatheringEndsAtMicros,
    returnsAtMicros: node.occupation.returnsAtMicros
  });
}

function formatGold(value: bigint) {
  return value.toLocaleString('en-US');
}

/**
 * A public Gold Mine record with narrowly injected, authenticated actions.
 * Presentation never owns map state, resource settlement, or node occupancy.
 */
export function GoldMineInspectionPanel({
  id,
  mine,
  node,
  privateExpedition,
  onDispatchGoldExpedition,
  onClaimGoldExpedition,
  onRequestClose,
  focusTargetRef
}: GoldMineInspectionPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [dispatchState, setDispatchState] = useState<
    'idle' | 'submitting' | 'submitted' | 'failed'
  >('idle');
  const [claimState, setClaimState] = useState<'idle' | 'submitting' | 'failed'>('idle');
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const scheduleTimestamp = node ? goldNodeNextAuthorityTimestamp(node) : undefined;
  const scheduleLabel = formatRemainingDuration(scheduleTimestamp);
  const ownerExpedition = visibleOwnerExpedition(node, privateExpedition);
  const privateExpeditionActive = privateExpedition?.status === 'ready'
    && privateExpedition.active;
  const privateActiveSiteId = privateExpeditionActive
    ? privateExpedition?.expedition?.siteId
    : undefined;
  const awaitingPublicOccupation = node?.availability === 'available'
    && (
      privateActiveSiteId === node.siteId
      || (!privateExpeditionActive && dispatchState === 'submitted')
    );
  const expeditionActiveElsewhere = node?.availability === 'available'
    && privateExpeditionActive
    && privateActiveSiteId !== node.siteId;
  const canDispatch = node?.availability === 'available'
    && onDispatchGoldExpedition !== undefined
    && !privateExpeditionActive
    && (dispatchState === 'idle' || dispatchState === 'failed');
  const canClaim = ownerExpedition !== undefined
    && ownerExpedition.pendingGold > 0n
    && onClaimGoldExpedition !== undefined
    && claimState !== 'submitting';
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
    setClaimState('idle');
  }, [node?.siteId, node?.availability]);

  const dispatch = useCallback(async () => {
    if (!node || node.availability !== 'available' || !onDispatchGoldExpedition) return;
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
  }, [node, onDispatchGoldExpedition]);

  const claim = useCallback(async () => {
    if (!canClaim || !onClaimGoldExpedition) return;
    setClaimState('submitting');
    try {
      // The refreshed private resource/expedition views, not this callback,
      // decide whether settlement completed and what balance is now visible.
      await onClaimGoldExpedition();
      setClaimState('idle');
    } catch {
      setClaimState('failed');
    }
  }, [canClaim, onClaimGoldExpedition]);

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
                {goldNodeAvailabilityLabel(node.availability)}
              </InspectionField>
            ) : null}
            {node?.originCastle ? (
              <InspectionField label="Occupied by">
                {node.occupiedByViewer ? 'Your expedition' : node.originCastle.name}
              </InspectionField>
            ) : null}
            {node?.occupation ? (
              <InspectionField label="Gather rate">+1 Gold / minute</InspectionField>
            ) : null}
            {ownerExpedition ? (
              <InspectionField label="Pending Gold">
                {formatGold(ownerExpedition.pendingGold)}
              </InspectionField>
            ) : null}
            {scheduleLabel ? (
              <InspectionField label="Realm schedule">{scheduleLabel}</InspectionField>
            ) : null}
          </dl>
          <p className="gold-mine-inspection__notice">
            {nodeNotice(node)}
          </p>
          {node?.availability === 'available' && onDispatchGoldExpedition ? (
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
          {ownerExpedition && onClaimGoldExpedition ? (
            <div className="gold-mine-inspection__action gold-mine-inspection__action--claim">
              <button
                aria-describedby={descriptionId}
                disabled={!canClaim}
                onClick={() => void claim()}
                type="button"
              >
                {claimState === 'submitting' ? 'CLAIMING GOLD…' : 'CLAIM ACCRUED GOLD'}
              </button>
              <p aria-live="polite" className="gold-mine-inspection__action-status">
                {claimState === 'failed'
                  ? 'The Realm could not confirm this claim. Try again after the record refreshes.'
                  : canClaim
                    ? 'Claim is confirmed only when the Realm refreshes your private resource record.'
                    : 'Accrued Gold will become claimable when the Realm reports a positive pending amount.'}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

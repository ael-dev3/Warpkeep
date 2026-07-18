import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref
} from 'react';

import {
  createFoodExpeditionIdempotencyKey,
  foodExpeditionForNode,
  type FoodExpeditionPresentation,
  type ReadyFoodExpeditionPresentation
} from './realmFoodExpeditionPresentation';
import {
  foodNodeAvailabilityLabel,
  foodNodeNextAuthorityTimestamp,
  type RealmFoodNodePresentation
} from './realmFoodNodePresentation';
import './FoodFarmInspectionPanel.css';

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

export type FoodFarmInspectionRecord = Readonly<{
  name: string;
  tier: number;
}>;

export type FoodFarmInspectionPanelProps = Readonly<{
  id: string;
  farm: FoodFarmInspectionRecord;
  /** Validated public Food site only; no balances or reducer authority. */
  node?: RealmFoodNodePresentation;
  /** Exact caller-only procedure data, joined again to the public site. */
  privateExpedition?: FoodExpeditionPresentation;
  /** Authenticated provider boundary; no optimistic public node mutation. */
  onDispatchFoodExpedition?: (siteId: string, idempotencyKey: string) => Promise<void>;
  /** Owner-only settlement boundary; resources refresh after server confirmation. */
  onClaimFoodExpedition?: () => Promise<void>;
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

function nodeNotice(node: RealmFoodNodePresentation | undefined) {
  if (!node) {
    return 'This record presents the Farm only; it does not disclose player inventory or gathering authority.';
  }
  if (node.availability === 'available') {
    return 'This Farm is available. A dispatch exists only after the Realm records the occupation.';
  }
  if (node.availability === 'unavailable') {
    return 'The public Food state is incomplete. The Realm has not presented this Farm as available.';
  }
  if (node.occupiedByViewer) {
    return 'Your expedition is recorded by the Realm. Food settlement remains server-authoritative.';
  }
  return 'This Farm is occupied. Public occupancy is visible, but another player’s resources remain private.';
}

function visibleOwnerExpedition(
  node: RealmFoodNodePresentation | undefined,
  privateExpedition: FoodExpeditionPresentation | undefined
): ReadyFoodExpeditionPresentation | undefined {
  if (!node?.originCastle || !node.occupation || !node.occupiedByViewer) return undefined;
  return foodExpeditionForNode(privateExpedition, {
    siteId: node.siteId,
    originCastleId: node.originCastle.castleId,
    phase: node.occupation.phase,
    startedAtMicros: node.occupation.startedAtMicros,
    arrivesAtMicros: node.occupation.arrivesAtMicros,
    gatheringEndsAtMicros: node.occupation.gatheringEndsAtMicros,
    returnsAtMicros: node.occupation.returnsAtMicros
  });
}

/**
 * The Farm inspector mirrors the Gold safety boundary: public site rows own
 * availability, the exact private procedure owns pending Food, and actions
 * only cross an authenticated provider reducer boundary.
 */
export function FoodFarmInspectionPanel({
  id,
  farm,
  node,
  privateExpedition,
  onDispatchFoodExpedition,
  onClaimFoodExpedition,
  onRequestClose,
  focusTargetRef
}: FoodFarmInspectionPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [dispatchState, setDispatchState] = useState<'idle' | 'submitting' | 'failed'>('idle');
  const [claimState, setClaimState] = useState<'idle' | 'submitting' | 'failed'>('idle');
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const scheduleTimestamp = node ? foodNodeNextAuthorityTimestamp(node) : undefined;
  const scheduleLabel = formatRemainingDuration(scheduleTimestamp);
  const ownerExpedition = visibleOwnerExpedition(node, privateExpedition);
  const canDispatch = node?.availability === 'available'
    && onDispatchFoodExpedition !== undefined
    && dispatchState !== 'submitting';
  const canClaim = ownerExpedition !== undefined
    && ownerExpedition.pendingFood > 0n
    && onClaimFoodExpedition !== undefined
    && claimState !== 'submitting';

  const setCloseButtonRef = useCallback((element: HTMLButtonElement | null) => {
    closeButtonRef.current = element;
    assignRef(focusTargetRef, element);
  }, [focusTargetRef]);

  useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
  }, [farm.name, farm.tier, id]);

  useEffect(() => {
    setDispatchState('idle');
    setClaimState('idle');
  }, [node?.availability, node?.siteId]);

  const dispatch = useCallback(async () => {
    if (!node || node.availability !== 'available' || !onDispatchFoodExpedition) return;
    const idempotencyKey = createFoodExpeditionIdempotencyKey();
    if (!idempotencyKey) {
      setDispatchState('failed');
      return;
    }
    setDispatchState('submitting');
    try {
      await onDispatchFoodExpedition(node.siteId, idempotencyKey);
      setDispatchState('idle');
    } catch {
      setDispatchState('failed');
    }
  }, [node, onDispatchFoodExpedition]);

  const claim = useCallback(async () => {
    if (!canClaim || !onClaimFoodExpedition) return;
    setClaimState('submitting');
    try {
      await onClaimFoodExpedition();
      setClaimState('idle');
    } catch {
      setClaimState('failed');
    }
  }, [canClaim, onClaimFoodExpedition]);

  return (
    <aside
      id={id}
      className="gold-mine-inspection food-farm-inspection"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-open="true"
    >
      <div aria-hidden="true" className="gold-mine-inspection__art-stage food-farm-inspection__art-stage">
        <img
          alt=""
          aria-hidden="true"
          className="gold-mine-inspection__hero-art food-farm-inspection__hero-art"
          decoding="async"
          draggable={false}
          height="512"
          src={publicAssetUrl('images/resources/hegemony-food-5c012a7e939f8796.webp')}
          width="512"
        />
      </div>

      <div className="gold-mine-inspection__drawer">
        <header className="gold-mine-inspection__hero">
          <button
            ref={setCloseButtonRef}
            className="gold-mine-inspection__dismiss"
            aria-label="CLOSE FOOD FARM RECORD"
            onClick={onRequestClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
          <div className="gold-mine-inspection__title-lockup">
            <p>TIER {farm.tier} GATHERING SITE</p>
            <h2 id={titleId}>{farm.name}</h2>
          </div>
        </header>

        <div className="gold-mine-inspection__body">
          <p id={descriptionId} className="gold-mine-inspection__description">
            A sunlit Hegemony Wheat Farm. Availability and all gathering operations are
            determined by the Realm.
          </p>
          <dl className="gold-mine-inspection__fields" aria-label="Food Farm record">
            <InspectionField label="Resource">Food</InspectionField>
            <InspectionField label="Node tier">{farm.tier}</InspectionField>
            {node ? (
              <InspectionField label="Site state">
                {foodNodeAvailabilityLabel(node.availability)}
              </InspectionField>
            ) : null}
            {node?.originCastle ? (
              <InspectionField label="Occupied by">
                {node.occupiedByViewer ? 'Your expedition' : node.originCastle.name}
              </InspectionField>
            ) : null}
            {node ? (
              <InspectionField label="Gather rate">+1 Food / minute</InspectionField>
            ) : null}
            {ownerExpedition ? (
              <InspectionField label="Pending Food">
                {ownerExpedition.pendingFood.toLocaleString('en-US')}
              </InspectionField>
            ) : null}
            {scheduleLabel ? (
              <InspectionField label="Realm schedule">{scheduleLabel}</InspectionField>
            ) : null}
          </dl>
          <p className="gold-mine-inspection__notice">{nodeNotice(node)}</p>
          {node?.availability === 'available' && onDispatchFoodExpedition ? (
            <div className="gold-mine-inspection__action">
              <button
                aria-describedby={descriptionId}
                disabled={!canDispatch}
                onClick={() => void dispatch()}
                type="button"
              >
                {dispatchState === 'submitting' ? 'DISPATCHING WAGON…' : 'DISPATCH WAGON'}
              </button>
              <p aria-live="polite" className="gold-mine-inspection__action-status">
                {dispatchState === 'failed'
                  ? 'The Realm could not confirm this dispatch. Check the Farm state and try again.'
                  : 'Dispatch is confirmed only when the Realm publishes the occupation.'}
              </p>
            </div>
          ) : null}
          {ownerExpedition && onClaimFoodExpedition ? (
            <div className="gold-mine-inspection__action gold-mine-inspection__action--claim">
              <button
                aria-describedby={descriptionId}
                disabled={!canClaim}
                onClick={() => void claim()}
                type="button"
              >
                {claimState === 'submitting' ? 'CLAIMING FOOD…' : 'CLAIM ACCRUED FOOD'}
              </button>
              <p aria-live="polite" className="gold-mine-inspection__action-status">
                {claimState === 'failed'
                  ? 'The Realm could not confirm this claim. Try again after the record refreshes.'
                  : canClaim
                    ? 'Claim is confirmed only when the Realm refreshes your private resource record.'
                    : 'Accrued Food becomes claimable when the Realm reports a positive pending amount.'}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

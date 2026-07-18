import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
  type Ref
} from 'react';

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
  onRequestClose: () => void;
  focusTargetRef?: Ref<HTMLButtonElement>;
}>;

/**
 * A display-only record for a future approved Gold Mine interaction target.
 * It intentionally has no map binding, resource authority, balance, reserve,
 * ownership, or gathering action; the current Realm contains no Gold sites.
 */
export function GoldMineInspectionPanel({
  id,
  mine,
  onRequestClose,
  focusTargetRef
}: GoldMineInspectionPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  const setCloseButtonRef = useCallback((element: HTMLButtonElement | null) => {
    closeButtonRef.current = element;
    assignRef(focusTargetRef, element);
  }, [focusTargetRef]);

  useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
  }, [id, mine.name, mine.tier]);

  return (
    <aside
      id={id}
      className="gold-mine-inspection"
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
          </dl>
          <p className="gold-mine-inspection__notice">
            This record presents the site only; it does not disclose player inventory or
            gathering authority.
          </p>
        </div>
      </div>
    </aside>
  );
}

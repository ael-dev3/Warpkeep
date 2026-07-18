import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
  type Ref
} from 'react';

import './GoldMineInspectionPanel.css';
import './StoneQuarryInspectionPanel.css';

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

export type StoneQuarryInspectionPanelProps = Readonly<{
  id: string;
  /**
   * The panel is decorative and currently unmounted. A separately reviewed,
   * authoritative Stone-site integration must supply any future map trigger.
   */
  onRequestClose: () => void;
  focusTargetRef?: Ref<HTMLButtonElement>;
}>;

/**
 * A high-resolution Stone Quarry visual record, prepared for a future
 * authoritative site integration. It intentionally exposes no placement,
 * availability, dispatch, balance, reward, or browser-owned game state.
 */
export function StoneQuarryInspectionPanel({
  id,
  onRequestClose,
  focusTargetRef
}: StoneQuarryInspectionPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  const setCloseButtonRef = useCallback((element: HTMLButtonElement | null) => {
    closeButtonRef.current = element;
    assignRef(focusTargetRef, element);
  }, [focusTargetRef]);

  useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
  }, [id]);

  return (
    <aside
      id={id}
      className="gold-mine-inspection stone-quarry-inspection"
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
            <p>VISUAL REFERENCE</p>
            <h2 id={titleId}>Stone Quarry</h2>
          </div>
        </header>

        <div className="gold-mine-inspection__body">
          <p id={descriptionId} className="gold-mine-inspection__description">
            A high-resolution Hegemony Quarry record prepared for visual review. No Stone site is
            currently active in the Realm.
          </p>
          <dl className="gold-mine-inspection__fields" aria-label="Stone Quarry visual record">
            <InspectionField label="Resource">Stone</InspectionField>
            <InspectionField label="Record state">Asset staged</InspectionField>
            <InspectionField label="Realm site">Not integrated</InspectionField>
          </dl>
          <p className="gold-mine-inspection__notice">
            This reference does not create a map placement, gathering action, balance, reward, or
            authority.
          </p>
        </div>
      </div>
    </aside>
  );
}

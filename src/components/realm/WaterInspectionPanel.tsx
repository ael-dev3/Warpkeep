import {
  useCallback,
  useEffect,
  useRef,
  type Ref
} from 'react';

import type { RealmWaterInspectionRecord } from './realmWaterInspectionPresentation';
import './WaterInspectionPanel.css';

export type WaterInspectionPanelProps = Readonly<{
  id: string;
  record: RealmWaterInspectionRecord;
  focusTargetRef?: Ref<HTMLButtonElement>;
  onRequestClose: () => void;
  onFocusCell?: (cellKey: string) => void;
  onViewUnderlyingCell?: () => void;
}>;

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

function WaterRecordArt({ record }: Readonly<{ record: RealmWaterInspectionRecord }>) {
  return (
    <div
      aria-hidden="true"
      className={`water-inspection__art water-inspection__art--${record.regime}`}
      data-art-status="programmatic-placeholder"
      data-art-provenance="approved-water-record-art-unavailable"
    >
      <span className="water-inspection__art-sun" />
      <span className="water-inspection__art-horizon" />
      <span className="water-inspection__art-wave water-inspection__art-wave--one" />
      <span className="water-inspection__art-wave water-inspection__art-wave--two" />
      <span className="water-inspection__art-crest">{record.regime === 'river' ? '≋' : '◌'}</span>
    </div>
  );
}

function PublicField({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="water-inspection__field">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function WaterInspectionPanel({
  id,
  record,
  focusTargetRef,
  onRequestClose,
  onFocusCell,
  onViewUnderlyingCell
}: WaterInspectionPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const setCloseButtonRef = useCallback((element: HTMLButtonElement | null) => {
    closeButtonRef.current = element;
    assignRef(focusTargetRef, element);
  }, [focusTargetRef]);

  useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
  }, [id, record.cellKey]);

  const eyebrow = record.regime === 'river'
    ? 'RIVER'
    : record.displayType === 'coast' ? 'COAST' : 'OUTER SEA';
  const position = record.riverPosition
    ? `${record.riverPosition} · ${record.flowClass}`
    : `${record.oceanDepthClass} · ${record.fogBand} view`;

  return (
    <aside
      id={id}
      className="water-inspection"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-open="true"
      data-water-cell-key={record.cellKey}
      data-water-regime={record.regime}
    >
      <div className="water-inspection__drawer">
        <header className="water-inspection__hero">
          <div className="water-inspection__hero-art-stage">
            <WaterRecordArt record={record} />
          </div>
          <button
            ref={setCloseButtonRef}
            aria-label="CLOSE WATER RECORD"
            className="water-inspection__dismiss"
            onClick={onRequestClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
          <div className="water-inspection__title-lockup">
            <p>{eyebrow} · PUBLIC REALM RECORD</p>
            <h2 id={titleId}>{record.displayName}</h2>
          </div>
        </header>
        <div className="water-inspection__body">
          <p id={descriptionId} className="water-inspection__description">{record.description}</p>
          <dl className="water-inspection__fields" aria-label="Public water data">
            <PublicField label="Coordinates" value={`q ${record.coord.q} · r ${record.coord.r}`} />
            <PublicField label="Body" value={record.bodyId} />
            <PublicField label="Position" value={position} />
            {record.regime === 'river' ? (
              <>
                <PublicField label="River cell" value={`${(record.riverOrder ?? 0) + 1} / ${record.riverCellCount}`} />
                <PublicField label="Source → mouth" value={`${record.sourceCoord?.q},${record.sourceCoord?.r} → ${record.mouthCoord?.q},${record.mouthCoord?.r}`} />
                <PublicField label="Flow" value={record.downstreamWaterCellKey ? 'downstream link recorded' : 'mouth reached'} />
                <PublicField
                  label="Underlying land"
                  value={record.underlyingPassable === false
                    ? 'blocked'
                    : record.underlyingPassable === true ? 'passable' : 'not asserted'}
                />
              </>
            ) : (
              <>
                <PublicField label="Depth class" value={record.oceanDepthClass ?? 'open water'} />
                <PublicField label="Fog boundary" value={`${record.fogBand} public view; deeper cells remain hidden`} />
              </>
            )}
          </dl>
          <p className="water-inspection__read-only">{record.gameplayBoundary}</p>
          <div className="water-inspection__actions">
            {record.regime === 'river' && record.sourceCellKey && onFocusCell ? (
              <button type="button" onClick={() => onFocusCell(record.sourceCellKey!)}>FOLLOW TO SOURCE</button>
            ) : null}
            {record.regime === 'river' && record.mouthCellKey && onFocusCell ? (
              <button type="button" onClick={() => onFocusCell(record.mouthCellKey!)}>FOLLOW TO MOUTH</button>
            ) : null}
            {record.regime === 'river' && onViewUnderlyingCell ? (
              <button type="button" onClick={onViewUnderlyingCell}>VIEW UNDERLYING CELL</button>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  );
}

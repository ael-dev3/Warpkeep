import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type Ref
} from 'react';

import type { RealmWaterInspectionRecord } from './realmWaterInspectionPresentation';
import { RealmRecordField } from './RealmRecordPrimitives';
import './WaterInspectionPanel.css';

export type WaterInspectionPanelProps = Readonly<{
  id: string;
  record: RealmWaterInspectionRecord;
  focusTargetRef?: Ref<HTMLButtonElement>;
  /** Enables operator-only realm coordinates and opaque persistence identifiers. */
  showDiagnostics?: boolean;
  onRequestClose: () => void;
  onSelectCell?: (cellKey: string) => void;
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

export function WaterInspectionPanel({
  id,
  record,
  focusTargetRef,
  showDiagnostics = false,
  onRequestClose,
  onSelectCell,
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

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || event.repeat) return;
    event.preventDefault();
    event.stopPropagation();
    onRequestClose();
  };

  return (
    <aside
      id={id}
      className="water-inspection realm-camera-neutral-inspector"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onKeyDown={handleKeyDown}
      data-open="true"
      data-water-cell-key={showDiagnostics ? record.cellKey : undefined}
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
            {showDiagnostics ? (
              <>
                <RealmRecordField className="water-inspection__field" label="Coordinates">
                  q {record.coord.q} · r {record.coord.r}
                </RealmRecordField>
                <RealmRecordField className="water-inspection__field" label="Body">
                  {record.bodyId}
                </RealmRecordField>
              </>
            ) : null}
            <RealmRecordField className="water-inspection__field" label="Position">
              {position}
            </RealmRecordField>
            {record.regime === 'river' ? (
              <>
                <RealmRecordField className="water-inspection__field" label="River cell">
                  {(record.riverOrder ?? 0) + 1} / {record.riverCellCount}
                </RealmRecordField>
                {showDiagnostics ? (
                  <RealmRecordField className="water-inspection__field" label="Source → mouth">
                    {record.sourceCoord?.q},{record.sourceCoord?.r} → {record.mouthCoord?.q},{record.mouthCoord?.r}
                  </RealmRecordField>
                ) : null}
                <RealmRecordField className="water-inspection__field" label="Flow">
                  {record.downstreamWaterCellKey ? 'downstream link recorded' : 'mouth reached'}
                </RealmRecordField>
                <RealmRecordField className="water-inspection__field" label="Underlying terrain">
                  {record.underlyingTerrainLabel
                    ?? (showDiagnostics ? record.underlyingTileKey : undefined)
                    ?? 'not published'}
                </RealmRecordField>
                <RealmRecordField className="water-inspection__field" label="Underlying land">
                  {record.underlyingPassable === false
                    ? 'blocked'
                    : record.underlyingPassable === true ? 'passable' : 'not asserted'}
                </RealmRecordField>
              </>
            ) : (
              <>
                <RealmRecordField className="water-inspection__field" label="Depth class">
                  {record.oceanDepthClass ?? 'open water'}
                </RealmRecordField>
                <RealmRecordField className="water-inspection__field" label="Fog boundary">
                  {record.fogBand} public view; deeper cells remain hidden
                </RealmRecordField>
              </>
            )}
          </dl>
          <p className="water-inspection__read-only">{record.gameplayBoundary}</p>
          <div className="water-inspection__actions">
            {record.regime === 'river' && record.sourceCellKey && onSelectCell ? (
              <button type="button" onClick={() => onSelectCell(record.sourceCellKey!)}>OPEN SOURCE RECORD</button>
            ) : null}
            {record.regime === 'river' && record.mouthCellKey && onSelectCell ? (
              <button type="button" onClick={() => onSelectCell(record.mouthCellKey!)}>OPEN MOUTH RECORD</button>
            ) : null}
            {record.regime === 'river' && onViewUnderlyingCell ? (
              <button
                type="button"
                onClick={() => {
                  onRequestClose();
                  onViewUnderlyingCell();
                }}
              >
                VIEW UNDERLYING CELL
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  );
}

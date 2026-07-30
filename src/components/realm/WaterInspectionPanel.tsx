import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref
} from 'react';

import { useModalFocusBoundary } from '../menu/useModalFocusBoundary';
import type {
  RealmWaterInspectionNavigation,
  RealmWaterInspectionRecord
} from './realmWaterInspectionPresentation';
import { RealmRecordField } from './RealmRecordPrimitives';
import './WaterInspectionPanel.css';

export const WATER_INSPECTION_FOLLOW_INTERVAL_MS = 1_100;

type WaterFollowState = Readonly<{
  direction: 'upstream' | 'downstream';
  bodyId: string;
}>;

export type WaterInspectionPanelProps = Readonly<{
  id: string;
  record: RealmWaterInspectionRecord;
  navigation?: RealmWaterInspectionNavigation;
  focusTargetRef?: Ref<HTMLButtonElement>;
  /** Enables operator-only realm coordinates and opaque persistence identifiers. */
  showDiagnostics?: boolean;
  /** Compact and Mini App records occupy the screen and contain keyboard focus. */
  modal?: boolean;
  onRequestClose: () => void;
  onRequestBack?: () => void;
  onSelectCell?: (cellKey: string) => void;
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

function eventBelongsToPanel(event: KeyboardEvent<HTMLElement>) {
  const target = event.target;
  if (!(target instanceof Element)) return true;
  return target.closest('[role="dialog"]') === event.currentTarget;
}

function editableEventTarget(event: KeyboardEvent<HTMLElement>) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable
    || target.tagName === 'INPUT'
    || target.tagName === 'TEXTAREA'
    || target.tagName === 'SELECT';
}

export function WaterInspectionPanel({
  id,
  record,
  navigation,
  focusTargetRef,
  showDiagnostics = false,
  modal = false,
  onRequestClose,
  onRequestBack,
  onSelectCell,
  onFocusCell,
  onViewUnderlyingCell
}: WaterInspectionPanelProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const initialFocusAppliedRef = useRef(false);
  const [follow, setFollow] = useState<WaterFollowState>();
  const opaqueId = useId();
  // Public Water records must not echo canonical q,r persistence keys into
  // ordinary DOM identifiers. Observer diagnostics may retain their explicit
  // caller id alongside the already-gated coordinate attributes and text.
  const panelId = showDiagnostics ? id : `${opaqueId}-water-record`;
  const titleId = `${panelId}-title`;
  const descriptionId = `${panelId}-description`;
  const setCloseButtonRef = useCallback((element: HTMLButtonElement | null) => {
    closeButtonRef.current = element;
    assignRef(focusTargetRef, element);
  }, [focusTargetRef]);

  useEffect(() => {
    if (initialFocusAppliedRef.current) return;
    initialFocusAppliedRef.current = true;
    closeButtonRef.current?.focus({ preventScroll: true });
  }, [id, record.cellKey]);

  useModalFocusBoundary({
    active: modal,
    dialogRef,
    initialFocusRef: closeButtonRef,
    onEscape: onRequestBack ?? onRequestClose
  });

  useEffect(() => {
    if (!follow) return;
    if (!navigation || !onSelectCell || navigation.bodyId !== follow.bodyId) {
      setFollow(undefined);
      return;
    }
    const nextCellKey = follow.direction === 'downstream'
      ? navigation.nextCellKey
      : navigation.previousCellKey;
    if (!nextCellKey) {
      setFollow(undefined);
      return;
    }
    const timer = window.setTimeout(() => {
      onSelectCell(nextCellKey);
    }, WATER_INSPECTION_FOLLOW_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [
    follow,
    navigation,
    navigation?.cellKey,
    navigation?.nextCellKey,
    navigation?.previousCellKey,
    onSelectCell
  ]);

  const eyebrow = record.regime === 'river'
    ? 'RIVER'
    : record.displayType === 'coast' ? 'COAST' : 'OUTER SEA';
  const position = record.riverPosition
    ? `${record.riverPosition} · ${record.flowClass}`
    : `${record.oceanDepthClass} · ${record.fogBand} view`;

  const selectRecord = (cellKey: string | undefined) => {
    if (!cellKey || !onSelectCell) return;
    setFollow(undefined);
    onSelectCell(cellKey);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (
      event.defaultPrevented
      || event.repeat
      || !eventBelongsToPanel(event)
      || editableEventTarget(event)
    ) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      (onRequestBack ?? onRequestClose)();
      return;
    }
    if (
      event.altKey
      || event.ctrlKey
      || event.metaKey
      || event.shiftKey
      || !navigation
      || !onSelectCell
    ) return;
    const targetCellKey = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
      ? navigation.previousCellKey
      : event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? navigation.nextCellKey
        : event.key === 'Home'
          ? navigation.sourceCellKey
          : event.key === 'End'
            ? navigation.mouthCellKey
            : undefined;
    if (!targetCellKey) return;
    event.preventDefault();
    event.stopPropagation();
    selectRecord(targetCellKey);
  };

  return (
    <aside
      id={panelId}
      className="water-inspection realm-camera-neutral-inspector"
      role="dialog"
      aria-modal={modal}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onKeyDown={handleKeyDown}
      data-open="true"
      data-water-cell-key={showDiagnostics ? record.cellKey : undefined}
      data-water-regime={record.regime}
      ref={dialogRef}
    >
      {onRequestBack ? (
        <button
          className="realm-world-surface-back"
          onClick={onRequestBack}
          type="button"
        >
          <span aria-hidden="true">‹</span>
          BACK
        </button>
      ) : null}
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
                {showDiagnostics ? (
                  <>
                    <RealmRecordField className="water-inspection__field" label="Underlying terrain">
                      {record.underlyingTerrainLabel
                        ?? record.underlyingTileKey
                        ?? 'not published'}
                    </RealmRecordField>
                    <RealmRecordField className="water-inspection__field" label="Underlying land">
                      {record.underlyingPassable === false
                        ? 'blocked'
                        : record.underlyingPassable === true ? 'passable' : 'not asserted'}
                    </RealmRecordField>
                  </>
                ) : null}
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
            {record.regime === 'river' && navigation && onSelectCell ? (
              <>
                <p
                  aria-live="polite"
                  className="water-inspection__navigation-status"
                  role="status"
                >
                  {follow
                    ? `Following ${follow.direction}`
                    : `${navigation.sourceDistance} upstream · ${navigation.mouthDistance} downstream`}
                </p>
                <div
                  aria-label="River step navigation"
                  className="water-inspection__action-grid"
                  role="group"
                >
                  <button
                    aria-keyshortcuts="ArrowLeft ArrowUp"
                    aria-label="Previous upstream river cell"
                    disabled={!navigation.previousCellKey}
                    onClick={() => selectRecord(navigation.previousCellKey)}
                    type="button"
                  >
                    PREVIOUS
                  </button>
                  <button
                    aria-keyshortcuts="ArrowRight ArrowDown"
                    aria-label="Next downstream river cell"
                    disabled={!navigation.nextCellKey}
                    onClick={() => selectRecord(navigation.nextCellKey)}
                    type="button"
                  >
                    NEXT
                  </button>
                  <button
                    aria-keyshortcuts="Home"
                    aria-label="Open river source"
                    disabled={navigation.sourceDistance === 0}
                    onClick={() => selectRecord(navigation.sourceCellKey)}
                    type="button"
                  >
                    SOURCE
                  </button>
                  <button
                    aria-keyshortcuts="End"
                    aria-label="Open river mouth"
                    disabled={navigation.mouthDistance === 0}
                    onClick={() => selectRecord(navigation.mouthCellKey)}
                    type="button"
                  >
                    MOUTH
                  </button>
                </div>
                <div
                  aria-label="River follow controls"
                  className="water-inspection__action-grid"
                  role="group"
                >
                  <button
                    aria-label="Follow river upstream"
                    aria-pressed={follow?.direction === 'upstream'}
                    disabled={!navigation.previousCellKey}
                    onClick={() => setFollow(Object.freeze({
                      direction: 'upstream',
                      bodyId: navigation.bodyId
                    }))}
                    type="button"
                  >
                    FOLLOW UP
                  </button>
                  <button
                    aria-label="Follow river downstream"
                    aria-pressed={follow?.direction === 'downstream'}
                    disabled={!navigation.nextCellKey}
                    onClick={() => setFollow(Object.freeze({
                      direction: 'downstream',
                      bodyId: navigation.bodyId
                    }))}
                    type="button"
                  >
                    FOLLOW DOWN
                  </button>
                  <button
                    aria-label="Stop following river"
                    className="water-inspection__action-wide"
                    disabled={!follow}
                    onClick={() => setFollow(undefined)}
                    type="button"
                  >
                    STOP FOLLOWING
                  </button>
                </div>
              </>
            ) : record.regime === 'river' ? (
              <p className="water-inspection__navigation-status" role="status">
                River navigation is temporarily unavailable for this record.
              </p>
            ) : null}
            {onFocusCell ? (
              <button
                aria-label={`Focus ${record.regime} cell on map`}
                className="water-inspection__action-wide"
                onClick={() => onFocusCell(record.cellKey)}
                type="button"
              >
                FOCUS CELL
              </button>
            ) : null}
            {showDiagnostics && record.regime === 'river' && onViewUnderlyingCell ? (
              <button
                className="water-inspection__action-wide"
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

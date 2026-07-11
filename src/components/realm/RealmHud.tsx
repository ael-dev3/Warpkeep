import { HEGEMONY_FRONTIER_KEEP } from '../../game/map/hegemonyLandmarks';
import type { TerrainCell } from '../../game/map/terrainTypes';
import type { RealmCameraMode } from './realmCameraController';
import type { KeepLoadStatus, RealmIdentity } from './realmTypes';

type RealmHudProps = Readonly<{
  identity: RealmIdentity;
  selectedCell: TerrainCell;
  hoveredCell: TerrainCell | null;
  keepLoadStatus: KeepLoadStatus;
  cameraMode: RealmCameraMode;
  onFocusKeep: () => void;
  onRecenterKeep: () => void;
  onShowRealm: () => void;
  onRequestReturn: () => void;
}>;

function keepTitle(identity: RealmIdentity) {
  return identity.username ? `@${identity.username} Keep` : `FID ${identity.fid} Keep`;
}
function keepStatusCopy(status: KeepLoadStatus) {
  switch (status) {
    case 'loading': return 'Surveyors are preparing the frontier keep.';
    case 'fallback': return 'The frontier marker is holding while the detailed keep is prepared.';
    case 'ready': return 'The frontier keep stands ready for this expedition.';
    default: return 'The center holding is being prepared for your expedition.';
  }
}

function isKeepCell(cell: TerrainCell) {
  return cell.coord.q === 0 && cell.coord.r === 0;
}

export function RealmHud({
  identity,
  selectedCell,
  hoveredCell,
  keepLoadStatus,
  cameraMode,
  onFocusKeep,
  onRecenterKeep,
  onShowRealm,
  onRequestReturn
}: RealmHudProps) {
  const inspectedCell = hoveredCell ?? selectedCell;
  const inspectingHoveredCell = hoveredCell !== null;
  const inspectedIsKeep = isKeepCell(inspectedCell);

  return (
    <section className="realm-hud" aria-labelledby="realm-heading">
      <header className="realm-hud__header">
        <p>HEGEMONY REALM // GENESIS 001</p>
        <h1 id="realm-heading">{keepTitle(identity)}</h1>
        <div className="realm-hud__badges" aria-label="Keep status">
          <span>FID {identity.fid}</span>
          <span>LEVEL {HEGEMONY_FRONTIER_KEEP.level}</span>
        </div>
      </header>

      <div className="realm-hud__selection" aria-live="polite" aria-atomic="true">
        <span>{inspectedIsKeep ? HEGEMONY_FRONTIER_KEEP.name : 'Temperate Lowlands'}</span>
        <strong>
          {inspectingHoveredCell ? 'Surveying' : 'Selected'} cell {inspectedCell.coord.q}, {inspectedCell.coord.r}
        </strong>
        <small>
          {inspectedIsKeep
            ? keepStatusCopy(keepLoadStatus)
            : 'Olive grass · open ground · calm terrain.'}
        </small>
      </div>

      <div className="realm-hud__actions">
        <button type="button" onClick={onRequestReturn}>Return to Menu</button>
        <button type="button" onClick={onRecenterKeep}>Recenter Keep</button>
        {cameraMode === 'keep' ? (
          <button type="button" onClick={onShowRealm}>Realm View</button>
        ) : (
          <button
            type="button"
            aria-label="Select your Hegemony keep"
            onClick={onFocusKeep}
          >
            Inspect Keep
          </button>
        )}
      </div>
      <p className="realm-hud__hint">
        Drag to survey · wheel or pinch to approach · Home recenters · arrows select · Escape returns
      </p>
    </section>
  );
}

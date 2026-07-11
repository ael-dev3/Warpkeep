import { HEGEMONY_FRONTIER_KEEP } from '../../game/map/hegemonyLandmarks';
import type { HexCoord } from '../../game/map/hexCoordinates';
import type { TerrainCell } from '../../game/map/terrainTypes';
import type { RealmCameraMode } from './realmCameraController';
import type { KeepLoadStatus, RealmIdentity } from './realmTypes';

type RealmHudProps = Readonly<{
  identity: RealmIdentity;
  ownCastle?: Readonly<{ name: string; level: number }>;
  keepCoord?: HexCoord;
  sharedTileCount?: number;
  sharedPlayerCount?: number;
  sharedCastleCount?: number;
  selectedCell: TerrainCell;
  hoveredCell: TerrainCell | null;
  keepLoadStatus: KeepLoadStatus;
  cameraMode: RealmCameraMode;
  onFocusKeep: () => void;
  onRecenterKeep: () => void;
  onShowRealm: () => void;
  onRequestReturn: () => void;
}>;

function keepTitle(identity: RealmIdentity, ownCastle: RealmHudProps['ownCastle']) {
  if (ownCastle?.name.trim()) return ownCastle.name;
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

function isKeepCell(cell: TerrainCell, keepCoord: HexCoord) {
  return cell.coord.q === keepCoord.q && cell.coord.r === keepCoord.r;
}

export function RealmHud({
  identity,
  ownCastle,
  keepCoord,
  sharedTileCount,
  sharedPlayerCount,
  sharedCastleCount,
  selectedCell,
  hoveredCell,
  keepLoadStatus,
  cameraMode,
  onFocusKeep,
  onRecenterKeep,
  onShowRealm,
  onRequestReturn
}: RealmHudProps) {
  const authoritativeKeepCoord = keepCoord ?? { q: 0, r: 0 };
  const inspectedCell = hoveredCell ?? selectedCell;
  const inspectingHoveredCell = hoveredCell !== null;
  const inspectedIsKeep = isKeepCell(inspectedCell, authoritativeKeepCoord);

  return (
    <section className="realm-hud" aria-labelledby="realm-heading">
      <header className="realm-hud__header">
        <p>HEGEMONY REALM // GENESIS 001</p>
        <h1 id="realm-heading">{keepTitle(identity, ownCastle)}</h1>
        <div className="realm-hud__badges" aria-label="Keep status">
          <span>FID {identity.fid}</span>
          <span>LEVEL {ownCastle?.level ?? HEGEMONY_FRONTIER_KEEP.level}</span>
        </div>
      </header>

      <div className="realm-hud__selection" aria-live="polite" aria-atomic="true">
        <span>{inspectedIsKeep ? ownCastle?.name ?? HEGEMONY_FRONTIER_KEEP.name : 'Temperate Lowlands'}</span>
        <strong>
          {inspectingHoveredCell ? 'Surveying' : 'Selected'} cell {inspectedCell.coord.q}, {inspectedCell.coord.r}
        </strong>
        <small>
          {inspectedIsKeep
            ? keepStatusCopy(keepLoadStatus)
            : 'Olive grass · open ground · calm terrain.'}
        </small>
      </div>

      {sharedTileCount !== undefined ? (
        <p className="realm-hud__shared-state" aria-label="Shared realm state">
          SHARED LOWLANDS // {sharedTileCount} TILES // {sharedPlayerCount ?? 0} KEEPERS // {sharedCastleCount ?? 0} KEEPS
        </p>
      ) : null}

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

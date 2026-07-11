import { HEGEMONY_FRONTIER_KEEP } from '../../game/map/hegemonyLandmarks';
import type { TerrainCell } from '../../game/map/terrainTypes';
import type { RealmCameraMode } from './realmCameraController';
import type { RealmQuality } from './realmQuality';
import type { KeepLoadStatus, RealmIdentity } from './realmTypes';

type RealmHudProps = Readonly<{
  identity: RealmIdentity;
  selectedCell: TerrainCell;
  selectedIsKeep: boolean;
  keepLoadStatus: KeepLoadStatus;
  cameraMode: RealmCameraMode;
  quality: RealmQuality;
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
    case 'loading': return 'Surveyors are resolving the keep silhouette…';
    case 'fallback': return 'Frontier marker active; the detailed keep was unavailable.';
    case 'ready': return 'Ivory walls and the closed gate are secured.';
    default: return 'The center holding is being prepared.';
  }
}

export function RealmHud({
  identity,
  selectedCell,
  selectedIsKeep,
  keepLoadStatus,
  cameraMode,
  quality,
  onFocusKeep,
  onRecenterKeep,
  onShowRealm,
  onRequestReturn
}: RealmHudProps) {
  return (
    <section className="realm-hud" aria-labelledby="realm-heading">
      <header className="realm-hud__header">
        <p>HEGEMONY REALM // GENESIS 001</p>
        <h1 id="realm-heading">{keepTitle(identity)}</h1>
        <div className="realm-hud__badges" aria-label="Keep status">
          <span>FID {identity.fid}</span>
          <span>LEVEL {HEGEMONY_FRONTIER_KEEP.level}</span>
          <span>{quality.toUpperCase()}</span>
        </div>
      </header>

      <div className="realm-hud__selection" aria-live="polite">
        <span>{selectedIsKeep ? HEGEMONY_FRONTIER_KEEP.name : 'Temperate Lowlands'}</span>
        <strong>Cell {selectedCell.coord.q}, {selectedCell.coord.r}</strong>
        <small>
          {selectedIsKeep
            ? `${keepStatusCopy(keepLoadStatus)} Session-bound prototype.`
            : `Olive grass · elevation ${selectedCell.elevationBias.toFixed(2)} · soil ${selectedCell.soilBias.toFixed(2)}`}
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

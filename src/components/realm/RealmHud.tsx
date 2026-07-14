import { HEGEMONY_FRONTIER_KEEP } from '../../game/map/hegemonyLandmarks';
import type { HexCoord } from '../../game/map/hexCoordinates';
import type { TerrainCell } from '../../game/map/terrainTypes';
import type { RealmCameraMode } from './realmCameraController';
import type { KeepLoadStatus, RealmIdentity } from './realmTypes';
import type { RealmQuality } from './realmQuality';
import type {
  WarpkeepRealmProfile,
  WarpkeepWorldTileMetadata
} from '../../spacetime/warpkeepBackendTypes';
import { formatPublicMarkMicros } from './realmCastlePresentation';

type RealmHudProps = Readonly<{
  identity: RealmIdentity;
  ownCastle?: Readonly<{ name: string; level: number }>;
  ownProfile?: WarpkeepRealmProfile;
  marksStatus?: 'loading' | 'unavailable' | 'ready';
  keepCoord?: HexCoord;
  sharedTileCount?: number;
  sharedPlayerCount?: number;
  sharedCastleCount?: number;
  selectedCell: TerrainCell;
  hoveredCell: TerrainCell | null;
  selectedTileMetadata?: WarpkeepWorldTileMetadata;
  hoveredTileMetadata?: WarpkeepWorldTileMetadata;
  keepLoadStatus: KeepLoadStatus;
  cameraMode: RealmCameraMode;
  quality: RealmQuality;
  onFrameFoundingDistrict?: () => void;
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

function publicAssetUrl(path: string) {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`;
}

function publicWorldKind(value: unknown) {
  const bounded = (typeof value === 'string' ? value : '')
    .replace(/[^a-z0-9-]/gi, '')
    .slice(0, 32)
    .replace(/-/g, ' ');
  return bounded
    ? bounded.replace(/\b\w/g, (character) => character.toLocaleUpperCase())
    : 'Unclassified';
}

function tilePresentation(metadata: WarpkeepWorldTileMetadata | undefined) {
  if (
    !metadata
    || typeof metadata.passable !== 'boolean'
    || typeof metadata.terrainKind !== 'string'
    || typeof metadata.staticContentKind !== 'string'
    || !Number.isSafeInteger(metadata.movementCost)
    || !Number.isSafeInteger(metadata.generationVersion)
  ) {
    return {
      title: 'Temperate Lowlands',
      detail: 'Olive grass · terrain record pending.'
    };
  }
  const terrain = publicWorldKind(metadata.terrainKind);
  const content = publicWorldKind(metadata.staticContentKind);
  return metadata.passable
    ? {
        title: `${terrain} · ${content}`,
        detail: `Traversable terrain · movement cost ${metadata.movementCost} · generation ${metadata.generationVersion}.`
      }
    : {
        title: `${terrain} · ${content}`,
        detail: `Scenic boundary · not traversable · generation ${metadata.generationVersion}.`
      };
}

function MarksBalance({
  profile,
  status
}: Readonly<{
  profile: WarpkeepRealmProfile | undefined;
  status: NonNullable<RealmHudProps['marksStatus']>;
}>) {
  const formatted = status === 'ready'
    ? formatPublicMarkMicros(profile?.marksBalanceMicros)
    : undefined;
  const copy = formatted !== undefined
    ? `${formatted} Marks`
    : status === 'loading'
      ? 'Loading Marks…'
      : 'Marks not available';
  return (
    <div
      className="realm-hud__marks"
      aria-label={formatted !== undefined ? `Marks balance: ${copy}` : copy}
      role="status"
    >
      <picture aria-hidden="true">
        <source
          srcSet={publicAssetUrl('images/factions/hegemony/marks/hegemony-mark-64.webp')}
          type="image/webp"
        />
        <img
          alt=""
          decoding="async"
          height="64"
          src={publicAssetUrl('images/factions/hegemony/marks/hegemony-mark-64.png')}
          width="64"
        />
      </picture>
      <span>
        <small>MARKS</small>
        <strong>{copy}</strong>
      </span>
    </div>
  );
}

export function RealmHud({
  identity,
  ownCastle,
  ownProfile,
  marksStatus = 'unavailable',
  keepCoord,
  sharedTileCount,
  sharedPlayerCount,
  sharedCastleCount,
  selectedCell,
  hoveredCell,
  selectedTileMetadata,
  hoveredTileMetadata,
  keepLoadStatus,
  cameraMode,
  quality,
  onFrameFoundingDistrict,
  onFocusKeep,
  onRecenterKeep,
  onShowRealm,
  onRequestReturn
}: RealmHudProps) {
  const authoritativeKeepCoord = keepCoord ?? { q: 0, r: 0 };
  const inspectedCell = hoveredCell ?? selectedCell;
  const inspectingHoveredCell = hoveredCell !== null;
  const inspectedIsKeep = isKeepCell(inspectedCell, authoritativeKeepCoord);
  const inspectedTile = tilePresentation(
    inspectingHoveredCell ? hoveredTileMetadata : selectedTileMetadata
  );
  const selectedIsKeep = isKeepCell(selectedCell, authoritativeKeepCoord);
  const selectedTile = tilePresentation(selectedTileMetadata);
  const selectedAnnouncement = selectedIsKeep
    ? `${ownCastle?.name ?? HEGEMONY_FRONTIER_KEEP.name}. Selected cell ${selectedCell.coord.q}, ${selectedCell.coord.r}. ${keepStatusCopy(keepLoadStatus)}`
    : `${selectedTile.title}. Selected cell ${selectedCell.coord.q}, ${selectedCell.coord.r}. ${selectedTile.detail}`;

  return (
    <section className="realm-hud" aria-labelledby="realm-heading">
      <header className="realm-hud__header">
        <p>HEGEMONY REALM // GENESIS 001</p>
        <h1 id="realm-heading">{keepTitle(identity, ownCastle)}</h1>
        <div className="realm-hud__badges" aria-label="Keep status">
          <span>FID {identity.fid}</span>
          <span>LEVEL {ownCastle?.level ?? HEGEMONY_FRONTIER_KEEP.level}</span>
          <span>QUALITY {quality.toUpperCase()}</span>
        </div>
      </header>

      <div className="realm-hud__selection">
        <span>{inspectedIsKeep ? ownCastle?.name ?? HEGEMONY_FRONTIER_KEEP.name : inspectedTile.title}</span>
        <strong>
          {inspectingHoveredCell ? 'Surveying' : 'Selected'} cell {inspectedCell.coord.q}, {inspectedCell.coord.r}
        </strong>
        <small>
          {inspectedIsKeep
            ? keepStatusCopy(keepLoadStatus)
            : inspectedTile.detail}
        </small>
      </div>
      <p
        aria-atomic="true"
        aria-live="polite"
        className="realm-hud__selection-announcement"
      >
        {selectedAnnouncement}
      </p>


      <MarksBalance profile={ownProfile} status={marksStatus} />

      {sharedTileCount !== undefined ? (
        <p className="realm-hud__shared-state" aria-label="Shared realm state">
          SHARED LOWLANDS // {sharedTileCount} TILES // {sharedPlayerCount ?? 0} KEEPERS // {sharedCastleCount ?? 0} KEEPS
        </p>
      ) : null}

      <div className="realm-hud__actions">
        <button type="button" onClick={onRequestReturn}>Return to Menu</button>
        <button type="button" onClick={onRecenterKeep}>Recenter Keep</button>
        {onFrameFoundingDistrict ? (
          <button
            type="button"
            aria-label="Frame the nearby founding keeps"
            onClick={onFrameFoundingDistrict}
          >
            Founding District
          </button>
        ) : null}
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

import { useRef } from 'react';

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
import {
  castleProfileLabel,
  formatPublicMarkMicros,
  type RealmCastlePublicPresentation
} from './realmCastlePresentation';

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
  selectedCastle?: Readonly<{ name: string; level: number; q: number; r: number }>;
  selectedCastleProfile?: RealmCastlePublicPresentation;
  selectedTileMetadata?: WarpkeepWorldTileMetadata;
  keepLoadStatus: KeepLoadStatus;
  cameraMode: RealmCameraMode;
  quality: RealmQuality;
  onFrameFoundingDistrict?: () => void;
  onFocusKeep: () => void;
  onRecenterKeep: () => void;
  onShowRealm: () => void;
  onRequestReturn: () => void;
}>;

function keeperLabel(identity: RealmIdentity, profile: WarpkeepRealmProfile | undefined) {
  if (profile) return castleProfileLabel(profile);
  return identity.username ? `@${identity.username.replace(/^@+/, '')}` : 'Hegemony Keeper';
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
  selectedCastle,
  selectedCastleProfile,
  selectedTileMetadata,
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
  const selectedIsKeep = isKeepCell(selectedCell, authoritativeKeepCoord);
  const selectedTile = tilePresentation(selectedTileMetadata);
  const selectedCastleLabel = selectedCastleProfile
    ? castleProfileLabel(selectedCastleProfile)
    : 'Hegemony Keep';
  const selectedAnnouncementCandidate = selectedCastle
    ? `${selectedCastleLabel}, ${selectedCastle.name}. Selected castle at cell ${selectedCastle.q}, ${selectedCastle.r}.`
    : selectedIsKeep
      ? `${ownCastle?.name ?? HEGEMONY_FRONTIER_KEEP.name}. Your keep is selected at cell ${selectedCell.coord.q}, ${selectedCell.coord.r}.`
      : `${selectedTile.title}. Selected cell ${selectedCell.coord.q}, ${selectedCell.coord.r}. ${selectedTile.detail}`;
  const selectionAnnouncementKey = selectedCastle
    ? `castle:${selectedCastle.q}:${selectedCastle.r}`
    : `cell:${selectedCell.coord.q}:${selectedCell.coord.r}`;
  const selectionAnnouncementRef = useRef({
    key: selectionAnnouncementKey,
    copy: selectedAnnouncementCandidate
  });
  if (selectionAnnouncementRef.current.key !== selectionAnnouncementKey) {
    selectionAnnouncementRef.current = {
      key: selectionAnnouncementKey,
      copy: selectedAnnouncementCandidate
    };
  }
  const selectedAnnouncement = selectionAnnouncementRef.current.copy;

  return (
    <section className="realm-hud" aria-labelledby="realm-heading">
      <header className="realm-hud__header">
        <p>GENESIS 001 · HEGEMONY REALM</p>
        <h1 id="realm-heading">{ownCastle?.name ?? 'Hegemony Keep'}</h1>
        <span className="realm-hud__keeper">{keeperLabel(identity, ownProfile)}</span>
        <div className="realm-hud__badges" aria-label="Keep status">
          <span>LEVEL {ownCastle?.level ?? HEGEMONY_FRONTIER_KEEP.level}</span>
        </div>
      </header>

      <div className="realm-hud__selection">
        <span>{selectedCastle ? selectedCastleLabel : selectedIsKeep ? ownCastle?.name ?? HEGEMONY_FRONTIER_KEEP.name : selectedTile.title}</span>
        <strong>
          {selectedCastle ? selectedCastle.name : 'Selected terrain'} · {selectedCell.coord.q}, {selectedCell.coord.r}
        </strong>
        <small>
          {selectedCastle
            ? `Level ${selectedCastle.level} castle. Activate its record for trusted public details.`
            : selectedIsKeep
            ? keepStatusCopy(keepLoadStatus)
            : selectedTile.detail}
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
          GENESIS 001 · {sharedTileCount.toLocaleString('en-US')} CELLS · {sharedPlayerCount ?? 0} {(sharedPlayerCount ?? 0) === 1 ? 'KEEPER' : 'KEEPERS'} · {sharedCastleCount ?? 0} {(sharedCastleCount ?? 0) === 1 ? 'KEEP' : 'KEEPS'}
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
        Drag to survey · wheel or pinch to approach · Home recenters · arrows select · Escape closes the top surface
      </p>
    </section>
  );
}

import { useRef } from 'react';

import { HEGEMONY_MAIN_CASTLE } from '../../game/map/hegemonyLandmarks';
import type { HexCoord } from '../../game/map/hexCoordinates';
import {
  realmTerrainLabel,
  type RealmTerrainKind
} from '../../game/map/realmTerrainSemantics';
import type { TerrainCell } from '../../game/map/terrainTypes';
import type { RealmIdentity } from './realmTypes';
import {
  castleProfileLabel,
  formatPublicMarkMicros,
  type RealmCastlePublicPresentation
} from './realmCastlePresentation';
import { CastleProfileAvatar } from './RealmCastleLabels';

type RealmHudProps = Readonly<{
  identity: RealmIdentity;
  ownCastle?: Readonly<{ name: string; level: number }>;
  ownProfile?: RealmCastlePublicPresentation;
  marksStatus?: 'loading' | 'unavailable' | 'ready';
  keepCoord?: HexCoord;
  selectedCell: TerrainCell;
  selectedTerrainKind?: RealmTerrainKind;
  selectedCastle?: Readonly<{ name: string; level: number; q: number; r: number }>;
  selectedCastleProfile?: RealmCastlePublicPresentation;
  onRecenterKeep: () => void;
  onRequestReturn: () => void;
}>;

function keeperLabel(identity: RealmIdentity, profile: RealmCastlePublicPresentation | undefined) {
  if (profile) return castleProfileLabel(profile);
  return identity.username ? `@${identity.username.replace(/^@+/, '')}` : 'Hegemony Keeper';
}

function isKeepCell(cell: TerrainCell, keepCoord: HexCoord) {
  return cell.coord.q === keepCoord.q && cell.coord.r === keepCoord.r;
}

function publicAssetUrl(path: string) {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`;
}

function MarksBalance({
  profile,
  status
}: Readonly<{
  profile: RealmCastlePublicPresentation | undefined;
  status: NonNullable<RealmHudProps['marksStatus']>;
}>) {
  const formatted = status === 'ready'
    ? formatPublicMarkMicros(profile?.marksBalanceMicros)
    : undefined;
  if (formatted === undefined) return null;

  const copy = `${formatted} Marks`;
  return (
    <div
      className="realm-hud__marks"
      aria-label={`Marks balance: ${copy}`}
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
  selectedCell,
  selectedTerrainKind,
  selectedCastle,
  selectedCastleProfile,
  onRecenterKeep,
  onRequestReturn
}: RealmHudProps) {
  const authoritativeKeepCoord = keepCoord ?? { q: 0, r: 0 };
  const playerProfile: RealmCastlePublicPresentation = ownProfile ?? {
    canonicalUsername: identity.username,
    displayName: identity.displayName,
    pfpUrl: identity.pfpUrl,
    communityStatsVisible: false
  };
  const playerLabel = keeperLabel(identity, ownProfile);
  const selectedIsKeep = isKeepCell(selectedCell, authoritativeKeepCoord);
  const selectedTerrainLabel = realmTerrainLabel(selectedTerrainKind);
  const selectedCastleLabel = selectedCastleProfile
    ? castleProfileLabel(selectedCastleProfile)
    : 'Hegemony Keep';
  const selectedTitle = selectedCastle
    ? selectedCastle.name
    : selectedIsKeep
      ? ownCastle?.name ?? HEGEMONY_MAIN_CASTLE.name
      : selectedTerrainLabel;
  const selectedEyebrow = selectedCastle
    ? selectedCastleLabel
    : selectedIsKeep ? 'YOUR KEEP' : 'TERRAIN';
  const selectedAnnouncementCandidate = selectedCastle
    ? `${selectedCastleLabel}, ${selectedCastle.name}. Selected castle at cell ${selectedCastle.q}, ${selectedCastle.r}.`
    : selectedIsKeep
      ? `${selectedTitle}. Your keep is selected at cell ${selectedCell.coord.q}, ${selectedCell.coord.r}.`
      : `${selectedTerrainLabel}. Selected cell ${selectedCell.coord.q}, ${selectedCell.coord.r}.`;
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

  return (
    <>
      <section className="realm-hud" aria-labelledby="realm-heading">
        <header
          aria-label={`Your Farcaster profile: ${playerLabel}`}
          className="realm-hud__header"
        >
          <CastleProfileAvatar profile={playerProfile} />
          <div className="realm-hud__identity">
            <p>GENESIS 001 · 1,261 CELLS</p>
            <h1 id="realm-heading">{ownCastle?.name ?? 'Hegemony Keep'}</h1>
            <span className="realm-hud__keeper">{playerLabel}</span>
          </div>
          <div className="realm-hud__badges" aria-label="Keep status">
            <span>LEVEL {ownCastle?.level ?? HEGEMONY_MAIN_CASTLE.level}</span>
          </div>
        </header>

        <div className="realm-hud__selection" aria-label="Current selection">
          <span>{selectedEyebrow}</span>
          <strong>
            {selectedTitle} · q {selectedCell.coord.q}, r {selectedCell.coord.r}
          </strong>
        </div>
        <p
          aria-atomic="true"
          aria-live="polite"
          className="realm-hud__selection-announcement"
        >
          {selectionAnnouncementRef.current.copy}
        </p>

        <MarksBalance profile={ownProfile} status={marksStatus} />
      </section>

      <div className="realm-hud__actions" aria-label="Realm actions">
        <button type="button" aria-label="Return to Menu" onClick={onRequestReturn}>
          <span aria-hidden="true">Menu</span>
        </button>
        <button type="button" aria-label="Recenter Keep" onClick={onRecenterKeep}>
          <span aria-hidden="true">Home</span>
        </button>
      </div>
    </>
  );
}

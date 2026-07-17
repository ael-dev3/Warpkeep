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

type RealmResourceKey = 'gold' | 'food' | 'stone' | 'wood' | 'marks';

type RealmResourceStripItem = Readonly<{
  key: RealmResourceKey;
  label: string;
  value: string;
  accessibleLabel: string;
  state: 'untracked' | 'available' | 'unavailable';
}>;

function ResourceIcon({ resource }: Readonly<{ resource: RealmResourceKey }>) {
  if (resource === 'marks') {
    return (
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
    );
  }

  return (
    <img
      alt=""
      decoding="async"
      height="1254"
      src={publicAssetUrl(`images/resources/hegemony-${resource}.png`)}
      width="1254"
    />
  );
}

function RealmResourceStrip({
  profile,
  status
}: Readonly<{
  profile: RealmCastlePublicPresentation | undefined;
  status: NonNullable<RealmHudProps['marksStatus']>;
}>) {
  const formatted = status === 'ready'
    ? formatPublicMarkMicros(profile?.marksBalanceMicros)
    : undefined;
  const resources: readonly RealmResourceStripItem[] = [
    {
      key: 'gold',
      label: 'Gold',
      value: '—',
      accessibleLabel: 'Gold: presentation only, not tracked in this build',
      state: 'untracked'
    },
    {
      key: 'food',
      label: 'Food',
      value: '—',
      accessibleLabel: 'Food: presentation only, not tracked in this build',
      state: 'untracked'
    },
    {
      key: 'stone',
      label: 'Stone',
      value: '—',
      accessibleLabel: 'Stone: presentation only, not tracked in this build',
      state: 'untracked'
    },
    {
      key: 'wood',
      label: 'Wood',
      value: '—',
      accessibleLabel: 'Wood: presentation only, not tracked in this build',
      state: 'untracked'
    },
    {
      key: 'marks',
      label: 'Marks',
      value: formatted ?? '—',
      accessibleLabel: formatted
        ? `Marks balance: ${formatted} Marks`
        : 'Marks balance unavailable',
      state: formatted ? 'available' : 'unavailable'
    }
  ];

  return (
    <section className="realm-resource-strip" aria-label="Resources">
      {resources.map((resource) => (
        <div
          key={resource.key}
          aria-label={resource.accessibleLabel}
          className="realm-resource-strip__item"
          data-resource={resource.key}
          data-state={resource.state}
        >
          <ResourceIcon resource={resource.key} />
          <span aria-hidden="true">
            <small>{resource.label}</small>
            <strong>{resource.value}</strong>
          </span>
        </div>
      ))}
    </section>
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
  // RealmMapScreen normally supplies a public profile projected from the
  // canonical own castle. This local fallback only keeps the compact HUD
  // legible during a partial snapshot; CastleProfileAvatar still subjects the
  // image URL to the reviewed, bounded loader before displaying it.
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
      </section>

      <RealmResourceStrip profile={ownProfile} status={marksStatus} />

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

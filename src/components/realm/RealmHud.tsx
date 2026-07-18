import {
  useEffect,
  useRef,
  useState,
  type Ref
} from 'react';

import { HEGEMONY_MAIN_CASTLE } from '../../game/map/hegemonyLandmarks';
import type { HexCoord } from '../../game/map/hexCoordinates';
import {
  realmTerrainLabel,
  type RealmTerrainKind
} from '../../game/map/realmTerrainSemantics';
import type { TerrainCell } from '../../game/map/terrainTypes';
import { SettingsPanel } from '../menu/SettingsPanel';
import { useModalFocusBoundary } from '../menu/useModalFocusBoundary';
import type {
  GraphicsPreference,
  GraphicsQualityTier
} from '../../settings/graphicsPreference';
import type { RealmIdentity } from './realmTypes';
import {
  castleProfileLabel,
  formatPublicMarkMicros,
  type RealmCastlePublicPresentation
} from './realmCastlePresentation';
import { CastleProfileAvatar } from './RealmCastleLabels';
import {
  REALM_ECONOMIC_RESOURCE_ORDER,
  formatCompactRealmMarkMicros,
  formatCompactRealmResourceQuantity,
  formatExactRealmResourceQuantity,
  type ReadyRealmResourcePresentation,
  type RealmEconomicResourceKey
} from './realmResourcePresentation';
import './RealmPlayerChrome.css';

type RealmHudProps = Readonly<{
  identity: RealmIdentity;
  ownCastle?: Readonly<{ name: string; level: number }>;
  ownProfile?: RealmCastlePublicPresentation;
  resources?: ReadyRealmResourcePresentation;
  onCollectResources?: () => Promise<void>;
  keepCoord?: HexCoord;
  selectedCell: TerrainCell;
  selectedTerrainKind?: RealmTerrainKind;
  selectedCastle?: Readonly<{ name: string; level: number; q: number; r: number }>;
  selectedCastleProfile?: RealmCastlePublicPresentation;
  profileTriggerRef?: Ref<HTMLButtonElement>;
  foundedCastleCount?: number;
  graphicsPreference?: GraphicsPreference;
  resolvedGraphicsQuality?: GraphicsQualityTier;
  audioMuted?: boolean;
  onGraphicsPreferenceChange?: (preference: GraphicsPreference) => void;
  onAudioMutedChange?: (muted: boolean) => void;
  onRequestExplore?: () => void;
  onRecenterKeep: () => void;
  onRequestReturn: () => void;
}>;

const RESOURCE_LABELS: Readonly<Record<RealmEconomicResourceKey, string>> = Object.freeze({
  food: 'Food',
  wood: 'Wood',
  stone: 'Stone',
  gold: 'Gold'
});

const RESOURCE_ICON_PATHS: Readonly<
  Record<RealmEconomicResourceKey, Readonly<Record<'png' | 'webp', string>>>
> = Object.freeze({
  food: Object.freeze({
    png: 'images/resources/hegemony-food-c2034046ead78f5f.png',
    webp: 'images/resources/hegemony-food-5c012a7e939f8796.webp'
  }),
  wood: Object.freeze({
    png: 'images/resources/hegemony-wood-d992823f7a7f2999.png',
    webp: 'images/resources/hegemony-wood-add35506da245240.webp'
  }),
  stone: Object.freeze({
    png: 'images/resources/hegemony-stone-e23ed963027579c7.png',
    webp: 'images/resources/hegemony-stone-ac50a538fc202d15.webp'
  }),
  gold: Object.freeze({
    png: 'images/resources/hegemony-gold-3d087ebe1ba2beaf.png',
    webp: 'images/resources/hegemony-gold-522eb5b1f40b5d51.webp'
  })
});

type RealmMenuSurface = 'closed' | 'menu' | 'settings';

function publicAssetUrl(path: string) {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`;
}

function resourceIconPath(resource: RealmEconomicResourceKey, format: 'png' | 'webp') {
  return publicAssetUrl(RESOURCE_ICON_PATHS[resource][format]);
}

function keeperLabel(identity: RealmIdentity, profile: RealmCastlePublicPresentation | undefined) {
  if (identity.username) return `@${identity.username.replace(/^@+/, '')}`;
  if (profile?.canonicalUsername || profile?.displayName) return castleProfileLabel(profile);
  return 'Hegemony Keeper';
}

function isKeepCell(cell: TerrainCell, keepCoord: HexCoord) {
  return cell.coord.q === keepCoord.q && cell.coord.r === keepCoord.r;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

function RealmResourceRail({
  resources
}: Readonly<{ resources: ReadyRealmResourcePresentation }>) {
  const exactMarks = formatPublicMarkMicros(resources.marksBalanceMicros) ?? '0';
  const compactMarks = formatCompactRealmMarkMicros(resources.marksBalanceMicros) ?? '0';
  return (
    <section
      aria-label="Your resources"
      aria-live="polite"
      className="realm-resource-rail"
      data-policy={resources.resourcePolicyVersion}
    >
      <ul>
        {REALM_ECONOMIC_RESOURCE_ORDER.map((resource) => {
          const compact = formatCompactRealmResourceQuantity(resources.balances[resource])!;
          const exact = formatExactRealmResourceQuantity(resources.balances[resource])!;
          const pending = formatExactRealmResourceQuantity(resources.pendingBalances[resource])!;
          return (
            <li
              aria-label={`${RESOURCE_LABELS[resource]} balance: ${exact}; pending yield: ${pending}`}
              key={resource}
            >
              <picture aria-hidden="true">
                <source srcSet={resourceIconPath(resource, 'webp')} type="image/webp" />
                <img
                  alt=""
                  decoding="async"
                  height="64"
                  src={resourceIconPath(resource, 'png')}
                  width="64"
                />
              </picture>
              <strong>{compact}</strong>
            </li>
          );
        })}
        <li aria-label={`Marks balance: ${exactMarks} Marks`} className="realm-resource-rail__marks">
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
          <strong>{compactMarks}</strong>
        </li>
      </ul>
    </section>
  );
}

type RealmCommandDialogProps = Readonly<{
  id: string;
  castleCount: number;
  canOpenSettings: boolean;
  collecting: boolean;
  pendingYield: boolean;
  canCollect: boolean;
  onClose: () => void;
  onCollect: () => void;
  onExplore: () => void;
  onRecenter: () => void;
  onRequestReturn: () => void;
  onSettings: () => void;
}>;

function RealmCommandDialog({
  id,
  castleCount,
  canOpenSettings,
  collecting,
  pendingYield,
  canCollect,
  onClose,
  onCollect,
  onExplore,
  onRecenter,
  onRequestReturn,
  onSettings
}: RealmCommandDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useModalFocusBoundary({ dialogRef, initialFocusRef: headingRef, onEscape: onClose });

  return (
    <div
      className="realm-profile-menu"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby={`${id}-title`}
        aria-modal="true"
        className="realm-profile-menu__panel"
        id={id}
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <p>PLAYER COMMANDS</p>
          <h2 id={`${id}-title`} ref={headingRef} tabIndex={-1}>REALM MENU</h2>
          <button aria-label="Close Realm menu" onClick={onClose} type="button">×</button>
        </header>
        <nav aria-label="Realm menu">
          <button onClick={onRecenter} type="button">
            <strong>MY KEEP</strong>
            <span>Recenter the camera</span>
          </button>
          <button onClick={onExplore} type="button">
            <strong>EXPLORE</strong>
            <span>{castleCount} founded {castleCount === 1 ? 'castle' : 'castles'}</span>
          </button>
          {canCollect && pendingYield ? (
            <button disabled={collecting} onClick={onCollect} type="button">
              <strong>{collecting ? 'COLLECTING…' : 'COLLECT YIELD'}</strong>
              <span>Settle available resources</span>
            </button>
          ) : null}
          {canOpenSettings ? (
            <button onClick={onSettings} type="button">
              <strong>SETTINGS</strong>
              <span>Graphics and audio</span>
            </button>
          ) : null}
          <button onClick={onRequestReturn} type="button">
            <strong>MAIN MENU</strong>
            <span>Leave the Realm view</span>
          </button>
        </nav>
      </section>
    </div>
  );
}

export function RealmHud({
  identity,
  ownCastle,
  ownProfile,
  resources,
  onCollectResources,
  keepCoord,
  selectedCell,
  selectedTerrainKind,
  selectedCastle,
  selectedCastleProfile,
  profileTriggerRef,
  foundedCastleCount = 0,
  graphicsPreference = 'auto',
  resolvedGraphicsQuality = 'balanced',
  audioMuted = false,
  onGraphicsPreferenceChange,
  onAudioMutedChange,
  onRequestExplore,
  onRecenterKeep,
  onRequestReturn
}: RealmHudProps) {
  const [surface, setSurface] = useState<RealmMenuSurface>('closed');
  const [collecting, setCollecting] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const menuId = 'realm-player-menu';
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
  const selectionAnnouncementCandidate = selectedCastle
    ? `${selectedCastleLabel}, ${selectedCastle.name}. Selected castle at cell ${selectedCastle.q}, ${selectedCastle.r}.`
    : selectedIsKeep
      ? `${selectedTitle}. Your keep is selected at cell ${selectedCell.coord.q}, ${selectedCell.coord.r}.`
      : `${selectedTerrainLabel}. Selected cell ${selectedCell.coord.q}, ${selectedCell.coord.r}.`;
  const selectionAnnouncementKey = selectedCastle
    ? `castle:${selectedCastle.q}:${selectedCastle.r}`
    : `cell:${selectedCell.coord.q}:${selectedCell.coord.r}`;
  const selectionAnnouncementRef = useRef({
    key: selectionAnnouncementKey,
    copy: selectionAnnouncementCandidate
  });
  const pendingYield = resources !== undefined && REALM_ECONOMIC_RESOURCE_ORDER.some(
    (resource) => resources.pendingBalances[resource] > 0n
  );

  if (selectionAnnouncementRef.current.key !== selectionAnnouncementKey) {
    selectionAnnouncementRef.current = {
      key: selectionAnnouncementKey,
      copy: selectionAnnouncementCandidate
    };
  }

  useEffect(() => {
    if (surface === 'closed' && wasOpenRef.current) {
      triggerRef.current?.focus({ preventScroll: true });
    }
    wasOpenRef.current = surface !== 'closed';
  }, [surface]);

  const closeThen = (action: () => void) => {
    setSurface('closed');
    action();
  };

  const collect = async () => {
    if (!onCollectResources || !pendingYield || collecting) return;
    setCollecting(true);
    try {
      await onCollectResources();
    } catch {
      // The provider owns the fail-closed recovery path and publishes no
      // optimistic balance. Keep this transient control free of error detail.
    } finally {
      setCollecting(false);
    }
  };

  return (
    <div className="realm-player-chrome">
      <button
        aria-controls={surface === 'menu' ? menuId : undefined}
        aria-expanded={surface === 'menu'}
        aria-haspopup="dialog"
        aria-label={`Open Realm menu for ${playerLabel}`}
        className="realm-profile-trigger"
        onClick={() => setSurface((current) => current === 'closed' ? 'menu' : 'closed')}
        ref={(element) => {
          triggerRef.current = element;
          assignRef(profileTriggerRef, element);
        }}
        type="button"
      >
        <CastleProfileAvatar profile={playerProfile} />
      </button>

      {resources ? <RealmResourceRail resources={resources} /> : null}

      <p
        aria-atomic="true"
        aria-live="polite"
        className="realm-player-chrome__selection-announcement"
      >
        {selectionAnnouncementRef.current.copy}
      </p>

      {surface === 'menu' ? (
        <RealmCommandDialog
          id={menuId}
          castleCount={foundedCastleCount}
          canOpenSettings={onGraphicsPreferenceChange !== undefined}
          collecting={collecting}
          pendingYield={pendingYield}
          canCollect={onCollectResources !== undefined}
          onClose={() => setSurface('closed')}
          onCollect={() => void collect()}
          onExplore={() => closeThen(() => onRequestExplore?.())}
          onRecenter={() => closeThen(onRecenterKeep)}
          onRequestReturn={() => closeThen(onRequestReturn)}
          onSettings={() => setSurface('settings')}
        />
      ) : null}

      {surface === 'settings' && onGraphicsPreferenceChange ? (
        <SettingsPanel
          audioMuted={audioMuted}
          closeLabel="BACK TO REALM MENU"
          onAudioMutedChange={onAudioMutedChange}
          onChange={onGraphicsPreferenceChange}
          onClose={() => setSurface('menu')}
          preference={graphicsPreference}
          resolvedQuality={resolvedGraphicsQuality}
        />
      ) : null}
    </div>
  );
}

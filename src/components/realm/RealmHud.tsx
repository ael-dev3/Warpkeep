import {
  useEffect,
  useId,
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
  activeWagons?: readonly RealmActiveWagonMenuItem[];
  onOpenActiveWagon?: (wagon: RealmActiveWagonMenuItem) => void;
  onRecenterKeep: () => void;
  onRequestReturn: () => void;
}>;

const RESOURCE_LABELS: Readonly<Record<RealmEconomicResourceKey, string>> = Object.freeze({
  food: 'Food',
  wood: 'Wood',
  stone: 'Stone',
  gold: 'Gold'
});

type RealmResourceTooltipKey = RealmEconomicResourceKey | 'marks';

export type RealmActiveWagonMenuItem = Readonly<{
  resource: RealmEconomicResourceKey;
  siteId: string;
  phase: 'outbound' | 'gathering' | 'returning';
}>;

const REALM_RESOURCE_TOOLTIP_ORDER: readonly RealmResourceTooltipKey[] = Object.freeze([
  ...REALM_ECONOMIC_RESOURCE_ORDER,
  'marks'
]);

const RESOURCE_TOOLTIP_COPY: Readonly<Record<RealmResourceTooltipKey, string>> = Object.freeze({
  food:
    'Food currently comes from your keep’s private terrain yield and gathering at Wheat Farms. No Food spending is live yet.',
  wood:
    'Wood currently comes from your keep’s private terrain yield and gathering at Logging Camps. No Wood spending is live yet.',
  stone:
    'Stone currently comes from your keep’s private terrain yield and gathering at Stone Quarries. No Stone spending is live yet.',
  gold:
    'Gold currently comes from gathering at Gold Mines; your keep’s terrain produces no Gold. No Gold spending is live yet.',
  marks:
    'Community Marks are a separate experimental accounting balance, not an economic resource. They currently have no spending, transfer, conversion, redemption, or reward loop.'
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
  const tooltipIdPrefix = `realm-resource-tooltip-${useId().replace(/:/g, '')}`;
  const railRef = useRef<HTMLElement>(null);
  const [activeTooltip, setActiveTooltip] = useState<RealmResourceTooltipKey | null>(null);
  const exactMarks = formatPublicMarkMicros(resources.marksBalanceMicros) ?? '0';
  const compactMarks = formatCompactRealmMarkMicros(resources.marksBalanceMicros) ?? '0';

  useEffect(() => {
    if (activeTooltip === null) return undefined;

    const dismissOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && railRef.current?.contains(target)) return;
      setActiveTooltip(null);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setActiveTooltip(null);
    };

    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('keydown', dismissOnEscape, true);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('keydown', dismissOnEscape, true);
    };
  }, [activeTooltip]);

  const tooltipId = (resource: RealmResourceTooltipKey) => (
    `${tooltipIdPrefix}-${resource}`
  );
  const tooltipPresentation = (resource: RealmResourceTooltipKey) => {
    if (resource === 'marks') {
      return {
        label: 'Community Marks',
        status: `${exactMarks} Marks`
      };
    }
    return {
      label: RESOURCE_LABELS[resource],
      status: `${formatExactRealmResourceQuantity(resources.balances[resource]) ?? '0'} stored · ${formatExactRealmResourceQuantity(resources.pendingBalances[resource]) ?? '0'} ready to collect`
    };
  };

  const triggerEvents = (resource: RealmResourceTooltipKey) => ({
    onBlur: () => {
      setActiveTooltip((current) => current === resource ? null : current);
    },
    onClick: () => setActiveTooltip(resource),
    onFocus: () => setActiveTooltip(resource),
    onPointerEnter: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType !== 'touch') setActiveTooltip(resource);
    }
  });

  return (
    <section
      aria-label="Your resources"
      aria-live="polite"
      className="realm-resource-rail"
      data-policy={resources.resourcePolicyVersion}
      data-tooltip-open={activeTooltip ?? undefined}
      onPointerLeave={(event) => {
        if (
          event.pointerType !== 'touch'
          && !railRef.current?.contains(document.activeElement)
        ) {
          setActiveTooltip(null);
        }
      }}
      ref={railRef}
    >
      <ul>
        {REALM_ECONOMIC_RESOURCE_ORDER.map((resource) => {
          const compact = formatCompactRealmResourceQuantity(resources.balances[resource])!;
          const exact = formatExactRealmResourceQuantity(resources.balances[resource])!;
          const pending = formatExactRealmResourceQuantity(resources.pendingBalances[resource])!;
          return (
            <li key={resource}>
              <button
                aria-describedby={tooltipId(resource)}
                aria-label={`${RESOURCE_LABELS[resource]}: ${exact} stored; ${pending} ready to collect. Show resource details.`}
                className="realm-resource-rail__trigger"
                type="button"
                {...triggerEvents(resource)}
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
              </button>
            </li>
          );
        })}
        <li className="realm-resource-rail__marks">
          <button
            aria-describedby={tooltipId('marks')}
            aria-label={`Community Marks: ${exactMarks} Marks. Show Marks details.`}
            className="realm-resource-rail__trigger"
            type="button"
            {...triggerEvents('marks')}
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
            <strong>{compactMarks}</strong>
          </button>
        </li>
      </ul>
      {REALM_RESOURCE_TOOLTIP_ORDER.map((resource) => {
        const presentation = tooltipPresentation(resource);
        return (
          <div
            aria-atomic="true"
            aria-live="off"
            className="realm-resource-tooltip"
            data-resource={resource}
            hidden={activeTooltip !== resource}
            id={tooltipId(resource)}
            key={resource}
            role="tooltip"
          >
            <span className="realm-resource-tooltip__title">{presentation.label}</span>
            <span className="realm-resource-tooltip__status">{presentation.status}</span>
            <span className="realm-resource-tooltip__copy">
              {RESOURCE_TOOLTIP_COPY[resource]}
            </span>
          </div>
        );
      })}
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
  activeWagons: readonly RealmActiveWagonMenuItem[];
  onClose: () => void;
  onCollect: () => void;
  onExplore: () => void;
  onOpenActiveWagon?: (wagon: RealmActiveWagonMenuItem) => void;
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
  activeWagons,
  onClose,
  onCollect,
  onExplore,
  onOpenActiveWagon,
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
          {onOpenActiveWagon ? (
            <div
              aria-label="Expeditions"
              className="realm-profile-menu__active-wagons"
              role="group"
            >
              <p>EXPEDITIONS</p>
              {activeWagons.slice(0, 4).map((wagon) => (
                <button
                  key={`${wagon.resource}:${wagon.siteId}`}
                  onClick={() => onOpenActiveWagon(wagon)}
                  type="button"
                >
                  <strong>{RESOURCE_LABELS[wagon.resource]} WAGON</strong>
                  <span>
                    {wagon.phase === 'outbound'
                      ? 'En route to site'
                      : wagon.phase === 'gathering'
                        ? 'Gathering at site'
                        : 'Returning to keep'}
                  </span>
                </button>
              ))}
              {activeWagons.length === 0 ? (
                <span className="realm-profile-menu__expedition-empty">
                  No active wagons · select a resource site to dispatch
                </span>
              ) : null}
            </div>
          ) : null}
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
  activeWagons = [],
  onOpenActiveWagon,
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
          activeWagons={activeWagons}
          onClose={() => setSurface('closed')}
          onCollect={() => void collect()}
          onExplore={() => closeThen(() => onRequestExplore?.())}
          onOpenActiveWagon={onOpenActiveWagon
            ? (wagon) => closeThen(() => onOpenActiveWagon(wagon))
            : undefined}
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

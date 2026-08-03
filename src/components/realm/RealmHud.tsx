import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type Ref
} from 'react';

import { useMiniAppHost } from '../../farcaster/miniapp';
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
import type { WarpkeepWorkerPrivateSyncStatus } from '../../spacetime/warpkeepBackendTypes';
import type { RealmIdentity } from './realmTypes';
import {
  castleProfileLabel,
  formatPublicMarkMicros,
  type RealmCastlePublicPresentation
} from './realmCastlePresentation';
import { CastleProfileAvatar } from './RealmCastleLabels';
import type { RealmNavigatorResourceSite } from './RealmAccessibilityControls';
import { RealmRecordStatus } from './RealmRecordPrimitives';
import {
  REALM_ECONOMIC_RESOURCE_ORDER,
  formatCompactRealmMarkMicros,
  formatCompactRealmResourceQuantity,
  formatExactRealmResourceQuantity,
  type ReadyRealmResourcePresentation,
  type RealmEconomicResourceKey
} from './realmResourcePresentation';
import './RealmPlayerChrome.css';
import { RealmResourceBalancePanel } from './RealmResourceBalancePanel';
import { WorkerCommandCenter } from './WorkerCommandCenter';
import { WorkerInspectionPanel } from './WorkerInspectionPanel';
import type { RealmChromeMode } from './realmChromePresentation';
import type {
  RealmSurfaceNavigation
} from './useRealmSurfaceNavigation';
import type {
  RealmSurfaceResourceKey,
  RealmSurfaceRoute
} from './realmSurfaceNavigation';
import {
  realmWorkerCanRecall,
  type RealmWorkerPublicPresentation,
  type ReadyPublicWorkerProjection,
  type ReadyWorkerProjection,
  type ReadyWorkerResourceState,
  type WorkerRosterPresentation
} from './realmWorkerPresentation';

type RealmHudProps = Readonly<{
  identity: RealmIdentity;
  ownCastle?: Readonly<{ name: string; level: number }>;
  ownProfile?: RealmCastlePublicPresentation;
  resources?: ReadyRealmResourcePresentation;
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
  resourceSites?: readonly RealmNavigatorResourceSite[];
  onOpenResourceSite?: (site: RealmNavigatorResourceSite) => void;
  activeWagons?: readonly RealmActiveWagonMenuItem[];
  onOpenActiveWagon?: (wagon: RealmActiveWagonMenuItem) => void;
  /** Feature-compatibility gate. Hidden until an authoritative controller exists. */
  innerKeepAvailable?: boolean;
  /** Validated public system-mode signal, independent from graph completeness. */
  publicWorkerSystemActive?: boolean;
  publicWorkerProjection?: ReadyPublicWorkerProjection;
  workerProjection?: ReadyWorkerProjection;
  workerRoster?: WorkerRosterPresentation;
  workerResourceState?: ReadyWorkerResourceState;
  workerPrivateSync?: Pick<
    WarpkeepWorkerPrivateSyncStatus,
    'phase' | 'commandsEnabled'
  >;
  /** Enables operator-only spatial copy in the hidden selection announcer. */
  showDiagnostics?: boolean;
  onRetryWorkerPrivateSync?: () => void;
  onLocateWorker?: (workerId: string) => void;
  /** Map-level recall state retained while Realm inspectors open and close. */
  awaitingRecallWorkerIds?: readonly string[];
  recallAllAwaitingAuthority?: boolean;
  onRecallWorker?: (workerId: string) => Promise<void>;
  onRecallAllWorkers?: () => Promise<void>;
  onRecenterKeep: () => void;
  onRequestReturn: () => void;
  chromeMode?: RealmChromeMode;
  surfaceNavigation?: RealmSurfaceNavigation;
}>;

const RESOURCE_LABELS: Readonly<Record<RealmEconomicResourceKey, string>> = Object.freeze({
  food: 'Food',
  wood: 'Wood',
  stone: 'Stone',
  gold: 'Gold'
});

type RealmResourceTooltipKey = RealmEconomicResourceKey | 'marks';

type RealmNestedSurfaceInvoker = Readonly<{
  focusKey: string;
  scrollTop?: number;
}>;

const REALM_FOCUS_SCROLL_CONTAINER_SELECTOR = [
  '.realm-profile-menu__panel',
  '.worker-command-center',
  '.realm-fullscreen-surface__body'
].join(', ');

const REALM_SURFACE_FOCUS_FALLBACK_SELECTOR = [
  '.realm-profile-menu__panel h2[tabindex="-1"]',
  '.worker-command-center h2[tabindex="-1"]',
  '.realm-fullscreen-surface h1[tabindex="-1"]'
].join(', ');

function isRealmHudRootRoute(route: RealmSurfaceRoute | undefined) {
  return route?.kind === 'commands' || route?.kind === 'resource-balance';
}

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
    'Food comes from your keep’s private terrain yield and Wheat Farm gathering. The Realm stores completed yield automatically. No Food spending is live yet.',
  wood:
    'Wood comes from your keep’s private terrain yield and Logging Camp gathering. The Realm stores completed yield automatically. No Wood spending is live yet.',
  stone:
    'Stone comes from your keep’s private terrain yield and Stone Quarry gathering. The Realm stores completed yield automatically. No Stone spending is live yet.',
  gold:
    'Gold comes from Gold Mine gathering; your keep’s terrain produces no Gold. The Realm stores completed yield automatically. No Gold spending is live yet.',
  marks:
    'Every admitted keeper receives one experimental Community Mark per eligible Realm day. Marks require no wallet or token action and have no spending, transfer, conversion, redemption, or reward loop.'
});

const INNER_KEEP_RESOURCE_TOOLTIP_COPY: Readonly<
  Record<RealmEconomicResourceKey, string>
> = Object.freeze({
  food:
    'Food comes from your keep’s private terrain yield and Wheat Farm gathering. Stored Food funds Inner Keep construction; pending gathering is not spendable.',
  wood:
    'Wood comes from your keep’s private terrain yield and Logging Camp gathering. Stored Wood funds Inner Keep construction; pending gathering is not spendable.',
  stone:
    'Stone comes from your keep’s private terrain yield and Stone Quarry gathering. Stored Stone funds Inner Keep construction; pending gathering is not spendable.',
  gold:
    'Gold comes from Gold Mine gathering; your keep’s terrain produces no Gold. Stored Gold funds Inner Keep construction; pending gathering is not spendable.'
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

type RealmMenuSurface = 'closed' | 'menu' | 'settings' | 'workers' | 'worker-inspection';
type WorkerPrivateSyncPresentation = Pick<
  WarpkeepWorkerPrivateSyncStatus,
  'phase' | 'commandsEnabled'
>;

const REALM_MENU_ID = 'realm-player-menu';
const REALM_SETTINGS_ID = 'realm-player-settings';
const REALM_WORKERS_ID = 'realm-worker-command-center';
const REALM_WORKER_INSPECTION_ID = 'realm-worker-inspection';
const WORKER_RECONCILIATION_TIMEOUT_MILLISECONDS = 12_000;

function workerRecallLifecycleScope(
  fid: number,
  worker: RealmWorkerPublicPresentation
) {
  return [
    fid,
    worker.workerId,
    worker.status,
    worker.resourceKind ?? '',
    worker.siteId ?? '',
    worker.timelineRevision,
    worker.revision.toString()
  ].join(':');
}
function workerProjectionAuthoritySignature(
  projection: ReadyPublicWorkerProjection | undefined
) {
  if (!projection) return '';
  const workers = projection.workers.map((worker) => [
    worker.workerId,
    worker.originCastleId,
    worker.ordinal,
    worker.status,
    worker.resourceKind ?? '',
    worker.siteId ?? '',
    worker.startedAtMicros?.toString() ?? '',
    worker.arrivesAtMicros?.toString() ?? '',
    worker.gatheringEndsAtMicros?.toString() ?? '',
    worker.returnsAtMicros?.toString() ?? '',
    worker.timelineRevision,
    worker.revision.toString()
  ].join(':')).sort().join('|');
  const occupations = projection.occupations.map((occupation) => [
    occupation.nodeKey,
    occupation.workerId,
    occupation.originCastleId,
    occupation.workerOrdinal,
    occupation.phase,
    occupation.resourceKind,
    occupation.siteId,
    occupation.startedAtMicros.toString(),
    occupation.arrivesAtMicros.toString(),
    occupation.gatheringEndsAtMicros.toString(),
    occupation.timelineRevision
  ].join(':')).sort().join('|');
  return [
    projection.system.realmId,
    projection.system.policyVersion,
    projection.system.rosterDigest,
    workers,
    occupations
  ].join('::');
}

function workerPrivateSyncCopy(
  sync: WorkerPrivateSyncPresentation | undefined,
  privateAuthorityCurrent: boolean
) {
  if (
    sync?.phase === 'ready'
    && sync.commandsEnabled
    && privateAuthorityCurrent
  ) return undefined;
  if (sync?.phase === 'failed-localized') {
    return 'Worker accrual could not be refreshed. Public positions remain visible.';
  }
  if (sync?.phase === 'retry-wait') {
    return 'Worker accrual is waiting to retry. Public positions remain visible.';
  }
  if (sync?.phase === 'stale-read-only') {
    return 'Refreshing Worker accrual. Public positions remain available.';
  }
  return 'Synchronizing Worker accrual… Public positions remain available.';
}

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
  resources,
  genericWorkerMode = false,
  workerResourceState,
  fullscreenDestinations,
  innerKeepAvailable = false,
  onOpenResource
}: Readonly<{
  resources: ReadyRealmResourcePresentation;
  genericWorkerMode?: boolean;
  workerResourceState?: ReadyWorkerResourceState;
  fullscreenDestinations: boolean;
  innerKeepAvailable?: boolean;
  onOpenResource?: (
    resource: RealmSurfaceResourceKey,
    invoker: HTMLButtonElement
  ) => void;
}>) {
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
      status: workerResourceState
        ? `${formatExactRealmResourceQuantity(workerResourceState.available[resource]) ?? '0'} available`
        : genericWorkerMode
          ? `${formatExactRealmResourceQuantity(resources.balances[resource]) ?? '0'} stored · ${formatExactRealmResourceQuantity(resources.pendingBalances[resource]) ?? '0'} pending · Last confirmed balance · Worker accrual synchronizing`
          : `${formatExactRealmResourceQuantity(resources.balances[resource]) ?? '0'} stored · ${formatExactRealmResourceQuantity(resources.pendingBalances[resource]) ?? '0'} gathering now`
    };
  };

  const triggerEvents = (resource: RealmResourceTooltipKey) => ({
    onBlur: () => {
      if (fullscreenDestinations) return;
      setActiveTooltip((current) => current === resource ? null : current);
    },
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      if (fullscreenDestinations) {
        setActiveTooltip(null);
        onOpenResource?.(resource, event.currentTarget);
      } else {
        setActiveTooltip(resource);
      }
    },
    onFocus: () => {
      if (!fullscreenDestinations) setActiveTooltip(resource);
    },
    onPointerEnter: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!fullscreenDestinations && event.pointerType !== 'touch') {
        setActiveTooltip(resource);
      }
    }
  });

  return (
    <section
      aria-label="Your resources"
      className="realm-resource-rail"
      data-policy={resources.resourcePolicyVersion}
      data-presentation={fullscreenDestinations ? 'destination' : 'tooltip'}
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
          const railValue = workerResourceState?.available[resource]
            ?? resources.balances[resource];
          const compact = formatCompactRealmResourceQuantity(railValue)!;
          const exact = formatExactRealmResourceQuantity(railValue)!;
          const pending = formatExactRealmResourceQuantity(resources.pendingBalances[resource])!;
          return (
            <li key={resource}>
              <button
                aria-describedby={fullscreenDestinations ? undefined : tooltipId(resource)}
                aria-label={workerResourceState
                  ? `${RESOURCE_LABELS[resource]}: ${exact} available. Show resource details.`
                  : genericWorkerMode
                    ? `${RESOURCE_LABELS[resource]}: ${exact} last confirmed stored balance; Worker accrual synchronizing. Show resource details.`
                  : `${RESOURCE_LABELS[resource]}: ${exact} stored; ${pending} gathering now; settlement is automatic. Show resource details.`}
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
            aria-describedby={fullscreenDestinations ? undefined : tooltipId('marks')}
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
      {!fullscreenDestinations ? REALM_RESOURCE_TOOLTIP_ORDER.map((resource) => {
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
              {resource !== 'marks' && innerKeepAvailable
                ? INNER_KEEP_RESOURCE_TOOLTIP_COPY[resource]
                : RESOURCE_TOOLTIP_COPY[resource]}
            </span>
          </div>
        );
      }) : null}
    </section>
  );
}

type RealmCommandDialogProps = Readonly<{
  id: string;
  settingsId: string;
  workersId: string;
  castleCount: number;
  canOpenSettings: boolean;
  activeWagons: readonly RealmActiveWagonMenuItem[];
  workerModeActive: boolean;
  workerPresentationAvailable: boolean;
  deployedWorkerCount?: number;
  recallableWorkerCount?: number;
  workerControlsStatus?: string;
  recallingAllWorkers: boolean;
  recallAllWorkersConfirmed: boolean;
  workerRecallAwaitingAuthority: boolean;
  recallAllWorkersFailed: boolean;
  keeperLabel: string;
  keeperProfile: RealmCastlePublicPresentation;
  hostedDestination: boolean;
  onWorkers?: (invoker: HTMLButtonElement) => void;
  onRecallAllWorkers?: () => void;
  onRetryWorkerPrivateSync?: () => void;
  onClose: () => void;
  onExplore: (invoker: HTMLButtonElement) => void;
  onInnerKeep?: (invoker: HTMLButtonElement) => void;
  onMarks?: (invoker: HTMLButtonElement) => void;
  onOpenActiveWagon?: (wagon: RealmActiveWagonMenuItem) => void;
  onRecenter: () => void;
  onRequestReturn: () => void;
  onExitMiniApp?: () => void;
  onSettings: (invoker: HTMLButtonElement) => void;
}>;

function RealmCommandDialog({
  id,
  settingsId,
  workersId,
  castleCount,
  canOpenSettings,
  activeWagons,
  workerModeActive,
  workerPresentationAvailable,
  deployedWorkerCount,
  recallableWorkerCount,
  workerControlsStatus,
  recallingAllWorkers,
  recallAllWorkersConfirmed,
  workerRecallAwaitingAuthority,
  recallAllWorkersFailed,
  keeperLabel,
  keeperProfile,
  hostedDestination,
  onWorkers,
  onRecallAllWorkers,
  onRetryWorkerPrivateSync,
  onClose,
  onExplore,
  onInnerKeep,
  onMarks,
  onOpenActiveWagon,
  onRecenter,
  onRequestReturn,
  onExitMiniApp,
  onSettings
}: RealmCommandDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useModalFocusBoundary({
    active: !hostedDestination,
    dialogRef,
    initialFocusRef: headingRef,
    onEscape: onClose
  });
  useEffect(() => {
    if (hostedDestination) {
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [hostedDestination]);

  return (
    <div
      className="realm-profile-menu"
      role="presentation"
      onPointerDown={(event) => {
        if (!hostedDestination && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby={`${id}-title`}
        aria-modal={hostedDestination ? undefined : true}
        className="realm-profile-menu__panel"
        id={id}
        ref={dialogRef}
        role={hostedDestination ? 'region' : 'dialog'}
      >
        <header>
          <p>PLAYER COMMANDS</p>
          <h2 id={`${id}-title`} ref={headingRef} tabIndex={-1}>REALM MENU</h2>
          <button aria-label="Close Realm menu" onClick={onClose} type="button">×</button>
        </header>
        <section
          aria-label="Verified keeper identity"
          className="realm-profile-menu__identity"
        >
          <CastleProfileAvatar profile={keeperProfile} />
          <div>
            <span>VERIFIED KEEPER</span>
            <strong>{keeperLabel}</strong>
          </div>
        </section>
        <nav aria-label="Realm menu">
          <button data-command-intent="navigation" onClick={onRecenter} type="button">
            <strong>MY KEEP</strong>
            <span>Recenter the camera</span>
          </button>
          {onInnerKeep ? (
            <button
              data-command-intent="primary"
              data-realm-focus-key="commands:inner-keep"
              onClick={(event) => onInnerKeep(event.currentTarget)}
              type="button"
            >
              <strong>INNER KEEP</strong>
              <span>Develop your castle</span>
            </button>
          ) : null}
          <button
            data-command-intent="navigation"
            data-realm-focus-key="commands:explore"
            onClick={(event) => onExplore(event.currentTarget)}
            type="button"
          >
            <strong>EXPLORE</strong>
            <span>{castleCount} founded {castleCount === 1 ? 'castle' : 'castles'}</span>
          </button>
          {workerModeActive ? (
            <div
              aria-label="Worker controls"
              className="realm-profile-menu__worker-actions"
              role="group"
            >
              <button
                aria-controls={workersId}
                aria-haspopup={hostedDestination ? undefined : 'dialog'}
                data-command-intent="primary"
                data-realm-focus-key="commands:workers"
                disabled={!onWorkers || recallingAllWorkers}
                onClick={(event) => onWorkers?.(event.currentTarget)}
                type="button"
              >
                <strong>WORKERS</strong>
                <span>
                  {workerPresentationAvailable && deployedWorkerCount !== undefined
                    ? `${deployedWorkerCount}/4 deployed · ${
                      workerControlsStatus && !onRecallAllWorkers
                        ? 'public status · controls read-only'
                        : workerControlsStatus
                          ? 'recall ready · accrual syncing'
                          : 'manage workers'
                    }`
                    : 'Worker presentation unavailable'}
                </span>
              </button>
              <button
                aria-describedby={workerControlsStatus ? `${workersId}-sync-status` : undefined}
                data-command-intent="recall"
                disabled={
                  !onRecallAllWorkers
                  || recallingAllWorkers
                  || recallAllWorkersConfirmed
                  || workerRecallAwaitingAuthority
                  || recallableWorkerCount === undefined
                  || recallableWorkerCount === 0
                }
                onClick={onRecallAllWorkers}
                type="button"
              >
                <strong aria-atomic="true" aria-live="polite">
                  {recallingAllWorkers
                    ? 'RECALLING…'
                    : recallAllWorkersConfirmed
                      ? 'RECALL SENT'
                      : workerRecallAwaitingAuthority
                        ? 'RECALL IN PROGRESS'
                      : 'RECALL ALL TO KEEP'}
                </strong>
                <span>
                  {recallAllWorkersConfirmed || workerRecallAwaitingAuthority
                    ? 'Awaiting the next Realm update'
                    : !workerPresentationAvailable
                      ? 'Unavailable until public worker records recover'
                    : workerControlsStatus && !onRecallAllWorkers
                      ? 'Available after worker controls synchronize'
                    : recallableWorkerCount !== undefined && recallableWorkerCount > 0
                    ? `${recallableWorkerCount} ${recallableWorkerCount === 1 ? 'worker' : 'workers'} can return`
                    : recallableWorkerCount === 0
                      ? 'All workers are at or returning to the keep'
                      : 'Unavailable until public worker records recover'}
                </span>
              </button>
              {workerControlsStatus ? (
                <div className="realm-profile-menu__worker-sync">
                  <RealmRecordStatus
                    id={`${workersId}-sync-status`}
                    state="informational"
                  >
                    {workerControlsStatus}
                  </RealmRecordStatus>
                  {onRetryWorkerPrivateSync ? (
                    <button onClick={onRetryWorkerPrivateSync} type="button">
                      RETRY WORKER CONTROLS
                    </button>
                  ) : null}
                </div>
              ) : null}
              {recallAllWorkersFailed ? (
                <RealmRecordStatus
                  className="realm-profile-menu__worker-error"
                  state="error"
                >
                  The recall could not be confirmed. Try the same action again.
                </RealmRecordStatus>
              ) : null}
            </div>
          ) : null}
          {onMarks ? (
            <button
              data-command-intent="secondary"
              data-realm-focus-key="commands:marks"
              onClick={(event) => onMarks(event.currentTarget)}
              type="button"
            >
              <strong>COMMUNITY MARKS</strong>
              <span>Open the current non-financial community record</span>
            </button>
          ) : null}
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
                  data-command-intent="activity"
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
          {canOpenSettings ? (
            <button
              aria-controls={settingsId}
              aria-haspopup={hostedDestination ? undefined : 'dialog'}
              data-command-intent="secondary"
              data-realm-focus-key="commands:settings"
              onClick={(event) => onSettings(event.currentTarget)}
              type="button"
            >
              <strong>SETTINGS</strong>
              <span>Graphics and audio</span>
            </button>
          ) : null}
          <button
            data-command-intent="exit"
            onClick={onRequestReturn}
            type="button"
          >
            <strong>MAIN MENU</strong>
            <span>Leave the Realm view</span>
          </button>
          {onExitMiniApp ? (
            <button
              data-command-intent="exit-miniapp"
              onClick={onExitMiniApp}
              type="button"
            >
              <strong>EXIT MINI APP</strong>
              <span>Close Warpkeep in Farcaster</span>
            </button>
          ) : null}
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
  resourceSites = [],
  onOpenResourceSite,
  activeWagons = [],
  onOpenActiveWagon,
  innerKeepAvailable = false,
  publicWorkerSystemActive = false,
  publicWorkerProjection,
  workerProjection,
  workerRoster,
  workerResourceState,
  workerPrivateSync,
  showDiagnostics = false,
  onRetryWorkerPrivateSync,
  onLocateWorker,
  awaitingRecallWorkerIds = [],
  recallAllAwaitingAuthority = false,
  onRecallWorker,
  onRecallAllWorkers,
  onRecenterKeep,
  onRequestReturn,
  chromeMode = 'desktop-web',
  surfaceNavigation
}: RealmHudProps) {
  const miniAppHost = useMiniAppHost();
  const [localSurface, setLocalSurface] = useState<RealmMenuSurface>('closed');
  const [localSelectedWorkerId, setLocalSelectedWorkerId] =
    useState<string | undefined>(undefined);
  const [recallingAllWorkers, setRecallingAllWorkers] = useState(false);
  const [confirmedRecallAllSignature, setConfirmedRecallAllSignature] = useState<
    string | undefined
  >(undefined);
  const [pendingRecallWorkerIds, setPendingRecallWorkerIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [recallAllWorkersFailed, setRecallAllWorkersFailed] = useState(false);
  const recallAllWorkersInFlightRef = useRef(false);
  const recallAllAttemptRef = useRef(0);
  const pendingRecallWorkerIdsRef = useRef(new Set<string>());
  const confirmedRecallAllWorkerIdsRef = useRef<readonly string[] | undefined>(
    undefined
  );
  const recallAllReconciliationTimerRef = useRef<number | undefined>(undefined);
  const recallWorkerReconciliationTimersRef = useRef(new Map<string, number>());
  const chromeRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootSurfaceInvokerRef = useRef<HTMLElement | null>(null);
  const nestedSurfaceInvokersRef = useRef(
    new Map<number, RealmNestedSurfaceInvoker>()
  );
  const surfaceRoute = surfaceNavigation?.current;
  const surface: RealmMenuSurface = surfaceNavigation
    ? surfaceRoute?.kind === 'commands'
      ? 'menu'
      : surfaceRoute?.kind === 'settings'
        ? 'settings'
          : surfaceRoute?.kind === 'workers'
          ? 'workers'
          : surfaceRoute?.kind === 'worker'
            && surfaceNavigation.stack.length > 1
            ? 'worker-inspection'
            : 'closed'
    : localSurface;
  const selectedWorkerId = surfaceNavigation && surfaceRoute?.kind === 'worker'
    ? surfaceRoute.workerId
    : localSelectedWorkerId;
  const anySurfaceOpen = surfaceNavigation
    ? surfaceNavigation.depth > 0
    : surface !== 'closed';
  const surfaceDepth = surfaceNavigation?.depth ?? (
    surface === 'closed'
      ? 0
      : surface === 'menu'
        ? 1
        : surface === 'worker-inspection'
          ? 3
          : 2
  );
  const previousSurfaceDepthRef = useRef(surfaceDepth);
  const fullscreenDestinations = chromeMode !== 'desktop-web';
  const menuId = REALM_MENU_ID;
  const controlledSurfaceId = surface === 'menu'
    ? menuId
    : surface === 'settings'
      ? REALM_SETTINGS_ID
      : surface === 'workers'
        ? REALM_WORKERS_ID
        : surface === 'worker-inspection'
          ? REALM_WORKER_INSPECTION_ID
          : undefined;
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
    ? `${selectedCastleLabel}, ${selectedCastle.name}. Selected castle${showDiagnostics
      ? ` at cell ${selectedCastle.q}, ${selectedCastle.r}`
      : ''}.`
    : selectedIsKeep
      ? `${selectedTitle}. Your keep is selected${showDiagnostics
        ? ` at cell ${selectedCell.coord.q}, ${selectedCell.coord.r}`
        : ''}.`
      : `${selectedTerrainLabel}. Terrain selected${showDiagnostics
        ? ` at cell ${selectedCell.coord.q}, ${selectedCell.coord.r}`
        : ''}.`;
  const selectionAnnouncementKey = selectedCastle
    ? `${showDiagnostics ? 'diagnostic' : 'player'}:castle:${selectedCastle.q}:${selectedCastle.r}`
    : `${showDiagnostics ? 'diagnostic' : 'player'}:cell:${selectedCell.coord.q}:${selectedCell.coord.r}`;
  const selectionAnnouncementRef = useRef({
    key: selectionAnnouncementKey,
    copy: selectionAnnouncementCandidate
  });
  const ownedWorkersForUi = publicWorkerProjection?.workers
    .filter((worker) => worker.ownedByViewer)
    .slice()
    .sort((left, right) => left.ordinal - right.ordinal) ?? [];
  const privateWorkerIds = new Set(workerRoster?.workers.map((worker) => worker.workerId) ?? []);
  const authenticatedWorkerFid = Number.isSafeInteger(identity.fid) && identity.fid > 0
    ? BigInt(identity.fid)
    : undefined;
  const publicWorkersActive = Boolean(publicWorkerProjection?.mode === 'active'
    && ownedWorkersForUi.length === 4
    && new Set(ownedWorkersForUi.map((worker) => worker.workerId)).size === 4
    && new Set(ownedWorkersForUi.map((worker) => worker.ordinal)).size === 4);
  const genericWorkerModeActive = publicWorkerSystemActive || publicWorkersActive;
  const privateAuthorityCurrent = Boolean(publicWorkersActive
    && authenticatedWorkerFid !== undefined
    && workerResourceState?.fid === authenticatedWorkerFid
    && workerProjection?.mode === 'active'
    && workerProjection.ownedWorkers.length === 4
    && workerRoster?.workers.length === 4
    && ownedWorkersForUi.every((worker) => privateWorkerIds.has(worker.workerId))
    && workerResourceState?.workerSystemMode === 'active'
    && workerProjectionAuthoritySignature(workerProjection)
      === workerProjectionAuthoritySignature(publicWorkerProjection));
  const recallControlsReady = publicWorkersActive
    && (onRecallWorker !== undefined || onRecallAllWorkers !== undefined);
  const recallAllControlsReady = publicWorkersActive
    && onRecallAllWorkers !== undefined;
  const workerControlsStatus = genericWorkerModeActive
    ? publicWorkersActive
      ? workerPrivateSyncCopy(workerPrivateSync, privateAuthorityCurrent)
      : 'Worker presentation is temporarily unavailable. Public worker records are recovering while the Realm remains open.'
    : undefined;
  const deployedWorkerCount = publicWorkersActive
    ? ownedWorkersForUi.filter((worker) => worker.status !== 'idle').length
    : 0;
  const recallableWorkerCount = publicWorkersActive
    ? ownedWorkersForUi.filter(realmWorkerCanRecall).length
    : 0;
  const recallableWorkerScopes = new Map(
    publicWorkersActive
      ? ownedWorkersForUi
        .filter(realmWorkerCanRecall)
        .map((worker) => [
          worker.workerId,
          workerRecallLifecycleScope(identity.fid, worker)
        ] as const)
      : []
  );
  const recallableWorkerSignature = [...recallableWorkerScopes.values()]
    .sort()
    .join('|');
  const recallableWorkerScopesRef = useRef(recallableWorkerScopes);
  recallableWorkerScopesRef.current = recallableWorkerScopes;
  const ownedWorkersForUiRef = useRef(ownedWorkersForUi);
  ownedWorkersForUiRef.current = ownedWorkersForUi;
  const identityFidRef = useRef(identity.fid);
  identityFidRef.current = identity.fid;
  const workerReconciliationSignature = ownedWorkersForUi
    .map((worker) => `${worker.workerId}:${worker.status}`)
    .sort()
    .join('|');
  const recallAllWorkersScope = `${identity.fid}:${recallableWorkerSignature}`;
  const recallAllWorkersConfirmed = confirmedRecallAllSignature !== undefined;
  const confirmedRecallWorkerIds = new Set([
    ...pendingRecallWorkerIds,
    ...awaitingRecallWorkerIds
  ]);
  const anyWorkerRecallAwaitingAuthority = confirmedRecallWorkerIds.size > 0;
  const selectedWorker = publicWorkersActive && selectedWorkerId
    ? ownedWorkersForUi.find((worker) => worker.workerId === selectedWorkerId)
    : undefined;
  const rememberNestedSurfaceInvoker = (
    invoker: HTMLElement,
    focusKey: string
  ) => {
    if (surfaceDepth <= 0 || !invoker.isConnected) return;
    const scrollContainer = invoker.closest<HTMLElement>(
      REALM_FOCUS_SCROLL_CONTAINER_SELECTOR
    );
    nestedSurfaceInvokersRef.current.set(surfaceDepth + 1, Object.freeze({
      focusKey,
      ...(scrollContainer ? { scrollTop: scrollContainer.scrollTop } : {})
    }));
  };
  const openSurface = (
    route: RealmSurfaceRoute,
    rootInvoker?: HTMLElement | null,
    nestedFocusKey?: string
  ) => {
    if (!anySurfaceOpen && rootInvoker?.isConnected) {
      // A direct player activation starts a fresh branch. Browser Forward
      // restores routes without calling this function, so retained metadata
      // remains available only for genuine history replay.
      nestedSurfaceInvokersRef.current.clear();
      rootSurfaceInvokerRef.current = rootInvoker;
    } else if (rootInvoker && nestedFocusKey) {
      rememberNestedSurfaceInvoker(rootInvoker, nestedFocusKey);
    }
    if (surfaceNavigation) {
      surfaceNavigation.push(route);
      return;
    }
    if (route.kind === 'commands') setLocalSurface('menu');
    else if (route.kind === 'settings') setLocalSurface('settings');
    else if (route.kind === 'workers') setLocalSurface('workers');
    else if (route.kind === 'worker') {
      setLocalSelectedWorkerId(route.workerId);
      setLocalSurface('worker-inspection');
    }
  };
  const backSurface = () => {
    if (surfaceNavigation) {
      surfaceNavigation.back();
      return;
    }
    if (localSurface === 'settings' || localSurface === 'workers') {
      setLocalSurface('menu');
    } else if (localSurface === 'worker-inspection') {
      setLocalSurface('workers');
    } else {
      setLocalSurface('closed');
    }
  };
  const closeSurfaces = () => {
    if (surfaceNavigation) surfaceNavigation.closeToRealm();
    else setLocalSurface('closed');
  };

  if (
    selectionAnnouncementRef.current.key !== selectionAnnouncementKey
    || selectionAnnouncementRef.current.copy !== selectionAnnouncementCandidate
  ) {
    // Public profile data can resolve after the castle was selected. Refresh
    // the live-region copy at the same coordinate without state or an effect,
    // so unrelated renders remain silent and cannot create an update loop.
    selectionAnnouncementRef.current = {
      key: selectionAnnouncementKey,
      copy: selectionAnnouncementCandidate
    };
  }

  useEffect(() => {
    const previousDepth = previousSurfaceDepthRef.current;
    if (
      surfaceNavigation !== undefined
      &&
      previousDepth === 0
      && surfaceDepth > 0
      && !isRealmHudRootRoute(surfaceNavigation?.stack[0])
    ) {
      // A map-owned world record starts an unrelated history branch. Do not
      // let a retained HUD launcher from an earlier Back/Forward branch steal
      // focus when this record later closes.
      rootSurfaceInvokerRef.current = null;
      nestedSurfaceInvokersRef.current.clear();
    } else if (surfaceDepth === 0 && previousDepth > 0) {
      const invoker = rootSurfaceInvokerRef.current;
      if (invoker?.isConnected) {
        invoker.focus({ preventScroll: true });
      } else if (invoker) {
        triggerRef.current?.focus({ preventScroll: true });
      }
    } else if (surfaceDepth > 0 && surfaceDepth < previousDepth) {
      const invoker = nestedSurfaceInvokersRef.current.get(surfaceDepth + 1);
      if (invoker) {
        const focusTarget = [
          ...(chromeRef.current?.querySelectorAll<HTMLElement>(
            '[data-realm-focus-key]'
          ) ?? [])
        ].find((element) => element.dataset.realmFocusKey === invoker.focusKey);
        const scrollContainer = focusTarget?.closest<HTMLElement>(
          REALM_FOCUS_SCROLL_CONTAINER_SELECTOR
        );
        if (scrollContainer && invoker.scrollTop !== undefined) {
          scrollContainer.scrollTop = invoker.scrollTop;
        }
        (
          focusTarget
          ?? chromeRef.current?.querySelector<HTMLElement>(
            REALM_SURFACE_FOCUS_FALLBACK_SELECTOR
          )
        )?.focus({ preventScroll: true });
      }
    }
    previousSurfaceDepthRef.current = surfaceDepth;
  }, [surfaceDepth, surfaceNavigation?.stack]);

  useEffect(() => {
    rootSurfaceInvokerRef.current = null;
    nestedSurfaceInvokersRef.current.clear();
  }, [identity.fid]);

  useEffect(() => {
    if (publicWorkersActive) {
      if (surface === 'worker-inspection' && selectedWorker === undefined) {
        if (surfaceNavigation) surfaceNavigation.back();
        else setLocalSurface('workers');
      }
      return;
    }
    if (surface === 'workers' || surface === 'worker-inspection') {
      setLocalSelectedWorkerId(undefined);
      if (surfaceNavigation) surfaceNavigation.closeToRealm();
      else setLocalSurface('menu');
    }
  }, [publicWorkersActive, selectedWorker, surface, surfaceNavigation]);

  useEffect(() => {
    // A command is reconciled only by the submitted Worker's authoritative
    // return/idle state. Unrelated revisions and outbound→gathering schedule
    // progress must never expose a second submission.
    if (!publicWorkersActive) return;
    const workersById = new Map(
      ownedWorkersForUiRef.current.map((worker) => [worker.workerId, worker] as const)
    );
    let individualReconciled = false;
    for (const workerId of pendingRecallWorkerIdsRef.current) {
      const status = workersById.get(workerId)?.status;
      if (status !== 'returning' && status !== 'idle') continue;
      pendingRecallWorkerIdsRef.current.delete(workerId);
      const timer = recallWorkerReconciliationTimersRef.current.get(workerId);
      if (timer !== undefined) window.clearTimeout(timer);
      recallWorkerReconciliationTimersRef.current.delete(workerId);
      individualReconciled = true;
    }
    if (individualReconciled) {
      setPendingRecallWorkerIds(new Set(pendingRecallWorkerIdsRef.current));
    }

    const recallAllTargets = confirmedRecallAllWorkerIdsRef.current;
    if (
      recallAllTargets !== undefined
      && recallAllTargets.every((workerId) => {
        const status = workersById.get(workerId)?.status;
        return status === 'returning' || status === 'idle';
      })
    ) {
      confirmedRecallAllWorkerIdsRef.current = undefined;
      if (recallAllReconciliationTimerRef.current !== undefined) {
        window.clearTimeout(recallAllReconciliationTimerRef.current);
        recallAllReconciliationTimerRef.current = undefined;
      }
      setConfirmedRecallAllSignature(undefined);
      setRecallAllWorkersFailed(false);
    }
  }, [publicWorkersActive, workerReconciliationSignature]);

  useEffect(() => {
    // Never retain a command or timer across an authenticated caller change.
    recallAllAttemptRef.current += 1;
    recallAllWorkersInFlightRef.current = false;
    pendingRecallWorkerIdsRef.current.clear();
    confirmedRecallAllWorkerIdsRef.current = undefined;
    if (recallAllReconciliationTimerRef.current !== undefined) {
      window.clearTimeout(recallAllReconciliationTimerRef.current);
      recallAllReconciliationTimerRef.current = undefined;
    }
    for (const timer of recallWorkerReconciliationTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    recallWorkerReconciliationTimersRef.current.clear();
    setPendingRecallWorkerIds(new Set());
    setRecallingAllWorkers(false);
    setConfirmedRecallAllSignature(undefined);
    setRecallAllWorkersFailed(false);
  }, [identity.fid]);

  useEffect(() => {
    // A rejected attempt belongs only to the assignment set that rejected it.
    setRecallAllWorkersFailed(false);
  }, [recallAllWorkersScope]);

  useEffect(() => () => {
    recallAllAttemptRef.current += 1;
    recallAllWorkersInFlightRef.current = false;
    pendingRecallWorkerIdsRef.current.clear();
    confirmedRecallAllWorkerIdsRef.current = undefined;
    if (recallAllReconciliationTimerRef.current !== undefined) {
      window.clearTimeout(recallAllReconciliationTimerRef.current);
      recallAllReconciliationTimerRef.current = undefined;
    }
    for (const timer of recallWorkerReconciliationTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    recallWorkerReconciliationTimersRef.current.clear();
  }, []);

  const closeThen = (action: () => void) => {
    closeSurfaces();
    action();
  };

  const recallWorker = async (workerId: string) => {
    const submittedScope = recallableWorkerScopesRef.current.get(workerId);
    const submittedFid = identityFidRef.current;
    if (
      !publicWorkersActive
      || !onRecallWorker
      || submittedScope === undefined
      || pendingRecallWorkerIdsRef.current.has(workerId)
      || recallAllWorkersInFlightRef.current
      || confirmedRecallAllWorkerIdsRef.current !== undefined
      || recallAllAwaitingAuthority
      || confirmedRecallWorkerIds.has(workerId)
    ) {
      throw new Error('Worker command is unavailable.');
    }
    pendingRecallWorkerIdsRef.current.add(workerId);
    setPendingRecallWorkerIds(new Set(pendingRecallWorkerIdsRef.current));
    try {
      await onRecallWorker(workerId);
      if (
        identityFidRef.current === submittedFid
        && pendingRecallWorkerIdsRef.current.has(workerId)
      ) {
        const currentStatus = ownedWorkersForUiRef.current.find(
          (worker) => worker.workerId === workerId
        )?.status;
        if (currentStatus === 'returning' || currentStatus === 'idle') {
          pendingRecallWorkerIdsRef.current.delete(workerId);
          setPendingRecallWorkerIds(new Set(pendingRecallWorkerIdsRef.current));
          return;
        }
        const retainedTimer =
          recallWorkerReconciliationTimersRef.current.get(workerId);
        if (retainedTimer !== undefined) window.clearTimeout(retainedTimer);
        const timer = window.setTimeout(() => {
          recallWorkerReconciliationTimersRef.current.delete(workerId);
          pendingRecallWorkerIdsRef.current.delete(workerId);
          setPendingRecallWorkerIds(new Set(pendingRecallWorkerIdsRef.current));
        }, WORKER_RECONCILIATION_TIMEOUT_MILLISECONDS);
        recallWorkerReconciliationTimersRef.current.set(workerId, timer);
      }
    } catch {
      if (
        identityFidRef.current === submittedFid
        && pendingRecallWorkerIdsRef.current.has(workerId)
      ) {
        pendingRecallWorkerIdsRef.current.delete(workerId);
        setPendingRecallWorkerIds(new Set(pendingRecallWorkerIdsRef.current));
      }
      throw new Error('Worker command is unavailable.');
    }
  };

  const recallAll = async () => {
    if (
      !publicWorkersActive
      || !recallAllControlsReady
      || !onRecallAllWorkers
      || recallableWorkerCount === 0
      || recallAllWorkersConfirmed
      || recallAllWorkersInFlightRef.current
      || pendingRecallWorkerIdsRef.current.size > 0
      || anyWorkerRecallAwaitingAuthority
      || recallAllAwaitingAuthority
    ) return;
    const submittedScope = recallAllWorkersScope;
    const submittedFid = identityFidRef.current;
    const submittedWorkerIds = Object.freeze(
      [...recallableWorkerScopesRef.current.keys()].sort()
    );
    const commandAttempt = recallAllAttemptRef.current + 1;
    recallAllAttemptRef.current = commandAttempt;
    recallAllWorkersInFlightRef.current = true;
    confirmedRecallAllWorkerIdsRef.current = submittedWorkerIds;
    setRecallingAllWorkers(true);
    setConfirmedRecallAllSignature(undefined);
    setRecallAllWorkersFailed(false);
    try {
      await onRecallAllWorkers();
      if (
        identityFidRef.current === submittedFid
        && recallAllAttemptRef.current === commandAttempt
        && confirmedRecallAllWorkerIdsRef.current === submittedWorkerIds
      ) {
        const workersById = new Map(
          ownedWorkersForUiRef.current.map((worker) => [worker.workerId, worker] as const)
        );
        const alreadyReconciled = submittedWorkerIds.every((workerId) => {
          const status = workersById.get(workerId)?.status;
          return status === 'returning' || status === 'idle';
        });
        if (alreadyReconciled) {
          confirmedRecallAllWorkerIdsRef.current = undefined;
          setConfirmedRecallAllSignature(undefined);
          return;
        }
        setConfirmedRecallAllSignature(submittedScope);
        if (recallAllReconciliationTimerRef.current !== undefined) {
          window.clearTimeout(recallAllReconciliationTimerRef.current);
        }
        recallAllReconciliationTimerRef.current = window.setTimeout(() => {
          recallAllReconciliationTimerRef.current = undefined;
          if (
            recallAllAttemptRef.current !== commandAttempt
            || confirmedRecallAllWorkerIdsRef.current !== submittedWorkerIds
          ) return;
          confirmedRecallAllWorkerIdsRef.current = undefined;
          setConfirmedRecallAllSignature(undefined);
          setRecallAllWorkersFailed(true);
        }, WORKER_RECONCILIATION_TIMEOUT_MILLISECONDS);
      }
    } catch {
      // The authoritative worker projection remains unchanged until the
      // provider confirms a reducer result. Keep command details private.
      if (
        identityFidRef.current === submittedFid
        && recallAllAttemptRef.current === commandAttempt
        && confirmedRecallAllWorkerIdsRef.current === submittedWorkerIds
      ) {
        confirmedRecallAllWorkerIdsRef.current = undefined;
        setConfirmedRecallAllSignature(undefined);
        setRecallAllWorkersFailed(true);
      }
      throw new Error('Worker command is unavailable.');
    } finally {
      if (recallAllAttemptRef.current === commandAttempt) {
        recallAllWorkersInFlightRef.current = false;
        setRecallingAllWorkers(false);
      }
    }
  };

  return (
    <div
      className="realm-player-chrome"
      data-realm-chrome-mode={chromeMode}
      data-realm-surface-depth={surfaceDepth}
      ref={chromeRef}
    >
      <div
        aria-hidden={anySurfaceOpen || undefined}
        className="realm-player-chrome__map-controls"
        inert={anySurfaceOpen || undefined}
      >
        <button
          aria-controls={controlledSurfaceId}
          aria-expanded={surface !== 'closed'}
          aria-haspopup={fullscreenDestinations ? undefined : 'dialog'}
          aria-label={`Open Realm menu for ${playerLabel}`}
          className="realm-profile-trigger"
          onClick={() => {
            if (surface === 'closed') {
              openSurface({ kind: 'commands' }, triggerRef.current);
            }
            else closeSurfaces();
          }}
          ref={(element) => {
            triggerRef.current = element;
            assignRef(profileTriggerRef, element);
          }}
          type="button"
        >
          <CastleProfileAvatar profile={playerProfile} />
        </button>

        {resources ? (
          <RealmResourceRail
            fullscreenDestinations={fullscreenDestinations}
            genericWorkerMode={genericWorkerModeActive}
            innerKeepAvailable={innerKeepAvailable}
            onOpenResource={(resource, invoker) => openSurface(
              { kind: 'resource-balance', resource },
              invoker
            )}
            resources={resources}
            workerResourceState={
              privateAuthorityCurrent
              && workerPrivateSync?.phase === 'ready'
              && authenticatedWorkerFid !== undefined
              && workerResourceState?.fid === authenticatedWorkerFid
                ? workerResourceState
                : undefined
            }
          />
        ) : null}

        <p
          aria-atomic="true"
          aria-live="polite"
          className="realm-player-chrome__selection-announcement"
        >
          {selectionAnnouncementRef.current.copy}
        </p>
      </div>

      {surface === 'menu' ? (
        <RealmCommandDialog
          id={menuId}
          settingsId={REALM_SETTINGS_ID}
          workersId={REALM_WORKERS_ID}
          castleCount={foundedCastleCount}
          canOpenSettings={onGraphicsPreferenceChange !== undefined}
          activeWagons={genericWorkerModeActive ? [] : activeWagons}
          workerModeActive={genericWorkerModeActive}
          workerPresentationAvailable={publicWorkersActive}
          deployedWorkerCount={publicWorkersActive ? deployedWorkerCount : undefined}
          recallableWorkerCount={publicWorkersActive ? recallableWorkerCount : undefined}
          workerControlsStatus={workerControlsStatus}
          recallingAllWorkers={recallingAllWorkers}
          recallAllWorkersConfirmed={
            recallAllWorkersConfirmed || recallAllAwaitingAuthority
          }
          workerRecallAwaitingAuthority={anyWorkerRecallAwaitingAuthority}
          recallAllWorkersFailed={recallAllWorkersFailed}
          keeperLabel={playerLabel}
          keeperProfile={playerProfile}
          hostedDestination={fullscreenDestinations}
          onClose={closeSurfaces}
          onExplore={(invoker) => {
            if (surfaceNavigation) {
              if (fullscreenDestinations) {
                rememberNestedSurfaceInvoker(invoker, 'commands:explore');
              } else {
                // Desktop Explore replaces the command entry so opening the
                // navigator never races an asynchronous history traversal.
                // Closing Explore then owns one exact Back step to the Realm.
                surfaceNavigation.replace({ kind: 'explore' });
              }
              onRequestExplore?.();
            } else {
              closeThen(() => onRequestExplore?.());
            }
          }}
          onMarks={resources
            ? (invoker) => openSurface(
                { kind: 'resource-balance', resource: 'marks' },
                invoker,
                'commands:marks'
              )
            : undefined}
          onInnerKeep={innerKeepAvailable && surfaceNavigation
            ? (invoker) => openSurface(
                { kind: 'inner-keep' },
                invoker,
                'commands:inner-keep'
              )
            : undefined}
          onOpenActiveWagon={!genericWorkerModeActive && onOpenActiveWagon
            ? (wagon) => closeThen(() => onOpenActiveWagon(wagon))
            : undefined}
          onRecenter={() => closeThen(onRecenterKeep)}
          onRequestReturn={surfaceNavigation
            ? onRequestReturn
            : () => closeThen(onRequestReturn)}
          onExitMiniApp={
            miniAppHost.isMiniApp
            && miniAppHost.hasCapability('actions.close')
              ? () => {
                  void miniAppHost.actions.close();
                }
              : undefined
          }
          onSettings={(invoker) => openSurface(
            { kind: 'settings' },
            invoker,
            'commands:settings'
          )}
          onWorkers={publicWorkersActive
            ? (invoker) => openSurface(
                { kind: 'workers' },
                invoker,
                'commands:workers'
              )
            : undefined}
          onRecallAllWorkers={recallAllControlsReady
            ? () => {
                void recallAll().catch(() => undefined);
              }
            : undefined}
          onRetryWorkerPrivateSync={
            workerPrivateSync?.phase === 'failed-localized'
              ? onRetryWorkerPrivateSync
              : undefined
          }
        />
      ) : null}

      {publicWorkersActive && surface === 'workers' ? (
        <WorkerCommandCenter
          controlsAvailable={recallControlsReady}
          controlsStatus={workerControlsStatus}
          awaitingWorkerIds={[...confirmedRecallWorkerIds]}
          id={REALM_WORKERS_ID}
          onClose={backSurface}
          onCloseToRealm={surfaceNavigation?.closeToRealm}
          onRecallAllWorkers={
            recallAllControlsReady
              && !recallingAllWorkers
              && !recallAllWorkersConfirmed
              ? recallAll
              : undefined
          }
          onRecallWorker={publicWorkersActive && onRecallWorker
            ? recallWorker
            : undefined}
          onSelectWorker={(worker, invoker) => {
            openSurface(
              { kind: 'worker', workerId: worker.workerId },
              invoker,
              `workers:${worker.workerId}`
            );
          }}
          recallAllAwaitingAuthority={
            recallingAllWorkers
            || recallAllWorkersConfirmed
            || recallAllAwaitingAuthority
          }
          roster={privateAuthorityCurrent ? workerRoster : undefined}
          key={`${identity.fid}:worker-command-center`}
          workers={ownedWorkersForUi}
          hostedDestination={fullscreenDestinations}
        />
      ) : null}
      {publicWorkersActive
      && selectedWorker
      && surface === 'worker-inspection'
      && !fullscreenDestinations ? (
        <WorkerInspectionPanel
          awaitingAuthoritativeRecall={
            confirmedRecallWorkerIds.has(selectedWorker.workerId)
            || recallingAllWorkers
            || recallAllWorkersConfirmed
            || recallAllAwaitingAuthority
          }
          controlsStatus={workerControlsStatus}
          id={REALM_WORKER_INSPECTION_ID}
          key={`${identity.fid}:${selectedWorker.workerId}`}
          keeperProfile={ownProfile}
          onLocateWorker={onLocateWorker
            ? (workerId) => closeThen(() => onLocateWorker(workerId))
            : undefined}
          onRecallWorker={publicWorkersActive && onRecallWorker
            ? recallWorker
            : undefined}
          onCloseToRealm={surfaceNavigation?.closeToRealm}
          onRequestClose={backSurface}
          worker={selectedWorker}
          hostedDestination={fullscreenDestinations}
        />
      ) : null}

      {surface === 'settings' && onGraphicsPreferenceChange ? (
        <SettingsPanel
          id={REALM_SETTINGS_ID}
          audioMuted={audioMuted}
          closeLabel="BACK TO REALM MENU"
          onAudioMutedChange={onAudioMutedChange}
          onChange={onGraphicsPreferenceChange}
          onClose={backSurface}
          onCloseToRealm={surfaceNavigation?.closeToRealm}
          preference={graphicsPreference}
          resolvedQuality={resolvedGraphicsQuality}
          hostedDestination={fullscreenDestinations}
        />
      ) : null}

      {resources && surfaceNavigation && surfaceRoute?.kind === 'resource-balance' ? (
        <RealmResourceBalancePanel
          onBack={surfaceNavigation.back}
          onCloseToRealm={surfaceNavigation.closeToRealm}
          onExplore={onRequestExplore
            ? (invoker) => {
                rememberNestedSurfaceInvoker(invoker, 'resource:explore');
                onRequestExplore();
              }
            : undefined}
          onOpenWorkers={publicWorkersActive
            ? (invoker) => {
                rememberNestedSurfaceInvoker(invoker, 'resource:workers');
                surfaceNavigation.push({ kind: 'workers' });
              }
            : undefined}
          resourceSites={resourceSites}
          onOpenResourceSite={onOpenResourceSite
            ? (site, invoker) => {
                rememberNestedSurfaceInvoker(
                  invoker,
                  `resource-site:${site.key}`
                );
                onOpenResourceSite(site);
              }
            : undefined}
          onRetry={workerPrivateSync?.phase === 'failed-localized'
            ? onRetryWorkerPrivateSync
            : undefined}
          resource={surfaceRoute.resource}
          resources={resources}
          workerPrivateSync={workerPrivateSync}
          workerResourceState={
            privateAuthorityCurrent
              ? workerResourceState
              : undefined
          }
          workers={ownedWorkersForUi}
        />
      ) : null}
    </div>
  );
}

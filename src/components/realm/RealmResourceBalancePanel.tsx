import type { WarpkeepWorkerPrivateSyncStatus } from '../../spacetime/warpkeepBackendTypes';
import type { RealmNavigatorResourceSite } from './RealmAccessibilityControls';
import { RealmFullScreenSurface } from './RealmFullScreenSurface';
import { formatPublicMarkMicros } from './realmCastlePresentation';
import {
  formatExactRealmResourceQuantity,
  type ReadyRealmResourcePresentation
} from './realmResourcePresentation';
import type {
  ReadyWorkerResourceState,
  RealmWorkerPublicPresentation
} from './realmWorkerPresentation';
import type { RealmSurfaceResourceKey } from './realmSurfaceNavigation';
import './RealmResourceBalancePanel.css';

const RESOURCE_TITLES: Readonly<Record<RealmSurfaceResourceKey, string>> = Object.freeze({
  food: 'Food',
  wood: 'Wood',
  stone: 'Stone',
  gold: 'Gold',
  marks: 'Community Marks'
});

const RESOURCE_PURPOSE: Readonly<Record<RealmSurfaceResourceKey, string>> = Object.freeze({
  food:
    'Food is stored from keep terrain and Wheat Farm gathering. It has no spending loop in the current Alpha.',
  wood:
    'Wood is stored from keep terrain and Logging Camp gathering. It has no spending loop in the current Alpha.',
  stone:
    'Stone is stored from keep terrain and Stone Quarry gathering. It has no spending loop in the current Alpha.',
  gold:
    'Gold is stored from Gold Mine gathering. It has no spending loop in the current Alpha.',
  marks:
    'Every admitted keeper receives one experimental Community Mark per eligible Realm day. Marks require no wallet or token action; they are not money and have no transfer, conversion, redemption, reward, or spending loop.'
});

export function RealmResourceBalancePanel({
  resource,
  resources,
  workerResourceState,
  workerPrivateSync,
  workers,
  onBack,
  onCloseToRealm,
  onOpenWorkers,
  resourceSites = [],
  onOpenResourceSite,
  onExplore,
  onRetry
}: Readonly<{
  resource: RealmSurfaceResourceKey;
  resources: ReadyRealmResourcePresentation;
  workerResourceState?: ReadyWorkerResourceState;
  workerPrivateSync?: Pick<
    WarpkeepWorkerPrivateSyncStatus,
    'phase' | 'commandsEnabled'
  >;
  workers: readonly RealmWorkerPublicPresentation[];
  onBack: () => void;
  onCloseToRealm: () => void;
  onOpenWorkers?: (invoker: HTMLButtonElement) => void;
  resourceSites?: readonly RealmNavigatorResourceSite[];
  onOpenResourceSite?: (
    site: RealmNavigatorResourceSite,
    invoker: HTMLButtonElement
  ) => void;
  onExplore?: (invoker: HTMLButtonElement) => void;
  onRetry?: () => void;
}>) {
  const title = RESOURCE_TITLES[resource];
  const activeWorkers = resource === 'marks'
    ? []
    : workers.filter((worker) => (
        worker.resourceKind === resource && worker.status !== 'idle'
      ));
  const available = resource === 'marks'
    ? undefined
    : workerResourceState?.available[resource] ?? resources.balances[resource];
  const pending = resource === 'marks'
    ? undefined
    : resources.pendingBalances[resource];
  const marks = resource === 'marks'
    ? resources.marksBalanceMicros
    : undefined;
  const syncReady = resource === 'marks'
    || workerPrivateSync === undefined
    || (workerPrivateSync.phase === 'ready' && workerPrivateSync.commandsEnabled);
  const relevantSites = resource === 'marks'
    ? []
    : resourceSites
      .filter((site) => (
        site.resource === resource
        && (site.availability === 'available' || site.availability === 'occupied')
      ))
      .slice(0, 6);

  return (
    <RealmFullScreenSurface
      backLabel="Back to Realm"
      canGoBack
      eyebrow="KEEP STORES"
      onBack={onBack}
      onCloseToRealm={onCloseToRealm}
      subtitle={syncReady ? 'Authoritative confirmed balance' : 'Last confirmed balance'}
      title={title}
      tone="resource"
    >
      <div className="realm-resource-balance">
        <section className="realm-resource-balance__amount" aria-label={`${title} balance`}>
          <span>{resource === 'marks' ? 'CURRENT RECORD' : 'AVAILABLE'}</span>
          <strong>
            {resource === 'marks'
              ? `${marks === undefined ? '0' : formatPublicMarkMicros(marks) ?? '0'} Marks`
              : formatExactRealmResourceQuantity(available ?? 0n) ?? '0'}
          </strong>
          {pending !== undefined && pending > 0n ? (
            <small>
              {formatExactRealmResourceQuantity(pending) ?? '0'} currently gathering
            </small>
          ) : null}
        </section>

        {!syncReady ? (
          <section className="realm-resource-balance__status" role="status">
            <strong>WORKER ACCRUAL IS SYNCHRONIZING</strong>
            <p>The last confirmed store remains visible. No local estimate replaces Realm authority.</p>
            {onRetry ? <button onClick={onRetry} type="button">RETRY PRIVATE SYNC</button> : null}
          </section>
        ) : null}

        <section className="realm-resource-balance__section">
          <h2>ROLE IN THE REALM</h2>
          <p>{RESOURCE_PURPOSE[resource]}</p>
        </section>

        {resource !== 'marks' ? (
          <section className="realm-resource-balance__section">
            <h2>ACTIVE WORKERS</h2>
            {activeWorkers.length > 0 ? (
              <ul>
                {activeWorkers.map((worker) => (
                  <li key={worker.workerId}>
                    <strong>Worker {worker.ordinal}</strong>
                    <span>{worker.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No Worker is currently assigned to {title.toLocaleLowerCase()}.</p>
            )}
          </section>
        ) : null}

        {resource !== 'marks' && relevantSites.length > 0 ? (
          <section className="realm-resource-balance__section">
            <h2>RELEVANT SITES</h2>
            <ul className="realm-resource-balance__sites">
              {relevantSites.map((site) => (
                <li key={site.key}>
                  <button
                    data-realm-focus-key={`resource-site:${site.key}`}
                    disabled={!onOpenResourceSite}
                    onClick={(event) => onOpenResourceSite?.(site, event.currentTarget)}
                    type="button"
                  >
                    <strong>{site.label}</strong>
                    <span>Tier {site.tier} · {site.availability}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <nav aria-label={`${title} actions`} className="realm-resource-balance__actions">
          {onOpenWorkers && resource !== 'marks' ? (
            <button
              data-realm-focus-key="resource:workers"
              onClick={(event) => onOpenWorkers(event.currentTarget)}
              type="button"
            >
              OPEN WORKERS
            </button>
          ) : null}
          {onExplore && resource !== 'marks' ? (
            <button
              data-realm-focus-key="resource:explore"
              onClick={(event) => onExplore(event.currentTarget)}
              type="button"
            >
              EXPLORE RESOURCE SITES
            </button>
          ) : null}
        </nav>
      </div>
    </RealmFullScreenSurface>
  );
}

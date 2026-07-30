import type { WarpkeepWorkerPrivateSyncStatus } from '../../spacetime/warpkeepBackendTypes';
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
    'Community Marks are a separate experimental record. They are not money and have no transfer, conversion, redemption, reward, or spending loop.'
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
  onOpenWorkers?: () => void;
  onExplore?: () => void;
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

        <nav aria-label={`${title} actions`} className="realm-resource-balance__actions">
          {onOpenWorkers && resource !== 'marks' ? (
            <button onClick={onOpenWorkers} type="button">OPEN WORKERS</button>
          ) : null}
          {onExplore && resource !== 'marks' ? (
            <button onClick={onExplore} type="button">EXPLORE RESOURCE SITES</button>
          ) : null}
        </nav>
      </div>
    </RealmFullScreenSurface>
  );
}

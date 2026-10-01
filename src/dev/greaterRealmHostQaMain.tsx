import React from 'react';
import ReactDOM from 'react-dom/client';

import { WarpkeepMainMenu } from '../components/menu/WarpkeepMainMenu';
import type { PtrRealmAuthority } from '../components/menu/realmChoicePolicy';
import { GreaterRealmWorldScene } from '../components/realm/GreaterRealmWorldScene';
import { RealmMapScreen } from '../components/realm/RealmMapScreen';
import type { GreaterRealmJourney } from '../greater-realm/greaterRealmJourneyLayer';
import type { ReadyWorkerControlState } from '../components/realm/realmWorkerPresentation';
import { createGreaterRealmClientRuntime } from '../greater-realm/greaterRealmClientRuntime';
import type {
  GreaterRealmDeviceClass,
  GreaterRealmGraphicsProfile
} from '../greater-realm/greaterRealmRuntimePolicy';
import type { GreaterRealmPublicTransport } from '../greater-realm/greaterRealmTransport';
import type { GraphicsQualityTier } from '../settings/graphicsPreference';
import type { AvailableGreaterRealmProviderBridge } from '../spacetime/greaterRealmProviderBridge';
import type { WarpkeepRealmContinuityProjection } from '../spacetime/warpkeepBackendTypes';
import { createSyntheticInnerKeepQaPresentation } from './innerKeepQaFixture';
import { innerKeepQaScenarioById } from './innerKeepQaScenarioManifest.mjs';
import { assertLocalQaRuntime } from './localQaRuntime';
import { QA_AUTH_STATES } from './qaJourneyFixture';
import { createZeroQaResourcePresentation } from './qaResourceFixture';
import { createRenderedWebglQaActiveWorkerRealm } from './renderedWebglQaFixture';
import {
  GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE,
  createGreaterRealmSyntheticTransport,
  greaterRealmSyntheticCellKey
} from './greaterRealmSyntheticTierOneFixture';
import '../styles/global.css';
import './greaterRealmHostQa.css';

const LOCAL_QA_PTR_AUTHORITY: PtrRealmAuthority = Object.freeze({
  source: 'server-verified',
  admission: 'admitted'
});

function graphicsQuality(search: string): GraphicsQualityTier {
  const value = new URLSearchParams(search).get('quality');
  if (value === 'cinematic' || value === 'performance') return value;
  return 'balanced';
}

function currentWindowTransport(ownCastle: Readonly<{
  castleId: number;
  q: number;
  r: number;
}>): GreaterRealmPublicTransport {
  const source = createGreaterRealmSyntheticTransport();
  const ownCell = GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.chunks
    .flatMap((chunk) => [...chunk.coreCells, ...chunk.apronCells])
    .find((cell) => cell.atlasQ === ownCastle.q && cell.atlasR === ownCastle.r);
  if (ownCell === undefined) throw new Error('GREATER_REALM_HOST_QA_CASTLE_CELL_MISSING');
  return Object.freeze({
    getBootstrap: async (signal) => Object.freeze({
      ...await source.getBootstrap(signal),
      mode: 'active' as const,
      myCastleId: BigInt(ownCastle.castleId),
      myCellKey: greaterRealmSyntheticCellKey(ownCastle.q, ownCastle.r),
      myAtlasQ: ownCastle.q,
      myAtlasR: ownCastle.r,
      myElevation: ownCell.elevation
    }),
    getChunk: async (request, signal) => {
      const chunk = await source.getChunk(request, signal);
      return chunk.lod === 0
        ? chunk
        : Object.freeze({ ...chunk, resourceLocations: Object.freeze([]) });
    },
    getResourceLocations: source.getResourceLocations,
    planRoute: source.planRoute,
    getWindow: async (request, signal) => {
      const fixture = await source.getWindow({
        centerQ: 0,
        centerR: 0,
        radius: 1,
        expectedRevision: request.expectedRevision
      }, signal);
      return Object.freeze({
        ...fixture,
        centerQ: request.centerQ,
        centerR: request.centerR,
        radius: request.radius,
        castles: Object.freeze([
          Object.freeze({
            castleId: BigInt(ownCastle.castleId),
            chunkHandle: ownCell.chunkHandle,
            atlasQ: ownCastle.q,
            atlasR: ownCastle.r,
            level: 2,
            elevation: ownCell.elevation
          }),
          ...fixture.castles.filter((castle) => (
            castle.castleId !== GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.bootstrap.myCastleId
          ))
        ].sort((left, right) => (
          left.castleId < right.castleId ? -1 : left.castleId > right.castleId ? 1 : 0
        )))
      });
    }
  });
}

function createFixture() {
  const legacyFixture = createRenderedWebglQaActiveWorkerRealm();
  const ownCastle = Object.freeze({ ...legacyFixture.snapshot.ownCastle, q: 0, r: 0 });
  const continuity: WarpkeepRealmContinuityProjection = Object.freeze({
    realmId: legacyFixture.snapshot.realm.realmId,
    players: legacyFixture.snapshot.players,
    profiles: legacyFixture.snapshot.profiles,
    castles: Object.freeze(legacyFixture.snapshot.castles.map((castle) => (
      castle.castleId === ownCastle.castleId ? ownCastle : castle
    ))),
    ownCastle,
    workerSystem: legacyFixture.snapshot.workerSystem,
    workerWorkers: legacyFixture.snapshot.workerWorkers,
    workerOccupations: legacyFixture.snapshot.workerOccupations
  });
  const control: ReadyWorkerControlState = Object.freeze({
    roster: legacyFixture.workerRoster,
    resourceState: legacyFixture.workerResourceState
  });
  const bridge = Object.freeze({
    phase: 'available' as const,
    presentationAllowed: true as const,
    sessionGeneration: 1,
    createRuntime: ({
      deviceClass,
      graphicsProfile
    }: Readonly<{
      deviceClass: GreaterRealmDeviceClass;
      graphicsProfile: GreaterRealmGraphicsProfile;
    }>) => createGreaterRealmClientRuntime({
      sessionGeneration: 1,
      isSessionCurrent: () => true,
      transport: currentWindowTransport(ownCastle),
      deviceClass,
      graphicsProfile
    }),
    getWorkerControl: () => Object.freeze({
      status: 'ready' as const,
      atlasId: GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.bootstrap.atlasId,
      atlasRevision: GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.bootstrap.revision,
      value: control
    }),
    dispatchWorker: async () => undefined,
    recallWorker: async () => undefined,
    recallAllWorkers: async () => undefined
  }) as unknown as AvailableGreaterRealmProviderBridge;
  return Object.freeze({ legacyFixture, continuity, bridge });
}

export type GreaterRealmHostQaAppProps = Readonly<{
  fixture: ReturnType<typeof createFixture>;
  quality: GraphicsQualityTier;
  ptrRealmAuthority?: PtrRealmAuthority;
  onRequestPtrRealm?: () => void;
}>;

export function GreaterRealmHostQaApp({
  fixture,
  quality,
  ptrRealmAuthority,
  onRequestPtrRealm
}: GreaterRealmHostQaAppProps) {
  const [surface, setSurface] = React.useState<'realm' | 'authenticated-menu'>('realm');
  const chat = React.useMemo(() => Object.freeze({
    availability: 'ready' as const,
    channelKey: 'realm-chat-local-qa',
    policyVersion: 'local-qa',
    mode: 'active' as const,
    messages: Object.freeze([])
  }), []);
  const emptyHistory = React.useMemo(
    () => Object.freeze({ messages: Object.freeze([]), hasMore: false }),
    []
  );
  const openRealm = React.useCallback(() => setSurface('realm'), []);

  if (surface === 'authenticated-menu') {
    return (
      <WarpkeepMainMenu
        active
        authState={QA_AUTH_STATES.authenticated}
        entryAgreementSatisfied
        onCancelFarcasterSignIn={() => undefined}
        onRequestAuthenticatedRealm={openRealm}
        onRequestFarcasterSignIn={() => undefined}
        onRequestPtrRealm={onRequestPtrRealm ?? openRealm}
        onRequestReturn={openRealm}
        onRetryFarcasterSignIn={() => undefined}
        onSignOut={() => undefined}
        ptrRealmAuthority={ptrRealmAuthority}
      />
    );
  }

  return (
    <RealmMapScreen
      identity={fixture.legacyFixture.identity}
      realmContinuity={fixture.continuity}
      greaterRealm={fixture.bridge}
      localQaGreaterRealmPresentationAllowed
      resolvedGraphicsQuality={quality}
      resources={createZeroQaResourcePresentation(fixture.legacyFixture.identity)}
      workerRoster={fixture.legacyFixture.workerRoster}
      innerKeep={{
        ...createSyntheticInnerKeepQaPresentation(innerKeepQaScenarioById('empty')),
        castleId: BigInt(fixture.continuity.ownCastle.castleId)
      }}
      realmChat={chat}
      onSendRealmChatMessage={async () => undefined}
      onReportRealmChatMessage={async () => undefined}
      onLoadEarlierRealmChat={async () => emptyHistory}
      onRequestReturn={() => setSurface('authenticated-menu')}
    />
  );
}

/** Synthetic own-Worker journeys over returned fixture cells (local QA only). */
function syntheticJourneys(nowMs: number): readonly GreaterRealmJourney[] {
  return Object.freeze([
    Object.freeze({ ordinal: 0, phase: 'outbound' as const, resource: 'wood' as const, route: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }],
      dispatchedAtMs: nowMs - 3_000, arrivesAtMs: nowMs + 12_000, gatheringStopsAtMs: nowMs + 72_000, returnsAtMs: nowMs + 87_000, recalledAtMs: null }),
    Object.freeze({ ordinal: 1, phase: 'returning' as const, resource: 'food' as const, route: [{ q: -1, r: 1 }, { q: -2, r: 1 }, { q: -2, r: 0 }, { q: -3, r: 0 }],
      dispatchedAtMs: nowMs - 80_000, arrivesAtMs: nowMs - 65_000, gatheringStopsAtMs: nowMs - 5_000, returnsAtMs: nowMs + 10_000, recalledAtMs: null }),
    Object.freeze({ ordinal: 2, phase: 'gathering' as const, resource: 'stone' as const, route: [{ q: 0, r: 0 }, { q: 0, r: 1 }],
      dispatchedAtMs: nowMs - 30_000, arrivesAtMs: nowMs - 25_000, gatheringStopsAtMs: nowMs + 600_000, returnsAtMs: nowMs + 605_000, recalledAtMs: null }),
  ]);
}

function start() {
  assertLocalQaRuntime();
  const root = ReactDOM.createRoot(document.getElementById('root')!);
  // Vite re-executes this local-only entry when the QA host itself changes.
  import.meta.hot?.dispose(() => root.unmount());
  const fixture = createFixture();
  if (new URLSearchParams(window.location.search).has('journeys')) {
    // The 0.4 world scene directly, with synthetic own-Worker journeys drawn.
    root.render(
      <React.StrictMode>
        <main className="realm-map-screen realm-map-screen--greater-realm">
          <GreaterRealmWorldScene bridge={fixture.bridge} identityFid={fixture.legacyFixture.identity.fid}
            identityKey="local-qa-journeys" ownCastle={{ castleId: Number(fixture.continuity.ownCastle.castleId), q: 0, r: 0 }}
            resolvedGraphicsQuality={graphicsQuality(window.location.search)} onPhaseChange={() => undefined}
            journeys04={syntheticJourneys(Date.now())} />
        </main>
      </React.StrictMode>
    );
    return;
  }
  root.render(
    <React.StrictMode>
      <GreaterRealmHostQaApp
        fixture={fixture}
        quality={graphicsQuality(window.location.search)}
        ptrRealmAuthority={LOCAL_QA_PTR_AUTHORITY}
      />
    </React.StrictMode>
  );
}

try {
  start();
} catch {
  document.getElementById('root')!.innerHTML =
    '<main role="alert">Greater Realm host QA is available only on loopback development.</main>';
}

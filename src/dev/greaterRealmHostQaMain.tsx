import React from 'react';
import ReactDOM from 'react-dom/client';

import { RealmMapScreen } from '../components/realm/RealmMapScreen';
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
import { createZeroQaResourcePresentation } from './qaResourceFixture';
import { createRenderedWebglQaActiveWorkerRealm } from './renderedWebglQaFixture';
import {
  GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE,
  createGreaterRealmSyntheticTransport,
  greaterRealmSyntheticCellKey
} from './greaterRealmSyntheticTierOneFixture';
import '../styles/global.css';
import './greaterRealmHostQa.css';

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

function start() {
  assertLocalQaRuntime();
  const root = ReactDOM.createRoot(document.getElementById('root')!);
  const fixture = createFixture();
  const chat = Object.freeze({
    availability: 'ready' as const,
    channelKey: 'realm-chat-local-qa',
    policyVersion: 'local-qa',
    mode: 'active' as const,
    messages: Object.freeze([])
  });
  const emptyHistory = Object.freeze({ messages: Object.freeze([]), hasMore: false });
  root.render(
    <React.StrictMode>
      <RealmMapScreen
        identity={fixture.legacyFixture.identity}
        realmContinuity={fixture.continuity}
        greaterRealm={fixture.bridge}
        localQaGreaterRealmPresentationAllowed
        resolvedGraphicsQuality={graphicsQuality(window.location.search)}
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
        onRequestReturn={() => undefined}
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

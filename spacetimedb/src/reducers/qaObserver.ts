import { SenderError, t } from 'spacetimedb/server';

import { requireQaSnapshotResolver } from '../auth';
import { WARPKEEP_BACKEND_PROTOCOL_VERSION } from '../config';
import { assertGenesisFoundingGraph } from '../foundingAuthority';
import {
  QaObserverSnapshotError,
  buildQaObserverRealmSnapshot,
} from '../qaObserverPolicy';
import warpkeep from '../schema';

const qaObserverRealmV1 = t.object('QaObserverRealmV1', {
  realmId: t.string(),
  numericSeed: t.u32(),
  generationVersion: t.u32(),
  authoritativeRadius: t.u32(),
  renderRadius: t.u32(),
  playerCapacity: t.u32(),
});

const qaObserverCastleV1 = t.object('QaObserverCastleV1', {
  castleId: t.u64(),
  tileKey: t.string(),
  q: t.i32(),
  r: t.i32(),
  level: t.i32(),
  name: t.string(),
  canonicalUsername: t.option(t.string()),
  displayName: t.option(t.string()),
  portraitAvailable: t.bool(),
  publicBio: t.option(t.string()),
  publicStatus: t.string(),
});

const qaObserverRealmSnapshotV1 = t.object('QaObserverRealmSnapshotV1', {
  version: t.u32(),
  protocolVersion: t.u32(),
  worldSeed: t.u32(),
  worldSeedName: t.string(),
  worldTileCount: t.u32(),
  worldTileMetaCount: t.u32(),
  realm: qaObserverRealmV1,
  castles: t.array(qaObserverCastleV1),
});

/**
 * Bridge-internal, no-argument read model for autonomous visual QA. The
 * resolver credential is independently revalidated here after lifecycle
 * admission. Private identifiers are used only for the in-module profile join
 * and never appear in the return type.
 */
export const qaObserverGetRealmSnapshotV1 = warpkeep.procedure(
  { name: 'qa_observer_get_realm_snapshot_v1' },
  qaObserverRealmSnapshotV1,
  ctx =>
    ctx.withTx(tx => {
      requireQaSnapshotResolver(tx);
      assertGenesisFoundingGraph(tx);
      try {
        const snapshot = buildQaObserverRealmSnapshot({
          worldTiles: tx.db.worldTile.iter(),
          worldMeta: tx.db.worldTileMetaV1.iter(),
          realms: tx.db.realmV1.iter(),
          castleSlots: tx.db.castleSlotV1.iter(),
          castles: tx.db.castle.iter(),
          profiles: tx.db.realmProfileV1.iter(),
        }, WARPKEEP_BACKEND_PROTOCOL_VERSION);
        return {
          version: snapshot.version,
          protocolVersion: snapshot.protocolVersion,
          worldSeed: snapshot.worldSeed,
          worldSeedName: snapshot.worldSeedName,
          worldTileCount: snapshot.worldTileCount,
          worldTileMetaCount: snapshot.worldTileMetaCount,
          realm: {
            realmId: snapshot.realm.realmId,
            numericSeed: snapshot.realm.numericSeed,
            generationVersion: snapshot.realm.generationVersion,
            authoritativeRadius: snapshot.realm.authoritativeRadius,
            renderRadius: snapshot.realm.renderRadius,
            playerCapacity: snapshot.realm.playerCapacity,
          },
          castles: snapshot.castles.map(castle => ({
            castleId: castle.castleId,
            tileKey: castle.tileKey,
            q: castle.q,
            r: castle.r,
            level: castle.level,
            name: castle.name,
            canonicalUsername: castle.canonicalUsername,
            displayName: castle.displayName,
            portraitAvailable: castle.portraitAvailable,
            publicBio: castle.publicBio,
            publicStatus: castle.publicStatus,
          })),
        };
      } catch (error) {
        if (error instanceof QaObserverSnapshotError) {
          throw new SenderError(error.message);
        }
        throw error;
      }
    }),
);

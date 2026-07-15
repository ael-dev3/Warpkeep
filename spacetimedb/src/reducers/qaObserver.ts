import { SenderError, t } from 'spacetimedb/server';

import { requireQaSnapshotResolver } from '../auth';
import { WARPKEEP_BACKEND_PROTOCOL_VERSION } from '../config';
import { assertGenesisFoundingGraph } from '../foundingAuthority';
import {
  QaObserverSnapshotError,
  buildQaObserverRealmAttestationV2,
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

const qaObserverRealmV2 = t.object('QaObserverRealmV2', {
  realmId: t.string(),
  numericSeed: t.u32(),
  generationVersion: t.u32(),
  authoritativeRadius: t.u32(),
  renderRadius: t.u32(),
  playerCapacity: t.u32(),
});

const qaObserverRealmAggregatesV2 = t.object('QaObserverRealmAggregatesV2', {
  castleCount: t.u32(),
  profileCount: t.u32(),
  foundedCount: t.u32(),
  activeCount: t.u32(),
});

const qaObserverRealmAttestationV2 = t.object('QaObserverRealmAttestationV2', {
  version: t.u32(),
  protocolVersion: t.u32(),
  worldSeed: t.u32(),
  worldSeedName: t.string(),
  worldTileCount: t.u32(),
  worldTileMetaCount: t.u32(),
  realm: qaObserverRealmV2,
  aggregates: qaObserverRealmAggregatesV2,
});

/**
 * Retain the deployed v1 wire so the schema change remains additive, but never
 * serve its identity-bearing projection again. No authentication or database
 * read is attempted on this deprecated path.
 */
export const qaObserverGetRealmSnapshotV1 = warpkeep.procedure(
  { name: 'qa_observer_get_realm_snapshot_v1' },
  qaObserverRealmSnapshotV1,
  _ctx => {
    throw new SenderError('QA_OBSERVER_V1_DISABLED');
  },
);

/**
 * Bridge-internal, no-argument aggregate attestation for autonomous QA. The
 * resolver credential is independently revalidated here after lifecycle
 * admission. Player identifiers and presentation fields are used only for
 * in-module consistency checks and cannot be represented by the return type.
 */
export const qaObserverGetRealmAttestationV2 = warpkeep.procedure(
  { name: 'qa_observer_get_realm_attestation_v2' },
  qaObserverRealmAttestationV2,
  ctx =>
    ctx.withTx(tx => {
      requireQaSnapshotResolver(tx);
      assertGenesisFoundingGraph(tx);
      try {
        const attestation = buildQaObserverRealmAttestationV2({
          worldTiles: tx.db.worldTile.iter(),
          worldMeta: tx.db.worldTileMetaV1.iter(),
          realms: tx.db.realmV1.iter(),
          castleSlots: tx.db.castleSlotV1.iter(),
          castles: tx.db.castle.iter(),
          profiles: tx.db.realmProfileV1.iter(),
        }, WARPKEEP_BACKEND_PROTOCOL_VERSION);
        return {
          version: attestation.version,
          protocolVersion: attestation.protocolVersion,
          worldSeed: attestation.worldSeed,
          worldSeedName: attestation.worldSeedName,
          worldTileCount: attestation.worldTileCount,
          worldTileMetaCount: attestation.worldTileMetaCount,
          realm: {
            realmId: attestation.realm.realmId,
            numericSeed: attestation.realm.numericSeed,
            generationVersion: attestation.realm.generationVersion,
            authoritativeRadius: attestation.realm.authoritativeRadius,
            renderRadius: attestation.realm.renderRadius,
            playerCapacity: attestation.realm.playerCapacity,
          },
          aggregates: {
            castleCount: attestation.aggregates.castleCount,
            profileCount: attestation.aggregates.profileCount,
            foundedCount: attestation.aggregates.foundedCount,
            activeCount: attestation.aggregates.activeCount,
          },
        };
      } catch (error) {
        if (error instanceof QaObserverSnapshotError) {
          throw new SenderError(error.message);
        }
        throw error;
      }
    }),
);

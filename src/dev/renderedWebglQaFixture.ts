import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_REALM,
  CANONICAL_WORLD_TILE_META,
  CANONICAL_WORLD_TILES
} from '../../spacetimedb/src/world';
import { WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION } from '../spacetime/warpkeepProtocol';
import {
  createRealmObserverHarnessRealm,
  parseRealmObserverSnapshot,
  type RealmObserverHarnessRealm,
  type RealmObserverSnapshot
} from './realmObserverSnapshot';
import {
  RENDERED_WEBGL_QA_CASTLE_COUNT,
  RENDERED_WEBGL_QA_FIXTURE_ID
} from './renderedWebglQa';

export const RENDERED_WEBGL_QA_OWNER_SEED = 917;
export const RENDERED_WEBGL_QA_LONG_DISPLAY_NAME =
  'QA Keeper With An Intentionally Long Display Name For Responsive Realm QA';
export const RENDERED_WEBGL_QA_LONG_PUBLIC_BIO =
  'A deliberately long synthetic public biography used only to verify that the responsive castle inspector truncates, wraps, and remains usable without leaking real profile data.';

function sequence(value: number) {
  return value.toString().padStart(3, '0');
}

function createRenderedWebglQaFixtureSnapshot(): RealmObserverSnapshot {
  if (CANONICAL_CASTLE_SLOTS.length !== RENDERED_WEBGL_QA_CASTLE_COUNT) {
    throw new Error('Rendered WebGL QA fixture requires every canonical castle slot.');
  }

  return parseRealmObserverSnapshot({
    version: 1,
    protocolVersion: WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION,
    worldSeed: CANONICAL_REALM.numericSeed,
    worldSeedName: CANONICAL_REALM.seedName,
    worldTileCount: CANONICAL_WORLD_TILES.length,
    worldTileMetaCount: CANONICAL_WORLD_TILE_META.length,
    realm: {
      realmId: CANONICAL_REALM.realmId,
      numericSeed: CANONICAL_REALM.numericSeed,
      generationVersion: CANONICAL_REALM.generationVersion,
      authoritativeRadius: CANONICAL_REALM.authoritativeRadius,
      renderRadius: CANONICAL_REALM.renderRadius,
      playerCapacity: CANONICAL_REALM.playerCapacity
    },
    castles: CANONICAL_CASTLE_SLOTS.map((slot, index) => {
      const ordinal = sequence(index + 1);
      return {
        castleId: 900_000 + index,
        tileKey: slot.tileKey,
        q: slot.q,
        r: slot.r,
        level: 1 + (index % 4),
        name: `Synthetic Keep ${ordinal}`,
        canonicalUsername: `qa-keep-${ordinal}`,
        displayName: RENDERED_WEBGL_QA_LONG_DISPLAY_NAME,
        publicBio: RENDERED_WEBGL_QA_LONG_PUBLIC_BIO,
        // This boolean never carries a profile URL. The observer adapter maps it
        // only to Warpkeep's fixed same-origin Marks placeholder so rendered QA
        // can exercise the native bounded portrait pipeline without real identity
        // data or an external request.
        portraitAvailable: true,
        publicStatus: index % 2 === 0 ? 'founded' : 'active'
      };
    })
  });
}

const RENDERED_WEBGL_QA_FIXTURE_SNAPSHOT = createRenderedWebglQaFixtureSnapshot();

/**
 * A deterministic, 100-castle local-only fixture. It deliberately contains no
 * real FID, external PFP URL, profile URL, wallet, Terms record, auth material,
 * or production snapshot. Portrait availability selects only the fixed local
 * observer placeholder owned by this repository.
 */
export function renderedWebglQaFixtureSnapshot() {
  return RENDERED_WEBGL_QA_FIXTURE_SNAPSHOT;
}

export function createRenderedWebglQaFixtureRealm(): RealmObserverHarnessRealm {
  return createRealmObserverHarnessRealm(
    RENDERED_WEBGL_QA_FIXTURE_SNAPSHOT,
    RENDERED_WEBGL_QA_OWNER_SEED
  );
}

export { RENDERED_WEBGL_QA_FIXTURE_ID };

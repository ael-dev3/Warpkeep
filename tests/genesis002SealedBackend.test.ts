import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

import {
  GENESIS_002_ADMISSION_MUTATIONS,
  GENESIS_002_ATLAS_ID,
  GENESIS_002_ATLAS_POLICY,
  GENESIS_002_STATUS,
} from '../spacetimedb/genesis002/src/contract';
import {
  assertGenesis002PopulationEmpty,
  assertGenesis002AtlasNotFinalized,
  type Genesis002PopulationSnapshot,
  Genesis002AdmissionsSealedError,
  executeGenesis002SealedMutation,
  withGenesis002AtlasImportBoundary,
} from '../spacetimedb/genesis002/src/policy';

test('Genesis 002 identifies a distinct sealed zero-population realm', () => {
  assert.deepEqual(GENESIS_002_STATUS, {
    realmId: 'GENESIS_002',
    databaseName: 'warpkeep-genesis-002',
    moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
    releaseVersion: '0.4.0',
    launchState: 'sealed',
    admissionsOpen: false,
    accessRequestsOpen: false,
    admittedPlayers: 0n,
    founders: 0n,
  });
  assert.deepEqual(GENESIS_002_ATLAS_POLICY, {
    importMutationsEnabled: true,
    activationMutationsEnabled: false,
    playerPresentationEnabled: false,
  });
  assert.equal(GENESIS_002_ATLAS_ID, 'GENESIS_002_GREATER_REALM');
});

test('every admission-equivalent mutation fails before its supplied effect', () => {
  assert.deepEqual(GENESIS_002_ADMISSION_MUTATIONS, [
    'access_request_submit_v1',
    'admin_allow_fid',
    'admin_allow_fid_for_access_request_v1',
    'admin_admit_founder_v1',
    'admin_admit_founder_for_access_request_v2',
    'admin_disable_fid',
    'admin_bump_auth_epoch',
    'admin_reset_access_request_v1',
    'bootstrap_player',
    'bootstrap_player_v2',
    'accept_alpha_terms_v1',
    'admin_upsert_realm_profile_v1',
  ]);

  for (const mutation of GENESIS_002_ADMISSION_MUTATIONS) {
    const effects: string[] = [];
    assert.throws(
      () => executeGenesis002SealedMutation(mutation, () => {
        effects.push('state-write');
        effects.push('audit-write');
        throw new Error('UNREACHABLE_EFFECT');
      }),
      error => {
        assert.ok(error instanceof Genesis002AdmissionsSealedError);
        assert.equal(error.name, 'Genesis002AdmissionsSealedError');
        assert.equal(error.code, 'GENESIS_002_ADMISSIONS_SEALED');
        assert.equal(error.mutation, mutation);
        assert.equal(error.message, 'GENESIS_002_ADMISSIONS_SEALED');
        return true;
      },
    );
    assert.deepEqual(effects, []);
  }
});

test('the mutation policy rejects unknown mutation names instead of widening authority', () => {
  assert.throws(
    () => executeGenesis002SealedMutation(
      'admin_open_admissions_v2' as never,
      () => {
        throw new Error('UNREACHABLE_EFFECT');
      },
    ),
    error => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, 'GENESIS_002_UNKNOWN_MUTATION');
      return true;
    },
  );
});

const EMPTY_POPULATION: Genesis002PopulationSnapshot = Object.freeze({
  allowedFids: 0n,
  accessRequests: 0n,
  playersV1: 0n,
  playersV2: 0n,
  ownershipBindings: 0n,
  castles: 0n,
  realmProfiles: 0n,
  termsAcceptances: 0n,
  markAccounts: 0n,
  resourceAccounts: 0n,
  castleClaims: 0n,
  cellOccupancies: 0n,
  activationRows: 0n,
  workerSystemRows: 0n,
});

test('the atlas-import exception accepts only an entirely empty population graph', () => {
  assert.doesNotThrow(() => assertGenesis002PopulationEmpty(EMPTY_POPULATION));

  for (const field of Object.keys(EMPTY_POPULATION) as Array<keyof typeof EMPTY_POPULATION>) {
    assert.throws(
      () => assertGenesis002PopulationEmpty({ ...EMPTY_POPULATION, [field]: 1n }),
      error => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, 'GENESIS_002_POPULATION_NOT_EMPTY');
        return true;
      },
      `${field} must keep atlas import fail-closed`,
    );
  }
});

test('atlas import checks zero population before and after its bounded effect', () => {
  let snapshot = EMPTY_POPULATION;
  let effects = 0;
  assert.equal(withGenesis002AtlasImportBoundary(
    () => snapshot,
    () => {
      effects += 1;
      return 'imported' as const;
    },
  ), 'imported');
  assert.equal(effects, 1);

  snapshot = { ...EMPTY_POPULATION, allowedFids: 1n };
  assert.throws(
    () => withGenesis002AtlasImportBoundary(
      () => snapshot,
      () => {
        effects += 1;
        return 'unreachable';
      },
    ),
    /GENESIS_002_POPULATION_NOT_EMPTY/,
  );
  assert.equal(effects, 1, 'the precondition must reject before the import effect');

  snapshot = EMPTY_POPULATION;
  assert.throws(
    () => withGenesis002AtlasImportBoundary(
      () => snapshot,
      () => {
        effects += 1;
        snapshot = { ...EMPTY_POPULATION, castleClaims: 1n };
        return 'rolled-back-by-reducer';
      },
    ),
    /GENESIS_002_POPULATION_NOT_EMPTY/,
  );
  assert.equal(effects, 2);
});

test('a finalized atlas closes the compile-time import exception permanently', () => {
  assert.doesNotThrow(() => assertGenesis002AtlasNotFinalized(false));
  assert.throws(
    () => assertGenesis002AtlasNotFinalized(true),
    /GENESIS_002_ATLAS_FINALIZED/,
  );
});

test('all seven atlas writers bind the G002 identity and finalized pre-effect boundary', () => {
  const source = readFileSync(resolve(
    import.meta.dirname,
    '../spacetimedb/genesis002/src/atlasImportReducers.ts',
  ), 'utf8');
  assert.equal(source.split('importBoundary(ctx, () => {').length - 1, 7);
  assert.equal(source.split('requireGenesis002AtlasId(').length - 1, 8);
  assert.equal(
    source.split('assertGenesis002AtlasNotFinalized(').length - 1,
    1,
  );
  for (const wireName of [
    'admin_stage_greater_realm_release_v1',
    'admin_import_greater_realm_components_v1',
    'admin_import_greater_realm_regions_v1',
    'admin_import_greater_realm_chunk_v1',
    'admin_begin_greater_realm_verification_v1',
    'admin_verify_greater_realm_batch_v1',
    'admin_finalize_greater_realm_release_v1',
  ]) assert.equal(source.split(`name: '${wireName}'`).length - 1, 1);
});

test('every G002 table descriptor is forced private instead of inheriting G001 visibility', () => {
  const source = readFileSync(resolve(
    import.meta.dirname,
    '../spacetimedb/genesis002/src/schema.ts',
  ), 'utf8');
  assert.match(source, /tableAccess:\s*\{ tag: 'Private' \}/u);
  assert.equal(
    source.split('makeGenesis002PrivateTable(').length - 1,
    23,
    'all 23 registered tables must use the private transform',
  );
  assert.doesNotMatch(source, /public:\s*true/u);
  assert.match(
    source,
    /GENESIS_002_PRIVATE_TABLE_COUNT = 23/u,
  );
});

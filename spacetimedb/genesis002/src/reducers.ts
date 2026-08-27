import { SenderError, t } from 'spacetimedb/server';

import {
  GENESIS_002_ATLAS_POLICY,
  GENESIS_002_STATUS,
  type Genesis002AdmissionMutation,
} from './contract';
import {
  executeGenesis002SealedMutation,
  Genesis002AdmissionsSealedError,
} from './policy';
import { requireGenesis002Admin } from './auth';
import genesis002 from './schema';
import { inspectGreaterRealmV17 } from '../../src/greaterRealmV17Authority';
import {
  genesis002PopulationSnapshot,
  requireGenesis002PopulationEmpty,
} from './population';

type SharedGreaterRealmContext = Parameters<typeof inspectGreaterRealmV17>[0];

function sharedGreaterRealmContext(
  ctx: Parameters<typeof requireGenesis002PopulationEmpty>[0],
): SharedGreaterRealmContext {
  return ctx as unknown as SharedGreaterRealmContext;
}

const realmStatusV1 = t.object('Genesis002RealmStatusV1', {
  realmId: t.string(),
  databaseName: t.string(),
  moduleIdentity: t.string(),
  releaseVersion: t.string(),
  launchState: t.string(),
  admissionsOpen: t.bool(),
  accessRequestsOpen: t.bool(),
  admittedPlayers: t.u64(),
  founders: t.u64(),
  allowedFids: t.u64(),
  accessRequests: t.u64(),
  playersV1: t.u64(),
  playersV2: t.u64(),
  ownershipBindings: t.u64(),
  castles: t.u64(),
  realmProfiles: t.u64(),
  termsAcceptances: t.u64(),
  markAccounts: t.u64(),
  resourceAccounts: t.u64(),
  castleClaims: t.u64(),
  cellOccupancies: t.u64(),
  activationRows: t.u64(),
  workerSystemRows: t.u64(),
  atlasImportMutationsEnabled: t.bool(),
  atlasActivationMutationsEnabled: t.bool(),
  playerPresentationEnabled: t.bool(),
  atlasPresent: t.bool(),
  atlasId: t.option(t.string()),
  publicReleaseId: t.option(t.string()),
  atlasState: t.string(),
  atlasReady: t.bool(),
  atlasCellRows: t.u64(),
  atlasSlotRows: t.u64(),
  atlasResourceRows: t.u64(),
});

const accessRequestStatusV1 = t.object('Genesis002AccessRequestStatusV1', {
  status: t.string(),
  requestedAtMicros: t.option(t.u64()),
});

const authResolverFidAdmissionV2 = t.object('Genesis002AuthResolverFidAdmissionV2', {
  state: t.string(),
  authEpoch: t.u32(),
});

function reject(mutation: Genesis002AdmissionMutation): never {
  try {
    return executeGenesis002SealedMutation(mutation, () => {
      throw new Error('GENESIS_002_UNREACHABLE_MUTATION_EFFECT');
    });
  } catch (error) {
    if (error instanceof Genesis002AdmissionsSealedError) {
      throw new SenderError(error.code);
    }
    throw error;
  }
}

/** Administrator-only launch status; no anonymous/public G002 status exists. */
export const getRealmStatusV1 = genesis002.procedure(
  { name: 'get_realm_status_v1' },
  realmStatusV1,
  ctx => ctx.withTx(tx => {
    requireGenesis002Admin(tx);
    requireGenesis002PopulationEmpty(tx);
    const population = genesis002PopulationSnapshot(tx);
    const atlas = inspectGreaterRealmV17(sharedGreaterRealmContext(tx));
    return {
      ...GENESIS_002_STATUS,
      ...population,
      atlasImportMutationsEnabled: GENESIS_002_ATLAS_POLICY.importMutationsEnabled,
      atlasActivationMutationsEnabled: GENESIS_002_ATLAS_POLICY.activationMutationsEnabled,
      playerPresentationEnabled: GENESIS_002_ATLAS_POLICY.playerPresentationEnabled,
      atlasPresent: atlas.present,
      atlasId: atlas.atlasId,
      publicReleaseId: atlas.publicReleaseId,
      atlasState: atlas.state,
      atlasReady: atlas.ready,
      atlasCellRows: atlas.cellRows,
      atlasSlotRows: atlas.slotRows,
      atlasResourceRows: atlas.resourceRows,
    };
  }),
);

/** No caller is admitted to Genesis 002 while the realm is sealed. */
export const getMyAdmissionStatusV2 = genesis002.procedure(
  { name: 'get_my_admission_status_v2' },
  t.string(),
  ctx => ctx.withTx(tx => {
    requireGenesis002Admin(tx);
    requireGenesis002PopulationEmpty(tx);
    return 'not_admitted';
  }),
);

/** Resolver-compatible missing state; no FID is stored or disclosed. */
export const authResolverGetFidAdmissionV2 = genesis002.procedure(
  { name: 'auth_resolver_get_fid_admission_v2' },
  { fid: t.u64() },
  authResolverFidAdmissionV2,
  (ctx, _input) => ctx.withTx(tx => {
    requireGenesis002Admin(tx);
    requireGenesis002PopulationEmpty(tx);
    return { state: 'missing', authEpoch: 0 };
  }),
);

/** Read-only request state remains closed and stores no application. */
export const accessRequestGetStatusV1 = genesis002.procedure(
  { name: 'access_request_get_status_v1' },
  accessRequestStatusV1,
  ctx => ctx.withTx(tx => {
    requireGenesis002Admin(tx);
    requireGenesis002PopulationEmpty(tx);
    return { status: 'admissions_suspended', requestedAtMicros: undefined };
  }),
);

export const accessRequestSubmitV1 = genesis002.procedure(
  { name: 'access_request_submit_v1' },
  accessRequestStatusV1,
  () => reject('access_request_submit_v1'),
);

export const adminAllowFid = genesis002.reducer(
  { name: 'admin_allow_fid' },
  { fid: t.u64(), note: t.string() },
  () => reject('admin_allow_fid'),
);

export const adminAllowFidForAccessRequestV1 = genesis002.reducer(
  { name: 'admin_allow_fid_for_access_request_v1' },
  {
    fid: t.u64(),
    note: t.string(),
    expectedRequestCycle: t.u64(),
    expectedRequestedAtMicros: t.u64(),
  },
  () => reject('admin_allow_fid_for_access_request_v1'),
);

const admissionProfileArgs = {
  fid: t.u64(),
  note: t.string(),
  canonicalUsername: t.string(),
  displayName: t.option(t.string()),
  pfpUrl: t.string(),
  publicBio: t.option(t.string()),
  profilePolicyVersion: t.string(),
};

export const adminAdmitFounderV1 = genesis002.reducer(
  { name: 'admin_admit_founder_v1' },
  admissionProfileArgs,
  () => reject('admin_admit_founder_v1'),
);

export const adminAdmitFounderForAccessRequestV2 = genesis002.reducer(
  { name: 'admin_admit_founder_for_access_request_v2' },
  {
    ...admissionProfileArgs,
    expectedRequestCycle: t.u64(),
    expectedRequestedAtMicros: t.u64(),
  },
  () => reject('admin_admit_founder_for_access_request_v2'),
);

export const adminDisableFid = genesis002.reducer(
  { name: 'admin_disable_fid' },
  { fid: t.u64(), note: t.string() },
  () => reject('admin_disable_fid'),
);

export const adminBumpAuthEpoch = genesis002.reducer(
  { name: 'admin_bump_auth_epoch' },
  { fid: t.u64(), note: t.string() },
  () => reject('admin_bump_auth_epoch'),
);

export const adminResetAccessRequestV1 = genesis002.reducer(
  { name: 'admin_reset_access_request_v1' },
  {
    fid: t.u64(),
    expectedEnabled: t.bool(),
    expectedAuthEpoch: t.u32(),
    expectedRequestCycle: t.option(t.u64()),
    expectedRequestedAtMicros: t.option(t.u64()),
    note: t.string(),
  },
  () => reject('admin_reset_access_request_v1'),
);

export const bootstrapPlayer = genesis002.reducer(
  { name: 'bootstrap_player' },
  () => reject('bootstrap_player'),
);

export const bootstrapPlayerV2 = genesis002.reducer(
  { name: 'bootstrap_player_v2' },
  () => reject('bootstrap_player_v2'),
);

export const acceptAlphaTermsV1 = genesis002.reducer(
  { name: 'accept_alpha_terms_v1' },
  { termsVersion: t.string(), accepted: t.bool() },
  () => reject('accept_alpha_terms_v1'),
);

export const adminUpsertRealmProfileV1 = genesis002.reducer(
  { name: 'admin_upsert_realm_profile_v1' },
  {
    fid: t.u64(),
    canonicalUsername: t.option(t.string()),
    displayName: t.option(t.string()),
    pfpUrl: t.option(t.string()),
    publicBio: t.option(t.string()),
    profilePolicyVersion: t.string(),
  },
  () => reject('admin_upsert_realm_profile_v1'),
);

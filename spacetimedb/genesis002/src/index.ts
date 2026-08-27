import genesis002 from './schema';

export default genesis002;

export { onConnect } from './lifecycle';

export {
  getRealmStatusV1,
  getMyAdmissionStatusV2,
  authResolverGetFidAdmissionV2,
  accessRequestGetStatusV1,
  accessRequestSubmitV1,
  adminAllowFid,
  adminAllowFidForAccessRequestV1,
  adminAdmitFounderV1,
  adminAdmitFounderForAccessRequestV2,
  adminDisableFid,
  adminBumpAuthEpoch,
  adminResetAccessRequestV1,
  bootstrapPlayer,
  bootstrapPlayerV2,
  acceptAlphaTermsV1,
  adminUpsertRealmProfileV1,
} from './reducers';
export {
  adminGetGreaterRealmStatusV1,
  adminGetGreaterRealmImportPlanV1,
  adminStageGreaterRealmReleaseV1,
  adminImportGreaterRealmComponentsV1,
  adminImportGreaterRealmRegionsV1,
  adminImportGreaterRealmChunkV1,
  adminBeginGreaterRealmVerificationV1,
  adminVerifyGreaterRealmBatchV1,
  adminFinalizeGreaterRealmReleaseV1,
} from './atlasImportReducers';

// SpacetimeDB 2.6 otherwise rewrites trailing version digits (`v2` -> `v_2`).
for (const name of [
  'get_realm_status_v1',
]) {
  genesis002.moduleDef.explicitNames.entries.push({
    tag: 'Function',
    value: { sourceName: name, canonicalName: name },
  });
}

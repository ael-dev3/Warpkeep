import ptr from './schema';

export default ptr;

export { onConnect } from './lifecycle';

export {
  adminGetGreaterRealmStatusV1,
  adminStageGreaterRealmReleaseV1,
  adminImportGreaterRealmComponentsV1,
  adminImportGreaterRealmRegionsV1,
  adminImportGreaterRealmChunkV1,
  adminBeginGreaterRealmVerificationV1,
  adminVerifyGreaterRealmBatchV1,
  adminFinalizeGreaterRealmReleaseV1,
} from './atlasImportReducers';

export {
  adminProvisionPtrOwnerV1,
  adminSuspendPtrOwnerV1,
  getPtrOwnerStatusV1,
} from './ownerReducers';

export {
  getRealmAtlasBootstrapV1,
  getRealmAtlasWindowV1,
  getRealmAtlasChunkV1,
  getRealmAtlasResourceLocationsV1,
  planRealmRouteV1,
} from './atlasReadReducers';

// Procedure registration does not create an explicit name entry. Pin exact
// client wire names so SpacetimeDB 2.6 cannot rewrite `v1` to `v_1`.
for (const name of [
  'admin_get_greater_realm_status_v1',
  'get_ptr_owner_status_v1',
  'get_realm_atlas_bootstrap_v1',
  'get_realm_atlas_window_v1',
  'get_realm_atlas_chunk_v1',
  'get_realm_atlas_resource_locations_v1',
  'plan_realm_route_v1',
]) {
  ptr.moduleDef.explicitNames.entries.push({
    tag: 'Function',
    value: { sourceName: name, canonicalName: name },
  });
}

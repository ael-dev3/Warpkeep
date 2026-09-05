import genesis002 from './schema';

export default genesis002;

export { onConnect } from './lifecycle';
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
export {
  initializeGameplay04KeepV1,
  getGameplay04KeepV1,
} from './gameplayKeep';

for (const name of [
  'initialize_gameplay04_keep_v1',
  'get_gameplay04_keep_v1',
]) {
  genesis002.moduleDef.explicitNames.entries.push({
    tag: 'Function',
    value: { sourceName: name, canonicalName: name },
  });
}

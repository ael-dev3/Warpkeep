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
export {
  dispatchGameplay04WorkerV1,
  recallGameplay04WorkerV1,
} from './gameplayWorkers';
export { startGameplay04BuildingV1 } from './gameplayConstruction';
export { runGameplay04ScheduleV1 } from './gameplaySchedule';

for (const name of [
  'initialize_gameplay04_keep_v1',
  'get_gameplay04_keep_v1',
  'dispatch_gameplay04_worker_v1',
  'recall_gameplay04_worker_v1',
  'start_gameplay04_building_v1',
  'run_gameplay_04_schedule_v_1',
]) {
  genesis002.moduleDef.explicitNames.entries.push({
    tag: 'Function',
    value: { sourceName: name, canonicalName: name },
  });
}

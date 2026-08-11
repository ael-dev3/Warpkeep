import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { tables as generatedTables } from '../src/spacetime/module_bindings'
import { DbConnection, tables as playerTables } from '../src/spacetime/playerModuleBindings'

const PLAYER_TABLE_KEYS = [
  'castle',
  'castleInnerKeepBuildingV1',
  'castleWorkerV1',
  'foodNodeOccupationV1',
  'foodSiteV1',
  'goldNodeOccupationV1',
  'goldSiteV1',
  'innerKeepBuildLevelV1',
  'innerKeepBuildingCatalogV1',
  'innerKeepLayoutV1',
  'innerKeepSlotV1',
  'playerV2',
  'realmChatStatusV1',
  'realmEnvironmentV1',
  'realmForestInstanceV1',
  'realmForestLayoutV1',
  'realmProfileV1',
  'realmV1',
  'realmWorkerSystemV1',
  'realmWaterBodyV1',
  'realmWaterCellV1',
  'realmWaterLayoutV1',
  'realmWaterRevisionV1',
  'stoneNodeOccupationV1',
  'stoneSiteV1',
  'woodNodeOccupationV1',
  'woodSiteV1',
  'workerNodeOccupationV1',
  'worldTile',
  'worldTileMetaV1',
] as const

function tableContract(table: typeof generatedTables[keyof typeof generatedTables]) {
  return {
    sourceName: table.sourceName,
    accessorName: table.accessorName,
    columnNames: Object.keys(table.columns),
    indexes: table.indexes,
    constraints: table.constraints,
  }
}

describe('player SpacetimeDB bindings', () => {
  it('matches the exact generated contract for every player-visible table', () => {
    expect(Object.keys(playerTables).sort()).toEqual([...PLAYER_TABLE_KEYS].sort())

    for (const key of PLAYER_TABLE_KEYS) {
      expect(tableContract(playerTables[key])).toEqual(tableContract(generatedTables[key]))
    }
    expect(Object.keys(playerTables.castleWorkerV1.columns)).toEqual([
      'workerId',
      'originCastleId',
      'ordinal',
      'status',
      'resourceKind',
      'siteId',
      'startedAtMicros',
      'arrivesAtMicros',
      'gatheringEndsAtMicros',
      'returnStartedAtMicros',
      'returnsAtMicros',
      'routeSteps',
      'returnStartProgressBasisPoints',
      'timelineRevision',
      'revision',
    ])
  })

  it('keeps the public Vite path on the narrow projection, not the generated barrel', () => {
    const root = process.cwd()
    const playerBindings = readFileSync(
      resolve(root, 'src/spacetime/playerModuleBindings.ts'),
      'utf8',
    )
    const connection = readFileSync(
      resolve(root, 'src/spacetime/warpkeepConnection.ts'),
      'utf8',
    )

    expect(connection).toContain("from './playerModuleBindings'")
    expect(connection).not.toContain("from './module_bindings'")
    expect(connection).toContain('.subscribe([tables.realmChatStatusV1])')
    expect(connection).not.toContain('tables.realmChatRecentV1')
    expect(playerBindings).toContain("'accept_alpha_terms_v1'")
    expect(playerBindings).toContain("'bootstrap_player_v2'")
    expect(playerBindings).toContain("'collect_food_expedition_v1'")
    expect(playerBindings).toContain("'collect_gold_expedition_v1'")
    expect(playerBindings).toContain("'collect_wood_expedition_v1'")
    expect(playerBindings).toContain("'collect_stone_expedition_v1'")
    expect(playerBindings).toContain("'collect_resources_v1'")
    expect(playerBindings).toContain("'dispatch_food_expedition_v1'")
    expect(playerBindings).toContain("'dispatch_gold_expedition_v1'")
    expect(playerBindings).toContain("'dispatch_wood_expedition_v1'")
    expect(playerBindings).toContain("'dispatch_stone_expedition_v1'")
    expect(playerBindings).toContain("'get_alpha_backend_info'")
    expect(playerBindings).toContain("'get_my_admission_status_v2'")
    expect(playerBindings).toContain("'get_my_entry_agreement_status_v1'")
    expect(playerBindings).toContain("'get_my_food_expedition_state_v1'")
    expect(playerBindings).toContain("'get_my_gold_expedition_state_v1'")
    expect(playerBindings).toContain("'get_my_wood_expedition_state_v1'")
    expect(playerBindings).toContain("'get_my_stone_expedition_state_v1'")
    expect(playerBindings).toContain("'get_my_resource_state_v1'")
    expect(playerBindings).toContain("'get_my_resource_state_v2'")
    expect(playerBindings).toContain("'get_my_worker_control_state_v1'")
    expect(playerBindings).toContain("'get_my_worker_roster_v1'")
    expect(playerBindings).toContain("'get_realm_chat_history_v1'")
    expect(playerBindings).toContain("'get_realm_chat_recent_v1'")
    expect(playerBindings).toContain("'get_realm_atlas_bootstrap_v1'")
    expect(playerBindings).toContain("'get_realm_atlas_chunk_v1'")
    expect(playerBindings).toContain("'get_realm_atlas_window_v1'")
    expect(playerBindings).toContain("'plan_realm_route_v1'")
    expect(playerBindings).toContain("'dispatch_worker_v1'")
    expect(playerBindings).toContain("'inner_keep_start_project_v1'")
    expect(playerBindings).toContain("'get_my_inner_keep_request_status_v1'")
    expect(playerBindings).toContain("'get_my_inner_keep_state_v1'")
    expect(playerBindings).toContain("name: 'inner_keep_layout_v1'")
    expect(playerBindings).toContain("name: 'inner_keep_slot_v1'")
    expect(playerBindings).toContain("name: 'inner_keep_building_catalog_v1'")
    expect(playerBindings).toContain("name: 'inner_keep_build_level_v1'")
    expect(playerBindings).toContain("name: 'castle_inner_keep_building_v1'")
    expect(playerBindings).toContain("'recall_worker_v1'")
    expect(playerBindings).toContain("'recall_all_workers_v1'")
    expect(playerBindings).toContain("'return_legacy_expedition_v1'")
    expect(playerBindings).toContain("'send_realm_chat_message_v1'")
    expect(playerBindings).toContain("'report_realm_chat_message_v1'")
    expect(playerBindings).not.toContain("name: 'realm_chat_recent_v1'")
    expect(playerBindings).toContain("'realm_forest_layout_v1'")
    expect(playerBindings).toContain("'realm_forest_instance_v1'")
    expect(playerBindings).toContain("'realm_water_revision_v1'")
    expect(playerBindings).not.toContain('food_expedition_schedule_v_1')
    expect(playerBindings).not.toContain('gold_expedition_schedule_v_1')
    expect(playerBindings).not.toContain('wood_expedition_schedule_v_1')
    expect(playerBindings).not.toContain('stone_expedition_schedule_v_1')
    expect(playerBindings).not.toMatch(/name:\s*'wood_expedition_v_1'/)
    expect(playerBindings).not.toContain('wood_expedition_idempotency_v1')
    expect(playerBindings).not.toContain('run_wood_expedition_schedule_v_1')
    expect(playerBindings).not.toContain('admin_seed_genesis_tier_i_food_sites_v_1')
    expect(playerBindings).not.toContain('admin_seed_genesis_tier_i_wood_sites_v_1')
    expect(playerBindings).not.toContain('admin_seed_genesis_forest_layout_v_1')
    expect(playerBindings).not.toContain('admin_get_alpha_status_v_10')
    expect(playerBindings).not.toContain('admin_inspect_genesis_water_layout_v_1')
    expect(playerBindings).not.toContain('admin_seed_genesis_water_layout_v_1')
    expect(playerBindings).not.toContain('admin_activate_genesis_water_layout_v_1')
    expect(playerBindings).not.toContain('admin_seed_genesis_tier_i_stone_sites_v_1')
    expect(playerBindings).not.toContain('stone_expedition_idempotency_v_1')
    expect(playerBindings).not.toMatch(/name:\s*'stone_expedition_v_1'/)
    expect(playerBindings).not.toContain('qa_observer_')
    expect(playerBindings).not.toContain('QA_OBSERVER')
    expect(playerBindings).not.toContain('/v1/qa/')
    expect(playerBindings).not.toContain('worker_assignment_schedule_v_1')
    expect(playerBindings).not.toContain('worker_command_idempotency_v_1')
    expect(playerBindings).not.toContain('castle_inner_builder_v_1')
    expect(playerBindings).not.toContain('castle_inner_build_receipt_v_1')
    expect(playerBindings).not.toContain('castle_inner_construction_schedule_v_1')
    expect(playerBindings).not.toContain('admin_get_inner_keep_status_v_1')
    expect(playerBindings).not.toContain('admin_plan_inner_keep_catalog_v_1')
    expect(playerBindings).not.toContain('admin_seed_inner_keep_catalog_v_1')
    expect(playerBindings).not.toContain('admin_activate_inner_keep_v_1')
    expect(playerBindings).not.toContain("name: 'realm_atlas_v1'")
    expect(playerBindings).not.toContain("name: 'realm_atlas_visible_region_v1'")
    expect(playerBindings).not.toContain("name: 'greater_realm_cell_occupancy_v1'")
    expect(playerBindings).not.toContain('admin_import_greater_realm')
    expect(playerBindings).not.toContain('admin_finalize_greater_realm')
  })

  it('exposes only the player reducer and procedure accessors at runtime', () => {
    const socket = {
      protocol: '',
      send: vi.fn(),
      close: vi.fn(),
      onclose: undefined,
      onopen: undefined,
      onmessage: undefined,
      onerror: undefined,
    }
    const connection = DbConnection.builder()
      .withUri('https://example.invalid')
      .withDatabaseName('warpkeep-test')
      .withWSFn(async () => socket as never)
      .build()

    expect(Object.keys(connection.db).sort()).toEqual([...PLAYER_TABLE_KEYS].sort())
    expect(Object.keys(connection.reducers).sort()).toEqual([
      'acceptAlphaTermsV1',
      'bootstrapPlayerV2',
      'collectFoodExpeditionV1',
      'collectGoldExpeditionV1',
      'collectResourcesV1',
      'collectStoneExpeditionV1',
      'collectWoodExpeditionV1',
      'dispatchFoodExpeditionV1',
      'dispatchGoldExpeditionV1',
      'dispatchStoneExpeditionV1',
      'dispatchWoodExpeditionV1',
      'dispatchWorkerV1',
      'innerKeepStartProjectV1',
      'recallAllWorkersV1',
      'recallWorkerV1',
      'reportRealmChatMessageV1',
      'returnLegacyExpeditionV1',
      'sendRealmChatMessageV1',
    ])
    expect(Object.keys(connection.procedures).sort()).toEqual([
      'getAlphaBackendInfo',
      'getMyAdmissionStatusV2',
      'getMyEntryAgreementStatusV1',
      'getMyFoodExpeditionStateV1',
      'getMyGoldExpeditionStateV1',
      'getMyInnerKeepRequestStatusV1',
      'getMyInnerKeepStateV1',
      'getMyResourceStateV1',
      'getMyResourceStateV2',
      'getMyStoneExpeditionStateV1',
      'getMyWoodExpeditionStateV1',
      'getMyWorkerControlStateV1',
      'getMyWorkerRosterV1',
      'getRealmAtlasBootstrapV1',
      'getRealmAtlasChunkV1',
      'getRealmAtlasWindowV1',
      'getRealmChatHistoryV1',
      'getRealmChatRecentV1',
      'planRealmRouteV1',
    ])

    connection.disconnect()
  })
})

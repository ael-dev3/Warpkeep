import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { tables as generatedTables } from '../src/spacetime/module_bindings'
import { DbConnection, tables as playerTables } from '../src/spacetime/playerModuleBindings'

const PLAYER_TABLE_KEYS = [
  'castle',
  'goldNodeOccupationV1',
  'goldSiteV1',
  'playerV2',
  'realmForestInstanceV1',
  'realmForestLayoutV1',
  'realmProfileV1',
  'realmV1',
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
    expect(playerBindings).toContain("'accept_alpha_terms_v1'")
    expect(playerBindings).toContain("'bootstrap_player_v2'")
    expect(playerBindings).toContain("'collect_gold_expedition_v1'")
    expect(playerBindings).toContain("'collect_resources_v1'")
    expect(playerBindings).toContain("'dispatch_gold_expedition_v1'")
    expect(playerBindings).toContain("'get_alpha_backend_info'")
    expect(playerBindings).toContain("'get_my_admission_status_v2'")
    expect(playerBindings).toContain("'get_my_gold_expedition_state_v1'")
    expect(playerBindings).toContain("'get_my_resource_state_v1'")
    expect(playerBindings).toContain("'realm_forest_layout_v1'")
    expect(playerBindings).toContain("'realm_forest_instance_v1'")
    expect(playerBindings).not.toContain('gold_expedition_schedule_v_1')
    expect(playerBindings).not.toContain('admin_seed_genesis_forest_layout_v_1')
    expect(playerBindings).not.toContain('qa_observer_')
    expect(playerBindings).not.toContain('QA_OBSERVER')
    expect(playerBindings).not.toContain('/v1/qa/')
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
      'collectGoldExpeditionV1',
      'collectResourcesV1',
      'dispatchGoldExpeditionV1',
    ])
    expect(Object.keys(connection.procedures).sort()).toEqual([
      'getAlphaBackendInfo',
      'getMyAdmissionStatusV2',
      'getMyGoldExpeditionStateV1',
      'getMyResourceStateV1',
    ])

    connection.disconnect()
  })
})

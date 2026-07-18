/**
 * The browser's deliberately narrow projection of the generated Warpkeep
 * SpacetimeDB schema.
 *
 * The complete generated bindings remain the canonical schema artifact under
 * `module_bindings/` and are still used by server-side operators. The player
 * only needs the public realm tables plus three read procedures and three
 * self-service reducers. Keeping that runtime projection separate prevents
 * private/admin and machine-bound QA procedure names from becoming part of
 * the public Vite graph while preserving generated-binding parity unchanged.
 *
 * When the player wire changes, update this projection from the generated
 * binding in the same change and keep `playerModuleBindings.test.ts` green.
 */
import {
  DbConnectionBuilder as __DbConnectionBuilder,
  DbConnectionImpl as __DbConnectionImpl,
  SubscriptionBuilderImpl as __SubscriptionBuilderImpl,
  makeQueryBuilder as __makeQueryBuilder,
  procedureSchema as __procedureSchema,
  procedures as __procedures,
  reducerSchema as __reducerSchema,
  reducers as __reducers,
  schema as __schema,
  table as __table,
  type DbConnectionConfig as __DbConnectionConfig,
  type EventContextInterface as __EventContextInterface,
  type QueryBuilder as __QueryBuilder,
  type RemoteModule as __RemoteModule,
  type SubscriptionHandleImpl as __SubscriptionHandleImpl,
} from 'spacetimedb'

import AcceptAlphaTermsV1Reducer from './module_bindings/accept_alpha_terms_v_1_reducer'
import BootstrapPlayerV2Reducer from './module_bindings/bootstrap_player_v_2_reducer'
import CollectGoldExpeditionV1Reducer from './module_bindings/collect_gold_expedition_v_1_reducer'
import CollectResourcesV1Reducer from './module_bindings/collect_resources_v_1_reducer'
import CastleRow from './module_bindings/castle_table'
import * as GetAlphaBackendInfoProcedure from './module_bindings/get_alpha_backend_info_procedure'
import * as GetMyAdmissionStatusV2Procedure from './module_bindings/get_my_admission_status_v_2_procedure'
import * as GetMyGoldExpeditionStateV1Procedure from './module_bindings/get_my_gold_expedition_state_v_1_procedure'
import * as GetMyResourceStateV1Procedure from './module_bindings/get_my_resource_state_v_1_procedure'
import DispatchGoldExpeditionV1Reducer from './module_bindings/dispatch_gold_expedition_v_1_reducer'
import GoldNodeOccupationV1Row from './module_bindings/gold_node_occupation_v_1_table'
import GoldSiteV1Row from './module_bindings/gold_site_v_1_table'
import PlayerV2Row from './module_bindings/player_v_2_table'
import RealmProfileV1Row from './module_bindings/realm_profile_v_1_table'
import RealmV1Row from './module_bindings/realm_v_1_table'
import WorldTileMetaV1Row from './module_bindings/world_tile_meta_v_1_table'
import WorldTileRow from './module_bindings/world_tile_table'

const tablesSchema = __schema({
  castle: __table({
    name: 'castle',
    indexes: [
      { accessor: 'castleId', name: 'castle_castle_id_idx_btree', algorithm: 'btree', columns: [
        'castleId',
      ] },
      { accessor: 'ownerFid', name: 'castle_owner_fid_idx_btree', algorithm: 'btree', columns: [
        'ownerFid',
      ] },
      { accessor: 'tileKey', name: 'castle_tile_key_idx_btree', algorithm: 'btree', columns: [
        'tileKey',
      ] },
    ],
    constraints: [
      { name: 'castle_castle_id_key', constraint: 'unique', columns: ['castleId'] },
      { name: 'castle_owner_fid_key', constraint: 'unique', columns: ['ownerFid'] },
      { name: 'castle_tile_key_key', constraint: 'unique', columns: ['tileKey'] },
    ],
  }, CastleRow),
  // The public world projection intentionally includes only site geometry and
  // occupancy timing. The scheduler is not a player table: it exposes no
  // useful visual state and must never be pulled into the browser surface.
  goldNodeOccupationV1: __table({
    name: 'gold_node_occupation_v1',
    indexes: [
      { accessor: 'byOriginCastle', name: 'gold_node_occupation_v1_origin_castle_id_idx_btree', algorithm: 'btree', columns: [
        'originCastleId',
      ] },
      { accessor: 'siteId', name: 'gold_node_occupation_v1_site_id_idx_btree', algorithm: 'btree', columns: [
        'siteId',
      ] },
    ],
    constraints: [
      { name: 'gold_node_occupation_v1_site_id_key', constraint: 'unique', columns: ['siteId'] },
    ],
  }, GoldNodeOccupationV1Row),
  goldSiteV1: __table({
    name: 'gold_site_v1',
    indexes: [
      { accessor: 'siteId', name: 'gold_site_v1_site_id_idx_btree', algorithm: 'btree', columns: [
        'siteId',
      ] },
    ],
    constraints: [
      { name: 'gold_site_v1_site_id_key', constraint: 'unique', columns: ['siteId'] },
    ],
  }, GoldSiteV1Row),
  playerV2: __table({
    name: 'player_v2',
    indexes: [
      { accessor: 'fid', name: 'player_v2_fid_idx_btree', algorithm: 'btree', columns: [
        'fid',
      ] },
    ],
    constraints: [
      { name: 'player_v2_fid_key', constraint: 'unique', columns: ['fid'] },
    ],
  }, PlayerV2Row),
  realmProfileV1: __table({
    name: 'realm_profile_v1',
    indexes: [
      { accessor: 'fid', name: 'realm_profile_v1_fid_idx_btree', algorithm: 'btree', columns: [
        'fid',
      ] },
    ],
    constraints: [
      { name: 'realm_profile_v1_fid_key', constraint: 'unique', columns: ['fid'] },
    ],
  }, RealmProfileV1Row),
  realmV1: __table({
    name: 'realm_v1',
    indexes: [
      { accessor: 'realmId', name: 'realm_v1_realm_id_idx_btree', algorithm: 'btree', columns: [
        'realmId',
      ] },
    ],
    constraints: [
      { name: 'realm_v1_realm_id_key', constraint: 'unique', columns: ['realmId'] },
    ],
  }, RealmV1Row),
  worldTile: __table({
    name: 'world_tile',
    indexes: [
      { accessor: 'key', name: 'world_tile_key_idx_btree', algorithm: 'btree', columns: [
        'key',
      ] },
    ],
    constraints: [
      { name: 'world_tile_key_key', constraint: 'unique', columns: ['key'] },
    ],
  }, WorldTileRow),
  worldTileMetaV1: __table({
    name: 'world_tile_meta_v1',
    indexes: [
      { accessor: 'realmId', name: 'world_tile_meta_v1_realm_id_idx_btree', algorithm: 'btree', columns: [
        'realmId',
      ] },
      { accessor: 'byRealmAndRing', name: 'world_tile_meta_v1_realm_id_ring_idx_btree', algorithm: 'btree', columns: [
        'realmId',
        'ring',
      ] },
      { accessor: 'tileKey', name: 'world_tile_meta_v1_tile_key_idx_btree', algorithm: 'btree', columns: [
        'tileKey',
      ] },
    ],
    constraints: [
      { name: 'world_tile_meta_v1_tile_key_key', constraint: 'unique', columns: ['tileKey'] },
    ],
  }, WorldTileMetaV1Row),
})

const reducersSchema = __reducers(
  __reducerSchema('accept_alpha_terms_v1', AcceptAlphaTermsV1Reducer),
  __reducerSchema('bootstrap_player_v2', BootstrapPlayerV2Reducer),
  __reducerSchema('collect_gold_expedition_v1', CollectGoldExpeditionV1Reducer),
  __reducerSchema('collect_resources_v1', CollectResourcesV1Reducer),
  __reducerSchema('dispatch_gold_expedition_v1', DispatchGoldExpeditionV1Reducer),
)

const proceduresSchema = __procedures(
  __procedureSchema(
    'get_alpha_backend_info',
    GetAlphaBackendInfoProcedure.params,
    GetAlphaBackendInfoProcedure.returnType,
  ),
  __procedureSchema(
    'get_my_admission_status_v2',
    GetMyAdmissionStatusV2Procedure.params,
    GetMyAdmissionStatusV2Procedure.returnType,
  ),
  __procedureSchema(
    'get_my_gold_expedition_state_v1',
    GetMyGoldExpeditionStateV1Procedure.params,
    GetMyGoldExpeditionStateV1Procedure.returnType,
  ),
  __procedureSchema(
    'get_my_resource_state_v1',
    GetMyResourceStateV1Procedure.params,
    GetMyResourceStateV1Procedure.returnType,
  ),
)

const PLAYER_REMOTE_MODULE = {
  versionInfo: {
    cliVersion: '2.6.1' as const,
  },
  tables: tablesSchema.schemaType.tables,
  reducers: reducersSchema.reducersType.reducers,
  ...proceduresSchema,
} satisfies __RemoteModule<
  typeof tablesSchema.schemaType,
  typeof reducersSchema.reducersType,
  typeof proceduresSchema
>

/** The player-visible tables, with the exact generated source and schema names. */
export const tables: __QueryBuilder<typeof tablesSchema.schemaType> = __makeQueryBuilder(
  tablesSchema.schemaType,
)

export type EventContext = __EventContextInterface<typeof PLAYER_REMOTE_MODULE>
export type SubscriptionHandle = __SubscriptionHandleImpl<typeof PLAYER_REMOTE_MODULE>

class SubscriptionBuilder extends __SubscriptionBuilderImpl<typeof PLAYER_REMOTE_MODULE> {}

class DbConnectionBuilder extends __DbConnectionBuilder<DbConnection> {}

/** Typed browser connection constrained to the public player runtime surface. */
export class DbConnection extends __DbConnectionImpl<typeof PLAYER_REMOTE_MODULE> {
  static builder = (): DbConnectionBuilder => new DbConnectionBuilder(
    PLAYER_REMOTE_MODULE,
    (config: __DbConnectionConfig<typeof PLAYER_REMOTE_MODULE>) => new DbConnection(config),
  )

  override subscriptionBuilder = (): SubscriptionBuilder => new SubscriptionBuilder(this)
}

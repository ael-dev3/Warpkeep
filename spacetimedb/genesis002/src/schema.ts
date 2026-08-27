import { schema } from 'spacetimedb/server';

import {
  accessRequestV1,
  adminAudit,
  allowedFid,
  alphaTermsAcceptanceV1,
  castle,
  greaterRealmActivationV1,
  greaterRealmCastleClaimV1,
  greaterRealmCastleSlotV1,
  greaterRealmCellOccupancyV1,
  greaterRealmCellV1,
  greaterRealmChunkV1,
  greaterRealmNavigationComponentV1,
  greaterRealmReleaseV1,
  greaterRealmResourceNodeV1,
  markAccountV1,
  player,
  playerOwnershipV2,
  playerV2,
  realmAtlasV1,
  realmAtlasVisibleRegionV1,
  realmProfileV1,
  realmWorkerSystemV2,
  resourceAccountV1,
} from '../../src/schema';

type TableDefinition = {
  tableAccess: { tag: string };
  [key: string]: unknown;
};

type RewritableTableSchema = {
  tableDef: (context: unknown, accessorName: string) => TableDefinition;
  [key: string]: unknown;
};

/**
 * Preserve the reviewed row/index/constraint descriptor while overriding the
 * only HTTP SQL/subscription visibility bit. Anonymous SQL bypasses lifecycle
 * reducers, so inheriting a G001 public descriptor is never safe here.
 */
function makeGenesis002PrivateTable<const T>(source: T): T {
  const table = source as unknown as RewritableTableSchema;
  const originalTableDefinition = table.tableDef;
  return Object.freeze({
    ...table,
    tableDef: (context: unknown, accessorName: string): TableDefinition => ({
      ...originalTableDefinition(context, accessorName),
      tableAccess: { tag: 'Private' },
    }),
  }) as unknown as T;
}

/**
 * A fresh, intentionally minimal database schema. The imported table objects
 * preserve the reviewed v17/v18 atlas row contracts, but Genesis 001's module
 * root and its gameplay/scheduler reducers are never registered here.
 */
const genesis002Tables = {
  // Zero-population guard graph.
  allowedFid: makeGenesis002PrivateTable(allowedFid),
  accessRequestV1: makeGenesis002PrivateTable(accessRequestV1),
  player: makeGenesis002PrivateTable(player),
  playerV2: makeGenesis002PrivateTable(playerV2),
  playerOwnershipV2: makeGenesis002PrivateTable(playerOwnershipV2),
  castle: makeGenesis002PrivateTable(castle),
  realmProfileV1: makeGenesis002PrivateTable(realmProfileV1),
  alphaTermsAcceptanceV1: makeGenesis002PrivateTable(alphaTermsAcceptanceV1),
  markAccountV1: makeGenesis002PrivateTable(markAccountV1),
  resourceAccountV1: makeGenesis002PrivateTable(resourceAccountV1),

  // Private operator audit plus the exact v17/v18 atlas authority graph.
  adminAudit: makeGenesis002PrivateTable(adminAudit),
  greaterRealmReleaseV1: makeGenesis002PrivateTable(greaterRealmReleaseV1),
  greaterRealmChunkV1: makeGenesis002PrivateTable(greaterRealmChunkV1),
  greaterRealmNavigationComponentV1:
    makeGenesis002PrivateTable(greaterRealmNavigationComponentV1),
  greaterRealmCellV1: makeGenesis002PrivateTable(greaterRealmCellV1),
  greaterRealmCastleSlotV1: makeGenesis002PrivateTable(greaterRealmCastleSlotV1),
  greaterRealmCastleClaimV1: makeGenesis002PrivateTable(greaterRealmCastleClaimV1),
  greaterRealmCellOccupancyV1:
    makeGenesis002PrivateTable(greaterRealmCellOccupancyV1),
  greaterRealmResourceNodeV1:
    makeGenesis002PrivateTable(greaterRealmResourceNodeV1),
  greaterRealmActivationV1: makeGenesis002PrivateTable(greaterRealmActivationV1),
  realmAtlasV1: makeGenesis002PrivateTable(realmAtlasV1),
  realmAtlasVisibleRegionV1:
    makeGenesis002PrivateTable(realmAtlasVisibleRegionV1),
  realmWorkerSystemV2: makeGenesis002PrivateTable(realmWorkerSystemV2),
} as const;

export const GENESIS_002_PRIVATE_TABLE_COUNT = 23 as const;
if (Object.keys(genesis002Tables).length !== GENESIS_002_PRIVATE_TABLE_COUNT) {
  throw new Error('GENESIS_002_PRIVATE_TABLE_SET_INVALID');
}

const genesis002 = schema(genesis002Tables);

export default genesis002;

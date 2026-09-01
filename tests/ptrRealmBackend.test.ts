// @vitest-environment node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'vitest';

import {
  PTR_ADMIN_PROCEDURES,
  PTR_ADMIN_REDUCERS,
  PTR_ATLAS_ID,
  PTR_ATLAS_POLICY,
  PTR_AUDIENCE,
  PTR_DATABASE_ALIAS,
  PTR_MODULE_IDENTITY,
  PTR_OWNER_PROCEDURES,
  PTR_OWNER_ROLE,
  PTR_REALM_ID,
  PTR_RELEASE_VERSION,
  PTR_STATUS,
} from '../spacetimedb/ptr/src/contract';
import {
  assertPtrAtlasNotFinalized,
  assertPtrPopulationEmpty,
  requirePtrAtlasTarget,
  withPtrAtlasImportBoundary,
  type PtrPopulationSnapshot,
} from '../spacetimedb/ptr/src/policy';
import {
  PTR_PRIVATE_TABLE_ACCESSORS,
  assertPtrPrivateSchemaSurface,
} from '../spacetimedb/ptr/src/schemaContract';
import {
  finalizeGreaterRealmReleaseV1,
} from '../spacetimedb/ptr/src/atlasAuthority';
import {
  GREATER_REALM_PUBLIC_REGIONS,
  GREATER_REALM_UNASSIGNED_RANK,
} from '../spacetimedb/ptr/src/atlasPolicy';

const EMPTY_POPULATION: PtrPopulationSnapshot = Object.freeze({
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

function generatedSources(root: string): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name !== '.gitignore') {
        result[relative(root, path)] = readFileSync(path, 'utf8');
      }
    }
  };
  visit(root);
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => (
    left.localeCompare(right)
  )));
}

test('PTR schema is exactly G002 private atlas storage plus one owner anchor', () => {
  assert.deepEqual(PTR_PRIVATE_TABLE_ACCESSORS, [
    'allowedFid',
    'accessRequestV1',
    'player',
    'playerV2',
    'playerOwnershipV2',
    'castle',
    'realmProfileV1',
    'alphaTermsAcceptanceV1',
    'markAccountV1',
    'resourceAccountV1',
    'adminAudit',
    'greaterRealmReleaseV1',
    'greaterRealmChunkV1',
    'greaterRealmNavigationComponentV1',
    'greaterRealmCellV1',
    'greaterRealmCastleSlotV1',
    'greaterRealmCastleClaimV1',
    'greaterRealmCellOccupancyV1',
    'greaterRealmResourceNodeV1',
    'greaterRealmActivationV1',
    'realmAtlasV1',
    'realmAtlasVisibleRegionV1',
    'realmWorkerSystemV2',
    'ptrOwnerAnchorV1',
  ]);
  assert.doesNotThrow(() => assertPtrPrivateSchemaSurface(
    PTR_PRIVATE_TABLE_ACCESSORS,
  ));
  assert.throws(
    () => assertPtrPrivateSchemaSurface([
      ...PTR_PRIVATE_TABLE_ACCESSORS,
      'realmChatMessageV1',
    ]),
    /PTR_PRIVATE_TABLE_SET_INVALID/u,
  );
  assert.throws(
    () => assertPtrPrivateSchemaSurface(
      PTR_PRIVATE_TABLE_ACCESSORS.filter(name => name !== 'ptrOwnerAnchorV1'),
    ),
    /PTR_PRIVATE_TABLE_SET_INVALID/u,
  );
});

test('PTR has an exact isolated owner-view identity and no admission surface', () => {
  assert.equal(PTR_REALM_ID, 'PTR');
  assert.equal(PTR_RELEASE_VERSION, '0.4.0-ptr.1');
  assert.equal(PTR_DATABASE_ALIAS, 'warpkeep-ptr');
  assert.equal(PTR_MODULE_IDENTITY, 'warpkeep-ptr-owner-view-v1');
  assert.equal(PTR_ATLAS_ID, 'PTR_GREATER_REALM');
  assert.equal(PTR_AUDIENCE, 'warpkeep-ptr-spacetimedb');
  assert.equal(PTR_OWNER_ROLE, 'warpkeep-ptr-owner');
  assert.deepEqual(PTR_STATUS, {
    realmId: 'PTR',
    releaseVersion: '0.4.0-ptr.1',
    databaseAlias: 'warpkeep-ptr',
    moduleIdentity: 'warpkeep-ptr-owner-view-v1',
    atlasId: 'PTR_GREATER_REALM',
    audience: 'warpkeep-ptr-spacetimedb',
    launchState: 'owner-only',
    admissionsOpen: false,
    accessRequestsOpen: false,
  });
  assert.deepEqual(PTR_ATLAS_POLICY, {
    importMutationsEnabled: true,
    activationMutationsEnabled: false,
    ownerReadEnabled: true,
  });
});

test('PTR registers only the approved admin and owner procedure surface', () => {
  assert.deepEqual(PTR_ADMIN_PROCEDURES, [
    'admin_get_greater_realm_status_v1',
  ]);
  assert.deepEqual(PTR_ADMIN_REDUCERS, [
    'admin_stage_greater_realm_release_v1',
    'admin_import_greater_realm_components_v1',
    'admin_import_greater_realm_regions_v1',
    'admin_import_greater_realm_chunk_v1',
    'admin_begin_greater_realm_verification_v1',
    'admin_verify_greater_realm_batch_v1',
    'admin_finalize_greater_realm_release_v1',
    'admin_provision_ptr_owner_v1',
    'admin_suspend_ptr_owner_v1',
  ]);
  assert.deepEqual(PTR_OWNER_PROCEDURES, [
    'get_ptr_owner_status_v1',
    'get_realm_atlas_bootstrap_v1',
    'get_realm_atlas_window_v1',
    'get_realm_atlas_chunk_v1',
    'get_realm_atlas_resource_locations_v1',
    'plan_realm_route_v1',
  ]);
  const surface = JSON.stringify([
    ...PTR_ADMIN_PROCEDURES,
    ...PTR_ADMIN_REDUCERS,
    ...PTR_OWNER_PROCEDURES,
  ]);
  assert.doesNotMatch(
    surface,
    /access.request|admit|allow.fid|bootstrap.player|gameplay|scheduler|worker|chat|economy/iu,
  );
});

test('owner provisioning checks both signed bindings before every state access', () => {
  const source = readFileSync(
    join(process.cwd(), 'spacetimedb', 'ptr', 'src', 'ownerReducers.ts'),
    'utf8',
  );
  const start = source.indexOf('export const adminProvisionPtrOwnerV1');
  const end = source.indexOf('/** Disable the retained owner anchor', start);
  const reducer = source.slice(start, end);
  const requireAdmin = reducer.indexOf('const admin = requirePtrAdmin(ctx);');
  const requireBinding = reducer.indexOf(
    'requirePtrOwnerProvisionBinding(admin, ownerFid, authEpoch);',
  );
  const populationRead = reducer.indexOf('requirePtrPopulationEmpty(ctx);');
  const atlasRead = reducer.indexOf(
    'inspectGreaterRealmV17(sharedGreaterRealmContext(ctx))',
  );
  const atlasReady = reducer.indexOf('!atlas.ready || !atlas.importsExact');
  const anchorRead = reducer.indexOf('ctx.db.ptrOwnerAnchorV1.singletonKey.find(');
  const anchorCount = reducer.indexOf('ctx.db.ptrOwnerAnchorV1.count()');
  const anchorWrite = reducer.indexOf('ctx.db.ptrOwnerAnchorV1.insert({');
  const auditWrite = reducer.indexOf('audit(ctx, admin.subject');
  assert.ok(start >= 0 && end > start);
  assert.ok(requireAdmin >= 0);
  assert.ok(requireBinding > requireAdmin);
  for (const stateAccess of [
    populationRead,
    atlasRead,
    atlasReady,
    anchorRead,
    anchorCount,
    anchorWrite,
    auditWrite,
  ]) assert.ok(stateAccess > requireBinding);
  assert.ok(atlasRead < anchorRead);
  assert.ok(atlasReady > atlasRead && atlasReady < anchorRead);
});

test('atlas reducers use only ownerless authority and expose no owner values', () => {
  const atlas = readFileSync(
    join(process.cwd(), 'spacetimedb', 'ptr', 'src', 'atlasImportReducers.ts'),
    'utf8',
  );
  const owner = readFileSync(
    join(process.cwd(), 'spacetimedb', 'ptr', 'src', 'ownerReducers.ts'),
    'utf8',
  );
  assert.match(atlas, /requirePtrAtlasAdmin/u);
  assert.doesNotMatch(atlas, /requirePtrAdmin/u);
  assert.doesNotMatch(atlas, /ownerFid|ownerAuthEpoch/u);
  assert.match(owner, /requirePtrAdmin/u);
  assert.doesNotMatch(owner, /requirePtrAtlasAdmin/u);
});

test('every atlas reducer effect is enclosed by exact zero-owner checks', () => {
  const source = readFileSync(
    join(process.cwd(), 'spacetimedb', 'ptr', 'src', 'atlasImportReducers.ts'),
    'utf8',
  );
  const boundaryStart = source.indexOf('function importBoundary<T>');
  const boundaryEnd = source.indexOf('/** Exact administrator status', boundaryStart);
  const boundary = source.slice(boundaryStart, boundaryEnd);
  const before = boundary.indexOf('requirePtrOwnerAnchorEmpty(ctx);');
  const effect = boundary.indexOf('const result = effect();');
  const after = boundary.indexOf('requirePtrOwnerAnchorEmpty(ctx);', effect);
  assert.ok(before >= 0 && effect > before && after > effect);
  assert.match(
    source,
    /function requirePtrOwnerAnchorEmpty[\s\S]*ptrOwnerAnchorV1\.count\(\) !== 0n/u,
  );
  assert.equal(source.match(/importBoundary\(ctx, \(\) => \{/gu)?.length, 7);
});

test('generated public PTR bindings expose no tables and only the approved calls', async () => {
  const modulePath = join(process.cwd(), 'spacetimedb', 'ptr');
  const checkedInPath = join(modulePath, 'generated-bindings');
  const generatedPath = mkdtempSync(join(tmpdir(), 'warpkeep-ptr-bindings-'));
  try {
    execFileSync('spacetime', [
      'generate',
      '--lang', 'typescript',
      '--out-dir', generatedPath,
      '--module-path', modulePath,
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: 'pipe',
    });
    assert.deepEqual(
      generatedSources(checkedInPath),
      generatedSources(generatedPath),
      'checked-in PTR bindings must exactly match the just-built module',
    );

    const generated = await import('../spacetimedb/ptr/generated-bindings/index');
    assert.deepEqual(Object.keys(generated.tables).sort(), []);
    assert.deepEqual(Object.keys(generated.reducers).sort(), [
      'adminBeginGreaterRealmVerificationV1',
      'adminFinalizeGreaterRealmReleaseV1',
      'adminImportGreaterRealmChunkV1',
      'adminImportGreaterRealmComponentsV1',
      'adminImportGreaterRealmRegionsV1',
      'adminProvisionPtrOwnerV1',
      'adminStageGreaterRealmReleaseV1',
      'adminSuspendPtrOwnerV1',
      'adminVerifyGreaterRealmBatchV1',
    ]);
    assert.deepEqual(Object.keys(generated.procedures).sort(), [
      'adminGetGreaterRealmStatusV1',
      'getPtrOwnerStatusV1',
      'getRealmAtlasBootstrapV1',
      'getRealmAtlasChunkV1',
      'getRealmAtlasResourceLocationsV1',
      'getRealmAtlasWindowV1',
      'planRealmRouteV1',
    ]);
  } finally {
    rmSync(generatedPath, { recursive: true, force: true });
  }
});

test('generated atlas writer ABI binds every phase to the PTR release target', async () => {
  const writers = await Promise.all([
    import('../spacetimedb/ptr/generated-bindings/admin_stage_greater_realm_release_v_1_reducer'),
    import('../spacetimedb/ptr/generated-bindings/admin_import_greater_realm_components_v_1_reducer'),
    import('../spacetimedb/ptr/generated-bindings/admin_import_greater_realm_regions_v_1_reducer'),
    import('../spacetimedb/ptr/generated-bindings/admin_import_greater_realm_chunk_v_1_reducer'),
    import('../spacetimedb/ptr/generated-bindings/admin_begin_greater_realm_verification_v_1_reducer'),
    import('../spacetimedb/ptr/generated-bindings/admin_verify_greater_realm_batch_v_1_reducer'),
    import('../spacetimedb/ptr/generated-bindings/admin_finalize_greater_realm_release_v_1_reducer'),
  ]);
  for (const writer of writers) {
    assert.deepEqual(Object.keys(writer.default).slice(0, 3), [
      'ptrReleaseVersion',
      'ptrModuleIdentity',
      'atlasId',
    ]);
  }
});

test('compiled PTR payload contains no shared production graph or forbidden policy family', () => {
  const modulePath = join(process.cwd(), 'spacetimedb', 'ptr');
  execFileSync('spacetime', ['build', '--module-path', modulePath], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const bundle = readFileSync(join(modulePath, 'dist', 'bundle.js'), 'utf8');
  const sourceSections = [...bundle.matchAll(
    /^\/\/#region (.+)$/gmu,
  )].map(match => match[1]);
  assert.deepEqual(sourceSections, [
    '../node_modules/.pnpm/headers-polyfill@4.0.3/node_modules/headers-polyfill/lib/index.mjs',
    '../node_modules/.pnpm/spacetimedb@2.6.1/node_modules/spacetimedb/dist/server/index.mjs',
    'src/schemaContract.ts',
    'src/schema.ts',
    'src/contract.ts',
    'src/ownerPolicy.ts',
    'src/auth.ts',
    'src/policy.ts',
    'src/context.ts',
    'src/lifecycle.ts',
    'src/atlasPolicy.ts',
    'src/sha256.ts',
    'src/atlasAuthority.ts',
    'src/atlasImportReducers.ts',
    'src/ownerReducers.ts',
    'src/atlasReadPolicy.ts',
    'src/atlasReadReducers.ts',
    'src/index.ts',
  ]);

  for (const forbidden of [
    /\b(?:inner_keep|economy|gameplay)\b/iu,
    /CANONICAL_INNER_KEEP/iu,
    /BUILDING_POLICIES/iu,
    /INNER_KEEP_(?:LAYOUT|POLICY|PLACEMENT|DISCOUNT|RESOURCE)/iu,
    /CANONICAL_TIER_I_(?:FOOD|GOLD|STONE|WOOD)_SITES/iu,
    /GENESIS_WATER_REVISION/iu,
    /PRODUCTION_PLAYER_CANARY/iu,
    /(?:FOOD|GOLD|STONE|WOOD)_EXPEDITION_POLICY/iu,
  ]) assert.doesNotMatch(bundle, forbidden);
});

test('PTR atlas writes require a wholly empty gameplay population before and after', () => {
  assert.doesNotThrow(() => assertPtrPopulationEmpty(EMPTY_POPULATION));
  for (const field of Object.keys(EMPTY_POPULATION) as Array<keyof typeof EMPTY_POPULATION>) {
    assert.throws(
      () => assertPtrPopulationEmpty({ ...EMPTY_POPULATION, [field]: 1n }),
      /PTR_POPULATION_NOT_EMPTY/u,
      `${field} must close the PTR import boundary`,
    );
  }

  let snapshot = EMPTY_POPULATION;
  let effects = 0;
  assert.equal(withPtrAtlasImportBoundary(
    () => snapshot,
    () => {
      effects += 1;
      return 'ok' as const;
    },
  ), 'ok');
  snapshot = { ...EMPTY_POPULATION, castles: 1n };
  assert.throws(() => withPtrAtlasImportBoundary(
    () => snapshot,
    () => {
      effects += 1;
      return 'unreachable';
    },
  ), /PTR_POPULATION_NOT_EMPTY/u);
  assert.equal(effects, 1);
});

test('finalization permanently closes every PTR atlas writer', () => {
  assert.doesNotThrow(() => assertPtrAtlasNotFinalized(false));
  assert.throws(() => assertPtrAtlasNotFinalized(true), /PTR_ATLAS_FINALIZED/u);
});

test('PTR finalization seals the release without allocating or mutating castle slots', () => {
  const regions = GREATER_REALM_PUBLIC_REGIONS.map(region => ({
    regionId: region.id,
    publicName: region.name,
    ordinal: region.ordinal,
    tier: 1,
    cellCount: 1,
    passableCellCount: 1,
    chunkCount: 1,
    castleCapacity: 100,
    resourceLocationCount: 2_000,
    resourceNodeCount: 2_000,
    foodNodeCount: 500,
    woodNodeCount: 500,
    stoneNodeCount: 500,
    goldNodeCount: 500,
    active: false,
  }));
  const verifiedRegions = regions.map(region => ({
    regionId: region.regionId,
    verifiedCellCount: region.cellCount,
    verifiedPassableCellCount: region.passableCellCount,
    verifiedChunkCount: region.chunkCount,
    verifiedCastleCapacity: region.castleCapacity,
    verifiedResourceLocationCount: region.resourceLocationCount,
    verifiedResourceNodeCount: region.resourceNodeCount,
    verifiedFoodNodeCount: region.foodNodeCount,
    verifiedWoodNodeCount: region.woodNodeCount,
    verifiedStoneNodeCount: region.stoneNodeCount,
    verifiedGoldNodeCount: region.goldNodeCount,
  }));
  const slots = regions.flatMap(region => Array.from({ length: 100 }, (_, index) => ({
    slotId: `SLOT:${region.regionId}:${index}`,
    releaseOrdinal: region.ordinal * 100 + index,
    atlasId: 'PTR_GREATER_REALM',
    cellKey: `${region.regionId}:${index}:0`,
    regionId: region.regionId,
    componentKey: `GRC-${'A'.repeat(26)}`,
    ...(region.regionId === 'T1_LOWLANDS' ? { legacySlotId: index + 1 } : {}),
    tier: 1,
    regionOrderRank: GREATER_REALM_UNASSIGNED_RANK,
    allocationRank: GREATER_REALM_UNASSIGNED_RANK,
    active: false,
  })));
  const slotsBeforeFinalization = slots.map(slot => ({ ...slot }));
  let release: Record<string, unknown> = {
    atlasId: 'PTR_GREATER_REALM',
    publicReleaseId: `GRR-${'A'.repeat(26)}`,
    importEpoch: 1n,
    state: 'verifying',
    publicApprovalReceiptId: 'PTR-APPROVAL-1',
    sourceCommit: 'a'.repeat(40),
    generatorVersion: 'generator-v1',
    sourceFormatVersion: 'source-v1',
    livingWorldVersion: 'living-world-v1',
    runtimePartitionVersion: 'axial-bin-15-tier-one-filter-v1',
    rendererContractVersion: 'greater-realm-renderer-v2',
    expectedReleaseSha256: 'a'.repeat(64),
    verificationDigest: 'b'.repeat(64),
    verificationPhase: 'complete',
    expectedRegionCount: 6,
    expectedComponentCount: 1,
    verifiedComponentCount: 1,
    expectedChunkCount: 6,
    verifiedChunkCount: 6,
    expectedCellCount: 6,
    verifiedCellCount: 6,
    expectedSlotCount: 600,
    verifiedSlotCount: 600,
    expectedResourceNodeCount: 12_000,
    verifiedResourceNodeCount: 12_000,
    regionManifestJson: `${JSON.stringify(regions)}\n`,
    regionVerificationJson: `${JSON.stringify(verifiedRegions)}\n`,
    legacyTransformOffsetQ: 0,
    legacyTransformOffsetR: 0,
  };
  const context = {
    timestamp: { microsSinceUnixEpoch: 2n },
    db: {
      greaterRealmReleaseV1: {
        atlasId: {
          find: () => release,
          update: (next: Record<string, unknown>) => { release = next; },
        },
      },
      greaterRealmCastleSlotV1: {
        iter: () => slots.values(),
        slotId: {
          update: (next: typeof slots[number]) => {
            const index = slots.findIndex(slot => slot.slotId === next.slotId);
            assert.notEqual(index, -1);
            slots[index] = next;
          },
        },
      },
      greaterRealmCellV1: {
        cellKey: {
          find: (cellKey: string) => cellKey.startsWith('T1_LOWLANDS:')
            ? { regionId: 'T1_LOWLANDS' }
            : null,
        },
      },
      realmAtlasV1: { count: () => 0n },
      realmAtlasVisibleRegionV1: { count: () => 0n },
      realmWorkerSystemV2: { count: () => 0n },
    },
  };
  const finalize = finalizeGreaterRealmReleaseV1 as unknown as (
    context: unknown,
    input: unknown,
  ) => void;
  const finalizeInput = {
    atlasId: 'PTR_GREATER_REALM',
    importEpoch: 1n,
    publicApprovalReceiptId: 'PTR-APPROVAL-1',
    expectedReleaseSha256: 'a'.repeat(64),
    expectedVerificationDigest: 'b'.repeat(64),
    publicName: 'PTR Greater Realm',
  };
  assert.throws(
    () => finalize(context, finalizeInput),
    /GREATER_REALM_RENDERER_VERSION_INVALID/u,
  );
  assert.equal(release.state, 'verifying');
  release = {
    ...release,
    rendererContractVersion: 'greater-realm-renderer-v1',
  };
  finalize(context, finalizeInput);

  assert.equal(slots.length, slotsBeforeFinalization.length);
  for (let index = 0; index < slots.length; index += 1) {
    assert.deepEqual(
      slots[index],
      slotsBeforeFinalization[index],
      `${slots[index]!.slotId} must remain unchanged`,
    );
  }
  assert.equal(release.state, 'ready');
  assert.deepEqual(release.readyAt, context.timestamp);
});

test('every import phase binds the exact PTR atlas, release, and module identity', () => {
  assert.deepEqual(requirePtrAtlasTarget({
    atlasId: 'PTR_GREATER_REALM',
    ptrReleaseVersion: '0.4.0-ptr.1',
    ptrModuleIdentity: 'warpkeep-ptr-owner-view-v1',
  }), {
    atlasId: 'PTR_GREATER_REALM',
    ptrReleaseVersion: '0.4.0-ptr.1',
    ptrModuleIdentity: 'warpkeep-ptr-owner-view-v1',
  });
  for (const target of [
    {
      atlasId: 'GENESIS_002_GREATER_REALM',
      ptrReleaseVersion: '0.4.0-ptr.1',
      ptrModuleIdentity: 'warpkeep-ptr-owner-view-v1',
    },
    {
      atlasId: 'PTR_GREATER_REALM',
      ptrReleaseVersion: '0.4.0',
      ptrModuleIdentity: 'warpkeep-ptr-owner-view-v1',
    },
    {
      atlasId: 'PTR_GREATER_REALM',
      ptrReleaseVersion: '0.4.0-ptr.1',
      ptrModuleIdentity: 'warpkeep-genesis-002-sealed-v1',
    },
  ]) assert.throws(() => requirePtrAtlasTarget(target), /PTR_ATLAS_TARGET_INVALID/u);
});

import { createHash } from 'node:crypto';

export const GENESIS_002_SEALED_LIVE_TARGET = Object.freeze({
  uri: 'https://maincloud.spacetimedb.com',
  bridge: 'https://auth.warpkeep.com',
  databaseAlias: 'warpkeep-genesis-002',
  moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
  genesis001DatabaseIdentity:
    'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
});

export const GENESIS_002_SEALED_LIVE_PROFILE =
  'warpkeep-genesis-002-sealed-live-v1';

const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const PUBLIC_RELEASE_ID = /^GRR-[A-Z2-7]{26}$/u;
const PUBLIC_APPROVAL_ID = /^GRA-[A-Z2-7]{26}$/u;
const OPERATOR_ARGUMENTS = Object.freeze({
  'database-identity': SHA256,
  'module-source-commit': COMMIT,
  'module-sha256': SHA256,
  'atlas-source-commit': COMMIT,
  'public-release-id': PUBLIC_RELEASE_ID,
  'public-approval-receipt-id': PUBLIC_APPROVAL_ID,
  'release-sha256': SHA256,
  'release-header-sha256': SHA256,
  'verification-digest': SHA256,
});

const REALM_STATUS_KEYS = Object.freeze([
  'realmId',
  'databaseName',
  'moduleIdentity',
  'releaseVersion',
  'launchState',
  'admissionsOpen',
  'accessRequestsOpen',
  'admittedPlayers',
  'founders',
  'allowedFids',
  'accessRequests',
  'playersV1',
  'playersV2',
  'ownershipBindings',
  'castles',
  'realmProfiles',
  'termsAcceptances',
  'markAccounts',
  'resourceAccounts',
  'castleClaims',
  'cellOccupancies',
  'activationRows',
  'workerSystemRows',
  'atlasImportMutationsEnabled',
  'atlasActivationMutationsEnabled',
  'playerPresentationEnabled',
  'atlasPresent',
  'atlasId',
  'publicReleaseId',
  'atlasState',
  'atlasReady',
  'atlasCellRows',
  'atlasSlotRows',
  'atlasResourceRows',
]);

const ATLAS_STATUS_KEYS = Object.freeze([
  'present',
  'atlasId',
  'publicReleaseId',
  'publicApprovalReceiptId',
  'sourceCommit',
  'expectedReleaseSha256',
  'releaseHeaderSha256',
  'state',
  'importEpoch',
  'verificationPhase',
  'verificationCursor',
  'verificationDigest',
  'expectedRegionCount',
  'expectedComponentCount',
  'expectedChunkCount',
  'expectedCellCount',
  'expectedSlotCount',
  'expectedResourceNodeCount',
  'verifiedComponentCount',
  'verifiedChunkCount',
  'verifiedCellCount',
  'verifiedSlotCount',
  'verifiedResourceNodeCount',
  'componentExpectedCellCount',
  'componentExpectedSlotCount',
  'componentExpectedResourceNodeCount',
  'importedPassableCellCount',
  'regionManifestRows',
  'componentRows',
  'chunkRows',
  'cellRows',
  'slotRows',
  'resourceRows',
  'claimRows',
  'occupancyRows',
  'activationRows',
  'publicAtlasRows',
  'publicRegionRows',
  'workerSystemRows',
  'importsExact',
  'ready',
  'importMutationsCompiled',
  'activationMutationsCompiled',
]);

const ZERO_REALM_FIELDS = Object.freeze([
  'admittedPlayers',
  'founders',
  'allowedFids',
  'accessRequests',
  'playersV1',
  'playersV2',
  'ownershipBindings',
  'castles',
  'realmProfiles',
  'termsAcceptances',
  'markAccounts',
  'resourceAccounts',
  'castleClaims',
  'cellOccupancies',
  'activationRows',
  'workerSystemRows',
]);

export class Genesis002SealedLiveReceiptError extends Error {
  constructor(code) {
    super(code);
    this.name = 'Genesis002SealedLiveReceiptError';
    this.code = code;
  }
}

function fail(code) {
  throw new Genesis002SealedLiveReceiptError(code);
}

export function parseGenesis002SealedLiveArguments(values) {
  if (!Array.isArray(values)) fail('GENESIS_002_LIVE_ARGUMENT_INVALID');
  const parsed = new Map();
  for (const value of values) {
    const match = typeof value === 'string'
      ? /^--([a-z0-9-]+)=(.+)$/u.exec(value)
      : null;
    if (
      match === null
      || !(match[1] in OPERATOR_ARGUMENTS)
      || parsed.has(match[1])
      || !OPERATOR_ARGUMENTS[match[1]].test(match[2])
    ) fail('GENESIS_002_LIVE_ARGUMENT_INVALID');
    parsed.set(match[1], match[2]);
  }
  if (parsed.size !== Object.keys(OPERATOR_ARGUMENTS).length) {
    fail('GENESIS_002_LIVE_ARGUMENT_INVALID');
  }
  const databaseIdentity = parsed.get('database-identity');
  if (databaseIdentity === GENESIS_002_SEALED_LIVE_TARGET.genesis001DatabaseIdentity) {
    fail('GENESIS_002_LIVE_TARGET_COLLIDES_WITH_GENESIS_001');
  }
  return Object.freeze({
    databaseIdentity,
    moduleSourceCommit: parsed.get('module-source-commit'),
    moduleSha256: parsed.get('module-sha256'),
    atlasSourceCommit: parsed.get('atlas-source-commit'),
    publicReleaseId: parsed.get('public-release-id'),
    publicApprovalReceiptId: parsed.get('public-approval-receipt-id'),
    releaseSha256: parsed.get('release-sha256'),
    releaseHeaderSha256: parsed.get('release-header-sha256'),
    verificationDigest: parsed.get('verification-digest'),
  });
}

function exactRecord(value, keys, code) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(keys)
  ) fail(code);
  return value;
}

function requireU64(value, code) {
  if (typeof value !== 'bigint' || value < 0n || value > (1n << 64n) - 1n) {
    fail(code);
  }
  return value;
}

function requireU32(value, code) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) fail(code);
  return value;
}

function requireIdentityInput(input) {
  if (
    input === null
    || typeof input !== 'object'
    || Array.isArray(input)
    || !SHA256.test(input.databaseIdentity ?? '')
    || input.databaseIdentity === GENESIS_002_SEALED_LIVE_TARGET.genesis001DatabaseIdentity
    || !COMMIT.test(input.moduleSourceCommit ?? '')
    || !SHA256.test(input.moduleSha256 ?? '')
    || !COMMIT.test(input.atlasSourceCommit ?? '')
    || !PUBLIC_RELEASE_ID.test(input.publicReleaseId ?? '')
    || !PUBLIC_APPROVAL_ID.test(input.publicApprovalReceiptId ?? '')
    || !SHA256.test(input.releaseSha256 ?? '')
    || !SHA256.test(input.releaseHeaderSha256 ?? '')
    || !SHA256.test(input.verificationDigest ?? '')
  ) fail('GENESIS_002_LIVE_IDENTITY_INVALID');
}

function verifyRealmStatus(input, value) {
  const status = exactRecord(
    value,
    REALM_STATUS_KEYS,
    'GENESIS_002_LIVE_REALM_STATUS_SHAPE_CHANGED',
  );
  for (const field of ZERO_REALM_FIELDS) {
    if (requireU64(status[field], 'GENESIS_002_LIVE_REALM_STATUS_INVALID') !== 0n) {
      fail('GENESIS_002_LIVE_POPULATION_NOT_EMPTY');
    }
  }
  const cellRows = requireU64(status.atlasCellRows, 'GENESIS_002_LIVE_REALM_STATUS_INVALID');
  const slotRows = requireU64(status.atlasSlotRows, 'GENESIS_002_LIVE_REALM_STATUS_INVALID');
  const resourceRows = requireU64(status.atlasResourceRows, 'GENESIS_002_LIVE_REALM_STATUS_INVALID');
  if (
    status.realmId !== 'GENESIS_002'
    || status.databaseName !== GENESIS_002_SEALED_LIVE_TARGET.databaseAlias
    || status.moduleIdentity !== GENESIS_002_SEALED_LIVE_TARGET.moduleIdentity
    || status.releaseVersion !== '0.4.0'
    || status.launchState !== 'sealed'
    || status.admissionsOpen !== false
    || status.accessRequestsOpen !== false
    || status.atlasImportMutationsEnabled !== true
    || status.atlasActivationMutationsEnabled !== false
    || status.playerPresentationEnabled !== false
    || status.atlasPresent !== true
    || status.atlasId !== 'GENESIS_002_GREATER_REALM'
    || status.publicReleaseId !== input.publicReleaseId
    || status.atlasState !== 'ready'
    || status.atlasReady !== true
    || cellRows < 1n
    || slotRows !== 600n
    || resourceRows < 1n
  ) fail('GENESIS_002_LIVE_REALM_STATUS_INVALID');
  return status;
}

function verifyAtlasStatus(input, value) {
  const status = exactRecord(
    value,
    ATLAS_STATUS_KEYS,
    'GENESIS_002_LIVE_ATLAS_STATUS_SHAPE_CHANGED',
  );
  const importEpoch = requireU64(status.importEpoch, 'GENESIS_002_LIVE_ATLAS_STATUS_INVALID');
  const verificationCursor = requireU64(
    status.verificationCursor,
    'GENESIS_002_LIVE_ATLAS_STATUS_INVALID',
  );
  const u32Fields = [
    'expectedRegionCount',
    'expectedComponentCount',
    'expectedChunkCount',
    'expectedCellCount',
    'expectedSlotCount',
    'expectedResourceNodeCount',
    'verifiedComponentCount',
    'verifiedChunkCount',
    'verifiedCellCount',
    'verifiedSlotCount',
    'verifiedResourceNodeCount',
    'componentExpectedCellCount',
    'componentExpectedSlotCount',
    'componentExpectedResourceNodeCount',
    'importedPassableCellCount',
    'regionManifestRows',
  ];
  for (const field of u32Fields) {
    requireU32(status[field], 'GENESIS_002_LIVE_ATLAS_STATUS_INVALID');
  }
  const rowFields = [
    'componentRows',
    'chunkRows',
    'cellRows',
    'slotRows',
    'resourceRows',
    'claimRows',
    'occupancyRows',
    'activationRows',
    'publicAtlasRows',
    'publicRegionRows',
    'workerSystemRows',
  ];
  for (const field of rowFields) {
    requireU64(status[field], 'GENESIS_002_LIVE_ATLAS_STATUS_INVALID');
  }
  if (
    status.present !== true
    || status.atlasId !== 'GENESIS_002_GREATER_REALM'
    || status.publicReleaseId !== input.publicReleaseId
    || status.publicApprovalReceiptId !== input.publicApprovalReceiptId
    || status.sourceCommit !== input.atlasSourceCommit
    || status.expectedReleaseSha256 !== input.releaseSha256
    || status.releaseHeaderSha256 !== input.releaseHeaderSha256
    || status.state !== 'ready'
    || importEpoch < 1n
    || status.verificationPhase !== 'complete'
    || verificationCursor !== 0n
    || status.verificationDigest !== input.verificationDigest
    || status.expectedRegionCount !== 6
    || status.regionManifestRows !== status.expectedRegionCount
    || status.expectedComponentCount !== status.verifiedComponentCount
    || status.expectedChunkCount !== status.verifiedChunkCount
    || status.expectedCellCount !== status.verifiedCellCount
    || status.expectedSlotCount !== status.verifiedSlotCount
    || status.expectedResourceNodeCount !== status.verifiedResourceNodeCount
    || status.componentExpectedCellCount !== status.importedPassableCellCount
    || status.componentExpectedCellCount > status.expectedCellCount
    || status.componentExpectedSlotCount !== status.expectedSlotCount
    || status.componentExpectedResourceNodeCount !== status.expectedResourceNodeCount
    || BigInt(status.expectedComponentCount) !== status.componentRows
    || BigInt(status.expectedChunkCount) !== status.chunkRows
    || BigInt(status.expectedCellCount) !== status.cellRows
    || BigInt(status.expectedSlotCount) !== status.slotRows
    || BigInt(status.expectedResourceNodeCount) !== status.resourceRows
    || status.expectedSlotCount !== 600
    || status.claimRows !== 0n
    || status.occupancyRows !== 0n
    || status.activationRows !== 0n
    || status.publicAtlasRows !== 0n
    || status.publicRegionRows !== 0n
    || status.workerSystemRows !== 0n
    || status.importsExact !== true
    || status.ready !== true
    || status.importMutationsCompiled !== true
    || status.activationMutationsCompiled !== false
  ) fail('GENESIS_002_LIVE_ATLAS_STATUS_INVALID');
  return status;
}

/** Realm-side zero-population proof valid throughout absent/importing/ready atlas states. */
export function verifyGenesis002ImportRealmBoundary(input) {
  if (
    input === null
    || typeof input !== 'object'
    || Array.isArray(input)
    || (input.expectedPublicReleaseId !== undefined
      && !PUBLIC_RELEASE_ID.test(input.expectedPublicReleaseId))
  ) fail('GENESIS_002_IMPORT_REALM_BOUNDARY_INVALID');
  const status = exactRecord(
    input.realmStatusValue,
    REALM_STATUS_KEYS,
    'GENESIS_002_IMPORT_REALM_BOUNDARY_SHAPE_CHANGED',
  );
  for (const field of ZERO_REALM_FIELDS) {
    if (requireU64(status[field], 'GENESIS_002_IMPORT_REALM_BOUNDARY_INVALID') !== 0n) {
      fail('GENESIS_002_IMPORT_REALM_BOUNDARY_INVALID');
    }
  }
  const cellRows = requireU64(status.atlasCellRows, 'GENESIS_002_IMPORT_REALM_BOUNDARY_INVALID');
  const slotRows = requireU64(status.atlasSlotRows, 'GENESIS_002_IMPORT_REALM_BOUNDARY_INVALID');
  const resourceRows = requireU64(
    status.atlasResourceRows,
    'GENESIS_002_IMPORT_REALM_BOUNDARY_INVALID',
  );
  const present = status.atlasPresent === true;
  if (
    status.realmId !== 'GENESIS_002'
    || status.databaseName !== GENESIS_002_SEALED_LIVE_TARGET.databaseAlias
    || status.moduleIdentity !== GENESIS_002_SEALED_LIVE_TARGET.moduleIdentity
    || status.releaseVersion !== '0.4.0'
    || status.launchState !== 'sealed'
    || status.admissionsOpen !== false
    || status.accessRequestsOpen !== false
    || status.atlasImportMutationsEnabled !== true
    || status.atlasActivationMutationsEnabled !== false
    || status.playerPresentationEnabled !== false
    || !['absent', 'importing', 'verifying', 'ready'].includes(status.atlasState)
    || status.atlasReady !== (status.atlasState === 'ready')
    || present !== (status.atlasState !== 'absent')
    || (present && (
      status.atlasId !== 'GENESIS_002_GREATER_REALM'
      || status.publicReleaseId !== input.expectedPublicReleaseId
    ))
    || (!present && (
      status.atlasId !== undefined
      || status.publicReleaseId !== undefined
      || cellRows !== 0n
      || slotRows !== 0n
      || resourceRows !== 0n
    ))
  ) fail('GENESIS_002_IMPORT_REALM_BOUNDARY_INVALID');
  return Object.freeze({
    realmId: 'GENESIS_002',
    atlasState: status.atlasState,
    atlasPresent: present,
    atlasReady: status.atlasReady,
    atlasCellRows: cellRows,
    atlasSlotRows: slotRows,
    atlasResourceRows: resourceRows,
    zeroPopulationBoundary: true,
    activationMutationsEnabled: false,
    playerPresentationEnabled: false,
  });
}

function canonicalJson(value) {
  return `${JSON.stringify(value)}\n`;
}

export function verifyGenesis002SealedLiveStatus(input) {
  requireIdentityInput(input);
  const realm = verifyRealmStatus(input, input.realmStatusValue);
  const atlas = verifyAtlasStatus(input, input.atlasStatusValue);
  if (
    realm.atlasCellRows !== atlas.cellRows
    || realm.atlasSlotRows !== atlas.slotRows
    || realm.atlasResourceRows !== atlas.resourceRows
  ) fail('GENESIS_002_LIVE_STATUS_DISAGREEMENT');

  const receipt = Object.freeze({
    schemaVersion: 1,
    profile: GENESIS_002_SEALED_LIVE_PROFILE,
    uri: GENESIS_002_SEALED_LIVE_TARGET.uri,
    databaseIdentity: input.databaseIdentity,
    databaseAlias: GENESIS_002_SEALED_LIVE_TARGET.databaseAlias,
    moduleIdentity: GENESIS_002_SEALED_LIVE_TARGET.moduleIdentity,
    moduleSourceCommit: input.moduleSourceCommit,
    moduleSha256: input.moduleSha256,
    releaseVersion: '0.4.0',
    realmId: 'GENESIS_002',
    atlasSourceCommit: input.atlasSourceCommit,
    atlasId: 'GENESIS_002_GREATER_REALM',
    publicReleaseId: input.publicReleaseId,
    releaseSha256: input.releaseSha256,
    releaseHeaderSha256: input.releaseHeaderSha256,
    verificationDigest: input.verificationDigest,
    atlasState: 'ready',
    atlasFinalized: true,
    atlasImportsExact: true,
    atlasImportSurfaceCompiled: true,
    atlasWritesClosedByFinalization: true,
    admissionsOpen: false,
    accessRequestsOpen: false,
    admittedPlayers: 0,
    founders: 0,
    allowedFids: 0,
    accessRequests: 0,
    playersV1: 0,
    playersV2: 0,
    ownershipBindings: 0,
    castles: 0,
    realmProfiles: 0,
    termsAcceptances: 0,
    markAccounts: 0,
    resourceAccounts: 0,
    claimRows: 0,
    occupancyRows: 0,
    activationRows: 0,
    workerSystemRows: 0,
    activationMutationsEnabled: false,
    playerPresentationEnabled: false,
    admissionNotificationsEnabled: false,
  });
  return Object.freeze({
    receipt,
    receiptDigest: createHash('sha256')
      .update('warpkeep.genesis-002.sealed-live-receipt.v1\n')
      .update(canonicalJson(receipt))
      .digest('hex'),
  });
}

/** Exact pre-import postflight for a newly published, identity-bound G002. */
export function verifyGenesis002FreshPublishStatus(input) {
  if (
    input === null
    || typeof input !== 'object'
    || Array.isArray(input)
    || !SHA256.test(input.databaseIdentity ?? '')
    || input.databaseIdentity === GENESIS_002_SEALED_LIVE_TARGET.genesis001DatabaseIdentity
    || !COMMIT.test(input.moduleSourceCommit ?? '')
    || !SHA256.test(input.moduleSha256 ?? '')
  ) fail('GENESIS_002_FRESH_PUBLISH_IDENTITY_INVALID');
  const realm = exactRecord(
    input.realmStatusValue,
    REALM_STATUS_KEYS,
    'GENESIS_002_FRESH_PUBLISH_REALM_SHAPE_CHANGED',
  );
  const atlas = exactRecord(
    input.atlasStatusValue,
    ATLAS_STATUS_KEYS,
    'GENESIS_002_FRESH_PUBLISH_ATLAS_SHAPE_CHANGED',
  );
  for (const field of ZERO_REALM_FIELDS) {
    if (requireU64(realm[field], 'GENESIS_002_FRESH_PUBLISH_STATE_INVALID') !== 0n) {
      fail('GENESIS_002_FRESH_PUBLISH_STATE_INVALID');
    }
  }
  for (const field of ['atlasCellRows', 'atlasSlotRows', 'atlasResourceRows']) {
    if (requireU64(realm[field], 'GENESIS_002_FRESH_PUBLISH_STATE_INVALID') !== 0n) {
      fail('GENESIS_002_FRESH_PUBLISH_STATE_INVALID');
    }
  }
  for (const field of [
    'expectedRegionCount', 'expectedComponentCount', 'expectedChunkCount',
    'expectedCellCount', 'expectedSlotCount', 'expectedResourceNodeCount',
    'verifiedComponentCount', 'verifiedChunkCount', 'verifiedCellCount',
    'verifiedSlotCount', 'verifiedResourceNodeCount',
    'componentExpectedCellCount', 'componentExpectedSlotCount',
    'componentExpectedResourceNodeCount', 'importedPassableCellCount',
    'regionManifestRows',
  ]) {
    if (requireU32(atlas[field], 'GENESIS_002_FRESH_PUBLISH_STATE_INVALID') !== 0) {
      fail('GENESIS_002_FRESH_PUBLISH_STATE_INVALID');
    }
  }
  for (const field of [
    'verificationCursor', 'componentRows', 'chunkRows', 'cellRows', 'slotRows',
    'resourceRows', 'claimRows', 'occupancyRows', 'activationRows',
    'publicAtlasRows', 'publicRegionRows', 'workerSystemRows',
  ]) {
    if (requireU64(atlas[field], 'GENESIS_002_FRESH_PUBLISH_STATE_INVALID') !== 0n) {
      fail('GENESIS_002_FRESH_PUBLISH_STATE_INVALID');
    }
  }
  if (
    realm.realmId !== 'GENESIS_002'
    || realm.databaseName !== GENESIS_002_SEALED_LIVE_TARGET.databaseAlias
    || realm.moduleIdentity !== GENESIS_002_SEALED_LIVE_TARGET.moduleIdentity
    || realm.releaseVersion !== '0.4.0'
    || realm.launchState !== 'sealed'
    || realm.admissionsOpen !== false
    || realm.accessRequestsOpen !== false
    || realm.atlasImportMutationsEnabled !== true
    || realm.atlasActivationMutationsEnabled !== false
    || realm.playerPresentationEnabled !== false
    || realm.atlasPresent !== false
    || realm.atlasId !== undefined
    || realm.publicReleaseId !== undefined
    || realm.atlasState !== 'absent'
    || realm.atlasReady !== false
    || atlas.present !== false
    || atlas.atlasId !== undefined
    || atlas.publicReleaseId !== undefined
    || atlas.publicApprovalReceiptId !== undefined
    || atlas.sourceCommit !== undefined
    || atlas.expectedReleaseSha256 !== undefined
    || atlas.releaseHeaderSha256 !== undefined
    || atlas.state !== 'absent'
    || atlas.importEpoch !== undefined
    || atlas.verificationPhase !== 'components'
    || typeof atlas.verificationDigest !== 'string'
    || atlas.importsExact !== false
    || atlas.ready !== false
    || atlas.importMutationsCompiled !== true
    || atlas.activationMutationsCompiled !== false
  ) fail('GENESIS_002_FRESH_PUBLISH_STATE_INVALID');
  return Object.freeze({
    schemaVersion: 1,
    profile: 'warpkeep-genesis-002-fresh-publish-v1',
    uri: GENESIS_002_SEALED_LIVE_TARGET.uri,
    databaseIdentity: input.databaseIdentity,
    databaseAlias: GENESIS_002_SEALED_LIVE_TARGET.databaseAlias,
    moduleIdentity: GENESIS_002_SEALED_LIVE_TARGET.moduleIdentity,
    moduleSourceCommit: input.moduleSourceCommit,
    moduleSha256: input.moduleSha256,
    releaseVersion: '0.4.0',
    realmId: 'GENESIS_002',
    atlasPresent: false,
    zeroPopulationBoundary: true,
    admissionsOpen: false,
    accessRequestsOpen: false,
    activationMutationsEnabled: false,
    playerPresentationEnabled: false,
    admissionNotificationsEnabled: false,
  });
}

import { createHash } from 'node:crypto';

const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const PUBLIC_RELEASE_ID = /^GRR-[A-Z2-7]{26}$/u;
const U64_MAXIMUM = (1n << 64n) - 1n;
const MAXIMUM_IMPORT_OPERATIONS = 4_096;
const GENESIS_001_DATABASE_IDENTITY =
  'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const GENESIS_002_DATABASE_ALIAS = 'warpkeep-genesis-002';
const GENESIS_002_MODULE_IDENTITY = 'warpkeep-genesis-002-sealed-v1';
const GENESIS_002_ATLAS_ID = 'GENESIS_002_GREATER_REALM';

const PUBLISH_RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'databaseIdentity',
  'database',
  'moduleIdentity',
  'sourceCommit',
  'moduleSha256',
  'moduleTreeId',
  'dependencyClosureDigest',
  'spacetimeExecutableSha256',
  'spacetimeCliConfigSha256',
  'deleteData',
  'outcome',
  'freshStatusDigest',
  'playerAccessEnabled',
  'admissionMutationsEnabled',
  'atlasImportMutationsEnabled',
  'atlasActivationMutationsEnabled',
  'playerPresentationEnabled',
]);

const IMPORT_RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'outcome',
  'databaseIdentity',
  'moduleIdentity',
  'moduleSourceCommit',
  'moduleSha256',
  'moduleTreeId',
  'dependencyClosureDigest',
  'spacetimeExecutableSha256',
  'atlasId',
  'atlasSourceCommit',
  'publicReleaseId',
  'expectedReleaseSha256',
  'verificationDigest',
  'importEpoch',
  'operationsSubmitted',
  'operationChainDigest',
  'zeroPopulationBoundary',
  'activationMutationsEnabled',
  'playerPresentationEnabled',
  'atlasWritesClosedByFinalization',
]);

const SEALED_LIVE_RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'uri',
  'databaseIdentity',
  'databaseAlias',
  'moduleIdentity',
  'moduleSourceCommit',
  'moduleSha256',
  'releaseVersion',
  'realmId',
  'atlasSourceCommit',
  'atlasId',
  'publicReleaseId',
  'releaseSha256',
  'releaseHeaderSha256',
  'verificationDigest',
  'atlasState',
  'atlasFinalized',
  'atlasImportsExact',
  'atlasImportSurfaceCompiled',
  'atlasWritesClosedByFinalization',
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
  'claimRows',
  'occupancyRows',
  'activationRows',
  'workerSystemRows',
  'activationMutationsEnabled',
  'playerPresentationEnabled',
  'admissionNotificationsEnabled',
]);

export class Genesis002ActivationReceiptError extends Error {
  constructor(code) {
    super(code);
    this.name = 'Genesis002ActivationReceiptError';
    this.code = code;
  }
}

function fail(code) {
  throw new Genesis002ActivationReceiptError(code);
}

function exactDataRecord(value, keys, code) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).length !== keys.length
    || Reflect.ownKeys(value).some((key, index) => key !== keys[index])
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(
      descriptor => !('value' in descriptor) || descriptor.enumerable !== true,
    )
  ) fail(code);
  return Object.freeze(Object.fromEntries(keys.map(key => [key, value[key]])));
}

function digest(domain, receipt) {
  return createHash('sha256')
    .update(domain)
    .update(`${JSON.stringify(receipt)}\n`)
    .digest('hex');
}

function canonicalPublishReceipt(value) {
  const receipt = exactDataRecord(
    value,
    PUBLISH_RECEIPT_KEYS,
    'GENESIS_002_PUBLISH_RECEIPT_INVALID',
  );
  if (
    receipt.schemaVersion !== 1
    || receipt.profile !== 'warpkeep-genesis-002-production-publish-v1'
    || typeof receipt.databaseIdentity !== 'string'
    || !SHA256.test(receipt.databaseIdentity)
    || receipt.databaseIdentity === GENESIS_001_DATABASE_IDENTITY
    || receipt.database !== GENESIS_002_DATABASE_ALIAS
    || receipt.moduleIdentity !== GENESIS_002_MODULE_IDENTITY
    || typeof receipt.sourceCommit !== 'string'
    || !COMMIT.test(receipt.sourceCommit)
    || typeof receipt.moduleSha256 !== 'string'
    || !SHA256.test(receipt.moduleSha256)
    || typeof receipt.moduleTreeId !== 'string'
    || !COMMIT.test(receipt.moduleTreeId)
    || typeof receipt.dependencyClosureDigest !== 'string'
    || !SHA256.test(receipt.dependencyClosureDigest)
    || typeof receipt.spacetimeExecutableSha256 !== 'string'
    || !SHA256.test(receipt.spacetimeExecutableSha256)
    || typeof receipt.spacetimeCliConfigSha256 !== 'string'
    || !SHA256.test(receipt.spacetimeCliConfigSha256)
    || receipt.deleteData !== 'never'
    || !['verified', 'verified-after-submission-error'].includes(receipt.outcome)
    || typeof receipt.freshStatusDigest !== 'string'
    || !SHA256.test(receipt.freshStatusDigest)
    || receipt.playerAccessEnabled !== false
    || receipt.admissionMutationsEnabled !== false
    || receipt.atlasImportMutationsEnabled !== true
    || receipt.atlasActivationMutationsEnabled !== false
    || receipt.playerPresentationEnabled !== false
  ) fail('GENESIS_002_PUBLISH_RECEIPT_INVALID');
  return receipt;
}

export function genesis002PublishReceiptDigest(receipt) {
  return digest(
    'warpkeep.genesis-002.production-publish-receipt.v1\n',
    canonicalPublishReceipt(receipt),
  );
}

function canonicalImportReceipt(value) {
  const receipt = exactDataRecord(
    value,
    IMPORT_RECEIPT_KEYS,
    'GENESIS_002_PRODUCTION_IMPORT_RECEIPT_INVALID',
  );
  if (
    receipt.schemaVersion !== 1
    || receipt.profile !== 'warpkeep.genesis-002.production-import.v1'
    || !['ready', 'already-ready', 'verified-after-submission-error']
      .includes(receipt.outcome)
    || typeof receipt.databaseIdentity !== 'string'
    || !SHA256.test(receipt.databaseIdentity)
    || receipt.databaseIdentity === GENESIS_001_DATABASE_IDENTITY
    || receipt.moduleIdentity !== GENESIS_002_MODULE_IDENTITY
    || typeof receipt.moduleSourceCommit !== 'string'
    || !COMMIT.test(receipt.moduleSourceCommit)
    || typeof receipt.moduleSha256 !== 'string'
    || !SHA256.test(receipt.moduleSha256)
    || typeof receipt.moduleTreeId !== 'string'
    || !COMMIT.test(receipt.moduleTreeId)
    || typeof receipt.dependencyClosureDigest !== 'string'
    || !SHA256.test(receipt.dependencyClosureDigest)
    || typeof receipt.spacetimeExecutableSha256 !== 'string'
    || !SHA256.test(receipt.spacetimeExecutableSha256)
    || receipt.atlasId !== GENESIS_002_ATLAS_ID
    || typeof receipt.atlasSourceCommit !== 'string'
    || !COMMIT.test(receipt.atlasSourceCommit)
    || typeof receipt.publicReleaseId !== 'string'
    || !PUBLIC_RELEASE_ID.test(receipt.publicReleaseId)
    || typeof receipt.expectedReleaseSha256 !== 'string'
    || !SHA256.test(receipt.expectedReleaseSha256)
    || typeof receipt.verificationDigest !== 'string'
    || !SHA256.test(receipt.verificationDigest)
    || typeof receipt.importEpoch !== 'string'
    || !/^[1-9][0-9]{0,19}$/u.test(receipt.importEpoch)
    || BigInt(receipt.importEpoch) > U64_MAXIMUM
    || !Number.isSafeInteger(receipt.operationsSubmitted)
    || Object.is(receipt.operationsSubmitted, -0)
    || receipt.operationsSubmitted < 0
    || receipt.operationsSubmitted > MAXIMUM_IMPORT_OPERATIONS
    || (receipt.outcome === 'already-ready')
      !== (receipt.operationsSubmitted === 0)
    || typeof receipt.operationChainDigest !== 'string'
    || !SHA256.test(receipt.operationChainDigest)
    || receipt.zeroPopulationBoundary !== true
    || receipt.activationMutationsEnabled !== false
    || receipt.playerPresentationEnabled !== false
    || receipt.atlasWritesClosedByFinalization !== true
  ) fail('GENESIS_002_PRODUCTION_IMPORT_RECEIPT_INVALID');
  return receipt;
}

export function genesis002ProductionImportReceiptDigest(receipt) {
  return digest(
    'warpkeep.genesis-002.production-import-receipt.v1\n',
    canonicalImportReceipt(receipt),
  );
}

function canonicalSealedLiveReceipt(value) {
  const receipt = exactDataRecord(
    value,
    SEALED_LIVE_RECEIPT_KEYS,
    'GENESIS_002_SEALED_LIVE_RECEIPT_INVALID',
  );
  const zeroFields = [
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
    'claimRows',
    'occupancyRows',
    'activationRows',
    'workerSystemRows',
  ];
  if (
    receipt.schemaVersion !== 1
    || receipt.profile !== 'warpkeep-genesis-002-sealed-live-v1'
    || receipt.uri !== 'https://maincloud.spacetimedb.com'
    || typeof receipt.databaseIdentity !== 'string'
    || !SHA256.test(receipt.databaseIdentity)
    || receipt.databaseIdentity === GENESIS_001_DATABASE_IDENTITY
    || receipt.databaseAlias !== GENESIS_002_DATABASE_ALIAS
    || receipt.moduleIdentity !== GENESIS_002_MODULE_IDENTITY
    || typeof receipt.moduleSourceCommit !== 'string'
    || !COMMIT.test(receipt.moduleSourceCommit)
    || typeof receipt.moduleSha256 !== 'string'
    || !SHA256.test(receipt.moduleSha256)
    || receipt.releaseVersion !== '0.4.0'
    || receipt.realmId !== 'GENESIS_002'
    || typeof receipt.atlasSourceCommit !== 'string'
    || !COMMIT.test(receipt.atlasSourceCommit)
    || receipt.atlasId !== GENESIS_002_ATLAS_ID
    || typeof receipt.publicReleaseId !== 'string'
    || !PUBLIC_RELEASE_ID.test(receipt.publicReleaseId)
    || typeof receipt.releaseSha256 !== 'string'
    || !SHA256.test(receipt.releaseSha256)
    || typeof receipt.releaseHeaderSha256 !== 'string'
    || !SHA256.test(receipt.releaseHeaderSha256)
    || typeof receipt.verificationDigest !== 'string'
    || !SHA256.test(receipt.verificationDigest)
    || receipt.atlasState !== 'ready'
    || receipt.atlasFinalized !== true
    || receipt.atlasImportsExact !== true
    || receipt.atlasImportSurfaceCompiled !== true
    || receipt.atlasWritesClosedByFinalization !== true
    || receipt.admissionsOpen !== false
    || receipt.accessRequestsOpen !== false
    || zeroFields.some(field => (
      receipt[field] !== 0 || Object.is(receipt[field], -0)
    ))
    || receipt.activationMutationsEnabled !== false
    || receipt.playerPresentationEnabled !== false
    || receipt.admissionNotificationsEnabled !== false
  ) fail('GENESIS_002_SEALED_LIVE_RECEIPT_INVALID');
  return receipt;
}

export function genesis002SealedLiveReceiptDigest(receipt) {
  return digest(
    'warpkeep.genesis-002.sealed-live-receipt.v1\n',
    canonicalSealedLiveReceipt(receipt),
  );
}

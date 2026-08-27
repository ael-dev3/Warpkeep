import {
  fstatSync,
  readSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createSealedLaunchActivationBinding,
} from './verify-0.4.0-sealed-launch.mjs';
import {
  genesis002ProductionImportReceiptDigest,
  genesis002PublishReceiptDigest,
  genesis002SealedLiveReceiptDigest,
} from './genesis002-activation-receipts.mjs';

const MAXIMUM_CANDIDATE_BYTES = 32 * 1_024;
const EVIDENCE_PROFILE =
  'warpkeep-0.4.0-sealed-launch-activation-evidence-v1';
const EVIDENCE_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'bindingCandidate',
  'g002PublishReceipt',
  'g002AtlasImportReceipt',
  'g002SealedLiveReceipt',
  'g002SealedLiveReceiptDigest',
]);
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
const PUBLISH_RESULT_KEYS = Object.freeze([
  ...PUBLISH_RECEIPT_KEYS,
  'publishReceiptDigest',
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
const IMPORT_RESULT_KEYS = Object.freeze([
  ...IMPORT_RECEIPT_KEYS,
  'importReceiptDigest',
]);
const G002_DERIVED_BINDING_KEYS = Object.freeze([
  'g002PublishReceiptDigest',
  'g002PublishReceiptCommitment',
  'g002FreshStatusDigest',
  'g002FreshStatusCommitment',
  'g002DatabaseIdentity',
  'g002ModuleSourceCommit',
  'g002ModuleSha256',
  'g002ModuleTreeId',
  'g002DependencyClosureDigest',
  'g002SpacetimeExecutableSha256',
  'g002SpacetimeCliConfigSha256',
  'g002AtlasImportReceiptDigest',
  'g002AtlasImportReceiptCommitment',
  'g002SealedLiveReceiptDigest',
  'g002SealedLiveReceiptCommitment',
  'g002AtlasSourceCommit',
  'g002AtlasId',
  'g002PublicReleaseId',
  'g002ReleaseSha256',
  'g002ReleaseHeaderSha256',
  'g002VerificationDigest',
  'g002AllowedFids',
  'g002AccessRequests',
  'g002PlayersV1',
  'g002PlayersV2',
  'g002OwnershipBindings',
  'g002Founders',
  'g002Castles',
  'g002RealmProfiles',
  'g002TermsAcceptances',
  'g002MarkAccounts',
  'g002ResourceAccounts',
  'g002Claims',
  'g002Occupancies',
  'g002ActivationRows',
  'g002WorkerSystemRows',
  'g002AtlasReady',
  'g002AtlasFinalized',
  'g002AtlasWritesClosedByFinalization',
  'g002AtlasImportMutationsEnabled',
  'g002AtlasActivationMutationsEnabled',
  'g002PlayerAccessEnabled',
  'g002AdmissionMutationsEnabled',
  'g002PresentationEnabled',
  'legacyGreaterRealmClientPresentationEnabled',
  'legacyGreaterRealmServerPresentationEnabled',
  'admissionNotificationsEnabled',
]);

export class SealedLaunchActivationGeneratorError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SealedLaunchActivationGeneratorError';
    this.code = code;
  }
}

function fail(code) {
  throw new SealedLaunchActivationGeneratorError(code);
}

function exactRecord(value, keys) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== keys.length
    || Reflect.ownKeys(value).some((key, index) => key !== keys[index])
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(
      descriptor => !('value' in descriptor) || descriptor.enumerable !== true,
    )
  ) fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
  return value;
}

function receiptWithoutDigest(value, resultKeys, receiptKeys) {
  const result = exactRecord(value, resultKeys);
  return Object.freeze(Object.fromEntries(
    receiptKeys.map(key => [key, result[key]]),
  ));
}

/** Derive every G2 public binding field solely from recomputed receipts. */
export function createSealedLaunchActivationBindingFromEvidence(envelope) {
  const evidence = exactRecord(envelope, EVIDENCE_KEYS);
  if (
    evidence.schemaVersion !== 1
    || evidence.profile !== EVIDENCE_PROFILE
    || typeof evidence.g002SealedLiveReceiptDigest !== 'string'
    || !/^[0-9a-f]{64}$/u.test(evidence.g002SealedLiveReceiptDigest)
  ) fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
  if (
    evidence.bindingCandidate === null
    || typeof evidence.bindingCandidate !== 'object'
    || Array.isArray(evidence.bindingCandidate)
  ) fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
  const candidate = exactRecord(
    evidence.bindingCandidate,
    Reflect.ownKeys(evidence.bindingCandidate),
  );
  if (G002_DERIVED_BINDING_KEYS.some(key => candidate[key] !== null)) {
    fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
  }

  const publish = exactRecord(evidence.g002PublishReceipt, PUBLISH_RESULT_KEYS);
  const publishReceipt = receiptWithoutDigest(
    publish,
    PUBLISH_RESULT_KEYS,
    PUBLISH_RECEIPT_KEYS,
  );
  const publishDigest = genesis002PublishReceiptDigest(publishReceipt);
  if (publish.publishReceiptDigest !== publishDigest) {
    fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
  }

  const atlasImport = exactRecord(
    evidence.g002AtlasImportReceipt,
    IMPORT_RESULT_KEYS,
  );
  const atlasImportReceipt = receiptWithoutDigest(
    atlasImport,
    IMPORT_RESULT_KEYS,
    IMPORT_RECEIPT_KEYS,
  );
  const atlasImportDigest = genesis002ProductionImportReceiptDigest(
    atlasImportReceipt,
  );
  if (atlasImport.importReceiptDigest !== atlasImportDigest) {
    fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
  }

  const sealedLive = evidence.g002SealedLiveReceipt;
  const sealedLiveDigest = genesis002SealedLiveReceiptDigest(sealedLive);
  if (evidence.g002SealedLiveReceiptDigest !== sealedLiveDigest) {
    fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
  }

  if (
    publish.databaseIdentity !== atlasImport.databaseIdentity
    || publish.databaseIdentity !== sealedLive.databaseIdentity
    || publish.moduleIdentity !== atlasImport.moduleIdentity
    || publish.moduleIdentity !== sealedLive.moduleIdentity
    || publish.sourceCommit !== atlasImport.moduleSourceCommit
    || publish.sourceCommit !== sealedLive.moduleSourceCommit
    || publish.sourceCommit !== atlasImport.atlasSourceCommit
    || publish.moduleSha256 !== atlasImport.moduleSha256
    || publish.moduleSha256 !== sealedLive.moduleSha256
    || publish.moduleTreeId !== atlasImport.moduleTreeId
    || publish.dependencyClosureDigest !== atlasImport.dependencyClosureDigest
    || publish.spacetimeExecutableSha256
      !== atlasImport.spacetimeExecutableSha256
    || atlasImport.atlasId !== sealedLive.atlasId
    || atlasImport.atlasSourceCommit !== sealedLive.atlasSourceCommit
    || atlasImport.publicReleaseId !== sealedLive.publicReleaseId
    || atlasImport.expectedReleaseSha256 !== sealedLive.releaseSha256
    || atlasImport.verificationDigest !== sealedLive.verificationDigest
    || publish.atlasImportMutationsEnabled
      !== sealedLive.atlasImportSurfaceCompiled
    || publish.atlasActivationMutationsEnabled
      !== atlasImport.activationMutationsEnabled
    || publish.atlasActivationMutationsEnabled
      !== sealedLive.activationMutationsEnabled
    || publish.playerPresentationEnabled
      !== atlasImport.playerPresentationEnabled
    || publish.playerPresentationEnabled
      !== sealedLive.playerPresentationEnabled
    || atlasImport.atlasWritesClosedByFinalization
      !== sealedLive.atlasWritesClosedByFinalization
  ) fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');

  const binding = {
    ...candidate,
    g002PublishReceiptDigest: publishDigest,
    g002FreshStatusDigest: publish.freshStatusDigest,
    g002DatabaseIdentity: publish.databaseIdentity,
    g002ModuleSourceCommit: publish.sourceCommit,
    g002ModuleSha256: publish.moduleSha256,
    g002ModuleTreeId: publish.moduleTreeId,
    g002DependencyClosureDigest: publish.dependencyClosureDigest,
    g002SpacetimeExecutableSha256: publish.spacetimeExecutableSha256,
    g002SpacetimeCliConfigSha256: publish.spacetimeCliConfigSha256,
    g002AtlasImportReceiptDigest: atlasImportDigest,
    g002SealedLiveReceiptDigest: sealedLiveDigest,
    g002AtlasSourceCommit: sealedLive.atlasSourceCommit,
    g002AtlasId: sealedLive.atlasId,
    g002PublicReleaseId: sealedLive.publicReleaseId,
    g002ReleaseSha256: sealedLive.releaseSha256,
    g002ReleaseHeaderSha256: sealedLive.releaseHeaderSha256,
    g002VerificationDigest: sealedLive.verificationDigest,
    g002AllowedFids: sealedLive.allowedFids,
    g002AccessRequests: sealedLive.accessRequests,
    g002PlayersV1: sealedLive.playersV1,
    g002PlayersV2: sealedLive.playersV2,
    g002OwnershipBindings: sealedLive.ownershipBindings,
    g002Founders: sealedLive.founders,
    g002Castles: sealedLive.castles,
    g002RealmProfiles: sealedLive.realmProfiles,
    g002TermsAcceptances: sealedLive.termsAcceptances,
    g002MarkAccounts: sealedLive.markAccounts,
    g002ResourceAccounts: sealedLive.resourceAccounts,
    g002Claims: sealedLive.claimRows,
    g002Occupancies: sealedLive.occupancyRows,
    g002ActivationRows: sealedLive.activationRows,
    g002WorkerSystemRows: sealedLive.workerSystemRows,
    g002AtlasReady: sealedLive.atlasState === 'ready',
    g002AtlasFinalized: sealedLive.atlasFinalized,
    g002AtlasWritesClosedByFinalization:
      sealedLive.atlasWritesClosedByFinalization,
    g002AtlasImportMutationsEnabled: publish.atlasImportMutationsEnabled,
    g002AtlasActivationMutationsEnabled:
      sealedLive.activationMutationsEnabled,
    g002PlayerAccessEnabled: publish.playerAccessEnabled,
    g002AdmissionMutationsEnabled: publish.admissionMutationsEnabled,
    g002PresentationEnabled: sealedLive.playerPresentationEnabled,
    legacyGreaterRealmClientPresentationEnabled:
      sealedLive.playerPresentationEnabled,
    legacyGreaterRealmServerPresentationEnabled:
      sealedLive.playerPresentationEnabled,
    admissionNotificationsEnabled: sealedLive.admissionNotificationsEnabled,
  };
  return createSealedLaunchActivationBinding(binding);
}

function sameFile(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.uid === right.uid
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

/**
 * Read one canonical, owner-private evidence projection from a descriptor and
 * return only the public release binding with freshly derived commitments.
 */
export function generateSealedLaunchActivationBindingFromDescriptor(
  descriptor = 0,
) {
  let storage;
  let bytes;
  try {
    const named = fstatSync(descriptor, { bigint: true });
    if (
      !named.isFile()
      || named.isSymbolicLink()
      || named.nlink !== 1n
      || (named.mode & 0o7777n) !== 0o600n
      || named.size < 2n
      || named.size > BigInt(MAXIMUM_CANDIDATE_BYTES)
      || (process.getuid !== undefined && named.uid !== BigInt(process.getuid()))
    ) fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
    const before = fstatSync(descriptor, { bigint: true });
    if (!sameFile(named, before)) {
      fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_CHANGED');
    }
    storage = Buffer.alloc(Number(named.size) + 1);
    let offset = 0;
    while (offset < storage.byteLength) {
      const count = readSync(
        descriptor,
        storage,
        offset,
        storage.byteLength - offset,
        null,
      );
      if (count === 0) break;
      offset += count;
    }
    if (offset !== Number(named.size)) {
      fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_CHANGED');
    }
    bytes = storage.subarray(0, offset);
    const after = fstatSync(descriptor, { bigint: true });
    if (!sameFile(before, after)) {
      fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_CHANGED');
    }
    let envelope;
    try {
      envelope = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      );
    } catch {
      fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
    }
    if (`${JSON.stringify(envelope, null, 2)}\n` !== bytes.toString('utf8')) {
      fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_NONCANONICAL');
    }
    try {
      return createSealedLaunchActivationBindingFromEvidence(envelope);
    } catch {
      fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
    }
  } catch (error) {
    if (error instanceof SealedLaunchActivationGeneratorError) throw error;
    fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_INPUT_INVALID');
  } finally {
    bytes?.fill(0);
    storage?.fill(0);
  }
}

async function main() {
  if (process.argv.length !== 2) {
    fail('SEALED_LAUNCH_ACTIVATION_GENERATOR_ARGUMENT_INVALID');
  }
  const binding = generateSealedLaunchActivationBindingFromDescriptor(0);
  process.stdout.write(`${JSON.stringify(binding, null, 2)}\n`);
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch(error => {
    process.stderr.write(`${
      error instanceof SealedLaunchActivationGeneratorError
        ? error.code
        : 'SEALED_LAUNCH_ACTIVATION_GENERATOR_FAILED'
    }\n`);
    process.exitCode = 1;
  });
}

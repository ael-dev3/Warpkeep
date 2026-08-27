// @vitest-environment node

import {
  chmodSync,
  closeSync,
  linkSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createSealedLaunchActivationBindingFromEvidence,
  generateSealedLaunchActivationBindingFromDescriptor,
} from '../scripts/generate-0.4.0-sealed-launch-activation.mjs';
import {
  genesis002ProductionImportReceiptDigest,
  genesis002SealedLiveReceiptDigest,
} from '../scripts/genesis002-activation-receipts.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const temporaryDirectories: string[] = [];
const PREPARATION_COMMIT = 'a'.repeat(40);
const DATABASE_IDENTITY = 'd'.repeat(64);
const MODULE_SHA256 = 'b'.repeat(64);
const MODULE_TREE_ID = 'c'.repeat(40);
const DEPENDENCY_DIGEST = 'e'.repeat(64);
const SPACETIME_DIGEST = 'f'.repeat(64);
const CLI_CONFIG_DIGEST = '0'.repeat(64);
const FRESH_STATUS_DIGEST = '1'.repeat(64);
const ATLAS_COMMIT = PREPARATION_COMMIT;
const PUBLIC_RELEASE_ID = `GRR-${'A'.repeat(26)}`;
const RELEASE_SHA256 = '5'.repeat(64);
const RELEASE_HEADER_SHA256 = '6'.repeat(64);
const VERIFICATION_DIGEST = '7'.repeat(64);
const PUBLISH_RECEIPT_DIGEST =
  '013a3b8824135f0f1a782a915f9ce8d7908c19d39510423fc1f817e137a06bb1';
const IMPORT_RECEIPT_DIGEST =
  '7c9e58982395bd6314a07f6f568981641397a1dc54637ed61482eef39990e628';
const SEALED_LIVE_RECEIPT_DIGEST =
  'dcb9c865763cd9724edd4d71f0ca93ba58f3b54d863b9d263ae4675cef9f53b4';

function bindingCandidate() {
  const value = JSON.parse(readFileSync(
    resolve(repositoryRoot, 'config/releases/0.4.0-sealed-launch.json'),
    'utf8',
  ));
  Object.assign(value, {
    pagesDeploymentApproved: true,
    preparationSourceCommit: PREPARATION_COMMIT,
    g001DatabaseIdentity:
      'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
    g001SourceBaselineCommit: '2ae51984e1fa6ce5b0028c1a250359fed79d819b',
    g001BaselineAbiSha256:
      'cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03',
    g001FreezeReleaseNonce:
      '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00',
    g001FreezePublishReceiptDigest: '0'.repeat(64),
    g001PolicyReceiptDigest: '1'.repeat(64),
    g001PolicySourceCommit: PREPARATION_COMMIT,
    g001ReleaseVersion: '0.3.43',
    g001PlayerAccessEnabled: true,
    g001AdmissionStateMutationsEnabled: false,
    g001AccessRequestSubmissionsEnabled: false,
    g001CensusPrivacySafeReceiptProfile:
      'warpkeep-genesis-001-census-export-privacy-safe-v1',
    g001CensusPrivacySafeReceiptDigest: '3'.repeat(64),
    admissionMonitorSuspensionReceiptDigest: '4'.repeat(64),
    admissionMonitorDisabled: true,
    admissionMonitorLoaded: false,
    authBridgeSourceCommit: PREPARATION_COMMIT,
    admissionRequestSuspensionReceiptDigest: 'e'.repeat(64),
  });
  let clear = false;
  for (const key of Object.keys(value)) {
    if (key === 'g002PublishReceiptDigest') clear = true;
    if (clear) value[key] = null;
  }
  return value;
}

function publishReceipt() {
  return {
    schemaVersion: 1,
    profile: 'warpkeep-genesis-002-production-publish-v1',
    databaseIdentity: DATABASE_IDENTITY,
    database: 'warpkeep-genesis-002',
    moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
    sourceCommit: PREPARATION_COMMIT,
    moduleSha256: MODULE_SHA256,
    moduleTreeId: MODULE_TREE_ID,
    dependencyClosureDigest: DEPENDENCY_DIGEST,
    spacetimeExecutableSha256: SPACETIME_DIGEST,
    spacetimeCliConfigSha256: CLI_CONFIG_DIGEST,
    deleteData: 'never',
    outcome: 'verified',
    freshStatusDigest: FRESH_STATUS_DIGEST,
    playerAccessEnabled: false,
    admissionMutationsEnabled: false,
    atlasImportMutationsEnabled: true,
    atlasActivationMutationsEnabled: false,
    playerPresentationEnabled: false,
    publishReceiptDigest: PUBLISH_RECEIPT_DIGEST,
  };
}

function atlasImportReceipt() {
  return {
    schemaVersion: 1,
    profile: 'warpkeep.genesis-002.production-import.v1',
    outcome: 'ready',
    databaseIdentity: DATABASE_IDENTITY,
    moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
    moduleSourceCommit: PREPARATION_COMMIT,
    moduleSha256: MODULE_SHA256,
    moduleTreeId: MODULE_TREE_ID,
    dependencyClosureDigest: DEPENDENCY_DIGEST,
    spacetimeExecutableSha256: SPACETIME_DIGEST,
    atlasId: 'GENESIS_002_GREATER_REALM',
    atlasSourceCommit: ATLAS_COMMIT,
    publicReleaseId: PUBLIC_RELEASE_ID,
    expectedReleaseSha256: RELEASE_SHA256,
    verificationDigest: VERIFICATION_DIGEST,
    importEpoch: '1',
    operationsSubmitted: 16,
    operationChainDigest: '8'.repeat(64),
    zeroPopulationBoundary: true,
    activationMutationsEnabled: false,
    playerPresentationEnabled: false,
    atlasWritesClosedByFinalization: true,
    importReceiptDigest: IMPORT_RECEIPT_DIGEST,
  };
}

function sealedLiveReceipt() {
  return {
    schemaVersion: 1,
    profile: 'warpkeep-genesis-002-sealed-live-v1',
    uri: 'https://maincloud.spacetimedb.com',
    databaseIdentity: DATABASE_IDENTITY,
    databaseAlias: 'warpkeep-genesis-002',
    moduleIdentity: 'warpkeep-genesis-002-sealed-v1',
    moduleSourceCommit: PREPARATION_COMMIT,
    moduleSha256: MODULE_SHA256,
    releaseVersion: '0.4.0',
    realmId: 'GENESIS_002',
    atlasSourceCommit: ATLAS_COMMIT,
    atlasId: 'GENESIS_002_GREATER_REALM',
    publicReleaseId: PUBLIC_RELEASE_ID,
    releaseSha256: RELEASE_SHA256,
    releaseHeaderSha256: RELEASE_HEADER_SHA256,
    verificationDigest: VERIFICATION_DIGEST,
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
  };
}

function evidenceEnvelope() {
  return {
    schemaVersion: 1,
    profile: 'warpkeep-0.4.0-sealed-launch-activation-evidence-v1',
    bindingCandidate: bindingCandidate(),
    g002PublishReceipt: publishReceipt(),
    g002AtlasImportReceipt: atlasImportReceipt(),
    g002SealedLiveReceipt: sealedLiveReceipt(),
    g002SealedLiveReceiptDigest: SEALED_LIVE_RECEIPT_DIGEST,
  };
}

function canonical(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function inputDescriptor(contents: string | Uint8Array, mode = 0o600) {
  const directory = mkdtempSync(join(tmpdir(), 'warpkeep-sealed-activation-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'candidate.json');
  writeFileSync(path, contents, { encoding: 'utf8', mode, flag: 'wx' });
  chmodSync(path, mode);
  return openSync(path, 'r');
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('sealed 0.4.0 activation binding generator', () => {
  it('derives every G2 field and commitment from one exact evidence envelope', () => {
    const descriptor = inputDescriptor(canonical(evidenceEnvelope()));
    try {
      const result = generateSealedLaunchActivationBindingFromDescriptor(descriptor);
      expect(result.pagesDeploymentApproved).toBe(true);
      expect(result).toMatchObject({
        g002PublishReceiptDigest: PUBLISH_RECEIPT_DIGEST,
        g002FreshStatusDigest: FRESH_STATUS_DIGEST,
        g002DatabaseIdentity: DATABASE_IDENTITY,
        g002ModuleSourceCommit: PREPARATION_COMMIT,
        g002ModuleSha256: MODULE_SHA256,
        g002ModuleTreeId: MODULE_TREE_ID,
        g002DependencyClosureDigest: DEPENDENCY_DIGEST,
        g002SpacetimeExecutableSha256: SPACETIME_DIGEST,
        g002SpacetimeCliConfigSha256: CLI_CONFIG_DIGEST,
        g002AtlasImportReceiptDigest: IMPORT_RECEIPT_DIGEST,
        g002SealedLiveReceiptDigest: SEALED_LIVE_RECEIPT_DIGEST,
        g002AtlasSourceCommit: ATLAS_COMMIT,
        g002AtlasId: 'GENESIS_002_GREATER_REALM',
        g002PublicReleaseId: PUBLIC_RELEASE_ID,
        g002ReleaseSha256: RELEASE_SHA256,
        g002ReleaseHeaderSha256: RELEASE_HEADER_SHA256,
        g002VerificationDigest: VERIFICATION_DIGEST,
        g002AllowedFids: 0,
        g002AccessRequests: 0,
        g002PlayersV1: 0,
        g002PlayersV2: 0,
        g002OwnershipBindings: 0,
        g002Founders: 0,
        g002Castles: 0,
        g002RealmProfiles: 0,
        g002TermsAcceptances: 0,
        g002MarkAccounts: 0,
        g002ResourceAccounts: 0,
        g002Claims: 0,
        g002Occupancies: 0,
        g002ActivationRows: 0,
        g002WorkerSystemRows: 0,
        g002AtlasReady: true,
        g002AtlasFinalized: true,
        g002AtlasWritesClosedByFinalization: true,
        g002AtlasImportMutationsEnabled: true,
        g002AtlasActivationMutationsEnabled: false,
        g002PlayerAccessEnabled: false,
        g002AdmissionMutationsEnabled: false,
        g002PresentationEnabled: false,
        legacyGreaterRealmClientPresentationEnabled: false,
        legacyGreaterRealmServerPresentationEnabled: false,
        admissionNotificationsEnabled: false,
      });
      expect(result).not.toHaveProperty('bindingCandidate');
      expect(result).not.toHaveProperty('g002PublishReceipt');
      expect(result).not.toHaveProperty('g002AtlasImportReceipt');
      expect(result).not.toHaveProperty('g002SealedLiveReceipt');
      expect(result).not.toHaveProperty('operationChainDigest');
      for (const [key, value] of Object.entries(result)) {
        if (key.endsWith('Commitment')) expect(value).toMatch(/^[0-9a-f]{64}$/u);
      }
      expect(canonical(result)).toBe(`${JSON.stringify(result, null, 2)}\n`);
    } finally {
      closeSync(descriptor);
    }
  });

  it('rejects noncanonical, extra-field, or non-private evidence files', () => {
    for (const [contents, mode] of [
      [JSON.stringify(evidenceEnvelope()), 0o600],
      [canonical({ ...evidenceEnvelope(), applicantNames: ['private'] }), 0o600],
      [canonical(evidenceEnvelope()), 0o644],
    ] as const) {
      const descriptor = inputDescriptor(contents, mode);
      try {
        expect(() => generateSealedLaunchActivationBindingFromDescriptor(
          descriptor,
        )).toThrow();
      } finally {
        closeSync(descriptor);
      }
    }
  });

  it('rejects invalid UTF-8, oversized, hard-linked, or non-regular input', () => {
    const invalidUtf8 = inputDescriptor(new Uint8Array([0xc3, 0x28]));
    const oversized = inputDescriptor(new Uint8Array((32 * 1_024) + 1));
    const hardLinkDirectory = mkdtempSync(join(
      tmpdir(),
      'warpkeep-sealed-activation-hardlink-',
    ));
    temporaryDirectories.push(hardLinkDirectory);
    const hardLinkSource = join(hardLinkDirectory, 'candidate.json');
    const hardLinkAlias = join(hardLinkDirectory, 'candidate-alias.json');
    writeFileSync(hardLinkSource, canonical(evidenceEnvelope()), {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    linkSync(hardLinkSource, hardLinkAlias);
    const hardLinked = openSync(hardLinkSource, 'r');
    const nonRegular = openSync('/dev/null', 'r');
    try {
      for (const descriptor of [
        invalidUtf8,
        oversized,
        hardLinked,
        nonRegular,
      ]) {
        expect(
          () => generateSealedLaunchActivationBindingFromDescriptor(descriptor),
        ).toThrow();
      }
    } finally {
      for (const descriptor of [
        invalidUtf8,
        oversized,
        hardLinked,
        nonRegular,
      ]) closeSync(descriptor);
    }
  });

  it('rejects prefilled G2 values and inconsistent individually valid receipts', () => {
    const baseline = createSealedLaunchActivationBindingFromEvidence(
      evidenceEnvelope(),
    );
    const bindingKeys = Object.keys(bindingCandidate());
    for (const key of bindingKeys.slice(
      bindingKeys.indexOf('g002PublishReceiptDigest'),
    )) {
      const prefilled = evidenceEnvelope();
      prefilled.bindingCandidate[key] = baseline[key];
      expect(
        () => createSealedLaunchActivationBindingFromEvidence(prefilled),
        key,
      ).toThrow();
    }

    const inconsistent = evidenceEnvelope();
    inconsistent.g002AtlasImportReceipt = {
      ...inconsistent.g002AtlasImportReceipt,
      moduleSha256: '9'.repeat(64),
      importReceiptDigest: undefined as unknown as string,
    };
    inconsistent.g002AtlasImportReceipt.importReceiptDigest =
      genesis002ProductionImportReceiptDigest(Object.fromEntries(
        Object.entries(inconsistent.g002AtlasImportReceipt).slice(0, -1),
      ));

    const inconsistentLive = evidenceEnvelope();
    inconsistentLive.g002SealedLiveReceipt = {
      ...inconsistentLive.g002SealedLiveReceipt,
      databaseIdentity: '9'.repeat(64),
    };
    inconsistentLive.g002SealedLiveReceiptDigest =
      genesis002SealedLiveReceiptDigest(inconsistentLive.g002SealedLiveReceipt);

    for (const value of [inconsistent, inconsistentLive]) {
      const descriptor = inputDescriptor(canonical(value));
      try {
        expect(() => generateSealedLaunchActivationBindingFromDescriptor(
          descriptor,
        )).toThrow();
      } finally {
        closeSync(descriptor);
      }
    }
  });

  it('rejects missing, reordered, extra, swapped, or stale receipt evidence', () => {
    const reorderedEnvelope = Object.fromEntries(
      Object.entries(evidenceEnvelope()).reverse(),
    ) as ReturnType<typeof evidenceEnvelope>;
    const missingEnvelope = evidenceEnvelope() as Partial<
      ReturnType<typeof evidenceEnvelope>
    >;
    delete missingEnvelope.profile;
    const missing = evidenceEnvelope();
    delete (missing.g002PublishReceipt as Partial<ReturnType<typeof publishReceipt>>)
      .moduleTreeId;
    const reordered = evidenceEnvelope();
    reordered.g002SealedLiveReceipt = Object.fromEntries(
      Object.entries(reordered.g002SealedLiveReceipt).reverse(),
    ) as ReturnType<typeof sealedLiveReceipt>;
    const extra = evidenceEnvelope();
    Object.assign(extra.g002AtlasImportReceipt, { applicantCount: 0 });
    const swapped = evidenceEnvelope();
    [swapped.g002PublishReceipt, swapped.g002AtlasImportReceipt] = [
      swapped.g002AtlasImportReceipt as unknown as ReturnType<typeof publishReceipt>,
      swapped.g002PublishReceipt as unknown as ReturnType<typeof atlasImportReceipt>,
    ];
    const stale = evidenceEnvelope();
    stale.g002SealedLiveReceiptDigest = '9'.repeat(64);
    const stalePublish = evidenceEnvelope();
    stalePublish.g002PublishReceipt.publishReceiptDigest = '9'.repeat(64);
    const staleImport = evidenceEnvelope();
    staleImport.g002AtlasImportReceipt.importReceiptDigest = '9'.repeat(64);

    for (const value of [
      reorderedEnvelope,
      missingEnvelope,
      missing,
      reordered,
      extra,
      swapped,
      stale,
      stalePublish,
      staleImport,
    ]) {
      const descriptor = inputDescriptor(canonical(value));
      try {
        expect(() => generateSealedLaunchActivationBindingFromDescriptor(
          descriptor,
        )).toThrow();
      } finally {
        closeSync(descriptor);
      }
    }
  });
});

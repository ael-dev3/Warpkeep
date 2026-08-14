// @vitest-environment node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
  AUTH_BRIDGE_RELEASE_ATTESTATION_URL,
  canonicalAuthBridgeReleaseAttestationDigest,
} from '../scripts/auth-bridge-notification-prepared-receipt.mjs';
import {
  createNotificationPagesPrivateHandoff,
  inspectNotificationPagesPrivateHandoff,
} from '../scripts/notification-pages-private-handoff.mjs';
import {
  testOnlyWritePrivateGreaterRealmProductionPagesEvidence,
} from '../scripts/greater-realm-production-pages-evidence';
import type {
  GreaterRealmProductionVerificationReceipt,
} from '../scripts/greater-realm-production-verifier-core';

const HEAD_COMMIT = execFileSync(
  '/usr/bin/git',
  ['rev-parse', '--verify', 'HEAD^{commit}'],
  { cwd: process.cwd(), encoding: 'utf8' },
).trim();
const HEAD_TREE = execFileSync(
  '/usr/bin/git',
  ['rev-parse', '--verify', 'HEAD^{tree}'],
  { cwd: process.cwd(), encoding: 'utf8' },
).trim();
const BRIDGE_COMMIT = HEAD_COMMIT;
const DRIFTED_BRIDGE_COMMIT =
  'b218a1b3533faa74c159c7a06c3311717906ba05';
const ATLAS_COMMIT = HEAD_COMMIT;
const MODULE_COMMIT = HEAD_COMMIT;
const PAGES_COMMIT = HEAD_COMMIT;
const DIGEST = 'e'.repeat(64);
const DEPLOYED_RECORDED_AT = '2026-08-11T11:40:00.000Z';
const ACTIVE_RECORDED_AT = '2026-08-11T11:50:00.000Z';
const PREPARED_AT = '2026-08-11T12:00:00.000Z';
const CREATED_AT = new Date('2026-08-11T12:05:00.000Z');
const NOW = new Date('2026-08-11T12:06:00.000Z');
const ACTIVE_EXPIRES_AT = '2026-08-11T12:50:00.000Z';
const EXPIRES_AT = '2026-08-11T12:45:00.000Z';
const FOUNDER_COUNT = 100;
const ACTIVE_EVIDENCE_MAXIMUM_AGE_MILLISECONDS = 60 * 60 * 1_000;
const KEY = Buffer.alloc(32, 7);
const TARGET = Object.freeze({
  uri: 'https://maincloud.spacetimedb.com',
  database: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
  deleteData: 'never',
});
const temporaryDirectories: string[] = [];

const RELEASE_HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'content-security-policy':
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'permissions-policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-site',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'x-permitted-cross-domain-policies': 'none',
  date: NOW.toUTCString(),
});

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function sortedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortedJson(child)]),
    );
  }
  return value;
}

function privateReceipt(
  kind: string,
  recordedAt: string,
  record: Readonly<Record<string, unknown>>,
): Buffer {
  return Buffer.from(`${JSON.stringify(sortedJson({
    schemaVersion: 1,
    kind,
    recordedAt,
    target: TARGET,
    record,
  }), null, 2)}\n`, 'utf8');
}

function releaseAttestation() {
  return {
    schemaVersion: 1 as const,
    profile: 'warpkeep-admission-notification-bridge-v1' as const,
    bridgeSourceCommit: BRIDGE_COMMIT,
    notificationDeliveryEnabled: true as const,
    notificationTransportConfigured: true as const,
    admissionNotificationStoreConfigured: true as const,
    notificationClientCount: 1 as const,
    notificationDeliveryContractDigest:
      AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
    publicAuthEnabled: true,
    accessExpectedFidRequired: false,
  };
}

function releaseResponse(): Response {
  const response = new Response(JSON.stringify(releaseAttestation()), {
    status: 200,
    headers: RELEASE_HEADERS,
  });
  Object.defineProperty(response, 'url', {
    value: AUTH_BRIDGE_RELEASE_ATTESTATION_URL,
  });
  Object.defineProperty(response, 'redirected', { value: false });
  return response;
}

function preparedReceipt(bridgeSourceCommit = BRIDGE_COMMIT): Buffer {
  return Buffer.from(`${JSON.stringify({
    schemaVersion: 1,
    kind: 'warpkeep-auth-bridge-notification-prepared-v1',
    bridgeOrigin: 'https://auth.warpkeep.com',
    bridgeSourceCommit,
    notificationDeliveryContractDigest:
      AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
    notificationClientCount: 1,
    notificationDeliveryEnabled: true,
    notificationTransportConfigured: true,
    admissionNotificationStoreConfigured: true,
    publicAuthEnabledBefore: true,
    publicAuthEnabledAfter: true,
    accessExpectedFidRequiredBefore: false,
    accessExpectedFidRequiredAfter: false,
    hermesExecutionApproved: false,
    pagesPresentationEnabled: false,
    liveAttestationDigest:
      canonicalAuthBridgeReleaseAttestationDigest(releaseAttestation()),
    preparedAt: PREPARED_AT,
    expiresAt: EXPIRES_AT,
  })}\n`, 'utf8');
}

function activeVerification(
  overrides: Readonly<Record<string, unknown>> = {},
): GreaterRealmProductionVerificationReceipt {
  return {
    schemaVersion: 1,
    kind: 'warpkeep-greater-realm-production-active-verification-v1',
    atlasSourceCommit: ATLAS_COMMIT,
    atlasId: 'GR-ATLAS-TEST',
    publicReleaseId: 'GRR-TEST',
    expectedReleaseSha256: DIGEST,
    moduleSourceCommit: MODULE_COMMIT,
    expectedFounderCount: FOUNDER_COUNT,
    founderCapacityRemaining: 600 - FOUNDER_COUNT,
    admissionState: 'open',
    activeClaimRows: FOUNDER_COUNT.toString(),
    occupancyRows: FOUNDER_COUNT.toString(),
    auditRows: '51',
    statusDigest: '3'.repeat(64),
    ...overrides,
  } as GreaterRealmProductionVerificationReceipt;
}

function activeEvidence(
  overrides: Readonly<Record<string, unknown>> = {},
  verificationOverrides: Readonly<Record<string, unknown>> = {},
): Buffer {
  return Buffer.from(`${JSON.stringify({
    schemaVersion: 1,
    kind: 'warpkeep-greater-realm-production-pages-active-v17-v1',
    recordedAt: ACTIVE_RECORDED_AT,
    expiresAt: ACTIVE_EXPIRES_AT,
    maximumAgeMilliseconds: ACTIVE_EVIDENCE_MAXIMUM_AGE_MILLISECONDS,
    target: TARGET,
    sourceRelease: {
      atlasSourceCommit: ATLAS_COMMIT,
      atlasId: 'GR-ATLAS-TEST',
      publicReleaseId: 'GRR-TEST',
      expectedReleaseSha256: DIGEST,
      moduleSourceCommit: MODULE_COMMIT,
    },
    expectedFounderCount: FOUNDER_COUNT,
    founderCapacityRemaining: 600 - FOUNDER_COUNT,
    activeAdmissionEligible: true,
    activeVerification: activeVerification(verificationOverrides),
    ...overrides,
  }, null, 2)}\n`, 'utf8');
}

function deployedRecord(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    schemaVersion: 1,
    kind: 'warpkeep-greater-realm-production-publish-v1',
    lane: 'forward-activation-active-v17',
    outcome: 'verified',
    target: TARGET,
    atlasSourceCommit: ATLAS_COMMIT,
    atlasId: 'GR-ATLAS-TEST',
    publicReleaseId: 'GRR-TEST',
    expectedReleaseSha256: DIGEST,
    moduleSourceCommit: MODULE_COMMIT,
    moduleDeltaPolicy: 'reviewed-same-schema',
    artifactDigest: '5'.repeat(64),
    v14TableSchemaDigest: '6'.repeat(64),
    v17TableSchemaDigest: '7'.repeat(64),
    currentCandidateTableSchemaDigest: 'a'.repeat(64),
    predecessorTableCount: 86,
    postTableCount: 86,
    schemaMutation: 'none',
    importMutationsCompiled: false,
    activationMutationsCompiled: true,
    releaseState: 'active',
    activationMode: 'active',
    historicalAggregateDigest: '8'.repeat(64),
    operationReceiptChainDigest: '9'.repeat(64),
    operationReceiptCount: 1,
    moduleTreeId: HEAD_TREE,
    dependencyClosureDigest: '0'.repeat(64),
    ...overrides,
  };
}

function evidence(overrides: Readonly<{
  deployedRecordedAt?: string;
  activeEvidence?: Buffer;
  deployedRecord?: Readonly<Record<string, unknown>>;
}> = {}) {
  return {
    prepared: preparedReceipt(),
    active: overrides.activeEvidence ?? activeEvidence(),
    deployed: privateReceipt(
      'warpkeep-greater-realm-production-publish-v1',
      overrides.deployedRecordedAt ?? DEPLOYED_RECORDED_AT,
      overrides.deployedRecord ?? deployedRecord(),
    ),
  };
}

function createHandoff(
  receipts = evidence(),
  bridgeSourceCommit = BRIDGE_COMMIT,
) {
  return createNotificationPagesPrivateHandoff({
    key: Buffer.from(KEY),
    workflowRunId: '123456789',
    workflowRunAttempt: '1',
    pagesSourceCommit: PAGES_COMMIT,
    expectedFounderCount: FOUNDER_COUNT,
    activeEvidenceMaximumAgeMilliseconds:
      ACTIVE_EVIDENCE_MAXIMUM_AGE_MILLISECONDS,
    bridgeSourceCommit,
    preparedReceiptBytes: receipts.prepared,
    activeV17EvidenceBytes: receipts.active,
    deployedModuleReceiptBytes: receipts.deployed,
    createdAt: CREATED_AT,
    expiresAt: new Date(EXPIRES_AT),
    randomBytesImpl: size => Buffer.alloc(size, 9),
  });
}

function privateWorkspace() {
  const parent = mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-pages-handoff-'));
  chmodSync(parent, 0o700);
  temporaryDirectories.push(parent);
  const privateRoot = join(parent, 'private');
  mkdirSync(privateRoot, { mode: 0o700 });
  chmodSync(privateRoot, 0o700);
  return { repositoryRoot: realpathSync(process.cwd()), privateRoot, parent };
}

function writePrivate(path: string, bytes: Uint8Array): void {
  writeFileSync(path, bytes, { mode: 0o600 });
  chmodSync(path, 0o600);
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('notification-to-Pages private evidence handoff', () => {
  it('consumes the canonical fresh active-verification evidence writer ABI', async () => {
    const { repositoryRoot, privateRoot, parent } = privateWorkspace();
    const written = testOnlyWritePrivateGreaterRealmProductionPagesEvidence({
      directory: join(parent, 'active-evidence'),
      repositoryRoot,
      activeVerification: activeVerification(),
      expectedSourceRelease: {
        atlasSourceCommit: ATLAS_COMMIT,
        atlasId: 'GR-ATLAS-TEST',
        publicReleaseId: 'GRR-TEST',
        expectedReleaseSha256: DIGEST,
        moduleSourceCommit: MODULE_COMMIT,
      },
      expectedFounderCount: FOUNDER_COUNT,
      maximumAgeMilliseconds: ACTIVE_EVIDENCE_MAXIMUM_AGE_MILLISECONDS,
      verifiedAt: new Date(ACTIVE_RECORDED_AT),
      randomBytesImpl: size => Buffer.alloc(size, 4),
    });
    const receipts = {
      prepared: preparedReceipt(),
      active: readFileSync(written.path),
      deployed: privateReceipt(
        'warpkeep-greater-realm-production-publish-v1',
        DEPLOYED_RECORDED_AT,
        deployedRecord(),
      ),
    };
    const created = createHandoff(receipts);
    const handoffPath = join(privateRoot, 'handoff.json');
    const keyPath = join(privateRoot, 'key.txt');
    writePrivate(handoffPath, created.bytes);
    writePrivate(keyPath, Buffer.from(`${KEY.toString('base64url')}\n`, 'utf8'));

    await expect(inspectNotificationPagesPrivateHandoff({
      handoffPath,
      keyPath,
      repositoryRoot,
      expectedHandoffDigest: created.digest,
      expectedKeyId: created.keyId,
      expectedWorkflowRunId: '123456789',
      expectedWorkflowRunAttempt: '1',
      expectedPagesSourceCommit: PAGES_COMMIT,
      expectedFounderCount: FOUNDER_COUNT,
      expectedActiveEvidenceMaximumAgeMilliseconds:
        ACTIVE_EVIDENCE_MAXIMUM_AGE_MILLISECONDS,
      expectedPreparedReceiptDigest: digest(receipts.prepared),
      expectedActiveV17EvidenceDigest: digest(receipts.active),
      expectedDeployedModuleReceiptDigest: digest(receipts.deployed),
      expectedBridgeSourceCommit: BRIDGE_COMMIT,
      fetchImpl: vi.fn(async () => releaseResponse()) as typeof fetch,
      now: NOW,
    })).resolves.toMatchObject({
      activeV17Evidence: { activeVerification: { auditRows: '51' } },
    });
  });

  it('decrypts only the exact run-bound evidence and refreshes the bridge attestation', async () => {
    const receipts = evidence();
    const created = createHandoff(receipts);
    const { repositoryRoot, privateRoot } = privateWorkspace();
    const handoffPath = join(privateRoot, 'handoff.json');
    const keyPath = join(privateRoot, 'key.txt');
    writePrivate(handoffPath, created.bytes);
    writePrivate(keyPath, Buffer.from(`${KEY.toString('base64url')}\n`, 'utf8'));
    const fetchImpl = vi.fn(async () => releaseResponse()) as typeof fetch;

    const result = await inspectNotificationPagesPrivateHandoff({
      handoffPath,
      keyPath,
      repositoryRoot,
      expectedHandoffDigest: created.digest,
      expectedKeyId: created.keyId,
      expectedWorkflowRunId: '123456789',
      expectedWorkflowRunAttempt: '1',
      expectedPagesSourceCommit: PAGES_COMMIT,
      expectedFounderCount: FOUNDER_COUNT,
      expectedActiveEvidenceMaximumAgeMilliseconds:
        ACTIVE_EVIDENCE_MAXIMUM_AGE_MILLISECONDS,
      expectedPreparedReceiptDigest: digest(receipts.prepared),
      expectedActiveV17EvidenceDigest: digest(receipts.active),
      expectedDeployedModuleReceiptDigest: digest(receipts.deployed),
      expectedBridgeSourceCommit: BRIDGE_COMMIT,
      fetchImpl,
      now: NOW,
    });

    expect(result).toMatchObject({
      handoffDigest: created.digest,
      keyId: created.keyId,
      workflowRunId: '123456789',
      workflowRunAttempt: '1',
      pagesSourceCommit: PAGES_COMMIT,
      expectedFounderCount: FOUNDER_COUNT,
      activeEvidenceMaximumAgeMilliseconds:
        ACTIVE_EVIDENCE_MAXIMUM_AGE_MILLISECONDS,
      bridgeSourceCommit: BRIDGE_COMMIT,
      sourceRelease: {
        atlasSourceCommit: ATLAS_COMMIT,
        moduleSourceCommit: MODULE_COMMIT,
      },
      activeV17Evidence: {
        kind: 'warpkeep-greater-realm-production-pages-active-v17-v1',
        expectedFounderCount: FOUNDER_COUNT,
      },
      deployedModuleReceipt: { lane: 'forward-activation-active-v17' },
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const envelopeSource = created.bytes.toString('utf8');
    expect(envelopeSource).not.toContain('GR-ATLAS-TEST');
    expect(envelopeSource).not.toContain('admin_commit_greater_realm_active_v1');
    expect(readFileSync(keyPath, 'utf8')).toBe(`${KEY.toString('base64url')}\n`);
  });

  it('authenticates the ciphertext and every caller-supplied run binding', async () => {
    const receipts = evidence();
    const created = createHandoff(receipts);
    const envelope = JSON.parse(created.bytes.toString('utf8')) as Record<string, unknown>;
    const ciphertext = Buffer.from(envelope.ciphertext as string, 'base64url');
    ciphertext[0] ^= 1;
    envelope.ciphertext = ciphertext.toString('base64url');
    const tampered = Buffer.from(`${JSON.stringify(envelope)}\n`, 'utf8');
    ciphertext.fill(0);
    const { repositoryRoot, privateRoot } = privateWorkspace();
    const handoffPath = join(privateRoot, 'handoff.json');
    const keyPath = join(privateRoot, 'key.txt');
    writePrivate(handoffPath, tampered);
    writePrivate(keyPath, Buffer.from(`${KEY.toString('base64url')}\n`, 'utf8'));

    await expect(inspectNotificationPagesPrivateHandoff({
      handoffPath,
      keyPath,
      repositoryRoot,
      expectedHandoffDigest: digest(tampered),
      expectedKeyId: created.keyId,
      expectedWorkflowRunId: '123456789',
      expectedWorkflowRunAttempt: '1',
      expectedPagesSourceCommit: PAGES_COMMIT,
      expectedFounderCount: FOUNDER_COUNT,
      expectedActiveEvidenceMaximumAgeMilliseconds:
        ACTIVE_EVIDENCE_MAXIMUM_AGE_MILLISECONDS,
      expectedPreparedReceiptDigest: digest(receipts.prepared),
      expectedActiveV17EvidenceDigest: digest(receipts.active),
      expectedDeployedModuleReceiptDigest: digest(receipts.deployed),
      expectedBridgeSourceCommit: BRIDGE_COMMIT,
      fetchImpl: vi.fn() as typeof fetch,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_HANDOFF_AUTHENTICATION_FAILED');

    writePrivate(handoffPath, created.bytes);
    await expect(inspectNotificationPagesPrivateHandoff({
      handoffPath,
      keyPath,
      repositoryRoot,
      expectedHandoffDigest: created.digest,
      expectedKeyId: created.keyId,
      expectedWorkflowRunId: '123456789',
      expectedWorkflowRunAttempt: '2',
      expectedPagesSourceCommit: PAGES_COMMIT,
      expectedFounderCount: FOUNDER_COUNT,
      expectedActiveEvidenceMaximumAgeMilliseconds:
        ACTIVE_EVIDENCE_MAXIMUM_AGE_MILLISECONDS,
      expectedPreparedReceiptDigest: digest(receipts.prepared),
      expectedActiveV17EvidenceDigest: digest(receipts.active),
      expectedDeployedModuleReceiptDigest: digest(receipts.deployed),
      expectedBridgeSourceCommit: BRIDGE_COMMIT,
      fetchImpl: vi.fn() as typeof fetch,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_HANDOFF_BINDING_MISMATCH');
  });

  it('rejects source-release drift and out-of-order evidence before encryption', () => {
    const mismatched = evidence({
      deployedRecord: deployedRecord({ moduleSourceCommit: '1'.repeat(40) }),
    });
    expect(() => createHandoff(mismatched)).toThrow(
      'NOTIFICATION_PAGES_HANDOFF_ACTIVE_EVIDENCE_INVALID',
    );

    const outOfOrder = evidence({
      deployedRecordedAt: '2026-08-11T11:50:00.000Z',
      activeEvidence: activeEvidence({
        recordedAt: '2026-08-11T11:45:00.000Z',
        expiresAt: '2026-08-11T12:45:00.000Z',
      }),
    });
    expect(() => createHandoff(outOfOrder)).toThrow(
      'NOTIFICATION_PAGES_HANDOFF_EVIDENCE_ORDER_INVALID',
    );

    expect(() => createHandoff(evidence({
      activeEvidence: activeEvidence({}, { auditRows: ['51'] }),
    }))).toThrow('NOTIFICATION_PAGES_HANDOFF_ACTIVE_EVIDENCE_INVALID');
    expect(() => createHandoff(evidence({
      deployedRecord: deployedRecord({ artifactDigest: ['5'.repeat(64)] }),
    }))).toThrow('NOTIFICATION_PAGES_HANDOFF_MODULE_RECEIPT_INVALID');
    expect(() => createHandoff(evidence({
      deployedRecord: deployedRecord({ currentCandidateTableSchemaDigest: undefined }),
    }))).toThrow('NOTIFICATION_PAGES_HANDOFF_MODULE_RECEIPT_INVALID');
    expect(() => createHandoff(evidence({
      deployedRecord: deployedRecord({ currentCandidateTableSchemaDigest: 'A'.repeat(64) }),
    }))).toThrow('NOTIFICATION_PAGES_HANDOFF_MODULE_RECEIPT_INVALID');
    expect(() => createHandoff(evidence({
      deployedRecord: deployedRecord({ predecessorTableCount: 84, postTableCount: 84 }),
    }))).toThrow('NOTIFICATION_PAGES_HANDOFF_MODULE_RECEIPT_INVALID');

    expect(() => createHandoff(evidence({
      activeEvidence: activeEvidence({
        expectedFounderCount: 101,
        founderCapacityRemaining: 499,
      }),
    }))).toThrow('NOTIFICATION_PAGES_HANDOFF_ACTIVE_EVIDENCE_INVALID');

    expect(() => createHandoff(evidence({
      activeEvidence: activeEvidence({
        recordedAt: '2026-08-11T10:00:00.000Z',
        expiresAt: '2026-08-11T11:00:00.000Z',
      }),
    }))).toThrow('NOTIFICATION_PAGES_HANDOFF_ACTIVE_EVIDENCE_INVALID');
  });

  it('proves the receipt module tree against the exact checked-out Pages source', async () => {
    const receipts = evidence({
      deployedRecord: deployedRecord({ moduleTreeId: '1'.repeat(40) }),
    });
    const created = createHandoff(receipts);
    const { repositoryRoot, privateRoot } = privateWorkspace();
    const handoffPath = join(privateRoot, 'handoff.json');
    const keyPath = join(privateRoot, 'key.txt');
    writePrivate(handoffPath, created.bytes);
    writePrivate(keyPath, Buffer.from(`${KEY.toString('base64url')}\n`, 'utf8'));
    const fetchImpl = vi.fn() as typeof fetch;

    await expect(inspectNotificationPagesPrivateHandoff({
      handoffPath,
      keyPath,
      repositoryRoot,
      expectedHandoffDigest: created.digest,
      expectedKeyId: created.keyId,
      expectedWorkflowRunId: '123456789',
      expectedWorkflowRunAttempt: '1',
      expectedPagesSourceCommit: PAGES_COMMIT,
      expectedFounderCount: FOUNDER_COUNT,
      expectedActiveEvidenceMaximumAgeMilliseconds:
        ACTIVE_EVIDENCE_MAXIMUM_AGE_MILLISECONDS,
      expectedPreparedReceiptDigest: digest(receipts.prepared),
      expectedActiveV17EvidenceDigest: digest(receipts.active),
      expectedDeployedModuleReceiptDigest: digest(receipts.deployed),
      expectedBridgeSourceCommit: BRIDGE_COMMIT,
      fetchImpl,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_HANDOFF_MODULE_TREE_INVALID');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('requires the prepared bridge source to match the exact Pages bridge bytes', async () => {
    const receipts = { ...evidence(), prepared: preparedReceipt(DRIFTED_BRIDGE_COMMIT) };
    const created = createHandoff(receipts, DRIFTED_BRIDGE_COMMIT);
    const { repositoryRoot, privateRoot } = privateWorkspace();
    const handoffPath = join(privateRoot, 'handoff.json');
    const keyPath = join(privateRoot, 'key.txt');
    writePrivate(handoffPath, created.bytes);
    writePrivate(keyPath, Buffer.from(`${KEY.toString('base64url')}\n`, 'utf8'));
    const fetchImpl = vi.fn() as typeof fetch;

    await expect(inspectNotificationPagesPrivateHandoff({
      handoffPath,
      keyPath,
      repositoryRoot,
      expectedHandoffDigest: created.digest,
      expectedKeyId: created.keyId,
      expectedWorkflowRunId: '123456789',
      expectedWorkflowRunAttempt: '1',
      expectedPagesSourceCommit: PAGES_COMMIT,
      expectedFounderCount: FOUNDER_COUNT,
      expectedActiveEvidenceMaximumAgeMilliseconds:
        ACTIVE_EVIDENCE_MAXIMUM_AGE_MILLISECONDS,
      expectedPreparedReceiptDigest: digest(receipts.prepared),
      expectedActiveV17EvidenceDigest: digest(receipts.active),
      expectedDeployedModuleReceiptDigest: digest(receipts.deployed),
      expectedBridgeSourceCommit: DRIFTED_BRIDGE_COMMIT,
      fetchImpl,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_HANDOFF_BRIDGE_SOURCE_DRIFT');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('pins the canonical repository root and refuses paths inside it', async () => {
    const receipts = evidence();
    const created = createHandoff(receipts);
    const { repositoryRoot, privateRoot, parent } = privateWorkspace();
    const handoffPath = join(repositoryRoot, 'nonexistent-private-handoff.json');
    const keyPath = join(privateRoot, 'key.txt');
    writePrivate(keyPath, Buffer.from(`${KEY.toString('base64url')}\n`, 'utf8'));

    await expect(inspectNotificationPagesPrivateHandoff({
      handoffPath,
      keyPath,
      repositoryRoot,
      expectedHandoffDigest: created.digest,
      expectedKeyId: created.keyId,
      expectedWorkflowRunId: '123456789',
      expectedWorkflowRunAttempt: '1',
      expectedPagesSourceCommit: PAGES_COMMIT,
      expectedFounderCount: FOUNDER_COUNT,
      expectedActiveEvidenceMaximumAgeMilliseconds:
        ACTIVE_EVIDENCE_MAXIMUM_AGE_MILLISECONDS,
      expectedPreparedReceiptDigest: digest(receipts.prepared),
      expectedActiveV17EvidenceDigest: digest(receipts.active),
      expectedDeployedModuleReceiptDigest: digest(receipts.deployed),
      expectedBridgeSourceCommit: BRIDGE_COMMIT,
      fetchImpl: vi.fn() as typeof fetch,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_HANDOFF_FILE_INVALID');

    await expect(inspectNotificationPagesPrivateHandoff({
      handoffPath: join(privateRoot, 'handoff.json'),
      keyPath,
      repositoryRoot: parent,
      expectedHandoffDigest: created.digest,
      expectedKeyId: created.keyId,
      expectedWorkflowRunId: '123456789',
      expectedWorkflowRunAttempt: '1',
      expectedPagesSourceCommit: PAGES_COMMIT,
      expectedFounderCount: FOUNDER_COUNT,
      expectedActiveEvidenceMaximumAgeMilliseconds:
        ACTIVE_EVIDENCE_MAXIMUM_AGE_MILLISECONDS,
      expectedPreparedReceiptDigest: digest(receipts.prepared),
      expectedActiveV17EvidenceDigest: digest(receipts.active),
      expectedDeployedModuleReceiptDigest: digest(receipts.deployed),
      expectedBridgeSourceCommit: BRIDGE_COMMIT,
      fetchImpl: vi.fn() as typeof fetch,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_HANDOFF_REPOSITORY_INVALID');
  });
});

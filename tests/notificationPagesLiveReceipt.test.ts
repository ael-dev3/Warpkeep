// @vitest-environment node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
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
} from '../scripts/notification-pages-private-handoff.mjs';
import {
  ensureNotificationPagesLiveReceiptDirectory,
  inspectLatestPrivateNotificationPagesLiveReceiptForCandidate,
  inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit,
  NOTIFICATION_PAGES_LIVE_RECEIPT_KIND,
  parseNotificationPagesActivationPhaseSources,
  parseNotificationPagesLiveReceipt,
  promoteNotificationPagesLiveReceipt,
  writePrivateNotificationPagesLiveReceipt,
  type NotificationPagesLiveReceipt,
} from '../scripts/notification-pages-live-receipt.mjs';

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
const PREDECESSOR_COMMIT = execFileSync(
  '/usr/bin/git',
  // The final test-only commit gives promotion a protected-path-identical parent.
  ['rev-parse', '--verify', 'HEAD^^{commit}'],
  { cwd: process.cwd(), encoding: 'utf8' },
).trim();
const DRIFT_SOURCE_COMMIT = '5018d49747ffdddcc6037f5035503e1fe754675e';
const EXPECTED_ROOT_DIGEST = 'd'.repeat(64);
const DIGEST = 'e'.repeat(64);
const DEPLOYED_RECORDED_AT = '2026-08-13T11:40:00.000Z';
const ACTIVE_RECORDED_AT = '2026-08-13T11:50:00.000Z';
const PREPARED_AT = '2026-08-13T12:00:00.000Z';
const CREATED_AT = new Date('2026-08-13T12:05:00.000Z');
const NOW = new Date('2026-08-13T12:06:00.000Z');
const AFTER_PREPARED_EXPIRY = new Date('2026-08-14T14:00:00.000Z');
const ACTIVE_EXPIRES_AT = '2026-08-13T13:50:00.000Z';
const EXPIRES_AT = '2026-08-13T13:45:00.000Z';
const FOUNDER_COUNT = 100;
const ACTIVE_EVIDENCE_MAXIMUM_AGE_MILLISECONDS = 2 * 60 * 60 * 1_000;
const KEY = Buffer.alloc(32, 7);
const TARGET = Object.freeze({
  uri: 'https://maincloud.spacetimedb.com',
  database: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
  deleteData: 'never',
});
const temporaryDirectories: string[] = [];
const FRONTEND_HTML = '<!doctype html><html><head>'
  + '<link rel="canonical" href="https://warpkeep.com/">'
  + '<meta property="og:url" content="https://warpkeep.com/">'
  + '</head><body><div id="root"></div>'
  + '<script type="module" src="/assets/app.js"></script>'
  + '</body></html>';
const DYNAMIC_ASSET_REFERENCE = 'const deps=["assets/notification.css"];'
  + 'import(`./notification.js`);\n';

function sha256(bytes: Uint8Array): string {
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

function releaseAttestation(
  bridgeSourceCommit = HEAD_COMMIT,
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    schemaVersion: 1 as const,
    profile: 'warpkeep-admission-notification-bridge-v1' as const,
    bridgeSourceCommit,
    notificationDeliveryEnabled: true as const,
    notificationTransportConfigured: true as const,
    admissionNotificationStoreConfigured: true as const,
    notificationClientCount: 1 as const,
    notificationDeliveryContractDigest:
      AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
    publicAuthEnabled: true,
    accessExpectedFidRequired: false,
    ...overrides,
  };
}

function releaseResponse(
  now = NOW,
  attestation = releaseAttestation(),
  responseDate = now,
): Response {
  const response = new Response(JSON.stringify(attestation), {
    status: 200,
    headers: {
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
      date: responseDate.toUTCString(),
    },
  });
  Object.defineProperty(response, 'url', {
    value: AUTH_BRIDGE_RELEASE_ATTESTATION_URL,
  });
  Object.defineProperty(response, 'redirected', { value: false });
  return response;
}

function frontendRootResponse(): Response {
  return new Response(FRONTEND_HTML, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function frontendAssetSource(buildSha: string, suffix = ''): string {
  return `const buildSha=${JSON.stringify(buildSha)};\n`
    + DYNAMIC_ASSET_REFERENCE
    + suffix;
}

function frontendAssetResponse(buildSha = HEAD_COMMIT): Response {
  return new Response(frontendAssetSource(buildSha), {
    status: 200,
    headers: { 'content-type': 'application/javascript; charset=utf-8' },
  });
}

function frontendNotificationSource(suffix = ''): string {
  return 'import{a}from"./leaf.js";\nexport const notifications='
    + '"warpkeep-admission-notifications-presentation-enabled-v1";\n'
    + suffix;
}

function frontendLeafSource(): string {
  return 'export const a=1;\n';
}

function frontendNotificationCssSource(suffix = ''): string {
  return '.notification{background-image:url(/assets/bell.svg)}\n' + suffix;
}

function frontendBellSource(): string {
  return '<svg xmlns="http://www.w3.org/2000/svg"><path d="M1 1"/></svg>\n';
}

function expectedFrontendDigest(buildSha: string, suffix = ''): string {
  const document = Buffer.from(FRONTEND_HTML, 'utf8');
  const asset = Buffer.from(frontendAssetSource(buildSha, suffix), 'utf8');
  const notification = Buffer.from(frontendNotificationSource(), 'utf8');
  const leaf = Buffer.from(frontendLeafSource(), 'utf8');
  const notificationCss = Buffer.from(frontendNotificationCssSource(), 'utf8');
  const bell = Buffer.from(frontendBellSource(), 'utf8');
  const manifest = {
    schemaVersion: 1,
    kind: 'warpkeep-notification-pages-live-frontend-manifest-v1',
    origin: 'https://warpkeep.com',
    expectedBuildSha: buildSha,
    notificationsPresentationEnabled: true,
    document: {
      url: 'https://warpkeep.com/',
      status: 200,
      contentType: 'text/html; charset=utf-8',
      byteLength: document.byteLength,
      sha256: sha256(document),
    },
    assets: [
      {
        url: 'https://warpkeep.com/assets/app.js',
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        byteLength: asset.byteLength,
        sha256: sha256(asset),
      },
      {
        url: 'https://warpkeep.com/assets/bell.svg',
        status: 200,
        contentType: 'image/svg+xml',
        byteLength: bell.byteLength,
        sha256: sha256(bell),
      },
      {
        url: 'https://warpkeep.com/assets/leaf.js',
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        byteLength: leaf.byteLength,
        sha256: sha256(leaf),
      },
      {
        url: 'https://warpkeep.com/assets/notification.css',
        status: 200,
        contentType: 'text/css; charset=utf-8',
        byteLength: notificationCss.byteLength,
        sha256: sha256(notificationCss),
      },
      {
        url: 'https://warpkeep.com/assets/notification.js',
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        byteLength: notification.byteLength,
        sha256: sha256(notification),
      },
    ],
  };
  return createHash('sha256')
    .update('warpkeep-notification-pages-live-frontend-v1\0', 'utf8')
    .update(JSON.stringify(manifest), 'utf8')
    .digest('hex');
}

function liveFetch(options: Readonly<{
  now?: Date;
  buildSha?: string;
  attestation?: ReturnType<typeof releaseAttestation>;
  responseDate?: Date;
  assetSuffix?: string;
  notificationSuffix?: string;
  notificationCssSuffix?: string;
  presentationEnabled?: boolean;
}> = {}): ReturnType<typeof vi.fn> {
  const now = options.now ?? NOW;
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url === AUTH_BRIDGE_RELEASE_ATTESTATION_URL) {
      return releaseResponse(
        now,
        options.attestation ?? releaseAttestation(),
        options.responseDate ?? now,
      );
    }
    if (url === 'https://warpkeep.com/') return frontendRootResponse();
    if (url === 'https://warpkeep.com/assets/app.js') {
      const response = frontendAssetResponse(options.buildSha ?? HEAD_COMMIT);
      if (options.assetSuffix === undefined) return response;
      return new Response(
        frontendAssetSource(
          options.buildSha ?? HEAD_COMMIT,
          options.assetSuffix,
        ),
        { status: 200, headers: response.headers },
      );
    }
    if (url === 'https://warpkeep.com/assets/notification.js') {
      const notificationSource = options.presentationEnabled === false
        ? 'export const notifications=false;\n'
        : frontendNotificationSource(options.notificationSuffix);
      return new Response(
        notificationSource,
        {
          status: 200,
          headers: {
            'content-type': 'application/javascript; charset=utf-8',
          },
        },
      );
    }
    if (url === 'https://warpkeep.com/assets/leaf.js') {
      return new Response(frontendLeafSource(), {
        status: 200,
        headers: {
          'content-type': 'application/javascript; charset=utf-8',
        },
      });
    }
    if (url === 'https://warpkeep.com/assets/notification.css') {
      return new Response(
        frontendNotificationCssSource(options.notificationCssSuffix),
        {
          status: 200,
          headers: { 'content-type': 'text/css; charset=utf-8' },
        },
      );
    }
    if (url === 'https://warpkeep.com/assets/bell.svg') {
      return new Response(frontendBellSource(), {
        status: 200,
        headers: { 'content-type': 'image/svg+xml' },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
}

function preparedReceipt(): Buffer {
  const attestation = releaseAttestation();
  return Buffer.from(`${JSON.stringify({
    schemaVersion: 1,
    kind: 'warpkeep-auth-bridge-notification-prepared-v1',
    bridgeOrigin: 'https://auth.warpkeep.com',
    bridgeSourceCommit: HEAD_COMMIT,
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
      canonicalAuthBridgeReleaseAttestationDigest(attestation),
    preparedAt: PREPARED_AT,
    expiresAt: EXPIRES_AT,
  })}\n`, 'utf8');
}

function activeEvidence(): Buffer {
  return Buffer.from(`${JSON.stringify({
    schemaVersion: 1,
    kind: 'warpkeep-greater-realm-production-pages-active-v17-v1',
    recordedAt: ACTIVE_RECORDED_AT,
    expiresAt: ACTIVE_EXPIRES_AT,
    maximumAgeMilliseconds: ACTIVE_EVIDENCE_MAXIMUM_AGE_MILLISECONDS,
    target: TARGET,
    sourceRelease: {
      atlasSourceCommit: HEAD_COMMIT,
      atlasId: 'GR-ATLAS-LIVE-TEST',
      publicReleaseId: 'GRR-LIVE-TEST',
      expectedReleaseSha256: DIGEST,
      moduleSourceCommit: HEAD_COMMIT,
    },
    expectedFounderCount: FOUNDER_COUNT,
    founderCapacityRemaining: 600 - FOUNDER_COUNT,
    activeAdmissionEligible: true,
    activeVerification: {
      schemaVersion: 1,
      kind: 'warpkeep-greater-realm-production-active-verification-v1',
      atlasSourceCommit: HEAD_COMMIT,
      atlasId: 'GR-ATLAS-LIVE-TEST',
      publicReleaseId: 'GRR-LIVE-TEST',
      expectedReleaseSha256: DIGEST,
      moduleSourceCommit: HEAD_COMMIT,
      expectedFounderCount: FOUNDER_COUNT,
      founderCapacityRemaining: 600 - FOUNDER_COUNT,
      admissionState: 'open',
      activeClaimRows: FOUNDER_COUNT.toString(),
      occupancyRows: FOUNDER_COUNT.toString(),
      auditRows: '51',
      statusDigest: '3'.repeat(64),
    },
  }, null, 2)}\n`, 'utf8');
}

function deployedReceipt(): Buffer {
  return privateReceipt(
    'warpkeep-greater-realm-production-publish-v1',
    DEPLOYED_RECORDED_AT,
    {
      schemaVersion: 1,
      kind: 'warpkeep-greater-realm-production-publish-v1',
      lane: 'forward-activation-active-v17',
      outcome: 'verified',
      target: TARGET,
      atlasSourceCommit: HEAD_COMMIT,
      atlasId: 'GR-ATLAS-LIVE-TEST',
      publicReleaseId: 'GRR-LIVE-TEST',
      expectedReleaseSha256: DIGEST,
      moduleSourceCommit: HEAD_COMMIT,
      moduleDeltaPolicy: 'reviewed-same-schema',
      artifactDigest: '5'.repeat(64),
      v14TableSchemaDigest: '6'.repeat(64),
      v17TableSchemaDigest: '7'.repeat(64),
      predecessorTableCount: 84,
      postTableCount: 84,
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
    },
  );
}

function workspace(label = 'warpkeep-pages-live-') {
  const parent = mkdtempSync(join(realpathSync(tmpdir()), label));
  chmodSync(parent, 0o700);
  temporaryDirectories.push(parent);
  return Object.freeze({
    parent,
    directory: join(parent, 'live-receipts'),
    repositoryRoot: realpathSync(process.cwd()),
    handoffPath: join(parent, 'handoff.json'),
    keyPath: join(parent, 'handoff-key.txt'),
  });
}

function writePrivate(path: string, bytes: Uint8Array): void {
  writeFileSync(path, bytes, { mode: 0o600, flag: 'wx' });
  chmodSync(path, 0o600);
}

function handoffFixture(targetWorkspace: ReturnType<typeof workspace>) {
  const prepared = preparedReceipt();
  const active = activeEvidence();
  const deployed = deployedReceipt();
  const handoff = createNotificationPagesPrivateHandoff({
    key: Buffer.from(KEY),
    workflowRunId: '987654321',
    workflowRunAttempt: '2',
    pagesSourceCommit: HEAD_COMMIT,
    expectedFounderCount: FOUNDER_COUNT,
    activeEvidenceMaximumAgeMilliseconds:
      ACTIVE_EVIDENCE_MAXIMUM_AGE_MILLISECONDS,
    bridgeSourceCommit: HEAD_COMMIT,
    preparedReceiptBytes: prepared,
    activeV17EvidenceBytes: active,
    deployedModuleReceiptBytes: deployed,
    createdAt: CREATED_AT,
    expiresAt: new Date(EXPIRES_AT),
    randomBytesImpl: size => Buffer.alloc(size, 9),
  });
  writePrivate(targetWorkspace.handoffPath, handoff.bytes);
  writePrivate(
    targetWorkspace.keyPath,
    Buffer.from(`${KEY.toString('base64url')}\n`, 'utf8'),
  );
  return Object.freeze({
    handoff,
    expectations: Object.freeze({
      handoffPath: targetWorkspace.handoffPath,
      keyPath: targetWorkspace.keyPath,
      expectedHandoffDigest: handoff.digest,
      expectedKeyId: handoff.keyId,
      expectedWorkflowRunId: '987654321',
      expectedWorkflowRunAttempt: '2',
      expectedPagesSourceCommit: HEAD_COMMIT,
      expectedFounderCount: FOUNDER_COUNT,
      expectedActiveEvidenceMaximumAgeMilliseconds:
        ACTIVE_EVIDENCE_MAXIMUM_AGE_MILLISECONDS,
      expectedPreparedReceiptDigest: sha256(prepared),
      expectedActiveV17EvidenceDigest: sha256(active),
      expectedDeployedModuleReceiptDigest: sha256(deployed),
      expectedBridgeSourceCommit: HEAD_COMMIT,
    }),
  });
}

async function writeLiveReceipt(
  targetWorkspace = workspace(),
  fetchImpl = liveFetch(),
) {
  const handoff = handoffFixture(targetWorkspace);
  const attestation = releaseAttestation();
  const liveAttestationDigest =
    canonicalAuthBridgeReleaseAttestationDigest(attestation);
  const installed = writeCanonicalReceiptFixture(targetWorkspace, {
    schemaVersion: 1,
    kind: NOTIFICATION_PAGES_LIVE_RECEIPT_KIND,
    recordedAt: NOW.toISOString(),
    repository: 'ael-dev3/Warpkeep',
    handoff: {
      digest: handoff.handoff.digest,
      keyId: handoff.handoff.keyId,
      workflow: '.github/workflows/deploy-pages.yml',
      workflowRunId: '987654321',
      workflowRunAttempt: '2',
      createdAt: CREATED_AT.toISOString(),
      expiresAt: EXPIRES_AT,
      preparedReceiptDigest: handoff.expectations.expectedPreparedReceiptDigest,
      activeV17EvidenceDigest: handoff.expectations.expectedActiveV17EvidenceDigest,
      deployedModuleReceiptDigest:
        handoff.expectations.expectedDeployedModuleReceiptDigest,
      activeEvidenceMaximumAgeMilliseconds:
        ACTIVE_EVIDENCE_MAXIMUM_AGE_MILLISECONDS,
    },
    chain: {
      generation: 0,
      previousReceiptDigest: null,
      previousPagesSourceCommit: null,
    },
    pages: {
      origin: 'https://warpkeep.com',
      sourceCommit: HEAD_COMMIT,
      liveBuildSha: HEAD_COMMIT,
      liveFrontendDigest: expectedFrontendDigest(HEAD_COMMIT),
      rootAssetCount: 5,
      notificationsPresentationEnabled: true,
      hermesExecutionApprovedAtActivation: false,
    },
    bridge: {
      origin: 'https://auth.warpkeep.com',
      sourceCommit: HEAD_COMMIT,
      liveAttestationDigest,
      liveAttestation: attestation,
    },
    sourceRelease: {
      atlasSourceCommit: HEAD_COMMIT,
      atlasId: 'GR-ATLAS-LIVE-TEST',
      publicReleaseId: 'GRR-LIVE-TEST',
      expectedReleaseSha256: DIGEST,
      moduleSourceCommit: HEAD_COMMIT,
    },
    expectedFounderCount: FOUNDER_COUNT,
    preparedBinding: {
      receiptDigest: handoff.expectations.expectedPreparedReceiptDigest,
      bridgeOrigin: 'https://auth.warpkeep.com',
      bridgeSourceCommit: HEAD_COMMIT,
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
      liveAttestationDigest,
      preparedAt: PREPARED_AT,
      expiresAt: EXPIRES_AT,
    },
  });
  ensureNotificationPagesLiveReceiptDirectory({
    directory: targetWorkspace.directory,
    repositoryRoot: targetWorkspace.repositoryRoot,
  });
  const result = Object.freeze({
    ...installed,
    result: 'installed' as const,
    preparedBinding: installed.receipt.preparedBinding,
    chainRootReceiptDigest: installed.receiptDigest,
    chainRootPagesSourceCommit: HEAD_COMMIT,
  });
  return Object.freeze({ targetWorkspace, handoff, result, fetchImpl });
}

function rootExpectation(result: Readonly<{
  chainRootReceiptDigest: string;
  chainRootPagesSourceCommit: string;
}>) {
  return {
    expectedChainRootReceiptDigest: result.chainRootReceiptDigest,
    expectedChainRootPagesSourceCommit: result.chainRootPagesSourceCommit,
  };
}

function deepMutableReceipt(receipt: NotificationPagesLiveReceipt) {
  return JSON.parse(JSON.stringify(receipt)) as Record<string, any>;
}

function writeCanonicalReceiptFixture(
  targetWorkspace: ReturnType<typeof workspace>,
  receipt: unknown,
) {
  const parsed = parseNotificationPagesLiveReceipt(receipt, { now: NOW });
  const bytes = Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  const receiptDigest = sha256(bytes);
  ensureNotificationPagesLiveReceiptDirectory({
    directory: targetWorkspace.directory,
    repositoryRoot: targetWorkspace.repositoryRoot,
  });
  const path = join(
    targetWorkspace.directory,
    `notification-pages-live-${receiptDigest}.json`,
  );
  writePrivate(path, bytes);
  return Object.freeze({ path, receiptDigest, receipt: parsed });
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('notification Pages ongoing live receipt', () => {
  it('structurally rejects commented and scalar activation-phase decoys', () => {
    const pages = "jobs:\n  build:\n    env:\n      VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'true'\n";
    const hermes = 'export const '
      + 'FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = false as const;\n';
    expect(parseNotificationPagesActivationPhaseSources({
      pagesWorkflowSource: pages,
      hermesSource: hermes,
    })).toEqual({
      pagesPresentationEnabled: true,
      hermesExecutionApproved: false,
    });
    for (const decoy of [
      `/*\n${hermes}*/\n`,
      `const decoy = \`${hermes}\`;\n`,
    ]) {
      expect(() => parseNotificationPagesActivationPhaseSources({
        pagesWorkflowSource: pages,
        hermesSource: decoy,
      })).toThrow('NOTIFICATION_PAGES_LIVE_HERMES_PHASE_INVALID');
    }
    expect(() => parseNotificationPagesActivationPhaseSources({
      pagesWorkflowSource: 'decoy: |\n  jobs:\n    build:\n      env:\n'
        + "        VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'true'\n",
      hermesSource: hermes,
    })).toThrow('NOTIFICATION_PAGES_LIVE_PAGES_PHASE_INVALID');
  });

  it('binds every authority tuple and installs owner-only fixture bytes', async () => {
    const written = await writeLiveReceipt();

    expect(written.fetchImpl).not.toHaveBeenCalled();
    expect(written.result).toMatchObject({
      result: 'installed',
      receipt: {
        schemaVersion: 1,
        kind: NOTIFICATION_PAGES_LIVE_RECEIPT_KIND,
        recordedAt: NOW.toISOString(),
        repository: 'ael-dev3/Warpkeep',
        handoff: {
          digest: written.handoff.handoff.digest,
          workflowRunId: '987654321',
          workflowRunAttempt: '2',
        },
        pages: {
          origin: 'https://warpkeep.com',
          sourceCommit: HEAD_COMMIT,
          liveBuildSha: HEAD_COMMIT,
          liveFrontendDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
          rootAssetCount: 5,
          notificationsPresentationEnabled: true,
          hermesExecutionApprovedAtActivation: false,
        },
        bridge: {
          origin: 'https://auth.warpkeep.com',
          sourceCommit: HEAD_COMMIT,
        },
        sourceRelease: {
          atlasSourceCommit: HEAD_COMMIT,
          moduleSourceCommit: HEAD_COMMIT,
        },
        expectedFounderCount: FOUNDER_COUNT,
      },
      preparedBinding: {
        receiptDigest:
          written.handoff.expectations.expectedPreparedReceiptDigest,
        bridgeSourceCommit: HEAD_COMMIT,
        hermesExecutionApproved: false,
        pagesPresentationEnabled: false,
      },
    });
    expect(written.result.path).toBe(join(
      written.targetWorkspace.directory,
      `notification-pages-live-${written.result.receiptDigest}.json`,
    ));
    expect(statSync(written.targetWorkspace.directory).mode & 0o7777).toBe(0o700);
    expect(statSync(written.result.path).mode & 0o7777).toBe(0o600);
    expect(statSync(written.result.path).nlink).toBe(1);
    expect(sha256(readFileSync(written.result.path))).toBe(
      written.result.receiptDigest,
    );
    expect(written.result.chainRootReceiptDigest).toBe(
      written.result.receiptDigest,
    );
    expect(written.result.chainRootPagesSourceCommit).toBe(HEAD_COMMIT);
    const sourceReservation = join(
      written.targetWorkspace.directory,
      `notification-pages-live-source-${HEAD_COMMIT}.json`,
    );
    expect(statSync(sourceReservation).mode & 0o7777).toBe(0o600);
    expect(statSync(sourceReservation).nlink).toBe(1);
    expect(statSync(sourceReservation).ino).not.toBe(
      statSync(written.result.path).ino,
    );
  });

  it('does not expire with preparation and re-fetches exact Pages and bridge state on every exact read', async () => {
    const written = await writeLiveReceipt();
    const firstFetch = liveFetch({ now: AFTER_PREPARED_EXPIRY });
    const first = await inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
      pagesSourceCommit: HEAD_COMMIT,
      ...rootExpectation(written.result),
      fetchImpl: firstFetch as unknown as typeof fetch,
      now: AFTER_PREPARED_EXPIRY,
    });
    const secondFetch = liveFetch({ now: AFTER_PREPARED_EXPIRY });
    const second = await inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
      pagesSourceCommit: HEAD_COMMIT,
      ...rootExpectation(written.result),
      fetchImpl: secondFetch as unknown as typeof fetch,
      now: AFTER_PREPARED_EXPIRY,
    });

    expect(first.receiptDigest).toBe(written.result.receiptDigest);
    expect(second.preparedBinding).toEqual(written.result.preparedBinding);
    expect(firstFetch.mock.calls.map(call => String(call[0]))).toEqual([
      'https://warpkeep.com/',
      'https://warpkeep.com/assets/app.js',
      'https://warpkeep.com/assets/notification.css',
      'https://warpkeep.com/assets/notification.js',
      'https://warpkeep.com/assets/bell.svg',
      'https://warpkeep.com/assets/leaf.js',
      AUTH_BRIDGE_RELEASE_ATTESTATION_URL,
    ]);
    expect(secondFetch).toHaveBeenCalledTimes(7);
  });

  it('fails closed for missing sources, wrong live builds, bridge mismatches, and stale bridge evidence', async () => {
    const missingWorkspace = workspace('warpkeep-pages-live-missing-');
    ensureNotificationPagesLiveReceiptDirectory({
      directory: missingWorkspace.directory,
      repositoryRoot: missingWorkspace.repositoryRoot,
    });
    const missingFetch = liveFetch();
    await expect(inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit({
      directory: missingWorkspace.directory,
      repositoryRoot: missingWorkspace.repositoryRoot,
      pagesSourceCommit: HEAD_COMMIT,
      expectedChainRootReceiptDigest: EXPECTED_ROOT_DIGEST,
      expectedChainRootPagesSourceCommit: HEAD_COMMIT,
      fetchImpl: missingFetch as unknown as typeof fetch,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_RECEIPT_NOT_FOUND');
    expect(missingFetch).not.toHaveBeenCalled();

    const written = await writeLiveReceipt();
    const wrongRootFetch = liveFetch();
    await expect(inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
      pagesSourceCommit: HEAD_COMMIT,
      expectedChainRootReceiptDigest: EXPECTED_ROOT_DIGEST,
      expectedChainRootPagesSourceCommit: HEAD_COMMIT,
      fetchImpl: wrongRootFetch as unknown as typeof fetch,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_CHAIN_ROOT_MISMATCH');
    expect(wrongRootFetch).not.toHaveBeenCalled();
    const dynamicMutationFetch = liveFetch({
      notificationSuffix: '// mutated notification chunk\n',
    });
    await expect(inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
      pagesSourceCommit: HEAD_COMMIT,
      ...rootExpectation(written.result),
      fetchImpl: dynamicMutationFetch as unknown as typeof fetch,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_FRONTEND_CONTENT_MISMATCH');
    expect(dynamicMutationFetch.mock.calls.map(call => String(call[0])))
      .toContain('https://warpkeep.com/assets/notification.js');
    const cssMutationFetch = liveFetch({
      notificationCssSuffix: '/* hide opt-in */\n',
    });
    await expect(inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
      pagesSourceCommit: HEAD_COMMIT,
      ...rootExpectation(written.result),
      fetchImpl: cssMutationFetch as unknown as typeof fetch,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_FRONTEND_CONTENT_MISMATCH');
    const offPresentationFetch = liveFetch({ presentationEnabled: false });
    await expect(inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
      pagesSourceCommit: HEAD_COMMIT,
      ...rootExpectation(written.result),
      fetchImpl: offPresentationFetch as unknown as typeof fetch,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_PRESENTATION_MARKER_INVALID');
    const wrongBuildFetch = liveFetch({ buildSha: DRIFT_SOURCE_COMMIT });
    await expect(inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
      pagesSourceCommit: HEAD_COMMIT,
      ...rootExpectation(written.result),
      fetchImpl: wrongBuildFetch as unknown as typeof fetch,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_FRONTEND_MISMATCH');
    expect(wrongBuildFetch).toHaveBeenCalledTimes(2);

    const mismatchFetch = liveFetch({
      attestation: releaseAttestation(HEAD_COMMIT, { publicAuthEnabled: false }),
    });
    await expect(inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
      pagesSourceCommit: HEAD_COMMIT,
      ...rootExpectation(written.result),
      fetchImpl: mismatchFetch as unknown as typeof fetch,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_BRIDGE_ATTESTATION_MISMATCH');

    const staleFetch = liveFetch({
      now: AFTER_PREPARED_EXPIRY,
      responseDate: new Date(AFTER_PREPARED_EXPIRY.getTime() - 6 * 60 * 1_000),
    });
    await expect(inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
      pagesSourceCommit: HEAD_COMMIT,
      ...rootExpectation(written.result),
      fetchImpl: staleFetch as unknown as typeof fetch,
      now: AFTER_PREPARED_EXPIRY,
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_BRIDGE_ATTESTATION_INVALID');
  });

  it('uses the exact current live source and rejects a future candidate with protected drift before network', async () => {
    const written = await writeLiveReceipt();
    const noDriftFetch = liveFetch({ now: AFTER_PREPARED_EXPIRY });
    const noDrift = await inspectLatestPrivateNotificationPagesLiveReceiptForCandidate({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
      candidatePagesSourceCommit: HEAD_COMMIT,
      ...rootExpectation(written.result),
      fetchImpl: noDriftFetch as unknown as typeof fetch,
      now: AFTER_PREPARED_EXPIRY,
    });
    expect(noDrift).toMatchObject({
      candidatePagesSourceCommit: HEAD_COMMIT,
      livePagesSourceCommit: HEAD_COMMIT,
      receiptDigest: written.result.receiptDigest,
      candidateAlreadyLive: true,
    });

    const wrongRootFetch = liveFetch({ now: AFTER_PREPARED_EXPIRY });
    await expect(inspectLatestPrivateNotificationPagesLiveReceiptForCandidate({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
      candidatePagesSourceCommit: HEAD_COMMIT,
      expectedChainRootReceiptDigest: EXPECTED_ROOT_DIGEST,
      expectedChainRootPagesSourceCommit: HEAD_COMMIT,
      fetchImpl: wrongRootFetch as unknown as typeof fetch,
      now: AFTER_PREPARED_EXPIRY,
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_CHAIN_ROOT_MISMATCH');
    expect(wrongRootFetch).not.toHaveBeenCalled();

    const driftWorkspace = workspace('warpkeep-pages-live-drift-');
    const old = deepMutableReceipt(written.result.receipt);
    old.pages.sourceCommit = DRIFT_SOURCE_COMMIT;
    old.pages.liveBuildSha = DRIFT_SOURCE_COMMIT;
    old.bridge.sourceCommit = DRIFT_SOURCE_COMMIT;
    old.bridge.liveAttestation.bridgeSourceCommit = DRIFT_SOURCE_COMMIT;
    old.bridge.liveAttestationDigest =
      canonicalAuthBridgeReleaseAttestationDigest(old.bridge.liveAttestation);
    old.sourceRelease.atlasSourceCommit = DRIFT_SOURCE_COMMIT;
    old.sourceRelease.moduleSourceCommit = DRIFT_SOURCE_COMMIT;
    old.preparedBinding.bridgeSourceCommit = DRIFT_SOURCE_COMMIT;
    old.preparedBinding.liveAttestationDigest = old.bridge.liveAttestationDigest;
    const installedOld = writeCanonicalReceiptFixture(driftWorkspace, old);
    const driftFetch = liveFetch({
      buildSha: DRIFT_SOURCE_COMMIT,
      attestation: releaseAttestation(DRIFT_SOURCE_COMMIT),
    });

    await expect(inspectLatestPrivateNotificationPagesLiveReceiptForCandidate({
      directory: driftWorkspace.directory,
      repositoryRoot: driftWorkspace.repositoryRoot,
      candidatePagesSourceCommit: HEAD_COMMIT,
      expectedChainRootReceiptDigest: installedOld.receiptDigest,
      expectedChainRootPagesSourceCommit: DRIFT_SOURCE_COMMIT,
      fetchImpl: driftFetch as unknown as typeof fetch,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_CANDIDATE_NOTIFICATION_DRIFT');
    expect(driftFetch).not.toHaveBeenCalled();
  });

  it('repairs the exact nlink=2 publication suffix and rejects hard-link or inventory pollution', async () => {
    const written = await writeLiveReceipt();
    const temporary = join(
      written.targetWorkspace.directory,
      `.notification-pages-live-${written.result.receiptDigest}`
        + `-${'1'.repeat(24)}.json.tmp`,
    );
    linkSync(written.result.path, temporary);
    expect(lstatSync(written.result.path).nlink).toBe(2);
    expect(ensureNotificationPagesLiveReceiptDirectory({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
    })).toBe(written.targetWorkspace.directory);
    expect(lstatSync(written.result.path).nlink).toBe(1);
    expect(readdirSync(written.targetWorkspace.directory)).toEqual([
      `notification-pages-live-${written.result.receiptDigest}.json`,
      'notification-pages-live-root.json',
      `notification-pages-live-source-${HEAD_COMMIT}.json`,
    ]);

    const hardLink = join(
      written.targetWorkspace.directory,
      `notification-pages-live-${'f'.repeat(64)}.json`,
    );
    linkSync(written.result.path, hardLink);
    expect(() => ensureNotificationPagesLiveReceiptDirectory({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
    })).toThrow('NOTIFICATION_PAGES_LIVE_RECEIPT_FILE_INVALID');

    const sourceCrashWorkspace = workspace('warpkeep-pages-live-source-crash-');
    ensureNotificationPagesLiveReceiptDirectory({
      directory: sourceCrashWorkspace.directory,
      repositoryRoot: sourceCrashWorkspace.repositoryRoot,
    });
    const sourceOnlyPath = join(
      sourceCrashWorkspace.directory,
      `notification-pages-live-source-${HEAD_COMMIT}.json`,
    );
    writePrivate(sourceOnlyPath, readFileSync(written.result.path));
    expect(ensureNotificationPagesLiveReceiptDirectory({
      directory: sourceCrashWorkspace.directory,
      repositoryRoot: sourceCrashWorkspace.repositoryRoot,
    })).toBe(sourceCrashWorkspace.directory);
    const repairedContentPath = join(
      sourceCrashWorkspace.directory,
      `notification-pages-live-${written.result.receiptDigest}.json`,
    );
    expect(sha256(readFileSync(repairedContentPath))).toBe(
      written.result.receiptDigest,
    );
    expect(statSync(sourceOnlyPath).nlink).toBe(1);
    expect(statSync(repairedContentPath).nlink).toBe(1);
    expect(statSync(sourceOnlyPath).ino).not.toBe(
      statSync(repairedContentPath).ino,
    );

    const contentCrashWorkspace = workspace('warpkeep-pages-live-content-crash-');
    ensureNotificationPagesLiveReceiptDirectory({
      directory: contentCrashWorkspace.directory,
      repositoryRoot: contentCrashWorkspace.repositoryRoot,
    });
    const contentOnlyPath = join(
      contentCrashWorkspace.directory,
      `notification-pages-live-${written.result.receiptDigest}.json`,
    );
    writePrivate(contentOnlyPath, readFileSync(written.result.path));
    expect(ensureNotificationPagesLiveReceiptDirectory({
      directory: contentCrashWorkspace.directory,
      repositoryRoot: contentCrashWorkspace.repositoryRoot,
    })).toBe(contentCrashWorkspace.directory);
    expect(readFileSync(join(
      contentCrashWorkspace.directory,
      `notification-pages-live-source-${HEAD_COMMIT}.json`,
    ))).toEqual(readFileSync(contentOnlyPath));

    const boundedWorkspace = workspace('warpkeep-pages-live-bounded-');
    ensureNotificationPagesLiveReceiptDirectory({
      directory: boundedWorkspace.directory,
      repositoryRoot: boundedWorkspace.repositoryRoot,
    });
    for (let index = 0; index < 257; index += 1) {
      const suffix = index.toString(16).padStart(24, '0');
      writeFileSync(join(
        boundedWorkspace.directory,
        `.notification-pages-live-${'a'.repeat(64)}-${suffix}.json.tmp`,
      ), '', { mode: 0o600, flag: 'wx' });
    }
    expect(() => ensureNotificationPagesLiveReceiptDirectory({
      directory: boundedWorkspace.directory,
      repositoryRoot: boundedWorkspace.repositoryRoot,
    })).toThrow('NOTIFICATION_PAGES_LIVE_DIRECTORY_INVENTORY_EXCEEDED');
  });

  it('promotes a verified candidate into a replay-safe successor chain', async () => {
    const targetWorkspace = workspace('warpkeep-pages-live-promote-');
    const previous = deepMutableReceipt((await writeLiveReceipt()).result.receipt);
    previous.pages.sourceCommit = PREDECESSOR_COMMIT;
    previous.pages.liveBuildSha = previous.pages.sourceCommit;
    previous.pages.liveFrontendDigest = expectedFrontendDigest(
      previous.pages.sourceCommit,
    );
    previous.bridge.sourceCommit = PREDECESSOR_COMMIT;
    previous.bridge.liveAttestation.bridgeSourceCommit = PREDECESSOR_COMMIT;
    previous.bridge.liveAttestationDigest =
      canonicalAuthBridgeReleaseAttestationDigest(
        previous.bridge.liveAttestation,
      );
    previous.sourceRelease.atlasSourceCommit = PREDECESSOR_COMMIT;
    previous.sourceRelease.moduleSourceCommit = PREDECESSOR_COMMIT;
    previous.preparedBinding.bridgeSourceCommit = PREDECESSOR_COMMIT;
    previous.preparedBinding.liveAttestationDigest =
      previous.bridge.liveAttestationDigest;
    const installedPrevious = writeCanonicalReceiptFixture(
      targetWorkspace,
      previous,
    );
    const staged = handoffFixture(targetWorkspace);
    const stagedBridge = releaseAttestation(HEAD_COMMIT);
    const authorityFetch = liveFetch({
      buildSha: previous.pages.sourceCommit,
      attestation: stagedBridge,
    });
    const authority = await inspectLatestPrivateNotificationPagesLiveReceiptForCandidate({
      directory: targetWorkspace.directory,
      repositoryRoot: targetWorkspace.repositoryRoot,
      candidatePagesSourceCommit: HEAD_COMMIT,
      expectedChainRootReceiptDigest: installedPrevious.receiptDigest,
      expectedChainRootPagesSourceCommit: PREDECESSOR_COMMIT,
      stagedHandoffExpectations: staged.expectations,
      fetchImpl: authorityFetch as unknown as typeof fetch,
      now: NOW,
      randomBytesImpl: size => Buffer.alloc(size, 8),
    });
    if (authority.candidateAlreadyLive) {
      throw new Error('expected a future-candidate authority');
    }
    expect(authority.candidateAuthorityPath).toBe(join(
      targetWorkspace.directory,
      `notification-pages-candidate-${authority.candidateAuthorityDigest}.json`,
    ));
    expect(sha256(readFileSync(authority.candidateAuthorityPath))).toBe(
      authority.candidateAuthorityDigest,
    );
    expect(statSync(authority.candidateAuthorityPath).mode & 0o7777).toBe(0o600);
    expect(statSync(authority.candidateAuthorityPath).nlink).toBe(1);
    expect(authority.candidatePreparedBinding).toMatchObject({
      bridgeSourceCommit: HEAD_COMMIT,
      receiptDigest: staged.expectations.expectedPreparedReceiptDigest,
    });
    expect(authority.candidateLiveAttestation).toMatchObject({
      bridgeSourceCommit: HEAD_COMMIT,
    });

    const candidateTemporary = join(
      targetWorkspace.directory,
      `.notification-pages-candidate-${authority.candidateAuthorityDigest}`
        + `-${'2'.repeat(24)}.json.tmp`,
    );
    linkSync(authority.candidateAuthorityPath, candidateTemporary);
    expect(lstatSync(authority.candidateAuthorityPath).nlink).toBe(2);
    expect(ensureNotificationPagesLiveReceiptDirectory({
      directory: targetWorkspace.directory,
      repositoryRoot: targetWorkspace.repositoryRoot,
    })).toBe(targetWorkspace.directory);
    expect(lstatSync(authority.candidateAuthorityPath).nlink).toBe(1);
    rmSync(targetWorkspace.handoffPath);
    rmSync(targetWorkspace.keyPath);

    const promotedFetch = liveFetch({
      now: AFTER_PREPARED_EXPIRY,
      assetSuffix: '// successor\n',
      attestation: stagedBridge,
    });
    const promoted = await promoteNotificationPagesLiveReceipt({
      directory: targetWorkspace.directory,
      repositoryRoot: targetWorkspace.repositoryRoot,
      candidateAuthorityDigest: authority.candidateAuthorityDigest,
      candidatePagesSourceCommit: HEAD_COMMIT,
      expectedChainRootReceiptDigest: installedPrevious.receiptDigest,
      expectedChainRootPagesSourceCommit: PREDECESSOR_COMMIT,
      fetchImpl: promotedFetch as unknown as typeof fetch,
      now: AFTER_PREPARED_EXPIRY,
      randomBytesImpl: size => Buffer.alloc(size, 5),
    });
    expect(promoted).toMatchObject({
      result: 'installed',
      receipt: {
        chain: {
          generation: 1,
          previousReceiptDigest: installedPrevious.receiptDigest,
          previousPagesSourceCommit: previous.pages.sourceCommit,
        },
        pages: {
          sourceCommit: HEAD_COMMIT,
          liveBuildSha: HEAD_COMMIT,
          rootAssetCount: 5,
        },
        bridge: { sourceCommit: HEAD_COMMIT },
      },
    });
    expect(promoted.receipt.pages.liveFrontendDigest).not.toBe(
      installedPrevious.receipt.pages.liveFrontendDigest,
    );

    const replayFetch = liveFetch({
      now: new Date(AFTER_PREPARED_EXPIRY.getTime() + 1),
      assetSuffix: '// successor\n',
      attestation: stagedBridge,
    });
    const replay = await promoteNotificationPagesLiveReceipt({
      directory: targetWorkspace.directory,
      repositoryRoot: targetWorkspace.repositoryRoot,
      candidateAuthorityDigest: authority.candidateAuthorityDigest,
      candidatePagesSourceCommit: HEAD_COMMIT,
      expectedChainRootReceiptDigest: installedPrevious.receiptDigest,
      expectedChainRootPagesSourceCommit: PREDECESSOR_COMMIT,
      fetchImpl: replayFetch as unknown as typeof fetch,
      now: new Date(AFTER_PREPARED_EXPIRY.getTime() + 1),
      randomBytesImpl: size => Buffer.alloc(size, 6),
    });
    expect(replay).toMatchObject({
      result: 'unchanged',
      path: promoted.path,
      receiptDigest: promoted.receiptDigest,
    });

    const afterPromotionFetch = liveFetch({
      now: new Date(AFTER_PREPARED_EXPIRY.getTime() + 2),
      assetSuffix: '// successor\n',
      attestation: stagedBridge,
    });
    await expect(inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit({
      directory: targetWorkspace.directory,
      repositoryRoot: targetWorkspace.repositoryRoot,
      pagesSourceCommit: previous.pages.sourceCommit,
      expectedChainRootReceiptDigest: installedPrevious.receiptDigest,
      expectedChainRootPagesSourceCommit: PREDECESSOR_COMMIT,
      fetchImpl: afterPromotionFetch as unknown as typeof fetch,
      now: new Date(NOW.getTime() + 3),
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_EXPECTED_PAGES_SOURCE_NOT_HEAD');
    expect(afterPromotionFetch).not.toHaveBeenCalled();

    const exactSuccessorFetch = liveFetch({
      now: new Date(AFTER_PREPARED_EXPIRY.getTime() + 3),
      assetSuffix: '// successor\n',
      attestation: stagedBridge,
    });
    await expect(inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit({
      directory: targetWorkspace.directory,
      repositoryRoot: targetWorkspace.repositoryRoot,
      pagesSourceCommit: HEAD_COMMIT,
      expectedChainRootReceiptDigest: installedPrevious.receiptDigest,
      expectedChainRootPagesSourceCommit: PREDECESSOR_COMMIT,
      fetchImpl: exactSuccessorFetch as unknown as typeof fetch,
      now: new Date(AFTER_PREPARED_EXPIRY.getTime() + 3),
    })).resolves.toMatchObject({ receiptDigest: promoted.receiptDigest });
  });

  it('performs no network work for invalid static input or a non-HEAD candidate', async () => {
    const targetWorkspace = workspace('warpkeep-pages-live-static-');
    const fetchImpl = liveFetch();
    await expect(inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit({
      directory: targetWorkspace.directory,
      repositoryRoot: targetWorkspace.repositoryRoot,
      pagesSourceCommit: 'not-a-commit',
      expectedChainRootReceiptDigest: EXPECTED_ROOT_DIGEST,
      expectedChainRootPagesSourceCommit: HEAD_COMMIT,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_EXPECTED_PAGES_SOURCE_INVALID');

    await expect(inspectLatestPrivateNotificationPagesLiveReceiptForCandidate({
      directory: targetWorkspace.directory,
      repositoryRoot: targetWorkspace.repositoryRoot,
      candidatePagesSourceCommit: DRIFT_SOURCE_COMMIT,
      expectedChainRootReceiptDigest: EXPECTED_ROOT_DIGEST,
      expectedChainRootPagesSourceCommit: HEAD_COMMIT,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_CANDIDATE_NOT_HEAD');

    const fixture = handoffFixture(targetWorkspace);
    await expect(writePrivateNotificationPagesLiveReceipt({
      directory: targetWorkspace.directory,
      repositoryRoot: targetWorkspace.repositoryRoot,
      handoffExpectations: fixture.expectations,
      expectedNotificationsPresentationEnabled: true,
      expectedHermesExecutionApproved: false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_ACTIVATION_PHASE_INVALID');
    expect(fetchImpl).not.toHaveBeenCalled();

    await expect(writePrivateNotificationPagesLiveReceipt({
      directory: join(targetWorkspace.repositoryRoot, '.private-live'),
      repositoryRoot: targetWorkspace.repositoryRoot,
      handoffExpectations: fixture.expectations,
      expectedNotificationsPresentationEnabled: true,
      expectedHermesExecutionApproved: false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_REPOSITORY_OVERLAP');

    await expect(writePrivateNotificationPagesLiveReceipt({
      directory: targetWorkspace.directory,
      repositoryRoot: targetWorkspace.repositoryRoot,
      handoffExpectations: fixture.expectations,
      expectedNotificationsPresentationEnabled: false as true,
      expectedHermesExecutionApproved: false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_ACTIVATION_PHASE_INVALID');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

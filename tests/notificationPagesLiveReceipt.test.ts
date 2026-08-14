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
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

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
  assertNotificationPagesLiveHermesSourceTransition,
  assertNotificationPagesLivePresentationSourceNoDrift,
  deriveNotificationPagesLivePresentationSourceClosure,
  ensureNotificationPagesLiveReceiptDirectory,
  inspectLatestPrivateNotificationPagesLiveReceiptForCandidate,
  inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit,
  NOTIFICATION_PAGES_LIVE_CANDIDATE_PROTECTED_PATHS,
  NOTIFICATION_PAGES_LIVE_PROTECTED_PATHS,
  NOTIFICATION_PAGES_LIVE_RECEIPT_KIND,
  parseNotificationPagesLiveReleaseBindingSource,
  parseNotificationPagesActivationPhaseSources,
  parseNotificationPagesLiveReceipt,
  promoteNotificationPagesLiveReceipt,
  reconcileNotificationPagesLiveCandidate,
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
function protectedIdenticalAncestor(): string {
  const ancestors = execFileSync(
    '/usr/bin/git',
    // Pull-request verification checks out GitHub's synthetic merge commit.
    // Search the histories of every parent so the protected-identical anchor
    // on the candidate branch remains visible without weakening the byte diff.
    ['rev-list', '--topo-order', 'HEAD^@'],
    { cwd: process.cwd(), encoding: 'utf8' },
  ).trim().split('\n');
  for (const ancestor of ancestors) {
    try {
      execFileSync(
        '/usr/bin/git',
        [
          'diff', '--quiet', '--no-ext-diff', '--no-textconv', ancestor,
          HEAD_COMMIT, '--', ...NOTIFICATION_PAGES_LIVE_PROTECTED_PATHS,
        ],
        { cwd: process.cwd(), stdio: 'ignore' },
      );
      return ancestor;
    } catch {
      // Continue to the next first-parent ancestor.
    }
  }
  // A security-infrastructure change may intentionally establish a new
  // protected anchor. The only fixtures that use this value exercise terminal
  // chain capacity or a transition that must be rejected; a real parent keeps
  // those checks fail-closed without manufacturing an unreviewed predecessor.
  return execFileSync(
    '/usr/bin/git',
    ['rev-parse', '--verify', 'HEAD^'],
    { cwd: process.cwd(), encoding: 'utf8' },
  ).trim();
}

const PREDECESSOR_COMMIT = protectedIdenticalAncestor();
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

function descendantCommitWithMutation(path: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'warpkeep-live-source-commit-'));
  temporaryDirectories.push(directory);
  const indexPath = join(directory, 'index');
  const environment = {
    ...process.env,
    GIT_INDEX_FILE: indexPath,
    GIT_AUTHOR_NAME: 'Warpkeep Receipt Test',
    GIT_AUTHOR_EMAIL: 'receipt-test@warpkeep.invalid',
    GIT_AUTHOR_DATE: '1700000000 +0000',
    GIT_COMMITTER_NAME: 'Warpkeep Receipt Test',
    GIT_COMMITTER_EMAIL: 'receipt-test@warpkeep.invalid',
    GIT_COMMITTER_DATE: '1700000000 +0000',
  };
  execFileSync('/usr/bin/git', ['read-tree', HEAD_COMMIT], {
    cwd: process.cwd(),
    env: environment,
    stdio: 'ignore',
  });
  const treeEntry = execFileSync(
    '/usr/bin/git',
    ['ls-tree', HEAD_COMMIT, '--', path],
    { cwd: process.cwd(), encoding: 'utf8' },
  ).trim();
  const match = /^(100644|100755) blob [0-9a-f]{40}\t/u.exec(treeEntry);
  if (match === null) throw new Error(`missing mutable blob ${path}`);
  const original = execFileSync(
    '/usr/bin/git',
    ['show', `${HEAD_COMMIT}:${path}`],
    { cwd: process.cwd(), encoding: 'buffer' },
  );
  const mutated = Buffer.concat([
    original,
    Buffer.from(`\n/* notification-pages-live-test:${path} */\n`, 'utf8'),
  ]);
  const objectId = execFileSync(
    '/usr/bin/git',
    ['hash-object', '-w', '--stdin'],
    { cwd: process.cwd(), encoding: 'utf8', input: mutated },
  ).trim();
  original.fill(0);
  mutated.fill(0);
  execFileSync(
    '/usr/bin/git',
    ['update-index', '--add', '--cacheinfo', match[1], objectId, path],
    { cwd: process.cwd(), env: environment, stdio: 'ignore' },
  );
  const tree = execFileSync('/usr/bin/git', ['write-tree'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: environment,
  }).trim();
  return execFileSync(
    '/usr/bin/git',
    ['commit-tree', tree, '-p', HEAD_COMMIT],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: environment,
      input: `test mutation ${path}\n`,
    },
  ).trim();
}

function descendantCommitWithSources(
  parent: string,
  sources: Readonly<Record<string, string>>,
): string {
  const directory = mkdtempSync(join(tmpdir(), 'warpkeep-live-source-tree-'));
  temporaryDirectories.push(directory);
  const indexPath = join(directory, 'index');
  const environment = {
    ...process.env,
    GIT_INDEX_FILE: indexPath,
    GIT_AUTHOR_NAME: 'Warpkeep Receipt Test',
    GIT_AUTHOR_EMAIL: 'receipt-test@warpkeep.invalid',
    GIT_AUTHOR_DATE: '1700000000 +0000',
    GIT_COMMITTER_NAME: 'Warpkeep Receipt Test',
    GIT_COMMITTER_EMAIL: 'receipt-test@warpkeep.invalid',
    GIT_COMMITTER_DATE: '1700000000 +0000',
  };
  execFileSync('/usr/bin/git', ['read-tree', parent], {
    cwd: process.cwd(),
    env: environment,
    stdio: 'ignore',
  });
  for (const [index, [path, source]] of Object.entries(sources).entries()) {
    const treeEntry = execFileSync(
      '/usr/bin/git',
      ['ls-tree', parent, '--', path],
      { cwd: process.cwd(), encoding: 'utf8' },
    ).trim();
    const match = /^(100644|100755) blob [0-9a-f]{40}\t/u.exec(treeEntry);
    const mode = match?.[1] ?? '100644';
    const sourcePath = join(directory, `source-${index}`);
    writeFileSync(sourcePath, source, { mode: 0o600, flag: 'wx' });
    const objectId = execFileSync(
      '/usr/bin/git',
      ['hash-object', '-w', sourcePath],
      { cwd: process.cwd(), encoding: 'utf8' },
    ).trim();
    execFileSync(
      '/usr/bin/git',
      ['update-index', '--add', '--cacheinfo', mode, objectId, path],
      { cwd: process.cwd(), env: environment, stdio: 'ignore' },
    );
  }
  const tree = execFileSync('/usr/bin/git', ['write-tree'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: environment,
  }).trim();
  return execFileSync(
    '/usr/bin/git',
    ['commit-tree', tree, '-p', parent],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: environment,
      input: 'test source transition\n',
    },
  ).trim();
}
const FRONTEND_HTML = '<!doctype html><html><head>'
  + '<link rel="canonical" href="https://warpkeep.com/">'
  + '<meta property="og:url" content="https://warpkeep.com/">'
  + '<link rel="icon" href="/favicon.png">'
  + '<link rel="stylesheet" href="/warpkeep-boot.css">'
  + '</head><body><div id="root"></div>'
  + '<img src="/images/splash.png">'
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
  return `const env={VITE_WARPKEEP_BUILD_SHA:${JSON.stringify(buildSha)}};\n`
    + `const info={buildSha:${JSON.stringify(buildSha)}};\n`
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

function frontendBootCssSource(suffix = ''): string {
  return '.warpkeep-boot{display:block}\n' + suffix;
}

function frontendBellSource(): string {
  return '<svg xmlns="http://www.w3.org/2000/svg"><path d="M1 1"/></svg>\n';
}

function expectedPresentationDigest(buildSha: string, suffix = ''): string {
  const document = Buffer.from(FRONTEND_HTML, 'utf8');
  const asset = Buffer.from(frontendAssetSource(buildSha, suffix), 'utf8');
  const notification = Buffer.from(frontendNotificationSource(), 'utf8');
  const leaf = Buffer.from(frontendLeafSource(), 'utf8');
  const notificationCss = Buffer.from(frontendNotificationCssSource(), 'utf8');
  const bell = Buffer.from(frontendBellSource(), 'utf8');
  const bootCss = Buffer.from(frontendBootCssSource(), 'utf8');
  const favicon = Buffer.from('favicon', 'utf8');
  const splash = Buffer.from('splash', 'utf8');
  const manifest = {
    schemaVersion: 1,
    kind: 'warpkeep-notification-pages-presentation-manifest-v1',
    origin: 'https://warpkeep.com',
    expectedBuildSha: buildSha,
    scope: 'root-html-plus-executable-style-closure',
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
      {
        url: 'https://warpkeep.com/favicon.png',
        status: 200,
        contentType: 'image/png',
        byteLength: favicon.byteLength,
        sha256: sha256(favicon),
      },
      {
        url: 'https://warpkeep.com/images/splash.png',
        status: 200,
        contentType: 'image/png',
        byteLength: splash.byteLength,
        sha256: sha256(splash),
      },
      {
        url: 'https://warpkeep.com/warpkeep-boot.css',
        status: 200,
        contentType: 'text/css; charset=utf-8',
        byteLength: bootCss.byteLength,
        sha256: sha256(bootCss),
      },
    ],
  };
  return createHash('sha256')
    .update('warpkeep-notification-pages-presentation-v1\0', 'utf8')
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
  bootCssSuffix?: string;
  notificationContentType?: string;
  notificationCssContentType?: string;
  appSourceOverride?: string;
  bootCssSourceOverride?: string;
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
      if (options.appSourceOverride !== undefined) {
        return new Response(options.appSourceOverride, {
          status: 200,
          headers: { 'content-type': 'application/javascript; charset=utf-8' },
        });
      }
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
            'content-type': options.notificationContentType
              ?? 'application/javascript; charset=utf-8',
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
          headers: {
            'content-type': options.notificationCssContentType
              ?? 'text/css; charset=utf-8',
          },
        },
      );
    }
    if (url === 'https://warpkeep.com/assets/bell.svg') {
      return new Response(frontendBellSource(), {
        status: 200,
        headers: { 'content-type': 'image/svg+xml' },
      });
    }
    if (url === 'https://warpkeep.com/warpkeep-boot.css') {
      return new Response(
        options.bootCssSourceOverride
          ?? frontendBootCssSource(options.bootCssSuffix), {
        status: 200,
        headers: { 'content-type': 'text/css; charset=utf-8' },
        },
      );
    }
    if (url === 'https://warpkeep.com/favicon.png') {
      return new Response('favicon', {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    }
    if (url === 'https://warpkeep.com/images/splash.png') {
      return new Response('splash', {
        status: 200,
        headers: { 'content-type': 'image/png' },
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

function handoffFixture(
  targetWorkspace: ReturnType<typeof workspace>,
  pagesSourceCommit = HEAD_COMMIT,
) {
  const prepared = preparedReceipt();
  const active = activeEvidence();
  const deployed = deployedReceipt();
  const handoff = createNotificationPagesPrivateHandoff({
    key: Buffer.from(KEY),
    workflowRunId: '987654321',
    workflowRunAttempt: '2',
    pagesSourceCommit,
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
      expectedPagesSourceCommit: pagesSourceCommit,
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
      candidateAuthorityDigest: null,
    },
    pages: {
      origin: 'https://warpkeep.com',
      sourceCommit: HEAD_COMMIT,
      liveBuildSha: HEAD_COMMIT,
      notificationPresentationDigest: expectedPresentationDigest(HEAD_COMMIT),
      notificationPresentationAssetCount: 8,
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

function writeTerminalReceiptChainFixture(
  targetWorkspace: ReturnType<typeof workspace>,
  template: NotificationPagesLiveReceipt,
) {
  ensureNotificationPagesLiveReceiptDirectory({
    directory: targetWorkspace.directory,
    repositoryRoot: targetWorkspace.repositoryRoot,
  });
  let previousReceiptDigest: string | null = null;
  let previousPagesSourceCommit: string | null = null;
  let chainRootReceiptDigest = '';
  let chainRootPagesSourceCommit = '';
  for (let generation = 0; generation <= 255; generation += 1) {
    const sourceCommit = generation === 255
      ? PREDECESSOR_COMMIT
      : (generation + 1).toString(16).padStart(40, '0');
    const receipt = deepMutableReceipt(template);
    receipt.chain = generation === 0
      ? {
        generation: 0,
        previousReceiptDigest: null,
        previousPagesSourceCommit: null,
        candidateAuthorityDigest: null,
      }
      : {
        generation,
        previousReceiptDigest,
        previousPagesSourceCommit,
        candidateAuthorityDigest: sha256(Buffer.from(
          `terminal-candidate-${generation}`,
          'utf8',
        )),
      };
    receipt.pages.sourceCommit = sourceCommit;
    receipt.pages.liveBuildSha = sourceCommit;
    const parsed = parseNotificationPagesLiveReceipt(receipt, { now: NOW });
    const bytes = Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    const receiptDigest = sha256(bytes);
    writePrivate(join(
      targetWorkspace.directory,
      `notification-pages-live-${receiptDigest}.json`,
    ), bytes);
    if (generation === 0) {
      chainRootReceiptDigest = receiptDigest;
      chainRootPagesSourceCommit = sourceCommit;
    }
    previousReceiptDigest = receiptDigest;
    previousPagesSourceCommit = sourceCommit;
    bytes.fill(0);
  }
  return Object.freeze({
    chainRootReceiptDigest,
    chainRootPagesSourceCommit,
  });
}

function completedCandidateCrashFixture(
  written: Awaited<ReturnType<typeof writeLiveReceipt>>,
) {
  const predecessor = written.result;
  const protectedPathsDigest = createHash('sha256')
    .update('warpkeep-notification-pages-protected-paths-v1\0', 'utf8')
    .update(JSON.stringify(NOTIFICATION_PAGES_LIVE_PROTECTED_PATHS), 'utf8')
    .digest('hex');
  const authority = {
    schemaVersion: 1,
    kind: 'warpkeep-notification-pages-candidate-authority-v1',
    recordedAt: predecessor.receipt.recordedAt,
    repository: 'ael-dev3/Warpkeep',
    predecessorReceiptDigest: predecessor.receiptDigest,
    predecessorPagesSourceCommit: predecessor.receipt.pages.sourceCommit,
    chainRootReceiptDigest: predecessor.chainRootReceiptDigest,
    chainRootPagesSourceCommit: predecessor.chainRootPagesSourceCommit,
    candidatePagesSourceCommit: DRIFT_SOURCE_COMMIT,
    predeployNotificationPresentationDigest:
      predecessor.receipt.pages.notificationPresentationDigest,
    predeployLiveBridgeAttestationDigest:
      predecessor.receipt.bridge.liveAttestationDigest,
    protectedPathsDigest,
    stagedHandoffBinding: null,
    stagedHandoffBindingDigest: null,
    productionPlayerCanaryActivationAuthorityDigest: null,
  };
  const authorityBytes = Buffer.from(
    `${JSON.stringify(authority, null, 2)}\n`,
    'utf8',
  );
  const authorityDigest = sha256(authorityBytes);
  const successor = deepMutableReceipt(predecessor.receipt);
  successor.chain = {
    generation: 1,
    previousReceiptDigest: predecessor.receiptDigest,
    previousPagesSourceCommit: predecessor.receipt.pages.sourceCommit,
    candidateAuthorityDigest: authorityDigest,
  };
  successor.pages.sourceCommit = DRIFT_SOURCE_COMMIT;
  successor.pages.liveBuildSha = DRIFT_SOURCE_COMMIT;
  const parsedSuccessor = parseNotificationPagesLiveReceipt(successor, {
    now: NOW,
  });
  const successorBytes = Buffer.from(
    `${JSON.stringify(parsedSuccessor, null, 2)}\n`,
    'utf8',
  );
  const successorDigest = sha256(successorBytes);
  const candidateClaimPath = join(
    written.targetWorkspace.directory,
    `notification-pages-candidate-claim-${predecessor.receiptDigest}.json`,
  );
  const candidateContentPath = join(
    written.targetWorkspace.directory,
    `notification-pages-candidate-${authorityDigest}.json`,
  );
  writePrivate(candidateClaimPath, authorityBytes);
  writePrivate(candidateContentPath, authorityBytes);
  writePrivate(join(
    written.targetWorkspace.directory,
    `notification-pages-live-${successorDigest}.json`,
  ), successorBytes);
  writePrivate(join(
    written.targetWorkspace.directory,
    `notification-pages-live-source-${DRIFT_SOURCE_COMMIT}.json`,
  ), successorBytes);
  writePrivate(join(
    written.targetWorkspace.directory,
    `notification-pages-live-successor-${predecessor.receiptDigest}.json`,
  ), successorBytes);
  authorityBytes.fill(0);
  successorBytes.fill(0);
  return Object.freeze({
    authority,
    authorityDigest,
    candidateClaimPath,
    candidateContentPath,
    successorDigest,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('notification Pages ongoing live receipt', () => {
  it('derives the presentation closure while exempting only the reviewed realm edge', () => {
    const covered = (path: string) =>
      NOTIFICATION_PAGES_LIVE_CANDIDATE_PROTECTED_PATHS.some(protectedPath =>
        path === protectedPath || path.startsWith(`${protectedPath}/`));
    const closure = new Set(deriveNotificationPagesLivePresentationSourceClosure({
      sourceCommit: HEAD_COMMIT,
    }));
    expect(closure.size).toBeGreaterThan(180);
    expect(closure.size).toBeLessThanOrEqual(512);
    expect(closure.has('src/components/realm/GreaterRealmWorldScene.tsx'))
      .toBe(false);
    expect(closure.has('src/components/menu/latestPatchNotes.ts')).toBe(true);
    for (const criticalPath of [
      '.github/workflows/deploy-pages.yml',
      'scripts/hermes-admin.ts',
      'scripts/notification-pages-live-receipt.mjs',
      'scripts/notification-pages-live-release-binding.mjs',
      'src/App.tsx',
      'src/components/WarpkeepExperience.css',
      'src/components/WarpkeepExperience.tsx',
      'src/main.tsx',
      'src/components/auth/FarcasterAdmissionNotificationOptIn.tsx',
      'src/components/errors/WarpkeepErrorBoundary.tsx',
      'src/components/errors/warpkeepRootErrorHandlers.ts',
      'src/components/menu/WarpkeepMainMenu.css',
      'src/components/menu/WarpkeepMainMenu.tsx',
      'src/components/menu/SettingsPanel.css',
      'src/components/menu/SettingsPanel.tsx',
      'src/components/audio/WarpkeepAudioDirector.tsx',
      'src/components/title/WarpkeepTitleScreen3D.tsx',
      'src/components/transition/WarpTransitionOverlay.tsx',
      'src/farcaster/miniapp/MiniAppHostProvider.tsx',
      'src/spacetime/WarpkeepSpacetimeProvider.tsx',
      'src/spacetime/warpkeepConfig.ts',
      'public/audio/warpkeep-menu-theme.mp3',
      'public/models/title/warpkeep-title-high.glb',
      'tsconfig.app.json',
      'tsconfig.json',
      'tsconfig.node.json',
      'vite.config.ts',
    ]) {
      expect(
        closure.has(criticalPath) || covered(criticalPath),
        criticalPath,
      ).toBe(true);
    }
  });

  it('rejects derived presentation mutations and permits one realm-exclusive descendant', () => {
    for (const path of [
      'src/components/menu/SettingsPanel.tsx',
      'src/components/menu/SettingsPanel.css',
      'src/components/audio/WarpkeepAudioDirector.tsx',
      'src/components/transition/WarpTransitionOverlay.tsx',
      'src/components/title/WarpkeepTitleScreen3D.tsx',
      'src/spacetime/WarpkeepSpacetimeProvider.tsx',
    ]) {
      const candidate = descendantCommitWithMutation(path);
      expect(() => assertNotificationPagesLivePresentationSourceNoDrift({
        predecessorSourceCommit: HEAD_COMMIT,
        candidateSourceCommit: candidate,
      }), path).toThrow('NOTIFICATION_PAGES_LIVE_CANDIDATE_NOTIFICATION_DRIFT');
    }
    const realmOnly = descendantCommitWithMutation(
      'src/components/realm/GreaterRealmWorldScene.tsx',
    );
    expect(assertNotificationPagesLivePresentationSourceNoDrift({
      predecessorSourceCommit: HEAD_COMMIT,
      candidateSourceCommit: realmOnly,
    })).toContain('src/components/menu/SettingsPanel.tsx');
  });

  it('allows only the two root-binding initializers to change', () => {
    const source = readFileSync(
      join(process.cwd(), 'scripts/notification-pages-live-release-binding.mjs'),
      'utf8',
    );
    const unbound = parseNotificationPagesLiveReleaseBindingSource(source);
    const boundSource = source
      .replace(
        'notificationPagesLiveRootReceiptDigest: null',
        `notificationPagesLiveRootReceiptDigest: '${'d'.repeat(64)}'`,
      )
      .replace(
        'notificationPagesLiveRootPagesSourceCommit: null',
        `notificationPagesLiveRootPagesSourceCommit: '${HEAD_COMMIT}'`,
      );
    const bound = parseNotificationPagesLiveReleaseBindingSource(boundSource);
    expect(bound).toMatchObject({
      notificationPagesLiveRootReceiptDigest: 'd'.repeat(64),
      notificationPagesLiveRootPagesSourceCommit: HEAD_COMMIT,
      sourceProjectionDigest: unbound.sourceProjectionDigest,
    });
    const drifted = parseNotificationPagesLiveReleaseBindingSource(
      boundSource.replace('Checked-in root', 'Changed root'),
    );
    expect(drifted.sourceProjectionDigest).not.toBe(
      unbound.sourceProjectionDigest,
    );
    expect(NOTIFICATION_PAGES_LIVE_CANDIDATE_PROTECTED_PATHS).toContain(
      'scripts/notification-pages-live-release-binding.d.mts',
    );
    expect(readFileSync(
      join(process.cwd(), 'scripts/notification-pages-live-receipt.mjs'),
      'utf8',
    )).not.toContain(
      "from './notification-pages-live-release-binding.mjs'",
    );
  });

  it('allows only the nonstaged bound-root Hermes approval transition', () => {
    const disabled = 'export const '
      + 'FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = false as const;\n';
    const enabled = disabled.replace('false as const', 'true as const');
    expect(assertNotificationPagesLiveHermesSourceTransition({
      predecessorHermesSource: disabled,
      candidateHermesSource: enabled,
      staged: false,
      predecessorRootBound: true,
    })).toEqual({
      predecessorHermesExecutionApproved: false,
      candidateHermesExecutionApproved: true,
    });
    for (const candidateHermesSource of [
      enabled,
      `${disabled}export const arbitraryHermesDrift = true;\n`,
    ]) {
      expect(() => assertNotificationPagesLiveHermesSourceTransition({
        predecessorHermesSource: disabled,
        candidateHermesSource,
        staged: true,
        predecessorRootBound: true,
      })).toThrow('NOTIFICATION_PAGES_LIVE_CANDIDATE_NOTIFICATION_DRIFT');
    }
    expect(() => assertNotificationPagesLiveHermesSourceTransition({
      predecessorHermesSource: disabled,
      candidateHermesSource: enabled,
      staged: false,
      predecessorRootBound: false,
    })).toThrow('NOTIFICATION_PAGES_LIVE_CANDIDATE_NOTIFICATION_DRIFT');
  });

  it('structurally rejects commented and scalar activation-phase decoys', () => {
    const pages = "jobs:\n  build:\n    env:\n      VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'true'\n"
      + '    steps:\n      - name: Build\n        run: npm run build\n'
      + "        env:\n          GITHUB_PAGES: 'true'\n";
    const hermes = 'export const '
      + 'FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = false as const;\n';
    expect(parseNotificationPagesActivationPhaseSources({
      pagesWorkflowSource: pages,
      hermesSource: hermes,
    })).toEqual({
      pagesPresentationEnabled: true,
      hermesExecutionApproved: false,
    });
    expect(parseNotificationPagesActivationPhaseSources({
      pagesWorkflowSource: pages,
      hermesSource: hermes.replace('false as const', 'true as const'),
    })).toEqual({
      pagesPresentationEnabled: true,
      hermesExecutionApproved: true,
    });
    for (const decoy of [
      `/*\n${hermes}*/\n`,
      `const decoy = \`${hermes}\`;\n`,
      'const APPROVED = true as const;\n'
        + 'export { APPROVED as '
        + 'FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED };\n'
        + `const decoy = /${hermes.trim().replaceAll('/', '\\/')}/;\n`,
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
    expect(() => parseNotificationPagesActivationPhaseSources({
      pagesWorkflowSource: pages.replace(
        "          GITHUB_PAGES: 'true'",
        "          GITHUB_PAGES: 'true'\n"
          + "          VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'false'",
      ),
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
          notificationPresentationDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
          notificationPresentationAssetCount: 8,
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

    const finalGeneration = deepMutableReceipt(written.result.receipt);
    finalGeneration.chain = {
      generation: 255,
      previousReceiptDigest: 'a'.repeat(64),
      previousPagesSourceCommit: 'b'.repeat(40),
      candidateAuthorityDigest: 'c'.repeat(64),
    };
    expect(parseNotificationPagesLiveReceipt(finalGeneration, { now: NOW })
      .chain.generation).toBe(255);
    finalGeneration.chain.generation = 256;
    expect(() => parseNotificationPagesLiveReceipt(finalGeneration, {
      now: NOW,
    })).toThrow('NOTIFICATION_PAGES_LIVE_CHAIN_INVALID');
  });

  it('does not expire and replays an installed root after its handoff is gone', async () => {
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
      'https://warpkeep.com/favicon.png',
      'https://warpkeep.com/images/splash.png',
      'https://warpkeep.com/warpkeep-boot.css',
      'https://warpkeep.com/assets/notification.css',
      'https://warpkeep.com/assets/notification.js',
      'https://warpkeep.com/assets/bell.svg',
      'https://warpkeep.com/assets/leaf.js',
      AUTH_BRIDGE_RELEASE_ATTESTATION_URL,
    ]);
    expect(secondFetch).toHaveBeenCalledTimes(10);

    rmSync(written.targetWorkspace.handoffPath);
    rmSync(written.targetWorkspace.keyPath);
    const replayFetch = liveFetch({ now: AFTER_PREPARED_EXPIRY });
    await expect(writePrivateNotificationPagesLiveReceipt({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
      handoffExpectations: written.handoff.expectations,
      expectedNotificationsPresentationEnabled: true,
      expectedHermesExecutionApproved: false,
      fetchImpl: replayFetch as unknown as typeof fetch,
      now: AFTER_PREPARED_EXPIRY,
    })).resolves.toMatchObject({
      result: 'unchanged',
      receiptDigest: written.result.receiptDigest,
      chainRootReceiptDigest: written.result.receiptDigest,
      chainRootPagesSourceCommit: HEAD_COMMIT,
    });
    expect(replayFetch).toHaveBeenCalledTimes(10);
  });

  it('accepts decoded gzip lengths but rejects identity truncation', async () => {
    const written = await writeLiveReceipt();
    const appSource = frontendAssetSource(HEAD_COMMIT);
    const baseFetch = liveFetch();
    const gzipFetch = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === 'https://warpkeep.com/assets/app.js') {
        return new Response(appSource, {
          status: 200,
          headers: {
            'content-type': 'application/javascript; charset=utf-8',
            'content-encoding': 'gzip',
            // Production Fetch exposes decoded bytes while Cloudflare retains
            // the smaller compressed transfer length.
            'content-length': String(Math.floor(Buffer.byteLength(appSource) / 2)),
          },
        });
      }
      return (baseFetch as unknown as typeof fetch)(input);
    });
    await expect(inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
      pagesSourceCommit: HEAD_COMMIT,
      ...rootExpectation(written.result),
      fetchImpl: gzipFetch as unknown as typeof fetch,
      now: NOW,
    })).resolves.toMatchObject({ receiptDigest: written.result.receiptDigest });

    const notificationSource = frontendNotificationSource();
    for (const contentEncoding of [undefined, 'identity']) {
      const identityBase = liveFetch();
      const identityMismatchFetch = vi.fn(
        async (input: string | URL | Request) => {
          if (String(input) === 'https://warpkeep.com/assets/notification.js') {
            return new Response(notificationSource, {
              status: 200,
              headers: {
                'content-type': 'application/javascript; charset=utf-8',
                ...(contentEncoding === undefined
                  ? {}
                  : { 'content-encoding': contentEncoding }),
                // A no-coding response shorter than its declared identity
                // length is a truncation/mismatch and remains fail-closed.
                'content-length': String(
                  Buffer.byteLength(notificationSource) + 1,
                ),
              },
            });
          }
          return (identityBase as unknown as typeof fetch)(input);
        },
      );
      await expect(inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit({
        directory: written.targetWorkspace.directory,
        repositoryRoot: written.targetWorkspace.repositoryRoot,
        pagesSourceCommit: HEAD_COMMIT,
        ...rootExpectation(written.result),
        fetchImpl: identityMismatchFetch as unknown as typeof fetch,
        now: NOW,
      })).rejects.toThrow(
        'NOTIFICATION_PAGES_LIVE_FRONTEND_RESPONSE_SIZE_INVALID',
      );
    }

    const oversizedBase = liveFetch();
    const oversizedGzipFetch = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === 'https://warpkeep.com/assets/notification.js') {
        return new Response(notificationSource, {
          status: 200,
          headers: {
            'content-type': 'application/javascript; charset=utf-8',
            'content-encoding': 'gzip',
            'content-length': '16000001',
          },
        });
      }
      return (oversizedBase as unknown as typeof fetch)(input);
    });
    await expect(inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
      pagesSourceCommit: HEAD_COMMIT,
      ...rootExpectation(written.result),
      fetchImpl: oversizedGzipFetch as unknown as typeof fetch,
      now: NOW,
    })).rejects.toThrow(
      'NOTIFICATION_PAGES_LIVE_FRONTEND_RESPONSE_SIZE_INVALID',
    );
  });

  it('reconciles gen0 retry only from exact named build sentinels', async () => {
    const exactFetch = liveFetch();
    await expect(reconcileNotificationPagesLiveCandidate({
      repositoryRoot: realpathSync(process.cwd()),
      candidatePagesSourceCommit: HEAD_COMMIT,
      fetchImpl: exactFetch as unknown as typeof fetch,
    })).resolves.toEqual({
      status: 'exact-current',
      candidatePagesSourceCommit: HEAD_COMMIT,
      notificationPresentationDigest: expectedPresentationDigest(HEAD_COMMIT),
      notificationPresentationAssetCount: 8,
    });
    expect(exactFetch).toHaveBeenCalledTimes(11);

    const oldFetch = liveFetch({ buildSha: DRIFT_SOURCE_COMMIT });
    await expect(reconcileNotificationPagesLiveCandidate({
      repositoryRoot: realpathSync(process.cwd()),
      candidatePagesSourceCommit: HEAD_COMMIT,
      fetchImpl: oldFetch as unknown as typeof fetch,
    })).resolves.toEqual({
      status: 'definitely-not-current',
      candidatePagesSourceCommit: HEAD_COMMIT,
      observedPagesSourceCommit: DRIFT_SOURCE_COMMIT,
    });
    expect(oldFetch).toHaveBeenCalledTimes(2);

    const markerOffFetch = liveFetch({ presentationEnabled: false });
    await expect(reconcileNotificationPagesLiveCandidate({
      repositoryRoot: realpathSync(process.cwd()),
      candidatePagesSourceCommit: HEAD_COMMIT,
      fetchImpl: markerOffFetch as unknown as typeof fetch,
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_RECONCILIATION_AMBIGUOUS');

    const genericHexDecoys = Array.from(
      { length: 714 },
      (_, index) => index.toString(16).padStart(40, '0'),
    ).join(',');
    const productionStyleFetch = liveFetch({
      appSourceOverride: frontendAssetSource(HEAD_COMMIT)
        + `const gameConstants=[${JSON.stringify(genericHexDecoys)}];\n`,
    });
    await expect(reconcileNotificationPagesLiveCandidate({
      repositoryRoot: realpathSync(process.cwd()),
      candidatePagesSourceCommit: HEAD_COMMIT,
      fetchImpl: productionStyleFetch as unknown as typeof fetch,
    })).resolves.toMatchObject({ status: 'exact-current' });

    for (const appSourceOverride of [
      `const arbitrary="${HEAD_COMMIT}";\n`,
      frontendAssetSource(HEAD_COMMIT)
        + `const duplicate={buildSha:"${DRIFT_SOURCE_COMMIT}"};\n`,
      `const env={VITE_WARPKEEP_BUILD_SHA:"${HEAD_COMMIT}"};\n`,
    ]) {
      const ambiguousFetch = liveFetch({ appSourceOverride });
      await expect(reconcileNotificationPagesLiveCandidate({
        repositoryRoot: realpathSync(process.cwd()),
        candidatePagesSourceCommit: HEAD_COMMIT,
        fetchImpl: ambiguousFetch as unknown as typeof fetch,
      })).rejects.toThrow(
        'NOTIFICATION_PAGES_LIVE_RECONCILIATION_AMBIGUOUS',
      );
    }

    const staticFetch = vi.fn();
    await expect(reconcileNotificationPagesLiveCandidate({
      repositoryRoot: realpathSync(process.cwd()),
      candidatePagesSourceCommit: DRIFT_SOURCE_COMMIT,
      fetchImpl: staticFetch as unknown as typeof fetch,
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_CANDIDATE_NOT_HEAD');
    expect(staticFetch).not.toHaveBeenCalled();
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
    const bootMutationFetch = liveFetch({
      bootCssSuffix: '/* hide presentation */\n',
    });
    await expect(inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
      pagesSourceCommit: HEAD_COMMIT,
      ...rootExpectation(written.result),
      fetchImpl: bootMutationFetch as unknown as typeof fetch,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_FRONTEND_CONTENT_MISMATCH');
    const cssMarkerDecoyFetch = liveFetch({
      presentationEnabled: false,
      bootCssSourceOverride:
        `/* warpkeep-admission-notifications-presentation-enabled-v1 */\n`,
    });
    await expect(inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
      pagesSourceCommit: HEAD_COMMIT,
      ...rootExpectation(written.result),
      fetchImpl: cssMarkerDecoyFetch as unknown as typeof fetch,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_PRESENTATION_MARKER_INVALID');
    const wrongJsMimeFetch = liveFetch({ notificationContentType: 'text/plain' });
    await expect(inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
      pagesSourceCommit: HEAD_COMMIT,
      ...rootExpectation(written.result),
      fetchImpl: wrongJsMimeFetch as unknown as typeof fetch,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_FRONTEND_MISMATCH');
    const wrongCssMimeFetch = liveFetch({ notificationCssContentType: 'text/plain' });
    await expect(inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
      pagesSourceCommit: HEAD_COMMIT,
      ...rootExpectation(written.result),
      fetchImpl: wrongCssMimeFetch as unknown as typeof fetch,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_FRONTEND_MISMATCH');
    const opaquePublicLiteralFetch = liveFetch({
      appSourceOverride: frontendAssetSource(HEAD_COMMIT)
        + 'const opaque=["audio/warpkeep-title-theme-a.mp3",'
        + '"images/inner-keep/catalog.png","video/menu.mp4"];\n',
    });
    await expect(inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
      pagesSourceCommit: HEAD_COMMIT,
      ...rootExpectation(written.result),
      fetchImpl: opaquePublicLiteralFetch as unknown as typeof fetch,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_FRONTEND_CONTENT_MISMATCH');
    expect(opaquePublicLiteralFetch.mock.calls.map(call => String(call[0])))
      .not.toContain('https://warpkeep.com/assets/audio/warpkeep-title-theme-a.mp3');
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
  }, 60_000);

  it('bounds presentation traversal before a 65th asset and at aggregate bytes', async () => {
    const written = await writeLiveReceipt();
    const marker = 'warpkeep-admission-notifications-presentation-enabled-v1';
    const countReferences = Array.from(
      { length: 65 },
      (_, index) => `"./chunk-${index.toString().padStart(2, '0')}.js"`,
    ).join(',');
    const countBase = liveFetch({
      appSourceOverride: frontendAssetSource(HEAD_COMMIT)
        + `const marker="${marker}";const chunks=[${countReferences}];\n`,
    });
    const countFetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (/^https:\/\/warpkeep\.com\/assets\/chunk-[0-9]{2}\.js$/u.test(url)) {
        return new Response('export const chunk=true;\n', {
          status: 200,
          headers: { 'content-type': 'application/javascript; charset=utf-8' },
        });
      }
      return (countBase as unknown as typeof fetch)(input);
    });
    await expect(inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
      pagesSourceCommit: HEAD_COMMIT,
      ...rootExpectation(written.result),
      fetchImpl: countFetch as unknown as typeof fetch,
      now: NOW,
    })).rejects.toThrow(
      'NOTIFICATION_PAGES_LIVE_FRONTEND_ATTESTATION_INVALID',
    );
    const countUrls = countFetch.mock.calls.map(call => String(call[0]));
    expect(countUrls).not.toContain(
      'https://warpkeep.com/assets/chunk-60.js',
    );
    expect(countUrls.filter(url => url.includes('/assets/chunk-')))
      .toHaveLength(60);

    const aggregateReferences = Array.from(
      { length: 5 },
      (_, index) => `"./large-${index}.js"`,
    ).join(',');
    const aggregateBase = liveFetch({
      appSourceOverride: frontendAssetSource(HEAD_COMMIT)
        + `const marker="${marker}";const chunks=[${aggregateReferences}];\n`,
    });
    const largeAsset = Buffer.alloc(15_999_000, 0x20);
    const aggregateFetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (/^https:\/\/warpkeep\.com\/assets\/large-[0-4]\.js$/u.test(url)) {
        return new Response(largeAsset, {
          status: 200,
          headers: { 'content-type': 'application/javascript; charset=utf-8' },
        });
      }
      return (aggregateBase as unknown as typeof fetch)(input);
    });
    try {
      await expect(inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit({
        directory: written.targetWorkspace.directory,
        repositoryRoot: written.targetWorkspace.repositoryRoot,
        pagesSourceCommit: HEAD_COMMIT,
        ...rootExpectation(written.result),
        fetchImpl: aggregateFetch as unknown as typeof fetch,
        now: NOW,
      })).rejects.toThrow(
        'NOTIFICATION_PAGES_LIVE_FRONTEND_RESPONSE_SIZE_INVALID',
      );
      expect(aggregateFetch.mock.calls.map(call => String(call[0]))
        .filter(url => url.includes('/assets/large-'))).toHaveLength(5);
    } finally {
      largeAsset.fill(0);
    }
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
    })).rejects.toThrow(
      'NOTIFICATION_PAGES_LIVE_ACTIVE_EVIDENCE_CLOSURE_INVALID',
    );
    expect(driftFetch).not.toHaveBeenCalled();
  });

  it('rejects a terminal generation before candidate network or publication', async () => {
    const terminalWorkspace = workspace('warpkeep-pages-live-terminal-');
    const terminal = writeTerminalReceiptChainFixture(
      terminalWorkspace,
      (await writeLiveReceipt()).result.receipt,
    );
    const fetchImpl = vi.fn();
    await expect(inspectLatestPrivateNotificationPagesLiveReceiptForCandidate({
      directory: terminalWorkspace.directory,
      repositoryRoot: terminalWorkspace.repositoryRoot,
      candidatePagesSourceCommit: HEAD_COMMIT,
      expectedChainRootReceiptDigest: terminal.chainRootReceiptDigest,
      expectedChainRootPagesSourceCommit: terminal.chainRootPagesSourceCommit,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_CHAIN_GENERATION_EXHAUSTED');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readdirSync(terminalWorkspace.directory).some(name =>
      name.startsWith('notification-pages-candidate-'))).toBe(false);

    await expect(promoteNotificationPagesLiveReceipt({
      directory: terminalWorkspace.directory,
      repositoryRoot: terminalWorkspace.repositoryRoot,
      candidateAuthorityDigest: 'd'.repeat(64),
      candidatePagesSourceCommit: HEAD_COMMIT,
      expectedChainRootReceiptDigest: terminal.chainRootReceiptDigest,
      expectedChainRootPagesSourceCommit: terminal.chainRootPagesSourceCommit,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: NOW,
    })).rejects.toThrow('NOTIFICATION_PAGES_LIVE_CHAIN_GENERATION_EXHAUSTED');
    expect(fetchImpl).not.toHaveBeenCalled();
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
    const orphan = join(
      written.targetWorkspace.directory,
      `.notification-pages-live-${'a'.repeat(64)}-${'3'.repeat(24)}.json.tmp`,
    );
    writeFileSync(orphan, '', { mode: 0o600, flag: 'wx' });
    const staleAt = new Date(Date.now() - 11 * 60 * 1_000);
    utimesSync(orphan, staleAt, staleAt);
    ensureNotificationPagesLiveReceiptDirectory({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
    });
    expect(() => lstatSync(orphan)).toThrow();

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
    for (let index = 0; index < 1025; index += 1) {
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

  it('retires completed candidate authority crash state idempotently', async () => {
    const written = await writeLiveReceipt();
    const crash = completedCandidateCrashFixture(written);

    expect(readdirSync(written.targetWorkspace.directory)).toContain(
      `notification-pages-candidate-${crash.authorityDigest}.json`,
    );
    expect(() => ensureNotificationPagesLiveReceiptDirectory({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
    })).not.toThrow();
    expect(readdirSync(written.targetWorkspace.directory)).not.toContain(
      `notification-pages-candidate-${crash.authorityDigest}.json`,
    );
    expect(readdirSync(written.targetWorkspace.directory)).not.toContain(
      `notification-pages-candidate-claim-${written.result.receiptDigest}.json`,
    );

    // A crash after content retirement but before fixed-claim retirement leaves
    // exactly this recoverable prefix. The completed successor identifies it.
    writePrivate(
      crash.candidateClaimPath,
      Buffer.from(`${JSON.stringify(crash.authority, null, 2)}\n`, 'utf8'),
    );
    expect(() => ensureNotificationPagesLiveReceiptDirectory({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
    })).not.toThrow();
    expect(readdirSync(written.targetWorkspace.directory)).not.toContain(
      `notification-pages-candidate-claim-${written.result.receiptDigest}.json`,
    );
    expect(readdirSync(written.targetWorkspace.directory)).toEqual(
      expect.arrayContaining([
        `notification-pages-live-${crash.successorDigest}.json`,
        `notification-pages-live-source-${DRIFT_SOURCE_COMMIT}.json`,
        `notification-pages-live-successor-${written.result.receiptDigest}.json`,
      ]),
    );
    expect(() => ensureNotificationPagesLiveReceiptDirectory({
      directory: written.targetWorkspace.directory,
      repositoryRoot: written.targetWorkspace.repositoryRoot,
    })).not.toThrow();
  });

  it('requires the explicit checked-in root cutover before authorizing a successor', async () => {
    const targetWorkspace = workspace('warpkeep-pages-live-promote-');
    const previous = deepMutableReceipt((await writeLiveReceipt()).result.receipt);
    previous.pages.sourceCommit = PREDECESSOR_COMMIT;
    previous.pages.liveBuildSha = previous.pages.sourceCommit;
    previous.pages.notificationPresentationDigest = expectedPresentationDigest(
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
    await expect(inspectLatestPrivateNotificationPagesLiveReceiptForCandidate({
      directory: targetWorkspace.directory,
      repositoryRoot: targetWorkspace.repositoryRoot,
      candidatePagesSourceCommit: HEAD_COMMIT,
      expectedChainRootReceiptDigest: installedPrevious.receiptDigest,
      expectedChainRootPagesSourceCommit: PREDECESSOR_COMMIT,
      stagedHandoffExpectations: staged.expectations,
      fetchImpl: authorityFetch as unknown as typeof fetch,
      now: NOW,
      randomBytesImpl: size => Buffer.alloc(size, 8),
    })).rejects.toThrow(
      /NOTIFICATION_PAGES_LIVE_(?:RELEASE_BINDING_TRANSITION_INVALID|ACTIVE_EVIDENCE_CLOSURE_INVALID)/u,
    );
    expect(authorityFetch).not.toHaveBeenCalled();
    expect(readdirSync(targetWorkspace.directory).some(name =>
      name.startsWith('notification-pages-candidate-'))).toBe(false);
  });

  it('promotes only the atomic nonstaged gen0-to-durable-root binding cutover', async () => {
    const targetWorkspace = workspace('warpkeep-pages-live-root-cutover-');
    const template = deepMutableReceipt((await writeLiveReceipt()).result.receipt);
    const preparedDigest = template.handoff.preparedReceiptDigest as string;
    const activeDigest = template.handoff.activeV17EvidenceDigest as string;
    const moduleDigest = template.handoff.deployedModuleReceiptDigest as string;
    const preparedPath =
      'scripts/auth-bridge-notification-prepared-release-binding.mjs';
    const privatePath = 'scripts/notification-pages-private-release-binding.mjs';
    const rootPath = 'scripts/notification-pages-live-release-binding.mjs';
    const workflowPath = '.github/workflows/deploy-pages.yml';
    const preparedNull = readFileSync(join(process.cwd(), preparedPath), 'utf8');
    const privateNull = readFileSync(join(process.cwd(), privatePath), 'utf8');
    const rootNull = readFileSync(join(process.cwd(), rootPath), 'utf8');
    const workflowFalse = readFileSync(join(process.cwd(), workflowPath), 'utf8');
    const normalizedSourceCommit = descendantCommitWithSources(HEAD_COMMIT, {
      'scripts/greater-realm-downstream-release-policy.ts': readFileSync(
        join(
          process.cwd(),
          'scripts/greater-realm-downstream-release-policy.ts',
        ),
        'utf8',
      ),
      'scripts/notification-pages-live-receipt.mjs': readFileSync(
        join(process.cwd(), 'scripts/notification-pages-live-receipt.mjs'),
        'utf8',
      ),
    });
    const preparedPopulated = preparedNull
      .replace(
        'notificationPreparedReceiptDigest: null',
        `notificationPreparedReceiptDigest: '${preparedDigest}'`,
      )
      .replace(
        'notificationPreparedBridgeSourceCommit: null',
        `notificationPreparedBridgeSourceCommit: '${HEAD_COMMIT}'`,
      );
    const privatePopulated = privateNull
      .replace(
        'notificationPagesActiveV17EvidenceDigest: null',
        `notificationPagesActiveV17EvidenceDigest: '${activeDigest}'`,
      )
      .replace(
        'notificationPagesDeployedModuleReceiptDigest: null',
        `notificationPagesDeployedModuleReceiptDigest: '${moduleDigest}'`,
      )
      .replace(
        'notificationPagesExpectedFounderCount: null',
        `notificationPagesExpectedFounderCount: ${FOUNDER_COUNT}`,
      );
    const workflowTrue = workflowFalse.replace(
      "VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'false'",
      "VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'true'",
    );
    expect(workflowTrue).not.toBe(workflowFalse);
    const gen0SourceCommit = descendantCommitWithSources(normalizedSourceCommit, {
      [preparedPath]: preparedPopulated,
      [privatePath]: privatePopulated,
      [workflowPath]: workflowTrue,
    });

    template.pages.sourceCommit = gen0SourceCommit;
    template.pages.liveBuildSha = gen0SourceCommit;
    template.pages.notificationPresentationDigest = expectedPresentationDigest(
      gen0SourceCommit,
    );
    template.sourceRelease.atlasSourceCommit = normalizedSourceCommit;
    template.sourceRelease.moduleSourceCommit = normalizedSourceCommit;
    const installedGen0 = writeCanonicalReceiptFixture(
      targetWorkspace,
      template,
    );
    const rootPopulated = rootNull
      .replace(
        'notificationPagesLiveRootReceiptDigest: null',
        `notificationPagesLiveRootReceiptDigest: '${installedGen0.receiptDigest}'`,
      )
      .replace(
        'notificationPagesLiveRootPagesSourceCommit: null',
        'notificationPagesLiveRootPagesSourceCommit: '
          + `'${gen0SourceCommit}'`,
      );
    const validCandidate = descendantCommitWithSources(gen0SourceCommit, {
      [preparedPath]: preparedNull,
      [privatePath]: privateNull,
      [rootPath]: rootPopulated,
    });
    const invalidCandidates = [
      descendantCommitWithSources(gen0SourceCommit, {
        [rootPath]: rootPopulated,
      }),
      descendantCommitWithSources(gen0SourceCommit, {
        [preparedPath]: preparedNull,
        [rootPath]: rootPopulated,
      }),
      descendantCommitWithSources(gen0SourceCommit, {
        [preparedPath]: `${preparedNull}\n// unrelated drift\n`,
        [privatePath]: privateNull,
        [rootPath]: rootPopulated,
      }),
      descendantCommitWithSources(gen0SourceCommit, {
        [preparedPath]: preparedNull,
        [privatePath]: `${privateNull}\n// unrelated drift\n`,
        [rootPath]: rootPopulated,
      }),
      descendantCommitWithSources(gen0SourceCommit, {
        'scripts/notification-pages-private-release-binding.d.mts':
          `${readFileSync(join(
            process.cwd(),
            'scripts/notification-pages-private-release-binding.d.mts',
          ), 'utf8')}\n// declaration drift\n`,
        [preparedPath]: preparedNull,
        [privatePath]: privateNull,
        [rootPath]: rootPopulated,
      }),
      descendantCommitWithSources(gen0SourceCommit, {
        'scripts/auth-bridge-notification-prepared-release-binding.d.mts':
          `${readFileSync(join(
            process.cwd(),
            'scripts/auth-bridge-notification-prepared-release-binding.d.mts',
          ), 'utf8')}\n// declaration drift\n`,
        [preparedPath]: preparedNull,
        [privatePath]: privateNull,
        [rootPath]: rootPopulated,
      }),
      descendantCommitWithSources(gen0SourceCommit, {
        'scripts/notification-pages-live-release-binding.d.mts':
          `${readFileSync(join(
            process.cwd(),
            'scripts/notification-pages-live-release-binding.d.mts',
          ), 'utf8')}\n// declaration drift\n`,
        [preparedPath]: preparedNull,
        [privatePath]: privateNull,
        [rootPath]: rootPopulated,
      }),
    ];

    const cloneParent = mkdtempSync(join(tmpdir(), 'warpkeep-root-cutover-clone-'));
    temporaryDirectories.push(cloneParent);
    const cloneRoot = join(cloneParent, 'repository');
    execFileSync('/usr/bin/git', [
      'clone', '--quiet', '--no-checkout', '--shared', process.cwd(), cloneRoot,
    ]);
    execFileSync('/usr/bin/git', ['checkout', '--quiet', '--detach', validCandidate], {
      cwd: cloneRoot,
    });
    symlinkSync(
      realpathSync(join(process.cwd(), 'services/auth-bridge/node_modules')),
      join(cloneRoot, 'services/auth-bridge/node_modules'),
      'dir',
    );
    const isolatedReceipt = await import(
      `${pathToFileURL(join(
        cloneRoot,
        'scripts/notification-pages-live-receipt.mjs',
      )).href}?root-cutover=${Date.now()}`
    ) as typeof import('../scripts/notification-pages-live-receipt.mjs');
    const checkout = (commit: string) => execFileSync(
      '/usr/bin/git',
      ['checkout', '--quiet', '--detach', commit],
      { cwd: cloneRoot },
    );
    for (const invalidCandidate of invalidCandidates) {
      checkout(invalidCandidate);
      const noFetch = vi.fn();
      await expect(
        isolatedReceipt.inspectLatestPrivateNotificationPagesLiveReceiptForCandidate({
          directory: targetWorkspace.directory,
          repositoryRoot: realpathSync(cloneRoot),
          candidatePagesSourceCommit: invalidCandidate,
          expectedChainRootReceiptDigest: installedGen0.receiptDigest,
          expectedChainRootPagesSourceCommit: gen0SourceCommit,
          fetchImpl: noFetch as unknown as typeof fetch,
          now: NOW,
          randomBytesImpl: size => Buffer.alloc(size, 4),
        }),
      ).rejects.toThrow(/NOTIFICATION_PAGES_LIVE_(?:RELEASE_BINDING_TRANSITION_INVALID|CANDIDATE_NOTIFICATION_DRIFT|ACTIVE_EVIDENCE_SOURCE_DRIFT)/u);
      expect(noFetch).not.toHaveBeenCalled();
      expect(readdirSync(targetWorkspace.directory).some(name =>
        name.startsWith('notification-pages-candidate-'))).toBe(false);
    }

    checkout(validCandidate);
    const authorityFetch = liveFetch({
      buildSha: gen0SourceCommit,
      attestation: releaseAttestation(HEAD_COMMIT),
    });
    const authority = await isolatedReceipt
      .inspectLatestPrivateNotificationPagesLiveReceiptForCandidate({
        directory: targetWorkspace.directory,
        repositoryRoot: realpathSync(cloneRoot),
        candidatePagesSourceCommit: validCandidate,
        expectedChainRootReceiptDigest: installedGen0.receiptDigest,
        expectedChainRootPagesSourceCommit: gen0SourceCommit,
        fetchImpl: authorityFetch as unknown as typeof fetch,
        now: NOW,
        randomBytesImpl: size => Buffer.alloc(size, 5),
    });
    expect(authority).toMatchObject({
      candidatePagesSourceCommit: validCandidate,
      livePagesSourceCommit: gen0SourceCommit,
      candidateAlreadyLive: false,
    });
    expect(authorityFetch).toHaveBeenCalled();
    expect(authority.candidateAuthorityDigest).toMatch(/^[0-9a-f]{64}$/u);

    const promotionFetch = liveFetch({
      buildSha: validCandidate,
      attestation: releaseAttestation(HEAD_COMMIT),
    });
    const promoted = await isolatedReceipt.promoteNotificationPagesLiveReceipt({
      directory: targetWorkspace.directory,
      repositoryRoot: realpathSync(cloneRoot),
      candidateAuthorityDigest: authority.candidateAuthorityDigest!,
      candidatePagesSourceCommit: validCandidate,
      expectedChainRootReceiptDigest: installedGen0.receiptDigest,
      expectedChainRootPagesSourceCommit: gen0SourceCommit,
      fetchImpl: promotionFetch as unknown as typeof fetch,
      now: NOW,
      randomBytesImpl: size => Buffer.alloc(size, 6),
    });
    expect(promoted).toMatchObject({
      result: 'installed',
      receipt: {
        chain: { generation: 1 },
        pages: { sourceCommit: validCandidate },
      },
      chainRootReceiptDigest: installedGen0.receiptDigest,
      chainRootPagesSourceCommit: gen0SourceCommit,
    });
    expect(promotionFetch).toHaveBeenCalled();

    const stagedPreparedDrift = descendantCommitWithSources(validCandidate, {
      [preparedPath]: `${preparedNull}\n// staged post-root drift\n`,
    });
    checkout(stagedPreparedDrift);
    const stagedAfterRoot = handoffFixture(
      targetWorkspace,
      stagedPreparedDrift,
    );
    const stagedNoFetch = vi.fn();
    await expect(
      isolatedReceipt.inspectLatestPrivateNotificationPagesLiveReceiptForCandidate({
        directory: targetWorkspace.directory,
        repositoryRoot: realpathSync(cloneRoot),
        candidatePagesSourceCommit: stagedPreparedDrift,
        expectedChainRootReceiptDigest: installedGen0.receiptDigest,
        expectedChainRootPagesSourceCommit: gen0SourceCommit,
        stagedHandoffExpectations: stagedAfterRoot.expectations,
        fetchImpl: stagedNoFetch as unknown as typeof fetch,
        now: NOW,
        randomBytesImpl: size => Buffer.alloc(size, 7),
      }),
    ).rejects.toThrow(
      'NOTIFICATION_PAGES_LIVE_RELEASE_BINDING_TRANSITION_INVALID',
    );
    expect(stagedNoFetch).not.toHaveBeenCalled();
    expect(readdirSync(targetWorkspace.directory).some(name =>
      name.startsWith('notification-pages-candidate-'))).toBe(false);

    const hermesPath = 'scripts/hermes-admin.ts';
    const hermesDisabled = readFileSync(join(process.cwd(), hermesPath), 'utf8');
    const hermesEnabled = hermesDisabled.replace(
      'FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = false as const',
      'FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = true as const',
    );
    expect(hermesEnabled).not.toBe(hermesDisabled);
    const finalCandidate = descendantCommitWithSources(validCandidate, {
      [hermesPath]: hermesEnabled,
    });
    checkout(finalCandidate);
    const finalAuthorityFetch = liveFetch({
      buildSha: validCandidate,
      attestation: releaseAttestation(HEAD_COMMIT),
    });
    const finalAuthority = await isolatedReceipt
      .inspectLatestPrivateNotificationPagesLiveReceiptForCandidate({
        directory: targetWorkspace.directory,
        repositoryRoot: realpathSync(cloneRoot),
        candidatePagesSourceCommit: finalCandidate,
        expectedChainRootReceiptDigest: installedGen0.receiptDigest,
        expectedChainRootPagesSourceCommit: gen0SourceCommit,
        fetchImpl: finalAuthorityFetch as unknown as typeof fetch,
        now: NOW,
        randomBytesImpl: size => Buffer.alloc(size, 7),
      });
    expect(finalAuthority.candidateAuthorityDigest).toMatch(/^[0-9a-f]{64}$/u);
    const finalPromotionFetch = liveFetch({
      buildSha: finalCandidate,
      attestation: releaseAttestation(HEAD_COMMIT),
    });
    await expect(isolatedReceipt.promoteNotificationPagesLiveReceipt({
      directory: targetWorkspace.directory,
      repositoryRoot: realpathSync(cloneRoot),
      candidateAuthorityDigest: finalAuthority.candidateAuthorityDigest!,
      candidatePagesSourceCommit: finalCandidate,
      expectedChainRootReceiptDigest: installedGen0.receiptDigest,
      expectedChainRootPagesSourceCommit: gen0SourceCommit,
      fetchImpl: finalPromotionFetch as unknown as typeof fetch,
      now: NOW,
      randomBytesImpl: size => Buffer.alloc(size, 8),
    })).resolves.toMatchObject({
      result: 'installed',
      receipt: {
        chain: { generation: 2 },
        pages: { sourceCommit: finalCandidate },
      },
      chainRootReceiptDigest: installedGen0.receiptDigest,
      chainRootPagesSourceCommit: gen0SourceCommit,
    });
    expect(finalPromotionFetch).toHaveBeenCalled();
  }, 60_000);

  it('rejects assume-unchanged and skip-worktree protected index flags before network', async () => {
    const protectedPath = 'scripts/notification-pages-live-receipt.mjs';
    for (const [enable, disable] of [
      ['--assume-unchanged', '--no-assume-unchanged'],
      ['--skip-worktree', '--no-skip-worktree'],
    ] as const) {
      const fetchImpl = vi.fn();
      execFileSync('/usr/bin/git', ['update-index', enable, protectedPath], {
        cwd: process.cwd(),
        stdio: 'ignore',
      });
      try {
        await expect(reconcileNotificationPagesLiveCandidate({
          repositoryRoot: process.cwd(),
          candidatePagesSourceCommit: HEAD_COMMIT,
          fetchImpl: fetchImpl as unknown as typeof fetch,
        })).rejects.toThrow(
          'NOTIFICATION_PAGES_LIVE_PROTECTED_CHECKOUT_DIRTY',
        );
        expect(fetchImpl).not.toHaveBeenCalled();
      } finally {
        execFileSync('/usr/bin/git', ['update-index', disable, protectedPath], {
          cwd: process.cwd(),
          stdio: 'ignore',
        });
      }
    }
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

    const capacityWorkspace = workspace('warpkeep-pages-live-capacity-');
    const capacityHandoff = handoffFixture(capacityWorkspace);
    ensureNotificationPagesLiveReceiptDirectory({
      directory: capacityWorkspace.directory,
      repositoryRoot: capacityWorkspace.repositoryRoot,
    });
    for (let index = 0; index < 1021; index += 1) {
      const address = index.toString(16).padStart(64, '0');
      const suffix = index.toString(16).padStart(24, '0');
      writePrivate(
        join(
          capacityWorkspace.directory,
          `.notification-pages-live-${address}-${suffix}.json.tmp`,
        ),
        Buffer.alloc(0),
      );
    }
    expect(readdirSync(capacityWorkspace.directory)).toHaveLength(1021);
    const capacityFetch = vi.fn();
    await expect(writePrivateNotificationPagesLiveReceipt({
      directory: capacityWorkspace.directory,
      repositoryRoot: capacityWorkspace.repositoryRoot,
      handoffExpectations: capacityHandoff.expectations,
      expectedNotificationsPresentationEnabled: true,
      expectedHermesExecutionApproved: false,
      fetchImpl: capacityFetch as unknown as typeof fetch,
      now: NOW,
    })).rejects.toThrow(
      'NOTIFICATION_PAGES_LIVE_DIRECTORY_INVENTORY_EXCEEDED',
    );
    expect(capacityFetch).not.toHaveBeenCalled();

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

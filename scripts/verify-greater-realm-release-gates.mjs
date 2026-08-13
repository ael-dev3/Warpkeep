import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
  inspectPrivateAuthBridgeNotificationPreparedReceiptByDigest,
} from './auth-bridge-notification-prepared-receipt.mjs';
import { WARPKEEP_ENTRY_AGREEMENT_RELEASE_STATUS } from './entry-agreement-policy.mjs';
import {
  readNotificationPagesReleaseSources,
} from './notification-pages-release-source-parser.mjs';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');

function fail(code) {
  throw new Error(code);
}

function source(path) {
  return readFileSync(resolve(REPOSITORY_ROOT, path), 'utf8');
}

function exactlyOne(value, pattern, code) {
  const matches = value.match(pattern) ?? [];
  if (matches.length !== 1) fail(code);
}

const BOOLEAN_FIELDS = Object.freeze([
  'importMutationsCompiled',
  'activationMutationsCompiled',
  'clientPresentationAllowed',
  'serverPresentationAllowed',
  'entryAgreementApproved',
  'additivePublishApproved',
  'importForwardFixApproved',
  'activationForwardFixApproved',
  'clientActivationApproved',
  'admissionNotificationsApproved',
  'hermesNotificationDeliveryApproved',
  'pagesNotificationsEnabled',
]);
const RELEASE_BINDING_FIELDS = Object.freeze([
  'notificationPreparedReceiptDigest',
  'notificationPreparedBridgeSourceCommit',
  'notificationPagesLiveRootReceiptDigest',
  'notificationPagesLiveRootPagesSourceCommit',
]);
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const COMMIT_SHA = /^[a-f0-9]{40}$/u;

/**
 * Notification delivery is deliberately split across two source releases.
 * Pages presentation is activated while Hermes is still inert and is rooted
 * in the short-lived prepared bridge receipt. Hermes can only be activated by
 * a later source with the immutable durable Pages chain root populated.
 */
export const GREATER_REALM_NOTIFICATION_RELEASE_PHASE = Object.freeze({
  PAGES_PRESENTATION_ACTIVATION: 'notification-pages-presentation-activation',
  ROOTED_INERT: 'notification-pages-rooted-inert',
  DURABLE_FINAL: 'notification-durable-final',
});

const base = Object.freeze(Object.fromEntries(BOOLEAN_FIELDS.map(field => [field, false])));

function phase(status, changes, phase) {
  return Object.freeze({ entryAgreementReleaseStatus: status, ...base, ...changes, phase });
}

const SAFE_PHASES = Object.freeze([
  phase('review-only-rollout-blocked', {}, 'closed-review'),
  phase('production-approved', {}, 'pre-generation'),
  phase('production-approved', {
    entryAgreementApproved: true,
    additivePublishApproved: true,
  }, 'candidate-approved-inert-append'),
  phase('production-approved', {
    importMutationsCompiled: true,
    entryAgreementApproved: true,
    additivePublishApproved: true,
    importForwardFixApproved: true,
  }, 'import-only'),
  ...[
    [false, 'activation-only'],
    [true, 'activation-client'],
  ].map(([client, name]) => phase(
    'production-approved',
    {
      activationMutationsCompiled: true,
      entryAgreementApproved: true,
      additivePublishApproved: true,
      activationForwardFixApproved: true,
      clientPresentationAllowed: client,
      serverPresentationAllowed: client,
      clientActivationApproved: client,
    },
    name,
  )),
  phase('production-approved', {
    activationMutationsCompiled: true,
    entryAgreementApproved: true,
    additivePublishApproved: true,
    activationForwardFixApproved: true,
    clientPresentationAllowed: true,
    serverPresentationAllowed: true,
    clientActivationApproved: true,
    admissionNotificationsApproved: true,
    pagesNotificationsEnabled: true,
  }, GREATER_REALM_NOTIFICATION_RELEASE_PHASE.PAGES_PRESENTATION_ACTIVATION),
  phase('production-approved', {
    activationMutationsCompiled: true,
    entryAgreementApproved: true,
    additivePublishApproved: true,
    activationForwardFixApproved: true,
    clientPresentationAllowed: true,
    serverPresentationAllowed: true,
    clientActivationApproved: true,
    admissionNotificationsApproved: true,
    hermesNotificationDeliveryApproved: true,
    pagesNotificationsEnabled: true,
  }, GREATER_REALM_NOTIFICATION_RELEASE_PHASE.DURABLE_FINAL),
]);

function envelopeKey(value) {
  return JSON.stringify(Object.fromEntries([
    ['entryAgreementReleaseStatus', value.entryAgreementReleaseStatus],
    ...BOOLEAN_FIELDS.map(field => [field, value[field]]),
  ]));
}

const SAFE_PHASE_BY_ENVELOPE = new Map(SAFE_PHASES.map(value => [envelopeKey(value), value.phase]));

function parseNotificationReleaseBindings(value) {
  const digest = value.notificationPreparedReceiptDigest;
  const sourceCommit = value.notificationPreparedBridgeSourceCommit;
  const hasPreparedBinding = digest !== null || sourceCommit !== null;
  if (hasPreparedBinding && (
    typeof digest !== 'string'
      || !SHA256_HEX.test(digest)
      || typeof sourceCommit !== 'string'
      || !COMMIT_SHA.test(sourceCommit)
  )) fail('GREATER_REALM_NOTIFICATION_PREPARED_BINDING_INVALID');
  const rootDigest = value.notificationPagesLiveRootReceiptDigest;
  const rootSource = value.notificationPagesLiveRootPagesSourceCommit;
  const hasLiveRoot = rootDigest !== null || rootSource !== null;
  if (hasLiveRoot && (
    typeof rootDigest !== 'string'
    || !SHA256_HEX.test(rootDigest)
    || typeof rootSource !== 'string'
    || !COMMIT_SHA.test(rootSource)
  )) fail('GREATER_REALM_NOTIFICATION_PAGES_LIVE_ROOT_BINDING_INVALID');
  return Object.freeze({
    hasPreparedBinding,
    hasLiveRoot,
  });
}

/**
 * Parse the exact, source-supplied authority accepted by notification-enabled
 * Pages validation. Environment variables never select either phase.
 */
export function parseGreaterRealmNotificationReleaseAuthority(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).sort().join(',')
      !== ['phase', ...RELEASE_BINDING_FIELDS].sort().join(',')
    || (
    value.phase !== GREATER_REALM_NOTIFICATION_RELEASE_PHASE.PAGES_PRESENTATION_ACTIVATION
      && value.phase !== GREATER_REALM_NOTIFICATION_RELEASE_PHASE.ROOTED_INERT
      && value.phase !== GREATER_REALM_NOTIFICATION_RELEASE_PHASE.DURABLE_FINAL
    )
  ) fail('GREATER_REALM_NOTIFICATION_RELEASE_AUTHORITY_INVALID');
  const bindings = parseNotificationReleaseBindings(value);
  if (
    value.phase
      === GREATER_REALM_NOTIFICATION_RELEASE_PHASE.PAGES_PRESENTATION_ACTIVATION
  ) {
    if (!bindings.hasPreparedBinding) {
      fail('GREATER_REALM_NOTIFICATION_PREPARED_BINDING_REQUIRED');
    }
    if (bindings.hasLiveRoot) {
      fail('GREATER_REALM_NOTIFICATION_PAGES_LIVE_ROOT_BINDING_UNEXPECTED');
    }
  } else {
    if (!bindings.hasLiveRoot) {
      fail('GREATER_REALM_NOTIFICATION_PAGES_LIVE_ROOT_BINDING_REQUIRED');
    }
    if (bindings.hasPreparedBinding) {
      fail('GREATER_REALM_NOTIFICATION_PREPARED_BINDING_UNEXPECTED');
    }
  }
  return Object.freeze({
    phase: value.phase,
    notificationPreparedReceiptDigest: value.notificationPreparedReceiptDigest,
    notificationPreparedBridgeSourceCommit:
      value.notificationPreparedBridgeSourceCommit,
    notificationPagesLiveRootReceiptDigest:
      value.notificationPagesLiveRootReceiptDigest,
    notificationPagesLiveRootPagesSourceCommit:
      value.notificationPagesLiveRootPagesSourceCommit,
  });
}

function assertSourceIsAncestor(
  sourceCommit,
  repositoryRoot,
  { headInvalidCode, notAncestorCode },
) {
  const environment = {
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: '/dev/null',
    HOME: '/nonexistent',
    PATH: '/usr/bin:/bin',
  };
  const head = spawnSync(
    '/usr/bin/git',
    ['rev-parse', '--verify', 'HEAD^{commit}'],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: environment,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
    },
  );
  const headCommit = head.status === 0 ? head.stdout.trim() : '';
  if (!COMMIT_SHA.test(headCommit)) {
    fail(headInvalidCode);
  }
  const ancestry = spawnSync(
    '/usr/bin/git',
    ['merge-base', '--is-ancestor', sourceCommit, headCommit],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: environment,
      stdio: ['ignore', 'ignore', 'ignore'],
      timeout: 10_000,
    },
  );
  if (ancestry.status !== 0) {
    fail(notAncestorCode);
  }
}

function assertPreparedBridgeSourceIsAncestor(
  bridgeSourceCommit,
  repositoryRoot = REPOSITORY_ROOT,
) {
  assertSourceIsAncestor(bridgeSourceCommit, repositoryRoot, {
    headInvalidCode: 'GREATER_REALM_NOTIFICATION_PREPARED_PAGES_SOURCE_INVALID',
    notAncestorCode:
      'GREATER_REALM_NOTIFICATION_PREPARED_BRIDGE_SOURCE_NOT_ANCESTOR',
  });
}

function assertPagesLiveRootSourceIsAncestor(
  pagesSourceCommit,
  repositoryRoot = REPOSITORY_ROOT,
) {
  assertSourceIsAncestor(pagesSourceCommit, repositoryRoot, {
    headInvalidCode: 'GREATER_REALM_NOTIFICATION_PAGES_LIVE_HEAD_INVALID',
    notAncestorCode:
      'GREATER_REALM_NOTIFICATION_PAGES_LIVE_ROOT_SOURCE_NOT_ANCESTOR',
  });
}

export async function verifyGreaterRealmReleaseGateEnvelope(
  value,
  {
    fetchImpl = fetch,
    now = new Date(),
    notificationAuthorityMode = 'full',
  } = {},
  {
    inspectPreparedReceiptByDigest =
      inspectPrivateAuthBridgeNotificationPreparedReceiptByDigest,
    assertBridgeSourceAncestor = assertPreparedBridgeSourceIsAncestor,
    assertPagesLiveRootSourceAncestor = assertPagesLiveRootSourceIsAncestor,
  } = {},
) {
  if (
    notificationAuthorityMode !== 'full'
    && notificationAuthorityMode !== 'static'
  ) fail('GREATER_REALM_NOTIFICATION_AUTHORITY_MODE_INVALID');
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).sort().join(',')
      !== [
        'entryAgreementReleaseStatus',
        ...BOOLEAN_FIELDS,
        ...RELEASE_BINDING_FIELDS,
      ].sort().join(',')
    || (
      value.entryAgreementReleaseStatus !== 'review-only-rollout-blocked'
      && value.entryAgreementReleaseStatus !== 'production-approved'
    )
    || BOOLEAN_FIELDS.some(field => typeof value[field] !== 'boolean')
    || (value.importMutationsCompiled && value.activationMutationsCompiled)
  ) fail('GREATER_REALM_RELEASE_GATE_ENVELOPE_INVALID');
  let phaseName = SAFE_PHASE_BY_ENVELOPE.get(envelopeKey(value));
  if (phaseName === undefined) fail('GREATER_REALM_RELEASE_GATE_PHASE_INVALID');
  const bindings = parseNotificationReleaseBindings(value);
  if (
    phaseName
      === GREATER_REALM_NOTIFICATION_RELEASE_PHASE.PAGES_PRESENTATION_ACTIVATION
    && !bindings.hasPreparedBinding
    && bindings.hasLiveRoot
  ) phaseName = GREATER_REALM_NOTIFICATION_RELEASE_PHASE.ROOTED_INERT;
  const notificationPhase = phaseName
      === GREATER_REALM_NOTIFICATION_RELEASE_PHASE.PAGES_PRESENTATION_ACTIVATION
    || phaseName === GREATER_REALM_NOTIFICATION_RELEASE_PHASE.ROOTED_INERT
    || phaseName === GREATER_REALM_NOTIFICATION_RELEASE_PHASE.DURABLE_FINAL;
  if (!notificationPhase) {
    if (bindings.hasPreparedBinding) {
      fail('GREATER_REALM_NOTIFICATION_PREPARED_BINDING_UNEXPECTED');
    }
    if (bindings.hasLiveRoot) {
      fail('GREATER_REALM_NOTIFICATION_PAGES_LIVE_ROOT_BINDING_UNEXPECTED');
    }
    return phaseName;
  }
  const authority = parseGreaterRealmNotificationReleaseAuthority({
    phase: phaseName,
    ...Object.fromEntries(RELEASE_BINDING_FIELDS.map(field => [field, value[field]])),
  });
  if (
    phaseName === GREATER_REALM_NOTIFICATION_RELEASE_PHASE.ROOTED_INERT
    || phaseName === GREATER_REALM_NOTIFICATION_RELEASE_PHASE.DURABLE_FINAL
  ) {
    // This public/static gate proves source lineage only. The separate private
    // predeploy and Hermes boundaries must authenticate the current-source
    // durable receipt against this immutable root before any side effect.
    await assertPagesLiveRootSourceAncestor(
      authority.notificationPagesLiveRootPagesSourceCommit,
      REPOSITORY_ROOT,
    );
    return phaseName;
  }

  await assertBridgeSourceAncestor(
    authority.notificationPreparedBridgeSourceCommit,
    REPOSITORY_ROOT,
  );
  if (notificationAuthorityMode === 'static') return phaseName;
  const inspected = await inspectPreparedReceiptByDigest({
    receiptDigest: authority.notificationPreparedReceiptDigest,
    repositoryRoot: REPOSITORY_ROOT,
    fetchImpl,
    now,
  });
  if (
    inspected.receiptDigest !== authority.notificationPreparedReceiptDigest
    || inspected.receipt.bridgeSourceCommit
      !== authority.notificationPreparedBridgeSourceCommit
    || inspected.liveAttestation.bridgeSourceCommit
      !== authority.notificationPreparedBridgeSourceCommit
    || inspected.liveAttestation.notificationDeliveryContractDigest
      !== AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST
    || inspected.liveAttestation.notificationDeliveryEnabled !== true
    || inspected.liveAttestation.notificationTransportConfigured !== true
    || inspected.liveAttestation.admissionNotificationStoreConfigured !== true
    || inspected.liveAttestation.notificationClientCount !== 1
  ) fail('GREATER_REALM_NOTIFICATION_PREPARED_LIVE_ATTESTATION_MISMATCH');
  return phaseName;
}

function exactBooleanLiteral(value, prefix, suffix, code) {
  const falsePattern = new RegExp(`^${prefix}false${suffix}$`, 'gmu');
  const truePattern = new RegExp(`^${prefix}true${suffix}$`, 'gmu');
  const falseCount = (value.match(falsePattern) ?? []).length;
  const trueCount = (value.match(truePattern) ?? []).length;
  if (falseCount + trueCount !== 1) fail(code);
  return trueCount === 1;
}

/** Inspect the exact checked-in gate envelope and its source-bound authority. */
export async function inspectGreaterRealmReleaseGateState(
  options = {},
  dependencies = {},
) {
  const notificationSources = readNotificationPagesReleaseSources({
    repositoryRoot: REPOSITORY_ROOT,
  });
  const serverPolicy = source('spacetimedb/src/greaterRealmV17Policy.ts');
  const importMutationsCompiled = exactBooleanLiteral(
    serverPolicy,
    'export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = ',
    ';',
    'GREATER_REALM_IMPORT_GATE_INVALID',
  );
  const activationMutationsCompiled = exactBooleanLiteral(
    serverPolicy,
    'export const GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = ',
    ';',
    'GREATER_REALM_ACTIVATION_GATE_INVALID',
  );

  const clientBridge = source('src/spacetime/greaterRealmProviderBridge.ts');
  const clientPresentationAllowed = exactBooleanLiteral(
    clientBridge,
    'export const GREATER_REALM_CLIENT_PRESENTATION_ALLOWED = ',
    ' as const;',
    'GREATER_REALM_CLIENT_GATE_INVALID',
  );
  const clientTransport = source('src/greater-realm/greaterRealmTransport.ts');
  const serverPresentationAllowed = exactBooleanLiteral(
    clientTransport,
    'export const GREATER_REALM_SERVER_PRESENTATION_ALLOWED = ',
    ' as const;',
    'GREATER_REALM_SERVER_PRESENTATION_GATE_INVALID',
  );

  const publisher = source('scripts/greater-realm-production-publisher-core.ts');
  const publisherFlags = {};
  for (const field of [
    'entryAgreementApproved',
    'additivePublishApproved',
    'importForwardFixApproved',
    'activationForwardFixApproved',
  ]) {
    publisherFlags[field] = exactBooleanLiteral(
      publisher,
      `  ${field}: `,
      ',',
      `GREATER_REALM_PUBLISHER_${field.toUpperCase()}_INVALID`,
    );
  }
  // The module publisher is never downstream presentation or delivery
  // authority. Keep its legacy fields exact-false so an older caller cannot
  // accidentally couple a server publication to either later release phase.
  for (const field of [
    'clientActivationApproved',
    'admissionNotificationsApproved',
  ]) {
    if (exactBooleanLiteral(
      publisher,
      `  ${field}: `,
      ',',
      `GREATER_REALM_PUBLISHER_${field.toUpperCase()}_INVALID`,
    )) fail(`GREATER_REALM_PUBLISHER_${field.toUpperCase()}_MUST_REMAIN_FALSE`);
  }

  const downstream = source('scripts/greater-realm-downstream-release-policy.ts');
  const downstreamFlags = {};
  for (const field of [
    'clientActivationApproved',
    'admissionNotificationsApproved',
  ]) {
    downstreamFlags[field] = exactBooleanLiteral(
      downstream,
      `  ${field}: `,
      ',',
      `GREATER_REALM_DOWNSTREAM_${field.toUpperCase()}_INVALID`,
    );
  }

  const pages = source('.github/workflows/deploy-pages.yml');
  if (pages.includes('vars.WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED')) {
    fail('GREATER_REALM_PAGES_NOTIFICATION_GATE_MUTABLE');
  }
  const pagesNotificationsEnabled =
    notificationSources.phase.pagesPresentationEnabled;
  const hermesNotificationDeliveryApproved =
    notificationSources.phase.hermesExecutionApproved;

  // The v17 verifier is additive. The legacy Genesis preflight must retain its
  // exact 100-founder ceiling and is never broadened to make a v17 check pass.
  const legacyVerifier = source('scripts/verify-alpha-production.mjs');
  exactlyOne(
    legacyVerifier,
    /^const MAX_GENESIS_FOUNDER_COUNT = 100;$/gmu,
    'GREATER_REALM_LEGACY_PREFLIGHT_WEAKENED',
  );
  const v17Verifier = source('scripts/greater-realm-production-verifier-core.ts');
  exactlyOne(
    v17Verifier,
    /^export const GREATER_REALM_PRODUCTION_MAX_FOUNDERS = 600 as const;$/gmu,
    'GREATER_REALM_V17_VERIFIER_CAPACITY_INVALID',
  );

  const phaseName = await verifyGreaterRealmReleaseGateEnvelope({
    entryAgreementReleaseStatus: WARPKEEP_ENTRY_AGREEMENT_RELEASE_STATUS,
    importMutationsCompiled,
    activationMutationsCompiled,
    clientPresentationAllowed,
    serverPresentationAllowed,
    ...publisherFlags,
    ...downstreamFlags,
    hermesNotificationDeliveryApproved,
    pagesNotificationsEnabled,
    ...notificationSources.preparedBinding,
    ...notificationSources.liveRootBinding,
  }, options, dependencies);
  const notificationReleaseAuthority = [
    GREATER_REALM_NOTIFICATION_RELEASE_PHASE.PAGES_PRESENTATION_ACTIVATION,
    GREATER_REALM_NOTIFICATION_RELEASE_PHASE.ROOTED_INERT,
    GREATER_REALM_NOTIFICATION_RELEASE_PHASE.DURABLE_FINAL,
  ].includes(phaseName)
    ? parseGreaterRealmNotificationReleaseAuthority({
      phase: phaseName,
      ...notificationSources.preparedBinding,
      ...notificationSources.liveRootBinding,
    })
    : null;
  return Object.freeze({ phase: phaseName, notificationReleaseAuthority });
}

/** Release-envelope attestation used before and after the Pages deployment. */
export async function verifyGreaterRealmReleaseGateState(
  options = {},
  dependencies = {},
) {
  const inspected = await inspectGreaterRealmReleaseGateState(
    options,
    dependencies,
  );
  return `Greater Realm release phase=${inspected.phase}; legacy=100 and v17=600 verifiers are distinct.`;
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    console.log(await verifyGreaterRealmReleaseGateState());
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'GREATER_REALM_RELEASE_GATE_CHECK_FAILED');
    process.exitCode = 1;
  }
}

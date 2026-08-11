import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { WARPKEEP_ENTRY_AGREEMENT_RELEASE_STATUS } from './entry-agreement-policy.mjs';

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
  'pagesNotificationsEnabled',
]);

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
    [false, false, 'activation-only'],
    [true, false, 'activation-client'],
    [true, true, 'activation-client-and-notifications'],
  ].map(([client, notifications, name]) => phase(
    'production-approved',
    {
      activationMutationsCompiled: true,
      entryAgreementApproved: true,
      additivePublishApproved: true,
      activationForwardFixApproved: true,
      clientPresentationAllowed: client,
      serverPresentationAllowed: client,
      clientActivationApproved: client,
      admissionNotificationsApproved: notifications,
      pagesNotificationsEnabled: notifications,
    },
    name,
  )),
]);

function envelopeKey(value) {
  return JSON.stringify(Object.fromEntries([
    ['entryAgreementReleaseStatus', value.entryAgreementReleaseStatus],
    ...BOOLEAN_FIELDS.map(field => [field, value[field]]),
  ]));
}

const SAFE_PHASE_BY_ENVELOPE = new Map(SAFE_PHASES.map(value => [envelopeKey(value), value.phase]));

export function verifyGreaterRealmReleaseGateEnvelope(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).sort().join(',')
      !== ['entryAgreementReleaseStatus', ...BOOLEAN_FIELDS].sort().join(',')
    || (
      value.entryAgreementReleaseStatus !== 'review-only-rollout-blocked'
      && value.entryAgreementReleaseStatus !== 'production-approved'
    )
    || BOOLEAN_FIELDS.some(field => typeof value[field] !== 'boolean')
    || (value.importMutationsCompiled && value.activationMutationsCompiled)
  ) fail('GREATER_REALM_RELEASE_GATE_ENVELOPE_INVALID');
  const phaseName = SAFE_PHASE_BY_ENVELOPE.get(envelopeKey(value));
  if (phaseName === undefined) fail('GREATER_REALM_RELEASE_GATE_PHASE_INVALID');
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

/** Static, no-network release-envelope attestation used by Pages and CI. */
export function verifyGreaterRealmReleaseGateState() {
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
    'clientActivationApproved',
    'admissionNotificationsApproved',
  ]) {
    publisherFlags[field] = exactBooleanLiteral(
      publisher,
      `  ${field}: `,
      ',',
      `GREATER_REALM_PUBLISHER_${field.toUpperCase()}_INVALID`,
    );
  }

  const pages = source('.github/workflows/deploy-pages.yml');
  const pagesNotificationsEnabled = exactBooleanLiteral(
    pages,
    "      VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: '",
    "'",
    'GREATER_REALM_PAGES_NOTIFICATION_GATE_INVALID',
  );
  if (pages.includes('vars.WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED')) {
    fail('GREATER_REALM_PAGES_NOTIFICATION_GATE_MUTABLE');
  }

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

  const phaseName = verifyGreaterRealmReleaseGateEnvelope({
    entryAgreementReleaseStatus: WARPKEEP_ENTRY_AGREEMENT_RELEASE_STATUS,
    importMutationsCompiled,
    activationMutationsCompiled,
    clientPresentationAllowed,
    serverPresentationAllowed,
    ...publisherFlags,
    pagesNotificationsEnabled,
  });
  return `Greater Realm release phase=${phaseName}; legacy=100 and v17=600 verifiers are distinct.`;
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    console.log(verifyGreaterRealmReleaseGateState());
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'GREATER_REALM_RELEASE_GATE_CHECK_FAILED');
    process.exitCode = 1;
  }
}

const INERT_VERSION = '0.3.43';
const INERT_DESCRIPTION =
  'Command four Workers, gather resources and return to a permanent keep in Genesis 001. Invite-only Alpha.';
const ACTIVE_DESCRIPTION =
  'Explore a six-region world foundation. The core gameplay loop remains incomplete; invite-only Alpha.';

export const AUTH_BRIDGE_RELEASE_TRANSITION_FIXTURE_PATHS = new Set([
  '.github/workflows/deploy-pages.yml',
  'package-lock.json',
  'package.json',
  'public/.well-known/farcaster.json',
  'scripts/auth-bridge-notification-prepared-release-binding.mjs',
  'scripts/farcaster-miniapp-contract.mjs',
  'scripts/greater-realm-downstream-release-policy.ts',
  'scripts/greater-realm-production-publisher-core.ts',
  'scripts/hermes-admin.ts',
  'scripts/notification-pages-live-release-binding.mjs',
  'scripts/notification-pages-private-release-binding.mjs',
  'spacetimedb/src/greaterRealmV17Policy.ts',
  'src/greater-realm/greaterRealmTransport.ts',
  'src/spacetime/greaterRealmProviderBridge.ts',
]);

function replaceExact(
  source: string,
  pattern: RegExp,
  replacement: string,
  inspect?: (captures: readonly string[]) => void,
): string {
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1 || matches[0]?.index === undefined) {
    throw new Error('release-transition fixture source was not exact');
  }
  inspect?.(matches[0].slice(1));
  const match = matches[0];
  return source.slice(0, match.index)
    + replacement
    + source.slice(match.index + match[0].length);
}

function booleanTuple(values: readonly string[], allowed: readonly string[]): void {
  if (values.some(value => value !== 'true' && value !== 'false')) {
    throw new Error('release-transition fixture boolean was invalid');
  }
  const tuple = values.map(value => value === 'true' ? 'T' : 'F').join('');
  if (!allowed.includes(tuple)) {
    throw new Error('release-transition fixture phase was invalid');
  }
}

function bindingTuple(values: readonly string[]): void {
  const nullCount = values.filter(value => value === 'null').length;
  if (nullCount !== 0 && nullCount !== values.length) {
    throw new Error('release-transition fixture binding was partial');
  }
}

/**
 * Reconstruct the immutable C0 digest input independently of the checkout's
 * current C0-C7 phase. Test fixtures must never bless the phase that happened
 * to be checked out when they were created.
 */
export function canonicalAuthBridgeReleaseTransitionFixtureSource(
  relativePath: string,
  source: string,
): string {
  if (!AUTH_BRIDGE_RELEASE_TRANSITION_FIXTURE_PATHS.has(relativePath)) {
    return source;
  }
  if (relativePath === 'package.json') {
    return replaceExact(
      source,
      /^  "version": "(0\.3\.43|0\.3\.44)",$/gmu,
      `  "version": "${INERT_VERSION}",`,
    );
  }
  if (relativePath === 'package-lock.json') {
    return replaceExact(
      source,
      /^\{\n  "name": "warpkeep",\n  "version": "(0\.3\.43|0\.3\.44)",\n  "lockfileVersion": 3,\n  "requires": true,\n  "packages": \{\n    "": \{\n      "name": "warpkeep",\n      "version": "(0\.3\.43|0\.3\.44)",$/gmu,
      '{\n'
        + '  "name": "warpkeep",\n'
        + `  "version": "${INERT_VERSION}",\n`
        + '  "lockfileVersion": 3,\n'
        + '  "requires": true,\n'
        + '  "packages": {\n'
        + '    "": {\n'
        + '      "name": "warpkeep",\n'
        + `      "version": "${INERT_VERSION}",`,
      values => {
        if (values[0] !== values[1]) {
          throw new Error('release-transition fixture versions were mismatched');
        }
      },
    );
  }
  if (relativePath === 'scripts/farcaster-miniapp-contract.mjs') {
    return replaceExact(
      source,
      /^  description:\n    '(Command four Workers, gather resources and return to a permanent keep in Genesis 001\. Invite-only Alpha\.|Explore a six-region world foundation\. The core gameplay loop remains incomplete; invite-only Alpha\.)',$/gmu,
      `  description:\n    '${INERT_DESCRIPTION}',`,
    );
  }
  if (relativePath === 'public/.well-known/farcaster.json') {
    return replaceExact(
      source,
      /^    "description": "(Command four Workers, gather resources and return to a permanent keep in Genesis 001\. Invite-only Alpha\.|Explore a six-region world foundation\. The core gameplay loop remains incomplete; invite-only Alpha\.)",$/gmu,
      `    "description": "${INERT_DESCRIPTION}",`,
    );
  }
  if (relativePath === 'spacetimedb/src/greaterRealmV17Policy.ts') {
    return replaceExact(
      source,
      /^export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = (false|true);\nexport const GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = (false|true);$/gmu,
      'export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = false;\n'
        + 'export const GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = false;',
      values => booleanTuple(values, ['FF', 'TF', 'FT']),
    );
  }
  if (relativePath === 'scripts/greater-realm-production-publisher-core.ts') {
    return replaceExact(
      source,
      /^export const GREATER_REALM_PRODUCTION_RELEASE_FLAGS = Object\.freeze\(\{\n  entryAgreementApproved: (false|true),\n  additivePublishApproved: (false|true),\n  importForwardFixApproved: (false|true),\n  activationForwardFixApproved: (false|true),\n  clientActivationApproved: (false|true),\n  admissionNotificationsApproved: (false|true),\n\} as const\);$/gmu,
      'export const GREATER_REALM_PRODUCTION_RELEASE_FLAGS = Object.freeze({\n'
        + '  entryAgreementApproved: false,\n'
        + '  additivePublishApproved: false,\n'
        + '  importForwardFixApproved: false,\n'
        + '  activationForwardFixApproved: false,\n'
        + '  clientActivationApproved: false,\n'
        + '  admissionNotificationsApproved: false,\n'
        + '} as const);',
      values => booleanTuple(values, ['FFFFFF', 'TTFFFF', 'TTTFFF', 'TTFTFF']),
    );
  }
  if (relativePath === 'scripts/greater-realm-downstream-release-policy.ts') {
    return replaceExact(
      source,
      /^export const GREATER_REALM_DOWNSTREAM_RELEASE_FLAGS = Object\.freeze\(\{\n  clientActivationApproved: (false|true),\n  admissionNotificationsApproved: (false|true),\n\} as const\);$/gmu,
      'export const GREATER_REALM_DOWNSTREAM_RELEASE_FLAGS = Object.freeze({\n'
        + '  clientActivationApproved: false,\n'
        + '  admissionNotificationsApproved: false,\n'
        + '} as const);',
      values => booleanTuple(values, ['FF', 'TF', 'TT']),
    );
  }
  if (relativePath === 'src/spacetime/greaterRealmProviderBridge.ts') {
    return replaceExact(
      source,
      /^export const GREATER_REALM_CLIENT_PRESENTATION_ALLOWED = (false|true) as const;$/gmu,
      'export const GREATER_REALM_CLIENT_PRESENTATION_ALLOWED = false as const;',
    );
  }
  if (relativePath === 'src/greater-realm/greaterRealmTransport.ts') {
    return replaceExact(
      source,
      /^export const GREATER_REALM_SERVER_PRESENTATION_ALLOWED = (false|true) as const;$/gmu,
      'export const GREATER_REALM_SERVER_PRESENTATION_ALLOWED = false as const;',
    );
  }
  if (relativePath === '.github/workflows/deploy-pages.yml') {
    return replaceExact(
      source,
      /^      VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: '(false|true)'$/gmu,
      "      VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'false'",
    );
  }
  if (relativePath === 'scripts/hermes-admin.ts') {
    return replaceExact(
      source,
      /^export const FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = (false|true) as const;$/gmu,
      'export const FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = false as const;',
    );
  }
  if (
    relativePath
      === 'scripts/auth-bridge-notification-prepared-release-binding.mjs'
  ) {
    return replaceExact(
      source,
      /^export const AUTH_BRIDGE_NOTIFICATION_PREPARED_RELEASE_BINDING = Object\.freeze\(\{\n  notificationPreparedReceiptDigest: (null|'[a-f0-9]{64}'),\n  notificationPreparedBridgeSourceCommit: (null|'[a-f0-9]{40}'),\n\}\);$/gmu,
      'export const AUTH_BRIDGE_NOTIFICATION_PREPARED_RELEASE_BINDING = Object.freeze({\n'
        + '  notificationPreparedReceiptDigest: null,\n'
        + '  notificationPreparedBridgeSourceCommit: null,\n'
        + '});',
      bindingTuple,
    );
  }
  if (relativePath === 'scripts/notification-pages-private-release-binding.mjs') {
    return replaceExact(
      source,
      /^export const NOTIFICATION_PAGES_PRIVATE_RELEASE_BINDING = Object\.freeze\(\{\n  notificationPagesActiveV17EvidenceDigest: (null|'[a-f0-9]{64}'),\n  notificationPagesDeployedModuleReceiptDigest: (null|'[a-f0-9]{64}'),\n  notificationPagesExpectedFounderCount: (null|(?:[1-9]|[1-9][0-9]|[1-5][0-9]{2}|600)),\n\}\);$/gmu,
      'export const NOTIFICATION_PAGES_PRIVATE_RELEASE_BINDING = Object.freeze({\n'
        + '  notificationPagesActiveV17EvidenceDigest: null,\n'
        + '  notificationPagesDeployedModuleReceiptDigest: null,\n'
        + '  notificationPagesExpectedFounderCount: null,\n'
        + '});',
      bindingTuple,
    );
  }
  if (relativePath === 'scripts/notification-pages-live-release-binding.mjs') {
    return replaceExact(
      source,
      /^export const NOTIFICATION_PAGES_LIVE_RELEASE_BINDING = Object\.freeze\(\{\n  notificationPagesLiveRootReceiptDigest: (null|'[a-f0-9]{64}'),\n  notificationPagesLiveRootPagesSourceCommit: (null|'[a-f0-9]{40}'),\n\}\);$/gmu,
      'export const NOTIFICATION_PAGES_LIVE_RELEASE_BINDING = Object.freeze({\n'
        + '  notificationPagesLiveRootReceiptDigest: null,\n'
        + '  notificationPagesLiveRootPagesSourceCommit: null,\n'
        + '});',
      bindingTuple,
    );
  }
  throw new Error(`release-transition fixture path ${relativePath} was unhandled`);
}

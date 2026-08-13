import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  WARPKEEP_ENTRY_AGREEMENT_RELEASE_STATUS,
} from './entry-agreement-policy.mjs';
import {
  readNotificationPagesReleaseSources,
} from './notification-pages-release-source-parser.mjs';
import {
  parseGreaterRealmNotificationReleaseAuthority,
} from './verify-greater-realm-release-gates.mjs';

const EXPECTED_CANONICAL_ORIGIN = 'https://warpkeep.com';
const EXPECTED_REPOSITORY_URL = 'https://github.com/ael-dev3/Warpkeep';
const EXPECTED_AUDIENCE = 'warpkeep-spacetimedb';
const EXPECTED_BRIDGE = 'https://auth.warpkeep.com';
const EXPECTED_SPACETIMEDB_URI = 'https://maincloud.spacetimedb.com';
const EXPECTED_SPACETIMEDB_DATABASE = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const SHA_PATTERN = /^[0-9a-f]{40}$/i;

function fail(message) {
  throw new Error(`Pages deployment configuration is invalid: ${message}`);
}

function exactHttpsOrigin(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${label} is required when shared alpha is enabled.`);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be a valid HTTPS origin.`);
  }

  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
    || parsed.hostname.endsWith('.invalid')
  ) {
    fail(`${label} must be a stable public HTTPS origin.`);
  }

  return parsed.origin;
}

function exactBoolean(value, label) {
  if (value === 'true' || value === 'false') {
    return value === 'true';
  }
  fail(`${label} must be exactly true or false.`);
}

export function validatePagesDeploymentConfiguration(
  environment = process.env,
  options = {},
) {
  const entryAgreementReleaseStatus =
    options.entryAgreementReleaseStatus
    ?? WARPKEEP_ENTRY_AGREEMENT_RELEASE_STATUS;
  if (entryAgreementReleaseStatus !== 'production-approved') {
    fail(
      'the current entry agreement is review-only; coordinated Pages and '
      + 'SpacetimeDB rollout approval is required.',
    );
  }
  if (environment.DEPLOY_BASE !== '/') {
    fail('DEPLOY_BASE must be /.');
  }
  if (environment.VITE_WARPKEEP_RELEASE_CHANNEL !== 'alpha') {
    fail('VITE_WARPKEEP_RELEASE_CHANNEL must be alpha.');
  }
  if (!SHA_PATTERN.test(environment.VITE_WARPKEEP_BUILD_SHA ?? '')) {
    fail('VITE_WARPKEEP_BUILD_SHA must be the full Git commit SHA.');
  }
  if (environment.VITE_WARPKEEP_REPOSITORY_URL !== EXPECTED_REPOSITORY_URL) {
    fail('VITE_WARPKEEP_REPOSITORY_URL must identify the Warpkeep repository.');
  }
  if (environment.VITE_WARPKEEP_CANONICAL_ORIGIN !== EXPECTED_CANONICAL_ORIGIN) {
    fail('VITE_WARPKEEP_CANONICAL_ORIGIN must be https://warpkeep.com.');
  }

  const sharedAlphaEnabled = exactBoolean(
    environment.VITE_WARPKEEP_SHARED_ALPHA_ENABLED,
    'VITE_WARPKEEP_SHARED_ALPHA_ENABLED'
  );
  const admissionNotificationsEnabled = exactBoolean(
    environment.VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED,
    'VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED'
  );
  let notificationReleaseAuthority;
  if (admissionNotificationsEnabled) {
    // The default CLI intentionally never supplies this. A future production
    // wrapper must import the reviewed, checked-in phase and bindings and pass
    // that exact source authority; mutable process environment is not trusted.
    if (options.notificationReleaseAuthority === undefined) {
      fail(
        'VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED=true requires an '
        + 'explicit source-supplied notification release phase and authority.'
      );
    }
    try {
      notificationReleaseAuthority =
        parseGreaterRealmNotificationReleaseAuthority(
          options.notificationReleaseAuthority,
        );
    } catch (error) {
      fail(
        'the explicit notification release phase and authority is invalid: '
        + (error instanceof Error ? error.message : 'unknown authority error'),
      );
    }
    const parsedSources = readNotificationPagesReleaseSources({
      repositoryRoot: resolve(import.meta.dirname, '..'),
    });
    const checkedInBindings = {
      ...parsedSources.preparedBinding,
      ...parsedSources.liveRootBinding,
    };
    if (Object.entries(checkedInBindings).some(
      ([field, expected]) => notificationReleaseAuthority[field] !== expected,
    )) {
      fail(
        'the explicit notification release authority must exactly match the '
        + 'reviewed checked-in prepared and durable bindings.',
      );
    }
  } else if (options.notificationReleaseAuthority !== undefined) {
    fail(
      'notification release authority must be omitted while '
      + 'VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED=false.'
    );
  }
  if (environment.VITE_WARPKEEP_OIDC_AUDIENCE !== EXPECTED_AUDIENCE) {
    fail(`VITE_WARPKEEP_OIDC_AUDIENCE must be ${EXPECTED_AUDIENCE}.`);
  }
  if (environment.VITE_SPACETIMEDB_URI !== EXPECTED_SPACETIMEDB_URI) {
    fail(`VITE_SPACETIMEDB_URI must be ${EXPECTED_SPACETIMEDB_URI}.`);
  }
  if (environment.VITE_SPACETIMEDB_DATABASE !== EXPECTED_SPACETIMEDB_DATABASE) {
    fail(`VITE_SPACETIMEDB_DATABASE must be ${EXPECTED_SPACETIMEDB_DATABASE}.`);
  }
  if (!sharedAlphaEnabled) {
    if (admissionNotificationsEnabled) {
      fail('admission notification presentation requires shared alpha enabled.');
    }
    return 'Pages deployment validation passed with shared alpha disabled.';
  }

  const bridge = exactHttpsOrigin(
    environment.VITE_WARPKEEP_AUTH_BRIDGE_URL,
    'VITE_WARPKEEP_AUTH_BRIDGE_URL'
  );
  const issuer = exactHttpsOrigin(
    environment.VITE_WARPKEEP_OIDC_ISSUER,
    'VITE_WARPKEEP_OIDC_ISSUER'
  );
  if (bridge !== EXPECTED_BRIDGE || issuer !== EXPECTED_BRIDGE) {
    fail(`the bridge URL and OIDC issuer must both be ${EXPECTED_BRIDGE}.`);
  }
  if (notificationReleaseAuthority !== undefined) {
    return 'Pages deployment validation passed with shared alpha enabled; '
      + `admission notification release phase=${notificationReleaseAuthority.phase}.`;
  }
  return 'Pages deployment validation passed with shared alpha enabled.';
}

const isEntrypoint = typeof process.argv[1] === 'string'
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isEntrypoint) {
  try {
    console.log(validatePagesDeploymentConfiguration());
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Pages deployment configuration is invalid.');
    process.exitCode = 1;
  }
}

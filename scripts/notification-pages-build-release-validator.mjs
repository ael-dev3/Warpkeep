import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  readNotificationPagesReleaseSources,
} from './notification-pages-release-source-parser.mjs';
import {
  validatePagesDeploymentConfiguration,
} from './validate-pages-deploy-config.mjs';
import {
  GREATER_REALM_NOTIFICATION_RELEASE_PHASE,
  inspectGreaterRealmReleaseGateState,
} from './verify-greater-realm-release-gates.mjs';

export const NOTIFICATION_PAGES_BUILD_RELEASE_VALIDATOR_PROFILE =
  'warpkeep-notification-pages-build-release-validator-v1';

export class NotificationPagesBuildReleaseValidatorError extends Error {
  constructor(code) {
    super(code);
    this.name = 'NotificationPagesBuildReleaseValidatorError';
    this.code = code;
  }
}

function fail(code) {
  throw new NotificationPagesBuildReleaseValidatorError(code);
}

function classifyCheckedInBindings() {
  const parsed = readNotificationPagesReleaseSources({
    repositoryRoot: resolve(import.meta.dirname, '..'),
  });
  const hasPrepared = parsed.preparedBinding.notificationPreparedReceiptDigest
    !== null;
  const hasPrivate = parsed.privateBinding
    .notificationPagesActiveV17EvidenceDigest !== null;
  const hasRoot = parsed.liveRootBinding.notificationPagesLiveRootReceiptDigest
    !== null;
  if (!hasPrepared && !hasPrivate && !hasRoot) return Object.freeze({ mode: 'closed-review' });
  if (hasPrepared && hasPrivate && !hasRoot) return Object.freeze({ mode: 'gen0' });
  if (!hasPrepared && !hasPrivate && hasRoot) return Object.freeze({ mode: 'durable' });
  fail('NOTIFICATION_PAGES_BUILD_RELEASE_BINDING_STATE_INVALID');
}

/**
 * Validate one source-selected build lane without reading owner-private state.
 * Mutable environment may provide ordinary build configuration, but it never
 * selects notification authority: that value comes only from checked-in gates
 * and bindings inspected by `inspectGateState`.
 */
export async function validateNotificationPagesBuildRelease(
  environment = process.env,
  {
    classifyLane = classifyCheckedInBindings,
    inspectGateState = inspectGreaterRealmReleaseGateState,
    validateConfiguration = validatePagesDeploymentConfiguration,
  } = {},
) {
  if (
    environment === null
    || typeof environment !== 'object'
    || !/^[0-9a-f]{40}$/u.test(environment.VITE_WARPKEEP_BUILD_SHA ?? '')
    || typeof classifyLane !== 'function'
    || typeof inspectGateState !== 'function'
    || typeof validateConfiguration !== 'function'
  ) fail('NOTIFICATION_PAGES_BUILD_RELEASE_INPUT_INVALID');
  const lane = classifyLane({
    candidatePagesSourceCommit: environment.VITE_WARPKEEP_BUILD_SHA,
  });
  const gate = await inspectGateState({ notificationAuthorityMode: 'static' });
  if (
    lane === null
    || typeof lane !== 'object'
    || !['closed-review', 'gen0', 'durable'].includes(lane.mode)
    || gate === null
    || typeof gate !== 'object'
    || typeof gate.phase !== 'string'
  ) fail('NOTIFICATION_PAGES_BUILD_RELEASE_AUTHORITY_INVALID');

  // This flag controls the notification opt-in surface, not Greater Realm
  // world presentation. The gen0 and durable notification lanes deliberately
  // remain on the 0.3.43 world client until activation-client follows Hermes.
  const expectedPresentation = lane.mode === 'closed-review' ? 'false' : 'true';
  if (
    environment.VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED
      !== expectedPresentation
  ) fail('NOTIFICATION_PAGES_BUILD_RELEASE_PRESENTATION_MISMATCH');
  if (
    (lane.mode === 'closed-review'
      && gate.notificationReleaseAuthority !== null)
    || (lane.mode === 'gen0'
      && gate.phase
        !== GREATER_REALM_NOTIFICATION_RELEASE_PHASE.PAGES_PRESENTATION_ACTIVATION)
    || (lane.mode === 'durable'
      && gate.phase !== GREATER_REALM_NOTIFICATION_RELEASE_PHASE.ROOTED_INERT
      && gate.phase !== GREATER_REALM_NOTIFICATION_RELEASE_PHASE.DURABLE_FINAL
      && gate.phase !== GREATER_REALM_NOTIFICATION_RELEASE_PHASE.ACTIVATION_CLIENT)
    || (lane.mode !== 'closed-review'
      && gate.notificationReleaseAuthority === null)
  ) fail('NOTIFICATION_PAGES_BUILD_RELEASE_PHASE_MISMATCH');

  const options = gate.notificationReleaseAuthority === null
    ? undefined
    : Object.freeze({
      notificationReleaseAuthority: gate.notificationReleaseAuthority,
    });
  const message = validateConfiguration(environment, options);
  return Object.freeze({
    schemaVersion: 1,
    profile: NOTIFICATION_PAGES_BUILD_RELEASE_VALIDATOR_PROFILE,
    mode: lane.mode,
    phase: gate.phase,
    message,
  });
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    if (process.argv.length !== 2) {
      fail('NOTIFICATION_PAGES_BUILD_RELEASE_ARGUMENT_INVALID');
    }
    const result = await validateNotificationPagesBuildRelease();
    process.stdout.write(
      `Notification Pages build release validated: lane=${result.mode}; phase=${result.phase}.\n`,
    );
  } catch (error) {
    process.stderr.write(`${
      error instanceof Error
        ? error.message
        : 'NOTIFICATION_PAGES_BUILD_RELEASE_FAILED'
    }\n`);
    process.exitCode = 1;
  }
}

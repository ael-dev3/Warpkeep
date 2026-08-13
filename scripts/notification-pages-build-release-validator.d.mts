import type {
  GreaterRealmNotificationReleaseAuthority,
} from './verify-greater-realm-release-gates.mjs';

export const NOTIFICATION_PAGES_BUILD_RELEASE_VALIDATOR_PROFILE:
  'warpkeep-notification-pages-build-release-validator-v1';

export class NotificationPagesBuildReleaseValidatorError extends Error {
  readonly code: string;
}

export function validateNotificationPagesBuildRelease(
  environment?: NodeJS.ProcessEnv,
  dependencies?: Readonly<{
    classifyLane?: (options: Readonly<{
      candidatePagesSourceCommit: string;
    }>) => Readonly<{ mode: 'closed-review' | 'gen0' | 'durable' }>;
    inspectGateState?: (options: Readonly<{
      notificationAuthorityMode: 'static';
    }>) => Promise<Readonly<{
      phase: string;
      notificationReleaseAuthority:
        GreaterRealmNotificationReleaseAuthority | null;
    }>>;
    validateConfiguration?: (
      environment: NodeJS.ProcessEnv,
      options?: Readonly<{
        notificationReleaseAuthority: GreaterRealmNotificationReleaseAuthority;
      }>,
    ) => string;
  }>,
): Promise<Readonly<{
  schemaVersion: 1;
  profile: typeof NOTIFICATION_PAGES_BUILD_RELEASE_VALIDATOR_PROFILE;
  mode: 'closed-review' | 'gen0' | 'durable';
  phase: string;
  message: string;
}>>;

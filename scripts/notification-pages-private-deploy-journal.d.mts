export const NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_PROFILE:
  'warpkeep-notification-pages-private-deploy-journal-v1';
export const NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_STATE_CHILD:
  'notification-pages-private-deploy-journal-v1';

export class NotificationPagesPrivateDeployJournalError extends Error {
  readonly code: string;
  readonly deploymentMayHaveChanged: boolean;
  constructor(code: string, deploymentMayHaveChanged?: boolean);
}

export type NotificationPagesPrivateDeployJournal = Readonly<{
  operationId: string;
  directory: string;
  inspect: () => Readonly<{
    operationId: string;
    contractDigest: string;
    phase: string | null;
    completed: boolean;
    candidateAuthorityDigest: string | null;
    deploymentInvoked: boolean;
    latestHandoff: Readonly<Record<string, unknown>> | null;
    phases: readonly string[];
  }>;
  prepared: (handoff: Readonly<Record<string, unknown>> | null) => void;
  reconciledExactCurrent: (mode: 'gen0' | 'durable') => void;
  reconciledNotCurrent: (mode: 'gen0' | 'durable') => void;
  candidateAuthorized: (candidateAuthorityDigest: string) => void;
  deployInvoked: (candidateAuthorityDigest: string | null) => void;
  postflightNotCurrent: (mode: 'gen0' | 'durable') => void;
  completed: (
    receiptDigest: string,
    receiptResult: 'installed' | 'unchanged',
  ) => void;
}>;

export function withNotificationPagesPrivateDeployJournal<T>(
  options: Readonly<{
    contract: Readonly<Record<string, unknown>>;
    repositoryRoot: string;
    reportedHome?: string;
    runId: string;
    runAttempt: number;
    clock?: () => Date;
    randomBytesImpl?: (size: number) => Buffer;
    processIdentity?: string;
    processIdentityProbe?: (pid: number) => Readonly<{
      state: 'present' | 'absent' | 'ambiguous';
      identity?: string;
    }>;
    operation: (
      journal: NotificationPagesPrivateDeployJournal,
    ) => T | Promise<T>;
  }>,
): Promise<T>;

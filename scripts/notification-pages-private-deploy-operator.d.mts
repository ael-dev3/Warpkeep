export const NOTIFICATION_PAGES_PRIVATE_DEPLOY_OPERATOR_PROFILE:
  'warpkeep-notification-pages-private-deploy-operator-v1';
export const NOTIFICATION_PAGES_PRIVATE_HANDOFF_STATE_CHILD:
  'notification-pages-private-handoffs-v1';
export const NOTIFICATION_PAGES_PRIVATE_HANDOFF_KEY_BASENAME:
  'notification-pages-private-handoff-key-v1.txt';
export const NOTIFICATION_PAGES_ACTIVE_EVIDENCE_MAXIMUM_AGE_MILLISECONDS: number;

export class NotificationPagesPrivateDeployOperatorError extends Error {
  readonly code: string;
  readonly deploymentMayHaveChanged: boolean;
  constructor(code: string, deploymentMayHaveChanged?: boolean);
}

export type NotificationPagesPrivateDeployContract = Readonly<{
  schemaVersion: 1;
  profile: typeof NOTIFICATION_PAGES_PRIVATE_DEPLOY_OPERATOR_PROFILE;
  repository: 'ael-dev3/Warpkeep';
  workflow: '.github/workflows/deploy-pages.yml';
  mode: 'closed-review' | 'gen0' | 'durable';
  candidatePagesSourceCommit: string;
  expectedFounderCount: number | null;
  preparedReceiptDigest: string | null;
  bridgeSourceCommit: string | null;
  activeV17EvidenceDigest: string | null;
  deployedModuleReceiptDigest: string | null;
  chainRootReceiptDigest: string | null;
  chainRootPagesSourceCommit: string | null;
  productionPlayerCanaryReceiptDigest: string | null;
  productionPlayerCanarySourceCommit: string | null;
  requiresProductionPlayerCanary: boolean;
}>;

export function classifyNotificationPagesPrivateDeployment(
  input: Readonly<{
    candidatePagesSourceCommit: string;
    phase: Readonly<{
      pagesPresentationEnabled: boolean;
      hermesExecutionApproved: boolean;
    }>;
    preparedBinding: Readonly<Record<string, unknown>>;
    privateBinding: Readonly<Record<string, unknown>>;
    liveRootBinding: Readonly<Record<string, unknown>>;
    productionPlayerCanaryBinding?: Readonly<Record<string, unknown>>;
  }>,
): NotificationPagesPrivateDeployContract;

export function loadNotificationPagesPrivateDeployContract(
  candidatePagesSourceCommit: string,
): NotificationPagesPrivateDeployContract;

export function executeNotificationPagesPrivateDeployPhase(
  input: Readonly<{
    command:
      | 'classify'
      | 'recover-skipped-invocation'
      | 'attest-deployment-source'
      | 'predeploy'
      | 'mark-deploy-invoked'
      | 'postflight';
    contract: NotificationPagesPrivateDeployContract;
    runId?: string;
    runAttempt?: number;
    sourceRunId?: string;
    sourceRunAttempt?: number;
    reportedHome?: string;
  }>,
  dependencies?: Readonly<Record<string, unknown>>,
): Promise<Readonly<Record<string, unknown>>>;

export function runNotificationPagesPrivateDeployOperatorCli(
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv,
  toolchainAuthority: Readonly<{
    runnerIdentityDigest: string;
    sourceClosureManifestSha256: string;
    readonly [field: string]: unknown;
  }>,
): Promise<void>;

export const notificationPagesPrivateDeployOperatorTestSeams: Readonly<{
  attestCurrentGitHubDeploymentAuthority: (
    request: Readonly<Record<string, unknown>>,
    options: Readonly<{
      tokenDescriptor: number;
      fetchImpl: typeof fetch;
    }>,
  ) => Promise<Readonly<Record<string, unknown>>>;
  adjudicateSkippedGitHubDeployment: (
    request: Readonly<Record<string, unknown>>,
    options: Readonly<{
      tokenDescriptor: number;
      fetchImpl: typeof fetch;
    }>,
  ) => Promise<Readonly<Record<string, unknown>>>;
  repairHandoffTemporaries: (directory: string) => void;
}>;

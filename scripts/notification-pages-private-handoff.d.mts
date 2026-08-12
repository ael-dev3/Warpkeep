export const NOTIFICATION_PAGES_PRIVATE_HANDOFF_KIND:
  'warpkeep-notification-pages-private-handoff-v1';
export const NOTIFICATION_PAGES_PRIVATE_HANDOFF_WORKFLOW:
  '.github/workflows/deploy-pages.yml';
export const NOTIFICATION_PAGES_PRIVATE_HANDOFF_REPOSITORY: 'ael-dev3/Warpkeep';

export class NotificationPagesPrivateHandoffError extends Error {
  readonly code: string;
  constructor(code: string);
}

export function readNotificationPagesPrivateHandoffKey(
  path: string,
  repositoryRoot: string,
): Buffer;

export function createNotificationPagesPrivateHandoff(options: Readonly<{
  key: Buffer;
  workflowRunId: string;
  workflowRunAttempt: string;
  pagesSourceCommit: string;
  expectedFounderCount: number;
  activeEvidenceMaximumAgeMilliseconds: number;
  bridgeSourceCommit: string;
  preparedReceiptBytes: Uint8Array;
  activeV17ReceiptBytes: Uint8Array;
  deployedModuleReceiptBytes: Uint8Array;
  createdAt?: Date;
  expiresAt?: Date;
  randomBytesImpl?: (size: number) => Buffer;
}>): Readonly<{
  bytes: Buffer;
  digest: string;
  keyId: string;
  header: Readonly<Record<string, unknown>>;
}>;

export function inspectNotificationPagesPrivateHandoff(options: Readonly<{
  handoffPath: string;
  keyPath: string;
  repositoryRoot: string;
  expectedHandoffDigest: string;
  expectedKeyId: string;
  expectedWorkflowRunId: string;
  expectedWorkflowRunAttempt: string;
  expectedPagesSourceCommit: string;
  expectedFounderCount: number;
  expectedActiveEvidenceMaximumAgeMilliseconds: number;
  expectedPreparedReceiptDigest: string;
  expectedActiveV17ReceiptDigest: string;
  expectedDeployedModuleReceiptDigest: string;
  expectedBridgeSourceCommit: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}>): Promise<Readonly<{
  handoffDigest: string;
  keyId: string;
  workflowRunId: string;
  workflowRunAttempt: string;
  pagesSourceCommit: string;
  expectedFounderCount: number;
  activeEvidenceMaximumAgeMilliseconds: number;
  createdAt: string;
  expiresAt: string;
  preparedReceiptDigest: string;
  activeV17ReceiptDigest: string;
  deployedModuleReceiptDigest: string;
  bridgeSourceCommit: string;
  preparedReceipt: Readonly<Record<string, unknown>>;
  liveAttestation: Readonly<Record<string, unknown>>;
  activeV17Receipt: Readonly<Record<string, unknown>>;
  deployedModuleReceipt: Readonly<Record<string, unknown>>;
  sourceRelease: Readonly<{
    atlasSourceCommit: string;
    atlasId: string;
    publicReleaseId: string;
    expectedReleaseSha256: string;
    moduleSourceCommit: string;
  }>;
}>>;

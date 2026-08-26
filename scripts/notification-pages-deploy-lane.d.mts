export const NOTIFICATION_PAGES_DEPLOY_LANE_PROFILE:
  'warpkeep-notification-pages-deploy-lane-v1';
export const GENESIS_001_FROZEN_PAGES_SOURCE_COMMIT:
  'f39d57c8622077e6543a16e5610d0e4ec73910da';

export class NotificationPagesDeployLaneError extends Error {
  readonly code: string;
}

export function classifyGenesis001PagesSource(
  candidatePagesSourceCommit: string,
): 'eligible' | 'frozen';

export function classifyNotificationPagesDeployLane(options: Readonly<{
  repositoryRoot?: string;
  candidatePagesSourceCommit: string;
}>): Readonly<{
  schemaVersion: 1;
  profile: typeof NOTIFICATION_PAGES_DEPLOY_LANE_PROFILE;
  repository: 'ael-dev3/Warpkeep';
  workflow: '.github/workflows/deploy-pages.yml';
  mode: 'closed-review' | 'gen0' | 'durable';
  candidatePagesSourceCommit: string;
  preparedReceiptDigest: string | null;
  bridgeSourceCommit: string | null;
  activeV17EvidenceDigest: string | null;
  deployedModuleReceiptDigest: string | null;
  expectedFounderCount: number | null;
  chainRootReceiptDigest: string | null;
  chainRootPagesSourceCommit: string | null;
  productionPlayerCanaryReceiptDigest: string | null;
  productionPlayerCanarySourceCommit: string | null;
}>;

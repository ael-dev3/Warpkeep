import type { AuthBridgeReleaseAttestation } from './auth-bridge-config-attestation.mjs';
import type {
  AuthBridgeNotificationPreparedReceipt,
} from './auth-bridge-notification-prepared-receipt.mjs';
import type {
  AuthBridgeNotificationPreparedReadOnlyRecoveryHead,
} from './auth-bridge-notification-prepared-deploy-journal.mjs';

export class AuthBridgeNotificationPreparedDeployEntrypointError extends Error {
  readonly code: string;
  constructor(code: string);
}
declare const recoveryTestCapability: unique symbol;
export type AuthBridgeNotificationPreparedRecoveryTestCapability =
  Readonly<{ readonly [recoveryTestCapability]: true }>;
export function createAuthBridgeNotificationPreparedRecoveryTestCapability():
  AuthBridgeNotificationPreparedRecoveryTestCapability;

export function attestAuthBridgeNotificationPreparedDeployCheckout(
  options: Readonly<{
    repositoryRoot: string;
    sourceCommit: string;
  }>,
): Promise<string>;

export function createAuthBridgeNotificationPreparedGithubWritePermit(
  options: Readonly<{
    githubToken: string;
    sourceCommit: string;
    runId: string;
    runAttempt: string | number;
    repositoryRoot: string;
    fetchImpl?: typeof fetch;
    isInterrupted?: () => boolean;
    attestCheckout?: (input: Readonly<{
      repositoryRoot: string;
      sourceCommit: string;
    }>) => string | Promise<string>;
  }>,
): (phase: 'upload' | 'release' | 'recovery') => Promise<true>;

export function runAuthBridgeNotificationPreparedDeploy(
  options?: Readonly<{
    environment?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    repositoryRoot?: string;
    nodeExecutable?: string;
    wranglerEntrypoint?: string;
    clock?: () => Date;
  }>,
): Promise<Readonly<{
  path: string;
  receiptDigest: string;
  result: 'installed' | 'unchanged';
}>>;

export function runAuthBridgeNotificationPreparedReadOnlyRecovery(
): Promise<Readonly<{ outcome: 'verified-read-only-recovery' }>>;

type AuthBridgeNotificationPreparedRecoveryPriorValue = Readonly<{
  schemaVersion?: 1;
  profile?: 'warpkeep-sealed-realms-auth-bridge-import-authority-v1';
  recordType?: 'deploymentAuthority';
  sourceCommit?: string;
  preparedReceiptDigest: string;
  completedJournalHeadDigest: string;
  completedJournalProfile?: string;
  completedJournalOutcome?: string;
  completedJournalPredecessorDigest?: string | null;
  runId?: string;
  runAttempt?: number;
  completedAt?: string;
  deploymentId: string;
  workerVersionId: string;
  bridgeSourceCommit?: string;
  ptrDatabaseIdentity: string;
  ptrBindingDigest: string;
  expiresAt?: string;
}>;
type AuthBridgeNotificationPreparedRecoveryPrior =
  | AuthBridgeNotificationPreparedRecoveryPriorValue
  | Readonly<{
      value: AuthBridgeNotificationPreparedRecoveryPriorValue;
      receipt?: AuthBridgeNotificationPreparedReceipt;
      phase?: 'g002' | 'ptr' | 'complete';
      pendingRecoveryHead?: AuthBridgeNotificationPreparedRecoveryJournal;
    }>;
type AuthBridgeNotificationPreparedRecoveryReceiptResolution = Readonly<{
  receipt: AuthBridgeNotificationPreparedReceipt;
  receiptDigest: string;
}>;
type AuthBridgeNotificationPreparedRecoveryInspection = Readonly<{
  deploymentId: string;
  workerVersionId: string;
  bridgeSourceCommit: string;
  ptrDatabaseIdentity: string;
  ptrBindingDigest: string;
  controlPlaneAttestationDigest: string;
  publicAttestationDigest: string;
  privateAttestationDigest: string;
  ptrBindingAttestationDigest: string;
  oldestObservedAt: string;
  liveAttestation: AuthBridgeReleaseAttestation;
}>;
type AuthBridgeNotificationPreparedPersistedRecoveryInspection = Readonly<{
  deploymentId: string;
  workerVersionId: string;
  bridgeSourceCommit: string;
  ptrDatabaseIdentity: string;
  ptrBindingDigest: string;
  controlPlaneAttestationDigest: string;
  publicAttestationDigest: string;
  privateAttestationDigest: string;
  ptrBindingAttestationDigest: string;
}>;
type AuthBridgeNotificationPreparedRecoveryReceiptWrite = Readonly<{
  receiptDigest: string;
  path?: string;
  result?: 'installed' | 'unchanged';
}>;
type AuthBridgeNotificationPreparedRecoveryHeadWrite = Readonly<{
  journalHeadDigest: string;
  path?: string;
  result?: 'installed' | 'unchanged';
}>;
type AuthBridgeNotificationPreparedRecoveryJournal =
  AuthBridgeNotificationPreparedReadOnlyRecoveryHead & Readonly<{
    journalHeadDigest: string;
    predecessorDigest: string;
  }>;
type AuthBridgeNotificationPreparedRecoveryReceiptPublication = Readonly<{
  receipt: AuthBridgeNotificationPreparedReceipt;
  receiptBytesBase64: string;
  receiptDigest: string;
}>;
type AuthBridgeNotificationPreparedRecoveryDeploymentAuthority = Readonly<{
  schemaVersion: 1;
  profile: 'warpkeep-sealed-realms-auth-bridge-import-authority-v1';
  recordType: 'deploymentAuthority';
  sourceCommit: string;
  previousRecordDigest: null;
  preparedReceiptBodyBase64: string;
  preparedReceiptDigest: string;
  preparedAt: string;
  expiresAt: string;
  completedJournalHeadDigest: string;
  completedJournalProfile: string;
  completedJournalOutcome: string;
  completedJournalPredecessorDigest: string | null;
  runId: string;
  runAttempt: number;
  completedAt: string;
  deploymentId: string;
  workerVersionId: string;
  bridgeSourceCommit: string;
  ptrDatabaseIdentity: string;
  ptrBindingDigest: string;
  controlPlaneAttestationDigest: string;
  publicAttestationDigest: string;
  privateAttestationDigest: string;
  ptrBindingAttestationDigest: string;
  recordedAt: string;
}>;
type AuthBridgeNotificationPreparedParsedRecoveryAuthority = Readonly<{
  value: AuthBridgeNotificationPreparedRecoveryDeploymentAuthority;
  receipt: AuthBridgeNotificationPreparedReceipt;
  phase: 'g002' | 'ptr' | 'complete';
  pendingRecoveryHead?: AuthBridgeNotificationPreparedRecoveryJournal;
}>;
type AuthBridgeNotificationPreparedRecoveryChainInput = Readonly<{
  privateState: AuthBridgeNotificationPreparedRecoveryPrivateState;
  sourceCommit: string;
  priorAuthority: AuthBridgeNotificationPreparedParsedRecoveryAuthority;
  receiptPublication: AuthBridgeNotificationPreparedRecoveryReceiptPublication;
  journal: AuthBridgeNotificationPreparedRecoveryJournal;
  inspection: AuthBridgeNotificationPreparedPersistedRecoveryInspection;
  recordedAt: Date;
}>;
type AuthBridgeNotificationPreparedRecoveryChainResult = Readonly<{
  relativePath?: string;
  chainDigest?: string;
  result: 'installed' | 'unchanged';
}>;
type AuthBridgeNotificationPreparedRecoveryPrivateStateReader = Readonly<{
  list: (input: Readonly<{
    root: 'runtime';
    relativeDirectory: string;
  }>) => readonly string[];
  read: (input: Readonly<{
    root: 'runtime';
    relativePath: string;
  }>) => Buffer;
}>;
type AuthBridgeNotificationPreparedRecoveryPrivateState =
  AuthBridgeNotificationPreparedRecoveryPrivateStateReader & Readonly<{
  write: (input: Readonly<{
    root: 'runtime';
    relativePath: string;
    bytes: Uint8Array;
  }>) => Readonly<{ byteLength: number }>;
}>;
type AuthBridgeNotificationPreparedRecoverySourceJournal = Readonly<{
  schemaVersion?: 1 | null;
  journalHeadDigest: string;
  profile: 'warpkeep-auth-bridge-notification-prepared-deploy-journal-v3'
    | 'warpkeep-auth-bridge-notification-prepared-read-only-recovery-v1';
  outcome?: 'verified' | 'verified-after-release-error'
    | 'verified-read-only-recovery';
  predecessorDigest?: string | null;
  runId?: string;
  runAttempt?: number;
  completedAt?: string;
  sourceCommit: string;
  workerVersionId: string;
  priorPreparedReceiptDigest?: string | null;
  preparedReceiptDigest?: string | null;
  deploymentId?: string | null;
  ptrDatabaseIdentity?: string | null;
  ptrBindingDigest?: string | null;
  bridgeSourceCommit?: string | null;
  controlPlaneAttestationDigest?: string | null;
  publicAttestationDigest?: string | null;
  privateAttestationDigest?: string | null;
  ptrBindingAttestationDigest?: string | null;
  noDeploy?: true | null;
}>;
type AuthBridgeNotificationPreparedRecoveryEnvironment = Readonly<{
  GITHUB_RUN_ATTEMPT: string;
  GITHUB_RUN_ID: string;
  GITHUB_SHA: string;
  GITHUB_TOKEN: string;
  WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID: string;
  WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN: string;
  WARPKEEP_AUTH_BRIDGE_ZONE_ID: string;
  WARPKEEP_PRODUCTION_ADMIN_TOKEN: string;
}>;
type AuthBridgeNotificationPreparedDeployEnvironment = Readonly<{
    GITHUB_ACTIONS: string;
    GITHUB_EVENT_NAME: string;
    GITHUB_REF: string;
    GITHUB_REPOSITORY: string;
    GITHUB_RUN_ATTEMPT: string;
    GITHUB_RUN_ID: string;
    GITHUB_SHA: string;
    GITHUB_WORKFLOW_REF: string;
    WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID: string;
    WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN: string;
    WARPKEEP_AUTH_BRIDGE_ZONE_ID: string;
    WARPKEEP_PRODUCTION_ADMIN_TOKEN: string;
    GITHUB_TOKEN: string;
    WARPKEEP_PLAYER_CANARY_OWNER_FID: string;
    WARPKEEP_PTR_SPACETIMEDB_DATABASE: string;
  }>;
type AuthBridgeNotificationPreparedProductionRecoveryRuntime = Readonly<{
  attestCheckout: (input: Readonly<{
    repositoryRoot: string;
    sourceCommit: string;
  }>) => string | Promise<string>;
  copyEnvironment: (
    environment: NodeJS.ProcessEnv,
  ) => AuthBridgeNotificationPreparedRecoveryEnvironment;
  clock: (clock: () => Date) => Date;
  home: () => string;
  createPrivateState: (input: Readonly<{
    reportedHome: string;
  }>) => AuthBridgeNotificationPreparedRecoveryPrivateState;
  createGithubWritePermit:
    typeof createAuthBridgeNotificationPreparedGithubWritePermit;
  resolveJournal: (input: Readonly<{
    repositoryRoot: string;
  }>) => AuthBridgeNotificationPreparedRecoverySourceJournal;
  resolvePrior: (input: Readonly<{
    privateState: AuthBridgeNotificationPreparedRecoveryPrivateState;
    sourceCommit: string;
    journal: AuthBridgeNotificationPreparedRecoverySourceJournal;
    now: Date;
  }>) => Readonly<{
    value: AuthBridgeNotificationPreparedRecoveryPriorValue;
    receipt: AuthBridgeNotificationPreparedReceipt;
    phase?: 'g002' | 'ptr' | 'complete';
    pendingRecoveryHead?: AuthBridgeNotificationPreparedRecoveryJournal;
  }>;
  inspect: (input: Readonly<{
    expected: Readonly<{
      workerVersionId: string;
      bridgeSourceCommit: string;
    }>;
    now: Date;
    accountId: string;
    zoneId: string;
    apiToken: string;
    adminToken: string;
    fetchImpl: typeof fetch;
  }>) => Promise<AuthBridgeNotificationPreparedRecoveryInspection>;
  resolveFreshReceipt: (input: Readonly<{
    repositoryRoot: string;
    receiptDigest: string;
    expectedSourceCommit: string;
    now: Date;
  }>) => AuthBridgeNotificationPreparedRecoveryReceiptResolution;
  verifyReceipt: (input: Readonly<{
    receipt: AuthBridgeNotificationPreparedReceipt;
    fetchImpl: typeof fetch;
    now: Date;
  }>) => Promise<Readonly<{
    receipt: AuthBridgeNotificationPreparedReceipt;
    liveAttestation: AuthBridgeReleaseAttestation;
  }>>;
  resolveExpiredReceipt: (input: Readonly<{
    repositoryRoot: string;
    receiptDigest: string;
    expectedSourceCommit: string;
    now: Date;
  }>) => AuthBridgeNotificationPreparedRecoveryReceiptResolution;
  resolvePendingReceipt: (input: Readonly<{
    repositoryRoot: string;
    expectedSourceCommit: string;
    excludedReceiptDigest: string;
    now: Date;
  }>) => AuthBridgeNotificationPreparedRecoveryReceiptResolution | null;
  writeReceipt: (input: Readonly<{
    receipt: AuthBridgeNotificationPreparedReceipt;
    repositoryRoot: string;
    now: Date;
  }>) => AuthBridgeNotificationPreparedRecoveryReceiptWrite;
  readReceipt: (input: Readonly<{
    receiptPath: string;
    repositoryRoot: string;
  }>) => AuthBridgeNotificationPreparedReceipt;
  writeHead: (input: Readonly<{
    head: AuthBridgeNotificationPreparedReadOnlyRecoveryHead;
    repositoryRoot: string;
  }>) => AuthBridgeNotificationPreparedRecoveryHeadWrite;
  createAuthorityChain: (
    input: AuthBridgeNotificationPreparedRecoveryChainInput,
  ) => AuthBridgeNotificationPreparedRecoveryChainResult;
}>;
type AuthBridgeNotificationPreparedRecoveryTestOptions = Readonly<{
  testOnlyCapability: AuthBridgeNotificationPreparedRecoveryTestCapability;
  sourceCommit: string;
  runId: string;
  runAttempt: number;
  clock: () => Date;
  resolvePriorAuthority: () =>
    | AuthBridgeNotificationPreparedRecoveryPrior
    | Promise<AuthBridgeNotificationPreparedRecoveryPrior>;
  resolvePriorReceipt: (input: Readonly<{
    receiptDigest: string;
    expectedSourceCommit: string;
  }>) =>
    | AuthBridgeNotificationPreparedRecoveryReceiptResolution
    | Promise<AuthBridgeNotificationPreparedRecoveryReceiptResolution>;
  resolvePendingReceipt: (input: Readonly<{
    priorPreparedReceiptDigest: string;
    now: Date;
  }>) =>
    | AuthBridgeNotificationPreparedRecoveryReceiptResolution
    | null
    | Promise<AuthBridgeNotificationPreparedRecoveryReceiptResolution | null>;
  inspectRecoveryAuthority: (input: Readonly<{
    expected: Readonly<{
      workerVersionId: string;
      bridgeSourceCommit: string;
    }>;
    now: Date;
  }>) =>
    | AuthBridgeNotificationPreparedRecoveryInspection
    | Promise<AuthBridgeNotificationPreparedRecoveryInspection>;
  assertCanStartWrite: (
    boundary: 'receipt' | 'head' | 'authority',
  ) => boolean | void | Promise<boolean | void>;
  writeReceipt: (input: Readonly<{
    receipt: AuthBridgeNotificationPreparedReceipt;
    now: Date;
  }>) =>
    | AuthBridgeNotificationPreparedRecoveryReceiptWrite
    | Promise<AuthBridgeNotificationPreparedRecoveryReceiptWrite>;
  readWrittenReceipt: (
    written: AuthBridgeNotificationPreparedRecoveryReceiptWrite,
  ) => AuthBridgeNotificationPreparedReceipt
    | Promise<AuthBridgeNotificationPreparedReceipt>;
  writeHead: (input: Readonly<{
    head: AuthBridgeNotificationPreparedReadOnlyRecoveryHead;
  }>) =>
    | AuthBridgeNotificationPreparedRecoveryHeadWrite
    | Promise<AuthBridgeNotificationPreparedRecoveryHeadWrite>;
  resolveWrittenHead: (
    written: AuthBridgeNotificationPreparedRecoveryHeadWrite,
  ) => AuthBridgeNotificationPreparedRecoveryJournal
    | Promise<AuthBridgeNotificationPreparedRecoveryJournal>;
  createRecoveryAuthorityChain: (
    input: Omit<AuthBridgeNotificationPreparedRecoveryChainInput,
      'privateState' | 'sourceCommit'>,
  ) => AuthBridgeNotificationPreparedRecoveryChainResult
    | Promise<AuthBridgeNotificationPreparedRecoveryChainResult>;
}>;
export function runAuthBridgeNotificationPreparedReadOnlyRecovery(
  options: AuthBridgeNotificationPreparedRecoveryTestOptions,
): Promise<Readonly<{ outcome: 'verified-read-only-recovery' }>>;

export const authBridgeNotificationPreparedDeployTestSeams: Readonly<{
  withProductionRecoveryRuntime: <Value>(input: Readonly<{
    testOnlyCapability: AuthBridgeNotificationPreparedRecoveryTestCapability;
    runtime: AuthBridgeNotificationPreparedProductionRecoveryRuntime;
    operation: () => Value | Promise<Value>;
  }>) => Promise<Value>;
  createRecoveryAuthorityChain: (
    input: AuthBridgeNotificationPreparedRecoveryChainInput & Readonly<{
      testOnlyCapability: AuthBridgeNotificationPreparedRecoveryTestCapability;
    }>,
  ) => AuthBridgeNotificationPreparedRecoveryChainResult;
  copyAndScrubEnvironment: (
    environment: NodeJS.ProcessEnv,
  ) => AuthBridgeNotificationPreparedDeployEnvironment;
  copyAndScrubRecoveryEnvironment: (
    environment: NodeJS.ProcessEnv,
  ) => AuthBridgeNotificationPreparedRecoveryEnvironment;
  settleGitInspections: <Value>(
    inspections: readonly Promise<Value>[],
  ) => Promise<readonly Value[]>;
  parseRecoveryAuthorityChain: (
    bytes: Uint8Array,
    sourceCommit: string,
  ) => AuthBridgeNotificationPreparedParsedRecoveryAuthority;
  resolveRecoveryPriorAuthority: (
    input: Readonly<{
      privateState: AuthBridgeNotificationPreparedRecoveryPrivateStateReader;
      sourceCommit: string;
      journal: AuthBridgeNotificationPreparedRecoverySourceJournal;
      now: Date;
    }>,
  ) => AuthBridgeNotificationPreparedParsedRecoveryAuthority;
}>;

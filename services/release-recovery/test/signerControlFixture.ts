import type { RecoveryArmingTuple } from '../src/config.js'
import { RECOVERY_KEY_ID, RECOVERY_KEY_THUMBPRINT } from '../src/recoveryPublicKey.js'
const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000'
const PREPARATION_COMMIT = 'c'.repeat(40)
const PREPARATION_TREE = 'd'.repeat(40)
const G001 = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e'
const G002 = '1'.repeat(64)
const PTR = '2'.repeat(64)
export function arming(overrides: Readonly<Record<string, unknown>> = {}): RecoveryArmingTuple {
  return {
    requestId: REQUEST_ID,
    authorizationMode: 'recovery-authorization-v1',
    recoveryAuthorizationProfile: 'warpkeep-0.4.0-recovery-authorization-v1',
    recoveryKeyId: RECOVERY_KEY_ID,
    recoveryKeyThumbprint: RECOVERY_KEY_THUMBPRINT,
    authorizationEpoch: 3,
    repository: 'ael-dev3/Warpkeep',
    repositoryId: '1273513252',
    repositoryOwnerId: '183124839',
    ref: 'refs/heads/main',
    workflowRef: 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main',
    environment: 'github-pages',
    releaseVersion: '0.4.0',
    operation: 'github-pages-production-deploy',
    canonicalOrigin: 'https://warpkeep.com',
    issuer: 'https://release-auth.warpkeep.com',
    authWorker: 'warpkeep-auth-bridge',
    bridgeWorkerVersion: 'warpkeep-auth-bridge-release-recovery-v1',
    bridgeWorkerVersionId: '123e4567-e89b-42d3-a456-426614174002',
    bridgeSourceCommit: '1'.repeat(40),
    bridgeConfigIdentity: '2'.repeat(64),
    bridgeConfigEpoch: 4,
    preparationCommit: PREPARATION_COMMIT,
    preparationTree: PREPARATION_TREE,
    sourceClosureProfile: 'warpkeep-0.4.0-recovery-source-closure-v1',
    sourceClosureSha256: 'a'.repeat(64),
    recoveryAuthorizationCoreSha256: 'b'.repeat(64),
    pagesDeploymentApproved: true,
    genesis001Database: G001,
    genesis002Database: G002,
    ptrDatabase: PTR,
    g001ExpectedProgramKeccak256: '3'.repeat(64),
    g002ExpectedProgramKeccak256: '4'.repeat(64),
    ptrExpectedProgramKeccak256: '5'.repeat(64),
    g002AtlasId: 'GENESIS_002_GREATER_REALM',
    g002PublicReleaseId: `GRR-${'A'.repeat(26)}`,
    g002PublicApprovalReceiptId: `GRA-${'B'.repeat(26)}`,
    g002AtlasSourceCommit: '6'.repeat(40),
    g002ReleaseSha256: 'a1'.repeat(32),
    g002ReleaseHeaderSha256: 'a2'.repeat(32),
    g002VerificationDigest: 'a3'.repeat(32),
    ptrAtlasId: 'PTR_GREATER_REALM',
    ptrPublicReleaseId: `GRR-${'C'.repeat(26)}`,
    ptrPublicApprovalReceiptId: `GRA-${'D'.repeat(26)}`,
    ptrAtlasSourceCommit: '7'.repeat(40),
    ptrExpectedReleaseSha256: 'b1'.repeat(32),
    ptrReleaseHeaderSha256: 'b2'.repeat(32),
    ptrVerificationDigest: 'b3'.repeat(32),
    bindingPath: 'config/releases/0.4.0-sealed-launch.json',
    workflowPath: '.github/workflows/deploy-pages.yml',
    ...overrides,
  } as RecoveryArmingTuple
}

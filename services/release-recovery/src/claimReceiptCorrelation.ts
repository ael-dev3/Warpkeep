import {
  verifyRecoveryClaimJwsEnvelopeInternal,
  type RecoveryClaimPayload,
} from './crypto.js'
import {
  githubEvidenceMetadataSha256,
  snapshotGitHubEvidenceMetadata,
} from './githubEvidenceMetadata.js'
import type { LedgerSignerClaimProjection } from './ledgerV2.js'
import { RecoveryProtocolError, type JsonValue } from './protocol.js'

export type PostDeployClaimReceiptCorrelationInput = Readonly<{
  compact: string
  projection: LedgerSignerClaimProjection
  nowSeconds: number
}>

export type PostDeployClaimReceiptCorrelation = Readonly<{
  rowBindingDigest: string
}>

function fail(code: string): never {
  throw new RecoveryProtocolError(code)
}

function payloadField(
  payload: RecoveryClaimPayload,
  key: keyof RecoveryClaimPayload,
): JsonValue {
  return payload[key]
}

export async function verifyPostDeployClaimReceiptCorrelation(
  input: PostDeployClaimReceiptCorrelationInput,
): Promise<PostDeployClaimReceiptCorrelation> {
  const { compact, projection, nowSeconds } = input
  if (!Number.isSafeInteger(nowSeconds)) fail('RECOVERY_CLAIM_RECEIPT_TIME_INVALID')

  const receipt = await verifyRecoveryClaimJwsEnvelopeInternal(compact)
  const { authorization, claim } = projection
  const { locators, workflowIdentity } = authorization
  let metadata
  try {
    metadata = snapshotGitHubEvidenceMetadata(authorization.githubMetadata)
    if (await githubEvidenceMetadataSha256(metadata) !== authorization.githubMetadataSha256) {
      fail('RECOVERY_CLAIM_RECEIPT_MISMATCH')
    }
  } catch (error) {
    if (
      error instanceof RecoveryProtocolError
      && error.code === 'RECOVERY_CLAIM_RECEIPT_MISMATCH'
    ) throw error
    fail('RECOVERY_CLAIM_RECEIPT_MISMATCH')
  }

  const receiptIssuedAt = payloadField(receipt, 'iat') as number
  if (nowSeconds < receiptIssuedAt || nowSeconds >= claim.claimDeadline) {
    fail('RECOVERY_CLAIM_RECEIPT_TIME_INVALID')
  }

  const expectedPairs: ReadonlyArray<readonly [JsonValue, unknown]> = [
    [payloadField(receipt, 'requestId'), projection.requestId],
    [payloadField(receipt, 'requestId'), locators.requestId],
    [payloadField(receipt, 'authorizationJti'), authorization.authorizationJti],
    [payloadField(receipt, 'authorizationJwsSha256'), projection.authorizationJwsSha256],
    [payloadField(receipt, 'pagesRunId'), workflowIdentity.pagesRunId],
    [payloadField(receipt, 'pagesRunId'), metadata.pagesRunId],
    [payloadField(receipt, 'pagesRunAttempt'), workflowIdentity.pagesRunAttempt],
    [payloadField(receipt, 'pagesRunAttempt'), metadata.pagesRunAttempt],
    [payloadField(receipt, 'sourceVerifyRunId'), locators.sourceVerifyRunId],
    [payloadField(receipt, 'sourceVerifyRunAttempt'), locators.sourceVerifyRunAttempt],
    [payloadField(receipt, 'candidateCommit'), locators.candidateCommit],
    [payloadField(receipt, 'candidateCommit'), workflowIdentity.workflowSha],
    [payloadField(receipt, 'candidateCommit'), metadata.candidateCommit],
    [payloadField(receipt, 'candidateTree'), authorization.candidateTree],
    [payloadField(receipt, 'candidateTree'), metadata.candidateTree],
    [payloadField(receipt, 'artifactId'), locators.artifactId],
    [payloadField(receipt, 'artifactId'), metadata.artifactId],
    [payloadField(receipt, 'artifactName'), authorization.artifactName],
    [payloadField(receipt, 'artifactName'), metadata.artifactName],
    [payloadField(receipt, 'githubArtifactArchiveSha256'), authorization.githubArtifactArchiveSha256],
    [payloadField(receipt, 'githubArtifactArchiveSha256'), metadata.githubArtifactArchiveSha256],
    [`sha256:${String(payloadField(receipt, 'githubArtifactArchiveSha256'))}`, metadata.artifactDigest],
    [payloadField(receipt, 'innerArtifactTarSha256'), authorization.innerArtifactTarSha256],
    [payloadField(receipt, 'contentManifestSha256'), authorization.contentManifestSha256],
    [payloadField(receipt, 'deploymentAttestationSha256'), authorization.deploymentAttestationSha256],
    [payloadField(receipt, 'operation'), authorization.operation],
    [payloadField(receipt, 'canonicalOrigin'), authorization.canonicalOrigin],
    [payloadField(receipt, 'authorizationEpoch'), authorization.authorizationEpoch],
    [payloadField(receipt, 'claimSequence'), claim.claimSequence],
    [payloadField(receipt, 'claimedAt'), claim.claimedAt],
    [payloadField(receipt, 'claimDeadline'), claim.claimDeadline],
    [payloadField(receipt, 'iat'), claim.claimedAt],
    [payloadField(receipt, 'nbf'), claim.claimedAt],
  ]

  if (expectedPairs.some(([actual, expected]) => actual !== expected)) {
    fail('RECOVERY_CLAIM_RECEIPT_MISMATCH')
  }

  return Object.freeze({ rowBindingDigest: projection.rowBindingDigest })
}

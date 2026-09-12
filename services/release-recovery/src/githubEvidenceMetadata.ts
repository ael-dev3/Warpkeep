import { GITHUB_REPOSITORY, commit, githubFail, positive, sha, snapshotExactDataObject } from './config.js'
import { serializeExactObject, sha256Hex } from './protocol.js'

export const GITHUB_EVIDENCE_METADATA_KEYS = [
  'repository', 'repositoryId', 'repositoryOwnerId', 'candidateCommit',
  'candidateTree', 'parentCommit', 'preparationTree', 'artifactId', 'artifactName',
  'pagesRunId', 'pagesRunAttempt', 'artifactSize', 'artifactDigest',
  'artifactUrl', 'artifactArchiveUrl', 'artifactNodeId', 'artifactCreatedAt',
  'artifactExpiresAt', 'artifactEtag', 'githubArtifactArchiveSha256',
] as const

export type GitHubEvidenceMetadata = Readonly<{
  repository: string
  repositoryId: string
  repositoryOwnerId: string
  candidateCommit: string
  candidateTree: string
  parentCommit: string
  preparationTree: string
  artifactId: string
  artifactName: string
  pagesRunId: string
  pagesRunAttempt: string
  artifactSize: number
  artifactDigest: string
  artifactUrl: string
  artifactArchiveUrl: string
  artifactNodeId: string
  artifactCreatedAt: string
  artifactExpiresAt: string
  artifactEtag: string
  githubArtifactArchiveSha256: string
}>

export function snapshotGitHubEvidenceMetadata(value: unknown): GitHubEvidenceMetadata {
  const metadata = snapshotExactDataObject(
    value, GITHUB_EVIDENCE_METADATA_KEYS, 'RECOVERY_GITHUB_EVIDENCE_INVALID',
  )
  if (
    metadata.repository !== GITHUB_REPOSITORY
    || metadata.repositoryId !== '1273513252'
    || metadata.repositoryOwnerId !== '183124839'
    || !commit(metadata.candidateCommit)
    || !commit(metadata.candidateTree)
    || !commit(metadata.parentCommit)
    || !commit(metadata.preparationTree)
    || !positive(metadata.artifactId)
    || typeof metadata.artifactName !== 'string'
    || !positive(metadata.pagesRunId)
    || !positive(metadata.pagesRunAttempt)
    || typeof metadata.artifactSize !== 'number'
    || !Number.isSafeInteger(metadata.artifactSize)
    || metadata.artifactSize < 1
    || typeof metadata.artifactDigest !== 'string'
    || typeof metadata.artifactUrl !== 'string'
    || typeof metadata.artifactArchiveUrl !== 'string'
    || typeof metadata.artifactNodeId !== 'string'
    || typeof metadata.artifactCreatedAt !== 'string'
    || typeof metadata.artifactExpiresAt !== 'string'
    || typeof metadata.artifactEtag !== 'string'
    || !sha(metadata.githubArtifactArchiveSha256)
  ) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  return Object.freeze({ ...metadata }) as GitHubEvidenceMetadata
}

export async function githubEvidenceMetadataSha256(metadata: GitHubEvidenceMetadata): Promise<string> {
  return sha256Hex(
    'warpkeep.0.4.0.recovery-github-evidence-metadata.v1\n',
    serializeExactObject(GITHUB_EVIDENCE_METADATA_KEYS, metadata),
  )
}

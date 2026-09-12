import { describe, expect, test } from 'vitest'
import {
  GITHUB_EVIDENCE_METADATA_KEYS,
  githubEvidenceMetadataSha256,
  snapshotGitHubEvidenceMetadata,
  type GitHubEvidenceMetadata,
} from '../src/githubEvidenceMetadata.js'

const validMetadata: GitHubEvidenceMetadata = {
  repository: 'ael-dev3/Warpkeep',
  repositoryId: '1273513252',
  repositoryOwnerId: '183124839',
  candidateCommit: 'a'.repeat(40),
  candidateTree: 'b'.repeat(40),
  parentCommit: 'c'.repeat(40),
  preparationTree: 'd'.repeat(40),
  artifactId: '123',
  artifactName: 'github-pages-recovery-123-1',
  pagesRunId: '123',
  pagesRunAttempt: '1',
  artifactSize: 1,
  artifactDigest: 'sha256:' + 'e'.repeat(64),
  artifactUrl: 'https://api.github.com/artifact',
  artifactArchiveUrl: 'https://api.github.com/archive',
  artifactNodeId: 'node',
  artifactCreatedAt: '2026-01-01T00:00:00.000Z',
  artifactExpiresAt: '2026-01-02T00:00:00.000Z',
  artifactEtag: 'etag',
  githubArtifactArchiveSha256: 'f'.repeat(64),
}

describe('GitHub evidence metadata commitment', () => {
  test('snapshots valid metadata with the exact shape', () => {
    expect(snapshotGitHubEvidenceMetadata(validMetadata)).toEqual(validMetadata)
  })

  test('commits the exact ordered metadata wire format', async () => {
    expect(GITHUB_EVIDENCE_METADATA_KEYS).toEqual([
      'repository', 'repositoryId', 'repositoryOwnerId', 'candidateCommit',
      'candidateTree', 'parentCommit', 'preparationTree', 'artifactId', 'artifactName',
      'pagesRunId', 'pagesRunAttempt', 'artifactSize', 'artifactDigest',
      'artifactUrl', 'artifactArchiveUrl', 'artifactNodeId', 'artifactCreatedAt',
      'artifactExpiresAt', 'artifactEtag', 'githubArtifactArchiveSha256',
    ])
    await expect(githubEvidenceMetadataSha256(validMetadata))
      .resolves.toBe('51411025c5494a9c86acb64a31dc794242542ac83eeb1b58f7f798957652e3bf')
  })

  test('changes the commitment when metadata is mutated', async () => {
    const digest = await githubEvidenceMetadataSha256(validMetadata)
    const mutatedMetadata = { ...validMetadata, artifactSize: 2 }
    await expect(githubEvidenceMetadataSha256(snapshotGitHubEvidenceMetadata(mutatedMetadata)))
      .resolves.not.toBe(digest)
  })

  test('rejects metadata with an extra key', () => {
    expect(() => snapshotGitHubEvidenceMetadata({ ...validMetadata, extra: true }))
      .toThrow('RECOVERY_GITHUB_EVIDENCE_INVALID')
  })
})

export const PTR_OBSERVATION_REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000'
export const PTR_OBSERVATION_COMMIT = 'c'.repeat(40)
export const PTR_OBSERVATION_EPOCH = 3

export function ptrObservationBridgeFixture(observedAt: number) {
  const hash = 'a'.repeat(64)
  const atlas = { admissionsOpen: false, accessRequestsOpen: false, sealed: true, atlasReady: true,
    generalAdmissionCount: 0, populationGuardPassed: true, publicReleaseId: `GRR-${'A'.repeat(26)}`,
    publicApprovalReceiptId: `GRA-${'B'.repeat(26)}`, atlasSourceCommit: 'e'.repeat(40),
    expectedReleaseSha256: hash, releaseHeaderSha256: hash, verificationDigest: hash, sealedStateHmacSha256: hash }
  return { schemaVersion: 1, profile: 'warpkeep-release-recovery-realm-observation-v1',
    requestId: PTR_OBSERVATION_REQUEST_ID, candidateCommit: PTR_OBSERVATION_COMMIT,
    recoveryAuthorizationEpoch: PTR_OBSERVATION_EPOCH, observedFrom: observedAt, observedThrough: observedAt,
    bridgeService: 'warpkeep-auth-bridge', bridgeWorkerVersion: 'warpkeep-auth-bridge-release-recovery-v1',
    bridgeWorkerVersionId: '01234567-89ab-4cde-8f01-23456789abcd', bridgeSourceCommit: 'f'.repeat(40),
    bridgeConfigIdentity: hash, bridgeConfigEpoch: 7, publicAdmissionRequestsOpen: false,
    g001: { databaseIdentity: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
      programKeccak256: hash, realmId: 'GENESIS_001', releaseVersion: '0.3.43', playerAccessEnabled: true,
      admissionStateMutationsEnabled: false, accessRequestSubmissionsEnabled: false,
      sourceBaselineCommit: '2ae51984e1fa6ce5b0028c1a250359fed79d819b',
      freezeReleaseNonce: '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00',
      admittedPlayerCount: 1, enabledPlayerCount: 1, censusStable: true,
      admittedPlayerCensusHmacSha256: hash, alphaInvariantHmacSha256: hash },
    g002: { ...atlas, databaseIdentity: 'c2003223f6e3c86e988775ddd458c3a45635d0d021e11131551471617c392194',
      programKeccak256: hash, realmId: 'GENESIS_002', databaseName: 'warpkeep-genesis-002',
      moduleIdentity: 'warpkeep-genesis-002-sealed-v1', releaseVersion: '0.4.0', launchState: 'sealed',
      playerCount: 0, atlasId: 'GENESIS_002_GREATER_REALM' },
    ptr: { ...atlas, databaseIdentity: 'c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e',
      programKeccak256: hash, realmId: 'PTR', releaseVersion: '0.4.0-ptr.1', moduleIdentity: 'warpkeep-ptr-owner-view-v1',
      launchState: 'owner-only', singletonOwnerCount: 1, ownerEnabled: true, atlasId: 'PTR_GREATER_REALM',
      ownerInvariantHmacSha256: hash },
    upstreamResponseDigests: Object.fromEntries(['programIdentityBeforeTranscriptHmacSha256',
      'g001PolicyResponseHmacSha256', 'g001AlphaBeforeResponseHmacSha256', 'g001PlayerEnumerationBeforeResponseHmacSha256',
      'g001AdmissionStatusesResponseHmacSha256', 'g001PlayerEnumerationAfterResponseHmacSha256',
      'g001AlphaAfterResponseHmacSha256', 'g002StatusResponseHmacSha256', 'ptrAdminStatusResponseHmacSha256',
      'ptrOwnerStatusResponseHmacSha256', 'programIdentityAfterTranscriptHmacSha256'].map(key => [key, hash])) }
}

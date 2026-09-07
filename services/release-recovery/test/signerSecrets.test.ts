import { afterEach, expect, it, vi } from 'vitest'
import { base64UrlEncode } from '../src/protocol.js'

afterEach(() => {
  for (const module of ['recoveryPublicKey', 'githubOidc', 'githubEvidence', 'realmEvidence']) vi.doUnmock(`../src/${module}.js`)
  vi.resetModules()
})

async function fixture() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const exported = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const publicJwk = { kty: 'EC', crv: 'P-256', x: exported.x!, y: exported.y! }
  const privateJwk = { ...publicJwk, d: exported.d! }
  const thumbprint = base64UrlEncode(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(JSON.stringify({ crv: 'P-256', kty: 'EC', x: exported.x, y: exported.y })))))
  vi.resetModules()
  vi.doMock('../src/recoveryPublicKey.js', () => ({ RECOVERY_KEY_ID: 'test-only', RECOVERY_PUBLIC_JWK: publicJwk, RECOVERY_KEY_THUMBPRINT: thumbprint }))
  const { validateSignerSecrets } = await import('../src/signerSecrets.js')
  return { validateSignerSecrets, privateJwk, input: {
    RECOVERY_SIGNING_PRIVATE_JWK: JSON.stringify(privateJwk),
    RELEASE_RECOVERY_RPC_SECRET: base64UrlEncode(crypto.getRandomValues(new Uint8Array(32))),
  } }
}

it('composes signed status with real control transitions and rejects invalid secrets before ledger access', async () => {
  const { input } = await fixture()
  const { RecoverySigner } = await import('../src/signer.js')
  const { verifyRecoveryStatusJws } = await import('../src/crypto.js')
  const { createLedgerV2Control, reconcileLedgerV2Control } = await import('../src/ledgerV2.js')
  const { arming } = await import('./signerControlFixture.js')
  let state = createLedgerV2Control({ authorizationEpoch: 3 })
  const ledger = { reconcileControl: vi.fn(async (value: Parameters<typeof reconcileLedgerV2Control>[1]) => {
    state = reconcileLedgerV2Control(state, value)
    return state
  }) }
  const control = { RECOVERY_ENABLED: 'true', RECOVERY_AUTHORIZATION_EPOCH: '3', RECOVERY_ARMING_MANIFEST: JSON.stringify(arming()) }
  const signer = new RecoverySigner(control, input, ledger, () => 1000)
  const response = await signer.status()
  expect(Object.keys(response)).toEqual(['statusJws'])
  expect(await verifyRecoveryStatusJws(response.statusJws, 1000)).toMatchObject({ enabled: true, authorizationEpoch: 3, iat: 1000, exp: 1060 })
  await expect(verifyRecoveryStatusJws(response.statusJws, 1060)).rejects.toThrow('RECOVERY_JWS_TIME_INVALID')
  const disabled = new RecoverySigner({ ...control, RECOVERY_ENABLED: 'false' }, input, ledger, () => 1001)
  expect(await verifyRecoveryStatusJws((await disabled.status()).statusJws, 1001)).toMatchObject({ enabled: false })
  await expect(signer.status()).rejects.toThrow('RECOVERY_LEDGER_ARMING_ALREADY_USED')
  ledger.reconcileControl.mockClear()
  await expect(new RecoverySigner(control, {}, ledger, () => 1000).status()).rejects.toThrow('RECOVERY_SIGNER_SECRETS_INVALID')
  await expect(new RecoverySigner(control, input, ledger, () => NaN).status()).rejects.toThrow('RECOVERY_SIGNER_TIME_INVALID')
  await expect((signer.status as (...args: unknown[]) => Promise<unknown>)({ enabled: true })).rejects.toThrow('RECOVERY_SIGNER_REQUEST_INVALID')
  expect(ledger.reconcileControl).not.toHaveBeenCalled()
})

it('validates the actual key self-check against test-only ephemeral pins and snapshots output', async () => {
  const { validateSignerSecrets, input, privateJwk } = await fixture()
  const result = await validateSignerSecrets(input)
  expect(result.privateJwk).toEqual(privateJwk)
  expect(result.rpcCredential).toBe(input.RELEASE_RECOVERY_RPC_SECRET)
  expect(Object.isFrozen(result)).toBe(true)
  expect(Object.isFrozen(result.privateJwk)).toBe(true)
})

it('issues through real ledger and crypto, retries retained bytes with fresh identity verification, and rejects changed locators', async () => {
  const { input } = await fixture()
  const { arming } = await import('./signerControlFixture.js')
  const { createLedgerV2Control, reconcileLedgerV2Control, installLedgerV2Arming, applyLedgerV2Event } = await import('../src/ledgerV2.js')
  const { githubEvidenceMetadataSha256 } = await import('../src/githubEvidenceMetadata.js')
  const armed = arming()
  let time = 1000
  let controlState = createLedgerV2Control({ authorizationEpoch: 3 })
  let row: import('../src/ledgerV2.js').RecoveryLedgerRecordV2 | undefined
  const identity = { repository: armed.repository, repositoryId: armed.repositoryId, repositoryOwnerId: armed.repositoryOwnerId,
    ref: armed.ref, workflowRef: armed.workflowRef, environment: armed.environment, eventName: 'workflow_run' as const,
    workflowSha: 'a'.repeat(40), pagesRunId: '123', pagesRunAttempt: '1', checkRunId: '999', oidcJti: crypto.randomUUID() }
  const metadata = { repository: armed.repository, repositoryId: armed.repositoryId, repositoryOwnerId: armed.repositoryOwnerId,
    candidateCommit: identity.workflowSha, candidateTree: 'b'.repeat(40), parentCommit: armed.preparationCommit,
    preparationTree: armed.preparationTree, artifactId: '123', artifactName: 'github-pages-recovery-123-1', pagesRunId: '123', pagesRunAttempt: '1',
    artifactSize: 1, artifactDigest: 'sha256:' + 'f'.repeat(64), artifactUrl: 'https://api.github.com/artifact', artifactArchiveUrl: 'https://api.github.com/archive',
    artifactNodeId: 'node', artifactCreatedAt: '2026-01-01T00:00:00.000Z', artifactExpiresAt: '2026-01-02T00:00:00.000Z', artifactEtag: 'etag', githubArtifactArchiveSha256: 'f'.repeat(64) }
  const github = { currentMainCommit: armed.preparationCommit, parentCommit: armed.preparationCommit, candidateTree: metadata.candidateTree,
    recoveryBindingBytes: new Uint8Array([1, 2]), protectedWorkflowBytes: new Uint8Array([3, 4]), realmBinding: armed,
    sourceClosureSha256: armed.sourceClosureSha256, sourceVerifyRunId: '456', sourceVerifyRunAttempt: '2',
    pagesArtifactId: '123', pagesArtifactName: metadata.artifactName, githubArtifactArchiveSha256: metadata.githubArtifactArchiveSha256,
    innerArtifactTarSha256: 'd'.repeat(64), contentManifestSha256: 'e'.repeat(64), deploymentAttestationSha256: 'f'.repeat(64),
    githubMetadata: metadata, githubMetadataSha256: await githubEvidenceMetadataSha256(metadata) }
  const verifyIdentity = vi.fn(async () => ({ ...identity, oidcJti: crypto.randomUUID() }))
  const loadEvidence = vi.fn(async () => github)
  const recheck = vi.fn(async () => {})
  const observe = vi.fn(async () => ({ phase: 'issue', observationSequence: 1, recoveryAuthorizationCoreSha256: armed.recoveryAuthorizationCoreSha256,
    genesis001Database: armed.genesis001Database, genesis002Database: armed.genesis002Database, ptrDatabase: armed.ptrDatabase,
    g001ReleaseVersion: '0.3.43', g001PlayerAccessEnabled: true, g001AdmissionStateMutationsEnabled: false, g001AccessRequestSubmissionsEnabled: false,
    g001BaselineAbiSha256: '3'.repeat(64), g002Sealed: true, g002PlayerCount: 0, g002GeneralAdmissionCount: 0,
    ptrSingletonOwnerCount: 1, ptrGeneralAdmissionCount: 0, observedFrom: 990, observedThrough: 999,
    evidenceSnapshotDigest: '8'.repeat(64), liveInvariantDigest: '9'.repeat(64) }))
  vi.doMock('../src/githubOidc.js', () => ({ verifyGitHubWorkflowIdentity: verifyIdentity }))
  vi.doMock('../src/githubEvidence.js', () => ({ loadGitHubCandidateEvidence: loadEvidence, recheckGitHubEvidenceMetadata: recheck }))
  vi.doMock('../src/realmEvidence.js', () => ({ observeRecoveryRealmEvidence: observe }))
  const { RecoverySigner } = await import('../src/signer.js')
  const { verifyRecoveryAuthorizationJws, verifyRecoveryClaimJws } = await import('../src/crypto.js')
  type Ledger = import('../src/signerIssue.js').SignerIssueRuntime['requestLedger'] extends (...args: never[]) => infer R ? R : never
  const issued = () => {
    if (row?.state !== 'issued') throw new Error('test expected issued')
    return { authorization: row.authorization, authorizationJws: row.authorizationJws, authorizationJwsSha256: row.authorizationJwsSha256, revision: row.revision }
  }
  const ledger: Ledger = {
    async status() { return { role: 'request', requestId: armed.requestId, state: row?.state ?? null, revision: row?.revision ?? null, alarmDeadline: null } },
    async installArming(value) { row = installLedgerV2Arming(row, value); return row },
    async reserveIssue(value) {
      row = await applyLedgerV2Event(row!, { type: 'reserve-issue', ...value })
      if (row.state !== 'issuing') throw new Error('test expected issuing')
      return { authorization: row.authorization, reservedPayload: row.reservedPayload, issuingDeadline: row.issuingDeadline, revision: row.revision }
    },
    async finalizeIssue(value) { row = await applyLedgerV2Event(row!, { type: 'finalize-issue', ...value }); return issued() },
    async readIssued(value) { row = await applyLedgerV2Event(row!, { type: 'read-issued', ...value }); return issued() },
    async claim(value) {
      row = await applyLedgerV2Event(row!, { type: 'claim', ...value })
      if (row.state !== 'claimed') throw new Error('test expected claimed')
      return { authorization: row.authorization, authorizationJwsSha256: row.authorizationJwsSha256, claim: row.claim, revision: row.revision }
    },
  }
  const requestLedger = vi.fn(() => ledger)
  // Observation transport is mocked above; this sentinel must never be used as a real service.
  const observation = {} as import('../src/signerIssue.js').SignerIssueRuntime['observation']
  const signer = new RecoverySigner({ RECOVERY_ENABLED: 'true', RECOVERY_AUTHORIZATION_EPOCH: '3', RECOVERY_ARMING_MANIFEST: JSON.stringify(armed) }, input,
    { async reconcileControl(value) { time += 1; controlState = reconcileLedgerV2Control(controlState, value); return controlState } },
    () => time, { githubApp: { GITHUB_APP_ID: '1', GITHUB_APP_INSTALLATION_ID: '2', GITHUB_APP_PRIVATE_KEY_PEM: 'test-only-unused' },
      fetch: vi.fn(() => { throw new Error('unexpected network') }), observation, requestLedger })
  const request = { requestId: armed.requestId, candidateCommit: identity.workflowSha, sourceVerifyRunId: '456', sourceVerifyRunAttempt: '2', artifactId: '123', oidcToken: 'test-token-one' }
  const first = await signer.issue(request)
  expect(await verifyRecoveryAuthorizationJws(first.authorizationJws, time)).toMatchObject({ iat: 1002, nbf: 1002, exp: 1902, observedFrom: 990 })
  expect(github.recoveryBindingBytes.every(byte => byte === 0)).toBe(true)
  expect(github.protectedWorkflowBytes.every(byte => byte === 0)).toBe(true)
  expect(await signer.issue({ ...request, oidcToken: 'test-token-two' })).toEqual(first)
  expect(verifyIdentity).toHaveBeenCalledTimes(2)
  expect(loadEvidence).toHaveBeenCalledTimes(1)
  expect(observe).toHaveBeenCalledTimes(1)
  expect(requestLedger).toHaveBeenCalledWith(armed.requestId)
  await expect(signer.issue({ ...request, artifactId: '124' })).rejects.toThrow()
  verifyIdentity.mockResolvedValueOnce({ ...identity, pagesRunAttempt: '2' })
  await expect(signer.issue(request)).rejects.toThrow()
  verifyIdentity.mockRejectedValueOnce(new Error('RECOVERY_GITHUB_OIDC_INVALID'))
  await expect(signer.issue(request)).rejects.toThrow('RECOVERY_GITHUB_OIDC_INVALID')
  expect(loadEvidence).toHaveBeenCalledTimes(1)

  // A crash before finalization retains the reservation, not newly minted terms.
  row = undefined
  time = 1000
  controlState = createLedgerV2Control({ authorizationEpoch: 3 })
  const finalize = vi.spyOn(ledger, 'finalizeIssue').mockRejectedValueOnce(new Error('test interrupted before durable finalize'))
  await expect(signer.issue(request)).rejects.toThrow('test interrupted')
  const reservedRow = row as unknown as import('../src/ledgerV2.js').LedgerV2IssuingState
  expect(reservedRow.state).toBe('issuing')
  const observationsBeforeRetry = observe.mock.calls.length
  const resumed = await signer.issue({ ...request, oidcToken: 'test-token-after-interruption' })
  expect(await verifyRecoveryAuthorizationJws(resumed.authorizationJws, time)).toMatchObject({
    jti: reservedRow.reservedPayload.jti, iat: reservedRow.reservedPayload.iat, exp: reservedRow.reservedPayload.exp,
  })
  expect(observe).toHaveBeenCalledTimes(observationsBeforeRetry)
  finalize.mockRestore()

  const realm = await observe.mock.results[0].value
  for (const mutation of [
    { observedFrom: 881 }, // reservation at 1002: whole interval is 121 seconds old
    { observedThrough: 1003 },
    { g001AdmissionStateMutationsEnabled: true },
    { g002PlayerCount: 1 },
    { ptrSingletonOwnerCount: 0 },
    { genesis002Database: armed.genesis001Database },
    { recoveryAuthorizationCoreSha256: '0'.repeat(64) },
    { phase: 'claim' },
  ]) {
    row = undefined
    time = 1000
    controlState = createLedgerV2Control({ authorizationEpoch: 3 })
    observe.mockResolvedValueOnce({ ...realm, ...mutation })
    await expect(signer.issue(request)).rejects.toThrow()
    expect((row as unknown as { state: string }).state).toBe('armed')
  }
  row = undefined
  time = 1000
  controlState = createLedgerV2Control({ authorizationEpoch: 3 })
  observe.mockResolvedValueOnce({ ...realm, observedFrom: 882 })
  const lastIssue = await signer.issue(request)
  expect(await verifyRecoveryAuthorizationJws(lastIssue.authorizationJws, time)).toMatchObject({ observedFrom: 882, iat: 1002 })

  const claimRequest = { ...request, authorizationJws: lastIssue.authorizationJws, oidcToken: 'test-fresh-claim-token' }
  const archiveLoads = loadEvidence.mock.calls.length
  for (const mutation of [ { observedFrom: 1081 }, { observedThrough: 1203 },
    { liveInvariantDigest: '0'.repeat(64) }, { evidenceSnapshotDigest: realm.evidenceSnapshotDigest }, { phase: 'issue' } ]) {
    time = 1200
    observe.mockResolvedValueOnce({ ...realm, phase: 'claim', observationSequence: 2, observedFrom: 1082, observedThrough: 1200, evidenceSnapshotDigest: '7'.repeat(64), ...mutation })
    await expect(signer.claim(claimRequest)).rejects.toThrow()
    expect((row as unknown as { state: string }).state).toBe('issued')
  }
  time = 1200
  recheck.mockRejectedValueOnce(new Error('RECOVERY_GITHUB_EVIDENCE_INVALID'))
  const observationsBeforeMetadataFailure = observe.mock.calls.length
  await expect(signer.claim(claimRequest)).rejects.toThrow('RECOVERY_GITHUB_EVIDENCE_INVALID')
  expect(observe).toHaveBeenCalledTimes(observationsBeforeMetadataFailure)
  verifyIdentity.mockRejectedValueOnce(new Error('RECOVERY_GITHUB_OIDC_INVALID'))
  await expect(signer.claim({ ...claimRequest, oidcToken: 'test-expired-token' })).rejects.toThrow('RECOVERY_GITHUB_OIDC_INVALID')
  time = 1200
  observe.mockResolvedValueOnce({ ...realm, phase: 'claim', observationSequence: 2, observedFrom: 1082, observedThrough: 1200, evidenceSnapshotDigest: '7'.repeat(64) })
  const claimed = await signer.claim(claimRequest)
  expect((row as unknown as { state: string }).state).toBe('claimed')
  expect(Object.hasOwn(row!, 'authorizationJws')).toBe(false)
  expect(await verifyRecoveryClaimJws(claimed.claimReceiptJws, time)).toMatchObject({ claimedAt: 1202, iat: 1202, exp: 1322, claimDeadline: 2402, claimSequence: 1 })
  await expect(verifyRecoveryClaimJws(claimed.claimReceiptJws, 1322)).rejects.toThrow('RECOVERY_JWS_TIME_INVALID')
  expect(loadEvidence).toHaveBeenCalledTimes(archiveLoads)
  expect(recheck).toHaveBeenLastCalledWith(expect.objectContaining({ githubMetadata: metadata, githubMetadataSha256: github.githubMetadataSha256 }))
  expect(observe).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'claim', sequence: 2, candidateCommit: request.candidateCommit }))
  expect(verifyIdentity).toHaveBeenLastCalledWith(expect.objectContaining({ token: 'test-fresh-claim-token' }))
  await expect(signer.claim(claimRequest)).rejects.toThrow('RECOVERY_LEDGER_ALREADY_CLAIMED')
})

it('rejects equal decoded secrets, malformed encoding, duplicate JSON, extra keys and mismatched key material', async () => {
  const { validateSignerSecrets, input, privateJwk } = await fixture()
  const cases: unknown[] = [
    { ...input, RELEASE_RECOVERY_RPC_SECRET: privateJwk.d },
    { ...input, RELEASE_RECOVERY_RPC_SECRET: input.RELEASE_RECOVERY_RPC_SECRET + '=' },
    { ...input, RELEASE_RECOVERY_RPC_SECRET: 'A'.repeat(42) + 'B' },
    { ...input, RECOVERY_SIGNING_PRIVATE_JWK: input.RECOVERY_SIGNING_PRIVATE_JWK.replace('{', '{"d":"duplicate",') },
    { ...input, RECOVERY_SIGNING_PRIVATE_JWK: JSON.stringify({ ...privateJwk, d: input.RELEASE_RECOVERY_RPC_SECRET }) },
    { ...input, RECOVERY_SIGNING_PRIVATE_JWK: JSON.stringify({ ...privateJwk, x: input.RELEASE_RECOVERY_RPC_SECRET }) },
    { ...input, RECOVERY_SIGNING_PRIVATE_JWK: ' '.repeat(4097) },
    { ...input, extra: true },
    Object.create(input),
    Object.defineProperty({ ...input }, 'RELEASE_RECOVERY_RPC_SECRET', { get() { throw new Error('secret must not escape') } }),
  ]
  for (const candidate of cases) await expect(validateSignerSecrets(candidate)).rejects.toThrow(/^RECOVERY_SIGNER_SECRETS_INVALID$/u)
})

import { describe, expect, it, vi } from 'vitest'
import { capturePtrBridgeObservation, signPtrObservation, snapshotPtrObservationIdentity,
  snapshotPtrObservationRequest, verifyPtrObservation } from '../src/ptrObservation.js'
import { preparationPrivateJwk } from './preparationFixture.js'
import { base64UrlEncode, parseRecoveryCompactJws } from '../src/protocol.js'
import { P256_HALF_ORDER, P256_ORDER } from '../src/crypto.js'
import * as updateObservation from '../src/ptrObservation.js'

vi.mock('../src/recoveryPublicKey.js', () => ({
  RECOVERY_KEY_ID: 'warpkeep-0.4.0-recovery-2026-09-03-1',
  RECOVERY_KEY_THUMBPRINT: 'zbHwk528B5de5kuNzI98k4Y-rljmW6fbkH-aVZomk4M',
  RECOVERY_PUBLIC_JWK: { kty: 'EC', crv: 'P-256',
    x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE', y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA' },
}))
const identity = { sourceCommit: 'c'.repeat(40), sourceTree: 'd'.repeat(40),
  runId: '9007199254740995', runAttempt: '2', checkRunId: '9007199254740993',
  requestId: '123e4567-e89b-42d3-a456-426614174000' }
const expected = { requestId: identity.requestId, candidateCommit: identity.sourceCommit, recoveryAuthorizationEpoch: 3 }
const hash = 'a'.repeat(64)
function bridge() {
  const atlas = { admissionsOpen: false, accessRequestsOpen: false, sealed: true, atlasReady: true,
    generalAdmissionCount: 0, populationGuardPassed: true, publicReleaseId: `GRR-${'A'.repeat(26)}`,
    publicApprovalReceiptId: `GRA-${'B'.repeat(26)}`, atlasSourceCommit: 'e'.repeat(40),
    expectedReleaseSha256: hash, releaseHeaderSha256: hash, verificationDigest: hash, sealedStateHmacSha256: hash }
  return { schemaVersion: 1, profile: 'warpkeep-release-recovery-realm-observation-v1', ...expected,
    observedFrom: 100, observedThrough: 105, bridgeService: 'warpkeep-auth-bridge',
    bridgeWorkerVersion: 'warpkeep-auth-bridge-release-recovery-v1',
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
const capture = () => capturePtrBridgeObservation(bridge(), expected, 99, 106)
const bytes = (value: string) => Uint8Array.from(Buffer.from(value, 'base64url'))

describe('signed existing PTR state observation', () => {
  it('captures, signs and verifies the exact current request without authorizing adoption', async () => {
    const source = bridge(), observation = capturePtrBridgeObservation(source, expected, 99, 106)
    source.ptr.ownerEnabled = false
    const jws = await signPtrObservation(identity, observation, 107, preparationPrivateJwk)
    const result = await verifyPtrObservation(jws, identity, 108)
    expect(result).toMatchObject({ purpose: 'existing-ptr-state-observation', identity,
      issuedAt: 107, expiresAt: 195, observation: { observedFrom: 100, observedThrough: 105,
        ptr: { ownerEnabled: true, singletonOwnerCount: 1 } } })
    expect(Object.keys(result.observation.upstreamResponseDigests)).toHaveLength(4)
    expect(JSON.stringify(result)).not.toMatch(/"(?:g001|g002|oidcToken|rpcCredential|ownerFid|importReceiptDigest|provisionReceiptDigest)"/u)
    expect(() => parseRecoveryCompactJws(jws, 'authorization')).toThrow()
  })
  it('snapshots exact string-only request and identity without executing getters', () => {
    expect(snapshotPtrObservationRequest({ oidcToken: 'a.b.c', sourceCommit: identity.sourceCommit,
      requestId: identity.requestId })).toEqual({ oidcToken: 'a.b.c', sourceCommit: identity.sourceCommit, requestId: identity.requestId })
    expect(snapshotPtrObservationIdentity(identity)).toEqual(identity)
    expect(() => snapshotPtrObservationIdentity({ ...identity, runAttempt: 2 })).toThrow()
    expect(() => snapshotPtrObservationRequest({ oidcToken: 'private-token', ...identity })).toThrow()
    const getter = vi.fn(() => 'private-token')
    expect(() => snapshotPtrObservationRequest(Object.defineProperty({ sourceCommit: identity.sourceCommit,
      requestId: identity.requestId }, 'oidcToken', { enumerable: true, get: getter }))).toThrow()
    expect(getter).not.toHaveBeenCalled()
  })
  it.each(Object.keys(identity))('rejects a different expected %s', async field => {
    const jws = await signPtrObservation(identity, capture(), 107, preparationPrivateJwk)
    const value = field === 'requestId' ? '223e4567-e89b-42d3-a456-426614174000'
      : field.startsWith('source') ? 'b'.repeat(40) : '3'
    await expect(verifyPtrObservation(jws, { ...identity, [field]: value }, 108)).rejects.toThrow()
  })
  it.each([{ ownerEnabled: false }, { singletonOwnerCount: 2 }, { admissionsOpen: true },
    { accessRequestsOpen: true }, { atlasReady: false }, { generalAdmissionCount: 1 },
    { populationGuardPassed: false }, { sealed: false }, { realmId: 'GENESIS_002' },
    { databaseIdentity: 'd'.repeat(64) }, { programKeccak256: 'A'.repeat(64) },
    { atlasSourceCommit: 'e'.repeat(39) }, { publicReleaseId: 'GRR-private' },
    { verificationDigest: '' }, { ownerInvariantHmacSha256: 'secret' }, { ownerFid: 'private-fid' },
  ])('rejects invalid PTR state %j', change => {
    const value = bridge()
    Object.assign(value.ptr, change)
    expect(() => capturePtrBridgeObservation(value, expected, 99, 106)).toThrow()
  })
  it('rejects foreign, stale, widened, secret-bearing and accessor bridge envelopes', () => {
    for (const change of [{ requestId: '223e4567-e89b-42d3-a456-426614174000' },
      { candidateCommit: 'b'.repeat(40) }, { recoveryAuthorizationEpoch: 4 }, { observedFrom: 1 },
      { observedThrough: 107 }, { bridgeConfigEpoch: 0 }, { bridgeWorkerVersionId: 'bad' },
      { publicAdmissionRequestsOpen: true }, { rpcCredential: 'private-token' }]) {
      expect(() => capturePtrBridgeObservation({ ...bridge(), ...change }, expected, 99, 106)).toThrow()
    }
    const value = bridge()
    value.g002.databaseIdentity = value.ptr.databaseIdentity
    expect(() => capturePtrBridgeObservation(value, expected, 99, 106)).toThrow()
    const getter = vi.fn(() => 'private-fid')
    Object.defineProperty(value.ptr, 'ownerInvariantHmacSha256', { enumerable: true, get: getter })
    expect(() => capturePtrBridgeObservation(value, expected, 99, 106)).toThrow()
    expect(getter).not.toHaveBeenCalled()
    const secret = { ...bridge(), secret: 'do-not-echo-this' }
    try { capturePtrBridgeObservation(secret, expected, 99, 106); expect.fail() }
    catch (error) { expect(String(error)).not.toContain(secret.secret) }
  })
  it('rejects copied/forged capture objects, cross-request signing and late signing', async () => {
    const observation = capture()
    await expect(signPtrObservation(identity, { ...observation }, 107, preparationPrivateJwk)).rejects.toThrow()
    await expect(signPtrObservation({ ...identity, sourceCommit: 'b'.repeat(40) }, observation, 107, preparationPrivateJwk)).rejects.toThrow()
    await expect(signPtrObservation(identity, observation, 121, preparationPrivateJwk)).rejects.toThrow()
  })
  it('rejects a correctly signed noncanonical JSON payload and a foreign signing key', async () => {
    const jws = await signPtrObservation(identity, capture(), 107, preparationPrivateJwk), parts = jws.split('.')
    const key = await crypto.subtle.importKey('jwk', preparationPrivateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
    const body = Buffer.from(parts[1]!, 'base64url').toString()
    for (const noncanonical of [` ${body}`, body.replace('"issuedAt":107', '"issuedAt":1.07e2'),
      body.replace('"schemaVersion":1,', '"schemaVersion":1,"schemaVersion":1,')]) {
      const input = `${parts[0]}.${base64UrlEncode(new TextEncoder().encode(noncanonical))}`
      const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input)))
      let s = BigInt(`0x${Buffer.from(signature.subarray(32)).toString('hex')}`)
      if (s > P256_HALF_ORDER) {
        s = P256_ORDER - s
        signature.set(Buffer.from(s.toString(16).padStart(64, '0'), 'hex'), 32)
      }
      await expect(verifyPtrObservation(`${input}.${base64UrlEncode(signature)}`, identity, 108)).rejects.toThrow()
    }
    const foreign = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    await expect(signPtrObservation(identity, capture(), 107, await crypto.subtle.exportKey('jwk', foreign.privateKey))).rejects.toThrow()
  })
  it('validates excluded realm and upstream envelopes instead of silently discarding arbitrary data', () => {
    const mutations = [
      (value: ReturnType<typeof bridge>) => { value.g001.enabledPlayerCount = 2 },
      (value: ReturnType<typeof bridge>) => { value.g002.admissionsOpen = true },
      (value: ReturnType<typeof bridge>) => { value.upstreamResponseDigests.ptrOwnerStatusResponseHmacSha256 = 'private-token' },
      (value: ReturnType<typeof bridge>) => { Object.assign(value.g001, { fid: 'private-fid' }) },
    ]
    for (const mutate of mutations) {
      const value = bridge(); mutate(value)
      expect(() => capturePtrBridgeObservation(value, expected, 99, 106)).toThrow()
    }
    expect(() => capturePtrBridgeObservation(bridge(), expected, 1, 106)).toThrow()
  })
  it('rejects expired/future observations, tampering, padding and high-S signatures', async () => {
    const jws = await signPtrObservation(identity, capture(), 107, preparationPrivateJwk)
    for (const now of [106, 195, Number.NaN]) await expect(verifyPtrObservation(jws, identity, now)).rejects.toThrow()
    const parts = jws.split('.')
    const sig = bytes(parts[2]!), s = BigInt(`0x${Buffer.from(sig.subarray(32)).toString('hex')}`)
    sig.set(bytes(Buffer.from((P256_ORDER - s).toString(16).padStart(64, '0'), 'hex').toString('base64url')), 32)
    await expect(verifyPtrObservation(`${parts[0]}.${parts[1]}.${base64UrlEncode(sig)}`, identity, 108)).rejects.toThrow()
    await expect(verifyPtrObservation(`${parts[0]}=.${parts[1]}.${parts[2]}`, identity, 108)).rejects.toThrow()
    const body = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString())
    body.observation.ptr.ownerEnabled = false
    await expect(verifyPtrObservation(`${parts[0]}.${base64UrlEncode(new TextEncoder().encode(JSON.stringify(body)))}.${parts[2]}`, identity, 108)).rejects.toThrow()
    const changed = bytes(parts[2]!); changed[0] = changed[0]! ^ 1
    await expect(verifyPtrObservation(`${parts[0]}.${parts[1]}.${base64UrlEncode(changed)}`, identity, 108)).rejects.toThrow()
  })
})

const commonUpdate = {
  bindingDigest: '1'.repeat(64), inspectionDigest: '2'.repeat(64), inspectionRecordDigest: '3'.repeat(64),
  predecessorDigest: null, predecessorReceiptDigest: null, beforeProgram: 'a'.repeat(64), candidateProgram: 'b'.repeat(64),
  scopeDigest: '4'.repeat(64), issuedRecordDigest: '5'.repeat(64), claimRecordDigest: '6'.repeat(64),
  claimRunId: identity.runId, claimRunAttempt: identity.runAttempt,
}
const preContext = () => ({ ...commonUpdate, phase: 'pre' as const })
const nextIdentity = { ...identity, runId: '9007199254740997', runAttempt: '1', checkRunId: '9007199254740999',
  requestId: '223e4567-e89b-42d3-a456-426614174000' }
async function updatePair() {
  const pre = await updateObservation.signPtrUpdateObservation(identity, preContext(), capture(), 107, preparationPrivateJwk)
  const postContext = { ...commonUpdate, phase: 'post' as const,
    preObservationJwsSha256: Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pre))).toString('hex'),
    completionReceiptDigest: '7'.repeat(64), completionRecordDigest: '8'.repeat(64), terminalRecordDigest: '9'.repeat(64),
    terminalRunId: nextIdentity.runId, terminalRunAttempt: nextIdentity.runAttempt,
    terminalOutcome: 'reconciled-effect-applied' as const, terminalAt: '1970-01-01T00:03:20.000Z' }
  const value = bridge()
  Object.assign(value, { requestId: nextIdentity.requestId, observedFrom: 201, observedThrough: 205 })
  value.ptr.programKeccak256 = commonUpdate.candidateProgram
  // Transport transcript commitments are not preservation commitments.
  value.upstreamResponseDigests.ptrOwnerStatusResponseHmacSha256 = 'c'.repeat(64)
  value.upstreamResponseDigests.programIdentityBeforeTranscriptHmacSha256 = 'd'.repeat(64)
  const postCapture = capturePtrBridgeObservation(value, { ...expected, requestId: nextIdentity.requestId }, 200, 206)
  const post = await updateObservation.signPtrUpdateObservation(nextIdentity, postContext, postCapture, 207, preparationPrivateJwk, pre)
  return { pre, post, postContext, postCapture }
}
async function resignUpdate(compact: string, mutate: (body: Record<string, any>) => void, text?: (body: string) => string) {
  const [header, encoded] = compact.split('.'), body = JSON.parse(Buffer.from(encoded!, 'base64url').toString())
  mutate(body)
  const canonical = JSON.stringify(body), input = `${header}.${Buffer.from(text?.(canonical) ?? canonical).toString('base64url')}`
  const key = await crypto.subtle.importKey('jwk', preparationPrivateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input)))
  const s = BigInt(`0x${Buffer.from(signature.subarray(32)).toString('hex')}`)
  if (s > P256_HALF_ORDER) signature.set(Buffer.from((P256_ORDER - s).toString(16).padStart(64, '0'), 'hex'), 32)
  return `${input}.${Buffer.from(signature).toString('base64url')}`
}

describe('separate PTR update observation statements', () => {
  it('signs a real pre/post pair, preserves the original claim job and distinguishes historical from fresh verification', async () => {
    expect(typeof updateObservation.signPtrUpdateObservation).toBe('function')
    const { pre, post, postContext } = await updatePair()
    const pair = await updateObservation.verifyPtrUpdateObservationPair(pre, post)
    expect(pair.pre.identity).toEqual(identity)
    expect(pair.post.identity).toEqual(nextIdentity)
    expect(pair.post.context).toEqual(postContext)
    expect(pair.pre.observation.ptr.programKeccak256).toBe('a'.repeat(64))
    expect(pair.post.observation.ptr.programKeccak256).toBe('b'.repeat(64))
    expect(pair.post).toMatchObject({ purpose: 'existing-ptr-update-observation', expiresAt: 295 })
    await expect(updateObservation.verifyPtrUpdateObservation(pre, identity, preContext(), 207)).rejects.toThrow()
    expect(await updateObservation.verifyHistoricalPtrUpdateObservation(pre)).toEqual(pair.pre)
    expect(await updateObservation.verifyPtrUpdateObservation(post, nextIdentity, postContext, 208)).toEqual(pair.post)
    await expect(verifyPtrObservation(pre, identity, 108)).rejects.toThrow()
    const standalone = await signPtrObservation(identity, capture(), 107, preparationPrivateJwk)
    await expect(updateObservation.verifyHistoricalPtrUpdateObservation(standalone)).rejects.toThrow()
    expect(() => parseRecoveryCompactJws(post, 'authorization')).toThrow()
  })

  it('requires exact context and request variants, including no post material on a pre request', () => {
    const request = { oidcToken: 'a.b.c', sourceCommit: identity.sourceCommit, requestId: identity.requestId, context: preContext() }
    expect(updateObservation.snapshotPtrUpdateObservationRequest(request)).toEqual(request)
    for (const change of [{ extra: true }, { predecessorDigest: 'a'.repeat(64) }, { claimRunAttempt: 2 },
      { bindingDigest: 'A'.repeat(64) }, { phase: 'unknown' }, { preObservationJwsSha256: 'a'.repeat(64) }]) {
      expect(() => updateObservation.snapshotPtrUpdateObservationContext({ ...preContext(), ...change })).toThrow()
    }
    expect(() => updateObservation.snapshotPtrUpdateObservationRequest({ ...request, preObservationJws: 'a.b.c' })).toThrow()
    const getter = vi.fn(() => 'private')
    expect(() => updateObservation.snapshotPtrUpdateObservationContext(Object.defineProperty(preContext(), 'bindingDigest',
      { get: getter, enumerable: true }))).toThrow()
    expect(getter).not.toHaveBeenCalled()
    const trap = vi.fn(() => Reflect.ownKeys(preContext()))
    expect(() => updateObservation.snapshotPtrUpdateObservationContext(new Proxy(preContext(), { ownKeys: trap }))).toThrow()
    expect(trap).not.toHaveBeenCalled()
    expect(() => updateObservation.snapshotPtrUpdateObservationRequest(new Proxy(request, {}))).toThrow()
  })

  it.each(['bindingDigest', 'inspectionDigest', 'inspectionRecordDigest', 'beforeProgram', 'candidateProgram',
    'scopeDigest', 'issuedRecordDigest', 'claimRecordDigest', 'claimRunId', 'claimRunAttempt'])(
    'rejects a foreign %s expected by the private caller', async field => {
      const { post, postContext } = await updatePair()
      const changed = { ...postContext, [field]: field.startsWith('claimRun') ? '7' : 'f'.repeat(64) }
      await expect(updateObservation.verifyPtrUpdateObservation(post, nextIdentity, changed, 208)).rejects.toThrow()
    })

  it('refuses a pre statement from a different original claim run, copied captures and missing post predecessor', async () => {
    await expect(updateObservation.signPtrUpdateObservation(nextIdentity, preContext(), capture(), 107, preparationPrivateJwk)).rejects.toThrow()
    await expect(updateObservation.signPtrUpdateObservation(identity, preContext(), { ...capture() }, 107, preparationPrivateJwk)).rejects.toThrow()
    const { postCapture, postContext } = await updatePair()
    await expect(updateObservation.signPtrUpdateObservation(nextIdentity, postContext, postCapture, 207, preparationPrivateJwk)).rejects.toThrow()
  })

  it.each(['sealedStateHmacSha256', 'ownerInvariantHmacSha256', 'atlasSourceCommit', 'publicReleaseId',
    'bridgeConfigIdentity', 'bridgeConfigEpoch', 'bridgeWorkerVersionId', 'recoveryAuthorizationEpoch'])(
    'refuses a signed post with changed preservation/configuration %s', async field => {
      const { pre, postContext } = await updatePair()
      const value = bridge()
      Object.assign(value, { requestId: nextIdentity.requestId, observedFrom: 201, observedThrough: 205 })
      value.ptr.programKeccak256 = commonUpdate.candidateProgram
      if (field in value.ptr) Object.assign(value.ptr, { [field]: field === 'atlasSourceCommit' ? 'b'.repeat(40)
        : field === 'publicReleaseId' ? `GRR-${'C'.repeat(26)}` : 'f'.repeat(64) })
      else Object.assign(value, { [field]: field.endsWith('Epoch') ? 9 : field.endsWith('VersionId')
        ? '11234567-89ab-4cde-8f01-23456789abcd' : 'f'.repeat(64) })
      const selected = { requestId: nextIdentity.requestId, candidateCommit: identity.sourceCommit,
        recoveryAuthorizationEpoch: value.recoveryAuthorizationEpoch }
      const captured = capturePtrBridgeObservation(value, selected, 200, 206)
      await expect(updateObservation.signPtrUpdateObservation(nextIdentity, postContext, captured, 207, preparationPrivateJwk, pre)).rejects.toThrow()
    })

  it('rejects wrong pre digest, reverse pair, time inversion, a changed current source and expiry', async () => {
    const { pre, post, postContext, postCapture } = await updatePair()
    for (const change of [{ preObservationJwsSha256: 'a'.repeat(64) }, { terminalAt: '1970-01-01T00:04:00.000Z' },
      { terminalOutcome: 'no-effect' }]) {
      await expect(updateObservation.signPtrUpdateObservation(nextIdentity, { ...postContext, ...change } as typeof postContext,
        postCapture, 207, preparationPrivateJwk, pre)).rejects.toThrow()
    }
    await expect(updateObservation.verifyPtrUpdateObservationPair(post, pre)).rejects.toThrow()
    await expect(updateObservation.verifyPtrUpdateObservation(post, { ...nextIdentity, sourceTree: 'b'.repeat(40) }, postContext, 208)).rejects.toThrow()
    for (const now of [206, 295, Number.NaN])
      await expect(updateObservation.verifyPtrUpdateObservation(post, nextIdentity, postContext, now)).rejects.toThrow()
  })

  it.each(['binding', 'inspection', 'claim', 'original-run', 'pre-digest', 'source-tree', 'owner', 'atlas', 'config', 'terminal-time'])(
    'rejects an independently re-signed post whose %s does not match the authentic pre', async field => {
      const { pre, post } = await updatePair()
      const changed = await resignUpdate(post, body => {
        if (field === 'binding') body.context.bindingDigest = 'f'.repeat(64)
        if (field === 'inspection') body.context.inspectionRecordDigest = 'f'.repeat(64)
        if (field === 'claim') body.context.claimRecordDigest = 'f'.repeat(64)
        if (field === 'original-run') body.context.claimRunId = '11'
        if (field === 'pre-digest') body.context.preObservationJwsSha256 = 'f'.repeat(64)
        if (field === 'source-tree') body.identity.sourceTree = 'e'.repeat(40)
        if (field === 'owner') body.observation.ptr.ownerInvariantHmacSha256 = 'f'.repeat(64)
        if (field === 'atlas') body.observation.ptr.sealedStateHmacSha256 = 'f'.repeat(64)
        if (field === 'config') body.observation.bridgeConfigIdentity = 'f'.repeat(64)
        if (field === 'terminal-time') body.context.terminalAt = '1970-01-01T00:01:46.000Z'
      })
      // These are real canonical signatures and individually valid statements;
      // their cross-links, not a mocked signature failure, must reject the pair.
      expect((await updateObservation.verifyHistoricalPtrUpdateObservation(changed)).context.phase).toBe('post')
      await expect(updateObservation.verifyPtrUpdateObservationPair(pre, changed)).rejects.toThrow()
    })

  it('rejects signed noncanonical bytes and malformed intervals, plus unsigned/high-S/header tampering', async () => {
    const { post } = await updatePair()
    for (const text of [(value: string) => ` ${value}`, (value: string) => value.replace('"issuedAt":207', '"issuedAt":2.07e2'),
      (value: string) => value.replace('"schemaVersion":1,', '"schemaVersion":1,"schemaVersion":1,')]) {
      await expect(updateObservation.verifyHistoricalPtrUpdateObservation(await resignUpdate(post, () => {}, text))).rejects.toThrow()
    }
    for (const mutate of [(body: Record<string, any>) => { body.expiresAt = 999999 },
      (body: Record<string, any>) => { body.context.terminalAt = '1970-01-01T00:04:00.000Z' },
      (body: Record<string, any>) => { body.observation.ptr.programKeccak256 = 'a'.repeat(64) }]) {
      await expect(updateObservation.verifyHistoricalPtrUpdateObservation(await resignUpdate(post, mutate))).rejects.toThrow()
    }
    const parts = post.split('.'), signature = bytes(parts[2]!)
    const s = BigInt(`0x${Buffer.from(signature.subarray(32)).toString('hex')}`)
    signature.set(Buffer.from((P256_ORDER - s).toString(16).padStart(64, '0'), 'hex'), 32)
    await expect(updateObservation.verifyHistoricalPtrUpdateObservation(`${parts[0]}.${parts[1]}.${base64UrlEncode(signature)}`)).rejects.toThrow()
    const tampered = bytes(parts[2]!); tampered[0] ^= 1
    await expect(updateObservation.verifyHistoricalPtrUpdateObservation(`${parts[0]}.${parts[1]}.${base64UrlEncode(tampered)}`)).rejects.toThrow()
    await expect(updateObservation.verifyHistoricalPtrUpdateObservation(`${parts[0]}=.${parts[1]}.${parts[2]}`)).rejects.toThrow()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { capturePtrBridgeObservation, signPtrObservation, snapshotPtrObservationIdentity,
  snapshotPtrObservationRequest, verifyPtrObservation } from '../src/ptrObservation.js'
import { preparationPrivateJwk } from './preparationFixture.js'
import { base64UrlEncode, parseRecoveryCompactJws } from '../src/protocol.js'
import { P256_HALF_ORDER, P256_ORDER } from '../src/crypto.js'
import { observeReleaseRecoveryState } from '../../auth-bridge/src/releaseRecoveryObservation.js'
import type { SpacetimeReleaseRecoveryResolution } from '../../auth-bridge/src/spacetimeReleaseRecoveryResolver.js'
import { bridgeEnv } from '../../auth-bridge/test/recoveryConfigurationFixture.js'

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
  it('accepts the real bridge producer envelope with actual configuration validation', async () => {
    const fixture = bridge()
    const env = bridgeEnv({ PTR_SPACETIMEDB_DATABASE: fixture.ptr.databaseIdentity,
      GENESIS_002_SPACETIMEDB_DATABASE: fixture.g002.databaseIdentity })
    // Reuse the deployed producer/configuration parser; substitute only the network resolver.
    const response = await observeReleaseRecoveryState(env, { schemaVersion: 1,
      profile: 'warpkeep-release-recovery-realm-observation-request-v1',
      rpcCredential: env.RELEASE_RECOVERY_RPC_SECRET!, ...expected }, {
      clockMilliseconds: () => 106000,
      createResolver: () => ({ resolve: async () => ({ observedFrom: fixture.observedFrom,
        observedThrough: fixture.observedThrough, g001: fixture.g001, g002: fixture.g002, ptr: fixture.ptr,
        upstreamResponseDigests: fixture.upstreamResponseDigests }) as SpacetimeReleaseRecoveryResolution }),
    })
    const captured = capturePtrBridgeObservation(response, expected, 99, 106)
    const result = await verifyPtrObservation(await signPtrObservation(identity, captured, 107, preparationPrivateJwk), identity, 108)
    expect(result.observation.ptr).toEqual(response.ptr)
    expect(result.observation.bridgeConfigIdentity).toBe(response.bridgeConfigIdentity)
    expect(result.observation.upstreamResponseDigests).toEqual({
      programIdentityBeforeTranscriptHmacSha256: response.upstreamResponseDigests.programIdentityBeforeTranscriptHmacSha256,
      ptrAdminStatusResponseHmacSha256: response.upstreamResponseDigests.ptrAdminStatusResponseHmacSha256,
      ptrOwnerStatusResponseHmacSha256: response.upstreamResponseDigests.ptrOwnerStatusResponseHmacSha256,
      programIdentityAfterTranscriptHmacSha256: response.upstreamResponseDigests.programIdentityAfterTranscriptHmacSha256,
    })
    expect(JSON.stringify(result)).not.toContain(env.RELEASE_RECOVERY_RPC_SECRET)
    expect(JSON.stringify(result)).not.toContain(':"12345"')
  })
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

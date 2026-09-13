import { describe, expect, it, vi } from 'vitest'
import * as observation from '../src/ptrObservation.js'
import { P256_HALF_ORDER, P256_ORDER } from '../src/crypto.js'
import { preparationPrivateJwk } from './preparationFixture.js'
import { ptrObservationBridgeFixture } from './ptrObservationBridgeFixture.js'

vi.mock('../src/recoveryPublicKey.js', () => ({
  RECOVERY_KEY_ID: 'warpkeep-0.4.0-recovery-2026-09-03-1',
  RECOVERY_KEY_THUMBPRINT: 'zbHwk528B5de5kuNzI98k4Y-rljmW6fbkH-aVZomk4M',
  RECOVERY_PUBLIC_JWK: { kty: 'EC', crv: 'P-256', x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE',
    y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA' },
}))
const identity = { sourceCommit: 'c'.repeat(40), sourceTree: 'd'.repeat(40), runId: '9007199254740995',
  runAttempt: '2', checkRunId: '9007199254740993', requestId: '123e4567-e89b-42d3-a456-426614174000' }
const next = { ...identity, runId: '9007199254740997', checkRunId: '9007199254740999',
  requestId: '223e4567-e89b-42d3-a456-426614174000' }
const common = { bindingDigest: '1'.repeat(64), inspectionDigest: '2'.repeat(64), inspectionRecordDigest: '3'.repeat(64),
  predecessorDigest: null, predecessorReceiptDigest: null, beforeProgram: 'a'.repeat(64), candidateProgram: 'b'.repeat(64),
  scopeDigest: '4'.repeat(64), issuedRecordDigest: '5'.repeat(64), claimRecordDigest: '6'.repeat(64),
  claimRunId: identity.runId, claimRunAttempt: identity.runAttempt }
const preContext = { ...common, phase: 'pre' as const }
const expected = (requestId = identity.requestId) => ({ requestId, candidateCommit: identity.sourceCommit, recoveryAuthorizationEpoch: 3 })
const sha = async (text: string) => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).toString('hex')
async function pair() {
  const before = ptrObservationBridgeFixture(100)
  const captured = observation.captureG002BridgeObservation(before, expected(), 99, 101)
  const pre = await observation.signG002UpdateObservation(identity, preContext, captured, 102, preparationPrivateJwk)
  const after = ptrObservationBridgeFixture(200)
  after.requestId = next.requestId; after.g002.programKeccak256 = common.candidateProgram
  const postContext = { ...common, phase: 'post' as const, preObservationJwsSha256: await sha(pre),
    completionReceiptDigest: '7'.repeat(64), completionRecordDigest: '8'.repeat(64), terminalRecordDigest: '9'.repeat(64),
    terminalRunId: next.runId, terminalRunAttempt: next.runAttempt, terminalOutcome: 'reconciled-effect-applied' as const,
    terminalAt: new Date(199000).toISOString() }
  const postCapture = observation.captureG002BridgeObservation(after, expected(next.requestId), 199, 201)
  const post = await observation.signG002UpdateObservation(next, postContext, postCapture, 202, preparationPrivateJwk, pre)
  return { pre, post, captured, after, postCapture, postContext }
}
async function resign(compact: string, mutate: (body: Record<string, any>) => void, transform = (text: string) => text) {
  const [header, encoded] = compact.split('.'), body = JSON.parse(Buffer.from(encoded!, 'base64url').toString())
  mutate(body)
  const input = `${header}.${Buffer.from(transform(JSON.stringify(body))).toString('base64url')}`
  const key = await crypto.subtle.importKey('jwk', preparationPrivateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const signature = Buffer.from(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input)))
  const s = BigInt(`0x${signature.subarray(32).toString('hex')}`)
  if (s > P256_HALF_ORDER) signature.set(Buffer.from((P256_ORDER - s).toString(16).padStart(64, '0'), 'hex'), 32)
  return `${input}.${signature.toString('base64url')}`
}

describe('signed fixed G002 existing update observations', () => {
  it('owns full validated bridge evidence and signs a distinct historically verifiable pre/post pair', async () => {
    expect(typeof observation.captureG002BridgeObservation).toBe('function')
    const { pre, post, postContext } = await pair()
    const result = await observation.verifyG002UpdateObservationPair(pre, post)
    expect(result.post).toMatchObject({ profile: 'warpkeep-recovery-g002-update-observation-v1',
      aud: 'https://release-auth.warpkeep.com/g002-update-observation', purpose: 'existing-g002-update-observation',
      identity: next, context: postContext, observation: { g002: {
        databaseIdentity: 'c2003223f6e3c86e988775ddd458c3a45635d0d021e11131551471617c392194',
        programKeccak256: common.candidateProgram, playerCount: 0, sealed: true, atlasReady: true } } })
    expect(Object.keys(result.post.observation.upstreamResponseDigests)).toEqual([
      'programIdentityBeforeTranscriptHmacSha256', 'g002StatusResponseHmacSha256', 'programIdentityAfterTranscriptHmacSha256'])
    expect(JSON.stringify(result)).not.toMatch(/"(?:ptr|g001|rpcCredential|ownerFid|oidcToken|importReceiptDigest)"/u)
    await expect(observation.verifyG002UpdateObservation(pre, identity, preContext, 200)).rejects.toThrow()
    expect(await observation.verifyG002UpdateObservation(post, next, postContext, 203)).toEqual(result.post)
  })
  it.each([
    ['g002', 'databaseIdentity', 'd'.repeat(64)], ['g002', 'realmId', 'PTR'], ['g002', 'sealed', false],
    ['g002', 'atlasReady', false], ['g002', 'populationGuardPassed', false], ['g002', 'playerCount', 1],
    ['g002', 'playerCount', -0], ['g002', 'generalAdmissionCount', 1], ['g002', 'admissionsOpen', true],
    ['g002', 'accessRequestsOpen', true], ['g002', 'sealedStateHmacSha256', 'private-state'],
    ['ptr', 'ownerEnabled', false], ['ptr', 'databaseIdentity', 'd'.repeat(64)],
    ['g001', 'playerAccessEnabled', false], ['g001', 'censusStable', false],
    ['upstreamResponseDigests', 'ptrOwnerStatusResponseHmacSha256', 'private-state'],
  ])('rejects unsafe observed %s.%s', (realm, field, value) => {
    const source = ptrObservationBridgeFixture(100) as Record<string, any>
    source[realm!][field!] = value
    expect(() => observation.captureG002BridgeObservation(source, expected(), 99, 101)).toThrow()
  })
  it('rejects copied or cross-realm captures and snapshots external objects before signing awaits', async () => {
    const source = ptrObservationBridgeFixture(100), capture = observation.captureG002BridgeObservation(source, expected(), 99, 101)
    const ownedIdentity = { ...identity }, ownedContext = { ...preContext }, ownedKey = { ...preparationPrivateJwk }
    const pending = observation.signG002UpdateObservation(ownedIdentity, ownedContext, capture, 102, ownedKey)
    source.g002.sealed = false; ownedIdentity.sourceCommit = 'f'.repeat(40); ownedContext.bindingDigest = 'f'.repeat(64); ownedKey.d = ''
    const data = await observation.verifyHistoricalG002UpdateObservation(await pending)
    expect(data.identity).toEqual(identity); expect(data.context).toEqual(preContext); expect(data.observation.g002.sealed).toBe(true)
    await expect(observation.signG002UpdateObservation(identity, preContext, { ...capture }, 102, preparationPrivateJwk)).rejects.toThrow()
    const ptr = observation.capturePtrBridgeObservation(ptrObservationBridgeFixture(100), expected(), 99, 101)
    await expect(observation.signG002UpdateObservation(identity, preContext, ptr as never, 102, preparationPrivateJwk)).rejects.toThrow()
    await expect(observation.signPtrUpdateObservation(identity, preContext, capture as never, 102, preparationPrivateJwk)).rejects.toThrow()
  })
  it.each(['bindingDigest', 'inspectionRecordDigest', 'claimRecordDigest', 'scopeDigest', 'beforeProgram',
    'sourceTree', 'bridgeConfigIdentity', 'bridgeConfigEpoch', 'bridgeWorkerVersionId', 'bridgeSourceCommit',
    'recoveryAuthorizationEpoch', 'sealedStateHmacSha256', 'atlasSourceCommit', 'publicReleaseId', 'preObservationJwsSha256'])(
    'rejects independently signed post with changed %s', async field => {
      const { pre, post } = await pair()
      const altered = await resign(post, body => {
        if (field in body.context) body.context[field] = 'f'.repeat(64)
        else if (field in body.identity) body.identity[field] = 'f'.repeat(40)
        else if (field in body.observation) body.observation[field] = field.endsWith('Epoch') ? 9
          : field.endsWith('VersionId') ? '11234567-89ab-4cde-8f01-23456789abcd' : field.endsWith('Commit') ? 'b'.repeat(40) : 'f'.repeat(64)
        else body.observation.g002[field] = field === 'atlasSourceCommit' ? 'f'.repeat(40)
          : field === 'publicReleaseId' ? `GRR-${'C'.repeat(26)}` : 'f'.repeat(64)
      })
      expect((await observation.verifyHistoricalG002UpdateObservation(altered)).context.phase).toBe('post')
      await expect(observation.verifyG002UpdateObservationPair(pre, altered)).rejects.toThrow()
    })
  it('rejects mixed protocol pairs, wrong phase/program/time, noncanonical bytes and high-S signatures', async () => {
    const { pre, post, postContext, postCapture } = await pair()
    const ptr = await observation.signPtrUpdateObservation(identity, preContext,
      observation.capturePtrBridgeObservation(ptrObservationBridgeFixture(100), expected(), 99, 101), 102, preparationPrivateJwk)
    await expect(observation.verifyG002UpdateObservationPair(ptr, post)).rejects.toThrow()
    await expect(observation.verifyPtrUpdateObservationPair(pre, ptr)).rejects.toThrow()
    await expect(observation.verifyG002UpdateObservationPair(post, pre)).rejects.toThrow()
    for (const change of [{ candidateProgram: 'f'.repeat(64) }, { terminalAt: new Date(201000).toISOString() }, { preObservationJwsSha256: 'f'.repeat(64) }])
      await expect(observation.signG002UpdateObservation(next, { ...postContext, ...change }, postCapture, 202, preparationPrivateJwk, pre)).rejects.toThrow()
    for (const transform of [(text: string) => ` ${text}`, (text: string) => text.replace('"issuedAt":202', '"issuedAt":2.02e2')])
      await expect(observation.verifyHistoricalG002UpdateObservation(await resign(post, () => {}, transform))).rejects.toThrow()
    const parts = post.split('.'), signature = Buffer.from(parts[2]!, 'base64url')
    const s = BigInt(`0x${signature.subarray(32).toString('hex')}`)
    signature.set(Buffer.from((P256_ORDER - s).toString(16).padStart(64, '0'), 'hex'), 32)
    await expect(observation.verifyHistoricalG002UpdateObservation(`${parts[0]}.${parts[1]}.${signature.toString('base64url')}`)).rejects.toThrow()
  })
})

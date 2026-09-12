import { describe, expect, it, vi } from 'vitest'
import { signPreparationObservation, verifyPreparationObservation } from '../src/preparationObservation.js'
import { snapshotPreparationIntent } from '../src/preparationIntent.js'
import { preparationPrivateJwk } from './preparationFixture.js'
import { parseRecoveryCompactJws } from '../src/protocol.js'

vi.mock('../src/recoveryPublicKey.js', () => ({
  RECOVERY_KEY_ID: 'warpkeep-0.4.0-recovery-2026-09-03-1',
  RECOVERY_KEY_THUMBPRINT: 'zbHwk528B5de5kuNzI98k4Y-rljmW6fbkH-aVZomk4M',
  RECOVERY_PUBLIC_JWK: {
    kty: 'EC',
    crv: 'P-256',
    x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE',
    y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA',
  },
}))
const intent = snapshotPreparationIntent({
  schemaVersion: 1,
  profile: 'warpkeep-recovery-preparation-intent-v1',
  requestId: '123e4567-e89b-42d3-a456-426614174000',
  authorizationEpoch: 3,
  repository: 'ael-dev3/Warpkeep',
  repositoryId: '1273513252',
  repositoryOwnerId: '183124839',
  preparationCommit: 'c'.repeat(40),
  preparationTree: 'd'.repeat(40),
  policyDigest: 'e'.repeat(64),
  configuredArmingDigest: null,
  runId: '12',
  runAttempt: '1',
  checkRunId: '13',
  createdAt: 100,
})

const observed = {
  observedFrom: 100,
  observedThrough: 101,
  bridgeWorkerVersionId: '01234567-89ab-4cde-8f01-23456789abcd',
  bridgeSourceCommit: 'e'.repeat(40),
  bridgeConfigIdentity: 'f'.repeat(64),
  bridgeConfigEpoch: 7,
}
describe('fresh preparation configuration observation', () => {
  it('binds real signature to exact reserved intent and bounded freshness', async () => {
    const jws = await signPreparationObservation(intent, observed, 102, preparationPrivateJwk)
    expect(await verifyPreparationObservation(jws, intent, 103)).toMatchObject({
      ...observed,
      issuedAt: 102,
      expiresAt: 191,
    })
    await expect(
      verifyPreparationObservation(jws, { ...intent, authorizationEpoch: 4 }, 103),
    ).rejects.toThrow()
    await expect(verifyPreparationObservation(jws, intent, 192)).rejects.toThrow()
    expect(() => parseRecoveryCompactJws(jws, 'authorization')).toThrow()
  })
  it('rejects malformed coordinates and post-observation delay', async () => {
    await expect(
      signPreparationObservation(intent, { ...observed, bridgeConfigEpoch: 0 }, 102, preparationPrivateJwk),
    ).rejects.toThrow()
    await expect(signPreparationObservation(intent, observed, 200, preparationPrivateJwk)).rejects.toThrow()
  })
  it.each([
    { bridgeConfigIdentity: 'A'.repeat(64) },
    { bridgeWorkerVersionId: 'bad' },
    { bridgeSourceCommit: 'f'.repeat(39) },
    { observedFrom: 102, observedThrough: 101 },
    { observedFrom: 50, observedThrough: 101 },
    { observedFrom: 99, observedThrough: 101 },
  ])('rejects malformed or pre-reservation evidence %j', async (change) => {
    await expect(
      signPreparationObservation(intent, { ...observed, ...change }, 102, preparationPrivateJwk),
    ).rejects.toThrow()
  })
  it('rejects extra fields/accessors without running getters', async () => {
    const getter = vi.fn(() => observed.bridgeConfigIdentity)
    const hostile = { ...observed }
    Object.defineProperty(hostile, 'bridgeConfigIdentity', { get: getter, enumerable: true })
    await expect(signPreparationObservation(intent, hostile, 102, preparationPrivateJwk)).rejects.toThrow()
    expect(getter).not.toHaveBeenCalled()
    await expect(
      signPreparationObservation(intent, { ...observed, extra: true }, 102, preparationPrivateJwk),
    ).rejects.toThrow()
  })
  it('rejects a tampered signature and future-issued result', async () => {
    const jws = await signPreparationObservation(intent, observed, 102, preparationPrivateJwk),
      parts = jws.split('.')
    parts[2] = (parts[2]![0] === 'A' ? 'B' : 'A') + parts[2]!.slice(1)
    await expect(verifyPreparationObservation(parts.join('.'), intent, 103)).rejects.toThrow()
    await expect(verifyPreparationObservation(jws, intent, 101)).rejects.toThrow()
  })
})

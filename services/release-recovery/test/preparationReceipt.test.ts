import { describe, expect, it, vi } from 'vitest'
import { signPreparationReceipt, verifyPreparationReceipt } from '../src/preparationReceipt.js'
import { snapshotPreparationIntent } from '../src/preparationIntent.js'
import { preparationPrivateJwk } from './preparationFixture.js'
import { parseRecoveryCompactJws } from '../src/protocol.js'

vi.mock('../src/recoveryPublicKey.js', () => ({
  RECOVERY_KEY_ID: 'warpkeep-0.4.0-recovery-2026-09-03-1',
  RECOVERY_KEY_THUMBPRINT: 'zbHwk528B5de5kuNzI98k4Y-rljmW6fbkH-aVZomk4M',
  RECOVERY_PUBLIC_JWK: { kty: 'EC', crv: 'P-256', x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE', y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA' },
}))
const intent = snapshotPreparationIntent({ schemaVersion: 1, profile: 'warpkeep-recovery-preparation-intent-v1',
  requestId: '123e4567-e89b-42d3-a456-426614174000', authorizationEpoch: 3,
  repository: 'ael-dev3/Warpkeep', repositoryId: '1273513252', repositoryOwnerId: '183124839',
  preparationCommit: 'c'.repeat(40), preparationTree: 'd'.repeat(40), policyDigest: 'e'.repeat(64),
  configuredArmingDigest: null, runId: '12', runAttempt: '1', checkRunId: '13', createdAt: 100 })
describe('purpose-separated preparation receipt', () => {
  it('verifies a genuine signature but cannot be parsed as deployment authority', async () => {
    const receipt = await signPreparationReceipt(intent, preparationPrivateJwk)
    expect(await verifyPreparationReceipt(receipt, intent)).toEqual(intent)
    expect(() => parseRecoveryCompactJws(receipt, 'authorization')).toThrow()
    expect(() => parseRecoveryCompactJws(receipt, 'status')).toThrow()
  })
  it('rejects another intent or tampered signature', async () => {
    const receipt = await signPreparationReceipt(intent, preparationPrivateJwk)
    await expect(verifyPreparationReceipt(receipt, { ...intent, authorizationEpoch: 4 })).rejects.toThrow()
    const parts = receipt.split('.')
    parts[2] = `${parts[2]![0] === 'A' ? 'B' : 'A'}${parts[2]!.slice(1)}`
    await expect(verifyPreparationReceipt(parts.join('.'), intent)).rejects.toThrow()
  })
})

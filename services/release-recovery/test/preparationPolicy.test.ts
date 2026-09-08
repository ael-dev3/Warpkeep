import { describe, expect, it } from 'vitest'
import { parsePreparationDeployment, snapshotPreparationRequest } from '../src/preparationPolicy.js'
import { arming } from './signerControlFixture.js'

export const policy = {
  schemaVersion: 1,
  profile: 'warpkeep-recovery-preparation-policy-v1',
  enabled: true,
  authorizationEpoch: 3,
  workflowRef: 'ael-dev3/Warpkeep/.github/workflows/sealed-realms-production.yml@refs/heads/main',
  environment: 'notification-bridge-prepared',
  operation: 'activation-evidence-generate',
}
const deployment = (manifest = '') => ({
  RECOVERY_ENABLED: 'false', RECOVERY_AUTHORIZATION_EPOCH: '3',
  RECOVERY_ARMING_MANIFEST: manifest, RECOVERY_PREPARATION_POLICY: JSON.stringify(policy),
})
describe('preparation deployment policy', () => {
  it('permits an explicit disabled preparation without a populated arming', () => {
    expect(parsePreparationDeployment(deployment()).configuredArming).toBeNull()
  })
  it('retains a valid already configured tuple for adoption rather than replacing it', () => {
    expect(parsePreparationDeployment(deployment(JSON.stringify(arming()))).configuredArming).toEqual(arming())
  })
  it.each([
    { RECOVERY_PREPARATION_POLICY: undefined },
    { RECOVERY_PREPARATION_POLICY: '' },
    { RECOVERY_ENABLED: 'true' },
    { RECOVERY_AUTHORIZATION_EPOCH: '4' },
    { RECOVERY_ARMING_MANIFEST: '{}' },
    { RECOVERY_PREPARATION_POLICY: JSON.stringify({ ...policy, enabled: false }) },
    { RECOVERY_PREPARATION_POLICY: JSON.stringify({ ...policy, operation: 'issue' }) },
  ])('refuses absent policy, enabled authorization or conflicting configuration: %j', delta => {
    expect(() => parsePreparationDeployment({ ...deployment(), ...delta })).toThrow()
  })
  it('accepts no caller request ID, epoch or operation', () => {
    const request = { oidcToken: 'a.b.c', preparationCommit: 'c'.repeat(40) }
    expect(snapshotPreparationRequest(request)).toEqual(request)
    for (const key of ['requestId', 'authorizationEpoch', 'operation']) {
      expect(() => snapshotPreparationRequest({ ...request, [key]: 'caller' })).toThrow()
    }
  })
})

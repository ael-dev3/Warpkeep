// @vitest-environment node
import { expect, it } from 'vitest';
import { recoveryBindingCandidate } from './fixtures/recoveryBindingCandidate';
import { createRecoveryActivationBinding } from '../scripts/recovery-activation-candidate.mjs';
import { verifySealedLaunchPagesBuildEnvironment as verify } from '../scripts/verify-0.4.0-sealed-launch.mjs';
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid test fixture');
  return value;
}
function fixture() {
  const binding = createRecoveryActivationBinding(`${JSON.stringify(recoveryBindingCandidate(), null, 2)}\n`);
  return { binding, bindingSource: `${JSON.stringify(binding, null, 2)}\n`, environment: {
    VITE_WARPKEEP_PTR_ENABLED: 'true', VITE_PTR_SPACETIMEDB_DATABASE: text(binding.ptrDatabaseIdentity),
  } };
}
it('accepts the exact PTR identity from a fully validated recovery binding', () => {
  const f = fixture();
  expect(verify(f)).toEqual({ ptrEnabled: true, ptrDatabaseIdentity: f.binding.ptrDatabaseIdentity });
});
it.each(['alias', 'g001', 'g002', 'disabled', 'uri', 'alternate-name'])('rejects %s build targeting', kind => {
  const f = fixture();
  const environment: Record<string, string> = { ...f.environment };
  if (kind === 'alias') environment.VITE_PTR_SPACETIMEDB_DATABASE = 'warpkeep-ptr';
  if (kind === 'g001') environment.VITE_PTR_SPACETIMEDB_DATABASE = text(f.binding.g001DatabaseIdentity);
  if (kind === 'g002') environment.VITE_PTR_SPACETIMEDB_DATABASE = text(f.binding.g002DatabaseIdentity);
  if (kind === 'disabled') environment.VITE_WARPKEEP_PTR_ENABLED = 'false';
  if (kind === 'uri') environment.VITE_PTR_SPACETIMEDB_URI = 'https://other.invalid';
  if (kind === 'alternate-name') environment.VITE_WARPKEEP_PTR_DATABASE = 'warpkeep-ptr';
  expect(() => verify({ bindingSource: f.bindingSource, environment })).toThrow('SEALED_LAUNCH_PAGES_PTR_ENVIRONMENT_INVALID');
});
it('does not accept an incomplete schema-2 object as build authority', () => {
  const f = fixture();
  expect(() => verify({ ...f, bindingSource: JSON.stringify({ schemaVersion: 2, ptrDatabaseIdentity: f.binding.ptrDatabaseIdentity }) })).toThrow();
});
it('rejects a mutated recovery commitment despite matching PTR environment', () => {
  const f = fixture();
  expect(() => verify({ ...f, bindingSource: `${JSON.stringify({ ...f.binding, recoveryAuthorizationCoreSha256: '0'.repeat(64) }, null, 2)}\n` })).toThrow();
});

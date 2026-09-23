// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { projectG001PolicyObservationDiagnostic } from '../scripts/genesis001-linux-policy-child.mjs';

const productionAdminTokenBudgetCode = (...parts: string[]) => [
  'PRODUCTION', 'ADMIN', 'TOKEN', ...parts,
].join('_');

const projectedFailures = [
  ['GENESIS_001_POLICY_OBSERVATION_LIVE_POLICY_INVALID', 'g001-policy-state'],
  ['GREATER_REALM_PRODUCTION_STATUS_PROCEDURE_UNAVAILABLE', 'g001-policy-procedure'],
  ['GREATER_REALM_PRODUCTION_TRANSPORT_UNAVAILABLE', 'g001-policy-transport'],
  ['GREATER_REALM_PRODUCTION_TRANSPORT_SESSION_CLOSED', 'g001-policy-transport'],
  ['GREATER_REALM_PRODUCTION_TRANSPORT_CLOCK_INVALID', 'g001-policy-transport'],
  ['GREATER_REALM_PRODUCTION_CONTINGENCY_TOKEN_EXPIRED', 'g001-policy-transport'],
  ['GENESIS_001_POLICY_OBSERVATION_SECRET_AUTHORITY_AMBIGUOUS', 'g001-policy-credential'],
  ['GENESIS_001_POLICY_OBSERVATION_SECRET_AUTHORITY_UNAVAILABLE', 'g001-policy-credential'],
  ['GENESIS_001_POLICY_OBSERVATION_SECRET_DESCRIPTOR_CHANGED', 'g001-policy-credential'],
  ['GENESIS_001_POLICY_OBSERVATION_SECRET_DESCRIPTOR_INVALID', 'g001-policy-credential'],
  ['GREATER_REALM_PRODUCTION_ADMIN_SECRET_CONTROL_CHARACTER_REJECTED', 'g001-policy-credential'],
  ['GREATER_REALM_PRODUCTION_ADMIN_SECRET_ENCODING_INVALID', 'g001-policy-credential'],
  ['GREATER_REALM_PRODUCTION_ADMIN_SECRET_FILE_CHANGED', 'g001-policy-credential'],
  ['GREATER_REALM_PRODUCTION_ADMIN_SECRET_FILE_INVALID', 'g001-policy-credential'],
  ['GREATER_REALM_PRODUCTION_ADMIN_SECRET_LENGTH_INVALID', 'g001-policy-credential'],
  ['GREATER_REALM_PRODUCTION_ADMIN_SECRET_STDIN_REQUIRED', 'g001-policy-credential'],
  ['GENESIS_001_POLICY_OBSERVATION_ARGUMENTS_INVALID', 'g001-policy-authority'],
  ['GENESIS_001_POLICY_OBSERVATION_INPUT_INVALID', 'g001-policy-authority'],
  ['GENESIS_001_POLICY_OBSERVATION_NATIVE_PROFILE_INVALID', 'g001-policy-authority'],
  ['GENESIS_001_POLICY_OBSERVATION_SOURCE_INVALID', 'g001-policy-authority'],
  ['GENESIS_001_POLICY_OBSERVATION_TRUSTED_BOOTSTRAP_REQUIRED', 'g001-policy-authority'],
  ['GENESIS_001_POLICY_OBSERVATION_TEST_DEPENDENCY_FORBIDDEN', 'g001-policy-authority'],
  ['GREATER_REALM_PRODUCTION_TOKEN_BUDGET_TEST_DEPENDENCY_REQUIRED', 'g001-policy-authority'],
  ['GREATER_REALM_PRODUCTION_TRANSPORT_TARGET_OVERRIDE_REJECTED', 'g001-policy-authority'],
  ['GREATER_REALM_PRODUCTION_TRANSPORT_WIRE_NAME_INVALID', 'g001-policy-authority'],
  [productionAdminTokenBudgetCode('LEDGER', 'LOCK', 'CLEANUP', 'FAILED'), 'g001-policy-budget'],
  [productionAdminTokenBudgetCode('BUDGET', 'EXHAUSTED'), 'g001-policy-budget'],
  ['GENESIS_001_POLICY_OBSERVATION_TIMESTAMP_INVALID', 'g001-receipt'],
] as const;

describe('G001 policy failure projection', () => {
  it.each(projectedFailures)('maps %s to one fixed public category', (code, diagnostic) => {
    const privateSentinel = 'PRIVATE_PROVIDER_RESPONSE_AND_CREDENTIAL';
    const error = Object.assign(Error(privateSentinel), { code, details: privateSentinel });
    expect(projectG001PolicyObservationDiagnostic(error)).toBe(diagnostic);
    expect(projectG001PolicyObservationDiagnostic(error)).not.toContain(privateSentinel);
  });

  it('projects combined token-budget interruption without exposing its causes', () => {
    const error = new AggregateError([Error('private cause')],
      productionAdminTokenBudgetCode('LEDGER', 'MULTIPLE', 'FAILURES'));
    expect(projectG001PolicyObservationDiagnostic(error)).toBe('g001-policy-budget');
  });

  it('discards errors whose prototype cannot be inspected', () => {
    const error = new Proxy(Error('private'), {
      getPrototypeOf: () => { throw Error('private prototype'); },
    });
    expect(projectG001PolicyObservationDiagnostic(error)).toBeUndefined();
  });

  it('preserves the existing census allowlist and discards unknown failures', () => {
    expect(projectG001PolicyObservationDiagnostic(Object.assign(Error('private'), {
      diagnostic: 'g001-admitted-reconciliation',
    }))).toBe('g001-admitted-reconciliation');
    expect(projectG001PolicyObservationDiagnostic(Object.assign(Error('private'), {
      code: 'UNKNOWN_PRIVATE_PROVIDER_ERROR',
    }))).toBeUndefined();
    expect(projectG001PolicyObservationDiagnostic(Object.assign(Error('private'), {
      diagnostic: 'g001-policy-state',
    }))).toBeUndefined();
    for (const diagnostic of ['g001-census-directory', 'g001-applicant-collection', 'g001-applicant-export', 'g001-applicant-proof',
      'g001-admitted-collection', 'g001-session-finalize']) {
      expect(projectG001PolicyObservationDiagnostic(Object.assign(Error('private'), { diagnostic })))
        .toBe(diagnostic);
    }
  });

  it('does not invoke error getters or proxy traps while projecting a failure', () => {
    let invoked = false;
    const getter = Object.defineProperty({}, 'code', {
      get() { invoked = true; return 'GENESIS_001_POLICY_OBSERVATION_LIVE_POLICY_INVALID'; },
    });
    const proxy = new Proxy({}, { getOwnPropertyDescriptor() { invoked = true; throw Error('private'); } });
    expect(projectG001PolicyObservationDiagnostic(getter)).toBeUndefined();
    expect(projectG001PolicyObservationDiagnostic(proxy)).toBeUndefined();
    expect(invoked).toBe(false);
  });
});

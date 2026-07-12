import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateAdmissionEpoch } from '../src/admissionPolicy';
import {
  AuthEpochExhaustedError,
  executeAllowFidTransition,
  planAllowFid,
  type AllowFidPlan,
} from '../src/adminPolicy';
import { MAX_AUTH_EPOCH } from '../src/config';

function enabledPolicy(authEpoch: number) {
  return { enabled: true, authEpoch } as const;
}

function disabledPolicy(authEpoch: number) {
  return { enabled: false, authEpoch } as const;
}

function recordingHandlers(events: string[]) {
  const record = (plan: AllowFidPlan) => events.push(`${plan.kind}:${plan.authEpoch}`);
  return {
    insert: record,
    enabled: record,
    reenabled: record,
    audit: () => events.push('audit'),
  };
}

test('first admission keeps epoch zero', () => {
  assert.deepEqual(planAllowFid(null), {
    kind: 'insert',
    enabled: true,
    authEpoch: 0,
  });
});

test('repeated allow while enabled preserves the epoch', () => {
  assert.deepEqual(planAllowFid(enabledPolicy(9)), {
    kind: 'enabled',
    enabled: true,
    authEpoch: 9,
  });
});

test('disable then re-enable increments exactly once', () => {
  const reenabled = planAllowFid(disabledPolicy(9));
  assert.deepEqual(reenabled, {
    kind: 'reenabled',
    enabled: true,
    authEpoch: 10,
  });
  assert.deepEqual(planAllowFid(enabledPolicy(reenabled.authEpoch)), {
    kind: 'enabled',
    enabled: true,
    authEpoch: 10,
  });
});

test('a disabled row can rotate from one below maximum to maximum', () => {
  assert.deepEqual(planAllowFid(disabledPolicy(MAX_AUTH_EPOCH - 1)), {
    kind: 'reenabled',
    enabled: true,
    authEpoch: MAX_AUTH_EPOCH,
  });
});

test('maximum-epoch re-enable fails before state or audit callbacks', () => {
  const existing = disabledPolicy(MAX_AUTH_EPOCH);
  const events: string[] = [];
  assert.throws(
    () => executeAllowFidTransition(existing, recordingHandlers(events)),
    AuthEpochExhaustedError,
  );
  assert.deepEqual(existing, { enabled: false, authEpoch: MAX_AUTH_EPOCH });
  assert.deepEqual(events, []);
});

test('an already-enabled maximum-epoch row remains valid and does not overflow', () => {
  const events: string[] = [];
  assert.deepEqual(
    executeAllowFidTransition(enabledPolicy(MAX_AUTH_EPOCH), recordingHandlers(events)),
    { kind: 'enabled', enabled: true, authEpoch: MAX_AUTH_EPOCH },
  );
  assert.deepEqual(events, [`enabled:${MAX_AUTH_EPOCH}`, 'audit']);
});

test('a retained token from before re-enable resolves to AUTH_EPOCH_MISMATCH', () => {
  const reenabled = planAllowFid(disabledPolicy(4));
  assert.equal(
    evaluateAdmissionEpoch({ enabled: true, authEpoch: reenabled.authEpoch }, 4),
    'epoch_mismatch',
  );
  assert.equal(
    evaluateAdmissionEpoch({ enabled: true, authEpoch: reenabled.authEpoch }, reenabled.authEpoch),
    'current',
  );
});

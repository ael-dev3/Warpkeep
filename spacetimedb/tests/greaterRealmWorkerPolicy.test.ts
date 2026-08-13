import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { workerNodeKey } from '../src/castleWorkerPolicy';
import {
  formatGreaterRealmWorkerDispatchReceiptKindV2,
  greaterRealmWorkerCapacityDigestV1,
  greaterRealmWorkerDispatchFingerprintV2,
  greaterRealmWorkerPolicyErrorCode,
  parseGreaterRealmWorkerDispatchReceiptKindV2,
} from '../src/greaterRealmWorkerPolicy';
import { GREATER_REALM_PUBLIC_REGIONS } from '../src/greaterRealmV17Policy';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const RESOURCES = Object.freeze(['food', 'wood', 'stone', 'gold'] as const);

function opaqueSuffix(value: number): string {
  let remaining = value;
  let encoded = '';
  do {
    encoded = BASE32[remaining % BASE32.length]! + encoded;
    remaining = Math.floor(remaining / BASE32.length);
  } while (remaining > 0);
  return encoded.padStart(26, 'A');
}

function location(value: number) {
  return `GRL-${opaqueSuffix(value)}`;
}

function code(action: () => unknown) {
  try {
    action();
  } catch (error) {
    return greaterRealmWorkerPolicyErrorCode(error);
  }
  return undefined;
}

test('all four resources across all six public regions produce bounded public leases with private commitments', () => {
  const digests = new Set<string>();
  let ordinal = 0;
  for (const region of GREATER_REALM_PUBLIC_REGIONS) {
    for (const resourceKind of RESOURCES) {
      const digest = greaterRealmWorkerCapacityDigestV1({
        atlasId: 'GRA-PUBLIC-V17',
        atlasRevision: 17n,
        locationId: location(ordinal),
        cellKey: `GRC-${opaqueSuffix(ordinal)}`,
        regionId: region.id,
        componentKey: `GRCOMP-${opaqueSuffix(ordinal)}`,
        resourceKind,
        tier: 1,
        policyVersion: 'greater-realm-resource-v1',
        nodeCount: (ordinal % 32) + 1,
      });
      assert.match(digest, /^[0-9a-f]{64}$/);
      digests.add(digest);
      ordinal += 1;
    }
  }
  assert.equal(ordinal, 24);
  assert.equal(digests.size, 24);
});

test('private capacity commitment ignores unreviewed extra private properties', () => {
  const input = {
    atlasId: 'GRA-PUBLIC-V17',
    atlasRevision: 17n,
    locationId: location(1),
    cellKey: `GRC-${opaqueSuffix(1)}`,
    regionId: GREATER_REALM_PUBLIC_REGIONS[0]!.id,
    componentKey: `GRCOMP-${opaqueSuffix(1)}`,
    resourceKind: 'wood',
    tier: 1,
    policyVersion: 'greater-realm-resource-v1',
    nodeCount: 2,
  };
  const privateField = ['node', 'Id'].join('');
  const first = { ...input, [privateField]: 'PRIVATE-A' };
  const second = { ...input, [privateField]: 'PRIVATE-B' };
  assert.equal(
    greaterRealmWorkerCapacityDigestV1(first),
    greaterRealmWorkerCapacityDigestV1(second),
  );
});

test('dispatch-v2 fingerprint binds every authenticated/public command field', () => {
  const input = {
    fid: 42n,
    castleId: 7n,
    workerId: 'genesis-001-castle-7-worker-01',
    resourceKind: 'stone',
    locationId: location(7),
    expectedRevision: 17n,
  };
  const baseline = greaterRealmWorkerDispatchFingerprintV2(input);
  const variants = [
    { ...input, fid: 43n },
    { ...input, castleId: 8n, workerId: 'genesis-001-castle-8-worker-01' },
    { ...input, workerId: 'genesis-001-castle-7-worker-02' },
    { ...input, resourceKind: 'gold' },
    { ...input, locationId: location(8) },
    { ...input, expectedRevision: 18n },
  ];
  assert.match(baseline, /^[0-9a-f]{64}$/);
  for (const variant of variants) {
    assert.notEqual(greaterRealmWorkerDispatchFingerprintV2(variant), baseline);
  }
});

test('dispatch-v2 private receipt metadata round-trips and is strictly bounded', () => {
  const metadata = Object.freeze({
    expectedRevision: 17n,
    nodeCount: 32,
    capacityDigest: 'a'.repeat(64),
    fingerprint: 'b'.repeat(64),
  });
  const formatted = formatGreaterRealmWorkerDispatchReceiptKindV2(metadata);
  assert.equal(formatted, `dispatch-v2:17:32:${'a'.repeat(64)}:${'b'.repeat(64)}`);
  assert.deepEqual(parseGreaterRealmWorkerDispatchReceiptKindV2(formatted), metadata);
  for (const invalid of [
    `dispatch-v2:17:0:${'a'.repeat(64)}:${'b'.repeat(64)}`,
    `dispatch-v2:17:33:${'a'.repeat(64)}:${'b'.repeat(64)}`,
    `dispatch-v1:17:1:${'a'.repeat(64)}:${'b'.repeat(64)}`,
    `dispatch-v2:017:1:${'a'.repeat(64)}:${'b'.repeat(64)}`,
    `dispatch-v2:18446744073709551616:1:${'a'.repeat(64)}:${'b'.repeat(64)}`,
  ]) {
    assert.equal(
      code(() => parseGreaterRealmWorkerDispatchReceiptKindV2(invalid)),
      'GREATER_REALM_WORKER_RECEIPT_INVALID',
    );
  }
});

test('public capacity leases are exact, uppercase, and bounded to 32', () => {
  const locationId = location(11);
  assert.equal(workerNodeKey('food', `${locationId}:1`), `food:${locationId}:1`);
  assert.equal(workerNodeKey('gold', `${locationId}:32`), `gold:${locationId}:32`);
  for (const invalid of [
    `${locationId}:0`,
    `${locationId}:33`,
    `${locationId.toLowerCase()}:1`,
    `GRL-${'0'.repeat(26)}:1`,
    `${locationId}:01`,
  ]) {
    assert.throws(() => workerNodeKey('wood', invalid), /WORKER_SITE_ID_INVALID/);
  }
});

test('production worker authority never dereferences the private node identity', () => {
  const forbidden = ['.', 'node', 'Id'].join('');
  for (const path of [
    '../src/greaterRealmWorkerAuthority.ts',
    '../src/greaterRealmWorkerPolicy.ts',
    '../src/reducers/castleWorkers.ts',
  ]) {
    const source = readFileSync(resolve(import.meta.dirname, path), 'utf8');
    assert.equal(source.includes(forbidden), false, path);
  }
});

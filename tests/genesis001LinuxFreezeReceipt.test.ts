// @vitest-environment node
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  GENESIS_001_LINUX_FREEZE_CONFIRMATION_PROFILE, GENESIS_001_LINUX_FREEZE_CURRENT_STATE_PROFILE,
  createGenesis001LinuxFreezeConfirmationReceipt, createGenesis001LinuxFreezeCurrentStateReceipt,
  verifyGenesis001LinuxFreezeConfirmationReceipt, verifyGenesis001LinuxFreezeCurrentStateReceipt,
  projectGenesis001LinuxFreezeEvidence,
} from '../scripts/genesis001-linux-freeze-receipt.mjs';
import { createGenesis001LinuxPolicyReceipt } from '../scripts/genesis001-linux-policy-receipt.mjs';
import { GENESIS_001_DATABASE_IDENTITY, GENESIS_001_FREEZE_RELEASE_NONCE,
  GENESIS_001_SOURCE_BASELINE_COMMIT, GENESIS_001_LIVE_POLICY_OBSERVATION_PROFILE,
  genesis001PolicyReceiptDigest } from '../scripts/genesis001-sealed-launch-adoption.mjs';

const SOURCE = 'a'.repeat(40);
const sha = (body: string) => createHash('sha256').update(body).digest('hex');
const recordDigest = (value: unknown) => sha(`${JSON.stringify(value)}\n`);
function observation(observedAt: string, run = '1', sourceTree = 'b'.repeat(40)) {
  const policy = { realmId: 'GENESIS_001', releaseVersion: '0.3.43', playerAccessEnabled: true,
    admissionStateMutationsEnabled: false, accessRequestSubmissionsEnabled: false,
    sourceBaselineCommit: GENESIS_001_SOURCE_BASELINE_COMMIT, freezeReleaseNonce: GENESIS_001_FREEZE_RELEASE_NONCE };
  return createGenesis001LinuxPolicyReceipt({
    profile: 'warpkeep-g001-linux-policy-execution-v1', sourceCommit: SOURCE, sourceTree,
    operatorBlob: 'c'.repeat(40), operatorSha256: 'd'.repeat(64),
    runtime: { profile: 'warpkeep-g001-policy-observation-linux-x64-v1', nodeVersion: 'v22.22.3',
      nodeSha256: 'e6ec2c188d83d813f81f2de8aea084d74dce603ac1abedd0a30ad941b10087b2' },
    dependencyClosureSha256: 'e'.repeat(64),
    execution: { runId: run.repeat(32), bundleSha256: 'f'.repeat(64), sourceClosureSha256: '2'.repeat(64) },
    cleanup: { outcome: 'cleaned', runId: run.repeat(32), namespaceInventorySha256: '3'.repeat(64) },
    policyObservationReceipt: { schemaVersion: 1, profile: GENESIS_001_LIVE_POLICY_OBSERVATION_PROFILE,
      sourceCommit: SOURCE, observedAt, databaseIdentity: GENESIS_001_DATABASE_IDENTITY,
      procedure: 'genesis_001_access_policy_v1', mutationSubmitted: false, policy,
      policyReceiptDigest: genesis001PolicyReceiptDigest(policy) },
  }, SOURCE);
}
function confirmationBody() {
  const firstDigest = '1'.repeat(64), secondDigest = '2'.repeat(64);
  const secondObservedAt = '2026-09-19T00:01:00.000Z', expiresAt = '2026-09-19T00:06:00.000Z';
  const consumedAt = '2026-09-19T00:01:05.000Z';
  const confirmationDigest = sha(['warpkeep.sealed-realms.g001-census-confirmation.v1',
    SOURCE, firstDigest, secondDigest, expiresAt].join('\n'));
  const record = { schemaVersion: 1, profile: 'warpkeep-sealed-realms-g001-census-private-v1',
    sourceCommit: SOURCE, firstDigest, secondDigest };
  return { schemaVersion: 1, profile: GENESIS_001_LINUX_FREEZE_CONFIRMATION_PROFILE, sourceCommit: SOURCE,
    census: { firstDigest, secondDigest, confirmationDigest,
      confirmationRecordDigest: recordDigest({ ...record, secondObservedAt, expiresAt, confirmationDigest }),
      consumedRecordDigest: recordDigest({ ...record, confirmationDigest, consumedAt }),
      secondObservedAt, expiresAt, consumedAt },
    policyObservation: observation('2026-09-19T00:01:10.000Z') };
}
function evidence(currentAt = '2026-09-19T00:02:00.000Z', run = '4') {
  const confirmationReceipt = createGenesis001LinuxFreezeConfirmationReceipt(confirmationBody(), SOURCE);
  const currentStateReceipt = createGenesis001LinuxFreezeCurrentStateReceipt({ schemaVersion: 1,
    profile: GENESIS_001_LINUX_FREEZE_CURRENT_STATE_PROFILE, sourceCommit: SOURCE,
    confirmationReceiptDigest: confirmationReceipt.receiptDigest, policyObservation: observation(currentAt, run) }, SOURCE);
  return { preparationSourceCommit: SOURCE, confirmationReceipt, currentStateReceipt };
}

it('projects only linked server freeze evidence, preserving the live player-access policy', () => {
  const pair = evidence();
  const result = projectGenesis001LinuxFreezeEvidence(pair, '2026-09-19T00:02:30.000Z');
  expect(result).toEqual({ g001AdmissionControlProfile: 'warpkeep-genesis-001-server-freeze-v1',
    g001FreezeConfirmationReceiptDigest: pair.confirmationReceipt.receiptDigest,
    g001FreezeCurrentStateReceiptDigest: pair.currentStateReceipt.receiptDigest });
  const policy = pair.confirmationReceipt.policyObservation.policyObservationReceipt.policy;
  expect(policy.playerAccessEnabled).toBe(true);
  expect(policy.admissionStateMutationsEnabled).toBe(false);
  expect(policy.accessRequestSubmissionsEnabled).toBe(false);
  expect(JSON.stringify(result)).not.toMatch(/monitor|loaded|disabled|timer|playerCount/iu);
  expect(verifyGenesis001LinuxFreezeConfirmationReceipt(pair.confirmationReceipt, SOURCE)).toEqual(pair.confirmationReceipt);
  expect(verifyGenesis001LinuxFreezeCurrentStateReceipt(pair.currentStateReceipt, SOURCE)).toEqual(pair.currentStateReceipt);
});

it.each(['firstDigest', 'secondDigest', 'confirmationDigest', 'confirmationRecordDigest', 'consumedRecordDigest'] as const)(
  'rejects altered census binding %s even before creating a receipt', key => {
    const value = confirmationBody();
    value.census[key] = '0'.repeat(64);
    expect(() => createGenesis001LinuxFreezeConfirmationReceipt(value, SOURCE)).toThrow();
  });

it.each(['2026-09-19T00:01:04.999Z', '2026-09-19T00:06:00.000Z', '2026-09-19T00:07:00.000Z'])(
  'rejects a freeze confirmation outside the consumed census window: %s', observedAt => {
    const value = confirmationBody();
    value.policyObservation = observation(observedAt);
    expect(() => createGenesis001LinuxFreezeConfirmationReceipt(value, SOURCE)).toThrow();
  });

it.each(['playerAccessEnabled', 'admissionStateMutationsEnabled', 'accessRequestSubmissionsEnabled'] as const)(
  'rejects an unsafe server policy %s', key => {
    const value = structuredClone(confirmationBody());
    (value.policyObservation.policyObservationReceipt.policy as any)[key] = !value.policyObservation.policyObservationReceipt.policy[key];
    expect(() => createGenesis001LinuxFreezeConfirmationReceipt(value, SOURCE)).toThrow();
  });

it.each(['mutation', 'foreign-source', 'foreign-database', 'darwin', 'cleanup', 'monitor', 'digest'])(
  'rejects %s provenance or unsupported claims', damage => {
    const value: any = structuredClone(evidence().confirmationReceipt);
    if (damage === 'mutation') value.policyObservation.policyObservationReceipt.mutationSubmitted = true;
    if (damage === 'foreign-source') value.sourceCommit = '9'.repeat(40);
    if (damage === 'foreign-database') value.policyObservation.policyObservationReceipt.databaseIdentity = '9'.repeat(64);
    if (damage === 'darwin') value.policyObservation.runtime.profile = 'darwin-arm64';
    if (damage === 'cleanup') value.policyObservation.cleanup.outcome = 'pending';
    if (damage === 'monitor') value.admissionMonitorDisabled = true;
    if (damage === 'digest') value.receiptDigest = '9'.repeat(64);
    expect(() => verifyGenesis001LinuxFreezeConfirmationReceipt(value, SOURCE)).toThrow();
  });

it('rejects unrelated confirmation, replayed observation, backwards time and stale current state', () => {
  const pair: any = structuredClone(evidence());
  pair.currentStateReceipt = createGenesis001LinuxFreezeCurrentStateReceipt({ schemaVersion: 1,
    profile: GENESIS_001_LINUX_FREEZE_CURRENT_STATE_PROFILE, sourceCommit: SOURCE,
    confirmationReceiptDigest: '9'.repeat(64), policyObservation: observation('2026-09-19T00:02:00.000Z', '4') }, SOURCE);
  expect(() => projectGenesis001LinuxFreezeEvidence(pair, '2026-09-19T00:02:30.000Z')).toThrow();
  expect(() => projectGenesis001LinuxFreezeEvidence(evidence('2026-09-19T00:02:00.000Z', '1'), '2026-09-19T00:02:30.000Z')).toThrow();
  expect(() => projectGenesis001LinuxFreezeEvidence(evidence('2026-09-19T00:01:09.999Z'), '2026-09-19T00:02:30.000Z')).toThrow();
  expect(() => projectGenesis001LinuxFreezeEvidence(evidence(), '2026-09-19T00:01:59.999Z')).toThrow();
  expect(() => projectGenesis001LinuxFreezeEvidence(evidence(), '2026-09-19T00:07:00.001Z')).toThrow();
  expect(() => projectGenesis001LinuxFreezeEvidence(evidence('2026-09-19T00:11:10.001Z'), '2026-09-19T00:11:10.001Z')).toThrow();
});

it('rejects a later valid observation built from a different source closure', () => {
  const pair = evidence();
  const currentStateReceipt = createGenesis001LinuxFreezeCurrentStateReceipt({ schemaVersion: 1,
    profile: GENESIS_001_LINUX_FREEZE_CURRENT_STATE_PROFILE, sourceCommit: SOURCE,
    confirmationReceiptDigest: pair.confirmationReceipt.receiptDigest,
    policyObservation: observation('2026-09-19T00:02:00.000Z', '4', '9'.repeat(40)) }, SOURCE);
  expect(() => projectGenesis001LinuxFreezeEvidence({ ...pair, currentStateReceipt }, '2026-09-19T00:02:30.000Z')).toThrow();
});

it('takes immutable snapshots and rejects executable inputs without invoking their code', () => {
  const value = confirmationBody();
  const retained = createGenesis001LinuxFreezeConfirmationReceipt(value, SOURCE);
  value.census.firstDigest = '9'.repeat(64);
  expect(retained.census.firstDigest).toBe('1'.repeat(64));
  expect(Object.isFrozen(retained.census)).toBe(true);
  let called = false;
  const getter = Object.defineProperty(confirmationBody(), 'census', { enumerable: true,
    get() { called = true; throw Error('unexpected'); } });
  expect(() => createGenesis001LinuxFreezeConfirmationReceipt(getter, SOURCE)).toThrow();
  expect(() => createGenesis001LinuxFreezeConfirmationReceipt(new Proxy(confirmationBody(), {
    ownKeys() { called = true; throw Error('unexpected'); },
  }), SOURCE)).toThrow();
  expect(called).toBe(false);
});

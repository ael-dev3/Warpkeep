// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { collectGenesis001AdmittedPlayerCensus } from '../scripts/genesis001-admitted-player-census.mjs';
import { createGenesis001LinuxCensusSample, validateGenesis001LinuxCensusPair, createGenesis001LinuxCensusAttempt,
  verifyGenesis001LinuxCensusAttempt, retainGenesis001LinuxCensusRecord,
  verifyGenesis001LinuxCensusRetainedSamples } from '../scripts/genesis001-linux-census-attempt.mjs';
import { GENESIS_001_DATABASE_IDENTITY, GENESIS_001_FREEZE_RELEASE_NONCE, GENESIS_001_SOURCE_BASELINE_COMMIT,
  genesis001CensusOpaqueProofDigest, genesis001PolicyReceiptDigest } from '../scripts/genesis001-sealed-launch-adoption.mjs';
import { linuxG001PolicyExecution } from './fixtures/linuxG001PolicyReceipt';

const SOURCE = 'a'.repeat(40), ROOT = process.cwd(), START = Date.parse('2026-09-19T00:00:00.000Z');
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const stamp = (ms: number) => new Date(START + ms).toISOString();
function observation(ms: number) {
  const policy = { realmId: 'GENESIS_001', releaseVersion: '0.3.43', playerAccessEnabled: true,
    admissionStateMutationsEnabled: false, accessRequestSubmissionsEnabled: false,
    sourceBaselineCommit: GENESIS_001_SOURCE_BASELINE_COMMIT, freezeReleaseNonce: GENESIS_001_FREEZE_RELEASE_NONCE };
  return { schemaVersion: 1, profile: 'warpkeep-genesis-001-live-policy-observation-v1', sourceCommit: SOURCE,
    observedAt: stamp(ms), databaseIdentity: GENESIS_001_DATABASE_IDENTITY, procedure: 'genesis_001_access_policy_v1',
    mutationSubmitted: false, policy, policyReceiptDigest: genesis001PolicyReceiptDigest(policy) };
}
async function sample(ms: number, nonce: number, fid = '17') {
  const admitted = await collectGenesis001AdmittedPlayerCensus({ preparationSourceCommit: SOURCE, observedAt: stamp(ms),
    readAggregates: () => ({ allowedFids: '1', enabledAllowedFids: '1' }),
    queryPreferred: () => ({ outcome: 'exact-query-supported', output: Buffer.from(`fid\tenabled\tauth_epoch\n${fid}\ttrue\t1\n`) }),
    randomBytes: () => Buffer.alloc(32, nonce + 1) });
  const proof = { schemaVersion: 1, profile: 'warpkeep-genesis-001-census-export-private-proof-v1',
    realmId: 'GENESIS_001', releaseVersion: '0.3.43', sourceCommit: SOURCE,
    privateCensusReference: { count: 0, size: 7, sha256: sha('private'),
      pathBasename: `warpkeep-access-request-census-${stamp(ms).replace(/[-:]/gu, '').replace(/\.000/gu, '')}.txt` },
    privateBlindingNonceHex: Buffer.alloc(32, nonce).toString('hex') };
  return createGenesis001LinuxCensusSample({ applicant: { ...proof, opaqueProofDigest: genesis001CensusOpaqueProofDigest(proof) }, admitted }, SOURCE);
}
async function collected() {
  return { schemaVersion: 1, profile: 'warpkeep-g001-linux-census-collected-v1', sourceCommit: SOURCE,
    repositoryRoot: ROOT, attemptId: '1'.repeat(32), githubRunId: '1234', githubRunAttempt: '1', callerIdentity: '8'.repeat(64),
    mutationSubmitted: false, initialPolicyObservation: observation(0), first: await sample(1000, 1), second: await sample(61000, 3),
    consumedAt: stamp(62000), confirmationPolicyObservation: observation(63000), currentPolicyObservation: observation(63001) };
}
it('derives one immutable complete attempt from real-shaped private proofs and one truthful native execution', async () => {
  const input = await collected();
  const complete = createGenesis001LinuxCensusAttempt(input, linuxG001PolicyExecution(observation(0)), stamp(64000));
  expect(verifyGenesis001LinuxCensusAttempt(complete)).toEqual(complete);
  expect(Object.isFrozen(complete.confirmation.record)).toBe(true);
  expect(Object.isFrozen(complete.consumed.record)).toBe(true);
  expect(complete.freezeConfirmationReceipt.policyObservation.execution.runId).toBe(complete.freezeCurrentStateReceipt.policyObservation.execution.runId);
  expect(complete.first.record.applicant.privateCensusReference).toEqual(input.first.applicant.privateCensusReference);
  expect(JSON.stringify(complete)).not.toMatch(/monitor|launchctl|suspended|disabled/iu);
});
it.each([59000, 301000])('does not accept an out-of-window second observation at %sms', async ms => {
  const first = await sample(0, 1), second = await sample(ms, 3);
  expect(() => validateGenesis001LinuxCensusPair(first, second, SOURCE)).toThrow();
});
it('rejects changing admitted sets, applicant reports and reused independent proof nonces', async () => {
  const input = await collected();
  const changed = await sample(61000, 3, '18');
  expect(() => validateGenesis001LinuxCensusPair(input.first, changed, SOURCE)).toThrow();
  const proof: any = structuredClone(input.second.applicant);
  proof.privateCensusReference.sha256 = '9'.repeat(64); proof.opaqueProofDigest = genesis001CensusOpaqueProofDigest(proof);
  const altered = createGenesis001LinuxCensusSample({ applicant: proof, admitted: input.second.admitted }, SOURCE);
  expect(() => validateGenesis001LinuxCensusPair(input.first, altered, SOURCE)).toThrow();
  const reused = await sample(61000, 1);
  expect(() => validateGenesis001LinuxCensusPair(input.first, reused, SOURCE)).toThrow();
});
it.each(['source', 'workflow', 'record', 'policy', 'digest', 'run'] as const)('rejects altered complete %s binding', async damage => {
  const value: any = structuredClone(createGenesis001LinuxCensusAttempt(await collected(), linuxG001PolicyExecution(observation(0)), stamp(64000)));
  if (damage === 'source') value.sourceCommit = '9'.repeat(40);
  if (damage === 'workflow') value.githubRunId = '999';
  if (damage === 'record') value.first.record.admitted.entries[0].fid = '99';
  if (damage === 'policy') value.freezeCurrentStateReceipt.policyObservation.policyObservationReceipt.policy.playerAccessEnabled = false;
  if (damage === 'digest') value.receiptDigest = '9'.repeat(64);
  if (damage === 'run') value.attemptId = '9'.repeat(32);
  expect(() => verifyGenesis001LinuxCensusAttempt(value)).toThrow();
});
it('rejects expired consumption, unobserved current state and backwards/equal policy timestamps', async () => {
  const input = await collected(), execution = linuxG001PolicyExecution(observation(0));
  expect(() => createGenesis001LinuxCensusAttempt({ ...input, consumedAt: stamp(361000) }, execution, stamp(362000))).toThrow();
  expect(() => createGenesis001LinuxCensusAttempt({ ...input, currentPolicyObservation: observation(63000) }, execution, stamp(64000))).toThrow();
  expect(() => createGenesis001LinuxCensusAttempt(input, execution, stamp(63000))).toThrow();
});
it.runIf(process.platform === 'linux')('retains evidence without overwriting and reopens exact report/reference/proof bytes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-census-attempt-'));
  try {
    const input = await collected();
    for (const kind of ['first', 'second'] as const) {
      const value = input[kind], privateRoot = join(root, kind), reference = value.applicant.privateCensusReference;
      mkdirSync(privateRoot, { mode: 0o700 });
      writeFileSync(join(privateRoot, reference.pathBasename), 'private', { mode: 0o600 });
      writeFileSync(join(privateRoot, reference.pathBasename.replace('census-', 'census-export-reference-').replace('.txt', '.json')),
        `${JSON.stringify(reference)}\n`, { mode: 0o600 });
      writeFileSync(join(privateRoot, `genesis-001-census-privacy-safe-${value.applicant.opaqueProofDigest}.json`),
        `${JSON.stringify(value.applicant, null, 2)}\n`, { mode: 0o600 });
      retainGenesis001LinuxCensusRecord(root, `${kind}.json`, value);
    }
    verifyGenesis001LinuxCensusRetainedSamples(root, input.first, input.second, SOURCE);
    const before = readFileSync(join(root, 'first.json'));
    expect(() => retainGenesis001LinuxCensusRecord(root, 'first.json', {})).toThrow();
    expect(readFileSync(join(root, 'first.json'))).toEqual(before);
    writeFileSync(join(root, 'second', input.second.applicant.privateCensusReference.pathBasename), 'altered', { mode: 0o600 });
    expect(() => verifyGenesis001LinuxCensusRetainedSamples(root, input.first, input.second, SOURCE)).toThrow();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

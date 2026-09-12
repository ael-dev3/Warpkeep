// @vitest-environment node
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sealedRealmsPrivateBase } from './helpers/sealedRealmsPrivateRoots';
import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_PROFILE,
  AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT,
  authBridgeNotificationPreparedVersionContract,
} from '../scripts/auth-bridge-notification-prepared-deploy-adapter.mjs';
import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_RECOVERY_AUTHORITY_LIMIT,
  orderAuthBridgeNotificationPreparedRecoveryAuthorityHistory,
  resolveAuthBridgeNotificationPreparedOriginalUploadAuthority,
  resolveAuthBridgeNotificationPreparedRecoveryJournalAuthority,
  resolveExistingAuthBridgeNotificationPreparedDeployJournal,
  withAuthBridgeNotificationPreparedDeployJournal,
  writeAuthBridgeNotificationPreparedReadOnlyRecoveryHead,
} from '../scripts/auth-bridge-notification-prepared-deploy-journal.mjs';
import {
  AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
  canonicalAuthBridgeNotificationPreparedReceiptPublication,
  canonicalAuthBridgeReleaseAttestationDigest,
  createAuthBridgeNotificationPreparedReadOnlyRecoveryReceipt,
  resolveExistingAuthBridgeNotificationPreparedReceipt,
  writePrivateAuthBridgeNotificationPreparedReceipt,
} from '../scripts/auth-bridge-notification-prepared-receipt.mjs';
import {
  authBridgeNotificationPreparedDeployTestSeams as seams,
  createAuthBridgeNotificationPreparedRecoveryTestCapability,
} from '../scripts/auth-bridge-notification-prepared-deploy.mjs';
import { createSealedRealmsProductionPrivateState } from '../scripts/sealed-realms-production-private-state.mjs';
import { authenticateSealedRealmsProductionSourceAuthority } from '../scripts/sealed-realms-production-source-authority.mjs';
import {
  createSealedRealmsProductionAuthBridgeState,
  createSealedRealmsProductionAuthBridgeStateTestCapability,
} from '../scripts/sealed-realms-production-auth-bridge-state.mjs';

const SOURCE = 'c'.repeat(40);
const VERSION = '123e4567-e89b-42d3-a456-426614174000';
const DEPLOYMENT = '323e4567-e89b-42d3-a456-426614174000';
const PTR = '9'.repeat(64);
const PROFILE = 'warpkeep-sealed-realms-auth-bridge-import-authority-v1';
const RECOVERY = 'warpkeep-auth-bridge-notification-prepared-read-only-recovery-v1';
const ORIGINAL = 'warpkeep-auth-bridge-notification-prepared-deploy-journal-v3';
const START = new Date('2026-08-13T00:00:00.000Z');
const homes: string[] = [];
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const line = (value: unknown) => Buffer.from(`${JSON.stringify(value)}\n`);
const recordDigest = (value: unknown) => sha(Buffer.concat([
  Buffer.from('warpkeep.sealed-realms.auth-bridge-import-authority-record.v1\n'), line(value),
]));
const chainName = (value: Record<string, unknown>) => `auth-bridge-import-authority-${sha(JSON.stringify([
  PROFILE, value.sourceCommit, value.preparedReceiptDigest, value.completedJournalHeadDigest,
  value.deploymentId, value.workerVersionId, value.ptrBindingDigest,
]))}.jsonl`;
function authorityHead(prior: Record<string, unknown>, next: Record<string, unknown>) {
  return {
    schemaVersion: 1, profile: next.completedJournalProfile, sourceCommit: next.sourceCommit,
    runId: next.runId, runAttempt: next.runAttempt,
    priorPreparedReceiptDigest: prior.preparedReceiptDigest,
    priorCompletedJournalHeadDigest: prior.completedJournalHeadDigest,
    preparedReceiptDigest: next.preparedReceiptDigest,
    deploymentId: next.deploymentId, workerVersionId: next.workerVersionId,
    bridgeSourceCommit: next.bridgeSourceCommit, ptrDatabaseIdentity: next.ptrDatabaseIdentity,
    ptrBindingDigest: next.ptrBindingDigest, controlPlaneAttestationDigest: next.controlPlaneAttestationDigest,
    publicAttestationDigest: next.publicAttestationDigest, privateAttestationDigest: next.privateAttestationDigest,
    ptrBindingAttestationDigest: next.ptrBindingAttestationDigest,
    completedAt: next.completedAt, noDeploy: true, outcome: next.completedJournalOutcome,
  };
}
const live = {
  schemaVersion: 1, profile: 'warpkeep-admission-notification-bridge-v1',
  bridgeSourceCommit: SOURCE, notificationDeliveryEnabled: false,
  notificationTransportConfigured: true, admissionNotificationStoreConfigured: true,
  notificationClientCount: 1,
  notificationDeliveryContractDigest: AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
  publicAuthEnabled: true, accessExpectedFidRequired: false,
} as const;
const expired = {
  schemaVersion: 1, kind: 'warpkeep-auth-bridge-notification-prepared-v1',
  bridgeOrigin: 'https://auth.warpkeep.com', bridgeSourceCommit: SOURCE,
  notificationDeliveryContractDigest: AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
  notificationClientCount: 1, notificationDeliveryEnabled: false,
  notificationTransportConfigured: true, admissionNotificationStoreConfigured: true,
  publicAuthEnabledBefore: true, publicAuthEnabledAfter: true,
  accessExpectedFidRequiredBefore: false, accessExpectedFidRequiredAfter: false,
  hermesExecutionApproved: false, pagesPresentationEnabled: false,
  liveAttestationDigest: canonicalAuthBridgeReleaseAttestationDigest(live),
  preparedAt: '2026-08-11T00:00:00.000Z', expiresAt: '2026-08-12T00:00:00.000Z',
} as const;

function completedRootBytes(authority: Record<string, unknown>, complete = false) {
  const probe = Buffer.from(JSON.stringify({ error: {
    code: 'admission_requests_suspended', message: 'New admission requests are temporarily suspended.',
  } }));
  const gate = {
    schemaVersion: 1, profile: PROFILE, recordType: 'g002Gate', sourceCommit: SOURCE,
    previousRecordDigest: recordDigest(authority), deploymentAuthorityDigest: recordDigest(authority),
    lane: 'g002', supersedesGateDigest: null, confirmationDigest: '1'.repeat(64),
    deploymentId: DEPLOYMENT, workerVersionId: VERSION, bridgeSourceCommit: SOURCE,
    ptrDatabaseIdentity: PTR, ptrBindingDigest: '3'.repeat(64),
    deploymentAttestationDigest: '2'.repeat(64), bindingAttestationDigest: '3'.repeat(64),
    postNoRedirect: true, postContentType: 'application/json; charset=utf-8',
    postAccessControlAllowOrigin: 'https://warpkeep.com', postProbeStatus: 503,
    postProbeBodyBase64: probe.toString('base64'), postProbeDigest: sha(probe),
    optionsNoRedirect: true, optionsContentType: 'application/json; charset=utf-8',
    optionsAccessControlAllowOrigin: 'https://warpkeep.com', optionsProbeStatus: 503,
    optionsProbeBodyBase64: probe.toString('base64'), optionsProbeDigest: sha(probe),
    observedAt: authority.preparedAt, nonce: '4'.repeat(64),
  };
  const cross = {
    schemaVersion: 1, profile: PROFILE, recordType: 'g002ImportAuthorityCrossLink', sourceCommit: SOURCE,
    previousRecordDigest: recordDigest(gate), deploymentAuthorityDigest: recordDigest(authority),
    lane: 'g002', consumedGateDigest: recordDigest(gate), realmImportReceiptDigest: '5'.repeat(64),
    outcome: 'applied', linkedAt: authority.preparedAt,
  };
  if (!complete) return Buffer.concat([line(authority), line(gate), line(cross)]);
  const ptrGate = { ...gate, recordType: 'ptrGate', previousRecordDigest: recordDigest(cross), lane: 'ptr' };
  const ptrCross = { ...cross, recordType: 'ptrImportAuthorityCrossLink',
    previousRecordDigest: recordDigest(ptrGate), lane: 'ptr', consumedGateDigest: recordDigest(ptrGate) };
  return Buffer.concat([line(authority), line(gate), line(cross), line(ptrGate), line(ptrCross)]);
}

async function fixture(nativeJournal = false) {
  const home = mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-recovery-history-'));
  homes.push(home);
  chmodSync(home, 0o700);
  for (const part of ['audit/private', 'runtime', 'cache']) {
    const path = join(sealedRealmsPrivateBase(home), part);
    mkdirSync(path, { recursive: true, mode: 0o700 }); chmodSync(path, 0o700);
  }
  const state = createSealedRealmsProductionPrivateState({
    reportedHome: home, testOnlyOwnerUid: statSync(home).uid,
    testOnlyFsync: () => {}, testOnlyAllowPlatformMode: true,
  });
  const input = { repositoryRoot: realpathSync(process.cwd()), reportedHome: home };
  let time = new Date(START);
  let receipt = createAuthBridgeNotificationPreparedReadOnlyRecoveryReceipt({
    priorReceipt: expired, liveAttestation: live, preparedAt: time, now: time,
    lifetimeMilliseconds: 60 * 60 * 1_000,
  });
  let journal: Record<string, unknown> = {
    journalHeadDigest: 'a'.repeat(64), profile: ORIGINAL, outcome: 'verified',
    predecessorDigest: 'b'.repeat(64), runId: '1001', runAttempt: 1,
    completedAt: time.toISOString(), sourceCommit: SOURCE, workerVersionId: VERSION,
  };
  if (nativeJournal) {
    const contract = authBridgeNotificationPreparedVersionContract({
      accountId: 'a'.repeat(32), zoneId: 'b'.repeat(32), sourceCommit: SOURCE,
      sourceDigest: 'd'.repeat(64), beforeModes: {
        bridgeSourceCommit: AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT,
        publicAuthEnabled: true, accessExpectedFidRequired: false,
      },
    });
    await withAuthBridgeNotificationPreparedDeployJournal({
      ...input, contract, runId: '1001', runAttempt: 1, clock: () => time,
      processIdentity: 'test-recovery-history-process',
      operation: async deployment => {
        await deployment.prepared(contract);
        await deployment.remoteReconcileStarted({
          predecessorDeploymentId: DEPLOYMENT,
          predecessorVersionId: '987e6543-e21b-42d3-a456-426614174000',
          sourceCommit: SOURCE, sourceDigest: contract.sourceDigest as string,
          versionTag: contract.versionTag as string,
        });
        await deployment.uploadInvoked({ sourceCommit: SOURCE, sourceDigest: contract.sourceDigest,
          uploadMode: 'version', versionTag: contract.versionTag });
        await deployment.uploaded({ ...contract, versionId: VERSION, createdAt: time.toISOString() });
        await deployment.completed({
          schemaVersion: 1, profile: AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_PROFILE,
          accountId: 'a'.repeat(32), zoneId: 'b'.repeat(32), workerName: 'warpkeep-auth-bridge',
          route: { pattern: 'auth.warpkeep.com', customDomain: true },
          versionId: VERSION, versionTag: contract.versionTag, sourceCommit: SOURCE,
          trafficPercentage: 100, observedAt: time.toISOString(),
        });
      },
    });
    journal = resolveAuthBridgeNotificationPreparedRecoveryJournalAuthority(input);
    writePrivateAuthBridgeNotificationPreparedReceipt({ ...input, receipt, now: time });
  }
  const publication = canonicalAuthBridgeNotificationPreparedReceiptPublication(receipt);
  const root = {
    schemaVersion: 1, profile: PROFILE, recordType: 'deploymentAuthority', sourceCommit: SOURCE,
    previousRecordDigest: null, preparedReceiptBodyBase64: publication.receiptBytesBase64,
    preparedReceiptDigest: publication.receiptDigest, preparedAt: receipt.preparedAt, expiresAt: receipt.expiresAt,
    completedJournalHeadDigest: journal.journalHeadDigest, completedJournalProfile: journal.profile,
    completedJournalOutcome: journal.outcome, completedJournalPredecessorDigest: journal.predecessorDigest,
    runId: journal.runId, runAttempt: journal.runAttempt, completedAt: journal.completedAt,
    deploymentId: DEPLOYMENT, workerVersionId: VERSION, bridgeSourceCommit: SOURCE,
    ptrDatabaseIdentity: PTR, ptrBindingDigest: '3'.repeat(64),
    controlPlaneAttestationDigest: '4'.repeat(64), publicAttestationDigest: expired.liveAttestationDigest,
    privateAttestationDigest: '6'.repeat(64), ptrBindingAttestationDigest: '7'.repeat(64),
    recordedAt: time.toISOString(),
  };
  state.write({ root: 'runtime', relativePath: `bridge/${chainName(root)}`, bytes: completedRootBytes(root) });
  const sourceAuthority = authenticateSealedRealmsProductionSourceAuthority({
    operation: 'g002-import-inspect', workflowInputSha: SOURCE,
    readGit: args => { if (args[0] === 'rev-parse') return `${SOURCE}\n`; throw new Error('unexpected git call'); },
    readBinding: () => ({ schemaVersion: 1, profile: 'warpkeep-0.4.0-sealed-launch-v1',
      pagesDeploymentApproved: false, preparationSourceCommit: null }),
    verifyEvidence: verifiedSha => ({ verifiedSha }),
  });
  const resolveJournal = () => nativeJournal
    ? resolveAuthBridgeNotificationPreparedRecoveryJournalAuthority(input) : journal;
  const prior = () => seams.resolveRecoveryPriorAuthority({
    privateState: state, sourceCommit: SOURCE, journal: resolveJournal(), now: time,
  } as never);
  const bridge = () => createSealedRealmsProductionAuthBridgeState({
    authority: sourceAuthority, privateState: state, repositoryRoot: input.repositoryRoot,
    reportedHome: home, now: () => time,
    deploymentAttester: () => ({ deploymentId: DEPLOYMENT, workerVersionId: VERSION,
      bridgeSourceCommit: SOURCE, controlPlaneAttestationDigest: root.controlPlaneAttestationDigest,
      publicAttestationDigest: root.publicAttestationDigest, privateAttestationDigest: root.privateAttestationDigest,
      observedAt: time.toISOString() }),
    bindingAttester: () => ({ ptrDatabaseIdentity: PTR, ptrBindingDigest: root.ptrBindingDigest,
      ptrBindingAttestationDigest: root.ptrBindingAttestationDigest, observedAt: time.toISOString() }),
    fetchImpl: async () => { throw new Error('no provider request belongs to history validation'); },
    inspectImportReceipt: () => { throw new Error('no import during establishment'); },
    authenticateImportResult: () => { throw new Error('no import during establishment'); },
    resolveOwnerProvisionReceipt: () => { throw new Error('no owner write during establishment'); },
    testOnlyCapability: createSealedRealmsProductionAuthBridgeStateTestCapability(),
    testOnlyResolvePreparedReceipt: () => nativeJournal
      ? resolveExistingAuthBridgeNotificationPreparedReceipt({ ...input, expectedSourceCommit: SOURCE, now: time })
      : { receipt, receiptDigest: canonicalAuthBridgeNotificationPreparedReceiptPublication(receipt).receiptDigest },
    testOnlyResolveCompletedJournal: () => nativeJournal
      ? resolveExistingAuthBridgeNotificationPreparedDeployJournal(input)
      : Object.fromEntries(['journalHeadDigest', 'profile', 'outcome', 'predecessorDigest',
        'runId', 'runAttempt', 'completedAt', 'sourceCommit', 'workerVersionId'].map(key => [key, journal[key]])),
  } as never);
  const snapshot = () => new Map(state.list({ root: 'runtime', relativeDirectory: 'bridge' })
    .filter(name => name.endsWith('.jsonl')).sort().map(name => [name,
      state.read({ root: 'runtime', relativePath: `bridge/${name}` }),
    ]));
  let run = 1002;
  const begin = () => {
    time = new Date(Date.parse(receipt.expiresAt) + 1_000);
    const priorAuthority = prior();
    receipt = createAuthBridgeNotificationPreparedReadOnlyRecoveryReceipt({
      priorReceipt: receipt, liveAttestation: live, preparedAt: time, now: time,
      lifetimeMilliseconds: 60 * 60 * 1_000,
    });
    const publication = canonicalAuthBridgeNotificationPreparedReceiptPublication(receipt);
    if (nativeJournal) writePrivateAuthBridgeNotificationPreparedReceipt({ ...input, receipt, now: time });
    const head = {
      schemaVersion: 1, profile: RECOVERY, sourceCommit: SOURCE, runId: String(run++), runAttempt: 1,
      priorPreparedReceiptDigest: priorAuthority.value.preparedReceiptDigest,
      priorCompletedJournalHeadDigest: priorAuthority.value.completedJournalHeadDigest,
      preparedReceiptDigest: publication.receiptDigest, deploymentId: DEPLOYMENT, workerVersionId: VERSION,
      bridgeSourceCommit: SOURCE, ptrDatabaseIdentity: PTR, ptrBindingDigest: root.ptrBindingDigest,
      controlPlaneAttestationDigest: root.controlPlaneAttestationDigest,
      publicAttestationDigest: root.publicAttestationDigest, privateAttestationDigest: root.privateAttestationDigest,
      ptrBindingAttestationDigest: root.ptrBindingAttestationDigest, completedAt: time.toISOString(),
      noDeploy: true, outcome: 'verified-read-only-recovery',
    } as const;
    const publishHead = () => {
      if (nativeJournal) writeAuthBridgeNotificationPreparedReadOnlyRecoveryHead({
        ...input, head, processIdentity: 'test-recovery-history-process',
      });
      journal = { ...head, journalHeadDigest: sha(line(head)), predecessorDigest: head.priorCompletedJournalHeadDigest };
    };
    const writeInput = {
      testOnlyCapability: createAuthBridgeNotificationPreparedRecoveryTestCapability(),
      privateState: state, sourceCommit: SOURCE, priorAuthority,
      receiptPublication: { receipt, ...publication },
      journal: { ...head, journalHeadDigest: sha(line(head)), predecessorDigest: head.priorCompletedJournalHeadDigest },
      inspection: { ...root }, recordedAt: time,
    };
    const publishAuthority = (privateState: unknown = state) => seams.createRecoveryAuthorityChain({
      ...writeInput, privateState,
    } as never);
    return { publishHead, publishAuthority, writeInput, head };
  };
  const renew = () => { const next = begin(); next.publishHead(); next.publishAuthority(); return next; };
  return { home, state, root, input, bridge, snapshot, prior, begin, renew,
    expire: () => { time = new Date(Date.parse(receipt.expiresAt) + 1_000); },
    journal: resolveJournal };
}

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

describe('retained prepared recovery history', () => {
  it('preserves grandparents through repeated renewal and a recreated lifecycle reader', async () => {
    const local = await fixture();
    const root = local.snapshot();
    for (let index = 0; index < 3; index += 1) {
      const before = local.snapshot();
      const renewal = local.renew();
      await expect(local.bridge().establish()).resolves.toEqual({ ready: true });
      await expect(local.bridge().inspect()).resolves.toEqual({ g002Sealed: false, ptrSealed: false, complete: false });
      expect(renewal.publishAuthority().result).toBe('unchanged');
      const after = local.snapshot();
      expect(after.size).toBe(before.size + 1);
      for (const [name, bytes] of before) expect(after.get(name)).toEqual(bytes);
    }
    for (const [name, bytes] of root) expect(local.snapshot().get(name)).toEqual(bytes);
  });

  it.skipIf(process.platform === 'win32')('uses real immutable receipt and journal producers across two renewals and reentry', async () => {
    const local = await fixture(true);
    const original = resolveAuthBridgeNotificationPreparedOriginalUploadAuthority(local.input);
    local.renew();
    const preserved = local.snapshot();
    const second = local.begin();
    second.publishHead();
    expect(local.prior()).toMatchObject({ pendingRecoveryHead: { journalHeadDigest: sha(line(second.head)) } });
    await expect(local.bridge().establish()).rejects.toMatchObject({ code: 'SEALED_REALMS_AUTH_BRIDGE_RECOVERY_CHAIN_MISSING' });
    second.publishHead();
    second.publishAuthority();
    await expect(local.bridge().establish()).resolves.toEqual({ ready: true });
    await expect(local.bridge().inspect()).resolves.toEqual({ g002Sealed: false, ptrSealed: false, complete: false });
    expect(resolveAuthBridgeNotificationPreparedOriginalUploadAuthority(local.input)).toEqual({
      ...original, journalHeadDigest: sha(line(second.head)),
    });
    for (const [name, bytes] of preserved) expect(local.snapshot().get(name)).toEqual(bytes);
    expect(second.publishAuthority().result).toBe('unchanged');
  });

  it.each(['ptr', 'complete'] as const)('retains a recovered %s ancestor with its entire import history', async phase => {
    const local = await fixture(); local.renew();
    const entry = [...local.snapshot()].find(([, bytes]) => bytes.toString().trimEnd().split('\n').length === 1)!;
    const authority = JSON.parse(entry[1].toString()) as Record<string, unknown>;
    const expanded = completedRootBytes(authority, phase === 'complete');
    local.state.append({ root: 'runtime', relativePath: `bridge/${entry[0]}`,
      bytes: expanded.subarray(entry[1].length) });
    const before = local.snapshot();
    local.renew();
    await expect(local.bridge().establish()).resolves.toEqual({ ready: true });
    for (const [name, bytes] of before) expect(local.snapshot().get(name)).toEqual(bytes);
  });

  it('does not renew a predecessor with an unfinished import gate', async () => {
    const local = await fixture(); local.renew();
    const entry = [...local.snapshot()].find(([, bytes]) => bytes.toString().trimEnd().split('\n').length === 1)!;
    const expanded = completedRootBytes(JSON.parse(entry[1].toString()));
    const gate = expanded.toString().split('\n')[1];
    local.state.append({ root: 'runtime', relativePath: `bridge/${entry[0]}`, bytes: Buffer.from(`${gate}\n`) });
    const before = local.snapshot();
    expect(() => local.begin()).toThrow('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_INVALID');
    expect(local.snapshot()).toEqual(before);
  });

  it.each(['before head', 'after head', 'after authority'] as const)(
    'resumes a second renewal interrupted %s without deleting or rewriting ancestors', async phase => {
      const local = await fixture(); local.renew();
      const before = local.snapshot();
      const next = local.begin();
      if (phase !== 'before head') next.publishHead();
      if (phase === 'after authority') {
        expect(() => next.publishAuthority({ ...local.state, write: (input: Parameters<typeof local.state.write>[0]) => {
          local.state.write(input); throw new Error('simulated crash after fsync');
        } })).toThrow('simulated crash after fsync');
      }
      next.publishHead();
      expect(next.publishAuthority().result).toBe(phase === 'after authority' ? 'unchanged' : 'installed');
      await expect(local.bridge().establish()).resolves.toEqual({ ready: true });
      for (const [name, bytes] of before) expect(local.snapshot().get(name)).toEqual(bytes);
    },
  );

  it.each(['forged root', 'forged recovered ancestor', 'missing root', 'missing middle', 'fork', 'foreign chain', 'foreign file'] as const)(
    'rejects %s throughout both readers before a further renewal', async attack => {
      const local = await fixture(); local.renew(); local.renew();
      const candidate = local.begin(); candidate.publishHead();
      const originals = [...local.snapshot()];
      const byHead = originals.map(([name, bytes]) => ({ name, bytes,
        value: JSON.parse(bytes.toString().split('\n')[0]) as Record<string, unknown> }));
      const order = orderAuthBridgeNotificationPreparedRecoveryAuthorityHistory(byHead.map(entry => entry.value));
      const target = byHead.find(entry => entry.value === order[attack === 'missing middle' || attack === 'forged recovered ancestor' ? 1 : 0])!;
      if (attack.startsWith('missing')) local.state.remove({ root: 'runtime', relativePath: `bridge/${target.name}` });
      else if (attack === 'foreign file') local.state.write({ root: 'runtime', relativePath: 'bridge/foreign.json', bytes: line({ foreign: true }) });
      else if (attack === 'fork') {
        const child = byHead.find(entry => entry.value === order[1])!;
        const fork: Record<string, unknown> = { ...child.value, runId: '9999' };
        fork.completedJournalHeadDigest = sha(line(authorityHead(order[0], fork)));
        local.state.write({ root: 'runtime', relativePath: `bridge/${chainName(fork)}`, bytes: line(fork) });
      } else if (attack === 'foreign chain') {
        const foreignReceipt = JSON.parse(Buffer.from(order[1].preparedReceiptBodyBase64 as string, 'base64').toString());
        foreignReceipt.bridgeSourceCommit = 'd'.repeat(40);
        const publication = canonicalAuthBridgeNotificationPreparedReceiptPublication(foreignReceipt);
        const foreign = { ...order[1], sourceCommit: foreignReceipt.bridgeSourceCommit,
          bridgeSourceCommit: foreignReceipt.bridgeSourceCommit, preparedReceiptBodyBase64: publication.receiptBytesBase64,
          preparedReceiptDigest: publication.receiptDigest };
        local.state.write({ root: 'runtime', relativePath: `bridge/${chainName(foreign)}`, bytes: line(foreign) });
      } else if (attack === 'forged root') {
        const receipt = JSON.parse(Buffer.from(target.value.preparedReceiptBodyBase64 as string, 'base64').toString());
        receipt.liveAttestationDigest = 'f'.repeat(64);
        const publication = canonicalAuthBridgeNotificationPreparedReceiptPublication(receipt);
        const forged = { ...target.value, preparedReceiptBodyBase64: publication.receiptBytesBase64,
          preparedReceiptDigest: publication.receiptDigest };
        local.state.remove({ root: 'runtime', relativePath: `bridge/${target.name}` });
        local.state.write({ root: 'runtime', relativePath: `bridge/${chainName(forged)}`, bytes: completedRootBytes(forged) });
      } else {
        const forged = { ...target.value, controlPlaneAttestationDigest: 'f'.repeat(64) };
        local.state.remove({ root: 'runtime', relativePath: `bridge/${target.name}` });
        local.state.write({ root: 'runtime', relativePath: `bridge/${target.name}`, bytes: line(forged) });
      }
      const before = local.snapshot();
      await expect(local.bridge().establish()).rejects.toMatchObject({ code: attack === 'foreign chain'
        ? 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID' : 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_INVALID' });
      expect(() => candidate.publishAuthority()).toThrow('AUTH_BRIDGE_PREPARED_RECOVERY_CHAIN_CONFLICT');
      local.expire();
      expect(() => local.prior()).toThrow();
      expect(local.snapshot()).toEqual(before);
    },
  );

  it('reserves lifecycle directory slots and stops at the existing storage bound before publication', async () => {
    const local = await fixture();
    for (let count = 1; count < AUTH_BRIDGE_NOTIFICATION_PREPARED_RECOVERY_AUTHORITY_LIMIT; count += 1) local.renew();
    for (const name of ['locks', 'activation-evidence', 'owner-provision-evidence']) {
      const relativePath = `bridge/${name}/fixture`;
      local.state.write({ root: 'runtime', relativePath, bytes: Buffer.from('fixture') });
      local.state.remove({ root: 'runtime', relativePath });
    }
    await expect(local.bridge().establish()).resolves.toEqual({ ready: true });
    const before = local.snapshot();
    expect(local.state.list({ root: 'runtime', relativeDirectory: 'bridge' })).toHaveLength(16);
    expect(() => local.begin()).toThrow('AUTH_BRIDGE_PREPARED_RECOVERY_HISTORY_FULL');
    expect(local.snapshot()).toEqual(before);
  });
});

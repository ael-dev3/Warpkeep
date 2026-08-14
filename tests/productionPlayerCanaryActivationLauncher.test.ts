// @vitest-environment node

import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  fstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it, vi } from 'vitest';

import {
  parseProductionPlayerCanaryActivationLaunch,
  PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_PROFILE,
  productionPlayerCanaryActivationLauncherTestSeams,
  runProductionPlayerCanaryActivationLauncher,
} from '../scripts/production-player-canary-activation-launcher.mjs';
import {
  preflightProductionPlayerCanaryActivationRequestPublication,
  PRODUCTION_PLAYER_CANARY_DEPLOY_AUTHORITY_PROFILE,
} from '../scripts/production-player-canary-deploy-authority.mjs';
import {
  inspectProductionPlayerCanaryTerminalReceiptJournal,
} from '../scripts/production-player-canary-operator-journal.mjs';
import {
  productionPlayerCanarySubjectCommitment,
} from '../scripts/production-player-canary-evidence-authority.mjs';
import {
  defaultProductionPlayerCanaryReceiptDirectory,
  inspectSettledProductionPlayerCanaryReceipt,
} from '../scripts/production-player-canary-receipt.mjs';

const CANDIDATE = 'a'.repeat(40);
const PREDECESSOR = 'b'.repeat(40);
const PREDECESSOR_TREE = 'c'.repeat(40);
const CANDIDATE_TREE = 'd'.repeat(40);
const RECEIPT_DIGEST = 'e'.repeat(64);
const PLAN_DIGEST = 'f'.repeat(64);
const APPROVAL_DIGEST = '1'.repeat(64);
const CLAIM_DIGEST = '2'.repeat(64);
const BASELINE_COMMITMENT = '6'.repeat(64);
const ROUTE_COMMITMENT = '7'.repeat(64);
const COMMAND_COMMITMENT = '8'.repeat(64);
const OWNER_APPROVAL_COMMITMENT = '9'.repeat(64);
const LIVE_RECEIPT_DIGEST = 'a'.repeat(64);
const LIVE_ROOT_RECEIPT_DIGEST = 'b'.repeat(64);
const LIVE_BRIDGE_COMMIT = 'e'.repeat(40);
const LIVE_ROOT_COMMIT = 'f'.repeat(40);
const EVIDENCE_NONCE = 'c'.repeat(64);
const APPROVED_AT = '2026-08-13T12:00:00.000Z';
const NOW = new Date('2026-08-13T12:10:00.000Z');
const RECORDED_AT = '2026-08-13T12:05:00.000Z';
const NOT_AFTER = '2026-08-13T13:05:00.000Z';
const REPOSITORY_ROOT = realpathSync(process.cwd());
const seams = productionPlayerCanaryActivationLauncherTestSeams!;

const request = Object.freeze({
  schemaVersion: 1,
  profile: PRODUCTION_PLAYER_CANARY_DEPLOY_AUTHORITY_PROFILE,
  candidatePagesSourceCommit: CANDIDATE,
  predecessorPagesSourceCommit: PREDECESSOR,
  predecessorProtectedTree: PREDECESSOR_TREE,
  productionPlayerCanaryReceiptDigest: RECEIPT_DIGEST,
  founderPlanDirectory: '/private/production/founder-plans',
  reviewedAdmissionPlanReference: Object.freeze({
    filename: 'reviewed-founder-plan.json',
    sha256: PLAN_DIGEST,
  }),
  ownerApprovalDirectory: '/private/production/canary-approvals',
  ownerApprovalReference: Object.freeze({
    filename: 'owner-approval.json',
    sha256: APPROVAL_DIGEST,
  }),
});

const launch = Object.freeze({
  schemaVersion: 1,
  profile: PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_PROFILE,
  operatorOperationId: '3'.repeat(32),
  candidatePagesSourceTree: CANDIDATE_TREE,
  request,
});

function authorityDigest(authority: unknown) {
  return createHash('sha256')
    .update('warpkeep.production-player-canary.evidence-authority.v1\0', 'utf8')
    .update(JSON.stringify(authority), 'utf8')
    .digest('hex');
}

function framed(values: readonly unknown[]) {
  return values.map(value => {
    const text = String(value);
    return `${Buffer.byteLength(text, 'utf8')}:${text}`;
  }).join('|');
}

function validFixture() {
  const challengeDigest = createHash('sha256').update(`${framed([
    'warpkeep.production-player-canary.challenge.v1',
    EVIDENCE_NONCE,
  ])}\n`).digest('hex');
  const evidenceAuthority = Object.freeze({
    profile: 'warpkeep-production-player-canary-evidence-authority-v1',
    reviewedAdmissionPlanDigest: PLAN_DIGEST,
    reviewedAdmissionClaimDigest: CLAIM_DIGEST,
    notificationEvidenceCommitment: 'd'.repeat(64),
    adminGameplayEvidenceDigest: 'e'.repeat(64),
    serverBaselineCommitment: BASELINE_COMMITMENT,
    ownerApprovalCommitment: OWNER_APPROVAL_COMMITMENT,
    routeSetCommitment: ROUTE_COMMITMENT,
    approvedAt: APPROVED_AT,
    notAfter: NOT_AFTER,
    recordedAt: RECORDED_AT,
    protectedCommit: PREDECESSOR,
    protectedTree: PREDECESSOR_TREE,
    notificationPagesLiveReceiptDigest: LIVE_RECEIPT_DIGEST,
    notificationPagesLivePagesSourceCommit: PREDECESSOR,
    notificationPagesLiveBridgeSourceCommit: LIVE_BRIDGE_COMMIT,
    notificationPagesLiveRootReceiptDigest: LIVE_ROOT_RECEIPT_DIGEST,
    notificationPagesLiveRootPagesSourceCommit: LIVE_ROOT_COMMIT,
    normalRequestAdmission: true,
    exactlyOnceNotification: true,
    sameAdmissionGeneration: true,
    sameFounder: true,
    directTierOneFounder: true,
    workerCount: 4,
    dispatchReceiptCount: 4,
    recallReceiptCount: 4,
    distinctResourceKindCount: 4,
    naturalGatheringWindowSatisfied: true,
    terminalIdleWorkerCount: 4,
    terminalGraphEmpty: true,
    isolatedResourceKindCount: 4,
    resourceQuantumCount: 4,
    humanRouteAndTimeCutoffSatisfied: true,
  });
  const plan = Object.freeze({
    fid: '123',
    notificationPagesLiveReceiptDigest: LIVE_RECEIPT_DIGEST,
    notificationPagesLivePagesSourceCommit: PREDECESSOR,
    notificationPagesLiveBridgeSourceCommit: LIVE_BRIDGE_COMMIT,
    notificationPagesLiveRootReceiptDigest: LIVE_ROOT_RECEIPT_DIGEST,
    notificationPagesLiveRootPagesSourceCommit: LIVE_ROOT_COMMIT,
  });
  const approval = Object.freeze({
    evidenceNonce: EVIDENCE_NONCE,
    reviewedAdmissionPlanDigest: PLAN_DIGEST,
    protectedCommit: PREDECESSOR,
    protectedTree: PREDECESSOR_TREE,
    predecessorLiveReceiptDigest: LIVE_RECEIPT_DIGEST,
    predecessorLiveRootReceiptDigest: LIVE_ROOT_RECEIPT_DIGEST,
    predecessorLiveRootPagesSourceCommit: LIVE_ROOT_COMMIT,
    approvedAt: APPROVED_AT,
    notAfter: NOT_AFTER,
    serverBaselineCommitment: BASELINE_COMMITMENT,
    routeSetCommitment: ROUTE_COMMITMENT,
    commandKeyPolicyVersion:
      'warpkeep-production-player-canary-command-key-v2',
    commandSetCommitment: COMMAND_COMMITMENT,
  });
  const references = Object.freeze({
    plan: Object.freeze({
      plan,
      planDigest: PLAN_DIGEST,
      claimDigest: CLAIM_DIGEST,
    }),
    approval: Object.freeze({
      approval,
      artifactDigest: APPROVAL_DIGEST,
      approvalCommitment: OWNER_APPROVAL_COMMITMENT,
      routeSetCommitment: ROUTE_COMMITMENT,
      commandSetCommitment: COMMAND_COMMITMENT,
    }),
  });
  const approvalRegistrationCommitment = createHash('sha256').update(
    `${framed([
      'warpkeep.production-player-canary.approval-registration.v1',
      challengeDigest,
      PLAN_DIGEST,
      BASELINE_COMMITMENT,
      ROUTE_COMMITMENT,
      approval.commandKeyPolicyVersion,
      COMMAND_COMMITMENT,
      APPROVAL_DIGEST,
      OWNER_APPROVAL_COMMITMENT,
      BigInt(Date.parse(APPROVED_AT)) * 1_000n,
      BigInt(Date.parse(NOT_AFTER)) * 1_000n,
    ])}\n`,
  ).digest('hex');
  const receipt = Object.freeze({
    source: Object.freeze({
      protectedCommit: PREDECESSOR,
      protectedTree: PREDECESSOR_TREE,
    }),
    predecessor: Object.freeze({ pagesSourceCommit: PREDECESSOR }),
    evidenceAuthority,
    recordedAt: RECORDED_AT,
  });
  const journal = Object.freeze({
    operationId: launch.operatorOperationId,
    contract: Object.freeze({
      operationId: launch.operatorOperationId,
      repositoryRoot: REPOSITORY_ROOT,
      protectedCommit: PREDECESSOR,
      protectedTree: PREDECESSOR_TREE,
      reviewedAdmissionClaimDigest: CLAIM_DIGEST,
      subjectCommitment: productionPlayerCanarySubjectCommitment(
        plan.fid,
        approval.evidenceNonce,
      ),
      founderPlanDirectory: request.founderPlanDirectory,
      reviewedAdmissionPlanReference: request.reviewedAdmissionPlanReference,
      ownerApprovalDirectory: request.ownerApprovalDirectory,
      receiptDirectory: defaultProductionPlayerCanaryReceiptDirectory(),
    }),
    ownerApprovalReference: request.ownerApprovalReference,
    baselineCheckpoint: Object.freeze({
      challengeDigest,
      reviewedAdmissionPlanDigest: PLAN_DIGEST,
      serverBaselineCommitment: BASELINE_COMMITMENT,
      routeSetCommitment: ROUTE_COMMITMENT,
    }),
    ownerApprovalCheckpoint: Object.freeze({
      reference: request.ownerApprovalReference,
      approvalCommitment: OWNER_APPROVAL_COMMITMENT,
      routeSetCommitment: ROUTE_COMMITMENT,
      commandSetCommitment: COMMAND_COMMITMENT,
    }),
    approvalCheckpoint: Object.freeze({
      approvalRegistrationCommitment,
      routeSetCommitment: ROUTE_COMMITMENT,
      commandSetCommitment: COMMAND_COMMITMENT,
    }),
    receiptIntent: Object.freeze({
      receiptDigest: RECEIPT_DIGEST,
      evidenceAuthorityDigest: authorityDigest(evidenceAuthority),
      recordedAt: RECORDED_AT,
      notAfter: NOT_AFTER,
    }),
    receipt: Object.freeze({
      filename: `production-player-canary-${RECEIPT_DIGEST}.json`,
      receiptDigest: RECEIPT_DIGEST,
      result: 'installed',
    }),
    terminalRecordDigest: '4'.repeat(64),
  });
  return { evidenceAuthority, journal, receipt, references };
}

function injected(calls: string[]) {
  const fixture = validFixture();
  const activationRequestDigest = createHash('sha256')
    .update(`${JSON.stringify(request, null, 2)}\n`)
    .digest('hex');
  return {
    activationRequestDigest,
    dependencies: {
      now: () => NOW,
      inspectCheckout: () => {
        calls.push('checkout');
        return { commit: CANDIDATE, tree: CANDIDATE_TREE };
      },
      assertProtectedSource: () => { calls.push('protected-source'); },
      verifySourceClosure: () => {
        calls.push('closure');
        return { memberCount: 384, manifestSha256: '5'.repeat(64) };
      },
      assertSourceTransition: () => {
        calls.push('transition');
        return {
          predecessorPagesSourceCommit: PREDECESSOR,
          candidatePagesSourceCommit: CANDIDATE,
          productionPlayerCanaryReceiptDigest: RECEIPT_DIGEST,
        };
      },
      inspectTerminalJournal: () => {
        calls.push('journal');
        return fixture.journal;
      },
      inspectSettledReceipt: () => {
        calls.push('receipt');
        return {
          filename: fixture.journal.receipt.filename,
          receiptDigest: RECEIPT_DIGEST,
          receipt: fixture.receipt,
        };
      },
      inspectReferences: async () => {
        calls.push('references');
        return fixture.references;
      },
      requireReferences: () => { calls.push('reference-binding'); },
      preflightPublication: () => {
        calls.push('preflight');
        return { state: 'absent', activationRequestDigest };
      },
      writeRequest: async () => {
        calls.push('write');
        return { activationRequestDigest };
      },
    },
  };
}

describe('production player canary activation request launcher', () => {
  it('runs every read-only authority check before the sole no-clobber writer', async () => {
    const calls: string[] = [];
    const fixture = injected(calls);
    await expect(seams.runWithDependencies(
      launch,
      fixture.dependencies,
    )).resolves.toEqual({
      activationRequestDigest: fixture.activationRequestDigest,
    });
    expect(calls).toEqual([
      'checkout', 'protected-source', 'closure', 'transition',
      'journal', 'receipt', 'references', 'reference-binding',
      'checkout', 'protected-source', 'closure', 'transition',
      'preflight',
      'checkout', 'protected-source', 'closure', 'transition',
      'write',
    ]);
  });

  it('fails before the writer on source, terminal-state, or publication drift', async () => {
    for (const mutate of [
      (dependencies: Record<string, unknown>) => {
        dependencies.verifySourceClosure = () => ({
          memberCount: 385,
          manifestSha256: '5'.repeat(64),
        });
      },
      (dependencies: Record<string, unknown>) => {
        dependencies.inspectTerminalJournal = () => ({
          ...validFixture().journal,
          receipt: { ...validFixture().journal.receipt, result: 'pending' },
        });
      },
      (dependencies: Record<string, unknown>) => {
        dependencies.preflightPublication = () => {
          throw new Error('different installed request');
        };
      },
    ]) {
      const calls: string[] = [];
      const fixture = injected(calls);
      const write = vi.fn(fixture.dependencies.writeRequest);
      const dependencies: Record<string, unknown> = {
        ...fixture.dependencies,
        writeRequest: write,
      };
      mutate(dependencies);
      await expect(seams.runWithDependencies(
        launch,
        dependencies,
      )).rejects.toThrow(/PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_/u);
      expect(write).not.toHaveBeenCalled();
    }
  });

  it('cross-binds every receipt authority field to plan, approval, and journal checkpoints', () => {
    const fixture = validFixture();
    expect(() => seams.requirePrivateAuthorityCrossBinding(
      launch,
      fixture.journal,
      fixture.receipt,
      fixture.references,
    )).not.toThrow();
    const substitutions: Array<[
      string,
      (value: any) => void,
    ]> = [
      ['plan digest', value => {
        value.references.plan.planDigest = '0'.repeat(64);
      }],
      ['claim digest', value => {
        value.receipt.evidenceAuthority.reviewedAdmissionClaimDigest =
          '0'.repeat(64);
      }],
      ['evidence nonce/challenge', value => {
        value.references.approval.approval.evidenceNonce = '0'.repeat(64);
      }],
      ['approval artifact digest', value => {
        value.references.approval.artifactDigest = '0'.repeat(64);
      }],
      ['owner approval commitment', value => {
        value.journal.ownerApprovalCheckpoint.approvalCommitment =
          '0'.repeat(64);
      }],
      ['server baseline', value => {
        value.references.approval.approval.serverBaselineCommitment =
          '0'.repeat(64);
      }],
      ['route set', value => {
        value.references.approval.routeSetCommitment = '0'.repeat(64);
      }],
      ['command set', value => {
        value.journal.approvalCheckpoint.commandSetCommitment =
          '0'.repeat(64);
      }],
      ['approval registration', value => {
        value.journal.approvalCheckpoint.approvalRegistrationCommitment =
          '0'.repeat(64);
      }],
      ['protected commit', value => {
        value.receipt.evidenceAuthority.protectedCommit = '0'.repeat(40);
      }],
      ['protected tree', value => {
        value.references.approval.approval.protectedTree = '0'.repeat(40);
      }],
      ['live receipt', value => {
        value.references.plan.plan.notificationPagesLiveReceiptDigest =
          '0'.repeat(64);
      }],
      ['live root receipt', value => {
        value.references.approval.approval.predecessorLiveRootReceiptDigest =
          '0'.repeat(64);
      }],
      ['live root commit', value => {
        value.receipt.evidenceAuthority
          .notificationPagesLiveRootPagesSourceCommit = '0'.repeat(40);
      }],
      ['live bridge commit', value => {
        value.references.plan.plan.notificationPagesLiveBridgeSourceCommit =
          '0'.repeat(40);
      }],
    ];
    for (const [label, substitute] of substitutions) {
      const hostile = structuredClone(fixture);
      substitute(hostile);
      expect(() => seams.requirePrivateAuthorityCrossBinding(
        launch,
        hostile.journal,
        hostile.receipt,
        hostile.references,
      ), label).toThrow(
        'PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_CROSS_BINDING_INVALID',
      );
    }

    const hostileIntent: any = structuredClone(fixture);
    hostileIntent.journal.receiptIntent.evidenceAuthorityDigest = '0'.repeat(64);
    expect(() => seams.requireSettledReceipt(
      launch,
      hostileIntent.journal,
      {
        filename: hostileIntent.journal.receipt.filename,
        receiptDigest: RECEIPT_DIGEST,
        receipt: hostileIntent.receipt,
      },
      NOW,
    )).toThrow(
      'PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_RECEIPT_MISMATCH',
    );
  });

  it('accepts only exact canonical owner-private regular-file stdin', () => {
    const directory = mkdtempSync(join(tmpdir(), 'warpkeep-activation-launch-'));
    chmodSync(directory, 0o700);
    const path = join(directory, 'launch.json');
    writeFileSync(path, `${JSON.stringify(launch, null, 2)}\n`, { mode: 0o600 });
    const descriptor = openSync(path, 'r');
    try {
      expect(seams
        .readCanonicalLaunchFromDescriptor(descriptor)).toEqual(launch);
    } finally { closeSync(descriptor); }

    const wrongMode = join(directory, 'wrong-mode.json');
    writeFileSync(wrongMode, `${JSON.stringify(launch, null, 2)}\n`, {
      mode: 0o640,
    });
    const wrongDescriptor = openSync(wrongMode, 'r');
    try {
      expect(() => seams
        .readCanonicalLaunchFromDescriptor(wrongDescriptor)).toThrow(
        'PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_STDIN_INVALID',
      );
    } finally { closeSync(wrongDescriptor); }

    const noncanonical = join(directory, 'noncanonical.json');
    writeFileSync(noncanonical, JSON.stringify(launch), { mode: 0o600 });
    const noncanonicalDescriptor = openSync(noncanonical, 'r');
    try {
      expect(() => seams
        .readCanonicalLaunchFromDescriptor(noncanonicalDescriptor)).toThrow(
        'PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_STDIN_NONCANONICAL',
      );
    } finally { closeSync(noncanonicalDescriptor); }

    const changedDescriptor = openSync(path, 'r');
    let fstatCalls = 0;
    try {
      expect(() => seams.readCanonicalLaunchWithIo(changedDescriptor, {
        fstat: ((...arguments_: Parameters<typeof fstatSync>) => {
          const status = fstatSync(...arguments_) as ReturnType<typeof fstatSync>;
          fstatCalls += 1;
          return fstatCalls === 2
            ? {
              ...status,
              mode: typeof status.mode === 'bigint'
                ? status.mode | 0o040n
                : status.mode | 0o040,
            } as typeof status
            : status;
        }) as typeof fstatSync,
        read: readSync,
      })).toThrow('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_STDIN_CHANGED');
    } finally { closeSync(changedDescriptor); }

    const growthDescriptor = openSync(path, 'r');
    const growthRead = vi.fn((
      _descriptor: number,
      buffer: NodeJS.ArrayBufferView,
      offset: number,
      length: number,
    ) => {
      Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength)
        .fill(0x20, offset, offset + length);
      return length;
    });
    try {
      expect(() => seams.readCanonicalLaunchWithIo(growthDescriptor, {
        fstat: fstatSync,
        read: growthRead as unknown as typeof readSync,
      })).toThrow('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_STDIN_CHANGED');
      expect(growthRead).toHaveBeenCalledTimes(1);
      expect(growthRead.mock.calls[0][3]).toBe(
        Buffer.byteLength(`${JSON.stringify(launch, null, 2)}\n`) + 1,
      );
    } finally { closeSync(growthDescriptor); }
  });

  it('rejects hidden, symbolic, accessor, prototype, and browser-derived authority', () => {
    const hostileValues: unknown[] = [];
    const hidden = { ...launch };
    Object.defineProperty(hidden, 'hiddenAuthority', { value: true });
    hostileValues.push(hidden);
    hostileValues.push({ ...launch, [Symbol('authority')]: true });
    const accessor = { ...launch };
    Object.defineProperty(accessor, 'operatorOperationId', {
      enumerable: true,
      get: () => launch.operatorOperationId,
    });
    hostileValues.push(accessor);
    hostileValues.push(Object.assign(Object.create({ authority: true }), launch));
    hostileValues.push({ ...launch, browserEvidence: { sanitized: true } });
    for (const value of hostileValues) {
      expect(() => parseProductionPlayerCanaryActivationLaunch(value)).toThrow(
        'PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_INPUT_INVALID',
      );
    }

    const envelopeHostiles = (key: string, value: unknown) => {
      const symbolic = { [key]: value, [Symbol('authority')]: true };
      const hidden = { [key]: value };
      Object.defineProperty(hidden, 'hiddenAuthority', { value: true });
      const accessor = {};
      Object.defineProperty(accessor, key, {
        enumerable: true,
        get: () => value,
      });
      const inherited = Object.assign(
        Object.create({ inheritedAuthority: true }),
        { [key]: value },
      );
      const nonenumerable = {};
      Object.defineProperty(nonenumerable, key, { value });
      return [symbolic, hidden, accessor, inherited, nonenumerable];
    };
    for (const hostile of envelopeHostiles(
      'operatorOperationId',
      launch.operatorOperationId,
    )) {
      expect(() => inspectProductionPlayerCanaryTerminalReceiptJournal(
        hostile as { operatorOperationId: string },
      )).toThrow(
        'PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_INSPECTION_INPUT_INVALID',
      );
    }
    for (const hostile of envelopeHostiles(
      'expectedReceiptDigest',
      RECEIPT_DIGEST,
    )) {
      expect(() => inspectSettledProductionPlayerCanaryReceipt(
        hostile as { expectedReceiptDigest: string },
      )).toThrow('PRODUCTION_PLAYER_CANARY_RECEIPT_INSPECTION_INPUT_INVALID');
    }
    for (const hostile of envelopeHostiles('request', request)) {
      expect(() => preflightProductionPlayerCanaryActivationRequestPublication(
        hostile as { request: typeof request },
      )).toThrow('PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_INPUT_INVALID');
    }

    const hiddenRequest = { ...request };
    Object.defineProperty(hiddenRequest, 'hiddenAuthority', { value: true });
    expect(() => parseProductionPlayerCanaryActivationLaunch({
      ...launch,
      request: hiddenRequest,
    })).toThrow('PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_INPUT_INVALID');
  });

  it('has exactly one literal CLI command and never accepts an input path argument', () => {
    const script = resolve(
      process.cwd(),
      'scripts/production-player-canary-activation-launcher.mjs',
    );
    const extraPath = '/private/should-not-be-read.json';
    const result = spawnSync(process.execPath, [script, 'write', extraPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      input: `${JSON.stringify(launch, null, 2)}\n`,
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      'PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_ARGUMENT_INVALID\n',
    );
    expect(result.stderr).not.toContain(extraPath);
  });

  it('rejects production dependency overrides even when a fake writer is supplied', async () => {
    const fakeWriter = vi.fn(async () => ({
      activationRequestDigest: '0'.repeat(64),
    }));
    await expect((runProductionPlayerCanaryActivationLauncher as unknown as (
      value: unknown,
      dependencies: unknown,
    ) => Promise<unknown>)(launch, {
      writeRequest: fakeWriter,
      verifySourceClosure: () => ({
        memberCount: 384,
        manifestSha256: '0'.repeat(64),
      }),
    })).rejects.toThrow(
      'PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_DEPENDENCY_OVERRIDE_INVALID',
    );
    expect(fakeWriter).not.toHaveBeenCalled();
  });

  it('contains no network, deployment, activation, run-all, browser, or journal append path', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'scripts/production-player-canary-activation-launcher.mjs',
      ),
      'utf8',
    );
    expect(source).not.toMatch(
      /node:(?:http|https|net|tls)|\bfetch\s*\(|XMLHttpRequest|WebSocket|playwright|puppeteer|run-all|runAll|deploy\s*\(|activate\s*\(|receiptInstalled\s*\(|append\s*\(/u,
    );
    expect(source).not.toContain('production-player-canary-browser-launcher');
    expect(source.match(/process\.env\.(?:NODE_ENV|VITEST)/gu)).toHaveLength(2);
  });
});

import { createHash } from 'node:crypto';
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it, vi } from 'vitest';

import {
  ProductionPlayerCanaryCoreError,
  verifyProductionPlayerCanaryProof,
} from '../scripts/production-player-canary-core';
import {
  ProductionPlayerCanaryReleaseBindingError,
  parseProductionPlayerCanaryReleaseBinding,
} from '../scripts/production-player-canary-release-binding.mjs';
import {
  productionPlayerCanaryAdmissionProfileDigest,
  productionPlayerCanaryEvidenceAuthorityTestSeams,
  requireProductionPlayerCanaryExpectedEvidenceAuthority,
  validateProductionPlayerCanaryAdminEvidenceV1,
} from '../scripts/production-player-canary-evidence-authority.mjs';
import {
  productionPlayerCanaryRouteSetCommitment,
} from '../scripts/production-player-canary-owner-approval.mjs';
import {
  deriveProductionPlayerCanaryCommandAuthorityV1,
} from '../scripts/production-player-canary-command-authority.mjs';
import {
  PRODUCTION_PLAYER_CANARY_PROFILE,
  PRODUCTION_PLAYER_CANARY_FRESH_INSPECTION_MAXIMUM_AGE_MS,
  ProductionPlayerCanaryReceiptError,
  canonicalProductionPlayerCanaryReceiptBytes,
  installProductionPlayerCanaryReceipt,
  parseProductionPlayerCanaryReceipt,
  productionPlayerCanaryReceiptTestSeams,
  requireFreshProductionPlayerCanaryActivationAuthority,
  sameProductionPlayerCanaryActivationAuthority,
} from '../scripts/production-player-canary-receipt.mjs';
import { workerResourcePolicy } from '../spacetimedb/src/castleWorkerPolicy';

const COMMIT = 'a'.repeat(40);
const TREE = 'b'.repeat(40);
const ROOT_COMMIT = 'c'.repeat(40);
const LIVE = '1'.repeat(64);
const ROOT = '2'.repeat(64);
const ADMIN_EVIDENCE = '3'.repeat(64);
const NOW = Date.parse('2026-08-13T12:06:00.000Z');
const REQUESTED_AT_MICROS = BigInt(Date.parse('2026-08-13T11:58:00.000Z')) * 1_000n;
const BASELINE_AT_MICROS = BigInt(Date.parse('2026-08-13T11:59:00.000Z')) * 1_000n;
const DISPATCH_AT_MICROS = BigInt(Date.parse('2026-08-13T12:01:00.000Z')) * 1_000n;
const RECALL_AT_MICROS = BigInt(Date.parse('2026-08-13T12:04:00.000Z')) * 1_000n;
const OBSERVED_AT_MICROS = BigInt(Date.parse('2026-08-13T12:05:00.000Z')) * 1_000n;
const PRIVATE_FID = 123n;
const EVIDENCE_NONCE = 'e'.repeat(64);
const BRIDGE_COMMIT = 'd'.repeat(40);
const evidenceAuthorityTestSeams = productionPlayerCanaryEvidenceAuthorityTestSeams!;
const receiptTestSeams = productionPlayerCanaryReceiptTestSeams!;
const CANARY_PROTECTED_RUNTIME_PATHS = Object.freeze([
  'scripts/notification-pages-private-deploy-operator.mjs',
  'scripts/production-player-canary-admin-transport.ts',
  'scripts/production-player-canary-baseline-reconciliation.mjs',
  'scripts/production-player-canary-core.ts',
  'scripts/production-player-canary-deploy-authority.mjs',
  'scripts/production-player-canary-evidence-authority.mjs',
  'scripts/production-player-canary-owner-approval.mjs',
  'scripts/production-player-canary-receipt.mjs',
]);
const EXACT_C7_PRESENTATION_PATHS = Object.freeze([
  'CHANGELOG.md',
  'README.md',
  'index.html',
  'package-lock.json',
  'package.json',
  'public/.well-known/farcaster.json',
  'scripts/farcaster-miniapp-contract.mjs',
  'scripts/greater-realm-downstream-release-policy.ts',
  'scripts/production-player-canary-release-binding.mjs',
  'src/components/menu/latestPatchNotes.ts',
  'src/greater-realm/greaterRealmTransport.ts',
  'src/spacetime/greaterRealmProviderBridge.ts',
  'tests/buildInfo.test.ts',
  'tests/deploymentBase.test.ts',
  'tests/farcasterMiniAppContract.test.ts',
  'tests/latestPatchNotes.test.ts',
  'tests/menuFarcasterAuthIntegration.test.tsx',
  'tests/menuMainMenu.test.tsx',
].sort());

function framed(values: readonly (string | number | bigint)[]) {
  return values.map(value => {
    const text = value.toString();
    return `${text.length}:${text}`;
  }).join('|');
}

function serverBaselineCommitment(evidenceNonce: string) {
  return createHash('sha256').update(
    `server-baseline-fixture:${evidenceNonce}`,
    'utf8',
  ).digest('hex');
}

function evidenceAuthority(
  evidenceNonce = EVIDENCE_NONCE,
  adminEvidenceOverrides: Readonly<Record<string, unknown>> = {},
  capture?: (fixture: Readonly<{
    inspectedPlan: Readonly<Record<string, unknown>>;
    inspectedApproval: Readonly<Record<string, unknown>>;
    notificationPagesLiveAuthority: Readonly<Record<string, unknown>>;
    notificationDiagnostics: Readonly<Record<string, unknown>>;
    adminEvidence: Readonly<Record<string, unknown>>;
  }>) => void,
) {
  const profile = {
    canonicalUsername: 'canary-founder',
    displayName: 'Canary Founder',
    pfpUrl: 'https://example.com/canary.png',
    publicBio: undefined,
  };
  const plan = {
    schemaVersion: 4,
    kind: 'warpkeep-reviewed-founder-admission-plan',
    planId: 'f'.repeat(32),
    createdAt: '2026-08-13T11:55:00.000Z',
    expiresAt: '2026-08-13T12:25:00.000Z',
    sourceConfigurationDigest: 'a'.repeat(64),
    targetConfigurationDigest: 'b'.repeat(64),
    profilePolicyVersion: 'trusted-snapchain-profile-v3',
    profileSourceUseApproval: 'approved-for-this-founder-admission-v1',
    notificationPagesLiveReceiptDigest: LIVE,
    notificationPagesLivePagesSourceCommit: COMMIT,
    notificationPagesLiveBridgeSourceCommit: BRIDGE_COMMIT,
    notificationPagesLiveRootReceiptDigest: ROOT,
    notificationPagesLiveRootPagesSourceCommit: ROOT_COMMIT,
    fid: PRIVATE_FID.toString(),
    note: 'Reviewed production player-path canary.',
    profile,
  };
  const reviewedAdmissionPlanDigest = createHash('sha256')
    .update(JSON.stringify(plan), 'utf8').digest('hex');
  const serverBaseline = serverBaselineCommitment(evidenceNonce);
  const challengeDigest = createHash('sha256').update(`${framed([
    'warpkeep.production-player-canary.challenge.v1', evidenceNonce,
  ])}\n`, 'utf8').digest('hex');
  const routes = ['food', 'wood', 'stone', 'gold'].map((resourceKind, index) => ({
    ordinal: index + 1,
    workerId: `genesis-001-castle-1-worker-0${index + 1}`,
    resourceKind,
    locationId: `GRL-${String.fromCharCode(65 + index).repeat(26)}`,
    atlasRevision: '7',
    routeSteps: 4,
    nodeCount: 8,
  }));
  const routeSetCommitment = productionPlayerCanaryRouteSetCommitment({
    evidenceNonce,
    reviewedAdmissionPlanDigest,
    routes,
  });
  const commandAuthority = deriveProductionPlayerCanaryCommandAuthorityV1({
    evidenceNonce,
    reviewedAdmissionPlanDigest,
    serverBaselineCommitment: serverBaseline,
    routeSetCommitment,
  });
  const artifactDigest = '4'.repeat(64);
  const approvalCommitment = createHash('sha256').update(`${framed([
    'warpkeep.production-player-canary.owner-approval.v1',
    evidenceNonce,
    artifactDigest,
    serverBaseline,
    routeSetCommitment,
  ])}\n`, 'utf8').digest('hex');
  const approval = {
    schemaVersion: 1,
    kind: 'warpkeep-production-player-canary-owner-approval-v1',
    approvalId: '4'.repeat(32),
    evidenceNonce,
    reviewedAdmissionPlanDigest,
    protectedCommit: COMMIT,
    protectedTree: TREE,
    predecessorLiveReceiptDigest: LIVE,
    predecessorLiveRootReceiptDigest: ROOT,
    predecessorLiveRootPagesSourceCommit: ROOT_COMMIT,
    approvedAt: '2026-08-13T12:00:00.000Z',
    notAfter: '2026-08-13T13:00:00.000Z',
    minimumGatheringSeconds: 60,
    maximumGatheringSeconds: 120,
    maximumRouteSteps: 4,
    serverBaselineCommitment: serverBaseline,
    routeSetCommitment,
    commandKeyPolicyVersion: commandAuthority.commandKeyPolicyVersion,
    commandSetCommitment: commandAuthority.commandSetCommitment,
    routes,
  };
  const inspectedPlan = {
    plan,
    planDigest: reviewedAdmissionPlanDigest,
    claimDigest: '7'.repeat(64),
    claimedAt: '2026-08-13T11:59:00.000Z',
  };
  const inspectedApproval = {
    approval,
    artifactDigest,
    approvalCommitment,
    routeSetCommitment,
    commandSetCommitment: commandAuthority.commandSetCommitment,
  };
  const approvalRegistrationCommitment = createHash('sha256').update(
    `${framed([
      'warpkeep.production-player-canary.approval-registration.v1',
      challengeDigest,
      reviewedAdmissionPlanDigest,
      serverBaseline,
      routeSetCommitment,
      commandAuthority.commandKeyPolicyVersion,
      commandAuthority.commandSetCommitment,
      inspectedApproval.artifactDigest,
      inspectedApproval.approvalCommitment,
      BigInt(Date.parse(approval.approvedAt)) * 1_000n,
      BigInt(Date.parse(approval.notAfter)) * 1_000n,
    ])}\n`,
    'utf8',
  ).digest('hex');
  const notificationPagesLiveAuthority = {
    notificationPagesLiveReceiptDigest: LIVE,
    notificationPagesLivePagesSourceCommit: COMMIT,
    notificationPagesLiveBridgeSourceCommit: BRIDGE_COMMIT,
    notificationPagesLiveRootReceiptDigest: ROOT,
    notificationPagesLiveRootPagesSourceCommit: ROOT_COMMIT,
  };
  const notificationDiagnostics = {
    status: 'already-sent',
    generation: 'pending-request',
    requestedAtMicros: Number(REQUESTED_AT_MICROS),
    deliveryAttemptCount: 1,
    verificationFailureCount: 0,
    subscribed: true,
    recoveryCount: 0,
    retryReasons: [],
    lastAttemptAt: 2_000,
  };
  const adminEvidence = {
    profile: 'warpkeep-production-player-canary-admin-evidence-v1',
    challengeDigest,
    reviewedAdmissionPlanDigest,
    serverBaselineCommitment: serverBaseline,
    admissionProfileDigest: productionPlayerCanaryAdmissionProfileDigest(profile),
    evidenceDigest: ADMIN_EVIDENCE,
    routeSetCommitment,
    commandSetCommitment: commandAuthority.commandSetCommitment,
    ownerApprovalArtifactDigest: inspectedApproval.artifactDigest,
    ownerApprovalCommitment: inspectedApproval.approvalCommitment,
    approvalRegistrationCommitment,
    requestCycle: 0n,
    requestedAtMicros: REQUESTED_AT_MICROS,
    baselineCapturedAtMicros: BASELINE_AT_MICROS,
    observedAtMicros: OBSERVED_AT_MICROS,
    earliestDispatchAtMicros: DISPATCH_AT_MICROS,
    latestRecallAtMicros: RECALL_AT_MICROS,
    directTierOneFounder: true,
    normalRequestAdmission: true,
    ownerBound: true,
    currentTermsAccepted: true,
    workerCount: 4,
    dispatchReceiptCount: 4,
    recallReceiptCount: 4,
    distinctResourceKindCount: 4,
    minimumGatheringElapsedMicros: 60_000_000n,
    maximumGatheringElapsedMicros: 60_000_003n,
    maximumRouteSteps: 4,
    terminalIdleWorkerCount: 4,
    terminalAssignmentCount: 0n,
    terminalOccupationCount: 0n,
    terminalScheduleCount: 0n,
    isolatedResourceKindCount: 4,
    resourceQuantumCount: 4,
    foodDelta: 1n,
    woodDelta: 1n,
    stoneDelta: 1n,
    goldDelta: 1n,
    ...adminEvidenceOverrides,
  };
  const fixture = Object.freeze({
    inspectedPlan,
    inspectedApproval,
    notificationPagesLiveAuthority,
    notificationDiagnostics,
    adminEvidence,
  });
  capture?.(fixture);
  return evidenceAuthorityTestSeams.buildExpectedEvidenceAuthority({
    evidenceNonce,
    ...fixture,
  });
}

function receipt(authority = evidenceAuthority()) {
  return {
    schemaVersion: 1,
    profile: PRODUCTION_PLAYER_CANARY_PROFILE,
    source: {
      protectedCommit: COMMIT,
      protectedTree: TREE,
    },
    predecessor: {
      phaseTuple: 'FT|TTFT|FT|FF|1|1|NNPN',
      releaseVersion: '0.3.43',
      worldClientPresentationEnabled: false,
      worldServerPresentationEnabled: false,
      pagesSourceCommit: COMMIT,
      liveReceiptDigest: LIVE,
      liveRootReceiptDigest: ROOT,
      liveRootPagesSourceCommit: ROOT_COMMIT,
    },
    evidenceAuthority: authority,
    recordedAt: authority.recordedAt,
  };
}

function privateDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'warpkeep-player-canary-'));
  chmodSync(directory, 0o700);
  return realpathSync(directory);
}

function protectedSourceRepository() {
  const repositoryRoot = realpathSync(mkdtempSync(join(
    tmpdir(),
    'warpkeep-canary-source-',
  )));
  const git = (arguments_: readonly string[]) => {
    const result = spawnSync('/usr/bin/git', arguments_, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: {
        PATH: '/usr/bin:/bin',
        HOME: '/nonexistent',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_SYSTEM: '/dev/null',
        LC_ALL: 'C',
      },
    });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  };
  git(['init', '--quiet', '--initial-branch=main']);
  git(['config', 'user.email', 'canary-test@warpkeep.invalid']);
  git(['config', 'user.name', 'Warpkeep Canary Test']);
  mkdirSync(join(repositoryRoot, 'scripts'));
  const executingAuthorityBytes = readFileSync(
    join(import.meta.dirname, '../scripts/production-player-canary-evidence-authority.mjs'),
    'utf8',
  );
  for (const runtimePath of CANARY_PROTECTED_RUNTIME_PATHS) {
    const destination = join(repositoryRoot, runtimePath);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(
      destination,
      readFileSync(join(import.meta.dirname, '..', runtimePath), 'utf8'),
    );
  }
  writeFileSync(join(repositoryRoot, 'package.json'), JSON.stringify({
    version: '0.3.43',
  }));
  writeFileSync(join(repositoryRoot, 'package-lock.json'), JSON.stringify({
    version: '0.3.43',
    packages: { '': { version: '0.3.43' } },
  }));
  writeFileSync(join(repositoryRoot, 'tracked.txt'), 'protected\n');
  git(['add', '--all']);
  git(['commit', '--quiet', '-m', 'protected predecessor']);
  const protectedCommit = git(['rev-parse', '--verify', 'HEAD^{commit}']);
  const protectedTree = git(['rev-parse', '--verify', 'HEAD^{tree}']);
  for (const path of EXACT_C7_PRESENTATION_PATHS) {
    const destination = join(repositoryRoot, path);
    mkdirSync(dirname(destination), { recursive: true });
    if (path === 'package.json') {
      writeFileSync(destination, JSON.stringify({ version: '0.3.44' }));
    } else if (path === 'package-lock.json') {
      writeFileSync(destination, JSON.stringify({
        version: '0.3.44',
        packages: { '': { version: '0.3.44' } },
      }));
    } else {
      writeFileSync(destination, `exact C7 presentation: ${path}\n`);
    }
  }
  git(['add', '--all']);
  git(['commit', '--quiet', '-m', 'clean successor']);
  return {
    repositoryRoot,
    protectedCommit,
    protectedTree,
    executingAuthorityBytes,
    git,
  };
}

function bindingFor(value: ReturnType<typeof receipt>) {
  const bytes = canonicalProductionPlayerCanaryReceiptBytes(value);
  try {
    return {
      productionPlayerCanaryReceiptDigest: createHash('sha256').update(bytes).digest('hex'),
      productionPlayerCanarySourceCommit: COMMIT,
    };
  } finally { bytes.fill(0); }
}

function inspect(
  directory: string,
  value = receipt(),
  expectedEvidenceAuthority = value.evidenceAuthority,
  now = NOW,
) {
  return receiptTestSeams.inspectActivationAuthority({
    binding: bindingFor(value),
    directory,
    expectedPredecessorPagesSourceCommit: COMMIT,
    expectedProtectedTree: TREE,
    expectedLiveReceiptDigest: LIVE,
    expectedLivePagesSourceCommit: COMMIT,
    expectedLiveRootReceiptDigest: ROOT,
    expectedLiveRootPagesSourceCommit: ROOT_COMMIT,
    expectedEvidenceAuthority,
  }, now);
}

describe('production player canary authority', () => {
  it('accepts C7 evidence only with exact-18 presentation drift and identical C6 authority bytes', () => {
    const fixture = protectedSourceRepository();
    expect(fixture.git([
      'diff', '--name-only', fixture.protectedCommit, 'HEAD', '--',
    ]).split('\n').filter(Boolean).sort()).toEqual(EXACT_C7_PRESENTATION_PATHS);
    expect(fixture.git([
      'show', `${fixture.protectedCommit}:scripts/production-player-canary-evidence-authority.mjs`,
    ])).toBe(fixture.executingAuthorityBytes.trimEnd());
    expect(() => evidenceAuthorityTestSeams.assertProtectedSourceAtRoot(
      fixture.repositoryRoot,
      fixture.protectedCommit,
      fixture.protectedTree,
      fixture.repositoryRoot,
      fixture.executingAuthorityBytes,
    )).not.toThrow();
    expect(() => evidenceAuthorityTestSeams.assertProtectedSourceAtRoot(
      fixture.repositoryRoot,
      fixture.protectedCommit,
      'f'.repeat(40),
      fixture.repositoryRoot,
      fixture.executingAuthorityBytes,
    )).toThrow('PRODUCTION_PLAYER_CANARY_PROTECTED_SOURCE_INVALID');
  });

  it('rejects an exact-18 C7 descendant after any canary runtime byte drifts', () => {
    for (const runtimePath of CANARY_PROTECTED_RUNTIME_PATHS) {
      const fixture = protectedSourceRepository();
      expect(fixture.git([
        'diff', '--name-only', fixture.protectedCommit, 'HEAD', '--',
      ]).split('\n').filter(Boolean).sort()).toEqual(EXACT_C7_PRESENTATION_PATHS);
      writeFileSync(
        join(fixture.repositoryRoot, runtimePath),
        `${readFileSync(join(fixture.repositoryRoot, runtimePath), 'utf8')}\n// hostile drift\n`,
      );
      fixture.git(['add', '--', runtimePath]);
      fixture.git(['commit', '--quiet', '-m', 'hostile runtime drift']);
      expect(() => evidenceAuthorityTestSeams.assertProtectedSourceAtRoot(
        fixture.repositoryRoot,
        fixture.protectedCommit,
        fixture.protectedTree,
        fixture.repositoryRoot,
        fixture.executingAuthorityBytes,
      )).toThrow('PRODUCTION_PLAYER_CANARY_PROTECTED_SOURCE_CLOSURE_MISMATCH');
    }
  });

  it('rejects non-ancestors and changed attestation implementation bytes', () => {
    const fixture = protectedSourceRepository();
    fixture.git(['checkout', '--quiet', '--orphan', 'unrelated']);
    fixture.git(['rm', '--quiet', '-rf', '.']);
    mkdirSync(join(fixture.repositoryRoot, 'scripts'));
    writeFileSync(
      join(fixture.repositoryRoot, 'scripts/production-player-canary-evidence-authority.mjs'),
      fixture.executingAuthorityBytes,
    );
    fixture.git(['add', '--all']);
    fixture.git(['commit', '--quiet', '-m', 'unrelated clean source']);
    expect(() => evidenceAuthorityTestSeams.assertProtectedSourceAtRoot(
      fixture.repositoryRoot,
      fixture.protectedCommit,
      fixture.protectedTree,
      fixture.repositoryRoot,
      fixture.executingAuthorityBytes,
    )).toThrow('PRODUCTION_PLAYER_CANARY_PROTECTED_SOURCE_INVALID');

    const clean = protectedSourceRepository();
    expect(() => evidenceAuthorityTestSeams.assertProtectedSourceAtRoot(
      clean.repositoryRoot,
      clean.protectedCommit,
      clean.protectedTree,
      clean.repositoryRoot,
      `${clean.executingAuthorityBytes}\n// changed successor authority\n`,
    )).toThrow(
      'PRODUCTION_PLAYER_CANARY_PROTECTED_SOURCE_IMPLEMENTATION_MISMATCH',
    );
  });

  it('rejects clean descendant drift in a transitive protected dependency', () => {
    const fixture = protectedSourceRepository();
    writeFileSync(
      join(fixture.repositoryRoot, 'scripts/production-player-canary-owner-approval.mjs'),
      '// changed transitive authority dependency\n',
    );
    fixture.git(['add', '--all']);
    fixture.git(['commit', '--quiet', '-m', 'changed transitive dependency']);
    expect(() => evidenceAuthorityTestSeams.assertProtectedSourceAtRoot(
      fixture.repositoryRoot,
      fixture.protectedCommit,
      fixture.protectedTree,
      fixture.repositoryRoot,
      fixture.executingAuthorityBytes,
    )).toThrow('PRODUCTION_PLAYER_CANARY_PROTECTED_SOURCE_CLOSURE_MISMATCH');
  });

  it('rejects tracked, staged, and untracked checkout drift', () => {
    for (const kind of ['tracked', 'staged', 'untracked'] as const) {
      const fixture = protectedSourceRepository();
      if (kind === 'untracked') {
        writeFileSync(join(fixture.repositoryRoot, 'untracked.txt'), 'drift\n');
      } else {
        writeFileSync(join(fixture.repositoryRoot, 'tracked.txt'), 'drift\n');
        if (kind === 'staged') fixture.git(['add', '--', 'tracked.txt']);
      }
      expect(() => evidenceAuthorityTestSeams.assertProtectedSourceAtRoot(
        fixture.repositoryRoot,
        fixture.protectedCommit,
        fixture.protectedTree,
        fixture.repositoryRoot,
        fixture.executingAuthorityBytes,
      )).toThrow('PRODUCTION_PLAYER_CANARY_PROTECTED_SOURCE_DIRTY');
    }
  });

  it('rejects assume-unchanged and skip-worktree even when they hide drift', () => {
    for (const flag of ['--assume-unchanged', '--skip-worktree'] as const) {
      const fixture = protectedSourceRepository();
      fixture.git(['update-index', flag, '--', 'tracked.txt']);
      writeFileSync(join(fixture.repositoryRoot, 'tracked.txt'), 'hidden drift\n');
      expect(() => evidenceAuthorityTestSeams.assertProtectedSourceAtRoot(
        fixture.repositoryRoot,
        fixture.protectedCommit,
        fixture.protectedTree,
        fixture.repositoryRoot,
        fixture.executingAuthorityBytes,
      )).toThrow();
    }
  });

  it('acquires and double-checks every mutable production authority', async () => {
    let captured!: Parameters<NonNullable<Parameters<typeof evidenceAuthority>[2]>>[0];
    const expected = evidenceAuthority(EVIDENCE_NONCE, {}, value => {
      captured = value;
    });
    let planReads = 0;
    let approvalReads = 0;
    let hermesReads = 0;
    let notificationReads = 0;
    let adminReads = 0;
    let adminArguments: Readonly<Record<string, unknown>> | undefined;
    const input = {
      founderPlanDirectory: '/private/founder',
      reviewedAdmissionPlanReference: { filename: 'plan.json', sha256: 'a'.repeat(64) },
      ownerApprovalDirectory: '/private/approval',
      ownerApprovalReference: { filename: 'approval.json', sha256: 'b'.repeat(64) },
      expectedSourceConfigurationDigest: 'c'.repeat(64),
      expectedTargetConfigurationDigest: 'd'.repeat(64),
      expectedProfilePolicyVersion: 'trusted-snapchain-profile-v3',
      pagesSourceCommit: COMMIT,
      repositoryRoot: '/repository',
      notificationBridgeUrl: 'https://auth.warpkeep.test',
      notificationOperatorSecret: 'private-operator-secret',
      adminSecret: 'private-admin-secret',
      now: new Date(NOW),
    };
    const dependencies = {
      inspectClaimedPlan: async () => {
        planReads += 1;
        return captured.inspectedPlan;
      },
      inspectOwnerApproval: async () => {
        approvalReads += 1;
        return captured.inspectedApproval;
      },
      inspectHermes: async () => {
        hermesReads += 1;
        return captured.notificationPagesLiveAuthority;
      },
      inspectNotification: async () => {
        notificationReads += 1;
        return captured.notificationDiagnostics;
      },
      callAdminEvidence: async (value: Readonly<Record<string, unknown>>) => {
        adminReads += 1;
        adminArguments = value.arguments as Readonly<Record<string, unknown>>;
        return captured.adminEvidence;
      },
      assertProtectedSource: vi.fn(),
    };
    const acquired = await evidenceAuthorityTestSeams
      .inspectExpectedEvidenceAuthority(input, dependencies);
    expect(acquired).toEqual(expected);
    expect({ planReads, approvalReads, hermesReads, notificationReads, adminReads })
      .toEqual({ planReads: 2, approvalReads: 2, hermesReads: 2, notificationReads: 2, adminReads: 1 });
    expect(Object.keys(adminArguments ?? {}).sort()).toEqual([
      'evidenceNonce', 'fid', 'reviewedAdmissionPlanDigest',
    ]);
    expect(JSON.stringify(adminArguments, (_key, value) => (
      typeof value === 'bigint' ? value.toString() : value
    ))).not.toMatch(/baseline(?:Observed|Settled|Revision|Food|Wood|Stone|Gold)/u);

    let changedNotificationRead = 0;
    await expect(evidenceAuthorityTestSeams
      .inspectExpectedEvidenceAuthority(input, {
        ...dependencies,
        inspectNotification: async () => ({
          ...captured.notificationDiagnostics,
          lastAttemptAt: ++changedNotificationRead === 1 ? 2_000 : 2_001,
        }),
      })).rejects.toThrow('PRODUCTION_PLAYER_CANARY_EVIDENCE_CHANGED_DURING_INSPECTION');
  });

  it('accepts the exact full typed admin procedure result on the production validator', () => {
    let fullAdminResult: Readonly<Record<string, unknown>> | undefined;
    evidenceAuthority(EVIDENCE_NONCE, {}, fixture => {
      fullAdminResult = fixture.adminEvidence;
    });
    expect(fullAdminResult).toBeDefined();
    expect(validateProductionPlayerCanaryAdminEvidenceV1(fullAdminResult))
      .toBeUndefined();
    expect(() => validateProductionPlayerCanaryAdminEvidenceV1({
      ...fullAdminResult,
      unexpectedDuplicateShapeSentinel: true,
    })).toThrow('PRODUCTION_PLAYER_CANARY_ADMIN_EVIDENCE_INVALID');
  });

  it('rejects forged plain expected authorities at both release boundaries', () => {
    const branded = evidenceAuthority();
    expect(() => requireProductionPlayerCanaryExpectedEvidenceAuthority({ ...branded }))
      .toThrow('PRODUCTION_PLAYER_CANARY_EXPECTED_EVIDENCE_AUTHORITY_REQUIRED');
    const directory = privateDirectory();
    expect(() => installProductionPlayerCanaryReceipt({
      directory,
      evidenceAuthority: { ...branded },
    })).toThrow('PRODUCTION_PLAYER_CANARY_EXPECTED_EVIDENCE_AUTHORITY_REQUIRED');
  });

  it('nonce-binds private diagnostics and omits the unsalted admission profile digest', () => {
    const first = evidenceAuthority();
    const firstProfileDigest = productionPlayerCanaryAdmissionProfileDigest({
      canonicalUsername: 'canary-founder',
      displayName: 'Canary Founder',
      pfpUrl: 'https://example.com/canary.png',
      publicBio: undefined,
    });
    const serialized = JSON.stringify(receipt());
    expect(serialized).not.toContain(firstProfileDigest);
    const second = evidenceAuthority('f'.repeat(64));
    expect(second.notificationEvidenceCommitment)
      .not.toBe(first.notificationEvidenceCommitment);
    expect(second.serverBaselineCommitment).not.toBe(first.serverBaselineCommitment);
    expect(second.adminGameplayEvidenceDigest).toBe(first.adminGameplayEvidenceDigest);
    expect(first.notificationEvidenceCommitment).toMatch(/^[0-9a-f]{64}$/u);
    expect(first).not.toHaveProperty('admissionProfileDigest');
  });

  it('rejects baseline commitment substitution and approval-before-capture chronology', () => {
    const approvedAtMicros = BigInt(Date.parse('2026-08-13T12:00:00.000Z')) * 1_000n;
    expect(() => evidenceAuthority(EVIDENCE_NONCE, {
      baselineCapturedAtMicros: approvedAtMicros,
      earliestDispatchAtMicros: approvedAtMicros,
    })).not.toThrow();
    expect(() => evidenceAuthority(EVIDENCE_NONCE, {
      serverBaselineCommitment: '8'.repeat(64),
    })).toThrow('PRODUCTION_PLAYER_CANARY_SAME_FOUNDER_EVIDENCE_INVALID');
    expect(() => evidenceAuthority(EVIDENCE_NONCE, {
      baselineCapturedAtMicros:
        BigInt(Date.parse('2026-08-13T12:00:00.001Z')) * 1_000n,
    })).toThrow('PRODUCTION_PLAYER_CANARY_SAME_FOUNDER_EVIDENCE_INVALID');
    expect(() => evidenceAuthority(EVIDENCE_NONCE, {
      earliestDispatchAtMicros:
        BigInt(Date.parse('2026-08-13T11:59:59.999Z')) * 1_000n,
    })).toThrow('PRODUCTION_PLAYER_CANARY_SAME_FOUNDER_EVIDENCE_INVALID');
  });

  it('requires an exact all-null or all-populated predecessor binding', () => {
    expect(parseProductionPlayerCanaryReleaseBinding({
      productionPlayerCanaryReceiptDigest: null,
      productionPlayerCanarySourceCommit: null,
    })).toMatchObject({ productionPlayerCanaryReceiptDigest: null });
    expect(() => parseProductionPlayerCanaryReleaseBinding({
      productionPlayerCanaryReceiptDigest: 'a'.repeat(64),
      productionPlayerCanarySourceCommit: null,
    })).toThrowError(ProductionPlayerCanaryReleaseBindingError);
    expect(() => parseProductionPlayerCanaryReleaseBinding({
      productionPlayerCanaryReceiptDigest: 'a'.repeat(64),
      productionPlayerCanarySourceCommit: COMMIT,
      candidateCommit: COMMIT,
    })).toThrow('PRODUCTION_PLAYER_CANARY_RELEASE_BINDING_INVALID');
  });

  it('installs and inspects one canonical owner-private content-addressed receipt', () => {
    const directory = privateDirectory();
    const value = receipt();
    const installed = installProductionPlayerCanaryReceipt({
      directory,
      evidenceAuthority: value.evidenceAuthority,
      randomId: () => 'd'.repeat(32),
    });
    expect(installed.result).toBe('installed');
    expect(installProductionPlayerCanaryReceipt({
      directory,
      evidenceAuthority: value.evidenceAuthority,
      randomId: () => 'e'.repeat(32),
    }).result).toBe('unchanged');
    const authority = inspect(directory, value);
    expect(authority).toMatchObject({
      productionPlayerCanaryReceiptDigest: installed.receiptDigest,
      productionPlayerCanarySourceCommit: COMMIT,
      predecessorPhaseTuple: 'FT|TTFT|FT|FF|1|1|NNPN',
      predecessorReleaseVersion: '0.3.43',
      normalAdmission: true,
      exactlyOnceNotification: true,
      sameAdmissionGeneration: true,
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
    expect(Object.keys(authority).join(' ')).not.toMatch(
      /fid|subject|token$|workerId|locationId|nodeId|castleId|cellKey/iu,
    );
    expect(sameProductionPlayerCanaryActivationAuthority(authority, { ...authority }))
      .toBe(true);
    const beforeInspection = readdirSync(directory).map(name => ({
      name,
      modified: statSync(join(directory, name), { bigint: true }).mtimeNs,
    }));
    inspect(directory, value);
    expect(readdirSync(directory).map(name => ({
      name,
      modified: statSync(join(directory, name), { bigint: true }).mtimeNs,
    }))).toEqual(beforeInspection);
  });

  it('separates immutable issuance evidence from a fresh activation observation', () => {
    const historicalAuthority = evidenceAuthority();
    const value = receipt(historicalAuthority);
    const directory = privateDirectory();
    installProductionPlayerCanaryReceipt({
      directory,
      evidenceAuthority: historicalAuthority,
      randomId: () => '6'.repeat(32),
    });

    const freshAuthority = evidenceAuthority(EVIDENCE_NONCE, {
      observedAtMicros: OBSERVED_AT_MICROS + 60_000_000n,
      evidenceDigest: '9'.repeat(64),
    });
    expect(freshAuthority.recordedAt).not.toBe(historicalAuthority.recordedAt);
    expect(freshAuthority.adminGameplayEvidenceDigest)
      .not.toBe(historicalAuthority.adminGameplayEvidenceDigest);
    expect(inspect(directory, value, freshAuthority)).toMatchObject({
      productionPlayerCanarySourceCommit: COMMIT,
      recordedAt: historicalAuthority.recordedAt,
    });

    const wrongStableAuthority = evidenceAuthority('8'.repeat(64), {
      observedAtMicros: OBSERVED_AT_MICROS + 60_000_000n,
      evidenceDigest: '9'.repeat(64),
    });
    expect(() => inspect(directory, value, wrongStableAuthority)).toThrow(
      'PRODUCTION_PLAYER_CANARY_ACTIVATION_AUTHORITY_MISMATCH',
    );

    expect(() => inspect(
      directory,
      value,
      historicalAuthority,
      Date.parse('2026-08-13T12:11:00.000Z'),
    )).toThrow(
      'PRODUCTION_PLAYER_CANARY_ACTIVATION_AUTHORITY_MISMATCH',
    );
  });

  it('binds freshness to one trusted observation and rejects future or stale reuse', () => {
    const value = receipt();
    const directory = privateDirectory();
    installProductionPlayerCanaryReceipt({
      directory,
      evidenceAuthority: value.evidenceAuthority,
      randomId: () => '7'.repeat(32),
    });
    const authority = inspect(directory, value, value.evidenceAuthority, NOW);
    const binding = {
      candidatePagesSourceCommit: COMMIT,
      predecessorPagesSourceCommit: COMMIT,
    };
    expect(requireFreshProductionPlayerCanaryActivationAuthority(
      authority,
      { ...binding, now: NOW },
    )).toBe(authority);
    expect(() => requireFreshProductionPlayerCanaryActivationAuthority(
      authority,
      { ...binding, now: NOW - 1 },
    )).toThrow('PRODUCTION_PLAYER_CANARY_ACTIVATION_AUTHORITY_STALE');
    expect(() => requireFreshProductionPlayerCanaryActivationAuthority(
      authority,
      {
        ...binding,
        now: NOW
          + PRODUCTION_PLAYER_CANARY_FRESH_INSPECTION_MAXIMUM_AGE_MS
          + 1,
      },
    )).toThrow('PRODUCTION_PLAYER_CANARY_ACTIVATION_AUTHORITY_STALE');
    expect(() => receiptTestSeams.inspectActivationAuthority({
      binding: bindingFor(value),
      directory,
      expectedPredecessorPagesSourceCommit: COMMIT,
      expectedProtectedTree: TREE,
      expectedLiveReceiptDigest: LIVE,
      expectedLivePagesSourceCommit: COMMIT,
      expectedLiveRootReceiptDigest: ROOT,
      expectedLiveRootPagesSourceCommit: ROOT_COMMIT,
      expectedEvidenceAuthority: value.evidenceAuthority,
    }, Date.parse('2026-08-13T12:04:59.999Z'))).toThrow(
      'PRODUCTION_PLAYER_CANARY_ACTIVATION_AUTHORITY_MISMATCH',
    );
  });

  it('rejects a second different receipt before writing alongside the first', () => {
    const directory = privateDirectory();
    const first = receipt();
    receiptTestSeams.installReceipt({
      directory,
      receipt: first,
      randomId: () => '4'.repeat(32),
    });
    const before = readdirSync(directory);
    const second = receipt();
    second.evidenceAuthority = {
      ...second.evidenceAuthority,
      recordedAt: '2026-08-13T12:05:01.000Z',
    } as typeof second.evidenceAuthority;
    second.recordedAt = '2026-08-13T12:05:01.000Z';
    expect(() => receiptTestSeams.installReceipt({
      directory,
      receipt: second,
      randomId: () => '5'.repeat(32),
    })).toThrow('PRODUCTION_PLAYER_CANARY_RECEIPT_CONFLICT');
    expect(readdirSync(directory)).toEqual(before);
  });

  it('repairs an exact killed-after-link publication before an idempotent retry', () => {
    const directory = privateDirectory();
    const value = receipt();
    expect(() => receiptTestSeams.installReceipt({
      directory,
      receipt: value,
      randomId: () => 'a'.repeat(32),
    }, {
      afterLink: () => { throw new Error('simulated-sigkill-after-link'); },
    })).toThrow('PRODUCTION_PLAYER_CANARY_RECEIPT_INSTALL_INVALID');
    expect(readdirSync(directory)).toHaveLength(2);
    expect(inspect(directory, value)).toMatchObject({
      productionPlayerCanarySourceCommit: COMMIT,
    });
    expect(readdirSync(directory)).toHaveLength(1);
    expect(receiptTestSeams.installReceipt({
      directory,
      receipt: value,
      randomId: () => 'b'.repeat(32),
    })).toMatchObject({ result: 'unchanged' });
    expect(inspect(directory, value)).toMatchObject({
      productionPlayerCanarySourceCommit: COMMIT,
    });
  });

  it('rejects an unrelated content-addressed receipt or concurrent temp fanout', () => {
    const expected = receipt();
    const unrelated = receipt();
    unrelated.recordedAt = '2026-08-13T12:05:01.000Z';
    const receiptDirectory = privateDirectory();
    receiptTestSeams.installReceipt({
      directory: receiptDirectory,
      receipt: expected,
      randomId: () => '1'.repeat(32),
    });
    const unrelatedBytes = canonicalProductionPlayerCanaryReceiptBytes(unrelated);
    try {
      const unrelatedDigest = createHash('sha256').update(unrelatedBytes).digest('hex');
      writeFileSync(
        join(receiptDirectory, `production-player-canary-${unrelatedDigest}.json`),
        unrelatedBytes,
        { mode: 0o600 },
      );
    } finally {
      unrelatedBytes.fill(0);
    }
    expect(() => inspect(receiptDirectory, expected)).toThrow(
      'PRODUCTION_PLAYER_CANARY_RECEIPT_DIRECTORY_CONTENT_INVALID',
    );

    const tempDirectory = privateDirectory();
    const bytes = canonicalProductionPlayerCanaryReceiptBytes(expected);
    try {
      const digest = createHash('sha256').update(bytes).digest('hex');
      for (const nonce of ['2'.repeat(32), '3'.repeat(32)]) {
        writeFileSync(
          join(tempDirectory, `.production-player-canary-${digest}.json-${nonce}.tmp`),
          bytes,
          { mode: 0o600 },
        );
      }
    } finally {
      bytes.fill(0);
    }
    expect(() => receiptTestSeams
      .reconcileReceiptDirectory(tempDirectory)).toThrow(
      'PRODUCTION_PLAYER_CANARY_RECEIPT_DIRECTORY_CONTENT_INVALID',
    );
    expect(readdirSync(tempDirectory)).toHaveLength(2);
  });

  it('rejects every semantic downgrade and private field', () => {
    const cases: Array<(value: ReturnType<typeof receipt>) => void> = [
      value => { value.predecessor.phaseTuple = 'FT|TTFT|TT|TT|1|1|NNP'; },
      value => { value.predecessor.releaseVersion = '0.3.44'; },
      value => { value.predecessor.worldClientPresentationEnabled = true; },
      value => { value.predecessor.worldServerPresentationEnabled = true; },
      value => { value.evidenceAuthority = { ...value.evidenceAuthority, normalRequestAdmission: false } as unknown as typeof value.evidenceAuthority; },
      value => { value.evidenceAuthority = { ...value.evidenceAuthority, exactlyOnceNotification: false } as unknown as typeof value.evidenceAuthority; },
      value => { value.evidenceAuthority = { ...value.evidenceAuthority, sameAdmissionGeneration: false } as unknown as typeof value.evidenceAuthority; },
      value => { value.evidenceAuthority = { ...value.evidenceAuthority, directTierOneFounder: false } as unknown as typeof value.evidenceAuthority; },
      value => { value.evidenceAuthority = { ...value.evidenceAuthority, workerCount: 3 } as unknown as typeof value.evidenceAuthority; },
      value => { value.evidenceAuthority = { ...value.evidenceAuthority, terminalGraphEmpty: false } as unknown as typeof value.evidenceAuthority; },
      value => { value.evidenceAuthority = { ...value.evidenceAuthority, subject: 'private' } as unknown as typeof value.evidenceAuthority; },
    ];
    for (const mutate of cases) {
      const value = receipt();
      mutate(value);
      expect(() => parseProductionPlayerCanaryReceipt(value)).toThrowError(
        ProductionPlayerCanaryReceiptError,
      );
    }
  });

  it('rejects noncanonical bytes, stale/future/cutoff drift, and source/root drift', () => {
    const value = receipt();
    for (const mutateInspect of [
      (directory: string) => receiptTestSeams.inspectActivationAuthority({
        binding: bindingFor(value), directory,
        expectedPredecessorPagesSourceCommit: 'd'.repeat(40),
        expectedProtectedTree: TREE,
        expectedLiveReceiptDigest: LIVE,
        expectedLivePagesSourceCommit: COMMIT,
        expectedLiveRootReceiptDigest: ROOT,
        expectedLiveRootPagesSourceCommit: ROOT_COMMIT,
        expectedEvidenceAuthority: value.evidenceAuthority,
      }, NOW),
      (directory: string) => receiptTestSeams.inspectActivationAuthority({
        binding: bindingFor(value), directory,
        expectedPredecessorPagesSourceCommit: COMMIT,
        expectedProtectedTree: 'd'.repeat(40),
        expectedLiveReceiptDigest: LIVE,
        expectedLivePagesSourceCommit: COMMIT,
        expectedLiveRootReceiptDigest: ROOT,
        expectedLiveRootPagesSourceCommit: ROOT_COMMIT,
        expectedEvidenceAuthority: value.evidenceAuthority,
      }, NOW),
      (directory: string) => receiptTestSeams.inspectActivationAuthority({
        binding: bindingFor(value), directory,
        expectedPredecessorPagesSourceCommit: COMMIT,
        expectedProtectedTree: TREE,
        expectedLiveReceiptDigest: LIVE,
        expectedLivePagesSourceCommit: COMMIT,
        expectedLiveRootReceiptDigest: 'd'.repeat(64),
        expectedLiveRootPagesSourceCommit: ROOT_COMMIT,
        expectedEvidenceAuthority: value.evidenceAuthority,
      }, NOW),
      (directory: string) => receiptTestSeams.inspectActivationAuthority({
        binding: bindingFor(value), directory,
        expectedPredecessorPagesSourceCommit: COMMIT,
        expectedProtectedTree: TREE,
        expectedLiveReceiptDigest: LIVE,
        expectedLivePagesSourceCommit: COMMIT,
        expectedLiveRootReceiptDigest: ROOT,
        expectedLiveRootPagesSourceCommit: ROOT_COMMIT,
        expectedEvidenceAuthority: value.evidenceAuthority,
      }, Date.parse('2026-08-13T11:59:59.999Z')),
      (directory: string) => receiptTestSeams.inspectActivationAuthority({
        binding: bindingFor(value), directory,
        expectedPredecessorPagesSourceCommit: COMMIT,
        expectedProtectedTree: TREE,
        expectedLiveReceiptDigest: LIVE,
        expectedLivePagesSourceCommit: COMMIT,
        expectedLiveRootReceiptDigest: ROOT,
        expectedLiveRootPagesSourceCommit: ROOT_COMMIT,
        expectedEvidenceAuthority: value.evidenceAuthority,
      }, Date.parse('2026-08-13T13:00:00.001Z')),
    ]) {
      const directory = privateDirectory();
      installProductionPlayerCanaryReceipt({
        directory, evidenceAuthority: value.evidenceAuthority,
        randomId: () => 'f'.repeat(32),
      });
      expect(() => mutateInspect(directory)).toThrowError(ProductionPlayerCanaryReceiptError);
    }

    const noncanonicalDirectory = privateDirectory();
    const binding = bindingFor(value);
    const path = join(
      noncanonicalDirectory,
      `production-player-canary-${binding.productionPlayerCanaryReceiptDigest}.json`,
    );
    writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
    expect(() => inspect(noncanonicalDirectory, value)).toThrowError(
      ProductionPlayerCanaryReceiptError,
    );
  });

  it('rejects symlink, hard-link, wrong-mode, and wrong-address receipts', () => {
    const value = receipt();
    for (const attack of ['symlink', 'hardlink', 'mode', 'address'] as const) {
      const directory = privateDirectory();
      const bytes = canonicalProductionPlayerCanaryReceiptBytes(value);
      const binding = bindingFor(value);
      const path = join(
        directory,
        `production-player-canary-${binding.productionPlayerCanaryReceiptDigest}.json`,
      );
      if (attack === 'symlink') {
        const target = join(directory, 'target');
        writeFileSync(target, bytes, { mode: 0o600 });
        symlinkSync(target, path);
      } else {
        writeFileSync(path, attack === 'address' ? Buffer.concat([bytes, Buffer.from(' ')]) : bytes, {
          mode: attack === 'mode' ? 0o644 : 0o600,
        });
        if (attack === 'hardlink') linkSync(path, join(directory, 'second-link'));
      }
      bytes.fill(0);
      expect(() => inspect(directory, value)).toThrowError(ProductionPlayerCanaryReceiptError);
    }
  });

  it('proves four distinct natural one-quantum journeys and exact isolated deltas', () => {
    const kinds = ['food', 'wood', 'stone', 'gold'] as const;
    const before = {
      tier: 1,
      atlasRevision: 7n,
      observedAtMicros: 1n,
      workers: kinds.map((_kind, index) => ({
        ordinal: index + 1,
        status: 'idle' as const,
        resourceKind: '' as const,
        accruedAmount: 0n,
        materializedAmount: 0n,
        availableAmount: 0n,
      })),
      resources: { food: 10n, wood: 20n, stone: 30n, gold: 40n },
    };
    const after = {
      ...before,
      observedAtMicros: 300_000_001n,
      resources: Object.fromEntries(kinds.map(kind => [
        kind, before.resources[kind] + workerResourcePolicy(kind).ratePerQuantum,
      ])) as Record<typeof kinds[number], bigint>,
    };
    const proof = verifyProductionPlayerCanaryProof({
      before,
      routes: kinds.map(kind => ({ resourceKind: kind, routeLength: 3, nodeCount: 8 })),
      dispatched: kinds.map((kind, index) => ({
        ordinal: index + 1, resourceKind: kind, accepted: true,
      })),
      replayStateUnchanged: [true, true, true, true],
      gatheringObservations: kinds.map((kind, index) => ({
        ordinal: index + 1,
        resourceKind: kind,
        gatheringElapsedMs: 60_000 + index,
        completedQuantumCount: 1,
      })),
      after,
    });
    expect(proof).toMatchObject({
      workerCount: 4,
      distinctReachableResourceKindCount: 4,
      dispatchAcceptedCount: 4,
      idempotentReplayCount: 4,
      minimumGatheringElapsedMs: 60_000,
      returnedIdleWorkerCount: 4,
      isolatedResourceKindCount: 4,
      resourceQuantumCount: 4,
    });
    expect(proof.workerJourneyDigest).toMatch(/^[0-9a-f]{64}$/u);

    const changed = {
      ...after,
      resources: { ...after.resources, gold: after.resources.gold + 1n },
    };
    expect(() => verifyProductionPlayerCanaryProof({
      before,
      routes: kinds.map(kind => ({ resourceKind: kind, routeLength: 3, nodeCount: 8 })),
      dispatched: kinds.map((kind, index) => ({
        ordinal: index + 1, resourceKind: kind, accepted: true,
      })),
      replayStateUnchanged: [true, true, true, true],
      gatheringObservations: kinds.map((kind, index) => ({
        ordinal: index + 1, resourceKind: kind,
        gatheringElapsedMs: 60_000, completedQuantumCount: 1,
      })),
      after: changed,
    })).toThrowError(ProductionPlayerCanaryCoreError);

    const canonicalInput = {
      before,
      routes: kinds.map(kind => ({ resourceKind: kind, routeLength: 3, nodeCount: 8 })),
      dispatched: kinds.map((kind, index) => ({
        ordinal: index + 1, resourceKind: kind, accepted: true,
      })),
      replayStateUnchanged: [true, true, true, true],
      gatheringObservations: kinds.map((kind, index) => ({
        ordinal: index + 1, resourceKind: kind,
        gatheringElapsedMs: 60_000, completedQuantumCount: 1,
      })),
      after,
    } as const;
    expect(() => verifyProductionPlayerCanaryProof({
      ...canonicalInput,
      dispatched: canonicalInput.dispatched.map((row, index) => ({
        ...row,
        resourceKind: canonicalInput.dispatched[(index + 1) % 4]!.resourceKind,
      })),
    })).toThrowError(ProductionPlayerCanaryCoreError);
    expect(() => verifyProductionPlayerCanaryProof({
      ...canonicalInput,
      gatheringObservations: canonicalInput.gatheringObservations.map((row, index) => ({
        ...row,
        resourceKind: canonicalInput.gatheringObservations[(index + 1) % 4]!.resourceKind,
      })),
    })).toThrowError(ProductionPlayerCanaryCoreError);
    expect(() => verifyProductionPlayerCanaryProof({
      ...canonicalInput,
      gatheringObservations: canonicalInput.gatheringObservations.map((row, index) => ({
        ...row,
        gatheringElapsedMs: index === 0 ? 120_000 : row.gatheringElapsedMs,
      })),
    })).toThrowError(ProductionPlayerCanaryCoreError);
  });
});

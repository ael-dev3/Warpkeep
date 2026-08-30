// @vitest-environment node

import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  SEALED_REALMS_OPERATIONS,
  authenticateSealedRealmsProductionSourceAuthority,
} from '../scripts/sealed-realms-production-source-authority.mjs';
import {
  collectGenesis001AdmittedPlayerCensus,
} from '../scripts/genesis001-admitted-player-census.mjs';
import {
  genesis001CensusOpaqueProofDigest,
} from '../scripts/genesis001-sealed-launch-adoption.mjs';
import {
  createSealedRealmsProductionPrivateState,
} from '../scripts/sealed-realms-production-private-state.mjs';
import {
  createSealedRealmsProductionG001CensusAuthority,
  createSealedRealmsProductionG001LaunchAuthority,
  createSealedRealmsProductionG001Lane,
  createSealedRealmsProductionG001CurrentStateTestAdapter,
  inspectSealedRealmsProductionG001CurrentState,
} from '../scripts/sealed-realms-production-g001-lane-entry.mjs';
import {
  SealedRealmsProductionDispatcherError,
  createSealedRealmsProductionDispatcher,
} from '../scripts/sealed-realms-production-dispatch.mjs';
import type {
  SealedRealmsProductionSafeStatus,
} from '../scripts/sealed-realms-production-dispatch.mjs';

const task6eUnavailableStatus: SealedRealmsProductionSafeStatus =
  'SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE';
void task6eUnavailableStatus;

const SOURCE = 'a'.repeat(40);
const SWAPPED_SOURCE = 'c'.repeat(40);
const MODULE_TREE = 'b'.repeat(40);
const BOOTSTRAP_BLOB = 'c'.repeat(40);
const BOOTSTRAP_SHA256 = 'be9efaf1ecad13c2cd94bfb457353b8946f12b3304f47b34e8b9422041712c1a';
const ADMIN_SECRET_PATH = '/private/warpkeep/admin-secret';
const BOOTSTRAP_BYTES = readFileSync(
  new URL('../scripts/greater-realm-production-bootstrap.mjs', import.meta.url),
);
const ENVELOPE_BLOB = '62690134fd5de632e7831eca0b213eab101d4275';
const ENVELOPE_BYTES = readFileSync(
  new URL('../docs/operations/genesis-001-policy-observation-launch-envelope.sh.txt', import.meta.url),
);

function lifecycleSummary(runId: string, input: Readonly<{
  authorityPhase?: string | null;
  runState?: 'present' | 'absent';
}> = {}) {
  return {
    authorityPhase: input.authorityPhase ?? null,
    authorityPublication: null,
    blockers: [],
    childState: 'absent',
    containmentEligible: false,
    launchPhase: null,
    launchPublication: null,
    ownerState: 'dead',
    processGroupState: 'absent',
    repairableLaunchTemporaryCount: 0,
    repairablePartialAuthorityCount: 0,
    runId,
    runState: input.runState ?? 'present',
  };
}

function emptyLifecycleInventory() {
  return {
    profile: 'warpkeep-greater-realm-production-launch-lifecycle-v1',
    runs: [],
  };
}

function lifecycleDetail(runId: string, confirmationDigest: string) {
  const summary = lifecycleSummary(runId, { authorityPhase: 'launch-installed' });
  return {
    authorityPhase: summary.authorityPhase,
    authorityPublication: summary.authorityPublication,
    blockers: summary.blockers,
    childState: summary.childState,
    cleanupEligible: true,
    confirmationDigest,
    containmentEligible: summary.containmentEligible,
    deletionEligible: true,
    launchPhase: summary.launchPhase,
    launchPublication: summary.launchPublication,
    ownerState: summary.ownerState,
    processGroupState: summary.processGroupState,
    profile: 'warpkeep-greater-realm-production-launch-lifecycle-v1',
    repairableLaunchTemporaryCount: summary.repairableLaunchTemporaryCount,
    repairablePartialAuthorityCount: summary.repairablePartialAuthorityCount,
    runId: summary.runId,
    runState: summary.runState,
    treeInventory: {},
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function updateLengthFramed(hash: ReturnType<typeof createHash>, label: string, value: string) {
  const labelBytes = Buffer.from(label, 'utf8');
  const valueBytes = Buffer.from(value, 'utf8');
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(labelBytes.byteLength));
  hash.update(length).update(labelBytes);
  length.writeBigUInt64BE(BigInt(valueBytes.byteLength));
  hash.update(length).update(valueBytes);
}

function policyObservationReceipt(sourceCommit = SOURCE) {
  return {
    schemaVersion: 1,
    profile: 'warpkeep-genesis-001-live-policy-observation-v1',
    sourceCommit,
    observedAt: '2026-08-30T12:00:00.000Z',
    databaseIdentity: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
    procedure: 'genesis_001_access_policy_v1',
    mutationSubmitted: false,
    policy: {
      realmId: 'GENESIS_001',
      releaseVersion: '0.3.43',
      playerAccessEnabled: true,
      admissionStateMutationsEnabled: false,
      accessRequestSubmissionsEnabled: false,
      sourceBaselineCommit: '2ae51984e1fa6ce5b0028c1a250359fed79d819b',
      freezeReleaseNonce: '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00',
    },
    policyReceiptDigest: 'acf64ca8f02dcfc1e2a162067d2132d02a7155bebe8895c56a85dbbfefd35b60',
  };
}

function bootstrapPolicyObservationReceipt(input: Readonly<{
  cleanup?: Readonly<Record<string, unknown>>;
  sourceCommit?: string;
  tree?: string;
  blob?: string;
  sha256?: string;
  policy?: Readonly<Record<string, unknown>>;
}> = {}) {
  const launchCleanup = input.cleanup ?? {
    outcome: 'cleaned',
    runId: `run-${'f'.repeat(32)}`,
    cleanupConfirmationSha256: 'e'.repeat(64),
    treeInventorySha256: 'd'.repeat(64),
  };
  const policy = input.policy ?? policyObservationReceipt(input.sourceCommit ?? SOURCE);
  const receipt = {
    profile: 'warpkeep-greater-realm-production-bootstrap-v1',
    protectedCommit: input.sourceCommit ?? SOURCE,
    moduleTreeId: input.tree ?? MODULE_TREE,
    bootstrapBlob: input.blob ?? BOOTSTRAP_BLOB,
    bootstrapSha256: input.sha256 ?? BOOTSTRAP_SHA256,
    moduleArchiveCount: 16,
    command: 'g001-policy-observe',
    launchCleanup,
    policyObservationReceipt: policy,
  };
  const hash = createHash('sha256');
  updateLengthFramed(hash, 'domain', 'warpkeep-production-g001-policy-observation-bootstrap-link-v1');
  updateLengthFramed(hash, 'protectedCommit', receipt.protectedCommit);
  updateLengthFramed(hash, 'moduleTreeId', receipt.moduleTreeId);
  updateLengthFramed(hash, 'bootstrapBlob', receipt.bootstrapBlob);
  updateLengthFramed(hash, 'bootstrapSha256', receipt.bootstrapSha256);
  updateLengthFramed(hash, 'command', 'g001-policy-observe');
  updateLengthFramed(hash, 'launchCleanup', `${JSON.stringify(canonical(receipt.launchCleanup))}\n`);
  updateLengthFramed(hash, 'policyObservationReceipt', `${JSON.stringify(receipt.policyObservationReceipt)}\n`);
  return {
    ...receipt,
    policyObservationReceiptLinkSha256: hash.digest('hex'),
  };
}

function g001LaunchAuthority(input: Readonly<{
  readRawGit?: (args: readonly string[]) => string | Uint8Array;
  resolveAdminSecretPath?: (context: Readonly<{ sourceCommit: string }>) => Readonly<{
    sourceCommit: string;
    path: string;
  }>;
  persistPolicyObservation?: (input: Readonly<{ sourceCommit: string; bytes: Uint8Array }>) => unknown;
}> = {}) {
  return createSealedRealmsProductionG001LaunchAuthority({
    readRawGit: input.readRawGit ?? ((args) => {
      if (JSON.stringify(args) === JSON.stringify(['rev-parse', '--verify', `${SOURCE}^{tree}`])) {
        return `${MODULE_TREE}\n`;
      }
      if (JSON.stringify(args) === JSON.stringify([
        'rev-parse', '--verify', `${SOURCE}:scripts/greater-realm-production-bootstrap.mjs`,
      ])) return `${BOOTSTRAP_BLOB}\n`;
      if (JSON.stringify(args) === JSON.stringify(['cat-file', 'blob', BOOTSTRAP_BLOB])) {
        return BOOTSTRAP_BYTES;
      }
      if (JSON.stringify(args) === JSON.stringify([
        'rev-parse', '--verify',
        `${SOURCE}:docs/operations/genesis-001-policy-observation-launch-envelope.sh.txt`,
      ])) return `${ENVELOPE_BLOB}\n`;
      if (JSON.stringify(args) === JSON.stringify(['cat-file', 'blob', ENVELOPE_BLOB])) {
        return ENVELOPE_BYTES;
      }
      throw new Error('unexpected raw Git proof');
    }),
    resolveAdminSecretPath: input.resolveAdminSecretPath ?? (({ sourceCommit }) => ({
      sourceCommit,
      path: ADMIN_SECRET_PATH,
    })),
    persistPolicyObservation: input.persistPolicyObservation ?? (() => {}),
  });
}

function g001PolicyAuthority() {
  return authenticateSealedRealmsProductionSourceAuthority({
    operation: 'g001-policy-observe',
    workflowInputSha: SOURCE,
    readGit: args => args[0] === 'rev-parse' ? `${SOURCE}\n` : (() => { throw new Error('git'); })(),
    readBinding: () => ({
      schemaVersion: 1,
      profile: 'warpkeep-0.4.0-sealed-launch-v1',
      pagesDeploymentApproved: false,
      preparationSourceCommit: SOURCE,
    }),
    verifyEvidence: verifiedSha => ({ verifiedSha }),
  });
}

function g001Node() {
  return {
    path: '/private/var/db/warpkeep/runtime/node-v22.22.3-darwin-arm64/bin/node',
    version: 'v22.22.3',
    sha256: '5d9d3872911e2340a43b707962e68143de8a4e8d54628845c0c4f2de1fb7cd5c',
    teamId: 'HX7739G8FX',
  } as const;
}

function g001Authority(operation:
  | 'g001-census-first'
  | 'g001-census-second-inspect'
  | 'g001-census-second-suspend',
) {
  return authenticateSealedRealmsProductionSourceAuthority({
    operation,
    workflowInputSha: SOURCE,
    readGit: args => args[0] === 'rev-parse' ? `${SOURCE}\n` : (() => { throw new Error('git'); })(),
    readBinding: () => ({
      schemaVersion: 1,
      profile: 'warpkeep-0.4.0-sealed-launch-v1',
      pagesDeploymentApproved: false,
      preparationSourceCommit: SOURCE,
    }),
    verifyEvidence: verifiedSha => ({ verifiedSha }),
  });
}

function censusPrivateState() {
  const home = mkdtempSync(join(tmpdir(), 'warpkeep-g001-census-'));
  for (const root of [
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'audit', 'private'),
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'runtime'),
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'cache'),
  ]) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
  }
  return {
    state: createSealedRealmsProductionPrivateState({
      reportedHome: home,
      testOnlyOwnerUid: statSync(home).uid,
      testOnlyFsync: () => {},
      testOnlyAllowPlatformMode: true,
    }),
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  };
}

function applicantCensusProof(stamp: string, nonce: string) {
  const proof = {
    schemaVersion: 1,
    profile: 'warpkeep-genesis-001-census-export-private-proof-v1',
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    sourceCommit: SOURCE,
    privateCensusReference: {
      count: 1,
      pathBasename: `warpkeep-access-request-census-${stamp}.txt`,
      sha256: 'b'.repeat(64),
      size: 64,
    },
    privateBlindingNonceHex: nonce,
  };
  return {
    ...proof,
    opaqueProofDigest: genesis001CensusOpaqueProofDigest(proof),
  };
}

async function admittedCensusProof(observedAt: string, nonceByte: number, fid = '1') {
  return collectGenesis001AdmittedPlayerCensus({
    preparationSourceCommit: SOURCE,
    observedAt,
    readAggregates: () => ({ allowedFids: '1', enabledAllowedFids: '1' }),
    queryPreferred: () => ({
      outcome: 'exact-query-supported' as const,
      output: Buffer.from(`fid\tenabled\tauth_epoch\n${fid}\ttrue\t1\n`, 'utf8'),
    }),
    randomBytes: () => Buffer.alloc(32, nonceByte),
  });
}

async function censusScenario(input: Readonly<{
  applicantSecondStamp?: string;
  applicantSecondNonce?: string;
  applicantSecondSha?: string;
  admittedSecondObservedAt?: string;
  admittedSecondNonceByte?: number;
  admittedSecondFid?: string;
  firstApplicant?: Record<string, unknown>;
  now?: number;
}> = {}) {
  const local = censusPrivateState();
  let clock = input.now ?? Date.parse('2026-08-30T00:01:00.000Z');
  const firstApplicant = input.firstApplicant ?? applicantCensusProof('20260830T000000Z', '1'.repeat(64));
  const secondApplicant = {
    ...applicantCensusProof(
      input.applicantSecondStamp ?? '20260830T000100Z',
      input.applicantSecondNonce ?? '2'.repeat(64),
    ),
    privateCensusReference: {
      count: 1,
      pathBasename: `warpkeep-access-request-census-${input.applicantSecondStamp ?? '20260830T000100Z'}.txt`,
      sha256: input.applicantSecondSha ?? 'b'.repeat(64),
      size: 64,
    },
  };
  secondApplicant.opaqueProofDigest = genesis001CensusOpaqueProofDigest({
    schemaVersion: secondApplicant.schemaVersion,
    profile: secondApplicant.profile,
    realmId: secondApplicant.realmId,
    releaseVersion: secondApplicant.releaseVersion,
    sourceCommit: secondApplicant.sourceCommit,
    privateCensusReference: secondApplicant.privateCensusReference,
    privateBlindingNonceHex: secondApplicant.privateBlindingNonceHex,
  });
  const samples = [
    {
      applicant: firstApplicant,
      admitted: await admittedCensusProof('2026-08-30T00:00:00.000Z', 3),
    },
    {
      applicant: secondApplicant,
      admitted: await admittedCensusProof(
        input.admittedSecondObservedAt ?? '2026-08-30T00:01:00.000Z',
        input.admittedSecondNonceByte ?? 4,
        input.admittedSecondFid ?? '1',
      ),
    },
  ];
  let collection = 0;
  const suspend = vi.fn(async () => {});
  const censusAuthority = createSealedRealmsProductionG001CensusAuthority({
    privateState: local.state,
    collect: async () => samples[collection++]!,
    suspend,
    now: () => new Date(clock),
  });
  return {
    local,
    suspend,
    setClock: (value: number) => { clock = value; },
    getCollection: () => collection,
    lane: g001PolicyLane({
      censusAuthority,
      runEnvelopeChild: async () => ({ status: 0, stdout: '', stderr: '' }),
    }),
  };
}

async function issueCensusConfirmation(scenario: Awaited<ReturnType<typeof censusScenario>>) {
  const first = await scenario.lane.execute({
    operation: 'g001-census-first', authority: g001Authority('g001-census-first'),
  });
  if (first.confirmation === undefined) throw new Error('missing first confirmation');
  const second = await scenario.lane.execute({
    operation: 'g001-census-second-inspect',
    authority: g001Authority('g001-census-second-inspect'),
    input: { confirmation: first.confirmation },
  });
  if (second.confirmation === undefined) throw new Error('missing second confirmation');
  return { first, second };
}

function g001PolicyLane(input: Readonly<{
  launchAuthority?: ReturnType<typeof g001LaunchAuthority>;
  attestDispatcherNode?: () => unknown;
  censusAuthority?: unknown;
  runEnvelopeChild: (request: { args: readonly string[] }) => Promise<{
    status: number;
    stdout: string;
    stderr: string;
  }>;
}>) {
  return createSealedRealmsProductionG001Lane({
    launchAuthority: input.launchAuthority ?? g001LaunchAuthority(),
    attestDispatcherNode: input.attestDispatcherNode ?? g001Node,
    runEnvelopeChild: input.runEnvelopeChild,
    censusAuthority: input.censusAuthority,
    currentState: {
      runChild: async () => ({ status: 0, stdout: `${SOURCE}\n`, stderr: '' }),
      readFixedFile: ({ kind }: { kind: string }) => ({
        kind,
        sha256: kind === 'plist'
          ? 'a85b1eb4810ed798185f762044d3dac9d29ebee15a09b95bfb2ddbb6de71acaf'
          : '1479a2b5fff85d15f8c04175962dfb898023d14cf418e27b7c1332202cb56de6',
        byteLength: 1,
        body: Buffer.from('x'),
      }),
      resolveAccountUid: () => 501,
      resolveAccountHome: () => '/owner',
      testOnlyAdapter: undefined,
    },
    preflight: async () => {},
  } as never);
}

function dispatcherFixture() {
  const execute = vi.fn(async (_input: {
    operation: string;
    authority?: unknown;
    input?: unknown;
  }) => ({
    status: 'completed' as const,
  }));
  const verifyEvidence = vi.fn((verifiedSha: string) => ({ verifiedSha }));
  return {
    execute,
    verifyEvidence,
    dispatcher: createSealedRealmsProductionDispatcher({
      readGit: (args) => {
        if (args[0] === 'rev-parse') return `${SOURCE}\n`;
        throw new Error('unexpected git command');
      },
      readBinding: () => ({
        schemaVersion: 1,
        profile: 'warpkeep-0.4.0-sealed-launch-v1',
        pagesDeploymentApproved: false,
        preparationSourceCommit: SOURCE,
      }),
      verifyEvidence,
      testOnlyLanes: {
        g001: { execute },
        g002: { execute },
        ptr: { execute },
        activation: { execute },
      },
    }),
  };
}

describe('sealed-realms production dispatcher', () => {
  it('authenticates exact raw-Git envelope bytes before secret resolution or child execution', async () => {
    const secret = vi.fn(() => ({ sourceCommit: SOURCE, path: ADMIN_SECRET_PATH }));
    const child = vi.fn(async () => ({ status: 0, stdout: '', stderr: '' }));
    const mutated = Buffer.from(ENVELOPE_BYTES);
    mutated[mutated.byteLength - 1] ^= 1;
    const launchAuthority = g001LaunchAuthority({
      readRawGit: (args) => {
        if (JSON.stringify(args) === JSON.stringify(['rev-parse', '--verify', `${SOURCE}^{tree}`])) {
          return `${MODULE_TREE}\n`;
        }
        if (JSON.stringify(args) === JSON.stringify([
          'rev-parse', '--verify', `${SOURCE}:scripts/greater-realm-production-bootstrap.mjs`,
        ])) return `${BOOTSTRAP_BLOB}\n`;
        if (JSON.stringify(args) === JSON.stringify(['cat-file', 'blob', BOOTSTRAP_BLOB])) {
          return BOOTSTRAP_BYTES;
        }
        if (JSON.stringify(args) === JSON.stringify([
          'rev-parse', '--verify',
          `${SOURCE}:docs/operations/genesis-001-policy-observation-launch-envelope.sh.txt`,
        ])) return `${ENVELOPE_BLOB}\n`;
        if (JSON.stringify(args) === JSON.stringify(['cat-file', 'blob', ENVELOPE_BLOB])) {
          return mutated;
        }
        throw new Error('unexpected raw Git proof');
      },
      resolveAdminSecretPath: secret,
    });
    const lane = createSealedRealmsProductionG001Lane({
      launchAuthority,
      attestDispatcherNode: g001Node,
      runEnvelopeChild: child,
      censusAuthority: undefined,
      currentState: {
        runChild: async () => ({ status: 0, stdout: `${SOURCE}\n`, stderr: '' }),
        readFixedFile: () => { throw new Error('unreached'); },
        resolveAccountUid: () => 501,
        resolveAccountHome: () => '/owner',
        testOnlyAdapter: undefined,
      },
      preflight: async () => {},
    } as never);
    const original = globalThis.WebSocket;
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: function WebSocket() {} });
    try {
      await expect(lane.execute({
        operation: 'g001-policy-observe', authority: g001PolicyAuthority(),
      })).rejects.toMatchObject({ code: 'SEALED_REALMS_G001_ENVELOPE_INVALID' });
      expect(secret).not.toHaveBeenCalled();
      expect(child).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original });
      mutated.fill(0);
    }
  });

  it('uses the receipt-derived G001 envelope argv under the fixed Node 22 dispatcher', async () => {
    const authority = authenticateSealedRealmsProductionSourceAuthority({
      operation: 'g001-policy-observe',
      workflowInputSha: SOURCE,
      readGit: args => args[0] === 'rev-parse' ? `${SOURCE}\n` : (() => { throw new Error('git'); })(),
      readBinding: () => ({
        schemaVersion: 1,
        profile: 'warpkeep-0.4.0-sealed-launch-v1',
        pagesDeploymentApproved: false,
        preparationSourceCommit: SOURCE,
      }),
      verifyEvidence: verifiedSha => ({ verifiedSha }),
    });
    const launchAuthority = g001LaunchAuthority();
    let invocation = 0;
    const runner = vi.fn(async () => {
      invocation += 1;
      return {
        status: 0,
        stdout: `${JSON.stringify(invocation === 1
          ? emptyLifecycleInventory()
          : bootstrapPolicyObservationReceipt())}\n`,
        stderr: '',
      };
    });
    const lane = createSealedRealmsProductionG001Lane({
      launchAuthority,
      attestDispatcherNode: () => ({
        path: '/private/var/db/warpkeep/runtime/node-v22.22.3-darwin-arm64/bin/node',
        version: 'v22.22.3',
        sha256: '5d9d3872911e2340a43b707962e68143de8a4e8d54628845c0c4f2de1fb7cd5c',
        teamId: 'HX7739G8FX',
      }),
      runEnvelopeChild: runner,
      censusAuthority: undefined,
      currentState: {
        runChild: async () => ({ status: 0, stdout: `${SOURCE}\n`, stderr: '' }),
        readFixedFile: ({ kind }: { kind: string }) => ({
          kind,
          sha256: kind === 'plist'
            ? 'a85b1eb4810ed798185f762044d3dac9d29ebee15a09b95bfb2ddbb6de71acaf'
            : '1479a2b5fff85d15f8c04175962dfb898023d14cf418e27b7c1332202cb56de6',
          byteLength: 1,
          body: Buffer.from('x'),
        }),
        resolveAccountUid: () => 501,
        resolveAccountHome: () => '/owner',
        testOnlyAdapter: undefined,
      },
      preflight: async () => {},
    } as never);
    const original = globalThis.WebSocket;
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: function WebSocket() {} });
    try {
      await expect(lane.execute({ operation: 'g001-policy-observe', authority }))
        .resolves.toEqual({ status: 'completed' });
      expect(runner).toHaveBeenCalledWith({
        file: '/usr/bin/env',
        args: [
          '-i', '/bin/sh', '-c', ENVELOPE_BYTES.toString('utf8'),
          'warpkeep-production', SOURCE, MODULE_TREE, BOOTSTRAP_BLOB, BOOTSTRAP_SHA256,
          '/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node', '-', '-',
          ADMIN_SECRET_PATH, '-', '-', 'g001-policy-observe',
        ],
        shell: false,
        env: {},
      });
    } finally {
      Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original });
    }
  });

  it('runs G001 policy only through the fixed signed Node 22 envelope boundary', async () => {
    const authority = authenticateSealedRealmsProductionSourceAuthority({
      operation: 'g001-policy-observe',
      workflowInputSha: SOURCE,
      readGit: args => args[0] === 'rev-parse' ? `${SOURCE}\n` : (() => { throw new Error('git'); })(),
      readBinding: () => ({
        schemaVersion: 1,
        profile: 'warpkeep-0.4.0-sealed-launch-v1',
        pagesDeploymentApproved: false,
        preparationSourceCommit: SOURCE,
      }),
      verifyEvidence: verifiedSha => ({ verifiedSha }),
    });
    const launchAuthority = g001LaunchAuthority();
    let envelopeInvocation = 0;
    const envelopeRunner = vi.fn(async () => {
      envelopeInvocation += 1;
      return {
        status: 0,
        stdout: `${JSON.stringify(envelopeInvocation === 1
          ? emptyLifecycleInventory()
          : bootstrapPolicyObservationReceipt())}\n`,
        stderr: '',
      };
    });
    const lane = createSealedRealmsProductionG001Lane({
      launchAuthority,
      attestDispatcherNode: () => ({
        path: '/private/var/db/warpkeep/runtime/node-v22.22.3-darwin-arm64/bin/node',
        version: 'v22.22.3',
        sha256: '5d9d3872911e2340a43b707962e68143de8a4e8d54628845c0c4f2de1fb7cd5c',
        teamId: 'HX7739G8FX',
      }),
      runEnvelopeChild: envelopeRunner,
      censusAuthority: undefined,
      currentState: {
        runChild: async () => ({ status: 0, stdout: `${SOURCE}\n`, stderr: '' }),
        readFixedFile: ({ kind }: { kind: string }) => ({
          kind,
          sha256: kind === 'plist'
            ? 'a85b1eb4810ed798185f762044d3dac9d29ebee15a09b95bfb2ddbb6de71acaf'
            : '1479a2b5fff85d15f8c04175962dfb898023d14cf418e27b7c1332202cb56de6',
          byteLength: 1,
          body: Buffer.from('x'),
        }),
        resolveAccountUid: () => 501,
        resolveAccountHome: () => '/owner',
        testOnlyAdapter: undefined,
      },
      preflight: async () => {},
    } as never);
    const original = globalThis.WebSocket;
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: function WebSocket() {} });
    try {
      await expect(lane.execute({ operation: 'g001-policy-observe', authority }))
        .resolves.toEqual({ status: 'completed' });
      expect(envelopeRunner).toHaveBeenCalledWith(expect.objectContaining({
        file: '/usr/bin/env',
        args: [
          '-i', '/bin/sh', '-c', ENVELOPE_BYTES.toString('utf8'),
          'warpkeep-production', SOURCE, MODULE_TREE, BOOTSTRAP_BLOB, BOOTSTRAP_SHA256,
          '/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node', '-', '-',
          ADMIN_SECRET_PATH, '-', '-', 'g001-policy-observe',
        ],
        shell: false,
      }));
    } finally {
      Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original });
    }
  });

  it('owns frozen-envelope launch inspection and confirmed cleanup before a fresh G001 observation', async () => {
    const authority = authenticateSealedRealmsProductionSourceAuthority({
      operation: 'g001-policy-observe',
      workflowInputSha: SOURCE,
      readGit: args => args[0] === 'rev-parse' ? `${SOURCE}\n` : (() => { throw new Error('git'); })(),
      readBinding: () => ({
        schemaVersion: 1,
        profile: 'warpkeep-0.4.0-sealed-launch-v1',
        pagesDeploymentApproved: false,
        preparationSourceCommit: SOURCE,
      }),
      verifyEvidence: verifiedSha => ({ verifiedSha }),
    });
    const runId = `run-${'a'.repeat(32)}`;
    const cleanupConfirmation = 'e'.repeat(64);
    const runner = vi.fn(async (request: { args: readonly string[] }) => {
      const command = request.args[request.args.length - 1];
      if (command === 'launch-run-inspect') {
        return {
          status: 0,
          stdout: `${JSON.stringify({
            profile: 'warpkeep-greater-realm-production-launch-lifecycle-v1',
            runs: [lifecycleSummary(runId, { authorityPhase: 'launch-installed' })],
          })}\n`,
          stderr: '',
        };
      }
      if (command === runId) {
        return {
          status: 0,
          stdout: `${JSON.stringify(lifecycleDetail(runId, cleanupConfirmation))}\n`,
          stderr: '',
        };
      }
      if (command === cleanupConfirmation) {
        return {
          status: 0,
          stdout: `${JSON.stringify({
            confirmationDigest: cleanupConfirmation,
            outcome: 'cleaned',
            profile: 'warpkeep-greater-realm-production-launch-lifecycle-v1',
            runId,
            runState: 'absent',
          })}\n`,
          stderr: '',
        };
      }
      return {
        status: 0,
        stdout: `${JSON.stringify(bootstrapPolicyObservationReceipt({
          cleanup: {
            outcome: 'cleaned',
            runId,
            cleanupConfirmationSha256: cleanupConfirmation,
            treeInventorySha256: 'd'.repeat(64),
          },
        }))}\n`,
        stderr: '',
      };
    });
    const lane = createSealedRealmsProductionG001Lane({
      launchAuthority: g001LaunchAuthority(),
      attestDispatcherNode: () => ({
        path: '/private/var/db/warpkeep/runtime/node-v22.22.3-darwin-arm64/bin/node',
        version: 'v22.22.3',
        sha256: '5d9d3872911e2340a43b707962e68143de8a4e8d54628845c0c4f2de1fb7cd5c',
        teamId: 'HX7739G8FX',
      }),
      runEnvelopeChild: runner,
      censusAuthority: undefined,
      currentState: {
        runChild: async () => ({ status: 0, stdout: `${SOURCE}\n`, stderr: '' }),
        readFixedFile: ({ kind }: { kind: string }) => ({
          kind,
          sha256: kind === 'plist'
            ? 'a85b1eb4810ed798185f762044d3dac9d29ebee15a09b95bfb2ddbb6de71acaf'
            : '1479a2b5fff85d15f8c04175962dfb898023d14cf418e27b7c1332202cb56de6',
          byteLength: 1,
          body: Buffer.from('x'),
        }),
        resolveAccountUid: () => 501,
        resolveAccountHome: () => '/owner',
        testOnlyAdapter: undefined,
      },
      preflight: async () => {},
    } as never);
    const original = globalThis.WebSocket;
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: function WebSocket() {} });
    try {
      await expect(lane.execute({ operation: 'g001-policy-observe', authority }))
        .resolves.toEqual({ status: 'completed' });
      expect(runner.mock.calls.map(([request]) => request.args.slice(-3))).toEqual([
        ['-', '-', 'launch-run-inspect'],
        ['-', 'launch-run-inspect', runId],
        ['launch-run-cleanup', runId, cleanupConfirmation],
        ['-', '-', 'g001-policy-observe'],
      ]);
      expect(runner.mock.calls.slice(0, 3).every(([request]) => request.args.includes('/private/warpkeep/admin-secret')))
        .toBe(false);
      expect(runner.mock.calls[3]?.[0].args).toContain('/private/warpkeep/admin-secret');
    } finally {
      Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original });
    }
  });

  it('rejects receipt-shaped launch facts and opens neither secret nor raw Git before WebSocket exists', async () => {
    expect(() => createSealedRealmsProductionG001LaunchAuthority({
      readReceipt: () => ({
        protectedMain: SOURCE,
        moduleTree: MODULE_TREE,
        bootstrapBlob: BOOTSTRAP_BLOB,
        bootstrapSha256: BOOTSTRAP_SHA256,
        adminSecretPath: ADMIN_SECRET_PATH,
      }),
    } as never)).toThrow('SEALED_REALMS_G001_LAUNCH_AUTHORITY_INPUT_INVALID');

    const readRawGit = vi.fn(() => `${MODULE_TREE}\n`);
    const resolveAdminSecretPath = vi.fn(() => ({ sourceCommit: SOURCE, path: ADMIN_SECRET_PATH }));
    const runner = vi.fn();
    const lane = g001PolicyLane({
      launchAuthority: g001LaunchAuthority({ readRawGit, resolveAdminSecretPath }),
      runEnvelopeChild: runner,
    });
    const original = globalThis.WebSocket;
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: undefined });
    try {
      await expect(lane.execute({
        operation: 'g001-policy-observe', authority: g001PolicyAuthority(),
      })).rejects.toMatchObject({ code: 'SEALED_REALMS_G001_WEBSOCKET_UNAVAILABLE' });
      expect(readRawGit).not.toHaveBeenCalled();
      expect(resolveAdminSecretPath).not.toHaveBeenCalled();
      expect(runner).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original });
    }
  });

  it('rejects hostile raw-Git, secret-path, and runtime facts before the frozen child launches', async () => {
    const original = globalThis.WebSocket;
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: function WebSocket() {} });
    try {
      const badBootstrapRunner = vi.fn();
      const badBootstrap = g001PolicyLane({
        launchAuthority: g001LaunchAuthority({
          readRawGit: args => args[0] === 'cat-file' ? Buffer.from('hostile')
            : args[2]?.includes(':') ? `${BOOTSTRAP_BLOB}\n` : `${MODULE_TREE}\n`,
        }),
        runEnvelopeChild: badBootstrapRunner,
      });
      await expect(badBootstrap.execute({
        operation: 'g001-policy-observe', authority: g001PolicyAuthority(),
      })).rejects.toMatchObject({ code: 'SEALED_REALMS_G001_LAUNCH_AUTHORITY_INVALID' });
      expect(badBootstrapRunner).not.toHaveBeenCalled();

      const badPathRunner = vi.fn();
      const badPath = g001PolicyLane({
        launchAuthority: g001LaunchAuthority({
          resolveAdminSecretPath: () => ({ sourceCommit: SOURCE, path: '/private/warpkeep/../other' }),
        }),
        runEnvelopeChild: badPathRunner,
      });
      await expect(badPath.execute({
        operation: 'g001-policy-observe', authority: g001PolicyAuthority(),
      })).rejects.toMatchObject({ code: 'SEALED_REALMS_G001_LAUNCH_AUTHORITY_INVALID' });
      expect(badPathRunner).not.toHaveBeenCalled();

      const badRuntimeRawGit = vi.fn();
      const badRuntime = g001PolicyLane({
        launchAuthority: g001LaunchAuthority({ readRawGit: badRuntimeRawGit }),
        attestDispatcherNode: () => ({ ...g001Node(), version: 'v22.22.2' }),
        runEnvelopeChild: vi.fn(),
      });
      await expect(badRuntime.execute({
        operation: 'g001-policy-observe', authority: g001PolicyAuthority(),
      })).rejects.toMatchObject({ code: 'SEALED_REALMS_G001_ENVELOPE_ATTESTATION_INVALID' });
      expect(badRuntimeRawGit).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original });
    }
  });

  it('adopts a completed absent frozen launch without opening policy observation or a private receipt', async () => {
    const runId = `run-${'a'.repeat(32)}`;
    const persistPolicyObservation = vi.fn();
    const runner = vi.fn(async () => ({
      status: 0,
      stdout: `${JSON.stringify({
        profile: 'warpkeep-greater-realm-production-launch-lifecycle-v1',
        runs: [lifecycleSummary(runId, { authorityPhase: 'complete', runState: 'absent' })],
      })}\n`,
      stderr: '',
    }));
    const lane = g001PolicyLane({
      launchAuthority: g001LaunchAuthority({ persistPolicyObservation }),
      runEnvelopeChild: runner,
    });
    const original = globalThis.WebSocket;
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: function WebSocket() {} });
    try {
      await expect(lane.execute({
        operation: 'g001-policy-observe', authority: g001PolicyAuthority(),
      })).resolves.toEqual({ status: 'completed' });
      expect(runner).toHaveBeenCalledTimes(1);
      expect(persistPolicyObservation).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original });
    }
  });

  it('accepts only the full canonical frozen bootstrap receipt and persists it without public leakage', async () => {
    const cases = [
      () => ({ ...bootstrapPolicyObservationReceipt(), unexpected: true }),
      () => ({ ...bootstrapPolicyObservationReceipt(), policyObservationReceiptLinkSha256: '0'.repeat(64) }),
      () => ({
        ...bootstrapPolicyObservationReceipt(),
        policyObservationReceipt: {
          ...policyObservationReceipt(),
          extra: true,
        },
      }),
    ];
    const original = globalThis.WebSocket;
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: function WebSocket() {} });
    try {
      for (const makeReceipt of cases) {
        const persistPolicyObservation = vi.fn();
        let invocation = 0;
        const runner = vi.fn(async () => ({
          status: 0,
          stdout: `${JSON.stringify(invocation++ === 0
            ? emptyLifecycleInventory()
            : makeReceipt())}\n`,
          stderr: '',
        }));
        const lane = g001PolicyLane({
          launchAuthority: g001LaunchAuthority({ persistPolicyObservation }),
          runEnvelopeChild: runner,
        });
        await expect(lane.execute({
          operation: 'g001-policy-observe', authority: g001PolicyAuthority(),
        })).rejects.toMatchObject({ code: 'SEALED_REALMS_G001_ENVELOPE_INVALID' });
        expect(persistPolicyObservation).not.toHaveBeenCalled();
      }

      const persisted: Uint8Array[] = [];
      let invocation = 0;
      const lane = g001PolicyLane({
        launchAuthority: g001LaunchAuthority({
          persistPolicyObservation: ({ bytes }) => { persisted.push(Buffer.from(bytes)); },
        }),
        runEnvelopeChild: async () => ({
          status: 0,
          stdout: `${JSON.stringify(invocation++ === 0
            ? emptyLifecycleInventory()
            : bootstrapPolicyObservationReceipt())}\n`,
          stderr: '',
        }),
      });
      await expect(lane.execute({
        operation: 'g001-policy-observe', authority: g001PolicyAuthority(),
      })).resolves.toEqual({ status: 'completed' });
      expect(persisted).toHaveLength(1);
      expect(Buffer.from(persisted[0]).toString('utf8')).toContain('policyObservationReceiptLinkSha256');
    } finally {
      Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original });
    }
  });

  it('persists and consumes a stable composite G001 census confirmation before one monitor suspension', async () => {
    const local = censusPrivateState();
    let clock = Date.parse('2026-08-30T00:01:00.000Z');
    let collection = 0;
    const collect = vi.fn(async () => {
      collection += 1;
      const first = collection === 1;
      return {
        applicant: applicantCensusProof(
          first ? '20260830T000000Z' : '20260830T000100Z',
          first ? '1'.repeat(64) : '2'.repeat(64),
        ),
        admitted: await admittedCensusProof(
          first ? '2026-08-30T00:00:00.000Z' : '2026-08-30T00:01:00.000Z',
          first ? 3 : 4,
        ),
      };
    });
    const suspend = vi.fn(async () => {});
    const censusAuthority = createSealedRealmsProductionG001CensusAuthority({
      privateState: local.state,
      collect,
      suspend,
      now: () => new Date(clock),
    });
    const lane = g001PolicyLane({
      censusAuthority,
      runEnvelopeChild: async () => ({ status: 0, stdout: '', stderr: '' }),
    });
    const original = globalThis.WebSocket;
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: function WebSocket() {} });
    try {
      const first = await lane.execute({
        operation: 'g001-census-first', authority: g001Authority('g001-census-first'),
      });
      expect(first).toEqual({ status: 'completed', confirmation: {} });
      if (first.confirmation === undefined) throw new Error('missing first confirmation');
      const second = await lane.execute({
        operation: 'g001-census-second-inspect',
        authority: g001Authority('g001-census-second-inspect'),
        input: { confirmation: first.confirmation },
      });
      expect(second).toEqual({ status: 'completed', confirmation: {} });
      expect(JSON.stringify(second)).not.toContain('warpkeep-access-request-census');
      if (second.confirmation === undefined) throw new Error('missing second confirmation');

      const attempts = await Promise.allSettled([
        lane.execute({
          operation: 'g001-census-second-suspend',
          authority: g001Authority('g001-census-second-suspend'),
          input: { confirmation: second.confirmation },
        }),
        lane.execute({
          operation: 'g001-census-second-suspend',
          authority: g001Authority('g001-census-second-suspend'),
          input: { confirmation: second.confirmation },
        }),
      ]);
      expect(attempts.filter(attempt => attempt.status === 'fulfilled')).toHaveLength(1);
      expect(attempts.filter(attempt => attempt.status === 'rejected')).toHaveLength(1);
      expect(suspend).toHaveBeenCalledTimes(1);
      expect(collection).toBe(2);
      expect(local.state.list({ root: 'runtime', relativeDirectory: 'g001/census' }))
        .toEqual(expect.arrayContaining(['first', 'second', 'consumed']));
    } finally {
      Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original });
      local.cleanup();
    }
  });

  it.each([
    ['59,999ms admitted pair', { admittedSecondObservedAt: '2026-08-30T00:00:59.999Z' }],
    ['300,001ms admitted pair', { admittedSecondObservedAt: '2026-08-30T00:05:00.001Z' }],
    ['300,001ms applicant pair', { applicantSecondStamp: '20260830T000501Z' }],
    ['changed applicant census', { applicantSecondSha: 'c'.repeat(64) }],
    ['changed admitted census', { admittedSecondFid: '2' }],
  ])('rejects an unstable composite census: %s', async (_label, input) => {
    const scenario = await censusScenario(input);
    const original = globalThis.WebSocket;
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: function WebSocket() {} });
    try {
      const first = await scenario.lane.execute({
        operation: 'g001-census-first', authority: g001Authority('g001-census-first'),
      });
      if (first.confirmation === undefined) throw new Error('missing first confirmation');
      await expect(scenario.lane.execute({
        operation: 'g001-census-second-inspect',
        authority: g001Authority('g001-census-second-inspect'),
        input: { confirmation: first.confirmation },
      })).rejects.toMatchObject({ code: 'SEALED_REALMS_G001_CENSUS_STABILITY_INVALID' });
      expect(scenario.suspend).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original });
      scenario.local.cleanup();
    }
  });

  it('rejects forged/cross-source census facts and equal-expiry confirmation without release', async () => {
    const foreign = applicantCensusProof('20260830T000000Z', '1'.repeat(64));
    foreign.sourceCommit = SWAPPED_SOURCE;
    foreign.opaqueProofDigest = genesis001CensusOpaqueProofDigest({
      schemaVersion: foreign.schemaVersion,
      profile: foreign.profile,
      realmId: foreign.realmId,
      releaseVersion: foreign.releaseVersion,
      sourceCommit: foreign.sourceCommit,
      privateCensusReference: foreign.privateCensusReference,
      privateBlindingNonceHex: foreign.privateBlindingNonceHex,
    });
    const crossSource = await censusScenario({ firstApplicant: foreign });
    const expiry = await censusScenario();
    const original = globalThis.WebSocket;
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: function WebSocket() {} });
    try {
      await expect(crossSource.lane.execute({
        operation: 'g001-census-first', authority: g001Authority('g001-census-first'),
      })).rejects.toMatchObject({ code: 'SEALED_REALMS_G001_CENSUS_INVALID' });
      expect(crossSource.suspend).not.toHaveBeenCalled();

      const { second } = await issueCensusConfirmation(expiry);
      expiry.setClock(Date.parse('2026-08-30T00:06:00.000Z'));
      await expect(expiry.lane.execute({
        operation: 'g001-census-second-suspend',
        authority: g001Authority('g001-census-second-suspend'),
        input: { confirmation: second.confirmation! },
      })).rejects.toMatchObject({ code: 'SEALED_REALMS_G001_CENSUS_CONFIRMATION_EXPIRED' });
      await expect(expiry.lane.execute({
        operation: 'g001-census-second-suspend',
        authority: g001Authority('g001-census-second-suspend'),
        input: { confirmation: second.confirmation! },
      })).rejects.toMatchObject({ code: 'SEALED_REALMS_G001_CENSUS_CONFIRMATION_INVALID' });
      expect(expiry.suspend).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original });
      crossSource.local.cleanup();
      expiry.local.cleanup();
    }
  });

  it('reopens exact private census bytes and persists consumption before the monitor operator', async () => {
    const scenario = await censusScenario();
    const original = globalThis.WebSocket;
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: function WebSocket() {} });
    try {
      const { second } = await issueCensusConfirmation(scenario);
      const [secondName] = scenario.local.state.list({
        root: 'runtime', relativeDirectory: 'g001/census/second',
      });
      if (secondName === undefined) throw new Error('missing private second record');
      scenario.local.state.remove({
        root: 'runtime', relativePath: `g001/census/second/${secondName}`,
      });
      scenario.local.state.write({
        root: 'runtime', relativePath: `g001/census/second/${secondName}`,
        bytes: Buffer.from('{}\n', 'utf8'),
      });
      await expect(scenario.lane.execute({
        operation: 'g001-census-second-suspend',
        authority: g001Authority('g001-census-second-suspend'),
        input: { confirmation: second.confirmation! },
      })).rejects.toMatchObject({ code: 'SEALED_REALMS_G001_CENSUS_PRIVATE_STATE_INVALID' });
      expect(scenario.suspend).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original });
      scenario.local.cleanup();
    }

    const consumed = await censusScenario();
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: function WebSocket() {} });
    try {
      const { second } = await issueCensusConfirmation(consumed);
      consumed.suspend.mockImplementation(async () => {
        expect(consumed.local.state.list({ root: 'runtime', relativeDirectory: 'g001/census/consumed' }))
          .toHaveLength(1);
      });
      await expect(consumed.lane.execute({
        operation: 'g001-census-second-suspend',
        authority: g001Authority('g001-census-second-suspend'),
        input: { confirmation: second.confirmation! },
      })).resolves.toEqual({ status: 'completed' });
      await expect(consumed.lane.execute({
        operation: 'g001-census-second-suspend',
        authority: g001Authority('g001-census-second-suspend'),
        input: { confirmation: second.confirmation! },
      })).rejects.toMatchObject({ code: 'SEALED_REALMS_G001_CENSUS_CONFIRMATION_INVALID' });
      expect(consumed.suspend).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original });
      consumed.local.cleanup();
    }
  });

  it('uses only the fixed direct G001 inspection tools and never exposes child output', async () => {
    const authority = authenticateSealedRealmsProductionSourceAuthority({
      operation: 'g001-current-state',
      workflowInputSha: SOURCE,
      readGit: (args) => args[0] === 'rev-parse' ? `${SOURCE}\n` : (() => { throw new Error('git'); })(),
      readBinding: () => ({
        schemaVersion: 1,
        profile: 'warpkeep-0.4.0-sealed-launch-v1',
        pagesDeploymentApproved: false,
        preparationSourceCommit: SOURCE,
      }),
      verifyEvidence: verifiedSha => ({ verifiedSha }),
    });
    const runChild = vi.fn(async ({ file, args }: { file: string; args: readonly string[] }) => {
      if (file === '/usr/bin/git') return { status: 0, stdout: `${SOURCE}\n`, stderr: '' };
      if (file === '/usr/bin/plutil') {
        return {
          status: 0,
          stdout: JSON.stringify({
            Label: 'com.warpkeep.hermes-admission-monitor',
            ProgramArguments: ['/owner/.hermes/scripts/warpkeep_admission_monitor.py', 'loop', '--interval', '60'],
          }),
          stderr: '',
        };
      }
      if (args[0] === 'print-disabled') {
        return { status: 0, stdout: '"com.warpkeep.hermes-admission-monitor" => disabled\n', stderr: '' };
      }
      return { status: 3, stdout: '', stderr: 'Could not find service com.warpkeep.hermes-admission-monitor\n' };
    });

    const testOnlyAdapter = createSealedRealmsProductionG001CurrentStateTestAdapter({
      hashFixedFile: ({ kind }: { kind: string }) => kind === 'plist'
        ? 'a85b1eb4810ed798185f762044d3dac9d29ebee15a09b95bfb2ddbb6de71acaf'
        : '1479a2b5fff85d15f8c04175962dfb898023d14cf418e27b7c1332202cb56de6',
    });
    const result = await inspectSealedRealmsProductionG001CurrentState({
      authority,
      runChild,
      readFixedFile: ({ kind, path }: { kind: string; path: string }) => ({
        kind,
        path,
        body: Buffer.from(kind),
        identity: {
          dev: kind === 'plist' ? 1 : 2,
          ino: kind === 'plist' ? 3 : 4,
          uid: 501,
          mode: kind === 'plist' ? 0o600 : 0o700,
          nlink: 1,
          size: Buffer.byteLength(kind),
          mtimeNs: kind === 'plist' ? 5 : 6,
          ctimeNs: kind === 'plist' ? 7 : 8,
          realpath: path,
        },
      }),
      resolveAccountUid: () => 501,
      resolveAccountHome: () => '/owner',
      testOnlyAdapter,
    } as never);

    expect(result).toEqual({ status: 'current-state-inspected', confirmation: {} });
    expect(runChild).toHaveBeenNthCalledWith(1, expect.objectContaining({
      file: '/usr/bin/git', args: ['rev-parse', '--verify', 'HEAD^{commit}'], shell: false,
    }));
    expect(runChild).toHaveBeenNthCalledWith(2, expect.objectContaining({
      file: '/usr/bin/plutil', args: ['-convert', 'json', '-o', '-', '--', '-'], shell: false,
    }));
    expect(runChild).toHaveBeenNthCalledWith(3, expect.objectContaining({
      file: '/bin/launchctl', args: ['print-disabled', 'gui/501'], shell: false,
    }));
    expect(runChild).toHaveBeenNthCalledWith(4, expect.objectContaining({
      file: '/bin/launchctl', args: ['print', 'gui/501/com.warpkeep.hermes-admission-monitor'], shell: false,
    }));
    expect(JSON.stringify(result)).not.toContain('Could not find service');
  });

  it('rejects false digests, truncation, identity swaps, enabled, and loaded current-state observations', async () => {
    const inspect = async (input: Readonly<{
      hash?: (kind: string) => string;
      mutatePostRead?: boolean;
      disabled?: boolean;
      loaded?: boolean;
    }>) => {
      let reads = 0;
      const testOnlyAdapter = createSealedRealmsProductionG001CurrentStateTestAdapter({
        hashFixedFile: ({ kind }: { kind: string }) => input.hash?.(kind) ?? (kind === 'plist'
          ? 'a85b1eb4810ed798185f762044d3dac9d29ebee15a09b95bfb2ddbb6de71acaf'
          : '1479a2b5fff85d15f8c04175962dfb898023d14cf418e27b7c1332202cb56de6'),
      });
      return inspectSealedRealmsProductionG001CurrentState({
        authority: authenticateSealedRealmsProductionSourceAuthority({
          operation: 'g001-current-state',
          workflowInputSha: SOURCE,
          readGit: args => args[0] === 'rev-parse' ? `${SOURCE}\n` : (() => { throw new Error('git'); })(),
          readBinding: () => ({
            schemaVersion: 1,
            profile: 'warpkeep-0.4.0-sealed-launch-v1',
            pagesDeploymentApproved: false,
            preparationSourceCommit: SOURCE,
          }),
          verifyEvidence: verifiedSha => ({ verifiedSha }),
        }),
        runChild: async ({ file, args }: { file: string; args: readonly string[] }) => {
          if (file === '/usr/bin/git') return { status: 0, stdout: `${SOURCE}\n`, stderr: '' };
          if (file === '/usr/bin/plutil') return {
            status: 0,
            stdout: JSON.stringify({
              Label: 'com.warpkeep.hermes-admission-monitor',
              ProgramArguments: ['/owner/.hermes/scripts/warpkeep_admission_monitor.py', 'loop', '--interval', '60'],
            }),
            stderr: '',
          };
          if (args[0] === 'print-disabled') return {
            status: 0,
            stdout: `"com.warpkeep.hermes-admission-monitor" => ${input.disabled === false ? 'enabled' : 'disabled'}\n`,
            stderr: '',
          };
          if (input.loaded === true) return { status: 0, stdout: 'service', stderr: '' };
          return { status: 3, stdout: '', stderr: 'Could not find service com.warpkeep.hermes-admission-monitor\n' };
        },
        readFixedFile: ({ kind, path }: { kind: string; path: string }) => {
          reads += 1;
          const post = reads > 2 && input.mutatePostRead === true;
          return {
            kind,
            path,
            body: Buffer.from(kind),
            identity: {
              dev: kind === 'plist' ? 1 : 2,
              ino: kind === 'plist' ? 3 : 4,
              uid: 501,
              mode: kind === 'plist' ? 0o600 : 0o700,
              nlink: 1,
              size: Buffer.byteLength(kind) - (input.hash?.(kind) === 'truncated' ? 1 : 0),
              mtimeNs: post ? 99 : 5,
              ctimeNs: post ? 100 : 7,
              realpath: path,
            },
          };
        },
        resolveAccountUid: () => 501,
        resolveAccountHome: () => '/owner',
        testOnlyAdapter,
      } as never);
    };

    await expect(inspect({ hash: () => '0'.repeat(64) })).rejects.toMatchObject({
      code: 'SEALED_REALMS_G001_CURRENT_STATE_FILE_INVALID',
    });
    await expect(inspect({ hash: () => 'truncated' })).rejects.toMatchObject({
      code: 'SEALED_REALMS_G001_CURRENT_STATE_FILE_INVALID',
    });
    await expect(inspect({ mutatePostRead: true })).rejects.toMatchObject({
      code: 'SEALED_REALMS_G001_CURRENT_STATE_FILE_INVALID',
    });
    await expect(inspect({ disabled: false })).rejects.toMatchObject({
      code: 'SEALED_REALMS_G001_CURRENT_STATE_INVALID',
    });
    await expect(inspect({ loaded: true })).rejects.toMatchObject({
      code: 'SEALED_REALMS_G001_CURRENT_STATE_INVALID',
    });
  });

  it('does not allow the direct current-state reader to reuse another operation authority', async () => {
    const authority = authenticateSealedRealmsProductionSourceAuthority({
      operation: 'g001-policy-observe',
      workflowInputSha: SOURCE,
      readGit: args => args[0] === 'rev-parse' ? `${SOURCE}\n` : (() => { throw new Error('git'); })(),
      readBinding: () => ({
        schemaVersion: 1,
        profile: 'warpkeep-0.4.0-sealed-launch-v1',
        pagesDeploymentApproved: false,
        preparationSourceCommit: SOURCE,
      }),
      verifyEvidence: verifiedSha => ({ verifiedSha }),
    });
    const runChild = vi.fn();
    const readFixedFile = vi.fn();

    await expect(inspectSealedRealmsProductionG001CurrentState({
      authority,
      runChild,
      readFixedFile,
      resolveAccountUid: () => 501,
      resolveAccountHome: () => '/owner',
      testOnlyAdapter: undefined,
    } as never)).rejects.toMatchObject({
      code: 'SEALED_REALMS_G001_CURRENT_STATE_SOURCE_OPERATION_INVALID',
    });
    expect(runChild).not.toHaveBeenCalled();
    expect(readFixedFile).not.toHaveBeenCalled();
  });

  it('recognizes and source-authenticates every exact S operation before its lane', async () => {
    const local = dispatcherFixture();

    for (const operation of SEALED_REALMS_OPERATIONS) {
      const expectation = local.dispatcher.dispatch({ operation, workflowInputSha: SOURCE });
      if (operation === 'activation-evidence-generate') {
        await expect(expectation).resolves.toEqual({
          operation,
          status: 'SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE',
        });
      } else {
        await expect(expectation).resolves.toEqual({ operation, status: 'completed' });
      }
    }

    expect(local.execute).toHaveBeenCalledTimes(SEALED_REALMS_OPERATIONS.length - 1);
    for (const call of local.execute.mock.calls) {
      expect(call[0].authority).toBeDefined();
      expect(call[0].input).toBeUndefined();
    }
  });

  it('rejects an unrecognized operation before any lane dependency can run', async () => {
    const local = dispatcherFixture();

    await expect(local.dispatcher.dispatch({
      operation: 'deploy-now',
      workflowInputSha: SOURCE,
    } as never)).rejects.toMatchObject({
      code: 'SEALED_REALMS_DISPATCH_OPERATION_INVALID',
    } satisfies Partial<SealedRealmsProductionDispatcherError>);
    expect(local.execute).not.toHaveBeenCalled();
  });

  it('never lets test lanes replace Task 6E activation generation or forward raw nested result fields', async () => {
    const local = dispatcherFixture();

    await expect(local.dispatcher.dispatch({
      operation: 'activation-evidence-generate',
      workflowInputSha: SOURCE,
    })).resolves.toEqual({
      operation: 'activation-evidence-generate',
      status: 'SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE',
    });
    await expect(local.dispatcher.dispatch({
      operation: 'g002-import-apply',
      workflowInputSha: SOURCE,
      input: { confirmation: 'private-confirmation', result: 'private-result' },
    } as never)).rejects.toMatchObject({
      code: 'SEALED_REALMS_DISPATCH_REQUEST_INVALID',
    });
    expect(local.execute).not.toHaveBeenCalled();
  });

  it('rejects arbitrary lane result strings without exposing their private contents', async () => {
    const local = dispatcherFixture();
    const privateSentinel = '/private/warpkeep/dispatcher-secret-sentinel';
    local.execute.mockResolvedValueOnce({
      status: privateSentinel,
      result: privateSentinel,
    } as never);

    const error = await local.dispatcher.dispatch({
      operation: 'g002-import-inspect',
      workflowInputSha: SOURCE,
    }).catch(value => value);
    expect(error).toMatchObject({ code: 'SEALED_REALMS_DISPATCH_RESULT_INVALID' });
    expect(JSON.stringify(error)).not.toContain(privateSentinel);
  });

  it('requires WebSocket before a network-capable lane dependency is reached', async () => {
    const local = dispatcherFixture();
    const original = globalThis.WebSocket;
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: undefined });
    try {
      await expect(local.dispatcher.dispatch({
        operation: 'g002-import-inspect',
        workflowInputSha: SOURCE,
      })).rejects.toMatchObject({
        code: 'SEALED_REALMS_DISPATCH_WEBSOCKET_UNAVAILABLE',
      });
      expect(local.execute).not.toHaveBeenCalled();
      expect(local.verifyEvidence).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original });
    }
  });
});

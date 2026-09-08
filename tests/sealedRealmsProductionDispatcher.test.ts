import { sealedRealmsPrivateBase } from './helpers/sealedRealmsPrivateRoots';
// @vitest-environment node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
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
  createSealedRealmsProductionContinuationStore,
} from '../scripts/sealed-realms-production-continuation.mjs';
import {
  issueSealedRealmsProductionWorkflowPermit,
} from '../scripts/sealed-realms-production-workflow-authority.mjs';
import {
  createSealedRealmsProductionG001DispatchContext,
  createSealedRealmsProductionG001CensusAuthority,
  createSealedRealmsProductionG001Dispatcher,
  createSealedRealmsProductionG001LaunchAuthority,
  createSealedRealmsProductionG001Lane,
  createSealedRealmsProductionG001CurrentStateTestAdapter,
  inspectSealedRealmsProductionG001CurrentState,
} from '../scripts/sealed-realms-production-g001-lane-entry.mjs';
import {
  SealedRealmsProductionDispatcherError,
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
const POLICY_RECORD_PATH = 'activation-evidence/records/g001-policy-observation-bootstrap-receipt.json';
const privateCleanups = new Set<() => void>();
afterEach(() => { for (const cleanup of privateCleanups) cleanup(); });
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
    authorityPublication: input.authorityPhase === 'complete' ? 'installed' : null,
    blockers: [],
    childState: 'absent',
    containmentEligible: false,
    launchPhase: null,
    launchPublication: input.runState === 'absent' ? 'absent' : null,
    // The frozen envelope reports a completed owner as terminal, not dead.
    ownerState: input.authorityPhase === 'complete' ? 'terminal' : 'dead',
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

function completedPolicyTerminal(home: string, runId: string) {
  const directory = join(home, '.warpkeep', 'private', 'production-admin-v1', 'bootstrap-run-lifecycle-v1');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  mkdirSync(join(directory, '..', 'bootstrap-runs-v1'), { mode: 0o700 });
  const path = join(directory, `${runId}-terminal.json`);
  const argumentHash = createHash('sha256');
  updateLengthFramed(argumentHash, 'domain', 'warpkeep-production-launch-arguments-v1');
  updateLengthFramed(argumentHash, 'command', 'g001-policy-observe');
  const finalRecord = {
    schemaVersion: 1, profile: 'warpkeep-greater-realm-production-launch-lifecycle-v1',
    runId, ordinal: 7, phase: 'complete', previousRecordSha256: '1'.repeat(64),
    pid: 1234, processStartIdentity: 'fixture-process-identity', protectedMain: SOURCE,
    moduleTree: MODULE_TREE, bootstrapBlob: BOOTSTRAP_BLOB, bootstrapSha256: BOOTSTRAP_SHA256,
    command: 'g001-policy-observe', commandArgumentsSha256: argumentHash.digest('hex'),
    runDev: '1', runIno: '42', launchRecordSha256: '2'.repeat(64),
    containedChildPid: null, containedChildProcessStartIdentity: null, containedChildPgid: null,
    containmentConfirmationSha256: null, cleanupConfirmationSha256: 'e'.repeat(64),
    cleanupTreeInventorySha256: 'd'.repeat(64), cleanupReason: 'completed-current-owner',
  };
  const terminal = { schemaVersion: 1, profile: 'warpkeep-greater-realm-production-launch-terminal-v1',
    runId, finalLifecycleRecordSha256: '', finalLifecycleRecord: finalRecord };
  const persist = () => {
    terminal.finalLifecycleRecordSha256 = createHash('sha256')
      .update(`${JSON.stringify(canonical(terminal.finalLifecycleRecord))}\n`).digest('hex');
    writeFileSync(path, `${JSON.stringify(canonical(terminal))}\n`, { mode: 0o600 });
  };
  persist();
  return { path, terminal, persist };
}

function completedPolicyDetail(runId: string) {
  const summary = lifecycleSummary(runId, { authorityPhase: 'complete', runState: 'absent' });
  return canonical({ ...summary, cleanupEligible: false, deletionEligible: false,
    confirmationDigest: 'e'.repeat(64), profile: 'warpkeep-greater-realm-production-launch-lifecycle-v1',
    treeInventory: { state: 'absent', entryCount: 0, byteCount: 0,
      digest: createHash('sha256').update(`${JSON.stringify(canonical({
        state: 'absent', entryCount: 0, byteCount: 0, entries: [],
      }))}\n`).digest('hex') },
  });
}

function g001LaunchAuthority(input: Readonly<{
  readRawGit?: (args: readonly string[]) => string | Uint8Array;
  resolveAdminSecretPath?: (context: Readonly<{ sourceCommit: string }>) => Readonly<{
    sourceCommit: string;
    path: string;
  }>;
  privateState?: ReturnType<typeof createSealedRealmsProductionPrivateState>;
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
    privateState: input.privateState ?? censusPrivateState().state,
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
      preparationSourceCommit: null,
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
      preparationSourceCommit: null,
    }),
    verifyEvidence: verifiedSha => ({ verifiedSha }),
  });
}

function censusPrivateState(testOnlyRace?: (phase: string, path: string) => void) {
  const home = mkdtempSync(join(tmpdir(), 'warpkeep-g001-census-'));
  for (const root of [
    join(sealedRealmsPrivateBase(home), 'audit', 'private'),
    join(sealedRealmsPrivateBase(home), 'runtime'),
    join(sealedRealmsPrivateBase(home), 'cache'),
  ]) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
  }
  const cleanup = () => { privateCleanups.delete(cleanup); rmSync(home, { recursive: true, force: true }); };
  privateCleanups.add(cleanup);
  return {
    home,
    state: createSealedRealmsProductionPrivateState({
      reportedHome: home,
      testOnlyOwnerUid: statSync(home).uid,
      testOnlyFsync: () => {},
      testOnlyAllowPlatformMode: true,
      ...(testOnlyRace === undefined ? {} : { testOnlyRace }),
    }),
    cleanup,
  };
}

function githubResponse(url: string, value: unknown) {
  const body = JSON.stringify(value);
  const response = new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body)),
    },
  });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

function workflowGithub(runId: string, completedRunIds: ReadonlySet<string>) {
  return vi.fn(async (request: string | URL | Request) => {
    const url = String(request);
    if (url.endsWith('/branches/main')) {
      return githubResponse(url, {
        name: 'main', protected: true, commit: { sha: SOURCE },
      });
    }
    const requestedRunId = /\/actions\/runs\/([1-9][0-9]*)$/u.exec(url)?.[1] ?? runId;
    const completed = completedRunIds.has(requestedRunId);
    return githubResponse(url, {
      id: Number(requestedRunId), run_attempt: 1, event: 'workflow_dispatch',
      status: completed ? 'completed' : 'in_progress',
      conclusion: completed ? 'failure' : null,
      head_branch: 'main', head_sha: SOURCE,
      path: '.github/workflows/sealed-realms-production.yml',
      repository: { full_name: 'ael-dev3/Warpkeep' },
    });
  });
}

async function protectedG001Dispatcher(
  lane: ReturnType<typeof createSealedRealmsProductionG001Lane>,
  operation: string,
  authority: ReturnType<typeof authenticateSealedRealmsProductionSourceAuthority>,
  privateState: ReturnType<typeof createSealedRealmsProductionPrivateState>,
  runId: string,
  completedRunIds: ReadonlySet<string> = new Set(),
) {
  const permit = await issueSealedRealmsProductionWorkflowPermit({
    sourceAuthority: authority,
    githubToken: 'github-sealed-realms-owner-token',
    runId,
    runAttempt: '1',
    fetchImpl: workflowGithub(runId, completedRunIds),
  });
  const context = createSealedRealmsProductionG001DispatchContext({
    readGit: () => `${SOURCE}\n`,
    readBinding: () => ({
      schemaVersion: 1,
      profile: 'warpkeep-0.4.0-sealed-launch-v1',
      pagesDeploymentApproved: false,
      preparationSourceCommit: null,
    }),
    verifyEvidence: verifiedSha => ({ verifiedSha }),
    permit,
    continuationStore: createSealedRealmsProductionContinuationStore({ privateState }),
    runId,
    runAttempt: '1',
    sourceAuthority: authority,
  });
  return createSealedRealmsProductionG001Dispatcher({ context, lane });
}

async function dispatchProtectedG001(
  lane: ReturnType<typeof createSealedRealmsProductionG001Lane>,
  operation: string,
  authority: ReturnType<typeof authenticateSealedRealmsProductionSourceAuthority>,
  privateState: ReturnType<typeof createSealedRealmsProductionPrivateState>,
  runId: string,
  completedRunIds: ReadonlySet<string> = new Set(),
) {
  const dispatcher = await protectedG001Dispatcher(
    lane, operation, authority, privateState, runId, completedRunIds,
  );
  return dispatcher.dispatch({ operation: operation as never, workflowInputSha: SOURCE });
}

async function runProtectedG001(
  lane: ReturnType<typeof createSealedRealmsProductionG001Lane>,
  operation: string,
  authority: ReturnType<typeof authenticateSealedRealmsProductionSourceAuthority>,
  runId: string,
) {
  const local = censusPrivateState();
  try {
    return await dispatchProtectedG001(lane, operation, authority, local.state, runId);
  } finally { local.cleanup(); }
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

async function issueCensusContinuations(scenario: Awaited<ReturnType<typeof censusScenario>>) {
  const firstRunId = '6101';
  const firstAuthority = g001Authority('g001-census-first');
  const first = await dispatchProtectedG001(
    scenario.lane, 'g001-census-first', firstAuthority, scenario.local.state, firstRunId,
  );
  const secondRunId = '6102';
  const secondAuthority = g001Authority('g001-census-second-inspect');
  const second = await dispatchProtectedG001(
    scenario.lane, 'g001-census-second-inspect', secondAuthority, scenario.local.state,
    secondRunId, new Set([firstRunId]),
  );
  return { first, second, secondRunId };
}

function g001PolicyLane(input: Readonly<{
  launchAuthority?: ReturnType<typeof g001LaunchAuthority>;
  attestDispatcherNode?: () => unknown;
  censusAuthority?: unknown;
  preflight?: (input: Readonly<{ sourceCommit: string }>) => unknown;
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
    currentStateOperator: async () => { throw new Error('unreachable'); },
    preflight: input.preflight ?? (async () => {}),
  } as never);
}

async function dispatcherFixture(operation = 'preflight') {
  const local = censusPrivateState();
  const preflight = vi.fn(async (_input: Readonly<{ sourceCommit: string }>) => ({
    status: 'private-ignored',
    private: '/private/dispatcher-sentinel',
    result: '/private/dispatcher-sentinel',
  }));
  const verifyEvidence = vi.fn((verifiedSha: string) => ({ verifiedSha }));
  const sourceAuthority = authenticateSealedRealmsProductionSourceAuthority({
    operation: operation as never,
    workflowInputSha: SOURCE,
    readGit: () => `${SOURCE}\n`,
    readBinding: () => ({
      schemaVersion: 1,
      profile: 'warpkeep-0.4.0-sealed-launch-v1',
      pagesDeploymentApproved: false,
      preparationSourceCommit: null,
    }),
    verifyEvidence: verifiedSha => ({ verifiedSha }),
  });
  const runId = '6601';
  const permit = await issueSealedRealmsProductionWorkflowPermit({
    sourceAuthority,
    githubToken: 'github-sealed-realms-owner-token',
    runId,
    runAttempt: '1',
    fetchImpl: workflowGithub(runId, new Set()),
  });
  const context = createSealedRealmsProductionG001DispatchContext({
    readGit: (args: readonly string[]) => {
      if (args[0] === 'rev-parse') return `${SOURCE}\n`;
      throw new Error('unexpected git command');
    },
    readBinding: () => ({
      schemaVersion: 1,
      profile: 'warpkeep-0.4.0-sealed-launch-v1',
      pagesDeploymentApproved: false,
      preparationSourceCommit: null,
    }),
    verifyEvidence,
    permit,
    continuationStore: createSealedRealmsProductionContinuationStore({
      privateState: local.state,
    }),
    runId,
    runAttempt: '1',
    sourceAuthority,
  });
  const lane = g001PolicyLane({
    preflight,
    runEnvelopeChild: async () => ({ status: 0, stdout: '', stderr: '' }),
  });
  return {
    preflight,
    verifyEvidence,
    dispatcher: createSealedRealmsProductionG001Dispatcher({ context, lane }),
    cleanup: local.cleanup,
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
      currentStateOperator: async () => { throw new Error('unreachable'); },
      preflight: async () => {},
    } as never);
    const original = globalThis.WebSocket;
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: function WebSocket() {} });
    try {
      await expect(runProtectedG001(
        lane, 'g001-policy-observe', g001PolicyAuthority(), '6001',
      )).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
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
        preparationSourceCommit: null,
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
      currentStateOperator: async () => { throw new Error('unreachable'); },
      preflight: async () => {},
    } as never);
    const original = globalThis.WebSocket;
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: function WebSocket() {} });
    try {
      await expect(runProtectedG001(lane, 'g001-policy-observe', authority, '6002'))
        .resolves.toEqual({ operation: 'g001-policy-observe', status: 'completed' });
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
        preparationSourceCommit: null,
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
      currentStateOperator: async () => { throw new Error('unreachable'); },
      preflight: async () => {},
    } as never);
    const original = globalThis.WebSocket;
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: function WebSocket() {} });
    try {
      await expect(runProtectedG001(lane, 'g001-policy-observe', authority, '6003'))
        .resolves.toEqual({ operation: 'g001-policy-observe', status: 'completed' });
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
        preparationSourceCommit: null,
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
      currentStateOperator: async () => { throw new Error('unreachable'); },
      preflight: async () => {},
    } as never);
    const original = globalThis.WebSocket;
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: function WebSocket() {} });
    try {
      await expect(runProtectedG001(lane, 'g001-policy-observe', authority, '6004'))
        .resolves.toEqual({ operation: 'g001-policy-observe', status: 'completed' });
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
      await expect(runProtectedG001(
        lane, 'g001-policy-observe', g001PolicyAuthority(), '6005',
      )).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_WEBSOCKET_UNAVAILABLE' });
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
      await expect(runProtectedG001(
        badBootstrap, 'g001-policy-observe', g001PolicyAuthority(), '6006',
      )).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
      expect(badBootstrapRunner).not.toHaveBeenCalled();

      const badPathRunner = vi.fn();
      const badPath = g001PolicyLane({
        launchAuthority: g001LaunchAuthority({
          resolveAdminSecretPath: () => ({ sourceCommit: SOURCE, path: '/private/warpkeep/../other' }),
        }),
        runEnvelopeChild: badPathRunner,
      });
      await expect(runProtectedG001(
        badPath, 'g001-policy-observe', g001PolicyAuthority(), '6007',
      )).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
      expect(badPathRunner).not.toHaveBeenCalled();

      const badRuntimeRawGit = vi.fn();
      const badRuntime = g001PolicyLane({
        launchAuthority: g001LaunchAuthority({ readRawGit: badRuntimeRawGit }),
        attestDispatcherNode: () => ({ ...g001Node(), version: 'v22.22.2' }),
        runEnvelopeChild: vi.fn(),
      });
      await expect(runProtectedG001(
        badRuntime, 'g001-policy-observe', g001PolicyAuthority(), '6008',
      )).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
      expect(badRuntimeRawGit).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original });
    }
  });

  it('rejects a completed absent frozen launch when its private policy record is missing', async () => {
    const runId = `run-${'a'.repeat(32)}`;
    const local = censusPrivateState();
    const runner = vi.fn(async () => ({
      status: 0,
      stdout: `${JSON.stringify({
        profile: 'warpkeep-greater-realm-production-launch-lifecycle-v1',
        runs: [lifecycleSummary(runId, { authorityPhase: 'complete', runState: 'absent' })],
      })}\n`,
      stderr: '',
    }));
    const lane = g001PolicyLane({
      launchAuthority: g001LaunchAuthority({ privateState: local.state }),
      runEnvelopeChild: runner,
    });
    const original = globalThis.WebSocket;
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: function WebSocket() {} });
    try {
      await expect(runProtectedG001(
        lane, 'g001-policy-observe', g001PolicyAuthority(), '6009',
      )).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
      expect(runner).toHaveBeenCalledTimes(1);
      expect(() => local.state.read({ root: 'runtime', relativePath: POLICY_RECORD_PATH })).toThrow();
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
        const local = censusPrivateState();
        let invocation = 0;
        const runner = vi.fn(async () => ({
          status: 0,
          stdout: `${JSON.stringify(invocation++ === 0
            ? emptyLifecycleInventory()
            : makeReceipt())}\n`,
          stderr: '',
        }));
        const lane = g001PolicyLane({
          launchAuthority: g001LaunchAuthority({ privateState: local.state }),
          runEnvelopeChild: runner,
        });
        await expect(runProtectedG001(
          lane, 'g001-policy-observe', g001PolicyAuthority(), '6010',
        )).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
        expect(() => local.state.read({ root: 'runtime', relativePath: POLICY_RECORD_PATH })).toThrow();
      }

      const local = censusPrivateState();
      let invocation = 0;
      const lane = g001PolicyLane({
        launchAuthority: g001LaunchAuthority({ privateState: local.state }),
        runEnvelopeChild: async () => ({
          status: 0,
          stdout: `${JSON.stringify(invocation++ === 0
            ? emptyLifecycleInventory()
            : bootstrapPolicyObservationReceipt())}\n`,
          stderr: '',
        }),
      });
      await expect(runProtectedG001(
        lane, 'g001-policy-observe', g001PolicyAuthority(), '6011',
      )).resolves.toEqual({ operation: 'g001-policy-observe', status: 'completed' });
      const persisted = local.state.read({ root: 'runtime', relativePath: POLICY_RECORD_PATH });
      try {
        const wrapper = JSON.parse(persisted.toString('utf8'));
        expect(wrapper).toMatchObject({ schemaVersion: 1, profile: 'warpkeep-sealed-realms-activation-record-v1',
          member: 'g001PolicyObservationBootstrapReceipt', preparationSourceCommit: SOURCE,
          sourceCommit: SOURCE, operation: 'g001-policy-observe', sourceAuthorityDigest: g001PolicyAuthority().authorityDigest });
        expect(wrapper.receipt).toEqual(bootstrapPolicyObservationReceipt());
        expect(wrapper.bodyDigest).toBe(createHash('sha256').update(`${JSON.stringify(wrapper.receipt)}\n`).digest('hex'));
        expect(wrapper.semanticDigest).toBe(createHash('sha256').update([
          'warpkeep.sealed-realms.activation-record.v1', wrapper.member, SOURCE, SOURCE,
          wrapper.operation, wrapper.sourceAuthorityDigest, wrapper.bodyDigest, '',
        ].join('\n')).digest('hex'));
      } finally { persisted.fill(0); }
    } finally {
      Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original });
    }
  });

  it('requires opaque private state and rejects the old caller-selected persistence surface', () => {
    const input = { readRawGit: () => `${SOURCE}\n`,
      resolveAdminSecretPath: () => ({ sourceCommit: SOURCE, path: ADMIN_SECRET_PATH }) };
    expect(() => createSealedRealmsProductionG001LaunchAuthority({ ...input, privateState: {} } as never))
      .toThrow('SEALED_REALMS_G001_LAUNCH_AUTHORITY_INPUT_INVALID');
    expect(() => createSealedRealmsProductionG001LaunchAuthority({ ...input, persistPolicyObservation: () => undefined } as never))
      .toThrow('SEALED_REALMS_G001_LAUNCH_AUTHORITY_INPUT_INVALID');
  });

  it.skipIf(process.platform === 'win32')('adopts a retained receipt using the actual frozen read-only terminal inspector', async () => {
    const local = censusPrivateState();
    const runId = `run-${'f'.repeat(32)}`;
    const program = /<<'WKGR_LAUNCH_LIFECYCLE_PY'\n([\s\S]*?)\nWKGR_LAUNCH_LIFECYCLE_PY\n/u
      .exec(ENVELOPE_BYTES.toString('utf8'))?.[1];
    expect(program).toBeTypeOf('string');
    let invoked = false;
    const capture = g001PolicyLane({ launchAuthority: g001LaunchAuthority({ privateState: local.state }),
      runEnvelopeChild: async () => {
        if (!invoked) { invoked = true; return { status: 0, stdout: `${JSON.stringify(emptyLifecycleInventory())}\n`, stderr: '' }; }
        completedPolicyTerminal(local.home, runId);
        return { status: 0, stdout: `${JSON.stringify(bootstrapPolicyObservationReceipt())}\n`, stderr: '' };
      } });
    const runner = vi.fn(async (request: { args: readonly string[] }) => {
      const detailed = request.args.at(-1) === runId;
      expect(request.args.at(detailed ? -2 : -1)).toBe('launch-run-inspect');
      const result = spawnSync('/usr/bin/python3', ['-I', '-S', '-B', '-', 'inspect', local.home,
        ...(detailed ? [runId] : [])], { input: `${program}\n`, encoding: 'utf8',
        env: { PATH: '/usr/bin:/bin' }, timeout: 10_000 });
      expect(result.status, result.stderr).toBe(0);
      return { status: result.status!, stdout: result.stdout, stderr: result.stderr };
    });
    const original = globalThis.WebSocket;
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: function WebSocket() {} });
    try {
      await expect(runProtectedG001(capture, 'g001-policy-observe', g001PolicyAuthority(), '6014'))
        .resolves.toEqual({ operation: 'g001-policy-observe', status: 'completed' });
      const resume = g001PolicyLane({ launchAuthority: g001LaunchAuthority({ privateState: local.state }), runEnvelopeChild: runner });
      await expect(runProtectedG001(resume, 'g001-policy-observe', g001PolicyAuthority(), '6015'))
        .resolves.toEqual({ operation: 'g001-policy-observe', status: 'completed' });
      expect(runner).toHaveBeenCalledTimes(2);
    } finally { Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original }); }
  });

  it.each(['adopted', 'lost-acknowledgment', 'authority', 'producer-source', 'operation', 'bootstrap',
    'tree', 'cleanup-run', 'cleanup-state', 'player-access', 'body', 'semantic', 'noncanonical',
    'cleanup-confirmation', 'cleanup-inventory', 'terminal-missing', 'terminal-run', 'terminal-source',
    'terminal-tree', 'terminal-blob', 'terminal-bootstrap', 'terminal-command', 'terminal-arguments',
    'terminal-reason', 'terminal-extra', 'terminal-malformed', 'terminal-digest', 'terminal-confirmation',
    'terminal-inventory', 'detail-confirmation', 'detail-inventory', 'detail-run',
    'no-lifecycle', 'pending-lifecycle', 'blocked-lifecycle', 'nonterminal-owner', 'partial-terminal'])(
    'reopens only the matching durable policy capture without replay: %s', async scenario => {
      let loseReadAcknowledgment = scenario === 'lost-acknowledgment';
      const local = censusPrivateState((phase, path) => {
        if (loseReadAcknowledgment && phase === 'read-after-open' && path.endsWith('g001-policy-observation-bootstrap-receipt.json')) {
          loseReadAcknowledgment = false;
          throw new Error('simulated acknowledgment loss after the private record was written');
        }
      });
      let invocation = 0;
      let terminalFixture: ReturnType<typeof completedPolicyTerminal>;
      const firstRunner = vi.fn(async () => {
        if (invocation++ === 0) return { status: 0, stdout: `${JSON.stringify(emptyLifecycleInventory())}\n`, stderr: '' };
        // Simulate the fixed bootstrap result and its independently owned terminal.
        terminalFixture = completedPolicyTerminal(local.home, `run-${'f'.repeat(32)}`);
        return { status: 0, stdout: `${JSON.stringify(bootstrapPolicyObservationReceipt())}\n`, stderr: '' };
      });
      const firstLane = g001PolicyLane({ launchAuthority: g001LaunchAuthority({ privateState: local.state }),
        runEnvelopeChild: firstRunner });
      const original = globalThis.WebSocket;
      Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: function WebSocket() {} });
      try {
        const initial = runProtectedG001(firstLane, 'g001-policy-observe', g001PolicyAuthority(), '6012');
        if (scenario === 'lost-acknowledgment') await expect(initial).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
        else await expect(initial).resolves.toEqual({ operation: 'g001-policy-observe', status: 'completed' });
        expect(firstRunner).toHaveBeenCalledTimes(2);
        const recordPath = join(sealedRealmsPrivateBase(local.home),
          'runtime', 'sealed-realms-v1', ...POLICY_RECORD_PATH.split('/'));
        const record = JSON.parse(readFileSync(recordPath, 'utf8'));
        const runId = record.receipt.launchCleanup.runId;
        if (scenario === 'authority') record.sourceAuthorityDigest = '0'.repeat(64);
        if (scenario === 'producer-source') record.sourceCommit = SWAPPED_SOURCE;
        if (scenario === 'operation') record.operation = 'g001-current-state';
        if (scenario === 'bootstrap') record.receipt = bootstrapPolicyObservationReceipt({ sha256: '0'.repeat(64) });
        if (scenario === 'tree') record.receipt = bootstrapPolicyObservationReceipt({ tree: '0'.repeat(40) });
        if (scenario === 'cleanup-run') record.receipt = bootstrapPolicyObservationReceipt({ cleanup: {
          ...record.receipt.launchCleanup, runId: `run-${'0'.repeat(32)}` } });
        if (scenario === 'cleanup-state') record.receipt = bootstrapPolicyObservationReceipt({ cleanup: {
          ...record.receipt.launchCleanup, outcome: 'pending' } });
        if (scenario === 'cleanup-confirmation') record.receipt = bootstrapPolicyObservationReceipt({ cleanup: {
          ...record.receipt.launchCleanup, cleanupConfirmationSha256: '0'.repeat(64) } });
        if (scenario === 'cleanup-inventory') record.receipt = bootstrapPolicyObservationReceipt({ cleanup: {
          ...record.receipt.launchCleanup, treeInventorySha256: '0'.repeat(64) } });
        if (scenario === 'player-access') record.receipt = bootstrapPolicyObservationReceipt({ policy: {
          ...policyObservationReceipt(), policy: { ...policyObservationReceipt().policy, playerAccessEnabled: false } } });
        record.bodyDigest = createHash('sha256').update(`${JSON.stringify(record.receipt)}\n`).digest('hex');
        if (scenario === 'body') record.bodyDigest = '0'.repeat(64);
        record.semanticDigest = createHash('sha256').update([
          'warpkeep.sealed-realms.activation-record.v1', record.member, record.preparationSourceCommit,
          record.sourceCommit, record.operation, record.sourceAuthorityDigest, record.bodyDigest, '',
        ].join('\n')).digest('hex');
        if (scenario === 'semantic') record.semanticDigest = '0'.repeat(64);
        const persisted = `${JSON.stringify(record)}\n${scenario === 'noncanonical' ? '\n' : ''}`;
        if (scenario !== 'adopted' && scenario !== 'lost-acknowledgment') writeFileSync(recordPath, persisted, { mode: 0o600 });
        const before = readFileSync(recordPath);
        const terminal = terminalFixture!.terminal;
        const finalRecord = terminal.finalLifecycleRecord;
        if (scenario === 'terminal-run') terminal.runId = `run-${'0'.repeat(32)}`;
        if (scenario === 'terminal-source') finalRecord.protectedMain = '0'.repeat(40);
        if (scenario === 'terminal-tree') finalRecord.moduleTree = '0'.repeat(40);
        if (scenario === 'terminal-blob') finalRecord.bootstrapBlob = '0'.repeat(40);
        if (scenario === 'terminal-bootstrap') finalRecord.bootstrapSha256 = '0'.repeat(64);
        if (scenario === 'terminal-command') finalRecord.command = 'observe-other';
        if (scenario === 'terminal-arguments') finalRecord.commandArgumentsSha256 = '0'.repeat(64);
        if (scenario === 'terminal-reason') finalRecord.cleanupReason = 'confirmed-dead-owner';
        if (scenario === 'terminal-confirmation') finalRecord.cleanupConfirmationSha256 = '0'.repeat(64);
        if (scenario === 'terminal-inventory') finalRecord.cleanupTreeInventorySha256 = '0'.repeat(64);
        if (scenario === 'terminal-extra') Object.assign(finalRecord, { unexpected: true });
        terminalFixture!.persist();
        if (scenario === 'terminal-digest') writeFileSync(terminalFixture!.path,
          `${JSON.stringify(canonical({ ...terminal, finalLifecycleRecordSha256: '0'.repeat(64) }))}\n`);
        if (scenario === 'terminal-malformed') writeFileSync(terminalFixture!.path, '{"private":"malformed"');
        if (scenario === 'terminal-missing') rmSync(terminalFixture!.path);
        const summary = lifecycleSummary(runId, { authorityPhase: scenario === 'pending-lifecycle' ? 'launch-installed' : 'complete',
          runState: scenario === 'pending-lifecycle' ? 'present' : 'absent' });
        const detail = completedPolicyDetail(runId) as Record<string, unknown>;
        if (scenario === 'detail-confirmation') detail.confirmationDigest = '0'.repeat(64);
        if (scenario === 'detail-inventory') (detail.treeInventory as Record<string, unknown>).digest = '0'.repeat(64);
        if (scenario === 'detail-run') detail.runId = `run-${'0'.repeat(32)}`;
        const runner = vi.fn(async (request: { args: readonly string[] }) => ({ status: 0, stdout: `${JSON.stringify(request.args.at(-1) === runId ? detail : {
          profile: 'warpkeep-greater-realm-production-launch-lifecycle-v1',
          runs: scenario === 'no-lifecycle' ? [] : [{ ...summary,
            authorityPublication: scenario === 'partial-terminal' ? 'installed-with-partial' : summary.authorityPublication,
            ownerState: scenario === 'nonterminal-owner' ? 'dead' : summary.ownerState,
            blockers: scenario === 'blocked-lifecycle' ? ['active-child'] : [] }],
        })}\n`, stderr: '' }));
        // Recreate the launch authority and lane; no process-local receipt token
        // can stand in for the durable record or its authenticated launch identity.
        const resumedLane = g001PolicyLane({ launchAuthority: g001LaunchAuthority({ privateState: local.state }), runEnvelopeChild: runner });
        const resumed = runProtectedG001(resumedLane, 'g001-policy-observe', g001PolicyAuthority(), '6013');
        if (scenario === 'adopted' || scenario === 'lost-acknowledgment') {
          await expect(resumed).resolves.toEqual({ operation: 'g001-policy-observe', status: 'completed' });
        } else await expect(resumed).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
        expect(runner).toHaveBeenCalledTimes(['no-lifecycle', 'pending-lifecycle', 'blocked-lifecycle',
          'nonterminal-owner', 'partial-terminal'].includes(scenario) ? 1 : 2);
        expect(runner.mock.calls[0]?.[0].args.at(-1)).toBe('launch-run-inspect');
        for (const [request] of runner.mock.calls) expect(request.args.at(-1) === 'launch-run-inspect'
          || (request.args.at(-2) === 'launch-run-inspect' && request.args.at(-1) === runId)).toBe(true);
        expect(readFileSync(recordPath).equals(before)).toBe(true);
      } finally { Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original }); }
    });

  it('persists and consumes stable composite G001 census evidence before one monitor suspension', async () => {
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
      const firstAuthority = g001Authority('g001-census-first');
      const first = await dispatchProtectedG001(
        lane, 'g001-census-first', firstAuthority, local.state, '6201',
      );
      expect(first).toEqual({ operation: 'g001-census-first', status: 'completed' });
      const applicantActivationPath = 'activation-evidence/records/g001-census-privacy-safe-private-receipt.json';
      expect(local.state.exists({ root: 'runtime', relativePath: applicantActivationPath })).toBe(false);
      const secondAuthority = g001Authority('g001-census-second-inspect');
      const second = await dispatchProtectedG001(
        lane, 'g001-census-second-inspect', secondAuthority, local.state,
        '6202', new Set(['6201']),
      );
      expect(second).toEqual({
        operation: 'g001-census-second-inspect', status: 'completed',
      });
      expect(JSON.stringify(second)).not.toContain('warpkeep-access-request-census');
      const applicantBytes = local.state.read({ root: 'runtime', relativePath: applicantActivationPath });
      try {
        const applicant = JSON.parse(applicantBytes.toString('utf8'));
        expect(applicant.member).toBe('g001CensusPrivacySafePrivateReceipt');
        expect(applicant.operation).toBe('g001-census-second-inspect');
        expect(applicant.sourceAuthorityDigest).toBe(secondAuthority.authorityDigest);
        expect(Object.keys(applicant.receipt)).toEqual(['first', 'second']);
        expect(applicant.receipt.first.privateCensusReference.pathBasename)
          .not.toBe(applicant.receipt.second.privateCensusReference.pathBasename);
        expect(applicant.bodyDigest).toBe(createHash('sha256')
          .update(`${JSON.stringify(applicant.receipt)}\n`).digest('hex'));
      } finally { applicantBytes.fill(0); }
      const censusActivationPath = 'activation-evidence/records/g001-admitted-player-census-private-receipt.json';
      expect(local.state.exists({ root: 'runtime', relativePath: censusActivationPath })).toBe(false);
      const suspendAuthority = g001Authority('g001-census-second-suspend');
      const suspensionDispatcher = await protectedG001Dispatcher(
        lane, 'g001-census-second-suspend', suspendAuthority, local.state,
        '6203', new Set(['6202']),
      );
      const suspensionRequest = Object.freeze({
        operation: 'g001-census-second-suspend' as const, workflowInputSha: SOURCE,
      });
      const attempts = await Promise.allSettled([
        suspensionDispatcher.dispatch(suspensionRequest),
        suspensionDispatcher.dispatch(suspensionRequest),
      ]);
      expect(attempts.filter(attempt => attempt.status === 'fulfilled')).toHaveLength(1);
      expect(attempts.filter(attempt => attempt.status === 'rejected')).toHaveLength(1);
      expect(suspend).toHaveBeenCalledTimes(1);
      expect(collection).toBe(2);
      const capturedBytes = local.state.read({ root: 'runtime', relativePath: censusActivationPath });
      try {
        const captured = JSON.parse(capturedBytes.toString('utf8'));
        expect(captured.operation).toBe('g001-census-second-suspend');
        expect(captured.sourceAuthorityDigest).toBe(suspendAuthority.authorityDigest);
        expect(captured.member).toBe('g001AdmittedPlayerCensusPrivateReceipt');
        expect(Object.keys(captured.receipt)).toEqual([
          'schemaVersion', 'profile', 'first', 'second', 'confirmation', 'consumed',
        ]);
        expect(captured.receipt.consumed.record.confirmationDigest)
          .toBe(captured.receipt.confirmation.record.confirmationDigest);
        expect(captured.bodyDigest).toBe(createHash('sha256')
          .update(`${JSON.stringify(captured.receipt)}\n`).digest('hex'));
        expect(captured.semanticDigest).toBe(createHash('sha256').update([
          'warpkeep.sealed-realms.activation-record.v1', captured.member,
          SOURCE, SOURCE, captured.operation, suspendAuthority.authorityDigest, captured.bodyDigest, '',
        ].join('\n')).digest('hex'));
      } finally { capturedBytes.fill(0); }
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
      const firstAuthority = g001Authority('g001-census-first');
      await dispatchProtectedG001(
        scenario.lane, 'g001-census-first', firstAuthority, scenario.local.state, '6301',
      );
      const secondAuthority = g001Authority('g001-census-second-inspect');
      await expect(dispatchProtectedG001(
        scenario.lane, 'g001-census-second-inspect', secondAuthority, scenario.local.state,
        '6302', new Set(['6301']),
      )).rejects.toMatchObject({
        code: 'SEALED_REALMS_DISPATCH_LANE_FAILED',
      });
      expect(scenario.suspend).not.toHaveBeenCalled();
      for (const basename of ['g001-census-privacy-safe-private-receipt.json', 'g001-admitted-player-census-private-receipt.json']) {
        expect(scenario.local.state.exists({
          root: 'runtime', relativePath: `activation-evidence/records/${basename}`,
        })).toBe(false);
      }
    } finally {
      Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original });
      scenario.local.cleanup();
    }
  });

  it('rejects forged/cross-source census facts and equal-expiry evidence without release', async () => {
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
      const crossSourceAuthority = g001Authority('g001-census-first');
      await expect(dispatchProtectedG001(
        crossSource.lane, 'g001-census-first', crossSourceAuthority,
        crossSource.local.state, '6401',
      )).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
      expect(crossSource.suspend).not.toHaveBeenCalled();

      const { secondRunId } = await issueCensusContinuations(expiry);
      expiry.setClock(Date.parse('2026-08-30T00:06:00.000Z'));
      const expiryAuthority = g001Authority('g001-census-second-suspend');
      const expiryDispatcher = await protectedG001Dispatcher(
        expiry.lane, 'g001-census-second-suspend', expiryAuthority, expiry.local.state,
        '6402', new Set([secondRunId]),
      );
      const expiryRequest = Object.freeze({
        operation: 'g001-census-second-suspend' as const, workflowInputSha: SOURCE,
      });
      await expect(expiryDispatcher.dispatch(expiryRequest)).rejects.toMatchObject({
        code: 'SEALED_REALMS_DISPATCH_LANE_FAILED',
      });
      await expect(expiryDispatcher.dispatch(expiryRequest)).rejects.toMatchObject({
        code: 'SEALED_REALMS_DISPATCH_LANE_FAILED',
      });
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
      const { secondRunId } = await issueCensusContinuations(scenario);
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
      const suspensionAuthority = g001Authority('g001-census-second-suspend');
      await expect(dispatchProtectedG001(
        scenario.lane, 'g001-census-second-suspend', suspensionAuthority, scenario.local.state,
        '6501', new Set([secondRunId]),
      )).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
      expect(scenario.suspend).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original });
      scenario.local.cleanup();
    }

    const consumed = await censusScenario();
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: function WebSocket() {} });
    try {
      const { secondRunId } = await issueCensusContinuations(consumed);
      consumed.suspend.mockImplementation(async () => {
        expect(consumed.local.state.list({ root: 'runtime', relativeDirectory: 'g001/census/consumed' }))
          .toHaveLength(1);
      });
      const consumedAuthority = g001Authority('g001-census-second-suspend');
      const consumedDispatcher = await protectedG001Dispatcher(
        consumed.lane, 'g001-census-second-suspend', consumedAuthority, consumed.local.state,
        '6502', new Set([secondRunId]),
      );
      const consumedRequest = Object.freeze({
        operation: 'g001-census-second-suspend' as const, workflowInputSha: SOURCE,
      });
      await expect(consumedDispatcher.dispatch(consumedRequest)).resolves.toEqual({
        operation: 'g001-census-second-suspend', status: 'completed',
      });
      await expect(consumedDispatcher.dispatch(consumedRequest)).rejects.toMatchObject({
        code: 'SEALED_REALMS_DISPATCH_LANE_FAILED',
      });
      expect(consumed.suspend).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original });
      consumed.local.cleanup();
    }
  });

  it.each(['operator failure', 'changed private record', 'existing capture'])(
    'does not publish census capture success after %s or replay suspension', async mode => {
      const scenario = await censusScenario();
      const original = globalThis.WebSocket;
      const capturePath = 'activation-evidence/records/g001-admitted-player-census-private-receipt.json';
      Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: function WebSocket() {} });
      try {
        const { secondRunId } = await issueCensusContinuations(scenario);
        scenario.suspend.mockImplementation(async () => {
          expect(scenario.local.state.exists({ root: 'runtime', relativePath: capturePath })).toBe(false);
          if (mode === 'operator failure') throw new Error('test-only suspension failure');
          const relativePath = mode === 'existing capture' ? capturePath
            : `g001/census/second/${scenario.local.state.list({ root: 'runtime', relativeDirectory: 'g001/census/second' })[0]}`;
          if (mode === 'changed private record') scenario.local.state.remove({ root: 'runtime', relativePath });
          scenario.local.state.write({ root: 'runtime', relativePath, bytes: Buffer.from('{}\n') });
        });
        const authority = g001Authority('g001-census-second-suspend');
        const dispatcher = await protectedG001Dispatcher(
          scenario.lane, 'g001-census-second-suspend', authority, scenario.local.state,
          '6591', new Set([secondRunId]),
        );
        const request = Object.freeze({ operation: 'g001-census-second-suspend' as const, workflowInputSha: SOURCE });
        await expect(dispatcher.dispatch(request)).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
        await expect(dispatcher.dispatch(request)).rejects.toMatchObject({ code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
        expect(scenario.suspend).toHaveBeenCalledTimes(1);
        if (mode === 'existing capture') {
          const bytes = scenario.local.state.read({ root: 'runtime', relativePath: capturePath });
          try { expect(bytes.toString('utf8')).toBe('{}\n'); } finally { bytes.fill(0); }
        } else {
          expect(scenario.local.state.exists({ root: 'runtime', relativePath: capturePath })).toBe(false);
        }
      } finally {
        Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original });
        scenario.local.cleanup();
      }
    },
  );

  it('uses only the fixed direct G001 inspection tools and never exposes child output', async () => {
    const authority = authenticateSealedRealmsProductionSourceAuthority({
      operation: 'g001-current-state',
      workflowInputSha: SOURCE,
      readGit: (args) => args[0] === 'rev-parse' ? `${SOURCE}\n` : (() => { throw new Error('git'); })(),
      readBinding: () => ({
        schemaVersion: 1,
        profile: 'warpkeep-0.4.0-sealed-launch-v1',
        pagesDeploymentApproved: false,
        preparationSourceCommit: null,
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
            preparationSourceCommit: null,
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
        preparationSourceCommit: null,
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

  it('source-authenticates and dispatches through a real branded G001 lane', async () => {
    const local = await dispatcherFixture();
    try {
      const result = await local.dispatcher.dispatch({
        operation: 'preflight', workflowInputSha: SOURCE,
      });
      expect(result).toEqual({ operation: 'preflight', status: 'preflight-inspected' });
      expect(local.preflight).toHaveBeenCalledWith({ sourceCommit: SOURCE });
      expect(JSON.stringify(result)).not.toMatch(/authority|continuation|permit|token/iu);
    } finally { local.cleanup(); }
  });

  it('rejects an unrecognized operation before any lane dependency can run', async () => {
    const local = await dispatcherFixture();
    try {
      await expect(local.dispatcher.dispatch({
        operation: 'deploy-now',
        workflowInputSha: SOURCE,
      } as never)).rejects.toMatchObject({
        code: 'SEALED_REALMS_DISPATCH_OPERATION_INVALID',
      } satisfies Partial<SealedRealmsProductionDispatcherError>);
      expect(local.preflight).not.toHaveBeenCalled();
    } finally { local.cleanup(); }
  });

  it('keeps Task 6E unavailable and rejects nested legacy input before any lane', async () => {
    const local = await dispatcherFixture('activation-evidence-generate');
    const original = globalThis.WebSocket;
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true, value: function WebSocket() {},
    });
    try {
      await expect(local.dispatcher.dispatch({
        operation: 'activation-evidence-generate',
        workflowInputSha: SOURCE,
      })).resolves.toEqual({
        operation: 'activation-evidence-generate',
        status: 'SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE',
      });
      await expect(local.dispatcher.dispatch({
        operation: 'activation-evidence-generate',
        workflowInputSha: SOURCE,
        input: { confirmation: 'private-confirmation', result: 'private-result' },
      } as never)).rejects.toMatchObject({
        code: 'SEALED_REALMS_DISPATCH_REQUEST_INVALID',
      });
      expect(local.preflight).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original });
      local.cleanup();
    }
  });

  it('discards nested callback output at a real branded lane boundary', async () => {
    const local = await dispatcherFixture();
    const privateSentinel = '/private/warpkeep/dispatcher-secret-sentinel';
    try {
      local.preflight.mockResolvedValueOnce({
        status: privateSentinel, private: privateSentinel, result: privateSentinel,
      });
      const result = await local.dispatcher.dispatch({
        operation: 'preflight', workflowInputSha: SOURCE,
      });
      expect(result).toEqual({ operation: 'preflight', status: 'preflight-inspected' });
      expect(JSON.stringify(result)).not.toContain(privateSentinel);
    } finally { local.cleanup(); }
  });

  it('requires WebSocket before a network-capable lane dependency is reached', async () => {
    const local = await dispatcherFixture('g002-import-inspect');
    const original = globalThis.WebSocket;
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: undefined });
    try {
      await expect(local.dispatcher.dispatch({
        operation: 'g002-import-inspect',
        workflowInputSha: SOURCE,
      })).rejects.toMatchObject({
        code: 'SEALED_REALMS_DISPATCH_WEBSOCKET_UNAVAILABLE',
      });
      expect(local.preflight).not.toHaveBeenCalled();
      expect(local.verifyEvidence).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: original });
      local.cleanup();
    }
  });
});

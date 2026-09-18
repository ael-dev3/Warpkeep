import { sealedRealmsPrivateBase } from './helpers/sealedRealmsPrivateRoots';
// @vitest-environment node
// Only artifact issuance and external provider I/O are seams. Every authority,
// private-state, claim, reconciliation, lane and dispatcher implementation is real.
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
const seams = vi.hoisted(() => ({
  request: vi.fn(),
  artifacts: new WeakSet<object>(),
  g002Artifacts: new WeakSet<object>(),
  census: vi.fn(),
  inlineCensus: vi.fn(),
  comparison: vi.fn(),
}));
vi.mock('../scripts/genesis001-linux-census-attempt.mjs', async original => ({
  ...await original<object>(), readFixedLinuxG001CensusAttempt: seams.census,
}));
vi.mock('../scripts/genesis001-linux-policy-native.mjs', async original => ({
  ...await original<object>(), readFixedLinuxG001ActivationCensusEvidence: seams.inlineCensus,
}));
vi.mock('../scripts/sealed-realms-production-recovery-program-artifacts.mjs', async original => ({
  ...await original<object>(), readSealedRealmsProductionRecoveryAdoptionProgramComparison: seams.comparison,
}));
vi.mock("../scripts/ptr-update-provider-credentials.mjs", () => ({
  createPtrUpdateProviderCredentials: () => Object.freeze({}),
  requestPtrUpdateProvider: seams.request,
  disposePtrUpdateProviderCredentials: () => {},
  createG002UpdateProviderCredentials: () => Object.freeze({}),
  requestG002UpdateProvider: seams.request,
  disposeG002UpdateProviderCredentials: () => {},
}));
vi.mock("../scripts/ptr-production-publisher.mjs", async (importOriginal) => ({
  ...await importOriginal<typeof import("../scripts/ptr-production-publisher.mjs")>(),
  assertPtrSourceBuiltArtifact: (value: {
    assertSourceAndArtifact: () => void;
  }) => {
    if (!seams.artifacts.has(value))
      throw Error("Fixture artifact capability required");
    value.assertSourceAndArtifact();
    return value;
  },
}));
vi.mock("../scripts/genesis002-production-publisher.mjs", async (importOriginal) => ({
  ...await importOriginal<typeof import("../scripts/genesis002-production-publisher.mjs")>(),
  assertGenesis002SourceBuiltArtifact: (value: { assertSourceAndArtifact: () => void }) => {
    if (!seams.g002Artifacts.has(value)) throw Error("Fixture G002 artifact capability required");
    value.assertSourceAndArtifact();
    return value;
  },
}));
import { createPtrProductionExistingUpdateAdapter, exportPtrExistingUpdateCompletion, readPtrExistingUpdateCompletion } from "../scripts/ptr-production-existing-update-adapter.mjs";
import { capturePtrExistingUpdateAdoption, readPtrExistingStateAdoption } from '../scripts/ptr-production-existing-update-adapter.mjs';
import { readPtrRetainedUpdateSourceCommit, readG002RetainedUpdateSourceCommit } from '../scripts/ptr-production-existing-update-adapter.mjs';
import { createG002ProductionExistingUpdateAdapter, exportG002ExistingUpdateCompletion,
  readG002ExistingUpdateCompletion, readG002ExistingUpdateCompletionFromPrivateState,
  captureG002ExistingUpdateAdoption, readG002ExistingStateAdoption } from '../scripts/ptr-production-existing-update-adapter.mjs';
import * as adoptionWriter from '../scripts/sealed-realms-production-activation-records.mjs';
import { createPtrUpdateObservationTransportFixture, createG002UpdateObservationTransportFixture } from './helpers/ptrUpdateObservationFixture';
vi.mock('../services/release-recovery/src/recoveryPublicKey.js', () => ({
  RECOVERY_KEY_ID: 'warpkeep-0.4.0-recovery-2026-09-03-1',
  RECOVERY_KEY_THUMBPRINT: 'zbHwk528B5de5kuNzI98k4Y-rljmW6fbkH-aVZomk4M',
  RECOVERY_PUBLIC_JWK: { kty: 'EC', crv: 'P-256', x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE', y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA' },
}));
import {
  createSealedRealmsProductionActivationRecords,
  writeSealedRealmsProductionPtrExistingUpdateRecord,
} from "../scripts/sealed-realms-production-activation-records.mjs";
import { canonicalizePtrRawV10 } from "../scripts/ptr-artifact-description.mjs";
import { authenticateSealedRealmsProductionSourceAuthority, authenticateSealedRealmsProductionRetainedSource } from "../scripts/sealed-realms-production-source-authority.mjs";
import {
  createSealedRealmsProductionPrivateState,
  SEALED_REALMS_PRIVATE_STATE_VERSION,
} from "../scripts/sealed-realms-production-private-state.mjs";
import {
  issueSealedRealmsProductionWorkflowPermit,
  attestSealedRealmsProductionWorkflowPermit,
} from "../scripts/sealed-realms-production-workflow-authority.mjs";
import {
  createSealedRealmsProductionContinuationStore,
  claimSealedRealmsProductionContinuation,
  assertSealedRealmsProductionContinuationClaim,
  issueSealedRealmsProductionContinuation,
  reconcileSealedRealmsProductionContinuation,
} from "../scripts/sealed-realms-production-continuation.mjs";
import { createSealedRealmsProductionAuthBridgeState, createSealedRealmsProductionAuthBridgeStateTestCapability } from "../scripts/sealed-realms-production-auth-bridge-state.mjs";
import { createSealedRealmsProductionPublicationReconciler } from "../scripts/sealed-realms-production-reconciliation.mjs";
import {
  createSealedRealmsProductionPtrLane,
  createSealedRealmsProductionPtrDispatchContext,
  createSealedRealmsProductionPtrDispatcher,
} from "../scripts/sealed-realms-production-ptr-lane-entry.mjs";
import { createSealedRealmsProductionG002Lane, createSealedRealmsProductionG002DispatchContext,
  createSealedRealmsProductionG002Dispatcher } from '../scripts/sealed-realms-production-g002-lane-entry.mjs';
import {
  existingUpdateTokenDigest,
  updateProgramHash,
  updateDigest,
} from "../scripts/sealed-realms-existing-update-protocol.mjs";
const SOURCE = "a".repeat(40),
  ID = "c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e";
const G002_ID = 'c2003223f6e3c86e988775ddd458c3a45635d0d021e11131551471617c392194';
type UpdateLane = 'ptr' | 'g002';
type UpdateOperation = `${UpdateLane}-update-${'inspect' | 'apply'}`;
type ObservationOptions = { sourceTree?: string; bridgeSourceCommit?: string; recoveryAuthorizationEpoch?: number };
type UpdateAdapter<Lane extends UpdateLane> = ReturnType<Lane extends 'g002'
  ? typeof createG002ProductionExistingUpdateAdapter : typeof createPtrProductionExistingUpdateAdapter>;
const BEFORE = "c".repeat(64),
  candidateBytes = Buffer.from("candidate source built bytes"),
  CANDIDATE = updateProgramHash(candidateBytes);
const definition = canonicalizePtrRawV10(
  readFileSync(
    new URL(
      "./fixtures/ptr-artifact-description-2.6.1/first.json",
      import.meta.url,
    ),
  ),
);
const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
const plan = (prior: string, identity = ID) => ({
  AutoMigrate: {
    break_clients: false,
    major_version_upgrade: false,
    migrate_plan: `${"━".repeat(60)}\nDatabase Migration Plan\n${"━".repeat(60)}\n\n`,
    token:
      "0x" +
      Buffer.from(existingUpdateTokenDigest(identity, prior, CANDIDATE), "hex")
        .reverse()
        .toString("hex"),
  },
});
const readGit = (args: readonly string[]) => {
  if (args[0] !== "rev-parse") throw Error("Unexpected fixture Git query");
  return `${SOURCE}\n`;
};
const readBinding = () => ({
  schemaVersion: 1,
  profile: "warpkeep-0.4.0-sealed-launch-v1",
  pagesDeploymentApproved: false,
  preparationSourceCommit: null,
});
const verifyEvidence = (verifiedSha: string) => ({ verifiedSha });
function authority(operation: UpdateOperation) {
  return authenticateSealedRealmsProductionSourceAuthority({
    operation,
    workflowInputSha: SOURCE,
    readGit,
    readBinding,
    verifyEvidence,
  });
}
function github() {
  const status = new Map<string, "in_progress" | "completed">();
  let next = 500;
  async function run(operation: UpdateOperation) {
    const runId = String(++next);
    status.set(runId, "in_progress");
    const sourceAuthority = authority(operation);
    const permit = await issueSealedRealmsProductionWorkflowPermit({
      sourceAuthority,
      runId,
      runAttempt: 1,
      githubToken: "synthetic-github-fixture-credential",
      fetchImpl: async (target) => {
        const url = String(target);
        let body: unknown;
        if (url.endsWith("/branches/main"))
          body = { name: "main", protected: true, commit: { sha: SOURCE } };
        else {
          const id = /\/actions\/runs\/([1-9][0-9]*)$/u.exec(url)?.[1];
          if (!id) throw Error("Unexpected fixture GitHub URL");
          const state = status.get(id) ?? "completed";
          body = {
            id: Number(id),
            run_attempt: 1,
            event: "workflow_dispatch",
            status: state,
            conclusion: state === "completed" ? "failure" : null,
            head_branch: "main",
            head_sha: SOURCE,
            path: ".github/workflows/sealed-realms-production.yml",
            repository: { full_name: "ael-dev3/Warpkeep" },
          };
        }
        const response = new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
        Object.defineProperty(response, "url", { value: url });
        return response;
      },
    });
    return { runId, runAttempt: "1", sourceAuthority, permit };
  }
  return { status, run };
}
const supported =
  process.platform === "linux" &&
  typeof process.getuid === "function" &&
  process.getuid() > 0;
const native = it.skipIf(!supported);
if (process.env.WARPKEEP_REQUIRE_SYNTHETIC_NETWORK === "1" && !supported)
  throw Error("Required native PTR continuation coverage is unavailable");
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0).reverse()) close();
  seams.request.mockReset();
  vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});
function fixture<Lane extends UpdateLane = 'ptr'>(platformMode = false, race?: (phase: string, path: string) => void,
  observationOptions: ObservationOptions = {}, laneName: Lane = 'ptr' as Lane,
  shared?: { home: string; privateState: ReturnType<typeof createSealedRealmsProductionPrivateState> }) {
  const identity = laneName === 'ptr' ? ID : G002_ID;
  const fixtureNow = Math.floor(Date.now() / 1000);
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(fixtureNow * 1000);
  const observationRun = (runId: string) => ({ sourceCommit: SOURCE, sourceTree: observationOptions.sourceTree ?? 'b'.repeat(40), runId,
    runAttempt: '1', checkRunId: '9001', requestId: '123e4567-e89b-42d3-a456-426614174000' });
  const observations = (laneName === 'ptr' ? createPtrUpdateObservationTransportFixture : createG002UpdateObservationTransportFixture)(
    observationRun('502'), { nowSeconds: fixtureNow, bridgeSourceCommit: observationOptions.bridgeSourceCommit,
      recoveryAuthorizationEpoch: observationOptions.recoveryAuthorizationEpoch });
  observations.install();
  const root = shared ? undefined : mkdtempSync(join(tmpdir(), "warpkeep-ptr-real-continuation-"));
  const adapters = new Set<UpdateAdapter<UpdateLane>>();
  cleanup.push(() => {
    for (const adapter of adapters) adapter.dispose();
    if (root === undefined) return;
    if (!root.startsWith(join(tmpdir(), "warpkeep-ptr-real-continuation-")))
      throw Error("Invalid fixture cleanup");
    rmSync(root, { recursive: true });
  });
  if (root !== undefined) chmodSync(root, 0o700);
  const home = shared?.home ?? join(root!, "home");
  if (!shared) for (const suffix of ["audit/private", "runtime", "cache"])
    mkdirSync(
      join(sealedRealmsPrivateBase(home), suffix),
      { recursive: true, mode: 0o700 },
    );
  const privateState = shared?.privateState ?? createSealedRealmsProductionPrivateState({
    reportedHome: home,
    testOnlyOwnerUid: statSync(root!).uid,
    ...(platformMode ? { testOnlyAllowPlatformMode: true, testOnlyFsync: () => {} } : {}),
    ...(race ? { testOnlyRace: race } : {}),
  });
  const store = createSealedRealmsProductionContinuationStore({ privateState });
  const gh = github();
  const runtime = join(sealedRealmsPrivateBase(home), 'runtime',
    SEALED_REALMS_PRIVATE_STATE_VERSION,
  );
  const updateDirectory = `existing-updates-production-v1/${laneName}/${identity}`;
  const state = {
    current: BEFORE,
    puts: 0,
    lost: false,
    beforeSend: undefined as undefined | (() => void),
  };
  const artifact = Object.freeze({
    sourceCommit: SOURCE,
    moduleSha256: createHash("sha256").update(candidateBytes).digest("hex"),
    moduleProgramHash: CANDIDATE,
    moduleTreeId: "d".repeat(40),
    dependencyClosureDigest: "e".repeat(64),
    spacetimeExecutableSha256: "f".repeat(64),
    spacetimeCliConfigSha256: "1".repeat(64),
    artifactDescription: {
      definition: definition.definition,
      descriptionSha256: definition.digest,
      canonicalizationProfile: definition.profile,
      rawModuleDefVersion: 10,
    },
    assertSourceAndArtifact: () => {},
  });
  (laneName === 'ptr' ? seams.artifacts : seams.g002Artifacts).add(artifact);
  seams.request.mockImplementation(
    async (
      _provider: unknown,
      input: { operation: string; beforeSend?: () => Promise<void> },
    ) => {
      let body: unknown;
      switch (input.operation) {
        case "health":
          body = { version: "2.10.0", package_name: "spacetimedb-cloud" };
          break;
        case "metadata":
          body = {
            database_identity: { __identity__: "0x" + identity },
            owner_identity: { __identity__: "0x" + "2".repeat(64) },
            host_type: { Js: [] },
            initial_program: "0x" + BEFORE,
          };
          break;
        case "schema":
          body = definition.definition;
          break;
        case "plan":
          body = plan(state.current, identity);
          break;
        case "apply":
          state.beforeSend?.();
          await input.beforeSend!();
          expect(
            privateState
              .list({ root: "runtime", relativeDirectory: updateDirectory })
              .some((name) => name.endsWith(".submission.json")),
          ).toBe(true);
          state.puts++;
          state.current = CANDIDATE;
          if (state.lost)
            throw Error("Synthetic provider committed; response lost");
          body = {
            Success: { domain: null, database_identity: identity, op: "updated" },
          };
          break;
        default:
          throw Error("Unexpected provider operation");
      }
      return { bytes: encode(body), claimedProviderIdentity: "2".repeat(64) };
    },
  );
  const make = (runId = '502', storage = privateState) => {
    observations.useRun(observationRun(runId));
    const adapter = (laneName === 'ptr' ? createPtrProductionExistingUpdateAdapter : createG002ProductionExistingUpdateAdapter)({
      authority: authority(`${laneName}-update-inspect`),
      privateState: storage,
      artifact: artifact as never,
      observation: { sourceTree: observationOptions.sourceTree ?? 'b'.repeat(40), runId, runAttempt: '1' },
    });
    adapters.add(adapter);
    return adapter as UpdateAdapter<Lane>;
  };
  const unavailable = () => {
    throw Error("Unrelated publication/import/provision is forbidden");
  };
  async function dispatcher(
    operation: UpdateOperation,
    adapter: ReturnType<typeof make>,
    storage = privateState,
    continuationStore = store,
  ) {
    const run = await gh.run(operation);
    const bridgeState = createSealedRealmsProductionAuthBridgeState({
      authority: run.sourceAuthority,
      privateState: storage,
      repositoryRoot: process.cwd(),
      testOnlyCapability: createSealedRealmsProductionAuthBridgeStateTestCapability(),
      deploymentAttester: unavailable,
      bindingAttester: unavailable,
      fetchImpl: unavailable,
      inspectImportReceipt: unavailable,
      authenticateImportResult: unavailable,
      resolveOwnerProvisionReceipt: unavailable,
    });
    const commonLane = {
      existingUpdate: adapter,
      bridgeState,
      reconciler: createSealedRealmsProductionPublicationReconciler({
        privateState: storage,
        lane: laneName,
        postflight: unavailable,
      }),
      createPublishMarker: unavailable,
      publish: unavailable,
      importCore: unavailable,
      liveInspect: unavailable,
    };
    const contextInput = {
      readGit,
      readBinding,
      verifyEvidence,
      ...run,
      continuationStore,
    };
    const target = laneName === 'ptr'
      ? createSealedRealmsProductionPtrDispatcher({
        context: createSealedRealmsProductionPtrDispatchContext(contextInput),
        lane: createSealedRealmsProductionPtrLane({ ...commonLane, existingUpdate: adapter as UpdateAdapter<'ptr'>,
          inspectOwnerProvision: unavailable, provisionOwner: unavailable }),
      })
      : createSealedRealmsProductionG002Dispatcher({
        context: createSealedRealmsProductionG002DispatchContext(contextInput),
        lane: createSealedRealmsProductionG002Lane({ ...commonLane, existingUpdate: adapter as UpdateAdapter<'g002'> }),
      });
    return {
      ...run,
      call: () => target.dispatch({ operation, workflowInputSha: SOURCE }),
    };
  }
  async function inspect(adapter: ReturnType<typeof make>) {
    const run = await dispatcher(`${laneName}-update-inspect`, adapter);
    await run.call();
    gh.status.set(run.runId, "completed");
  }
  const records = () =>
    privateState
      .list({ root: "runtime", relativeDirectory: updateDirectory })
      .map((name) => {
        const bytes = privateState.read({
          root: "runtime",
          relativePath: `${updateDirectory}/${name}`,
        });
        try {
          return JSON.parse(bytes.toString()) as {
            kind: string;
            value: Record<string, unknown>;
          };
        } finally {
          bytes.fill(0);
        }
      });
  function continuationTerminals(path = runtime): Record<string, unknown>[] {
    return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? continuationTerminals(join(path, entry.name))
        : entry.name.endsWith(".json")
          ? [JSON.parse(readFileSync(join(path, entry.name), "utf8"))].filter(
              (value) =>
                value.profile ===
                "warpkeep-sealed-realms-continuation-terminal-v1",
            )
          : [],
    );
  }
  return {
    home,
    runtime,
    observations,
    observationRun,
    state,
    make,
    dispatcher,
    inspect,
    records,
    continuationTerminals,
    privateState,
    store,
    gh,
  };
}
function captureCompletion(
  f: ReturnType<typeof fixture<'ptr'>>,
  adapter: ReturnType<typeof createPtrProductionExistingUpdateAdapter>,
  sourceAuthority: ReturnType<typeof authority>,
  outcome: "completed" | "reconciled-effect-applied",
) {
  const completion = exportPtrExistingUpdateCompletion({ adapter, authority: sourceAuthority, store: f.store });
  const receipt = readPtrExistingUpdateCompletion({ completion, authority: sourceAuthority, privateState: f.privateState });
  expect(receipt.continuation.outcome).toBe(outcome);
  expect(receipt.continuation.claimRunId).toBe(receipt.submission.runId);
  expect(receipt.binding.candidateProgram).toBe(CANDIDATE);
  const records = createSealedRealmsProductionActivationRecords({ privateState: f.privateState, authority: sourceAuthority });
  const captured = writeSealedRealmsProductionPtrExistingUpdateRecord({ records, authority: sourceAuthority, completion });
  const bytes = f.privateState.read({ root: "runtime", relativePath: "activation-evidence/records/ptr-existing-update-receipt.json" });
  try {
    const stored = JSON.parse(bytes.toString());
    expect(stored.member).toBe("ptrExistingUpdateReceipt");
    expect(stored.receipt).toEqual(receipt);
    expect(captured.receiptDigest).toBe(updateDigest(receipt));
    expect(captured.recordDigest).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(() => writeSealedRealmsProductionPtrExistingUpdateRecord({ records, authority: sourceAuthority, completion: stored.receipt })).toThrow();
  } finally { bytes.fill(0); }
  const reopened = createSealedRealmsProductionActivationRecords({ privateState: f.privateState, authority: sourceAuthority });
  expect(writeSealedRealmsProductionPtrExistingUpdateRecord({ records: reopened, authority: sourceAuthority, completion })).toEqual(captured);
  return { receipt, completion };
}

// Source artifact issuance and provider bytes are fixture seams. These cases run
// the real G002 lane, source authority, workflow permit, private journal, claim,
// terminal and signature verification. Windows explicitly relaxes POSIX mode/fsync;
// native Linux runs the same cases without that relaxation.
it.each([
  { scenario: 'received response', lost: false, outcome: 'completed', acknowledgement: 'received' },
  { scenario: 'lost response', lost: true, outcome: 'reconciled-effect-applied', acknowledgement: 'not-received' },
] as const)('G002 genuine continuation: $scenario retains signed adoption across private-state restart without replay', async ({ lost, outcome, acknowledgement }) => {
  const f = fixture(process.platform !== 'linux', undefined, {}, 'g002');
  let adapter = f.make();
  await f.inspect(adapter);
  f.state.lost = lost;
  const original = await f.dispatcher('g002-update-apply', adapter);
  expect(() => exportG002ExistingUpdateCompletion({ adapter, authority: original.sourceAuthority, store: f.store })).toThrow();
  let terminalRun = original;
  if (lost) {
    await expect(original.call()).rejects.toThrow('SEALED_REALMS_DISPATCH_LANE_FAILED');
    expect(f.state.puts).toBe(1);
    expect(f.records().map(record => record.kind).sort()).toEqual(['inspection', 'submission']);
    expect(f.continuationTerminals()).toHaveLength(0);
    f.gh.status.set(original.runId, 'completed');
    adapter.dispose();
    adapter = f.make('503');
    terminalRun = await f.dispatcher('g002-update-apply', adapter);
  }
  await terminalRun.call();
  const completion = exportG002ExistingUpdateCompletion({ adapter, authority: terminalRun.sourceAuthority, store: f.store });
  const receipt = readG002ExistingUpdateCompletion({ completion, authority: terminalRun.sourceAuthority, privateState: f.privateState });
  expect(receipt).toMatchObject({
    profile: 'warpkeep-g002-existing-update-receipt-v1', acknowledgement,
    binding: { sourceCommit: SOURCE, databaseIdentity: G002_ID, candidateProgram: CANDIDATE },
    preservation: { profile: 'warpkeep-g002-raw-v10-stable-row-schema-v1' },
    submission: { runId: original.runId, runAttempt: 1 },
    continuation: { outcome, claimRunId: original.runId, claimRunAttempt: 1,
      terminalRunId: terminalRun.runId, terminalRunAttempt: 1 },
  });
  if (lost) {
    expect(receipt.acknowledgementRecordDigest).toBeNull();
    expect(receipt.responseDigest).toBeNull();
  } else {
    expect(receipt.acknowledgementRecordDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(receipt.responseDigest).toMatch(/^[a-f0-9]{64}$/u);
  }
  expect(f.continuationTerminals()).toHaveLength(1);
  expect(f.continuationTerminals()[0]).toMatchObject({ kind: 'g002-update', outcome });
  const journal = JSON.stringify(f.records());
  f.observations.setNowSeconds(Math.ceil(Date.parse(receipt.continuation.terminalAt) / 1000) + 5);
  const adoption = await captureG002ExistingUpdateAdoption({ adapter, authority: terminalRun.sourceAuthority,
    store: f.store, permit: terminalRun.permit, runId: terminalRun.runId, runAttempt: terminalRun.runAttempt });
  const envelope = await readG002ExistingStateAdoption({ adoption, authority: terminalRun.sourceAuthority, privateState: f.privateState });
  expect(envelope).toMatchObject({ schemaVersion: 1, profile: 'warpkeep-g002-existing-state-adoption-v1',
    sourceCommit: SOURCE, sourceTree: 'b'.repeat(40), completionReceipt: receipt });
  expect(f.observations.observations).toHaveLength(2);
  expect(f.observations.observations[0]).toMatchObject({
    profile: 'warpkeep-recovery-g002-update-observation-v1',
    identity: { runId: original.runId },
    context: { phase: 'pre', claimRecordDigest: receipt.continuation.claimRecordDigest },
    observation: { g002: { databaseIdentity: G002_ID, programKeccak256: BEFORE, sealed: true, playerCount: 0 } },
  });
  expect(f.observations.observations[1]).toMatchObject({
    identity: { runId: terminalRun.runId },
    context: { phase: 'post', terminalRecordDigest: receipt.continuation.terminalRecordDigest,
      completionReceiptDigest: updateDigest(receipt) },
    observation: { g002: { programKeccak256: CANDIDATE, sealed: true, playerCount: 0 } },
  });
  const records = createSealedRealmsProductionActivationRecords({ privateState: f.privateState, authority: terminalRun.sourceAuthority });
  const writeCompletion = (adoptionWriter as Record<string, any>).writeSealedRealmsProductionG002ExistingUpdateRecord;
  const writeAdoption = (adoptionWriter as Record<string, any>).writeSealedRealmsProductionG002ExistingStateAdoptionRecord;
  const authenticate = (adoptionWriter as Record<string, any>).authenticateSealedRealmsProductionG002ExistingStateAdoption;
  const readEvidence = (adoptionWriter as Record<string, any>).readSealedRealmsProductionG002ExistingStateAdoptionEvidence;
  expect(writeCompletion).toBeTypeOf('function');
  const writtenCompletion = writeCompletion({ records, authority: terminalRun.sourceAuthority, completion });
  const writtenAdoption = await writeAdoption({ records, authority: terminalRun.sourceAuthority, adoption });
  expect(writtenCompletion.receiptDigest).toBe(updateDigest(receipt));
  expect(await writeAdoption({ records, authority: terminalRun.sourceAuthority, adoption })).toEqual(writtenAdoption);
  expect(() => writeCompletion({ records, authority: terminalRun.sourceAuthority, completion: receipt })).toThrow();
  await expect(readPtrExistingStateAdoption({ adoption: adoption as never, authority: terminalRun.sourceAuthority,
    privateState: f.privateState })).rejects.toThrow();
  expect(() => readPtrExistingUpdateCompletion({ completion: completion as never, authority: terminalRun.sourceAuthority,
    privateState: f.privateState })).toThrow();
  adapter.dispose();
  await expect(readG002ExistingStateAdoption({ adoption, authority: terminalRun.sourceAuthority,
    privateState: f.privateState })).rejects.toThrow();

  const requests = f.observations.requests.length, providerRequests = seams.request.mock.calls.length;
  const restartedState = createSealedRealmsProductionPrivateState({ reportedHome: f.home,
    testOnlyOwnerUid: statSync(f.home).uid,
    ...(process.platform !== 'linux' ? { testOnlyAllowPlatformMode: true, testOnlyFsync: () => {} } : {}) });
  const restartedStore = createSealedRealmsProductionContinuationStore({ privateState: restartedState });
  const restartedAuthority = authority('g002-update-apply');
  const retainedInput = { authority: restartedAuthority, privateState: restartedState, store: restartedStore };
  expect(readG002ExistingUpdateCompletionFromPrivateState(retainedInput)).toEqual(receipt);
  const reopenedRecords = createSealedRealmsProductionActivationRecords({ privateState: restartedState, authority: restartedAuthority });
  const evidence = await authenticate({ records: reopenedRecords, authority: restartedAuthority, store: restartedStore });
  const evidenceInput = { evidence, privateState: restartedState, sourceCommit: SOURCE };
  const authenticated = readEvidence(evidenceInput);
  expect(authenticated).toMatchObject({ sourceCommit: SOURCE, sourceTree: 'b'.repeat(40),
    adoptionReceiptDigest: writtenAdoption.recordDigest, completionReceipt: receipt,
    pair: { post: { observation: { g002: { databaseIdentity: G002_ID, programKeccak256: CANDIDATE } } } } });
  expect(() => readEvidence({ ...evidenceInput, evidence: { ...evidence } })).toThrow();
  expect(() => readEvidence({ ...evidenceInput, privateState: f.privateState })).toThrow();
  expect(() => readEvidence({ ...evidenceInput, sourceCommit: 'f'.repeat(40) })).toThrow();
  expect(() => adoptionWriter.readSealedRealmsProductionPtrExistingStateAdoptionEvidence(evidenceInput)).toThrow();
  await expect(authenticate({ records: reopenedRecords, authority: authority('ptr-update-apply'), store: restartedStore })).rejects.toThrow();
  expect(() => readG002ExistingUpdateCompletionFromPrivateState({ ...retainedInput, authority: authority('ptr-update-apply') })).toThrow();
  expect(() => readG002ExistingUpdateCompletionFromPrivateState({ ...retainedInput, store: {} as never })).toThrow();
  f.gh.status.set(terminalRun.runId, 'completed');
  const restarted = f.make(lost ? '504' : '503', restartedState);
  const retry = await f.dispatcher('g002-update-apply', restarted, restartedState, restartedStore);
  f.observations.setNowSeconds(Math.ceil(Date.parse(receipt.continuation.terminalAt) / 1000) + 200);
  const retained = await captureG002ExistingUpdateAdoption({ adapter: restarted, authority: retry.sourceAuthority,
    store: restartedStore, permit: retry.permit, runId: retry.runId, runAttempt: retry.runAttempt });
  const readRetained = () => readG002ExistingStateAdoption({ adoption: retained, authority: retry.sourceAuthority, privateState: restartedState });
  expect(await readRetained()).toEqual(envelope);
  await expect(readG002ExistingStateAdoption({ adoption: { ...retained } as never,
    authority: retry.sourceAuthority, privateState: restartedState })).rejects.toThrow();
  const updateDirectory = `existing-updates-production-v1/g002/${G002_ID}`;
  const completionName = restartedState.list({ root: 'runtime', relativeDirectory: updateDirectory })
    .find(name => name.endsWith('.completion.json'))!;
  const completionPath = join(f.runtime, updateDirectory, completionName);
  const postPath = join(f.runtime, 'g002-update-observation-v1', G002_ID, `${receipt.continuation.claimRecordDigest}.post.json`);
  for (const target of [completionPath, postPath]) {
    const saved = readFileSync(target);
    try {
      writeFileSync(target, '{}\n');
      await expect(readRetained()).rejects.toThrow();
      if (target === completionPath) expect(() => readG002ExistingUpdateCompletionFromPrivateState(retainedInput)).toThrow();
    } finally { writeFileSync(target, saved); }
    expect(await readRetained()).toEqual(envelope);
  }
  for (const target of [completionPath,
    join(f.runtime, 'activation-evidence/records/g002-existing-update-receipt.json'),
    join(f.runtime, 'g002-existing-state-adoptions-v1', `${writtenAdoption.receiptDigest}.json`)]) {
    const saved = readFileSync(target);
    try {
      writeFileSync(target, '{}\n');
      expect(() => readEvidence(evidenceInput)).toThrow();
      await expect(authenticate({ records: reopenedRecords, authority: restartedAuthority, store: restartedStore })).rejects.toThrow();
    } finally { writeFileSync(target, saved); }
    expect(readEvidence(evidenceInput)).toEqual(authenticated);
  }
  expect(f.observations.requests).toHaveLength(requests);
  expect(seams.request).toHaveBeenCalledTimes(providerRequests);
  expect(JSON.stringify(f.records())).toBe(journal);
  expect(f.continuationTerminals()).toHaveLength(1);
  expect(f.state.puts).toBe(1);
}, 30000);

it("uses a genuine workflow permit which refuses a newly terminal GitHub run", async () => {
  const gh = github(),
    run = await gh.run("ptr-update-apply");
  await expect(
    attestSealedRealmsProductionWorkflowPermit({
      ...run,
      phase: "continuation-effect",
    }),
  ).resolves.toBeTruthy();
  gh.status.set(run.runId, "completed");
  await expect(
    attestSealedRealmsProductionWorkflowPermit({
      ...run,
      phase: "continuation-effect",
    }),
  ).rejects.toThrow();
});
it("rejects a transparent production authority before artifact or provider use", () => {
  expect(() =>
    createPtrProductionExistingUpdateAdapter({
      authority: { mode: "S", operation: "ptr-update-inspect" } as never,
      privateState: {} as never,
      artifact: {} as never,
      observation: { sourceTree: 'b'.repeat(40), runId: '502', runAttempt: '1' },
    }),
  ).toThrow();
  expect(seams.request).not.toHaveBeenCalled();
});
it("rejects an unissued claim through the genuine claim assertion", () => {
  expect(() =>
    assertSealedRealmsProductionContinuationClaim({
      claim: {},
      store: {} as never,
      sourceAuthority: authority("ptr-update-apply"),
      kind: "ptr-update",
      runId: "501",
      runAttempt: 1,
      subject: `ptr-update:${ID}`,
      evidenceDigest: "1".repeat(64),
      receiptDigests: [],
      predecessorDigests: [],
    }),
  ).toThrow("SEALED_REALMS_CONTINUATION_CLAIM_INVALID");
});
native(
  "direct real-lane apply accepts the synchronous claim and persists one genuine terminal",
  async () => {
    const f = fixture(),
      adapter = f.make();
    await f.inspect(adapter);
    const run = await f.dispatcher("ptr-update-apply", adapter);
    expect(() => exportPtrExistingUpdateCompletion({ adapter, authority: run.sourceAuthority, store: f.store })).toThrow();
    await run.call();
    const direct = captureCompletion(f, adapter, run.sourceAuthority, "completed");
    expect(direct.receipt.acknowledgement).toBe("received");
    expect(direct.receipt.responseDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(f.state.puts).toBe(1);
    expect(
      f
        .records()
        .map((record) => record.kind)
        .sort(),
    ).toEqual(["acknowledgement", "completion", "inspection", "submission"]);
    expect(f.continuationTerminals()).toHaveLength(1);
    expect(f.continuationTerminals()[0].outcome).toBe("completed");
    f.gh.status.set(run.runId, "completed");
    adapter.dispose();
    const fresh = f.make(),
      later = await f.dispatcher("ptr-update-apply", fresh);
    expect(() => readPtrExistingUpdateCompletion({ completion: direct.completion, authority: later.sourceAuthority, privateState: f.privateState })).toThrow();
    expect(captureCompletion(f, fresh, later.sourceAuthority, "completed").receipt).toEqual(direct.receipt);
    await expect(later.call()).rejects.toThrow();
    expect(f.state.puts).toBe(1);
  },
);
native(
  "fresh adapter reconciles a lost response after the old run terminates without a second PUT",
  async () => {
    const f = fixture(),
      adapter = f.make();
    await f.inspect(adapter);
    f.state.lost = true;
    const run = await f.dispatcher("ptr-update-apply", adapter);
    await expect(run.call()).rejects.toThrow("SEALED_REALMS_DISPATCH_LANE_FAILED");
    expect(f.state.puts).toBe(1);
    adapter.dispose();
    const fresh = f.make(),
      live = await f.dispatcher("ptr-update-apply", fresh);
    await expect(live.call()).rejects.toThrow("SEALED_REALMS_DISPATCH_LANE_FAILED");
    expect(f.records().some((record) => record.kind === "completion")).toBe(
      false,
    );
    expect(f.state.puts).toBe(1);
    f.gh.status.set(live.runId, "completed");
    f.gh.status.set(run.runId, "completed");
    const recovery = await f.dispatcher("ptr-update-apply", fresh);
    expect(() => exportPtrExistingUpdateCompletion({ adapter: fresh, authority: recovery.sourceAuthority, store: f.store })).toThrow();
    await recovery.call();
    const captured = captureCompletion(f, fresh, recovery.sourceAuthority, "reconciled-effect-applied");
    expect(captured.receipt.acknowledgement).toBe("not-received");
    expect(captured.receipt.acknowledgementRecordDigest).toBeNull();
    expect(captured.receipt.responseDigest).toBeNull();
    expect(captured.receipt.continuation.terminalRunId).toBe(recovery.runId);
    fresh.dispose();
    expect(captureCompletion(f, f.make(), recovery.sourceAuthority, "reconciled-effect-applied").receipt).toEqual(captured.receipt);
    expect(f.state.puts).toBe(1);
    expect(captured.receipt.acknowledgement).toBe("not-received");
    expect(
      f.records().some((record) => record.kind === "acknowledgement"),
    ).toBe(false);
    expect(f.continuationTerminals()).toHaveLength(1);
    expect(f.continuationTerminals()[0].outcome).toBe("reconciled-effect-applied");
  },
);
native(
  "permit revocation at beforeSend produces no PUT and genuine later no-effect reconciliation",
  async () => {
    const f = fixture(),
      adapter = f.make();
    await f.inspect(adapter);
    const run = await f.dispatcher("ptr-update-apply", adapter);
    f.state.beforeSend = () => f.gh.status.set(run.runId, "completed");
    await expect(run.call()).rejects.toThrow("SEALED_REALMS_DISPATCH_LANE_FAILED");
    expect(f.state.puts).toBe(0);
    expect(
      f
        .records()
        .map((record) => record.kind)
        .sort(),
    ).toEqual(["inspection", "not-submitted"]);
    adapter.dispose();
    const fresh = f.make(),
      recovery = await f.dispatcher("ptr-update-apply", fresh);
    await recovery.call();
    expect(f.state.puts).toBe(0);
    expect(f.continuationTerminals()).toHaveLength(1);
    expect(f.continuationTerminals()[0].outcome).toBe("reconciled-no-effect");
    expect(() => exportPtrExistingUpdateCompletion({ adapter: fresh, authority: recovery.sourceAuthority, store: f.store })).toThrow();
    expect(f.privateState.exists({ root: "runtime", relativePath: "activation-evidence/records/ptr-existing-update-receipt.json" })).toBe(false);
  },
);
native(
  "real claim brand exists only during direct callback entry, never in its detached microtask",
  async () => {
    const f = fixture(),
      adapter = f.make();
    await f.inspect(adapter);
    const run = await f.gh.run("ptr-update-apply");
    const selection = adapter.reopenContinuation({
      authority: run.sourceAuthority,
    });
    const common = {
      store: f.store,
      ...run,
      kind: "ptr-update" as const,
      ...selection,
    };
    await claimSealedRealmsProductionContinuation({
      ...common,
      effect: (claim) => {
        const asserted = {
          claim,
          store: common.store,
          sourceAuthority: common.sourceAuthority,
          kind: common.kind,
          runId: common.runId,
          runAttempt: common.runAttempt,
          ...selection,
        };
        expect(assertSealedRealmsProductionContinuationClaim(asserted)).toBe(
          true,
        );
        return Promise.resolve().then(async () => {
          expect(() =>
            assertSealedRealmsProductionContinuationClaim(asserted),
          ).toThrow("CLAIM_INVALID");
          await expect(
            adapter.consumeContinuationEntry({
              ...asserted,
              permit: common.permit,
              selection,
            }),
          ).rejects.toThrow("CLAIM_INVALID");
        });
      },
    });
    expect(f.state.puts).toBe(0);
    expect(f.records().map((record) => record.kind)).toEqual(["inspection"]);
  },
);

it("constructs the real PTR reconciler with genuine platform-mode private state", () => {
  // Construction only: Windows mode relaxation grants no POSIX fsync/claim proof.
  const root = mkdtempSync(join(tmpdir(), "warpkeep-ptr-codec-construction-"));
  cleanup.push(() => {
    if (!root.startsWith(join(tmpdir(), "warpkeep-ptr-codec-construction-"))) throw Error("Invalid fixture cleanup");
    rmSync(root, { recursive: true });
  });
  const home = join(root, "home");
  for (const suffix of ["audit/private", "runtime", "cache"]) mkdirSync(join(sealedRealmsPrivateBase(home), suffix), { recursive: true, mode: 0o700 });
  const privateState = createSealedRealmsProductionPrivateState({ reportedHome: home, testOnlyOwnerUid: statSync(root).uid, testOnlyAllowPlatformMode: true });
  expect(() => createSealedRealmsProductionPublicationReconciler({ privateState, lane: "ptr", postflight: () => { throw Error("No provider call expected"); } })).not.toThrow();
  expect(seams.request).not.toHaveBeenCalled();
});

it('captures signed V4 adoption through real claim, terminal and private writer without changing V3 records', async () => {
  const f = fixture(process.platform !== 'linux'), adapter = f.make();
  await f.inspect(adapter);
  const run = await f.dispatcher('ptr-update-apply', adapter);
  await run.call();
  const completed = captureCompletion(f, adapter, run.sourceAuthority, 'completed');
  const v3 = JSON.stringify(f.records());
  f.observations.setNowSeconds(Math.ceil(Date.parse(completed.receipt.continuation.terminalAt) / 1000) + 5);
  const adoption = await capturePtrExistingUpdateAdoption({ adapter, authority: run.sourceAuthority, store: f.store,
    permit: run.permit, runId: run.runId, runAttempt: run.runAttempt });
  const envelope = await readPtrExistingStateAdoption({ adoption, authority: run.sourceAuthority, privateState: f.privateState });
  expect(envelope.completionReceipt).toEqual(completed.receipt);
  expect(envelope.schemaVersion).toBe(4);
  expect(JSON.stringify(f.records())).toBe(v3);
  const writer = (adoptionWriter as Record<string, any>).writeSealedRealmsProductionPtrExistingStateAdoptionRecord;
  expect(writer).toBeTypeOf('function');
  const records = createSealedRealmsProductionActivationRecords({ privateState: f.privateState, authority: run.sourceAuthority });
  const written = await writer({ records, authority: run.sourceAuthority, adoption });
  expect(written.receiptDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(await writer({ records, authority: run.sourceAuthority, adoption })).toEqual(written);
  expect(f.state.puts).toBe(1);
  expect(JSON.stringify(f.records())).toBe(v3);
  const claimDigest = envelope.completionReceipt.continuation.claimRecordDigest;
  const postPath = join(f.runtime, 'ptr-update-observation-v4', ID, `${claimDigest}.post.json`);
  const saved = readFileSync(postPath);
  writeFileSync(postPath, Buffer.from('{}\n'));
  await expect(readPtrExistingStateAdoption({ adoption, authority: run.sourceAuthority, privateState: f.privateState })).rejects.toThrow();
  await expect(writer({ records, authority: run.sourceAuthority, adoption })).rejects.toThrow();
  writeFileSync(postPath, saved);
  await expect(readPtrExistingStateAdoption({ adoption: { ...adoption } as never, authority: run.sourceAuthority, privateState: f.privateState })).rejects.toThrow();
  adapter.dispose();
  await expect(readPtrExistingStateAdoption({ adoption, authority: run.sourceAuthority, privateState: f.privateState })).rejects.toThrow();
}, 30000);

it('reopens the original pre after lost acknowledgement, preserves distinct reconciliation identities, and reuses expired post without a second PUT', async () => {
  const f = fixture(process.platform !== 'linux'), adapter = f.make();
  await f.inspect(adapter);
  f.state.lost = true;
  const original = await f.dispatcher('ptr-update-apply', adapter);
  await expect(original.call()).rejects.toThrow('SEALED_REALMS_DISPATCH_LANE_FAILED');
  expect(f.state.puts).toBe(1);
  f.gh.status.set(original.runId, 'completed'); adapter.dispose();
  const fresh = f.make('503'), reconciliation = await f.dispatcher('ptr-update-apply', fresh);
  await reconciliation.call();
  const receipt = captureCompletion(f, fresh, reconciliation.sourceAuthority, 'reconciled-effect-applied').receipt;
  f.observations.setNowSeconds(Math.ceil(Date.parse(receipt.continuation.terminalAt) / 1000) + 5);
  const adoption = await capturePtrExistingUpdateAdoption({ adapter: fresh, authority: reconciliation.sourceAuthority,
    store: f.store, permit: reconciliation.permit, runId: reconciliation.runId, runAttempt: reconciliation.runAttempt });
  const envelope = await readPtrExistingStateAdoption({ adoption, authority: reconciliation.sourceAuthority, privateState: f.privateState });
  expect(envelope.completionReceipt.continuation).toMatchObject({ claimRunId: original.runId, terminalRunId: reconciliation.runId });
  expect(envelope.completionReceipt.responseDigest).toBeNull();
  const requestCount = f.observations.requests.length;
  fresh.dispose();
  const retryAdapter = f.make('504'), retry = await f.dispatcher('ptr-update-apply', retryAdapter);
  f.observations.setNowSeconds(Math.ceil(Date.parse(receipt.continuation.terminalAt) / 1000) + 200);
  const reused = await capturePtrExistingUpdateAdoption({ adapter: retryAdapter, authority: retry.sourceAuthority,
    store: f.store, permit: retry.permit, runId: retry.runId, runAttempt: retry.runAttempt });
  expect(await readPtrExistingStateAdoption({ adoption: reused, authority: retry.sourceAuthority, privateState: f.privateState })).toEqual(envelope);
  expect(f.observations.requests).toHaveLength(requestCount);
  expect(f.state.puts).toBe(1);
  const prePath = join(f.runtime, 'ptr-update-observation-v4', ID, `${receipt.continuation.claimRecordDigest}.pre.json`);
  rmSync(prePath);
  await expect(capturePtrExistingUpdateAdoption({ adapter: retryAdapter, authority: retry.sourceAuthority,
    store: f.store, permit: retry.permit, runId: retry.runId, runAttempt: retry.runAttempt })).rejects.toThrow();
  expect(f.observations.requests).toHaveLength(requestCount);
  expect(f.state.puts).toBe(1);
}, 30000);

it('refuses the effect if the authentic pre sidecar cannot be durably installed', async () => {
  const f = fixture(process.platform !== 'linux', (phase, path) => {
    if (phase === 'write-before-open' && path.endsWith('.pre.json')) throw Error('fixture disk failure');
  });
  const adapter = f.make(); await f.inspect(adapter);
  const run = await f.dispatcher('ptr-update-apply', adapter);
  await expect(run.call()).rejects.toThrow('SEALED_REALMS_DISPATCH_LANE_FAILED');
  expect(f.state.puts).toBe(0);
  expect(f.records().map(value => value.kind).sort()).toEqual(['inspection', 'not-submitted']);
}, 30000);

it('reopens pre bytes after asynchronous signature verification before submission', async () => {
  const f = fixture(process.platform !== 'linux'), adapter = f.make();
  await f.inspect(adapter);
  let changed = false;
  const verify = crypto.subtle.verify.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'verify').mockImplementation(async (...args) => {
    const valid = await verify(...args);
    let names: readonly string[] = [];
    try { names = f.privateState.list({ root: 'runtime', relativeDirectory: `ptr-update-observation-v4/${ID}` }); } catch { /* pre is not installed yet */ }
    const name = names.find(value => value.endsWith('.pre.json'));
    if (name && !changed) { writeFileSync(join(f.runtime, 'ptr-update-observation-v4', ID, name), '{}\n'); changed = true; }
    return valid;
  });
  const run = await f.dispatcher('ptr-update-apply', adapter);
  await expect(run.call()).rejects.toThrow('SEALED_REALMS_DISPATCH_LANE_FAILED');
  expect(changed).toBe(true);
  expect(f.state.puts).toBe(0);
  expect(f.records().map(value => value.kind).sort()).toEqual(['inspection', 'not-submitted']);
}, 30000);

async function retainedAdoption(observationOptions: ObservationOptions = {}) {
  const f = fixture(process.platform !== 'linux', undefined, observationOptions), adapter = f.make();
  await f.inspect(adapter);
  const run = await f.dispatcher('ptr-update-apply', adapter);
  await run.call();
  const { receipt } = captureCompletion(f, adapter, run.sourceAuthority, 'completed');
  f.observations.setNowSeconds(Math.ceil(Date.parse(receipt.continuation.terminalAt) / 1000) + 5);
  const adoption = await capturePtrExistingUpdateAdoption({ adapter, authority: run.sourceAuthority,
    store: f.store, permit: run.permit, runId: run.runId, runAttempt: run.runAttempt });
  const records = createSealedRealmsProductionActivationRecords({ privateState: f.privateState, authority: run.sourceAuthority });
  const written = await adoptionWriter.writeSealedRealmsProductionPtrExistingStateAdoptionRecord({ records, authority: run.sourceAuthority, adoption });
  adapter.dispose();
  return { f, run, receipt, records, written,
    path: join(f.runtime, 'ptr-existing-state-adoptions-v4', `${written.receiptDigest}.json`) };
}

function retainedSource(realm: 'ptr' | 'g002', sourceTree = 'b'.repeat(40)) {
  const main = 'e'.repeat(40);
  return authenticateSealedRealmsProductionRetainedSource({ realm, operatingCommit: main, sourceCommit: SOURCE, sourceTree,
    readGit: args => {
      const command = args.join(' ');
      if (command === 'rev-parse --verify HEAD^{commit}' || command === 'rev-parse --verify refs/remotes/origin/main^{commit}') return `${main}\n`;
      if (command === `rev-parse --verify ${SOURCE}^{commit}` || command === `merge-base ${SOURCE} ${main}`) return `${SOURCE}\n`;
      if (command === `rev-parse --verify ${SOURCE}^{tree}`) return `${sourceTree}\n`;
      throw Error('Unexpected historical Git read');
    },
    readBinding: () => ({ schemaVersion: 1, profile: 'warpkeep-0.4.0-sealed-launch-v1', pagesDeploymentApproved: false, preparationSourceCommit: null }),
    verifyEvidence: commit => ({ verifiedSha: commit }) });
}

it('reopens both genuine retained adoptions under newer main without original publication receipts or effects', async () => {
  const { f, receipt, written } = await retainedAdoption();
  const g002 = await retainedG002ForPtrFixture(f, {});
  const requests = seams.request.mock.calls.length, observed = f.observations.requests.length;
  expect(readPtrRetainedUpdateSourceCommit({ privateState: f.privateState })).toBe(SOURCE);
  expect(readG002RetainedUpdateSourceCommit({ privateState: f.privateState })).toBe(SOURCE);
  for (const [realm, store, authenticate, read, expected] of [
    ['ptr', f.store, adoptionWriter.authenticateSealedRealmsProductionPtrHistoricalAdoption,
      adoptionWriter.readSealedRealmsProductionPtrExistingStateAdoptionEvidence, { receipt, written }],
    ['g002', g002.g002.store, adoptionWriter.authenticateSealedRealmsProductionG002HistoricalAdoption,
      adoptionWriter.readSealedRealmsProductionG002ExistingStateAdoptionEvidence, g002],
  ] as const) {
    const capability = retainedSource(realm);
    const input = { privateState: f.privateState, retainedSource: capability, store };
    const evidence = await authenticate(input);
    const reopened = (read as typeof adoptionWriter.readSealedRealmsProductionPtrExistingStateAdoptionEvidence)({ evidence: evidence as never, privateState: f.privateState, sourceCommit: SOURCE });
    expect(reopened).toMatchObject({ sourceCommit: SOURCE, sourceTree: 'b'.repeat(40),
      adoptionReceiptDigest: expected.written.recordDigest, completionReceipt: expected.receipt });
    await expect(authenticate({ ...input, retainedSource: { ...capability } as never })).rejects.toThrow();
    await expect(authenticate({ ...input, retainedSource: retainedSource(realm, 'c'.repeat(40)) })).rejects.toThrow();
    await expect(authenticate({ ...input, retainedSource: retainedSource(realm === 'ptr' ? 'g002' : 'ptr') })).rejects.toThrow();
    await expect(authenticate({ ...input, privateState: {} as never })).rejects.toThrow();
    await expect(authenticate({ ...input, store: {} as never })).rejects.toThrow();
  }
  expect(seams.request.mock.calls.length).toBe(requests);
  expect(f.observations.requests.length).toBe(observed);
}, 30000);

it('cannot reuse retained source for permits, continuation changes, adapters, activation or record writes', async () => {
  const { f, records } = await retainedAdoption();
  const retained = retainedSource('ptr') as never;
  const before = JSON.stringify({ records: f.records(), terminals: f.continuationTerminals() });
  const requests = seams.request.mock.calls.length;
  const fetchImpl = vi.fn();
  await expect(issueSealedRealmsProductionWorkflowPermit({ sourceAuthority: retained, githubToken: 'synthetic-never-sent',
    runId: '900', runAttempt: '1', fetchImpl })).rejects.toThrow();
  expect(fetchImpl).not.toHaveBeenCalled();
  const common = { store: f.store, permit: {} as never, sourceAuthority: retained, kind: 'ptr-update' as const,
    runId: '900', runAttempt: '1', subject: `ptr-update:${ID}`, evidenceDigest: '1'.repeat(64), receiptDigests: [], predecessorDigests: [] };
  const effect = vi.fn(), readOnlyReconcile = vi.fn();
  await expect(issueSealedRealmsProductionContinuation(common)).rejects.toThrow('OPAQUE_RESULT_REQUIRED');
  await expect(claimSealedRealmsProductionContinuation({ ...common, effect })).rejects.toThrow('OPAQUE_RESULT_REQUIRED');
  await expect(reconcileSealedRealmsProductionContinuation({ ...common, readOnlyReconcile })).rejects.toThrow('OPAQUE_RESULT_REQUIRED');
  expect(effect).not.toHaveBeenCalled(); expect(readOnlyReconcile).not.toHaveBeenCalled();
  for (const create of [createPtrProductionExistingUpdateAdapter, createG002ProductionExistingUpdateAdapter]) {
    expect(() => create({ authority: retained, privateState: f.privateState, artifact: {} as never,
      observation: { sourceTree: 'b'.repeat(40), runId: '900', runAttempt: '1' } })).toThrow();
  }
  expect(() => createSealedRealmsProductionActivationRecords({ privateState: f.privateState, authority: retained })).toThrow();
  for (const write of [adoptionWriter.writeSealedRealmsProductionPtrExistingUpdateRecord, adoptionWriter.writeSealedRealmsProductionG002ExistingUpdateRecord]) {
    expect(() => write({ records, authority: retained, completion: {} as never })).toThrow('OPAQUE_RESULT_REQUIRED');
  }
  for (const write of [adoptionWriter.writeSealedRealmsProductionPtrExistingStateAdoptionRecord, adoptionWriter.writeSealedRealmsProductionG002ExistingStateAdoptionRecord]) {
    await expect(write({ records, authority: retained, adoption: {} as never })).rejects.toThrow('OPAQUE_RESULT_REQUIRED');
  }
  expect(JSON.stringify({ records: f.records(), terminals: f.continuationTerminals() })).toBe(before);
  expect(seams.request.mock.calls.length).toBe(requests);
}, 30000);

it('rejects a genuine private owner/store mismatch on the historical entry', async () => {
  const { f } = await retainedAdoption();
  const other = fixture(process.platform !== 'linux');
  const authenticate = adoptionWriter.authenticateSealedRealmsProductionPtrHistoricalAdoption;
  const input = { privateState: f.privateState, retainedSource: retainedSource('ptr'), store: f.store };
  await expect(authenticate({ ...input, store: other.store })).rejects.toThrow('CONTINUATION_STORE_INVALID');
  await expect(authenticate({ ...input, privateState: other.privateState })).rejects.toThrow();
  const evidence = await authenticate(input);
  expect(() => adoptionWriter.readSealedRealmsProductionPtrExistingStateAdoptionEvidence({
    evidence, privateState: other.privateState, sourceCommit: SOURCE })).toThrow();
}, 30000);

it.each(['adoption', 'completion', 'terminal'] as const)(
  'historical authentication rejects %s changes during signature await and every later read', async kind => {
    const { f, path } = await retainedAdoption();
    const findTerminal = (directory: string): string | undefined => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const candidate = join(directory, entry.name);
        if (entry.isDirectory()) { const nested = findTerminal(candidate); if (nested) return nested; }
        else if (entry.name.endsWith('.json') && JSON.parse(readFileSync(candidate, 'utf8')).profile
          === 'warpkeep-sealed-realms-continuation-terminal-v1') return candidate;
      }
    };
    const inventory = join(f.runtime, 'existing-updates-production-v1', 'ptr', ID);
    const target = kind === 'adoption' ? path : kind === 'completion'
      ? join(inventory, readdirSync(inventory).find(name => name.endsWith('.completion.json'))!) : findTerminal(f.runtime)!;
    const saved = readFileSync(target), originalVerify = crypto.subtle.verify.bind(crypto.subtle);
    const input = { privateState: f.privateState, retainedSource: retainedSource('ptr'), store: f.store };
    const authenticate = adoptionWriter.authenticateSealedRealmsProductionPtrHistoricalAdoption;
    let changed = false;
    const verifying = vi.spyOn(crypto.subtle, 'verify').mockImplementation(async (...args) => {
      const valid = await originalVerify(...args);
      if (!changed) { changed = true; writeFileSync(target, '{}\n'); }
      return valid;
    });
    try { await expect(authenticate(input)).rejects.toThrow(); expect(changed).toBe(true); }
    finally { verifying.mockRestore(); writeFileSync(target, saved); }
    const evidence = await authenticate(input);
    const read = () => adoptionWriter.readSealedRealmsProductionPtrExistingStateAdoptionEvidence({
      evidence, privateState: f.privateState, sourceCommit: SOURCE });
    const before = read();
    try { writeFileSync(target, '{}\n'); expect(read).toThrow(); }
    finally { writeFileSync(target, saved); }
    expect(read()).toEqual(before);
  }, 30000,
);

it('authenticates retained V4 after producer disposal and rechecks exact private lineage on every read', async () => {
  const { f, run, receipt, records, written, path } = await retainedAdoption();
  const authenticate = (adoptionWriter as Record<string, any>).authenticateSealedRealmsProductionPtrExistingStateAdoption;
  const read = (adoptionWriter as Record<string, any>).readSealedRealmsProductionPtrExistingStateAdoptionEvidence;
  expect(authenticate).toBeTypeOf('function');
  expect(read).toBeTypeOf('function');
  const requests = f.observations.requests.length, providerRequests = seams.request.mock.calls.length;
  f.observations.setNowSeconds(Math.floor(Date.now() / 1000) + 500);
  const evidence = await authenticate({ records, authority: run.sourceAuthority, store: f.store });
  const input = { evidence, privateState: f.privateState, sourceCommit: SOURCE };
  const reopened = read(input);
  expect(Object.isFrozen(evidence)).toBe(true);
  expect(reopened).toMatchObject({ sourceCommit: SOURCE, sourceTree: 'b'.repeat(40),
    adoptionReceiptDigest: written.recordDigest, completionReceipt: receipt });
  expect(reopened.pair.post.context.completionReceiptDigest).toBe(written.receiptDigest);
  expect(Object.isFrozen(reopened.pair.post.observation)).toBe(true);
  const restartedState = createSealedRealmsProductionPrivateState({ reportedHome: f.home,
    testOnlyOwnerUid: statSync(f.home).uid,
    ...(process.platform !== 'linux' ? { testOnlyAllowPlatformMode: true, testOnlyFsync: () => {} } : {}) });
  const restartedAuthority = authority('ptr-update-apply');
  const restartedRecords = createSealedRealmsProductionActivationRecords({ privateState: restartedState, authority: restartedAuthority });
  const restartedStore = createSealedRealmsProductionContinuationStore({ privateState: restartedState });
  const restartedEvidence = await authenticate({ records: restartedRecords, authority: restartedAuthority, store: restartedStore });
  expect(read({ evidence: restartedEvidence, privateState: restartedState, sourceCommit: SOURCE })).toEqual(reopened);
  expect(() => read({ ...input, privateState: restartedState })).toThrow();
  expect(() => read({ ...input, evidence: { ...evidence } })).toThrow();
  expect(() => read({ ...input, sourceCommit: 'f'.repeat(40) })).toThrow();
  expect(() => read({ ...input, privateState: Object.freeze({}) })).toThrow();
  await expect(authenticate({ records, authority: authority('ptr-update-inspect'), store: f.store })).rejects.toThrow();
  await expect(authenticate({ records, authority: run.sourceAuthority, store: Object.freeze({}) })).rejects.toThrow();
  const inventory = join(f.runtime, 'existing-updates-production-v1', 'ptr', ID);
  const findTerminal = (directory: string): string | undefined => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) { const found = findTerminal(fullPath); if (found) return found; }
      else if (entry.name.endsWith('.json') && JSON.parse(readFileSync(fullPath, 'utf8')).profile
        === 'warpkeep-sealed-realms-continuation-terminal-v1') return fullPath;
    }
  };
  const terminalPath = findTerminal(f.runtime);
  expect(terminalPath).toBeTypeOf('string');
  const targets = [path, join(f.runtime, 'activation-evidence/records/ptr-existing-update-receipt.json'),
    join(inventory, readdirSync(inventory).find(name => name.endsWith('.completion.json'))!), terminalPath!];
  for (const target of targets) {
    const saved = readFileSync(target);
    try {
      writeFileSync(target, '{}\n');
      expect(() => read(input)).toThrow();
      await expect(authenticate({ records, authority: run.sourceAuthority, store: f.store })).rejects.toThrow();
    } finally { writeFileSync(target, saved); }
    expect(read(input)).toEqual(reopened);
  }
  for (const canonicalPath of targets.slice(0, 2)) {
    const saved = readFileSync(canonicalPath);
    try {
      writeFileSync(canonicalPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), saved]));
      await expect(authenticate({ records, authority: run.sourceAuthority, store: f.store })).rejects.toThrow();
    } finally { writeFileSync(canonicalPath, saved); }
  }
  const signedBytes = readFileSync(path);
  try {
    const tampered = JSON.parse(signedBytes.toString());
    const compact = tampered.postObservationJws.split('.');
    const signature = Buffer.from(compact[2], 'base64url'); signature[0] ^= 1;
    compact[2] = signature.toString('base64url'); tampered.postObservationJws = compact.join('.');
    writeFileSync(path, `${JSON.stringify(tampered)}\n`);
    await expect(authenticate({ records, authority: run.sourceAuthority, store: f.store })).rejects.toThrow();
  } finally { writeFileSync(path, signedBytes); }
  expect(f.observations.requests).toHaveLength(requests);
  expect(seams.request).toHaveBeenCalledTimes(providerRequests);
  expect(f.state.puts).toBe(1);
}, 30000);

it('refuses retained V4 changed during asynchronous signature verification', async () => {
  const { f, run, records, path } = await retainedAdoption();
  const authenticate = (adoptionWriter as Record<string, any>).authenticateSealedRealmsProductionPtrExistingStateAdoption;
  expect(authenticate).toBeTypeOf('function');
  const verify = crypto.subtle.verify.bind(crypto.subtle);
  let changed = false;
  vi.spyOn(crypto.subtle, 'verify').mockImplementation(async (...args) => {
    const valid = await verify(...args);
    if (!changed) { writeFileSync(path, '{}\n'); changed = true; }
    return valid;
  });
  await expect(authenticate({ records, authority: run.sourceAuthority, store: f.store })).rejects.toThrow();
  expect(changed).toBe(true);
  expect(f.state.puts).toBe(1);
}, 30000);

it('owns a data snapshot of authentication inputs across signature verification and later reads', async () => {
  const { f, run, records } = await retainedAdoption();
  const authenticate = (adoptionWriter as Record<string, any>).authenticateSealedRealmsProductionPtrExistingStateAdoption;
  const read = (adoptionWriter as Record<string, any>).readSealedRealmsProductionPtrExistingStateAdoptionEvidence;
  const supplied = { records, authority: run.sourceAuthority, store: f.store };
  const accessed = vi.fn(() => { throw Error('Caller getter must never be invoked'); });
  const verify = crypto.subtle.verify.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'verify').mockImplementation(async (...args) => {
    const valid = await verify(...args);
    for (const key of ['records', 'authority', 'store']) Object.defineProperty(supplied, key,
      { enumerable: true, configurable: true, get: accessed });
    return valid;
  });
  const evidence = await authenticate(supplied);
  expect(read({ evidence, privateState: f.privateState, sourceCommit: SOURCE }).sourceCommit).toBe(SOURCE);
  expect(accessed).not.toHaveBeenCalled();
  await expect(authenticate(supplied)).rejects.toThrow();
  const proxy = new Proxy({}, { getPrototypeOf: accessed, ownKeys: accessed });
  await expect(authenticate(proxy)).rejects.toThrow();
  expect(() => read(proxy)).toThrow();
  expect(accessed).not.toHaveBeenCalled();
}, 30000);

function writeInitializationFixtureRecords(f: ReturnType<typeof fixture<'ptr'>>, run: { sourceAuthority: ReturnType<typeof authority> },
  legacy: ReturnType<typeof import('./fixtures/ptrV3ActivationFixture').ptrV3ActivationFixture>, includeG002: boolean) {
  const members = [
    ['g001PolicyObservationBootstrapReceipt', 'g001-policy-observation-bootstrap-receipt.json', 'g001-policy-observe'],
    ['g001CensusPrivacySafePrivateReceipt', 'g001-census-privacy-safe-private-receipt.json', 'g001-census-second-inspect'],
    ['g001AdmittedPlayerCensusPrivateReceipt', 'g001-admitted-player-census-private-receipt.json', 'g001-census-second-suspend'],
    ['g001AdmissionMonitorSuspensionReceipt', 'g001-admission-monitor-suspension-receipt.json', 'g001-census-second-suspend'],
    ['g001AdmissionMonitorCurrentStateReceipt', 'g001-admission-monitor-current-state-receipt.json', 'g001-current-state'],
    ['g002PublishReceipt', 'g002-publish-receipt.json', 'g002-publish-apply'],
    ['g002AtlasImportReceipt', 'g002-atlas-import-receipt.json', 'g002-import-apply'],
    ['g002SealedLiveReceipt', 'g002-sealed-live-receipt.json', 'g002-live-inspect'],
  ];
  for (const [member, filename, operation] of members.filter(([member]) => includeG002 || !member.startsWith('g002'))) {
    const receipt = legacy.receipts[member];
    const bodyDigest = createHash('sha256').update(`${JSON.stringify(receipt)}\n`).digest('hex');
    const semanticDigest = createHash('sha256').update(['warpkeep.sealed-realms.activation-record.v1',
      member, SOURCE, SOURCE, operation, run.sourceAuthority.authorityDigest, bodyDigest].join('\n') + '\n').digest('hex');
    f.privateState.write({ root: 'runtime', relativePath: `activation-evidence/records/${filename}`,
      bytes: Buffer.from(`${JSON.stringify({ schemaVersion: 1, profile: 'warpkeep-sealed-realms-activation-record-v1',
        member, preparationSourceCommit: SOURCE, sourceCommit: SOURCE, operation,
        sourceAuthorityDigest: run.sourceAuthority.authorityDigest, bodyDigest, receipt, semanticDigest })}\n`) });
  }
}

// Only G001 initialization bodies are synthetic for the dual-adoption corpus;
// both adoptions come through signed producers and retained-history authentication.
async function retainedG002ForPtrFixture(f: ReturnType<typeof fixture<'ptr'>>,
  observationOptions: ObservationOptions) {
  const g002 = fixture(process.platform !== 'linux', undefined, observationOptions, 'g002', f), adapter = g002.make();
  await g002.inspect(adapter);
  const run = await g002.dispatcher('g002-update-apply', adapter);
  await run.call();
  const records = createSealedRealmsProductionActivationRecords({ privateState: f.privateState, authority: run.sourceAuthority });
  const completion = exportG002ExistingUpdateCompletion({ adapter, authority: run.sourceAuthority, store: g002.store });
  const receipt = readG002ExistingUpdateCompletion({ completion, authority: run.sourceAuthority, privateState: f.privateState });
  adoptionWriter.writeSealedRealmsProductionG002ExistingUpdateRecord({ records, authority: run.sourceAuthority, completion });
  g002.observations.setNowSeconds(Math.ceil(Date.parse(receipt.continuation.terminalAt) / 1000) + 5);
  const adoption = await captureG002ExistingUpdateAdoption({ adapter, authority: run.sourceAuthority,
    store: g002.store, permit: run.permit, runId: run.runId, runAttempt: run.runAttempt });
  const written = await adoptionWriter.writeSealedRealmsProductionG002ExistingStateAdoptionRecord({ records, authority: run.sourceAuthority, adoption });
  adapter.dispose();
  const evidence = await adoptionWriter.authenticateSealedRealmsProductionG002ExistingStateAdoption({ records,
    authority: run.sourceAuthority, store: g002.store });
  return { g002, run, records, receipt, written, evidence };
}

it.each([
  { name: 'source tree', changed: { sourceTree: 'c'.repeat(40) } },
  { name: 'bridge source', changed: { bridgeSourceCommit: 'c'.repeat(40) } },
  { name: 'authorization epoch', changed: { recoveryAuthorizationEpoch: 4 } },
])('refuses genuine dual adoption with a different $name', async ({ changed }) => {
  const observation = { sourceTree: 'b'.repeat(40), bridgeSourceCommit: SOURCE, recoveryAuthorizationEpoch: 3 };
  const { f, run, records } = await retainedAdoption(observation);
  const evidence = await adoptionWriter.authenticateSealedRealmsProductionPtrExistingStateAdoption({ records,
    authority: run.sourceAuthority, store: f.store });
  const g002 = await retainedG002ForPtrFixture(f, { ...observation, ...changed });
  expect(adoptionWriter.readSealedRealmsProductionG002ExistingStateAdoptionEvidence({ evidence: g002.evidence,
    privateState: f.privateState, sourceCommit: SOURCE }).sourceCommit).toBe(SOURCE);
  expect(() => createSealedRealmsProductionActivationRecords({ privateState: f.privateState,
    authority: run.sourceAuthority, existingStateAdoption: evidence, g002ExistingStateAdoption: g002.evidence }))
    .toThrow('SEALED_REALMS_ACTIVATION_RECORDS_RECORD_INVALID');
}, 30000);

async function joinedV5ActivationFixture(generationOnly = false) {
  const { ptrV3ActivationFixture, PTR_V3_FIXTURE_TIME } = await import('./fixtures/ptrV3ActivationFixture');
  const legacy = ptrV3ActivationFixture();
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(PTR_V3_FIXTURE_TIME));
  const observation = { sourceTree: legacy.candidate.preparationSourceTree, bridgeSourceCommit: SOURCE };
  const { f, run, records, receipt, written, path: adoptionPath } = await retainedAdoption(observation);
  const evidence = await adoptionWriter.authenticateSealedRealmsProductionPtrExistingStateAdoption({ records,
    authority: run.sourceAuthority, store: f.store });
  const g002 = await retainedG002ForPtrFixture(f, observation);
  writeInitializationFixtureRecords(f, run, legacy, false);
  const input = { privateState: f.privateState, authority: run.sourceAuthority, existingStateAdoption: evidence,
    g002ExistingStateAdoption: g002.evidence };
  let candidateSource = '';
  const both = createSealedRealmsProductionActivationRecords({ privateState: f.privateState, authority: run.sourceAuthority,
    readBindingCandidate: () => candidateSource, existingStateAdoption: evidence, g002ExistingStateAdoption: g002.evidence });
  const projection = adoptionWriter.readSealedRealmsProductionRecoveryReceiptProjection(both);
  expect(projection).toMatchObject({ preparationSourceCommit: SOURCE,
    ptrExistingUpdateReceiptDigest: updateDigest(receipt), ptrExistingStateAdoptionReceiptDigest: written.recordDigest,
    g002ExistingUpdateReceiptDigest: updateDigest(g002.receipt), g002ExistingStateAdoptionReceiptDigest: g002.written.recordDigest,
    g002DatabaseIdentity: G002_ID, g002ExpectedProgramKeccak256: CANDIDATE,
    g002ReleaseSha256: 'a'.repeat(64), g002Sealed: true, g002PlayerCount: 0,
    g002GeneralAdmissionCount: 0, g002ExpectedSealedStateHmacSha256: 'a'.repeat(64) });
  for (const key of ['g002PublishReceiptDigest', 'g002FreshStatusDigest', 'g002AtlasImportReceiptDigest',
    'g002SealedLiveReceiptDigest', 'g002Founders', 'g002AtlasFinalized', 'g002PresentationEnabled', 'admissionNotificationsEnabled']) {
    expect(projection).not.toHaveProperty(key);
  }
  expect(() => createSealedRealmsProductionActivationRecords({ ...input, existingStateAdoption: undefined })).toThrow();
  expect(() => createSealedRealmsProductionActivationRecords({ ...input, g002ExistingStateAdoption: evidence as never })).toThrow();
  const { createPtrAdoptionBridgeFixture } = await import('./helpers/ptrAdoptionBridgeFixture');
  const bridgeModule = await import('../scripts/sealed-realms-production-auth-bridge-state.mjs');
  const bridge = await createPtrAdoptionBridgeFixture({ ...input, sourceCommit: SOURCE });
  const bridgeDirectory = join(f.runtime, 'bridge');
  const bridgeFiles = () => Object.fromEntries(readdirSync(bridgeDirectory, { recursive: true }).map(String)
    .filter(path => statSync(join(bridgeDirectory, path)).isFile()).sort()
    .map(path => [path, createHash('sha256').update(readFileSync(join(bridgeDirectory, path))).digest('hex')]));
  const establishedFiles = bridgeFiles();
  expect(() => bridge.createBridge(evidence, f.privateState, run.sourceAuthority, Object.freeze({}) as never)).toThrow();
  expect(bridgeFiles()).toEqual(establishedFiles);
  for (const lane of ['g002', 'ptr'] as const) {
    await expect(bridge.bridgeState.inspectGate({ lane })).rejects.toMatchObject({ code: 'SEALED_REALMS_AUTH_BRIDGE_GATE_STATE_INVALID' });
    expect(bridgeFiles()).toEqual(establishedFiles);
  }
  await expect(bridge.bridgeState.inspect()).resolves.toEqual({ g002Sealed: true, ptrSealed: true, complete: true });
  const { confirmation } = await bridge.bridgeState.inspectActivationEvidence();
  const binding = await bridge.bridgeState.reopenActivationEvidenceContinuation();
  const bridgeFacts = bridgeModule.readSealedRealmsProductionRecoveryBridgeFacts({ bridgeState: bridge.bridgeState,
    privateState: f.privateState, authority: bridge.sourceAuthorityFor('activation-evidence-generate') });
  expect(binding.receiptDigests).toHaveLength(3);
  expect(binding.receiptDigests.slice(1)).toEqual([g002.written.recordDigest, written.recordDigest]);
  expect(bridgeFacts.admissionRequestSuspensionReceiptDigest).toBe(binding.evidenceDigest);
  const bridgePath = join(bridgeDirectory, 'activation-evidence', `auth-bridge-suspension-${binding.evidenceDigest}.json`);
  const bridgeReceipt = JSON.parse(readFileSync(bridgePath, 'utf8'));
  expect(bridgeReceipt).toMatchObject({ schemaVersion: 5,
    profile: 'warpkeep-sealed-realms-auth-bridge-suspension-g002-ptr-adoption-private-v1',
    g002ExistingStateAdoptionReceiptDigest: g002.written.recordDigest,
    ptrExistingStateAdoptionReceiptDigest: written.recordDigest,
    activationGate: { g002ExistingStateAdoptionReceiptDigest: g002.written.recordDigest,
      ptrExistingStateAdoptionReceiptDigest: written.recordDigest } });
  for (const key of ['g002Gate', 'g002ImportAuthorityCrossLink', 'ptrGate', 'ptrImportAuthorityCrossLink']) {
    expect(bridgeReceipt).not.toHaveProperty(key);
  }
  const { RECOVERY_BINDING_KEYS_V5 } = await import('../scripts/recovery-binding-projection.mjs');
  const { recoveryActivationCandidatePolicyForVersion } = await import('../scripts/recovery-activation-candidate.mjs');
  const values: Record<string, unknown> = { ...legacy.candidate, ...recoveryActivationCandidatePolicyForVersion(5), ...projection, ...bridgeFacts };
  candidateSource = `${JSON.stringify(Object.fromEntries(RECOVERY_BINDING_KEYS_V5.map(key => [key, values[key]])), null, 2)}\n`;
  expect(adoptionWriter.inspectSealedRealmsProductionRecoveryActivationRecords(both).schemaVersion).toBe(5);
  const joined = { f, evidence, recordsV4: both, receipt, written, legacy, bridge, bridgeModule, binding, confirmation,
    bridgeReceipt, bridgePath, adoptionPath, candidateSource, g002Evidence: g002.evidence,
    g002AdoptionPath: join(f.runtime, 'g002-existing-state-adoptions-v1', `${g002.written.receiptDigest}.json`), g002 };
  // The native generator owns the sole no-clobber descriptor and publication below.
  if (generationOnly) return joined;
  const otherState = createSealedRealmsProductionPrivateState({ reportedHome: f.home,
    testOnlyOwnerUid: statSync(f.home).uid,
    ...(process.platform !== 'linux' ? { testOnlyAllowPlatformMode: true, testOnlyFsync: () => {} } : {}) });
  const otherRecords = createSealedRealmsProductionActivationRecords({ privateState: otherState, authority: g002.run.sourceAuthority });
  const otherEvidence = await adoptionWriter.authenticateSealedRealmsProductionG002ExistingStateAdoption({ records: otherRecords,
    authority: g002.run.sourceAuthority, store: createSealedRealmsProductionContinuationStore({ privateState: otherState }) });
  expect(adoptionWriter.readSealedRealmsProductionG002ExistingStateAdoptionEvidence({ evidence: otherEvidence,
    privateState: otherState, sourceCommit: SOURCE }).adoptionReceiptDigest).toBe(g002.written.recordDigest);
  let envelope: Record<string, any> = {};
  adoptionWriter.writeSealedRealmsProductionRecoveryActivationDescriptor({ records: both, consumeDescriptor: fd => {
    envelope = JSON.parse(readFileSync(fd, 'utf8'));
    expect(envelope.profile).toBe('warpkeep-0.4.0-recovery-activation-evidence-g002-ptr-adoption-v1');
    expect(envelope.g002ExistingStateAdoptionReceipt.completionReceipt).toEqual(g002.receipt);
    expect(envelope.ptrExistingStateAdoptionReceipt.completionReceipt).toEqual(receipt);
    expect(() => adoptionWriter.validateSealedRealmsProductionRecoveryActivationEvidence(envelope, undefined, evidence)).toThrow();
    expect(adoptionWriter.validateSealedRealmsProductionRecoveryActivationEvidence(envelope, undefined, evidence, g002.evidence).schemaVersion).toBe(5);
    // Matching signed bytes reopened under another genuine owner cannot join the original PTR capability.
    expect(() => adoptionWriter.validateSealedRealmsProductionRecoveryActivationEvidence(envelope, undefined, evidence, otherEvidence)).toThrow();
    for (const key of ['g002PublishReceipt', 'g002AtlasImportReceipt', 'g002SealedLiveReceipt']) expect(envelope).not.toHaveProperty(key);
  } });
  const { validateRecoveryLaunchActivationProjection } = await import('../scripts/generate-0.4.0-recovery-launch-activation.mjs');
  const { verifySealedRealmsPublicActivationBytes } = await import('../scripts/verify-sealed-realms-public-activation-artifact.mjs');
  const publicBinding = validateRecoveryLaunchActivationProjection(envelope, bridgeReceipt, undefined, evidence, g002.evidence);
  expect(publicBinding).toMatchObject({ schemaVersion: 5, g002ExistingStateAdoptionReceiptDigest: g002.written.recordDigest,
    ptrExistingStateAdoptionReceiptDigest: written.recordDigest, admissionRequestSuspensionReceiptDigest: binding.evidenceDigest });
  const bytes = Buffer.from(`${JSON.stringify(publicBinding, null, 2)}\n`);
  expect(verifySealedRealmsPublicActivationBytes(bytes)).toEqual(bytes);
  expect(() => validateRecoveryLaunchActivationProjection(envelope,
    { ...bridgeReceipt, g002ExistingStateAdoptionReceiptDigest: 'f'.repeat(64) }, undefined, evidence, g002.evidence)).toThrow();
  const path = join(f.runtime, 'g002-existing-state-adoptions-v1', `${g002.written.receiptDigest}.json`);
  const saved = readFileSync(path);
  try {
    writeFileSync(path, '{}\n');
    expect(() => adoptionWriter.readSealedRealmsProductionRecoveryReceiptProjection(both)).toThrow();
    await expect(bridge.bridgeState.reopenActivationEvidenceContinuation()).rejects.toThrow();
    expect(() => validateRecoveryLaunchActivationProjection(envelope, bridgeReceipt, undefined, evidence, g002.evidence)).toThrow();
  }
  finally { writeFileSync(path, saved); }
  expect(adoptionWriter.readSealedRealmsProductionRecoveryReceiptProjection(both)).toEqual(projection);
  expect(f.state.puts).toBe(1); expect(g002.g002.state.puts).toBe(1);
  return joined;
}

it('joins genuine dual adoption to bridge authority and V5 without original G002 publication or import claims', async () => {
  const joined = await joinedV5ActivationFixture();
  await expect(joined.bridgeModule.consumeSealedRealmsProductionActivationEvidenceConfirmation(joined.confirmation)).resolves.toEqual({});
  await expect(joined.bridgeModule.consumeSealedRealmsProductionActivationEvidenceConfirmation(joined.confirmation)).rejects.toThrow();
}, 60000);

async function joinedV4ActivationFixture() {
  const { ptrV3ActivationFixture, PTR_V3_FIXTURE_TIME } = await import('./fixtures/ptrV3ActivationFixture');
  const { RECOVERY_BINDING_KEYS_V4 } = await import('../scripts/recovery-binding-projection.mjs');
  const { recoveryActivationCandidatePolicyForVersion } = await import('../scripts/recovery-activation-candidate.mjs');
  const legacy = ptrV3ActivationFixture();
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(PTR_V3_FIXTURE_TIME));
  const { f, run, records, receipt, written, path: adoptionPath } = await retainedAdoption({
    sourceTree: legacy.candidate.preparationSourceTree, bridgeSourceCommit: SOURCE });
  const evidence = await adoptionWriter.authenticateSealedRealmsProductionPtrExistingStateAdoption({ records,
    authority: run.sourceAuthority, store: f.store });
  writeInitializationFixtureRecords(f, run, legacy, true);
  let candidateSource = '';
  const recordsV4 = createSealedRealmsProductionActivationRecords({ privateState: f.privateState,
    authority: run.sourceAuthority, readBindingCandidate: () => candidateSource, existingStateAdoption: evidence } as never);
  const projection = adoptionWriter.readSealedRealmsProductionRecoveryReceiptProjection(recordsV4);
  expect(projection).toMatchObject({ ptrExistingStateAdoptionReceiptDigest: written.recordDigest,
    ptrExistingUpdateReceiptDigest: updateDigest(receipt), ptrExpectedProgramKeccak256: CANDIDATE,
    ptrSingletonOwnerCount: 1, ptrExpectedSealedStateHmacSha256: 'a'.repeat(64),
    recoveryAuthWorkerSourceCommit: SOURCE, preparationSourceTree: legacy.candidate.preparationSourceTree });
  for (const absent of ['ptrAtlasImportReceiptDigest', 'ptrOwnerProvisionReceiptDigest', 'ptrSealedLiveReceiptDigest',
    'ptrReleaseManifestSha256', 'ptrOwnerAnchorRows', 'ptrPresentationEnabled']) expect(projection).not.toHaveProperty(absent);
  const { createPtrAdoptionBridgeFixture } = await import('./helpers/ptrAdoptionBridgeFixture');
  const bridgeModule = await import('../scripts/sealed-realms-production-auth-bridge-state.mjs');
  const retained = adoptionWriter.readSealedRealmsProductionPtrExistingStateAdoptionEvidence({
    evidence, privateState: f.privateState, sourceCommit: SOURCE });
  vi.setSystemTime(new Date(retained.pair.post.observation.observedThrough * 1000));
  const bridge = await createPtrAdoptionBridgeFixture({ privateState: f.privateState, existingStateAdoption: evidence,
    authority: run.sourceAuthority, sourceCommit: SOURCE,
    g002AtlasImportReceiptDigest: legacy.receipts.g002AtlasImportReceipt.importReceiptDigest });
  await expect(bridge.bridgeState.inspect()).resolves.toEqual({ g002Sealed: true, ptrSealed: true, complete: true });
  const { confirmation } = await bridge.bridgeState.inspectActivationEvidence();
  const binding = await bridge.bridgeState.reopenActivationEvidenceContinuation();
  const bridgeFacts = bridgeModule.readSealedRealmsProductionRecoveryBridgeFacts({ bridgeState: bridge.bridgeState,
    privateState: f.privateState, authority: bridge.sourceAuthorityFor('activation-evidence-generate') });
  expect(bridgeFacts.admissionRequestSuspensionReceiptDigest).toBe(binding.evidenceDigest);
  expect(binding.receiptDigests).toHaveLength(4);
  expect(binding.receiptDigests.at(-1)).toBe(written.recordDigest);
  const bridgePath = join(f.runtime, 'bridge/activation-evidence', `auth-bridge-suspension-${binding.evidenceDigest}.json`);
  const bridgeReceipt = JSON.parse(readFileSync(bridgePath, 'utf8'));
  expect(bridgeReceipt).toMatchObject({ schemaVersion: 4,
    profile: 'warpkeep-sealed-realms-auth-bridge-suspension-ptr-adoption-private-v1',
    ptrExistingStateAdoptionReceiptDigest: written.recordDigest,
    activationGate: { ptrExistingStateAdoptionReceiptDigest: written.recordDigest } });
  expect(bridgeReceipt).not.toHaveProperty('ptrGate');
  expect(bridgeReceipt).not.toHaveProperty('ptrImportAuthorityCrossLink');
  const values: Record<string, unknown> = { ...legacy.candidate, ...recoveryActivationCandidatePolicyForVersion(4), ...projection, ...bridgeFacts };
  candidateSource = `${JSON.stringify(Object.fromEntries(RECOVERY_BINDING_KEYS_V4.map(key => [key, values[key]])), null, 2)}\n`;
  const inspected = adoptionWriter.inspectSealedRealmsProductionRecoveryActivationRecords(recordsV4);
  expect(inspected.schemaVersion).toBe(4);
  expect(f.state.puts).toBe(1);
  return { f, evidence, recordsV4, receipt, written, legacy, bridge, bridgeModule, binding, confirmation,
    bridgeReceipt, bridgePath, adoptionPath, candidateSource, g002Evidence: undefined, g002AdoptionPath: undefined, g002: undefined };
}

it('joins retained PTR adoption to genuine G002 bridge authority and the V4 public projection', async () => {
  const joined = await joinedV4ActivationFixture();
  let envelope: Record<string, any> = {};
  adoptionWriter.writeSealedRealmsProductionRecoveryActivationDescriptor({ records: joined.recordsV4, consumeDescriptor: fd => {
    envelope = JSON.parse(readFileSync(fd, 'utf8'));
    expect(envelope.profile).toBe('warpkeep-0.4.0-recovery-activation-evidence-ptr-adoption-v1');
    expect(envelope.ptrExistingStateAdoptionReceipt.completionReceipt).toEqual(joined.receipt);
    expect(() => (adoptionWriter.validateSealedRealmsProductionRecoveryActivationEvidence as any)(envelope)).toThrow();
    expect((adoptionWriter.validateSealedRealmsProductionRecoveryActivationEvidence as any)(envelope, undefined, joined.evidence).schemaVersion).toBe(4);
    return undefined;
  } });
  const { validateRecoveryLaunchActivationProjection } = await import('../scripts/generate-0.4.0-recovery-launch-activation.mjs');
  const { verifySealedRealmsPublicActivationBytes } = await import('../scripts/verify-sealed-realms-public-activation-artifact.mjs');
  const binding = validateRecoveryLaunchActivationProjection(envelope, joined.bridgeReceipt, undefined, joined.evidence);
  expect(binding.schemaVersion).toBe(4);
  expect(binding.ptrExistingStateAdoptionReceiptDigest).toBe(joined.written.recordDigest);
  expect(binding.admissionRequestSuspensionReceiptDigest).toBe(joined.binding.evidenceDigest);
  const bytes = Buffer.from(`${JSON.stringify(binding, null, 2)}\n`);
  expect(verifySealedRealmsPublicActivationBytes(bytes)).toEqual(bytes);
  expect(() => validateRecoveryLaunchActivationProjection(envelope, joined.bridgeReceipt)).toThrow();
  expect(() => validateRecoveryLaunchActivationProjection(envelope,
    { ...joined.bridgeReceipt, ptrExistingStateAdoptionReceiptDigest: 'f'.repeat(64) }, undefined, joined.evidence)).toThrow();
  for (const target of [joined.bridgePath, joined.adoptionPath]) {
    const saved = readFileSync(target);
    try {
      writeFileSync(target, '{}\n');
      await expect(joined.bridge.bridgeState.reopenActivationEvidenceContinuation()).rejects.toThrow();
      expect(() => joined.bridgeModule.readSealedRealmsProductionRecoveryBridgeFacts({ bridgeState: joined.bridge.bridgeState,
        privateState: joined.f.privateState, authority: joined.bridge.sourceAuthorityFor('activation-evidence-generate') })).toThrow();
    } finally { writeFileSync(target, saved); }
  }
  await expect(joined.bridgeModule.consumeSealedRealmsProductionActivationEvidenceConfirmation(joined.confirmation)).resolves.toEqual({});
  await expect(joined.bridgeModule.consumeSealedRealmsProductionActivationEvidenceConfirmation(joined.confirmation)).rejects.toThrow();
  expect(joined.f.state.puts).toBe(1);
}, 30000);

// The fixed descriptor owner requires genuine POSIX ownership and 0600 file modes.
it.skipIf(process.platform !== 'linux').each([4, 5] as const)('generates and reopens completed V%s evidence after restart without replaying realm or bridge effects', async version => {
  const joined = version === 5 ? await joinedV5ActivationFixture(true) : await joinedV4ActivationFixture();
  const { f, evidence, recordsV4, legacy, bridge, bridgeModule, binding, candidateSource } = joined;
  const continuation = await import('../scripts/sealed-realms-production-continuation.mjs');
  const codec = await import('../scripts/sealed-realms-production-activation-generation-receipt.mjs');
  const generateAuthority = bridge.sourceAuthorityFor('activation-evidence-generate');
  const createGenerator = (records = recordsV4, privateState = f.privateState, cap = evidence, g002Cap = joined.g002Evidence) =>
    bridgeModule.createSealedRealmsProductionActivationEvidenceGenerator({ records, privateState, authority: generateAuthority,
      existingStateAdoption: cap,
      ...(g002Cap === undefined ? {} : { g002ExistingStateAdoption: g002Cap }),
      testOnlyCapability: bridgeModule.createSealedRealmsProductionAuthBridgeStateTestCapability(),
      testOnlyPreparationBootstrapAuthority: { preparationSourceCommit: SOURCE,
        moduleTreeId: legacy.receipts.g001PolicyObservationBootstrapReceipt.moduleTreeId,
        bootstrapBlob: legacy.receipts.g001PolicyObservationBootstrapReceipt.bootstrapBlob,
        bootstrapSha256: legacy.receipts.g001PolicyObservationBootstrapReceipt.bootstrapSha256 },
    });
  const generator = createGenerator();
  const inspected = await bridge.run('activation-evidence-inspect', '88003');
  await continuation.issueSealedRealmsProductionContinuation({ store: bridge.store, ...inspected,
    kind: 'activation-evidence', ...binding });
  const generate = await bridge.run('activation-evidence-generate', '88004');
  let generationFailure: unknown;
  let generationCompleted = false;
  await expect(continuation.claimSealedRealmsProductionContinuation({ store: bridge.store, ...generate,
    kind: 'activation-evidence', ...binding, effect: async claim => {
      try {
        await bridge.bridgeState.consumeActivationEvidenceForContinuation({ claim, store: bridge.store,
          sourceAuthority: generate.sourceAuthority, kind: 'activation-evidence', runId: generate.runId,
          runAttempt: generate.runAttempt, ...binding, generator });
        generationCompleted = true;
      } catch (error) { generationFailure = error; throw error; }
      throw Error('Synthetic acknowledgment lost after completed private publication');
    } })).rejects.toMatchObject({ code: 'SEALED_REALMS_CONTINUATION_EFFECT_AMBIGUOUS' });
  if (generationFailure !== undefined) throw generationFailure;
  expect(generationCompleted).toBe(true);
  const artifactPath = join(f.runtime, 'public/0.4.0-sealed-launch.json');
  const artifact = readFileSync(artifactPath);
  const generatedReceipt = codec.parseActivationGenerationReceipt(readFileSync(join(f.runtime, 'public/activation-generation-receipt.json')));
  expect(generatedReceipt).toMatchObject({ artifactSchemaVersion: version, artifactProfile: version === 5
    ? 'warpkeep-0.4.0-sealed-launch-g002-ptr-adoption-v5' : 'warpkeep-0.4.0-sealed-launch-ptr-adoption-v4',
    activationEvidenceDigest: binding.evidenceDigest, runId: '88004' });
  expect(JSON.parse(artifact.toString()).ptrExistingStateAdoptionReceiptDigest).toBe(joined.written.recordDigest);
  if (joined.g002) expect(JSON.parse(artifact.toString()).g002ExistingStateAdoptionReceiptDigest).toBe(joined.g002.written.recordDigest);
  vi.setSystemTime(new Date(Date.parse(generatedReceipt.generatedAt) + 24 * 60 * 60 * 1000));
  const restartedState = createSealedRealmsProductionPrivateState({ reportedHome: f.home, testOnlyOwnerUid: statSync(f.home).uid });
  const restartedStore = createSealedRealmsProductionContinuationStore({ privateState: restartedState });
  const updateAuthority = authority('ptr-update-apply');
  const restartedUpdateRecords = createSealedRealmsProductionActivationRecords({ privateState: restartedState, authority: updateAuthority });
  const restartedEvidence = await adoptionWriter.authenticateSealedRealmsProductionPtrExistingStateAdoption({
    records: restartedUpdateRecords, authority: updateAuthority, store: restartedStore });
  const g002Authority = authority('g002-update-apply');
  const restartedG002Evidence = version === 5 ? await adoptionWriter.authenticateSealedRealmsProductionG002ExistingStateAdoption({
    records: createSealedRealmsProductionActivationRecords({ privateState: restartedState, authority: g002Authority }),
    authority: g002Authority, store: restartedStore }) : undefined;
  const restartedRecords = createSealedRealmsProductionActivationRecords({ privateState: restartedState, authority: generateAuthority,
    readBindingCandidate: () => candidateSource, existingStateAdoption: restartedEvidence,
    ...(restartedG002Evidence === undefined ? {} : { g002ExistingStateAdoption: restartedG002Evidence }) });
  const restartedBridge = bridge.createBridge(restartedEvidence, restartedState, generateAuthority, restartedG002Evidence);
  const restartedGenerator = createGenerator(restartedRecords, restartedState, restartedEvidence, restartedG002Evidence);
  expect(adoptionWriter.inspectSealedRealmsProductionRecoveryActivationRecords(restartedRecords, generatedReceipt.generatedAt).schemaVersion).toBe(version);
  for (const target of [artifactPath, joined.bridgePath, joined.adoptionPath,
    ...(joined.g002AdoptionPath === undefined ? [] : [joined.g002AdoptionPath])]) {
    const saved = readFileSync(target);
    try {
      writeFileSync(target, '{}\n');
      if (target === joined.bridgePath) await expect(restartedBridge.reopenActivationEvidenceContinuation()).rejects.toThrow();
      else expect(() => createGenerator(restartedRecords, restartedState, restartedEvidence, restartedG002Evidence)).toThrow();
    } finally { writeFileSync(target, saved); }
  }
  const selected = await restartedBridge.reopenActivationEvidenceContinuation();
  const reconcile = await bridge.run('activation-evidence-generate', '88005', new Set(['88004']));
  await expect(continuation.reconcileSealedRealmsProductionContinuation({ store: restartedStore, ...reconcile,
    kind: 'activation-evidence', ...selected,
    readOnlyReconcile: token => restartedBridge.reconcileActivationEvidenceForContinuation({ selection: selected,
      generator: restartedGenerator, reconciliation: token, store: restartedStore, sourceAuthority: reconcile.sourceAuthority }),
  })).resolves.toBeDefined();
  expect(readFileSync(artifactPath)).toEqual(artifact);
  expect(f.state.puts).toBe(1);
  if (joined.g002) expect(joined.g002.g002.state.puts).toBe(1);
}, 60000);

async function joinedLinuxRecoveryFixture() {
  const { collectGenesis001AdmittedPlayerCensus } = await import('../scripts/genesis001-admitted-player-census.mjs');
  const { createGenesis001LinuxCensusSample, createGenesis001LinuxCensusAttempt } = await import('../scripts/genesis001-linux-census-attempt.mjs');
  const policyModule = await import('../scripts/genesis001-sealed-launch-adoption.mjs');
  const { linuxG001PolicyExecution } = await import('./fixtures/linuxG001PolicyReceipt');
  const start = Date.parse('2026-09-19T12:00:00.000Z'), current = 'e'.repeat(40);
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(start);
  const retained = await retainedAdoption({ bridgeSourceCommit: SOURCE });
  const { f } = retained;
  const g002 = await retainedG002ForPtrFixture(f, { bridgeSourceCommit: SOURCE });
  const ptrEvidence = await adoptionWriter.authenticateSealedRealmsProductionPtrHistoricalAdoption({ privateState: f.privateState,
    retainedSource: retainedSource('ptr'), store: f.store });
  const g002Evidence = await adoptionWriter.authenticateSealedRealmsProductionG002HistoricalAdoption({ privateState: f.privateState,
    retainedSource: retainedSource('g002'), store: g002.g002.store });
  const stamp = (n: number) => new Date(start + n).toISOString();
  const observation = (n: number) => {
    const policy = { realmId: 'GENESIS_001', releaseVersion: '0.3.43', playerAccessEnabled: true,
      admissionStateMutationsEnabled: false, accessRequestSubmissionsEnabled: false,
      sourceBaselineCommit: policyModule.GENESIS_001_SOURCE_BASELINE_COMMIT, freezeReleaseNonce: policyModule.GENESIS_001_FREEZE_RELEASE_NONCE };
    return { schemaVersion: 1, profile: 'warpkeep-genesis-001-live-policy-observation-v1', sourceCommit: current,
      observedAt: stamp(n), databaseIdentity: policyModule.GENESIS_001_DATABASE_IDENTITY, procedure: 'genesis_001_access_policy_v1',
      mutationSubmitted: false, policy, policyReceiptDigest: policyModule.genesis001PolicyReceiptDigest(policy) };
  };
  const sample = async (n: number, nonce: number) => {
    const admitted = await collectGenesis001AdmittedPlayerCensus({ preparationSourceCommit: current, observedAt: stamp(n),
      readAggregates: () => ({ allowedFids: '1', enabledAllowedFids: '1' }),
      queryPreferred: () => ({ outcome: 'exact-query-supported', output: Buffer.from('fid\tenabled\tauth_epoch\n17\ttrue\t1\n') }),
      randomBytes: () => Buffer.alloc(32, nonce + 1) });
    const applicant = { schemaVersion: 1, profile: 'warpkeep-genesis-001-census-export-private-proof-v1', realmId: 'GENESIS_001',
      releaseVersion: '0.3.43', sourceCommit: current, privateCensusReference: { count: 0, size: 7,
        sha256: createHash('sha256').update('private').digest('hex'),
        pathBasename: `warpkeep-access-request-census-${stamp(n).replace(/[-:]/gu, '').replace(/\.000/gu, '')}.txt` },
      privateBlindingNonceHex: Buffer.alloc(32, nonce).toString('hex') };
    return createGenesis001LinuxCensusSample({ applicant: { ...applicant,
      opaqueProofDigest: policyModule.genesis001CensusOpaqueProofDigest(applicant) }, admitted }, current);
  };
  const createCensus = async (offset = 0, runId = '900', attemptId = '1'.repeat(32)) => {
    const execution = linuxG001PolicyExecution(observation(offset + 20000));
    execution.execution.runId = attemptId; execution.cleanup.runId = attemptId;
    return createGenesis001LinuxCensusAttempt({
    schemaVersion: 1, profile: 'warpkeep-g001-linux-census-collected-v1',
    sourceCommit: current, repositoryRoot: process.cwd(), attemptId, githubRunId: runId, githubRunAttempt: '1',
    callerIdentity: '8'.repeat(64), mutationSubmitted: false, initialPolicyObservation: observation(offset + 20000),
    first: await sample(offset + 21000, 1), second: await sample(offset + 81000, 3), consumedAt: stamp(offset + 82000),
    confirmationPolicyObservation: observation(offset + 83000), currentPolicyObservation: observation(offset + 83001) },
    execution, stamp(offset + 84000));
  };
  const receipt = await createCensus();
  const selector = { profile: 'warpkeep-g001-linux-census-completed-v1', sourceCommit: current,
    attemptId: receipt.attemptId, githubRunId: receipt.githubRunId, githubRunAttempt: receipt.githubRunAttempt,
    receiptDigest: receipt.receiptDigest, completedAt: receipt.completedAt, mutationSubmitted: false };
  const selected = { selector, receipt };
  seams.census.mockReset().mockImplementation((id, source) => {
    if (id !== receipt.attemptId || source !== current) throw Error('wrong fixed census');
    return structuredClone(selected);
  });
  const currentAuthority = authenticateSealedRealmsProductionSourceAuthority({ operation: 'activation-evidence-generate',
    workflowInputSha: current, readGit: () => `${current}\n`, readBinding, verifyEvidence });
  const programArtifacts = Object.freeze({});
  const programOwners = new WeakMap<object, typeof currentAuthority>([[programArtifacts, currentAuthority]]);
  const programs: Record<string, any> = { sourceCommit: current, sourceTree: 'b'.repeat(40) };
  for (const [realm, updated] of [['ptr', retained.receipt], ['g002', g002.receipt]] as const) {
    programs[realm] = { programArtifactSha256: updated.binding.candidateSha256, moduleTreeId: updated.binding.moduleTreeId,
      dependencyClosureDigest: updated.binding.dependencyClosureDigest,
      ...(realm === 'g002' ? { programKeccak256: updated.binding.candidateProgram } : {}) };
  }
  seams.comparison.mockReset().mockImplementation(input => {
    if (programOwners.get(input.capability) !== input.authority || input.privateState !== f.privateState
      || input.ptrSourceCommit !== SOURCE || input.g002SourceCommit !== SOURCE) throw Error('wrong native comparison owner');
    return structuredClone(programs);
  });
  let duringFetch: (() => void) | undefined;
  const fetchImpl = vi.fn(async (request: string | URL | Request) => {
    const url = String(request), census = url.includes('/actions/runs/900');
    duringFetch?.();
    const body = url.endsWith('/branches/main') ? { name: 'main', protected: true, commit: { sha: current } }
      : url.endsWith('/jobs?per_page=100&page=1') ? { total_count: 1, jobs: [{ name: 'operate_readonly', run_id: 900, run_attempt: 1,
        status: 'completed', conclusion: 'success', head_sha: current, head_branch: 'main', runner_name: 'warpkeep-wsl-production-01',
        labels: ['self-hosted', 'Linux', 'X64', 'warpkeep-production-admin', 'warpkeep-repository-exclusive'],
        steps: [{ name: 'Attest runtime and execute authenticated operation', status: 'completed', conclusion: 'success' }] }] }
      : { id: census ? 900 : 1001, run_attempt: 1, event: 'workflow_dispatch', status: census ? 'completed' : 'in_progress',
        conclusion: census ? 'success' : null, head_branch: 'main', head_sha: current, path: '.github/workflows/sealed-realms-production.yml',
        name: 'Sealed Realms Production', display_title: `${census ? 'g001-freeze-census' : 'activation-evidence-generate'} @ ${current}`,
        repository: { full_name: 'ael-dev3/Warpkeep' } };
    const text = JSON.stringify(body), response = new Response(text, { status: 200, headers: {
      'content-type': 'application/json', 'content-length': String(Buffer.byteLength(text)) } });
    Object.defineProperty(response, 'url', { value: url }); return response;
  });
  const permit = await issueSealedRealmsProductionWorkflowPermit({ sourceAuthority: currentAuthority,
    githubToken: 'github-sealed-realms-owner-token', runId: '1001', runAttempt: '1', fetchImpl });
  vi.setSystemTime(start + 120000);
  f.observations.setNowSeconds((start + 120000) / 1000);
  g002.g002.observations.setNowSeconds((start + 120000) / 1000);
  const input = { privateState: f.privateState, authority: currentAuthority, permit, attemptId: receipt.attemptId,
    existingStateAdoption: ptrEvidence, g002ExistingStateAdoption: g002Evidence, programArtifacts: programArtifacts as never };
  return { f, retained, g002, current, input, receipt, selected, programs, programOwners, fetchImpl, createCensus,
    setDuringFetch: (callback: () => void) => { duringFetch = callback; } };
}

it('keeps inline inspection diagnostic and generates from its own later census and bridge receipt', async () => {
  const f = await joinedLinuxRecoveryFixture();
  const bridgeModule = await import('../scripts/sealed-realms-production-auth-bridge-state.mjs');
  const laneModule = await import('../scripts/sealed-realms-production-activation-lane-entry.mjs');
  const { createPtrAdoptionBridgeFixture } = await import('./helpers/ptrAdoptionBridgeFixture');
  const owners = new WeakMap<object, { receipt: typeof f.receipt; authority: typeof f.input.authority; permit: typeof f.input.permit }>();
  seams.inlineCensus.mockReset().mockImplementation((proof, owner) => {
    const retained = owners.get(proof);
    if (!retained || owner.sourceAuthority !== retained.authority || owner.workflowPermit !== retained.permit) throw Error('wrong native owner');
    const receipt = retained.receipt;
    return structuredClone({ receipt, selector: { profile: 'warpkeep-g001-linux-census-completed-v1',
      sourceCommit: receipt.sourceCommit, attemptId: receipt.attemptId, githubRunId: receipt.githubRunId,
      githubRunAttempt: receipt.githubRunAttempt, receiptDigest: receipt.receiptDigest,
      completedAt: receipt.completedAt, mutationSubmitted: false } });
  });
  const authenticate = async (receipt: typeof f.receipt, run: { sourceAuthority: typeof f.input.authority; permit: typeof f.input.permit }) => {
    const proof = Object.freeze({}), programs = Object.freeze({});
    owners.set(proof, { receipt, authority: run.sourceAuthority, permit: run.permit });
    f.programOwners.set(programs, run.sourceAuthority);
    return adoptionWriter.authenticateSealedRealmsProductionLinuxRecoveryEvidence({ privateState: f.input.privateState,
      authority: run.sourceAuthority, permit: run.permit, censusEvidence: proof as never,
      existingStateAdoption: f.input.existingStateAdoption, g002ExistingStateAdoption: f.input.g002ExistingStateAdoption,
      programArtifacts: programs as never });
  };
  const inspectAuthority = authenticateSealedRealmsProductionSourceAuthority({ operation: 'activation-evidence-inspect',
    workflowInputSha: f.current, readGit: () => `${f.current}\n`, readBinding, verifyEvidence });
  const inspectRun = { sourceAuthority: inspectAuthority, runId: '1001', runAttempt: '1',
    permit: await issueSealedRealmsProductionWorkflowPermit({ sourceAuthority: inspectAuthority, githubToken: 'github-sealed-realms-owner-token',
      runId: '1001', runAttempt: '1', fetchImpl: f.fetchImpl }) };
  const oldCensus = await f.createCensus(0, inspectRun.runId);
  const inspectedEvidence = await authenticate(oldCensus, inspectRun);
  const bridge = await createPtrAdoptionBridgeFixture({ ...f.input, authority: inspectAuthority, sourceCommit: f.current,
    linuxRecoveryEvidence: inspectedEvidence, observeAt: () => new Date(),
    currentWorkerVersionId: '30000000-0000-4000-8000-000000000003' });
  const dispatch = (state: typeof bridge.bridgeState, run: typeof inspectRun,
    generator?: Parameters<typeof laneModule.createSealedRealmsProductionActivationLane>[0]['generator']) => {
    const context = laneModule.createSealedRealmsProductionActivationDispatchContext({ readGit: () => `${f.current}\n`,
      readBinding, verifyEvidence, permit: run.permit, continuationStore: bridge.store, runId: run.runId,
      runAttempt: run.runAttempt, sourceAuthority: run.sourceAuthority });
    return laneModule.createSealedRealmsProductionActivationDispatcher({ context,
      lane: laneModule.createSealedRealmsProductionActivationLane({ bridgeState: state, ...(generator ? { generator } : {}) }) });
  };
  await expect(dispatch(bridge.bridgeState, inspectRun).dispatch({ operation: 'activation-evidence-inspect', workflowInputSha: f.current }))
    .resolves.toEqual({ operation: 'activation-evidence-inspect', status: 'activation-evidence-inspected' });
  const directory = join(f.f.runtime, 'bridge/activation-evidence');
  const oldName = readdirSync(directory)[0], oldBytes = readFileSync(join(directory, oldName));
  // A full build interval separates actual diagnostic and generation evidence.
  const later = Date.parse('2026-09-19T12:12:00.000Z');
  vi.setSystemTime(later); f.f.observations.setNowSeconds(later / 1000); f.g002.g002.observations.setNowSeconds(later / 1000);
  const generateRun = await bridge.run('activation-evidence-generate', '1003');
  const census = await f.createCensus(600000, generateRun.runId, '2'.repeat(32));
  const evidence = await authenticate(census, generateRun);
  const state = bridge.createBridge(f.input.existingStateAdoption, f.input.privateState, generateRun.sourceAuthority,
    f.input.g002ExistingStateAdoption, evidence);
  const { RECOVERY_BINDING_KEYS_V6 } = await import('../scripts/recovery-binding-projection.mjs');
  const { recoveryActivationCandidatePolicyForVersion } = await import('../scripts/recovery-activation-candidate.mjs');
  const { recoveryG002PtrAdoptionCandidate } = await import('./fixtures/recoveryG002PtrAdoptionCandidate');
  const candidateReader = vi.fn((_source, projection) => {
    const bridgeFacts = bridgeModule.readSealedRealmsProductionRecoveryBridgeFacts({ bridgeState: state,
      privateState: f.input.privateState, authority: generateRun.sourceAuthority });
    const values = { ...recoveryG002PtrAdoptionCandidate(), ...recoveryActivationCandidatePolicyForVersion(6),
      ...projection, ...bridgeFacts, preparationSourceCommit: f.current, preparationSourceTree: 'b'.repeat(40) };
    return `${JSON.stringify(Object.fromEntries(RECOVERY_BINDING_KEYS_V6.map(key => [key, (values as any)[key]])), null, 2)}\n`;
  });
  const records = createSealedRealmsProductionActivationRecords({ privateState: f.input.privateState, authority: generateRun.sourceAuthority,
    readBindingCandidate: candidateReader, existingStateAdoption: f.input.existingStateAdoption,
    g002ExistingStateAdoption: f.input.g002ExistingStateAdoption, linuxRecoveryEvidence: evidence });
  const bootstrap = census.initialPolicyObservation;
  const generator = bridgeModule.createSealedRealmsProductionActivationEvidenceGenerator({ records, privateState: f.input.privateState,
    authority: generateRun.sourceAuthority, existingStateAdoption: f.input.existingStateAdoption,
    g002ExistingStateAdoption: f.input.g002ExistingStateAdoption, linuxRecoveryEvidence: evidence,
    testOnlyCapability: bridgeModule.createSealedRealmsProductionAuthBridgeStateTestCapability(),
    testOnlyPreparationBootstrapAuthority: { preparationSourceCommit: f.current, moduleTreeId: bootstrap.moduleTreeId,
      operatorBlob: bootstrap.operatorBlob, operatorSha256: bootstrap.operatorSha256 } });
  expect(candidateReader).not.toHaveBeenCalled();
  expect(() => bridgeModule.readSealedRealmsProductionActivationGenerationKind({ generator: { ...generator } as never,
    bridgeState: state, authority: generateRun.sourceAuthority })).toThrow();
  expect(() => bridgeModule.readSealedRealmsProductionActivationGenerationKind({ generator,
    bridgeState: bridge.bridgeState, authority: generateRun.sourceAuthority })).toThrow();
  if (process.platform === 'linux') {
    await expect(dispatch(state, generateRun, generator).dispatch({ operation: 'activation-evidence-generate', workflowInputSha: f.current }))
      .resolves.toEqual({ operation: 'activation-evidence-generate', status: 'completed' });
    const generated = JSON.parse(readFileSync(join(f.f.runtime, 'public/activation-generation-receipt.json'), 'utf8'));
    expect(generated).toMatchObject({ artifactSchemaVersion: 6, runId: generateRun.runId });
  } else {
    // Windows exercises the same private selection/candidate path; descriptor
    // issuance and complete protected dispatch are verified by this test on Linux.
    await state.inspectInlineActivationEvidenceForContinuation({ generator, authority: generateRun.sourceAuthority });
    expect(adoptionWriter.inspectSealedRealmsProductionRecoveryActivationRecords(records).schemaVersion).toBe(6);
  }
  expect(readFileSync(join(directory, oldName))).toEqual(oldBytes);
  const names = readdirSync(directory); expect(names).toHaveLength(2);
  const next = JSON.parse(readFileSync(join(directory, names.find(name => name !== oldName)!), 'utf8'));
  expect(Date.parse(next.activationGate.observedAt)).toBeGreaterThan(Date.parse(census.completedAt));
  expect(Date.parse(JSON.parse(oldBytes.toString()).activationGate.observedAt)).toBeLessThan(Date.parse(census.completedAt));
  expect(bridgeModule.readSealedRealmsProductionRecoveryBridgeFacts({ bridgeState: state, privateState: f.input.privateState,
    authority: generateRun.sourceAuthority }).admissionRequestSuspensionReceiptDigest).toBe(names.find(name => name !== oldName)!.slice(23, -5));
  await expect(state.inspectInlineActivationEvidenceForContinuation({ generator, authority: generateRun.sourceAuthority })).rejects.toThrow();
  await expect(bridge.bridgeState.reopenActivationEvidenceContinuation()).rejects.toThrow();
}, 120000);

it('joins genuine historical adoptions and selected Linux census to current activation without relabelling signed provenance', async () => {
  const f = await joinedLinuxRecoveryFixture(), requests = seams.request.mock.calls.length;
  const capability = await adoptionWriter.authenticateSealedRealmsProductionLinuxRecoveryEvidence(f.input);
  const read = () => adoptionWriter.readSealedRealmsProductionLinuxRecoveryEvidence({ evidence: capability,
    privateState: f.f.privateState, sourceCommit: f.current });
  expect(Object.keys(capability)).toEqual([]);
  expect(read()).toMatchObject({ sourceCommit: f.current, ptr: { sourceCommit: SOURCE }, g002: { sourceCommit: SOURCE } });
  const records = createSealedRealmsProductionActivationRecords({ privateState: f.input.privateState, authority: f.input.authority,
    existingStateAdoption: f.input.existingStateAdoption, g002ExistingStateAdoption: f.input.g002ExistingStateAdoption,
    linuxRecoveryEvidence: capability });
  const projection = adoptionWriter.readSealedRealmsProductionRecoveryReceiptProjection(records);
  expect(projection).toMatchObject({ preparationSourceCommit: f.current, ptrModuleSourceCommit: SOURCE, g002ModuleSourceCommit: SOURCE,
    g001AdmissionControlProfile: 'warpkeep-genesis-001-server-freeze-v1', g001FreezeCurrentStateReceiptDigest: f.receipt.freezeCurrentStateReceipt.receiptDigest });
  expect(Object.keys(projection).some(key => /Monitor|recoveryAuthWorker|preparationSourceTree/u.test(key))).toBe(false);
  expect(seams.request.mock.calls.length).toBe(requests);
  const { createPtrAdoptionBridgeFixture } = await import('./helpers/ptrAdoptionBridgeFixture');
  const bridgeModule = await import('../scripts/sealed-realms-production-auth-bridge-state.mjs');
  const bridge = await createPtrAdoptionBridgeFixture({ ...f.input, sourceCommit: f.current,
    linuxRecoveryEvidence: capability, currentWorkerVersionId: '30000000-0000-4000-8000-000000000003' });
  await bridge.bridgeState.inspectActivationEvidence();
  const bridgeBinding = await bridge.bridgeState.reopenActivationEvidenceContinuation();
  const bridgeFacts = bridgeModule.readSealedRealmsProductionRecoveryBridgeFacts({ bridgeState: bridge.bridgeState,
    privateState: f.input.privateState, authority: f.input.authority });
  expect(bridgeFacts).toMatchObject({ authBridgeSourceCommit: f.current, recoveryAuthWorkerSourceCommit: f.current,
    recoveryAuthWorkerVersionId: '30000000-0000-4000-8000-000000000003' });
  const bridgeReceipt = JSON.parse(readFileSync(join(f.f.runtime, 'bridge/activation-evidence',
    `auth-bridge-suspension-${bridgeBinding.evidenceDigest}.json`), 'utf8'));
  expect(bridgeReceipt.schemaVersion).toBe(5);
  const { RECOVERY_BINDING_KEYS_V6 } = await import('../scripts/recovery-binding-projection.mjs');
  const { recoveryActivationCandidatePolicyForVersion } = await import('../scripts/recovery-activation-candidate.mjs');
  const { recoveryG002PtrAdoptionCandidate } = await import('./fixtures/recoveryG002PtrAdoptionCandidate');
  const values = { ...recoveryG002PtrAdoptionCandidate(), ...recoveryActivationCandidatePolicyForVersion(6),
    ...projection, ...bridgeFacts, preparationSourceCommit: f.current, preparationSourceTree: 'b'.repeat(40) };
  const candidateSource = `${JSON.stringify(Object.fromEntries(RECOVERY_BINDING_KEYS_V6.map(key => [key, (values as any)[key]])), null, 2)}\n`;
  const connected = createSealedRealmsProductionActivationRecords({ privateState: f.input.privateState, authority: f.input.authority,
    readBindingCandidate: () => candidateSource,
    existingStateAdoption: f.input.existingStateAdoption, g002ExistingStateAdoption: f.input.g002ExistingStateAdoption,
    linuxRecoveryEvidence: capability });
  expect(adoptionWriter.inspectSealedRealmsProductionRecoveryActivationRecords(connected).schemaVersion).toBe(6);
  const { validateRecoveryLaunchActivationProjection } = await import('../scripts/generate-0.4.0-recovery-launch-activation.mjs');
  adoptionWriter.writeSealedRealmsProductionRecoveryActivationDescriptor({ records: connected, consumeDescriptor: fd => {
    const envelope = JSON.parse(readFileSync(fd, 'utf8'));
    expect(envelope.schemaVersion).toBe(6);
    expect(envelope.ptrExistingStateAdoptionReceipt.sourceCommit).toBe(SOURCE);
    expect(envelope.g001LinuxCensusAttempt.sourceCommit).toBe(f.current);
    expect(Object.keys(envelope).some(key => /Monitor/u.test(key))).toBe(false);
    expect(validateRecoveryLaunchActivationProjection(envelope, bridgeReceipt, undefined,
      f.input.existingStateAdoption, f.input.g002ExistingStateAdoption, capability).schemaVersion).toBe(6);
    expect(() => validateRecoveryLaunchActivationProjection(envelope, bridgeReceipt, undefined,
      f.input.existingStateAdoption, f.input.g002ExistingStateAdoption)).toThrow();
    const oldBridge = structuredClone(bridgeReceipt); oldBridge.deploymentAuthority.bridgeSourceCommit = SOURCE;
    expect(() => validateRecoveryLaunchActivationProjection(envelope, oldBridge, undefined,
      f.input.existingStateAdoption, f.input.g002ExistingStateAdoption, capability)).toThrow();
  } });
  expect(() => createSealedRealmsProductionActivationRecords({ privateState: f.input.privateState, authority: f.input.authority,
    existingStateAdoption: f.input.existingStateAdoption, g002ExistingStateAdoption: f.input.g002ExistingStateAdoption })).toThrow();
  expect(() => adoptionWriter.readSealedRealmsProductionLinuxRecoveryEvidence({ evidence: { ...capability } as never,
    privateState: f.input.privateState, sourceCommit: f.current })).toThrow();
  const other = fixture(process.platform !== 'linux');
  expect(() => adoptionWriter.readSealedRealmsProductionLinuxRecoveryEvidence({ evidence: capability,
    privateState: other.privateState, sourceCommit: f.current })).toThrow();
  await expect(issueSealedRealmsProductionWorkflowPermit({ sourceAuthority: capability as never,
    githubToken: 'synthetic-never-sent', runId: '1111', runAttempt: '1', fetchImpl: vi.fn() })).rejects.toThrow();
  f.programs.ptr.programArtifactSha256 = '9'.repeat(64);
  expect(read).toThrow();
}, 120000);

it.each(['census', 'adoption', 'program'] as const)('rejects %s changing during completed-workflow await and does not mint joined evidence', async kind => {
  const f = await joinedLinuxRecoveryFixture();
  f.setDuringFetch(() => {
    if (kind === 'census') (f.selected.selector as any).receiptDigest = '9'.repeat(64);
    if (kind === 'adoption') writeFileSync(f.retained.path, '{}\n');
    if (kind === 'program') f.programs.g002.programKeccak256 = '9'.repeat(64);
  });
  await expect(adoptionWriter.authenticateSealedRealmsProductionLinuxRecoveryEvidence(f.input)).rejects.toThrow();
}, 30000);

it('requires current permit and matching native bytes, and rejects expired census for a new candidate', async () => {
  const f = await joinedLinuxRecoveryFixture();
  await expect(adoptionWriter.authenticateSealedRealmsProductionLinuxRecoveryEvidence({ ...f.input, permit: {} as never })).rejects.toThrow();
  for (const realm of ['ptr', 'g002']) for (const key of ['programArtifactSha256', 'moduleTreeId', 'dependencyClosureDigest']) {
    const old = f.programs[realm][key]; f.programs[realm][key] = '9'.repeat(64);
    await expect(adoptionWriter.authenticateSealedRealmsProductionLinuxRecoveryEvidence(f.input)).rejects.toThrow();
    f.programs[realm][key] = old;
  }
  vi.setSystemTime(new Date(Date.parse(f.receipt.completedAt) + 600000));
  f.f.observations.setNowSeconds((Date.parse(f.receipt.completedAt) + 600000) / 1000);
  f.g002.g002.observations.setNowSeconds((Date.parse(f.receipt.completedAt) + 600000) / 1000);
  const linuxRecoveryEvidence = await adoptionWriter.authenticateSealedRealmsProductionLinuxRecoveryEvidence(f.input);
  const records = createSealedRealmsProductionActivationRecords({ privateState: f.input.privateState, authority: f.input.authority,
    existingStateAdoption: f.input.existingStateAdoption, g002ExistingStateAdoption: f.input.g002ExistingStateAdoption, linuxRecoveryEvidence });
  expect(() => adoptionWriter.readSealedRealmsProductionRecoveryReceiptProjection(records)).toThrow();
}, 30000);

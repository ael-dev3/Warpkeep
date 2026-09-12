// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPtrUpdateObservationTransportFixture, createG002UpdateObservationTransportFixture } from './helpers/ptrUpdateObservationFixture';
vi.mock('../services/release-recovery/src/recoveryPublicKey.js', () => ({
  RECOVERY_KEY_ID: 'warpkeep-0.4.0-recovery-2026-09-03-1',
  RECOVERY_KEY_THUMBPRINT: 'zbHwk528B5de5kuNzI98k4Y-rljmW6fbkH-aVZomk4M',
  RECOVERY_PUBLIC_JWK: { kty: 'EC', crv: 'P-256', x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE', y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA' },
}));
const seams = vi.hoisted(() => ({
  request: vi.fn(),
  dispose: vi.fn(),
  claim: vi.fn(),
  reconcile: vi.fn(),
  permit: vi.fn(),
  completion: vi.fn(),
  g002Provider: vi.fn(),
  g002Artifact: vi.fn(),
}));
vi.mock("../scripts/ptr-update-provider-credentials.mjs", () => ({
  createPtrUpdateProviderCredentials: () => Object.freeze({}),
  requestPtrUpdateProvider: seams.request,
  disposePtrUpdateProviderCredentials: seams.dispose,
  createG002UpdateProviderCredentials: seams.g002Provider,
  requestG002UpdateProvider: seams.request,
  disposeG002UpdateProviderCredentials: seams.dispose,
}));
vi.mock("../scripts/ptr-production-publisher.mjs", () => ({
  assertPtrSourceBuiltArtifact: (artifact: any) => {
    artifact.assertSourceAndArtifact();
    return artifact;
  },
}));
vi.mock("../scripts/genesis002-production-publisher.mjs", () => ({
  assertGenesis002SourceBuiltArtifact: seams.g002Artifact,
}));
vi.mock("../scripts/sealed-realms-production-source-authority.mjs", () => ({
  preparationSourceCommitFromSealedRealmsProductionAuthority: (authority: any) => authority.sourceCommit,
  sourceCommitFromSealedRealmsProductionAuthority: (authority: any) =>
    authority.sourceCommit,
}));
vi.mock("../scripts/sealed-realms-production-private-state.mjs", () => ({
  assertSealedRealmsProductionPrivateState: (state: any) => state,
}));
vi.mock("../scripts/sealed-realms-production-workflow-authority.mjs", () => ({
  attestSealedRealmsProductionWorkflowPermit: seams.permit,
}));
vi.mock("../scripts/sealed-realms-production-continuation.mjs", () => ({
  readSealedRealmsProductionContinuationCompletion: seams.completion,
  assertSealedRealmsProductionContinuationClaim: seams.claim,
  readSealedRealmsProductionContinuationClaimBinding: (value: any) => {
    seams.claim(value);
    return { scopeDigest: '1'.repeat(64), issuedRecordDigest: '2'.repeat(64), claimRecordDigest: '3'.repeat(64),
      claimRunId: value.runId, claimRunAttempt: Number(value.runAttempt),
      claimedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString() };
  },
  assertSealedRealmsProductionContinuationReconciliation: seams.reconcile,
  classifySealedRealmsProductionContinuationNoEffect: (value: any) => ({
    outcome: "no-effect",
    observationDigest: value.observationDigest,
  }),
}));
import { createSealedRealmsProductionExistingUpdateAdapter, assertSealedRealmsExistingUpdateAdapter } from "../scripts/sealed-realms-production-existing-update.mjs";
import * as completionApi from "../scripts/ptr-production-existing-update-adapter.mjs";
import * as activationRecords from "../scripts/sealed-realms-production-activation-records.mjs";
import type { SealedRealmsProductionSourceAuthority } from "../scripts/sealed-realms-production-source-authority.mjs";
import { canonicalizePtrRawV10 } from "../scripts/ptr-artifact-description.mjs";
import {
  existingUpdateTokenDigest,
  updateProgramHash,
  updateCanonical,
  updateDigest,
} from "../scripts/sealed-realms-existing-update-protocol.mjs";

const ID = "c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e";
const SOURCE = "a".repeat(40),
  BEFORE = "c".repeat(64);
const definition = canonicalizePtrRawV10(
  readFileSync(
    new URL(
      "./fixtures/ptr-artifact-description-2.6.1/first.json",
      import.meta.url,
    ),
  ),
);
const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
const candidateProgram = updateProgramHash(
  Buffer.from("candidate source built bytes"),
);
const plan = (prior: string, candidate = candidateProgram, target = ID) => ({
  AutoMigrate: {
    break_clients: false,
    major_version_upgrade: false,
    migrate_plan: `${"━".repeat(60)}\nDatabase Migration Plan\n${"━".repeat(60)}\n\n`,
    token:
      "0x" +
      Buffer.from(existingUpdateTokenDigest(target, prior, candidate), "hex")
        .reverse()
        .toString("hex"),
  },
});
beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function fixture(lane: "ptr" | "g002" = "ptr") {
  const target = lane === "ptr" ? ID : "c2003223f6e3c86e988775ddd458c3a45635d0d021e11131551471617c392194";
  const observationTransport = (lane === 'ptr' ? createPtrUpdateObservationTransportFixture : createG002UpdateObservationTransportFixture)({ sourceCommit: SOURCE, sourceTree: 'b'.repeat(40),
    runId: '123', runAttempt: '1', checkRunId: '9001', requestId: '123e4567-e89b-42d3-a456-426614174000' }, { nowSeconds: Math.floor(Date.now() / 1000) });
  observationTransport.install();
  const files = new Map<string, Buffer>();
  let rejectNoEffectWrite = false;
  const state = {
    list: ({ relativeDirectory }: any) =>
      [...files.keys()]
        .filter((k) => k.startsWith(relativeDirectory + "/"))
        .map((k) => k.slice(relativeDirectory.length + 1))
        .sort(),
    exists: ({ relativePath }: any) => files.has(relativePath),
    read: ({ relativePath }: any) => {
      if (!files.has(relativePath)) throw Error("missing");
      return Buffer.from(files.get(relativePath)!);
    },
    write: ({ relativePath, bytes }: any) => {
      if (rejectNoEffectWrite && relativePath.endsWith(".not-submitted.json"))
        throw Error("synthetic disk error");
      if (files.has(relativePath)) throw Error("exists");
      files.set(relativePath, Buffer.from(bytes));
    },
  };
  // These are test-only stand-ins for the explicitly mocked capability issuers above.
  const authority = {
    sourceCommit: SOURCE,
    authorityDigest: '5'.repeat(64),
    mode: "S",
    operation: `${lane}-update-inspect`,
  } as unknown as SealedRealmsProductionSourceAuthority;
  const artifact = {
    sourceCommit: SOURCE,
    moduleSha256: createHash("sha256")
      .update("candidate source built bytes")
      .digest("hex"),
    moduleProgramHash: candidateProgram,
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
    assertSourceAndArtifact: vi.fn(),
  };
  seams.g002Provider.mockReturnValue(Object.freeze({}));
  seams.g002Artifact.mockImplementation(value => {
    if (lane !== "g002" || value !== artifact) throw Error("Foreign artifact");
    artifact.assertSourceAndArtifact();
    return artifact;
  });
  let hostVersion = "2.10.0";
  let current = BEFORE,
    lost = false;
  const transport = async (_provider: unknown, request: any) => {
    if (request.operation === "health")
      return encode({
        version: hostVersion,
        package_name: "spacetimedb-cloud",
      });
    if (request.operation === "metadata")
      return encode({
        database_identity: { __identity__: "0x" + target },
        owner_identity: { __identity__: "0x" + "2".repeat(64) },
        host_type: { Js: [] },
        initial_program: "0x" + BEFORE,
      });
    if (request.operation === "schema") return encode(definition.definition);
    if (request.operation === "plan") return encode(plan(current, candidateProgram, target));
    if (request.operation === "apply") {
      await request.beforeSend();
      expect(
        [...files.keys()].some((k) => k.endsWith(".submission.json")),
      ).toBe(true);
      current = candidateProgram;
      if (lost) throw Error("synthetic lost response");
      return encode({
        Success: { domain: null, database_identity: target, op: "updated" },
      });
    }
    throw Error("unexpected request");
  };
  seams.request.mockImplementation(async (...args: [unknown, any]) => ({
    bytes: await transport(...args),
    claimedProviderIdentity: "2".repeat(64),
  }));
  const create = () =>
    createSealedRealmsProductionExistingUpdateAdapter({
      authority,
      privateState: state,
      artifact,
      observation: { sourceTree: 'b'.repeat(40), runId: '123', runAttempt: '1' },
    } as unknown as Parameters<
      typeof createSealedRealmsProductionExistingUpdateAdapter
    >[0]);
  return {
    observationTransport,
    privateState: state,
    authority,
    artifact,
    files,
    create,
    setCurrent: (v: string) => {
      current = v;
    },
    setHostVersion: (version: string) => {
      hostVersion = version;
    },
    loseResponse: () => {
      lost = true;
    },
    failNoEffectWrite: () => {
      rejectNoEffectWrite = true;
    },
  };
}
function consume(adapter: any, authority: any) {
  const lane = authority.operation.startsWith('g002-') ? 'g002' : 'ptr';
  const applyAuthority = { ...authority, operation: `${lane}-update-apply` };
  const selection = adapter.reopenContinuation({ authority: applyAuthority });
  return adapter.consumeContinuationEntry({
    claim: {},
    store: {},
    permit: {},
    sourceAuthority: applyAuthority,
    kind: `${lane}-update`,
    runId: "123",
    runAttempt: 1,
    ...selection,
    selection,
  });
}
async function completedFixture(lane: "ptr" | "g002" = "ptr") {
  const f = fixture(lane), adapter = f.create();
  await adapter.inspectForContinuation({ authority: f.authority });
  await consume(adapter, f.authority);
  const authority = { ...f.authority, operation: `${lane}-update-apply` as const };
  const terminal = {
    scopeDigest: '1'.repeat(64), issuedRecordDigest: '2'.repeat(64),
    claimRecordDigest: '3'.repeat(64), terminalRecordDigest: '4'.repeat(64),
    claimRunId: '123', claimRunAttempt: 1, terminalRunId: '123', terminalRunAttempt: 1,
    outcome: 'completed', observationDigest: null, terminalAt: new Date().toISOString(),
  };
  seams.completion.mockReturnValue(terminal);
  return { ...f, adapter, applyAuthority: authority, terminal, store: {} as never };
}
it('requires fixed observation coordinates before constructing an update adapter', () => {
  const f = fixture();
  expect(() => completionApi.createPtrProductionExistingUpdateAdapter({
    authority: f.authority, privateState: f.privateState as never, artifact: f.artifact as never,
  } as never)).toThrow('PTR_PRODUCTION_EXISTING_UPDATE_INVALID');
});
it.each([{ sourceTree: 'bad' }, { runId: 123 }, { runId: '0' }, { runAttempt: 1 },
  { runAttempt: '1001' }, { callback: () => ({}) }])('rejects invalid observation configuration %j', changed => {
  const f = fixture();
  expect(() => completionApi.createPtrProductionExistingUpdateAdapter({
    authority: f.authority, privateState: f.privateState as never, artifact: f.artifact as never,
    observation: { sourceTree: 'b'.repeat(40), runId: '123', runAttempt: '1', ...changed },
  } as never)).toThrow('PTR_PRODUCTION_EXISTING_UPDATE_INVALID');
});
it('exports opaque completed-update evidence tied to genuine continuation reopening', async () => {
  const f = await completedFixture();
  try {
    const completion = completionApi.exportPtrExistingUpdateCompletion({ adapter: f.adapter as never, authority: f.applyAuthority, store: f.store });
    expect(Object.keys(completion)).toEqual([]);
    const receipt = completionApi.readPtrExistingUpdateCompletion({ completion, authority: f.applyAuthority, privateState: f.privateState as never });
    expect(receipt.binding.sourceCommit).toBe(SOURCE);
    expect(receipt.acknowledgement).toBe('received');
    expect(receipt.continuation.terminalRecordDigest).toBe(f.terminal.terminalRecordDigest);
    expect(seams.completion).toHaveBeenCalledWith(expect.objectContaining({ store: f.store, privateState: f.privateState, kind: 'ptr-update' }));
    expect(() => completionApi.readPtrExistingUpdateCompletion({ completion: { ...completion } as never, authority: f.applyAuthority, privateState: f.privateState as never })).toThrow();
    expect(() => completionApi.readPtrExistingUpdateCompletion({ completion, authority: f.applyAuthority, privateState: {} as never })).toThrow();
    f.adapter.dispose();
    expect(() => completionApi.readPtrExistingUpdateCompletion({ completion, authority: f.applyAuthority, privateState: f.privateState as never })).toThrow();
  } finally { f.adapter.dispose(); }
});
it('refuses export while continuation completion is missing or bound to another claim', async () => {
  const f = await completedFixture();
  try {
    seams.completion.mockImplementationOnce(() => { throw Error('No terminal'); });
    expect(() => completionApi.exportPtrExistingUpdateCompletion({ adapter: f.adapter as never, authority: f.applyAuthority, store: f.store })).toThrow();
    seams.completion.mockReturnValue({ ...f.terminal, claimRunId: '999' });
    expect(() => completionApi.exportPtrExistingUpdateCompletion({ adapter: f.adapter as never, authority: f.applyAuthority, store: f.store })).toThrow();
  } finally { f.adapter.dispose(); }
});
it('captures a fixed activation record from opaque completed evidence without accepting caller receipts', async () => {
  const f = await completedFixture();
  try {
    const completion = completionApi.exportPtrExistingUpdateCompletion({ adapter: f.adapter as never, authority: f.applyAuthority, store: f.store });
    const records = activationRecords.createSealedRealmsProductionActivationRecords({ privateState: f.privateState as never, authority: f.applyAuthority });
    const captured = activationRecords.writeSealedRealmsProductionPtrExistingUpdateRecord({ records, authority: f.applyAuthority, completion });
    const stored = JSON.parse(f.files.get('activation-evidence/records/ptr-existing-update-receipt.json')!.toString());
    expect(stored.member).toBe('ptrExistingUpdateReceipt');
    expect(stored.operation).toBe('ptr-update-apply');
    expect(stored.receipt.binding.sourceCommit).toBe(SOURCE);
    expect(captured.receiptDigest).toBe(updateDigest(stored.receipt));
    expect(() => activationRecords.writeSealedRealmsProductionPtrExistingUpdateRecord({ records, authority: f.applyAuthority, completion: stored.receipt })).toThrow();
    expect(activationRecords.writeSealedRealmsProductionPtrExistingUpdateRecord({ records, authority: f.applyAuthority, completion })).toEqual(captured);
  } finally { f.adapter.dispose(); }
});
it('preserves conflicting activation records without writing into another private store', async () => {
  const f = await completedFixture();
  try {
    const completion = completionApi.exportPtrExistingUpdateCompletion({ adapter: f.adapter as never, authority: f.applyAuthority, store: f.store });
    const records = activationRecords.createSealedRealmsProductionActivationRecords({ privateState: f.privateState as never, authority: f.applyAuthority });
    const path = 'activation-evidence/records/ptr-existing-update-receipt.json';
    const previous = Buffer.from('existing record must remain unchanged');
    f.files.set(path, Buffer.from(previous));
    expect(() => activationRecords.writeSealedRealmsProductionPtrExistingUpdateRecord({ records, authority: f.applyAuthority, completion })).toThrow();
    expect(f.files.get(path)).toEqual(previous);
    const foreign = fixture();
    const foreignRecords = activationRecords.createSealedRealmsProductionActivationRecords({ privateState: foreign.privateState as never, authority: f.applyAuthority });
    expect(() => activationRecords.writeSealedRealmsProductionPtrExistingUpdateRecord({ records: foreignRecords, authority: f.applyAuthority, completion })).toThrow();
    expect(foreign.files.has(path)).toBe(false);
  } finally { f.adapter.dispose(); }
});
it('invalidates exported evidence when the reopened completion changes', async () => {
  const f = await completedFixture();
  try {
    const completion = completionApi.exportPtrExistingUpdateCompletion({ adapter: f.adapter as never, authority: f.applyAuthority, store: f.store });
    const name = [...f.files.keys()].find(name => name.endsWith('.completion.json'))!;
    const record = JSON.parse(f.files.get(name)!.toString());
    record.value.observedAt = new Date(Date.parse(record.value.observedAt) - 1).toISOString();
    f.files.set(name, Buffer.from(updateCanonical(record)+'\n'));
    expect(() => completionApi.readPtrExistingUpdateCompletion({ completion, authority: f.applyAuthority, privateState: f.privateState as never })).toThrow();
  } finally { f.adapter.dispose(); }
});
it("proves the initial-program hypothesis through the authenticated migration token", async () => {
  const f = fixture(),
    adapter = f.create();
  const selection = await adapter.inspectForContinuation({
    authority: f.authority,
  });
  expect(selection.subject).toBe(`ptr-update:${ID}`);
  expect(f.files.size).toBe(1);
  expect(
    seams.request.mock.calls.some(([, x]) => x.operation === "apply"),
  ).toBe(false);
  adapter.dispose();
});
it("refuses an unsupported host observed after inspection before submitting", async () => {
  const f = fixture(),
    adapter = f.create();
  await adapter.inspectForContinuation({ authority: f.authority });
  f.setHostVersion("2.11.0");
  await expect(consume(adapter, f.authority)).rejects.toThrow();
  expect(
    seams.request.mock.calls.some(
      ([, request]) => request.operation === "apply",
    ),
  ).toBe(false);
  adapter.dispose();
});
it("refuses a stale initial-program hypothesis without recording an inspection", async () => {
  const f = fixture(),
    adapter = f.create();
  f.setCurrent("9".repeat(64));
  await expect(
    adapter.inspectForContinuation({ authority: f.authority }),
  ).rejects.toThrow();
  expect(f.files.size).toBe(0);
  adapter.dispose();
});
it("records real response identity separately from observed installation", async () => {
  const f = fixture(),
    adapter = f.create();
  await adapter.inspectForContinuation({ authority: f.authority });
  await expect(consume(adapter, f.authority)).resolves.toEqual({
    status: "completed",
  });
  const result = adapter.inspectResult();
  if (!result) throw Error("Expected a recorded completion");
  expect(result.acknowledgement).toBe("received");
  expect(result.responseDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(result.candidateProgram).toBe(candidateProgram);
  expect(seams.claim).toHaveBeenCalledOnce();
  adapter.dispose();
});
it("reconciles lost acknowledgement without another PUT or invented response digest", async () => {
  const f = fixture(),
    adapter = f.create();
  await adapter.inspectForContinuation({ authority: f.authority });
  f.loseResponse();
  await expect(consume(adapter, f.authority)).rejects.toThrow();
  adapter.dispose();
  const reopened = f.create();
  const authority = { ...f.authority, operation: "ptr-update-apply" as const };
  const selection = reopened.reopenContinuation({ authority });
  f.setHostVersion('2.11.0');
  await expect(reopened.reconcileContinuation({
    reconciliation: {}, store: {}, sourceAuthority: authority, selection,
  } as Parameters<typeof reopened.reconcileContinuation>[0])).rejects.toThrow();
  expect(reopened.inspectResult()).toBeUndefined();
  f.setHostVersion('2.10.0');
  await expect(
    reopened.reconcileContinuation({
      reconciliation: {},
      store: {},
      sourceAuthority: authority,
      selection,
    } as Parameters<typeof reopened.reconcileContinuation>[0]),
  ).resolves.toMatchObject({ outcome: "effect-applied" });
  expect(reopened.inspectResult()).toMatchObject({
    acknowledgement: "not-received",
    responseDigest: null,
  });
  expect(
    seams.request.mock.calls.filter(([, x]) => x.operation === "apply"),
  ).toHaveLength(1);
  expect(seams.reconcile).toHaveBeenCalledTimes(2);
  reopened.dispose();
});
it.each([false, true])(
  "revokes delayed pre-send work after timeout (failed no-effect write: %s)",
  async (failedWrite) => {
    const f = fixture(),
      adapter = f.create();
    await adapter.inspectForContinuation({ authority: f.authority });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // The delayed work is the actual provider pre-send phase, not the earlier
    // signed-observation permission checks introduced by V4.
    seams.permit.mockImplementation(({ phase }) => phase === 'continuation-effect' ? gate : Promise.resolve());
    if (failedWrite) f.failNoEffectWrite();
    const real = seams.request.getMockImplementation()!;
    let delayed!: Promise<unknown>;
    seams.request.mockImplementation(async (capability, request) => {
      if (request.operation !== "apply") return real(capability, request);
      delayed = request.beforeSend();
      delayed.catch(() => {});
      throw Error("synthetic timeout before send");
    });
    await expect(consume(adapter, f.authority)).rejects.toThrow();
    expect(
      [...f.files.keys()].some((k) => k.endsWith(".not-submitted.json")),
    ).toBe(!failedWrite);
    release();
    await expect(delayed).rejects.toThrow();
    expect(
      [...f.files.keys()].some((k) => k.endsWith(".submission.json")),
    ).toBe(false);
    adapter.dispose();
  },
);
function rewriteInspection(
  files: Map<string, Buffer>,
  filename: string,
  mutate: (value: any) => void,
) {
  const record = JSON.parse(files.get(filename)!.toString());
  const oldDigest = record.inspectionDigest;
  mutate(record.value);
  const nextDigest = updateDigest(record.value);
  record.inspectionDigest = nextDigest;
  files.set(filename, Buffer.from(`${updateCanonical(record)}\n`));
  for (const [key, bytes] of [...files]) {
    if (key === filename || !key.includes(`/${oldDigest}.`)) continue;
    const member = JSON.parse(bytes.toString());
    member.inspectionDigest = nextDigest;
    files.delete(key);
    files.set(
      key.replace(`/${oldDigest}.`, `/${nextDigest}.`),
      Buffer.from(`${updateCanonical(member)}\n`),
    );
  }
}
it("rejects a rehashed history whose program edge disagrees with its predecessor", async () => {
  const f = fixture(),
    adapter = f.create();
  await adapter.inspectForContinuation({ authority: f.authority });
  seams.permit.mockRejectedValueOnce(Error("synthetic denied permit"));
  await expect(consume(adapter, f.authority)).rejects.toThrow();
  await adapter.inspectForContinuation({ authority: f.authority });
  const child = [...f.files.keys()].find(
    (key) =>
      key.endsWith(".inspection.json") &&
      JSON.parse(f.files.get(key)!.toString()).value.predecessorDigest,
  )!;
  rewriteInspection(f.files, child, (value) => {
    value.beforeProgram = "9".repeat(64);
    const observation = plan(value.beforeProgram);
    value.plan = {
      observation,
      planDigest: updateDigest(observation),
      token: observation.AutoMigrate.token,
    };
  });
  expect(() =>
    adapter.reopenContinuation({ authority: f.authority }),
  ).toThrow();
  adapter.dispose();
});
it("does not expose another source completion through an existing adapter", async () => {
  const f = fixture(),
    adapter = f.create();
  await adapter.inspectForContinuation({ authority: f.authority });
  await consume(adapter, f.authority);
  const inspection = [...f.files.keys()].find((key) =>
    key.endsWith(".inspection.json"),
  )!;
  rewriteInspection(f.files, inspection, (value) => {
    value.binding.sourceCommit = "b".repeat(40);
  });
  expect(() => adapter.inspectResult()).toThrow();
  adapter.dispose();
});

// The real artifact, provider, authority and continuation owners are mocked above;
// these cases verify the shared engine's fixed G002 policy, not live authorization.
it('inspects existing G002 with its source artifact, fixed target and separate journal', async () => {
  const f = fixture('g002'), adapter = f.create();
  try {
    const selected = await adapter.inspectForContinuation({ authority: f.authority });
    expect(selected.subject).toBe('g002-update:c2003223f6e3c86e988775ddd458c3a45635d0d021e11131551471617c392194');
    expect(completionApi.isG002ProductionExistingUpdateAdapter(adapter)).toBe(true);
    expect(assertSealedRealmsExistingUpdateAdapter(adapter, 'g002')).toBe(adapter);
    expect(() => assertSealedRealmsExistingUpdateAdapter(adapter, 'ptr')).toThrow();
    expect(completionApi.isPtrProductionExistingUpdateAdapter(adapter)).toBe(false);
    expect(seams.g002Artifact).toHaveBeenCalledWith(f.artifact);
    expect(seams.g002Provider).toHaveBeenCalledWith({ artifact: f.artifact });
    expect([...f.files.keys()]).toHaveLength(1);
    expect([...f.files.keys()][0]).toMatch(/^existing-updates-production-v1\/g002\//u);
    const stored = JSON.parse([...f.files.values()][0].toString());
    expect(stored.profile).toBe('warpkeep-g002-production-existing-update-v1');
    expect(stored.value.preservation.profile).toBe('warpkeep-g002-raw-v10-stable-row-schema-v1');
    expect(seams.request.mock.calls.some(([, request]) => request.operation === 'apply')).toBe(false);
    const wrongAuthority = { ...f.authority, operation: 'ptr-update-inspect' } as never;
    await expect(adapter.inspectForContinuation({ authority: wrongAuthority })).rejects.toThrow('G002_PRODUCTION_EXISTING_UPDATE_INVALID');
  } finally { adapter.dispose(); }
  expect(completionApi.isG002ProductionExistingUpdateAdapter(adapter)).toBe(false);
});
it('refuses a foreign G002 artifact before constructing provider credentials', () => {
  const f = fixture('g002');
  seams.g002Artifact.mockImplementation(() => { throw Error('Foreign artifact'); });
  expect(f.create).toThrow('G002_PRODUCTION_EXISTING_UPDATE_INVALID');
  expect(seams.g002Provider).not.toHaveBeenCalled();
  expect(f.files.size).toBe(0);
});
it('rejects a stale existing G002 predecessor before recording an inspection', async () => {
  const f = fixture('g002'), adapter = f.create();
  try {
    f.setCurrent('9'.repeat(64));
    await expect(adapter.inspectForContinuation({ authority: f.authority })).rejects.toThrow();
    expect(f.files.size).toBe(0);
    expect(seams.request.mock.calls.some(([, request]) => request.operation === 'apply')).toBe(false);
  } finally { adapter.dispose(); }
});

it('completes a G002 update with its signed pre-observation and isolated completion capability', async () => {
  const f = await completedFixture('g002');
  try {
    const completion = completionApi.exportG002ExistingUpdateCompletion({ adapter: f.adapter as never,
      authority: f.applyAuthority, store: f.store });
    const receipt = completionApi.readG002ExistingUpdateCompletion({ completion,
      authority: f.applyAuthority, privateState: f.privateState as never });
    expect(receipt.profile).toBe('warpkeep-g002-existing-update-receipt-v1');
    expect(receipt.acknowledgement).toBe('received');
    expect(receipt.continuation.terminalRecordDigest).toBe(f.terminal.terminalRecordDigest);
    expect(seams.claim).toHaveBeenCalledWith(expect.objectContaining({ kind: 'g002-update' }));
    expect(seams.permit).toHaveBeenCalledWith(expect.objectContaining({ phase: 'g002-update-observation' }));
    expect(f.observationTransport.observations[0]).toMatchObject({
      profile: 'warpkeep-recovery-g002-update-observation-v1',
      observation: { g002: { programKeccak256: BEFORE, playerCount: 0, sealed: true } },
    });
    expect([...f.files.keys()].some(path => path.startsWith('g002-update-observation-v1/'))).toBe(true);
    expect([...f.files.keys()].some(path => path.includes('/ptr/') || path.startsWith('ptr-update-observation'))).toBe(false);
    expect(() => completionApi.exportPtrExistingUpdateCompletion({ adapter: f.adapter as never,
      authority: f.applyAuthority, store: f.store })).toThrow();
    expect(() => completionApi.readPtrExistingUpdateCompletion({ completion: completion as never,
      authority: f.applyAuthority, privateState: f.privateState as never })).toThrow();
    expect(() => completionApi.readG002ExistingUpdateCompletion({ completion: { ...completion } as never,
      authority: f.applyAuthority, privateState: f.privateState as never })).toThrow();
    expect(() => completionApi.readG002ExistingUpdateCompletion({ completion,
      authority: f.applyAuthority, privateState: {} as never })).toThrow();
    f.adapter.dispose();
    expect(() => completionApi.readG002ExistingUpdateCompletion({ completion,
      authority: f.applyAuthority, privateState: f.privateState as never })).toThrow();
  } finally { f.adapter.dispose(); }
});
it('reopens a lost G002 acknowledgement without replaying the update', async () => {
  const f = fixture('g002'), adapter = f.create();
  await adapter.inspectForContinuation({ authority: f.authority });
  f.loseResponse();
  await expect(consume(adapter, f.authority)).rejects.toThrow();
  adapter.dispose();
  const reopened = f.create(), authority = { ...f.authority, operation: 'g002-update-apply' as const };
  try {
    const selection = reopened.reopenContinuation({ authority });
    await expect(reopened.reconcileContinuation({ reconciliation: {} as never, store: {} as never,
      sourceAuthority: authority, selection })).resolves.toMatchObject({ outcome: 'effect-applied' });
    expect(reopened.inspectResult()).toMatchObject({ acknowledgement: 'not-received', responseDigest: null });
    expect(seams.request.mock.calls.filter(([, request]) => request.operation === 'apply')).toHaveLength(1);
    expect(seams.reconcile).toHaveBeenCalledWith(expect.objectContaining({ kind: 'g002-update' }));
  } finally { reopened.dispose(); }
});
it('refuses a G002 update before submission when its signed pre-observation is invalid', async () => {
  const f = fixture('g002'), adapter = f.create();
  try {
    await adapter.inspectForContinuation({ authority: f.authority });
    f.observationTransport.setFault('invalid-signature');
    await expect(consume(adapter, f.authority)).rejects.toThrow();
    expect(seams.request.mock.calls.some(([, request]) => request.operation === 'apply')).toBe(false);
    expect([...f.files.keys()].some(path => path.endsWith('.submission.json'))).toBe(false);
  } finally { adapter.dispose(); }
});
it('captures and reopens G002 adoption only from retained signed pre/post and terminal evidence', async () => {
  const f = await completedFixture('g002');
  f.observationTransport.setNowSeconds(Math.ceil(Date.parse(f.terminal.terminalAt) / 1000) + 5);
  const capture = (adapter: typeof f.adapter) => completionApi.captureG002ExistingUpdateAdoption({
    adapter: adapter as never, authority: f.applyAuthority, store: f.store, permit: {} as never,
    runId: '123', runAttempt: '1',
  });
  try {
    const adoption = await capture(f.adapter);
    const envelope = await completionApi.readG002ExistingStateAdoption({ adoption,
      authority: f.applyAuthority, privateState: f.privateState as never });
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.profile).toBe('warpkeep-g002-existing-state-adoption-v1');
    expect(envelope.completionReceipt.continuation.terminalRecordDigest).toBe(f.terminal.terminalRecordDigest);
    expect(f.observationTransport.observations.at(-1)).toMatchObject({ context: {
      phase: 'post', completionReceiptDigest: updateDigest(envelope.completionReceipt),
      terminalRecordDigest: f.terminal.terminalRecordDigest,
    }, observation: { g002: { programKeccak256: candidateProgram, playerCount: 0, sealed: true } } });
    await expect(completionApi.readPtrExistingStateAdoption({ adoption: adoption as never,
      authority: f.applyAuthority, privateState: f.privateState as never })).rejects.toThrow();
    const calls = f.observationTransport.requests.length, effects = seams.request.mock.calls.length;
    f.adapter.dispose();
    const reopened = f.create();
    try {
      const retained = await capture(reopened);
      expect(await completionApi.readG002ExistingStateAdoption({ adoption: retained,
        authority: f.applyAuthority, privateState: f.privateState as never })).toEqual(envelope);
      expect(f.observationTransport.requests).toHaveLength(calls);
      expect(seams.request).toHaveBeenCalledTimes(effects);
      const sidecar = [...f.files.keys()].find(path => path.endsWith('.post.json'))!;
      const bytes = f.files.get(sidecar)!;
      const parsed = JSON.parse(bytes.toString());
      parsed.compact = parsed.compact.slice(0, -3) + 'AAA';
      f.files.set(sidecar, Buffer.from(updateCanonical(parsed) + '\n'));
      await expect(completionApi.readG002ExistingStateAdoption({ adoption: retained,
        authority: f.applyAuthority, privateState: f.privateState as never })).rejects.toThrow();
      expect(seams.request).toHaveBeenCalledTimes(effects);
    } finally { reopened.dispose(); }
  } finally { f.adapter.dispose(); }
});

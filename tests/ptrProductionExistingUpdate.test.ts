// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";
const seams = vi.hoisted(() => ({
  request: vi.fn(),
  dispose: vi.fn(),
  claim: vi.fn(),
  reconcile: vi.fn(),
  permit: vi.fn(),
  completion: vi.fn(),
}));
vi.mock("../scripts/ptr-update-provider-credentials.mjs", () => ({
  createPtrUpdateProviderCredentials: () => Object.freeze({}),
  requestPtrUpdateProvider: seams.request,
  disposePtrUpdateProviderCredentials: seams.dispose,
}));
vi.mock("../scripts/ptr-production-publisher.mjs", () => ({
  assertPtrSourceBuiltArtifact: (artifact: any) => {
    artifact.assertSourceAndArtifact();
    return artifact;
  },
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
  assertSealedRealmsProductionContinuationReconciliation: seams.reconcile,
  classifySealedRealmsProductionContinuationNoEffect: (value: any) => ({
    outcome: "no-effect",
    observationDigest: value.observationDigest,
  }),
}));
import { createSealedRealmsProductionExistingUpdateAdapter } from "../scripts/sealed-realms-production-existing-update.mjs";
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
const plan = (prior: string, candidate = candidateProgram) => ({
  AutoMigrate: {
    break_clients: false,
    major_version_upgrade: false,
    migrate_plan: `${"━".repeat(60)}\nDatabase Migration Plan\n${"━".repeat(60)}\n\n`,
    token:
      "0x" +
      Buffer.from(existingUpdateTokenDigest(ID, prior, candidate), "hex")
        .reverse()
        .toString("hex"),
  },
});
beforeEach(() => {
  vi.resetAllMocks();
});

function fixture() {
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
    operation: "ptr-update-inspect",
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
        database_identity: { __identity__: "0x" + ID },
        owner_identity: { __identity__: "0x" + "2".repeat(64) },
        host_type: { Js: [] },
        initial_program: "0x" + BEFORE,
      });
    if (request.operation === "schema") return encode(definition.definition);
    if (request.operation === "plan") return encode(plan(current));
    if (request.operation === "apply") {
      await request.beforeSend();
      expect(
        [...files.keys()].some((k) => k.endsWith(".submission.json")),
      ).toBe(true);
      current = candidateProgram;
      if (lost) throw Error("synthetic lost response");
      return encode({
        Success: { domain: null, database_identity: ID, op: "updated" },
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
    } as unknown as Parameters<
      typeof createSealedRealmsProductionExistingUpdateAdapter
    >[0]);
  return {
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
  const applyAuthority = { ...authority, operation: "ptr-update-apply" };
  const selection = adapter.reopenContinuation({ authority: applyAuthority });
  return adapter.consumeContinuationEntry({
    claim: {},
    store: {},
    permit: {},
    sourceAuthority: applyAuthority,
    kind: "ptr-update",
    runId: "123",
    runAttempt: 1,
    ...selection,
    selection,
  });
}
async function completedFixture() {
  const f = fixture(), adapter = f.create();
  await adapter.inspectForContinuation({ authority: f.authority });
  await consume(adapter, f.authority);
  const authority = { ...f.authority, operation: 'ptr-update-apply' as const };
  const terminal = {
    scopeDigest: '1'.repeat(64), issuedRecordDigest: '2'.repeat(64),
    claimRecordDigest: '3'.repeat(64), terminalRecordDigest: '4'.repeat(64),
    claimRunId: '123', claimRunAttempt: 1, terminalRunId: '123', terminalRunAttempt: 1,
    outcome: 'completed', observationDigest: null, terminalAt: new Date().toISOString(),
  };
  seams.completion.mockReturnValue(terminal);
  return { ...f, adapter, applyAuthority: authority, terminal, store: {} as never };
}
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
    seams.permit.mockImplementationOnce(() => gate);
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

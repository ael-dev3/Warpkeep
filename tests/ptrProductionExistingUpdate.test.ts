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
  assertSealedRealmsProductionContinuationClaim: seams.claim,
  assertSealedRealmsProductionContinuationReconciliation: seams.reconcile,
  classifySealedRealmsProductionContinuationNoEffect: (value: any) => ({
    outcome: "no-effect",
    observationDigest: value.observationDigest,
  }),
}));
import { createSealedRealmsProductionExistingUpdateAdapter } from "../scripts/sealed-realms-production-existing-update.mjs";
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

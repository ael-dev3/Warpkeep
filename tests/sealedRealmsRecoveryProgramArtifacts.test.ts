// @vitest-environment node
// The fixed native producer and source I/O are seams here; private/source brands are real.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const seam = vi.hoisted(() => ({
  build: vi.fn(),
  snapshot: vi.fn(),
  corpus: vi.fn(),
  records: new WeakSet<object>(),
}));
vi.mock("../scripts/local-binding-runtime.mjs", () => ({
  derivePreparedGenesisProgramArtifacts: seam.build,
}));
vi.mock("../scripts/recovery-source-closure.mjs", () => ({
  assertRecoverySourceClosureSnapshot: seam.snapshot,
}));
vi.mock("node:child_process", () => ({
  execFileSync: () => "b".repeat(40) + "\n",
}));
vi.mock("../scripts/sealed-realms-production-activation-records.mjs", () => ({
  assertSealedRealmsProductionActivationRecordsAuthority: ({
    records,
  }: {
    records: object;
  }) => {
    if (!seam.records.has(records)) throw Error("records required");
  },
  readSealedRealmsProductionRecoveryCandidateRecords: seam.corpus,
}));
import { createSealedRealmsProductionPrivateState } from "../scripts/sealed-realms-production-private-state.mjs";
import { authenticateSealedRealmsProductionSourceAuthority } from "../scripts/sealed-realms-production-source-authority.mjs";
import {
  createSealedRealmsProductionRecoveryProgramArtifacts as create,
  readSealedRealmsProductionRecoveryProgramArtifacts as read,
  disposeSealedRealmsProductionRecoveryProgramArtifacts as dispose,
} from "../scripts/sealed-realms-production-recovery-program-artifacts.mjs";
const roots: string[] = [];
beforeEach(() => {
  seam.build.mockReset();
  seam.snapshot.mockReset();
  seam.corpus.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const home = mkdtempSync(join(tmpdir(), "warpkeep-program-owner-"));
  roots.push(home);
  for (const path of ["audit/private", "runtime", "cache"])
    mkdirSync(
      join(home, "Library/Application Support/Warpkeep/operations", path),
      { recursive: true, mode: 0o700 },
    );
  const privateState = createSealedRealmsProductionPrivateState({
    reportedHome: home,
    testOnlyOwnerUid: statSync(home).uid,
    testOnlyAllowPlatformMode: true,
    testOnlyFsync: () => {},
  });
  const authority = authenticateSealedRealmsProductionSourceAuthority({
    operation: "activation-evidence-generate",
    workflowInputSha: "a".repeat(40),
    readGit: () => "a".repeat(40) + "\n",
    readBinding: () => ({
      schemaVersion: 1,
      profile: "warpkeep-0.4.0-sealed-launch-v1",
      pagesDeploymentApproved: false,
      preparationSourceCommit: null,
    }),
    verifyEvidence: (verifiedSha) => ({ verifiedSha }),
  });
  const baseline = "2ae51984e1fa6ce5b0028c1a250359fed79d819b";
  const artifact = (realm: string) => {
    const bytes = Buffer.from(`synthetic ${realm} build`);
    return {
      profile: "warpkeep-local-program-artifact-v1",
      realm,
      sourceCommit: "a".repeat(40),
      sourceTree: "b".repeat(40),
      moduleSourceCommit: realm === "genesis001" ? baseline : "a".repeat(40),
      moduleTreeId:
        realm === "genesis001"
          ? "90deebb5faf4129282f5c35999244f540001b27d"
          : "c".repeat(40),
      dependencyClosureDigest: "d".repeat(64),
      nodeVersion: realm === "genesis001" ? "24.19.0" : "22.22.3",
      programArtifactSha256: createHash("sha256").update(bytes).digest("hex"),
      programHashAlgorithm: "keccak-256",
      programKeccak256: (realm === "genesis001" ? "1" : "2").repeat(64),
      artifactBytes: bytes.length,
      artifactBase64: bytes.toString("base64"),
    };
  };
  const result = {
    profile: "warpkeep-local-genesis-program-artifacts-v1",
    sourceCommit: "a".repeat(40),
    sourceTree: "b".repeat(40),
    genesis001: artifact("genesis001"),
    genesis002: artifact("genesis002"),
  };
  seam.build.mockResolvedValue(result);
  const projection: Record<string, unknown> = {
    g001SourceBaselineCommit: baseline,
    g001PolicySourceCommit: "a".repeat(40),
    g001FreezePublishReceiptDigest: null,
    g002ModuleSourceCommit: "a".repeat(40),
    g002ModuleSha256: result.genesis002.programArtifactSha256,
    g002ModuleTreeId: result.genesis002.moduleTreeId,
    g002DependencyClosureDigest: result.genesis002.dependencyClosureDigest,
  };
  seam.corpus.mockImplementation(() => ({ projection: { ...projection } }));
  const records = Object.freeze({});
  seam.records.add(records);
  return {
    privateState,
    authority,
    result,
    projection,
    records: records as never,
  };
}
it("owns the fixed producer result, checks corpus coordinates, and revokes without exposing bytes", async () => {
  const f = fixture(),
    capability = await create({
      privateState: f.privateState,
      authority: f.authority,
    });
  const input = { ...f, capability };
  const args = {
    capability,
    privateState: input.privateState,
    authority: input.authority,
    records: input.records,
  };
  expect(seam.build).toHaveBeenCalledExactlyOnceWith();
  expect(Object.keys(capability)).toEqual([]);
  expect(read(args)).toEqual({
    g001ExpectedProgramKeccak256: "1".repeat(64),
    g002ExpectedProgramKeccak256: "2".repeat(64),
  });
  f.result.genesis002.programKeccak256 = "3".repeat(64);
  expect(read(args).g002ExpectedProgramKeccak256).toBe("2".repeat(64));
  for (const changed of [
    { capability: {} },
    { authority: { ...f.authority } },
    { privateState: {} },
    { records: {} },
  ])
    expect(() => read({ ...args, ...changed } as never)).toThrow();
  for (const key of [
    "g001SourceBaselineCommit",
    "g001PolicySourceCommit",
    "g002ModuleSourceCommit",
    "g002ModuleSha256",
    "g002ModuleTreeId",
    "g002DependencyClosureDigest",
  ]) {
    const old = f.projection[key];
    f.projection[key] = "9".repeat(64);
    expect(() => read(args)).toThrow();
    f.projection[key] = old;
  }
  dispose(capability);
  expect(() => read(args)).toThrow();
});
it.each([
  "sourceCommit",
  "moduleSourceCommit",
  "moduleTreeId",
  "nodeVersion",
  "programHashAlgorithm",
  "programArtifactSha256",
  "artifactBytes",
  "artifactBase64",
])("refuses bad fixed G001 provenance %s", async (key) => {
  const f = fixture();
  (f.result.genesis001 as Record<string, unknown>)[key] = "wrong";
  await expect(
    create({ privateState: f.privateState, authority: f.authority }),
  ).rejects.toThrow();
});
it("reattests after the native await and refuses caller artifacts before invoking it", async () => {
  const f = fixture();
  seam.snapshot
    .mockImplementationOnce(() => {})
    .mockImplementation(() => {
      throw Error("source changed");
    });
  await expect(
    create({ privateState: f.privateState, authority: f.authority }),
  ).rejects.toThrow();
  seam.build.mockClear();
  await expect(create({ ...f, artifact: f.result } as never)).rejects.toThrow();
  expect(seam.build).not.toHaveBeenCalled();
});
it("refuses corpus mutation during reread and source revocation on a retained capability", async () => {
  const f = fixture(),
    capability = await create({
      privateState: f.privateState,
      authority: f.authority,
    });
  const args = {
    capability,
    privateState: f.privateState,
    authority: f.authority,
    records: f.records,
  };
  try {
    seam.corpus
      .mockReturnValueOnce({ projection: { ...f.projection } })
      .mockReturnValue({
        projection: { ...f.projection, g002ModuleSha256: "f".repeat(64) },
      });
    expect(() => read(args)).toThrow();
    seam.corpus.mockImplementation(() => ({ projection: { ...f.projection } }));
    seam.snapshot.mockImplementation(() => {
      throw Error("revoked source");
    });
    expect(() => read(args)).toThrow("revoked source");
  } finally {
    dispose(capability);
  }
});

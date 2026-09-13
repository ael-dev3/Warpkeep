// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const seams = vi.hoisted(() => ({
  assert: vi.fn(),
  corpus: vi.fn(),
  source: vi.fn(),
  open: vi.fn(),
  g002: vi.fn(),
  ptr: vi.fn(),
  importAuthority: vi.fn(),
}));
vi.mock("../scripts/sealed-realms-production-activation-records.mjs", () => ({
  assertSealedRealmsProductionActivationRecordsAuthority: seams.assert,
  readSealedRealmsProductionRecoveryCandidateRecords: seams.corpus,
}));
vi.mock("../scripts/sealed-realms-production-source-authority.mjs", () => ({
  sourceCommitFromSealedRealmsProductionAuthority: seams.source,
}));
vi.mock("../scripts/atlas/greater-realm-private-workspace", () => ({
  openExistingGreaterRealmPrivateWorkspace: seams.open,
}));
vi.mock("../scripts/atlas/greater-realm-runtime-release", () => ({
  readGenesis002GreaterRealmRuntimeRelease: seams.g002,
  readPtrGreaterRealmRuntimeRelease: seams.ptr,
  verifyGenesis002GreaterRealmRuntimeReleaseArtifacts: vi.fn(),
  verifyPtrGreaterRealmRuntimeReleaseArtifacts: vi.fn(),
}));
vi.mock("../scripts/greater-realm-production-import-core", () => ({
  greaterRealmProductionImportEngine: {
    importAuthority: seams.importAuthority,
  },
}));
import { createHash } from "node:crypto";
import { readSealedRealmsProductionRecoveryApprovalFacts as read } from "../scripts/sealed-realms-production-recovery-approval-facts";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
let projection: Record<string, string>;
const input = {
  records: {},
  privateState: {},
  authority: { mode: "S", operation: "activation-evidence-generate" },
  readContext: {},
} as any;
beforeEach(() => {
  vi.resetAllMocks();
  projection = {};
  seams.source.mockReturnValue("a".repeat(40));
  seams.open.mockReturnValue({ root: "/private" });
  for (const realm of ["g002", "ptr"]) {
    const artifact = {
      manifestBytes: Buffer.from(realm),
      authority: {
        atlasId: realm,
        sourceCommit: "a".repeat(40),
        publicReleaseId: realm + "-release",
        publicApprovalReceiptId: realm + "-approval",
        releaseSha256: sha(realm),
        headerJson: realm + "-header",
      },
    };
    seams[realm as "g002" | "ptr"].mockReturnValue(artifact);
    Object.assign(projection, {
      [realm + "AtlasId"]: realm,
      [realm + "AtlasSourceCommit"]: "a".repeat(40),
      [realm + "PublicReleaseId"]: realm + "-release",
      [realm + "ReleaseHeaderSha256"]: sha(realm + "-header"),
      [realm === "ptr" ? "ptrExpectedReleaseSha256" : "g002ReleaseSha256"]:
        sha(realm),
    });
  }
  projection.ptrReleaseManifestSha256 = sha("ptr");
  seams.importAuthority.mockImplementation((a) => a.authority);
  seams.corpus.mockImplementation(() => ({
    projection: { ...projection },
    bootstrap: { preparationSourceCommit: "a".repeat(40) },
  }));
});
it("projects only two IDs after bounded release/corpus rereads and propagates read context", () => {
  const result = read(input);
  expect(result).toEqual({
    g002PublicApprovalReceiptId: "g002-approval",
    ptrPublicApprovalReceiptId: "ptr-approval",
  });
  expect(Object.isFrozen(result)).toBe(true);
  expect(seams.corpus).toHaveBeenCalledTimes(2);
  expect(seams.corpus).toHaveBeenNthCalledWith(
    1,
    input.records,
    input.readContext,
  );
  expect(seams.g002).toHaveBeenCalledTimes(2);
  expect(seams.assert).toHaveBeenCalledTimes(2);
});
it.each([
  "g002AtlasId",
  "ptrAtlasId",
  "g002AtlasSourceCommit",
  "ptrAtlasSourceCommit",
  "g002PublicReleaseId",
  "ptrPublicReleaseId",
  "g002ReleaseHeaderSha256",
  "ptrReleaseHeaderSha256",
  "g002ReleaseSha256",
  "ptrExpectedReleaseSha256",
  "ptrReleaseManifestSha256",
])("refuses mismatched authenticated %s", (key) => {
  projection[key] = "wrong";
  expect(() => read(input)).toThrow();
});
it("refuses changed corpus between snapshots", () => {
  seams.corpus
    .mockImplementationOnce(() => ({
      projection: { ...projection },
      bootstrap: {},
    }))
    .mockImplementationOnce(() => ({
      projection: { ...projection, extra: "changed" },
      bootstrap: {},
    }));
  expect(() => read(input)).toThrow();
});
it("refuses changed release bytes between snapshots", () => {
  const old = seams.ptr();
  seams.ptr
    .mockReturnValueOnce(old)
    .mockReturnValueOnce({ ...old, manifestBytes: Buffer.from("changed") });
  expect(() => read(input)).toThrow();
});
it("refuses non-generation authority before opening private releases", () => {
  expect(() =>
    read({ ...input, authority: { mode: "S", operation: "ptr-import-apply" } }),
  ).toThrow();
  expect(seams.open).not.toHaveBeenCalled();
});
it("does not open workspace when genuine owner assertion refuses", () => {
  seams.assert.mockImplementation(() => {
    throw Error("forged owner");
  });
  expect(() => read(input)).toThrow("forged owner");
  expect(seams.open).not.toHaveBeenCalled();
});

it("rejects accessors without invoking them and proxy inputs before dependencies", () => {
  const get = vi.fn();
  const value = { ...input };
  Object.defineProperty(value, "records", { get, enumerable: true });
  expect(() => read(value)).toThrow();
  expect(get).not.toHaveBeenCalled();
  expect(() => read(new Proxy(input, {}))).toThrow();
  expect(seams.assert).not.toHaveBeenCalled();
});

function adoptPtrProjection() {
  delete projection.ptrReleaseManifestSha256;
  projection.ptrExistingStateAdoptionReceiptDigest = "9".repeat(64);
  projection.ptrPublicApprovalReceiptId = "ptr-approval";
}
it('matches both adopted realms to retained approved release identities', () => {
  adoptPtrProjection();
  projection.g002ExistingStateAdoptionReceiptDigest = '8'.repeat(64);
  projection.g002PublicApprovalReceiptId = 'g002-approval';
  expect(read(input)).toEqual({ g002PublicApprovalReceiptId: 'g002-approval', ptrPublicApprovalReceiptId: 'ptr-approval' });
  projection.g002PublicApprovalReceiptId = 'changed';
  expect(() => read(input)).toThrow('SEALED_REALMS_RECOVERY_APPROVAL_FACTS_INVALID');
});
it("matches a preserved PTR to its verified approved release without an initialization manifest claim", () => {
  adoptPtrProjection();
  expect(read(input)).toEqual({
    g002PublicApprovalReceiptId: "g002-approval",
    ptrPublicApprovalReceiptId: "ptr-approval",
  });
  expect(seams.importAuthority).toHaveBeenCalledTimes(4);
  expect(seams.ptr).toHaveBeenCalledTimes(2);
  expect(projection).not.toHaveProperty("ptrReleaseManifestSha256");
});
it.each([
  "ptrPublicApprovalReceiptId",
  "ptrAtlasId",
  "ptrAtlasSourceCommit",
  "ptrPublicReleaseId",
  "ptrReleaseHeaderSha256",
  "ptrExpectedReleaseSha256",
])("rejects preserved PTR %s differing from the verified release", (key) => {
  adoptPtrProjection();
  projection[key] = "changed";
  expect(() => read(input)).toThrow("SEALED_REALMS_RECOVERY_APPROVAL_FACTS_INVALID");
});
it("still rejects changed private manifest bytes while reading preserved PTR approval", () => {
  adoptPtrProjection();
  const original = seams.ptr();
  seams.ptr.mockReturnValueOnce(original)
    .mockReturnValueOnce({ ...original, manifestBytes: Buffer.from("changed") });
  expect(() => read(input)).toThrow("SEALED_REALMS_RECOVERY_APPROVAL_FACTS_INVALID");
});
it("still invokes the complete release verifier for preserved PTR approval", () => {
  adoptPtrProjection();
  seams.importAuthority.mockImplementation(artifacts => {
    if (artifacts.authority.atlasId === "ptr") throw Error("invalid approved release");
    return artifacts.authority;
  });
  expect(() => read(input)).toThrow("invalid approved release");
});
it("requires the legacy PTR manifest commitment when adoption evidence is absent", () => {
  delete projection.ptrReleaseManifestSha256;
  expect(() => read(input)).toThrow("SEALED_REALMS_RECOVERY_APPROVAL_FACTS_INVALID");
});

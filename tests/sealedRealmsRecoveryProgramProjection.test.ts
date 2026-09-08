vi.mock(
  "../scripts/sealed-realms-production-recovery-source-closure.mjs",
  () => ({ readSealedRealmsProductionRecoverySourceClosure: seams.closure }),
);
vi.mock(
  "../scripts/sealed-realms-production-recovery-approval-facts.ts",
  () => ({ readSealedRealmsProductionRecoveryApprovalFacts: seams.approvals }),
);
// @vitest-environment node
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";
import { recoveryBindingCandidate } from "./fixtures/recoveryBindingCandidate.js";
const seams = vi.hoisted(() => ({
  programs: vi.fn(),
  preparation: vi.fn(),
  closure: vi.fn(),
  git: vi.fn(),
  corpus: vi.fn(),
  approvals: vi.fn(),
  bridge: vi.fn(),
  records: new WeakSet<object>(),
}));
vi.mock("node:child_process", () => ({ execFileSync: seams.git }));
// Isolate corpus/source I/O, not candidate policy or source authority validation.
vi.mock("../scripts/sealed-realms-production-activation-records.mjs", () => ({
  assertSealedRealmsProductionActivationRecordsAuthority: ({
    records,
  }: {
    records: object;
  }) => {
    if (!seams.records.has(records))
      throw Error("Fixture corpus capability required");
  },
  readSealedRealmsProductionRecoveryCandidateRecords: seams.corpus,
}));
vi.mock("../scripts/sealed-realms-production-auth-bridge-state.mjs", () => ({
  readSealedRealmsProductionRecoveryBridgeFacts: seams.bridge,
}));
import { authenticateSealedRealmsProductionSourceAuthority } from "../scripts/sealed-realms-production-source-authority.mjs";
import {
  inspectSealedRealmsProductionRecoveryCandidate,
  readSealedRealmsProductionRecoveryCandidate,
} from "../scripts/sealed-realms-production-recovery-candidate.mjs";
import {
  RECOVERY_BINDING_KEYS_V2,
  RECOVERY_BINDING_KEYS_V3,
} from "../scripts/recovery-binding-projection.mjs";
import {
  validateRecoveryActivationCandidate,
  validateRecoveryActivationCandidateV3,
} from "../scripts/recovery-activation-candidate.mjs";
const encode = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
beforeEach(() => {
  seams.closure.mockReset();
  seams.git.mockReset();
  seams.corpus.mockReset();
  seams.bridge.mockReset();
});
function fixture(version: 2 | 3) {
  const old = recoveryBindingCandidate();
  const keys =
    version === 2 ? RECOVERY_BINDING_KEYS_V2 : RECOVERY_BINDING_KEYS_V3;
  const candidate = Object.fromEntries(
    keys.map((key) => [
      key,
      key === "schemaVersion"
        ? version
        : key === "profile" && version === 3
          ? "warpkeep-0.4.0-sealed-launch-ptr-update-v3"
          : key === "ptrExistingUpdateReceiptDigest"
            ? "9".repeat(64)
            : key === "ptrExistingUpdateReceiptCommitment"
              ? null
              : old[key],
    ]),
  );
  const commit = String(old.preparationSourceCommit),
    tree = old.preparationSourceTree,
    blob = "b".repeat(40),
    body = Buffer.from("fixture bootstrap bytes");
  const bootstrap = {
    preparationSourceCommit: commit,
    preparationSourceTree: tree,
    bootstrapBlob: blob,
    bootstrapSha256: createHash("sha256").update(body).digest("hex"),
  };
  const corpus = { bootstrap, projection: candidate };
  seams.approvals.mockReturnValue({
    g002PublicApprovalReceiptId: candidate.g002PublicApprovalReceiptId,
    ptrPublicApprovalReceiptId: candidate.ptrPublicApprovalReceiptId,
  });
  seams.corpus.mockImplementation(() => structuredClone(corpus));
  seams.git.mockImplementation((_executable, argv) => {
    const args = argv.slice(6);
    if (args[0] === "cat-file") return Buffer.from(body);
    if (args[0] === "ls-tree")
      return Buffer.from(
        `100644 blob ${blob}\tscripts/greater-realm-production-bootstrap.mjs\0`,
      );
    if (args[0] !== "rev-parse") throw Error("Unexpected Git");
    return Buffer.from(
      args[1] === "--show-toplevel"
        ? `${realpathSync(process.cwd())}\n`
        : args[2] === `${commit}^{tree}`
          ? `${tree}\n`
          : `${commit}\n`,
    );
  });
  const authority = authenticateSealedRealmsProductionSourceAuthority({
    operation: "activation-evidence-generate",
    workflowInputSha: commit,
    readGit: () => `${commit}\n`,
    readBinding: () => ({
      schemaVersion: 1,
      profile: "warpkeep-0.4.0-sealed-launch-v1",
      pagesDeploymentApproved: false,
      preparationSourceCommit: null,
    }),
    verifyEvidence: (verifiedSha) => ({ verifiedSha }),
  });
  const records = Object.freeze({});
  seams.records.add(records);
  return {
    input: { records: records as never, privateState: {} as never, authority },
    corpus,
    candidate,
  };
}
// Boundary-only test; actual signature/private ownership/corpus proof is in the separate joined suite.
vi.mock("../scripts/sealed-realms-production-recovery-preparation.mjs", () => ({
  readSealedRealmsProductionRecoveryPreparation: seams.preparation,
}));
vi.mock(
  "../scripts/sealed-realms-production-recovery-program-artifacts.mjs",
  () => ({
    readSealedRealmsProductionRecoveryProgramArtifacts: seams.programs,
  }),
);
it("merges program capability facts and checks expiring preparation after the final program/source reread", () => {
  const f = fixture(3),
    programArtifacts = Object.freeze({}) as never,
    preparation = Object.freeze({}) as never;
  const programs = {
    g001ExpectedProgramKeccak256: f.candidate.g001ExpectedProgramKeccak256,
    g002ExpectedProgramKeccak256: f.candidate.g002ExpectedProgramKeccak256,
  };
  delete f.corpus.projection.g001ExpectedProgramKeccak256;
  delete f.corpus.projection.g002ExpectedProgramKeccak256;
  const order: string[] = [];
  seams.programs.mockImplementation(() => {
    order.push("programs");
    return programs;
  });
  seams.preparation.mockImplementation(() => {
    order.push("preparation");
    return {};
  });
  const options = { ...f.input, programArtifacts, preparation };
  expect(
    inspectSealedRealmsProductionRecoveryCandidate(options).missingFields,
  ).toEqual([]);
  expect(order).toEqual(["preparation", "programs", "programs", "preparation"]);
  seams.preparation.mockReturnValueOnce({}).mockImplementation(() => {
    throw Error("expired observation");
  });
  expect(() => inspectSealedRealmsProductionRecoveryCandidate(options)).toThrow(
    "expired observation",
  );
  seams.preparation.mockReturnValue({});
  seams.programs
    .mockReturnValueOnce(programs)
    .mockReturnValue({
      ...programs,
      g002ExpectedProgramKeccak256: "f".repeat(64),
    });
  expect(() =>
    inspectSealedRealmsProductionRecoveryCandidate(options),
  ).toThrow();
  seams.programs.mockReturnValue(programs);
  f.corpus.projection.g002ExpectedProgramKeccak256 = "f".repeat(64);
  expect(() =>
    inspectSealedRealmsProductionRecoveryCandidate(options),
  ).toThrow();
});

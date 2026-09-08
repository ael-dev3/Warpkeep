// Approval I/O is isolated here; the real joined proof lives in sealedRealmsRecoveryApprovalProducer.test.ts.
vi.mock('../scripts/sealed-realms-production-recovery-approval-facts.ts', () => ({ readSealedRealmsProductionRecoveryApprovalFacts: () => ({}) }));
// @vitest-environment node
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  statSync,
  rmSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  readSealedRealmsProductionRecoveryCandidate,
  inspectSealedRealmsProductionRecoveryCandidate,
} from "../scripts/sealed-realms-production-recovery-candidate.mjs";
import { updateDigest } from "../scripts/sealed-realms-existing-update-protocol.mjs";
import {
  ptrV3ActivationFixture,
  PTR_V3_FIXTURE_TIME,
} from "./fixtures/ptrV3ActivationFixture.js";
import { createSealedRealmsProductionPrivateState } from "../scripts/sealed-realms-production-private-state.mjs";
import { authenticateSealedRealmsProductionSourceAuthority } from "../scripts/sealed-realms-production-source-authority.mjs";
import {
  createSealedRealmsProductionActivationRecords,
  readSealedRealmsProductionRecoveryReceiptProjection,
  validateSealedRealmsProductionRecoveryActivationEvidence,
} from "../scripts/sealed-realms-production-activation-records.mjs";
vi.setConfig({ testTimeout: 30_000 });
const gitSeam = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFileSync: gitSeam.run,
}));
const roots: string[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(PTR_V3_FIXTURE_TIME));
});
afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});
function corpus(
  mutate?: (receipt: Record<string, any>) => void,
  wrapperMutate?: (record: Record<string, any>) => void,
) {
  const f = ptrV3ActivationFixture();
  mutate?.(f.receipts);
  const source = f.candidate.preparationSourceCommit;
  const authority = authenticateSealedRealmsProductionSourceAuthority({
    operation: "activation-evidence-generate",
    workflowInputSha: source,
    readGit: () => `${source}\n`,
    readBinding: () => ({
      schemaVersion: 1,
      profile: "warpkeep-0.4.0-sealed-launch-v1",
      pagesDeploymentApproved: false,
      preparationSourceCommit: null,
    }),
    verifyEvidence: (verifiedSha) => ({ verifiedSha }),
  });
  const home = mkdtempSync(join(tmpdir(), "warpkeep-v3-corpus-"));
  roots.push(home);
  for (const suffix of ["audit/private", "runtime", "cache"])
    mkdirSync(
      join(home, "Library/Application Support/Warpkeep/operations", suffix),
      { recursive: true, mode: 0o700 },
    );
  const privateState = createSealedRealmsProductionPrivateState({
    reportedHome: home,
    testOnlyOwnerUid: statSync(home).uid,
    testOnlyAllowPlatformMode: true,
    testOnlyFsync: () => {},
  });
  const filenames = [
    "g001-policy-observation-bootstrap-receipt.json",
    "g001-census-privacy-safe-private-receipt.json",
    "g001-admitted-player-census-private-receipt.json",
    "g001-admission-monitor-suspension-receipt.json",
    "g001-admission-monitor-current-state-receipt.json",
    "g002-publish-receipt.json",
    "g002-atlas-import-receipt.json",
    "g002-sealed-live-receipt.json",
    "ptr-existing-update-receipt.json",
    "ptr-atlas-import-receipt.json",
    "ptr-owner-provision-receipt.json",
    "ptr-sealed-live-receipt.json",
  ];
  const operations = [
    "g001-policy-observe",
    "g001-census-second-inspect",
    "g001-census-second-suspend",
    "g001-census-second-suspend",
    "g001-current-state",
    "g002-publish-apply",
    "g002-import-apply",
    "g002-live-inspect",
    "ptr-update-apply",
    "ptr-import-apply",
    "ptr-owner-provision",
    "ptr-live-inspect",
  ];
  Object.entries(f.receipts).forEach(([member, receipt], i) => {
    const bodyDigest = createHash("sha256")
      .update(`${JSON.stringify(receipt)}\n`)
      .digest("hex");
    const record = {
      schemaVersion: 1,
      profile: "warpkeep-sealed-realms-activation-record-v1",
      member,
      preparationSourceCommit: source,
      sourceCommit: source,
      operation: operations[i],
      sourceAuthorityDigest: authority.authorityDigest,
      bodyDigest,
      receipt,
      semanticDigest: "",
    };
    wrapperMutate?.(record);
    record.semanticDigest = createHash("sha256")
      .update(
        [
          "warpkeep.sealed-realms.activation-record.v1",
          member,
          record.preparationSourceCommit,
          record.sourceCommit,
          record.operation,
          record.sourceAuthorityDigest,
          bodyDigest,
        ].join("\n") + "\n",
      )
      .digest("hex");
    privateState.write({
      root: "runtime",
      relativePath: `activation-evidence/records/${filenames[i]}`,
      bytes: Buffer.from(`${JSON.stringify(record)}\n`),
    });
  });
  return {
    ...f,
    privateState,
    authority,
    records: createSealedRealmsProductionActivationRecords({
      privateState,
      authority,
    }),
  };
}
it("reads actual fixed V3 corpus into current module projection without fresh-publication fields", () => {
  const f = corpus();
  const p = readSealedRealmsProductionRecoveryReceiptProjection(f.records);
  expect(p).toMatchObject({
    ptrModuleSourceCommit:
      f.receipts.ptrExistingUpdateReceipt.binding.sourceCommit,
    ptrModuleSha256:
      f.receipts.ptrExistingUpdateReceipt.binding.candidateSha256,
    ptrExistingUpdateReceiptDigest: f.candidate.ptrExistingUpdateReceiptDigest,
  });
  expect(p).not.toHaveProperty("ptrPublishReceiptDigest");
  expect(p).not.toHaveProperty("ptrFreshStatusDigest");
});
it("validates the actual V3 envelope using preserved initialization and current live crosslinks", () => {
  const f = ptrV3ActivationFixture();
  expect(
    validateSealedRealmsProductionRecoveryActivationEvidence(f.envelope),
  ).toEqual(f.candidate);
});
it.each(["ptrAtlasImportReceipt", "ptrOwnerProvisionReceipt"])(
  "refuses unanchored historical %s wrapper even with recomputed wrapper hashes",
  (member) => {
    const f = corpus(undefined, (record) => {
      if (record.member === member) {
        record.sourceCommit = "b".repeat(40);
        record.preparationSourceCommit = "b".repeat(40);
      }
    });
    expect(() =>
      readSealedRealmsProductionRecoveryReceiptProjection(f.records),
    ).toThrow();
  },
);
it.each(["binding", "terminal", "acknowledgement", "preservation"])(
  "rejects substituted %s update facts",
  (kind) => {
    const f = corpus((receipts) => {
      const r = receipts.ptrExistingUpdateReceipt;
      if (kind === "binding") r.binding.sourceCommit = "b".repeat(40);
      if (kind === "terminal") r.continuation.claimRunId = "999";
      if (kind === "acknowledgement") r.responseDigest = null;
      if (kind === "preservation")
        r.preservation.candidatePreservationDigest = "f".repeat(64);
    });
    expect(() =>
      readSealedRealmsProductionRecoveryReceiptProjection(f.records),
    ).toThrow();
  },
);
it("refuses mismatched current live module even with valid current-source record wrappers", () => {
  const f = corpus((receipts) => {
    receipts.ptrSealedLiveReceipt.moduleSha256 = "f".repeat(64);
  });
  expect(() =>
    readSealedRealmsProductionRecoveryReceiptProjection(f.records),
  ).toThrow();
});

it("refuses a mixed publication and update corpus inventory", () => {
  const f = corpus();
  f.privateState.write({
    root: "runtime",
    relativePath: "activation-evidence/records/ptr-publish-receipt.json",
    bytes: Buffer.from("{}\n"),
  });
  expect(() =>
    readSealedRealmsProductionRecoveryReceiptProjection(f.records),
  ).toThrow("SEALED_REALMS_ACTIVATION_RECORDS_INCOMPLETE");
});
it.each([
  [2, "warpkeep-0.4.0-recovery-activation-evidence-ptr-update-v1"],
  [3, "warpkeep-0.4.0-recovery-activation-evidence-v1"],
  [4, "warpkeep-0.4.0-recovery-activation-evidence-ptr-update-v1"],
])(
  "refuses envelope schema/profile mismatch %s %s",
  (schemaVersion, profile) => {
    const f = ptrV3ActivationFixture();
    expect(() =>
      validateSealedRealmsProductionRecoveryActivationEvidence({
        ...f.envelope,
        schemaVersion,
        profile,
      }),
    ).toThrow();
  },
);
it("refuses unknown completion fields rather than normalizing them away", () => {
  const f = ptrV3ActivationFixture();
  f.receipts.ptrExistingUpdateReceipt.unclaimedAuthority = true;
  expect(() =>
    validateSealedRealmsProductionRecoveryActivationEvidence(f.envelope),
  ).toThrow();
});
it("accepts a lost-ack completion with exact terminal observation crosslink", () => {
  const f = ptrV3ActivationFixture();
  const receipt = f.receipts.ptrExistingUpdateReceipt;
  receipt.acknowledgement = "not-received";
  receipt.acknowledgementRecordDigest = null;
  receipt.responseDigest = null;
  receipt.continuation.outcome = "reconciled-effect-applied";
  receipt.continuation.observationDigest = receipt.completionRecordDigest;
  receipt.continuation.terminalRunId = "502";
  f.candidate.ptrExistingUpdateReceiptDigest = updateDigest(receipt);
  expect(
    validateSealedRealmsProductionRecoveryActivationEvidence(f.envelope),
  ).toEqual(f.candidate);
});

it.each(["attempt", "reconciliation-run"])(
  "refuses impossible completed continuation %s",
  (kind) => {
    const f = ptrV3ActivationFixture(),
      receipt = f.receipts.ptrExistingUpdateReceipt;
    if (kind === "attempt") {
      receipt.submission.runAttempt = 1001;
      receipt.continuation.claimRunAttempt = 1001;
      receipt.continuation.terminalRunAttempt = 1001;
    } else {
      receipt.continuation.outcome = "reconciled-effect-applied";
      receipt.continuation.observationDigest = receipt.completionRecordDigest;
    }
    f.candidate.ptrExistingUpdateReceiptDigest = updateDigest(receipt);
    expect(() =>
      validateSealedRealmsProductionRecoveryActivationEvidence(f.envelope),
    ).toThrow();
  },
);

it("derives real V3 corpus facts and reports the remaining producer inputs without minting a complete candidate", () => {
  const f = corpus(),
    bootstrap = f.receipts.g001PolicyObservationBootstrapReceipt;
  const bytes = readFileSync(
    new URL(
      "../scripts/greater-realm-production-bootstrap.mjs",
      import.meta.url,
    ),
  );
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    bootstrap.bootstrapSha256,
  );
  gitSeam.run.mockImplementation((_executable, argv) => {
    const args = argv.slice(6);
    if (args[0] === "cat-file" && args[2] === bootstrap.bootstrapBlob)
      return Buffer.from(bytes);
    if (args[0] === "ls-tree")
      return Buffer.from(
        `100644 blob ${bootstrap.bootstrapBlob}\tscripts/greater-realm-production-bootstrap.mjs\0`,
      );
    if (args[0] !== "rev-parse") throw Error("Unexpected fixture Git call");
    return Buffer.from(
      args[1] === "--show-toplevel"
        ? `${realpathSync(process.cwd())}\n`
        : args[2] === `${bootstrap.protectedCommit}^{tree}`
          ? `${bootstrap.moduleTreeId}\n`
          : `${bootstrap.protectedCommit}\n`,
    );
  });
  const input = {
    records: f.records,
    privateState: f.privateState,
    authority: f.authority,
  };
  const inspected = inspectSealedRealmsProductionRecoveryCandidate(input);
  expect(inspected.facts).toMatchObject({
    schemaVersion: 3,
    ptrExpectedProgramKeccak256:
      f.receipts.ptrExistingUpdateReceipt.binding.candidateProgram,
    ptrExistingUpdateReceiptDigest: f.candidate.ptrExistingUpdateReceiptDigest,
  });
  expect(inspected.facts).not.toHaveProperty("ptrPublishReceiptDigest");
  expect(inspected.facts).not.toHaveProperty("ptrFreshStatusDigest");
  expect(inspected.missingFields).toEqual([
    "recoveryAuthorizationRequestId",
    "recoveryAuthorizationEpoch",
    "recoveryAuthWorkerVersionId",
    "recoveryAuthWorkerSourceCommit",
    "recoveryAuthWorkerConfigIdentity",
    "recoveryAuthWorkerConfigEpoch",
    "sourceClosureSha256",
    "g001ExpectedProgramKeccak256",
    "authBridgeSourceCommit",
    "admissionRequestSuspensionReceiptDigest",
    "g002ExpectedProgramKeccak256",
    "g002PublicApprovalReceiptId",
    "ptrPublicApprovalReceiptId",
  ]);
  expect(() => readSealedRealmsProductionRecoveryCandidate(input)).toThrow(
    "SEALED_REALMS_RECOVERY_CANDIDATE_INPUTS_MISSING",
  );
});
it("refuses a public PTR program claim inconsistent with the completed update", () => {
  const f = ptrV3ActivationFixture();
  f.candidate.ptrExpectedProgramKeccak256 = "9".repeat(64);
  expect(() =>
    validateSealedRealmsProductionRecoveryActivationEvidence(f.envelope),
  ).toThrow();
});

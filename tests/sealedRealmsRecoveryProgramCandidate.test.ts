// @vitest-environment node
// Real private record/source brands, receipt validation and candidate merge.
// Only native builds, Git/source I/O and unrelated approval lookup are isolated.
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
import { afterEach, expect, it, vi } from "vitest";
import {
  deriveGenesis001RecoveryLaunchEvidence,
  genesis001CensusOpaqueProofDigest,
  genesis001MonitorSuspensionReceiptDigest,
} from "../scripts/genesis001-sealed-launch-adoption.mjs";
import { GENESIS_001_ADMITTED_PLAYER_CENSUS_OPAQUE_PROOF_DOMAIN } from "../scripts/genesis001-admitted-player-census.mjs";
import {
  genesis002PublishReceiptDigest,
  genesis002ProductionImportReceiptDigest,
} from "../scripts/genesis002-activation-receipts.mjs";
import {
  ptrV3ActivationFixture,
  PTR_V3_FIXTURE_TIME,
} from "./fixtures/ptrV3ActivationFixture.js";
import { createSealedRealmsProductionPrivateState } from "../scripts/sealed-realms-production-private-state.mjs";
import { authenticateSealedRealmsProductionSourceAuthority } from "../scripts/sealed-realms-production-source-authority.mjs";
import { createSealedRealmsProductionActivationRecords } from "../scripts/sealed-realms-production-activation-records.mjs";
import { inspectSealedRealmsProductionRecoveryCandidate } from "../scripts/sealed-realms-production-recovery-candidate.mjs";
import {
  createSealedRealmsProductionRecoveryProgramArtifacts as create,
  disposeSealedRealmsProductionRecoveryProgramArtifacts as dispose,
  readSealedRealmsProductionRecoveryProgramArtifacts as read,
} from "../scripts/sealed-realms-production-recovery-program-artifacts.mjs";
const seams = vi.hoisted(() => ({ build: vi.fn(), git: vi.fn() }));
vi.mock("../scripts/local-binding-runtime.mjs", () => ({
  derivePreparedGenesisProgramArtifacts: seams.build,
}));
vi.mock("../scripts/recovery-source-closure.mjs", () => ({
  assertRecoverySourceClosureSnapshot: () => {},
}));
vi.mock(
  "../scripts/sealed-realms-production-recovery-approval-facts.ts",
  () => ({ readSealedRealmsProductionRecoveryApprovalFacts: () => ({}) }),
);
vi.mock("node:child_process", () => ({ execFileSync: seams.git }));
const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixturePolicyBootstrapLink(value: Record<string, any>) {
  const hash = createHash("sha256");
  const fields = [
    ["domain", "warpkeep-production-g001-policy-observation-bootstrap-link-v1"],
    ...[
      "protectedCommit",
      "moduleTreeId",
      "bootstrapBlob",
      "bootstrapSha256",
    ].map((key) => [key, value[key]]),
    ["command", "g001-policy-observe"],
    [
      "launchCleanup",
      `${JSON.stringify(Object.fromEntries(Object.entries(value.launchCleanup).sort(([a], [b]) => a.localeCompare(b))))}\n`,
    ],
    [
      "policyObservationReceipt",
      `${JSON.stringify(value.policyObservationReceipt)}\n`,
    ],
  ];
  for (const [label, value] of fields) {
    for (const text of [label, value]) {
      const bytes = Buffer.from(text);
      const length = Buffer.alloc(8);
      length.writeBigUInt64BE(BigInt(bytes.length));
      hash.update(length).update(bytes);
    }
  }
  return hash.digest("hex");
}
function sourceBoundFixture(sourceCoordinates: {
  commit: string;
  tree: string;
  blob: string;
}) {
  const f = ptrV3ActivationFixture();
  const moduleSha = createHash("sha256")
    .update("synthetic G002 bytes")
    .digest("hex");
  for (const member of [
    "g002PublishReceipt",
    "g002AtlasImportReceipt",
    "g002SealedLiveReceipt",
  ])
    f.receipts[member].moduleSha256 = moduleSha;
  f.candidate.g002ModuleSha256 = moduleSha;
  f.receipts.g002AtlasImportReceipt.importReceiptDigest =
    genesis002ProductionImportReceiptDigest(
      Object.fromEntries(
        Object.entries(f.receipts.g002AtlasImportReceipt).filter(
          ([key]) => key !== "importReceiptDigest",
        ),
      ) as never,
    );
  f.candidate.preparationSourceCommit = sourceCoordinates.commit;
  f.candidate.preparationSourceTree = sourceCoordinates.tree;
  const rewrite = (value: any): void => {
    if (value === null || typeof value !== "object") return;
    for (const [key, member] of Object.entries(value)) {
      if (
        [
          "sourceCommit",
          "moduleSourceCommit",
          "protectedCommit",
          "preparationSourceCommit",
        ].includes(key) &&
        member === "a".repeat(40)
      )
        value[key] = sourceCoordinates.commit;
      else rewrite(member);
    }
  };
  rewrite(f.receipts);
  Object.assign(f.receipts.g001PolicyObservationBootstrapReceipt, {
    moduleTreeId: sourceCoordinates.tree,
    bootstrapBlob: sourceCoordinates.blob,
  });
  f.receipts.g002PublishReceipt.publishReceiptDigest =
    genesis002PublishReceiptDigest(
      Object.fromEntries(
        Object.entries(f.receipts.g002PublishReceipt).filter(
          ([key]) => key !== "publishReceiptDigest",
        ),
      ) as never,
    );
  const hash = (text: string) =>
    createHash("sha256").update(text).digest("hex");
  const hashRecord = (value: unknown) => hash(`${JSON.stringify(value)}\n`);
  const without = (value: Record<string, any>, key: string) =>
    Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
  for (const pass of ["first", "second"]) {
    const proof = f.receipts.g001CensusPrivacySafePrivateReceipt[pass];
    proof.opaqueProofDigest = genesis001CensusOpaqueProofDigest(proof);
    const envelope = f.receipts.g001AdmittedPlayerCensusPrivateReceipt[pass];
    envelope.record.applicant.opaqueProofDigest =
      genesis001CensusOpaqueProofDigest(envelope.record.applicant);
    envelope.record.admitted.opaqueProofDigest = hash(
      GENESIS_001_ADMITTED_PLAYER_CENSUS_OPAQUE_PROOF_DOMAIN +
        `${JSON.stringify(without(envelope.record.admitted, "opaqueProofDigest"))}\n`,
    );
    envelope.recordDigest = hashRecord(envelope.record);
  }
  f.receipts.g001PolicyObservationBootstrapReceipt.policyObservationReceiptLinkSha256 =
    fixturePolicyBootstrapLink(
      f.receipts.g001PolicyObservationBootstrapReceipt,
    );
  const census = f.receipts.g001AdmittedPlayerCensusPrivateReceipt;
  for (const name of ["confirmation", "consumed"]) {
    census[name].record.firstDigest = census.first.recordDigest;
    census[name].record.secondDigest = census.second.recordDigest;
  }
  census.confirmation.record.confirmationDigest = hash(
    [
      "warpkeep.sealed-realms.g001-census-confirmation.v1",
      sourceCoordinates.commit,
      census.first.recordDigest,
      census.second.recordDigest,
      census.confirmation.record.expiresAt,
    ].join("\n"),
  );
  census.consumed.record.confirmationDigest =
    census.confirmation.record.confirmationDigest;
  for (const name of ["confirmation", "consumed"])
    census[name].recordDigest = hashRecord(census[name].record);
  f.receipts.g001AdmissionMonitorSuspensionReceipt.receiptSha256 =
    genesis001MonitorSuspensionReceiptDigest(
      f.receipts.g001AdmissionMonitorSuspensionReceipt.receipt,
    );
  const suspension = f.receipts.g001AdmissionMonitorSuspensionReceipt;
  suspension.receiptBasename = `genesis001-admission-monitor-suspended-${suspension.receipt.suspendedAt.replace(/[-:.]/g, "")}-${suspension.receiptSha256.slice(0, 12)}.json`;
  deriveGenesis001RecoveryLaunchEvidence({
    preparationSourceCommit: sourceCoordinates.commit,
    policyObservationBootstrapReceipt:
      f.receipts.g001PolicyObservationBootstrapReceipt,
    censusPrivacySafePrivateReceipt:
      f.receipts.g001CensusPrivacySafePrivateReceipt,
    admissionMonitorSuspensionReceipt:
      f.receipts.g001AdmissionMonitorSuspensionReceipt,
    admissionMonitorCurrentStateReceipt:
      f.receipts.g001AdmissionMonitorCurrentStateReceipt,
    admittedPlayerCensusPrivateReceipt:
      f.receipts.g001AdmittedPlayerCensusPrivateReceipt,
  });
  return f;
}
function corpus(
  mutate: ((receipt: Record<string, any>) => void) | undefined,
  sourceCoordinates: { commit: string; tree: string; blob: string },
) {
  const f = sourceBoundFixture(sourceCoordinates);
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
    home,
    privateState,
    authority,
    records: createSealedRealmsProductionActivationRecords({
      privateState,
      authority,
    }),
  };
}

it("joins native producer retention to genuine V3 corpus and removes exactly the two program gaps", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(PTR_V3_FIXTURE_TIME));
  const coords = {
    commit: "a".repeat(40),
    tree: "b".repeat(40),
    blob: "c".repeat(40),
  };
  const f = corpus(undefined, coords);
  const body = readFileSync(
    new URL(
      "../scripts/greater-realm-production-bootstrap.mjs",
      import.meta.url,
    ),
  );
  seams.git.mockImplementation((_bin, argv, options) => {
    const args = argv.slice(6);
    const output =
      args[0] === "cat-file"
        ? body
        : args[0] === "ls-tree"
          ? Buffer.from(
              `100644 blob ${coords.blob}\tscripts/greater-realm-production-bootstrap.mjs\0`,
            )
          : Buffer.from(
              args[1] === "--show-toplevel"
                ? `${realpathSync(process.cwd())}\n`
                : args[2] === `${coords.commit}^{tree}`
                  ? `${coords.tree}\n`
                  : `${coords.commit}\n`,
            );
    return options.encoding === "utf8"
      ? output.toString()
      : Buffer.from(output);
  });
  const artifact = (realm: string) => {
    const bytes = Buffer.from(
      realm === "genesis001"
        ? "synthetic frozen bytes"
        : "synthetic G002 bytes",
    );
    return {
      profile: "warpkeep-local-program-artifact-v1",
      realm,
      sourceCommit: coords.commit,
      sourceTree: coords.tree,
      moduleSourceCommit:
        realm === "genesis001"
          ? "2ae51984e1fa6ce5b0028c1a250359fed79d819b"
          : coords.commit,
      moduleTreeId:
        realm === "genesis001"
          ? "90deebb5faf4129282f5c35999244f540001b27d"
          : f.receipts.g002PublishReceipt.moduleTreeId,
      dependencyClosureDigest:
        f.receipts.g002PublishReceipt.dependencyClosureDigest,
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
    sourceCommit: coords.commit,
    sourceTree: coords.tree,
    genesis001: artifact("genesis001"),
    genesis002: artifact("genesis002"),
  };
  seams.build.mockResolvedValue(result);
  const options = {
    records: f.records,
    privateState: f.privateState,
    authority: f.authority,
  };
  const prior = inspectSealedRealmsProductionRecoveryCandidate(options);
  const programArtifacts = await create({
    privateState: f.privateState,
    authority: f.authority,
  });
  try {
    const joined = inspectSealedRealmsProductionRecoveryCandidate({
      ...options,
      programArtifacts,
    });
    expect(prior.missingFields).toEqual(
      expect.arrayContaining([
        "g001ExpectedProgramKeccak256",
        "g002ExpectedProgramKeccak256",
      ]),
    );
    expect(joined.missingFields).toEqual(
      prior.missingFields.filter(
        (x) =>
          ![
            "g001ExpectedProgramKeccak256",
            "g002ExpectedProgramKeccak256",
          ].includes(x),
      ),
    );
    expect(joined.facts).toMatchObject({
      g001ExpectedProgramKeccak256: "1".repeat(64),
      g002ExpectedProgramKeccak256: "2".repeat(64),
      g001FreezePublishReceiptDigest: null,
    });
    expect(() =>
      read({ ...options, capability: programArtifacts, records: {} as never }),
    ).toThrow();
    const saved = result.genesis002.dependencyClosureDigest;
    result.genesis002.dependencyClosureDigest = "9".repeat(64);
    const mismatched = await create({
      privateState: f.privateState,
      authority: f.authority,
    });
    try {
      expect(() => read({ ...options, capability: mismatched })).toThrow();
    } finally {
      dispose(mismatched);
      result.genesis002.dependencyClosureDigest = saved;
    }
  } finally {
    dispose(programArtifacts);
  }
}, 30000);

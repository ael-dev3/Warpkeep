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
    home,
    privateState,
    authority,
    records: createSealedRealmsProductionActivationRecords({
      privateState,
      authority,
    }),
  };
}

import { recoveryActivationBridge } from "./fixtures/recoveryActivationBridge";
import { readSealedRealmsProductionRecoveryBridgeFacts } from "../scripts/sealed-realms-production-auth-bridge-state.mjs";
function sourceFixture(f: ReturnType<typeof corpus>) {
  const bootstrap = f.receipts.g001PolicyObservationBootstrapReceipt;
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
}
it("joins genuine bridge evidence to the actual corpus and leaves exactly nine producer inputs missing", async () => {
  const f = corpus();
  sourceFixture(f);
  const input = {
    records: f.records,
    privateState: f.privateState,
    authority: f.authority,
  };
  expect(
    inspectSealedRealmsProductionRecoveryCandidate(input).missingFields,
  ).toHaveLength(13);
  const { bridge } = await recoveryActivationBridge(f.privateState, f.home, {
    g002AtlasImportReceipt: f.receipts.g002AtlasImportReceipt,
    ptrAtlasImportReceipt: f.receipts.ptrAtlasImportReceipt,
    ptrOwnerProvisionReceipt: f.receipts.ptrOwnerProvisionReceipt,
    ptrPublishReceipt: {
      databaseIdentity:
        f.receipts.ptrExistingUpdateReceipt.binding.databaseIdentity,
    },
  });
  await bridge.inspectActivationEvidenceForContinuation();
  const bridgeFacts = readSealedRealmsProductionRecoveryBridgeFacts({
    bridgeState: bridge,
    privateState: f.privateState,
    authority: f.authority,
  });
  const joined = { ...input, bridgeState: bridge };
  const inspection = inspectSealedRealmsProductionRecoveryCandidate(joined);
  expect(inspection.facts).toMatchObject(bridgeFacts);
  expect(inspection.missingFields).toEqual([
    "recoveryAuthorizationRequestId",
    "recoveryAuthorizationEpoch",
    "recoveryAuthWorkerConfigIdentity",
    "recoveryAuthWorkerConfigEpoch",
    "sourceClosureSha256",
    "g001ExpectedProgramKeccak256",
    "g002ExpectedProgramKeccak256",
    "g002PublicApprovalReceiptId",
    "ptrPublicApprovalReceiptId",
  ]);
  expect(() => readSealedRealmsProductionRecoveryCandidate(joined)).toThrow(
    "SEALED_REALMS_RECOVERY_CANDIDATE_INPUTS_MISSING",
  );
  expect(() =>
    inspectSealedRealmsProductionRecoveryCandidate({
      ...joined,
      bridgeState: { ...bridge },
    }),
  ).toThrow();
});
import { validateRecoveryLaunchActivationProjection } from "../scripts/generate-0.4.0-recovery-launch-activation.mjs";
it.each(["g002", "ptr"] as const)(
  "final generator refuses %s bridge history mismatch even after receipt digest is recomputed",
  (lane) => {
    const f = ptrV3ActivationFixture(),
      c = f.candidate;
    const bridge = {
      sourceCommit: c.preparationSourceCommit,
      deploymentAuthority: {
        sourceCommit: c.preparationSourceCommit,
        bridgeSourceCommit: c.preparationSourceCommit,
        workerVersionId: c.recoveryAuthWorkerVersionId,
        ptrDatabaseIdentity: c.ptrDatabaseIdentity,
        ptrBindingDigest: createHash("sha256")
          .update("warpkeep.auth-bridge.ptr-binding.v1\n")
          .update(
            `${JSON.stringify([c.recoveryAuthWorkerVersionId, c.preparationSourceCommit, c.ptrDatabaseIdentity, "warpkeep-ptr-spacetimedb"])}\n`,
          )
          .digest("hex"),
      },
      g002ImportAuthorityCrossLink: {
        realmImportReceiptDigest: c.g002AtlasImportReceiptDigest,
      },
      ptrImportAuthorityCrossLink: {
        realmImportReceiptDigest: c.ptrAtlasImportReceiptDigest,
      },
      activationGate: { observedAt: PTR_V3_FIXTURE_TIME },
    };
    const rehash = () => {
      c.admissionRequestSuspensionReceiptDigest = createHash("sha256")
        .update(
          "warpkeep.sealed-realms.auth-bridge-suspension-private-receipt.v1\n",
        )
        .update(`${JSON.stringify(bridge)}\n`)
        .digest("hex");
    };
    rehash();
    expect(
      validateRecoveryLaunchActivationProjection(
        f.envelope,
        bridge,
        PTR_V3_FIXTURE_TIME,
      ).schemaVersion,
    ).toBe(3);
    bridge[`${lane}ImportAuthorityCrossLink`].realmImportReceiptDigest =
      "e".repeat(64);
    rehash();
    expect(
      validateSealedRealmsProductionRecoveryActivationEvidence(
        f.envelope,
        PTR_V3_FIXTURE_TIME,
      ),
    ).toEqual(c);
    expect(() =>
      validateRecoveryLaunchActivationProjection(
        f.envelope,
        bridge,
        PTR_V3_FIXTURE_TIME,
      ),
    ).toThrow();
  },
);

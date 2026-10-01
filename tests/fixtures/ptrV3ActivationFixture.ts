// Synthetic data only; receipt parsing does not mint private producer authority.
import original from "./ptrV3ActivationCorpus.json" with { type: "json" };
import { createHash } from "node:crypto";
import { RECOVERY_BINDING_KEYS_V3 } from "../../scripts/recovery-binding-projection.mjs";
import { genesis001PolicyObservationBootstrapReceiptDigest } from "../../scripts/genesis001-sealed-launch-adoption.mjs";
import {
  ptrProductionAtlasImportReceiptDigest,
  ptrOwnerProvisionReceiptDigest,
  ptrSealedLiveReceiptDigest,
} from "../../scripts/generate-0.4.0-sealed-launch-activation.mjs";
import { updateDigest } from "../../scripts/sealed-realms-existing-update-protocol.mjs";
export const PTR_V3_FIXTURE_TIME = "2026-08-28T12:02:00.000Z";
export const PTR_V3_ENVELOPE_PROFILE =
  "warpkeep-0.4.0-recovery-activation-evidence-ptr-update-v1";
const digestBody = (value: Record<string, any>, omitted: string) =>
  Object.fromEntries(Object.entries(value).filter(([key]) => key !== omitted));
export function ptrV3ActivationFixture(
  options: { bootstrapBytes?: Uint8Array } = {},
) {
  const source = structuredClone(original) as {
    receipts: Record<string, any>;
    candidate: Record<string, any>;
  };
  const receipts = source.receipts,
    old = receipts.ptrPublishReceipt;
  const { bootstrapBytes } = options;
  if (bootstrapBytes !== undefined) {
    // Current-source producer cases opt in; the historical corpus stays intact.
    const bootstrap = receipts.g001PolicyObservationBootstrapReceipt;
    bootstrap.bootstrapBlob = createHash("sha1")
      .update(`blob ${bootstrapBytes.byteLength}\0`)
      .update(bootstrapBytes)
      .digest("hex");
    bootstrap.bootstrapSha256 = createHash("sha256")
      .update(bootstrapBytes)
      .digest("hex");
    // Synthetic construction uses the producer's length-framed link ABI;
    // the adoption validator independently checks the resulting receipt.
    const link = createHash("sha256");
    const fields = [
      ["domain", "warpkeep-production-g001-policy-observation-bootstrap-link-v1"],
      ...[
        "protectedCommit",
        "moduleTreeId",
        "bootstrapBlob",
        "bootstrapSha256",
      ].map((key) => [key, bootstrap[key]]),
      ["command", "g001-policy-observe"],
      [
        "launchCleanup",
        `${JSON.stringify(Object.fromEntries(Object.entries(bootstrap.launchCleanup).sort(([a], [b]) => a.localeCompare(b))))}\n`,
      ],
      ["policyObservationReceipt", `${JSON.stringify(bootstrap.policyObservationReceipt)}\n`],
    ];
    for (const [label, value] of fields) {
      for (const text of [label, value]) {
        const bytes = Buffer.from(text);
        const length = Buffer.alloc(8);
        length.writeBigUInt64BE(BigInt(bytes.length));
        link.update(length).update(bytes);
      }
    }
    bootstrap.policyObservationReceiptLinkSha256 = link.digest("hex");
    source.candidate.g001PolicyObservationBootstrapReceiptDigest =
      genesis001PolicyObservationBootstrapReceiptDigest(bootstrap);
  }
  const target =
    "c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e";
  for (const member of [
    "ptrAtlasImportReceipt",
    "ptrOwnerProvisionReceipt",
    "ptrSealedLiveReceipt",
  ])
    receipts[member].databaseIdentity = target;
  receipts.ptrAtlasImportReceipt.importReceiptDigest =
    ptrProductionAtlasImportReceiptDigest(
      digestBody(
        receipts.ptrAtlasImportReceipt,
        "importReceiptDigest",
      ) as never,
    );
  receipts.ptrOwnerProvisionReceipt.atlasImportReceiptDigest =
    receipts.ptrAtlasImportReceipt.importReceiptDigest;
  receipts.ptrOwnerProvisionReceipt.provisionReceiptDigest =
    ptrOwnerProvisionReceiptDigest(
      digestBody(
        receipts.ptrOwnerProvisionReceipt,
        "provisionReceiptDigest",
      ) as never,
    );
  const completion = {
    schemaVersion: 1,
    profile: "warpkeep-ptr-existing-update-receipt-v1",
    binding: {
      sourceCommit: old.sourceCommit,
      databaseIdentity: target,
      candidateProgram: "1".repeat(64),
      candidateSha256: old.moduleSha256,
      candidateDescriptionDigest: "2".repeat(64),
      moduleTreeId: old.moduleTreeId,
      dependencyClosureDigest: old.dependencyClosureDigest,
      cliDigest: old.spacetimeExecutableSha256,
      cliConfigDigest: old.spacetimeCliConfigSha256,
    },
    inspectionDigest: "3".repeat(64),
    inspectionRecordDigest: "4".repeat(64),
    submissionRecordDigest: "5".repeat(64),
    acknowledgementRecordDigest: "6".repeat(64),
    completionRecordDigest: "7".repeat(64),
    predecessorDigest: null,
    predecessorReceiptDigest: null,
    beforeProgram: "8".repeat(64),
    preservation: {
      addedTables: [],
      candidateDigest: "2".repeat(64),
      candidatePreservationDigest: "a".repeat(64),
      classification: "tables-preserved",
      priorDigest: "9".repeat(64),
      priorPreservationDigest: "a".repeat(64),
      profile: "warpkeep-ptr-raw-v10-stable-row-schema-v1",
    },
    planDigest: "b".repeat(64),
    installedPlanDigest: "c".repeat(64),
    inspectionHostObservationDigest: "d".repeat(64),
    acknowledgement: "received",
    responseDigest: "e".repeat(64),
    submission: {
      observedAt: "2026-08-28T12:00:00.000Z",
      runAttempt: 1,
      runId: "501",
    },
    completionObservedAt: "2026-08-28T12:00:30.000Z",
    continuation: {
      scopeDigest: "f".repeat(64),
      issuedRecordDigest: "1".repeat(64),
      claimRecordDigest: "2".repeat(64),
      terminalRecordDigest: "3".repeat(64),
      claimRunId: "501",
      claimRunAttempt: 1,
      terminalRunId: "501",
      terminalRunAttempt: 1,
      outcome: "completed",
      observationDigest: null,
      terminalAt: "2026-08-28T12:00:31.000Z",
    },
  };
  // Preserve member order: update evidence occupies the prior publication slot.
  const members = Object.fromEntries(
    Object.entries(receipts)
      .filter(([key]) => key !== "g001FreezePublishReceipt")
      .map(([key, value]) =>
        key === "ptrPublishReceipt"
          ? ["ptrExistingUpdateReceipt", completion]
          : [key, value],
      ),
  );
  const values = {
    ...source.candidate,
    schemaVersion: 3,
    profile: "warpkeep-0.4.0-sealed-launch-ptr-update-v3",
    ptrDatabaseIdentity: target,
    ptrExistingUpdateReceiptDigest: updateDigest(completion),
    ptrExpectedProgramKeccak256: completion.binding.candidateProgram,
    ptrExistingUpdateReceiptCommitment: null,
    ptrAtlasImportReceiptDigest:
      receipts.ptrAtlasImportReceipt.importReceiptDigest,
    ptrOwnerProvisionReceiptDigest:
      receipts.ptrOwnerProvisionReceipt.provisionReceiptDigest,
    ptrSealedLiveReceiptDigest: ptrSealedLiveReceiptDigest(
      receipts.ptrSealedLiveReceipt as never,
    ),
  } as Record<string, any>;
  const candidate = Object.fromEntries(
    RECOVERY_BINDING_KEYS_V3.map((key) => [key, values[key]]),
  );
  return {
    receipts: members,
    candidate,
    envelope: {
      schemaVersion: 3,
      profile: PTR_V3_ENVELOPE_PROFILE,
      bindingCandidate: candidate,
      ...members,
    },
  };
}

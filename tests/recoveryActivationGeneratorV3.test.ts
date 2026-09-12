import { linuxG001PolicyReceipt } from './fixtures/linuxG001PolicyReceipt';
import { genesis001PolicyObservationBootstrapReceiptDigest } from '../scripts/genesis001-sealed-launch-adoption.mjs';
// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { createSealedRealmsProductionAuthBridgeStateTestCapability } from "../scripts/sealed-realms-production-auth-bridge-state.mjs";
import { recoveryOperationAuthority } from "./fixtures/recoveryActivationBridge.js";
import {
  createRecoveryLaunchActivationBindingFromEvidence,
  validateRecoveryLaunchActivationProjection,
} from "../scripts/generate-0.4.0-recovery-launch-activation.mjs";
import { ptrV3ActivationFixture } from "./fixtures/ptrV3ActivationFixture.js";
import { parseRecoveryBindingV3 } from "../scripts/recovery-activation-candidate.mjs";
import { validateSealedRealmsProductionRecoveryActivationEvidence } from "../scripts/sealed-realms-production-activation-records.mjs";
import { createRecoveryActivationBinding } from "../scripts/recovery-activation-candidate.mjs";

const NOW = "2026-08-28T12:02:00.000Z";
function fixture(version = 2) {
  const {
    receipts,
    candidate,
    envelope: v3Envelope,
  } = version === 3
    ? ptrV3ActivationFixture()
    : JSON.parse(
        readFileSync(
          new URL("./fixtures/ptrV3ActivationCorpus.json", import.meta.url),
          "utf8",
        ),
      );
  const bridge = {
    sourceCommit: candidate.preparationSourceCommit,
    deploymentAuthority: {
      sourceCommit: candidate.preparationSourceCommit,
      bridgeSourceCommit: candidate.preparationSourceCommit,
      workerVersionId: candidate.recoveryAuthWorkerVersionId,
      ptrDatabaseIdentity: candidate.ptrDatabaseIdentity,
      ptrBindingDigest: createHash("sha256")
        .update("warpkeep.auth-bridge.ptr-binding.v1\n")
        .update(
          `${JSON.stringify([candidate.recoveryAuthWorkerVersionId, candidate.preparationSourceCommit, candidate.ptrDatabaseIdentity, "warpkeep-ptr-spacetimedb"])}\n`,
        )
        .digest("hex"),
    },
    g002ImportAuthorityCrossLink: {
      realmImportReceiptDigest: candidate.g002AtlasImportReceiptDigest,
    },
    ptrImportAuthorityCrossLink: {
      realmImportReceiptDigest: candidate.ptrAtlasImportReceiptDigest,
    },
    activationGate: { observedAt: NOW },
  };
  candidate.admissionRequestSuspensionReceiptDigest = createHash("sha256")
    .update(
      "warpkeep.sealed-realms.auth-bridge-suspension-private-receipt.v1\n",
    )
    .update(`${JSON.stringify(bridge)}\n`)
    .digest("hex");
  delete receipts.g001FreezePublishReceipt;
  return {
    envelope: v3Envelope ?? {
      schemaVersion: 2,
      profile: "warpkeep-0.4.0-recovery-activation-evidence-v1",
      bindingCandidate: candidate,
      ...receipts,
    },
    bridge,
  };
}
it("preserves exact V2 binding bytes after real corpus and bridge validation", () => {
  const { envelope, bridge } = fixture();
  expect(
    JSON.stringify(
      validateRecoveryLaunchActivationProjection(envelope, bridge, NOW),
    ),
  ).toBe(
    JSON.stringify(
      createRecoveryActivationBinding(
        `${JSON.stringify(envelope.bindingCandidate, null, 2)}\n`,
      ),
    ),
  );
});

it.each(["source", "import", "time"] as const)(
  "refuses a substituted bridge %s even with a self-consistent candidate digest",
  (changed) => {
    const { envelope, bridge } = fixture();
    if (changed === "source") bridge.sourceCommit = "f".repeat(40);
    if (changed === "import")
      bridge.ptrImportAuthorityCrossLink.realmImportReceiptDigest = "f".repeat(
        64,
      );
    if (changed === "time")
      bridge.activationGate.observedAt = "2026-08-28T00:00:00.000Z";
    envelope.bindingCandidate.admissionRequestSuspensionReceiptDigest =
      createHash("sha256")
        .update(
          "warpkeep.sealed-realms.auth-bridge-suspension-private-receipt.v1\n",
        )
        .update(`${JSON.stringify(bridge)}\n`)
        .digest("hex");
    expect(() =>
      validateRecoveryLaunchActivationProjection(envelope, bridge, NOW),
    ).toThrow();
  },
);

it("generates exact V3 public binding from a validated completed-update envelope", () => {
  const { envelope, bridge } = fixture(3);
  // This assertion distinguishes parser readiness from the generator's version dispatch.
  expect(
    validateSealedRealmsProductionRecoveryActivationEvidence(envelope, NOW)
      .schemaVersion,
  ).toBe(3);
  const result = validateRecoveryLaunchActivationProjection(
    envelope,
    bridge,
    NOW,
  );
  expect(result.schemaVersion).toBe(3);
  expect(result.profile).toBe("warpkeep-0.4.0-sealed-launch-ptr-update-v3");
  expect(result.ptrExistingUpdateReceiptDigest).toBe(
    envelope.bindingCandidate.ptrExistingUpdateReceiptDigest,
  );
  expect(result.ptrExistingUpdateReceiptCommitment).toMatch(/^[a-f0-9]{64}$/);
  expect(
    parseRecoveryBindingV3(`${JSON.stringify(result, null, 2)}\n`),
  ).toEqual(result);
  expect(result).not.toHaveProperty("ptrPublishReceiptDigest");
  expect(result).not.toHaveProperty("ptrFreshStatusDigest");
  expect(result).not.toHaveProperty("ptrExistingUpdateReceipt");
});
it.each(["profile", "receipt", "legacy-field", "bridge-import"] as const)(
  "refuses V3 %s substitution without minting a binding",
  (changed) => {
    const { envelope, bridge } = fixture(3);
    if (changed === "profile")
      envelope.profile = "warpkeep-0.4.0-recovery-activation-evidence-v1";
    if (changed === "receipt")
      envelope.ptrExistingUpdateReceipt.completionRecordDigest = "0".repeat(64);
    if (changed === "legacy-field")
      envelope.bindingCandidate.ptrPublishReceiptDigest = "0".repeat(64);
    if (changed === "bridge-import")
      bridge.ptrImportAuthorityCrossLink.realmImportReceiptDigest = "0".repeat(
        64,
      );
    expect(() =>
      validateRecoveryLaunchActivationProjection(envelope, bridge, NOW),
    ).toThrow();
  },
);

it("does not turn valid V3 envelope data into generator authority", () => {
  const { envelope } = fixture(3);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  try {
    const bootstrap = envelope.g001PolicyObservationBootstrapReceipt;
    expect(() =>
      createRecoveryLaunchActivationBindingFromEvidence(
        envelope,
        {} as never,
        recoveryOperationAuthority("activation-evidence-generate"),
        {
          capability:
            createSealedRealmsProductionAuthBridgeStateTestCapability(),
          facts: {
            preparationSourceCommit:
              envelope.bindingCandidate.preparationSourceCommit,
            moduleTreeId: bootstrap.moduleTreeId,
            bootstrapBlob: bootstrap.bootstrapBlob,
            bootstrapSha256: bootstrap.bootstrapSha256,
          },
        },
      ),
    ).toThrow("SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_MEMBER_INVALID");
  } finally {
    vi.useRealTimers();
  }
});

it('projects Linux policy evidence and binds its own immutable operator coordinates', () => {
  const { envelope } = fixture(3);
  const receipt = linuxG001PolicyReceipt(envelope.g001PolicyObservationBootstrapReceipt.policyObservationReceipt);
  envelope.g001PolicyObservationBootstrapReceipt = receipt;
  envelope.bindingCandidate.g001PolicyObservationBootstrapReceiptDigest = genesis001PolicyObservationBootstrapReceiptDigest(receipt);
  envelope.bindingCandidate.preparationSourceTree = receipt.moduleTreeId;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(NOW));
  try {
    expect(validateSealedRealmsProductionRecoveryActivationEvidence(envelope).g001PolicyReceiptDigest).toBe(receipt.policyObservationReceipt.policyReceiptDigest);
    const authority = recoveryOperationAuthority('activation-evidence-generate');
    const facts = { preparationSourceCommit: receipt.protectedCommit, moduleTreeId: receipt.moduleTreeId, operatorBlob: receipt.operatorBlob, operatorSha256: receipt.operatorSha256 };
    const capability = createSealedRealmsProductionAuthBridgeStateTestCapability();
    expect(() => createRecoveryLaunchActivationBindingFromEvidence(envelope, {} as never, authority, { capability, facts })).toThrow('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_MEMBER_INVALID');
    expect(() => createRecoveryLaunchActivationBindingFromEvidence(envelope, {} as never, authority, { capability, facts: { ...facts, operatorBlob: '0'.repeat(40) } })).toThrow('RECOVERY_LAUNCH_ACTIVATION_SOURCE_INVALID');
  } finally { vi.useRealTimers(); }
});

import { sealedRealmsPrivateBase } from './helpers/sealedRealmsPrivateRoots';
import * as bridgeModule from "../scripts/sealed-realms-production-auth-bridge-state.mjs";
// @vitest-environment node

import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";

import { canonicalAuthBridgeNotificationPreparedReceiptPublication } from "../scripts/auth-bridge-notification-prepared-receipt.mjs";
import { createSealedRealmsProductionPrivateState } from "../scripts/sealed-realms-production-private-state.mjs";
import {
  claimSealedRealmsProductionContinuation,
  createSealedRealmsProductionContinuationStore,
  issueSealedRealmsProductionContinuation,
} from "../scripts/sealed-realms-production-continuation.mjs";

import { authenticateSealedRealmsProductionSourceAuthority } from "../scripts/sealed-realms-production-source-authority.mjs";
import { issueSealedRealmsProductionWorkflowPermit } from "../scripts/sealed-realms-production-workflow-authority.mjs";

import {
  createSealedRealmsProductionAuthBridgeStateTestCapability,
  createSealedRealmsProductionAuthBridgeState,
} from "../scripts/sealed-realms-production-auth-bridge-state.mjs";

const BODY = JSON.stringify({
  error: {
    code: "admission_requests_suspended",
    message: "New admission requests are temporarily suspended.",
  },
});
const SOURCE = "a".repeat(40);
const NOW = new Date("2026-08-30T00:00:00.000Z");
const VERSION_ID = "123e4567-e89b-42d3-a456-426614174000";
const DEPLOYMENT_ID = "223e4567-e89b-42d3-a456-426614174000";

function operationAuthority(operation: string, sourceCommit = SOURCE) {
  return authenticateSealedRealmsProductionSourceAuthority({
    operation: operation as never,
    workflowInputSha: sourceCommit,
    readGit: (args) =>
      args[0] === "rev-parse"
        ? `${sourceCommit}\n`
        : (() => {
            throw new Error("unexpected git call");
          })(),
    readBinding: () => ({
      schemaVersion: 1,
      profile: "warpkeep-0.4.0-sealed-launch-v1",
      pagesDeploymentApproved: false,
      preparationSourceCommit: null,
    }),
    verifyEvidence: (verifiedSha: string) => ({ verifiedSha }),
  });
}

function workflowResponse(url: string, body: unknown) {
  const encoded = JSON.stringify(body);
  const response = new Response(encoded, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(encoded)),
    },
  });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

function workflowGithub(
  sourceCommit: string,
  runId: string,
  completedRunIds: ReadonlySet<string> = new Set(),
) {
  return vi.fn(async (request: string | URL | Request) => {
    const url = String(request);
    if (url.endsWith("/branches/main")) {
      return workflowResponse(url, {
        name: "main",
        protected: true,
        commit: { sha: sourceCommit },
      });
    }
    const requestedRunId =
      /\/actions\/runs\/([1-9][0-9]*)$/u.exec(url)?.[1] ?? runId;
    const completed = completedRunIds.has(requestedRunId);
    return workflowResponse(url, {
      id: Number(requestedRunId),
      run_attempt: 1,
      event: "workflow_dispatch",
      status: completed ? "completed" : "in_progress",
      conclusion: completed ? "failure" : null,
      head_branch: "main",
      head_sha: sourceCommit,
      path: ".github/workflows/sealed-realms-production.yml",
      repository: { full_name: "ael-dev3/Warpkeep" },
    });
  });
}

let protectedRunSequence = 100000;
const protectedSetupRuns = new Map<
  string,
  Promise<
    Readonly<{
      authority: ReturnType<typeof operationAuthority>;
      permit: Awaited<
        ReturnType<typeof issueSealedRealmsProductionWorkflowPermit>
      >;
      runId: string;
      runAttempt: "1";
    }>
  >
>();

function nextProtectedRunId() {
  protectedRunSequence += 1;
  return String(protectedRunSequence);
}

async function protectedSetupContext(
  local: ReturnType<typeof fixture>,
  operation: string,
) {
  let pending = protectedSetupRuns.get(operation);
  if (pending === undefined) {
    const runId = nextProtectedRunId();
    const authority = operationAuthority(operation);
    pending = issueSealedRealmsProductionWorkflowPermit({
      sourceAuthority: authority,
      githubToken: "github-sealed-realms-owner-token",
      runId,
      runAttempt: "1",
      fetchImpl: workflowGithub(SOURCE, runId),
    }).then((permit) =>
      Object.freeze({
        authority,
        permit,
        runId,
        runAttempt: "1" as const,
      }),
    );
    protectedSetupRuns.set(operation, pending);
  }
  const run = await pending;
  return Object.freeze({
    authority: run.authority,
    continuation: Object.freeze({
      permit: run.permit,
      store: createSealedRealmsProductionContinuationStore({
        privateState: local.state,
      }),
      runId: run.runId,
      runAttempt: run.runAttempt,
      sourceAuthority: run.authority,
    }),
  });
}

async function applyGateThroughContinuation(
  local: ReturnType<typeof fixture>,
  bridge: ReturnType<typeof createSealedRealmsProductionAuthBridgeState>,
  lane: "g002" | "ptr",
  apply: () => unknown | Promise<unknown>,
) {
  const kind = `${lane}-import` as const;
  const inspectOperation = `${lane}-import-inspect`;
  const applyOperation = `${lane}-import-apply`;
  const binding = await bridge.inspectGateForContinuation({ lane });
  const issued = await protectedSetupContext(local, inspectOperation);
  await issueSealedRealmsProductionContinuation({
    store: issued.continuation.store,
    permit: issued.continuation.permit,
    sourceAuthority: issued.authority,
    kind,
    runId: issued.continuation.runId,
    runAttempt: issued.continuation.runAttempt,
    ...binding,
  });
  const claimed = await protectedSetupContext(local, applyOperation);
  return claimSealedRealmsProductionContinuation({
    store: claimed.continuation.store,
    permit: claimed.continuation.permit,
    sourceAuthority: claimed.authority,
    kind,
    runId: claimed.continuation.runId,
    runAttempt: claimed.continuation.runAttempt,
    ...binding,
    effect: (claim) =>
      bridge.applyGateForContinuation({
        claim,
        store: claimed.continuation.store,
        sourceAuthority: claimed.authority,
        kind,
        runId: claimed.continuation.runId,
        runAttempt: claimed.continuation.runAttempt,
        ...binding,
        lane,
        apply,
      }),
  });
}

function suspendedResponse(headers: Record<string, string> = {}) {
  return new Response(BODY, {
    status: 503,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "https://warpkeep.com",
      ...headers,
    },
  });
}

function fixture() {
  const home = mkdtempSync(join(tmpdir(), "warpkeep-auth-bridge-chain-"));
  for (const root of [
    join(sealedRealmsPrivateBase(home),
      "audit",
      "private",
    ),
    join(sealedRealmsPrivateBase(home),
      "runtime",
    ),
    join(sealedRealmsPrivateBase(home),
      "cache",
    ),
  ]) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
  }
  const receipt = {
    schemaVersion: 1,
    kind: "warpkeep-auth-bridge-notification-prepared-v1",
    bridgeOrigin: "https://auth.warpkeep.com",
    bridgeSourceCommit: SOURCE,
    notificationDeliveryContractDigest:
      "13429727ea5257946e3b659e07f912cf8cd81985fadecb03c63311994a01f7d9",
    notificationClientCount: 1,
    notificationDeliveryEnabled: true,
    notificationTransportConfigured: true,
    admissionNotificationStoreConfigured: true,
    publicAuthEnabledBefore: true,
    publicAuthEnabledAfter: true,
    accessExpectedFidRequiredBefore: false,
    accessExpectedFidRequiredAfter: false,
    hermesExecutionApproved: false,
    pagesPresentationEnabled: false,
    liveAttestationDigest: "b".repeat(64),
    preparedAt: "2026-08-29T23:00:00.000Z",
    expiresAt: "2026-08-30T12:00:00.000Z",
  } as const;
  const publication =
    canonicalAuthBridgeNotificationPreparedReceiptPublication(receipt);
  const authority = authenticateSealedRealmsProductionSourceAuthority({
    operation: "g002-import-inspect",
    workflowInputSha: SOURCE,
    readGit: (args) => {
      if (args[0] === "rev-parse") return `${SOURCE}\n`;
      throw new Error("unexpected git call");
    },
    readBinding: () => ({
      schemaVersion: 1,
      profile: "warpkeep-0.4.0-sealed-launch-v1",
      pagesDeploymentApproved: false,
      preparationSourceCommit: null,
    }),
    verifyEvidence: (verifiedSha) => ({ verifiedSha }),
  });
  let byte = 0;
  return {
    state: createSealedRealmsProductionPrivateState({
      reportedHome: home,
      testOnlyOwnerUid: statSync(home).uid,
      testOnlyFsync: () => {},
      testOnlyAllowPlatformMode: true,
    }),
    authority,
    receipt,
    publication,
    home,
    randomBytesImpl: () => Buffer.alloc(32, ++byte),
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  };
}

function importProof(
  lane: "g002" | "ptr",
  disposition: "adopted" | "no-effect",
) {
  return disposition === "adopted"
    ? {
        disposition,
        sourceCommit: SOURCE,
        deploymentId: DEPLOYMENT_ID,
        workerVersionId: VERSION_ID,
        ptrDatabaseIdentity: "f".repeat(64),
        ptrBindingDigest: "1".repeat(64),
        receiptDigest: lane === "g002" ? "4".repeat(64) : "5".repeat(64),
      }
    : {
        disposition,
        sourceCommit: SOURCE,
        deploymentId: DEPLOYMENT_ID,
        workerVersionId: VERSION_ID,
        ptrDatabaseIdentity: "f".repeat(64),
        ptrBindingDigest: "1".repeat(64),
        noEffectDigest: lane === "g002" ? "6".repeat(64) : "7".repeat(64),
      };
}

function ownerProvisionProof() {
  return {
    sourceCommit: SOURCE,
    deploymentId: DEPLOYMENT_ID,
    workerVersionId: VERSION_ID,
    ptrDatabaseIdentity: "f".repeat(64),
    ptrBindingDigest: "1".repeat(64),
    receiptDigest: "5".repeat(64),
    provisionReceiptDigest: "9".repeat(64),
  };
}

function bridgeOptions(
  local: ReturnType<typeof fixture>,
  overrides: Record<string, unknown> = {},
) {
  return {
    authority: local.authority,
    privateState: local.state,
    repositoryRoot: process.cwd(),
    reportedHome: local.home,
    deploymentAttester: () => ({
      deploymentId: DEPLOYMENT_ID,
      workerVersionId: VERSION_ID,
      bridgeSourceCommit: SOURCE,
      controlPlaneAttestationDigest: "c".repeat(64),
      publicAttestationDigest: "d".repeat(64),
      privateAttestationDigest: "e".repeat(64),
      observedAt: NOW.toISOString(),
    }),
    bindingAttester: () => ({
      ptrDatabaseIdentity: "f".repeat(64),
      ptrBindingDigest: "1".repeat(64),
      ptrBindingAttestationDigest: "2".repeat(64),
      observedAt: NOW.toISOString(),
    }),
    fetchImpl: async () => suspendedResponse(),
    now: () => new Date(NOW),
    randomBytesImpl: local.randomBytesImpl,
    inspectImportReceipt: ({ lane }: { lane: "g002" | "ptr" }) =>
      importProof(lane, "no-effect"),
    authenticateImportResult: ({ lane }: { lane: "g002" | "ptr" }) =>
      importProof(lane, "adopted"),
    resolveOwnerProvisionReceipt: () => ownerProvisionProof(),
    testOnlyCapability:
      createSealedRealmsProductionAuthBridgeStateTestCapability(),
    testOnlyResolvePreparedReceipt: () => ({
      receipt: local.receipt,
      receiptDigest: local.publication.receiptDigest,
    }),
    testOnlyResolveCompletedJournal: () => ({
      journalHeadDigest: "3".repeat(64),
      profile: "warpkeep-auth-bridge-notification-prepared-deploy-journal-v3",
      outcome: "verified",
      predecessorDigest: null,
      runId: "42",
      runAttempt: 1,
      completedAt: NOW.toISOString(),
      sourceCommit: SOURCE,
      workerVersionId: VERSION_ID,
    }),
    ...overrides,
  };
}

async function completeBridge(
  local: ReturnType<typeof fixture>,
  fetchImpl = async () => suspendedResponse(),
  overrides: Record<string, unknown> = {},
) {
  const bridge = createSealedRealmsProductionAuthBridgeState(
    bridgeOptions(local, {
      fetchImpl,
      inspectImportReceipt: ({ lane }: { lane: "g002" | "ptr" }) =>
        importProof(lane, "no-effect"),
      ...overrides,
    }) as never,
  );
  await applyGateThroughContinuation(local, bridge, "g002", () => undefined);
  await applyGateThroughContinuation(local, bridge, "ptr", () => undefined);
  return bridge;
}

const readFacts = (
  bridgeState: unknown,
  privateState: unknown,
  authority = operationAuthority("activation-evidence-generate"),
) =>
  (bridgeModule as any).readSealedRealmsProductionRecoveryBridgeFacts({
    bridgeState,
    privateState,
    authority,
  });
it("refuses a forged bridge capability", () => {
  expect(() => readFacts({}, {})).toThrow(
    "SEALED_REALMS_AUTH_BRIDGE_STATE_CAPABILITY_INVALID",
  );
});
it("reads only owned completed suspension facts synchronously and reopens changed state", async () => {
  const local = fixture(),
    foreign = fixture();
  try {
    const bridge = await completeBridge(local);
    expect(() => readFacts(bridge, local.state)).toThrow();
    const binding = await bridge.inspectActivationEvidenceForContinuation();
    const expected = {
      recoveryAuthWorkerVersionId: VERSION_ID,
      recoveryAuthWorkerSourceCommit: SOURCE,
      authBridgeSourceCommit: SOURCE,
      admissionRequestSuspensionReceiptDigest: binding.evidenceDigest,
    };
    expect(readFacts(bridge, local.state)).toEqual(expected);
    expect(Object.isFrozen(readFacts(bridge, local.state))).toBe(true);
    expect(() => readFacts(bridge, foreign.state)).toThrow();
    expect(() =>
      readFacts(
        bridge,
        local.state,
        operationAuthority("activation-evidence-inspect"),
      ),
    ).toThrow();
    expect(() =>
      readFacts(
        bridge,
        local.state,
        operationAuthority("activation-evidence-generate", "f".repeat(40)),
      ),
    ).toThrow();
    const reopened = createSealedRealmsProductionAuthBridgeState(
      bridgeOptions(local) as never,
    );
    expect(readFacts(reopened, local.state)).toEqual(expected);
    const name = local.state.list({
      root: "runtime",
      relativeDirectory: "bridge/activation-evidence",
    })[0]!;
    local.state.remove({
      root: "runtime",
      relativePath: `bridge/activation-evidence/${name}`,
    });
    expect(() => readFacts(reopened, local.state)).toThrow();
  } finally {
    local.cleanup();
    foreign.cleanup();
  }
}, 30000);

it.each(["complete"] as Array<"complete" | "ptr">)(
  "accepts validated linked %s recovery and refuses stale predecessor evidence",
  async (predecessorPhase) => {
    const local = fixture();
    const OLD_NOW = new Date("2026-08-30T00:30:00.000Z");
    const RECOVERY_NOW = new Date("2026-08-30T02:00:00.000Z");
    const oldReceipt = {
      ...local.receipt,
      preparedAt: "2026-08-30T00:00:00.000Z",
      expiresAt: "2026-08-30T01:00:00.000Z",
    };
    const oldPublication =
      canonicalAuthBridgeNotificationPreparedReceiptPublication(
        oldReceipt as never,
      );
    const recoveryReceipt = {
      ...local.receipt,
      liveAttestationDigest: "9".repeat(64),
      preparedAt: "2026-08-30T01:30:00.000Z",
      expiresAt: "2026-08-30T05:00:00.000Z",
    };
    const recoveryPublication =
      canonicalAuthBridgeNotificationPreparedReceiptPublication(
        recoveryReceipt as never,
      );
    try {
      const oldOptions = {
        now: () => new Date(OLD_NOW),
        deploymentAttester: () => ({
          deploymentId: DEPLOYMENT_ID,
          workerVersionId: VERSION_ID,
          bridgeSourceCommit: SOURCE,
          controlPlaneAttestationDigest: "c".repeat(64),
          publicAttestationDigest: "d".repeat(64),
          privateAttestationDigest: "e".repeat(64),
          observedAt: OLD_NOW.toISOString(),
        }),
        bindingAttester: () => ({
          ptrDatabaseIdentity: "f".repeat(64),
          ptrBindingDigest: "1".repeat(64),
          ptrBindingAttestationDigest: "2".repeat(64),
          observedAt: OLD_NOW.toISOString(),
        }),
        testOnlyResolvePreparedReceipt: () => ({
          receipt: oldReceipt,
          receiptDigest: oldPublication.receiptDigest,
        }),
      };
      const old =
        predecessorPhase === "complete"
          ? await completeBridge(local, undefined, oldOptions)
          : createSealedRealmsProductionAuthBridgeState(
              bridgeOptions(local, oldOptions) as never,
            );
      if (predecessorPhase === "ptr") {
        await applyGateThroughContinuation(local, old, "g002", () => undefined);
      }
      await expect(old.inspect()).resolves.toEqual(
        predecessorPhase === "complete"
          ? { g002Sealed: true, ptrSealed: true, complete: true }
          : { g002Sealed: true, ptrSealed: false, complete: false },
      );
      await old.inspectActivationEvidenceForContinuation();
      const oldSuspensionName = local.state.list({
        root: "runtime",
        relativeDirectory: "bridge/activation-evidence",
      })[0]!;
      const oldSuspensionPath = `bridge/activation-evidence/${oldSuspensionName}`;
      const oldSuspensionBytes = local.state.read({
        root: "runtime",
        relativePath: oldSuspensionPath,
      });
      local.state.remove({ root: "runtime", relativePath: oldSuspensionPath });
      const oldName = local.state
        .list({ root: "runtime", relativeDirectory: "bridge" })
        .find((name) => name.startsWith("auth-bridge-import-authority-"))!;
      const oldBytes = local.state.read({
        root: "runtime",
        relativePath: `bridge/${oldName}`,
      });
      const recoveryRecord = {
        schemaVersion: 1,
        profile: "warpkeep-sealed-realms-auth-bridge-import-authority-v1",
        recordType: "deploymentAuthority",
        sourceCommit: SOURCE,
        previousRecordDigest: null,
        preparedReceiptBodyBase64: recoveryPublication.receiptBytesBase64,
        preparedReceiptDigest: recoveryPublication.receiptDigest,
        preparedAt: recoveryReceipt.preparedAt,
        expiresAt: recoveryReceipt.expiresAt,
        completedJournalHeadDigest: "8".repeat(64),
        completedJournalProfile:
          "warpkeep-auth-bridge-notification-prepared-read-only-recovery-v1",
        completedJournalOutcome: "verified-read-only-recovery",
        completedJournalPredecessorDigest: "3".repeat(64),
        runId: "42",
        runAttempt: 1,
        completedAt: RECOVERY_NOW.toISOString(),
        deploymentId: DEPLOYMENT_ID,
        workerVersionId: VERSION_ID,
        bridgeSourceCommit: SOURCE,
        ptrDatabaseIdentity: "f".repeat(64),
        ptrBindingDigest: "1".repeat(64),
        controlPlaneAttestationDigest: "c".repeat(64),
        publicAttestationDigest: "d".repeat(64),
        privateAttestationDigest: "e".repeat(64),
        ptrBindingAttestationDigest: "2".repeat(64),
        recordedAt: RECOVERY_NOW.toISOString(),
      };
      const recoveryChainDigest = createHash("sha256")
        .update(
          JSON.stringify([
            "warpkeep-sealed-realms-auth-bridge-import-authority-v1",
            SOURCE,
            recoveryPublication.receiptDigest,
            "8".repeat(64),
            DEPLOYMENT_ID,
            VERSION_ID,
            "1".repeat(64),
          ]),
        )
        .digest("hex");
      const recoveryRelativePath = `bridge/auth-bridge-import-authority-${recoveryChainDigest}.jsonl`;
      const recoveryBytes = Buffer.from(
        `${JSON.stringify(recoveryRecord)}\n`,
        "utf8",
      );
      local.state.write({
        root: "runtime",
        relativePath: recoveryRelativePath,
        bytes: recoveryBytes,
      });
      const recoveryOptions = bridgeOptions(local, {
        now: () => new Date(RECOVERY_NOW),
        deploymentAttester: () => ({
          deploymentId: DEPLOYMENT_ID,
          workerVersionId: VERSION_ID,
          bridgeSourceCommit: SOURCE,
          controlPlaneAttestationDigest: "c".repeat(64),
          publicAttestationDigest: "d".repeat(64),
          privateAttestationDigest: "e".repeat(64),
          observedAt: RECOVERY_NOW.toISOString(),
        }),
        bindingAttester: () => ({
          ptrDatabaseIdentity: "f".repeat(64),
          ptrBindingDigest: "1".repeat(64),
          ptrBindingAttestationDigest: "2".repeat(64),
          observedAt: RECOVERY_NOW.toISOString(),
        }),
        testOnlyResolvePreparedReceipt: () => ({
          receipt: recoveryReceipt,
          receiptDigest: recoveryPublication.receiptDigest,
        }),
        testOnlyResolveCompletedJournal: () => ({
          journalHeadDigest: "8".repeat(64),
          profile:
            "warpkeep-auth-bridge-notification-prepared-read-only-recovery-v1",
          outcome: "verified-read-only-recovery",
          predecessorDigest: "3".repeat(64),
          runId: "42",
          runAttempt: 1,
          completedAt: RECOVERY_NOW.toISOString(),
          sourceCommit: SOURCE,
          workerVersionId: VERSION_ID,
        }),
        inspectImportReceipt: ({ lane }: { lane: "g002" | "ptr" }) =>
          importProof(
            lane,
            predecessorPhase === "complete" || lane === "g002"
              ? "adopted"
              : "no-effect",
          ),
      });
      const recovery = createSealedRealmsProductionAuthBridgeState(
        recoveryOptions as never,
      );
      await expect(recovery.establish()).resolves.toEqual({ ready: true });
      const ptrCore = vi.fn(async () => undefined);
      // The first read persists an owner-private ambiguity fence. A recreated
      // read then adopts the exact immutable receipt without invoking an
      // importer or carrying the discarded process-local confirmation.
      await recovery.inspectGate({ lane: "g002" });
      const afterG002 = createSealedRealmsProductionAuthBridgeState(
        recoveryOptions as never,
      );
      await afterG002.inspectGate({ lane: "g002" });
      if (predecessorPhase === "complete") {
        await afterG002.inspectGate({ lane: "ptr" });
        const afterPtr = createSealedRealmsProductionAuthBridgeState(
          recoveryOptions as never,
        );
        await afterPtr.inspectGate({ lane: "ptr" });
      } else {
        await applyGateThroughContinuation(local, afterG002, "ptr", ptrCore);
      }
      expect(ptrCore).toHaveBeenCalledTimes(
        predecessorPhase === "complete" ? 0 : 1,
      );
      await expect(afterG002.inspect()).resolves.toEqual({
        g002Sealed: true,
        ptrSealed: true,
        complete: true,
      });
      const names = local.state
        .list({ root: "runtime", relativeDirectory: "bridge" })
        .filter((name) => name.startsWith("auth-bridge-import-authority-"));
      expect(names).toHaveLength(2);
      expect(
        local.state.read({
          root: "runtime",
          relativePath: `bridge/${oldName}`,
        }),
      ).toEqual(oldBytes);
      const completedRecoveryBytes = local.state.read({
        root: "runtime",
        relativePath: recoveryRelativePath,
      });
      expect(
        completedRecoveryBytes.subarray(0, recoveryBytes.byteLength),
      ).toEqual(recoveryBytes);
      expect(
        completedRecoveryBytes.toString("utf8").trimEnd().split("\n"),
      ).toHaveLength(5);

      const selection =
        await afterG002.inspectActivationEvidenceForContinuation();
      expect(readFacts(afterG002, local.state)).toEqual({
        recoveryAuthWorkerVersionId: VERSION_ID,
        recoveryAuthWorkerSourceCommit: SOURCE,
        authBridgeSourceCommit: SOURCE,
        admissionRequestSuspensionReceiptDigest: selection.evidenceDigest,
      });
      local.state.remove({
        root: "runtime",
        relativePath: `bridge/${oldName}`,
      });
      expect(() => readFacts(afterG002, local.state)).toThrow(
        "SEALED_REALMS_AUTH_BRIDGE_CHAIN_CONFLICT",
      );
      local.state.write({
        root: "runtime",
        relativePath: `bridge/${oldName}`,
        bytes: oldBytes,
      });
      const newName = local.state.list({
        root: "runtime",
        relativeDirectory: "bridge/activation-evidence",
      })[0]!;
      local.state.remove({
        root: "runtime",
        relativePath: `bridge/activation-evidence/${newName}`,
      });
      local.state.write({
        root: "runtime",
        relativePath: oldSuspensionPath,
        bytes: oldSuspensionBytes,
      });
      expect(() => readFacts(afterG002, local.state)).toThrow(
        "SEALED_REALMS_AUTH_BRIDGE_CHAIN_CONFLICT",
      );
      oldSuspensionBytes.fill(0);
    } finally {
      local.cleanup();
    }
  },
  process.platform === "win32" ? 60000 : 30000,
);

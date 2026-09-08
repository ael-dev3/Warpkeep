// @vitest-environment node
import { expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  bridge: Object.freeze({}),
  state: Object.freeze({}),
  authority: Object.freeze({}),
  records: Object.freeze({}),
  context: Object.freeze({}),
  read: vi.fn(),
  callback: undefined as
    undefined | ((a: string, b: object, c: object) => unknown),
}));
vi.mock("../scripts/sealed-realms-production-source-authority.mjs", () => ({
  authenticateSealedRealmsProductionSourceAuthority: () => f.authority,
}));
vi.mock("../scripts/sealed-realms-production-workflow-evidence.mjs", () => ({
  createSealedRealmsProductionWorkflowEvidence: () => ({}),
  refreshSealedRealmsProductionWorkflowEvidence: vi.fn(),
  revokeSealedRealmsProductionWorkflowEvidence: vi.fn(),
  verifySealedRealmsProductionWorkflowEvidence: vi.fn(),
}));
vi.mock("../scripts/sealed-realms-production-workflow-authority.mjs", () => ({
  issueSealedRealmsProductionWorkflowPermit: () => ({}),
}));
vi.mock(
  "../scripts/sealed-realms-production-workflow-private-state.mjs",
  () => ({ resolveSealedRealmsProductionWorkflowPrivateState: () => f.state }),
);
vi.mock("../scripts/sealed-realms-production-continuation.mjs", () => ({
  createSealedRealmsProductionContinuationStore: () => ({}),
}));
vi.mock("../scripts/sealed-realms-production-auth-bridge-state.mjs", () => ({
  createSealedRealmsProductionAuthBridgeState: () => f.bridge,
  createSealedRealmsProductionActivationEvidenceGenerator: () => {
    f.callback?.("a".repeat(40), {}, f.context);
    return {};
  },
}));
vi.mock("../scripts/sealed-realms-production-activation-records.mjs", () => ({
  createSealedRealmsProductionActivationRecords: (options: {
    readBindingCandidate: typeof f.callback;
  }) => {
    f.callback = options.readBindingCandidate;
    return f.records;
  },
}));
vi.mock("../scripts/sealed-realms-production-recovery-candidate.mjs", () => ({
  readSealedRealmsProductionRecoveryCandidate: f.read,
}));
vi.mock(
  "../scripts/sealed-realms-production-activation-lane-entry.mjs",
  () => ({
    createSealedRealmsProductionActivationDispatchContext: () => ({}),
    createSealedRealmsProductionActivationLane: () => ({}),
    createSealedRealmsProductionActivationDispatcher: () => ({}),
  }),
);
import { createSealedRealmsProductionActivationWorkflowRuntime } from "../scripts/sealed-realms-production-activation-workflow-entry.mjs";
it("passes the constructed runtime bridge into the real candidate callback with its owner and read context", async () => {
  await createSealedRealmsProductionActivationWorkflowRuntime({
    operation: "activation-evidence-generate",
    workflowInputSha: "a".repeat(40),
  });
  expect(f.read).toHaveBeenCalledExactlyOnceWith({
    records: f.records,
    privateState: f.state,
    authority: f.authority,
    bridgeState: f.bridge,
    readContext: f.context,
  });
});

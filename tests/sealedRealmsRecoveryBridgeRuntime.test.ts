// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  sourceClosure: Object.freeze({}),
  preparation: Object.freeze({}),
  prepare: vi.fn(),
  disposePreparation: vi.fn(),
  dispose: vi.fn(),
  revoke: vi.fn(),
  dispatch: vi.fn(),
  failStage: "",
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
  refreshSealedRealmsProductionWorkflowEvidence: () => {
    if (f.failStage === "refresh") throw Error("fixture refresh failure");
  },
  revokeSealedRealmsProductionWorkflowEvidence: f.revoke,
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
    if (f.failStage === "generator") throw Error("fixture failure");
    f.callback?.("a".repeat(40), {}, f.context);
    return {};
  },
}));
vi.mock("../scripts/sealed-realms-production-activation-records.mjs", () => ({
  createSealedRealmsProductionActivationRecords: (options: {
    readBindingCandidate: typeof f.callback;
  }) => {
    if (f.failStage === "records") throw Error("fixture failure");
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
    createSealedRealmsProductionActivationDispatchContext: () => {
      if (f.failStage === "context") throw Error("fixture failure");
      return {};
    },
    createSealedRealmsProductionActivationLane: () => {
      if (f.failStage === "lane") throw Error("fixture failure");
      return {};
    },
    createSealedRealmsProductionActivationDispatcher: () => ({
      dispatch: f.dispatch,
    }),
  }),
);
vi.mock(
  "../scripts/sealed-realms-production-recovery-source-closure.mjs",
  () => ({
    createSealedRealmsProductionRecoverySourceClosure: async () =>
      f.sourceClosure,
    disposeSealedRealmsProductionRecoverySourceClosure: f.dispose,
  }),
);
beforeEach(() => {
  vi.clearAllMocks();
  f.failStage = "";
  f.dispatch.mockReset();
  f.prepare.mockResolvedValue(f.preparation);
});
vi.mock('../scripts/sealed-realms-production-recovery-preparation.mjs', () => ({
  createSealedRealmsProductionRecoveryPreparation: f.prepare,
  disposeSealedRealmsProductionRecoveryPreparation: f.disposePreparation,
}));
import {
  createSealedRealmsProductionActivationWorkflowRuntime,
  runSealedRealmsProductionActivationOperation,
} from "../scripts/sealed-realms-production-activation-workflow-entry.mjs";
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
    sourceClosure: f.sourceClosure,
    preparation: f.preparation,
    readContext: f.context,
  });
  expect(f.prepare).toHaveBeenCalledExactlyOnceWith({ privateState: f.state, authority: f.authority });
});

it.each(["records", "generator", "lane", "context"])(
  "disposes created closure when %s construction fails",
  async (stage) => {
    f.failStage = stage;
    await expect(
      createSealedRealmsProductionActivationWorkflowRuntime({
        operation: "activation-evidence-generate",
        workflowInputSha: "a".repeat(40),
      }),
    ).rejects.toThrow("fixture failure");
    expect(f.dispose).toHaveBeenCalledExactlyOnceWith(f.sourceClosure);
    expect(f.disposePreparation).toHaveBeenCalledExactlyOnceWith(f.preparation);
    expect(f.revoke).toHaveBeenCalledOnce();
  },
);
it.each([false, true])(
  "disposes closure after consumed dispatcher error=%s",
  async (failed) => {
    const runtime = await createSealedRealmsProductionActivationWorkflowRuntime(
      {
        operation: "activation-evidence-generate",
        workflowInputSha: "a".repeat(40),
      },
    );
    if (failed) f.dispatch.mockRejectedValueOnce(Error("dispatch failure"));
    const operation = runSealedRealmsProductionActivationOperation({
      runtime,
      operation: "activation-evidence-generate",
      workflowInputSha: "a".repeat(40),
    });
    if (failed) await expect(operation).rejects.toThrow("dispatch failure");
    else await operation;
    expect(f.dispose).toHaveBeenCalledExactlyOnceWith(f.sourceClosure);
    expect(f.disposePreparation).toHaveBeenCalledExactlyOnceWith(f.preparation);
    expect(f.revoke).toHaveBeenCalledOnce();
  },
);

it("disposes closure when evidence refresh fails before dispatch", async () => {
  const runtime = await createSealedRealmsProductionActivationWorkflowRuntime({
    operation: "activation-evidence-generate",
    workflowInputSha: "a".repeat(40),
  });
  f.failStage = "refresh";
  await expect(
    runSealedRealmsProductionActivationOperation({
      runtime,
      operation: "activation-evidence-generate",
      workflowInputSha: "a".repeat(40),
    }),
  ).rejects.toThrow("fixture refresh failure");
  expect(f.dispatch).not.toHaveBeenCalled();
  expect(f.dispose).toHaveBeenCalledExactlyOnceWith(f.sourceClosure);
  expect(f.disposePreparation).toHaveBeenCalledExactlyOnceWith(f.preparation);
  expect(f.revoke).toHaveBeenCalledOnce();
});
it('disposes the existing closure and revokes evidence when preparation authentication fails', async () => {
  f.prepare.mockRejectedValueOnce(Error('preparation failure'));
  await expect(createSealedRealmsProductionActivationWorkflowRuntime({ operation: 'activation-evidence-generate', workflowInputSha: 'a'.repeat(40) })).rejects.toThrow('preparation failure');
  expect(f.dispose).toHaveBeenCalledExactlyOnceWith(f.sourceClosure);
  expect(f.disposePreparation).not.toHaveBeenCalled();
  expect(f.revoke).toHaveBeenCalledOnce();
});

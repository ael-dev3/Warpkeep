// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  programArtifacts: Object.freeze({}),
  programs: vi.fn(),
  disposePrograms: vi.fn(),
  sourceClosure: Object.freeze({}),
  preparation: Object.freeze({}),
  prepare: vi.fn(),
  disposePreparation: vi.fn(),
  dispose: vi.fn(),
  revoke: vi.fn(),
  dispatch: vi.fn(),
  failStage: "",
  provider: Object.freeze({}),
  createProvider: vi.fn(),
  createBridge: vi.fn(),
  bridge: Object.freeze({}),
  state: Object.freeze({ list: vi.fn() }),
  authority: Object.freeze({}),
  updateAuthority: Object.freeze({}),
  createAuthority: vi.fn(),
  store: Object.freeze({}),
  adoption: Object.freeze({}),
  authenticateAdoption: vi.fn(),
  authenticationRecords: Object.freeze({}),
  createRecords: vi.fn(),
  createGenerator: vi.fn(),
  records: Object.freeze({}),
  context: Object.freeze({}),
  read: vi.fn(),
  callback: undefined as
    undefined | ((a: string, b: object, c: object) => unknown),
}));
vi.mock("../scripts/sealed-realms-production-source-authority.mjs", () => ({
  authenticateSealedRealmsProductionSourceAuthority: f.createAuthority,
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
  createSealedRealmsProductionContinuationStore: () => f.store,
}));
// This suite exercises runtime ownership and cleanup. Provider authentication
// uses its own real-provider contracts, not this suite's opaque authority stubs.
vi.mock("../scripts/sealed-realms-production-bridge-provider.mjs", () => ({
  createSealedRealmsProductionBridgeProvider: f.createProvider,
}));
vi.mock("../scripts/sealed-realms-production-auth-bridge-state.mjs", () => ({
  createSealedRealmsProductionAuthBridgeState: f.createBridge,
  createSealedRealmsProductionActivationEvidenceGenerator: f.createGenerator,
}));
vi.mock("../scripts/sealed-realms-production-activation-records.mjs", () => ({
  createSealedRealmsProductionActivationRecords: f.createRecords,
  authenticateSealedRealmsProductionPtrExistingStateAdoption: f.authenticateAdoption,
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
  f.callback = undefined;
  f.state.list.mockReset().mockReturnValue([]);
  f.createAuthority.mockReset().mockImplementation((input: { operation: string }) =>
    input.operation === "ptr-update-apply" ? f.updateAuthority : f.authority);
  f.authenticateAdoption.mockReset().mockResolvedValue(f.adoption);
  f.createRecords.mockReset().mockImplementation((options: { readBindingCandidate?: typeof f.callback }) => {
    if (f.failStage === "records") throw Error("fixture failure");
    f.callback = options.readBindingCandidate;
    return options.readBindingCandidate === undefined ? f.authenticationRecords : f.records;
  });
  f.createGenerator.mockReset().mockImplementation(() => {
    if (f.failStage === "generator") throw Error("fixture failure");
    f.callback?.("a".repeat(40), {}, f.context);
    return {};
  });
  f.createProvider.mockReset().mockReturnValue(f.provider);
  f.createBridge.mockReset().mockReturnValue(f.bridge);
  f.dispatch.mockReset();
  f.prepare.mockResolvedValue(f.preparation);
  f.programs.mockReset().mockResolvedValue(f.programArtifacts);
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
  expect(f.createProvider).toHaveBeenCalledExactlyOnceWith({
    authority: f.authority,
    privateState: f.state,
    repositoryRoot: process.cwd(),
    fetchImpl: globalThis.fetch,
  });
  expect(f.createBridge).toHaveBeenCalledExactlyOnceWith({
    authority: f.authority,
    privateState: f.state,
    repositoryRoot: process.cwd(),
    bridgeProvider: f.provider,
    fetchImpl: globalThis.fetch,
    inspectImportReceipt: expect.any(Function),
    authenticateImportResult: expect.any(Function),
    resolveOwnerProvisionReceipt: expect.any(Function),
  });
  expect(f.read).toHaveBeenCalledExactlyOnceWith({
    records: f.records,
    privateState: f.state,
    authority: f.authority,
    bridgeState: f.bridge,
    sourceClosure: f.sourceClosure,
    programArtifacts: f.programArtifacts,
    preparation: f.preparation,
    readContext: f.context,
  });
  expect(f.programs.mock.invocationCallOrder[0]).toBeLessThan(f.prepare.mock.invocationCallOrder[0]);
  expect(f.prepare).toHaveBeenCalledExactlyOnceWith({ privateState: f.state, authority: f.authority });
});

it("revokes evidence without preparing resources when provider authentication fails", async () => {
  f.createProvider.mockImplementationOnce(() => { throw Error("provider failure"); });
  await expect(createSealedRealmsProductionActivationWorkflowRuntime({
    operation: "activation-evidence-generate",
    workflowInputSha: "a".repeat(40),
  })).rejects.toThrow("provider failure");
  expect(f.createBridge).not.toHaveBeenCalled();
  expect(f.programs).not.toHaveBeenCalled();
  expect(f.prepare).not.toHaveBeenCalled();
  expect(f.dispose).not.toHaveBeenCalled();
  expect(f.disposePrograms).not.toHaveBeenCalled();
  expect(f.disposePreparation).not.toHaveBeenCalled();
  expect(f.revoke).toHaveBeenCalledOnce();
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
    expect(f.dispose).toHaveBeenCalledExactlyOnceWith(f.sourceClosure); expect(f.disposePrograms).toHaveBeenCalledExactlyOnceWith(f.programArtifacts);
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
    expect(f.dispose).toHaveBeenCalledExactlyOnceWith(f.sourceClosure); expect(f.disposePrograms).toHaveBeenCalledExactlyOnceWith(f.programArtifacts);
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
  expect(f.dispose).toHaveBeenCalledExactlyOnceWith(f.sourceClosure); expect(f.disposePrograms).toHaveBeenCalledExactlyOnceWith(f.programArtifacts);
  expect(f.disposePreparation).toHaveBeenCalledExactlyOnceWith(f.preparation);
  expect(f.revoke).toHaveBeenCalledOnce();
});
it('disposes the existing closure and revokes evidence when preparation authentication fails', async () => {
  f.prepare.mockRejectedValueOnce(Error('preparation failure'));
  await expect(createSealedRealmsProductionActivationWorkflowRuntime({ operation: 'activation-evidence-generate', workflowInputSha: 'a'.repeat(40) })).rejects.toThrow('preparation failure');
  expect(f.dispose).toHaveBeenCalledExactlyOnceWith(f.sourceClosure); expect(f.disposePrograms).toHaveBeenCalledExactlyOnceWith(f.programArtifacts);
  expect(f.disposePreparation).not.toHaveBeenCalled();
  expect(f.revoke).toHaveBeenCalledOnce();
});
vi.mock('../scripts/sealed-realms-production-recovery-program-artifacts.mjs', () => ({
  createSealedRealmsProductionRecoveryProgramArtifacts: f.programs,
  disposeSealedRealmsProductionRecoveryProgramArtifacts: f.disposePrograms,
}));
it('builds fixed programs before acquiring expiring preparation and stops before preparation on build failure', async () => {
  f.programs.mockRejectedValueOnce(Error('program failure'));
  await expect(createSealedRealmsProductionActivationWorkflowRuntime({ operation: 'activation-evidence-generate', workflowInputSha: 'a'.repeat(40) })).rejects.toThrow('program failure');
  expect(f.prepare).not.toHaveBeenCalled();
  expect(f.disposePrograms).not.toHaveBeenCalled();
  expect(f.revoke).toHaveBeenCalledOnce();
});


it.each(["activation-evidence-inspect", "activation-evidence-generate"] as const)(
  "authenticates retained V4 before constructing the %s bridge and forwards the owned capability",
  async operation => {
    f.state.list.mockReturnValue(["ptr-existing-state-adoptions-v4"]);
    let finish!: (capability: object) => void;
    f.authenticateAdoption.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = createSealedRealmsProductionActivationWorkflowRuntime({ operation, workflowInputSha: "a".repeat(40) });
    await vi.waitFor(() => expect(f.authenticateAdoption).toHaveBeenCalledOnce());
    expect(f.state.list).toHaveBeenCalledExactlyOnceWith({ root: "runtime" });
    expect(f.createAuthority).toHaveBeenNthCalledWith(2, expect.objectContaining({
      operation: "ptr-update-apply", workflowInputSha: "a".repeat(40),
    }));
    expect(f.authenticateAdoption).toHaveBeenCalledExactlyOnceWith({
      records: f.authenticationRecords, authority: f.updateAuthority, store: f.store,
    });
    expect(f.createRecords).toHaveBeenCalledExactlyOnceWith({ privateState: f.state, authority: f.authority });
    expect(f.createProvider).not.toHaveBeenCalled();
    expect(f.createBridge).not.toHaveBeenCalled();
    expect(f.programs).not.toHaveBeenCalled();
    expect(f.prepare).not.toHaveBeenCalled();
    finish(f.adoption);
    const runtime = await pending;
    expect(f.createBridge).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      authority: f.authority, privateState: f.state, existingStateAdoption: f.adoption,
    }));
    if (operation === "activation-evidence-generate") {
      expect(f.createRecords).toHaveBeenLastCalledWith({ privateState: f.state, authority: f.authority,
        readBindingCandidate: expect.any(Function), existingStateAdoption: f.adoption });
      expect(f.createGenerator).toHaveBeenCalledExactlyOnceWith({ records: f.records,
        privateState: f.state, authority: f.authority, existingStateAdoption: f.adoption });
    } else {
      expect(f.createRecords).toHaveBeenCalledOnce();
      expect(f.createGenerator).not.toHaveBeenCalled();
      expect(f.programs).not.toHaveBeenCalled();
      expect(f.prepare).not.toHaveBeenCalled();
    }
    await runSealedRealmsProductionActivationOperation({ runtime, operation, workflowInputSha: "a".repeat(40) });
  },
);

it.each(["discovery", "authentication"])("refuses failed V4 %s before provider access or preparation", async stage => {
  if (stage === "discovery") f.state.list.mockImplementation(() => { throw Error("private discovery failure"); });
  else {
    f.state.list.mockReturnValue(["ptr-existing-state-adoptions-v4"]);
    f.authenticateAdoption.mockRejectedValue(Error("private authentication failure"));
  }
  await expect(createSealedRealmsProductionActivationWorkflowRuntime({
    operation: "activation-evidence-generate", workflowInputSha: "a".repeat(40),
  })).rejects.toThrow(`private ${stage} failure`);
  expect(f.createProvider).not.toHaveBeenCalled();
  expect(f.createBridge).not.toHaveBeenCalled();
  expect(f.programs).not.toHaveBeenCalled();
  expect(f.prepare).not.toHaveBeenCalled();
  expect(f.createGenerator).not.toHaveBeenCalled();
  expect(f.revoke).toHaveBeenCalledOnce();
});

it("keeps legacy inspection unchanged when the exact adoption directory is absent", async () => {
  f.state.list.mockReturnValue(["existing-updates-production-v1", "ptr-update-observation-v4"]);
  const operation = "activation-evidence-inspect";
  const runtime = await createSealedRealmsProductionActivationWorkflowRuntime({ operation, workflowInputSha: "a".repeat(40) });
  expect(f.authenticateAdoption).not.toHaveBeenCalled();
  expect(f.createAuthority).toHaveBeenCalledOnce();
  expect(f.createRecords).not.toHaveBeenCalled();
  expect(f.createGenerator).not.toHaveBeenCalled();
  expect(f.createBridge.mock.calls[0][0]).not.toHaveProperty("existingStateAdoption");
  await runSealedRealmsProductionActivationOperation({ runtime, operation, workflowInputSha: "a".repeat(40) });
});

// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  programArtifacts: Object.freeze({}),
  programs: vi.fn(),
  refresh: vi.fn(),
  retained: Object.freeze({}),
  retain: vi.fn(),
  refreshRetained: vi.fn(),
  join: vi.fn(),
  joined: Object.freeze({}),
  censusPrepare: vi.fn(),
  censusExecute: vi.fn(),
  censusDispose: vi.fn(),
  censusHandle: Object.freeze({}),
  censusEvidence: Object.freeze({}),
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
  g002UpdateAuthority: Object.freeze({}),
  createAuthority: vi.fn(),
  store: Object.freeze({}),
  adoption: Object.freeze({}),
  authenticateAdoption: vi.fn(),
  g002Adoption: Object.freeze({}),
  authenticateG002Adoption: vi.fn(),
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
  authenticateSealedRealmsProductionRetainedSource: () => ({}),
}));
vi.mock('node:child_process', () => ({ execFileSync: () => 'b'.repeat(40) + '\n' }));
vi.mock('../scripts/sealed-realms-production-retained-fixture-source.mjs', () => ({ readSealedRealmsProductionRetainedFixtureSources: vi.fn() }));
vi.mock('../scripts/ptr-production-existing-update-adapter.mjs', () => ({
  readPtrRetainedUpdateSourceCommit: () => 'e'.repeat(40), readG002RetainedUpdateSourceCommit: () => 'e'.repeat(40),
}));
vi.mock('../scripts/genesis001-linux-policy-native.mjs', () => ({
  prepareFixedLinuxG001CensusObservation: f.censusPrepare,
  executeFixedLinuxG001ActivationCensusObservation: f.censusExecute,
  disposeFixedLinuxG001PolicyObservation: f.censusDispose,
}));
vi.mock("../scripts/sealed-realms-production-workflow-evidence.mjs", () => ({
  createSealedRealmsProductionWorkflowEvidence: () => ({}),
  refreshSealedRealmsProductionWorkflowEvidence: f.refresh,
  createSealedRealmsProductionActivationRetainedEvidence: f.retain,
  refreshSealedRealmsProductionRetainedEvidence: f.refreshRetained,
  verifySealedRealmsProductionRetainedEvidence: vi.fn(),
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
  authenticateSealedRealmsProductionG002ExistingStateAdoption: f.authenticateG002Adoption,
  authenticateSealedRealmsProductionPtrHistoricalAdoption: f.authenticateAdoption,
  authenticateSealedRealmsProductionG002HistoricalAdoption: f.authenticateG002Adoption,
  authenticateSealedRealmsProductionLinuxRecoveryEvidence: f.join,
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
    input.operation === "ptr-update-apply" ? f.updateAuthority
      : input.operation === "g002-update-apply" ? f.g002UpdateAuthority : f.authority);
  f.authenticateAdoption.mockReset().mockResolvedValue(f.adoption);
  f.authenticateG002Adoption.mockReset().mockResolvedValue(f.g002Adoption);
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
  f.refresh.mockReset().mockImplementation(() => { if (f.failStage === 'refresh') throw Error('fixture refresh failure'); });
  f.retain.mockReset().mockResolvedValue(f.retained);
  f.refreshRetained.mockReset().mockResolvedValue(undefined);
  f.join.mockReset().mockResolvedValue(f.joined);
  f.censusPrepare.mockReset().mockResolvedValue(f.censusHandle);
  f.censusExecute.mockReset().mockResolvedValue(f.censusEvidence);
});
afterEach(() => vi.unstubAllEnvs());
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
  createSealedRealmsProductionRecoveryAdoptionProgramArtifacts: f.programs,
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


it.each(["activation-evidence-inspect", "activation-evidence-generate"] as const)(
  "authenticates both retained realms before constructing the %s provider", async operation => {
    f.state.list.mockReturnValue(["ptr-existing-state-adoptions-v4", "g002-existing-state-adoptions-v1"]);
    let finish!: (capability: object) => void;
    f.authenticateG002Adoption.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = createSealedRealmsProductionActivationWorkflowRuntime({ operation, workflowInputSha: "a".repeat(40) });
    await vi.waitFor(() => expect(f.authenticateG002Adoption).toHaveBeenCalledOnce());
    expect(f.authenticateAdoption).toHaveBeenCalledOnce();
    expect(f.authenticateG002Adoption).toHaveBeenCalledExactlyOnceWith({
      records: f.authenticationRecords, authority: f.g002UpdateAuthority, store: f.store,
    });
    expect(f.createAuthority).toHaveBeenLastCalledWith(expect.objectContaining({ operation: "g002-update-apply" }));
    expect(f.createProvider).not.toHaveBeenCalled();
    expect(f.createBridge).not.toHaveBeenCalled();
    expect(f.programs).not.toHaveBeenCalled();
    expect(f.prepare).not.toHaveBeenCalled();
    finish(f.g002Adoption);
    const runtime = await pending;
    const adoptions = { existingStateAdoption: f.adoption, g002ExistingStateAdoption: f.g002Adoption };
    expect(f.createBridge).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(adoptions));
    if (operation === "activation-evidence-generate") {
      expect(f.createRecords).toHaveBeenLastCalledWith({ privateState: f.state, authority: f.authority,
        readBindingCandidate: expect.any(Function), ...adoptions });
      expect(f.createGenerator).toHaveBeenCalledExactlyOnceWith({ records: f.records,
        privateState: f.state, authority: f.authority, ...adoptions });
    }
    await runSealedRealmsProductionActivationOperation({ runtime, operation, workflowInputSha: "a".repeat(40) });
  },
);

it.each(["missing PTR", "G002 authentication"])("refuses %s before bridge access", async stage => {
  f.state.list.mockReturnValue(stage === "missing PTR" ? ["g002-existing-state-adoptions-v1"]
    : ["ptr-existing-state-adoptions-v4", "g002-existing-state-adoptions-v1"]);
  f.authenticateG002Adoption.mockRejectedValue(Error("G002 authentication failure"));
  await expect(createSealedRealmsProductionActivationWorkflowRuntime({
    operation: "activation-evidence-generate", workflowInputSha: "a".repeat(40),
  })).rejects.toThrow(stage === "missing PTR" ? "SEALED_REALMS_ACTIVATION_WORKFLOW_ADOPTION_INVALID" : "G002 authentication failure");
  expect(f.createProvider).not.toHaveBeenCalled();
  expect(f.createBridge).not.toHaveBeenCalled();
  expect(f.programs).not.toHaveBeenCalled();
  expect(f.prepare).not.toHaveBeenCalled();
  expect(f.createGenerator).not.toHaveBeenCalled();
  expect(f.revoke).toHaveBeenCalledOnce();
});

it.each([undefined, ''])('keeps omitted/empty census input on the unchanged legacy inspection path (%s)', async selected => {
  vi.stubEnv('WARPKEEP_G001_CENSUS_ATTEMPT', selected);
  const runtime = await createSealedRealmsProductionActivationWorkflowRuntime({ operation: 'activation-evidence-inspect', workflowInputSha: 'a'.repeat(40) });
  expect(f.censusPrepare).not.toHaveBeenCalled(); expect(f.join).not.toHaveBeenCalled(); expect(f.retain).not.toHaveBeenCalled();
  await runSealedRealmsProductionActivationOperation({ runtime, operation: 'activation-evidence-inspect', workflowInputSha: 'a'.repeat(40) });
});
it('captures credentials in their owners, builds first, collects inline, then refreshes proofs and requests short-lived preparation', async () => {
  vi.stubEnv('WARPKEEP_G001_CENSUS_ATTEMPT', 'inline');
  vi.stubEnv('WARPKEEP_PRODUCTION_ADMIN_TOKEN', 'synthetic-never-sent-admin-token-123456789');
  f.state.list.mockReturnValue(['ptr-existing-state-adoptions-v4', 'g002-existing-state-adoptions-v1']);
  f.createProvider.mockImplementationOnce(() => { delete process.env.WARPKEEP_PRODUCTION_ADMIN_TOKEN; return f.provider; });
  f.programs.mockImplementationOnce(async () => {
    expect(process.env.WARPKEEP_PRODUCTION_ADMIN_TOKEN).toBeUndefined();
    expect(f.censusExecute).not.toHaveBeenCalled(); return f.programArtifacts;
  });
  const operation = 'activation-evidence-generate';
  const runtime = await createSealedRealmsProductionActivationWorkflowRuntime({ operation, workflowInputSha: 'a'.repeat(40) });
  expect(f.censusPrepare).toHaveBeenCalledExactlyOnceWith('synthetic-never-sent-admin-token-123456789');
  const order = (mock: { mock: { invocationCallOrder: number[] } }) => mock.mock.invocationCallOrder[0];
  expect(order(f.createProvider)).toBeLessThan(order(f.censusPrepare));
  expect(order(f.programs)).toBeLessThan(order(f.refresh));
  expect(order(f.refresh)).toBeLessThan(order(f.retain));
  expect(order(f.authenticateG002Adoption)).toBeLessThan(order(f.censusExecute));
  expect(order(f.censusExecute)).toBeLessThan(order(f.refreshRetained));
  expect(order(f.join)).toBeLessThan(order(f.prepare));
  expect(f.join).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ censusEvidence: f.censusEvidence,
    programArtifacts: f.programArtifacts, authority: f.authority }));
  expect(f.join.mock.calls[0][0]).not.toHaveProperty('attemptId');
  expect(f.createBridge).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ bridgeProvider: f.provider, linuxRecoveryEvidence: f.joined }));
  await runSealedRealmsProductionActivationOperation({ runtime, operation, workflowInputSha: 'a'.repeat(40) });
  expect(f.censusDispose).toHaveBeenCalledExactlyOnceWith(f.censusHandle);
  expect(f.refreshRetained).toHaveBeenCalledTimes(3);
});
it('cleans an owned inline preparation if a later build fails and never dispatches', async () => {
  vi.stubEnv('WARPKEEP_G001_CENSUS_ATTEMPT', 'inline');
  f.state.list.mockReturnValue(['ptr-existing-state-adoptions-v4', 'g002-existing-state-adoptions-v1']);
  f.programs.mockRejectedValueOnce(Error('native build failed'));
  await expect(createSealedRealmsProductionActivationWorkflowRuntime({ operation: 'activation-evidence-generate', workflowInputSha: 'a'.repeat(40) })).rejects.toThrow('native build failed');
  expect(f.censusDispose).toHaveBeenCalledExactlyOnceWith(f.censusHandle);
  expect(f.censusExecute).not.toHaveBeenCalled(); expect(f.dispatch).not.toHaveBeenCalled(); expect(f.revoke).toHaveBeenCalledOnce();
});
it('does not fall back from a malformed explicit census selection', async () => {
  vi.stubEnv('WARPKEEP_G001_CENSUS_ATTEMPT', 'latest');
  f.state.list.mockReturnValue(['ptr-existing-state-adoptions-v4', 'g002-existing-state-adoptions-v1']);
  await expect(createSealedRealmsProductionActivationWorkflowRuntime({ operation: 'activation-evidence-inspect', workflowInputSha: 'a'.repeat(40) })).rejects.toThrow('ADOPTION_INVALID');
  expect(f.programs).not.toHaveBeenCalled(); expect(f.createProvider).not.toHaveBeenCalled(); expect(f.authenticateAdoption).not.toHaveBeenCalled();
});

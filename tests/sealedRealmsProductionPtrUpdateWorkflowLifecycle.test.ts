// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  attest: vi.fn(),
  completion: vi.fn(),
  records: vi.fn(),
  writeRecord: vi.fn(),
  prepare: vi.fn(),
  adapter: vi.fn(),
  dispose: vi.fn(),
  cleanup: vi.fn(),
  dispatch: vi.fn(),
  lane: vi.fn(),
  authenticate: vi.fn(),
  refresh: vi.fn(),
  revoke: vi.fn(),
  issue: vi.fn(),
  lstat: vi.fn(),
  realpath: vi.fn(),
  evidence: vi.fn(),
  node: vi.fn(),
  provider: vi.fn(),
  inspectProvider: vi.fn(),
  bridgeState: vi.fn(),
  privateState: Object.freeze({ private: true }),
}));
vi.mock("../scripts/ptr-production-publisher.mjs", () => ({
  preparePtrSourceBuiltArtifact: m.prepare,
}));
vi.mock("../scripts/ptr-production-existing-update-adapter.mjs", () => ({
  createPtrProductionExistingUpdateAdapter: m.adapter,
  exportPtrExistingUpdateCompletion: m.completion,
}));
vi.mock("../scripts/sealed-realms-production-activation-records.mjs", () => ({
  createSealedRealmsProductionActivationRecords: m.records,
  writeSealedRealmsProductionPtrExistingUpdateRecord: m.writeRecord,
}));
vi.mock("../scripts/local-binding-bounded-file.mjs", () => ({
  readLocalBindingBoundedFile: m.node,
}));
vi.mock("node:fs", () => ({ lstatSync: m.lstat, realpathSync: m.realpath }));
vi.mock("node:os", () => ({
  userInfo: () => ({
    uid: 1001,
    gid: 1001,
    username: "runner",
    homedir: "/home/runner",
  }),
}));
vi.mock("../scripts/sealed-realms-production-source-authority.mjs", () => ({
  authenticateSealedRealmsProductionSourceAuthority: m.authenticate,
  sourceCommitFromSealedRealmsProductionAuthority: (a: { sha: string }) =>
    a.sha,
  preparationSourceCommitFromSealedRealmsProductionAuthority: (a: {
    sha: string;
  }) => a.sha,
}));
vi.mock("../scripts/sealed-realms-production-workflow-evidence.mjs", () => ({
  createSealedRealmsProductionWorkflowEvidence: m.evidence,
  refreshSealedRealmsProductionWorkflowEvidence: m.refresh,
  revokeSealedRealmsProductionWorkflowEvidence: m.revoke,
  verifySealedRealmsProductionWorkflowEvidence: vi.fn(),
}));
vi.mock("../scripts/sealed-realms-production-workflow-authority.mjs", () => ({
  issueSealedRealmsProductionWorkflowPermit: m.issue,
  attestSealedRealmsProductionWorkflowPermit: m.attest,
}));
vi.mock(
  "../scripts/sealed-realms-production-workflow-private-state.mjs",
  () => ({
    resolveSealedRealmsProductionWorkflowPrivateState: () => m.privateState,
  }),
);
vi.mock("../scripts/sealed-realms-production-continuation.mjs", () => ({
  createSealedRealmsProductionContinuationStore: () => ({ store: true }),
}));
vi.mock("../scripts/sealed-realms-production-auth-bridge-state.mjs", () => ({
  createSealedRealmsProductionAuthBridgeState: m.bridgeState,
}));
vi.mock("../scripts/sealed-realms-production-bridge-provider.mjs", () => ({
  createSealedRealmsProductionBridgeProvider: m.provider,
  inspectSealedRealmsProductionBridgeProvider: m.inspectProvider,
}));
vi.mock("../scripts/sealed-realms-production-reconciliation.mjs", () => ({
  createSealedRealmsProductionPublicationReconciler: () => ({
    reconciler: true,
  }),
}));
vi.mock("../scripts/sealed-realms-production-ptr-lane-entry.mjs", () => ({
  createSealedRealmsProductionPtrLane: m.lane,
  createSealedRealmsProductionPtrDispatchContext: (v: unknown) => v,
  createSealedRealmsProductionPtrDispatcher: () => ({ dispatch: m.dispatch }),
}));
import {
  createSealedRealmsProductionPtrWorkflowRuntime as create,
  runSealedRealmsProductionPtrOperation as run,
} from "../scripts/sealed-realms-production-ptr-workflow-entry.mjs";
const sha = "a".repeat(40);
const saved = new Map<string, PropertyDescriptor | undefined>();
beforeEach(() => {
  vi.resetAllMocks();
  for (const [key, value] of Object.entries({
    platform: "linux",
    arch: "x64",
    execPath: "/home/runner/toolchain/bin/node",
    getuid: (): number => 1001,
    geteuid: (): number => 1001,
    getgid: (): number => 1001,
    getegid: (): number => 1001,
  })) {
    saved.set(key, Object.getOwnPropertyDescriptor(process, key));
    Object.defineProperty(process, key, { configurable: true, value });
  }
  vi.stubEnv("WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT", "/home/runner/cache");
  vi.stubEnv("WARPKEEP_SPACETIME_CLI_CONFIG_PATH", "/home/runner/config.toml");
  vi.stubEnv("SPACETIME_BIN", "/home/runner/spacetimedb-cli");
  m.realpath.mockImplementation((p: string) => p);
  m.node.mockReturnValue({ identity: { node: "fixed" } });
  m.lstat.mockImplementation((p: string) => ({
    isSymbolicLink: () => false,
    isDirectory: () =>
      !p.endsWith("config.toml") &&
      !p.endsWith("spacetimedb-cli") &&
      !p.endsWith("/node"),
    isFile: () =>
      p.endsWith("config.toml") ||
      p.endsWith("spacetimedb-cli") ||
      p.endsWith("/node"),
    uid: p === "/" || p === "/home" ? 0 : 1001,
    mode: p.endsWith("config.toml") ? 0o600 : 0o700,
    nlink: 1,
  }));
  m.authenticate.mockImplementation(({ operation }) => ({
    mode: "S",
    operation,
    sha,
  }));
  m.evidence.mockResolvedValue({ evidence: true });
  m.issue.mockResolvedValue({ permit: true });
  m.provider.mockReturnValue(Object.freeze({}));
  m.inspectProvider.mockImplementation(() => { throw new Error("update attempted a bridge observation"); });
  m.bridgeState.mockReturnValue({ bridge: true });
  m.prepare.mockReturnValue({ cleanup: m.cleanup });
  m.adapter.mockReturnValue({ dispose: m.dispose });
  m.lane.mockReturnValue({ lane: true });
  m.dispatch.mockImplementation(async ({ operation }: { operation: string }) => ({ operation, status: "completed" }));
  m.completion.mockReturnValue(Object.freeze({ completion: true }));
  m.records.mockReturnValue(Object.freeze({ records: true }));
});
afterEach(() => {
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(process, key, descriptor);
    else Reflect.deleteProperty(process, key);
  }
  saved.clear();
  vi.unstubAllEnvs();
});
it.each(["ptr-update-inspect", "ptr-update-apply"] as const)(
  "constructs %s from explicit paths, reattests and cleans up after execution",
  async (operation) => {
    const runtime = await create({ operation, workflowInputSha: sha });
    expect(m.provider).toHaveBeenCalledOnce();
    expect(m.provider).toHaveBeenCalledWith({
      authority: m.authenticate.mock.results[0].value,
      privateState: m.privateState,
      repositoryRoot: process.cwd(),
      fetchImpl: globalThis.fetch,
    });
    expect(m.provider.mock.calls[0][0].authority).toBe(m.authenticate.mock.results[0].value);
    expect(m.provider.mock.calls[0][0].privateState).toBe(m.privateState);
    expect(m.bridgeState).toHaveBeenCalledWith(expect.objectContaining({
      bridgeProvider: m.provider.mock.results[0].value,
      authority: m.authenticate.mock.results[0].value,
      privateState: m.provider.mock.calls[0][0].privateState,
    }));
    expect(m.bridgeState.mock.calls[0][0].bridgeProvider).toBe(m.provider.mock.results[0].value);
    expect(m.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceCommit: sha,
        dependencyCacheRoot: "/home/runner/cache",
        cliConfigSourcePath: "/home/runner/config.toml",
        executable: "/home/runner/spacetimedb-cli",
      }),
    );
    expect(m.prepare.mock.calls[0][0].reattestSource()).toBe(sha);
    expect(m.authenticate).toHaveBeenCalledTimes(2);
    expect(m.prepare.mock.calls[0][0].environment.PATH).toBe(
      "/home/runner/toolchain/bin:/usr/bin:/bin",
    );
    expect(m.node).toHaveBeenCalledWith(
      "/home/runner/toolchain/bin/node",
      expect.objectContaining({
        expectedUid: 1001,
        expectedMode: 0o700,
        discardBody: true,
      }),
    );
    expect(m.adapter).toHaveBeenCalledWith(
      expect.objectContaining({ artifact: m.prepare.mock.results[0].value }),
    );
    expect(m.lane).toHaveBeenCalledWith(
      expect.objectContaining({
        existingUpdate: m.adapter.mock.results[0].value,
      }),
    );
    await run({ runtime, operation, workflowInputSha: sha });
    expect(m.inspectProvider).not.toHaveBeenCalled();
    expect(m.dispose).toHaveBeenCalledOnce();
    expect(m.cleanup).toHaveBeenCalledOnce();
    expect(m.revoke).toHaveBeenCalledOnce();
    await expect(
      run({ runtime, operation, workflowInputSha: sha }),
    ).rejects.toThrow("CONSUMED");
  },
);
it.each([
  "WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT",
  "WARPKEEP_SPACETIME_CLI_CONFIG_PATH",
  "SPACETIME_BIN",
])("refuses missing %s before build", async (key) => {
  vi.stubEnv(key, undefined);
  await expect(
    create({ operation: "ptr-update-inspect", workflowInputSha: sha }),
  ).rejects.toThrow("CONFIG");
  expect(m.prepare).not.toHaveBeenCalled();
  expect(m.adapter).not.toHaveBeenCalled();
});
it.each(["symlink", "permissions", "owner", "relative"])(
  "refuses unsafe %s path",
  async (mode) => {
    if (mode === "relative") vi.stubEnv("SPACETIME_BIN", "spacetime");
    else
      m.lstat.mockReturnValue({
        isSymbolicLink: () => mode === "symlink",
        isDirectory: () => true,
        isFile: () => true,
        uid: mode === "owner" ? 1000 : 1001,
        mode: mode === "permissions" ? 0o777 : 0o700,
        nlink: 1,
      });
    await expect(
      create({ operation: "ptr-update-inspect", workflowInputSha: sha }),
    ).rejects.toThrow("CONFIG");
    expect(m.prepare).not.toHaveBeenCalled();
  },
);
it.each(["adapter", "lane", "dispatch", "refresh"])(
  "cleans resources after %s failure",
  async (phase) => {
    const failure = () => {
      throw Error("synthetic failure");
    };
    if (phase === "adapter") m.adapter.mockImplementation(failure);
    if (phase === "lane") m.lane.mockImplementation(failure);
    if (phase === "dispatch") m.dispatch.mockImplementation(failure);
    if (phase === "refresh") m.refresh.mockImplementation(failure);
    if (phase === "adapter" || phase === "lane")
      await expect(
        create({ operation: "ptr-update-apply", workflowInputSha: sha }),
      ).rejects.toThrow();
    else {
      const runtime = await create({
        operation: "ptr-update-apply",
        workflowInputSha: sha,
      });
      await expect(
        run({ runtime, operation: "ptr-update-apply", workflowInputSha: sha }),
      ).rejects.toThrow();
    }
    expect(m.cleanup).toHaveBeenCalledOnce();
    expect(m.dispose).toHaveBeenCalledTimes(phase === "adapter" ? 0 : 1);
    expect(m.revoke).toHaveBeenCalledOnce();
  },
);
it("preserves existing routes without update configuration or artifact work", async () => {
  vi.stubEnv("SPACETIME_BIN", undefined);
  const runtime = await create({
    operation: "ptr-live-inspect",
    workflowInputSha: sha,
  });
  await run({ runtime, operation: "ptr-live-inspect", workflowInputSha: sha });
  expect(m.prepare).not.toHaveBeenCalled();
  expect(m.adapter).not.toHaveBeenCalled();
});
it("cleanup failure still attempts artifact cleanup and evidence revocation", async () => {
  const runtime = await create({
    operation: "ptr-update-apply",
    workflowInputSha: sha,
  });
  m.dispose.mockImplementation(() => {
    throw Error("synthetic cleanup");
  });
  await expect(
    run({ runtime, operation: "ptr-update-apply", workflowInputSha: sha }),
  ).rejects.toThrow();
  expect(m.cleanup).toHaveBeenCalledOnce();
  expect(m.revoke).toHaveBeenCalledOnce();
});

it("refuses the wrong account before building", async () => {
  Object.defineProperty(process, "getuid", {
    configurable: true,
    value: () => 1000,
  });
  await expect(
    create({ operation: "ptr-update-inspect", workflowInputSha: sha }),
  ).rejects.toThrow("CONFIG");
  expect(m.prepare).not.toHaveBeenCalled();
});
it("reattestation refuses advanced source and changed configuration", async () => {
  const runtime = await create({
    operation: "ptr-update-inspect",
    workflowInputSha: sha,
  });
  const reattest = m.prepare.mock.calls[0][0].reattestSource;
  m.authenticate.mockReturnValue({
    mode: "S",
    operation: "ptr-update-inspect",
    sha: "b".repeat(40),
  });
  expect(reattest).toThrow("SOURCE");
  m.authenticate.mockReturnValue({
    mode: "S",
    operation: "ptr-update-inspect",
    sha,
  });
  vi.stubEnv("SPACETIME_BIN", "/home/runner/other-cli");
  expect(reattest).toThrow("CONFIG");
  await run({
    runtime,
    operation: "ptr-update-inspect",
    workflowInputSha: sha,
  });
});
it("does not build if permit issuance fails", async () => {
  m.issue.mockRejectedValue(Error("synthetic permit"));
  await expect(
    create({ operation: "ptr-update-apply", workflowInputSha: sha }),
  ).rejects.toThrow();
  expect(m.prepare).not.toHaveBeenCalled();
  expect(m.revoke).toHaveBeenCalledOnce();
});

it("refuses an unattested running Node before builder execution", async () => {
  m.node.mockImplementation(() => {
    throw Error("synthetic node");
  });
  await expect(
    create({ operation: "ptr-update-inspect", workflowInputSha: sha }),
  ).rejects.toThrow("CONFIG");
  expect(m.prepare).not.toHaveBeenCalled();
});

it("captures a completed update before disposal using owned authority, store and private state", async () => {
  const runtime = await create({ operation: "ptr-update-apply", workflowInputSha: sha });
  m.writeRecord.mockImplementation(() => { expect(m.dispose).not.toHaveBeenCalled(); expect(m.cleanup).not.toHaveBeenCalled(); });
  const result = await run({ runtime, operation: "ptr-update-apply", workflowInputSha: sha });
  expect(result).toEqual({ operation: "ptr-update-apply", status: "completed" });
  expect(m.completion).toHaveBeenCalledExactlyOnceWith({ adapter: m.adapter.mock.results[0].value, authority: m.authenticate.mock.results[0].value, store: { store: true } });
  expect(m.records).toHaveBeenCalledExactlyOnceWith({ privateState: { private: true }, authority: m.authenticate.mock.results[0].value });
  expect(m.writeRecord).toHaveBeenCalledExactlyOnceWith({ records: m.records.mock.results[0].value, authority: m.authenticate.mock.results[0].value, completion: m.completion.mock.results[0].value });
  expect(m.dispose).toHaveBeenCalledOnce(); expect(m.cleanup).toHaveBeenCalledOnce();
});
it.each(["unavailable", "submitted", "update-inspected"])('does not capture unsuccessful apply status %s', async status => {
  m.dispatch.mockResolvedValue({ operation: "ptr-update-apply", status });
  const runtime = await create({ operation: "ptr-update-apply", workflowInputSha: sha });
  await run({ runtime, operation: "ptr-update-apply", workflowInputSha: sha });
  expect(m.completion).not.toHaveBeenCalled(); expect(m.writeRecord).not.toHaveBeenCalled(); expect(m.cleanup).toHaveBeenCalledOnce();
});
it('does not capture a different returned operation or an inspection run', async () => {
  const runtime = await create({ operation: "ptr-update-apply", workflowInputSha: sha });
  m.dispatch.mockResolvedValue({ operation: "ptr-update-inspect", status: "completed" });
  await run({ runtime, operation: "ptr-update-apply", workflowInputSha: sha });
  const inspection = await create({ operation: "ptr-update-inspect", workflowInputSha: sha });
  await run({ runtime: inspection, operation: "ptr-update-inspect", workflowInputSha: sha });
  expect(m.completion).not.toHaveBeenCalled(); expect(m.writeRecord).not.toHaveBeenCalled();
});
it.each(["dispatch", "completion", "records", "writeRecord"] as const)('propagates %s failure and still disposes and revokes', async phase => {
  const runtime = await create({ operation: "ptr-update-apply", workflowInputSha: sha });
  m[phase].mockImplementation(() => { throw Error("synthetic capture failure"); });
  await expect(run({ runtime, operation: "ptr-update-apply", workflowInputSha: sha })).rejects.toThrow("synthetic capture failure");
  expect(m.dispose).toHaveBeenCalledOnce(); expect(m.cleanup).toHaveBeenCalledOnce(); expect(m.revoke).toHaveBeenCalledOnce();
  if (phase !== "writeRecord") expect(m.writeRecord).not.toHaveBeenCalled();
});

it('retries failed receipt capture from a revalidated terminal without replaying dispatch', async () => {
  const first = await create({ operation: 'ptr-update-apply', workflowInputSha: sha });
  m.writeRecord.mockImplementationOnce(() => { throw Error('synthetic disk failure'); });
  await expect(run({ runtime: first, operation: 'ptr-update-apply', workflowInputSha: sha })).rejects.toThrow('synthetic disk failure');
  const retry = await create({ operation: 'ptr-update-apply', workflowInputSha: sha });
  const laneFailure = Object.assign(Error('SEALED_REALMS_DISPATCH_LANE_FAILED'), { code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
  m.dispatch.mockRejectedValue(laneFailure);
  m.attest.mockImplementation(async () => { expect(m.completion).toHaveBeenCalledTimes(1); });
  await expect(run({ runtime: retry, operation: 'ptr-update-apply', workflowInputSha: sha })).resolves.toEqual({ operation: 'ptr-update-apply', status: 'completed' });
  expect(m.dispatch).toHaveBeenCalledTimes(2); expect(m.attest).toHaveBeenCalledOnce(); expect(m.completion).toHaveBeenCalledTimes(2); expect(m.writeRecord).toHaveBeenCalledTimes(2); expect(m.cleanup).toHaveBeenCalledTimes(2);
});
it.each(['attestation', 'unresolved'] as const)('preserves original lane failure when retry %s refuses', async refusal => {
  const runtime = await create({ operation: 'ptr-update-apply', workflowInputSha: sha });
  const laneFailure = Object.assign(Error('original lane failure'), { code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' });
  m.dispatch.mockRejectedValue(laneFailure);
  if (refusal === 'attestation') m.attest.mockRejectedValue(Error('revoked permit'));
  else m.completion.mockImplementation(() => { throw Error('No genuine completed head'); });
  await expect(run({ runtime, operation: 'ptr-update-apply', workflowInputSha: sha })).rejects.toBe(laneFailure);
  expect(m.writeRecord).not.toHaveBeenCalled(); expect(m.records).not.toHaveBeenCalled(); expect(m.dispatch).toHaveBeenCalledOnce(); expect(m.cleanup).toHaveBeenCalledOnce();
  if (refusal === 'attestation') expect(m.completion).not.toHaveBeenCalled();
});
it('does not reinterpret errors from outside the authenticated lane-failure boundary', async () => {
  const runtime = await create({ operation: 'ptr-update-apply', workflowInputSha: sha });
  m.dispatch.mockRejectedValue(Error('SEALED_REALMS_DISPATCH_LANE_FAILED'));
  await expect(run({ runtime, operation: 'ptr-update-apply', workflowInputSha: sha })).rejects.toThrow();
  expect(m.attest).not.toHaveBeenCalled(); expect(m.completion).not.toHaveBeenCalled(); expect(m.writeRecord).not.toHaveBeenCalled();
});

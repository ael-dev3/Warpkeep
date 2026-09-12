// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  attest: vi.fn(),
  completion: vi.fn(),
  adoption: vi.fn(),
  writeAdoption: vi.fn(),
  git: vi.fn(),
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
  account: {
    uid: 1000,
    gid: 1000,
    username: "warpkeep",
    homedir: "/home/warpkeep",
  },
}));
vi.mock("../scripts/ptr-production-publisher.mjs", () => ({
  preparePtrSourceBuiltArtifact: m.prepare,
}));
vi.mock("../scripts/ptr-production-existing-update-adapter.mjs", () => ({
  createPtrProductionExistingUpdateAdapter: m.adapter,
  exportPtrExistingUpdateCompletion: m.completion,
  capturePtrExistingUpdateAdoption: m.adoption,
}));
vi.mock("../scripts/sealed-realms-production-activation-records.mjs", () => ({
  createSealedRealmsProductionActivationRecords: m.records,
  writeSealedRealmsProductionPtrExistingUpdateRecord: m.writeRecord,
  writeSealedRealmsProductionPtrExistingStateAdoptionRecord: m.writeAdoption,
}));
vi.mock("../scripts/local-binding-bounded-file.mjs", () => ({
  readLocalBindingBoundedFile: m.node,
}));
vi.mock("node:fs", () => ({ lstatSync: m.lstat, realpathSync: m.realpath }));
vi.mock("node:child_process", () => ({ execFileSync: m.git }));
vi.mock("node:os", () => ({
  userInfo: () => m.account,
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
  vi.stubEnv("GITHUB_RUN_ID", "12345");
  vi.stubEnv("GITHUB_RUN_ATTEMPT", "2");
  m.git.mockReturnValue("b".repeat(40));
  for (const [key, value] of Object.entries({
    platform: "linux",
    arch: "x64",
    execPath:
      "/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node",
    getuid: (): number => 1000,
    geteuid: (): number => 1000,
    getgid: (): number => 1000,
    getegid: (): number => 1000,
  })) {
    saved.set(key, Object.getOwnPropertyDescriptor(process, key));
    Object.defineProperty(process, key, { configurable: true, value });
  }
  Object.assign(m.account, {
    uid: 1000,
    gid: 1000,
    username: "warpkeep",
    homedir: "/home/warpkeep",
  });
  vi.stubEnv(
    "WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT",
    "/home/warpkeep/.warpkeep/release-preparation-v1/cache/ptr",
  );
  vi.stubEnv(
    "WARPKEEP_SPACETIME_CLI_CONFIG_PATH",
    "/home/warpkeep/.warpkeep/private/production-admin-v1/spacetime-cli.toml",
  );
  vi.stubEnv(
    "SPACETIME_BIN",
    "/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/spacetime-2.6.1/spacetimedb-cli",
  );
  m.realpath.mockImplementation((p: string) => p);
  m.node.mockReturnValue({ identity: { node: "fixed" } });
  m.lstat.mockImplementation((p: string) => ({
    isSymbolicLink: () => false,
    isDirectory: () =>
      !p.endsWith(".toml") &&
      !p.endsWith("spacetimedb-cli") &&
      !p.endsWith("/node"),
    isFile: () =>
      p.endsWith(".toml") ||
      p.endsWith("spacetimedb-cli") ||
      p.endsWith("/node"),
    uid: p === "/" || p === "/home" ? 0 : 1000,
    gid: p === "/" || p === "/home" ? 0 : 1000,
    mode: p.endsWith(".toml") ? 0o600 : p.endsWith("/node") ? 0o500 : 0o700,
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
  m.adoption.mockResolvedValue(Object.freeze({ adoption: true }));
  m.writeAdoption.mockResolvedValue({ receiptDigest: "c".repeat(64), recordDigest: "d".repeat(64) });
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
        dependencyCacheRoot:
          "/home/warpkeep/.warpkeep/release-preparation-v1/cache/ptr",
        cliConfigSourcePath:
          "/home/warpkeep/.warpkeep/private/production-admin-v1/spacetime-cli.toml",
        executable:
          "/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/spacetime-2.6.1/spacetimedb-cli",
      }),
    );
    expect(m.prepare.mock.calls[0][0].reattestSource()).toBe(sha);
    expect(m.authenticate).toHaveBeenCalledTimes(2);
    expect(m.prepare.mock.calls[0][0].environment.PATH).toBe(
      "/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin:/usr/bin:/bin",
    );
    expect(m.node).toHaveBeenCalledWith(
      "/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node",
      expect.objectContaining({
        maximumBytes: 124819136,
        expectedBytes: 124819136,
        expectedSha256:
          "e6ec2c188d83d813f81f2de8aea084d74dce603ac1abedd0a30ad941b10087b2",
        expectedUid: 1000,
        expectedMode: 0o500,
        requireExecutable: true,
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
        uid: mode === "owner" ? 1001 : 1000,
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

it("refuses the retired hosted-runner account before permit issuance or building", async () => {
  for (const key of ["getuid", "geteuid", "getgid", "getegid"] as const) {
    Object.defineProperty(process, key, {
      configurable: true,
      value: () => 1001,
    });
  }
  Object.assign(m.account, {
    uid: 1001,
    gid: 1001,
    username: "runner",
    homedir: "/home/runner",
  });
  await expect(
    create({ operation: "ptr-update-inspect", workflowInputSha: sha }),
  ).rejects.toThrow("CONFIG");
  expect(m.issue).not.toHaveBeenCalled();
  expect(m.prepare).not.toHaveBeenCalled();
});

it.each(["geteuid", "getegid"] as const)(
  "refuses a mismatched effective %s before permit issuance or building",
  async (key) => {
    Object.defineProperty(process, key, {
      configurable: true,
      value: () => 1001,
    });
    await expect(
      create({ operation: "ptr-update-inspect", workflowInputSha: sha }),
    ).rejects.toThrow("CONFIG");
    expect(m.issue).not.toHaveBeenCalled();
    expect(m.prepare).not.toHaveBeenCalled();
  },
);

it("refuses a writable running Node before permit issuance or building", async () => {
  m.lstat.mockImplementation((p: string) => ({
    isSymbolicLink: () => false,
    isDirectory: () => !p.endsWith(".toml") && !p.endsWith("spacetimedb-cli") && !p.endsWith("/node"),
    isFile: () => p.endsWith(".toml") || p.endsWith("spacetimedb-cli") || p.endsWith("/node"),
    uid: p === "/" || p === "/home" ? 0 : 1000,
    gid: p === "/" || p === "/home" ? 0 : 1000,
    mode: p.endsWith(".toml") ? 0o600 : 0o700,
    nlink: 1,
  }));
  await expect(
    create({ operation: "ptr-update-inspect", workflowInputSha: sha }),
  ).rejects.toThrow("CONFIG");
  expect(m.node).not.toHaveBeenCalled();
  expect(m.issue).not.toHaveBeenCalled();
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
  vi.stubEnv(
    "SPACETIME_BIN",
    "/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/other-cli",
  );
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
  expect(m.issue).not.toHaveBeenCalled();
  expect(m.prepare).not.toHaveBeenCalled();
});

it("reattestation refuses a changed running Node identity", async () => {
  const runtime = await create({
    operation: "ptr-update-inspect",
    workflowInputSha: sha,
  });
  const reattest = m.prepare.mock.calls[0][0].reattestSource;
  m.node.mockReturnValue({ identity: { node: "changed" } });
  expect(reattest).toThrow("CONFIG");
  await run({
    runtime,
    operation: "ptr-update-inspect",
    workflowInputSha: sha,
  });
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


it('binds update observation to the verified source tree and current workflow attempt', async () => {
  await create({ operation: 'ptr-update-apply', workflowInputSha: sha });
  expect(m.git).toHaveBeenCalledWith('git', ['--no-replace-objects', 'rev-parse', `${sha}^{tree}`], expect.any(Object));
  expect(m.adapter).toHaveBeenCalledWith(expect.objectContaining({
    observation: { sourceTree: 'b'.repeat(40), runId: '12345', runAttempt: '2' },
  }));
});

it.each(['completed', 'recovered'] as const)('awaits signed adoption and private persistence before cleanup for %s updates', async path => {
  const runtime = await create({ operation: 'ptr-update-apply', workflowInputSha: sha });
  if (path === 'recovered') m.dispatch.mockRejectedValue(Object.assign(Error('lane'), { code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' }));
  let releaseAdoption!: (value: object) => void;
  let releaseWrite!: () => void;
  const adoption = Object.freeze({ adoption: true });
  m.adoption.mockReturnValue(new Promise(resolve => { releaseAdoption = resolve; }));
  m.writeAdoption.mockReturnValue(new Promise<void>(resolve => { releaseWrite = resolve; }));
  const running = run({ runtime, operation: 'ptr-update-apply', workflowInputSha: sha });
  await vi.waitFor(() => expect(m.adoption).toHaveBeenCalledOnce());
  expect(m.writeRecord).toHaveBeenCalledOnce();
  expect(m.adoption).toHaveBeenCalledWith({ adapter: m.adapter.mock.results[0].value,
    authority: m.authenticate.mock.results[0].value, store: { store: true },
    permit: { permit: true }, runId: '12345', runAttempt: '2' });
  expect(m.writeAdoption).not.toHaveBeenCalled();
  expect(m.dispose).not.toHaveBeenCalled(); expect(m.cleanup).not.toHaveBeenCalled();
  releaseAdoption(adoption);
  await vi.waitFor(() => expect(m.writeAdoption).toHaveBeenCalledExactlyOnceWith({
    records: m.records.mock.results[0].value, authority: m.authenticate.mock.results[0].value, adoption,
  }));
  expect(m.dispose).not.toHaveBeenCalled(); expect(m.cleanup).not.toHaveBeenCalled();
  releaseWrite();
  await expect(running).resolves.toEqual({ operation: 'ptr-update-apply', status: 'completed' });
  expect(m.dispose).toHaveBeenCalledOnce(); expect(m.cleanup).toHaveBeenCalledOnce();
});

it.each(['adoption', 'writeAdoption'] as const)('surfaces %s rejection after a genuine completed head without replaying the effect', async phase => {
  const runtime = await create({ operation: 'ptr-update-apply', workflowInputSha: sha });
  m.dispatch.mockRejectedValue(Object.assign(Error('lane'), { code: 'SEALED_REALMS_DISPATCH_LANE_FAILED' }));
  const failure = Error('signed adoption persistence failed');
  m[phase].mockRejectedValue(failure);
  await expect(run({ runtime, operation: 'ptr-update-apply', workflowInputSha: sha })).rejects.toBe(failure);
  expect(m.dispatch).toHaveBeenCalledOnce(); expect(m.writeRecord).toHaveBeenCalledOnce();
  expect(m.cleanup).toHaveBeenCalledOnce(); expect(m.revoke).toHaveBeenCalledOnce();
});

it('does not request or persist signed adoption during update inspection', async () => {
  const runtime = await create({ operation: 'ptr-update-inspect', workflowInputSha: sha });
  await run({ runtime, operation: 'ptr-update-inspect', workflowInputSha: sha });
  expect(m.adoption).not.toHaveBeenCalled(); expect(m.writeAdoption).not.toHaveBeenCalled();
});

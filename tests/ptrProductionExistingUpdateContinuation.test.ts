// @vitest-environment node
// Only artifact issuance and external provider I/O are seams. Every authority,
// private-state, claim, reconciliation, lane and dispatcher implementation is real.
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
const seams = vi.hoisted(() => ({
  request: vi.fn(),
  artifacts: new WeakSet<object>(),
}));
vi.mock("../scripts/ptr-update-provider-credentials.mjs", () => ({
  createPtrUpdateProviderCredentials: () => Object.freeze({}),
  requestPtrUpdateProvider: seams.request,
  disposePtrUpdateProviderCredentials: () => {},
}));
vi.mock("../scripts/ptr-production-publisher.mjs", async (importOriginal) => ({
  ...await importOriginal<typeof import("../scripts/ptr-production-publisher.mjs")>(),
  assertPtrSourceBuiltArtifact: (value: {
    assertSourceAndArtifact: () => void;
  }) => {
    if (!seams.artifacts.has(value))
      throw Error("Fixture artifact capability required");
    value.assertSourceAndArtifact();
    return value;
  },
}));
import { createPtrProductionExistingUpdateAdapter } from "../scripts/ptr-production-existing-update-adapter.mjs";
import { canonicalizePtrRawV10 } from "../scripts/ptr-artifact-description.mjs";
import { authenticateSealedRealmsProductionSourceAuthority } from "../scripts/sealed-realms-production-source-authority.mjs";
import {
  createSealedRealmsProductionPrivateState,
  SEALED_REALMS_PRIVATE_STATE_VERSION,
} from "../scripts/sealed-realms-production-private-state.mjs";
import {
  issueSealedRealmsProductionWorkflowPermit,
  attestSealedRealmsProductionWorkflowPermit,
} from "../scripts/sealed-realms-production-workflow-authority.mjs";
import {
  createSealedRealmsProductionContinuationStore,
  claimSealedRealmsProductionContinuation,
  assertSealedRealmsProductionContinuationClaim,
} from "../scripts/sealed-realms-production-continuation.mjs";
import { createSealedRealmsProductionAuthBridgeState } from "../scripts/sealed-realms-production-auth-bridge-state.mjs";
import { createSealedRealmsProductionPublicationReconciler } from "../scripts/sealed-realms-production-reconciliation.mjs";
import {
  createSealedRealmsProductionPtrLane,
  createSealedRealmsProductionPtrDispatchContext,
  createSealedRealmsProductionPtrDispatcher,
} from "../scripts/sealed-realms-production-ptr-lane-entry.mjs";
import {
  existingUpdateTokenDigest,
  updateProgramHash,
} from "../scripts/sealed-realms-existing-update-protocol.mjs";
const SOURCE = "a".repeat(40),
  ID = "c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e";
const BEFORE = "c".repeat(64),
  candidateBytes = Buffer.from("candidate source built bytes"),
  CANDIDATE = updateProgramHash(candidateBytes);
const definition = canonicalizePtrRawV10(
  readFileSync(
    new URL(
      "./fixtures/ptr-artifact-description-2.6.1/first.json",
      import.meta.url,
    ),
  ),
);
const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
const plan = (prior: string) => ({
  AutoMigrate: {
    break_clients: false,
    major_version_upgrade: false,
    migrate_plan: `${"━".repeat(60)}\nDatabase Migration Plan\n${"━".repeat(60)}\n\n`,
    token:
      "0x" +
      Buffer.from(existingUpdateTokenDigest(ID, prior, CANDIDATE), "hex")
        .reverse()
        .toString("hex"),
  },
});
const readGit = (args: readonly string[]) => {
  if (args[0] !== "rev-parse") throw Error("Unexpected fixture Git query");
  return `${SOURCE}\n`;
};
const readBinding = () => ({
  schemaVersion: 1,
  profile: "warpkeep-0.4.0-sealed-launch-v1",
  pagesDeploymentApproved: false,
  preparationSourceCommit: null,
});
const verifyEvidence = (verifiedSha: string) => ({ verifiedSha });
function authority(operation: "ptr-update-inspect" | "ptr-update-apply") {
  return authenticateSealedRealmsProductionSourceAuthority({
    operation,
    workflowInputSha: SOURCE,
    readGit,
    readBinding,
    verifyEvidence,
  });
}
function github() {
  const status = new Map<string, "in_progress" | "completed">();
  let next = 500;
  async function run(operation: "ptr-update-inspect" | "ptr-update-apply") {
    const runId = String(++next);
    status.set(runId, "in_progress");
    const sourceAuthority = authority(operation);
    const permit = await issueSealedRealmsProductionWorkflowPermit({
      sourceAuthority,
      runId,
      runAttempt: 1,
      githubToken: "synthetic-github-fixture-credential",
      fetchImpl: async (target) => {
        const url = String(target);
        let body: unknown;
        if (url.endsWith("/branches/main"))
          body = { name: "main", protected: true, commit: { sha: SOURCE } };
        else {
          const id = /\/actions\/runs\/([1-9][0-9]*)$/u.exec(url)?.[1];
          if (!id) throw Error("Unexpected fixture GitHub URL");
          const state = status.get(id) ?? "completed";
          body = {
            id: Number(id),
            run_attempt: 1,
            event: "workflow_dispatch",
            status: state,
            conclusion: state === "completed" ? "failure" : null,
            head_branch: "main",
            head_sha: SOURCE,
            path: ".github/workflows/sealed-realms-production.yml",
            repository: { full_name: "ael-dev3/Warpkeep" },
          };
        }
        const response = new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
        Object.defineProperty(response, "url", { value: url });
        return response;
      },
    });
    return { runId, runAttempt: "1", sourceAuthority, permit };
  }
  return { status, run };
}
const supported =
  process.platform === "linux" &&
  typeof process.getuid === "function" &&
  process.getuid() > 0;
const native = it.skipIf(!supported);
if (process.env.WARPKEEP_REQUIRE_SYNTHETIC_NETWORK === "1" && !supported)
  throw Error("Required native PTR continuation coverage is unavailable");
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0).reverse()) close();
  seams.request.mockReset();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "warpkeep-ptr-real-continuation-"));
  const adapters = new Set<
    ReturnType<typeof createPtrProductionExistingUpdateAdapter>
  >();
  cleanup.push(() => {
    for (const adapter of adapters) adapter.dispose();
    if (!root.startsWith(join(tmpdir(), "warpkeep-ptr-real-continuation-")))
      throw Error("Invalid fixture cleanup");
    rmSync(root, { recursive: true });
  });
  chmodSync(root, 0o700);
  const home = join(root, "home");
  for (const suffix of ["audit/private", "runtime", "cache"])
    mkdirSync(
      join(home, "Library/Application Support/Warpkeep/operations", suffix),
      { recursive: true, mode: 0o700 },
    );
  const privateState = createSealedRealmsProductionPrivateState({
    reportedHome: home,
    testOnlyOwnerUid: statSync(root).uid,
  });
  const store = createSealedRealmsProductionContinuationStore({ privateState });
  const gh = github();
  const runtime = join(
    home,
    "Library/Application Support/Warpkeep/operations/runtime",
    SEALED_REALMS_PRIVATE_STATE_VERSION,
  );
  const updateDirectory = `existing-updates-production-v1/ptr/${ID}`;
  const state = {
    current: BEFORE,
    puts: 0,
    lost: false,
    beforeSend: undefined as undefined | (() => void),
  };
  const artifact = Object.freeze({
    sourceCommit: SOURCE,
    moduleSha256: createHash("sha256").update(candidateBytes).digest("hex"),
    moduleProgramHash: CANDIDATE,
    moduleTreeId: "d".repeat(40),
    dependencyClosureDigest: "e".repeat(64),
    spacetimeExecutableSha256: "f".repeat(64),
    spacetimeCliConfigSha256: "1".repeat(64),
    artifactDescription: {
      definition: definition.definition,
      descriptionSha256: definition.digest,
      canonicalizationProfile: definition.profile,
      rawModuleDefVersion: 10,
    },
    assertSourceAndArtifact: () => {},
  });
  seams.artifacts.add(artifact);
  seams.request.mockImplementation(
    async (
      _provider: unknown,
      input: { operation: string; beforeSend?: () => Promise<void> },
    ) => {
      let body: unknown;
      switch (input.operation) {
        case "health":
          body = { version: "2.10.0", package_name: "spacetimedb-cloud" };
          break;
        case "metadata":
          body = {
            database_identity: { __identity__: "0x" + ID },
            owner_identity: { __identity__: "0x" + "2".repeat(64) },
            host_type: { Js: [] },
            initial_program: "0x" + BEFORE,
          };
          break;
        case "schema":
          body = definition.definition;
          break;
        case "plan":
          body = plan(state.current);
          break;
        case "apply":
          state.beforeSend?.();
          await input.beforeSend!();
          expect(
            privateState
              .list({ root: "runtime", relativeDirectory: updateDirectory })
              .some((name) => name.endsWith(".submission.json")),
          ).toBe(true);
          state.puts++;
          state.current = CANDIDATE;
          if (state.lost)
            throw Error("Synthetic provider committed; response lost");
          body = {
            Success: { domain: null, database_identity: ID, op: "updated" },
          };
          break;
        default:
          throw Error("Unexpected provider operation");
      }
      return { bytes: encode(body), claimedProviderIdentity: "2".repeat(64) };
    },
  );
  const make = () => {
    const adapter = createPtrProductionExistingUpdateAdapter({
      authority: authority("ptr-update-inspect"),
      privateState,
      artifact: artifact as never,
    });
    adapters.add(adapter);
    return adapter;
  };
  const unavailable = () => {
    throw Error("Unrelated publication/import/provision is forbidden");
  };
  async function dispatcher(
    operation: "ptr-update-inspect" | "ptr-update-apply",
    adapter: ReturnType<typeof make>,
  ) {
    const run = await gh.run(operation);
    const bridgeState = createSealedRealmsProductionAuthBridgeState({
      authority: run.sourceAuthority,
      privateState,
      repositoryRoot: process.cwd(),
      deploymentAttester: unavailable,
      bindingAttester: unavailable,
      fetchImpl: unavailable,
      inspectImportReceipt: unavailable,
      authenticateImportResult: unavailable,
      resolveOwnerProvisionReceipt: unavailable,
    });
    const lane = createSealedRealmsProductionPtrLane({
      existingUpdate: adapter,
      bridgeState,
      reconciler: createSealedRealmsProductionPublicationReconciler({
        privateState,
        lane: "ptr",
        postflight: unavailable,
      }),
      createPublishMarker: unavailable,
      publish: unavailable,
      importCore: unavailable,
      liveInspect: unavailable,
      inspectOwnerProvision: unavailable,
      provisionOwner: unavailable,
    });
    const context = createSealedRealmsProductionPtrDispatchContext({
      readGit,
      readBinding,
      verifyEvidence,
      ...run,
      continuationStore: store,
    });
    const target = createSealedRealmsProductionPtrDispatcher({ context, lane });
    return {
      ...run,
      call: () => target.dispatch({ operation, workflowInputSha: SOURCE }),
    };
  }
  async function inspect(adapter: ReturnType<typeof make>) {
    const run = await dispatcher("ptr-update-inspect", adapter);
    await run.call();
    gh.status.set(run.runId, "completed");
  }
  const records = () =>
    privateState
      .list({ root: "runtime", relativeDirectory: updateDirectory })
      .map((name) => {
        const bytes = privateState.read({
          root: "runtime",
          relativePath: `${updateDirectory}/${name}`,
        });
        try {
          return JSON.parse(bytes.toString()) as {
            kind: string;
            value: Record<string, unknown>;
          };
        } finally {
          bytes.fill(0);
        }
      });
  function continuationTerminals(path = runtime): Record<string, unknown>[] {
    return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? continuationTerminals(join(path, entry.name))
        : entry.name.endsWith(".json")
          ? [JSON.parse(readFileSync(join(path, entry.name), "utf8"))].filter(
              (value) =>
                value.profile ===
                "warpkeep-sealed-realms-continuation-terminal-v1",
            )
          : [],
    );
  }
  return {
    state,
    make,
    dispatcher,
    inspect,
    records,
    continuationTerminals,
    store,
    gh,
  };
}
it("uses a genuine workflow permit which refuses a newly terminal GitHub run", async () => {
  const gh = github(),
    run = await gh.run("ptr-update-apply");
  await expect(
    attestSealedRealmsProductionWorkflowPermit({
      ...run,
      phase: "continuation-effect",
    }),
  ).resolves.toBeTruthy();
  gh.status.set(run.runId, "completed");
  await expect(
    attestSealedRealmsProductionWorkflowPermit({
      ...run,
      phase: "continuation-effect",
    }),
  ).rejects.toThrow();
});
it("rejects a transparent production authority before artifact or provider use", () => {
  expect(() =>
    createPtrProductionExistingUpdateAdapter({
      authority: { mode: "S", operation: "ptr-update-inspect" } as never,
      privateState: {} as never,
      artifact: {} as never,
    }),
  ).toThrow();
  expect(seams.request).not.toHaveBeenCalled();
});
it("rejects an unissued claim through the genuine claim assertion", () => {
  expect(() =>
    assertSealedRealmsProductionContinuationClaim({
      claim: {},
      store: {} as never,
      sourceAuthority: authority("ptr-update-apply"),
      kind: "ptr-update",
      runId: "501",
      runAttempt: 1,
      subject: `ptr-update:${ID}`,
      evidenceDigest: "1".repeat(64),
      receiptDigests: [],
      predecessorDigests: [],
    }),
  ).toThrow("SEALED_REALMS_CONTINUATION_CLAIM_INVALID");
});
native(
  "direct real-lane apply accepts the synchronous claim and persists one genuine terminal",
  async () => {
    const f = fixture(),
      adapter = f.make();
    await f.inspect(adapter);
    const run = await f.dispatcher("ptr-update-apply", adapter);
    await run.call();
    expect(f.state.puts).toBe(1);
    expect(
      f
        .records()
        .map((record) => record.kind)
        .sort(),
    ).toEqual(["acknowledgement", "completion", "inspection", "submission"]);
    expect(f.continuationTerminals()).toHaveLength(1);
    expect(f.continuationTerminals()[0].outcome).toBe("completed");
    f.gh.status.set(run.runId, "completed");
    adapter.dispose();
    const fresh = f.make(),
      later = await f.dispatcher("ptr-update-apply", fresh);
    await expect(later.call()).rejects.toThrow();
    expect(f.state.puts).toBe(1);
  },
);
native(
  "fresh adapter reconciles a lost response after the old run terminates without a second PUT",
  async () => {
    const f = fixture(),
      adapter = f.make();
    await f.inspect(adapter);
    f.state.lost = true;
    const run = await f.dispatcher("ptr-update-apply", adapter);
    await expect(run.call()).rejects.toThrow("SEALED_REALMS_DISPATCH_LANE_FAILED");
    expect(f.state.puts).toBe(1);
    adapter.dispose();
    const fresh = f.make(),
      live = await f.dispatcher("ptr-update-apply", fresh);
    await expect(live.call()).rejects.toThrow("SEALED_REALMS_DISPATCH_LANE_FAILED");
    expect(f.records().some((record) => record.kind === "completion")).toBe(
      false,
    );
    expect(f.state.puts).toBe(1);
    f.gh.status.set(live.runId, "completed");
    f.gh.status.set(run.runId, "completed");
    const recovery = await f.dispatcher("ptr-update-apply", fresh);
    await recovery.call();
    expect(f.state.puts).toBe(1);
    expect(fresh.inspectResult()?.acknowledgement).toBe("not-received");
    expect(
      f.records().some((record) => record.kind === "acknowledgement"),
    ).toBe(false);
    expect(f.continuationTerminals()).toHaveLength(1);
    expect(f.continuationTerminals()[0].outcome).toBe("reconciled-effect-applied");
  },
);
native(
  "permit revocation at beforeSend produces no PUT and genuine later no-effect reconciliation",
  async () => {
    const f = fixture(),
      adapter = f.make();
    await f.inspect(adapter);
    const run = await f.dispatcher("ptr-update-apply", adapter);
    f.state.beforeSend = () => f.gh.status.set(run.runId, "completed");
    await expect(run.call()).rejects.toThrow("SEALED_REALMS_DISPATCH_LANE_FAILED");
    expect(f.state.puts).toBe(0);
    expect(
      f
        .records()
        .map((record) => record.kind)
        .sort(),
    ).toEqual(["inspection", "not-submitted"]);
    adapter.dispose();
    const fresh = f.make(),
      recovery = await f.dispatcher("ptr-update-apply", fresh);
    await recovery.call();
    expect(f.state.puts).toBe(0);
    expect(f.continuationTerminals()).toHaveLength(1);
    expect(f.continuationTerminals()[0].outcome).toBe("reconciled-no-effect");
  },
);
native(
  "real claim brand exists only during direct callback entry, never in its detached microtask",
  async () => {
    const f = fixture(),
      adapter = f.make();
    await f.inspect(adapter);
    const run = await f.gh.run("ptr-update-apply");
    const selection = adapter.reopenContinuation({
      authority: run.sourceAuthority,
    });
    const common = {
      store: f.store,
      ...run,
      kind: "ptr-update" as const,
      ...selection,
    };
    await claimSealedRealmsProductionContinuation({
      ...common,
      effect: (claim) => {
        const asserted = {
          claim,
          store: common.store,
          sourceAuthority: common.sourceAuthority,
          kind: common.kind,
          runId: common.runId,
          runAttempt: common.runAttempt,
          ...selection,
        };
        expect(assertSealedRealmsProductionContinuationClaim(asserted)).toBe(
          true,
        );
        return Promise.resolve().then(async () => {
          expect(() =>
            assertSealedRealmsProductionContinuationClaim(asserted),
          ).toThrow("CLAIM_INVALID");
          await expect(
            adapter.consumeContinuationEntry({
              ...asserted,
              permit: common.permit,
              selection,
            }),
          ).rejects.toThrow("CLAIM_INVALID");
        });
      },
    });
    expect(f.state.puts).toBe(0);
    expect(f.records().map((record) => record.kind)).toEqual(["inspection"]);
  },
);

it("constructs the real PTR reconciler with genuine platform-mode private state", () => {
  // Construction only: Windows mode relaxation grants no POSIX fsync/claim proof.
  const root = mkdtempSync(join(tmpdir(), "warpkeep-ptr-codec-construction-"));
  cleanup.push(() => {
    if (!root.startsWith(join(tmpdir(), "warpkeep-ptr-codec-construction-"))) throw Error("Invalid fixture cleanup");
    rmSync(root, { recursive: true });
  });
  const home = join(root, "home");
  for (const suffix of ["audit/private", "runtime", "cache"]) mkdirSync(join(home, "Library/Application Support/Warpkeep/operations", suffix), { recursive: true, mode: 0o700 });
  const privateState = createSealedRealmsProductionPrivateState({ reportedHome: home, testOnlyOwnerUid: statSync(root).uid, testOnlyAllowPlatformMode: true });
  expect(() => createSealedRealmsProductionPublicationReconciler({ privateState, lane: "ptr", postflight: () => { throw Error("No provider call expected"); } })).not.toThrow();
  expect(seams.request).not.toHaveBeenCalled();
});

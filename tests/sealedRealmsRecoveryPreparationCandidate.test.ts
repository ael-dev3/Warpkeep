import { createSealedRealmsProductionRecoveryPreparation, disposeSealedRealmsProductionRecoveryPreparation } from '../scripts/sealed-realms-production-recovery-preparation.mjs';
import { preparationTransportFixture } from './fixtures/recoveryPreparationSigned.js';
// Reuses the complete source-closure producer fixture without changing its owner file.
vi.mock('../scripts/recovery-public-key.mjs', () => ({
  RECOVERY_KEY_ID: 'warpkeep-0.4.0-recovery-2026-09-03-1',
  RECOVERY_KEY_THUMBPRINT: 'zbHwk528B5de5kuNzI98k4Y-rljmW6fbkH-aVZomk4M',
  RECOVERY_PUBLIC_JWK: { kty: 'EC', crv: 'P-256', x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE', y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA' },
}));
import {
  deriveGenesis001RecoveryLaunchEvidence,
  genesis001CensusOpaqueProofDigest,
  genesis001MonitorSuspensionReceiptDigest,
} from "../scripts/genesis001-sealed-launch-adoption.mjs";
import { GENESIS_001_ADMITTED_PLAYER_CENSUS_OPAQUE_PROOF_DOMAIN } from "../scripts/genesis001-admitted-player-census.mjs";
import {
  createSealedRealmsProductionRecoverySourceClosure,
  disposeSealedRealmsProductionRecoverySourceClosure,
} from "../scripts/sealed-realms-production-recovery-source-closure.mjs";
import { recoveryActivationBridge } from "./fixtures/recoveryActivationBridge.js";
// @vitest-environment node
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  statSync,
  rmSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  readSealedRealmsProductionRecoveryCandidate,
  inspectSealedRealmsProductionRecoveryCandidate,
} from "../scripts/sealed-realms-production-recovery-candidate.mjs";
import { updateDigest } from "../scripts/sealed-realms-existing-update-protocol.mjs";
import {
  ptrV3ActivationFixture,
  PTR_V3_FIXTURE_TIME,
} from "./fixtures/ptrV3ActivationFixture.js";
import { createSealedRealmsProductionPrivateState } from "../scripts/sealed-realms-production-private-state.mjs";
import { authenticateSealedRealmsProductionSourceAuthority } from "../scripts/sealed-realms-production-source-authority.mjs";
import {
  createSealedRealmsProductionActivationRecords,
  readSealedRealmsProductionRecoveryReceiptProjection,
  validateSealedRealmsProductionRecoveryActivationEvidence,
} from "../scripts/sealed-realms-production-activation-records.mjs";
vi.setConfig({ testTimeout: 30_000 });
const gitSeam = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFileSync: gitSeam.run,
}));
const roots: string[] = [];
const closures: Parameters<
  typeof disposeSealedRealmsProductionRecoverySourceClosure
>[0][] = [];
const pending = new Set<Promise<unknown>>();
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(PTR_V3_FIXTURE_TIME));
});
afterEach(
  async () => {
    await Promise.allSettled([...pending]);
    for (const closure of closures.splice(0))
      disposeSealedRealmsProductionRecoverySourceClosure(closure);
    vi.restoreAllMocks();
    vi.useRealTimers();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  },
  process.platform === "win32" ? 60_000 : 30_000,
);
// Synthetic receipt construction follows the bootstrap producer's length-framed ABI;
// the actual adoption validator below independently validates the resulting receipt.
function fixturePolicyBootstrapLink(value: Record<string, any>) {
  const hash = createHash("sha256");
  const fields = [
    ["domain", "warpkeep-production-g001-policy-observation-bootstrap-link-v1"],
    ...[
      "protectedCommit",
      "moduleTreeId",
      "bootstrapBlob",
      "bootstrapSha256",
    ].map((key) => [key, value[key]]),
    ["command", "g001-policy-observe"],
    [
      "launchCleanup",
      `${JSON.stringify(Object.fromEntries(Object.entries(value.launchCleanup).sort(([a], [b]) => a.localeCompare(b))))}\n`,
    ],
    [
      "policyObservationReceipt",
      `${JSON.stringify(value.policyObservationReceipt)}\n`,
    ],
  ];
  for (const [label, value] of fields) {
    for (const text of [label, value]) {
      const bytes = Buffer.from(text);
      const length = Buffer.alloc(8);
      length.writeBigUInt64BE(BigInt(bytes.length));
      hash.update(length).update(bytes);
    }
  }
  return hash.digest("hex");
}
function sourceBoundFixture(sourceCoordinates: {
  commit: string;
  tree: string;
  blob: string;
}) {
  const f = ptrV3ActivationFixture();
  f.candidate.preparationSourceCommit = sourceCoordinates.commit;
  f.candidate.preparationSourceTree = sourceCoordinates.tree;
  const rewrite = (value: any): void => {
    if (value === null || typeof value !== "object") return;
    for (const [key, member] of Object.entries(value)) {
      if (
        [
          "sourceCommit",
          "moduleSourceCommit",
          "protectedCommit",
          "preparationSourceCommit",
        ].includes(key) &&
        member === "a".repeat(40)
      )
        value[key] = sourceCoordinates.commit;
      else rewrite(member);
    }
  };
  rewrite(f.receipts);
  Object.assign(f.receipts.g001PolicyObservationBootstrapReceipt, {
    moduleTreeId: sourceCoordinates.tree,
    bootstrapBlob: sourceCoordinates.blob,
  });
  f.receipts.g002PublishReceipt.publishReceiptDigest =
    genesis002PublishReceiptDigest(
      Object.fromEntries(
        Object.entries(f.receipts.g002PublishReceipt).filter(
          ([key]) => key !== "publishReceiptDigest",
        ),
      ) as never,
    );
  const hash = (text: string) =>
    createHash("sha256").update(text).digest("hex");
  const hashRecord = (value: unknown) => hash(`${JSON.stringify(value)}\n`);
  const without = (value: Record<string, any>, key: string) =>
    Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
  for (const pass of ["first", "second"]) {
    const proof = f.receipts.g001CensusPrivacySafePrivateReceipt[pass];
    proof.opaqueProofDigest = genesis001CensusOpaqueProofDigest(proof);
    const envelope = f.receipts.g001AdmittedPlayerCensusPrivateReceipt[pass];
    envelope.record.applicant.opaqueProofDigest =
      genesis001CensusOpaqueProofDigest(envelope.record.applicant);
    envelope.record.admitted.opaqueProofDigest = hash(
      GENESIS_001_ADMITTED_PLAYER_CENSUS_OPAQUE_PROOF_DOMAIN +
        `${JSON.stringify(without(envelope.record.admitted, "opaqueProofDigest"))}\n`,
    );
    envelope.recordDigest = hashRecord(envelope.record);
  }
  f.receipts.g001PolicyObservationBootstrapReceipt.policyObservationReceiptLinkSha256 =
    fixturePolicyBootstrapLink(
      f.receipts.g001PolicyObservationBootstrapReceipt,
    );
  const census = f.receipts.g001AdmittedPlayerCensusPrivateReceipt;
  for (const name of ["confirmation", "consumed"]) {
    census[name].record.firstDigest = census.first.recordDigest;
    census[name].record.secondDigest = census.second.recordDigest;
  }
  census.confirmation.record.confirmationDigest = hash(
    [
      "warpkeep.sealed-realms.g001-census-confirmation.v1",
      sourceCoordinates.commit,
      census.first.recordDigest,
      census.second.recordDigest,
      census.confirmation.record.expiresAt,
    ].join("\n"),
  );
  census.consumed.record.confirmationDigest =
    census.confirmation.record.confirmationDigest;
  for (const name of ["confirmation", "consumed"])
    census[name].recordDigest = hashRecord(census[name].record);
  f.receipts.g001AdmissionMonitorSuspensionReceipt.receiptSha256 =
    genesis001MonitorSuspensionReceiptDigest(
      f.receipts.g001AdmissionMonitorSuspensionReceipt.receipt,
    );
  const suspension = f.receipts.g001AdmissionMonitorSuspensionReceipt;
  suspension.receiptBasename = `genesis001-admission-monitor-suspended-${suspension.receipt.suspendedAt.replace(/[-:.]/g, "")}-${suspension.receiptSha256.slice(0, 12)}.json`;
  deriveGenesis001RecoveryLaunchEvidence({
    preparationSourceCommit: sourceCoordinates.commit,
    policyObservationBootstrapReceipt:
      f.receipts.g001PolicyObservationBootstrapReceipt,
    censusPrivacySafePrivateReceipt:
      f.receipts.g001CensusPrivacySafePrivateReceipt,
    admissionMonitorSuspensionReceipt:
      f.receipts.g001AdmissionMonitorSuspensionReceipt,
    admissionMonitorCurrentStateReceipt:
      f.receipts.g001AdmissionMonitorCurrentStateReceipt,
    admittedPlayerCensusPrivateReceipt:
      f.receipts.g001AdmittedPlayerCensusPrivateReceipt,
  });
  return f;
}
function corpus(
  mutate: ((receipt: Record<string, any>) => void) | undefined,
  sourceCoordinates: { commit: string; tree: string; blob: string },
) {
  const f = sourceBoundFixture(sourceCoordinates);
  mutate?.(f.receipts);
  const source = f.candidate.preparationSourceCommit;
  const authority = authenticateSealedRealmsProductionSourceAuthority({
    operation: "activation-evidence-generate",
    workflowInputSha: source,
    readGit: () => `${source}\n`,
    readBinding: () => ({
      schemaVersion: 1,
      profile: "warpkeep-0.4.0-sealed-launch-v1",
      pagesDeploymentApproved: false,
      preparationSourceCommit: null,
    }),
    verifyEvidence: (verifiedSha) => ({ verifiedSha }),
  });
  const home = mkdtempSync(join(tmpdir(), "warpkeep-v3-corpus-"));
  roots.push(home);
  for (const suffix of ["audit/private", "runtime", "cache"])
    mkdirSync(
      join(home, "Library/Application Support/Warpkeep/operations", suffix),
      { recursive: true, mode: 0o700 },
    );
  const privateState = createSealedRealmsProductionPrivateState({
    reportedHome: home,
    testOnlyOwnerUid: statSync(home).uid,
    testOnlyAllowPlatformMode: true,
    testOnlyFsync: () => {},
  });
  const filenames = [
    "g001-policy-observation-bootstrap-receipt.json",
    "g001-census-privacy-safe-private-receipt.json",
    "g001-admitted-player-census-private-receipt.json",
    "g001-admission-monitor-suspension-receipt.json",
    "g001-admission-monitor-current-state-receipt.json",
    "g002-publish-receipt.json",
    "g002-atlas-import-receipt.json",
    "g002-sealed-live-receipt.json",
    "ptr-existing-update-receipt.json",
    "ptr-atlas-import-receipt.json",
    "ptr-owner-provision-receipt.json",
    "ptr-sealed-live-receipt.json",
  ];
  const operations = [
    "g001-policy-observe",
    "g001-census-second-inspect",
    "g001-census-second-suspend",
    "g001-census-second-suspend",
    "g001-current-state",
    "g002-publish-apply",
    "g002-import-apply",
    "g002-live-inspect",
    "ptr-update-apply",
    "ptr-import-apply",
    "ptr-owner-provision",
    "ptr-live-inspect",
  ];
  Object.entries(f.receipts).forEach(([member, receipt], i) => {
    const bodyDigest = createHash("sha256")
      .update(`${JSON.stringify(receipt)}\n`)
      .digest("hex");
    const record = {
      schemaVersion: 1,
      profile: "warpkeep-sealed-realms-activation-record-v1",
      member,
      preparationSourceCommit: source,
      sourceCommit: source,
      operation: operations[i],
      sourceAuthorityDigest: authority.authorityDigest,
      bodyDigest,
      receipt,
      semanticDigest: "",
    };

    record.semanticDigest = createHash("sha256")
      .update(
        [
          "warpkeep.sealed-realms.activation-record.v1",
          member,
          record.preparationSourceCommit,
          record.sourceCommit,
          record.operation,
          record.sourceAuthorityDigest,
          bodyDigest,
        ].join("\n") + "\n",
      )
      .digest("hex");
    privateState.write({
      root: "runtime",
      relativePath: `activation-evidence/records/${filenames[i]}`,
      bytes: Buffer.from(`${JSON.stringify(record)}\n`),
    });
  });
  return {
    ...f,
    home,
    privateState,
    authority,
    records: createSealedRealmsProductionActivationRecords({
      privateState,
      authority,
    }),
  };
}

import { readSealedRealmsProductionRecoveryApprovalFacts } from "../scripts/sealed-realms-production-recovery-approval-facts.js";
import { openGreaterRealmPrivateWorkspace } from "../scripts/atlas/greater-realm-private-workspace.js";
import {
  createGreaterRealmRuntimeReleaseFixtureSource,
  greaterRealmRuntimeReleaseFixtureSeed,
  GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
} from "../scripts/atlas/greater-realm-runtime-release-test-fixture.js";
import {
  createGenesis002GreaterRealmRuntimeRelease,
  createPtrGreaterRealmRuntimeRelease,
  GENESIS_002_GREATER_REALM_RUNTIME_RELEASE_DIRECTORY,
  PTR_GREATER_REALM_RUNTIME_RELEASE_DIRECTORY,
  verifyGenesis002GreaterRealmRuntimeReleaseArtifacts,
  verifyPtrGreaterRealmRuntimeReleaseArtifacts,
} from "../scripts/atlas/greater-realm-runtime-release.js";
import { greaterRealmProductionImportEngine } from "../scripts/greater-realm-production-import-core.js";
import {
  genesis002ProductionImportReceiptDigest,
  genesis002PublishReceiptDigest,
} from "../scripts/genesis002-activation-receipts.mjs";
import {
  ptrProductionAtlasImportReceiptDigest,
  ptrOwnerProvisionReceiptDigest,
} from "../scripts/generate-0.4.0-sealed-launch-activation.mjs";
// Actual file content/identity checks; Windows alone emulates owner-only mode bits.
vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  const mode = (s: import("node:fs").Stats) => {
    if (process.platform === "win32")
      Object.defineProperty(s, "mode", {
        value: (s.mode & ~0o777) | (s.isDirectory() ? 0o700 : 0o600),
      });
    return s;
  };
  return {
    ...fs,
    lstatSync: (path: string) => mode(fs.lstatSync(path)),
    fstatSync: (fd: number) => mode(fs.fstatSync(fd)),
  };
});
it(
  "joins actual signed service preparation with Git, releases, private corpus and bridge, reducing missing facts from six to four",
  async () => {
    const actual =
      await vi.importActual<typeof import("node:child_process")>(
        "node:child_process",
      );
    const gitExecutable =
      process.platform === "win32"
        ? actual
            .execFileSync("where.exe", ["git"], {
              encoding: "utf8",
              windowsHide: true,
              timeout: 60000,
            })
            .trim()
            .split(/\r?\n/)[0]
        : "/usr/bin/git";
    const repository = realpathSync(
      mkdtempSync(join(tmpdir(), "warpkeep-closure-joined-source-")),
    );
    roots.push(repository);
    const runGit = (args: string[]) =>
      actual
        .execFileSync(gitExecutable, args, {
          cwd: repository,
          encoding: "utf8",
          windowsHide: true,
          timeout: process.platform === "win32" ? 60000 : 15000,
        })
        .trim();
    runGit(["init", "-q"]);
    runGit(["config", "core.autocrlf", "false"]);
    runGit(["config", "user.name", "Fixture"]);
    runGit(["config", "user.email", "fixture@example.invalid"]);
    mkdirSync(join(repository, "scripts"));
    writeFileSync(
      join(repository, "scripts/greater-realm-production-bootstrap.mjs"),
      readFileSync(
        new URL(
          "../scripts/greater-realm-production-bootstrap.mjs",
          import.meta.url,
        ),
      ),
    );
    writeFileSync(
      join(repository, "source-fixture"),
      Buffer.from([0, 1, 255, 42]),
    );
    runGit(["add", "."]);
    runGit(["commit", "-qm", "Preparation S"]);
    const sourceCoordinates = {
      commit: runGit(["rev-parse", "HEAD"]),
      tree: runGit(["rev-parse", "HEAD^{tree}"]),
      blob: runGit([
        "rev-parse",
        "HEAD:scripts/greater-realm-production-bootstrap.mjs",
      ]),
    };
    runGit([
      "update-ref",
      "refs/remotes/origin/main",
      sourceCoordinates.commit,
    ]);
    vi.spyOn(process, "cwd").mockReturnValue(repository);
    gitSeam.run.mockImplementation((_executable, argv, options) => {
      let output: ReturnType<typeof actual.execFileSync>;
      try {
        // Windows already requires a path shim for this Linux caller. Allow slow local fixture I/O;
        // Linux keeps the real production timeout and all bytes/arguments remain independently checked.
        output = actual.execFileSync(gitExecutable, argv, process.platform === 'win32' ? { ...options, timeout: 60000 } : options);
      } catch (error) {
        throw error;
      }
      // Candidate's Linux-only root comparison receives the equivalent Windows-native path spelling.
      if (process.platform === "win32" && argv.includes("--show-toplevel"))
        return Buffer.from(`${repository}\n`);
      return output;
    });
    // Exercise the candidate's exact fixed Git environment before expensive realm fixtures.
    const verifiedHead = gitSeam.run(
      "/usr/bin/git",
      [
        "--no-replace-objects",
        "--no-optional-locks",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.untrackedCache=false",
        "rev-parse",
        "--verify",
        "HEAD^{commit}",
      ],
      {
        cwd: repository,
        encoding: "buffer",
        maxBuffer: 2 * 1024 * 1024,
        timeout: 10000,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_SYSTEM: "/dev/null",
          GIT_NO_REPLACE_OBJECTS: "1",
          GIT_TERMINAL_PROMPT: "0",
          HOME: "/dev/null",
          PATH: "/usr/bin:/bin",
          LANG: "C",
          LC_ALL: "C",
          TZ: "UTC",
        },
      },
    );
    expect(verifiedHead.toString("utf8")).toBe(`${sourceCoordinates.commit}\n`);
    const sourceGitOptions = gitSeam.run.mock.lastCall?.[2];
    const probe = (args: string[]) =>
      gitSeam.run(
        "/usr/bin/git",
        [
          "--no-replace-objects",
          "--no-optional-locks",
          "-c",
          "core.fsmonitor=false",
          "-c",
          "core.untrackedCache=false",
          ...args,
        ],
        sourceGitOptions,
      ) as Buffer;
    expect(
      probe([
        "rev-parse",
        "--verify",
        "refs/remotes/origin/main^{commit}",
      ]).toString(),
    ).toBe(`${sourceCoordinates.commit}\n`);
    expect(probe(["rev-parse", "--show-toplevel"]).toString()).toBe(
      `${repository}\n`,
    );
    expect(
      probe([
        "rev-parse",
        "--verify",
        `${sourceCoordinates.commit}^{tree}`,
      ]).toString(),
    ).toBe(`${sourceCoordinates.tree}\n`);
    expect(
      probe([
        "ls-tree",
        "-z",
        sourceCoordinates.commit,
        "--",
        "scripts/greater-realm-production-bootstrap.mjs",
      ]).toString(),
    ).toBe(
      `100644 blob ${sourceCoordinates.blob}\tscripts/greater-realm-production-bootstrap.mjs\0`,
    );
    expect(probe(["cat-file", "blob", sourceCoordinates.blob])).toEqual(
      readFileSync(
        join(repository, "scripts/greater-realm-production-bootstrap.mjs"),
      ),
    );
    sourceBoundFixture(sourceCoordinates);
    const root = mkdtempSync(join(tmpdir(), "warpkeep-approval-releases-"));
    roots.push(root);
    const workspaceRoot = join(root, "private");
    mkdirSync(workspaceRoot, { mode: 0o700 });
    const put = (path: string, bytes: Uint8Array) => {
      const file = join(workspaceRoot, path);
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
      writeFileSync(file, bytes, { mode: 0o600 });
    };
    const source = createGreaterRealmRuntimeReleaseFixtureSource();
    const options = {
      source,
      sourceCommit: GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
      releaseSeed: greaterRealmRuntimeReleaseFixtureSeed(),
    };
    const g002 = createGenesis002GreaterRealmRuntimeRelease(options),
      ptr = createPtrGreaterRealmRuntimeRelease(options);
    for (const [directory, artifacts] of [
      [GENESIS_002_GREATER_REALM_RUNTIME_RELEASE_DIRECTORY, g002],
      [PTR_GREATER_REALM_RUNTIME_RELEASE_DIRECTORY, ptr],
    ] as const) {
      put(`${directory}/import-manifest.json`, artifacts.manifestBytes);
      put(`${directory}/status.json`, artifacts.statusBytes);
      for (const chunk of artifacts.chunks)
        put(`${directory}/${chunk.path}`, chunk.bytes);
    }
    const hash = (bytes: string | Uint8Array) =>
      createHash("sha256").update(bytes).digest("hex");
    const ga = greaterRealmProductionImportEngine.importAuthority(
      g002,
      verifyGenesis002GreaterRealmRuntimeReleaseArtifacts,
    );
    const pa = greaterRealmProductionImportEngine.importAuthority(
      ptr,
      verifyPtrGreaterRealmRuntimeReleaseArtifacts,
    );
    const without = (r: Record<string, any>, key: string) =>
      Object.fromEntries(Object.entries(r).filter(([k]) => k !== key));
    const f = corpus((receipts) => {
      for (const [realm, release] of [
        ["g002", ga],
        ["ptr", pa],
      ] as const) {
        for (const member of [
          `${realm}AtlasImportReceipt`,
          `${realm}SealedLiveReceipt`,
        ])
          Object.assign(receipts[member], {
            atlasId: release.atlasId,
            atlasSourceCommit: release.sourceCommit,
            publicReleaseId: release.publicReleaseId,
          });
        receipts[`${realm}AtlasImportReceipt`].expectedReleaseSha256 =
          release.releaseSha256;
        receipts[`${realm}SealedLiveReceipt`].releaseHeaderSha256 = hash(
          release.headerJson,
        );
      }
      receipts.g002SealedLiveReceipt.releaseSha256 = ga.releaseSha256;
      for (const member of ["ptrAtlasImportReceipt", "ptrSealedLiveReceipt"])
        Object.assign(receipts[member], {
          expectedReleaseSha256: pa.releaseSha256,
          releaseHeaderSha256: hash(pa.headerJson),
          releaseManifestSha256: hash(ptr.manifestBytes),
        });
      receipts.g002AtlasImportReceipt.importReceiptDigest =
        genesis002ProductionImportReceiptDigest(
          without(
            receipts.g002AtlasImportReceipt,
            "importReceiptDigest",
          ) as never,
        );
      receipts.ptrAtlasImportReceipt.importReceiptDigest =
        ptrProductionAtlasImportReceiptDigest(
          without(
            receipts.ptrAtlasImportReceipt,
            "importReceiptDigest",
          ) as never,
        );
      receipts.ptrOwnerProvisionReceipt.atlasImportReceiptDigest =
        receipts.ptrAtlasImportReceipt.importReceiptDigest;
      receipts.ptrOwnerProvisionReceipt.provisionReceiptDigest =
        ptrOwnerProvisionReceiptDigest(
          without(
            receipts.ptrOwnerProvisionReceipt,
            "provisionReceiptDigest",
          ) as never,
        );
    }, sourceCoordinates);
    const { bridge } = await recoveryActivationBridge(
      f.privateState,
      f.home,
      {
        g002AtlasImportReceipt: f.receipts.g002AtlasImportReceipt,
        ptrAtlasImportReceipt: f.receipts.ptrAtlasImportReceipt,
        ptrOwnerProvisionReceipt: f.receipts.ptrOwnerProvisionReceipt,
        ptrPublishReceipt: {
          databaseIdentity:
            f.receipts.ptrExistingUpdateReceipt.binding.databaseIdentity,
        },
      },
      sourceCoordinates.commit,
    );
    await bridge.inspectActivationEvidenceForContinuation();
    const input = {
      records: f.records,
      privateState: f.privateState,
      authority: f.authority,
    };
    vi.stubEnv("WARPKEEP_GREATER_REALM_WORKSPACE", workspaceRoot);
    try {
      expect(() =>
        readSealedRealmsProductionRecoveryApprovalFacts({
          ...input,
          records: {} as never,
        }),
      ).toThrow();
      const bootstrap = f.receipts.g001PolicyObservationBootstrapReceipt;
      const bytes = readFileSync(
        new URL(
          "../scripts/greater-realm-production-bootstrap.mjs",
          import.meta.url,
        ),
      );
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        bootstrap.bootstrapSha256,
      );

      const inspected = inspectSealedRealmsProductionRecoveryCandidate({
        ...input,
        bridgeState: bridge,
      });
      expect(inspected.missingFields).toHaveLength(7);
      expect(inspected.missingFields).toContain("sourceClosureSha256");
      const work = createSealedRealmsProductionRecoverySourceClosure({
        privateState: f.privateState,
        authority: f.authority,
      });
      pending.add(work);
      const sourceClosure = await work;
      pending.delete(work);
      closures.push(sourceClosure);
      const joined = inspectSealedRealmsProductionRecoveryCandidate({
        ...input,
        bridgeState: bridge,
        sourceClosure,
      });
      expect(joined.missingFields).toEqual(
        inspected.missingFields.filter(
          (field) => field !== "sourceClosureSha256",
        ),
      );
      expect(joined.missingFields).toHaveLength(6);
      const service = preparationTransportFixture(undefined, { preparationCommit: sourceCoordinates.commit, preparationTree: sourceCoordinates.tree });
      const preparation = await createSealedRealmsProductionRecoveryPreparation({ privateState: f.privateState, authority: f.authority });
      try {
        const prepared = inspectSealedRealmsProductionRecoveryCandidate({ ...input, bridgeState: bridge, sourceClosure, preparation });
        expect(prepared.missingFields).toEqual(joined.missingFields.filter(field => !['recoveryAuthorizationRequestId', 'recoveryAuthorizationEpoch'].includes(field)));
        expect(prepared.missingFields).toHaveLength(4);
        expect(prepared.facts).toMatchObject({ recoveryAuthorizationRequestId: service.intent.requestId, recoveryAuthorizationEpoch: service.intent.authorizationEpoch });
        expect(() => readSealedRealmsProductionRecoveryCandidate({ ...input, bridgeState: bridge, sourceClosure, preparation })).toThrow('SEALED_REALMS_RECOVERY_CANDIDATE_INPUTS_MISSING');
      } finally { disposeSealedRealmsProductionRecoveryPreparation(preparation); vi.unstubAllGlobals(); }
      expect(joined.facts).toMatchObject({
        ...inspected.facts,
        sourceClosureSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      expect(inspected.facts).toMatchObject({
        g002PublicApprovalReceiptId: ga.publicApprovalReceiptId,
        ptrPublicApprovalReceiptId: pa.publicApprovalReceiptId,
      });
      expect(inspected.missingFields).not.toContain(
        "g002PublicApprovalReceiptId",
      );
      expect(inspected.missingFields).not.toContain(
        "ptrPublicApprovalReceiptId",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  },
  process.platform === "win32" ? 300_000 : 120_000,
);

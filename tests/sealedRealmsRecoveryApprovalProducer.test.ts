import { sealedRealmsPrivateBase } from './helpers/sealedRealmsPrivateRoots';
import { recoveryActivationBridge } from "./fixtures/recoveryActivationBridge";
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
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(PTR_V3_FIXTURE_TIME));
});
afterEach(
  () => {
    vi.useRealTimers();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true });
  },
  process.platform === "win32" ? 60_000 : 30_000,
);
function corpus(
  mutate?: (receipt: Record<string, any>) => void,
  wrapperMutate?: (record: Record<string, any>) => void,
) {
  const f = ptrV3ActivationFixture();
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
      join(sealedRealmsPrivateBase(home), suffix),
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
    wrapperMutate?.(record);
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

import { readSealedRealmsProductionRecoveryApprovalFacts } from "../scripts/sealed-realms-production-recovery-approval-facts";
import { openGreaterRealmPrivateWorkspace } from "../scripts/atlas/greater-realm-private-workspace";
import {
  createGreaterRealmRuntimeReleaseFixtureSource,
  greaterRealmRuntimeReleaseFixtureSeed,
  GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
} from "../scripts/atlas/greater-realm-runtime-release-test-fixture";
import {
  createGenesis002GreaterRealmRuntimeRelease,
  createPtrGreaterRealmRuntimeRelease,
  GENESIS_002_GREATER_REALM_RUNTIME_RELEASE_DIRECTORY,
  PTR_GREATER_REALM_RUNTIME_RELEASE_DIRECTORY,
  verifyGenesis002GreaterRealmRuntimeReleaseArtifacts,
  verifyPtrGreaterRealmRuntimeReleaseArtifacts,
} from "../scripts/atlas/greater-realm-runtime-release";
import { greaterRealmProductionImportEngine } from "../scripts/greater-realm-production-import-core";
import { genesis002ProductionImportReceiptDigest } from "../scripts/genesis002-activation-receipts.mjs";
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
it("reads genuine generated realm releases against the reopened V3 private corpus and bridge", async () => {
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
        without(receipts.ptrAtlasImportReceipt, "importReceiptDigest") as never,
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
  });
  const { bridge } = await recoveryActivationBridge(f.privateState, f.home, {
    g002AtlasImportReceipt: f.receipts.g002AtlasImportReceipt,
    ptrAtlasImportReceipt: f.receipts.ptrAtlasImportReceipt,
    ptrOwnerProvisionReceipt: f.receipts.ptrOwnerProvisionReceipt,
    ptrPublishReceipt: {
      databaseIdentity:
        f.receipts.ptrExistingUpdateReceipt.binding.databaseIdentity,
    },
  });
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
    gitSeam.run.mockImplementation((_executable, argv) => {
      const args = argv.slice(6);
      if (args[0] === "cat-file" && args[2] === bootstrap.bootstrapBlob)
        return Buffer.from(bytes);
      if (args[0] === "ls-tree")
        return Buffer.from(
          `100644 blob ${bootstrap.bootstrapBlob}\tscripts/greater-realm-production-bootstrap.mjs\0`,
        );
      if (args[0] !== "rev-parse") throw Error("Unexpected fixture Git call");
      return Buffer.from(
        args[1] === "--show-toplevel"
          ? `${realpathSync(process.cwd())}\n`
          : args[2] === `${bootstrap.protectedCommit}^{tree}`
            ? `${bootstrap.moduleTreeId}\n`
            : `${bootstrap.protectedCommit}\n`,
      );
    });

    const inspected = inspectSealedRealmsProductionRecoveryCandidate({
      ...input,
      bridgeState: bridge,
    });
    expect(inspected.missingFields).toHaveLength(7);
    expect(inspected.facts).toMatchObject({
      g002PublicApprovalReceiptId: ga.publicApprovalReceiptId,
      ptrPublicApprovalReceiptId: pa.publicApprovalReceiptId,
    });
    expect(inspected.missingFields).not.toContain(
      "g002PublicApprovalReceiptId",
    );
    expect(inspected.missingFields).not.toContain("ptrPublicApprovalReceiptId");
  } finally {
    vi.unstubAllEnvs();
  }
}, process.platform === "win32" ? 300_000 : 120_000);

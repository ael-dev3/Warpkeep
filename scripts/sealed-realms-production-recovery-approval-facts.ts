import { types } from "node:util";
import { createHash } from "node:crypto";
import {
  assertSealedRealmsProductionActivationRecordsAuthority,
  readSealedRealmsProductionRecoveryCandidateRecords,
  type SealedRealmsProductionActivationRecords,
  type SealedRealmsRecoveryCandidateReadContext,
  type SealedRealmsProductionRecoveryReceiptProjection,
} from "./sealed-realms-production-activation-records.mjs";
import {
  sourceCommitFromSealedRealmsProductionAuthority,
  type SealedRealmsProductionSourceAuthority,
} from "./sealed-realms-production-source-authority.mjs";
import type { SealedRealmsProductionPrivateState } from "./sealed-realms-production-private-state.mjs";
import { openExistingGreaterRealmPrivateWorkspace } from "./atlas/greater-realm-private-workspace";
import {
  readGenesis002GreaterRealmRuntimeRelease,
  readPtrGreaterRealmRuntimeRelease,
  verifyGenesis002GreaterRealmRuntimeReleaseArtifacts,
  verifyPtrGreaterRealmRuntimeReleaseArtifacts,
  type GreaterRealmRuntimeReleaseArtifacts,
} from "./atlas/greater-realm-runtime-release";
import { greaterRealmProductionImportEngine } from "./greater-realm-production-import-core";

export type SealedRealmsProductionRecoveryApprovalFacts = Readonly<{
  g002PublicApprovalReceiptId: string;
  ptrPublicApprovalReceiptId: string;
}>;

const fail = (): never => {
  throw new Error("SEALED_REALMS_RECOVERY_APPROVAL_FACTS_INVALID");
};
const sha256 = (bytes: Uint8Array | string): string =>
  createHash("sha256").update(bytes).digest("hex");

/** Reopens producer-owned release files and matches them to the authenticated corpus.
 * These scalar IDs are evidence, not permission to publish or admit players.
 */
export function readSealedRealmsProductionRecoveryApprovalFacts(
  input: Readonly<{
    records: SealedRealmsProductionActivationRecords;
    privateState: SealedRealmsProductionPrivateState;
    authority: SealedRealmsProductionSourceAuthority;
    readContext?: SealedRealmsRecoveryCandidateReadContext;
  }>,
): SealedRealmsProductionRecoveryApprovalFacts {
  if (
    types.isProxy(input) ||
    input === null ||
    typeof input !== "object" ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    fail();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = [
    "records",
    "privateState",
    "authority",
    ...(Object.hasOwn(descriptors, "readContext") ? ["readContext"] : []),
  ];
  if (Reflect.ownKeys(descriptors).length !== keys.length) fail();
  for (const key of keys) {
    if (
      !descriptors[key]?.enumerable ||
      !Object.hasOwn(descriptors[key], "value")
    )
      fail();
  }
  const records = descriptors.records!
    .value as SealedRealmsProductionActivationRecords;
  const privateState = descriptors.privateState!
    .value as SealedRealmsProductionPrivateState;
  const authority = descriptors.authority!
    .value as SealedRealmsProductionSourceAuthority;
  const readContext = descriptors.readContext?.value as
    SealedRealmsRecoveryCandidateReadContext | undefined;
  const assertOwner = (): void => {
    assertSealedRealmsProductionActivationRecordsAuthority({
      records,
      privateState,
      authority,
    });
    sourceCommitFromSealedRealmsProductionAuthority(authority);
    if (
      authority.mode !== "S" ||
      authority.operation !== "activation-evidence-generate"
    )
      fail();
  };
  assertOwner();
  const repositoryRoot = process.cwd();
  const workspaceRoot = process.env.WARPKEEP_GREATER_REALM_WORKSPACE;
  const workspace = openExistingGreaterRealmPrivateWorkspace({
    repositoryRoot,
    workspaceRoot,
  });
  const checkRelease = (
    realm: "g002" | "ptr",
    artifacts: GreaterRealmRuntimeReleaseArtifacts,
    projection: SealedRealmsProductionRecoveryReceiptProjection,
  ) => {
    const release = greaterRealmProductionImportEngine.importAuthority(
      artifacts,
      realm === "g002"
        ? verifyGenesis002GreaterRealmRuntimeReleaseArtifacts
        : verifyPtrGreaterRealmRuntimeReleaseArtifacts,
    );
    const expected = {
      [`${realm}AtlasId`]: release.atlasId,
      [`${realm}AtlasSourceCommit`]: release.sourceCommit,
      [`${realm}PublicReleaseId`]: release.publicReleaseId,
      [`${realm}ReleaseHeaderSha256`]: sha256(release.headerJson),
      [realm === "g002" ? "g002ReleaseSha256" : "ptrExpectedReleaseSha256"]:
        release.releaseSha256,
      ...(realm === "ptr"
        ? { ptrReleaseManifestSha256: sha256(artifacts.manifestBytes) }
        : {}),
    };
    for (const [key, value] of Object.entries(expected)) {
      if (projection[key] !== value) fail();
    }
    return {
      approvalId: release.publicApprovalReceiptId,
      manifestSha256: sha256(artifacts.manifestBytes),
    };
  };
  const snapshot = () => {
    const corpus = readSealedRealmsProductionRecoveryCandidateRecords(
      records,
      readContext,
    );
    return {
      corpus,
      g002: checkRelease(
        "g002",
        readGenesis002GreaterRealmRuntimeRelease(workspace),
        corpus.projection,
      ),
      ptr: checkRelease(
        "ptr",
        readPtrGreaterRealmRuntimeRelease(workspace),
        corpus.projection,
      ),
    };
  };
  const first = snapshot();
  const second = snapshot();
  assertOwner();
  if (
    process.cwd() !== repositoryRoot ||
    process.env.WARPKEEP_GREATER_REALM_WORKSPACE !== workspaceRoot ||
    JSON.stringify(first) !== JSON.stringify(second)
  )
    fail();
  return Object.freeze({
    g002PublicApprovalReceiptId: first.g002.approvalId,
    ptrPublicApprovalReceiptId: first.ptr.approvalId,
  });
}

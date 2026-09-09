import { types } from "node:util";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
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
import { greaterRealmProductionImportEngine } from "./greater-realm-production-import-core";

export type SealedRealmsProductionRecoveryApprovalFacts = Readonly<{
  g002PublicApprovalReceiptId: string;
  ptrPublicApprovalReceiptId: string;
}>;

const fail = (): never => {
  throw new Error("SEALED_REALMS_RECOVERY_APPROVAL_FACTS_INVALID");
};
type GreaterRealmRuntimeReleaseArtifacts = Readonly<{
  manifest: Readonly<Record<string, unknown>>;
  manifestBytes: Buffer;
  status: Readonly<Record<string, unknown>>;
  statusBytes: Buffer;
  chunks: readonly Readonly<{
    path: string;
    bytes: Buffer;
    payload: Readonly<{
      schema: 'warpkeep.greater-realm.runtime-import-chunk.v1';
      publicReleaseId: string;
      chunkHandle: string;
      importOrdinal: number;
      cells: readonly Readonly<{
        cellKey: string;
        atlasCoordKey: string;
        releaseOrdinal: number;
        atlasId: string;
        chunkHandle: string;
        regionId: string;
        componentKey?: string;
        localQ: number;
        localR: number;
        atlasQ: number;
        atlasR: number;
        tier: 1;
        passable: boolean;
        elevation: number;
        slope: number;
        aspect: number;
        profileCurvature: number;
        planCurvature: number;
        ridgeId?: string;
        geologicalBarrierBand: number;
        biomeClass: number;
        landformClass: number;
        yieldClass: number;
        movementCost: number;
        sealedBoundaryMask: number;
        hydroRegime: number;
        hydroBodyId?: string;
        hydroDepthClass: number;
        hydroSurfaceMilli: number;
        hydroFlowDirection?: number;
        flowAccumulation: string;
        bankVariant: number;
        hydrologyRevision: number;
        routeParentDirection?: number;
        routeDepth?: number;
        travelClass: number;
        wetness: number;
        exposure: number;
        coastDistance: number;
        freshwaterDistance: number;
        temperature: number;
        moisture: number;
        habitatClass: number;
        canopyBasisPoints: number;
        groundcoverBasisPoints: number;
        wildflowerBasisPoints: number;
        featureClass: number;
        ambienceClass: number;
        presentationVariant: number;
      }>[];
      apronCellKeys: readonly string[];
      lod1CellKeys: readonly string[];
      lod2CellKeys: readonly string[];
      lod3CellKeys: readonly string[];
      castleSlots: readonly Readonly<{
        slotId: string;
        releaseOrdinal: number;
        atlasId: string;
        cellKey: string;
        regionId: string;
        componentKey: string;
        tier: 1;
        regionOrderRank: number;
        allocationRank: number;
        active: false;
        legacySlotId?: number;
      }>[];
      resourceNodes: readonly Readonly<{
        nodeId: string;
        releaseOrdinal: number;
        atlasId: string;
        locationId: string;
        cellKey: string;
        regionId: string;
        componentKey: string;
        resourceKind: 'food' | 'wood' | 'stone' | 'gold';
        tier: 1;
        nodeOrdinal: number;
        allocationRank: number;
        legacyCatalogId?: string;
        policyVersion: string;
        active: false;
      }>[];
      importBatches: Readonly<{
        castleSlots: readonly Readonly<{
          batchOrdinal: number;
          firstRowOrdinal: number;
          rowCount: number;
          rowsSha256: string;
        }>[];
        resourceNodes: readonly Readonly<{
          batchOrdinal: number;
          firstRowOrdinal: number;
          rowCount: number;
          rowsSha256: string;
        }>[];
      }>;
      sectionDigests: Readonly<{
        cellsSha256: string;
        apronSha256: string;
        lodSha256: string;
        castleSlotsSha256: string;
        resourceNodesSha256: string;
      }>;
    }>;
  }>[];
}>;
const require = createRequire(import.meta.url);

function privateWorkspaceModule(): typeof import("./atlas/greater-realm-private-workspace") {
  const modulePath = `.${String.fromCodePoint(47)}atlas${String.fromCodePoint(47)}greater-realm-private-workspace`;
  return require(modulePath) as typeof import("./atlas/greater-realm-private-workspace");
}

function runtimeReleaseModule(): typeof import("./atlas/greater-realm-runtime-release") {
  const modulePath = `.${String.fromCodePoint(47)}atlas${String.fromCodePoint(47)}greater-realm-runtime-release`;
  return require(modulePath) as typeof import("./atlas/greater-realm-runtime-release");
}
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
  const { openExistingGreaterRealmPrivateWorkspace } = privateWorkspaceModule();
  const {
    readGenesis002GreaterRealmRuntimeRelease,
    readPtrGreaterRealmRuntimeRelease,
    verifyGenesis002GreaterRealmRuntimeReleaseArtifacts,
    verifyPtrGreaterRealmRuntimeReleaseArtifacts,
  } = runtimeReleaseModule();
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

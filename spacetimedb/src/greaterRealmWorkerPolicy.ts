import { sha256Hex } from './sha256';

const U64_MAX = 0xffff_ffff_ffff_ffffn;
const U32_MAX = 0xffff_ffff;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const DISPATCH_RECEIPT_PATTERN =
  /^dispatch-v2:(0|[1-9][0-9]{0,19}):((?:[1-9]|[12][0-9]|3[0-2])):([0-9a-f]{64}):([0-9a-f]{64})$/u;

export const GREATER_REALM_WORKER_DISPATCH_COMMAND_VERSION = 'dispatch-v2';

export class GreaterRealmWorkerPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmWorkerPolicyError';
  }
}

function fail(code: string): never {
  throw new GreaterRealmWorkerPolicyError(code);
}

function requireU64(value: bigint, code: string): bigint {
  if (typeof value !== 'bigint' || value < 0n || value > U64_MAX) fail(code);
  return value;
}

function requireU32(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > U32_MAX) fail(code);
  return value;
}

function requireResourceKind(value: string): string {
  if (value !== 'food' && value !== 'wood' && value !== 'stone' && value !== 'gold') {
    fail('GREATER_REALM_WORKER_RESOURCE_INVALID');
  }
  return value;
}

function requireLocationId(value: string): string {
  if (!/^GRL-[A-Z2-7]{26}$/u.test(value)) {
    fail('GREATER_REALM_PUBLIC_CAPACITY_LOCATION_INVALID');
  }
  return value;
}

function requireWorkerId(value: string): string {
  if (!/^genesis-001-castle-[0-9]+-worker-0[1-4]$/u.test(value)) {
    fail('GREATER_REALM_WORKER_ID_INVALID');
  }
  return value;
}

function requireSha256(value: string, code: string): string {
  if (!SHA256_PATTERN.test(value)) fail(code);
  return value;
}

/**
 * Private-only commitment over the exact immutable capacity group. The
 * component key remains private topology, so this digest may live only in the
 * private command receipt and must never enter a reducer result or projection.
 */
export type GreaterRealmWorkerCapacityDigestInputV1 = Readonly<{
  atlasId: string;
  atlasRevision: bigint;
  locationId: string;
  cellKey: string;
  regionId: string;
  componentKey: string;
  resourceKind: string;
  tier: number;
  policyVersion: string;
  nodeCount: number;
}>;

function framed(values: readonly (string | number | bigint)[]): string {
  return values.map((value) => {
    const serialized = value.toString();
    return `${serialized.length}:${serialized}`;
  }).join('|');
}

export function greaterRealmWorkerCapacityDigestV1(
  input: GreaterRealmWorkerCapacityDigestInputV1,
): string {
  requireU64(input.atlasRevision, 'GREATER_REALM_WORKER_REVISION_INVALID');
  requireLocationId(input.locationId);
  requireResourceKind(input.resourceKind);
  requireU32(input.tier, 'GREATER_REALM_WORKER_TIER_INVALID');
  if (
    input.atlasId.length === 0
    || input.atlasId.length > 128
    || input.cellKey.length === 0
    || input.cellKey.length > 128
    || input.regionId.length === 0
    || input.regionId.length > 128
    || input.componentKey.length === 0
    || input.componentKey.length > 128
    || input.policyVersion.length === 0
    || input.policyVersion.length > 64
    || !Number.isSafeInteger(input.nodeCount)
    || input.nodeCount < 1
    || input.nodeCount > 32
  ) fail('GREATER_REALM_WORKER_CAPACITY_INPUT_INVALID');
  return sha256Hex(`${framed([
    'warpkeep.greater-realm.worker-capacity.v1',
    input.atlasId,
    input.atlasRevision,
    input.locationId,
    input.cellKey,
    input.regionId,
    input.componentKey,
    input.resourceKind,
    input.tier,
    input.policyVersion,
    input.nodeCount,
  ])}\n`);
}

export type GreaterRealmWorkerDispatchFingerprintInputV2 = Readonly<{
  fid: bigint;
  castleId: bigint;
  workerId: string;
  resourceKind: string;
  locationId: string;
  expectedRevision: bigint;
}>;

/** Hash only exact authenticated/public reducer inputs; no private topology participates. */
export function greaterRealmWorkerDispatchFingerprintV2(
  input: GreaterRealmWorkerDispatchFingerprintInputV2,
): string {
  requireU64(input.fid, 'GREATER_REALM_WORKER_FID_INVALID');
  requireU64(input.castleId, 'GREATER_REALM_WORKER_CASTLE_INVALID');
  requireWorkerId(input.workerId);
  requireResourceKind(input.resourceKind);
  requireLocationId(input.locationId);
  requireU64(input.expectedRevision, 'GREATER_REALM_WORKER_REVISION_INVALID');
  return sha256Hex(`${framed([
    'warpkeep.greater-realm.worker-dispatch.v2',
    input.fid,
    input.castleId,
    input.workerId,
    input.resourceKind,
    input.locationId,
    input.expectedRevision,
  ])}\n`);
}

export type GreaterRealmWorkerDispatchReceiptMetadataV2 = Readonly<{
  expectedRevision: bigint;
  nodeCount: number;
  capacityDigest: string;
  fingerprint: string;
}>;

export function formatGreaterRealmWorkerDispatchReceiptKindV2(
  metadata: GreaterRealmWorkerDispatchReceiptMetadataV2,
): string {
  requireU64(metadata.expectedRevision, 'GREATER_REALM_WORKER_REVISION_INVALID');
  if (
    !Number.isSafeInteger(metadata.nodeCount)
    || metadata.nodeCount < 1
    || metadata.nodeCount > 32
  ) fail('GREATER_REALM_WORKER_NODE_COUNT_INVALID');
  requireSha256(metadata.capacityDigest, 'GREATER_REALM_WORKER_CAPACITY_DIGEST_INVALID');
  requireSha256(metadata.fingerprint, 'GREATER_REALM_WORKER_FINGERPRINT_INVALID');
  return `${GREATER_REALM_WORKER_DISPATCH_COMMAND_VERSION}:${metadata.expectedRevision.toString()}:${metadata.nodeCount}:${metadata.capacityDigest}:${metadata.fingerprint}`;
}

export function parseGreaterRealmWorkerDispatchReceiptKindV2(
  value: unknown,
): GreaterRealmWorkerDispatchReceiptMetadataV2 {
  if (typeof value !== 'string') fail('GREATER_REALM_WORKER_RECEIPT_INVALID');
  const match = DISPATCH_RECEIPT_PATTERN.exec(value);
  if (match === null) fail('GREATER_REALM_WORKER_RECEIPT_INVALID');
  let expectedRevision: bigint;
  try {
    expectedRevision = BigInt(match[1]!);
  } catch {
    return fail('GREATER_REALM_WORKER_RECEIPT_INVALID');
  }
  requireU64(expectedRevision, 'GREATER_REALM_WORKER_RECEIPT_INVALID');
  const nodeCount = Number(match[2]);
  if (!Number.isSafeInteger(nodeCount) || nodeCount < 1 || nodeCount > 32) {
    fail('GREATER_REALM_WORKER_RECEIPT_INVALID');
  }
  return Object.freeze({
    expectedRevision,
    nodeCount,
    capacityDigest: match[3]!,
    fingerprint: match[4]!,
  });
}

export function greaterRealmWorkerPolicyErrorCode(error: unknown): string | undefined {
  return error instanceof GreaterRealmWorkerPolicyError ? error.code : undefined;
}

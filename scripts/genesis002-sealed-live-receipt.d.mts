export const GENESIS_002_SEALED_LIVE_TARGET: Readonly<{
  uri: 'https://maincloud.spacetimedb.com';
  bridge: 'https://auth.warpkeep.com';
  databaseAlias: 'warpkeep-genesis-002';
  moduleIdentity: 'warpkeep-genesis-002-sealed-v1';
  genesis001DatabaseIdentity: string;
}>;
export const GENESIS_002_SEALED_LIVE_PROFILE:
  'warpkeep-genesis-002-sealed-live-v1';
export class Genesis002SealedLiveReceiptError extends Error {
  readonly code: string;
}
export function genesis002SealedLiveReceiptDigest(receipt: unknown): string;
export function parseGenesis002SealedLiveArguments(
  values: readonly string[],
): Readonly<{
  databaseIdentity: string;
  moduleSourceCommit: string;
  moduleSha256: string;
  atlasSourceCommit: string;
  publicReleaseId: string;
  publicApprovalReceiptId: string;
  releaseSha256: string;
  releaseHeaderSha256: string;
  verificationDigest: string;
}>;
export function verifyGenesis002SealedLiveStatus(
  input: Readonly<Record<string, unknown>>,
): Readonly<{
  receipt: Readonly<Record<string, unknown>>;
  receiptDigest: string;
}>;
export function verifyGenesis002FreshPublishStatus(
  input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>>;
export function verifyGenesis002ImportRealmBoundary(
  input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>>;

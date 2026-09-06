export const GENESIS001_CHECKED_FROZEN_WRITERS: readonly [
  'admin_allow_fid', 'admin_admit_founder_v1', 'admin_disable_fid',
  'admin_bump_auth_epoch', 'access_request_submit_v1', 'admin_reset_access_request_v1',
];

export class Genesis001LocalUpgradeProofError extends Error { readonly code: string; }

export function decodeGenesis001BoundedJson(
  body: Uint8Array, maximumBytes: number, code?: string,
): unknown;

export function assertGenesis001FrozenWriterObservation(value: Readonly<{
  writer: string; status: number; text: string; before: unknown; after: unknown;
}>): void;

export function terminateGenesis001LocalProofProcessGroup(
  child: Readonly<{ pid?: number; kill(...args: readonly unknown[]): unknown }>,
  grace?: number,
): Promise<void>;

export function runGenesis001LocalUpgradeProof(input: Readonly<{
  cliPath: string;
  baselineArtifactPath: string;
  frozenArtifactPath: string;
  operationRoot: string;
  environment: Readonly<Record<string, string | undefined>>;
  verifyExecutables(): void;
}>): Promise<Readonly<{
  baselineDescriptorSha256: string;
  frozenDescriptorSha256: string;
  checkedFrozenWriters: typeof GENESIS001_CHECKED_FROZEN_WRITERS;
}>>;

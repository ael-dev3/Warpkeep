export const SEALED_REALMS_OPERATIONS: readonly [
  'preflight',
  'g001-policy-observe',
  'g001-census-first',
  'g001-census-second-inspect',
  'g001-census-second-suspend',
  'g001-current-state',
  'g002-publish-inspect',
  'g002-publish-apply',
  'g002-import-inspect',
  'g002-import-apply',
  'g002-live-inspect',
  'ptr-publish-inspect',
  'ptr-publish-apply',
  'ptr-import-inspect',
  'ptr-import-apply',
  'ptr-owner-provision-inspect',
  'ptr-owner-provision',
  'ptr-live-inspect',
  'activation-evidence-inspect',
  'activation-evidence-generate',
];
export const SEALED_REALMS_ACTIVATED_OPERATIONS: readonly [
  'preflight',
  'g001-current-state',
  'g002-live-inspect',
  'ptr-live-inspect',
];

export class SealedRealmsProductionSourceAuthorityError extends Error {
  readonly code: string;
  constructor(code: string);
}

declare const sealedRealmsSourceAuthority: unique symbol;
export type SealedRealmsProductionSourceAuthority = Readonly<{
  readonly mode: 'S' | 'A';
  readonly operation: (typeof SEALED_REALMS_OPERATIONS)[number];
  readonly authorityDigest: string;
  readonly [sealedRealmsSourceAuthority]: true;
}>;

export function parseSealedRealmsActivatedRawDiff(
  value: Uint8Array | string,
): readonly string[];

export function authenticateSealedRealmsProductionSourceAuthority(input: Readonly<{
  operation: (typeof SEALED_REALMS_OPERATIONS)[number];
  workflowInputSha: string;
  readGit: (arguments_: readonly string[]) => Uint8Array | string;
  readBinding: (commit: string) => Readonly<Record<string, unknown>>;
  verifyEvidence: (commit: string) => Readonly<{ verifiedSha: string }>;
}>): SealedRealmsProductionSourceAuthority;

export function sourceCommitFromSealedRealmsProductionAuthority(
  authority: SealedRealmsProductionSourceAuthority,
): string;

/** The authenticated S parent for either S itself or a valid A child. */
export function preparationSourceCommitFromSealedRealmsProductionAuthority(
  authority: SealedRealmsProductionSourceAuthority,
): string;

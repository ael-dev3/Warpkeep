export type RecoverySourceClosureEntry = Readonly<{
  path: string;
  mode: "100644" | "100755";
  oid: string;
  byteLength: number;
  sha256: string;
}>;
export type RecoverySourceClosure = Readonly<{
  schemaVersion: 1;
  profile: "warpkeep-0.4.0-recovery-source-closure-v1";
  sourceCommit: string;
  sourceTree: string;
  entries: readonly RecoverySourceClosureEntry[];
}>;
export const RECOVERY_SOURCE_CLOSURE_PROFILE: "warpkeep-0.4.0-recovery-source-closure-v1";
export const RECOVERY_SOURCE_CLOSURE_LIMITS: Readonly<{
  entries: number;
  pathBytes: number;
  blobBytes: number;
  totalBytes: number;
  artifactBytes: number;
}>;
export function validateRecoverySourceClosure(
  value: unknown,
): RecoverySourceClosure;
export function encodeRecoverySourceClosure(value: unknown): string;
export function parseRecoverySourceClosure(
  source: string,
): RecoverySourceClosure;
export function recoverySourceClosureSha256(source: string): string;

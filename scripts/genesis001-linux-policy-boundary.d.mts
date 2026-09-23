export const G001_POLICY_HOME: string;
export const G001_POLICY_ROOT: string;
export const G001_POLICY_NODE: string;
export const G001_POLICY_NODE_SHA: string;
export const G001_POLICY_OPERATOR: 'scripts/genesis001-policy-observation-receipt.mjs';
export const G001_CENSUS_OPERATOR: 'scripts/genesis001-linux-census-operator.ts';
export const G001_POLICY_ENV: Readonly<Record<string, string>>;
export function policyOperator(kind?: 'policy' | 'census'): string;
export type G001LinuxPolicyDiagnostic = 'g001-credential' | 'g001-host' | 'g001-source' | 'g001-closure'
  | 'g001-private-root' | 'g001-materialization' | 'g001-prepared-verification' | 'g001-authority'
  | 'g001-credential-descriptor' | 'g001-observation' | 'g001-receipt' | 'g001-cleanup'
  | 'g001-policy-state' | 'g001-policy-procedure' | 'g001-policy-transport'
  | 'g001-policy-credential' | 'g001-policy-authority' | 'g001-policy-budget'
  | 'g001-census-directory' | 'g001-applicant-collection' | 'g001-applicant-export' | 'g001-applicant-proof'
  | 'g001-admitted-identity' | 'g001-admitted-aggregate' | 'g001-admitted-enumeration'
  | 'g001-admitted-status' | 'g001-admitted-reconciliation' | 'g001-admitted-collection'
  | 'g001-policy-inspect' | 'g001-policy-cleanup'
  | 'g001-session-finalize';
export function policyFail(diagnostic?: G001LinuxPolicyDiagnostic): never;
export function policyPrivateAncestors(path: string): void;
export function policyDirectory(path: string, mode?: number): Readonly<Record<string, string>>;
export function policyDigest(bytes: Uint8Array): string;
export function policyOwnedRun(path: string, runId: string): void;
export function readPolicyRequest(): unknown;
export type G001LinuxPolicySource = Readonly<{ sourceCommit: string; sourceTree: string; operatorBlob: string; operatorSha256: string }>;
export function attestPolicySource(expected?: G001LinuxPolicySource, root?: string, kind?: 'policy' | 'census'): G001LinuxPolicySource;
export function attestPolicyHost(expected?: unknown, worker?: boolean): Readonly<Record<string, unknown>>;
export function policyGit(root: string, arguments_: readonly string[], buffer: true): Buffer;
export function policyGit(root: string, arguments_: readonly string[], buffer?: false): string;
export function policyInventory(root: string): Readonly<{ files: readonly unknown[]; directories: readonly unknown[] }>;
export function cleanupPolicyRun(root: string, runId: string): Readonly<{ outcome: 'cleaned'; runId: string; namespaceInventorySha256: string }>;

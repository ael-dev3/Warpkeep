/** Candidate source bytes only; not installed or authenticated release evidence. */
export function derivePreparedClosureInventorySource(options: Readonly<{ repositoryRoot: string }>): Readonly<{
  path: 'scripts/auth-bridge-notification-prepared-deploy-closure.mjs';
  bytes: Uint8Array;
  memberCount: number;
}>;

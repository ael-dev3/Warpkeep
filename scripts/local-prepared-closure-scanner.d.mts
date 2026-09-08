/** Fixed Linux toolchain only; install before importing the closure scanner. */
export function installPreparedClosureScanner(): Readonly<{
  profile: 'warpkeep-prepared-closure-scanner-linux-x64-v1';
  root: string;
  manifestSha256: string;
  assertUnchanged(): void;
  release(): void;
}>;

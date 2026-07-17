export function writePinnedCacheFile(input: Readonly<{
  destination: string;
  bytes: Buffer;
  mode: 0o600 | 0o700;
  label?: string;
}>): void;

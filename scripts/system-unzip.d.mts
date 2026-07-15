import type { Stats } from 'node:fs';

export const SYSTEM_UNZIP_CANDIDATES: Readonly<Record<string, readonly string[]>>;

export function resolveAttestedSystemUnzip(options?: Readonly<{
  platform?: string;
  candidates?: readonly string[];
  lstat?: (path: string) => Stats;
  access?: (path: string, mode: number) => void;
}>): string;

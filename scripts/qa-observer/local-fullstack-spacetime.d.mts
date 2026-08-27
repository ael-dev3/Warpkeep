import type { ChildProcess } from 'node:child_process';

export type LocalFullstackProcessHandle = Readonly<{
  exitCode: number | null;
  kill(signal?: NodeJS.Signals | number): boolean;
  once(event: 'close', listener: (...arguments_: unknown[]) => void): unknown;
  pid?: number;
  signalCode: NodeJS.Signals | null;
}>;

export const LOCAL_FULLSTACK_DATABASE: 'warpkeep-local-fullstack';
export const LOCAL_FULLSTACK_ISSUER: 'http://127.0.0.1';
export const LOCAL_FULLSTACK_AUDIENCE: 'warpkeep-spacetimedb';
export const LOCAL_FULLSTACK_FID: number;
export const LOCAL_FULLSTACK_PROFILE_URL: string;
export const LOCAL_FULLSTACK_FOUNDER_COUNT: number;
export const LOCAL_FULLSTACK_WORKER_COUNT: number;
export const LOCAL_FULLSTACK_INNER_KEEP_RESOURCES: Readonly<Record<string, bigint>>;

export class LocalFullstackRuntimeError extends Error {}

export function runDisposableLocalFullstackCli(
  executable: string,
  arguments_: readonly string[],
  options: Readonly<{
    environment: Readonly<Record<string, string>>;
    timeout?: number;
    secrets?: readonly string[];
    onProcess?: (child: ChildProcess | undefined, previous?: ChildProcess) => void;
  }>,
): Promise<Readonly<{ code: number }>>;

export function terminateLocalFullstackProcessGroup(
  child: LocalFullstackProcessHandle | undefined,
  options?: Readonly<Record<string, unknown>>,
): Promise<void>;

export function startDisposableLocalFullstackSpacetime(
  options?: Readonly<Record<string, unknown>>,
): Promise<Readonly<Record<string, unknown>>>;

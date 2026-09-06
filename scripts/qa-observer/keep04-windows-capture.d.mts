export function validateChromeIdentity(value: unknown): unknown;
export function readWindowsChromeIdentity(): Promise<unknown>;
export function readWindowsCaptureSource(): Promise<{ commit: string; tree: string; substantiveDirty: boolean; untrackedRelevantCount: number }>;
export function sameChromeIdentity(left: unknown, right: unknown): boolean;
export function windowsChromeLaunchContract(profile: string): { executable: string; args: string[]; options: { env: Record<string, string>; shell: boolean; windowsHide: boolean; detached: boolean; stdio: string[] } };
export function createKeep04NetworkGuard(): { expectNavigation(url: string): void; setTarget(id: string): void; event(method: string, params: unknown, session: unknown): void; drain(): Promise<void>; assert(): void; snapshot(): unknown };
export function runKeep04WindowsCapture(args: readonly string[], operations?: unknown): Promise<unknown>;

export type Keep04CaptureRun = Readonly<{ id: string; directory: string }>;
export function createKeep04CaptureRun(): Promise<Keep04CaptureRun>;
export function createKeep04WindowsProfile(): Promise<string>;
export function writeKeep04RunFile(run: object, filename: string, contents: string | Uint8Array): Promise<void>;

export class LocalBindingBoundedFileError extends Error {
  readonly code: string;
}

export interface LocalBindingFileIdentity {
  readonly dev: string;
  readonly ino: string;
  readonly mode: string;
  readonly uid: string;
  readonly nlink: string;
  readonly size: string;
  readonly mtimeNs: string;
  readonly ctimeNs: string;
}

export function readLocalBindingBoundedFile(path: string, options: Readonly<{
  maximumBytes: number;
  minimumBytes?: number;
  expectedBytes?: number;
  expectedSha256?: string;
  expectedMode?: number;
  expectedUid?: number;
  expectedIdentity?: LocalBindingFileIdentity;
  requireExecutable?: boolean;
  rejectWritableExecutable?: boolean;
  discardBody?: boolean;
}>): Readonly<{ body: Buffer; identity: LocalBindingFileIdentity }>;

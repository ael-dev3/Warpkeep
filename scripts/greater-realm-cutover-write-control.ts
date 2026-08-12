export class GreaterRealmCutoverWriteNotStartedError extends Error {
  readonly writeStarted = false as const;

  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmCutoverWriteNotStartedError';
  }
}

export function isGreaterRealmCutoverWriteNotStartedError(
  error: unknown,
): error is GreaterRealmCutoverWriteNotStartedError {
  return error instanceof GreaterRealmCutoverWriteNotStartedError || (
    error !== null
    && typeof error === 'object'
    && (error as Readonly<Record<string, unknown>>).name
      === 'GreaterRealmCutoverWriteNotStartedError'
    && (error as Readonly<Record<string, unknown>>).writeStarted === false
    && typeof (error as Readonly<Record<string, unknown>>).code === 'string'
  );
}

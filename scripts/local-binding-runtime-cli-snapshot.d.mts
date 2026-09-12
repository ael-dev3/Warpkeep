export interface OperationOwnedCliSnapshot {
  readonly path: string;
  readonly directory: string;
  verify(): void;
}

export function bindOperationOwnedCliSnapshot(
  source: Readonly<{
    path: string;
    directory: string;
    verify(): void;
  }>,
  operationRoot: string,
): OperationOwnedCliSnapshot;

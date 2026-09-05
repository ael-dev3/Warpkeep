export interface FixedFixtureOutputTransaction {
  stage(path: string, bytes: Uint8Array): Promise<void>
  commit(): Promise<void>
  rollback(): Promise<void>
}

export interface FixedFixtureOutputStore {
  read(path: string): Promise<Uint8Array>
  recover(): Promise<void>
  begin(paths: readonly string[]): Promise<FixedFixtureOutputTransaction>
}

export function createFixedFixtureOutputStore(input: Readonly<{
  repositoryRoot: string
  paths: readonly string[]
}>): FixedFixtureOutputStore

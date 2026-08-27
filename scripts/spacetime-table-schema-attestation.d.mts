export class TableSchemaAttestationError extends Error {}

export type CanonicalTableSchemaBoundary = Readonly<{
  protocol: 'warpkeep-table-schema-boundary-v1';
  tables: readonly Readonly<Record<string, unknown>>[];
  reachableTypes: readonly Readonly<{
    ref: number;
    type: Readonly<Record<string, unknown>>;
  }>[];
}>;

export function canonicalTableSchemaBoundary(
  description: Readonly<Record<string, unknown>>,
  expectedTableNames: readonly string[],
): CanonicalTableSchemaBoundary;

export function canonicalTableSchemaBoundaryDigest(
  description: Readonly<Record<string, unknown>>,
  expectedTableNames: readonly string[],
): string;

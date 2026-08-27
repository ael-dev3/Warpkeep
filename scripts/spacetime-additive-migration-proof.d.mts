export type AdditiveMigrationProofReceipt = Readonly<{
  summary: string;
  v11TableSchemaDigest: string;
  v12TableSchemaDigest: string;
  v13TableSchemaDigest: string;
  v14TableSchemaDigest: string;
  v15TableSchemaDigest: string;
  v16TableSchemaDigest: string;
  v17TableSchemaDigest: string;
  currentCandidateTableSchemaDigest: string;
  artifactDigest: string;
}>;

export function parseAdditiveMigrationProofReceipt(
  output: string,
): AdditiveMigrationProofReceipt;

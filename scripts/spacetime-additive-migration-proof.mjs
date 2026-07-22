const SHA256_DIGEST = /^[0-9a-f]{64}$/;
const V11_TABLE_SCHEMA_RECEIPT_FIELD = 'v11_table_schema_sha256';
const V12_TABLE_SCHEMA_RECEIPT_FIELD = 'v12_table_schema_sha256';
const ARTIFACT_RECEIPT_FIELD = 'artifact_sha256';
const RECEIPT_FIELDS = Object.freeze([
  V11_TABLE_SCHEMA_RECEIPT_FIELD,
  V12_TABLE_SCHEMA_RECEIPT_FIELD,
  ARTIFACT_RECEIPT_FIELD,
]);
const INVALID_RECEIPT_MESSAGE =
  'The current additive migration proof did not produce its exact success receipt.';

export const ADDITIVE_MIGRATION_PROOF_PROTOCOL_VERSION = 12;
export const ADDITIVE_MIGRATION_PROOF_SPACETIME_CLI_VERSION = '2.6.1';
// The compiled lifecycle lane includes a nine-minute route and one complete
// gathering minute. Keep a bounded margin for server startup and cleanup.
export const ADDITIVE_MIGRATION_PROOF_PROCESS_TIMEOUT_MILLISECONDS = 15 * 60 * 1_000;

const SUCCESS_PREFIX =
  `Additive protocol-v${ADDITIVE_MIGRATION_PROOF_PROTOCOL_VERSION} migration proof passed with SpacetimeDB ${ADDITIVE_MIGRATION_PROOF_SPACETIME_CLI_VERSION}:`;

function rejectReceipt() {
  throw new Error(INVALID_RECEIPT_MESSAGE);
}

export function formatAdditiveMigrationProofReceipt({
  summary,
  v11TableSchemaDigest,
  v12TableSchemaDigest,
  artifactDigest,
}) {
  if (
    typeof summary !== 'string'
    || summary.length === 0
    || summary.trim() !== summary
    || /[\r\n]/.test(summary)
    || RECEIPT_FIELDS.some(field => summary.includes(`${field}=`))
    || typeof v11TableSchemaDigest !== 'string'
    || !SHA256_DIGEST.test(v11TableSchemaDigest)
    || typeof v12TableSchemaDigest !== 'string'
    || !SHA256_DIGEST.test(v12TableSchemaDigest)
    || typeof artifactDigest !== 'string'
    || !SHA256_DIGEST.test(artifactDigest)
  ) {
    rejectReceipt();
  }
  return `${SUCCESS_PREFIX} ${summary} `
    + `${V11_TABLE_SCHEMA_RECEIPT_FIELD}=${v11TableSchemaDigest} `
    + `${V12_TABLE_SCHEMA_RECEIPT_FIELD}=${v12TableSchemaDigest} `
    + `${ARTIFACT_RECEIPT_FIELD}=${artifactDigest}`;
}

export function parseAdditiveMigrationProofReceipt(output) {
  if (typeof output !== 'string') rejectReceipt();

  const proofLines = output.split(/\r?\n/).filter(line => (
    /^Additive protocol-v\d+ migration proof passed with SpacetimeDB /.test(line)
  ));
  const digestFields = Object.fromEntries(RECEIPT_FIELDS.map(field => [
    field,
    [...output.matchAll(new RegExp(`\\b${field}=([^\\s]*)`, 'g'))],
  ]));
  if (
    proofLines.length !== 1
    || RECEIPT_FIELDS.some(field => digestFields[field].length !== 1)
  ) rejectReceipt();

  const proofLine = proofLines[0];
  const v11TableSchemaDigest = digestFields[V11_TABLE_SCHEMA_RECEIPT_FIELD][0][1];
  const v12TableSchemaDigest = digestFields[V12_TABLE_SCHEMA_RECEIPT_FIELD][0][1];
  const artifactDigest = digestFields[ARTIFACT_RECEIPT_FIELD][0][1];
  const receiptSuffix = ` ${V11_TABLE_SCHEMA_RECEIPT_FIELD}=${v11TableSchemaDigest}`
    + ` ${V12_TABLE_SCHEMA_RECEIPT_FIELD}=${v12TableSchemaDigest}`
    + ` ${ARTIFACT_RECEIPT_FIELD}=${artifactDigest}`;
  if (
    !proofLine.startsWith(`${SUCCESS_PREFIX} `)
    || !SHA256_DIGEST.test(v11TableSchemaDigest)
    || !SHA256_DIGEST.test(v12TableSchemaDigest)
    || !SHA256_DIGEST.test(artifactDigest)
    || !proofLine.endsWith(receiptSuffix)
    || proofLine.slice(SUCCESS_PREFIX.length + 1, -receiptSuffix.length).length === 0
  ) {
    rejectReceipt();
  }

  return Object.freeze({
    v11TableSchemaDigest,
    v12TableSchemaDigest,
    artifactDigest,
  });
}

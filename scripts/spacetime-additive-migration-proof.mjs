const SHA256_DIGEST = /^[0-9a-f]{64}$/;
const RECEIPT_FIELD = 'artifact_sha256';
const INVALID_RECEIPT_MESSAGE =
  'The current additive migration proof did not produce its exact success receipt.';

export const ADDITIVE_MIGRATION_PROOF_PROTOCOL_VERSION = 11;
export const ADDITIVE_MIGRATION_PROOF_SPACETIME_CLI_VERSION = '2.6.1';
// The compiled lifecycle lane includes a nine-minute route and one complete
// gathering minute. Keep a bounded margin for server startup and cleanup.
export const ADDITIVE_MIGRATION_PROOF_PROCESS_TIMEOUT_MILLISECONDS = 15 * 60 * 1_000;

const SUCCESS_PREFIX =
  `Additive protocol-v${ADDITIVE_MIGRATION_PROOF_PROTOCOL_VERSION} migration proof passed with SpacetimeDB ${ADDITIVE_MIGRATION_PROOF_SPACETIME_CLI_VERSION}:`;

function rejectReceipt() {
  throw new Error(INVALID_RECEIPT_MESSAGE);
}

export function formatAdditiveMigrationProofReceipt({ summary, artifactDigest }) {
  if (
    typeof summary !== 'string'
    || summary.length === 0
    || summary.trim() !== summary
    || /[\r\n]/.test(summary)
    || summary.includes(`${RECEIPT_FIELD}=`)
    || typeof artifactDigest !== 'string'
    || !SHA256_DIGEST.test(artifactDigest)
  ) {
    rejectReceipt();
  }
  return `${SUCCESS_PREFIX} ${summary} ${RECEIPT_FIELD}=${artifactDigest}`;
}

export function parseAdditiveMigrationProofReceipt(output) {
  if (typeof output !== 'string') rejectReceipt();

  const proofLines = output.split(/\r?\n/).filter(line => (
    /^Additive protocol-v\d+ migration proof passed with SpacetimeDB /.test(line)
  ));
  const digestFields = [...output.matchAll(/\bartifact_sha256=([^\s]*)/g)];
  if (proofLines.length !== 1 || digestFields.length !== 1) rejectReceipt();

  const proofLine = proofLines[0];
  const artifactDigest = digestFields[0][1];
  const receiptSuffix = ` ${RECEIPT_FIELD}=${artifactDigest}`;
  if (
    !proofLine.startsWith(`${SUCCESS_PREFIX} `)
    || !SHA256_DIGEST.test(artifactDigest)
    || !proofLine.endsWith(receiptSuffix)
    || proofLine.slice(SUCCESS_PREFIX.length + 1, -receiptSuffix.length).length === 0
  ) {
    rejectReceipt();
  }

  return Object.freeze({ artifactDigest });
}

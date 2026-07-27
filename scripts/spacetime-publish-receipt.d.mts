export const SPACETIME_PUBLISH_RECEIPT_TARGET: Readonly<{
  uri: string;
  database: string;
  deleteData: string;
}>;
export const SPACETIME_PUBLISH_RECEIPT_KIND: string;
export class SpacetimePublishReceiptError extends Error {
  readonly code: string;
}
export function defaultSpacetimePublishReceiptDirectory(): string;
export function writePrivateSpacetimePublishSuccessReceipt(input: Readonly<{
  directory: string;
  repositoryRoot: string;
  artifactDigest: string;
  v12TableSchemaDigest: string;
  workerForwardRepair: string;
  postPublicationCheckpoint: string;
  now?: Date;
}>): Readonly<{
  artifactDigest: string;
  v12TableSchemaDigest: string;
  recordedAt: string;
  postPublicationCheckpoint: string;
  receiptDigest: string;
}>;
export function readPrivateSpacetimePublishSuccessReceipt(input: Readonly<{
  directory: string;
  repositoryRoot: string;
  artifactDigest: string;
  now?: Date;
}>): Readonly<{
  artifactDigest: string;
  v12TableSchemaDigest: string;
  recordedAt: string;
  postPublicationCheckpoint: string;
  receiptDigest: string;
}>;

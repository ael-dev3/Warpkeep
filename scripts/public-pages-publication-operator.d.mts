export declare class PublicPagesPublicationError extends Error {
  readonly code: string;
}

type Common = {
  publicRoot: string;
  reviewedPlanBytes: Buffer;
  expectedReviewedPlanSha256: string;
  expectedSignerFingerprint: string;
  expectedSignerIdentity: string;
};

type RemoteActions = {
  readRemoteHead?: (publicRoot: string) => string;
  pushCommit?: (publicRoot: string, commit: string) => void;
};

export declare function preparePublicPagesPublication(options: Common & {
  sourceRoot: string;
}): Readonly<{
  publicCommit: string;
  publicTree: string;
  publicParentCommit: string;
  reviewedPlanSha256: string;
}>;

export declare function publishPublicPagesPublication(options: Common & RemoteActions & {
  expectedPublicCommit: string;
}): Readonly<{
  publicCommit: string;
  publicTree: string;
  localHead: string;
  remoteHead: string;
}>;

export declare function preparePublicPagesRollback(options: Common & {
  expectedPublishedCommit: string;
}): Readonly<{
  rollbackCommit: string;
  rollbackTree: string;
  publishedCommit: string;
  reviewedPlanSha256: string;
}>;

export declare function publishPublicPagesRollback(options: Common & RemoteActions & {
  expectedPublishedCommit: string;
  expectedRollbackCommit: string;
}): Readonly<{
  publicCommit: string;
  publicTree: string;
  localHead: string;
  remoteHead: string;
}>;

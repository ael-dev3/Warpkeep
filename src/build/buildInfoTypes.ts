export type WarpkeepReleaseChannel = 'alpha';

export type WarpkeepBuildInfo = Readonly<{
  channel: WarpkeepReleaseChannel;
  version: string;
  fullSha?: string;
  shortSha: string;
  commitUrl?: string;
  realm: 'GENESIS 001';
}>;

export type WarpkeepBuildInfoInput = Readonly<{
  productVersion: unknown;
  releaseChannel?: unknown;
  buildSha?: unknown;
  repositoryUrl?: unknown;
}>;

export class Genesis001LocalNodeBootstrapError extends Error {
  readonly code: string;
}

export interface PreparedGenesis001Node {
  readonly profile: 'warpkeep-genesis001-local-node-bootstrap-linux-x64-v1';
  readonly sourceCommit: string;
  readonly sourceTree: string;
  readonly nodeVersion: '24.19.0';
  readonly nodeSha256: string;
  readonly installed: boolean;
}

export function bootstrapGenesis001LocalNode(): Promise<PreparedGenesis001Node>;

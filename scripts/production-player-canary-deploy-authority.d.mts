export declare const PRODUCTION_PLAYER_CANARY_DEPLOY_AUTHORITY_PROFILE:
  'warpkeep-production-player-canary-deploy-authority-v1';
export declare const PRODUCTION_PLAYER_CANARY_DEPLOY_STATE_CHILD:
  'production-player-canary-deploy-v1';
export declare const PRODUCTION_PLAYER_CANARY_ACTIVATION_REQUEST_BASENAME:
  'activation-request-v1.json';
export declare const PRODUCTION_PLAYER_CANARY_LAUNCH_SECRETS_CHILD:
  'launch-secrets-v1';

export declare class ProductionPlayerCanaryDeployAuthorityError extends Error {
  readonly code: string;
}

export declare function parseProductionPlayerCanaryActivationRequest(
  value: unknown,
): Readonly<Record<string, unknown>>;

export declare function writeProductionPlayerCanaryActivationRequest(
  input: Readonly<{
    request: Readonly<Record<string, unknown>>;
    now?: Date;
  }>,
): Promise<Readonly<{ activationRequestDigest: string }>>;

export declare function inspectProductionPlayerCanaryDeployAuthority(
  input: Readonly<{
    contract: Readonly<Record<string, unknown>>;
    repositoryRoot: string;
    now?: Date;
  }>,
): Promise<Readonly<{
  authority: Readonly<Record<string, string | number | boolean>>;
  authorityDigest: string;
}>>;

export declare const productionPlayerCanaryDeployAuthorityTestSeams: Readonly<{
  fixedPrivateFile: (
    path: string,
    maximumBytes: number,
    code: string,
  ) => Buffer;
  inspectActivationAfterEvidence: (
    input: Readonly<{
      acquireEvidenceAuthority: () => Promise<Readonly<Record<string, unknown>>>;
      activationInput: Readonly<Record<string, unknown>>;
      candidatePagesSourceCommit: string;
      predecessorPagesSourceCommit: string;
    }>,
    dependencies?: Readonly<{
      trustedClock?: () => Date;
      inspectActivationAuthority?: (
        input: Readonly<Record<string, unknown>>,
      ) => Readonly<Record<string, string | number | boolean>>;
      requireFreshActivationAuthority?: (
        authority: unknown,
        input: Readonly<Record<string, unknown>>,
      ) => unknown;
      activationAuthorityDigest?: (authority: unknown) => string;
    }>,
  ) => Promise<Readonly<{
    authority: Readonly<Record<string, string | number | boolean>>;
    authorityDigest: string;
  }>>;
  readCanonicalRequest: (path: string) => Readonly<Record<string, unknown>>;
  publishCanonicalRequest: (
    stateDirectory: string,
    request: Readonly<Record<string, unknown>>,
  ) => Readonly<{ activationRequestDigest: string }>;
  requireInspectedActivationRequestReferences: (
    request: Readonly<Record<string, unknown>>,
    inspectedPlan: Readonly<Record<string, unknown>>,
    inspectedApproval: Readonly<Record<string, unknown>>,
  ) => Readonly<Record<string, unknown>>;
}> | undefined;

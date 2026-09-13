import type {
  SealedRealmsProductionSourceAuthority,
} from './sealed-realms-production-source-authority.mjs';

export const SEALED_REALMS_PRODUCTION_REPOSITORY: 'ael-dev3/Warpkeep';
export const SEALED_REALMS_PRODUCTION_WORKFLOW_PATH:
  '.github/workflows/sealed-realms-production.yml';
export const SEALED_REALMS_PRODUCTION_WORKFLOW_PHASES: readonly [
  'permit-issue',
  'ptr-observation',
  'ptr-update-observation',
  'g002-update-observation',
  'continuation-issue',
  'continuation-claim',
  'continuation-effect',
  'continuation-terminal',
  'continuation-reconcile',
  'continuation-reconcile-terminal',
];

export class SealedRealmsProductionWorkflowAuthorityError extends Error {
  readonly code: string;
  constructor(code: string);
}

declare const sealedRealmsProductionWorkflowPermit: unique symbol;
export type SealedRealmsProductionWorkflowPermit = Readonly<{
  readonly [sealedRealmsProductionWorkflowPermit]: true;
}>;

export function issueSealedRealmsProductionWorkflowPermit(input: Readonly<{
  sourceAuthority: SealedRealmsProductionSourceAuthority;
  githubToken: string;
  runId: string;
  runAttempt: string | number;
  fetchImpl?: typeof fetch;
  isInterrupted?: () => boolean;
}>): Promise<SealedRealmsProductionWorkflowPermit>;

export function attestSealedRealmsProductionWorkflowPermit(input: Readonly<{
  permit: SealedRealmsProductionWorkflowPermit;
  sourceAuthority: SealedRealmsProductionSourceAuthority;
  phase: Exclude<
    (typeof SEALED_REALMS_PRODUCTION_WORKFLOW_PHASES)[number],
    'permit-issue' | 'continuation-reconcile' | 'continuation-reconcile-terminal'
  >;
  runId: string;
  runAttempt: string | number;
}> | Readonly<{
  permit: SealedRealmsProductionWorkflowPermit;
  sourceAuthority: SealedRealmsProductionSourceAuthority;
  phase: 'continuation-reconcile' | 'continuation-reconcile-terminal';
  runId: string;
  runAttempt: string | number;
  claimRunId: string;
  claimRunAttempt: string | number;
}>): Promise<true>;

export function assertSealedRealmsProductionWorkflowPermit(
  permit: unknown,
): SealedRealmsProductionWorkflowPermit;

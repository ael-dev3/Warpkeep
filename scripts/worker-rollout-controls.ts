import {
  CASTLE_WORKER_RESOURCE_CATALOG_DIGEST,
  type CastleWorkerRolloutPhase,
  type WorkerActivationSnapshot,
  type WorkerClientAttestation,
  workerActivationBlockers,
} from '../spacetimedb/src/castleWorkerRolloutPolicy';

export class WorkerRolloutControlError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'WorkerRolloutControlError';
  }
}

function fail(code: string): never {
  throw new WorkerRolloutControlError(code);
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('WORKER_ROLLOUT_STATUS_INVALID');
  }
  return value as Readonly<Record<string, unknown>>;
}

function bigintField(
  row: Readonly<Record<string, unknown>>,
  key: string,
): bigint {
  const value = row[key];
  if (typeof value !== 'bigint' || value < 0n) {
    fail('WORKER_ROLLOUT_STATUS_INVALID');
  }
  return value;
}

function numberField(
  row: Readonly<Record<string, unknown>>,
  key: string,
): number {
  const value = row[key];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    fail('WORKER_ROLLOUT_STATUS_INVALID');
  }
  return value as number;
}

function stringField(
  row: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const value = row[key];
  if (typeof value !== 'string') fail('WORKER_ROLLOUT_STATUS_INVALID');
  return value;
}

function booleanField(
  row: Readonly<Record<string, unknown>>,
  key: string,
): boolean {
  const value = row[key];
  if (typeof value !== 'boolean') fail('WORKER_ROLLOUT_STATUS_INVALID');
  return value;
}

export type WorkerRolloutOperatorStatus = WorkerActivationSnapshot & Readonly<{
  resourceCatalogDigest: string;
  legacyGoldExpeditions: bigint;
  legacyFoodExpeditions: bigint;
  legacyWoodExpeditions: bigint;
  legacyStoneExpeditions: bigint;
  legacyGoldOccupations: bigint;
  legacyFoodOccupations: bigint;
  legacyWoodOccupations: bigint;
  legacyStoneOccupations: bigint;
  legacyGoldSchedules: bigint;
  legacyFoodSchedules: bigint;
  legacyWoodSchedules: bigint;
  legacyStoneSchedules: bigint;
}>;

/** Validate the aggregate-only server procedure before an operator uses it. */
export function projectWorkerRolloutOperatorStatus(
  value: unknown,
): WorkerRolloutOperatorStatus {
  const row = record(value);
  const phase = stringField(row, 'phase');
  if (
    phase !== 'absent'
    && phase !== 'staged'
    && phase !== 'draining'
    && phase !== 'active'
    && phase !== 'invalid'
  ) fail('WORKER_ROLLOUT_STATUS_INVALID');
  const status = Object.freeze({
    phase: phase as CastleWorkerRolloutPhase,
    systemRows: bigintField(row, 'systemRows'),
    systemConfigValid: booleanField(row, 'systemConfigValid'),
    expectedCastleCount: numberField(row, 'expectedCastleCount'),
    expectedWorkerCount: numberField(row, 'expectedWorkerCount'),
    actualCastleCount: bigintField(row, 'actualCastleCount'),
    actualWorkerCount: bigintField(row, 'actualWorkerCount'),
    rosterDigest: stringField(row, 'rosterDigest'),
    expectedRosterDigest: stringField(row, 'expectedRosterDigest'),
    malformedWorkerGraphRows: bigintField(row, 'malformedWorkerGraphRows'),
    resourceAccounts: bigintField(row, 'resourceAccounts'),
    missingResourceAccounts: bigintField(row, 'missingResourceAccounts'),
    orphanedResourceAccounts: bigintField(row, 'orphanedResourceAccounts'),
    resourceInvariantViolations: bigintField(row, 'resourceInvariantViolations'),
    resourceRosterDigest: stringField(row, 'resourceRosterDigest'),
    canonicalResourceCatalog: booleanField(row, 'canonicalResourceCatalog'),
    resourceCatalogDigest: stringField(row, 'resourceCatalogDigest'),
    legacyExpeditions: bigintField(row, 'legacyExpeditions'),
    legacyOccupations: bigintField(row, 'legacyOccupations'),
    legacySchedules: bigintField(row, 'legacySchedules'),
    legacyGoldExpeditions: bigintField(row, 'legacyGoldExpeditions'),
    legacyFoodExpeditions: bigintField(row, 'legacyFoodExpeditions'),
    legacyWoodExpeditions: bigintField(row, 'legacyWoodExpeditions'),
    legacyStoneExpeditions: bigintField(row, 'legacyStoneExpeditions'),
    legacyGoldOccupations: bigintField(row, 'legacyGoldOccupations'),
    legacyFoodOccupations: bigintField(row, 'legacyFoodOccupations'),
    legacyWoodOccupations: bigintField(row, 'legacyWoodOccupations'),
    legacyStoneOccupations: bigintField(row, 'legacyStoneOccupations'),
    legacyGoldSchedules: bigintField(row, 'legacyGoldSchedules'),
    legacyFoodSchedules: bigintField(row, 'legacyFoodSchedules'),
    legacyWoodSchedules: bigintField(row, 'legacyWoodSchedules'),
    legacyStoneSchedules: bigintField(row, 'legacyStoneSchedules'),
    genericAssignments: bigintField(row, 'genericAssignments'),
    genericOccupations: bigintField(row, 'genericOccupations'),
    genericSchedules: bigintField(row, 'genericSchedules'),
    genericCommandReceipts: bigintField(row, 'genericCommandReceipts'),
  });
  if (status.resourceCatalogDigest !== CASTLE_WORKER_RESOURCE_CATALOG_DIGEST) {
    fail('WORKER_RESOURCE_CATALOG_MISMATCH');
  }
  if (
    status.legacyExpeditions !== status.legacyGoldExpeditions
      + status.legacyFoodExpeditions
      + status.legacyWoodExpeditions
      + status.legacyStoneExpeditions
    || status.legacyOccupations !== status.legacyGoldOccupations
      + status.legacyFoodOccupations
      + status.legacyWoodOccupations
      + status.legacyStoneOccupations
    || status.legacySchedules !== status.legacyGoldSchedules
      + status.legacyFoodSchedules
      + status.legacyWoodSchedules
      + status.legacyStoneSchedules
  ) fail('WORKER_ROLLOUT_STATUS_INVALID');
  return status;
}

export type WorkerActivationOperatorPlan = Readonly<{
  ready: boolean;
  blockers: readonly string[];
  reducer: 'admin_activate_worker_system_v1';
  arguments: WorkerClientAttestation;
  dataDeletion: false;
  automaticSubmission: false;
  requiresExplicitOwnerApproval: true;
}>;

/**
 * Offline only: produce the exact reducer envelope, never connect or submit.
 * A separate reviewed operator may use this after PTR evidence and approval.
 */
export function planWorkerActivation(
  statusValue: unknown,
  attestation: WorkerClientAttestation,
): WorkerActivationOperatorPlan {
  const status = projectWorkerRolloutOperatorStatus(statusValue);
  const blockers = workerActivationBlockers(status, attestation);
  return Object.freeze({
    ready: blockers.length === 0,
    blockers,
    reducer: 'admin_activate_worker_system_v1',
    arguments: Object.freeze({ ...attestation }),
    dataDeletion: false,
    automaticSubmission: false,
    requiresExplicitOwnerApproval: true,
  });
}

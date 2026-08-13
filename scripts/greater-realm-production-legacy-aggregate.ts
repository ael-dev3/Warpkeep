import { projectDailyMarksStatus } from './daily-marks-operator';
import type { DbConnection } from '../src/spacetime/module_bindings';
import {
  projectAccessRequestListPage,
  readStatus,
  withOperationTimeout,
} from './hermes-admin';
import {
  GENESIS_WORLD_PUBLISH_STAGE,
  RESOURCE_PUBLISH_ROLLOUT_STAGE,
  verifyActiveDailyMarksV14StatusOutput,
  verifyExactPublishV12AggregateValue,
  WORKER_FORWARD_REPAIR,
  WORKER_FORWARD_REPAIR_CHECKPOINT,
  WORKER_PUBLISH_ROLLOUT_STAGE,
  type FoundedPublishExpectations,
} from './publish-spacetime-dev.mjs';
import type { GreaterRealmProductionAdminSession } from './greater-realm-production-transport';

function wireJson(value: unknown): string {
  return JSON.stringify(value, (_key, child) => (
    typeof child === 'bigint' ? child.toString() : child
  ));
}

type LegacyRawAggregate = Readonly<{
  alpha: unknown;
  dailyMarks: unknown;
  accessRequests: Readonly<{ totalRequests: bigint; pendingRequests: bigint }>;
}>;

async function inspectLegacyAggregate(connection: DbConnection): Promise<LegacyRawAggregate> {
  const protocolV3 = await readStatus(connection, 'v3', false, undefined, false);
  const resourceV4 = await readStatus(connection, 'v4', false, undefined, false);
  const alphaV8 = await readStatus(connection, 'v8', false, undefined, false);
  const alphaV10 = await readStatus(connection, 'v10', false, undefined, false);
  const workerV12 = await readStatus(connection, 'v12', false, undefined, false);
  const dailyMarks = projectDailyMarksStatus(await withOperationTimeout(
    connection.procedures.adminGetDailyMarksStatusV1({}),
  ));
  const accessOptions = Object.freeze({
    limit: 1,
    afterRequestedAtMicros: 0n,
    afterFid: 0n,
    includeResolved: true,
  });
  const accessRequests = projectAccessRequestListPage(await withOperationTimeout(
    connection.procedures.adminListAccessRequestsV1({
      afterRequestedAtMicros: accessOptions.afterRequestedAtMicros,
      afterFid: accessOptions.afterFid,
      limit: accessOptions.limit,
      includeResolved: accessOptions.includeResolved,
    }),
  ), accessOptions);
  return Object.freeze({
    alpha: Object.freeze({ protocolV3, resourceV4, alphaV8, alphaV10, workerV12 }),
    dailyMarks,
    accessRequests,
  });
}

function verifyLegacyAggregate(
  raw: LegacyRawAggregate,
  expectations: FoundedPublishExpectations,
): Readonly<Record<string, unknown>> {
  const alpha = verifyExactPublishV12AggregateValue(
    raw.alpha,
    expectations,
    RESOURCE_PUBLISH_ROLLOUT_STAGE.READY,
    WORKER_PUBLISH_ROLLOUT_STAGE.ACTIVE,
    GENESIS_WORLD_PUBLISH_STAGE.EXPANDED,
    WORKER_FORWARD_REPAIR.NONE,
    WORKER_FORWARD_REPAIR_CHECKPOINT.HEALTHY,
  );
  const dailyMarks = verifyActiveDailyMarksV14StatusOutput(
    wireJson(raw.dailyMarks),
    expectations.expectedFounderCount,
    expectations.expectedEnabledAllowedFidCount,
  );
  const accessRequests = Object.freeze({
    totalRequests: raw.accessRequests.totalRequests.toString(),
    pendingRequests: raw.accessRequests.pendingRequests.toString(),
  });
  return Object.freeze({ alpha, dailyMarks, accessRequests });
}

/** Counts-only legacy proof sharing the cutover operator's one admin session. */
export async function inspectGreaterRealmLegacyProductionAggregate(input: Readonly<{
  session: GreaterRealmProductionAdminSession;
  expectations: FoundedPublishExpectations;
  testOnlyDependencies?: Readonly<{
    inspect?: (connection: DbConnection) => Promise<LegacyRawAggregate>;
    verify?: typeof verifyLegacyAggregate;
  }>;
}>): Promise<Readonly<Record<string, unknown>>> {
  const raw = await input.session.withConnection(
    input.testOnlyDependencies?.inspect ?? inspectLegacyAggregate,
  );
  return (input.testOnlyDependencies?.verify ?? verifyLegacyAggregate)(
    raw,
    input.expectations,
  );
}

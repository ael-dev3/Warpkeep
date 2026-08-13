import type {
  AdminGetProductionPlayerCanaryBaselineV1Args,
  AdminGetProductionPlayerCanaryBaselineV1Result,
  AdminGetProductionPlayerCanaryEvidenceV1Args,
  AdminGetProductionPlayerCanaryEvidenceV1Result,
} from '../src/spacetime/module_bindings/types/procedures';
import type {
  AdminCaptureProductionPlayerCanaryBaselineV1Params,
} from '../src/spacetime/module_bindings/types/reducers';
import type {
  GreaterRealmProductionAdminSession,
} from './greater-realm-production-transport';

export const PRODUCTION_PLAYER_CANARY_BASELINE_CAPTURE_REDUCER =
  'admin_capture_production_player_canary_baseline_v1';

const ADMIN_OPERATION_TIMEOUT_MS = 15_000;

function withAdminOperationTimeout<Value>(operation: Promise<Value>): Promise<Value> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(
      'PRODUCTION_PLAYER_CANARY_ADMIN_OPERATION_TIMEOUT',
    )), ADMIN_OPERATION_TIMEOUT_MS);
  });
  return Promise.race([operation, deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

type ProductionPlayerCanaryWritePermit = Parameters<
  GreaterRealmProductionAdminSession['submit']
>[2];

/** One non-retried baseline write through the production transport permit. */
export function captureProductionPlayerCanaryBaselineV1(input: Readonly<{
  session: GreaterRealmProductionAdminSession;
  arguments: AdminCaptureProductionPlayerCanaryBaselineV1Params;
  assertCanStartWrite: ProductionPlayerCanaryWritePermit;
}>): Promise<void> {
  return input.session.submit(
    PRODUCTION_PLAYER_CANARY_BASELINE_CAPTURE_REDUCER,
    input.arguments,
    input.assertCanStartWrite,
  );
}

/** Typed, timeout-bounded reconciliation after the non-repeatable write. */
export function getProductionPlayerCanaryBaselineV1(input: Readonly<{
  session: GreaterRealmProductionAdminSession;
  arguments: AdminGetProductionPlayerCanaryBaselineV1Args;
}>): Promise<AdminGetProductionPlayerCanaryBaselineV1Result> {
  return input.session.withConnection(connection => withAdminOperationTimeout(
    connection.procedures.adminGetProductionPlayerCanaryBaselineV1(input.arguments),
  ));
}

/** Typed, timeout-bounded final evidence read; raw baseline values are absent. */
export function getProductionPlayerCanaryEvidenceV1(input: Readonly<{
  session: GreaterRealmProductionAdminSession;
  arguments: AdminGetProductionPlayerCanaryEvidenceV1Args;
}>): Promise<AdminGetProductionPlayerCanaryEvidenceV1Result> {
  return input.session.withConnection(connection => withAdminOperationTimeout(
    connection.procedures.adminGetProductionPlayerCanaryEvidenceV1(input.arguments),
  ));
}

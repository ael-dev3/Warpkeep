import type {
  AdminGetProductionPlayerCanaryBaselineV1Args,
  AdminGetProductionPlayerCanaryBaselineV1Result,
  AdminGetProductionPlayerCanaryApprovalV1Args,
  AdminGetProductionPlayerCanaryApprovalV1Result,
  AdminPlanProductionPlayerCanaryRoutesV1Args,
  AdminPlanProductionPlayerCanaryRoutesV1Result,
  AdminGetProductionPlayerCanaryEvidenceV1Args,
  AdminGetProductionPlayerCanaryEvidenceV1Result,
  AdminGetProductionPlayerCanaryRecoveryStatusV1Args,
  AdminGetProductionPlayerCanaryRecoveryStatusV1Result,
} from '../src/spacetime/module_bindings/types/procedures';
import type {
  AdminCaptureProductionPlayerCanaryBaselineV1Params,
  AdminRegisterProductionPlayerCanaryApprovalV1Params,
} from '../src/spacetime/module_bindings/types/reducers';
import type {
  GreaterRealmProductionAdminSession,
} from './greater-realm-production-transport';

export const PRODUCTION_PLAYER_CANARY_BASELINE_CAPTURE_REDUCER =
  'admin_capture_production_player_canary_baseline_v1';
export const PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTER_REDUCER =
  'admin_register_production_player_canary_approval_v1';

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

/** Typed, private deterministic route-plan read. */
export function planProductionPlayerCanaryRoutesV1(input: Readonly<{
  session: GreaterRealmProductionAdminSession;
  arguments: AdminPlanProductionPlayerCanaryRoutesV1Args;
}>): Promise<AdminPlanProductionPlayerCanaryRoutesV1Result> {
  return input.session.withConnection(connection => withAdminOperationTimeout(
    connection.procedures.adminPlanProductionPlayerCanaryRoutesV1(input.arguments),
  ));
}

/** One non-retried approval-registration write through the production permit. */
export function registerProductionPlayerCanaryApprovalV1(input: Readonly<{
  session: GreaterRealmProductionAdminSession;
  arguments: AdminRegisterProductionPlayerCanaryApprovalV1Params;
  assertCanStartWrite: ProductionPlayerCanaryWritePermit;
}>): Promise<void> {
  return input.session.submit(
    PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTER_REDUCER,
    input.arguments,
    input.assertCanStartWrite,
  );
}

/** Typed commitment-only approval-registration reconciliation. */
export function getProductionPlayerCanaryApprovalV1(input: Readonly<{
  session: GreaterRealmProductionAdminSession;
  arguments: AdminGetProductionPlayerCanaryApprovalV1Args;
}>): Promise<AdminGetProductionPlayerCanaryApprovalV1Result> {
  return input.session.withConnection(connection => withAdminOperationTimeout(
    connection.procedures.adminGetProductionPlayerCanaryApprovalV1(input.arguments),
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

/** Typed, timeout-bounded, admin-only read of recovery/receipt structure. */
export function getProductionPlayerCanaryRecoveryStatusV1(input: Readonly<{
  session: GreaterRealmProductionAdminSession;
  arguments: AdminGetProductionPlayerCanaryRecoveryStatusV1Args;
}>): Promise<AdminGetProductionPlayerCanaryRecoveryStatusV1Result> {
  return input.session.withConnection(connection => withAdminOperationTimeout(
    connection.procedures.adminGetProductionPlayerCanaryRecoveryStatusV1(
      input.arguments,
    ),
  ));
}

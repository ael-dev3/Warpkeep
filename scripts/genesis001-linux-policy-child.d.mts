export type G001PolicyChildDiagnostic = 'g001-policy-state' | 'g001-policy-procedure'
  | 'g001-policy-transport' | 'g001-policy-credential' | 'g001-policy-authority' | 'g001-policy-budget'
  | 'g001-receipt' | 'g001-admitted-identity' | 'g001-admitted-aggregate'
  | 'g001-admitted-enumeration' | 'g001-admitted-status' | 'g001-admitted-reconciliation';
/** Projects only fixed, privacy-safe diagnostics from the protected policy child. */
export function projectG001PolicyObservationDiagnostic(error: unknown): G001PolicyChildDiagnostic | undefined;
export function runFixedLinuxG001PolicyChild(request: unknown): Promise<unknown>;

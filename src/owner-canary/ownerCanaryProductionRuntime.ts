import type { OwnerCanaryRuntimeLoader } from './ownerCanaryRuntime';

/**
 * Fail-closed until the separately reviewed live v17 evidence adapter is
 * composed here. Loading this entry never authenticates or opens a connection.
 */
export const loadOwnerCanaryProductionRuntime: OwnerCanaryRuntimeLoader = async () => null;

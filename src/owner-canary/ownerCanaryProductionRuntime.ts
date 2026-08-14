import { readWarpkeepRuntimeConfig } from '../spacetime/warpkeepConfig';
import {
  isExactOwnerCanaryProductionConfig,
} from './ownerCanaryProductionConfig';
import type { OwnerCanaryRuntimeLoader } from './ownerCanaryRuntime';

/**
 * Configuration-aware but fail-closed through the combined source/refreeze
 * audit. Reviewed composition dependencies exist, but are intentionally not
 * imported or wired here. Loading only inspects public build configuration.
 */
export const loadOwnerCanaryProductionRuntime: OwnerCanaryRuntimeLoader = async () => {
  const config = readWarpkeepRuntimeConfig();
  if (!isExactOwnerCanaryProductionConfig(config)) return null;
  // Keep null until the protected predecessor merges and the combined closure
  // is audited/refrozen. Browser observations never authorize release.
  return null;
};

import { userInfo } from 'node:os';

import {
  createSealedRealmsProductionPrivateState,
} from './sealed-realms-production-private-state.mjs';

/** Resolves only the normal account-home private-state capability. */
export function resolveSealedRealmsProductionWorkflowPrivateState() {
  if (arguments.length !== 0) {
    const error = new Error('SEALED_REALMS_WORKFLOW_PRIVATE_STATE_INPUT_INVALID');
    error.name = 'SealedRealmsProductionWorkflowPrivateStateError';
    error.code = 'SEALED_REALMS_WORKFLOW_PRIVATE_STATE_INPUT_INVALID';
    throw error;
  }
  return createSealedRealmsProductionPrivateState({
    reportedHome: userInfo().homedir,
  });
}

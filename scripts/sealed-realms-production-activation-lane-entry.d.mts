import type { SealedRealmsProductionAuthBridgeState } from './sealed-realms-production-auth-bridge-state.mjs';
import type {
  SealedRealmsProductionDispatchContextInput,
  SealedRealmsProductionDispatcher,
} from './sealed-realms-production-dispatch.mjs';

export class SealedRealmsProductionActivationLaneError extends Error { readonly code: string; constructor(code: string); }
declare const activationLaneBrand: unique symbol;
declare const activationDispatchContextBrand: unique symbol;
export type SealedRealmsProductionActivationLane = Readonly<{ [activationLaneBrand]: true }>;
export type SealedRealmsProductionActivationDispatchContext =
  Readonly<{ [activationDispatchContextBrand]: true }>;
export function createSealedRealmsProductionActivationDispatchContext(
  input: SealedRealmsProductionDispatchContextInput,
): SealedRealmsProductionActivationDispatchContext;
export function createSealedRealmsProductionActivationLane(input: Readonly<{
  bridgeState: SealedRealmsProductionAuthBridgeState;
}>): SealedRealmsProductionActivationLane;
export function assertSealedRealmsProductionActivationLane(
  lane: unknown,
): SealedRealmsProductionActivationLane;
export function createSealedRealmsProductionActivationDispatcher(input: Readonly<{
  context: SealedRealmsProductionActivationDispatchContext;
  lane: SealedRealmsProductionActivationLane;
}>): SealedRealmsProductionDispatcher;

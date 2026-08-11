import {
  GREATER_REALM_CLIENT_PRESENTATION_ALLOWED,
  type AvailableGreaterRealmProviderBridge,
  type GreaterRealmProviderBridge
} from '../../spacetime/greaterRealmProviderBridge';
import { GREATER_REALM_SERVER_PRESENTATION_ALLOWED } from '../../greater-realm/greaterRealmTransport';

export type RealmWorldSceneStrategy =
  | Readonly<{
      kind: 'legacy-lowlands';
      reason:
        | 'client-gate-closed'
        | 'server-gate-closed'
        | 'connection-unavailable';
    }>
  | Readonly<{
      kind: 'connection-hold';
      reason: 'legacy-authority-inactive';
    }>
  | Readonly<{
      kind: 'greater-realm';
      sessionGeneration: number;
      bridge: AvailableGreaterRealmProviderBridge;
    }>;

export type RealmWorldScenePolicy = Readonly<{
  clientPresentationAllowed: boolean;
  serverPresentationAllowed: boolean;
}>;

/** Pure review/test seam; production callers use the literal-gated wrapper. */
export function resolveRealmWorldSceneStrategyForPolicy(
  input: Readonly<{
    bridge: GreaterRealmProviderBridge | undefined;
    legacyAuthorityActive: boolean;
  }>,
  policy: RealmWorldScenePolicy
): RealmWorldSceneStrategy {
  const bridgeReady = policy.clientPresentationAllowed
    && policy.serverPresentationAllowed
    && input.bridge?.phase === 'available';
  if (bridgeReady) {
    return Object.freeze({
      kind: 'greater-realm',
      sessionGeneration: input.bridge.sessionGeneration,
      bridge: input.bridge
    });
  }
  if (!input.legacyAuthorityActive) {
    return Object.freeze({ kind: 'connection-hold', reason: 'legacy-authority-inactive' });
  }
  if (!policy.clientPresentationAllowed) {
    return Object.freeze({ kind: 'legacy-lowlands', reason: 'client-gate-closed' });
  }
  if (!policy.serverPresentationAllowed) {
    return Object.freeze({ kind: 'legacy-lowlands', reason: 'server-gate-closed' });
  }
  return Object.freeze({ kind: 'legacy-lowlands', reason: 'connection-unavailable' });
}

/**
 * Single production selector for the world scene family. The current literal
 * gates keep an authoritative active Lowlands on its existing lifecycle;
 * retired legacy authority instead seals the world. Chat and surface
 * navigation remain entirely outside this choice.
 */
export function resolveRealmWorldSceneStrategy(
  input: Readonly<{
    bridge: GreaterRealmProviderBridge | undefined;
    legacyAuthorityActive: boolean;
  }>
): RealmWorldSceneStrategy {
  return resolveRealmWorldSceneStrategyForPolicy(input, {
    clientPresentationAllowed: GREATER_REALM_CLIENT_PRESENTATION_ALLOWED,
    serverPresentationAllowed: GREATER_REALM_SERVER_PRESENTATION_ALLOWED
  });
}

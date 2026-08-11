import {
  createGreaterRealmClientRuntime,
  type GreaterRealmClientRuntime
} from '../greater-realm/greaterRealmClientRuntime';
import {
  type GreaterRealmDeviceClass,
  type GreaterRealmGraphicsProfile
} from '../greater-realm/greaterRealmRuntimePolicy';
import {
  GREATER_REALM_SERVER_PRESENTATION_ALLOWED,
  createGreaterRealmProcedureTransport
} from '../greater-realm/greaterRealmTransport';
import {
  createWarpkeepGreaterRealmProcedureInvoker,
  type WarpkeepConnection,
  type WarpkeepGreaterRealmConnectionAuthority
} from './warpkeepConnection';

/**
 * Independent browser presentation gate. It remains a literal so production
 * builds, source audits, and future activation review all fail closed even if
 * the additive server contract is present.
 */
export const GREATER_REALM_CLIENT_PRESENTATION_ALLOWED = false as const;

export type DormantGreaterRealmProviderBridge = Readonly<{
  phase: 'dormant';
  reason: 'client-gate-closed' | 'server-gate-closed' | 'connection-unavailable';
  presentationAllowed: false;
}>;

export type AvailableGreaterRealmProviderBridge = Readonly<{
  phase: 'available';
  presentationAllowed: true;
  sessionGeneration: number;
  createRuntime: (input: Readonly<{
    deviceClass: GreaterRealmDeviceClass;
    graphicsProfile: GreaterRealmGraphicsProfile;
  }>) => GreaterRealmClientRuntime;
}>;

export type GreaterRealmProviderBridge =
  | DormantGreaterRealmProviderBridge
  | AvailableGreaterRealmProviderBridge;

export const DORMANT_GREATER_REALM_PROVIDER_BRIDGE: DormantGreaterRealmProviderBridge =
  Object.freeze({
    phase: 'dormant',
    reason: 'client-gate-closed',
    presentationAllowed: false
  });

export function createWarpkeepGreaterRealmProviderBridge(input: Readonly<{
  connection?: WarpkeepConnection;
  authority?: WarpkeepGreaterRealmConnectionAuthority;
}>): GreaterRealmProviderBridge {
  if (!GREATER_REALM_CLIENT_PRESENTATION_ALLOWED) {
    return DORMANT_GREATER_REALM_PROVIDER_BRIDGE;
  }
  if (!GREATER_REALM_SERVER_PRESENTATION_ALLOWED) {
    return Object.freeze({
      phase: 'dormant',
      reason: 'server-gate-closed',
      presentationAllowed: false
    });
  }
  if (input.connection === undefined || input.authority === undefined) {
    return Object.freeze({
      phase: 'dormant',
      reason: 'connection-unavailable',
      presentationAllowed: false
    });
  }
  const { connection, authority } = input;
  return Object.freeze({
    phase: 'available',
    presentationAllowed: true,
    sessionGeneration: authority.generation,
    createRuntime: ({ deviceClass, graphicsProfile }) => {
      if (!authority.isCurrent()) {
        throw new Error('GREATER_REALM_CONNECTION_GENERATION_STALE');
      }
      // Each consumer owns its bootstrap/revision context. Strict-mode scene
      // replacement cannot transplant atlas context between controller lives.
      const transport = createGreaterRealmProcedureTransport(
        createWarpkeepGreaterRealmProcedureInvoker(connection, authority)
      );
      return createGreaterRealmClientRuntime({
        sessionGeneration: authority.generation,
        isSessionCurrent: authority.isCurrent,
        transport,
        deviceClass,
        graphicsProfile
      });
    }
  });
}

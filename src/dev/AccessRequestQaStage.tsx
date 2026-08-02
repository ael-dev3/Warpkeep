import { useCallback, useMemo, useRef } from 'react';

import { FarcasterAdmissionPanel } from '../components/auth/FarcasterAdmissionPanel';
import { useAccessRequest } from '../farcaster/useAccessRequest';
import type {
  AccessRequestStatus,
  FarcasterOidcBridgeClient
} from '../farcaster/farcasterAuthTypes';
import { QA_AUTH_STATES, QA_SYNTHETIC_IDENTITY } from './qaJourneyFixture';

export type AccessRequestQaMode =
  | 'success'
  | 'latency'
  | 'lost-after-write'
  | 'pre-write-failure'
  | 'existing';

const REQUESTED_AT = Date.UTC(2026, 7, 1, 11, 28);

export function readAccessRequestQaMode(search: string): AccessRequestQaMode {
  const requested = new URLSearchParams(search).get('access');
  return requested === 'latency'
    || requested === 'lost-after-write'
    || requested === 'pre-write-failure'
    || requested === 'existing'
    ? requested
    : 'success';
}

function unavailable(): never {
  throw new Error('Unavailable in the local access-request presentation fixture.');
}

export function AccessRequestQaStage({
  mode,
  onBackToMenu
}: Readonly<{
  mode: AccessRequestQaMode;
  onBackToMenu: () => void;
}>) {
  const rowExistsRef = useRef(mode === 'existing');
  const statusReadsRef = useRef(0);
  const mutationsRef = useRef(0);
  const quickAuthReadsRef = useRef(0);

  const bridgeClient = useMemo<FarcasterOidcBridgeClient>(() => ({
    issuer: 'https://qa.invalid',
    audience: 'warpkeep-local-qa',
    createChallenge: async () => unavailable(),
    exchangeCompletedSignIn: async () => unavailable(),
    refreshSession: async () => unavailable(),
    logoutSession: async () => undefined,
    getAccessRequestStatus: async (): Promise<AccessRequestStatus> => {
      statusReadsRef.current += 1;
      return rowExistsRef.current
        ? { version: 1, status: 'requested', requestedAt: REQUESTED_AT }
        : { version: 1, status: 'not-requested' };
    },
    requestAccess: async (): Promise<AccessRequestStatus> => {
      mutationsRef.current += 1;
      if (mode === 'latency') {
        await new Promise(resolve => window.setTimeout(resolve, 2_000));
      }
      rowExistsRef.current = true;
      if (mode === 'lost-after-write') {
        throw new Error('Synthetic response loss after the local row was recorded.');
      }
      return { version: 1, status: 'requested', requestedAt: REQUESTED_AT };
    }
  }), [mode]);

  const loadBridgeClient = useCallback(async () => bridgeClient, [bridgeClient]);
  const loadQuickAuthToken = useCallback(async () => {
    quickAuthReadsRef.current += 1;
    if (mode === 'pre-write-failure' && quickAuthReadsRef.current === 2) return null;
    return 'local.qa.credential';
  }, [mode]);
  const accessRequest = useAccessRequest({
    authState: QA_AUTH_STATES.pending,
    authGeneration: 1,
    loadBridgeClient,
    loadQuickAuthToken
  });

  return (
    <main
      className="qa-journey__auth-stage"
      data-access-mutations={mutationsRef.current}
      data-access-qa-mode={mode}
      data-access-status-reads={statusReadsRef.current}
    >
      <div className="warpkeep-menu-auth-rail">
        <FarcasterAdmissionPanel
          accessRequest={accessRequest.state}
          identity={QA_SYNTHETIC_IDENTITY}
          onBackToMenu={onBackToMenu}
          onCheckAgain={() => undefined}
          onRequestAccess={accessRequest.requestAccess}
          onRetryAccessRequestStatus={accessRequest.retryStatus}
          onSignOut={onBackToMenu}
          phase="denied"
        />
      </div>
    </main>
  );
}

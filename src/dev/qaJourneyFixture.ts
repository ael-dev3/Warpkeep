import type {
  FarcasterAuthPhase,
  FarcasterAuthViewState,
  PublicFarcasterIdentity
} from '../farcaster/farcasterAuthTypes';
import type { WarpkeepBackendPhase } from '../spacetime/warpkeepBackendTypes';
import { createRealmObserverFixtureRealm } from './realmObserverSnapshot';
import {
  QA_JOURNEY_SCENARIO_MANIFEST,
  QA_UNSCANNABLE_QR_DATA_URL,
  type QaJourneyScenarioManifestId
} from './qaJourneyScenarioManifest.mjs';

export type QaJourneyScenario = QaJourneyScenarioManifestId;

export type QaAdmissionScenario =
  | 'admission-connecting'
  | 'admission-reconnecting'
  | 'admission-checking'
  | 'admission-awaiting-terms'
  | 'admission-denied'
  | 'admission-bootstrapping'
  | 'admission-accepting-terms'
  | 'admission-opening-realm'
  | 'admission-error';

export type QaAdmissionPhase = Exclude<WarpkeepBackendPhase, 'idle' | 'ready'>;

export type QaJourneyOptions = Readonly<{
  scenario: QaJourneyScenario;
  autoCycle: boolean;
  intervalMs: number;
}>;

export const QA_JOURNEY_SCENARIOS = QA_JOURNEY_SCENARIO_MANIFEST;

export const QA_JOURNEY_AUTOCYCLE_SCENARIOS = Object.freeze(
  QA_JOURNEY_SCENARIOS
    .map(({ id }) => id)
    .filter((id): id is Exclude<QaJourneyScenario, 'journey' | 'terms'> => (
      id !== 'journey' && id !== 'terms'
    ))
);

export const QA_AUTH_SCENARIO_BY_PHASE = Object.freeze({
  anonymous: 'menu',
  'creating-channel': 'auth-creating',
  'awaiting-approval': 'auth-awaiting',
  verifying: 'auth-verifying',
  'pending-admission': 'admission-pending',
  authenticated: 'auth-authenticated',
  expired: 'auth-expired',
  error: 'auth-error'
} satisfies Readonly<Record<FarcasterAuthPhase, QaJourneyScenario>>);

export const QA_ADMISSION_PHASE_BY_SCENARIO = Object.freeze({
  'admission-connecting': 'connecting',
  'admission-reconnecting': 'reconnecting',
  'admission-checking': 'checking-admission',
  'admission-awaiting-terms': 'awaiting-terms',
  'admission-denied': 'denied',
  'admission-bootstrapping': 'bootstrapping',
  'admission-accepting-terms': 'accepting-terms',
  'admission-opening-realm': 'opening-realm',
  'admission-error': 'error'
} satisfies Readonly<Record<QaAdmissionScenario, QaAdmissionPhase>>);

const QA_ADMISSION_SCENARIO_BY_PHASE = Object.freeze({
  connecting: 'admission-connecting',
  reconnecting: 'admission-reconnecting',
  'checking-admission': 'admission-checking',
  'awaiting-terms': 'admission-awaiting-terms',
  denied: 'admission-denied',
  bootstrapping: 'admission-bootstrapping',
  'accepting-terms': 'admission-accepting-terms',
  'opening-realm': 'admission-opening-realm',
  error: 'admission-error'
} satisfies Readonly<Record<QaAdmissionPhase, QaAdmissionScenario>>);

const QA_ADMISSION_SCENARIO_IDS = new Set<QaJourneyScenario>(
  Object.values(QA_ADMISSION_SCENARIO_BY_PHASE)
);

export function isQaAdmissionScenario(
  scenario: QaJourneyScenario
): scenario is QaAdmissionScenario {
  return QA_ADMISSION_SCENARIO_IDS.has(scenario);
}

const QA_SCENARIO_IDS = new Set<QaJourneyScenario>(
  QA_JOURNEY_SCENARIOS.map(({ id }) => id)
);
const DEFAULT_AUTOCYCLE_INTERVAL_MS = 6_000;
const MIN_AUTOCYCLE_INTERVAL_MS = 2_000;
const MAX_AUTOCYCLE_INTERVAL_MS = 30_000;
const SYNTHETIC_EXPIRY = Date.UTC(2099, 0, 1);

export { QA_UNSCANNABLE_QR_DATA_URL };

const QA_REALM = createRealmObserverFixtureRealm();

export const QA_SYNTHETIC_IDENTITY: PublicFarcasterIdentity = Object.freeze({
  fid: QA_REALM.identity.fid,
  username: 'sentinel-one',
  displayName: 'Synthetic QA Keeper',
  verifications: Object.freeze([]) as readonly [],
  verifiedAt: Date.UTC(2026, 6, 15)
});

export function createQaJourneyRealm() {
  return QA_REALM;
}

type QaAuthStateByPhase = {
  readonly [Phase in FarcasterAuthPhase]: Extract<FarcasterAuthViewState, { phase: Phase }>;
};

export const QA_AUTH_STATE_BY_PHASE = Object.freeze({
  anonymous: Object.freeze({ phase: 'anonymous' }),
  'creating-channel': Object.freeze({ phase: 'creating-channel' }),
  'awaiting-approval': Object.freeze({
    phase: 'awaiting-approval',
    // No channel URL exists in this fixture. The image cannot authorize or
    // navigate anywhere and contains no relay material.
    channelUrl: '',
    qr: Object.freeze({ state: 'ready', dataUrl: QA_UNSCANNABLE_QR_DATA_URL }),
    expiresAt: SYNTHETIC_EXPIRY
  }),
  verifying: Object.freeze({ phase: 'verifying', expiresAt: SYNTHETIC_EXPIRY }),
  'pending-admission': Object.freeze({
    phase: 'pending-admission',
    identity: QA_SYNTHETIC_IDENTITY,
    sessionExpiresAt: SYNTHETIC_EXPIRY
  }),
  authenticated: Object.freeze({
    phase: 'authenticated',
    identity: QA_SYNTHETIC_IDENTITY,
    assurance: 'live-client-verified',
    expiresAt: SYNTHETIC_EXPIRY,
    sessionExpiresAt: SYNTHETIC_EXPIRY
  }),
  expired: Object.freeze({
    phase: 'expired',
    error: Object.freeze({ code: 'expired', message: 'Synthetic local request expired.' })
  }),
  error: Object.freeze({
    phase: 'error',
    error: Object.freeze({ code: 'network', message: 'Synthetic local relay failure.' })
  })
} satisfies QaAuthStateByPhase);

export const QA_QR_ERROR_AUTH_STATE = Object.freeze({
  phase: 'awaiting-approval',
  channelUrl: '',
  qr: Object.freeze({ state: 'error' }),
  expiresAt: SYNTHETIC_EXPIRY
} satisfies Extract<FarcasterAuthViewState, { phase: 'awaiting-approval' }>);

export const QA_AUTH_STATES = Object.freeze({
  anonymous: QA_AUTH_STATE_BY_PHASE.anonymous,
  creating: QA_AUTH_STATE_BY_PHASE['creating-channel'],
  awaiting: QA_AUTH_STATE_BY_PHASE['awaiting-approval'],
  qrError: QA_QR_ERROR_AUTH_STATE,
  verifying: QA_AUTH_STATE_BY_PHASE.verifying,
  pending: QA_AUTH_STATE_BY_PHASE['pending-admission'],
  authenticated: QA_AUTH_STATE_BY_PHASE.authenticated,
  expired: QA_AUTH_STATE_BY_PHASE.expired,
  error: QA_AUTH_STATE_BY_PHASE.error
});

export function boundQaAutoCycleInterval(value: number) {
  return Number.isSafeInteger(value)
    && value >= MIN_AUTOCYCLE_INTERVAL_MS
    && value <= MAX_AUTOCYCLE_INTERVAL_MS
    ? value
    : DEFAULT_AUTOCYCLE_INTERVAL_MS;
}

export function readQaJourneyOptions(search: string): QaJourneyOptions {
  const parameters = new URLSearchParams(search);
  const requestedScenario = parameters.get('scenario');
  const scenario = requestedScenario && QA_SCENARIO_IDS.has(requestedScenario as QaJourneyScenario)
    ? requestedScenario as QaJourneyScenario
    : 'journey';
  const requestedInterval = parameters.get('interval');
  const parsedInterval = requestedInterval && /^\d{1,6}$/.test(requestedInterval)
    ? Number(requestedInterval)
    : DEFAULT_AUTOCYCLE_INTERVAL_MS;
  const intervalMs = boundQaAutoCycleInterval(parsedInterval);

  return Object.freeze({
    scenario,
    autoCycle: parameters.get('autocycle') === '1',
    intervalMs
  });
}

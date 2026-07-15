export type QaJourneyScenarioManifestId =
  | 'journey'
  | 'menu'
  | 'terms'
  | 'auth-creating'
  | 'auth-awaiting'
  | 'auth-qr-error'
  | 'auth-verifying'
  | 'admission-pending'
  | 'auth-authenticated'
  | 'auth-expired'
  | 'auth-error'
  | 'admission-connecting'
  | 'admission-reconnecting'
  | 'admission-checking'
  | 'admission-awaiting-terms'
  | 'admission-denied'
  | 'admission-bootstrapping'
  | 'admission-accepting-terms'
  | 'admission-opening-realm'
  | 'admission-error'
  | 'realm-player'
  | 'realm-observer';

export type QaJourneyScenarioManifestEntry = Readonly<{
  id: QaJourneyScenarioManifestId;
  label: string;
  externalAnchorCount: 0 | 1 | 2;
  landmark: Readonly<{
    role: 'dialog' | 'heading' | 'main' | 'navigation' | 'region';
    name: string;
  }>;
}>;

export const QA_JOURNEY_SCENARIO_MANIFEST:
  readonly QaJourneyScenarioManifestEntry[];

export const QA_UNSCANNABLE_QR_DATA_URL: string;

import type { GameState } from '../game/models/types';

export interface CourtReportRequest {
  state: GameState;
  tone: 'terse' | 'mysterious' | 'strategic';
}

export interface CourtReport {
  title: string;
  body: string;
  generatedBy: 'static-seed' | 'future-ai';
  authoritativeStateMutationAllowed: false;
}

export const createStaticCourtReport = ({ state }: CourtReportRequest): CourtReport => ({
  title: 'Court Report',
  body: `${state.castle.name} is quiet but watchful. Grain stores are stable, masons await orders, and the ravenmaster reports banners moving beyond ${state.castle.region}. AI may one day add flavor here, but deterministic reducers decide the realm.`,
  generatedBy: 'static-seed',
  authoritativeStateMutationAllowed: false
});

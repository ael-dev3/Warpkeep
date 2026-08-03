import type { InnerKeepBuildingKind } from '../components/inner-keep/innerKeepPresentation';
import type { InnerKeepSceneQuality } from '../components/inner-keep/createInnerKeepSceneLayer';

export type InnerKeepQaScenarioId =
  | 'empty'
  | 'completed-level-1'
  | 'completed-level-2'
  | 'completed-level-3'
  | 'completed-level-4'
  | 'completed-level-5'
  | 'construction-1-percent'
  | 'construction-50-percent'
  | 'construction-99-percent'
  | 'completion-reveal'
  | 'builder-busy'
  | 'insufficient-resources'
  | 'compact-quality'
  | 'reduced-motion'
  | 'missing-asset-fallback'
  | '2d-fallback';

export type InnerKeepQaScenarioState =
  | 'empty'
  | 'complete'
  | 'constructing'
  | 'completion-reveal'
  | 'builder-busy'
  | 'insufficient'
  | 'missing-asset';

export type InnerKeepQaScenario = Readonly<{
  id: InnerKeepQaScenarioId;
  label: string;
  renderMode: 'webgl' | 'fallback';
  quality: InnerKeepSceneQuality;
  reducedMotion: boolean;
  state: InnerKeepQaScenarioState;
  level: number | null;
  progressBasisPoints: number | null;
  selectedSlotId: string | null;
  selectedBuildingKind: InnerKeepBuildingKind | null;
}>;

export const INNER_KEEP_QA_SCENARIO_MANIFEST: readonly InnerKeepQaScenario[];
export const INNER_KEEP_QA_SCENARIO_IDS: readonly InnerKeepQaScenarioId[];
export function innerKeepQaScenarioById(value: unknown): InnerKeepQaScenario;
export function readInnerKeepQaScenario(search: string): InnerKeepQaScenario;

import type { GatewayProjection } from './BlackHoleGateway';

export type WarpkeepInputModality = 'keyboard' | 'pointer' | 'unknown';

export type WarpkeepTitlePhase = 'active' | 'departing' | 'returning';

export type WarpkeepTitleScreenProps = {
  phase?: WarpkeepTitlePhase;
  onRequestEnterMenu?: (
    origin: GatewayProjection,
    input: Exclude<WarpkeepInputModality, 'unknown'>
  ) => void;
  onReady?: () => void;
  onMeaningfulInteraction?: () => void;
};

export type WarpkeepTitleScreenHandle = {
  requestEnter: (input: Exclude<WarpkeepInputModality, 'unknown'>) => void;
  focusGateway: () => void;
  getGatewayProjection: () => GatewayProjection;
};

export const fallbackGatewayProjection = (): GatewayProjection => ({
  x: window.innerWidth * 0.5,
  y: window.innerHeight * 0.36,
  viewportWidth: window.innerWidth,
  viewportHeight: window.innerHeight,
  visible: true
});

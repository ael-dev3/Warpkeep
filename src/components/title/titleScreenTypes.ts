import type { GraphicsQualityTier } from '../../settings/graphicsPreference';
import {
  createGatewayActivationRecord,
  type GatewayActivationInput,
  type GatewayActivationRecord,
  type GatewayProjection
} from './gatewayActivation';

export type WarpkeepInputModality = 'keyboard' | 'pointer' | 'unknown';

export type WarpkeepTitlePhase = 'active' | 'departing' | 'returning';

export type WarpkeepTitleScreenProps = {
  phase?: WarpkeepTitlePhase;
  onRequestEnterMenu?: (activation: GatewayActivationRecord) => void;
  onReady?: () => void;
  onMeaningfulInteraction?: () => void;
  graphicsQuality?: GraphicsQualityTier;
};

export type WarpkeepTitleScreenHandle = {
  requestEnter: (input: GatewayActivationInput) => void;
  focusGateway: () => void;
  getGatewayProjection: () => GatewayProjection;
  getGatewayActivation: (input: GatewayActivationInput) => GatewayActivationRecord;
};

export const fallbackGatewayProjection = (): GatewayProjection => ({
  x: window.innerWidth * 0.5,
  y: window.innerHeight * 0.36,
  viewportWidth: window.innerWidth,
  viewportHeight: window.innerHeight,
  visible: true
});

export const fallbackGatewayActivation = (
  input: GatewayActivationInput
): GatewayActivationRecord => {
  const projection = fallbackGatewayProjection();
  return createGatewayActivationRecord({
    input,
    projection,
    projectionSourceRect: {
      left: 0,
      top: 0,
      width: projection.viewportWidth,
      height: projection.viewportHeight
    }
  });
};

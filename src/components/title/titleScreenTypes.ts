import type { GraphicsQualityTier } from '../../settings/graphicsPreference';
import {
  createGatewayClientPoint,
  createGatewayActivationRecord,
  createGatewayRendererPoint,
  currentGatewayViewport,
  type GatewayActivationInput,
  type GatewayActivationRecord,
  type GatewayClientPoint,
  type GatewayRenderedMeasurement,
  type GatewayRendererPoint
} from './gatewayActivation';

export type WarpkeepInputModality = 'keyboard' | 'pointer' | 'unknown';

export type WarpkeepTitlePhase =
  | 'active'
  | 'departing'
  | 'preparing-return'
  | 'returning';

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
  getGatewayClientCenter: () => GatewayClientPoint | null;
  getGatewayMeasurement: () => GatewayRenderedMeasurement;
  getGatewayActivation: (input: GatewayActivationInput) => GatewayActivationRecord;
};

export const fallbackGatewayRendererPoint = (): GatewayRendererPoint =>
  createGatewayRendererPoint({
    x: window.innerWidth * 0.5,
    y: window.innerHeight * 0.36,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    visible: true
  });

export const fallbackGatewayClientCenter = (): GatewayClientPoint =>
  createGatewayClientPoint(
    window.innerWidth * 0.5,
    window.innerHeight * 0.36
  )!;

export const fallbackGatewayMeasurement = (): GatewayRenderedMeasurement => {
  const rendererPoint = fallbackGatewayRendererPoint();
  const gatewayClientCenter = fallbackGatewayClientCenter();
  return Object.freeze({
    generation: 1,
    rendererPoint,
    sourceSurfaceRect: currentGatewayViewport(),
    gatewayClientCenter,
    buttonClientCenter: null,
    alignmentErrorPx: null,
    ready: true
  });
};

export const fallbackGatewayActivation = (
  input: GatewayActivationInput
): GatewayActivationRecord => {
  const measurement = fallbackGatewayMeasurement();
  return createGatewayActivationRecord({
    input,
    rendererPoint: measurement.rendererPoint,
    sourceSurfaceRect: measurement.sourceSurfaceRect,
    gatewayClientCenter: measurement.gatewayClientCenter,
    measurementGeneration: measurement.generation,
    ready: true
  });
};

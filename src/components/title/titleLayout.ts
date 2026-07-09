import { titleSceneSpec } from './titleSceneSpec';

export const titlePortraitAspect = 0.78;

export type TitleResponsiveLayout = {
  readonly portrait: boolean;
  readonly scale: number;
  readonly baseY: number;
  readonly cameraTargetY: number;
  readonly restYawRadians: number;
  readonly cameraDriftX: number;
};

export function calculateTitleResponsiveLayout(
  viewportWidth: number,
  viewportHeight: number,
  visibleWorldWidth: number,
  titleSafeWidth: number
): TitleResponsiveLayout {
  for (const [value, label] of [
    [viewportWidth, 'viewport width'],
    [viewportHeight, 'viewport height'],
    [visibleWorldWidth, 'visible world width'],
    [titleSafeWidth, 'title safe width']
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`Title ${label} must be a finite positive number.`);
    }
  }

  const portrait = viewportWidth / viewportHeight < titlePortraitAspect;
  const widthRatio = portrait
    ? titleSceneSpec.title.mobileViewportWidth
    : titleSceneSpec.title.desktopViewportWidth;

  return {
    portrait,
    scale: Math.min(1.16, (visibleWorldWidth * widthRatio) / titleSafeWidth),
    baseY: portrait ? -0.46 : -1.52,
    cameraTargetY: portrait ? 0.08 : -0.42,
    restYawRadians: (portrait ? -0.35 : -1.1) * Math.PI / 180,
    cameraDriftX: portrait ? 0.025 : 0.1
  };
}

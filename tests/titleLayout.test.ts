import { describe, expect, it } from 'vitest';
import { layoutBrutalistGlyphs } from '../src/components/title/brutalistGlyphs';
import { calculateTitleResponsiveLayout } from '../src/components/title/titleLayout';
import { titleSceneSpec } from '../src/components/title/titleSceneSpec';

const requiredViewports = [
  [1920, 1080],
  [1440, 900],
  [1280, 720],
  [768, 1024],
  [390, 844]
] as const;

function visibleWorldWidth(width: number, height: number) {
  const aspect = width / height;
  const cameraDistance = 10.8 - 0.28;
  const visibleHeight = 2 * cameraDistance * Math.tan((39 * Math.PI / 180) * 0.5);
  return visibleHeight * aspect;
}

describe('Warpkeep title responsive layout', () => {
  it('keeps the continuous wordmark inside its safe width at every required viewport', () => {
    const wordWidth = layoutBrutalistGlyphs(
      titleSceneSpec.title.text,
      titleSceneSpec.title.height
    ).width;
    const safeWidth = wordWidth + titleSceneSpec.title.depth * 0.22;

    requiredViewports.forEach(([width, height]) => {
      const visibleWidth = visibleWorldWidth(width, height);
      const layout = calculateTitleResponsiveLayout(width, height, visibleWidth, safeWidth);
      const expectedRatio = layout.portrait
        ? titleSceneSpec.title.mobileViewportWidth
        : titleSceneSpec.title.desktopViewportWidth;
      expect(layout.scale).toBeGreaterThan(0);
      expect(safeWidth * layout.scale).toBeLessThanOrEqual(visibleWidth * expectedRatio + 1e-10);
      expect(wordWidth * layout.scale).toBeLessThan(visibleWidth);
    });
  });

  it('uses portrait-safe yaw, camera drift, and composition for both tablet and phone', () => {
    const tablet = calculateTitleResponsiveLayout(768, 1024, 5.6, 7);
    const phone = calculateTitleResponsiveLayout(390, 844, 3.5, 7);
    const desktop = calculateTitleResponsiveLayout(1440, 900, 8, 7);

    expect(tablet.portrait).toBe(true);
    expect(phone.portrait).toBe(true);
    expect(Math.abs(tablet.restYawRadians)).toBeLessThan(Math.abs(desktop.restYawRadians));
    expect(phone.cameraDriftX).toBeLessThan(desktop.cameraDriftX);
    expect(tablet.baseY).toBe(phone.baseY);
    expect(desktop.baseY).not.toBe(phone.baseY);
  });

  it('rejects invalid viewport or geometry inputs', () => {
    expect(() => calculateTitleResponsiveLayout(0, 720, 8, 7)).toThrow(/viewport width/);
    expect(() => calculateTitleResponsiveLayout(1280, Number.NaN, 8, 7)).toThrow(/viewport height/);
    expect(() => calculateTitleResponsiveLayout(1280, 720, -1, 7)).toThrow(/visible world width/);
    expect(() => calculateTitleResponsiveLayout(1280, 720, 8, 0)).toThrow(/title safe width/);
  });
});

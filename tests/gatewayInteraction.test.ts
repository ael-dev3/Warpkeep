import { describe, expect, it } from 'vitest';
import {
  calculateActivationSurge,
  calculateGatewayInteractionRadius,
  calculateGatewayNoticePosition,
  calculateGatewayProximity,
  smoothGatewayEasing
} from '../src/components/title/gatewayInteraction';

describe('Warpkeep gateway interaction helpers', () => {
  it('returns smooth bounded proximity at the center, edge, and outside the radius', () => {
    expect(calculateGatewayProximity(100, 100, 100, 100, 200)).toBe(1);
    expect(calculateGatewayProximity(200, 100, 100, 100, 200)).toBeCloseTo(0.5, 8);
    expect(calculateGatewayProximity(300, 100, 100, 100, 200)).toBe(0);
    expect(calculateGatewayProximity(500, 100, 100, 100, 200)).toBe(0);
  });

  it('keeps easing monotonic and clamped', () => {
    const samples = [-1, 0, 0.1, 0.25, 0.5, 0.75, 0.9, 1, 2]
      .map(smoothGatewayEasing);

    samples.forEach((sample) => {
      expect(sample).toBeGreaterThanOrEqual(0);
      expect(sample).toBeLessThanOrEqual(1);
    });
    samples.slice(1).forEach((sample, index) => {
      expect(sample).toBeGreaterThanOrEqual(samples[index]);
    });
  });

  it('handles invalid proximity inputs and viewport sizes safely', () => {
    expect(calculateGatewayProximity(Number.NaN, 0, 0, 0, 100)).toBe(0);
    expect(calculateGatewayProximity(0, 0, 0, 0, 0)).toBe(0);
    expect(calculateGatewayProximity(0, 0, 0, 0, -10)).toBe(0);
    expect(calculateGatewayInteractionRadius(390, 844)).toBeCloseTo(120.9, 8);
    expect(calculateGatewayInteractionRadius(844, 390)).toBeCloseTo(120.9, 8);
    expect(calculateGatewayInteractionRadius(0, 844)).toBe(0);
    expect(calculateGatewayInteractionRadius(Number.POSITIVE_INFINITY, 844)).toBe(0);
    expect(calculateGatewayInteractionRadius(390, 844, 0)).toBe(0);
    expect(calculateGatewayInteractionRadius(390, 844, Number.NaN)).toBe(0);
  });

  it('creates a smooth activation attack and release without overshoot', () => {
    const duration = 1.2;
    const attack = 0.12;
    expect(calculateActivationSurge(-0.01, duration, attack)).toBe(0);
    expect(calculateActivationSurge(0, duration, attack)).toBe(0);
    expect(calculateActivationSurge(attack * 0.5, duration, attack)).toBeCloseTo(0.5, 8);
    expect(calculateActivationSurge(attack, duration, attack)).toBe(1);
    expect(calculateActivationSurge(0.6, duration, attack)).toBeGreaterThan(0);
    expect(calculateActivationSurge(duration, duration, attack)).toBe(0);
    expect(calculateActivationSurge(10, duration, attack)).toBe(0);
    expect(calculateActivationSurge(0.5, 0, attack)).toBe(0);
  });

  it('clamps notice positions horizontally and prefers a fitting position below', () => {
    const center = calculateGatewayNoticePosition({
      anchorX: 640,
      anchorY: 260,
      noticeWidth: 320,
      noticeHeight: 90,
      viewportWidth: 1280,
      viewportHeight: 720
    });
    const leftEdge = calculateGatewayNoticePosition({
      anchorX: 5,
      anchorY: 260,
      noticeWidth: 320,
      noticeHeight: 90,
      viewportWidth: 1280,
      viewportHeight: 720
    });
    const rightEdge = calculateGatewayNoticePosition({
      anchorX: 1275,
      anchorY: 260,
      noticeWidth: 320,
      noticeHeight: 90,
      viewportWidth: 1280,
      viewportHeight: 720
    });

    expect(center).toEqual({ left: 480, top: 310, placement: 'below' });
    expect(leftEdge.left).toBe(16);
    expect(rightEdge.left).toBe(944);
  });

  it('flips above near the bottom and remains inside portrait and landscape viewports', () => {
    const viewports = [
      { width: 390, height: 844 },
      { width: 844, height: 390 }
    ];

    viewports.forEach(({ width, height }) => {
      const noticeWidth = Math.min(320, width - 32);
      const noticeHeight = 84;
      const position = calculateGatewayNoticePosition({
        anchorX: width - 4,
        anchorY: height - 28,
        noticeWidth,
        noticeHeight,
        viewportWidth: width,
        viewportHeight: height
      });

      expect(position.placement).toBe('above');
      expect(position.left).toBeGreaterThanOrEqual(16);
      expect(position.top).toBeGreaterThanOrEqual(16);
      expect(position.left + noticeWidth).toBeLessThanOrEqual(width - 16);
      expect(position.top + noticeHeight).toBeLessThanOrEqual(height - 16);
    });
  });

  it('honors a fitting preferred placement for short landscape layouts', () => {
    const position = calculateGatewayNoticePosition({
      anchorX: 422,
      anchorY: 182,
      noticeWidth: 336,
      noticeHeight: 66,
      viewportWidth: 844,
      viewportHeight: 390,
      preferredPlacement: 'above'
    });

    expect(position.placement).toBe('above');
    expect(position.top).toBe(66);
    expect(position.top + 66).toBeLessThan(182);
  });

  it('returns finite safe notice coordinates for malformed inputs', () => {
    expect(calculateGatewayNoticePosition({
      anchorX: Number.NaN,
      anchorY: Number.POSITIVE_INFINITY,
      noticeWidth: -20,
      noticeHeight: Number.NaN,
      viewportWidth: 0,
      viewportHeight: -10
    })).toEqual({ left: 0, top: 0, placement: 'below' });
  });
});

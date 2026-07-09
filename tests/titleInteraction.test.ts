import { describe, expect, it } from 'vitest';
import { dampValue, isMousePointerType, normalizePointerPosition } from '../src/components/title/titleInteraction';
import { titleSceneSpec } from '../src/components/title/titleSceneSpec';

describe('Warpkeep pointer perspective', () => {
  it('normalizes the pointer around the viewport center and clamps outside movement', () => {
    const bounds = { left: 100, top: 50, width: 800, height: 400 };

    expect(normalizePointerPosition(500, 250, bounds)).toEqual({ x: 0, y: 0 });
    expect(normalizePointerPosition(900, 50, bounds)).toEqual({ x: 1, y: 1 });
    expect(normalizePointerPosition(-500, 900, bounds)).toEqual({ x: -1, y: -1 });
  });

  it('only tracks mouse movement so hybrid touchscreens remain stable', () => {
    expect(isMousePointerType('mouse')).toBe(true);
    expect(isMousePointerType('touch')).toBe(false);
    expect(isMousePointerType('pen')).toBe(false);
    expect(isMousePointerType('')).toBe(false);
  });

  it('uses frame-rate-independent damping without overshoot', () => {
    const response = titleSceneSpec.interaction.damping;
    const fullStep = dampValue(0, 1, 1 / 60, response);
    const firstHalf = dampValue(0, 1, 1 / 120, response);
    const twoHalfSteps = dampValue(firstHalf, 1, 1 / 120, response);

    expect(fullStep).toBeGreaterThan(0);
    expect(fullStep).toBeLessThan(1);
    expect(twoHalfSteps).toBeCloseTo(fullStep, 8);
    expect(dampValue(0.9, 1, 1, response)).toBeLessThanOrEqual(1);
  });

  it('caps perspective travel so the title and complete galaxy remain readable', () => {
    const interaction = titleSceneSpec.interaction;

    expect(interaction.cameraTravelX).toBeLessThanOrEqual(0.45);
    expect(interaction.cameraTravelY).toBeLessThanOrEqual(0.28);
    expect(interaction.titleRotationX).toBeLessThanOrEqual(0.035);
    expect(interaction.titleRotationY).toBeLessThanOrEqual(0.055);
    expect(interaction.galaxyTravelX).toBeLessThanOrEqual(0.3);
    expect(interaction.galaxyTravelY).toBeLessThanOrEqual(0.18);
    expect(interaction.galaxyRotationX).toBeLessThanOrEqual(0.018);
    expect(interaction.galaxyRotationY).toBeLessThanOrEqual(0.024);
    expect(interaction.damping).toBeGreaterThanOrEqual(5);
    expect(interaction.damping).toBeLessThanOrEqual(12);
  });
});

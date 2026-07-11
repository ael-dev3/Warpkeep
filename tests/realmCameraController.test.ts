import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clampRealmPan,
  createRealmCameraController,
  dampingAlpha,
  deriveRealmCameraPose,
  fitRealmOverview,
  normalizeWheelDelta
} from '../src/components/realm/realmCameraController';

const BOUNDS = {
  minX: -9.53,
  maxX: 9.53,
  minY: -0.2,
  maxY: 0.2,
  minZ: -8.5,
  maxZ: 8.5
};

const KEEP = { x: 0, y: 0.05, z: 0, height: 1.06 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('realm perspective camera math', () => {
  it('fits finite overview framing across landscape and portrait aspects', () => {
    expect(fitRealmOverview(BOUNDS, 16 / 9)).toBeGreaterThan(5);
    expect(fitRealmOverview(BOUNDS, 9 / 16)).toBeGreaterThan(fitRealmOverview(BOUNDS, 16 / 9));
    expect(Number.isFinite(fitRealmOverview(BOUNDS, 0))).toBe(true);
  });

  it('smoothly changes from a strategy-like view into a close keep perspective', () => {
    const overview = deriveRealmCameraPose(0, { x: 0, z: 0 }, BOUNDS, KEEP, 16 / 9);
    const middle = deriveRealmCameraPose(0.5, { x: 3, z: -2 }, BOUNDS, KEEP, 16 / 9);
    const close = deriveRealmCameraPose(1, { x: 3, z: -2 }, BOUNDS, KEEP, 16 / 9);

    expect(overview.mode).toBe('realm');
    expect(middle.mode).toBe('approach');
    expect(close.mode).toBe('keep');
    expect(close.fov).toBeGreaterThan(overview.fov);
    expect(close.pitchDegrees).toBeLessThan(overview.pitchDegrees);
    expect(close.distance).toBeLessThan(middle.distance);
    expect(middle.distance).toBeLessThan(overview.distance);
    expect(close.visibleHalfHeight).toBeLessThan(overview.visibleHalfHeight);
    expect(close.target.x).toBeCloseTo(KEEP.x, 6);
    expect(close.target.z).toBeCloseTo(KEEP.z, 6);
    expect(close.position.y).toBeGreaterThan(close.target.y);
    expect(overview.fogNear).toBeLessThan(overview.distance);
    expect(overview.fogFar).toBeGreaterThan(overview.distance);
    expect((overview.distance - overview.fogNear) / (overview.fogFar - overview.fogNear)).toBeLessThan(0.25);
    expect(close.fogNear).toBeGreaterThan(close.distance);
    [overview, middle, close].forEach((pose) => {
      expect(Object.values(pose.position).every(Number.isFinite)).toBe(true);
      expect(Object.values(pose.target).every(Number.isFinite)).toBe(true);
      expect(pose.near).toBeGreaterThan(0);
      expect(pose.far).toBeGreaterThan(pose.near);
      expect(pose.fogFar).toBeGreaterThan(pose.fogNear);
    });
  });

  it('clamps panning more tightly at the full-realm view', () => {
    const overview = deriveRealmCameraPose(0, { x: 100, z: -100 }, BOUNDS, KEEP, 16 / 9);
    const closePose = deriveRealmCameraPose(1, { x: 0, z: 0 }, BOUNDS, KEEP, 16 / 9);
    const closePan = clampRealmPan({ x: 100, z: -100 }, BOUNDS, 1, closePose.visibleHalfHeight, 16 / 9);

    expect(overview.target.x).toBeCloseTo(0, 6);
    expect(overview.target.z).toBeCloseTo(0, 6);
    expect(closePan.x).toBeLessThan(11);
    expect(closePan.z).toBeGreaterThan(-10);
  });

  it('normalizes wheel units and keeps damping frame-rate independent', () => {
    expect(normalizeWheelDelta(1, 1, 900)).toBe(16);
    expect(normalizeWheelDelta(1, 2, 900)).toBe(900);
    expect(dampingAlpha(10, 1 / 30)).toBeGreaterThan(dampingAlpha(10, 1 / 60));
    const afterThirtyFps = 1 - (1 - dampingAlpha(10, 1 / 30)) ** 30;
    const afterSixtyFps = 1 - (1 - dampingAlpha(10, 1 / 60)) ** 60;
    expect(afterThirtyFps).toBeCloseTo(afterSixtyFps, 6);
  });

  it('settles reduced-motion focus changes immediately and keeps fog valid', () => {
    const fog = new THREE.Fog('#a6bcaf', 1, 2);
    const render = vi.fn();
    const controller = createRealmCameraController({
      bounds: BOUNDS,
      keepFocus: KEEP,
      fog,
      reducedMotion: true,
      render
    });

    controller.setViewport(1440, 900);
    controller.focusKeep();

    expect(controller.getZoom()).toBe(1);
    expect(controller.getMode()).toBe('keep');
    expect(controller.camera.fov).toBeCloseTo(42, 6);
    expect(fog.far).toBeGreaterThan(fog.near);
    expect(render).toHaveBeenCalled();
    controller.dispose();
  });

  it('resumes an interrupted demand-render transition after visibility returns', () => {
    let hidden = false;
    let nextFrame = 1;
    const scheduled = new Map<number, FrameRequestCallback>();
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextFrame;
      nextFrame += 1;
      scheduled.set(id, callback);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      scheduled.delete(id);
    });
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const controller = createRealmCameraController({
      bounds: BOUNDS,
      keepFocus: KEEP,
      fog: new THREE.Fog('#a6bcaf', 1, 2),
      reducedMotion: false,
      render: vi.fn()
    });

    controller.focusKeep();
    expect(requestFrame).toHaveBeenCalledTimes(1);
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(scheduled.size).toBe(0);

    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(requestFrame).toHaveBeenCalledTimes(2);
    expect(scheduled.size).toBe(1);
    controller.dispose();
  });
});

import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTerrainOverviewHull } from '../src/components/realm/createTerrainGeometry';
import {
  clampRealmInteractiveZoom,
  clampRealmPan,
  createRealmCameraController,
  dampingAlpha,
  DEFAULT_REALM_CAMERA_SPEC,
  deriveRealmCameraPose,
  deriveRealmCameraPoseForViewport,
  fitRealmFocusHalfHeight,
  fitRealmOverview,
  isRealmScreenBoundsInsideSafeViewport,
  normalizeWheelDelta,
  projectRealmFocusBounds,
  projectRealmPointToViewport,
  REALM_INTERACTIVE_MIN_ZOOM
} from '../src/components/realm/realmCameraController';
import { generateRealmTerrainMap } from '../src/game/map/generateTerrainMap';
import { HEGEMONY_GENESIS_001 } from '../src/game/map/realmSeed';

const BOUNDS = {
  minX: -9.53,
  maxX: 9.53,
  minY: -0.2,
  maxY: 0.2,
  minZ: -8.5,
  maxZ: 8.5
};

const KEEP = { x: 0, y: 0.05, z: 0, height: 1.06, footprintDiameter: 1.48 };
const SELECTED_CASTLE = {
  x: 3.2,
  y: 0.05,
  z: -2.4,
  height: 1.4,
  footprintDiameter: 1.8
};
const REALM_HULL = createTerrainOverviewHull(
  generateRealmTerrainMap(HEGEMONY_GENESIS_001, 22),
  1
);
const REALM_HULL_BOUNDS = {
  minX: Math.min(...REALM_HULL.map((point) => point.x)),
  maxX: Math.max(...REALM_HULL.map((point) => point.x)),
  minY: BOUNDS.minY,
  maxY: BOUNDS.maxY,
  minZ: Math.min(...REALM_HULL.map((point) => point.z)),
  maxZ: Math.max(...REALM_HULL.map((point) => point.z))
};

function round(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

function groundPointAt(
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  localX: number,
  localY: number
) {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(
    (localX / width) * 2 - 1,
    1 - (localY / height) * 2
  ), camera);
  return raycaster.ray.intersectPlane(
    new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    new THREE.Vector3()
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('realm perspective camera math', () => {
  it('fits finite overview framing across landscape and portrait aspects', () => {
    expect(fitRealmOverview(BOUNDS, 16 / 9)).toBeGreaterThan(5);
    expect(fitRealmOverview(BOUNDS, 9 / 16)).toBeGreaterThan(fitRealmOverview(BOUNDS, 16 / 9));
    expect(Number.isFinite(fitRealmOverview(BOUNDS, 0))).toBe(true);
  });

  it('contains the actual realm perimeter without fitting nonexistent AABB corners', () => {
    expect(REALM_HULL).toHaveLength(12);
    const boxFit = fitRealmOverview(REALM_HULL_BOUNDS, 16 / 9);
    const hullFit = fitRealmOverview(
      REALM_HULL_BOUNDS,
      16 / 9,
      DEFAULT_REALM_CAMERA_SPEC.overviewPitchDegrees,
      DEFAULT_REALM_CAMERA_SPEC.azimuthDegrees,
      REALM_HULL
    );
    expect(hullFit).toBeLessThan(boxFit);

    [
      {
        viewport: { width: 1_920, height: 1_080 },
        composition: {
          insets: { top: 24, right: 24, bottom: 84, left: 236 },
          safeAreaInsets: { top: 8, right: 8, bottom: 8, left: 8 }
        }
      },
      {
        viewport: { width: 390, height: 844 },
        composition: {
          insets: { top: 58, right: 8, bottom: 86, left: 8 },
          safeAreaInsets: { top: 47, right: 0, bottom: 34, left: 0 }
        }
      },
      {
        viewport: { width: 667, height: 375 },
        composition: {
          insets: { top: 12, right: 12, bottom: 58, left: 126 },
          safeAreaInsets: { top: 0, right: 24, bottom: 21, left: 24 }
        }
      }
    ].forEach(({ viewport, composition }) => {
      const pose = deriveRealmCameraPoseForViewport(
        0,
        { x: 0, z: 0 },
        REALM_HULL_BOUNDS,
        KEEP,
        viewport,
        composition,
        DEFAULT_REALM_CAMERA_SPEC,
        REALM_HULL
      );
      REALM_HULL.forEach((point) => {
        [REALM_HULL_BOUNDS.minY, REALM_HULL_BOUNDS.maxY + 1.4].forEach((y) => {
          const projected = projectRealmPointToViewport(pose, { ...point, y });
          expect(projected.visible).toBe(true);
          expect(projected.x).toBeGreaterThanOrEqual(pose.safeViewport.left - 0.000001);
          expect(projected.x).toBeLessThanOrEqual(pose.safeViewport.right + 0.000001);
          expect(projected.y).toBeGreaterThanOrEqual(pose.safeViewport.top - 0.000001);
          expect(projected.y).toBeLessThanOrEqual(pose.safeViewport.bottom + 0.000001);
        });
      });
    });
  });

  it('smoothly changes from a strategy-like view into a close keep perspective', () => {
    const overview = deriveRealmCameraPose(0, { x: 0, z: 0 }, BOUNDS, KEEP, 16 / 9);
    const middle = deriveRealmCameraPose(0.5, { x: 3, z: -2 }, BOUNDS, KEEP, 16 / 9);
    const close = deriveRealmCameraPose(1, { x: 3, z: -2 }, BOUNDS, KEEP, 16 / 9);

    expect(overview.mode).toBe('realm');
    expect(middle.mode).toBe('approach');
    expect(close.mode).toBe('keep');
    expect(close.fov).toBeLessThanOrEqual(overview.fov);
    expect(close.distance).toBeGreaterThan(
      close.visibleHalfHeight / Math.tan((overview.fov * Math.PI) / 360)
    );
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

  it('keeps the full keep footprint framed across tall portrait targets', () => {
    [
      [320, 568],
      [390, 844],
      [412, 915],
      [430, 932],
      [768, 1024]
    ].forEach(([width, height]) => {
      const aspect = width / height;
      const close = deriveRealmCameraPose(1, { x: 0, z: 0 }, BOUNDS, KEEP, aspect);
      expect(close.visibleHalfHeight).toBeGreaterThanOrEqual(1.62);
      expect(close.visibleHalfHeight * aspect).toBeGreaterThanOrEqual(
        KEEP.footprintDiameter * 0.55 - 0.000001
      );
    });
  });

  it('keeps selected-castle bounds inside golden safe rectangles with inspectors closed and open', () => {
    const cases = [
      {
        name: '1920x1080',
        viewport: { width: 1_920, height: 1_080 },
        safeAreaInsets: { top: 8, right: 8, bottom: 8, left: 8 },
        closed: { top: 24, right: 24, bottom: 84, left: 236 },
        open: { top: 24, right: 360, bottom: 84, left: 236 },
        focusPadding: 24
      },
      {
        name: '1440x900',
        viewport: { width: 1_440, height: 900 },
        safeAreaInsets: { top: 6, right: 10, bottom: 8, left: 10 },
        closed: { top: 20, right: 20, bottom: 80, left: 210 },
        open: { top: 20, right: 300, bottom: 80, left: 210 },
        focusPadding: 20
      },
      {
        name: '1024x768',
        viewport: { width: 1_024, height: 768 },
        safeAreaInsets: { top: 8, right: 8, bottom: 12, left: 8 },
        closed: { top: 18, right: 16, bottom: 88, left: 170 },
        open: { top: 18, right: 260, bottom: 88, left: 170 },
        focusPadding: 18
      },
      {
        name: '390x844',
        viewport: { width: 390, height: 844 },
        safeAreaInsets: { top: 47, right: 0, bottom: 34, left: 0 },
        closed: { top: 58, right: 8, bottom: 86, left: 8 },
        open: { top: 58, right: 8, bottom: 330, left: 8 },
        focusPadding: 14
      },
      {
        name: '667x375',
        viewport: { width: 667, height: 375 },
        safeAreaInsets: { top: 0, right: 24, bottom: 21, left: 24 },
        closed: { top: 12, right: 12, bottom: 58, left: 126 },
        open: { top: 12, right: 238, bottom: 58, left: 126 },
        focusPadding: 12
      }
    ] as const;
    const golden: unknown[] = [];

    cases.forEach((testCase) => {
      (['closed', 'open'] as const).forEach((inspector) => {
        const composition = {
          insets: testCase[inspector],
          safeAreaInsets: testCase.safeAreaInsets,
          focusPadding: testCase.focusPadding
        };
        const pose = deriveRealmCameraPoseForViewport(
          1,
          { x: 0, z: 0 },
          BOUNDS,
          SELECTED_CASTLE,
          testCase.viewport,
          composition
        );
        const pivot = projectRealmPointToViewport(pose, {
          x: SELECTED_CASTLE.x,
          y: SELECTED_CASTLE.y + SELECTED_CASTLE.height * 0.38,
          z: SELECTED_CASTLE.z
        });
        const bounds = projectRealmFocusBounds(pose, SELECTED_CASTLE);

        expect(pivot.x).toBeCloseTo(pose.safeViewport.centerX, 6);
        expect(pivot.y).toBeCloseTo(pose.safeViewport.centerY, 6);
        expect(isRealmScreenBoundsInsideSafeViewport(
          bounds,
          pose.safeViewport,
          testCase.focusPadding
        )).toBe(true);
        const fittedHalfHeight = fitRealmFocusHalfHeight(
          SELECTED_CASTLE,
          testCase.viewport,
          composition
        );
        expect(Number.isFinite(fittedHalfHeight)).toBe(true);
        expect(fittedHalfHeight).toBeCloseTo(fitRealmFocusHalfHeight(
          SELECTED_CASTLE,
          testCase.viewport,
          composition
        ), 12);

        golden.push({
          name: testCase.name,
          inspector,
          safe: [
            pose.safeViewport.left,
            pose.safeViewport.top,
            pose.safeViewport.right,
            pose.safeViewport.bottom
          ].map(round),
          center: [pivot.x, pivot.y].map(round),
          bounds: [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].map(round),
          halfHeight: round(pose.visibleHalfHeight),
          distance: round(pose.distance),
          fov: pose.fov
        });
      });
    });

    expect(golden).toEqual([
      { name: '1920x1080', inspector: 'closed', safe: [244, 32, 1_888, 988], center: [1_066, 510], bounds: [680.175, 137.181, 1_456.557, 843.698], halfHeight: 1.83, distance: 11.555, fov: 18 },
      { name: '1920x1080', inspector: 'open', safe: [244, 32, 1_552, 988], center: [898, 510], bounds: [505.624, 137.181, 1_283.24, 843.698], halfHeight: 1.83, distance: 11.555, fov: 18 },
      { name: '1440x900', inspector: 'closed', safe: [220, 26, 1_410, 812], center: [815, 419], bounds: [498.206, 112.587, 1_136.179, 692.557], halfHeight: 1.855, distance: 11.712, fov: 18 },
      { name: '1440x900', inspector: 'open', safe: [220, 26, 1_130, 812], center: [675, 419], bounds: [352.823, 112.587, 991.809, 692.557], halfHeight: 1.855, distance: 11.712, fov: 18 },
      { name: '1024x768', inspector: 'closed', safe: [178, 26, 1_000, 668], center: [589, 347], bounds: [330.52, 96.686, 850.865, 568.824], halfHeight: 1.938, distance: 12.236, fov: 18 },
      { name: '1024x768', inspector: 'open', safe: [178, 26, 756, 668], center: [467, 347], bounds: [204.038, 96.686, 725.225, 568.824], halfHeight: 1.938, distance: 12.236, fov: 18 },
      { name: '390x844', inspector: 'closed', safe: [8, 105, 382, 724], center: [195, 414.5], bounds: [22, 241.421, 367.304, 560.584], halfHeight: 3.172, distance: 20.024, fov: 18 },
      { name: '390x844', inspector: 'open', safe: [8, 105, 382, 480], center: [195, 292.5], bounds: [44.949, 145.043, 344.527, 413.887], halfHeight: 3.646, distance: 23.02, fov: 18 },
      { name: '667x375', inspector: 'closed', safe: [150, 12, 631, 296], center: [390.5, 154], bounds: [277.194, 43.474, 506.54, 250.317], halfHeight: 2.139, distance: 13.506, fov: 18 },
      { name: '667x375', inspector: 'open', safe: [150, 12, 405, 296], center: [277.5, 154], bounds: [162, 44.822, 389.002, 248.992], halfHeight: 2.167, distance: 13.682, fov: 18 }
    ]);
  });

  it('normalizes wheel units and keeps damping frame-rate independent', () => {
    expect(normalizeWheelDelta(1, 1, 900)).toBe(16);
    expect(normalizeWheelDelta(1, 2, 900)).toBe(900);
    expect(dampingAlpha(10, 1 / 30)).toBeGreaterThan(dampingAlpha(10, 1 / 60));
    const afterThirtyFps = 1 - (1 - dampingAlpha(10, 1 / 30)) ** 30;
    const afterSixtyFps = 1 - (1 - dampingAlpha(10, 1 / 60)) ** 60;
    expect(afterThirtyFps).toBeCloseTo(afterSixtyFps, 6);
  });

  it('keeps the ordinary floor while entering continuously from an explicit overview', () => {
    expect(clampRealmInteractiveZoom(0.8, -1)).toBe(REALM_INTERACTIVE_MIN_ZOOM);
    expect(clampRealmInteractiveZoom(REALM_INTERACTIVE_MIN_ZOOM, 0))
      .toBe(REALM_INTERACTIVE_MIN_ZOOM);
    expect(clampRealmInteractiveZoom(0, -1)).toBe(0);
    expect(clampRealmInteractiveZoom(0, 0.05)).toBe(0.05);
  });

  it('applies the input floor to wheel and pinch while showRealm retains zoom zero', () => {
    const controller = createRealmCameraController({
      bounds: REALM_HULL_BOUNDS,
      overviewHull: REALM_HULL,
      keepFocus: KEEP,
      fog: new THREE.Fog('#a6bcaf', 1, 2),
      reducedMotion: true,
      render: vi.fn()
    });
    controller.setViewport(1_280, 720);
    controller.frameAt(KEEP, 0.6);

    controller.zoomByAt(-1, 640, 360);
    expect(controller.getZoom()).toBe(REALM_INTERACTIVE_MIN_ZOOM);
    controller.zoomBy(-1);
    expect(controller.getZoom()).toBe(REALM_INTERACTIVE_MIN_ZOOM);
    controller.zoomByWheel(10_000, 0);
    expect(controller.getZoom()).toBe(REALM_INTERACTIVE_MIN_ZOOM);

    controller.showRealm();
    expect(controller.getZoom()).toBe(0);
    controller.zoomByWheel(10_000, 0);
    expect(controller.getZoom()).toBe(0);
    controller.zoomByAt(-1, 640, 360);
    expect(controller.getZoom()).toBe(0);
    controller.zoomByAt(0.01, 640, 360);
    expect(controller.getZoom()).toBe(0.01);
    controller.dispose();
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
    expect(controller.camera.fov).toBeCloseTo(DEFAULT_REALM_CAMERA_SPEC.closeFov, 6);
    expect(fog.far).toBeGreaterThan(fog.near);
    expect(render).toHaveBeenCalled();
    controller.dispose();
  });

  it('keeps close-view panning effective after focus blending reaches the keep', () => {
    const controller = createRealmCameraController({
      bounds: BOUNDS,
      keepFocus: KEEP,
      fog: new THREE.Fog('#a6bcaf', 1, 2),
      reducedMotion: true,
      render: vi.fn()
    });
    controller.setViewport(1_280, 720);
    controller.focusKeep();
    const before = controller.getPose();

    controller.panByPixels(96, -48);
    const after = controller.getPose();

    expect(after.mode).toBe('keep');
    expect(Math.hypot(
      after.focus.x - before.focus.x,
      after.focus.z - before.focus.z
    )).toBeGreaterThan(0.01);
    expect(Math.hypot(
      after.target.x - before.target.x,
      after.target.z - before.target.z
    )).toBeGreaterThan(0.01);
    controller.dispose();
  });

  it('keeps an off-centre ground point anchored beneath a stationary pinch', () => {
    const controller = createRealmCameraController({
      bounds: BOUNDS,
      keepFocus: KEEP,
      fog: new THREE.Fog('#a6bcaf', 1, 2),
      reducedMotion: true,
      render: vi.fn()
    });
    const width = 1_280;
    const height = 720;
    const localX = 940;
    const localY = 260;
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const groundPoint = () => {
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(
        (localX / width) * 2 - 1,
        1 - (localY / height) * 2
      ), controller.camera);
      const point = raycaster.ray.intersectPlane(ground, new THREE.Vector3());
      expect(point).not.toBeNull();
      return point as THREE.Vector3;
    };
    controller.setViewport(width, height);
    controller.frameAt(KEEP, 0.46);
    const before = groundPoint();

    controller.zoomByAt(0.16, localX, localY);
    const after = groundPoint();

    expect(controller.getZoom()).toBeCloseTo(0.62, 6);
    expect(after.distanceTo(before)).toBeLessThan(0.000001);
    controller.dispose();
  });

  it('keeps an elevated castle foundation fixed during label-origin wheel zoom', () => {
    const controller = createRealmCameraController({
      bounds: BOUNDS,
      keepFocus: KEEP,
      fog: new THREE.Fog('#a6bcaf', 1, 2),
      reducedMotion: true,
      render: vi.fn()
    });
    const foundation = { x: 1.8, y: 0.175, z: -1.35 };
    controller.setViewport(1_280, 720);
    controller.frameAt(KEEP, 0.46);
    const before = controller.projectPoint(foundation);
    expect(before.visible).toBe(true);

    controller.zoomByWheelAtWorld(-208.333333, 0, foundation, before.x, before.y);
    const after = controller.projectPoint(foundation);

    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(0.000001);
    controller.dispose();
  });

  it('keeps cursor-anchored wheel zoom stable throughout non-reduced easing', () => {
    let nextFrameId = 1;
    const scheduled = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextFrameId;
      nextFrameId += 1;
      scheduled.set(id, callback);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      scheduled.delete(id);
    });
    const controller = createRealmCameraController({
      bounds: BOUNDS,
      keepFocus: KEEP,
      fog: new THREE.Fog('#a6bcaf', 1, 2),
      reducedMotion: false,
      render: vi.fn()
    });
    const width = 1_280;
    const height = 720;
    const localX = 930;
    const localY = 270;
    let time = 0;
    const runNextFrame = () => {
      const entry = scheduled.entries().next().value as [number, FrameRequestCallback] | undefined;
      expect(entry).toBeDefined();
      if (!entry) return;
      scheduled.delete(entry[0]);
      time += 1000 / 60;
      entry[1](time);
    };

    controller.setViewport(width, height);
    controller.frameAt(KEEP, 0.46);
    for (let index = 0; index < 120 && scheduled.size > 0; index += 1) runNextFrame();
    const anchor = groundPointAt(controller.camera, width, height, localX, localY);
    expect(anchor).not.toBeNull();

    controller.zoomByWheel(-180, 0, localX, localY);
    let sampledFrames = 0;
    while (scheduled.size > 0 && sampledFrames < 120) {
      runNextFrame();
      const current = groundPointAt(controller.camera, width, height, localX, localY);
      expect(current).not.toBeNull();
      expect(current?.distanceTo(anchor as THREE.Vector3)).toBeLessThan(0.002);
      sampledFrames += 1;
    }
    expect(sampledFrames).toBeGreaterThan(1);
    expect(scheduled.size).toBe(0);
    controller.dispose();
  });

  it('settles anchored zoom after composition and viewport geometry changes', () => {
    let nextFrameId = 1;
    let time = 0;
    const scheduled = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextFrameId;
      nextFrameId += 1;
      scheduled.set(id, callback);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      scheduled.delete(id);
    });
    const runNextFrame = () => {
      const entry = scheduled.entries().next().value as
        | [number, FrameRequestCallback]
        | undefined;
      expect(entry).toBeDefined();
      if (!entry) return;
      scheduled.delete(entry[0]);
      time += 1000 / 60;
      entry[1](time);
    };
    const runFramesToSettle = (maximum = 240) => {
      let frameCount = 0;
      while (scheduled.size > 0 && frameCount < maximum) {
        runNextFrame();
        frameCount += 1;
      }
      expect(scheduled.size).toBe(0);
    };
    const controller = createRealmCameraController({
      bounds: BOUNDS,
      keepFocus: KEEP,
      fog: new THREE.Fog('#a6bcaf', 1, 2),
      reducedMotion: false,
      render: vi.fn()
    });

    controller.setViewport(1_280, 720);
    controller.frameAt(KEEP, 0.46);
    runFramesToSettle();

    controller.zoomByWheel(-180, 0, 930, 270);
    runNextFrame();
    controller.setComposition({
      insets: { top: 24, right: 320, bottom: 80, left: 220 },
      focusPadding: 24
    });
    runFramesToSettle();

    controller.zoomByWheel(180, 0, 780, 340);
    runNextFrame();
    controller.setViewport(1_024, 768);
    runFramesToSettle();
    controller.dispose();
  });

  it('turns a drag into immediate ground-plane direct manipulation', () => {
    const controller = createRealmCameraController({
      bounds: BOUNDS,
      keepFocus: KEEP,
      fog: new THREE.Fog('#a6bcaf', 1, 2),
      reducedMotion: true,
      render: vi.fn()
    });
    const width = 1_280;
    const height = 720;
    controller.setViewport(width, height);
    controller.frameAt(KEEP, 0.62);
    const grabbed = groundPointAt(controller.camera, width, height, 560, 390);
    expect(grabbed).not.toBeNull();
    const before = controller.getPose();

    controller.beginDirectManipulation();
    controller.panBetweenViewportPoints(560, 390, 640, 420);
    const after = controller.getPose();
    const movedGrab = groundPointAt(controller.camera, width, height, 640, 420);

    expect(Math.hypot(after.focus.x - before.focus.x, after.focus.z - before.focus.z))
      .toBeGreaterThan(0.01);
    expect(movedGrab?.distanceTo(grabbed as THREE.Vector3)).toBeLessThan(0.000001);
    controller.endDirectManipulation();
    controller.dispose();
  });

  it('does not resurrect an off-centre keep target during manual overview zoom', () => {
    const offCentreKeep = { ...KEEP, x: 5.5, z: -4.25 };
    const controller = createRealmCameraController({
      bounds: BOUNDS,
      keepFocus: offCentreKeep,
      fog: new THREE.Fog('#a6bcaf', 1, 2),
      reducedMotion: true,
      render: vi.fn()
    });
    controller.setViewport(1_280, 720);
    controller.showRealm();
    for (let index = 0; index < 4; index += 1) {
      controller.zoomByWheel(-120, 0, 640, 360);
    }

    expect(controller.getZoom()).toBeCloseTo(0.3456, 6);
    expect(Math.hypot(controller.getPose().focus.x, controller.getPose().focus.z))
      .toBeLessThan(0.1);
    expect(controller.getPose().focus.x).not.toBeCloseTo(offCentreKeep.x, 2);
    controller.dispose();
  });

  it('focuses an arbitrary castle and recomposes immediately for reduced motion', () => {
    const render = vi.fn();
    const closedComposition = {
      insets: { top: 24, right: 24, bottom: 84, left: 236 },
      safeAreaInsets: { top: 8, right: 8, bottom: 8, left: 8 },
      focusPadding: 24
    };
    const openComposition = {
      ...closedComposition,
      insets: { ...closedComposition.insets, right: 360 }
    };
    const controller = createRealmCameraController({
      bounds: BOUNDS,
      keepFocus: KEEP,
      fog: new THREE.Fog('#a6bcaf', 1, 2),
      reducedMotion: true,
      render,
      composition: closedComposition
    });
    const camera = controller.camera;

    controller.setViewport(1_920, 1_080);
    controller.focusAt(SELECTED_CASTLE);
    const closedProjection = controller.projectPoint({
      x: SELECTED_CASTLE.x,
      y: SELECTED_CASTLE.y + SELECTED_CASTLE.height * 0.38,
      z: SELECTED_CASTLE.z
    });
    expect(closedProjection.x).toBeCloseTo(controller.getSafeViewport().centerX, 6);
    expect(closedProjection.y).toBeCloseTo(controller.getSafeViewport().centerY, 6);

    controller.setComposition(openComposition);
    const openProjection = controller.projectPoint({
      x: SELECTED_CASTLE.x,
      y: SELECTED_CASTLE.y + SELECTED_CASTLE.height * 0.38,
      z: SELECTED_CASTLE.z
    });
    const threeProjection = new THREE.Vector3(
      SELECTED_CASTLE.x,
      SELECTED_CASTLE.y + SELECTED_CASTLE.height * 0.38,
      SELECTED_CASTLE.z
    ).project(controller.camera);
    expect(controller.camera).toBe(camera);
    expect(controller.getMode()).toBe('keep');
    expect(openProjection.x).toBeCloseTo(controller.getSafeViewport().centerX, 6);
    expect(openProjection.y).toBeCloseTo(controller.getSafeViewport().centerY, 6);
    expect((threeProjection.x * 0.5 + 0.5) * 1_920).toBeCloseTo(
      controller.getSafeViewport().centerX,
      6
    );
    expect((-threeProjection.y * 0.5 + 0.5) * 1_080).toBeCloseTo(
      controller.getSafeViewport().centerY,
      6
    );
    expect(openProjection.x).toBeLessThan(closedProjection.x);
    expect(isRealmScreenBoundsInsideSafeViewport(
      projectRealmFocusBounds(controller.getPose(), SELECTED_CASTLE),
      controller.getSafeViewport(),
      openComposition.focusPadding
    )).toBe(true);
    expect(render).toHaveBeenCalled();
    controller.dispose();
  });

  it('frames an arbitrary founding center at a bounded approach zoom', () => {
    const controller = createRealmCameraController({
      bounds: BOUNDS,
      keepFocus: KEEP,
      fog: new THREE.Fog('#a6bcaf', 1, 2),
      reducedMotion: true,
      render: vi.fn()
    });
    const district = { ...KEEP, x: 4, z: -3 };

    controller.setViewport(390, 844);
    controller.frameAt(district, 0.562);

    expect(controller.getZoom()).toBeCloseTo(0.562, 6);
    expect(controller.getMode()).toBe('approach');
    expect(controller.getPose().focus.x).toBeCloseTo(district.x, 6);
    expect(controller.getPose().focus.z).toBeCloseTo(district.z, 6);
    expect(controller.projectPoint({ x: district.x, y: 0, z: district.z }).x)
      .toBeCloseTo(controller.getSafeViewport().centerX, 6);
    controller.dispose();
  });

  it('damps live composition updates without replacing the camera', () => {
    let pendingFrame: FrameRequestCallback | undefined;
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      pendingFrame = callback;
      return 1;
    });
    const controller = createRealmCameraController({
      bounds: BOUNDS,
      keepFocus: KEEP,
      fog: new THREE.Fog('#a6bcaf', 1, 2),
      reducedMotion: false,
      render: vi.fn()
    });
    controller.setViewport(1_920, 1_080);
    const camera = controller.camera;

    controller.setComposition({
      insets: { top: 24, right: 360, bottom: 84, left: 236 },
      safeAreaInsets: { top: 8, right: 8, bottom: 8, left: 8 },
      focusPadding: 24
    });
    expect(controller.camera).toBe(camera);
    expect(controller.getSafeViewport().left).toBe(0);
    expect(requestFrame).toHaveBeenCalledOnce();

    const firstFrame = pendingFrame;
    expect(firstFrame).toBeTypeOf('function');
    firstFrame?.(16);
    expect(controller.camera).toBe(camera);
    expect(controller.getSafeViewport().left).toBeGreaterThan(0);
    expect(controller.getSafeViewport().left).toBeLessThan(244);
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

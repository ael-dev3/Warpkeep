import { describe, expect, it } from 'vitest';

import {
  REALM_WORKER_CLIP_DURATIONS_SECONDS,
  REALM_WORKER_MAX_WALK_PLAYBACK_RATE,
  REALM_WORKER_MAX_LOCOMOTION_FRAME_SECONDS,
  REALM_WORKER_MIN_WALK_PLAYBACK_RATE,
  resolveRealmWorkerLocomotion,
  smoothRealmWorkerYaw
} from '../src/components/realm/realmWorkerLocomotion';
import type {
  RealmWorkerRoutePose,
  RealmWorkerSceneRecord,
  RealmWorkerTravelDirection,
  RealmWorkerVisualRoute
} from '../src/components/realm/realmWorkerRoutePresentation';
import {
  resolveRealmWorkerRoutePose,
  resolveRealmWorkerVisualRoute
} from '../src/components/realm/realmWorkerRoutePresentation';

const SECOND = 1_000_000n;
const OUTBOUND_START = 10n * SECOND;
const OUTBOUND_END = 20n * SECOND;
const TUNING = Object.freeze({
  wheelRadiusWorld: 0.25,
  walkCycleDistanceWorld: 2,
  maxTurnAnticipationDistanceWorld: 2
});

const VISUAL_ROUTE = Object.freeze({
  route: Object.freeze([
    Object.freeze({ q: 0, r: 0 }),
    Object.freeze({ q: 0, r: 1 }),
    Object.freeze({ q: 1, r: 1 })
  ]),
  movementPoints: Object.freeze([
    Object.freeze({ x: 0, z: 0 }),
    Object.freeze({ x: 0, z: 5 }),
    Object.freeze({ x: 5, z: 5 })
  ]),
  cumulativeDistances: Object.freeze([0, 5, 10]),
  normalizedProgress: Object.freeze([0, 0.5, 1]),
  tangents: Object.freeze([
    Object.freeze({ x: 0, z: 1 }),
    Object.freeze({ x: 1, z: 0 }),
    Object.freeze({ x: 1, z: 0 })
  ]),
  totalLength: 10,
  ribbonPoints: Object.freeze([
    Object.freeze({ x: 0, z: 5 }),
    Object.freeze({ x: 5, z: 5 })
  ]),
  ribbonProgress: Object.freeze([0.5, 1]),
  smoothingFallback: false,
  corridorValidationFailureCount: 0,
  contract: 'exact-match'
}) satisfies RealmWorkerVisualRoute;

const OUTBOUND_WORKER = Object.freeze({
  workerId: 'genesis-001-castle-7-worker-01',
  ordinal: 1 as const,
  originCastleId: 7,
  originCastleName: 'Hegemony Keep 007',
  status: 'outbound' as const,
  resourceKind: 'wood' as const,
  siteId: 'genesis-001:wood:0001',
  startedAtMicros: OUTBOUND_START,
  arrivesAtMicros: OUTBOUND_END,
  gatheringEndsAtMicros: 40n * SECOND,
  routeSteps: 2,
  timelineRevision: 1,
  revision: 1n,
  ownedByViewer: true,
  originCoord: Object.freeze({ q: 0, r: 0 }),
  destinationCoord: Object.freeze({ q: 1, r: 1 })
}) satisfies RealmWorkerSceneRecord;

function poseAt(
  direction: RealmWorkerTravelDirection,
  forwardProgress: number,
  options: Readonly<{
    phaseProgress?: number;
    yaw?: number;
    turnDelta?: number;
    segmentIndex?: number;
  }> = {}
): RealmWorkerRoutePose {
  const distance = Math.max(0, Math.min(1, forwardProgress)) * 10;
  const inferredSegment = distance <= 5 ? 0 : 1;
  const segmentIndex = options.segmentIndex ?? inferredSegment;
  const segmentProgress = segmentIndex === 0
    ? distance / 5
    : (distance - 5) / 5;
  const world = segmentIndex === 0
    ? Object.freeze({ x: 0, z: distance })
    : Object.freeze({ x: distance - 5, z: 5 });
  const yaw = options.yaw ?? (
    direction === 'returning'
      ? segmentIndex === 0 ? Math.PI : -Math.PI / 2
      : segmentIndex === 0 ? 0 : Math.PI / 2
  );
  return Object.freeze({
    world,
    coord: Object.freeze({ q: 0, r: segmentIndex }),
    yaw,
    tangent: Object.freeze({ x: Math.sin(yaw), z: Math.cos(yaw) }),
    turnDelta: options.turnDelta ?? 0,
    direction,
    forwardProgress,
    phaseProgress: options.phaseProgress ?? forwardProgress,
    segmentIndex,
    segmentProgress,
    route: VISUAL_ROUTE.route,
    contract: 'exact-match'
  });
}

function sample(
  worker: RealmWorkerSceneRecord,
  pose: RealmWorkerRoutePose,
  nowMicros: bigint,
  previous?: NonNullable<
    Parameters<typeof resolveRealmWorkerLocomotion>[0]['previous']
  >
) {
  return resolveRealmWorkerLocomotion({
    worker,
    pose,
    visualRoute: VISUAL_ROUTE,
    nowMicros,
    ...(previous === undefined ? {} : { previous }),
    tuning: TUNING
  })!;
}

function gatheringWorker(revision = 2n) {
  return Object.freeze({
    ...OUTBOUND_WORKER,
    status: 'gathering' as const,
    timelineRevision: 2,
    revision
  }) satisfies RealmWorkerSceneRecord;
}

function returningWorker(
  returnStartedAtMicros: bigint,
  returnsAtMicros: bigint,
  revision = 3n
) {
  return Object.freeze({
    ...OUTBOUND_WORKER,
    status: 'returning' as const,
    returnStartedAtMicros,
    returnsAtMicros,
    returnStartProgressBasisPoints: 10_000,
    timelineRevision: 3,
    revision
  }) satisfies RealmWorkerSceneRecord;
}

function angularDistance(left: number, right: number) {
  return Math.abs(Math.atan2(
    Math.sin(right - left),
    Math.cos(right - left)
  ));
}

describe('realm worker locomotion', () => {
  it('pins the approved real clip durations', () => {
    expect(REALM_WORKER_CLIP_DURATIONS_SECONDS).toEqual({
      Idle: 2,
      Start: 0.8,
      Stop: 0.8,
      Turn_Left: 1,
      Turn_Right: 1,
      Walk: 1
    });
  });

  it('completes outbound Start and site Stop one-shots into Walk and Idle', () => {
    const cases = [
      {
        label: 'start is active',
        worker: OUTBOUND_WORKER,
        now: OUTBOUND_START + 799_000n,
        pose: poseAt('outbound', 0.0799),
        phase: 'starting-outbound',
        clip: 'Start'
      },
      {
        label: 'start completed',
        worker: OUTBOUND_WORKER,
        now: OUTBOUND_START + 801_000n,
        pose: poseAt('outbound', 0.0801),
        phase: 'cruising-outbound',
        clip: 'Walk'
      },
      {
        label: 'arrival stop begins',
        worker: gatheringWorker(),
        now: OUTBOUND_END,
        pose: poseAt('gathering', 1, { phaseProgress: 1 }),
        phase: 'stopping-at-site',
        clip: 'Stop'
      },
      {
        label: 'arrival stop remains bounded',
        worker: gatheringWorker(),
        now: OUTBOUND_END + 799_000n,
        pose: poseAt('gathering', 1, { phaseProgress: 1 }),
        phase: 'stopping-at-site',
        clip: 'Stop'
      },
      {
        label: 'arrival stop completed',
        worker: gatheringWorker(),
        now: OUTBOUND_END + 800_000n,
        pose: poseAt('gathering', 1, { phaseProgress: 1 }),
        phase: 'gathering',
        clip: 'Idle'
      },
      {
        label: 'reconnect does not replay arrival stop',
        worker: gatheringWorker(88n),
        now: OUTBOUND_END + 12n * SECOND,
        pose: poseAt('gathering', 1, { phaseProgress: 1 }),
        phase: 'gathering',
        clip: 'Idle'
      }
    ] as const;

    for (const entry of cases) {
      const observed = sample(entry.worker, entry.pose, entry.now);
      expect(
        { phase: observed.phase, clip: observed.clipName },
        entry.label
      ).toEqual({ phase: entry.phase, clip: entry.clip });
      expect(observed.clipTimeSeconds).toBeGreaterThanOrEqual(0);
      expect(observed.clipTimeSeconds).toBeLessThanOrEqual(
        observed.clipDurationSeconds
      );
    }
  });

  it('completes return turnaround, Start and keep Stop one-shots', () => {
    const returnStart = 30n * SECOND;
    const returnEnd = 40n * SECOND;
    const worker = returningWorker(returnStart, returnEnd);
    const cases = [
      {
        elapsedMicros: 500_000n,
        forward: 0.95,
        phase: 'turnaround-return',
        clips: ['Turn_Left', 'Turn_Right']
      },
      {
        elapsedMicros: 1_100_000n,
        forward: 0.89,
        phase: 'starting-return',
        clips: ['Start']
      },
      {
        elapsedMicros: 1_801_000n,
        forward: 0.8199,
        phase: 'cruising-return',
        clips: ['Walk']
      },
      {
        elapsedMicros: 9_600_000n,
        forward: 0.04,
        phase: 'stopping-at-keep',
        clips: ['Stop']
      },
      {
        elapsedMicros: 10_000_000n,
        forward: 0,
        phase: 'parked',
        clips: ['Idle']
      }
    ] as const;

    for (const entry of cases) {
      const observed = sample(
        worker,
        poseAt('returning', entry.forward, {
          phaseProgress: Number(entry.elapsedMicros) / Number(10n * SECOND)
        }),
        returnStart + entry.elapsedMicros
      );
      expect(observed.phase).toBe(entry.phase);
      expect(entry.clips).toContain(observed.clipName);
    }
  });

  it.each([10, 50, 90] as const)(
    'preserves route, wheel and walk phase across a %i%% recall',
    (percentage) => {
      const recallProgress = percentage / 100;
      const recallAt = OUTBOUND_START
        + BigInt(percentage) * (OUTBOUND_END - OUTBOUND_START) / 100n;
      const returnDuration = BigInt(percentage) * SECOND / 10n;
      const outboundPose = poseAt('outbound', recallProgress, {
        phaseProgress: recallProgress,
        yaw: 0
      });
      const outbound = sample(
        OUTBOUND_WORKER,
        outboundPose,
        recallAt
      );
      const recalledWorker = returningWorker(
        recallAt,
        recallAt + returnDuration
      );
      const returnStart = sample(
        recalledWorker,
        poseAt('returning', recallProgress, {
          phaseProgress: 0,
          yaw: Math.PI
        }),
        recallAt,
        outbound.state
      );
      const halfReturned = sample(
        recalledWorker,
        poseAt('returning', recallProgress * 0.5, {
          phaseProgress: 0.5,
          yaw: Math.PI
        }),
        recallAt + returnDuration / 2n,
        returnStart.state
      );

      expect(returnStart.forwardRouteDistance).toBeCloseTo(
        outbound.forwardRouteDistance,
        12
      );
      expect(returnStart.cumulativeTravelDistance).toBeCloseTo(
        outbound.cumulativeTravelDistance,
        12
      );
      expect(returnStart.wheelRotationRadians).toBeCloseTo(
        outbound.wheelRotationRadians,
        12
      );
      expect(returnStart.walkNormalizedPhase).toBeCloseTo(
        outbound.walkNormalizedPhase,
        12
      );
      expect(returnStart.displayYaw).toBeCloseTo(outbound.displayYaw, 12);
      expect(halfReturned.cumulativeTravelDistance).toBeGreaterThan(
        returnStart.cumulativeTravelDistance
      );
      expect(halfReturned.wheelRotationRadians).toBeGreaterThan(
        returnStart.wheelRotationRadians
      );
      expect(halfReturned.cumulativeTravelDistance).toBeCloseTo(
        recallProgress * 15,
        12
      );
    }
  );

  it('derives exact world speed, distance phase and bounded playback rate', () => {
    const observed = sample(
      OUTBOUND_WORKER,
      poseAt('outbound', 0.425),
      OUTBOUND_START + 4_250_000n
    );

    expect(observed.worldSpeed).toBeCloseTo(1, 12);
    expect(observed.forwardRouteDistance).toBeCloseTo(4.25, 12);
    expect(observed.cumulativeTravelDistance).toBeCloseTo(4.25, 12);
    expect(observed.wheelRotationRadians).toBeCloseTo(17, 12);
    expect(observed.walkNormalizedPhase).toBeCloseTo(0.125, 12);
    expect(observed.clipTimeSeconds).toBeCloseTo(0.125, 12);
    expect(observed.playbackRate).toBeCloseTo(0.5, 12);
    expect(observed.playbackRateClamped).toBe(false);
  });

  it('bounds deterministic Walk phase when journey speed exceeds asset limits', () => {
    const fastWorker = Object.freeze({
      ...OUTBOUND_WORKER,
      arrivesAtMicros: OUTBOUND_START + SECOND
    }) satisfies RealmWorkerSceneRecord;
    const fast = sample(
      fastWorker,
      poseAt('outbound', 0.9),
      OUTBOUND_START + 900_000n
    );
    expect(fast.clipName).toBe('Walk');
    expect(fast.playbackRate).toBe(REALM_WORKER_MAX_WALK_PLAYBACK_RATE);
    expect(fast.playbackRateClamped).toBe(true);
    expect(fast.walkNormalizedPhase).toBeCloseTo(0.6, 12);
    expect(fast.clipTimeSeconds).toBeCloseTo(0.6, 12);

    const slowWorker = Object.freeze({
      ...OUTBOUND_WORKER,
      arrivesAtMicros: OUTBOUND_START + 1_000n * SECOND
    }) satisfies RealmWorkerSceneRecord;
    const slow = sample(
      slowWorker,
      poseAt('outbound', 0.851),
      OUTBOUND_START + 851n * SECOND
    );
    expect(slow.clipName).toBe('Walk');
    expect(slow.playbackRate).toBe(REALM_WORKER_MIN_WALK_PLAYBACK_RATE);
    expect(slow.playbackRateClamped).toBe(true);
    expect(slow.walkNormalizedPhase).toBeCloseTo(0.02, 10);
    expect(slow.clipTimeSeconds).toBeCloseTo(0.02, 10);
  });

  it('mirrors eligible route turns by direction and finishes without repeats', () => {
    const outboundTurn = sample(
      OUTBOUND_WORKER,
      poseAt('outbound', 0.45, {
        turnDelta: Math.PI / 2,
        segmentIndex: 0
      }),
      OUTBOUND_START + 4_500_000n
    );
    const laterSameTurn = sample(
      Object.freeze({ ...OUTBOUND_WORKER, revision: 99n }),
      poseAt('outbound', 0.47, {
        turnDelta: Math.PI / 2,
        segmentIndex: 0
      }),
      OUTBOUND_START + 4_700_000n,
      outboundTurn.state
    );
    const afterCorner = sample(
      OUTBOUND_WORKER,
      poseAt('outbound', 0.51, {
        turnDelta: 0,
        segmentIndex: 1
      }),
      OUTBOUND_START + 5_100_000n,
      laterSameTurn.state
    );
    const returnStart = 30n * SECOND;
    const returning = returningWorker(returnStart, 40n * SECOND);
    const returningTurn = sample(
      returning,
      poseAt('returning', 0.55, {
        phaseProgress: 0.45,
        turnDelta: -Math.PI / 2,
        segmentIndex: 1
      }),
      returnStart + 4_500_000n
    );

    expect(outboundTurn.phase).toBe('turning-outbound');
    expect(outboundTurn.clipName).toBe('Turn_Left');
    expect(outboundTurn.distanceToCorner).toBeCloseTo(0.5, 12);
    expect(outboundTurn.timeToCornerSeconds).toBeCloseTo(0.5, 12);
    expect(laterSameTurn.phase).toBe('turning-outbound');
    expect(laterSameTurn.turnKey).toBe(outboundTurn.turnKey);
    expect(laterSameTurn.state.clipEpochKey).toBe(
      outboundTurn.state.clipEpochKey
    );
    expect(laterSameTurn.clipTimeSeconds).toBeGreaterThan(
      outboundTurn.clipTimeSeconds
    );
    expect(afterCorner.phase).toBe('cruising-outbound');
    expect(afterCorner.clipName).toBe('Walk');
    expect(afterCorner.state.lastTurnKey).toBe(outboundTurn.turnKey);
    expect(returningTurn.phase).toBe('turning-return');
    expect(returningTurn.clipName).toBe('Turn_Right');
    expect(returningTurn.clipTimeSeconds).toBeCloseTo(
      outboundTurn.clipTimeSeconds,
      12
    );
  });

  it('collapses a rounded canonical corner into one non-restarting Turn clip', () => {
    const worker = Object.freeze({
      ...OUTBOUND_WORKER,
      startedAtMicros: 0n,
      arrivesAtMicros: 10n * SECOND,
      originCoord: Object.freeze({ q: 0, r: 0 }),
      destinationCoord: Object.freeze({ q: 2, r: -1 })
    }) satisfies RealmWorkerSceneRecord;
    const visualRoute = resolveRealmWorkerVisualRoute(worker, 1)!;
    let previous:
      | NonNullable<
        Parameters<typeof resolveRealmWorkerLocomotion>[0]['previous']
      >
      | undefined;
    const turns: Array<Readonly<{
      segmentIndex: number;
      clipEpochKey: string;
      clipTimeSeconds: number;
    }>> = [];
    const postAnchorPhases = new Set<string>();

    for (let milliseconds = 4_400; milliseconds <= 6_500; milliseconds += 10) {
      const nowMicros = BigInt(milliseconds) * 1_000n;
      const pose = resolveRealmWorkerRoutePose(worker, nowMicros, 1)!;
      const observed = resolveRealmWorkerLocomotion({
        worker,
        pose,
        visualRoute,
        nowMicros,
        ...(previous === undefined ? {} : { previous }),
        tuning: TUNING
      })!;
      previous = observed.state;
      if (observed.phase === 'turning-outbound') {
        turns.push(Object.freeze({
          segmentIndex: pose.segmentIndex,
          clipEpochKey: observed.state.clipEpochKey,
          clipTimeSeconds: observed.clipTimeSeconds
        }));
      } else if (pose.segmentIndex >= 2) {
        postAnchorPhases.add(observed.phase);
      }
    }

    expect(turns.length).toBeGreaterThan(10);
    expect(new Set(turns.map(({ clipEpochKey }) => clipEpochKey))).toHaveLength(1);
    expect(new Set(turns.map(({ segmentIndex }) => segmentIndex))).toEqual(
      new Set([1])
    );
    for (let index = 1; index < turns.length; index += 1) {
      expect(turns[index]!.clipTimeSeconds)
        .toBeGreaterThan(turns[index - 1]!.clipTimeSeconds);
    }
    expect(postAnchorPhases).toEqual(new Set(['cruising-outbound']));
  });

  it.each([16, 33, 50, 100, 250] as const)(
    'bounds shortest-arc orientation after a %ims renderer gap',
    (gapMilliseconds) => {
      const baseNow = OUTBOUND_START + 2n * SECOND;
      const before = sample(
        OUTBOUND_WORKER,
        poseAt('outbound', 0.2, { yaw: 0 }),
        baseNow
      );
      const after = sample(
        OUTBOUND_WORKER,
        poseAt('outbound', 0.2, { yaw: Math.PI / 2 }),
        baseNow + BigInt(gapMilliseconds) * 1_000n,
        before.state
      );
      const expectedDeltaSeconds = Math.min(
        gapMilliseconds / 1_000,
        REALM_WORKER_MAX_LOCOMOTION_FRAME_SECONDS
      );

      expect(after.boundedFrameDeltaSeconds).toBeCloseTo(
        expectedDeltaSeconds,
        12
      );
      expect(angularDistance(before.displayYaw, after.displayYaw)).toBeLessThanOrEqual(
        Math.PI * expectedDeltaSeconds + 0.000_000_001
      );
      expect(after.displayYaw).toBeGreaterThanOrEqual(0);
      expect(after.displayYaw).toBeLessThan(Math.PI / 2);
    }
  );

  it('takes the short path across the signed-angle seam', () => {
    const degrees = (value: number) => value * Math.PI / 180;
    const smoothed = smoothRealmWorkerYaw(
      degrees(179),
      degrees(-179),
      0.1,
      Math.PI,
      0.1
    );

    expect(angularDistance(degrees(179), smoothed)).toBeCloseTo(
      degrees(2),
      12
    );
    expect(angularDistance(smoothed, degrees(-179))).toBeCloseTo(0, 12);
  });

  it('reconstructs deterministic clip and wheel phase without prior state', () => {
    const now = OUTBOUND_START + 3_250_000n;
    const pose = poseAt('outbound', 0.325);
    const first = sample(OUTBOUND_WORKER, pose, now);
    const reconstructed = sample(
      Object.freeze({
        ...OUTBOUND_WORKER,
        originCoord: Object.freeze({ ...OUTBOUND_WORKER.originCoord }),
        destinationCoord: Object.freeze({
          ...OUTBOUND_WORKER.destinationCoord
        }),
        revision: 400n
      }),
      Object.freeze({
        ...pose,
        world: Object.freeze({ ...pose.world }),
        tangent: Object.freeze({ ...pose.tangent })
      }),
      now
    );

    expect(reconstructed.phase).toBe(first.phase);
    expect(reconstructed.clipName).toBe(first.clipName);
    expect(reconstructed.clipTimeSeconds).toBeCloseTo(
      first.clipTimeSeconds,
      12
    );
    expect(reconstructed.walkNormalizedPhase).toBeCloseTo(
      first.walkNormalizedPhase,
      12
    );
    expect(reconstructed.wheelRotationRadians).toBeCloseTo(
      first.wheelRotationRadians,
      12
    );
    expect(reconstructed.displayYaw).toBeCloseTo(first.displayYaw, 12);
    expect(reconstructed.state.lifecycleKey).toBe(first.state.lifecycleKey);
    expect(reconstructed.state.clipEpochKey).toBe(
      first.state.clipEpochKey
    );
  });

  it('preserves renderer lifecycle across harmless public row revisions', () => {
    const now = OUTBOUND_START + 2n * SECOND;
    const before = sample(
      OUTBOUND_WORKER,
      poseAt('outbound', 0.2),
      now
    );
    const after = sample(
      Object.freeze({
        ...OUTBOUND_WORKER,
        revision: 9_999n
      }),
      poseAt('outbound', 0.2016),
      now + 16_000n,
      before.state
    );

    expect(after.state.lifecycleKey).toBe(before.state.lifecycleKey);
    expect(after.state.clipEpochKey).toBe(before.state.clipEpochKey);
    expect(after.clipName).toBe('Walk');
    expect(after.clipTimeSeconds).toBeGreaterThan(before.clipTimeSeconds);
  });

  it('resets the renderer baseline for a changed authoritative timeline revision', () => {
    const now = OUTBOUND_START + 2n * SECOND;
    const before = sample(
      OUTBOUND_WORKER,
      poseAt('outbound', 0.2, { yaw: 0 }),
      now
    );
    const after = sample(
      Object.freeze({
        ...OUTBOUND_WORKER,
        timelineRevision: OUTBOUND_WORKER.timelineRevision + 1,
        revision: 9_999n
      }),
      poseAt('outbound', 0.2016, { yaw: Math.PI / 2 }),
      now + 16_000n,
      before.state
    );

    expect(after.state.lifecycleKey).not.toBe(before.state.lifecycleKey);
    expect(after.state.clipEpochKey).not.toBe(before.state.clipEpochKey);
    expect(after.boundedFrameDeltaSeconds).toBe(0);
    expect(after.displayYaw).toBeCloseTo(Math.PI / 2, 12);
  });

  it('fails closed on moving samples without a finite route or asset scale', () => {
    expect(resolveRealmWorkerLocomotion({
      worker: OUTBOUND_WORKER,
      pose: poseAt('outbound', 0.5),
      nowMicros: OUTBOUND_START + 5n * SECOND,
      tuning: TUNING
    })).toBeUndefined();
    expect(resolveRealmWorkerLocomotion({
      worker: OUTBOUND_WORKER,
      pose: poseAt('outbound', 0.5),
      visualRoute: VISUAL_ROUTE,
      nowMicros: OUTBOUND_START + 5n * SECOND,
      tuning: Object.freeze({
        ...TUNING,
        wheelRadiusWorld: 0
      })
    })).toBeUndefined();
  });
});

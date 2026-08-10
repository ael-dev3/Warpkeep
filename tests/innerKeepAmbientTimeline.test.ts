import { describe, expect, it } from 'vitest';

import {
  INNER_KEEP_AMBIENT_ACTOR_CATALOG,
  INNER_KEEP_AMBIENT_EXCLUSIONS,
  INNER_KEEP_AMBIENT_MINIMUM_BODY_CLEARANCE_METERS,
  INNER_KEEP_AMBIENT_QUALITY_BUDGETS,
  INNER_KEEP_CITIZEN_WORK_ROUTES,
  INNER_KEEP_CIVIC_MOUNTED_ROUTES,
  INNER_KEEP_FOOT_DUTY_ROUTES,
  INNER_KEEP_MOUNTED_DUTY_ROUTES,
  innerKeepAmbientOrientedFootprintSeparation,
  isInnerKeepAmbientPointNavigable,
  selectInnerKeepAmbientActors
} from '../src/components/inner-keep/innerKeepAmbientPolicy';
import {
  INNER_KEEP_AMBIENT_CONVERSATION_CYCLE_SECONDS,
  INNER_KEEP_AMBIENT_ENDPOINT_TURN_SECONDS,
  createInnerKeepAmbientSimulationPlan,
  sampleInnerKeepAmbientActorPose,
  sampleInnerKeepAmbientFrame,
  type InnerKeepShuttleRoutine
} from '../src/components/inner-keep/innerKeepAmbientTimeline';
import { sampleInnerKeepPath } from '../src/components/inner-keep/innerKeepPathSampler';

function wrappedAngleDelta(left: number, right: number): number {
  return Math.atan2(Math.sin(left - right), Math.cos(left - right));
}

function elapsedForShuttleLocalTime(
  routine: InnerKeepShuttleRoutine,
  localSeconds: number
): number {
  const elapsed = (localSeconds - routine.phaseOffsetSeconds)
    % routine.cycleDurationSeconds;
  return elapsed < 0 ? elapsed + routine.cycleDurationSeconds : elapsed;
}

describe('Inner Keep deterministic ambient timeline', () => {
  it('builds repeatable stable-ID routines without gameplay authority', () => {
    const first = createInnerKeepAmbientSimulationPlan({
      seed: 'castle:004:layout:1',
      quality: 'high'
    });
    const second = createInnerKeepAmbientSimulationPlan({
      seed: 'castle:004:layout:1',
      quality: 'high'
    });
    const other = createInnerKeepAmbientSimulationPlan({
      seed: 'castle:005:layout:1',
      quality: 'high'
    });
    expect(first).toEqual(second);
    expect(first.planId).not.toBe(other.planId);
    expect(first).toMatchObject({
      quality: 'high',
      reducedMotion: false,
      motionEnabled: true,
      presentationOnly: true,
      gameplayAuthorityClaimed: false,
      animationFrameCap: 30
    });
    expect(first.routines.map(({ actor }) => actor.actorId)).toEqual(
      selectInnerKeepAmbientActors('castle:004:layout:1', 'high')
        .actors.map(({ actorId }) => actorId)
    );
    expect(first.conversations).toHaveLength(2);
    expect(new Set(first.conversations.flatMap(({ actorIds }) => actorIds)).size).toBe(4);
  });

  it('keeps every quality within actor, mixer, conversation, and cadence budgets', () => {
    const expected = {
      high: { actors: 20, animated: 20, conversations: 2, mounted: 6, patrol: 12 },
      balanced: { actors: 12, animated: 12, conversations: 1, mounted: 4, patrol: 6 },
      reduced: { actors: 8, animated: 0, conversations: 0, mounted: 2, patrol: 4 }
    } as const;
    for (const quality of ['high', 'balanced', 'reduced'] as const) {
      const plan = createInnerKeepAmbientSimulationPlan({ seed: 44_019, quality });
      const frame = sampleInnerKeepAmbientFrame(plan, 14.25);
      const budget = INNER_KEEP_AMBIENT_QUALITY_BUDGETS[quality];
      expect(plan.routines).toHaveLength(expected[quality].actors);
      expect(plan.conversations).toHaveLength(expected[quality].conversations);
      expect(frame.actors).toHaveLength(expected[quality].actors);
      expect(frame.animatedActorCount).toBe(expected[quality].animated);
      expect(frame.mountedActorCount).toBe(expected[quality].mounted);
      expect(frame.patrolUnitCount).toBe(expected[quality].patrol);
      expect(frame.actors.length).toBeLessThanOrEqual(budget.maximumActors);
      expect(frame.animatedActorCount).toBeLessThanOrEqual(
        budget.maximumAnimatedActors
      );
      expect(plan.conversations.length).toBeLessThanOrEqual(
        budget.maximumConversationPairs
      );
      if (quality !== 'reduced') {
        expect(plan.conversations[0]?.anchorId).toBe('east-village-commons');
      }
      expect(frame.animationFrameCap).toBe(budget.animationFrameCap);
    }
  });

  it('stops conversation pairs face-to-face and alternates greet with idle', () => {
    const plan = createInnerKeepAmbientSimulationPlan({
      seed: 'conversation-proof',
      quality: 'high'
    });
    const conversation = plan.conversations[0]!;
    const frame = sampleInnerKeepAmbientFrame(
      plan,
      conversation.conversationStartSeconds + 0.5
    );
    const pair = frame.actors.filter((pose) => (
      pose.conversation?.conversationId === conversation.conversationId
    ));
    expect(frame.activeConversationCount).toBe(1);
    expect(pair).toHaveLength(2);
    expect(pair.map(({ behavior }) => behavior).sort()).toEqual(['greet', 'idle']);
    expect(pair.map(({ clipName }) => clipName).sort()).toEqual(['Greet', 'Idle']);
    for (const pose of pair) {
      const partner = pair.find(({ actorId }) => (
        actorId === pose.conversation?.partnerActorId
      ));
      expect(partner).toBeDefined();
      const expectedYaw = Math.atan2(
        partner!.position.x - pose.position.x,
        partner!.position.z - pose.position.z
      );
      expect(wrappedAngleDelta(pose.yawRadians, expectedYaw)).toBeCloseTo(0, 10);
      expect(pose.position).not.toEqual(partner!.position);
    }
    expect(Math.abs(wrappedAngleDelta(pair[0]!.yawRadians, pair[1]!.yawRadians)))
      .toBeCloseTo(Math.PI, 10);

    const reciprocal = sampleInnerKeepAmbientFrame(
      plan,
      conversation.conversationStartSeconds + 1.8
    ).actors.filter((pose) => (
      pose.conversation?.conversationId === conversation.conversationId
    ));
    expect(reciprocal.map(({ behavior }) => behavior).sort()).toEqual(['greet', 'idle']);
    expect(reciprocal.find(({ behavior }) => behavior === 'greet')?.actorId)
      .not.toBe(pair.find(({ behavior }) => behavior === 'greet')?.actorId);
  });

  it('is closed-form across arbitrary seeks and each routine cycle boundary', () => {
    const plan = createInnerKeepAmbientSimulationPlan({
      seed: 'seek-proof',
      quality: 'high'
    });
    const far = sampleInnerKeepAmbientFrame(plan, 987_654_321.125);
    sampleInnerKeepAmbientFrame(plan, 2.5);
    expect(sampleInnerKeepAmbientFrame(plan, 987_654_321.125)).toEqual(far);

    const shuttle = plan.routines.find((routine) => (
      routine.kind === 'shuttle' && routine.actor.category === 'foot-patrol'
    ));
    expect(shuttle?.kind).toBe('shuttle');
    if (!shuttle || shuttle.kind !== 'shuttle') throw new Error('Expected a foot patrol shuttle.');
    const first = sampleInnerKeepAmbientActorPose(plan, shuttle, 7.25);
    const repeated = sampleInnerKeepAmbientActorPose(
      plan,
      shuttle,
      7.25 + shuttle.cycleDurationSeconds
    );
    expect(repeated.position.x).toBeCloseTo(first.position.x, 10);
    expect(repeated.position.z).toBeCloseTo(first.position.z, 10);
    expect(wrappedAngleDelta(repeated.yawRadians, first.yawRadians)).toBeCloseTo(0, 10);
    expect(repeated.behavior).toBe(first.behavior);

    const conversation = plan.conversations[0]!;
    const talk = sampleInnerKeepAmbientFrame(
      plan,
      conversation.conversationStartSeconds + 0.75
    );
    const repeatedTalk = sampleInnerKeepAmbientFrame(
      plan,
      conversation.conversationStartSeconds
        + INNER_KEEP_AMBIENT_CONVERSATION_CYCLE_SECONDS
        + 0.75
    );
    expect(repeatedTalk.actors.filter(({ conversation: active }) => (
      active?.conversationId === conversation.conversationId
    ))).toEqual(talk.actors.filter(({ conversation: active }) => (
      active?.conversationId === conversation.conversationId
    )));
  });

  it('gives city workers and watch patrols independent open shuttle routines', () => {
    const plan = createInnerKeepAmbientSimulationPlan({
      seed: 'castle:004:layout:1',
      quality: 'high'
    });
    const shuttles = plan.routines.filter((routine): routine is InnerKeepShuttleRoutine => (
      routine.kind === 'shuttle'
    ));
    expect(shuttles).toHaveLength(16);
    expect(shuttles.filter(({ actor }) => actor.category === 'citizen')).toHaveLength(2);
    expect(shuttles.filter(({ actor }) => actor.category === 'civic-mounted')).toHaveLength(2);
    expect(shuttles.filter(({ actor }) => actor.category === 'foot-patrol')).toHaveLength(8);
    expect(shuttles.filter(({ actor }) => actor.category === 'mounted-patrol')).toHaveLength(4);
    expect(shuttles.map(({ route }) => route.routeId).sort()).toEqual([
      ...INNER_KEEP_CITIZEN_WORK_ROUTES.slice(0, 2),
      ...INNER_KEEP_CIVIC_MOUNTED_ROUTES,
      ...INNER_KEEP_FOOT_DUTY_ROUTES,
      ...INNER_KEEP_MOUNTED_DUTY_ROUTES
    ].map(({ routeId }) => routeId).sort());
    expect(shuttles.every(({ route }) => !route.path.closed)).toBe(true);
    expect(new Set(shuttles.map(({ route }) => route.routeId)).size).toBe(shuttles.length);

    // Actor-keyed clocks prevent the old processional behavior where every
    // character advanced and stopped on one shared beat.
    expect(new Set(shuttles.map(({ phaseOffsetSeconds }) => (
      phaseOffsetSeconds.toFixed(9)
    ))).size).toBe(shuttles.length);
    expect(new Set(shuttles.map((routine) => ([
      routine.speedMetersPerSecond,
      routine.homeDwellDurationSeconds,
      routine.destinationDwellDurationSeconds,
      routine.cycleDurationSeconds
    ].map((value) => value.toFixed(9)).join(':')))).size).toBe(shuttles.length);
    expect(INNER_KEEP_AMBIENT_ENDPOINT_TURN_SECONDS).toBeLessThanOrEqual(0.6);

    for (const routine of shuttles) {
      const endpointBehavior = routine.actor.presentationRole === 'civic-routine'
        ? 'work'
        : 'stand-watch';
      const endpointClip = routine.actor.presentationRole === 'civic-routine'
        ? 'Work'
        : 'Idle';
      const home = sampleInnerKeepAmbientActorPose(
        plan,
        routine,
        elapsedForShuttleLocalTime(routine, routine.homeDwellDurationSeconds * 0.5)
      );
      const outbound = sampleInnerKeepAmbientActorPose(
        plan,
        routine,
        elapsedForShuttleLocalTime(
          routine,
          routine.homeDwellDurationSeconds + routine.travelDurationSeconds * 0.5
        )
      );
      const destination = sampleInnerKeepAmbientActorPose(
        plan,
        routine,
        elapsedForShuttleLocalTime(
          routine,
          routine.homeDwellDurationSeconds
            + routine.travelDurationSeconds
            + routine.destinationDwellDurationSeconds * 0.5
        )
      );
      const returning = sampleInnerKeepAmbientActorPose(
        plan,
        routine,
        elapsedForShuttleLocalTime(
          routine,
          routine.homeDwellDurationSeconds
            + routine.travelDurationSeconds
            + routine.destinationDwellDurationSeconds
            + routine.travelDurationSeconds * 0.5
        )
      );

      expect(home).toMatchObject({
        routeId: routine.route.routeId,
        routePurpose: routine.route.purpose,
        routeProgress: 0,
        behavior: endpointBehavior,
        clipName: endpointClip
      });
      expect(destination).toMatchObject({
        routeId: routine.route.routeId,
        routePurpose: routine.route.purpose,
        routeProgress: 1,
        behavior: endpointBehavior,
        clipName: endpointClip
      });
      expect(wrappedAngleDelta(
        home.yawRadians,
        sampleInnerKeepPath(routine.route.path, 0).yawRadians
      )).toBeCloseTo(0, 10);
      expect(wrappedAngleDelta(
        destination.yawRadians,
        sampleInnerKeepPath(routine.route.path, 1).yawRadians
      )).toBeCloseTo(0, 10);
      expect(outbound.behavior).toBe('walk');
      expect(returning.behavior).toBe('walk');
      expect(outbound.routeProgress).toBeCloseTo(0.5, 10);
      expect(returning.routeProgress).toBeCloseTo(0.5, 10);
      expect(returning.position.x).toBeCloseTo(outbound.position.x, 10);
      expect(returning.position.z).toBeCloseTo(outbound.position.z, 10);
      expect(Math.abs(wrappedAngleDelta(returning.yawRadians, outbound.yawRadians)))
        .toBeCloseTo(Math.PI, 10);

      const epsilon = 0.000_1;
      const boundaries = [
        routine.homeDwellDurationSeconds,
        routine.homeDwellDurationSeconds + routine.travelDurationSeconds,
        routine.homeDwellDurationSeconds
          + routine.travelDurationSeconds
          + routine.destinationDwellDurationSeconds
      ];
      for (const boundary of boundaries) {
        const before = sampleInnerKeepAmbientActorPose(
          plan,
          routine,
          elapsedForShuttleLocalTime(routine, boundary - epsilon)
        );
        const after = sampleInnerKeepAmbientActorPose(
          plan,
          routine,
          elapsedForShuttleLocalTime(routine, boundary + epsilon)
        );
        expect(Math.hypot(
          after.position.x - before.position.x,
          after.position.z - before.position.z
        ), `${routine.route.routeId}:${boundary}`).toBeLessThan(0.001);
      }

      const repeatedHome = sampleInnerKeepAmbientActorPose(
        plan,
        routine,
        elapsedForShuttleLocalTime(routine, routine.homeDwellDurationSeconds * 0.5)
          + routine.cycleDurationSeconds
      );
      expect(repeatedHome.position.x).toBeCloseTo(home.position.x, 10);
      expect(repeatedHome.position.z).toBeCloseTo(home.position.z, 10);
      expect(repeatedHome.behavior).toBe(home.behavior);
    }

    const observedBehaviors = new Set<string>();
    for (let timestamp = 0; timestamp < 96; timestamp += 1) {
      const frameByActorId = new Map(sampleInnerKeepAmbientFrame(plan, timestamp).actors.map(
        (pose) => [pose.actorId, pose]
      ));
      const activeBehaviors = new Set(shuttles.map(({ actor }) => (
        frameByActorId.get(actor.actorId)!.behavior
      )));
      activeBehaviors.forEach((behavior) => observedBehaviors.add(behavior));
      expect(activeBehaviors.size, `shuttle behavior diversity at ${timestamp}s`)
        .toBeGreaterThanOrEqual(2);
    }
    expect(observedBehaviors).toEqual(new Set(['stand-watch', 'walk', 'work']));
  });

  it('gives each exotic civic mount its own open village duty', () => {
    const plan = createInnerKeepAmbientSimulationPlan({
      seed: 'castle:004:layout:1',
      quality: 'high'
    });
    const civicMounted = plan.routines.filter((routine): routine is InnerKeepShuttleRoutine => (
      routine.kind === 'shuttle' && routine.actor.category === 'civic-mounted'
    ));
    expect(civicMounted.map(({ actor, route }) => [actor.actorId, route.purpose]).sort())
      .toEqual([
        ['emberfoot-courier', 'village-delivery'],
        ['shellback-shrine-tender', 'village-shrine-service']
      ].sort());
    expect(civicMounted.every(({ route }) => !route.path.closed)).toBe(true);
    expect(new Set(civicMounted.map(({ phaseOffsetSeconds }) => (
      phaseOffsetSeconds.toFixed(9)
    ))).size).toBe(2);
    expect(plan.routines.some(({ kind }) => kind !== 'conversation' && kind !== 'shuttle'))
      .toBe(false);
  });

  it('keeps reduced static duty endpoints separated from actors and exclusions', () => {
    for (const seed of [7, 31_202]) {
      const plan = createInnerKeepAmbientSimulationPlan({ seed, quality: 'reduced' });
      const frame = sampleInnerKeepAmbientFrame(plan, 0);
      const shuttleActorIds = new Set(plan.routines.flatMap((routine) => (
        routine.kind === 'shuttle' ? [routine.actor.actorId] : []
      )));
      expect(shuttleActorIds.size).toBeGreaterThan(0);
      expect(frame.actors.filter(({ actorId }) => shuttleActorIds.has(actorId)).every((pose) => (
        (pose.routeProgress === 0 || pose.routeProgress === 1)
        && pose.behavior === 'static-formation'
      ))).toBe(true);

      for (let leftIndex = 0; leftIndex < frame.actors.length; leftIndex += 1) {
        const left = frame.actors[leftIndex]!;
        for (let rightIndex = leftIndex + 1; rightIndex < frame.actors.length; rightIndex += 1) {
          const right = frame.actors[rightIndex]!;
          expect(innerKeepAmbientOrientedFootprintSeparation(
            {
              position: left.position,
              yawRadians: left.yawRadians,
              footprintHalfExtentsMeters: left.footprintHalfExtentsMeters
            },
            {
              position: right.position,
              yawRadians: right.yawRadians,
              footprintHalfExtentsMeters: right.footprintHalfExtentsMeters
            },
            INNER_KEEP_AMBIENT_MINIMUM_BODY_CLEARANCE_METERS
          ), `${seed}:${left.actorId}:${right.actorId}`).toBeGreaterThanOrEqual(0);
        }
        for (const exclusion of INNER_KEEP_AMBIENT_EXCLUSIONS) {
          expect(innerKeepAmbientOrientedFootprintSeparation(
            {
              position: left.position,
              yawRadians: left.yawRadians,
              footprintHalfExtentsMeters: left.footprintHalfExtentsMeters
            },
            {
              position: exclusion.center,
              yawRadians: 0,
              footprintHalfExtentsMeters: [
                exclusion.halfExtentsMeters[0] + exclusion.additionalClearanceMeters,
                exclusion.halfExtentsMeters[1] + exclusion.additionalClearanceMeters
              ]
            }
          ), `${seed}:${left.actorId}:${exclusion.exclusionId}`).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('keeps every guard on a distinct open beat with independent clocks', () => {
    for (const quality of ['high', 'balanced'] as const) {
      const plan = createInnerKeepAmbientSimulationPlan({
        seed: `dispersed-guard-proof:${quality}`,
        quality
      });
      const guards = plan.routines.filter((routine): routine is InnerKeepShuttleRoutine => (
        routine.kind === 'shuttle'
        && routine.actor.presentationRole === 'ceremonial-patrol'
      ));
      expect(guards).toHaveLength(
        INNER_KEEP_AMBIENT_QUALITY_BUDGETS[quality].maximumFootPatrolUnits
          + INNER_KEEP_AMBIENT_QUALITY_BUDGETS[quality].maximumMountedPatrolUnits
      );
      expect(guards.every(({ route }) => !route.path.closed)).toBe(true);
      expect(new Set(guards.map(({ route }) => route.routeId)).size).toBe(guards.length);
      expect(new Set(guards.map(({ phaseOffsetSeconds }) => (
        phaseOffsetSeconds.toFixed(9)
      ))).size).toBe(guards.length);
    }
  });

  it('replays the same high-quality plan without environment-timing assumptions', () => {
    const first = createInnerKeepAmbientSimulationPlan({
      seed: 'repeatable-plan',
      quality: 'high'
    });
    const second = createInnerKeepAmbientSimulationPlan({
      seed: 'repeatable-plan',
      quality: 'high'
    });
    expect(second).toEqual(first);
    expect(second.routines).toHaveLength(
      INNER_KEEP_AMBIENT_QUALITY_BUDGETS.high.maximumActors
    );
  });

  it('keeps 20, 12, and 8 actors separated and outside exclusions for 0..96 seconds', () => {
    let minimumObservedBodyClearanceResidual = Number.POSITIVE_INFINITY;
    let minimumObservedPair = '';
    let firstNavigationFailure = '';
    let firstExclusionFailure = '';
    const cases = [
      { seed: 'castle:004:layout:1', quality: 'high' },
      { seed: 'formation-headway', quality: 'balanced' },
      { seed: 44_019, quality: 'reduced' }
    ] as const;

    for (const options of cases) {
      const plan = createInnerKeepAmbientSimulationPlan(options);
      for (let tick = 0; tick <= 1_920; tick += 1) {
        const timestamp = tick * 0.05;
        const frame = sampleInnerKeepAmbientFrame(plan, timestamp);
        for (const pose of frame.actors) {
          if (
            firstNavigationFailure === ''
            && !isInnerKeepAmbientPointNavigable(
              pose.position,
              pose.collisionRadiusMeters
            )
          ) {
            firstNavigationFailure = `${options.quality}:${timestamp}:${pose.actorId}`;
          }
          for (const exclusion of INNER_KEEP_AMBIENT_EXCLUSIONS) {
            const separation = innerKeepAmbientOrientedFootprintSeparation(
              {
                position: pose.position,
                yawRadians: pose.yawRadians,
                footprintHalfExtentsMeters: pose.footprintHalfExtentsMeters
              },
              {
                position: exclusion.center,
                yawRadians: 0,
                footprintHalfExtentsMeters: [
                  exclusion.halfExtentsMeters[0]
                    + exclusion.additionalClearanceMeters,
                  exclusion.halfExtentsMeters[1]
                    + exclusion.additionalClearanceMeters
                ]
              }
            );
            if (firstExclusionFailure === '' && separation < -0.000_001) {
              firstExclusionFailure = [
                options.quality,
                timestamp,
                pose.actorId,
                exclusion.exclusionId,
                separation
              ].join(':');
            }
          }
        }
        for (let leftIndex = 0; leftIndex < frame.actors.length; leftIndex += 1) {
          const left = frame.actors[leftIndex]!;
          for (
            let rightIndex = leftIndex + 1;
            rightIndex < frame.actors.length;
            rightIndex += 1
          ) {
            const right = frame.actors[rightIndex]!;
            const clearanceResidual = innerKeepAmbientOrientedFootprintSeparation(
              {
                position: left.position,
                yawRadians: left.yawRadians,
                footprintHalfExtentsMeters: left.footprintHalfExtentsMeters
              },
              {
                position: right.position,
                yawRadians: right.yawRadians,
                footprintHalfExtentsMeters: right.footprintHalfExtentsMeters
              },
              INNER_KEEP_AMBIENT_MINIMUM_BODY_CLEARANCE_METERS
            );
            if (clearanceResidual < minimumObservedBodyClearanceResidual) {
              minimumObservedBodyClearanceResidual = clearanceResidual;
              minimumObservedPair = [
                options.quality,
                timestamp,
                left.actorId,
                right.actorId
              ].join(':');
            }
          }
        }
      }
    }

    expect(firstNavigationFailure).toBe('');
    expect(firstExclusionFailure).toBe('');
    expect(minimumObservedPair).not.toBe('');
    expect(minimumObservedBodyClearanceResidual, minimumObservedPair).toBeGreaterThanOrEqual(
      -0.000_001
    );
  }, 20_000);

  it('freezes a stable non-conversing formation for reduced motion and reduced quality', () => {
    for (const plan of [
      createInnerKeepAmbientSimulationPlan({
        seed: 'static-high',
        quality: 'high',
        reducedMotion: true
      }),
      createInnerKeepAmbientSimulationPlan({
        seed: 'static-reduced',
        quality: 'reduced'
      })
    ]) {
      const initial = sampleInnerKeepAmbientFrame(plan, 0);
      const jumped = sampleInnerKeepAmbientFrame(plan, 900_000_000);
      expect(jumped).toEqual(initial);
      expect(initial).toMatchObject({
        sampleSeconds: 0,
        animationFrameCap: 0,
        animationActive: false,
        activeConversationCount: 0,
        animatedActorCount: 0
      });
      expect(initial.actors.every(({ behavior, clipName, conversation }) => (
        behavior === 'static-formation'
        && clipName === 'Idle'
        && conversation === null
      ))).toBe(true);
    }
  });

  it('returns finite, catalog-approved presentation output for hostile timestamps', () => {
    const plan = createInnerKeepAmbientSimulationPlan({
      seed: 'finite-proof',
      quality: 'high'
    });
    const catalogById = new Map(INNER_KEEP_AMBIENT_ACTOR_CATALOG.map((entry) => [
      entry.actorId,
      entry
    ]));
    for (const timestamp of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -100,
      Number.MAX_SAFE_INTEGER
    ]) {
      const frame = sampleInnerKeepAmbientFrame(plan, timestamp);
      expect(Number.isFinite(frame.sampleSeconds)).toBe(true);
      expect(frame.presentationOnly).toBe(true);
      expect(frame.gameplayAuthorityClaimed).toBe(false);
      for (const pose of frame.actors) {
        expect([
          pose.position.x,
          pose.position.z,
          pose.yawRadians,
          pose.routeProgress,
          pose.clipPhase
        ].every(Number.isFinite)).toBe(true);
        expect(pose.routeProgress).toBeGreaterThanOrEqual(0);
        expect(pose.routeProgress).toBeLessThanOrEqual(1);
        expect(pose.clipPhase).toBeGreaterThanOrEqual(0);
        expect(pose.clipPhase).toBeLessThan(1);
        expect(catalogById.get(pose.actorId)?.allowedAmbientClips)
          .toContain(pose.clipName);
      }
    }
  });
});

import { describe, expect, it, vi } from 'vitest';

import {
  createRealmPointerGestureCoordinator,
  type RealmPointerGestureCoordinator
} from '../src/components/realm/realmPointerGestureCoordinator';

function startCanvas(coordinator: RealmPointerGestureCoordinator, pointerId = 1) {
  return coordinator.start({
    pointerId,
    pointerType: 'mouse',
    lane: 'canvas',
    x: 100,
    y: 100
  });
}

describe('Realm pointer gesture coordinator', () => {
  it('accepts canvas and world-control lanes and resolves unmoved presses as taps', () => {
    const coordinator = createRealmPointerGestureCoordinator();

    expect(startCanvas(coordinator)).toMatchObject({
      accepted: true,
      phase: 'pending',
      pointerCount: 1,
      captureStatus: null
    });
    expect(coordinator.end({ pointerId: 1, x: 102, y: 101 })).toMatchObject({
      phase: 'idle',
      pointerCount: 0,
      tap: {
        pointerId: 1,
        pointerType: 'mouse',
        lane: 'canvas',
        x: 102,
        y: 101
      },
      panDelta: null
    });

    coordinator.start({
      pointerId: 2,
      pointerType: 'touch',
      lane: 'world-control',
      x: 40,
      y: 50
    });
    expect(coordinator.end({ pointerId: 2, x: 40, y: 50 }).tap).toEqual({
      pointerId: 2,
      pointerType: 'touch',
      lane: 'world-control',
      x: 40,
      y: 50
    });
    expect(coordinator.consumeWorldControlClickSuppression()).toBe(false);
  });

  it('applies every accumulated pixel when crossing the drag threshold', () => {
    const coordinator = createRealmPointerGestureCoordinator({ dragThreshold: 5 });
    startCanvas(coordinator);

    expect(coordinator.move({
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      x: 103,
      y: 100
    })).toMatchObject({ phase: 'pending', panDelta: null });
    expect(coordinator.move({
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      x: 106,
      y: 100
    })).toMatchObject({
      phase: 'dragging',
      panDelta: { x: 6, y: 0 }
    });
    expect(coordinator.move({
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      x: 110,
      y: 98
    }).panDelta).toEqual({ x: 4, y: -2 });
    expect(coordinator.end({ pointerId: 1, x: 110, y: 98 }).tap).toBeNull();
  });

  it('keeps ordinary finger jitter as a tap while retaining the tighter mouse threshold', () => {
    const touch = createRealmPointerGestureCoordinator();
    touch.start({
      pointerId: 3,
      pointerType: 'touch',
      lane: 'world-control',
      x: 50,
      y: 50
    });
    expect(touch.move({
      pointerId: 3,
      pointerType: '',
      buttons: 0,
      x: 58,
      y: 50
    })).toMatchObject({
      phase: 'pending',
      panDelta: null,
      cancelled: false
    });
    expect(touch.end({ pointerId: 3, x: 58, y: 50 }).tap).toMatchObject({
      pointerId: 3,
      pointerType: 'touch',
      lane: 'world-control'
    });

    const mouse = createRealmPointerGestureCoordinator();
    startCanvas(mouse, 4);
    expect(mouse.move({
      pointerId: 4,
      pointerType: 'mouse',
      buttons: 1,
      x: 108,
      y: 100
    })).toMatchObject({
      phase: 'dragging',
      panDelta: { x: 8, y: 0 }
    });
  });

  it('arms exactly one world-control click suppression after a drag', () => {
    const coordinator = createRealmPointerGestureCoordinator({ dragThreshold: 4 });
    coordinator.start({
      pointerId: 7,
      pointerType: 'mouse',
      lane: 'world-control',
      x: 10,
      y: 10
    });

    expect(coordinator.move({
      pointerId: 7,
      pointerType: 'mouse',
      buttons: 1,
      x: 16,
      y: 10
    }).phase).toBe('dragging');
    coordinator.end({ pointerId: 7, x: 16, y: 10 });
    expect(coordinator.snapshot().worldControlClickSuppressionPending).toBe(true);
    expect(coordinator.consumeWorldControlClickSuppression()).toBe(true);
    expect(coordinator.consumeWorldControlClickSuppression()).toBe(false);

    coordinator.start({
      pointerId: 8,
      pointerType: 'mouse',
      lane: 'world-control',
      x: 10,
      y: 10
    });
    coordinator.end({ pointerId: 8, x: 10, y: 10 });
    expect(coordinator.consumeWorldControlClickSuppression()).toBe(false);
  });

  it('resets pinch at the second pointer and rebases the remaining drag pointer', () => {
    const coordinator = createRealmPointerGestureCoordinator({ dragThreshold: 5 });
    coordinator.start({
      pointerId: 1,
      pointerType: 'touch',
      lane: 'world-control',
      x: 100,
      y: 100
    });
    const secondStart = coordinator.start({
      pointerId: 2,
      pointerType: 'touch',
      lane: 'canvas',
      x: 200,
      y: 100
    });

    expect(secondStart).toMatchObject({
      phase: 'pinching',
      pointerCount: 2,
      pinch: {
        reset: true,
        centroid: { x: 150, y: 100 },
        distance: 100,
        centroidDelta: { x: 0, y: 0 },
        scaleRatio: 1
      }
    });
    expect(coordinator.move({
      pointerId: 2,
      pointerType: 'touch',
      buttons: 1,
      x: 220,
      y: 110
    }).pinch).toMatchObject({
      reset: false,
      centroid: { x: 160, y: 105 },
      centroidDelta: { x: 10, y: 5 }
    });

    expect(coordinator.end({ pointerId: 2, x: 220, y: 110 })).toMatchObject({
      phase: 'dragging',
      pointerCount: 1,
      tap: null
    });
    expect(coordinator.move({
      pointerId: 1,
      pointerType: 'touch',
      buttons: 1,
      x: 104,
      y: 103
    }).panDelta).toEqual({ x: 4, y: 3 });
    coordinator.end({ pointerId: 1, x: 104, y: 103 });
    expect(coordinator.consumeWorldControlClickSuppression()).toBe(true);
  });

  it('keeps a session valid when capture throws and guards release failures', () => {
    const capturePointer = vi.fn(() => {
      throw new DOMException('capture unavailable');
    });
    const coordinator = createRealmPointerGestureCoordinator({ capturePointer });

    expect(startCanvas(coordinator)).toMatchObject({
      accepted: true,
      phase: 'pending',
      captureStatus: null
    });
    expect(coordinator.move({
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      x: 108,
      y: 100
    })).toMatchObject({
      captureStatus: 'failed',
      panDelta: { x: 8, y: 0 }
    });
    expect(coordinator.end({ pointerId: 1, x: 108, y: 100 }).phase).toBe('idle');

    const releasePointer = vi.fn(() => {
      throw new DOMException('capture already moved');
    });
    const captured = createRealmPointerGestureCoordinator({
      capturePointer: () => true,
      releasePointer
    });
    startCanvas(captured);
    captured.move({
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      x: 108,
      y: 100
    });
    expect(captured.cancel(1)).toMatchObject({ phase: 'idle', cancelled: true });
    expect(releasePointer).toHaveBeenCalledOnce();
  });

  it('retries a failed pointer capture on the next dragging sample', () => {
    const capturePointer = vi.fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const coordinator = createRealmPointerGestureCoordinator({
      capturePointer,
      dragThreshold: 4
    });
    startCanvas(coordinator);

    expect(coordinator.move({
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      x: 106,
      y: 100
    }).captureStatus).toBe('failed');
    expect(coordinator.move({
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      x: 110,
      y: 100
    }).captureStatus).toBe('captured');
    expect(capturePointer).toHaveBeenCalledTimes(2);
    coordinator.end({ pointerId: 1, x: 110, y: 100 });
  });

  it.each([
    ['cancel', (coordinator: RealmPointerGestureCoordinator) => coordinator.cancel(1)],
    ['lost capture', (coordinator: RealmPointerGestureCoordinator) => coordinator.lostCapture(1)],
    ['blur', (coordinator: RealmPointerGestureCoordinator) => coordinator.blur()],
    ['hidden document', (coordinator: RealmPointerGestureCoordinator) => (
      coordinator.visibilityChanged(true)
    )],
    ['released buttons', (coordinator: RealmPointerGestureCoordinator) => coordinator.move({
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 0,
      x: 120,
      y: 100
    })]
  ])('cleans active state on %s and lets the next gesture hook immediately', (_name, cleanup) => {
    const releasePointer = vi.fn();
    const coordinator = createRealmPointerGestureCoordinator({
      capturePointer: () => true,
      releasePointer
    });
    startCanvas(coordinator);

    expect(cleanup(coordinator)).toMatchObject({
      accepted: true,
      phase: 'idle',
      pointerCount: 0,
      cancelled: true
    });
    expect(coordinator.snapshot().pointerCount).toBe(0);

    expect(coordinator.start({
      pointerId: 2,
      pointerType: 'mouse',
      lane: 'canvas',
      x: 20,
      y: 20
    })).toMatchObject({ accepted: true, phase: 'pending', pointerCount: 1 });
    coordinator.cancel(2);
  });

  it('does not mistake an active touch pointer with buttons zero for a release', () => {
    const coordinator = createRealmPointerGestureCoordinator({ dragThreshold: 2 });
    coordinator.start({
      pointerId: 1,
      pointerType: 'touch',
      lane: 'canvas',
      x: 10,
      y: 10
    });

    expect(coordinator.move({
      pointerId: 1,
      pointerType: 'touch',
      buttons: 0,
      x: 14,
      y: 10
    })).toMatchObject({
      accepted: true,
      phase: 'dragging',
      panDelta: { x: 4, y: 0 },
      cancelled: false
    });
  });

  it('keeps pen and unknown embedded pointers active when buttons metadata is zero', () => {
    for (const [pointerId, pointerType] of [[5, 'pen'], [6, '']] as const) {
      const coordinator = createRealmPointerGestureCoordinator({
        dragThreshold: 2
      });
      coordinator.start({
        pointerId,
        pointerType,
        lane: 'canvas',
        x: 10,
        y: 10
      });
      expect(coordinator.move({
        pointerId,
        pointerType: 'mouse',
        buttons: 0,
        x: 14,
        y: 10
      })).toMatchObject({
        accepted: true,
        phase: 'dragging',
        cancelled: false
      });
    }
  });

  it('rejects invalid, duplicate, and third pointers without corrupting the gesture', () => {
    const coordinator = createRealmPointerGestureCoordinator();
    startCanvas(coordinator, 1);
    expect(startCanvas(coordinator, 1).accepted).toBe(false);
    coordinator.start({
      pointerId: 2,
      pointerType: 'touch',
      lane: 'canvas',
      x: 200,
      y: 100
    });
    expect(coordinator.start({
      pointerId: 3,
      pointerType: 'touch',
      lane: 'canvas',
      x: 300,
      y: 100
    })).toMatchObject({ accepted: false, phase: 'pinching', pointerCount: 2 });
    expect(coordinator.move({
      pointerId: 99,
      pointerType: 'mouse',
      buttons: 1,
      x: Number.NaN,
      y: 0
    }).accepted).toBe(false);
    expect(coordinator.snapshot()).toMatchObject({ phase: 'pinching', pointerCount: 2 });
  });

  it('disposes every captured pointer without leaking callbacks or accepting new work', () => {
    const releasePointer = vi.fn();
    const coordinator = createRealmPointerGestureCoordinator({
      capturePointer: () => true,
      releasePointer
    });
    startCanvas(coordinator, 1);
    coordinator.start({
      pointerId: 2,
      pointerType: 'touch',
      lane: 'canvas',
      x: 200,
      y: 100
    });

    coordinator.dispose();
    coordinator.dispose();

    expect(releasePointer).toHaveBeenCalledTimes(2);
    expect(coordinator.snapshot()).toMatchObject({ phase: 'idle', pointerCount: 0 });
    expect(startCanvas(coordinator, 3).accepted).toBe(false);
  });
});

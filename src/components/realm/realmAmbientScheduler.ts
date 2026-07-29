/**
 * One demand-driven animation clock shared by Realm ambience. It aligns work
 * with browser frames, caps the presentation cadence, and holds no live loop
 * while grass is hidden, static, or the document is backgrounded.
 */
export type RealmAmbientScheduler = Readonly<{
  dispose: () => void;
  getFrameCap: () => number;
  setActive: (active: boolean) => void;
  setFrameCap: (frameCap: number) => void;
  setVisible: (visible: boolean) => void;
  isActive: () => boolean;
}>;

export type CreateRealmAmbientSchedulerOptions = Readonly<{
  frameCap: number;
  active?: boolean;
  onStep: (elapsedSeconds: number) => void;
}>;

function safeFrameCap(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function createRealmAmbientScheduler(
  options: CreateRealmAmbientSchedulerOptions
): RealmAmbientScheduler {
  let frameCap = safeFrameCap(options.frameCap);
  let intervalMilliseconds = frameCap > 0 ? 1_000 / frameCap : Infinity;
  let disposed = false;
  let active = Boolean(options.active);
  let visible = true;
  let frame = 0;
  let lastTimestamp: number | null = null;
  let accumulator = 0;
  let elapsedSeconds = 0;

  const cancel = () => {
    if (frame === 0) return;
    window.cancelAnimationFrame(frame);
    frame = 0;
  };

  const resetClock = () => {
    lastTimestamp = null;
    accumulator = 0;
  };

  const schedule = () => {
    if (
      disposed
      || !active
      || frameCap <= 0
      || !visible
      || document.hidden
      || frame !== 0
    ) return;
    frame = window.requestAnimationFrame(tick);
  };

  function tick(timestamp: number) {
    frame = 0;
    if (disposed || !active || frameCap <= 0 || !visible || document.hidden) {
      resetClock();
      return;
    }
    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
      schedule();
      return;
    }
    // Tab sleep and renderer stalls should resume as a calm continuation, not
    // fast-forward a giant shader-time leap through the field.
    const delta = Math.min(100, Math.max(0, timestamp - lastTimestamp));
    lastTimestamp = timestamp;
    accumulator += delta;
    elapsedSeconds += delta / 1_000;
    if (accumulator + 0.001 >= intervalMilliseconds) {
      accumulator %= intervalMilliseconds;
      try {
        options.onStep(elapsedSeconds);
      } catch {
        disposed = true;
        cancel();
        document.removeEventListener('visibilitychange', handleVisibility);
        return;
      }
    }
    schedule();
  }

  function handleVisibility() {
    if (document.hidden) {
      cancel();
      resetClock();
      return;
    }
    resetClock();
    schedule();
  }

  document.addEventListener('visibilitychange', handleVisibility);
  schedule();
  return Object.freeze({
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cancel();
      document.removeEventListener('visibilitychange', handleVisibility);
    },
    getFrameCap: () => frameCap,
    setActive: (next) => {
      if (disposed) return;
      const normalized = Boolean(next);
      if (normalized === active) return;
      active = normalized;
      cancel();
      resetClock();
      schedule();
    },
    setFrameCap: (nextFrameCap) => {
      if (disposed) return;
      const normalized = safeFrameCap(nextFrameCap);
      if (normalized === frameCap) return;
      frameCap = normalized;
      intervalMilliseconds = frameCap > 0 ? 1_000 / frameCap : Infinity;
      cancel();
      resetClock();
      schedule();
    },
    setVisible: (nextVisible) => {
      if (disposed) return;
      const normalized = Boolean(nextVisible);
      if (normalized === visible) return;
      visible = normalized;
      cancel();
      resetClock();
      schedule();
    },
    isActive: () => (
      !disposed
      && active
      && frameCap > 0
      && visible
      && !document.hidden
    )
  });
}

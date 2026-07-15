/**
 * Realm ambience deliberately runs far below display refresh rate. Camera and
 * interaction renders remain demand-driven; this scheduler exists only for the
 * restrained vegetation pass while the document is visible.
 */
export const REALM_AMBIENT_STEP_MILLISECONDS = 180;

export type RealmAmbientScheduler = Readonly<{
  dispose: () => void;
}>;

export type CreateRealmAmbientSchedulerOptions = Readonly<{
  enabled: boolean;
  onStep: (elapsedSeconds: number) => void;
}>;

export function createRealmAmbientScheduler(
  options: CreateRealmAmbientSchedulerOptions
): RealmAmbientScheduler {
  let disposed = false;
  let timeout = 0;
  let elapsedSeconds = 0;

  const cancelPending = () => {
    if (timeout === 0) return;
    window.clearTimeout(timeout);
    timeout = 0;
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelPending();
    if (options.enabled) {
      document.removeEventListener('visibilitychange', handleVisibility);
    }
  };

  const schedule = () => {
    if (!options.enabled || disposed || document.hidden || timeout !== 0) return;
    timeout = window.setTimeout(step, REALM_AMBIENT_STEP_MILLISECONDS);
  };

  function step() {
    timeout = 0;
    if (disposed || document.hidden) return;
    elapsedSeconds += REALM_AMBIENT_STEP_MILLISECONDS / 1000;
    try {
      options.onStep(elapsedSeconds);
    } catch {
      // Ambient polish must fail closed without destabilizing the Realm.
      dispose();
      return;
    }
    schedule();
  }

  function handleVisibility() {
    if (document.hidden) {
      cancelPending();
      return;
    }
    schedule();
  }

  if (options.enabled) {
    document.addEventListener('visibilitychange', handleVisibility);
    schedule();
  }

  return Object.freeze({ dispose });
}

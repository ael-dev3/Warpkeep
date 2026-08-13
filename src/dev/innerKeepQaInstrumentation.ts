export type InnerKeepQaInstrumentationSnapshot = Readonly<{
  rendererCount: number;
  webglContextCount: number;
  rafOwnerCount: number;
  pendingAnimationFrameCount: number;
  maximumPendingAnimationFrameCount: number;
  requestedAnimationFrameCount: number;
}>;

export type InnerKeepQaInstrumentation = Readonly<{
  recordRendererCreated: () => () => void;
  registerAnimationOwner: (owner: string) => () => void;
  snapshot: () => InnerKeepQaInstrumentationSnapshot;
  restore: () => void;
}>;

type InstrumentedWindow = Pick<
  Window,
  'requestAnimationFrame' | 'cancelAnimationFrame'
> & Readonly<{
  HTMLCanvasElement: typeof HTMLCanvasElement;
}>;

const WEBGL_CONTEXT_KINDS = new Set(['webgl', 'webgl2', 'experimental-webgl']);

/**
 * Counts the browser resources owned by this synthetic page without exposing
 * renderer objects or pixels. The production application never imports it.
 */
export function installInnerKeepQaInstrumentation(
  target: InstrumentedWindow = window
): InnerKeepQaInstrumentation {
  const nativeRequestAnimationFrame = target.requestAnimationFrame.bind(target);
  const nativeCancelAnimationFrame = target.cancelAnimationFrame.bind(target);
  const nativeGetContext = target.HTMLCanvasElement.prototype.getContext;
  const contexts = new WeakSet<object>();
  const pendingAnimationFrames = new Set<number>();
  const animationOwners = new Set<string>();
  let rendererCount = 0;
  let webglContextCount = 0;
  let maximumPendingAnimationFrameCount = 0;
  let requestedAnimationFrameCount = 0;
  let restored = false;

  target.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    requestedAnimationFrameCount += 1;
    let frameId = 0;
    frameId = nativeRequestAnimationFrame((time) => {
      pendingAnimationFrames.delete(frameId);
      callback(time);
    });
    pendingAnimationFrames.add(frameId);
    maximumPendingAnimationFrameCount = Math.max(
      maximumPendingAnimationFrameCount,
      pendingAnimationFrames.size
    );
    return frameId;
  }) as typeof window.requestAnimationFrame;
  target.cancelAnimationFrame = ((frameId: number) => {
    pendingAnimationFrames.delete(frameId);
    nativeCancelAnimationFrame(frameId);
  }) as typeof window.cancelAnimationFrame;
  target.HTMLCanvasElement.prototype.getContext = function getContext(
    this: HTMLCanvasElement,
    contextId: string,
    ...args: unknown[]
  ) {
    const context = Reflect.apply(nativeGetContext, this, [contextId, ...args]) as unknown;
    if (
      WEBGL_CONTEXT_KINDS.has(contextId)
      && context !== null
      && typeof context === 'object'
      && !contexts.has(context)
    ) {
      contexts.add(context);
      webglContextCount += 1;
    }
    return context;
  } as typeof HTMLCanvasElement.prototype.getContext;

  return Object.freeze({
    recordRendererCreated: () => {
      if (restored) throw new Error('Inner Keep QA instrumentation is closed.');
      rendererCount += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        rendererCount = Math.max(0, rendererCount - 1);
      };
    },
    registerAnimationOwner: (owner) => {
      if (
        restored
        || typeof owner !== 'string'
        || !/^[a-z][a-z0-9-]{0,63}$/u.test(owner)
        || animationOwners.has(owner)
      ) throw new Error('Inner Keep QA animation ownership is invalid.');
      animationOwners.add(owner);
      return () => animationOwners.delete(owner);
    },
    snapshot: () => Object.freeze({
      rendererCount,
      webglContextCount,
      rafOwnerCount: animationOwners.size,
      pendingAnimationFrameCount: pendingAnimationFrames.size,
      maximumPendingAnimationFrameCount,
      requestedAnimationFrameCount
    }),
    restore: () => {
      if (restored) return;
      restored = true;
      target.requestAnimationFrame = nativeRequestAnimationFrame;
      target.cancelAnimationFrame = nativeCancelAnimationFrame;
      target.HTMLCanvasElement.prototype.getContext = nativeGetContext;
      pendingAnimationFrames.clear();
      animationOwners.clear();
      rendererCount = 0;
    }
  });
}

let runtimeInstrumentation: InnerKeepQaInstrumentation | undefined;

export function innerKeepQaRuntimeInstrumentation() {
  runtimeInstrumentation ??= installInnerKeepQaInstrumentation();
  return runtimeInstrumentation;
}

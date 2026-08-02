import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';

import {
  DEFAULT_MINI_APP_BROWSER_RUNTIME,
  defaultMiniAppSdkLoader,
  hasExactMiniAppHint,
  installMiniAppQuickAuthPreconnect,
  installMiniAppSafeAreaVariables,
  readMiniAppQuickAuthToken,
  readMiniAppSdk,
  reclampMiniAppPresentationContext,
  sanitizeMiniAppActionUrl,
  sanitizeMiniAppCapabilities,
  sanitizeMiniAppContext,
  type MiniAppBrowserRuntime,
  type MiniAppCapability,
  type MiniAppPresentationContext,
  type MiniAppSdk,
  type MiniAppSdkLoader
} from './miniAppRuntime';

export type MiniAppHostState =
  | 'regular-web'
  | 'detecting'
  | 'miniapp'
  | 'recovery';

export type MiniAppRecoveryReason =
  | 'sdk-unavailable'
  | 'not-in-miniapp'
  | 'context-invalid'
  | 'host-timeout'
  | 'shell-unavailable'
  | 'ready-failed';

export type MiniAppBackBinding = Readonly<{
  depth: number;
  onBack: () => unknown;
}>;

export type MiniAppHostActions = Readonly<{
  openUrl: (url: string) => Promise<boolean>;
  close: () => Promise<boolean>;
  addMiniApp: () => Promise<boolean>;
  viewProfile: (fid: number) => Promise<boolean>;
  openMiniApp: (url: string) => Promise<boolean>;
}>;

export type MiniAppHostHaptics = Readonly<{
  impactOccurred: (
    type: 'light' | 'medium' | 'heavy' | 'soft' | 'rigid'
  ) => Promise<boolean>;
  notificationOccurred: (
    type: 'success' | 'warning' | 'error'
  ) => Promise<boolean>;
  selectionChanged: () => Promise<boolean>;
}>;

export type MiniAppHostQuickAuth = Readonly<{
  /**
   * Returns a fresh, memory-only host bearer. The adapter never stores the
   * token in React state, browser storage, URLs, or logs.
   */
  getToken: () => Promise<string | null>;
}>;

export type MiniAppHostValue = Readonly<{
  state: MiniAppHostState;
  isMiniApp: boolean;
  isFramed: boolean;
  context: MiniAppPresentationContext | null;
  capabilities: readonly MiniAppCapability[];
  recoveryReason: MiniAppRecoveryReason | null;
  retry: () => boolean;
  hasCapability: (capability: MiniAppCapability) => boolean;
  bindBackNavigation: (binding: MiniAppBackBinding) => () => void;
  actions: MiniAppHostActions;
  haptics: MiniAppHostHaptics;
  quickAuth: MiniAppHostQuickAuth;
}>;

type HostSnapshot = Readonly<{
  state: MiniAppHostState;
  context: MiniAppPresentationContext | null;
  capabilities: readonly MiniAppCapability[];
  recoveryReason: MiniAppRecoveryReason | null;
}>;

export type MiniAppHostProviderProps = Readonly<{
  children: ReactNode;
  sdkLoader?: MiniAppSdkLoader;
  runtime?: MiniAppBrowserRuntime;
  /** Test/runtime injection only; production uses the bounded default. */
  hostDeadlineMilliseconds?: number;
}>;

const EMPTY_CAPABILITIES: readonly MiniAppCapability[] = Object.freeze([]);
const REGULAR_WEB_SNAPSHOT: HostSnapshot = Object.freeze({
  state: 'regular-web',
  context: null,
  capabilities: EMPTY_CAPABILITIES,
  recoveryReason: null
});
const DETECTING_SNAPSHOT: HostSnapshot = Object.freeze({
  state: 'detecting',
  context: null,
  capabilities: EMPTY_CAPABILITIES,
  recoveryReason: null
});

const DEFAULT_HOST_DEADLINE_MILLISECONDS = 4_000;
const MINIMUM_HOST_DEADLINE_MILLISECONDS = 250;
const MAXIMUM_HOST_DEADLINE_MILLISECONDS = 10_000;

// React StrictMode replays effects. Share the exact ready promise so one
// verified mount receives no more than one ready call while the surviving
// StrictMode effect can still await the first effect's in-flight result.
const READY_ATTEMPTS = new WeakMap<object, Promise<void>>();

const noopBackCleanup = () => {};

type ReadyAttemptScope = Readonly<{
  runtime: MiniAppBrowserRuntime;
  sdkLoader: MiniAppSdkLoader;
  hostDeadline: number;
  miniAppHinted: boolean;
  attemptGeneration: number;
  key: object;
}>;

function recoverySnapshot(reason: MiniAppRecoveryReason): HostSnapshot {
  return Object.freeze({
    state: 'recovery',
    context: null,
    capabilities: EMPTY_CAPABILITIES,
    recoveryReason: reason
  });
}

function positiveNavigationDepth(value: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function positiveFid(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

class MiniAppHostDeadlineError extends Error {
  constructor() {
    super('Mini App host operation exceeded its bounded deadline.');
    this.name = 'MiniAppHostDeadlineError';
  }
}

function normalizedHostDeadline(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_HOST_DEADLINE_MILLISECONDS;
  return Math.min(
    MAXIMUM_HOST_DEADLINE_MILLISECONDS,
    Math.max(MINIMUM_HOST_DEADLINE_MILLISECONDS, Math.round(value!))
  );
}

function withMiniAppHostDeadline<T>(
  operation: PromiseLike<T>,
  deadlineMilliseconds: number
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      callback();
    };
    const timer = window.setTimeout(() => {
      finish(() => reject(new MiniAppHostDeadlineError()));
    }, deadlineMilliseconds);
    Promise.resolve(operation).then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error))
    );
  });
}

function isMiniAppHostDeadlineError(error: unknown) {
  return error instanceof MiniAppHostDeadlineError;
}

function isMiniAppHinted(runtime: MiniAppBrowserRuntime): boolean {
  try {
    return hasExactMiniAppHint(runtime.search());
  } catch {
    return false;
  }
}

function settleUnknownResult(value: unknown): void {
  if (
    typeof value === 'object'
    && value !== null
    && 'then' in value
    && typeof value.then === 'function'
  ) {
    void Promise.resolve(value).catch(() => {});
  }
}

function readOptionalMiniAppBack(sdk: MiniAppSdk): MiniAppSdk['back'] | null {
  try {
    const back = sdk.back;
    return back
      && typeof back.show === 'function'
      && typeof back.hide === 'function'
      ? back
      : null;
  } catch {
    return null;
  }
}

const MISSING_PROVIDER_VALUE: MiniAppHostValue = Object.freeze({
  state: 'regular-web',
  isMiniApp: false,
  isFramed: false,
  context: null,
  capabilities: EMPTY_CAPABILITIES,
  recoveryReason: null,
  retry: () => false,
  hasCapability: () => false,
  bindBackNavigation: () => noopBackCleanup,
  actions: Object.freeze({
    openUrl: async () => false,
    close: async () => false,
    addMiniApp: async () => false,
    viewProfile: async () => false,
    openMiniApp: async () => false
  }),
  haptics: Object.freeze({
    impactOccurred: async () => false,
    notificationOccurred: async () => false,
    selectionChanged: async () => false
  }),
  quickAuth: Object.freeze({
    getToken: async () => null
  })
});

const MiniAppHostContext = createContext<MiniAppHostValue>(
  MISSING_PROVIDER_VALUE
);

export function MiniAppHostProvider({
  children,
  sdkLoader = defaultMiniAppSdkLoader,
  runtime = DEFAULT_MINI_APP_BROWSER_RUNTIME,
  hostDeadlineMilliseconds
}: MiniAppHostProviderProps) {
  const hostDeadline = normalizedHostDeadline(hostDeadlineMilliseconds);
  const miniAppHinted = isMiniAppHinted(runtime);
  let isFramed = false;
  try {
    isFramed = runtime.isFramed?.() === true;
  } catch {
    // An inaccessible ancestor is conservatively treated as an embed.
    isFramed = true;
  }
  const [snapshot, setSnapshot] = useState<HostSnapshot>(
    miniAppHinted ? DETECTING_SNAPSHOT : REGULAR_WEB_SNAPSHOT
  );
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const [attemptGeneration, setAttemptGeneration] = useState(0);
  const activeAttemptGenerationRef = useRef(attemptGeneration);
  const sdkRef = useRef<MiniAppSdk | null>(null);
  const capabilitiesRef = useRef<ReadonlySet<MiniAppCapability>>(new Set());
  const hapticsEnabledRef = useRef(false);
  const activeBackCleanupRef = useRef<(() => void) | null>(null);
  const backCommandRef = useRef<Promise<void>>(Promise.resolve());
  const readyAttemptScopeRef = useRef<ReadyAttemptScope | null>(null);
  const retainedReadyScope = readyAttemptScopeRef.current;
  if (
    retainedReadyScope === null
    || retainedReadyScope.runtime !== runtime
    || retainedReadyScope.sdkLoader !== sdkLoader
    || retainedReadyScope.hostDeadline !== hostDeadline
    || retainedReadyScope.miniAppHinted !== miniAppHinted
    || retainedReadyScope.attemptGeneration !== attemptGeneration
  ) {
    readyAttemptScopeRef.current = Object.freeze({
      runtime,
      sdkLoader,
      hostDeadline,
      miniAppHinted,
      attemptGeneration,
      key: {}
    });
  }
  const readyMountKey = readyAttemptScopeRef.current!.key;

  const enqueueBackVisibility = useCallback((
    sdk: MiniAppSdk,
    visible: boolean
  ) => {
    const back = readOptionalMiniAppBack(sdk);
    if (!back) return;
    backCommandRef.current = backCommandRef.current
      .catch(() => {})
      .then(() => withMiniAppHostDeadline(
        visible ? back.show() : back.hide(),
        hostDeadline
      ))
      .catch(() => {});
  }, [hostDeadline]);

  const clearBackBinding = useCallback(() => {
    activeBackCleanupRef.current?.();
    activeBackCleanupRef.current = null;
  }, []);

  useEffect(() => {
    if (!miniAppHinted) {
      setSnapshot(REGULAR_WEB_SNAPSHOT);
      return;
    }

    let cancelled = false;
    let removeSafeAreaVariables: (() => void) | null = null;
    let removeQuickAuthPreconnect: (() => void) | null = null;
    let removeViewportSubscription: (() => void) | null = null;
    setSnapshot(DETECTING_SNAPSHOT);

    const recover = (reason: MiniAppRecoveryReason) => {
      if (
        cancelled
        || activeAttemptGenerationRef.current !== attemptGeneration
      ) return;
      clearBackBinding();
      sdkRef.current = null;
      capabilitiesRef.current = new Set();
      hapticsEnabledRef.current = false;
      removeSafeAreaVariables?.();
      removeSafeAreaVariables = null;
      removeQuickAuthPreconnect?.();
      removeQuickAuthPreconnect = null;
      removeViewportSubscription?.();
      removeViewportSubscription = null;
      // The query is only a loading hint. A host that explicitly reports that
      // it is not a Mini App must settle into ordinary web, not a retryable
      // Farcaster error. All other bounded failures remain visibly recoverable.
      setSnapshot(
        reason === 'not-in-miniapp'
          ? REGULAR_WEB_SNAPSHOT
          : recoverySnapshot(reason)
      );
    };

    void (async () => {
      let sdk: MiniAppSdk;
      try {
        const loaded = await withMiniAppHostDeadline(
          sdkLoader(),
          hostDeadline
        );
        const candidate = readMiniAppSdk(loaded);
        if (!candidate) {
          recover('sdk-unavailable');
          return;
        }
        sdk = candidate;
      } catch (error) {
        recover(isMiniAppHostDeadlineError(error)
          ? 'host-timeout'
          : 'sdk-unavailable');
        return;
      }
      if (cancelled) return;

      let verified = false;
      try {
        verified = await withMiniAppHostDeadline(
          sdk.isInMiniApp(),
          hostDeadline
        ) === true;
      } catch (error) {
        recover(isMiniAppHostDeadlineError(error)
          ? 'host-timeout'
          : 'sdk-unavailable');
        return;
      }
      if (cancelled) return;
      if (!verified) {
        recover('not-in-miniapp');
        return;
      }
      try {
        removeQuickAuthPreconnect = installMiniAppQuickAuthPreconnect(
          runtime.document
        );
      } catch {
        // A preconnect is performance-only; host verification remains usable.
      }

      let context: MiniAppPresentationContext | null = null;
      try {
        context = sanitizeMiniAppContext(
          await withMiniAppHostDeadline(sdk.context, hostDeadline),
          runtime.viewport()
        );
      } catch (error) {
        if (isMiniAppHostDeadlineError(error)) {
          recover('host-timeout');
          return;
        }
        context = null;
      }
      if (cancelled) return;
      if (!context) {
        recover('context-invalid');
        return;
      }
      // Keep only the deeply sanitized projection. The raw host object may be
      // mutable and can contain unrelated private fields; a later resize must
      // never re-read it or let it alter the verified presentation snapshot.
      const presentationContextSeed = context;

      let capabilities: readonly MiniAppCapability[] = EMPTY_CAPABILITIES;
      try {
        capabilities = sanitizeMiniAppCapabilities(
          sdk.getCapabilities
            ? await withMiniAppHostDeadline(
                sdk.getCapabilities(),
                hostDeadline
              )
            : undefined
        );
      } catch {
        capabilities = EMPTY_CAPABILITIES;
      }
      if (cancelled) return;

      try {
        removeSafeAreaVariables = installMiniAppSafeAreaVariables(
          runtime.document,
          context.client.safeAreaInsets
        );
      } catch {
        recover('context-invalid');
        return;
      }
      if (cancelled) {
        removeSafeAreaVariables();
        return;
      }

      if (runtime.subscribeViewportChange) {
        try {
          removeViewportSubscription = runtime.subscribeViewportChange(() => {
            if (
              cancelled
              || activeAttemptGenerationRef.current !== attemptGeneration
            ) return;
            let refreshedContext: MiniAppPresentationContext | null = null;
            try {
              refreshedContext = reclampMiniAppPresentationContext(
                presentationContextSeed,
                runtime.viewport()
              );
            } catch {
              return;
            }
            if (!refreshedContext) return;
            try {
              const nextSafeAreaCleanup = installMiniAppSafeAreaVariables(
                runtime.document,
                refreshedContext.client.safeAreaInsets
              );
              removeSafeAreaVariables?.();
              removeSafeAreaVariables = nextSafeAreaCleanup;
            } catch {
              return;
            }
            context = refreshedContext;
            if (sdkRef.current === sdk) {
              setSnapshot(Object.freeze({
                state: 'miniapp',
                context: refreshedContext,
                capabilities,
                recoveryReason: null
              }));
            }
          });
        } catch {
          removeViewportSubscription = null;
        }
      }

      let mountedShell: Element | null = null;
      try {
        mountedShell = runtime.getMountedShell();
      } catch {
        mountedShell = null;
      }
      if (!mountedShell?.isConnected || mountedShell.childNodes.length === 0) {
        recover('shell-unavailable');
        return;
      }
      try {
        await withMiniAppHostDeadline(
          runtime.waitForAnimationFrame(),
          hostDeadline
        );
        await withMiniAppHostDeadline(
          runtime.waitForAnimationFrame(),
          hostDeadline
        );
      } catch (error) {
        recover(isMiniAppHostDeadlineError(error)
          ? 'host-timeout'
          : 'shell-unavailable');
        return;
      }
      let stableShell = false;
      try {
        stableShell = runtime.getMountedShell() === mountedShell
          && mountedShell.isConnected
          && mountedShell.childNodes.length > 0;
      } catch {
        stableShell = false;
      }
      if (
        cancelled
        || !stableShell
      ) {
        if (!cancelled) recover('shell-unavailable');
        return;
      }

      // Establish a deterministic root Back state before dismissing the host
      // splash. Nested application routes bind their handler after launch,
      // but the initial shell must never inherit a stale native Back control.
      const launchBack = capabilities.includes('back')
        ? readOptionalMiniAppBack(sdk)
        : null;
      if (launchBack) {
        try {
          launchBack.onback = null;
          await withMiniAppHostDeadline(launchBack.hide(), hostDeadline);
        } catch {
          // Back is optional. A host failure must not blank the stable shell.
        }
      }
      if (cancelled) return;

      let readyAttempt = READY_ATTEMPTS.get(readyMountKey);
      try {
        if (!readyAttempt) {
          const actions = sdk.actions;
          const ready = actions.ready;
          if (typeof ready !== 'function') throw new Error();
          readyAttempt = withMiniAppHostDeadline(
            Promise.resolve().then(() => ready.call(actions, {
              disableNativeGestures: true
            })),
            hostDeadline
          );
          READY_ATTEMPTS.set(readyMountKey, readyAttempt);
        }
        await readyAttempt;
      } catch (error) {
        if (READY_ATTEMPTS.get(readyMountKey) === readyAttempt) {
          READY_ATTEMPTS.delete(readyMountKey);
        }
        recover(isMiniAppHostDeadlineError(error)
          ? 'host-timeout'
          : 'ready-failed');
        return;
      }
      if (cancelled) return;

      sdkRef.current = sdk;
      capabilitiesRef.current = new Set(capabilities);
      hapticsEnabledRef.current = context.features.haptics;
      setSnapshot(Object.freeze({
        state: 'miniapp',
        context,
        capabilities,
        recoveryReason: null
      }));
    })();

    return () => {
      cancelled = true;
      clearBackBinding();
      sdkRef.current = null;
      capabilitiesRef.current = new Set();
      hapticsEnabledRef.current = false;
      removeSafeAreaVariables?.();
      removeViewportSubscription?.();
      removeQuickAuthPreconnect?.();
    };
  }, [
    clearBackBinding,
    attemptGeneration,
    hostDeadline,
    miniAppHinted,
    readyMountKey,
    runtime,
    sdkLoader
  ]);

  const retry = useCallback(() => {
    if (
      !miniAppHinted
      || snapshotRef.current.state !== 'recovery'
    ) return false;

    const nextGeneration = activeAttemptGenerationRef.current + 1;
    // Seal the retry synchronously so a same-frame second gesture cannot start
    // another SDK/context/ready lifecycle before React commits the next state.
    activeAttemptGenerationRef.current = nextGeneration;
    snapshotRef.current = DETECTING_SNAPSHOT;
    setSnapshot(DETECTING_SNAPSHOT);
    setAttemptGeneration(nextGeneration);
    return true;
  }, [miniAppHinted]);

  const hasCapability = useCallback(
    (capability: MiniAppCapability) =>
      capabilitiesRef.current.has(capability),
    []
  );

  const bindBackNavigation = useCallback(({
    depth,
    onBack
  }: MiniAppBackBinding) => {
    const sdk = sdkRef.current;
    const back = sdk ? readOptionalMiniAppBack(sdk) : null;
    if (
      !sdk
      || !back
      || !capabilitiesRef.current.has('back')
      || typeof onBack !== 'function'
    ) {
      return noopBackCleanup;
    }

    clearBackBinding();
    const normalizedDepth = positiveNavigationDepth(depth);
    let active = true;
    const hostBack = () => {
      if (
        !active
        || activeBackCleanupRef.current !== cleanup
        || normalizedDepth === 0
      ) {
        return;
      }
      try {
        settleUnknownResult(onBack());
      } catch {
        // Host navigation callbacks are isolated from the application shell.
      }
    };
    const cleanup = () => {
      if (!active) return;
      active = false;
      try {
        if (back.onback === hostBack) back.onback = null;
      } catch {
        // An optional host Back implementation cannot break local teardown.
      }
      if (activeBackCleanupRef.current === cleanup) {
        activeBackCleanupRef.current = null;
      }
      enqueueBackVisibility(sdk, false);
    };

    try {
      back.onback = normalizedDepth > 0 ? hostBack : null;
    } catch {
      return noopBackCleanup;
    }
    enqueueBackVisibility(sdk, normalizedDepth > 0);
    activeBackCleanupRef.current = cleanup;
    return cleanup;
  }, [clearBackBinding, enqueueBackVisibility]);

  const runOptional = useCallback(async (
    capability: MiniAppCapability,
    operation: (sdk: MiniAppSdk) => Promise<unknown>
  ): Promise<boolean> => {
    const sdk = sdkRef.current;
    if (!sdk || !capabilitiesRef.current.has(capability)) return false;
    try {
      await withMiniAppHostDeadline(operation(sdk), hostDeadline);
      return true;
    } catch {
      return false;
    }
  }, [hostDeadline]);

  const actions = useMemo<MiniAppHostActions>(() => Object.freeze({
    openUrl: async (url: string) => {
      const safeUrl = sanitizeMiniAppActionUrl(url);
      if (!safeUrl) return false;
      return runOptional('actions.openUrl', async (sdk) => {
        if (!sdk.actions.openUrl) throw new Error();
        await sdk.actions.openUrl(safeUrl);
      });
    },
    close: () => runOptional('actions.close', async (sdk) => {
      if (!sdk.actions.close) throw new Error();
      await sdk.actions.close();
    }),
    addMiniApp: () => runOptional('actions.addMiniApp', async (sdk) => {
      if (!sdk.actions.addMiniApp) throw new Error();
      await sdk.actions.addMiniApp();
    }),
    viewProfile: async (fid: number) => {
      if (!positiveFid(fid)) return false;
      return runOptional('actions.viewProfile', async (sdk) => {
        if (!sdk.actions.viewProfile) throw new Error();
        await sdk.actions.viewProfile({ fid });
      });
    },
    openMiniApp: async (url: string) => {
      const safeUrl = sanitizeMiniAppActionUrl(url);
      if (!safeUrl) return false;
      return runOptional('actions.openMiniApp', async (sdk) => {
        if (!sdk.actions.openMiniApp) throw new Error();
        await sdk.actions.openMiniApp({ url: safeUrl });
      });
    }
  }), [runOptional]);

  const haptics = useMemo<MiniAppHostHaptics>(() => Object.freeze({
    impactOccurred: (
      type: 'light' | 'medium' | 'heavy' | 'soft' | 'rigid'
    ) => hapticsEnabledRef.current
      ? runOptional('haptics.impactOccurred', async (sdk) => {
          const impactOccurred = sdk.haptics?.impactOccurred;
          if (!impactOccurred) throw new Error();
          await impactOccurred(type);
        })
      : Promise.resolve(false),
    notificationOccurred: (
      type: 'success' | 'warning' | 'error'
    ) => hapticsEnabledRef.current
      ? runOptional('haptics.notificationOccurred', async (sdk) => {
          const notificationOccurred = sdk.haptics?.notificationOccurred;
          if (!notificationOccurred) throw new Error();
          await notificationOccurred(type);
        })
      : Promise.resolve(false),
    selectionChanged: () => hapticsEnabledRef.current
      ? runOptional('haptics.selectionChanged', async (sdk) => {
          const selectionChanged = sdk.haptics?.selectionChanged;
          if (!selectionChanged) throw new Error();
          await selectionChanged();
        })
      : Promise.resolve(false)
  }), [runOptional]);

  const quickAuth = useMemo<MiniAppHostQuickAuth>(() => Object.freeze({
    getToken: async () => {
      const sdk = sdkRef.current;
      const getToken = sdk?.quickAuth?.getToken;
      if (!sdk || typeof getToken !== 'function') return null;
      try {
        const result = await withMiniAppHostDeadline(
          getToken(),
          hostDeadline
        );
        if (sdkRef.current !== sdk) return null;
        return readMiniAppQuickAuthToken(result);
      } catch {
        return null;
      }
    }
  }), [hostDeadline]);

  const value = useMemo<MiniAppHostValue>(() => Object.freeze({
    state: snapshot.state,
    isMiniApp: snapshot.state === 'miniapp',
    isFramed,
    context: snapshot.context,
    capabilities: snapshot.capabilities,
    recoveryReason: snapshot.recoveryReason,
    retry,
    hasCapability,
    bindBackNavigation,
    actions,
    haptics,
    quickAuth
  }), [
    actions,
    bindBackNavigation,
    haptics,
    hasCapability,
    quickAuth,
    retry,
    snapshot,
    isFramed
  ]);

  return (
    <MiniAppHostContext.Provider value={value}>
      {children}
    </MiniAppHostContext.Provider>
  );
}

export function useMiniAppHost(): MiniAppHostValue {
  return useContext(MiniAppHostContext);
}

export function useMiniAppBackNavigation(
  depth: number,
  onBack: () => unknown
): void {
  const { bindBackNavigation, state } = useMiniAppHost();
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const visible = positiveNavigationDepth(depth) > 0;

  useEffect(
    () => bindBackNavigation({
      depth: visible ? 1 : 0,
      onBack: () => onBackRef.current()
    }),
    [bindBackNavigation, state, visible]
  );
}

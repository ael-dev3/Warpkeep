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
  captureMiniAppAdmissionGrantTicket,
  clearMiniAppAdmissionGrantTicket,
  DEFAULT_MINI_APP_BROWSER_RUNTIME,
  defaultMiniAppSdkLoader,
  hasExactMiniAppHint,
  isMiniAppAdmissionGrantNotificationId,
  installMiniAppQuickAuthPreconnect,
  installMiniAppSafeAreaVariables,
  readMiniAppNotificationDetailsHint,
  readMiniAppQuickAuthToken,
  readMiniAppSdk,
  reclampMiniAppPresentationContext,
  sanitizeMiniAppActionUrl,
  sanitizeMiniAppCapabilities,
  sanitizeMiniAppContext,
  withMiniAppNotificationHints,
  type MiniAppBrowserRuntime,
  type MiniAppCapability,
  type MiniAppPresentationContext,
  type MiniAppSdk,
  type MiniAppSdkEventListener,
  type MiniAppSdkEventMap,
  type MiniAppSdkEventName,
  type MiniAppSdkLoader
} from './miniAppRuntime';
import type {
  FarcasterQuickAuthTokenOptions,
  FarcasterQuickAuthTokenResult
} from '../farcasterAuthTypes';

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

export type MiniAppNotificationPresentation =
  | 'unsupported'
  | 'not-added'
  | 'added-status-unknown'
  | 'enabled-hint'
  | 'disabled-hint'
  | 'requesting'
  | 'setup-requested'
  | 'rejected'
  | 'invalid-manifest'
  | 'failed';

export type MiniAppAddResult = Readonly<{
  status:
    | 'unsupported'
    | 'enabled-hint'
    | 'setup-requested'
    | 'rejected'
    | 'invalid-manifest'
    | 'timeout'
    | 'host-replaced'
    | 'failed';
}>;

export type MiniAppHostActions = Readonly<{
  openUrl: (url: string) => Promise<boolean>;
  close: () => Promise<boolean>;
  addMiniApp: () => Promise<MiniAppAddResult>;
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
  getToken: (
    options?: FarcasterQuickAuthTokenOptions
  ) => Promise<FarcasterQuickAuthTokenResult>;
}>;

/** Private, memory-only capability delivered through a Farcaster notification. */
export type MiniAppAdmissionGrant = Readonly<{
  /** Exact sanitized Farcaster notification launch context, when hydrated. */
  notificationId?: string;
  /** Reads the capability into one private effect call stack, never React state. */
  read: () => string | undefined;
  /** Clears only the exact capability that the effect actually exchanged. */
  clear: (expectedTicket: string) => void;
}>;

export type MiniAppHostValue = Readonly<{
  state: MiniAppHostState;
  isMiniApp: boolean;
  isFramed: boolean;
  context: MiniAppPresentationContext | null;
  capabilities: readonly MiniAppCapability[];
  notificationPresentation: MiniAppNotificationPresentation;
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
  notificationPresentation: MiniAppNotificationPresentation;
  recoveryReason: MiniAppRecoveryReason | null;
}>;

export type MiniAppHostProviderProps = Readonly<{
  children: ReactNode;
  sdkLoader?: MiniAppSdkLoader;
  runtime?: MiniAppBrowserRuntime;
  /** Test/runtime injection only; production uses the bounded default. */
  hostDeadlineMilliseconds?: number;
  /** Native permission prompts need a human-scale deadline. */
  addMiniAppDeadlineMilliseconds?: number;
  /** Quick Auth spans two network calls and one native-host round trip. */
  quickAuthDeadlineMilliseconds?: number;
}>;

const EMPTY_CAPABILITIES: readonly MiniAppCapability[] = Object.freeze([]);
const REGULAR_WEB_SNAPSHOT: HostSnapshot = Object.freeze({
  state: 'regular-web',
  context: null,
  capabilities: EMPTY_CAPABILITIES,
  notificationPresentation: 'unsupported',
  recoveryReason: null
});
const DETECTING_SNAPSHOT: HostSnapshot = Object.freeze({
  state: 'detecting',
  context: null,
  capabilities: EMPTY_CAPABILITIES,
  notificationPresentation: 'unsupported',
  recoveryReason: null
});

const DEFAULT_HOST_DEADLINE_MILLISECONDS = 4_000;
const MINIMUM_HOST_DEADLINE_MILLISECONDS = 250;
const MAXIMUM_HOST_DEADLINE_MILLISECONDS = 10_000;
const DEFAULT_ADD_MINI_APP_DEADLINE_MILLISECONDS = 60_000;
const MINIMUM_ADD_MINI_APP_DEADLINE_MILLISECONDS = 250;
const MAXIMUM_ADD_MINI_APP_DEADLINE_MILLISECONDS = 120_000;
const DEFAULT_QUICK_AUTH_DEADLINE_MILLISECONDS = 10_000;
const MINIMUM_QUICK_AUTH_DEADLINE_MILLISECONDS = 1_000;
const MAXIMUM_QUICK_AUTH_DEADLINE_MILLISECONDS = 15_000;

const QUICK_AUTH_UNSUPPORTED: FarcasterQuickAuthTokenResult = Object.freeze({
  status: 'unsupported'
});
const QUICK_AUTH_TIMEOUT: FarcasterQuickAuthTokenResult = Object.freeze({
  status: 'timeout'
});
const QUICK_AUTH_REJECTED: FarcasterQuickAuthTokenResult = Object.freeze({
  status: 'rejected'
});
const QUICK_AUTH_INVALID_SHAPE: FarcasterQuickAuthTokenResult = Object.freeze({
  status: 'invalid-shape'
});
const QUICK_AUTH_HOST_REPLACED: FarcasterQuickAuthTokenResult = Object.freeze({
  status: 'host-replaced'
});

const MINI_APP_ADD_UNSUPPORTED: MiniAppAddResult = Object.freeze({
  status: 'unsupported'
});
const MINI_APP_ADD_ENABLED_HINT: MiniAppAddResult = Object.freeze({
  status: 'enabled-hint'
});
const MINI_APP_ADD_SETUP_REQUESTED: MiniAppAddResult = Object.freeze({
  status: 'setup-requested'
});
const MINI_APP_ADD_REJECTED: MiniAppAddResult = Object.freeze({
  status: 'rejected'
});
const MINI_APP_ADD_INVALID_MANIFEST: MiniAppAddResult = Object.freeze({
  status: 'invalid-manifest'
});
const MINI_APP_ADD_TIMEOUT: MiniAppAddResult = Object.freeze({
  status: 'timeout'
});
const MINI_APP_ADD_HOST_REPLACED: MiniAppAddResult = Object.freeze({
  status: 'host-replaced'
});
const MINI_APP_ADD_FAILED: MiniAppAddResult = Object.freeze({
  status: 'failed'
});

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
    notificationPresentation: 'unsupported',
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

function normalizedQuickAuthDeadline(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_QUICK_AUTH_DEADLINE_MILLISECONDS;
  return Math.min(
    MAXIMUM_QUICK_AUTH_DEADLINE_MILLISECONDS,
    Math.max(MINIMUM_QUICK_AUTH_DEADLINE_MILLISECONDS, Math.round(value!))
  );
}

function normalizedAddMiniAppDeadline(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return DEFAULT_ADD_MINI_APP_DEADLINE_MILLISECONDS;
  }
  return Math.min(
    MAXIMUM_ADD_MINI_APP_DEADLINE_MILLISECONDS,
    Math.max(
      MINIMUM_ADD_MINI_APP_DEADLINE_MILLISECONDS,
      Math.round(value!)
    )
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

function initialNotificationPresentation(
  context: MiniAppPresentationContext,
  capabilities: readonly MiniAppCapability[]
): MiniAppNotificationPresentation {
  if (!capabilities.includes('actions.addMiniApp')) return 'unsupported';
  if (context.client.notificationsEnabledHint) return 'enabled-hint';
  return context.client.added ? 'added-status-unknown' : 'not-added';
}

function boundedMiniAppAddError(error: unknown): MiniAppAddResult {
  try {
    if (typeof error !== 'object' || error === null || !('name' in error)) {
      return MINI_APP_ADD_FAILED;
    }
    const name = error.name;
    if (name === 'AddMiniApp.RejectedByUser') return MINI_APP_ADD_REJECTED;
    if (name === 'AddMiniApp.InvalidDomainManifest') {
      return MINI_APP_ADD_INVALID_MANIFEST;
    }
  } catch {
    // Mutable host errors are reduced to one fixed failure class.
  }
  return MINI_APP_ADD_FAILED;
}

function readMiniAppAddResultNotificationHint(value: unknown): boolean {
  try {
    return typeof value === 'object'
      && value !== null
      && 'notificationDetails' in value
      && readMiniAppNotificationDetailsHint(value.notificationDetails);
  } catch {
    return false;
  }
}

type MiniAppNotificationProjectionUpdate = Readonly<{
  presentation: MiniAppNotificationPresentation;
  added?: boolean;
  notificationsEnabledHint?: boolean;
}>;

type MiniAppNotificationProjectionController = Readonly<{
  sdk: MiniAppSdk;
  generation: number;
  apply: (update: MiniAppNotificationProjectionUpdate) => void;
}>;

function installMiniAppNotificationListeners(
  sdk: MiniAppSdk,
  apply: (update: MiniAppNotificationProjectionUpdate) => void,
  settleAddMiniAppFlight: () => void
): () => void {
  let on: MiniAppSdk['on'];
  let removeListener: MiniAppSdk['removeListener'];
  try {
    on = sdk.on;
    removeListener = sdk.removeListener;
  } catch {
    return noopBackCleanup;
  }
  if (typeof on !== 'function' || typeof removeListener !== 'function') {
    return noopBackCleanup;
  }

  const onMiniAppAdded: MiniAppSdkEventListener<'miniAppAdded'> = (event) => {
    try {
      const enabled = readMiniAppNotificationDetailsHint(
        event.notificationDetails
      );
      apply({
        presentation: enabled ? 'enabled-hint' : 'added-status-unknown',
        added: true,
        notificationsEnabledHint: enabled
      });
      settleAddMiniAppFlight();
    } catch {
      // A malformed or mutable event cannot escape the host boundary.
    }
  };
  const onMiniAppAddRejected: MiniAppSdkEventListener<'miniAppAddRejected'> = (
    event
  ) => {
    try {
      const presentation = event.reason === 'rejected_by_user'
        ? 'rejected'
        : event.reason === 'invalid_domain_manifest'
          ? 'invalid-manifest'
          : 'failed';
      apply({
        presentation
      });
      settleAddMiniAppFlight();
    } catch {
      // A malformed or mutable event cannot escape the host boundary.
    }
  };
  const onMiniAppRemoved: MiniAppSdkEventListener<'miniAppRemoved'> = () => {
    try {
      apply({
        presentation: 'not-added',
        added: false,
        notificationsEnabledHint: false
      });
      settleAddMiniAppFlight();
    } catch {
      // Event callbacks are isolated from the host shell.
    }
  };
  const onNotificationsEnabled: MiniAppSdkEventListener<
    'notificationsEnabled'
  > = (event) => {
    try {
      if (!readMiniAppNotificationDetailsHint(event.notificationDetails)) {
        apply({ presentation: 'failed' });
        settleAddMiniAppFlight();
        return;
      }
      apply({
        presentation: 'enabled-hint',
        added: true,
        notificationsEnabledHint: true
      });
      settleAddMiniAppFlight();
    } catch {
      // A malformed or mutable event cannot escape the host boundary.
    }
  };
  const onNotificationsDisabled: MiniAppSdkEventListener<
    'notificationsDisabled'
  > = () => {
    try {
      apply({
        presentation: 'disabled-hint',
        added: true,
        notificationsEnabledHint: false
      });
      settleAddMiniAppFlight();
    } catch {
      // Event callbacks are isolated from the host shell.
    }
  };

  const installed: Array<readonly [
    MiniAppSdkEventName,
    (...args: never[]) => void
  ]> = [];
  const add = <EventName extends keyof MiniAppSdkEventMap>(
    event: EventName,
    listener: MiniAppSdkEventListener<EventName>
  ) => {
    const erasedListener = listener as (...args: never[]) => void;
    on.call(sdk, event, erasedListener);
    installed.push([event, erasedListener]);
  };
  try {
    add('miniAppAdded', onMiniAppAdded);
    add('miniAppAddRejected', onMiniAppAddRejected);
    add('miniAppRemoved', onMiniAppRemoved);
    add('notificationsEnabled', onNotificationsEnabled);
    add('notificationsDisabled', onNotificationsDisabled);
  } catch {
    for (const [event, listener] of installed.reverse()) {
      try {
        removeListener.call(sdk, event, listener);
      } catch {
        // Best-effort rollback of a partially installed optional adapter.
      }
    }
    return noopBackCleanup;
  }

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    for (const [event, listener] of installed.reverse()) {
      try {
        removeListener.call(sdk, event, listener);
      } catch {
        // Optional listener cleanup cannot break provider teardown.
      }
    }
  };
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
  notificationPresentation: 'unsupported',
  recoveryReason: null,
  retry: () => false,
  hasCapability: () => false,
  bindBackNavigation: () => noopBackCleanup,
  actions: Object.freeze({
    openUrl: async () => false,
    close: async () => false,
    addMiniApp: async () => MINI_APP_ADD_UNSUPPORTED,
    viewProfile: async () => false,
    openMiniApp: async () => false
  }),
  haptics: Object.freeze({
    impactOccurred: async () => false,
    notificationOccurred: async () => false,
    selectionChanged: async () => false
  }),
  quickAuth: Object.freeze({
    getToken: async () => QUICK_AUTH_UNSUPPORTED
  })
});

const MiniAppHostContext = createContext<MiniAppHostValue>(
  MISSING_PROVIDER_VALUE
);
const MiniAppAdmissionGrantContext = createContext<
  MiniAppAdmissionGrant | undefined
>(undefined);

export function MiniAppHostProvider({
  children,
  sdkLoader = defaultMiniAppSdkLoader,
  runtime = DEFAULT_MINI_APP_BROWSER_RUNTIME,
  hostDeadlineMilliseconds,
  addMiniAppDeadlineMilliseconds,
  quickAuthDeadlineMilliseconds
}: MiniAppHostProviderProps) {
  const hostDeadline = normalizedHostDeadline(hostDeadlineMilliseconds);
  const addMiniAppDeadline = normalizedAddMiniAppDeadline(
    addMiniAppDeadlineMilliseconds
  );
  const quickAuthDeadline = normalizedQuickAuthDeadline(
    quickAuthDeadlineMilliseconds
  );
  const miniAppHinted = isMiniAppHinted(runtime);
  const [hasAdmissionGrant, setHasAdmissionGrant] = useState(
    () => miniAppHinted && captureMiniAppAdmissionGrantTicket(runtime) !== undefined
  );
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
  const [admissionGrantConsumed, setAdmissionGrantConsumed] = useState(false);
  const [admissionGrantRevision, setAdmissionGrantRevision] = useState(0);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const [attemptGeneration, setAttemptGeneration] = useState(0);
  const activeAttemptGenerationRef = useRef(attemptGeneration);
  const sdkRef = useRef<MiniAppSdk | null>(null);
  const capabilitiesRef = useRef<ReadonlySet<MiniAppCapability>>(new Set());
  const hapticsEnabledRef = useRef(false);
  const notificationPresentationRef = useRef<MiniAppNotificationPresentation>(
    'unsupported'
  );
  const notificationProjectionRef = useRef<
    MiniAppNotificationProjectionController | undefined
  >(undefined);
  const activeBackCleanupRef = useRef<(() => void) | null>(null);
  const backCommandRef = useRef<Promise<void>>(Promise.resolve());
  const readyAttemptScopeRef = useRef<ReadyAttemptScope | null>(null);
  const quickAuthFlightRef = useRef<Readonly<{
    force: boolean;
    promise: Promise<FarcasterQuickAuthTokenResult>;
  }> | undefined>(undefined);
  const addMiniAppFlightRef = useRef<Readonly<{
    sdk: MiniAppSdk;
    generation: number;
    promise: Promise<MiniAppAddResult>;
  }> | undefined>(undefined);
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
    let removeNotificationListeners: (() => void) | null = null;
    notificationPresentationRef.current = 'unsupported';
    notificationProjectionRef.current = undefined;
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
      notificationPresentationRef.current = 'unsupported';
      notificationProjectionRef.current = undefined;
      removeNotificationListeners?.();
      removeNotificationListeners = null;
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
          sdk.isInMiniApp(hostDeadline),
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
      let presentationContextSeed = context;

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
            presentationContextSeed = refreshedContext;
            context = refreshedContext;
            if (sdkRef.current === sdk) {
              const nextSnapshot: HostSnapshot = Object.freeze({
                state: 'miniapp',
                context: refreshedContext,
                capabilities,
                notificationPresentation:
                  notificationPresentationRef.current,
                recoveryReason: null
              });
              snapshotRef.current = nextSnapshot;
              setSnapshot(nextSnapshot);
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
      notificationPresentationRef.current = initialNotificationPresentation(
        context,
        capabilities
      );
      const applyNotificationProjection = (
        update: MiniAppNotificationProjectionUpdate
      ) => {
        if (
          cancelled
          || activeAttemptGenerationRef.current !== attemptGeneration
          || sdkRef.current !== sdk
        ) return;
        const added = update.added
          ?? presentationContextSeed.client.added;
        const notificationsEnabledHint = update.notificationsEnabledHint
          ?? presentationContextSeed.client.notificationsEnabledHint;
        if (
          added !== presentationContextSeed.client.added
          || notificationsEnabledHint
            !== presentationContextSeed.client.notificationsEnabledHint
        ) {
          presentationContextSeed = withMiniAppNotificationHints(
            presentationContextSeed,
            { added, notificationsEnabledHint }
          );
          context = presentationContextSeed;
        }
        notificationPresentationRef.current = update.presentation;
        const nextSnapshot: HostSnapshot = Object.freeze({
          state: 'miniapp',
          context: presentationContextSeed,
          capabilities,
          notificationPresentation: update.presentation,
          recoveryReason: null
        });
        snapshotRef.current = nextSnapshot;
        setSnapshot(nextSnapshot);
      };
      notificationProjectionRef.current = Object.freeze({
        sdk,
        generation: attemptGeneration,
        apply: applyNotificationProjection
      });
      const initialSnapshot: HostSnapshot = Object.freeze({
        state: 'miniapp',
        context,
        capabilities,
        notificationPresentation: notificationPresentationRef.current,
        recoveryReason: null
      });
      snapshotRef.current = initialSnapshot;
      setSnapshot(initialSnapshot);
      const settleAddMiniAppFlight = () => {
        const flight = addMiniAppFlightRef.current;
        if (
          flight?.sdk === sdk
          && flight.generation === attemptGeneration
        ) {
          addMiniAppFlightRef.current = undefined;
        }
      };
      removeNotificationListeners = installMiniAppNotificationListeners(
        sdk,
        applyNotificationProjection,
        settleAddMiniAppFlight
      );
    })();

    return () => {
      cancelled = true;
      clearBackBinding();
      sdkRef.current = null;
      capabilitiesRef.current = new Set();
      hapticsEnabledRef.current = false;
      notificationPresentationRef.current = 'unsupported';
      if (
        notificationProjectionRef.current?.generation === attemptGeneration
      ) {
        notificationProjectionRef.current = undefined;
      }
      removeNotificationListeners?.();
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

  const addMiniApp = useCallback((): Promise<MiniAppAddResult> => {
    const sdk = sdkRef.current;
    const generation = activeAttemptGenerationRef.current;
    if (
      !sdk
      || !capabilitiesRef.current.has('actions.addMiniApp')
    ) {
      return Promise.resolve(MINI_APP_ADD_UNSUPPORTED);
    }

    const activeFlight = addMiniAppFlightRef.current;
    if (
      activeFlight
      && activeFlight.sdk === sdk
      && activeFlight.generation === generation
    ) return activeFlight.promise;

    // Once the host has settled this generation, a stale button frame cannot
    // reopen the native prompt before React presents the resulting state.
    const presentation = notificationPresentationRef.current;
    if (presentation === 'enabled-hint') {
      return Promise.resolve(MINI_APP_ADD_ENABLED_HINT);
    }
    if (
      presentation === 'requesting'
      || presentation === 'setup-requested'
      || presentation === 'added-status-unknown'
      || presentation === 'disabled-hint'
    ) {
      return Promise.resolve(MINI_APP_ADD_SETUP_REQUESTED);
    }
    if (presentation === 'unsupported') {
      return Promise.resolve(MINI_APP_ADD_UNSUPPORTED);
    }

    let sdkActions: MiniAppSdk['actions'];
    let invoke: NonNullable<MiniAppSdk['actions']['addMiniApp']>;
    try {
      sdkActions = sdk.actions;
      const candidate = sdkActions.addMiniApp;
      if (typeof candidate !== 'function') {
        return Promise.resolve(MINI_APP_ADD_UNSUPPORTED);
      }
      invoke = candidate;
    } catch {
      notificationProjectionRef.current?.apply({ presentation: 'failed' });
      return Promise.resolve(MINI_APP_ADD_FAILED);
    }

    const projection = notificationProjectionRef.current;
    if (
      !projection
      || projection.sdk !== sdk
      || projection.generation !== generation
    ) return Promise.resolve(MINI_APP_ADD_HOST_REPLACED);

    // The ref is the same-frame lock. Presentation leaves the available state
    // before any host promise or React commit can allow a duplicate prompt.
    projection.apply({ presentation: 'requesting' });

    let flight: NonNullable<typeof addMiniAppFlightRef.current>;
    const reconcileResult = (result: MiniAppAddResult) => {
      // A definitive host event can settle this attempt before the action
      // promise. Require exact flight identity so a late result cannot alter a
      // newer prompt started in the same SDK generation.
      if (addMiniAppFlightRef.current !== flight) return;
      const activeProjection = notificationProjectionRef.current;
      if (
        !activeProjection
        || activeProjection.sdk !== sdk
        || activeProjection.generation !== generation
      ) return;

      const current = notificationPresentationRef.current;
      if (result.status === 'enabled-hint') {
        if (
          current === 'requesting'
          || current === 'setup-requested'
          || current === 'added-status-unknown'
        ) {
          activeProjection.apply({
            presentation: 'enabled-hint',
            added: true,
            notificationsEnabledHint: true
          });
        }
      } else if (result.status === 'setup-requested') {
        if (current === 'requesting' || current === 'setup-requested') {
          activeProjection.apply({
            presentation: 'setup-requested',
            added: true,
            notificationsEnabledHint: false
          });
        }
      } else if (result.status === 'timeout') {
        if (current === 'requesting') {
          // A deadline cannot cancel a native prompt. Keep this generation
          // sealed until the host actually settles instead of exposing Retry.
          activeProjection.apply({ presentation: 'setup-requested' });
        }
      } else if (
        current === 'requesting'
        || current === 'setup-requested'
      ) {
        activeProjection.apply({
          presentation: result.status === 'rejected'
            ? 'rejected'
            : result.status === 'invalid-manifest'
              ? 'invalid-manifest'
              : 'failed'
        });
      }
    };

    const hostResultPromise = Promise.resolve()
      .then(async (): Promise<MiniAppAddResult> => {
        try {
          const hostResult = await invoke.call(sdkActions);
          if (
            sdkRef.current !== sdk
            || activeAttemptGenerationRef.current !== generation
          ) return MINI_APP_ADD_HOST_REPLACED;
          return readMiniAppAddResultNotificationHint(hostResult)
            ? MINI_APP_ADD_ENABLED_HINT
            : MINI_APP_ADD_SETUP_REQUESTED;
        } catch (error) {
          if (
            sdkRef.current !== sdk
            || activeAttemptGenerationRef.current !== generation
          ) return MINI_APP_ADD_HOST_REPLACED;
          return boundedMiniAppAddError(error);
        }
      });

    const promise = withMiniAppHostDeadline(
      hostResultPromise,
      addMiniAppDeadline
    )
      .catch((error: unknown) => isMiniAppHostDeadlineError(error)
        ? MINI_APP_ADD_TIMEOUT
        : MINI_APP_ADD_FAILED)
      .then((result) => {
        if (result.status === 'timeout') reconcileResult(result);
        return result;
      });
    flight = Object.freeze({ sdk, generation, promise });
    addMiniAppFlightRef.current = flight;

    // The bounded caller may settle before the user-controlled native prompt.
    // Retain the single-flight lock and reconcile the eventual host result so a
    // slow decision can never create two overlapping prompts or be discarded.
    const releaseFlight = () => {
      if (addMiniAppFlightRef.current === flight) {
        addMiniAppFlightRef.current = undefined;
      }
    };
    void hostResultPromise.then(
      (result) => {
        try {
          reconcileResult(result);
        } catch {
          // A presentation failure cannot escape the optional host boundary.
        } finally {
          releaseFlight();
        }
      },
      () => {
        // hostResultPromise is intentionally total, but keep the lock releasable
        // if an injected thenable violates that contract.
        releaseFlight();
      }
    );
    return promise;
  }, [addMiniAppDeadline]);

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
    addMiniApp,
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
  }), [addMiniApp, runOptional]);

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

  const quickAuth = useMemo<MiniAppHostQuickAuth>(() => {
    const getToken: MiniAppHostQuickAuth['getToken'] = (options = {}) => {
      const force = options.force === true;
      const activeFlight = quickAuthFlightRef.current;
      if (activeFlight) {
        // A forced refresh must not silently inherit a non-forced acquisition.
        // It runs only after that single shared host request has settled.
        return force && !activeFlight.force
          ? activeFlight.promise.then(() => getToken({ force: true }))
          : activeFlight.promise;
      }

      const sdk = sdkRef.current;
      const sdkQuickAuth = sdk?.quickAuth;
      const acquire = sdkQuickAuth?.getToken;
      if (!sdk || !sdkQuickAuth || typeof acquire !== 'function') {
        return Promise.resolve(QUICK_AUTH_UNSUPPORTED);
      }

      let flight: NonNullable<typeof quickAuthFlightRef.current>;
      const promise = Promise.resolve()
        .then(async (): Promise<FarcasterQuickAuthTokenResult> => {
          try {
            const result = await withMiniAppHostDeadline(
              Promise.resolve().then(() => acquire.call(
                sdkQuickAuth,
                force ? { force: true } : undefined
              )),
              quickAuthDeadline
            );
            if (sdkRef.current !== sdk) return QUICK_AUTH_HOST_REPLACED;
            const token = readMiniAppQuickAuthToken(result);
            return token
              ? Object.freeze({ status: 'token', token })
              : QUICK_AUTH_INVALID_SHAPE;
          } catch (error) {
            if (sdkRef.current !== sdk) return QUICK_AUTH_HOST_REPLACED;
            return isMiniAppHostDeadlineError(error)
              ? QUICK_AUTH_TIMEOUT
              : QUICK_AUTH_REJECTED;
          }
        })
        .finally(() => {
          if (quickAuthFlightRef.current === flight) {
            quickAuthFlightRef.current = undefined;
          }
        });
      flight = Object.freeze({ force, promise });
      quickAuthFlightRef.current = flight;
      return promise;
    };

    return Object.freeze({ getToken });
  }, [quickAuthDeadline]);

  useEffect(() => {
    if (!miniAppHinted || !runtime.subscribeNavigationChange) return undefined;
    const reconcileNavigation = () => {
      if (captureMiniAppAdmissionGrantTicket(runtime, true) === undefined) return;
      setHasAdmissionGrant(true);
      setAdmissionGrantConsumed(false);
      setAdmissionGrantRevision(revision => revision + 1);
    };
    const unsubscribe = runtime.subscribeNavigationChange(reconcileNavigation);
    // A same-document launch may update the fragment between render-time
    // capture and passive-effect subscription. Reconcile once after the
    // listener is live so that narrow window cannot lose the capability.
    reconcileNavigation();
    return unsubscribe;
  }, [miniAppHinted, runtime]);

  const admissionGrant = useMemo<MiniAppAdmissionGrant | undefined>(() => {
    void admissionGrantRevision;
    if (!hasAdmissionGrant || admissionGrantConsumed) return undefined;
    const notificationId = snapshot.context?.notificationId;
    return Object.freeze({
      ...(isMiniAppAdmissionGrantNotificationId(notificationId)
        ? { notificationId }
        : {}),
      read: () => captureMiniAppAdmissionGrantTicket(runtime),
      clear: (expectedTicket: string) => {
        if (clearMiniAppAdmissionGrantTicket(runtime.document, expectedTicket)) {
          setAdmissionGrantConsumed(true);
        }
      }
    });
  }, [
    admissionGrantConsumed,
    admissionGrantRevision,
    hasAdmissionGrant,
    runtime,
    snapshot.context?.notificationId
  ]);

  const value = useMemo<MiniAppHostValue>(() => Object.freeze({
    state: snapshot.state,
    isMiniApp: snapshot.state === 'miniapp',
    isFramed,
    context: snapshot.context,
    capabilities: snapshot.capabilities,
    notificationPresentation: snapshot.notificationPresentation,
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
    <MiniAppAdmissionGrantContext.Provider value={admissionGrant}>
      <MiniAppHostContext.Provider value={value}>
        {children}
      </MiniAppHostContext.Provider>
    </MiniAppAdmissionGrantContext.Provider>
  );
}

export function useMiniAppHost(): MiniAppHostValue {
  return useContext(MiniAppHostContext);
}

/** Auth-only capability channel; intentionally absent from the broad host API. */
export function useMiniAppAdmissionGrant(): MiniAppAdmissionGrant | undefined {
  return useContext(MiniAppAdmissionGrantContext);
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

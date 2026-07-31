import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState
} from 'react';

import {
  REALM_SURFACE_HISTORY_KEY,
  REALM_SURFACE_MAX_DEPTH,
  popRealmSurfaceRoute,
  pushRealmSurfaceRoute,
  readRealmSurfaceHistoryState,
  replaceRealmSurfaceRoute,
  sameRealmSurfaceRoute,
  type RealmSurfaceHistoryState,
  type RealmSurfaceRoute
} from './realmSurfaceNavigation';

type BrowserHistoryRecord = Record<string, unknown>;

export const REALM_SURFACE_HISTORY_TRAVERSAL_WATCHDOG_MILLISECONDS = 1_500;

function currentHistoryRecord(): BrowserHistoryRecord {
  const current = window.history.state;
  return current && typeof current === 'object' && !Array.isArray(current)
    ? current as BrowserHistoryRecord
    : {};
}

function withRealmNavigationState(envelope: RealmSurfaceHistoryState) {
  return {
    ...currentHistoryRecord(),
    [REALM_SURFACE_HISTORY_KEY]: envelope
  };
}

function withoutRealmNavigationState() {
  const current = currentHistoryRecord();
  const {
    [REALM_SURFACE_HISTORY_KEY]: _discarded,
    ...rest
  } = current;
  return rest;
}

function currentRealmUrl() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function sameRealmSurfaceStack(
  left: readonly RealmSurfaceRoute[],
  right: readonly RealmSurfaceRoute[]
) {
  return left.length === right.length
    && left.every((route, index) => sameRealmSurfaceRoute(route, right[index]));
}

export type RealmSurfaceNavigation = Readonly<{
  stack: readonly RealmSurfaceRoute[];
  current: RealmSurfaceRoute | undefined;
  depth: number;
  motion?: 'idle' | 'forward' | 'backward' | 'replace';
  push: (route: RealmSurfaceRoute) => void;
  replace: (route: RealmSurfaceRoute) => void;
  back: () => void;
  closeToRealm: () => void;
}>;

export function useRealmSurfaceNavigation({
  historyEnabled,
  identityKey
}: Readonly<{
  historyEnabled: boolean;
  identityKey: string;
}>): RealmSurfaceNavigation {
  const reactId = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const identityGenerationRef = useRef(0);
  const sessionRef = useRef(`realm-${reactId}-0`);
  const [stack, setStack] = useState<readonly RealmSurfaceRoute[]>([]);
  const [motion, setMotion] = useState<
    'idle' | 'forward' | 'backward' | 'replace'
  >('idle');
  const stackRef = useRef(stack);
  const historyEnabledRef = useRef(historyEnabled);
  const historyTraversalPendingRef = useRef(false);
  const historyTraversalWatchdogRef = useRef<number | undefined>(undefined);
  stackRef.current = stack;
  historyEnabledRef.current = historyEnabled;

  const clearHistoryTraversalPending = useCallback(() => {
    historyTraversalPendingRef.current = false;
    const watchdog = historyTraversalWatchdogRef.current;
    historyTraversalWatchdogRef.current = undefined;
    if (watchdog !== undefined) window.clearTimeout(watchdog);
  }, []);

  const reconcileHistoryStack = useCallback((
    nextStack: readonly RealmSurfaceRoute[]
  ) => {
    const previousStack = stackRef.current;
    if (sameRealmSurfaceStack(previousStack, nextStack)) return;
    setMotion(
      nextStack.length < previousStack.length
        ? 'backward'
        : nextStack.length > previousStack.length
          ? 'forward'
          : 'replace'
    );
    stackRef.current = nextStack;
    setStack(nextStack);
  }, []);

  const beginHistoryTraversal = useCallback(() => {
    if (historyTraversalPendingRef.current) return false;
    clearHistoryTraversalPending();
    historyTraversalPendingRef.current = true;
    const pendingSession = sessionRef.current;
    historyTraversalWatchdogRef.current = window.setTimeout(() => {
      historyTraversalWatchdogRef.current = undefined;
      if (!historyTraversalPendingRef.current) return;
      historyTraversalPendingRef.current = false;
      if (sessionRef.current !== pendingSession) return;
      const restored = readRealmSurfaceHistoryState(
        currentHistoryRecord()[REALM_SURFACE_HISTORY_KEY],
        pendingSession
      );
      // A WebView may traverse without delivering popstate. Reconcile only an
      // exact same-session envelope; a silent no-op or unrelated host state
      // simply releases the latch so the player can retry safely.
      if (restored) reconcileHistoryStack(restored.stack);
    }, REALM_SURFACE_HISTORY_TRAVERSAL_WATCHDOG_MILLISECONDS);
    return true;
  }, [clearHistoryTraversalPending, reconcileHistoryStack]);

  const envelopeFor = useCallback((nextStack: readonly RealmSurfaceRoute[]) => (
    Object.freeze({
      version: 1 as const,
      session: sessionRef.current,
      stack: nextStack
    })
  ), []);

  const replaceBrowserState = useCallback((nextStack: readonly RealmSurfaceRoute[]) => {
    window.history.replaceState(
      withRealmNavigationState(envelopeFor(nextStack)),
      '',
      currentRealmUrl()
    );
  }, [envelopeFor]);

  useLayoutEffect(() => {
    clearHistoryTraversalPending();
    identityGenerationRef.current += 1;
    sessionRef.current = `realm-${reactId}-${identityGenerationRef.current}`;
    stackRef.current = Object.freeze([]);
    setStack(stackRef.current);
    setMotion('idle');
    if (historyEnabled) replaceBrowserState(stackRef.current);
    else {
      window.history.replaceState(
        withoutRealmNavigationState(),
        '',
        currentRealmUrl()
      );
    }
  }, [
    clearHistoryTraversalPending,
    historyEnabled,
    identityKey,
    reactId,
    replaceBrowserState
  ]);

  useEffect(() => {
    if (!historyEnabled) return undefined;
    const restore = (event: PopStateEvent) => {
      const candidate = event.state && typeof event.state === 'object'
        ? (event.state as BrowserHistoryRecord)[REALM_SURFACE_HISTORY_KEY]
        : undefined;
      const restored = readRealmSurfaceHistoryState(candidate, sessionRef.current);
      const nextStack = restored?.stack ?? Object.freeze([]);
      clearHistoryTraversalPending();
      reconcileHistoryStack(nextStack);
    };
    window.addEventListener('popstate', restore);
    return () => {
      window.removeEventListener('popstate', restore);
      clearHistoryTraversalPending();
    };
  }, [
    clearHistoryTraversalPending,
    historyEnabled,
    reconcileHistoryStack
  ]);

  const push = useCallback((route: RealmSurfaceRoute) => {
    if (historyTraversalPendingRef.current) return;
    const atCapacity = stackRef.current.length >= REALM_SURFACE_MAX_DEPTH;
    const nextStack = pushRealmSurfaceRoute(stackRef.current, route);
    if (nextStack === stackRef.current) return;
    setMotion('forward');
    stackRef.current = nextStack;
    setStack(nextStack);
    if (historyEnabledRef.current) {
      if (atCapacity) {
        replaceBrowserState(nextStack);
      } else {
        window.history.pushState(
          withRealmNavigationState(envelopeFor(nextStack)),
          '',
          currentRealmUrl()
        );
      }
    }
  }, [envelopeFor, replaceBrowserState]);

  const replace = useCallback((route: RealmSurfaceRoute) => {
    if (historyTraversalPendingRef.current) return;
    const replacingRoot = stackRef.current.length === 0;
    const nextStack = replaceRealmSurfaceRoute(stackRef.current, route);
    if (nextStack === stackRef.current) return;
    setMotion('replace');
    stackRef.current = nextStack;
    setStack(nextStack);
    if (historyEnabledRef.current) {
      if (replacingRoot) {
        // A route cannot replace the only Realm root entry. Preserve a
        // reachable root so Back and closeToRealm remain inside the Realm
        // lifecycle instead of escaping to an unrelated previous page.
        window.history.pushState(
          withRealmNavigationState(envelopeFor(nextStack)),
          '',
          currentRealmUrl()
        );
      } else {
        replaceBrowserState(nextStack);
      }
    }
  }, [envelopeFor, replaceBrowserState]);

  const back = useCallback(() => {
    if (stackRef.current.length === 0) return;
    const nextStack = popRealmSurfaceRoute(stackRef.current);
    if (historyEnabledRef.current) {
      if (!beginHistoryTraversal()) return;
      try {
        window.history.back();
      } catch {
        clearHistoryTraversalPending();
      }
      return;
    }
    setMotion('backward');
    stackRef.current = nextStack;
    setStack(nextStack);
  }, [beginHistoryTraversal, clearHistoryTraversalPending]);

  const closeToRealm = useCallback(() => {
    const depth = stackRef.current.length;
    if (depth === 0) return;
    if (historyEnabledRef.current) {
      if (!beginHistoryTraversal()) return;
      try {
        window.history.go(-depth);
      } catch {
        clearHistoryTraversalPending();
      }
      return;
    }
    const nextStack = Object.freeze([]) as readonly RealmSurfaceRoute[];
    setMotion('backward');
    stackRef.current = nextStack;
    setStack(nextStack);
  }, [beginHistoryTraversal, clearHistoryTraversalPending]);

  return Object.freeze({
    stack,
    current: stack.at(-1),
    depth: stack.length,
    motion,
    push,
    replace,
    back,
    closeToRealm
  });
}

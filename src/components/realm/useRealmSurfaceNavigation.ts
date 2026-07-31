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
  type RealmSurfaceHistoryState,
  type RealmSurfaceRoute
} from './realmSurfaceNavigation';

type BrowserHistoryRecord = Record<string, unknown>;

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
  const previousHistoryEnabledRef = useRef(historyEnabled);
  const historyTraversalPendingRef = useRef(false);
  stackRef.current = stack;
  historyEnabledRef.current = historyEnabled;

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
    identityGenerationRef.current += 1;
    sessionRef.current = `realm-${reactId}-${identityGenerationRef.current}`;
    if (
      !historyEnabled
      || previousHistoryEnabledRef.current !== historyEnabled
    ) {
      historyTraversalPendingRef.current = false;
    }
    previousHistoryEnabledRef.current = historyEnabled;
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
  }, [historyEnabled, identityKey, reactId, replaceBrowserState]);

  useEffect(() => {
    if (!historyEnabled) return undefined;
    const restore = (event: PopStateEvent) => {
      const candidate = event.state && typeof event.state === 'object'
        ? (event.state as BrowserHistoryRecord)[REALM_SURFACE_HISTORY_KEY]
        : undefined;
      const restored = readRealmSurfaceHistoryState(candidate, sessionRef.current);
      const nextStack = restored?.stack ?? Object.freeze([]);
      setMotion(
        nextStack.length < stackRef.current.length
          ? 'backward'
          : nextStack.length > stackRef.current.length
            ? 'forward'
            : 'replace'
      );
      historyTraversalPendingRef.current = false;
      stackRef.current = nextStack;
      setStack(nextStack);
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [historyEnabled]);

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
      if (historyTraversalPendingRef.current) return;
      historyTraversalPendingRef.current = true;
      try {
        window.history.back();
      } catch {
        historyTraversalPendingRef.current = false;
      }
      return;
    }
    setMotion('backward');
    stackRef.current = nextStack;
    setStack(nextStack);
  }, []);

  const closeToRealm = useCallback(() => {
    const depth = stackRef.current.length;
    if (depth === 0) return;
    if (historyEnabledRef.current) {
      if (historyTraversalPendingRef.current) return;
      historyTraversalPendingRef.current = true;
      try {
        window.history.go(-depth);
      } catch {
        historyTraversalPendingRef.current = false;
      }
      return;
    }
    const nextStack = Object.freeze([]) as readonly RealmSurfaceRoute[];
    setMotion('backward');
    stackRef.current = nextStack;
    setStack(nextStack);
  }, []);

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

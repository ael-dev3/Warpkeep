import {
  useCallback,
  useEffect,
  useId,
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
  const stackRef = useRef(stack);
  const historyEnabledRef = useRef(historyEnabled);
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

  useEffect(() => {
    identityGenerationRef.current += 1;
    sessionRef.current = `realm-${reactId}-${identityGenerationRef.current}`;
    stackRef.current = Object.freeze([]);
    setStack(stackRef.current);
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
      stackRef.current = nextStack;
      setStack(nextStack);
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [historyEnabled]);

  const push = useCallback((route: RealmSurfaceRoute) => {
    const atCapacity = stackRef.current.length >= REALM_SURFACE_MAX_DEPTH;
    const nextStack = pushRealmSurfaceRoute(stackRef.current, route);
    if (nextStack === stackRef.current) return;
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
    const nextStack = replaceRealmSurfaceRoute(stackRef.current, route);
    if (nextStack === stackRef.current) return;
    stackRef.current = nextStack;
    setStack(nextStack);
    if (historyEnabledRef.current) replaceBrowserState(nextStack);
  }, [replaceBrowserState]);

  const back = useCallback(() => {
    if (stackRef.current.length === 0) return;
    const nextStack = popRealmSurfaceRoute(stackRef.current);
    stackRef.current = nextStack;
    setStack(nextStack);
    if (historyEnabledRef.current) {
      window.history.back();
      return;
    }
  }, []);

  const closeToRealm = useCallback(() => {
    const depth = stackRef.current.length;
    if (depth === 0) return;
    const nextStack = Object.freeze([]) as readonly RealmSurfaceRoute[];
    stackRef.current = nextStack;
    setStack(nextStack);
    if (historyEnabledRef.current) {
      window.history.go(-depth);
      return;
    }
  }, []);

  return Object.freeze({
    stack,
    current: stack.at(-1),
    depth: stack.length,
    push,
    replace,
    back,
    closeToRealm
  });
}

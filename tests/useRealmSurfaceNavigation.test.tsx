import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  REALM_SURFACE_HISTORY_KEY,
  type RealmSurfaceHistoryState,
  type RealmSurfaceRoute
} from '../src/components/realm/realmSurfaceNavigation';
import {
  useRealmSurfaceNavigation,
  type RealmSurfaceNavigation
} from '../src/components/realm/useRealmSurfaceNavigation';

const COMMANDS = Object.freeze({ kind: 'commands' }) satisfies RealmSurfaceRoute;
const SETTINGS = Object.freeze({ kind: 'settings' }) satisfies RealmSurfaceRoute;
const EXPLORE = Object.freeze({ kind: 'explore' }) satisfies RealmSurfaceRoute;
const WORKERS = Object.freeze({ kind: 'workers' }) satisfies RealmSurfaceRoute;

let latestNavigation: RealmSurfaceNavigation | undefined;

function NavigationHarness({
  identityKey
}: Readonly<{ identityKey: string }>) {
  latestNavigation = useRealmSurfaceNavigation({
    historyEnabled: true,
    identityKey
  });
  return (
    <output data-depth={latestNavigation.depth}>
      {JSON.stringify(latestNavigation.stack)}
    </output>
  );
}

function navigation() {
  if (!latestNavigation) throw new Error('Navigation harness is not mounted.');
  return latestNavigation;
}

function currentHistoryState() {
  const value = window.history.state;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected a browser history record.');
  }
  return value as Record<string, unknown>;
}

function currentEnvelope() {
  const candidate = currentHistoryState()[REALM_SURFACE_HISTORY_KEY];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('Expected a Realm navigation envelope.');
  }
  return candidate as RealmSurfaceHistoryState;
}

function dispatchPopState(state: unknown) {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state }));
  });
}

function expectStack(expected: readonly RealmSurfaceRoute[]) {
  expect(navigation().stack).toEqual(expected);
  expect(navigation().depth).toBe(expected.length);
  expect(navigation().current).toEqual(expected.at(-1));
}

beforeEach(() => {
  window.history.replaceState(
    { retainedBrowserState: 'fixture' },
    '',
    '/realm-navigation-test?miniApp=true#realm'
  );
});

afterEach(() => {
  cleanup();
  latestNavigation = undefined;
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});

describe('useRealmSurfaceNavigation serialized browser history', () => {
  it('keeps Back pessimistic and blocks every competing command until its exact popstate', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
    render(<NavigationHarness identityKey="fid:1" />);

    act(() => navigation().push(COMMANDS));
    const commandsState = currentHistoryState();
    act(() => navigation().push(SETTINGS));
    expectStack([COMMANDS, SETTINGS]);

    const pushCount = pushState.mock.calls.length;
    const replaceCount = replaceState.mock.calls.length;
    act(() => navigation().back());
    expect(back).toHaveBeenCalledOnce();
    expectStack([COMMANDS, SETTINGS]);

    act(() => {
      navigation().push(EXPLORE);
      navigation().replace(WORKERS);
      navigation().back();
      navigation().closeToRealm();
    });
    expect(pushState).toHaveBeenCalledTimes(pushCount);
    expect(replaceState).toHaveBeenCalledTimes(replaceCount);
    expect(back).toHaveBeenCalledOnce();
    expect(go).not.toHaveBeenCalled();
    expectStack([COMMANDS, SETTINGS]);

    dispatchPopState(commandsState);
    expectStack([COMMANDS]);

    act(() => navigation().push(EXPLORE));
    expect(pushState).toHaveBeenCalledTimes(pushCount + 1);
    expectStack([COMMANDS, EXPLORE]);
  });

  it('serializes closeToRealm until the exact root popstate settles it', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
    render(<NavigationHarness identityKey="fid:2" />);

    const rootState = currentHistoryState();
    act(() => {
      navigation().push(COMMANDS);
      navigation().push(SETTINGS);
    });
    expectStack([COMMANDS, SETTINGS]);

    const pushCount = pushState.mock.calls.length;
    const replaceCount = replaceState.mock.calls.length;
    act(() => navigation().closeToRealm());
    expect(go).toHaveBeenCalledOnce();
    expect(go).toHaveBeenLastCalledWith(-2);
    expectStack([COMMANDS, SETTINGS]);

    act(() => {
      navigation().closeToRealm();
      navigation().back();
      navigation().push(EXPLORE);
      navigation().replace(WORKERS);
    });
    expect(go).toHaveBeenCalledOnce();
    expect(back).not.toHaveBeenCalled();
    expect(pushState).toHaveBeenCalledTimes(pushCount);
    expect(replaceState).toHaveBeenCalledTimes(replaceCount);
    expectStack([COMMANDS, SETTINGS]);

    dispatchPopState(rootState);
    expectStack([]);

    act(() => navigation().replace(WORKERS));
    expect(pushState).toHaveBeenCalledTimes(pushCount + 1);
    expect(replaceState).toHaveBeenCalledTimes(replaceCount);
    expectStack([WORKERS]);

    act(() => navigation().closeToRealm());
    expect(go).toHaveBeenCalledTimes(2);
    expect(go).toHaveBeenLastCalledWith(-1);
    expectStack([WORKERS]);
    dispatchPopState(rootState);
    expectStack([]);
  });

  it('fails malformed and wrong-session popstates to root and releases pending traversal', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    render(<NavigationHarness identityKey="fid:3" />);

    act(() => navigation().push(COMMANDS));
    const session = currentEnvelope().session;
    act(() => navigation().back());

    dispatchPopState({
      [REALM_SURFACE_HISTORY_KEY]: {
        version: 1,
        session,
        stack: [{ kind: 'commands', unexpectedAuthority: true }]
      }
    });
    expectStack([]);
    act(() => navigation().push(EXPLORE));
    expectStack([EXPLORE]);

    act(() => navigation().back());
    dispatchPopState({
      [REALM_SURFACE_HISTORY_KEY]: {
        version: 1,
        session: 'realm-unrelated-1',
        stack: [SETTINGS]
      }
    });
    expectStack([]);
    act(() => navigation().push(WORKERS));
    expectStack([WORKERS]);
    expect(back).toHaveBeenCalledTimes(2);
  });

  it('keeps an old pending Back serialized across identity reset until its late state is rejected', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const { rerender } = render(<NavigationHarness identityKey="fid:4" />);

    act(() => navigation().push(COMMANDS));
    const oldState = currentHistoryState();
    const oldSession = currentEnvelope().session;
    expectStack([COMMANDS]);
    act(() => navigation().back());
    expect(back).toHaveBeenCalledOnce();
    expectStack([COMMANDS]);

    rerender(<NavigationHarness identityKey="fid:5" />);
    const newSession = currentEnvelope().session;
    expect(newSession).not.toBe(oldSession);
    expectStack([]);

    act(() => navigation().push(SETTINGS));
    expectStack([]);

    dispatchPopState(oldState);
    expectStack([]);

    act(() => navigation().push(EXPLORE));
    expect(currentEnvelope().session).toBe(newSession);
    expectStack([EXPLORE]);
  });

  it('restores exact same-session stacks across external Back and Forward traversal', () => {
    render(<NavigationHarness identityKey="fid:6" />);
    expect(navigation().motion).toBe('idle');

    const rootState = currentHistoryState();
    act(() => navigation().push(COMMANDS));
    expect(navigation().motion).toBe('forward');
    const commandsState = currentHistoryState();
    act(() => navigation().push(SETTINGS));
    const settingsState = currentHistoryState();
    expectStack([COMMANDS, SETTINGS]);

    dispatchPopState(commandsState);
    expectStack([COMMANDS]);
    expect(navigation().motion).toBe('backward');
    dispatchPopState(settingsState);
    expectStack([COMMANDS, SETTINGS]);
    expect(navigation().motion).toBe('forward');
    dispatchPopState(rootState);
    expectStack([]);
    expect(navigation().motion).toBe('backward');
    dispatchPopState(settingsState);
    expectStack([COMMANDS, SETTINGS]);
    expect(navigation().motion).toBe('forward');
  });
});

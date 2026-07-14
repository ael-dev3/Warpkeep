import { useEffect, useRef, useState } from 'react';

import { RealmMapScreen } from '../components/realm/RealmMapScreen';
import {
  createRealmObserverHarnessRealm,
  fetchRealmObserverSnapshot,
  type RealmObserverHarnessRealm,
  type RealmObserverSnapshot
} from './realmObserverSnapshot';

type ObserverState =
  | Readonly<{ phase: 'loading' }>
  | Readonly<{ phase: 'ready'; realm: RealmObserverHarnessRealm }>
  | Readonly<{ phase: 'error' }>
  | Readonly<{ phase: 'closed' }>;

type RealmObserverQaHarnessProps = Readonly<{
  loadSnapshot?: () => Promise<RealmObserverSnapshot>;
}>;

export const REALM_OBSERVER_REFRESH_MILLISECONDS = 60_000;

function observerOwnerSeed() {
  if (!globalThis.crypto?.getRandomValues) throw new Error('Observer entropy unavailable.');
  const random = new Uint32Array(1);
  globalThis.crypto.getRandomValues(random);
  return (random[0]! % 1_000_000) + 1;
}

export function RealmObserverQaHarness({
  loadSnapshot = fetchRealmObserverSnapshot
}: RealmObserverQaHarnessProps) {
  const [state, setState] = useState<ObserverState>({ phase: 'loading' });
  const ownerSeedRef = useRef<number | undefined>(undefined);
  const closedRef = useRef(false);
  const refreshTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const snapshot = await loadSnapshot();
        if (!active || closedRef.current) return;
        ownerSeedRef.current ??= observerOwnerSeed();
        setState({
          phase: 'ready',
          realm: createRealmObserverHarnessRealm(snapshot, ownerSeedRef.current)
        });
      } catch {
        if (active && !closedRef.current) setState({ phase: 'error' });
      } finally {
        if (active && !closedRef.current) {
          refreshTimerRef.current = window.setTimeout(
            refresh,
            REALM_OBSERVER_REFRESH_MILLISECONDS
          );
        }
      }
    };
    void refresh();
    return () => {
      active = false;
      if (refreshTimerRef.current !== undefined) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, [loadSnapshot]);

  const closeObserver = () => {
    closedRef.current = true;
    if (refreshTimerRef.current !== undefined) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = undefined;
    }
    setState({ phase: 'closed' });
  };

  if (state.phase === 'ready') {
    return (
      <RealmMapScreen
        identity={state.realm.identity}
        snapshot={state.realm.snapshot}
        presentationMode="observer"
        onRequestReturn={closeObserver}
      />
    );
  }

  const copy = state.phase === 'loading'
    ? 'Connecting to the exact local read-only broker…'
    : state.phase === 'error'
      ? 'The local read-only broker did not provide a compatible snapshot.'
      : 'The QA observer session is closed.';
  return (
    <main className="realm-observer-qa-status" aria-live="polite">
      <section>
        <p>QA OBSERVER · READ ONLY</p>
        <h1>{state.phase === 'loading' ? 'Opening Genesis 001' : 'Observer unavailable'}</h1>
        <span role={state.phase === 'error' ? 'alert' : 'status'}>{copy}</span>
      </section>
    </main>
  );
}

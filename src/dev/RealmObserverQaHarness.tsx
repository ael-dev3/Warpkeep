import { useState } from 'react';

import { RealmMapScreen } from '../components/realm/RealmMapScreen';
import {
  createRealmObserverFixtureRealm,
  type RealmObserverHarnessRealm
} from './realmObserverSnapshot';

type ObserverState =
  | Readonly<{ phase: 'ready'; realm: RealmObserverHarnessRealm }>
  | Readonly<{ phase: 'error' }>
  | Readonly<{ phase: 'closed' }>;

type RealmObserverQaHarnessProps = Readonly<{
  /** Test seam for the local deterministic fixture only. */
  createFixtureRealm?: () => RealmObserverHarnessRealm;
}>;

function initialObserverState(createFixtureRealm: () => RealmObserverHarnessRealm): ObserverState {
  try {
    return { phase: 'ready', realm: createFixtureRealm() };
  } catch {
    return { phase: 'error' };
  }
}

export function RealmObserverQaHarness({
  createFixtureRealm = createRealmObserverFixtureRealm
}: RealmObserverQaHarnessProps) {
  const [state, setState] = useState<ObserverState>(() => initialObserverState(createFixtureRealm));

  const closeObserver = () => {
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

  const copy = state.phase === 'error'
    ? 'The deterministic local QA fixture could not be initialized.'
    : 'The QA observer session is closed.';
  return (
    <main className="realm-observer-qa-status" aria-live="polite">
      <section>
        <p>QA OBSERVER · READ ONLY</p>
        <h1>{state.phase === 'error' ? 'Observer unavailable' : 'Observer closed'}</h1>
        <span role={state.phase === 'error' ? 'alert' : 'status'}>{copy}</span>
      </section>
    </main>
  );
}

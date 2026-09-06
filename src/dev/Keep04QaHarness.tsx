import { useMemo, useState } from 'react';
import { Keep04Screen, type Keep04UiSelection } from '../components/keep04/Keep04Screen';
import type { Quality04 } from '../components/keep04/keep04VisualProfile';
import type { Controller04, Snapshot04 } from '../ptr/gameplay04/createGameplay04Controller';
import { presentState04 } from '../ptr/gameplay04/gameplay04Presentation';
import { decodeState04 } from '../ptr/gameplay04/gameplay04State';
import type { ReadWire04 } from '../ptr/gameplay04/ptrGameplay04Types';
import { GAMEPLAY04_POLICY_VERSION, gatheringYield04 } from '../../spacetimedb/gameplay04/policy';
import { GAMEPLAY04_LAYOUT_VERSION } from '../../spacetimedb/gameplay04/placement';
import { GAMEPLAY04_LAYOUT_DIGEST } from '../../spacetimedb/gameplay04/construction';

// Same empty wire shape as the accepted client fixture, deliberately without an authority/session/identity.
export const EMPTY_WIRE04: ReadWire04 = {
  policyVersion: GAMEPLAY04_POLICY_VERSION, layoutVersion: GAMEPLAY04_LAYOUT_VERSION, layoutDigest: GAMEPLAY04_LAYOUT_DIGEST,
  revision: 1n, lastAcceptedSequence: 1n, food: 0n, wood: 0n, stone: 0n, gold: 0n,
  workers: [0, 1, 2, 3].map(ordinal => ({ ordinal, assignmentRevision: 0n, assignment: undefined, lastReturn: undefined })),
  buildings: [], project: undefined,
  completedLevels: { mill: 0, lumberCamp: 0, stoneworks: 0, goldworks: 0, barracks: 0, cathedral: 0 },
  completedEffects: { foodYieldPerQuantum: 10n, woodYieldPerQuantum: 10n, stoneYieldPerQuantum: 10n, goldYieldPerQuantum: 10n, travelPerEdgeMicros: 2000000n, levelOneBuildDurationMicros: 120000000n },
};
const MILL = { kind: 'city-mill', x: -24000000n, z: -20000000n, rotation: 0 } as const;

export function createKeep04QaSnapshot(fixture: 'empty' | 'construction' | 'complete', nowMs = Date.now()): Snapshot04 {
  const startedAtMicros = BigInt(nowMs - 15000) * 1000n;
  const wire: ReadWire04 = { ...EMPTY_WIRE04, buildings: fixture === 'empty' ? [] : [{ ...MILL, completedLevel: fixture === 'complete' ? 1 : 0, revision: 1n }],
    completedLevels: { ...EMPTY_WIRE04.completedLevels, mill: fixture === 'complete' ? 1 : 0 },
    completedEffects: { ...EMPTY_WIRE04.completedEffects, foodYieldPerQuantum: gatheringYield04('food', { 'city-mill': fixture === 'complete' ? 1 : 0, 'lumber-camp': 0, 'city-stoneworks': 0, 'city-goldworks': 0, 'city-barracks': 0, 'grand-covenant-cathedral': 0 }) },
    project: fixture === 'construction' ? { kind: 'city-mill', projectRevision: 1n, targetLevel: 1, startedAtMicros, completesAtMicros: startedAtMicros + 120000000n, durationMicros: 120000000n, cost: { food: 20n, wood: 40n, stone: 20n, gold: 0n } } : undefined };
  // This decoder context is a conspicuous local sentinel, never a capability or forged player identity.
  const state = decodeState04(wire, { generation: 0, databaseIdentity: 'synthetic-local-qa-not-an-identity', anchorQ: 0, anchorR: 0 });
  return { phase: 'ready', problem: 'none', view: presentState04(state, null, nowMs) };
}

export function Keep04QaHarness() {
  const params = new URLSearchParams(window.location.search);
  const [quality, setQuality] = useState<Quality04>(params.get('quality') === 'balanced' ? 'balanced' : params.get('quality') === 'reduced' ? 'reduced' : 'high');
  const [fixture, setFixture] = useState<'empty' | 'construction' | 'complete'>('complete');
  const [selection, setSelection] = useState<Keep04UiSelection>({ selectedKind: null, draft: null, panel: null });
  const [message, setMessage] = useState('No gameplay connection. Fixture controls change presentation only.');
  const snapshot = useMemo(() => createKeep04QaSnapshot(fixture), [fixture]);
  const controller = useMemo<Controller04>(() => ({ getSnapshot: () => snapshot, subscribe: () => () => {}, refresh: async () => {}, setAtlas: () => {},
    submit: async () => { setMessage('Synthetic controller: gameplay commands are not sent.'); }, retryPending: async () => {}, dispose: () => {} }), [snapshot]);
  function change(next: typeof fixture) { setFixture(next); setSelection({ selectedKind: next === 'empty' ? null : 'city-mill', draft: null, panel: null }); }
  return <main style={{ margin: 0, background: '#102520', minHeight: '100vh', color: '#f2eddf', fontFamily: 'system-ui' }}>
    <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', borderBottom: '1px solid #698c80' }}>
      <strong>Synthetic controller · local visual QA only</strong>
      <label>Quality <select aria-label="Scene quality" value={quality} onChange={event => setQuality(event.target.value as Quality04)}><option>high</option><option>balanced</option><option>reduced</option></select></label>
      <button type="button" onClick={() => change('empty')}>Empty keep fixture</button>
      <button type="button" onClick={() => change('construction')}>Mill construction fixture</button>
      <button type="button" onClick={() => change('complete')}>Mill completion fixture</button>
      <small>{message}</small>
    </div>
    <Keep04Screen snapshot={snapshot} controller={controller} selection={selection} onSelectionChange={setSelection} quality={quality}
      reducedMotion={params.get('motion') === 'reduced'} onBack={() => setMessage('Synthetic controller: back navigation is not connected.')}
      onFindResources={() => setMessage('Synthetic controller: no Realm resource queries.')} onReturnToWorld={() => setMessage('Synthetic controller: no world connection.')} />
  </main>;
}

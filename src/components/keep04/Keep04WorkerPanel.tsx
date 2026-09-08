import type { Resource04 } from '../../../spacetimedb/gameplay04/policy';
import type { View04 } from '../../ptr/gameplay04/gameplay04Presentation';

export function estimatedTime04(deadline: bigint, nowMs: number): string {
  const seconds = Math.max(0, Math.ceil(Number(deadline) / 1_000_000 - nowMs / 1000));
  return seconds === 0 ? 'Awaiting Realm update' : `${seconds} s`;
}

export function Keep04WorkerPanel({ view, enabled, nowMs, onRecall, onFindResources }: Readonly<{
  view: View04; enabled: boolean; nowMs: number;
  onRecall: (ordinal: number) => void; onFindResources: (resource: Resource04 | null, workerOrdinal: number) => void;
}>) {
  return <section aria-label="Workers" className="keep04-worker-panel">
    <h2>Workers</h2>
    <p>Choose a resource location in the Greater Realm to send an idle Worker.</p>
    {view.workers.map(worker => <article key={worker.ordinal} aria-label={`Worker ${worker.ordinal + 1}`} className="keep04-card">
      <h3>Worker {worker.ordinal + 1}</h3>
      <p className="keep04-badge">{worker.phase}{worker.resource ? ` · ${worker.resource}` : ''}</p>
      {worker.capturedYield !== null && <p>Gathering rate: {worker.capturedYield.toString()} every 10 seconds</p>}
      {worker.returnsAtMicros !== null && <p>Estimated return time: <span>{estimatedTime04(worker.returnsAtMicros, nowMs)}</span></p>}
      {worker.lastCredited !== null && <p>Last return credited: {worker.lastCredited.toString()} · overflow: {worker.lastOverflow?.toString() ?? '0'}</p>}
      {worker.phase === 'idle'
        ? <button type="button" onClick={() => onFindResources(null, worker.ordinal)}>Find resources for Worker {worker.ordinal + 1}</button>
        : <button type="button" disabled={!enabled || view.atlas === null || worker.phase === 'returning'} onClick={() => onRecall(worker.ordinal)}>Recall Worker {worker.ordinal + 1}</button>}
    </article>)}
    <p>Each expedition keeps the gathering rate it began with. Resources become spendable only after the Realm confirms their return.</p>
  </section>;
}

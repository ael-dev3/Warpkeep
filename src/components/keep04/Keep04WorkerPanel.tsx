import type { Resource04 } from '../../../spacetimedb/gameplay04/policy';
import type { View04 } from '../../ptr/gameplay04/gameplay04Presentation';

const JOURNEY_STAGES04 = ['outbound', 'gathering', 'returning'] as const;
type JourneyStage04 = (typeof JOURNEY_STAGES04)[number];
const JOURNEY_COPY04: Readonly<Record<JourneyStage04, Readonly<{ label: string; detail: string }>>> = Object.freeze({
  outbound: Object.freeze({ label: 'Outbound', detail: 'Travelling to the selected resource location.' }),
  gathering: Object.freeze({ label: 'Gathering', detail: 'The captured rate stays fixed for this journey.' }),
  returning: Object.freeze({ label: 'Returning', detail: 'Resources unlock when the Realm confirms return.' }),
});

function WorkerJourneyRail04({ phase }: Readonly<{ phase: JourneyStage04 }>) {
  const activeIndex = JOURNEY_STAGES04.indexOf(phase);
  return <div className="keep04-journey" aria-label={`Worker journey: ${phase}`}>
    <ol aria-label={`Worker journey: ${phase}`}>
      {JOURNEY_STAGES04.map((stage, index) => {
        const status = index < activeIndex ? 'complete' : index === activeIndex ? 'active' : 'upcoming';
        return <li key={stage} data-stage-status={status} aria-label={`${JOURNEY_COPY04[stage].label} · ${status}`} aria-current={status === 'active' ? 'step' : undefined}>
          <span className="keep04-journey-dot" aria-hidden="true" />
          <span>{JOURNEY_COPY04[stage].label}</span>
        </li>;
      })}
    </ol>
    <p className="keep04-journey-detail">{JOURNEY_COPY04[phase].detail}</p>
  </div>;
}

export function estimatedTime04(deadline: bigint, nowMs: number): string {
  // Realm timestamps are authoritative microseconds and can sit well above
  // Number's safe integer range once the game has been running for a while.
  // Keep the countdown exact, including the final partial second, instead of
  // rounding an epoch-sized bigint through floating point.
  if (!Number.isFinite(nowMs)) return 'Awaiting Realm update';
  const nowMicros = BigInt(Math.max(0, Math.trunc(nowMs))) * 1_000n;
  const remainingMicros = deadline > nowMicros ? deadline - nowMicros : 0n;
  if (remainingMicros === 0n) return 'Awaiting Realm update';
  const seconds = (remainingMicros + 999_999n) / 1_000_000n;
  return `${seconds} s`;
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
      {worker.phase !== 'idle' && <WorkerJourneyRail04 phase={worker.phase} />}
      {worker.capturedYield !== null && <p>Gathering rate: {worker.capturedYield.toString()} every 10 seconds</p>}
      {worker.pendingYield !== null && worker.pendingYield > 0n && worker.resource !== null && <p className="keep04-pending-result" role="status">Reserved result: {worker.pendingYield.toString()} {worker.resource} · pending until the Realm confirms return.</p>}
      {worker.returnsAtMicros !== null && <p>Estimated return time: <span>{estimatedTime04(worker.returnsAtMicros, nowMs)}</span></p>}
      {worker.lastCredited !== null && worker.lastReturnResource !== null && <>
        <p>Last return: {worker.lastCredited.toString()} {worker.lastReturnResource} added</p>
        {worker.lastOverflow !== null && worker.lastOverflow > 0n && <p>{worker.lastOverflow.toString()} {worker.lastReturnResource} could not be stored because the resource limit was reached.</p>}
      </>}
      {worker.phase === 'idle'
        ? <button type="button" onClick={() => onFindResources(null, worker.ordinal)}>Find resources for Worker {worker.ordinal + 1}</button>
        : <button type="button" disabled={!enabled || view.atlas === null || worker.phase === 'returning'} onClick={() => onRecall(worker.ordinal)}>Recall Worker {worker.ordinal + 1}</button>}
    </article>)}
    <p>Each expedition keeps the gathering rate it began with. Resources become spendable only after the Realm confirms their return.</p>
  </section>;
}

import type { View04 } from '../../ptr/gameplay04/gameplay04Presentation';

export const KEEP04_LOOP_STAGES04 = ['gather', 'choose', 'build', 'benefit', 'return'] as const;
export type Keep04LoopStage04 = (typeof KEEP04_LOOP_STAGES04)[number];

const LOOP_COPY04: Readonly<Record<Keep04LoopStage04, Readonly<{ label: string; detail: string }>>> = Object.freeze({
  gather: Object.freeze({ label: 'Gather', detail: 'Send a Worker to bring a resource home.' }),
  choose: Object.freeze({ label: 'Choose', detail: 'Pick the improvement that makes the next return better.' }),
  build: Object.freeze({ label: 'Build', detail: 'Review the site and cost. New benefits begin only after the Realm confirms construction is complete.' }),
  benefit: Object.freeze({ label: 'Benefit', detail: 'Review how this completed improvement strengthens future journeys or construction, then choose what comes next.' }),
  return: Object.freeze({ label: 'Return', detail: 'A Worker’s result is reserved until the Realm confirms the return.' }),
});

export type Keep04LoopSelection04 = Readonly<{
  panel: 'workers' | 'buildings' | null;
  selectedKind: string | null;
  draft: unknown;
}>;

export function keep04LoopDetail04(stage: Keep04LoopStage04): string {
  return LOOP_COPY04[stage].detail;
}

export function activeKeep04LoopStage04(selection: Keep04LoopSelection04, view: View04): Keep04LoopStage04 {
  if (view.workers.some(worker => worker.phase === 'returning')
    || Object.values(view.pending).some(amount => amount > 0n)) return 'return';
  if (view.state.project !== undefined) return 'build';
  if (selection.panel === 'buildings' && selection.selectedKind !== null) {
    return view.buildings.some(building => building.kind === selection.selectedKind && building.phase === 'complete' && building.completedLevel > 0)
      ? 'benefit' : 'build';
  }
  if (selection.panel === 'workers' || view.workers.some(worker => worker.phase === 'outbound' || worker.phase === 'gathering')) return 'gather';
  return 'choose';
}

export function Keep04LoopRail({ stage }: Readonly<{ stage: Keep04LoopStage04 }>) {
  return <section className="keep04-loop-rail" aria-label="Keep loop">
    <div className="keep04-loop-heading"><p className="keep04-eyebrow">THE RETURNING LOOP</p><h2>Make one good decision, then come back to see it work.</h2></div>
    <ol aria-label={`Keep loop: ${LOOP_COPY04[stage].label}`}>
      {KEEP04_LOOP_STAGES04.map(item => {
        // This is a recurring loop, not a checklist of completed actions.
        const status = item === stage ? 'active' : 'neutral';
        return <li key={item} data-stage-status={status} aria-label={status === 'active' ? `${LOOP_COPY04[item].label} · active` : LOOP_COPY04[item].label} aria-current={status === 'active' ? 'step' : undefined}>
          <span className="keep04-loop-dot" aria-hidden="true" />
          <span>{LOOP_COPY04[item].label}</span>
        </li>;
      })}
    </ol>
    <p className="keep04-loop-detail" role="status">{keep04LoopDetail04(stage)}</p>
  </section>;
}

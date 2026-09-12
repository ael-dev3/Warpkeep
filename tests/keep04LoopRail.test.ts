import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { activeKeep04LoopStage04, KEEP04_LOOP_STAGES04, keep04LoopDetail04, Keep04LoopRail } from '../src/components/keep04/Keep04LoopRail';
import { presentState04 } from '../src/ptr/gameplay04/gameplay04Presentation';
import { decodeState04 } from '../src/ptr/gameplay04/gameplay04State';
import { ATLAS04, SCOPE04, assignmentWire04, constructingWire04, freshWire04, wireWithBuilding04 } from './fixtures/gameplay04Client';

afterEach(cleanup);

const viewOf = (wire = freshWire04()) => presentState04(decodeState04(wire, SCOPE04), ATLAS04, 0);
const emptySelection = { panel: null, selectedKind: null, draft: null } as const;

it('keeps the loop order stable and chooses a clear next stage', () => {
  expect(KEEP04_LOOP_STAGES04).toEqual(['gather', 'choose', 'build', 'benefit', 'return']);
  expect(activeKeep04LoopStage04(emptySelection, viewOf())).toBe('choose');
  expect(activeKeep04LoopStage04({ ...emptySelection, panel: 'workers' }, viewOf())).toBe('gather');
  expect(activeKeep04LoopStage04({ ...emptySelection, panel: 'buildings', selectedKind: 'city-mill' }, viewOf())).toBe('build');
});

it('keeps construction at Build until the Realm reports the selected improvement complete', () => {
  const selection = { ...emptySelection, panel: 'buildings', selectedKind: 'city-mill' } as const;
  const constructing = constructingWire04();
  const overdue = presentState04(decodeState04(constructing, SCOPE04), ATLAS04, Number(constructing.project!.completesAtMicros / 1_000n) + 60_000);
  const stage = activeKeep04LoopStage04(selection, overdue);
  expect(stage).toBe('build');
  expect(activeKeep04LoopStage04(emptySelection, overdue)).toBe('build');
  render(createElement(Keep04LoopRail, { stage }));
  expect(screen.getByRole('listitem', { name: 'Build · active' })).toHaveAttribute('aria-current', 'step');
  expect(screen.getByRole('status')).toHaveTextContent('Realm confirms construction is complete');

  const completed = viewOf(wireWithBuilding04());
  expect(activeKeep04LoopStage04(selection, completed)).toBe('benefit');
  expect(activeKeep04LoopStage04({ ...selection, selectedKind: 'lumber-camp' }, completed)).toBe('build');
  expect(activeKeep04LoopStage04(emptySelection, completed)).toBe('choose');
  expect(keep04LoopDetail04('benefit')).toContain('completed improvement');
});

it.each([
  ['returning', 0n],
  ['gathering', 10n],
] as const)('prioritizes %s resource return over simultaneous construction', (phase, earned) => {
  const wire = constructingWire04();
  wire.workers[0].assignmentRevision = 1n;
  wire.workers[0].assignment = { ...assignmentWire04(), phase, earned,
    ...(phase === 'returning' ? { recalledAt: 1_000_000n, gatheringStopsAt: 1_000_000n, returnsAt: 2_000_000n } : {}) };
  expect(activeKeep04LoopStage04(emptySelection, viewOf(wire))).toBe('return');
});

it('shows the recurring loop without claiming earlier actions completed on a first Worker return', () => {
  const wire = freshWire04();
  wire.workers[0].assignmentRevision = 1n;
  wire.workers[0].assignment = { ...assignmentWire04(), phase: 'returning', earned: 60n };
  const stage = activeKeep04LoopStage04(emptySelection, viewOf(wire));
  expect(stage).toBe('return');
  render(createElement(Keep04LoopRail, { stage }));
  const steps = within(screen.getByRole('list', { name: 'Keep loop: Return' })).getAllByRole('listitem');
  for (const step of steps.slice(0, -1)) {
    expect(step).toHaveAttribute('data-stage-status', 'neutral');
    expect(step).not.toHaveAttribute('aria-current');
    expect(step).not.toHaveAccessibleName(/complete|upcoming/);
  }
  expect(steps.at(-1)).toHaveAttribute('aria-current', 'step');
});

it('keeps the return message accurate before a Worker is visibly returning', () => {
  expect(keep04LoopDetail04('return')).toContain('Realm confirms');
  expect(keep04LoopDetail04('return')).not.toContain('on the way home');
});

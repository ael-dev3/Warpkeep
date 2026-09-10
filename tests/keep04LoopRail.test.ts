import { expect, it } from 'vitest';
import { activeKeep04LoopStage04, KEEP04_LOOP_STAGES04, keep04LoopDetail04 } from '../src/components/keep04/Keep04LoopRail';
import { presentState04 } from '../src/ptr/gameplay04/gameplay04Presentation';
import { decodeState04 } from '../src/ptr/gameplay04/gameplay04State';
import { ATLAS04, SCOPE04, assignmentWire04, constructingWire04, freshWire04 } from './fixtures/gameplay04Client';

const viewOf = (wire = freshWire04()) => presentState04(decodeState04(wire, SCOPE04), ATLAS04, 0);
const emptySelection = { panel: null, selectedKind: null, draft: null } as const;

it('keeps the loop order stable and chooses a clear next stage', () => {
  expect(KEEP04_LOOP_STAGES04).toEqual(['gather', 'choose', 'build', 'benefit', 'return']);
  expect(activeKeep04LoopStage04(emptySelection, viewOf())).toBe('choose');
  expect(activeKeep04LoopStage04({ ...emptySelection, panel: 'workers' }, viewOf())).toBe('gather');
  expect(activeKeep04LoopStage04({ ...emptySelection, panel: 'buildings', selectedKind: 'city-mill' }, viewOf())).toBe('build');
});

it('prioritizes a returning resource and explains an active construction benefit', () => {
  const returning = freshWire04();
  returning.workers[0].assignmentRevision = 1n;
  returning.workers[0].assignment = { ...assignmentWire04(), phase: 'returning', earned: 60n };
  expect(activeKeep04LoopStage04(emptySelection, viewOf(returning))).toBe('return');

  expect(activeKeep04LoopStage04(emptySelection, viewOf(constructingWire04()))).toBe('benefit');
});

it('keeps the return message accurate before a Worker is visibly returning', () => {
  expect(keep04LoopDetail04('return')).toContain('Realm confirms');
  expect(keep04LoopDetail04('return')).not.toContain('on the way home');
});

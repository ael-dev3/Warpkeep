import { expect, it } from 'vitest';
import { keep04NextStep04 } from '../src/components/keep04/keep04NextStep';
import { decodeState04 } from '../src/ptr/gameplay04/gameplay04State';
import { presentState04 } from '../src/ptr/gameplay04/gameplay04Presentation';
import { ATLAS04, SCOPE04, assignmentWire04, constructingWire04, freshWire04, wireWithBuilding04 } from './fixtures/gameplay04Client';

type Wire = ReturnType<typeof freshWire04>;
const view = (wire: Wire) => presentState04(decodeState04(wire, SCOPE04), ATLAS04, 0);
const returning = () => ({ ...assignmentWire04(), phase: 'returning', earned: 60n });

it('suggests building the lowest affordable improvement when the Builder is free', () => {
  const wire = freshWire04(); Object.assign(wire, { food: 100n, wood: 100n, stone: 100n });
  const step = keep04NextStep04(view(wire), 0);
  expect(step).toMatchObject({ kind: 'build', building: 'city-mill', title: 'City Mill level 1 is ready to build' });
});

it('names the uncovered shortage for the next improvement and the idle Worker who can fetch it', () => {
  const wire = freshWire04(); Object.assign(wire, { food: 20n, wood: 10n, stone: 20n });
  const step = keep04NextStep04(view(wire), 0);
  expect(step).toMatchObject({ kind: 'gather', resource: 'wood', workerOrdinal: 0, title: 'Gather wood for City Mill level 1' });
  expect(step?.detail).toMatch(/^30 more wood is needed/);
});

it('counts Workers already returning before asking for more, and waits when they cover the cost', () => {
  const wire = freshWire04(); Object.assign(wire, { food: 0n, wood: 40n, stone: 20n });
  wire.workers[0].assignmentRevision = 1n; wire.workers[0].assignment = returning();
  // 60 food is on its way home; the City Mill needs 20, so food is covered.
  expect(keep04NextStep04(view(wire), 0)).toMatchObject({ kind: 'wait', title: 'City Mill level 1 is covered by returning Workers' });
});

it('keeps idle Workers busy while the Builder works, then reports completion time when everyone is out', () => {
  const wire = constructingWire04();
  // The Mill is underway, so idle Workers start on the next improvement.
  expect(keep04NextStep04(view(wire), 0)).toMatchObject({ kind: 'gather', title: expect.stringMatching(/for Lumber Camp level 1$/) });
  Object.assign(wire, { food: 1000n, wood: 1000n, stone: 1000n, gold: 1000n });
  expect(keep04NextStep04(view(wire), 0)).toMatchObject({ kind: 'gather', title: expect.stringMatching(/while the Builder works$/) });
  for (const worker of wire.workers) { worker.assignmentRevision = 1n; worker.assignment = returning(); }
  const waiting = keep04NextStep04(view(wire), 60_000);
  expect(waiting).toMatchObject({ kind: 'wait', title: 'City Mill level 1 is underway' });
  expect(waiting?.detail).toMatch(/^Estimated completion in /);
});

it('says when the next Worker comes home once nothing else can be done', () => {
  const wire = wireWithBuilding04('city-mill', 5);
  for (const level of ['lumberCamp', 'stoneworks', 'goldworks', 'barracks', 'cathedral'] as const) wire.completedLevels[level] = 0;
  for (const worker of wire.workers) { worker.assignmentRevision = 1n; worker.assignment = { ...assignmentWire04() }; }
  const step = keep04NextStep04(view(wire), 30_000);
  expect(step).toMatchObject({ kind: 'wait', title: 'Worker 1 is bringing food home' });
  expect(step?.detail).toMatch(/Estimated return in/);
});

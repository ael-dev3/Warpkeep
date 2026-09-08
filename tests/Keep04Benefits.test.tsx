import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { buildingCost04, buildingDuration04 } from '../spacetimedb/gameplay04/policy';
import { Keep04BuildingPanel } from '../src/components/keep04/Keep04BuildingPanel';
import { decodeState04 } from '../src/ptr/gameplay04/gameplay04State';
import { presentState04 } from '../src/ptr/gameplay04/gameplay04Presentation';
import { ATLAS04, SCOPE04, freshWire04, constructingWire04, wireWithBuilding04 } from './fixtures/gameplay04Client';
afterEach(cleanup);
it('shows exact six building costs, deficits, duration and completed-only current/next effects', () => {
  const view = presentState04(decodeState04(freshWire04(), SCOPE04), ATLAS04, Date.now());
  render(<Keep04BuildingPanel view={view} selectedKind={null} draft={null} enabled problem="none"
    onSelect={vi.fn()} onConfirm={vi.fn()} onCancelDraft={vi.fn()} onFindResources={vi.fn()} />);
  const cases = [
    ['City Mill', 'food 20 · wood 40 · stone 20', 'Food every 10 seconds', 'Current: 10 → Next: 12'],
    ['Lumber Camp', 'food 20 · wood 20 · stone 40', 'Wood every 10 seconds', 'Current: 10 → Next: 12'],
    ['City Stoneworks', 'food 40 · wood 20 · stone 20', 'Stone every 10 seconds', 'Current: 10 → Next: 12'],
    ['City Goldworks', 'food 40 · wood 60 · stone 40 · gold 20', 'Gold every 10 seconds', 'Current: 10 → Next: 12'],
    ['City Barracks', 'food 60 · wood 80 · stone 80 · gold 40', 'Travel time per edge', 'Current: 2 s → Next: 1.9 s'],
    ['Grand Covenant Cathedral', 'food 80 · wood 100 · stone 120 · gold 60', 'Future level-one build duration', 'Current: 120 s → Next: 114 s'],
  ];
  for (const [name, cost, effect, value] of cases) {
    const row = within(screen.getByRole('article', { name }));
    expect(row.getByText(`Cost: ${cost}`)).toBeVisible(); expect(row.getByText(`Missing: ${cost}`)).toBeVisible();
    expect(row.getByText('Build duration: 120 s')).toBeVisible();
    expect(row.getByText(effect)).toBeVisible(); expect(row.getByText(value)).toBeVisible();
  }
  expect(screen.getByText(/each expedition keeps the gathering rate it began with/i)).toBeVisible();
  expect(document.body.textContent).not.toMatch(/combat|faith|G001|discount/i);
});

it('shows only outstanding spendable shortages and updates readiness after resources arrive', () => {
  const wire = freshWire04(); Object.assign(wire, { food: 20n, wood: 30n, stone: 20n });
  const props = { selectedKind: null, draft: null, enabled: true, problem: 'none' as const,
    onSelect: vi.fn(), onConfirm: vi.fn(), onCancelDraft: vi.fn(), onFindResources: vi.fn() };
  const view = () => presentState04(decodeState04(wire, SCOPE04), ATLAS04, Date.now());
  const rendered = render(<Keep04BuildingPanel {...props} view={view()} />);
  const mill = within(screen.getByRole('article', { name: 'City Mill' }));
  expect(mill.getByText('Not built')).toBeVisible();
  expect(mill.getByText('Missing: wood 10')).toBeVisible();
  expect(mill.getByRole('button', { name: 'Find wood' })).toBeVisible();
  wire.wood = 40n; wire.revision += 1n;
  rendered.rerender(<Keep04BuildingPanel {...props} view={view()} />);
  expect(mill.getByText('Resources ready')).toBeVisible();
  expect(mill.queryByText(/^Missing:/)).not.toBeInTheDocument();
  expect(mill.queryByRole('button', { name: /^Find / })).not.toBeInTheDocument();
});

it('distinguishes first construction from an unbuilt site without granting its benefit early', () => {
  const view = presentState04(decodeState04(constructingWire04(), SCOPE04), ATLAS04, Date.now());
  render(<Keep04BuildingPanel view={view} selectedKind={null} draft={null} enabled problem="none"
    onSelect={vi.fn()} onConfirm={vi.fn()} onCancelDraft={vi.fn()} onFindResources={vi.fn()} />);
  const mill = within(screen.getByRole('article', { name: 'City Mill' }));
  expect(mill.getByText('Under construction')).toBeVisible();
  expect(mill.getByText('Current: 10 → On completion: 12')).toBeVisible();
  expect(within(screen.getByRole('article', { name: 'Lumber Camp' })).getByText('Not built')).toBeVisible();
});

it.each([0, 1])('shows committed construction rather than another upgrade at completed level %i', level => {
  const wire = level === 0 ? constructingWire04() : wireWithBuilding04('city-mill', level);
  if (level > 0) {
    const duration = buildingDuration04(level + 1, { 'city-mill': level, 'lumber-camp': 0, 'city-stoneworks': 0, 'city-goldworks': 0, 'city-barracks': 0, 'grand-covenant-cathedral': 0 });
    wire.buildings[0].revision = BigInt(level + 1);
    wire.project = { kind: 'city-mill', projectRevision: BigInt(level + 1), targetLevel: level + 1, startedAtMicros: 5n,
      completesAtMicros: 5n + duration, cost: buildingCost04('city-mill', level + 1), durationMicros: duration };
  }
  const props = { selectedKind: 'city-mill' as const, draft: null, enabled: true, problem: 'none' as const,
    onSelect: vi.fn(), onConfirm: vi.fn(), onCancelDraft: vi.fn(), onFindResources: vi.fn() };
  const view = () => presentState04(decodeState04(wire, SCOPE04), ATLAS04, Date.now());
  const rendered = render(<Keep04BuildingPanel {...props} view={view()} />);
  expect(screen.getByRole('heading', { name: 'Construction underway · City Mill' })).toBeVisible();
  const mill = within(screen.getByRole('article', { name: 'City Mill' }));
  expect(mill.getByText(`Building level ${level + 1}`)).toBeVisible();
  expect(mill.queryByText(/Cost:|Missing:|Resources ready|Build duration:/)).not.toBeInTheDocument();
  expect(mill.queryByRole('button', { name: /^Find / })).not.toBeInTheDocument();
  expect(screen.getByText('Resources for this construction are already committed.')).toBeVisible();
  expect(screen.queryByRole('button', { name: /Confirm upgrade|Confirm placement|Review updated costs/ })).not.toBeInTheDocument();
  // A later clock alone must not invent completion or restore spending controls.
  rendered.rerender(<Keep04BuildingPanel {...props} view={view()} problem="reconfirm" />);
  expect(screen.queryByRole('button', { name: /Confirm|Review updated costs/ })).not.toBeInTheDocument();
  expect(props.onConfirm).not.toHaveBeenCalled();
  const completed = wireWithBuilding04('city-mill', level + 1); completed.revision = wire.revision + 1n;
  rendered.rerender(<Keep04BuildingPanel {...props} view={presentState04(decodeState04(completed, SCOPE04), ATLAS04, Date.now())} />);
  expect(screen.getByRole('heading', { name: 'Upgrade City Mill' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Confirm upgrade' })).toBeDisabled();
  expect(within(screen.getByRole('article', { name: 'City Mill' })).getByText(/^Cost:/)).toBeVisible();
});

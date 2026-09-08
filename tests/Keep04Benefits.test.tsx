import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Keep04BuildingPanel } from '../src/components/keep04/Keep04BuildingPanel';
import { decodeState04 } from '../src/ptr/gameplay04/gameplay04State';
import { presentState04 } from '../src/ptr/gameplay04/gameplay04Presentation';
import { ATLAS04, SCOPE04, freshWire04 } from './fixtures/gameplay04Client';
afterEach(cleanup);
it('shows exact six building costs, deficits, duration and completed-only current/next effects', () => {
  const view = presentState04(decodeState04(freshWire04(), SCOPE04), ATLAS04, Date.now());
  render(<Keep04BuildingPanel view={view} selectedKind={null} draft={null} enabled problem="none"
    onSelect={vi.fn()} onConfirm={vi.fn()} onCancelDraft={vi.fn()} onFindResources={vi.fn()} />);
  const cases = [
    ['City Mill', 'food 20 · wood 40 · stone 20 · gold 0', 'Food every 10 seconds', 'Current: 10 → Next: 12'],
    ['Lumber Camp', 'food 20 · wood 20 · stone 40 · gold 0', 'Wood every 10 seconds', 'Current: 10 → Next: 12'],
    ['City Stoneworks', 'food 40 · wood 20 · stone 20 · gold 0', 'Stone every 10 seconds', 'Current: 10 → Next: 12'],
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

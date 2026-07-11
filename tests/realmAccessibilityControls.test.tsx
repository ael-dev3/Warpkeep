import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealmAccessibilityControls } from '../src/components/realm/RealmAccessibilityControls';
import { createRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';
import { HEGEMONY_GENESIS_001 } from '../src/game/map/realmSeed';

afterEach(cleanup);

describe('RealmAccessibilityControls', () => {
  it('keeps the 61-cell navigator compact and excludes the visual apron', () => {
    const surface = createRealmTerrainSurface(HEGEMONY_GENESIS_001);
    const onHover = vi.fn();
    const onSelect = vi.fn();
    const { container } = render(
      <RealmAccessibilityControls
        cells={surface.playableMap.cells}
        selectedCoord={{ q: 0, r: 0 }}
        onHover={onHover}
        onSelect={onSelect}
      />
    );

    const details = container.querySelector('details.realm-cell-navigator');
    expect(details).not.toBeNull();
    expect(details?.hasAttribute('open')).toBe(false);

    const summary = details?.querySelector('summary');
    if (!(summary instanceof HTMLElement)) throw new Error('missing Realm cell navigator summary');
    expect(summary.textContent).toMatch(/Realm Cells\s+61/i);
    fireEvent.click(summary);
    expect(details?.hasAttribute('open')).toBe(true);
    const group = screen.getByRole('group', { name: 'Playable realm cells' });
    expect(within(group).getAllByRole('button', { name: /Select cell/i })).toHaveLength(61);
    expect(within(group).queryByRole('button', { name: 'Select cell 5,0' })).toBeNull();

    const keep = within(group).getByRole('button', {
      name: 'Select cell 0,0, your Hegemony keep'
    });
    expect(keep.getAttribute('aria-pressed')).toBe('true');
    fireEvent.focus(keep);
    fireEvent.click(within(group).getByRole('button', { name: 'Select cell 1,0' }));

    expect(onHover).toHaveBeenCalledWith({ q: 0, r: 0 });
    expect(onSelect).toHaveBeenCalledWith({ q: 1, r: 0 });
  });
});

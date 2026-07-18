import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GoldMineInspectionPanel } from '../src/components/realm/GoldMineInspectionPanel';

afterEach(() => {
  cleanup();
});

describe('GoldMineInspectionPanel', () => {
  it('presents a focus-safe, decorative Gold Mine record without inventing gameplay authority', async () => {
    const escaped = vi.fn();
    const onRequestClose = vi.fn();
    const focusTargetRef = createRef<HTMLButtonElement>();
    const { container } = render(
      <div onKeyDown={(event) => event.key === 'Escape' && escaped()}>
        <GoldMineInspectionPanel
          id="gold-mine-record"
          mine={{ name: 'Gold Mine', tier: 1 }}
          onRequestClose={onRequestClose}
          focusTargetRef={focusTargetRef}
        />
      </div>
    );

    const dialog = screen.getByRole('dialog', { name: 'Gold Mine' });
    expect(dialog.id).toBe('gold-mine-record');
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    expect(dialog.getAttribute('aria-labelledby')).toBe('gold-mine-record-title');
    expect(dialog.getAttribute('aria-describedby')).toBe('gold-mine-record-description');
    expect(screen.getByText('TIER 1 GATHERING SITE')).not.toBeNull();
    expect(screen.getByText('Resource').nextElementSibling?.textContent).toBe('Gold');
    expect(screen.getByText('Node tier').nextElementSibling?.textContent).toBe('1');

    const heroArt = container.querySelector<HTMLImageElement>(
      '.gold-mine-inspection__hero-art'
    );
    expect(heroArt).not.toBeNull();
    expect(heroArt?.getAttribute('alt')).toBe('');
    expect(heroArt?.getAttribute('aria-hidden')).toBe('true');
    expect(heroArt?.getAttribute('decoding')).toBe('async');
    expect(heroArt?.getAttribute('draggable')).toBe('false');
    expect(heroArt?.getAttribute('width')).toBe('1254');
    expect(heroArt?.getAttribute('height')).toBe('1254');
    expect(heroArt?.getAttribute('src')).toBe('/images/realm/hegemony-gold-mine-record.webp');

    const close = screen.getByRole('button', { name: 'CLOSE GOLD MINE RECORD' });
    await waitFor(() => expect(document.activeElement).toBe(close));
    expect(focusTargetRef.current).toBe(close);
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(escaped).toHaveBeenCalledOnce();
    fireEvent.click(close);
    expect(onRequestClose).toHaveBeenCalledOnce();

    expect(screen.queryByRole('button', { name: /gather/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(
      /Reserves|Owner|Balance|Reward|Marks|Wallet|Durability|Destroy|Health|Alliance|\bStatus\b/i
    );
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StoneQuarryInspectionPanel } from '../src/components/realm/StoneQuarryInspectionPanel';

afterEach(() => {
  cleanup();
});

describe('StoneQuarryInspectionPanel', () => {
  it('presents a focus-safe high-resolution visual record without inventing a Stone site', async () => {
    const escaped = vi.fn();
    const onRequestClose = vi.fn();
    const focusTargetRef = createRef<HTMLButtonElement>();
    const { container } = render(
      <div onKeyDown={(event) => event.key === 'Escape' && escaped()}>
        <StoneQuarryInspectionPanel
          id="stone-quarry-record"
          onRequestClose={onRequestClose}
          focusTargetRef={focusTargetRef}
        />
      </div>
    );

    const dialog = screen.getByRole('dialog', { name: 'Stone Quarry' });
    expect(dialog.id).toBe('stone-quarry-record');
    expect(dialog.className).toContain('stone-quarry-inspection');
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    expect(dialog.getAttribute('aria-labelledby')).toBe('stone-quarry-record-title');
    expect(dialog.getAttribute('aria-describedby')).toBe('stone-quarry-record-description');
    expect(screen.getByText('VISUAL REFERENCE')).not.toBeNull();
    expect(screen.getByText('Resource').nextElementSibling?.textContent).toBe('Stone');
    expect(screen.getByText('Record state').nextElementSibling?.textContent).toBe('Asset staged');
    expect(screen.getByText('Realm site').nextElementSibling?.textContent).toBe('Not integrated');

    const art = container.querySelector<HTMLImageElement>('.stone-quarry-inspection__hero-art');
    expect(art?.getAttribute('src')).toBe('/images/realm/hegemony-stone-quarry-record.webp');
    expect(art?.getAttribute('alt')).toBe('');
    expect(art?.getAttribute('aria-hidden')).toBe('true');
    expect(art?.getAttribute('decoding')).toBe('async');
    expect(art?.getAttribute('draggable')).toBe('false');
    expect(art?.getAttribute('width')).toBe('1254');
    expect(art?.getAttribute('height')).toBe('1254');

    const close = screen.getByRole('button', { name: 'CLOSE STONE QUARRY RECORD' });
    await waitFor(() => expect(document.activeElement).toBe(close));
    expect(focusTargetRef.current).toBe(close);
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(escaped).toHaveBeenCalledOnce();
    fireEvent.click(close);
    expect(onRequestClose).toHaveBeenCalledOnce();

    expect(screen.queryByRole('button', { name: /dispatch|claim|gather/i })).toBeNull();
    expect(document.body.textContent).toContain('does not create a map placement');
    expect(document.body.textContent).not.toMatch(
      /Inventory|Reserve|Owner|Wallet|Durability|Destroy|Health|Alliance/i
    );
  });
});

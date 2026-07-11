import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealmMapScreen } from '../src/components/realm/RealmMapScreen';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RealmMapScreen', () => {
  it('provides a deterministic accessible lowlands fallback when WebGL is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(<RealmMapScreen onRequestReturn={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Hegemony Lowlands' })).not.toBeNull();
    expect(screen.getByText(/91 deterministic pointy-top cells/i)).not.toBeNull();
    expect(screen.getByText(/WebGL terrain preview is unavailable/i)).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Return to Menu' })).not.toBeNull();
    expect(screen.getAllByRole('button', { name: /Select cell/i })).toHaveLength(91);
    expect(screen.getByTestId('realm-keep-marker')).not.toBeNull();
  });

  it('keeps placement local to the realm screen and moves the visible landmark to a selected cell', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(<RealmMapScreen onRequestReturn={vi.fn()} />);
    const selector = screen.getByRole('group', { name: 'Realm cells' });

    expect(screen.getByText(/Frontier Keep established here/i)).not.toBeNull();
    fireEvent.click(within(selector).getByRole('button', { name: 'Select cell 1,0' }));

    expect(screen.getByText('Selected: 1, 0')).not.toBeNull();
    expect(screen.getByText(/Available for the Frontier Keep/i)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Place Frontier Keep' }));

    expect(screen.getByText('Position: 1, 0')).not.toBeNull();
    expect(screen.getByText(/Frontier Keep established here/i)).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Keep Established' })).toHaveProperty('disabled', true);
  });

  it('returns focus to the realm after cell selection so arrow navigation works from the map interaction path', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(<RealmMapScreen onRequestReturn={vi.fn()} />);
    const realm = screen.getByRole('main');
    const selector = screen.getByRole('group', { name: 'Realm cells' });

    fireEvent.click(within(selector).getByRole('button', { name: 'Select cell 0,0, Frontier Keep' }));
    expect(document.activeElement).toBe(realm);

    fireEvent.keyDown(realm, { key: 'ArrowRight' });
    expect(screen.getByText('Selected: 1, 0')).not.toBeNull();
  });

  it('returns on Escape even when focus is not on a realm control', () => {
    const onRequestReturn = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(<RealmMapScreen onRequestReturn={onRequestReturn} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onRequestReturn).toHaveBeenCalledTimes(1);
  });

  it('keeps a visible return action functional', () => {
    const onRequestReturn = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(<RealmMapScreen onRequestReturn={onRequestReturn} />);

    fireEvent.click(screen.getByRole('button', { name: 'Return to Menu' }));
    expect(onRequestReturn).toHaveBeenCalledTimes(1);
  });
});

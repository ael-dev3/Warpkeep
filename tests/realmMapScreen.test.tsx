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
    expect(screen.getByText(/19 deterministic pointy-top cells/i)).not.toBeNull();
    expect(screen.getByText(/WebGL terrain preview is unavailable/i)).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Return to Menu' })).not.toBeNull();
    expect(screen.getAllByRole('button', { name: /Select cell/i })).toHaveLength(19);
  });

  it('keeps selection separate from terrain data and exposes compact cell information', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(<RealmMapScreen onRequestReturn={vi.fn()} />);
    const selector = screen.getByRole('group', { name: 'Realm cells' });

    fireEvent.click(within(selector).getByRole('button', { name: 'Select cell 0,0' }));

    expect(screen.getByText('Coordinates: 0, 0')).not.toBeNull();
    expect(screen.getByText(/No structure assigned/i)).not.toBeNull();
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

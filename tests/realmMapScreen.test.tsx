import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealmMapScreen } from '../src/components/realm/RealmMapScreen';
import type { RealmIdentity } from '../src/components/realm/realmTypes';

const VERIFIED_REALM_IDENTITY: RealmIdentity = Object.freeze({
  fid: 12_345,
  username: 'warpkeeper',
  displayName: 'Warp Keeper'
});

function renderFallbackRealm(identity: RealmIdentity = VERIFIED_REALM_IDENTITY) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  return render(
    <RealmMapScreen
      identity={identity}
      onRequestReturn={vi.fn()}
    />
  );
}

function openPlayableCellNavigator() {
  const toggle = document.querySelector('details.realm-cell-navigator > summary');
  if (!(toggle instanceof HTMLElement)) throw new Error('missing compact Realm cell navigator');
  expect(toggle.textContent).toMatch(/Realm Cells\s+61/i);
  fireEvent.click(toggle);
  return screen.getByRole('group', { name: 'Playable realm cells' });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RealmMapScreen', () => {
  it('renders 61 playable cells inside a continuous 91-cell fallback surface', () => {
    const { container } = renderFallbackRealm();

    expect(screen.getByRole('heading', { level: 1, name: '@warpkeeper Keep' })).not.toBeNull();
    const fallback = screen.getByTestId('realm-static-fallback');
    expect(fallback.textContent).toMatch(/61 playable cells/i);
    expect(fallback.textContent).toMatch(/91 rendered/i);
    expect(container.querySelectorAll('.realm-map-screen__fallback-map polygon')).toHaveLength(91);
    expect(screen.getByTestId('realm-keep-marker')).not.toBeNull();

    const navigator = container.querySelector('details.realm-cell-navigator');
    expect(navigator).not.toBeNull();
    expect(navigator?.hasAttribute('open')).toBe(false);
    const selector = openPlayableCellNavigator();
    expect(within(selector).getAllByRole('button', { name: /Select cell/i })).toHaveLength(61);
    expect(within(selector).queryByRole('button', { name: 'Select cell 5,0' })).toBeNull();
  });

  it('keeps the session-bound first keep fixed at the center while other cells are selected', () => {
    renderFallbackRealm();
    const selector = openPlayableCellNavigator();
    const marker = screen.getByTestId('realm-keep-marker');
    const centerTransform = marker.getAttribute('transform');

    expect(screen.queryByRole('button', { name: /Place Frontier Keep/i })).toBeNull();
    fireEvent.click(within(selector).getByRole('button', { name: 'Select cell 1,0' }));

    expect(screen.getByText('Cell 1, 0')).not.toBeNull();
    expect(marker.getAttribute('transform')).toBe(centerTransform);
    expect(screen.getByText(/Olive grass/i)).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Select your Hegemony keep' }));
    expect(screen.getByText('Cell 0, 0')).not.toBeNull();
    expect(screen.getByText(/Session-bound prototype/i)).not.toBeNull();
    expect(marker.getAttribute('transform')).toBe(centerTransform);
  });

  it('uses a proof-free verified identity and falls back to an FID keep name', () => {
    renderFallbackRealm(Object.freeze({ fid: 98_765 }));

    expect(screen.getByRole('heading', { level: 1, name: 'FID 98765 Keep' })).not.toBeNull();
    expect(screen.getByText('FID 98765')).not.toBeNull();
    expect(screen.getByText('LEVEL 1')).not.toBeNull();
  });

  it('returns focus to the realm after compact navigator selection so arrow navigation works', () => {
    renderFallbackRealm();
    const realm = screen.getByRole('main');
    const selector = openPlayableCellNavigator();

    fireEvent.click(within(selector).getByRole('button', {
      name: 'Select cell 0,0, your Hegemony keep'
    }));
    expect(document.activeElement).toBe(realm);

    fireEvent.keyDown(realm, { key: 'ArrowRight' });
    expect(screen.getByText('Cell 1, 0')).not.toBeNull();
  });

  it('provides visible Return and Recenter actions and returns on Escape', () => {
    const onRequestReturn = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(
      <RealmMapScreen
        identity={VERIFIED_REALM_IDENTITY}
        onRequestReturn={onRequestReturn}
      />
    );

    expect(screen.getByRole('button', { name: 'Recenter Keep' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Return to Menu' }));
    expect(onRequestReturn).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onRequestReturn).toHaveBeenCalledTimes(2);
  });
});

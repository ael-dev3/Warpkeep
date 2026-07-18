import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createWarpkeepBuildInfo } from '../src/build/buildInfo';
import { WarpkeepMainMenu } from '../src/components/menu/WarpkeepMainMenu';

const FULL_SHA = 'abcdef0123456789abcdef0123456789abcdef01';
const deployedBuild = createWarpkeepBuildInfo({
  productVersion: '0.2.0',
  releaseChannel: 'alpha',
  buildSha: FULL_SHA,
  repositoryUrl: 'https://github.com/ael-dev3/Warpkeep'
});

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Warpkeep menu build stamp', () => {
  it('renders the Alpha version as the patch-notes disclosure and keeps exact build provenance separate', () => {
    const { container } = render(
      <WarpkeepMainMenu
        active
        buildInfo={deployedBuild}
        onRequestReturn={vi.fn()}
      />
    );

    const stamp = container.querySelector('[data-build-stamp="commit"]');
    const patchNotes = screen.getByRole('button', {
      name: 'Open patch notes for Warpkeep ALPHA 0.2.0'
    });
    const buildLink = screen.getByRole('link', {
      name: 'Open Warpkeep ALPHA 0.2.0 build abcdef0 on GitHub'
    });
    expect(stamp?.textContent).toBe('ALPHA 0.2.0 · BUILD abcdef0');
    expect(patchNotes.getAttribute('aria-controls')).toBe('warpkeep-latest-patch-notes');
    expect(patchNotes.getAttribute('aria-expanded')).toBe('false');
    expect(buildLink.getAttribute('href')).toBe(`https://github.com/ael-dev3/Warpkeep/commit/${FULL_SHA}`);
    expect(buildLink.getAttribute('target')).toBe('_blank');
    expect(buildLink.getAttribute('rel')).toContain('noopener');
    expect(buildLink.getAttribute('rel')).toContain('noreferrer');
    expect(buildLink.getAttribute('referrerpolicy')).toBe('no-referrer');

    fireEvent.click(patchNotes);
    expect(patchNotes.getAttribute('aria-expanded')).toBe('true');
    expect(patchNotes.getAttribute('aria-label')).toBe(
      'Close patch notes for Warpkeep ALPHA 0.2.0'
    );
    const notes = screen.getByRole('region', { name: 'NOTES UNAVAILABLE' });
    buildLink.focus();
    expect(screen.getByRole('region', { name: 'NOTES UNAVAILABLE' })).toBe(notes);
  });

  it('keeps local provenance as text while the Alpha version still opens patch notes', () => {
    const localBuild = createWarpkeepBuildInfo({ productVersion: '0.2.0' });
    const { container } = render(
      <WarpkeepMainMenu
        active
        buildInfo={localBuild}
        onRequestReturn={vi.fn()}
      />
    );

    const stamp = container.querySelector('[data-build-stamp="local"]');
    expect(stamp?.textContent).toBe('ALPHA 0.2.0 · LOCAL');
    expect(within(stamp as HTMLElement).queryByRole('link')).toBeNull();
    expect(within(stamp as HTMLElement).getByText('LOCAL')).not.toBeNull();
    expect(screen.queryByRole('link', { name: /Open Warpkeep Alpha 0\.2\.0 build/i })).toBeNull();
  });

  it('reserves a safe mobile footer position and removes the stamp from the auth rail', () => {
    const callbacks = {
      begin: vi.fn(),
      cancel: vi.fn(),
      retry: vi.fn(),
      signOut: vi.fn(),
      enterRealm: vi.fn()
    };
    render(
      <WarpkeepMainMenu
        active
        buildInfo={deployedBuild}
        onCancelFarcasterSignIn={callbacks.cancel}
        onRequestAuthenticatedRealm={callbacks.enterRealm}
        onRequestFarcasterSignIn={callbacks.begin}
        onRequestReturn={vi.fn()}
        onRetryFarcasterSignIn={callbacks.retry}
        onSignOut={callbacks.signOut}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    expect(callbacks.begin).not.toHaveBeenCalled();
    const continueButton = screen.getByRole('button', { name: 'CONTINUE TO SIGN-IN' });
    expect((continueButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', {
      name: 'I have read and agree to the Alpha Terms and Hegemony Social Contract.'
    }));
    fireEvent.click(continueButton);

    expect(callbacks.begin).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('ALPHA 0.2.0 · BUILD abcdef0')).toBeNull();

    const css = readFileSync(
      resolve(process.cwd(), 'src/components/menu/WarpkeepMainMenu.css'),
      'utf8'
    );
    expect(css).toContain('@media (orientation: portrait)');
    expect(css).toMatch(/\.warpkeep-menu-build-stamp \{[\s\S]*safe-area-inset-right/);
    expect(css).toMatch(/\.warpkeep-menu-build-stamp \{[\s\S]*safe-area-inset-bottom/);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  it('renders exact deployed-build copy as a hardened semantic GitHub link', () => {
    render(
      <WarpkeepMainMenu
        active
        buildInfo={deployedBuild}
        onRequestReturn={vi.fn()}
      />
    );

    const stamp = screen.getByRole('link', {
      name: 'Open Warpkeep ALPHA 0.2.0 build abcdef0 on GitHub'
    });
    expect(stamp.textContent).toBe('ALPHA 0.2.0 · BUILD abcdef0');
    expect(stamp.getAttribute('href')).toBe(`https://github.com/ael-dev3/Warpkeep/commit/${FULL_SHA}`);
    expect(stamp.getAttribute('target')).toBe('_blank');
    expect(stamp.getAttribute('rel')).toContain('noopener');
    expect(stamp.getAttribute('rel')).toContain('noreferrer');
    expect(stamp.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('renders a local build as text instead of a link', () => {
    const localBuild = createWarpkeepBuildInfo({ productVersion: '0.2.0' });
    render(
      <WarpkeepMainMenu
        active
        buildInfo={localBuild}
        onRequestReturn={vi.fn()}
      />
    );

    expect(screen.getByText('ALPHA 0.2.0 · LOCAL').getAttribute('data-build-stamp')).toBe('local');
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
      name: 'I understand and agree to these Alpha Terms.'
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

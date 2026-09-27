import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { WarpkeepMainMenu } from '../src/components/menu/WarpkeepMainMenu';

afterEach(cleanup);

describe('Warpkeep main-menu scene slot', () => {
  it('mounts the live world behind the noninteractive grade and menu controls', () => {
    const { container } = render(
      <WarpkeepMainMenu active scene={<div data-testid="live-world" />} />
    );
    const menu = container.querySelector('main.warpkeep-menu');
    const scene = container.querySelector('.warpkeep-menu-scene');

    expect(scene?.getAttribute('aria-hidden')).toBe('true');
    expect(scene?.hasAttribute('inert')).toBe(true);
    expect(scene?.contains(screen.getByTestId('live-world'))).toBe(true);
    expect(menu?.firstElementChild).toBe(scene);
    expect(scene?.nextElementSibling?.className).toBe('warpkeep-menu-color-grade');
    expect(container.querySelector('nav[aria-label="Hegemony main menu"]')).not.toBeNull();
    expect(container.querySelector('video, picture, .verdant-menu-life')).toBeNull();
    const emblem = container.querySelector<HTMLImageElement>('.warpkeep-menu-heading__emblem');
    expect(emblem?.getAttribute('src')).toBe(
      '/images/menu/hegemony-emblem-26e8664b1db0acf3.png'
    );
    expect(container.querySelector('.warpkeep-menu-heading__sword, .warpkeep-menu-heading__ring'))
      .toBeNull();
  });

  it('keeps the interface usable while the scene is still loading', () => {
    const { container } = render(<WarpkeepMainMenu active />);

    expect(container.querySelector('.warpkeep-menu-scene')).toBeNull();
    expect(screen.getByRole('button', { name: 'ENTER REALM' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'SETTINGS' })).not.toBeNull();
  });
});

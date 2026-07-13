import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => {
  const handles: Array<{
    dispose: ReturnType<typeof vi.fn>;
    focusKeep: ReturnType<typeof vi.fn>;
    recenterKeep: ReturnType<typeof vi.fn>;
    setHovered: ReturnType<typeof vi.fn>;
    setSelected: ReturnType<typeof vi.fn>;
    showRealm: ReturnType<typeof vi.fn>;
  }> = [];
  const createRealmScene = vi.fn((_options: { quality: { id: string } }) => {
    const handle = {
      dispose: vi.fn(),
      focusKeep: vi.fn(),
      recenterKeep: vi.fn(),
      setHovered: vi.fn(),
      setSelected: vi.fn(),
      showRealm: vi.fn()
    };
    handles.push(handle);
    return handle;
  });
  return { createRealmScene, handles };
});

vi.mock('../src/components/realm/createRealmScene', () => ({
  createRealmScene: mocked.createRealmScene
}));

import { RealmMapScreen } from '../src/components/realm/RealmMapScreen';

afterEach(() => {
  cleanup();
  mocked.createRealmScene.mockClear();
  mocked.handles.length = 0;
  vi.restoreAllMocks();
});

describe('live realm quality recreation', () => {
  it('disposes one scene, keeps selection, and mounts the requested model tier', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      getExtension: () => ({ loseContext: vi.fn() })
    } as unknown as RenderingContext);
    const identity = { fid: 12_345, username: 'warpkeeper' } as const;
    const { rerender } = render(
      <RealmMapScreen
        identity={identity}
        onRequestReturn={vi.fn()}
        qualityOverride="high"
      />
    );
    expect(mocked.createRealmScene).toHaveBeenCalledTimes(1);
    expect(mocked.createRealmScene.mock.calls[0][0].quality.id).toBe('high');

    const toggle = document.querySelector('details.realm-cell-navigator > summary');
    if (!(toggle instanceof HTMLElement)) throw new Error('missing Realm cell navigator');
    fireEvent.click(toggle);
    fireEvent.click(within(screen.getByRole('group', { name: 'Playable realm cells' }))
      .getByRole('button', { name: 'Select cell 1,0' }));
    expect(screen.getByText('Selected cell 1, 0')).not.toBeNull();

    rerender(
      <RealmMapScreen
        identity={identity}
        onRequestReturn={vi.fn()}
        qualityOverride="balanced"
      />
    );
    expect(mocked.createRealmScene).toHaveBeenCalledTimes(2);
    expect(mocked.createRealmScene.mock.calls[1][0].quality.id).toBe('balanced');
    expect(mocked.handles[0].dispose).toHaveBeenCalledTimes(1);
    expect(mocked.handles[1].setSelected).toHaveBeenCalledWith({ q: 1, r: 0 });
    expect(screen.getByText('Selected cell 1, 0')).not.toBeNull();
    expect(screen.getByText('QUALITY BALANCED')).not.toBeNull();
  });
});

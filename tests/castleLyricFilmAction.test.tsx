import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  CastleLyricFilmAction,
  WARPKEEP_LYRIC_FILM_URL
} from '../src/components/realm/CastleLyricFilmAction';

let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  play.mockRestore();
  pause.mockRestore();
});

it('loads the public film only on request and returns to its castle action after Escape', () => {
  const onOpenChange = vi.fn();
  render(<CastleLyricFilmAction onOpenChange={onOpenChange} />);
  const launch = screen.getByRole('button', { name: /WATCH LEAVE IT ON/i });
  expect(document.querySelector('video')).toBeNull();

  fireEvent.click(launch);
  const dialog = screen.getByRole('dialog', { name: 'Leave It On' });
  const video = dialog.querySelector('video');
  expect(video?.getAttribute('preload')).toBe('none');
  expect(video?.tabIndex).toBe(0);
  expect(video?.querySelector('source')?.getAttribute('src')).toBe(WARPKEEP_LYRIC_FILM_URL);
  expect(play).toHaveBeenCalledOnce();
  expect(onOpenChange).toHaveBeenCalledWith(true, expect.any(Function));

  // Keep the native player in the modal's keyboard order. The focus boundary
  // must let Tab move into its controls instead of skipping straight to the link.
  video!.focus();
  expect(document.activeElement).toBe(video);
  expect(fireEvent.keyDown(document, { key: 'Tab', bubbles: true, cancelable: true })).toBe(true);

  fireEvent.error(video!);
  expect(screen.getByRole('status').textContent).toContain('Playback unavailable here.');
  expect(screen.getByRole('link', { name: /Open full video/i }).getAttribute('href'))
    .toBe(WARPKEEP_LYRIC_FILM_URL);

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: 'Leave It On' })).toBeNull();
  expect(pause).toHaveBeenCalled();
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
  expect(document.activeElement).toBe(launch);
});

it('stops playback and releases the realm audio hold if the profile unmounts', () => {
  const onOpenChange = vi.fn();
  const mounted = render(<CastleLyricFilmAction onOpenChange={onOpenChange} />);
  fireEvent.click(screen.getByRole('button', { name: /WATCH LEAVE IT ON/i }));
  mounted.unmount();
  expect(pause).toHaveBeenCalled();
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
  expect(document.querySelector('video')).toBeNull();
});

it('provides a close action for Mini App host Back without leaving the castle', () => {
  const onOpenChange = vi.fn();
  render(<CastleLyricFilmAction onOpenChange={onOpenChange} />);
  fireEvent.click(screen.getByRole('button', { name: /WATCH LEAVE IT ON/i }));
  const requestClose = onOpenChange.mock.calls.find(([open]) => open === true)?.[1];
  expect(requestClose).toBeTypeOf('function');
  act(() => requestClose());
  expect(screen.queryByRole('dialog', { name: 'Leave It On' })).toBeNull();
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
});

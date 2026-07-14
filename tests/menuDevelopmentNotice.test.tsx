import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MenuDevelopmentNotice,
  calculateMenuNoticePosition
} from '../src/components/menu/MenuDevelopmentNotice';
import { menuCommands } from '../src/components/menu/menuCommands';

describe('MenuDevelopmentNotice', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('clamps to the viewport and flips above when the command is near the bottom', () => {
    expect(calculateMenuNoticePosition({
      anchorLeft: 760,
      anchorTop: 550,
      anchorWidth: 140,
      anchorHeight: 44,
      noticeWidth: 320,
      noticeHeight: 120,
      viewportWidth: 800,
      viewportHeight: 600
    })).toEqual({
      left: 464,
      top: 418,
      placement: 'above'
    });

    const smallViewportPosition = calculateMenuNoticePosition({
      anchorLeft: -100,
      anchorTop: -100,
      anchorWidth: 20,
      anchorHeight: 20,
      noticeWidth: 500,
      noticeHeight: 500,
      viewportWidth: 320,
      viewportHeight: 240
    });
    expect(smallViewportPosition.left).toBeGreaterThanOrEqual(16);
    expect(smallViewportPosition.top).toBeGreaterThanOrEqual(16);
  });

  it('auto-dismisses and ignores pointer input inside itself or its anchor', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const anchor = document.createElement('button');
    document.body.append(anchor);
    render(
      <MenuDevelopmentNotice
        anchorElement={anchor}
        command={menuCommands[0]}
        durationMs={5600}
        onDismiss={onDismiss}
        refreshKey={1}
      />
    );

    const notice = screen.getByRole('status');
    fireEvent.pointerDown(notice);
    fireEvent.pointerDown(anchor);
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(onDismiss).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(5600));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    anchor.remove();
  });
});

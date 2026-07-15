import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRef, useState, type Ref } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WARPKEEP_FARCASTER_CHANNEL_URL } from '../src/farcaster/farcasterProjectLinks';
import {
  RealmAccessibilityControls,
  type RealmNavigatorCameraPreset,
  type RealmNavigatorCloseReason,
  type RealmNavigatorCoordinateJump,
  type RealmNavigatorCastle
} from '../src/components/realm/RealmAccessibilityControls';

const CASTLES = Object.freeze([
  { castleId: 1, label: '@warpkeeper', name: 'Genesis Bastion', q: 0, r: 0 },
  { castleId: 2, label: '@peer', name: 'Peer Watch', q: 1, r: -1 },
  { castleId: 3, label: 'Hegemony Keep', name: 'Lowland Hold', q: -2, r: 1 }
]);

function ControlledNavigator({
  onActivateCastle,
  onRequestClose,
  coordinateJump,
  cameraPresets,
  triggerRef,
  onOuterEscape
}: Readonly<{
  onActivateCastle: (castle: RealmNavigatorCastle) => void;
  onRequestClose: (reason: RealmNavigatorCloseReason) => void;
  coordinateJump?: RealmNavigatorCoordinateJump;
  cameraPresets?: readonly RealmNavigatorCameraPreset[];
  triggerRef?: Ref<HTMLButtonElement>;
  onOuterEscape?: () => void;
}>) {
  const [open, setOpen] = useState(false);
  return (
    <div onKeyDown={(event) => event.key === 'Escape' && onOuterEscape?.()}>
      <RealmAccessibilityControls
        id="realm-navigator"
        open={open}
        castles={CASTLES}
        ownCastleId={1}
        selectedCastleId={2}
        onRequestOpen={() => setOpen(true)}
        onRequestClose={(reason) => {
          onRequestClose(reason);
          setOpen(false);
        }}
        onActivateCastle={onActivateCastle}
        coordinateJump={coordinateJump}
        cameraPresets={cameraPresets}
        triggerRef={triggerRef}
      />
    </div>
  );
}

afterEach(cleanup);

describe('RealmAccessibilityControls', () => {
  it('opens a compact controlled Explore surface without selecting on focus', async () => {
    const onActivateCastle = vi.fn();
    const onRequestClose = vi.fn();
    render(
      <ControlledNavigator
        onActivateCastle={onActivateCastle}
        onRequestClose={onRequestClose}
      />
    );

    const trigger = screen.getByRole('button', {
      name: 'Explore realm, 3 founded castles'
    });
    expect(trigger.textContent).toBe('Explore 3 CASTLES');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.focus(trigger);
    expect(onActivateCastle).not.toHaveBeenCalled();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Explore' });
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const search = screen.getByRole('searchbox', { name: 'Search founded castles' });
    await waitFor(() => expect(document.activeElement).toBe(search));

    const list = screen.getByRole('list', { name: 'Founded castles' });
    expect(within(list).getAllByRole('button')).toHaveLength(3);
    const own = within(list).getByRole('button', {
      name: 'Inspect @warpkeeper, Genesis Bastion, q 0, r 0, your castle'
    });
    const selected = within(list).getByRole('button', {
      name: 'Inspect @peer, Peer Watch, q 1, r -1, selected'
    });
    expect(own.getAttribute('data-own')).toBe('true');
    expect(own.getAttribute('aria-pressed')).toBe('false');
    expect(selected.getAttribute('aria-pressed')).toBe('true');
    const community = screen.getByRole('region', { name: 'Warpkeep community' });
    expect(community.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING)
      .not.toBe(0);
    expect(community.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING)
      .not.toBe(0);
    const feedbackLink = within(community).getByRole('link', {
      name: 'Open the Warpkeep Farcaster channel to share feedback (opens in a new tab)'
    });
    expect(feedbackLink.getAttribute('href')).toBe(WARPKEEP_FARCASTER_CHANNEL_URL);
    expect(feedbackLink.getAttribute('target')).toBe('_blank');
    expect(feedbackLink.getAttribute('rel')).toBe('noopener noreferrer');
    expect(feedbackLink.getAttribute('referrerpolicy')).toBe('no-referrer');

    fireEvent.focus(selected);
    expect(onActivateCastle).not.toHaveBeenCalled();
    fireEvent.click(selected);
    expect(onActivateCastle).toHaveBeenCalledWith(CASTLES[1]);

    fireEvent.change(search, { target: { value: 'lowland' } });
    expect(within(list).getAllByRole('button')).toHaveLength(1);
    expect(within(list).getByRole('button', { name: /Lowland Hold/ })).not.toBeNull();
    expect(onActivateCastle).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'CLOSE EXPLORE' }));
    expect(onRequestClose).toHaveBeenCalledWith('close-button');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('activates a camera preset, closes Explore, and restores trigger focus', async () => {
    const onActivateCastle = vi.fn();
    const onRequestClose = vi.fn();
    const showRealm = vi.fn();
    const focusKeep = vi.fn();
    render(
      <ControlledNavigator
        onActivateCastle={onActivateCastle}
        onRequestClose={onRequestClose}
        cameraPresets={[
          { id: 'realm', label: 'Realm View', active: true, onActivate: showRealm },
          { id: 'keep', label: 'My Keep', onActivate: focusKeep }
        ]}
      />
    );

    const trigger = screen.getByRole('button', { name: /Explore realm, 3 founded castles/i });
    fireEvent.click(trigger);
    const views = screen.getByRole('region', { name: 'Realm views' });
    expect(within(views).getByRole('button', { name: 'Realm View' }).getAttribute('aria-pressed'))
      .toBe('true');

    fireEvent.click(within(views).getByRole('button', { name: 'My Keep' }));
    expect(focusKeep).toHaveBeenCalledOnce();
    expect(showRealm).not.toHaveBeenCalled();
    expect(onActivateCastle).not.toHaveBeenCalled();
    expect(onRequestClose).toHaveBeenCalledWith('camera-preset');
    expect(screen.queryByRole('dialog', { name: 'Explore' })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('offers an optional strict q/r jump and activates only after validation', () => {
    const onActivateCastle = vi.fn();
    const onRequestClose = vi.fn();
    const validate = vi.fn(({ q, r }) => Math.abs(q) <= 4 && Math.abs(r) <= 4);
    const onActivate = vi.fn();
    render(
      <ControlledNavigator
        onActivateCastle={onActivateCastle}
        onRequestClose={onRequestClose}
        coordinateJump={{ validate, onActivate }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Explore realm, 3 founded castles/i }));

    const q = screen.getByRole('textbox', { name: 'q coordinate' });
    const r = screen.getByRole('textbox', { name: 'r coordinate' });
    fireEvent.focus(q);
    fireEvent.focus(r);
    expect(validate).not.toHaveBeenCalled();
    expect(onActivate).not.toHaveBeenCalled();

    fireEvent.change(q, { target: { value: '1.5' } });
    fireEvent.change(r, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'JUMP TO CELL' }));
    expect(screen.getByRole('alert').textContent).toMatch(/whole-number/i);
    expect(validate).not.toHaveBeenCalled();

    fireEvent.change(q, { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: 'JUMP TO CELL' }));
    expect(validate).toHaveBeenLastCalledWith({ q: 99, r: 0 });
    expect(screen.getByRole('alert').textContent).toMatch(/not available/i);
    expect(onActivate).not.toHaveBeenCalled();

    fireEvent.change(q, { target: { value: '1' } });
    fireEvent.change(r, { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'JUMP TO CELL' }));
    expect(onActivate).toHaveBeenCalledOnce();
    expect(onActivate).toHaveBeenCalledWith({ q: 1, r: -1 });
    expect(onActivateCastle).not.toHaveBeenCalled();
  });

  it('routes Escape through the close callback and restores the exposed trigger focus', async () => {
    const onActivateCastle = vi.fn();
    const onRequestClose = vi.fn();
    const onOuterEscape = vi.fn();
    const triggerRef = createRef<HTMLButtonElement>();
    render(
      <ControlledNavigator
        onActivateCastle={onActivateCastle}
        onRequestClose={onRequestClose}
        onOuterEscape={onOuterEscape}
        triggerRef={triggerRef}
      />
    );

    const trigger = screen.getByRole('button', { name: /Explore realm, 3 founded castles/i });
    expect(triggerRef.current).toBe(trigger);
    fireEvent.click(trigger);
    const search = screen.getByRole('searchbox', { name: 'Search founded castles' });
    fireEvent.keyDown(search, { key: 'Escape' });

    expect(onRequestClose).toHaveBeenCalledWith('escape');
    expect(onOuterEscape).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(triggerRef.current));
  });
});

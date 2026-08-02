import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FarcasterAdmissionCheckAction,
  useFarcasterAdmissionCheckResultHaptic
} from '../src/components/auth/FarcasterAdmissionCheck';
import type { FarcasterAdmissionCheckViewState } from '../src/farcaster/farcasterAuthTypes';
import {
  MiniAppHostProvider,
  type MiniAppBrowserRuntime,
  type MiniAppSdk
} from '../src/farcaster/miniapp';

afterEach(cleanup);

describe('FarcasterAdmissionCheckAction', () => {
  it('latches repeated activation in the same presentation frame', () => {
    const onCheckAdmission = vi.fn(() => true);
    render(
      <FarcasterAdmissionCheckAction onCheckAdmission={onCheckAdmission} />
    );

    const button = screen.getByRole('button', { name: 'CHECK ADMISSION' });
    for (let index = 0; index < 20; index += 1) fireEvent.click(button);

    expect(onCheckAdmission).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['touch pointer-up plus click', (button: HTMLButtonElement) => {
      fireEvent.pointerDown(button, { pointerType: 'touch' });
      fireEvent.pointerUp(button, { pointerType: 'touch' });
      fireEvent.click(button);
      fireEvent.click(button);
    }],
    ['repeated Enter activation', (button: HTMLButtonElement) => {
      for (let index = 0; index < 20; index += 1) {
        fireEvent.keyDown(button, { key: 'Enter', repeat: index > 0 });
        fireEvent.click(button);
      }
    }],
    ['repeated Space activation', (button: HTMLButtonElement) => {
      for (let index = 0; index < 20; index += 1) {
        fireEvent.keyDown(button, { key: ' ', repeat: index > 0 });
        fireEvent.click(button);
      }
    }]
  ])('suppresses duplicate %s work before React rerenders', (_label, activate) => {
    const onCheckAdmission = vi.fn(() => true);
    render(
      <FarcasterAdmissionCheckAction onCheckAdmission={onCheckAdmission} />
    );

    activate(screen.getByRole('button', { name: 'CHECK ADMISSION' }));
    expect(onCheckAdmission).toHaveBeenCalledTimes(1);
  });

  it('emits one restrained host haptic only for the accepted activation', async () => {
    const impactOccurred = vi.fn(async () => undefined);
    const notificationOccurred = vi.fn(async () => undefined);
    const ready = vi.fn(async () => undefined);
    const sdk: MiniAppSdk = {
      isInMiniApp: vi.fn(async () => true),
      context: Promise.resolve({
        user: { fid: 12_345 },
        client: {
          clientFid: 9_150,
          added: true,
          platformType: 'mobile',
          safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 }
        },
        features: { haptics: true },
        location: { type: 'launcher' }
      }),
      getCapabilities: vi.fn(async () => [
        'actions.ready',
        'haptics.impactOccurred',
        'haptics.notificationOccurred'
      ]),
      actions: { ready },
      haptics: { impactOccurred, notificationOccurred }
    };
    const runtime: MiniAppBrowserRuntime = {
      search: () => '?miniApp=true',
      viewport: () => ({ width: 390, height: 844 }),
      document,
      getMountedShell: () => document.body,
      waitForAnimationFrame: async () => undefined
    };
    const onCheckAdmission = vi.fn(() => true);
    const sdkLoader = async () => sdk;
    function FeedbackAction({
      state
    }: Readonly<{ state: FarcasterAdmissionCheckViewState }>) {
      useFarcasterAdmissionCheckResultHaptic(state);
      return (
        <FarcasterAdmissionCheckAction
          onCheckAdmission={onCheckAdmission}
          state={state}
        />
      );
    }
    const tree = (state: FarcasterAdmissionCheckViewState) => (
      <MiniAppHostProvider runtime={runtime} sdkLoader={sdkLoader}>
        <FeedbackAction state={state} />
      </MiniAppHostProvider>
    );
    const rendered = render(tree({ phase: 'idle' }));
    await waitFor(() => expect(ready).toHaveBeenCalledTimes(1));

    const button = screen.getByRole('button', { name: 'CHECK ADMISSION' });
    for (let index = 0; index < 20; index += 1) fireEvent.click(button);

    expect(onCheckAdmission).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(impactOccurred).toHaveBeenCalledTimes(1));
    expect(impactOccurred).toHaveBeenCalledWith('light');

    rendered.rerender(tree({ phase: 'checking' }));
    rendered.rerender(tree({ phase: 'still-pending', checkedAt: 900 }));
    expect(notificationOccurred).not.toHaveBeenCalled();
    rendered.rerender(tree({ phase: 'checking' }));
    rendered.rerender(tree({ phase: 'granted', checkedAt: 1_000 }));
    await waitFor(() => expect(notificationOccurred).toHaveBeenCalledTimes(1));
    expect(notificationOccurred).toHaveBeenCalledWith('success');
  });

  it('presents checking and every closed result without inventing authority', () => {
    const onCheckAdmission = vi.fn(() => true);
    const rendered = render(
      <FarcasterAdmissionCheckAction
        onCheckAdmission={onCheckAdmission}
        state={{ phase: 'checking' }}
      />
    );

    const checking = screen.getByRole('button', { name: 'CHECKING ADMISSION…' });
    expect(checking.getAttribute('aria-busy')).toBe('true');
    expect((checking as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Checking admission');
    expect(screen.getByText('Confirming your current Hegemony access.')).not.toBeNull();

    rendered.rerender(
      <FarcasterAdmissionCheckAction
        onCheckAdmission={onCheckAdmission}
        state={{ phase: 'still-pending', checkedAt: 1_000 }}
      />
    );
    expect(screen.getByText('STILL PENDING')).not.toBeNull();
    expect(screen.getByRole('status').textContent).toBe(
      'Admission is still pending. Checked just now.'
    );
    expect(screen.getByText(/original request remains on record/i)).not.toBeNull();
    expect((screen.getByRole('button', { name: 'CHECK ADMISSION' }) as HTMLButtonElement).disabled)
      .toBe(false);

    rendered.rerender(
      <FarcasterAdmissionCheckAction
        onCheckAdmission={onCheckAdmission}
        state={{ phase: 'temporary-error', checkedAt: 2_000 }}
      />
    );
    expect(screen.getByText('COULD NOT CHECK ADMISSION')).not.toBeNull();
    expect(screen.getByText(
      'Your access request is still recorded. Try again in a moment.'
    )).not.toBeNull();
    expect(screen.getByRole('button', { name: 'TRY AGAIN' })).not.toBeNull();

    rendered.rerender(
      <FarcasterAdmissionCheckAction
        onCheckAdmission={onCheckAdmission}
        state={{ phase: 'identity-changed', checkedAt: 3_000 }}
      />
    );
    expect(screen.getByText('FARCASTER ACCOUNT CHANGED')).not.toBeNull();

    rendered.rerender(
      <FarcasterAdmissionCheckAction
        onCheckAdmission={onCheckAdmission}
        state={{ phase: 'granted', checkedAt: 4_000 }}
      />
    );
    expect(screen.getByText('ACCESS GRANTED')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

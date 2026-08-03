import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const hostState = vi.hoisted(() => ({
  current: {} as Record<string, unknown>
}));

vi.mock('../src/farcaster/miniapp', () => ({
  useMiniAppHost: () => hostState.current
}));

import { FarcasterAdmissionNotificationOptIn } from '../src/components/auth/FarcasterAdmissionNotificationOptIn';
import { FarcasterAccessRequestAction } from '../src/components/auth/FarcasterAccessRequest';
import type { MiniAppNotificationPresentation } from '../src/farcaster/miniapp';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function installHost(
  presentation: MiniAppNotificationPresentation = 'not-added',
  overrides: Record<string, unknown> = {}
) {
  const addMiniApp = vi.fn(async () => ({ status: 'setup-requested' as const }));
  const impactOccurred = vi.fn(async () => true);
  hostState.current = {
    state: 'miniapp',
    isMiniApp: true,
    notificationPresentation: presentation,
    hasCapability: (capability: string) => capability === 'actions.addMiniApp',
    actions: { addMiniApp },
    haptics: { impactOccurred },
    ...overrides
  };
  return { addMiniApp, impactOccurred };
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Farcaster admission notification opt-in', () => {
  it('is fail-closed and excludes ordinary web or unsupported hosts', () => {
    installHost();
    const view = render(<FarcasterAdmissionNotificationOptIn />);
    expect(screen.queryByText('GET NOTIFIED WHEN ADMITTED')).toBeNull();

    view.rerender(<FarcasterAdmissionNotificationOptIn enabled />);
    expect(screen.getByText('GET NOTIFIED WHEN ADMITTED')).not.toBeNull();

    installHost('unsupported');
    view.rerender(<FarcasterAdmissionNotificationOptIn enabled />);
    expect(screen.queryByText('GET NOTIFIED WHEN ADMITTED')).toBeNull();

    installHost('not-added', { isMiniApp: false, state: 'regular-web' });
    view.rerender(<FarcasterAdmissionNotificationOptIn enabled />);
    expect(screen.queryByText('GET NOTIFIED WHEN ADMITTED')).toBeNull();
  });

  it('keeps one same-frame native prompt under repeated activation', async () => {
    const pending = deferred<{ status: 'setup-requested' }>();
    const addMiniApp = vi.fn(() => pending.promise);
    const impactOccurred = vi.fn(async () => true);
    installHost('not-added', {
      actions: { addMiniApp },
      haptics: { impactOccurred }
    });
    render(<FarcasterAdmissionNotificationOptIn enabled />);

    const button = screen.getByRole('button', { name: 'ENABLE ADMISSION ALERTS' });
    for (let index = 0; index < 20; index += 1) fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Enter', repeat: true });

    expect(addMiniApp).toHaveBeenCalledTimes(1);
    expect(impactOccurred).toHaveBeenCalledTimes(1);
    pending.resolve({ status: 'setup-requested' });
    await pending.promise;
  });

  it('treats rejection as optional and NOT NOW as session-only presentation', () => {
    installHost('rejected');
    const localStorageSize = window.localStorage.length;
    const sessionStorageSize = window.sessionStorage.length;
    const view = render(<FarcasterAdmissionNotificationOptIn enabled />);

    expect(screen.getByText('ALERTS NOT ENABLED')).not.toBeNull();
    expect(screen.getByText('Your access request remains active.')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'NOT NOW' }));
    expect(screen.queryByText('ALERTS NOT ENABLED')).toBeNull();
    expect(window.localStorage.length).toBe(localStorageSize);
    expect(window.sessionStorage.length).toBe(sessionStorageSize);

    view.unmount();
    render(<FarcasterAdmissionNotificationOptIn enabled />);
    expect(screen.getByText('ALERTS NOT ENABLED')).not.toBeNull();
  });

  it.each([
    ['enabled-hint', 'ADMISSION ALERTS ENABLED'],
    ['disabled-hint', 'NOTIFICATIONS ARE OFF'],
    ['added-status-unknown', 'NOTIFICATION STATUS UNCONFIRMED'],
    ['setup-requested', 'NOTIFICATION SETUP REQUESTED'],
    ['invalid-manifest', 'NOTIFICATION SETUP UNAVAILABLE']
  ] as const)('presents bounded %s copy without exposing host secrets', (presentation, title) => {
    installHost(presentation);
    render(<FarcasterAdmissionNotificationOptIn enabled />);

    expect(screen.getByText(title)).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/secret-token|delivery\.example/i);
  });

  it('mounts only after an authoritative request receipt and never mutates the request', async () => {
    vi.stubEnv('VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED', 'true');
    const onRequestAccess = vi.fn(() => true);
    installHost();
    const view = render(
      <FarcasterAccessRequestAction
        onRequestAccess={onRequestAccess}
        state={{ phase: 'request-available' }}
      />
    );
    expect(screen.queryByText('GET NOTIFIED WHEN ADMITTED')).toBeNull();

    const requestedAt = 1_785_414_896_000;
    view.rerender(
      <FarcasterAccessRequestAction
        onRequestAccess={onRequestAccess}
        state={{ phase: 'request-received', requestedAt }}
      />
    );
    expect(await screen.findByText('GET NOTIFIED WHEN ADMITTED')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'NOT NOW' }));
    await waitFor(() => expect(onRequestAccess).not.toHaveBeenCalled());
    expect(screen.getByText(/Recorded/).parentElement?.textContent).toContain('UTC');
  });
});

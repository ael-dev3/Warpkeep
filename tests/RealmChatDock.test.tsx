import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RealmChatDock,
  type RealmChatDockProps,
  type RealmChatSenderProfile
} from '../src/components/realm/RealmChatDock';
import type {
  RealmChatMessagePresentation,
  RealmChatPresentation
} from '../src/spacetime/realmChatPresentation';

afterEach(cleanup);

function message(
  sequence: bigint,
  senderFid = 2,
  body = `Message ${sequence}`
): RealmChatMessagePresentation {
  return Object.freeze({
    messageId: `018f7b44-5f2f-7c54-8c0d-${sequence.toString().padStart(12, '0')}`,
    sequence,
    senderFid,
    body,
    sentAtMicros: 1_725_000_000_000_000n + sequence,
    visibility: 'visible'
  });
}

const profiles = new Map<number, RealmChatSenderProfile>([
  [1, Object.freeze({ fid: 1, label: '@viewer', castleId: 1, castleName: 'Viewer Keep' })],
  [2, Object.freeze({ fid: 2, label: '@rival', castleId: 2, castleName: 'Rival Keep' })]
]);

function readyChat(messages: readonly RealmChatMessagePresentation[]): RealmChatPresentation {
  return Object.freeze({
    availability: 'ready',
    channelKey: 'realm:genesis-001',
    policyVersion: '2026-08-03-realm-chat-policy-v1',
    mode: 'active',
    messages
  });
}

function renderChat(overrides: Partial<RealmChatDockProps> = {}) {
  const props: RealmChatDockProps = {
    chat: readyChat([message(1n)]),
    chromeMode: 'desktop-web',
    identityFid: 1,
    senderProfiles: profiles,
    onSend: vi.fn(async () => undefined),
    onReport: vi.fn(async () => undefined),
    onLoadEarlier: vi.fn(async () => ({ messages: [], hasMore: false })),
    onLocateCastle: vi.fn(),
    ...overrides
  };
  return { props, view: render(<RealmChatDock {...props} />) };
}

describe('Realm Chat presentation', () => {
  it('stays absent unless the isolated server projection is active', () => {
    const { container } = render(
      <RealmChatDock
        chat={{ availability: 'unavailable', messages: [] }}
        chromeMode="desktop-web"
        identityFid={1}
        senderProfiles={profiles}
        onLoadEarlier={async () => ({ messages: [], hasMore: false })}
        onReport={async () => undefined}
        onSend={async () => undefined}
      />
    );
    expect(container.children).toHaveLength(0);
  });

  it('sends with Enter, preserves Shift+Enter, and does not send during composition', async () => {
    const onSend = vi.fn(async () => undefined);
    renderChat({ onSend });
    fireEvent.click(screen.getByRole('button', { name: 'Open Realm Chat' }));
    const composer = screen.getByPlaceholderText('Message the Realm…');

    fireEvent.change(composer, { target: { value: 'draft' } });
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(composer, { key: 'Enter', isComposing: true });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(composer, { key: 'Enter' });
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('draft'));
    expect((composer as HTMLTextAreaElement).value).toBe('');
  });

  it('connects sender identity to the world and supports session-only mute', () => {
    const onLocateCastle = vi.fn();
    renderChat({ onLocateCastle });
    fireEvent.click(screen.getByRole('button', { name: 'Open Realm Chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'View @rival' }));
    expect(screen.getByText('Rival Keep')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Locate keep' }));
    expect(onLocateCastle).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByRole('button', { name: 'Open Realm Chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'View @rival' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mute for session' }));
    expect(screen.queryByText('Message 1')).toBeNull();
    expect(screen.getByRole('button', { name: /1 muted · Show all/i })).toBeTruthy();
  });

  it('submits only the canonical report category and exact selected message', async () => {
    const onReport = vi.fn(async () => undefined);
    renderChat({ onReport });
    fireEvent.click(screen.getByRole('button', { name: 'Open Realm Chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'View @rival' }));
    fireEvent.click(screen.getByRole('button', { name: 'Report message' }));
    const dialog = screen.getByRole('dialog', { name: 'Report message' });
    fireEvent.change(within(dialog).getByLabelText('Reason'), {
      target: { value: 'spam_or_disruption' }
    });
    fireEvent.change(within(dialog).getByLabelText(/Details/), {
      target: { value: 'Repeated disruption' }
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit report' }));
    await waitFor(() => expect(onReport).toHaveBeenCalledWith(
      message(1n).messageId,
      'spam_or_disruption',
      'Repeated disruption'
    ));
  });

  it('loads history with an exclusive cursor and keeps chronological display order', async () => {
    const onLoadEarlier = vi.fn(async () => ({
      messages: [message(2n), message(1n)],
      nextBeforeSequence: 1n,
      hasMore: false
    }));
    renderChat({
      chat: readyChat([message(3n)]),
      onLoadEarlier
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open Realm Chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Load earlier messages' }));
    await waitFor(() => expect(onLoadEarlier).toHaveBeenCalledWith(3n));
    await screen.findByText('Message 1');
    const bodies = screen.getAllByText(/Message [123]/).map((element) => element.textContent);
    expect(bodies).toEqual(['Message 1', 'Message 2', 'Message 3']);
  });

  it('delegates compact Back to the Realm owner and closes reports before chat', async () => {
    let compactBack: (() => void) | undefined;
    renderChat({
      chromeMode: 'miniapp',
      onCompactBackChange: (handler) => { compactBack = handler; }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open Realm Chat' }));
    await waitFor(() => expect(compactBack).toBeTypeOf('function'));
    fireEvent.click(screen.getByRole('button', { name: 'View @rival' }));
    fireEvent.click(screen.getByRole('button', { name: 'Report message' }));
    expect(screen.getByRole('dialog', { name: 'Report message' })).toBeTruthy();

    act(() => compactBack?.());
    expect(screen.queryByRole('dialog', { name: 'Report message' })).toBeNull();
    expect(screen.getByRole('log', { name: 'Realm messages' })).toBeTruthy();

    act(() => compactBack?.());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Realm Chat' })).toBeTruthy());
    expect(compactBack).toBeUndefined();
  });
});

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react';

import type {
  RealmChatHistoryPagePresentation,
  RealmChatMessagePresentation,
  RealmChatPresentation
} from '../../spacetime/realmChatPresentation';
import { useModalFocusBoundary } from '../menu/useModalFocusBoundary';
import { RealmFullScreenSurface } from './RealmFullScreenSurface';
import type { RealmChromeMode } from './realmChromePresentation';
import './RealmChatDock.css';

const CHAT_CHARACTER_LIMIT = 500;
const CHAT_LINE_LIMIT = 8;
const CHAT_LOCAL_MESSAGE_LIMIT = 512;
const REPORT_DETAILS_CHARACTER_LIMIT = 250;
const REPORT_DETAILS_UTF8_BYTE_LIMIT = 512;

const REPORT_CATEGORIES = Object.freeze([
  ['threat_or_harm', 'Threats or harm'],
  ['harassment_or_hate', 'Harassment or hate'],
  ['personal_information', 'Personal information'],
  ['sexual_exploitation', 'Sexual exploitation'],
  ['fraud_or_malware', 'Fraud or malware'],
  ['illegal_trade', 'Illegal trade'],
  ['spam_or_disruption', 'Spam or disruption'],
  ['other', 'Other']
] as const);

export type RealmChatSenderProfile = Readonly<{
  fid: number;
  label: string;
  pfpUrl?: string;
  castleId?: number;
  castleName?: string;
}>;

export type RealmChatDockProps = Readonly<{
  chat: RealmChatPresentation;
  chromeMode: RealmChromeMode;
  identityFid: number;
  senderProfiles: ReadonlyMap<number, RealmChatSenderProfile>;
  onSend: (body: string) => Promise<void>;
  onReport: (messageId: string, category: string, details: string) => Promise<void>;
  onLoadEarlier: (
    beforeSequence: bigint,
    limit?: number
  ) => Promise<RealmChatHistoryPagePresentation>;
  onLocateCastle?: (castleId: number) => void;
  onCompactBackChange?: (handler: (() => void) | undefined) => void;
}>;

function messageTime(sentAtMicros: bigint) {
  const milliseconds = Number(sentAtMicros / 1_000n);
  if (!Number.isSafeInteger(milliseconds)) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit'
    }).format(milliseconds);
  } catch {
    return '';
  }
}

function mergeMessages(
  recent: readonly RealmChatMessagePresentation[],
  history: readonly RealmChatMessagePresentation[]
) {
  const bySequence = new Map<bigint, RealmChatMessagePresentation>();
  for (const message of history) bySequence.set(message.sequence, message);
  for (const message of recent) bySequence.set(message.sequence, message);
  return Object.freeze(
    [...bySequence.values()]
      .sort((left, right) => left.sequence < right.sequence ? -1 : 1)
      .slice(-CHAT_LOCAL_MESSAGE_LIMIT)
  );
}

function fallbackSender(fid: number): RealmChatSenderProfile {
  return Object.freeze({ fid, label: `Keeper #${fid}` });
}

function senderMonogram(profile: RealmChatSenderProfile) {
  const trimmed = profile.label.replace(/^@/, '').trim();
  return trimmed[0]?.toLocaleUpperCase() ?? 'W';
}

function RealmChatAvatar({ profile }: Readonly<{ profile: RealmChatSenderProfile }>) {
  return profile.pfpUrl ? (
    <img alt="" loading="lazy" referrerPolicy="no-referrer" src={profile.pfpUrl} />
  ) : (
    <span aria-hidden="true">{senderMonogram(profile)}</span>
  );
}

function RealmChatReportDialog({
  message,
  profile,
  onCancel,
  onReport
}: Readonly<{
  message: RealmChatMessagePresentation;
  profile: RealmChatSenderProfile;
  onCancel: () => void;
  onReport: (messageId: string, category: string, details: string) => Promise<void>;
}>) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [category, setCategory] = useState<string>(REPORT_CATEGORIES[0][0]);
  const [details, setDetails] = useState('');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const detailsLength = [...details].length;
  const detailsByteLength = new TextEncoder().encode(details).byteLength;
  const detailsValid = detailsLength <= REPORT_DETAILS_CHARACTER_LIMIT
    && detailsByteLength <= REPORT_DETAILS_UTF8_BYTE_LIMIT;
  const operationGenerationRef = useRef(0);
  useEffect(() => () => {
    operationGenerationRef.current += 1;
  }, []);
  useModalFocusBoundary({ dialogRef, initialFocusRef: headingRef, onEscape: onCancel });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || !detailsValid) return;
    const operationGeneration = operationGenerationRef.current;
    setPending(true);
    setFailed(false);
    try {
      await onReport(message.messageId, category, details);
      if (operationGenerationRef.current !== operationGeneration) return;
      onCancel();
    } catch {
      if (operationGenerationRef.current !== operationGeneration) return;
      setFailed(true);
    } finally {
      if (operationGenerationRef.current === operationGeneration) setPending(false);
    }
  };

  return (
    <div className="realm-chat-report" role="presentation">
      <div
        aria-labelledby="realm-chat-report-title"
        aria-modal="true"
        className="realm-chat-report__dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <p>REALM SAFETY</p>
          <h2 id="realm-chat-report-title" ref={headingRef} tabIndex={-1}>
            Report message
          </h2>
        </header>
        <blockquote>
          <strong>{profile.label}</strong>
          <span>{message.body}</span>
        </blockquote>
        <p className="realm-chat-report__context-note">
          The server will preserve this message and a small surrounding context window for review.
        </p>
        <form onSubmit={submit}>
          <label>
            Reason
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {REPORT_CATEGORIES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            Details <span>(optional)</span>
            <textarea
              rows={3}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
            />
            <small>
              {detailsLength}/{REPORT_DETAILS_CHARACTER_LIMIT} · {detailsByteLength}/
              {REPORT_DETAILS_UTF8_BYTE_LIMIT} bytes
            </small>
          </label>
          {!detailsValid ? (
            <p role="alert">
              Report details can use up to {REPORT_DETAILS_CHARACTER_LIMIT} characters and{' '}
              {REPORT_DETAILS_UTF8_BYTE_LIMIT} UTF-8 bytes.
            </p>
          ) : null}
          {failed ? <p role="alert">The report could not be submitted. Try again.</p> : null}
          <div className="realm-chat-report__actions">
            <button disabled={pending} onClick={onCancel} type="button">Cancel</button>
            <button disabled={pending || !detailsValid} type="submit">
              {pending ? 'Submitting…' : 'Submit report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function RealmChatDock({
  chat,
  chromeMode,
  identityFid,
  senderProfiles,
  onSend,
  onReport,
  onLoadEarlier,
  onLocateCastle,
  onCompactBackChange
}: RealmChatDockProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [history, setHistory] = useState<readonly RealmChatMessagePresentation[]>([]);
  const [historyHasMore, setHistoryHasMore] = useState<boolean | undefined>(undefined);
  const [historyPending, setHistoryPending] = useState(false);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [sendPending, setSendPending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [mutedFids, setMutedFids] = useState<ReadonlySet<number>>(new Set());
  const [selectedMessageId, setSelectedMessageId] = useState<string | undefined>();
  const [reportMessage, setReportMessage] = useState<RealmChatMessagePresentation>();
  const [lastReadSequence, setLastReadSequence] = useState<bigint>();
  const [atBottom, setAtBottom] = useState(true);
  const [announcement, setAnnouncement] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const wasComposingRef = useRef(false);
  const previousLatestSequenceRef = useRef<bigint | undefined>(undefined);
  const initialProjectionRef = useRef(true);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const operationScopeKey = `${identityFid}:${chat.channelKey ?? ''}`;
  const operationScopeRef = useRef<Readonly<{ key: string; generation: number }>>(
    Object.freeze({ key: operationScopeKey, generation: 0 })
  );
  if (operationScopeRef.current.key !== operationScopeKey) {
    operationScopeRef.current = Object.freeze({
      key: operationScopeKey,
      generation: operationScopeRef.current.generation + 1
    });
  }
  const compact = chromeMode !== 'desktop-web';

  useEffect(() => {
    if (!compact || !open || onCompactBackChange === undefined) return undefined;
    onCompactBackChange(() => {
      if (reportMessage !== undefined) setReportMessage(undefined);
      else setOpen(false);
    });
    return () => onCompactBackChange(undefined);
  }, [compact, onCompactBackChange, open, reportMessage]);

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (!wasOpen || open) return;
    const restoreLauncherFocus = () => launcherRef.current?.focus({ preventScroll: true });
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(restoreLauncherFocus);
    } else {
      restoreLauncherFocus();
    }
  }, [open]);

  const messages = useMemo(
    () => mergeMessages(chat.messages, history),
    [chat.messages, history]
  );
  const visibleMessages = useMemo(
    () => messages.filter((message) => !mutedFids.has(message.senderFid)),
    [messages, mutedFids]
  );
  const latestVisibleSequence = visibleMessages.at(-1)?.sequence;
  const unreadCount = lastReadSequence === undefined
    ? 0
    : visibleMessages.filter((message) => message.sequence > lastReadSequence).length;
  const scalarCount = [...draft].length;
  const lineCount = draft.split(/\r?\n/).length;
  const draftValid = draft.trim().length > 0
    && scalarCount <= CHAT_CHARACTER_LIMIT
    && lineCount <= CHAT_LINE_LIMIT;
  const canLoadEarlier = historyHasMore
    ?? ((messages.at(0)?.sequence ?? 1n) > 1n);

  useEffect(() => {
    setOpen(false);
    setDraft('');
    setHistory([]);
    setHistoryHasMore(undefined);
    setHistoryPending(false);
    setHistoryFailed(false);
    setSendPending(false);
    setSendFailed(false);
    setMutedFids(new Set());
    setSelectedMessageId(undefined);
    setReportMessage(undefined);
    setLastReadSequence(undefined);
    setAtBottom(true);
    setAnnouncement('');
    previousLatestSequenceRef.current = undefined;
    initialProjectionRef.current = true;
  }, [chat.channelKey, identityFid]);

  useEffect(() => {
    if (latestVisibleSequence === undefined) return;
    const previous = previousLatestSequenceRef.current;
    previousLatestSequenceRef.current = latestVisibleSequence;
    if (initialProjectionRef.current) {
      initialProjectionRef.current = false;
      setLastReadSequence(latestVisibleSequence);
      return;
    }
    if (open && atBottom) setLastReadSequence(latestVisibleSequence);
    if (open && previous !== undefined && latestVisibleSequence > previous) {
      const latest = visibleMessages.at(-1);
      if (latest && latest.senderFid !== identityFid) {
        const sender = senderProfiles.get(latest.senderFid) ?? fallbackSender(latest.senderFid);
        setAnnouncement(`New Realm message from ${sender.label}.`);
      }
    }
  }, [atBottom, identityFid, latestVisibleSequence, open, senderProfiles, visibleMessages]);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!open || !scroll || !atBottom) return;
    scroll.scrollTop = scroll.scrollHeight;
  }, [atBottom, open, visibleMessages]);

  useEffect(() => {
    if (!open) return;
    const focusComposer = () => composerRef.current?.focus({ preventScroll: true });
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(focusComposer);
    } else {
      focusComposer();
    }
  }, [open]);

  const markReadAndScroll = useCallback(() => {
    const scroll = scrollRef.current;
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
    setAtBottom(true);
    if (latestVisibleSequence !== undefined) setLastReadSequence(latestVisibleSequence);
  }, [latestVisibleSequence]);

  const submitMessage = useCallback(async () => {
    if (!draftValid || sendPending) return;
    const operationScope = operationScopeRef.current;
    const retainedDraft = draft;
    setSendPending(true);
    setSendFailed(false);
    try {
      await onSend(retainedDraft);
      if (operationScopeRef.current !== operationScope) return;
      setDraft('');
      setAtBottom(true);
    } catch {
      if (operationScopeRef.current !== operationScope) return;
      setSendFailed(true);
    } finally {
      if (operationScopeRef.current === operationScope) setSendPending(false);
    }
  }, [draft, draftValid, onSend, sendPending]);

  const handleComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== 'Enter'
      || event.shiftKey
      || event.nativeEvent.isComposing
      || wasComposingRef.current
    ) return;
    event.preventDefault();
    void submitMessage();
  };

  const loadEarlier = async () => {
    const oldest = messages.at(0);
    if (!oldest || historyPending || !canLoadEarlier) return;
    const operationScope = operationScopeRef.current;
    const scroll = scrollRef.current;
    const previousHeight = scroll?.scrollHeight ?? 0;
    setHistoryPending(true);
    setHistoryFailed(false);
    try {
      const page = await onLoadEarlier(oldest.sequence);
      if (operationScopeRef.current !== operationScope) return;
      const remainingCapacity = Math.max(0, CHAT_LOCAL_MESSAGE_LIMIT - messages.length);
      const retainedPage = page.messages.slice(0, remainingCapacity);
      setHistory((current) => mergeMessages(current, retainedPage));
      setHistoryHasMore(
        page.hasMore
        && retainedPage.length === page.messages.length
        && messages.length + retainedPage.length < CHAT_LOCAL_MESSAGE_LIMIT
      );
      const restoreScroll = () => {
        if (scroll) scroll.scrollTop += scroll.scrollHeight - previousHeight;
      };
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(restoreScroll);
      } else {
        restoreScroll();
      }
    } catch {
      if (operationScopeRef.current !== operationScope) return;
      setHistoryFailed(true);
    } finally {
      if (operationScopeRef.current === operationScope) setHistoryPending(false);
    }
  };

  const mute = (fid: number) => {
    setMutedFids((current) => new Set([...current, fid]));
    setSelectedMessageId(undefined);
  };

  const unmuteAll = () => setMutedFids(new Set());

  const content = (
    <div className="realm-chat-dock__content">
      <div
        aria-label="Realm messages"
        className="realm-chat-dock__messages"
        onScroll={(event) => {
          const element = event.currentTarget;
          const isAtBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 36;
          setAtBottom(isAtBottom);
          if (isAtBottom && latestVisibleSequence !== undefined) {
            setLastReadSequence(latestVisibleSequence);
          }
        }}
        ref={scrollRef}
        role="log"
      >
        {canLoadEarlier ? (
          <button
            className="realm-chat-dock__history"
            disabled={historyPending}
            onClick={() => void loadEarlier()}
            type="button"
          >
            {historyPending ? 'Opening archive…' : 'Load earlier messages'}
          </button>
        ) : <p className="realm-chat-dock__beginning">Beginning of the Realm record</p>}
        {historyFailed ? <p className="realm-chat-dock__error" role="alert">Earlier messages are unavailable.</p> : null}
        {visibleMessages.length === 0 ? (
          <div className="realm-chat-dock__empty">
            <strong>The council chamber is quiet.</strong>
            <span>Messages here are shared with admitted keepers in Genesis 001.</span>
          </div>
        ) : visibleMessages.map((message) => {
          const profile = senderProfiles.get(message.senderFid) ?? fallbackSender(message.senderFid);
          const own = message.senderFid === identityFid;
          return (
            <article
              className="realm-chat-message"
              data-own={String(own)}
              data-tombstoned={String(message.visibility === 'tombstoned')}
              key={message.messageId}
            >
              <button
                aria-controls={`realm-chat-keeper-${message.messageId}`}
                aria-expanded={selectedMessageId === message.messageId}
                aria-label={`View ${profile.label}`}
                className="realm-chat-message__avatar"
                onClick={() => setSelectedMessageId((current) => (
                  current === message.messageId ? undefined : message.messageId
                ))}
                type="button"
              >
                <RealmChatAvatar profile={profile} />
              </button>
              <div className="realm-chat-message__body">
                <header>
                  <button
                    aria-controls={`realm-chat-keeper-${message.messageId}`}
                    aria-expanded={selectedMessageId === message.messageId}
                    onClick={() => setSelectedMessageId((current) => (
                      current === message.messageId ? undefined : message.messageId
                    ))}
                    type="button"
                  >
                    {own ? 'You' : profile.label}
                  </button>
                  <time dateTime={new Date(Number(message.sentAtMicros / 1_000n)).toISOString()}>
                    {messageTime(message.sentAtMicros)}
                  </time>
                </header>
                {message.visibility === 'tombstoned' ? (
                  <p className="realm-chat-message__removed">Message removed by Realm moderation.</p>
                ) : <p>{message.body}</p>}
                {selectedMessageId === message.messageId ? (
                  <div
                    className="realm-chat-keeper-card"
                    id={`realm-chat-keeper-${message.messageId}`}
                  >
                    <strong>{profile.label}</strong>
                    <span>{profile.castleName ?? 'Hegemony keeper'}</span>
                    <div>
                      {profile.castleId !== undefined && onLocateCastle ? (
                        <button
                          onClick={() => {
                            onLocateCastle(profile.castleId!);
                            setSelectedMessageId(undefined);
                            setOpen(false);
                          }}
                          type="button"
                        >
                          Locate keep
                        </button>
                      ) : null}
                      {!own ? <button onClick={() => mute(message.senderFid)} type="button">Mute for session</button> : null}
                      {!own && message.visibility === 'visible' ? (
                        <button onClick={() => setReportMessage(message)} type="button">Report message</button>
                      ) : null}
                      {message.visibility === 'visible'
                      && typeof navigator !== 'undefined'
                      && navigator.clipboard ? (
                        <button
                          onClick={() => void navigator.clipboard.writeText(message.body).catch(() => undefined)}
                          type="button"
                        >
                          Copy
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      {!atBottom && unreadCount > 0 ? (
        <button className="realm-chat-dock__jump" onClick={markReadAndScroll} type="button">
          {unreadCount} new {unreadCount === 1 ? 'message' : 'messages'}
        </button>
      ) : null}
      {mutedFids.size > 0 ? (
        <button className="realm-chat-dock__unmute" onClick={unmuteAll} type="button">
          {mutedFids.size} muted · Show all
        </button>
      ) : null}
      <form
        className="realm-chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void submitMessage();
        }}
      >
        <label className="warpkeep-visually-hidden" htmlFor="realm-chat-composer-input">
          Message Genesis 001
        </label>
        <textarea
          id="realm-chat-composer-input"
          onChange={(event) => setDraft(event.target.value)}
          onCompositionEnd={() => {
            window.setTimeout(() => { wasComposingRef.current = false; }, 0);
          }}
          onCompositionStart={() => { wasComposingRef.current = true; }}
          onKeyDown={handleComposerKeyDown}
          placeholder="Message the Realm…"
          ref={composerRef}
          rows={2}
          value={draft}
        />
        <div className="realm-chat-composer__rail">
          <span data-invalid={String(scalarCount > CHAT_CHARACTER_LIMIT || lineCount > CHAT_LINE_LIMIT)}>
            {scalarCount}/{CHAT_CHARACTER_LIMIT}
          </span>
          <button disabled={!draftValid || sendPending} type="submit">
            {sendPending ? 'Sending…' : 'Send'}
          </button>
        </div>
        {lineCount > CHAT_LINE_LIMIT ? <p role="alert">Messages can use up to {CHAT_LINE_LIMIT} lines.</p> : null}
        {sendFailed ? <p role="alert">Message wasn’t sent. Wait a moment and try again.</p> : null}
      </form>
    </div>
  );

  if (
    chat.availability !== 'ready'
    || chat.mode !== 'active'
    || chat.channelKey === undefined
  ) return null;

  return (
    <aside className="realm-chat-dock" data-compact={String(compact)} data-open={String(open)}>
      {!open ? (
        <button
          aria-label={unreadCount > 0 ? `Open Realm Chat, ${unreadCount} unread` : 'Open Realm Chat'}
          className="realm-chat-dock__launcher"
          onClick={() => {
            setSelectedMessageId(undefined);
            setOpen(true);
            setAtBottom(true);
            if (latestVisibleSequence !== undefined) setLastReadSequence(latestVisibleSequence);
          }}
          ref={launcherRef}
          type="button"
        >
          <span aria-hidden="true" className="realm-chat-dock__sigil">◈</span>
          <span>REALM CHAT</span>
          {unreadCount > 0 ? <b>{Math.min(unreadCount, 99)}</b> : null}
        </button>
      ) : compact ? (
        <RealmFullScreenSurface
          backLabel="Realm"
          canGoBack={false}
          eyebrow="GENESIS 001"
          onBack={() => setOpen(false)}
          onCloseToRealm={() => setOpen(false)}
          subtitle="A persistent channel for admitted keepers"
          title="Realm Chat"
        >
          {content}
        </RealmFullScreenSurface>
      ) : (
        <section aria-label="Realm Chat" className="realm-chat-dock__panel">
          <header className="realm-chat-dock__header">
            <div>
              <span>GENESIS 001</span>
              <strong>Realm Chat</strong>
            </div>
            <button aria-label="Close Realm Chat" onClick={() => setOpen(false)} type="button">×</button>
          </header>
          {content}
        </section>
      )}
      <p aria-live="polite" className="warpkeep-visually-hidden">{announcement}</p>
      {reportMessage ? (
        <RealmChatReportDialog
          key={`${operationScopeKey}:${reportMessage.messageId}`}
          message={reportMessage}
          profile={senderProfiles.get(reportMessage.senderFid) ?? fallbackSender(reportMessage.senderFid)}
          onCancel={() => setReportMessage(undefined)}
          onReport={onReport}
        />
      ) : null}
    </aside>
  );
}

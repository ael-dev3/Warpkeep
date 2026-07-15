import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type Ref
} from 'react';

import type { HexCoord } from '../../game/map/hexCoordinates';
import { WARPKEEP_FARCASTER_CHANNEL_URL } from '../../farcaster/farcasterProjectLinks';

export type RealmNavigatorCastle = Readonly<{
  castleId: number;
  /** Trusted, privacy-bounded public identity label prepared by the parent. */
  label: string;
  /** Trusted authoritative castle name prepared by the parent. */
  name: string;
  q: number;
  r: number;
}>;

export type RealmNavigatorCloseReason = 'escape' | 'close-button' | 'camera-preset';

export type RealmNavigatorCoordinateJump = Readonly<{
  validate: (coord: HexCoord) => boolean;
  onActivate: (coord: HexCoord) => void;
}>;

export type RealmNavigatorCameraPreset = Readonly<{
  id: string;
  label: string;
  active?: boolean;
  onActivate: () => void;
}>;

export type RealmAccessibilityControlsProps = Readonly<{
  id: string;
  open: boolean;
  castles: readonly RealmNavigatorCastle[];
  ownCastleId?: number;
  selectedCastleId?: number;
  onRequestOpen: () => void;
  onRequestClose: (reason: RealmNavigatorCloseReason) => void;
  onActivateCastle: (castle: RealmNavigatorCastle) => void;
  coordinateJump?: RealmNavigatorCoordinateJump;
  cameraPresets?: readonly RealmNavigatorCameraPreset[];
  /** Receives the trigger element; focus is restored here after controlled close. */
  triggerRef?: Ref<HTMLButtonElement>;
}>;

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref) {
    (ref as { current: T | null }).current = value;
  }
}

function strictInteger(value: string) {
  const normalized = value.trim();
  if (!/^-?\d+$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function searchCopy(castle: RealmNavigatorCastle) {
  return `${castle.label} ${castle.name} ${castle.q},${castle.r} q ${castle.q} r ${castle.r}`
    .toLocaleLowerCase();
}

export function RealmAccessibilityControls({
  id,
  open,
  castles,
  ownCastleId,
  selectedCastleId,
  onRequestOpen,
  onRequestClose,
  onActivateCastle,
  coordinateJump,
  cameraPresets = [],
  triggerRef
}: RealmAccessibilityControlsProps) {
  const [search, setSearch] = useState('');
  const [qValue, setQValue] = useState('');
  const [rValue, setRValue] = useState('');
  const [jumpError, setJumpError] = useState<string>();
  const internalTriggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);
  const headingId = `${id}-title`;
  const searchId = `${id}-search`;
  const qId = `${id}-q`;
  const rId = `${id}-r`;
  const jumpErrorId = `${id}-jump-error`;

  const setTriggerRef = useCallback((element: HTMLButtonElement | null) => {
    internalTriggerRef.current = element;
    assignRef(triggerRef, element);
  }, [triggerRef]);

  useEffect(() => {
    if (open) {
      setSearch('');
      setQValue('');
      setRValue('');
      setJumpError(undefined);
      searchRef.current?.focus({ preventScroll: true });
    } else if (wasOpenRef.current) {
      internalTriggerRef.current?.focus({ preventScroll: true });
    }
    wasOpenRef.current = open;
  }, [open]);

  const visibleCastles = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query
      ? castles.filter((castle) => searchCopy(castle).includes(query))
      : castles;
  }, [castles, search]);

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onRequestClose('escape');
  };

  const handleJump = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!coordinateJump) return;
    const q = strictInteger(qValue);
    const r = strictInteger(rValue);
    if (q === undefined || r === undefined) {
      setJumpError('Enter whole-number q and r coordinates.');
      return;
    }
    const coord = { q, r };
    let valid = false;
    try {
      valid = coordinateJump.validate(coord);
    } catch {
      valid = false;
    }
    if (!valid) {
      setJumpError('That coordinate is not available in this realm.');
      return;
    }
    setJumpError(undefined);
    coordinateJump.onActivate(coord);
  };

  return (
    <div className="realm-cell-navigator">
      <button
        ref={setTriggerRef}
        type="button"
        aria-label={`Explore realm, ${castles.length} founded ${castles.length === 1 ? 'castle' : 'castles'}`}
        aria-controls={id}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={onRequestOpen}
      >
        Explore <span>{castles.length} {castles.length === 1 ? 'CASTLE' : 'CASTLES'}</span>
      </button>

      {open ? (
        <section
          id={id}
          className="realm-cell-navigator__dialog"
          role="dialog"
          aria-modal="false"
          aria-labelledby={headingId}
          onKeyDown={handleDialogKeyDown}
        >
          <header className="realm-cell-navigator__heading">
            <div>
              <span>EXPLORE THE REALM</span>
              <h2 id={headingId}>Explore</h2>
            </div>
            <button
              type="button"
              onClick={() => onRequestClose('close-button')}
            >
              CLOSE EXPLORE
            </button>
          </header>

          {cameraPresets.length > 0 ? (
            <section className="realm-cell-navigator__presets" aria-label="Realm views">
              <span>VIEWS</span>
              <div>
                {cameraPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={preset.active}
                    onClick={() => {
                      preset.onActivate();
                      onRequestClose('camera-preset');
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <label htmlFor={searchId}>Search founded castles</label>
          <input
            ref={searchRef}
            id={searchId}
            type="search"
            autoComplete="off"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Player, castle, or coordinates"
          />

          {visibleCastles.length > 0 ? (
            <ul className="realm-cell-navigator__castles" aria-label="Founded castles">
              {visibleCastles.map((castle) => {
                const own = castle.castleId === ownCastleId;
                const selected = castle.castleId === selectedCastleId;
                const status = [own ? 'your castle' : '', selected ? 'selected' : '']
                  .filter(Boolean)
                  .join(', ');
                return (
                  <li key={castle.castleId}>
                    <button
                      type="button"
                      aria-label={`Inspect ${castle.label}, ${castle.name}, q ${castle.q}, r ${castle.r}${status ? `, ${status}` : ''}`}
                      aria-pressed={selected}
                      data-own={own ? 'true' : 'false'}
                      onClick={() => onActivateCastle(castle)}
                    >
                      <strong>{castle.label}</strong>
                      <span>{castle.name}</span>
                      <small>q {castle.q} · r {castle.r}</small>
                      {own ? <em>YOUR CASTLE</em> : null}
                      {selected ? <em>SELECTED</em> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p role="status">
              {castles.length > 0
                ? 'No founded castles match this search.'
                : 'No founded castles are available.'}
            </p>
          )}

          <section
            aria-label="Warpkeep community"
            className="realm-cell-navigator__community"
          >
            <span>REALM COUNCIL</span>
            <p>Share feedback, wishes, and the stories shaping Genesis 001.</p>
            <a
              aria-label="Open the Warpkeep Farcaster channel to share feedback (opens in a new tab)"
              href={WARPKEEP_FARCASTER_CHANNEL_URL}
              referrerPolicy="no-referrer"
              rel="noopener noreferrer"
              target="_blank"
            >
              WARPKEEP CHANNEL <span aria-hidden="true">↗</span>
            </a>
          </section>

          {coordinateJump ? (
            <form className="realm-cell-navigator__jump" onSubmit={handleJump}>
              <fieldset>
                <legend>Jump to a realm coordinate</legend>
                <label htmlFor={qId}>q coordinate</label>
                <input
                  id={qId}
                  aria-describedby={jumpError ? jumpErrorId : undefined}
                  aria-invalid={jumpError ? 'true' : undefined}
                  inputMode="numeric"
                  maxLength={12}
                  value={qValue}
                  onChange={(event) => setQValue(event.currentTarget.value)}
                />
                <label htmlFor={rId}>r coordinate</label>
                <input
                  id={rId}
                  aria-describedby={jumpError ? jumpErrorId : undefined}
                  aria-invalid={jumpError ? 'true' : undefined}
                  inputMode="numeric"
                  maxLength={12}
                  value={rValue}
                  onChange={(event) => setRValue(event.currentTarget.value)}
                />
                <button type="submit">JUMP TO CELL</button>
              </fieldset>
              {jumpError ? <p id={jumpErrorId} role="alert">{jumpError}</p> : null}
            </form>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject
} from 'react';

import type { HexCoord } from '../../game/map/hexCoordinates';
import {
  WARPKEEP_FARCASTER_CHANNEL_URL,
  WARPKEEP_GITHUB_ISSUE_INTAKE_URL
} from '../../farcaster/farcasterProjectLinks';
import type { RealmResourceKind } from './realmTypes';

export type RealmNavigatorCastle = Readonly<{
  castleId: number;
  /** Trusted, privacy-bounded public identity label prepared by the parent. */
  label: string;
  /** Trusted authoritative castle name prepared by the parent. */
  name: string;
  q: number;
  r: number;
}>;

export type RealmNavigatorWaterBody = Readonly<{
  bodyId: string;
  label: string;
  sourceCellKey: string;
  mouthCellKey: string;
  sourceCoord: HexCoord;
  mouthCoord: HexCoord;
}>;

export type RealmNavigatorWorker = Readonly<{
  workerId: string;
  ordinal: number;
  originCastleId: number;
  originCastleName: string;
  status: 'idle' | 'outbound' | 'gathering' | 'returning';
  /** Idle keep location only; moving positions are resolved from the live scene on activation. */
  coord?: HexCoord;
  ownedByViewer: boolean;
}>;

export type RealmNavigatorResourceSite = Readonly<{
  /** Internal stable selection key; never rendered as player-facing copy. */
  key: string;
  resource: RealmResourceKind;
  label: string;
  tier: number;
  availability: 'available' | 'occupied' | 'reserved' | 'unavailable';
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
  workers?: readonly RealmNavigatorWorker[];
  resourceSites?: readonly RealmNavigatorResourceSite[];
  waterBodies?: readonly RealmNavigatorWaterBody[];
  ownCastleId?: number;
  selectedCastleId?: number;
  selectedWorkerId?: string;
  selectedResourceKey?: string;
  onRequestOpen: () => void;
  onRequestClose: (reason: RealmNavigatorCloseReason) => void;
  onActivateCastle: (castle: RealmNavigatorCastle) => void;
  onActivateWorker?: (worker: RealmNavigatorWorker) => void;
  onActivateResourceSite?: (site: RealmNavigatorResourceSite) => void;
  onActivateWaterCell?: (cellKey: string) => void;
  coordinateJump?: RealmNavigatorCoordinateJump;
  /** Enables operator-only q/r search, labels, and coordinate navigation. */
  showDiagnostics?: boolean;
  /** Compact and Mini App Explore is a hosted navigation destination. */
  hostedDestination?: boolean;
  cameraPresets?: readonly RealmNavigatorCameraPreset[];
  /** Player chrome may provide its own PFP launcher while reusing this dialog. */
  triggerVisible?: boolean;
  /**
   * Receives the internal trigger, or points at player chrome's external PFP
   * launcher; focus is restored here after controlled close.
   */
  triggerRef?: RefObject<HTMLButtonElement | null>;
}>;

const RESOURCE_SITE_KIND_LABELS: Readonly<Record<RealmResourceKind, string>> =
  Object.freeze({
    gold: 'Gold Mine',
    food: 'Wheat Farm',
    wood: 'Logging Camp',
    stone: 'Stone Quarry'
  });

const RESOURCE_SITE_AVAILABILITY_LABELS: Readonly<
  Record<RealmNavigatorResourceSite['availability'], string>
> = Object.freeze({
  available: 'Available',
  occupied: 'Occupied',
  reserved: 'Reserved',
  unavailable: 'Unavailable'
});

function strictInteger(value: string) {
  const normalized = value.trim();
  if (!/^-?\d+$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function searchCopy(castle: RealmNavigatorCastle, showDiagnostics: boolean) {
  const spatialCopy = showDiagnostics
    ? ` ${castle.q},${castle.r} q ${castle.q} r ${castle.r}`
    : '';
  return `${castle.label} ${castle.name}${spatialCopy}`.toLocaleLowerCase();
}

export function RealmAccessibilityControls({
  id,
  open,
  castles,
  workers = [],
  resourceSites = [],
  waterBodies = [],
  ownCastleId,
  selectedCastleId,
  selectedWorkerId,
  selectedResourceKey,
  onRequestOpen,
  onRequestClose,
  onActivateCastle,
  onActivateWorker,
  onActivateResourceSite,
  onActivateWaterCell,
  coordinateJump,
  showDiagnostics = false,
  hostedDestination = false,
  cameraPresets = [],
  triggerVisible = true,
  triggerRef
}: RealmAccessibilityControlsProps) {
  const [search, setSearch] = useState('');
  const [qValue, setQValue] = useState('');
  const [rValue, setRValue] = useState('');
  const [jumpError, setJumpError] = useState<string>();
  const internalTriggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const providedTriggerRef = useRef(triggerRef);
  const searchRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);
  const headingId = `${id}-title`;
  const searchId = `${id}-search`;
  const qId = `${id}-q`;
  const rId = `${id}-r`;
  const jumpErrorId = `${id}-jump-error`;

  providedTriggerRef.current = triggerRef;

  const setTriggerRef = useCallback((element: HTMLButtonElement | null) => {
    internalTriggerRef.current = element;
    if (triggerRef) triggerRef.current = element;
  }, [triggerRef]);

  useEffect(() => {
    if (open) {
      setSearch('');
      setQValue('');
      setRValue('');
      setJumpError(undefined);
      searchRef.current?.focus({ preventScroll: true });
    } else if (wasOpenRef.current) {
      const externalTrigger = providedTriggerRef.current?.current ?? null;
      (internalTriggerRef.current ?? externalTrigger)?.focus({ preventScroll: true });
    }
    wasOpenRef.current = open;
  }, [open]);

  const visibleCastles = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query
      ? castles.filter((castle) => searchCopy(castle, showDiagnostics).includes(query))
      : castles;
  }, [castles, search, showDiagnostics]);
  const visibleWaterBodies = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query
      ? waterBodies.filter((body) => (
        `${body.label}${showDiagnostics
          ? ` ${body.sourceCoord.q},${body.sourceCoord.r} ${body.mouthCoord.q},${body.mouthCoord.r}`
          : ''}`
          .toLocaleLowerCase()
          .includes(query)
      ))
      : waterBodies;
  }, [search, showDiagnostics, waterBodies]);
  const visibleWorkers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query
      ? workers.filter((worker) => (
        `worker ${worker.ordinal} ${worker.originCastleName} ${worker.status} ${
          showDiagnostics && worker.coord
            ? `${worker.coord.q},${worker.coord.r}`
            : worker.coord ? 'origin keep' : 'current route position'
        }`
          .toLocaleLowerCase()
          .includes(query)
      ))
      : workers;
  }, [search, showDiagnostics, workers]);
  const visibleResourceSites = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query
      ? resourceSites.filter((site) => (
        `${RESOURCE_SITE_KIND_LABELS[site.resource]} ${site.label} tier ${site.tier} ${
          RESOURCE_SITE_AVAILABILITY_LABELS[site.availability]
        }`
          .toLocaleLowerCase()
          .includes(query)
      ))
      : resourceSites;
  }, [resourceSites, search]);

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
      {triggerVisible ? (
        <button
          ref={setTriggerRef}
          type="button"
          aria-label={`Explore realm, ${castles.length} founded ${castles.length === 1 ? 'castle' : 'castles'}${waterBodies.length > 0 ? ` and ${waterBodies.length} public rivers` : ''}`}
          aria-controls={id}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={onRequestOpen}
        >
          Explore <span>{castles.length} {castles.length === 1 ? 'CASTLE' : 'CASTLES'}</span>
        </button>
      ) : null}

      {open ? (
        <section
          id={id}
          className="realm-cell-navigator__dialog"
          role={hostedDestination ? 'region' : 'dialog'}
          aria-modal={hostedDestination ? undefined : false}
          aria-labelledby={headingId}
          onKeyDown={handleDialogKeyDown}
          ref={dialogRef}
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

          <section
            aria-label="Warpkeep community"
            className="realm-cell-navigator__community"
          >
            <span>REALM COUNCIL</span>
            <p>Talk on Farcaster, or leave a durable bug report or realm wish.</p>
            <div className="realm-cell-navigator__community-actions">
              <a
                aria-label="Open the Warpkeep Farcaster channel to share feedback (opens in a new tab)"
                href={WARPKEEP_FARCASTER_CHANNEL_URL}
                referrerPolicy="no-referrer"
                rel="noopener noreferrer"
                target="_blank"
              >
                CHANNEL <span aria-hidden="true">↗</span>
              </a>
              <a
                aria-label="Propose / report a Warpkeep bug or realm wish on GitHub (opens in a new tab)"
                href={WARPKEEP_GITHUB_ISSUE_INTAKE_URL}
                referrerPolicy="no-referrer"
                rel="noopener noreferrer"
                target="_blank"
              >
                PROPOSE / REPORT <span aria-hidden="true">↗</span>
              </a>
            </div>
          </section>

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

          <label htmlFor={searchId}>Search castles, workers, resources, and water</label>
          <input
            ref={searchRef}
            id={searchId}
            type="search"
            autoComplete="off"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder={showDiagnostics
              ? 'Player, castle, worker, resource, water, or coordinates'
              : 'Player, castle, worker, resource, or water'}
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
                      aria-label={`Inspect ${castle.label}, ${castle.name}${showDiagnostics
                        ? `, q ${castle.q}, r ${castle.r}`
                        : ''}${status ? `, ${status}` : ''}`}
                      aria-pressed={selected}
                      data-own={own ? 'true' : 'false'}
                      onClick={() => onActivateCastle(castle)}
                    >
                      <strong>{castle.label}</strong>
                      <span>{castle.name}</span>
                      {showDiagnostics ? <small>q {castle.q} · r {castle.r}</small> : null}
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

          {visibleWorkers.length > 0 && onActivateWorker ? (
            <section className="realm-cell-navigator__workers" aria-label="Public workers">
              <span>WORKERS</span>
              <ul className="realm-cell-navigator__castles" aria-label="Public workers">
                {visibleWorkers.map((worker) => {
                  const selected = worker.workerId === selectedWorkerId;
                  const locationLabel = showDiagnostics && worker.coord
                    ? `q ${worker.coord.q}, r ${worker.coord.r}`
                    : worker.coord
                      ? 'at origin keep'
                    : 'current route position';
                  return (
                    <li key={worker.workerId}>
                      <button
                        type="button"
                        aria-label={`Inspect worker ${worker.ordinal}, ${worker.originCastleName}, ${worker.status}, ${locationLabel}${worker.ownedByViewer ? ', your worker' : ''}${selected ? ', selected' : ''}`}
                        aria-pressed={selected}
                        data-own={worker.ownedByViewer ? 'true' : 'false'}
                        onClick={() => onActivateWorker(worker)}
                      >
                        <strong>Worker {worker.ordinal}</strong>
                        <span>{worker.originCastleName}</span>
                        <small>
                          {worker.status.toLocaleUpperCase()} · {
                            showDiagnostics && worker.coord
                              ? `q ${worker.coord.q} · r ${worker.coord.r}`
                              : worker.coord ? 'ORIGIN KEEP' : 'CURRENT ROUTE POSITION'
                          }
                        </small>
                        {worker.ownedByViewer ? <em>YOUR WORKER</em> : null}
                        {selected ? <em>SELECTED</em> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {visibleResourceSites.length > 0 && onActivateResourceSite ? (
            <section
              className="realm-cell-navigator__workers realm-cell-navigator__resources"
              aria-label="Public resource sites"
            >
              <span>RESOURCE SITES</span>
              <ul className="realm-cell-navigator__castles" aria-label="Public resource sites">
                {visibleResourceSites.map((site) => {
                  const selected = site.key === selectedResourceKey;
                  const availabilityLabel =
                    RESOURCE_SITE_AVAILABILITY_LABELS[site.availability];
                  return (
                    <li key={site.key}>
                      <button
                        aria-label={`Inspect ${site.label}, tier ${site.tier}, ${availabilityLabel}${selected ? ', selected' : ''}`}
                        aria-pressed={selected}
                        className="realm-cell-navigator__resource-site"
                        data-resource-kind={site.resource}
                        data-resource-state={site.availability}
                        onClick={() => onActivateResourceSite(site)}
                        type="button"
                      >
                        <strong>{site.label}</strong>
                        <span>Tier {site.tier}</span>
                        <small>{availabilityLabel.toLocaleUpperCase()}</small>
                        {selected ? <em>SELECTED</em> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {visibleWaterBodies.length > 0 && onActivateWaterCell ? (
            <section className="realm-cell-navigator__water" aria-label="Public rivers">
              <span>PUBLIC WATER</span>
              <ul className="realm-cell-navigator__castles">
                {visibleWaterBodies.map((body) => (
                  <li key={body.bodyId}>
                    <div className="realm-cell-navigator__water-row">
                      <strong>{body.label}</strong>
                      <small>
                        {showDiagnostics
                          ? `source ${body.sourceCoord.q},${body.sourceCoord.r} · mouth ${body.mouthCoord.q},${body.mouthCoord.r}`
                          : 'Source and mouth records'}
                      </small>
                      <div>
                        <button type="button" onClick={() => onActivateWaterCell(body.sourceCellKey)}>SOURCE</button>
                        <button type="button" onClick={() => onActivateWaterCell(body.mouthCellKey)}>MOUTH</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {showDiagnostics && coordinateJump ? (
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

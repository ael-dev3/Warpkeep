import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
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
  /** Changes only when an explicit fresh Explore branch replaces retained history. */
  hostedNavigationResetKey?: string | number;
  cameraPresets?: readonly RealmNavigatorCameraPreset[];
  /** Player chrome may provide its own PFP launcher while reusing this dialog. */
  triggerVisible?: boolean;
  /**
   * Receives the internal trigger, or points at player chrome's external PFP
   * launcher; focus is restored here after controlled close.
   */
  triggerRef?: RefObject<HTMLButtonElement | null>;
}>;

type RealmNavigatorReturnState = Readonly<{
  focusKey: string;
  scrollTop: number;
}>;

type RealmNavigatorSectionKey = 'castles' | 'workers' | 'resources' | 'water';

type RealmNavigatorSectionExpansion = Readonly<Record<RealmNavigatorSectionKey, boolean>>;

const EXPANDED_SECTIONS: RealmNavigatorSectionExpansion = Object.freeze({
  castles: true,
  workers: true,
  resources: true,
  water: true
});

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

function countedItems(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function RealmNavigatorDisclosure({
  children,
  className,
  contentId,
  count,
  expanded,
  label,
  onToggle,
  section,
  totalCount
}: Readonly<{
  children: ReactNode;
  className?: string;
  contentId: string;
  count: number;
  expanded: boolean;
  label: string;
  onToggle: () => void;
  section: RealmNavigatorSectionKey;
  totalCount: number;
}>) {
  const countCopy = count === totalCount ? String(totalCount) : `${count}/${totalCount}`;
  const accessibleCountCopy = count === totalCount
    ? `${totalCount} ${totalCount === 1 ? 'item' : 'items'}`
    : `${count} of ${totalCount} matches`;
  return (
    <section className={[
      'realm-cell-navigator__section',
      className
    ].filter(Boolean).join(' ')}>
      <button
        aria-controls={contentId}
        aria-expanded={expanded}
        aria-label={`${label}, ${accessibleCountCopy}`}
        className="realm-cell-navigator__section-toggle"
        data-realm-explore-section={section}
        onClick={onToggle}
        type="button"
      >
        <strong>{label}</strong>
        <span className="realm-cell-navigator__section-count">{countCopy}</span>
        <span aria-hidden="true" className="realm-cell-navigator__section-chevron">⌄</span>
      </button>
      <div
        className="realm-cell-navigator__section-content"
        hidden={!expanded}
        id={contentId}
      >
        {children}
      </div>
    </section>
  );
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
  hostedNavigationResetKey,
  cameraPresets = [],
  triggerVisible = true,
  triggerRef
}: RealmAccessibilityControlsProps) {
  const [search, setSearch] = useState('');
  const [qValue, setQValue] = useState('');
  const [rValue, setRValue] = useState('');
  const [jumpError, setJumpError] = useState<string>();
  const [expandedSections, setExpandedSections] = useState<RealmNavigatorSectionExpansion>(
    EXPANDED_SECTIONS
  );
  const internalTriggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const providedTriggerRef = useRef(triggerRef);
  const searchRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);
  const nestedReturnRef = useRef<RealmNavigatorReturnState | undefined>(undefined);
  const hostedNavigationResetKeyRef = useRef(hostedNavigationResetKey);
  const headingId = `${id}-title`;
  const searchId = `${id}-search`;
  const qId = `${id}-q`;
  const rId = `${id}-r`;
  const jumpErrorId = `${id}-jump-error`;

  const toggleSection = useCallback((section: RealmNavigatorSectionKey) => {
    setExpandedSections((current) => Object.freeze({
      ...current,
      [section]: !current[section]
    }));
  }, []);

  providedTriggerRef.current = triggerRef;
  if (hostedNavigationResetKeyRef.current !== hostedNavigationResetKey) {
    hostedNavigationResetKeyRef.current = hostedNavigationResetKey;
    nestedReturnRef.current = undefined;
  }

  const setTriggerRef = useCallback((element: HTMLButtonElement | null) => {
    internalTriggerRef.current = element;
    if (triggerRef) triggerRef.current = element;
  }, [triggerRef]);

  useEffect(() => {
    if (open) {
      const nestedReturn = nestedReturnRef.current;
      if (hostedDestination && nestedReturn) {
        if (dialogRef.current) dialogRef.current.scrollTop = nestedReturn.scrollTop;
        const target = [
          ...(dialogRef.current?.querySelectorAll<HTMLElement>(
            '[data-realm-explore-focus-key]'
          ) ?? [])
        ].find((element) => (
          element.dataset.realmExploreFocusKey === nestedReturn.focusKey
        ));
        (target ?? searchRef.current)?.focus({ preventScroll: true });
      } else {
        nestedReturnRef.current = undefined;
        setExpandedSections(EXPANDED_SECTIONS);
        setSearch('');
        setQValue('');
        setRValue('');
        setJumpError(undefined);
        searchRef.current?.focus({ preventScroll: true });
      }
    } else if (wasOpenRef.current && !hostedDestination) {
      const externalTrigger = providedTriggerRef.current?.current ?? null;
      (internalTriggerRef.current ?? externalTrigger)?.focus({ preventScroll: true });
    }
    wasOpenRef.current = open;
  }, [hostedDestination, open]);

  const requestClose = (reason: RealmNavigatorCloseReason) => {
    nestedReturnRef.current = undefined;
    onRequestClose(reason);
  };

  const activateNestedDestination = (
    focusKey: string,
    action: () => void
  ) => {
    if (hostedDestination) {
      nestedReturnRef.current = Object.freeze({
        focusKey,
        scrollTop: dialogRef.current?.scrollTop ?? 0
      });
    }
    action();
  };

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
  const searchStatusCopy = `Explore search results: ${
    countedItems(visibleCastles.length, 'castle')
  }, ${countedItems(visibleWorkers.length, 'worker')}, ${
    countedItems(visibleResourceSites.length, 'resource site')
  }, and ${countedItems(visibleWaterBodies.length, 'water record')}.`;

  useEffect(() => {
    if (!open || search.trim().length === 0) return;
    const matchingSections: RealmNavigatorSectionExpansion = Object.freeze({
      castles: visibleCastles.length > 0,
      workers: visibleWorkers.length > 0,
      resources: visibleResourceSites.length > 0,
      water: visibleWaterBodies.length > 0
    });
    setExpandedSections((current) => {
      let changed = false;
      const next = { ...current };
      for (const section of Object.keys(matchingSections) as RealmNavigatorSectionKey[]) {
        if (matchingSections[section] && !current[section]) {
          next[section] = true;
          changed = true;
        }
      }
      return changed ? Object.freeze(next) : current;
    });
  }, [
    open,
    search,
    visibleCastles.length,
    visibleResourceSites.length,
    visibleWaterBodies.length,
    visibleWorkers.length
  ]);

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    requestClose('escape');
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
              onClick={() => requestClose('close-button')}
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
                      requestClose('camera-preset');
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
          {search.trim().length > 0 ? (
            <p className="warpkeep-visually-hidden" role="status">
              {searchStatusCopy}
            </p>
          ) : null}

          <RealmNavigatorDisclosure
            contentId={`${id}-castles`}
            count={visibleCastles.length}
            expanded={expandedSections.castles}
            label="CASTLES"
            onToggle={() => toggleSection('castles')}
            section="castles"
            totalCount={castles.length}
          >
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
                        data-realm-explore-focus-key={`castle:${castle.castleId}`}
                        data-own={own ? 'true' : 'false'}
                        onClick={() => activateNestedDestination(
                          `castle:${castle.castleId}`,
                          () => onActivateCastle(castle)
                        )}
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
              <p className="realm-cell-navigator__empty">
                {castles.length > 0
                  ? 'No founded castles match this search.'
                  : 'No founded castles are available.'}
              </p>
            )}
          </RealmNavigatorDisclosure>

          {workers.length > 0 && onActivateWorker ? (
            <RealmNavigatorDisclosure
              className="realm-cell-navigator__workers"
              contentId={`${id}-workers`}
              count={visibleWorkers.length}
              expanded={expandedSections.workers}
              label="WORKERS"
              onToggle={() => toggleSection('workers')}
              section="workers"
              totalCount={workers.length}
            >
              {visibleWorkers.length > 0 ? (
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
                          data-realm-explore-focus-key={`worker:${worker.workerId}`}
                          data-own={worker.ownedByViewer ? 'true' : 'false'}
                          onClick={() => activateNestedDestination(
                            `worker:${worker.workerId}`,
                            () => onActivateWorker(worker)
                          )}
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
              ) : <p className="realm-cell-navigator__empty">No public workers match this search.</p>}
            </RealmNavigatorDisclosure>
          ) : null}

          {resourceSites.length > 0 && onActivateResourceSite ? (
            <RealmNavigatorDisclosure
              className="realm-cell-navigator__resources"
              contentId={`${id}-resources`}
              count={visibleResourceSites.length}
              expanded={expandedSections.resources}
              label="RESOURCE SITES"
              onToggle={() => toggleSection('resources')}
              section="resources"
              totalCount={resourceSites.length}
            >
              {visibleResourceSites.length > 0 ? (
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
                          data-realm-explore-focus-key={`resource:${site.key}`}
                          data-resource-kind={site.resource}
                          data-resource-state={site.availability}
                          onClick={() => activateNestedDestination(
                            `resource:${site.key}`,
                            () => onActivateResourceSite(site)
                          )}
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
              ) : (
                <p className="realm-cell-navigator__empty">
                  No public resource sites match this search.
                </p>
              )}
            </RealmNavigatorDisclosure>
          ) : null}

          {waterBodies.length > 0 && onActivateWaterCell ? (
            <RealmNavigatorDisclosure
              className="realm-cell-navigator__water"
              contentId={`${id}-water`}
              count={visibleWaterBodies.length}
              expanded={expandedSections.water}
              label="PUBLIC WATER"
              onToggle={() => toggleSection('water')}
              section="water"
              totalCount={waterBodies.length}
            >
              {visibleWaterBodies.length > 0 ? (
                <ul className="realm-cell-navigator__castles" aria-label="Public rivers">
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
                          <button
                            data-realm-explore-focus-key={`water:${body.sourceCellKey}`}
                            type="button"
                            onClick={() => activateNestedDestination(
                              `water:${body.sourceCellKey}`,
                              () => onActivateWaterCell(body.sourceCellKey)
                            )}
                          >
                            SOURCE
                          </button>
                          <button
                            data-realm-explore-focus-key={`water:${body.mouthCellKey}`}
                            type="button"
                            onClick={() => activateNestedDestination(
                              `water:${body.mouthCellKey}`,
                              () => onActivateWaterCell(body.mouthCellKey)
                            )}
                          >
                            MOUTH
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="realm-cell-navigator__empty">
                  No public water records match this search.
                </p>
              )}
            </RealmNavigatorDisclosure>
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

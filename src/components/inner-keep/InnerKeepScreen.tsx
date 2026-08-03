import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import {
  INNER_KEEP_RESOURCE_ORDER,
  innerKeepPresentationIntegrity,
  isInnerKeepProjectNoCommitError,
  innerKeepQuoteAffordable,
  innerKeepQuoteBlockedReason,
  type InnerKeepBuildingKind,
  type InnerKeepBuildingPresentation,
  type InnerKeepCatalogueEntry,
  type InnerKeepPresentation,
  type InnerKeepProjectQuote,
  type InnerKeepResource,
  type InnerKeepSlotPresentation,
  type StartInnerKeepProject
} from './innerKeepPresentation';
import { emitWarpkeepSfx } from '../audio/sfxEvents';
import './InnerKeepScreen.css';

const RESOURCE_COPY: Readonly<Record<InnerKeepResource, Readonly<{
  label: string;
  icon: string;
}>>> = Object.freeze({
  food: Object.freeze({
    label: 'Food',
    icon: 'images/resources/hegemony-food-5c012a7e939f8796.webp'
  }),
  wood: Object.freeze({
    label: 'Wood',
    icon: 'images/resources/hegemony-wood-add35506da245240.webp'
  }),
  stone: Object.freeze({
    label: 'Stone',
    icon: 'images/resources/hegemony-stone-ac50a538fc202d15.webp'
  }),
  gold: Object.freeze({
    label: 'Gold',
    icon: 'images/resources/hegemony-gold-522eb5b1f40b5d51.webp'
  })
});

type SubmissionState = Readonly<{
  key: string;
  authoritySignature: string;
  phase: 'submitting' | 'awaiting-authority' | 'uncertain';
}>;

export type InnerKeepScreenProps = Readonly<{
  presentation: InnerKeepPresentation;
  selectedSlotId?: string;
  selectedBuildingKind?: InnerKeepBuildingKind;
  renderMode?: 'webgl' | 'fallback';
  onBack: () => void;
  onCloseToRealm: () => void;
  onOpenSlot: (slotId: string) => void;
  onReviewBuilding: (buildingKind: InnerKeepBuildingKind) => void;
  onStartProject?: StartInnerKeepProject;
  onRequestSync?: () => void;
}>;

function publicAssetUrl(path: string) {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`;
}

function compactQuantity(value: bigint) {
  const absolute = value < 0n ? -value : value;
  const sign = value < 0n ? '-' : '';
  if (absolute < 1_000n) return `${value}`;
  if (absolute < 1_000_000n) {
    const whole = absolute / 1_000n;
    const decimal = (absolute % 1_000n) / 100n;
    return `${sign}${whole}${decimal > 0n ? `.${decimal}` : ''}k`;
  }
  const whole = absolute / 1_000_000n;
  const decimal = (absolute % 1_000_000n) / 100_000n;
  return `${sign}${whole}${decimal > 0n ? `.${decimal}` : ''}m`;
}

function exactQuantity(value: bigint) {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function durationCopy(durationMicros: bigint) {
  const totalMinutes = (durationMicros + 59_999_999n) / 60_000_000n;
  const days = totalMinutes / (24n * 60n);
  const hours = (totalMinutes % (24n * 60n)) / 60n;
  const minutes = totalMinutes % 60n;
  const parts: string[] = [];
  if (days > 0n) parts.push(`${days} ${days === 1n ? 'day' : 'days'}`);
  if (hours > 0n) parts.push(`${hours} ${hours === 1n ? 'hour' : 'hours'}`);
  if (minutes > 0n && days === 0n) {
    parts.push(`${minutes} ${minutes === 1n ? 'minute' : 'minutes'}`);
  }
  return parts.join(' ') || 'Less than one minute';
}

function basisPointsPercentCopy(basisPoints: number) {
  const whole = Math.floor(basisPoints / 100);
  const fraction = basisPoints % 100;
  return fraction === 0
    ? `${whole}%`
    : `${whole}.${String(fraction).padStart(2, '0').replace(/0+$/, '')}%`;
}

function completedEffectCopy(entry: InnerKeepCatalogueEntry, completedLevel: number) {
  const basisPoints = Math.min(
    entry.discountCapBasisPoints,
    entry.discountBasisPointsPerLevel * completedLevel
  );
  return `${RESOURCE_COPY[entry.matchingDiscountResource].label} construction costs -${basisPointsPercentCopy(basisPoints)}.`;
}

function remainingCopy(completesAtMicros: bigint, nowMilliseconds: number) {
  const nowMicros = BigInt(Math.max(0, Math.trunc(nowMilliseconds))) * 1_000n;
  if (completesAtMicros <= nowMicros) return 'FINALIZING WITH THE REALM…';
  const remaining = completesAtMicros - nowMicros;
  const minutes = (remaining + 59_999_999n) / 60_000_000n;
  const days = minutes / (24n * 60n);
  const hours = (minutes % (24n * 60n)) / 60n;
  const minuteRemainder = minutes % 60n;
  if (days > 0n) return `${days}d ${hours}h remaining`;
  if (hours > 0n) return `${hours}h ${minuteRemainder}m remaining`;
  return `${minuteRemainder}m remaining`;
}

function dateTimeForMicros(value: bigint) {
  const milliseconds = value / 1_000n;
  if (milliseconds < 0n || milliseconds > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;
  const date = new Date(Number(milliseconds));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function useCoarseClock(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function buildingLabel(
  catalogue: readonly InnerKeepCatalogueEntry[],
  buildingKind: InnerKeepBuildingKind
) {
  return catalogue.find((entry) => entry.buildingKind === buildingKind)?.label
    ?? 'Inner Keep building';
}

function projectAuthoritySignature(presentation: InnerKeepPresentation) {
  return [
    presentation.castleId,
    presentation.layoutId,
    presentation.layoutVersion,
    presentation.projectRevision.toString(),
    presentation.phase,
    presentation.builder.state,
    presentation.builder.state === 'busy'
      ? `${presentation.builder.slotId}:${presentation.builder.buildingKind}:`
        + `${presentation.builder.targetLevel}:${presentation.builder.completesAtMicros}`
      : 'idle'
  ].join('|');
}

function SmokeWorksite({ reduced = false }: Readonly<{ reduced?: boolean }>) {
  return (
    <span
      aria-hidden="true"
      className="inner-keep-worksite"
      data-reduced-motion={reduced || undefined}
    >
      <span className="inner-keep-worksite__foundation" />
      <span className="inner-keep-worksite__scaffold" />
      <span className="inner-keep-worksite__smoke inner-keep-worksite__smoke--one" />
      <span className="inner-keep-worksite__smoke inner-keep-worksite__smoke--two" />
      <span className="inner-keep-worksite__smoke inner-keep-worksite__smoke--three" />
      <span className="inner-keep-worksite__dust" />
    </span>
  );
}

function BuildingArt({ entry }: Readonly<{ entry?: InnerKeepCatalogueEntry }>) {
  return entry?.previewUrl ? (
    <img
      alt=""
      aria-hidden="true"
      className="inner-keep-building-art"
      decoding="async"
      draggable="false"
      src={entry.previewUrl}
    />
  ) : (
    <span aria-hidden="true" className="inner-keep-building-art-fallback">
      <span />
      <span />
      <span />
    </span>
  );
}

function SlotContents({
  building,
  catalogue
}: Readonly<{
  building?: InnerKeepBuildingPresentation;
  catalogue: readonly InnerKeepCatalogueEntry[];
}>) {
  if (!building) {
    return (
      <>
        <span aria-hidden="true" className="inner-keep-slot__empty-mark">＋</span>
        <strong>Empty build site</strong>
        <small>Choose a project</small>
      </>
    );
  }
  const entry = catalogue.find((candidate) => (
    candidate.buildingKind === building.buildingKind
  ));
  if (building.phase === 'constructing') {
    return (
      <>
        <SmokeWorksite />
        <strong>{entry?.label ?? 'Construction site'}</strong>
        <small>Building Level {building.targetLevel}</small>
      </>
    );
  }
  return (
    <>
      <BuildingArt entry={entry} />
      <strong>{entry?.label ?? 'Completed building'}</strong>
      <small>Level {building.completedLevel}</small>
    </>
  );
}

function ResourceCost({ quote }: Readonly<{ quote: InnerKeepProjectQuote }>) {
  return (
    <dl className="inner-keep-project-cost" aria-label="Construction cost">
      {INNER_KEEP_RESOURCE_ORDER.map((resource) => (
        <div key={resource} data-resource={resource}>
          <dt>{RESOURCE_COPY[resource].label}</dt>
          <dd>{exactQuantity(quote.cost[resource])}</dd>
        </div>
      ))}
    </dl>
  );
}

function firstQuoteFor(
  presentation: InnerKeepPresentation,
  slot: InnerKeepSlotPresentation,
  buildingKind: InnerKeepBuildingKind,
  building: InnerKeepBuildingPresentation | undefined
) {
  const targetLevel = building?.phase === 'complete'
    ? building.completedLevel + 1
    : 1;
  return presentation.quotes.find((quote) => (
    quote.slotId === slot.slotId
    && quote.buildingKind === buildingKind
    && quote.targetLevel === targetLevel
  ));
}

function CataloguePanel({
  presentation,
  slot,
  onReviewBuilding
}: Readonly<{
  presentation: InnerKeepPresentation;
  slot: InnerKeepSlotPresentation;
  onReviewBuilding: (buildingKind: InnerKeepBuildingKind) => void;
}>) {
  if (!slot.active) {
    return (
      <p className="inner-keep-panel__empty">
        This large site is reserved for a future Inner Keep expansion.
      </p>
    );
  }
  const builtKinds = new Set(
    presentation.buildings.map((building) => building.buildingKind)
  );
  const entries = presentation.catalogue.filter((entry) => (
    entry.footprintClass === slot.footprintClass
    && !builtKinds.has(entry.buildingKind)
  ));
  return entries.length > 0 ? (
    <ul className="inner-keep-catalogue" aria-label={`Projects for ${slot.label}`}>
      {entries.map((entry) => {
        const quote = firstQuoteFor(presentation, slot, entry.buildingKind, undefined);
        const reason = quote
          ? innerKeepQuoteBlockedReason(quote, presentation.resources.available)
          : 'Authoritative project details are unavailable.';
        return (
          <li key={entry.buildingKind}>
            <BuildingArt entry={entry} />
            <div>
              <p>ECONOMY BUILDING</p>
              <h3>{entry.label}</h3>
              <span>Level 1</span>
            </div>
            {quote ? <ResourceCost quote={quote} /> : null}
            <dl className="inner-keep-catalogue__timing">
              <div>
                <dt>Build time</dt>
                <dd>{quote ? durationCopy(quote.durationMicros) : 'Unavailable'}</dd>
              </div>
            </dl>
            <p>{entry.effectCopy}</p>
            <button
              data-inner-keep-building-kind={entry.buildingKind}
              disabled={!quote}
              onClick={() => onReviewBuilding(entry.buildingKind)}
              type="button"
            >
              REVIEW BUILD
            </button>
            {reason ? <small>{reason}</small> : null}
          </li>
        );
      })}
    </ul>
  ) : (
    <p className="inner-keep-panel__empty">
      No compatible new economy project is available for this site.
    </p>
  );
}

export function InnerKeepScreen({
  presentation,
  selectedSlotId,
  selectedBuildingKind,
  onBack,
  onCloseToRealm,
  onOpenSlot,
  onReviewBuilding,
  onStartProject,
  onRequestSync,
  renderMode = 'fallback'
}: InnerKeepScreenProps) {
  const valid = innerKeepPresentationIntegrity(presentation);
  const orderedSlots = useMemo(() => (
    [...presentation.slots].sort((left, right) => left.sortOrder - right.sortOrder)
  ), [presentation.slots]);
  const buildingsBySlot = useMemo(() => new Map(
    presentation.buildings.map((building) => [building.slotId, building] as const)
  ), [presentation.buildings]);
  const selectedSlot = orderedSlots.find((slot) => slot.slotId === selectedSlotId);
  const selectedBuilding = selectedSlot
    ? buildingsBySlot.get(selectedSlot.slotId)
    : undefined;
  const selectedEntry = selectedBuildingKind
    ? presentation.catalogue.find((entry) => (
        entry.buildingKind === selectedBuildingKind
      ))
    : selectedBuilding
      ? presentation.catalogue.find((entry) => (
          entry.buildingKind === selectedBuilding.buildingKind
        ))
      : undefined;
  const selectedQuote = selectedSlot && selectedBuildingKind
    ? firstQuoteFor(
        presentation,
        selectedSlot,
        selectedBuildingKind,
        selectedBuilding
      )
    : selectedSlot && selectedBuilding?.phase === 'complete'
      ? firstQuoteFor(
          presentation,
          selectedSlot,
          selectedBuilding.buildingKind,
          selectedBuilding
        )
      : undefined;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);
  const slotButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const previousSelectedSlotIdRef = useRef<string | undefined>(selectedSlotId);
  const submissionRef = useRef<SubmissionState | null>(null);
  const [submission, setSubmission] = useState<SubmissionState | null>(null);
  const [syncPending, setSyncPending] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const priorBuildingPhasesRef = useRef<Map<string, string> | null>(null);
  const authoritySignature = projectAuthoritySignature(presentation);
  const now = useCoarseClock(presentation.builder.state === 'busy');

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const previousSlotId = previousSelectedSlotIdRef.current;
    previousSelectedSlotIdRef.current = selectedSlotId;
    if (selectedSlotId) {
      panelHeadingRef.current?.focus({ preventScroll: true });
      return;
    }
    if (previousSlotId) {
      slotButtonRefs.current.get(previousSlotId)?.focus({ preventScroll: true });
    }
  }, [selectedBuildingKind, selectedSlotId]);

  useEffect(() => {
    const current = new Map(presentation.buildings.map((building) => [
      building.slotId,
      `${building.phase}:${building.completedLevel}:${building.targetLevel}:${building.revision}`
    ]));
    const previous = priorBuildingPhasesRef.current;
    priorBuildingPhasesRef.current = current;
    if (!previous) return;
    for (const building of presentation.buildings) {
      const prior = previous.get(building.slotId);
      const label = buildingLabel(presentation.catalogue, building.buildingKind);
      if (!prior?.startsWith('constructing:') && building.phase === 'constructing') {
        setAnnouncement(`Construction begun. ${label}, Level ${building.targetLevel}.`);
        emitWarpkeepSfx({ kind: 'inner-keep-project-confirmed' });
        return;
      }
      if (prior?.startsWith('constructing:') && building.phase === 'complete') {
        setAnnouncement(`${label}, Level ${building.completedLevel}, is complete.`);
        emitWarpkeepSfx({ kind: 'inner-keep-project-completed' });
        return;
      }
    }
  }, [presentation.buildings, presentation.catalogue]);

  useEffect(() => {
    const sealed = submissionRef.current;
    if (!sealed || sealed.authoritySignature === authoritySignature) return;
    submissionRef.current = null;
    setSubmission(null);
  }, [authoritySignature]);

  const openSlot = useCallback((slotId: string) => {
    onOpenSlot(slotId);
  }, [onOpenSlot]);

  const startProject = useCallback(async (
    slotId: string,
    buildingKind: InnerKeepBuildingKind
  ) => {
    if (!onStartProject || submissionRef.current) return;
    const next: SubmissionState = {
      key: `${slotId}:${buildingKind}`,
      authoritySignature,
      phase: 'submitting'
    };
    submissionRef.current = next;
    setSubmission(next);
    setAnnouncement('Submitting construction for authoritative confirmation.');
    try {
      await onStartProject(slotId, buildingKind);
      if (submissionRef.current !== next) return;
      const awaiting = { ...next, phase: 'awaiting-authority' as const };
      submissionRef.current = awaiting;
      setSubmission(awaiting);
    } catch (error) {
      if (submissionRef.current !== next) return;
      if (isInnerKeepProjectNoCommitError(error)) {
        submissionRef.current = null;
        setSubmission(null);
        setAnnouncement('Construction was not started. Review the current Realm status and try again.');
        return;
      }
      const uncertain = { ...next, phase: 'uncertain' as const };
      submissionRef.current = uncertain;
      setSubmission(uncertain);
      setAnnouncement('Construction was not confirmed locally. Check the authoritative Realm status before trying again.');
    }
  }, [authoritySignature, onStartProject]);

  const checkStatus = useCallback(() => {
    if (!onRequestSync || syncPending) return;
    setSyncPending(true);
    try {
      onRequestSync();
    } finally {
      window.setTimeout(() => setSyncPending(false), 500);
    }
  }, [onRequestSync, syncPending]);

  const submissionKey = selectedSlot && selectedEntry
    ? `${selectedSlot.slotId}:${selectedEntry.buildingKind}`
    : undefined;
  const selectedSubmission = submissionKey && submission?.key === submissionKey
    ? submission
    : undefined;
  const quoteAffordable = selectedQuote
    ? innerKeepQuoteAffordable(selectedQuote, presentation.resources.available)
    : false;
  const quoteBlockedReason = selectedQuote
    ? innerKeepQuoteBlockedReason(selectedQuote, presentation.resources.available)
    : 'Authoritative project details are unavailable.';
  const commandBlockedReason = !valid
    ? 'Inner Keep layout could not be verified.'
    : !presentation.commandsEnabled
      ? presentation.statusMessage ?? 'Construction controls are read-only.'
      : presentation.phase !== 'ready'
      ? presentation.statusMessage ?? 'Construction controls are synchronizing.'
      : presentation.builder.state === 'busy'
        ? 'The Builder is occupied. Only one project can be active.'
        : quoteBlockedReason;
  const statusCheckRequired = presentation.phase === 'synchronizing'
    || presentation.phase === 'failed';
  const startDisabled = Boolean(
    !valid
    || !selectedSlot
    || !selectedEntry
    || !selectedQuote
    || !quoteAffordable
    || commandBlockedReason
    || !onStartProject
    || submission
  );
  const builder = presentation.builder;
  const activeBuilding = builder.state === 'busy'
    ? presentation.buildings.find((building) => (
        building.slotId === builder.slotId
    ))
    : undefined;
  const builtKinds = new Set(
    presentation.buildings.map((building) => building.buildingKind)
  );
  const idleEmptyGuidanceSlot = orderedSlots.find((slot) => (
    slot.active
    && !buildingsBySlot.has(slot.slotId)
    && presentation.catalogue.some((entry) => (
      entry.footprintClass === slot.footprintClass
      && !builtKinds.has(entry.buildingKind)
      && presentation.quotes.some((quote) => (
        quote.slotId === slot.slotId
        && quote.buildingKind === entry.buildingKind
        && quote.targetLevel === 1
      ))
    ))
  ));
  const idleUpgradeGuidanceBuilding = orderedSlots
    .map((slot) => buildingsBySlot.get(slot.slotId))
    .find((building) => {
      if (!building || building.phase !== 'complete') return false;
      const entry = presentation.catalogue.find((candidate) => (
        candidate.buildingKind === building.buildingKind
      ));
      return entry !== undefined
        && building.completedLevel < entry.maximumLevel
        && presentation.quotes.some((quote) => (
          quote.slotId === building.slotId
          && quote.buildingKind === building.buildingKind
          && quote.targetLevel === building.completedLevel + 1
        ));
    });
  const idleBuilderGuidanceSlotId = idleEmptyGuidanceSlot?.slotId
    ?? idleUpgradeGuidanceBuilding?.slotId;

  return (
    <section
      aria-labelledby="inner-keep-title"
      className="inner-keep"
      data-inner-keep-renderer={renderMode}
      data-inner-keep-phase={presentation.phase}
      data-inner-keep-valid={String(valid)}
    >
      <header className="inner-keep__header">
        <button aria-label="Back" onClick={onBack} type="button">
          <span aria-hidden="true">‹</span>
          BACK
        </button>
        <div>
          <p>YOUR CASTLE</p>
          <h1 id="inner-keep-title" ref={headingRef} tabIndex={-1}>INNER KEEP</h1>
        </div>
        <button onClick={onCloseToRealm} type="button">CLOSE TO REALM</button>
      </header>

      <section aria-label="Stored construction resources" className="inner-keep__resources">
        <ul>
          {INNER_KEEP_RESOURCE_ORDER.map((resource) => {
            const copy = RESOURCE_COPY[resource];
            const pending = presentation.resources.pending?.[resource] ?? 0n;
            return (
              <li key={resource}>
                <img
                  alt=""
                  aria-hidden="true"
                  decoding="async"
                  height="64"
                  src={publicAssetUrl(copy.icon)}
                  width="64"
                />
                <span>{copy.label}</span>
                <strong aria-label={`${exactQuantity(
                  presentation.resources.available[resource]
                )} stored ${copy.label}`}>
                  {compactQuantity(presentation.resources.available[resource])}
                </strong>
                {pending > 0n ? (
                  <small>{compactQuantity(pending)} pending · not spendable</small>
                ) : null}
              </li>
            );
          })}
        </ul>
        {statusCheckRequired ? (
          <div className="inner-keep__authority-status">
            <p role="status">
              {presentation.statusMessage
                ?? 'Construction status needs an authoritative Realm check.'}
            </p>
            {onRequestSync ? (
              <button disabled={syncPending} onClick={checkStatus} type="button">
                {syncPending ? 'CHECKING…' : 'CHECK REALM STATUS'}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="inner-keep__stage">
        {!valid ? (
          <section className="inner-keep__unavailable" role="alert">
            <h2>Inner Keep layout unavailable</h2>
            <p>The current layout did not pass its twelve-site integrity check.</p>
            {onRequestSync ? (
              <button disabled={syncPending} onClick={checkStatus} type="button">
                {syncPending ? 'CHECKING…' : 'CHECK STATUS'}
              </button>
            ) : null}
          </section>
        ) : presentation.phase === 'loading' ? (
          <section className="inner-keep__unavailable" role="status">
            <h2>Opening your Inner Keep…</h2>
            <p>Loading the authoritative layout and Builder state.</p>
          </section>
        ) : (
          <section
            aria-label={`${renderMode === 'webgl' ? 'Interactive' : 'Schematic'} Inner Keep with twelve build sites`}
            className="inner-keep-map"
          >
            <div aria-hidden="true" className="inner-keep-map__wall" />
            <div aria-hidden="true" className="inner-keep-map__road inner-keep-map__road--vertical" />
            <div aria-hidden="true" className="inner-keep-map__road inner-keep-map__road--horizontal" />
            <div aria-label="Central Hegemony keep" className="inner-keep-map__keep">
              <span aria-hidden="true" />
              <strong>HEGEMONY KEEP</strong>
              <small>Central keep</small>
            </div>
            <ol aria-label="Inner Keep build sites" className="inner-keep-map__slots">
              {orderedSlots.map((slot) => {
                const building = buildingsBySlot.get(slot.slotId);
                const selected = slot.slotId === selectedSlotId;
                const description = !slot.active
                  ? 'Reserved future build site'
                  : building?.phase === 'constructing'
                  ? `${buildingLabel(
                      presentation.catalogue,
                      building.buildingKind
                    )}, Building Level ${building.targetLevel}`
                  : building
                    ? `${buildingLabel(
                        presentation.catalogue,
                        building.buildingKind
                      )}, Level ${building.completedLevel}`
                    : 'Empty build site';
                return (
                  <li
                    key={slot.slotId}
                    data-active={String(slot.active)}
                    data-footprint={slot.footprintClass}
                  >
                    <button
                      aria-label={`${slot.label}. ${description}.`}
                      aria-pressed={selected}
                      data-inner-keep-slot-id={slot.slotId}
                      data-warpkeep-sfx="none"
                      onClick={() => openSlot(slot.slotId)}
                      onKeyDown={(event) => {
                        if (
                          event.repeat
                          || ![
                            'Enter',
                            ' ',
                            'Space',
                            'Spacebar'
                          ].includes(event.key)
                        ) return;
                        // Keep keyboard and assistive activation independent
                        // from the pointer-transparent WebGL control index.
                        event.preventDefault();
                        openSlot(slot.slotId);
                      }}
                      ref={(element) => {
                        if (element) slotButtonRefs.current.set(slot.slotId, element);
                        else slotButtonRefs.current.delete(slot.slotId);
                      }}
                      type="button"
                    >
                      <span className="inner-keep-slot__label">{slot.label}</span>
                      {slot.active ? (
                        <SlotContents building={building} catalogue={presentation.catalogue} />
                      ) : (
                        <>
                          <span aria-hidden="true" className="inner-keep-slot__empty-mark">◇</span>
                          <strong>Reserved site</strong>
                          <small>Future expansion</small>
                        </>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </div>

      <button
        className="inner-keep-builder"
        data-warpkeep-sfx="none"
        disabled={!valid || (
          presentation.builder.state === 'idle'
          && idleBuilderGuidanceSlotId === undefined
        )}
        onClick={() => {
          if (presentation.builder.state === 'busy') {
            openSlot(presentation.builder.slotId);
            return;
          }
          if (idleBuilderGuidanceSlotId) openSlot(idleBuilderGuidanceSlotId);
        }}
        type="button"
      >
        <span aria-hidden="true" className="inner-keep-builder__crest">⚒</span>
        <span>
          <small>{presentation.builder.state === 'idle'
            ? 'BUILDER AVAILABLE'
            : 'BUILDER OCCUPIED'}</small>
          <strong>{presentation.builder.state === 'idle'
            ? idleBuilderGuidanceSlotId
              ? 'Choose an empty site or finished building'
              : 'All current buildings are fully developed'
            : `${buildingLabel(
                presentation.catalogue,
                presentation.builder.buildingKind
              )} · Building Level ${presentation.builder.targetLevel}`}</strong>
          {presentation.builder.state === 'busy' ? (
            <time dateTime={dateTimeForMicros(presentation.builder.completesAtMicros)}>
              {remainingCopy(presentation.builder.completesAtMicros, now)}
            </time>
          ) : null}
        </span>
      </button>

      {selectedSlot ? (
        <aside
          aria-labelledby="inner-keep-panel-title"
          className="inner-keep-panel"
          data-panel-kind={selectedBuildingKind ? 'confirmation' : 'site'}
        >
          <header>
            <div>
              <p>{selectedBuildingKind ? 'REVIEW PROJECT' : 'BUILD SITE'}</p>
              <h2 id="inner-keep-panel-title" ref={panelHeadingRef} tabIndex={-1}>
                {selectedBuildingKind && selectedEntry
                  ? selectedEntry.label
                  : selectedBuilding && selectedEntry
                    ? selectedEntry.label
                    : selectedSlot.label}
              </h2>
            </div>
            <button aria-label="Back" onClick={onBack} type="button">×</button>
          </header>

          <div className="inner-keep-panel__body">
            {selectedBuildingKind && selectedEntry ? (
              <section className="inner-keep-confirmation">
                <BuildingArt entry={selectedEntry} />
                <p className="inner-keep-confirmation__prompt">
                  {selectedBuilding?.phase === 'complete' ? 'UPGRADE' : 'BUILD'}{' '}
                  {selectedEntry.label}?
                </p>
                <dl>
                  <div><dt>Slot</dt><dd>{selectedSlot.label}</dd></div>
                  <div>
                    <dt>Target level</dt>
                    <dd>{selectedQuote?.targetLevel ?? 'Unavailable'}</dd>
                  </div>
                  <div>
                    <dt>Builder occupied for</dt>
                    <dd>{selectedQuote
                      ? durationCopy(selectedQuote.durationMicros)
                      : 'Unavailable'}</dd>
                  </div>
                </dl>
                {selectedQuote ? <ResourceCost quote={selectedQuote} /> : null}
                <p>{selectedEntry.effectCopy}</p>
                <p className="inner-keep-confirmation__rule">
                  Only one project can be active. Construction cannot be cancelled in this Alpha.
                </p>
                <button
                  data-command-intent="primary"
                  disabled={startDisabled}
                  onClick={() => {
                    void startProject(selectedSlot.slotId, selectedEntry.buildingKind);
                  }}
                  type="button"
                >
                  {selectedSubmission?.phase === 'submitting'
                    ? 'SUBMITTING…'
                    : selectedSubmission
                      ? 'AWAITING REALM STATUS'
                      : 'START CONSTRUCTION'}
                </button>
                {startDisabled ? (
                  <p className="inner-keep-confirmation__blocked" role="status">
                    {selectedSubmission
                      ? selectedSubmission.phase === 'uncertain'
                        ? 'The result is uncertain. This action remains sealed until authoritative state changes.'
                        : 'Waiting for the authoritative construction record.'
                      : !onStartProject
                        ? 'Construction is not active on this backend.'
                        : commandBlockedReason}
                  </p>
                ) : null}
                {selectedSubmission && !statusCheckRequired && onRequestSync ? (
                  <button disabled={syncPending} onClick={checkStatus} type="button">
                    {syncPending ? 'CHECKING…' : 'CHECK STATUS'}
                  </button>
                ) : null}
                <button onClick={onBack} type="button">BACK</button>
              </section>
            ) : selectedBuilding?.phase === 'constructing' ? (
              <section className="inner-keep-active-project">
                <SmokeWorksite />
                <p>CONSTRUCTION IN PROGRESS</p>
                <h3>{selectedEntry?.label ?? 'Inner Keep building'}</h3>
                <strong>Building Level {selectedBuilding.targetLevel}</strong>
                {selectedBuilding.completesAtMicros !== undefined ? (
                  <time dateTime={dateTimeForMicros(selectedBuilding.completesAtMicros)}>
                    {remainingCopy(selectedBuilding.completesAtMicros, now)}
                  </time>
                ) : null}
                <p>The Realm completes this project automatically. No claim action is needed.</p>
              </section>
            ) : selectedBuilding && selectedEntry ? (
              <section className="inner-keep-building-detail">
                <BuildingArt entry={selectedEntry} />
                <p>COMPLETED BUILDING</p>
                <h3>{selectedEntry.label}</h3>
                <strong>Level {selectedBuilding.completedLevel}</strong>
                <p>
                  <strong>Current effect: </strong>
                  {completedEffectCopy(selectedEntry, selectedBuilding.completedLevel)}
                </p>
                {selectedBuilding.completedLevel >= selectedEntry.maximumLevel ? (
                  <p>Maximum Alpha level reached.</p>
                ) : selectedQuote ? (
                  <>
                    <dl className="inner-keep-building-detail__next">
                      <div>
                        <dt>Next level</dt>
                        <dd>{selectedQuote.targetLevel}</dd>
                      </div>
                      <div>
                        <dt>Build time</dt>
                        <dd>{durationCopy(selectedQuote.durationMicros)}</dd>
                      </div>
                      <div>
                        <dt>Builder</dt>
                        <dd>{presentation.builder.state === 'idle'
                          ? 'Available'
                          : 'Occupied'}</dd>
                      </div>
                    </dl>
                    <ResourceCost quote={selectedQuote} />
                    <button
                      onClick={() => onReviewBuilding(selectedEntry.buildingKind)}
                      type="button"
                    >
                      REVIEW LEVEL {selectedQuote.targetLevel} UPGRADE
                    </button>
                  </>
                ) : (
                  <p>The authoritative upgrade quote is not available.</p>
                )}
              </section>
            ) : (
              <CataloguePanel
                onReviewBuilding={onReviewBuilding}
                presentation={presentation}
                slot={selectedSlot}
              />
            )}
          </div>
        </aside>
      ) : null}

      <p aria-atomic="true" aria-live="polite" className="warpkeep-visually-hidden">
        {announcement}
      </p>
      {activeBuilding?.phase === 'constructing' ? (
        <span className="warpkeep-visually-hidden">
          The finished building model is hidden until authoritative completion.
        </span>
      ) : null}
    </section>
  );
}

export default InnerKeepScreen;

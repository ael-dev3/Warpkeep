import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  INNER_KEEP_RESOURCE_ORDER,
  innerKeepBasisPointsPercentCopy,
  innerKeepPresentationIntegrity,
  innerKeepQuoteAffordable,
  innerKeepQuoteBlockedReason,
  isInnerKeepProjectNoCommitError,
  type InnerKeepBuildingKind,
  type InnerKeepBuildingPresentation,
  type InnerKeepCatalogueEntry,
  type InnerKeepPlacementTransform,
  type InnerKeepPresentation,
  type InnerKeepProjectIntent,
  type InnerKeepProjectQuote,
  type InnerKeepResource,
  type StartInnerKeepProject,
} from './innerKeepPresentation';
import {
  evaluateInnerKeepPlacementDraft,
  initialInnerKeepPlacementDraft,
  innerKeepPlacementMetersCopy,
  innerKeepPlacementReasonCopy,
  nudgeInnerKeepPlacementDraft,
  rotateInnerKeepPlacementDraft,
  type InnerKeepPlacementDraft,
} from './innerKeepPlacement';
import {
  INNER_KEEP_FREE_PLACEMENT_ENVELOPES,
  INNER_KEEP_FREE_PLACEMENT_POLICY,
} from './innerKeepFreePlacementPolicy';
import { emitWarpkeepSfx } from '../audio/sfxEvents';
import { useRealmRemainingDuration } from '../realm/realmAuthoritySchedule';
import { formatCompactRealmResourceQuantity } from '../realm/realmResourcePresentation';
import './InnerKeepScreen.css';

const RESOURCE_COPY: Readonly<Record<InnerKeepResource, Readonly<{
  label: string;
  icon: string;
}>>> = Object.freeze({
  food: Object.freeze({
    label: 'Food',
    icon: 'images/resources/hegemony-food-5c012a7e939f8796.webp',
  }),
  wood: Object.freeze({
    label: 'Wood',
    icon: 'images/resources/hegemony-wood-add35506da245240.webp',
  }),
  stone: Object.freeze({
    label: 'Stone',
    icon: 'images/resources/hegemony-stone-ac50a538fc202d15.webp',
  }),
  gold: Object.freeze({
    label: 'Gold',
    icon: 'images/resources/hegemony-gold-522eb5b1f40b5d51.webp',
  }),
});

type SubmissionState = Readonly<{
  key: string;
  authoritySignature: string;
  phase: 'submitting' | 'awaiting-authority' | 'uncertain';
}>;

export type InnerKeepScreenProps = Readonly<{
  presentation: InnerKeepPresentation;
  catalogueOpen?: boolean;
  placementBuildingKind?: InnerKeepBuildingKind;
  placementDraft?: InnerKeepPlacementDraft | null;
  selectedBuildingKind?: InnerKeepBuildingKind;
  renderMode?: 'webgl' | 'fallback';
  onBack: () => void;
  onCloseToRealm: () => void;
  onOpenCatalogue: () => void;
  onBeginPlacement: (buildingKind: InnerKeepBuildingKind) => void;
  onOpenBuilding: (buildingKind: InnerKeepBuildingKind) => void;
  onPlacementDraftChange: (draft: InnerKeepPlacementDraft | null) => void;
  onStartProject?: StartInnerKeepProject;
  onRequestSync?: () => void;
}>;

function publicAssetUrl(path: string) {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`;
}

function compactQuantity(value: bigint) {
  return formatCompactRealmResourceQuantity(value) ?? value.toString();
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

function dateTimeForMicros(value: bigint) {
  const milliseconds = value / 1_000n;
  if (milliseconds < 0n || milliseconds > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;
  const date = new Date(Number(milliseconds));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function projectAuthoritySignature(presentation: InnerKeepPresentation) {
  return [
    presentation.castleId,
    presentation.layoutId,
    presentation.layoutVersion,
    presentation.projectRevision,
    presentation.phase,
    presentation.builder.state,
    presentation.builder.state === 'busy'
      ? `${presentation.builder.buildingKey}:${presentation.builder.buildingKind}:`
        + `${presentation.builder.targetLevel}:${presentation.builder.completesAtMicros}`
      : 'idle',
  ].join('|');
}

function projectIntentKey(intent: InnerKeepProjectIntent) {
  if (intent.kind === 'upgrade') return `upgrade:${intent.buildingKind}`;
  return [
    'construct',
    intent.buildingKind,
    intent.placement.localXMicrounits,
    intent.placement.localZMicrounits,
    intent.placement.rotationMilliDegrees,
  ].join(':');
}

function categoryCopy(category: InnerKeepCatalogueEntry['category']) {
  if (category === 'military') return 'MILITARY BUILDING';
  if (category === 'civic') return 'CIVIC BUILDING';
  return 'ECONOMY BUILDING';
}

function completedEffectCopy(entry: InnerKeepCatalogueEntry, completedLevel: number) {
  if (entry.matchingDiscountResource === 'none') return entry.effectCopy;
  const basisPoints = Math.min(
    entry.discountCapBasisPoints,
    entry.discountBasisPointsPerLevel * completedLevel,
  );
  return `${RESOURCE_COPY[entry.matchingDiscountResource].label} construction costs -${
    innerKeepBasisPointsPercentCopy(basisPoints)
  }.`;
}

function BuildingArt({ entry }: Readonly<{ entry?: InnerKeepCatalogueEntry }>) {
  return entry?.previewUrl ? (
    <img
      alt=""
      aria-hidden="true"
      className="inner-keep-building-art"
      decoding="async"
      draggable="false"
      src={publicAssetUrl(entry.previewUrl)}
    />
  ) : (
    <span aria-hidden="true" className="inner-keep-building-art-fallback">
      <span />
      <span />
      <span />
    </span>
  );
}

function SmokeWorksite() {
  return (
    <span aria-hidden="true" className="inner-keep-worksite">
      <span className="inner-keep-worksite__foundation" />
      <span className="inner-keep-worksite__scaffold" />
      <span className="inner-keep-worksite__smoke inner-keep-worksite__smoke--one" />
      <span className="inner-keep-worksite__smoke inner-keep-worksite__smoke--two" />
      <span className="inner-keep-worksite__dust" />
    </span>
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

function quoteFor(
  presentation: InnerKeepPresentation,
  buildingKind: InnerKeepBuildingKind,
) {
  const building = presentation.buildings.find((candidate) => (
    candidate.buildingKind === buildingKind
  ));
  const targetLevel = building?.phase === 'complete'
    ? building.completedLevel + 1
    : 1;
  return presentation.quotes.find((quote) => (
    quote.buildingKind === buildingKind && quote.targetLevel === targetLevel
  ));
}

function fallbackBuildingStyle(
  buildingKind: InnerKeepBuildingKind,
  placement: InnerKeepPlacementTransform,
) {
  const support = INNER_KEEP_FREE_PLACEMENT_POLICY.supportBoundsMicrounits;
  const supportWidth = support.maximumX - support.minimumX;
  const supportDepth = support.maximumZ - support.minimumZ;
  const envelope = INNER_KEEP_FREE_PLACEMENT_ENVELOPES[buildingKind];
  const quarterTurn = placement.rotationMilliDegrees === 90_000
    || placement.rotationMilliDegrees === 270_000;
  const halfWidth = envelope.halfExtentsMicrounits[quarterTurn ? 1 : 0];
  const halfDepth = envelope.halfExtentsMicrounits[quarterTurn ? 0 : 1];
  return {
    left: `${(
      Number(placement.localXMicrounits - support.minimumX) / Number(supportWidth)
    ) * 100}%`,
    top: `${(
      Number(placement.localZMicrounits - support.minimumZ) / Number(supportDepth)
    ) * 100}%`,
    width: `${(Number(halfWidth * 2n) / Number(supportWidth)) * 100}%`,
    height: `${(Number(halfDepth * 2n) / Number(supportDepth)) * 100}%`,
    transform: 'translate(-50%, -50%)',
  };
}

function otherSubmissionButtonCopy(submission: SubmissionState) {
  if (submission.phase === 'submitting') return 'ANOTHER REQUEST SUBMITTING';
  if (submission.phase === 'uncertain') return 'ANOTHER REQUEST NEEDS STATUS';
  return 'ANOTHER REQUEST PENDING';
}

export function InnerKeepScreen({
  presentation,
  catalogueOpen = false,
  placementBuildingKind,
  placementDraft,
  selectedBuildingKind,
  onBack,
  onCloseToRealm,
  onOpenCatalogue,
  onBeginPlacement,
  onOpenBuilding,
  onPlacementDraftChange,
  onStartProject,
  onRequestSync,
  renderMode = 'fallback',
}: InnerKeepScreenProps) {
  const valid = innerKeepPresentationIntegrity(presentation);
  const authoritySignature = projectAuthoritySignature(presentation);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);
  const submissionRef = useRef<SubmissionState | null>(null);
  const previousBuildingStatesRef = useRef<Map<string, string> | null>(null);
  const [submission, setSubmission] = useState<SubmissionState | null>(null);
  const [syncPending, setSyncPending] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const selectedBuilding = selectedBuildingKind
    ? presentation.buildings.find((building) => (
      building.buildingKind === selectedBuildingKind
    ))
    : undefined;
  const busyBuilder = presentation.builder.state === 'busy'
    ? presentation.builder
    : undefined;
  const activeBuilding = busyBuilder
    ? presentation.buildings.find((building) => (
      building.buildingKey === busyBuilder.buildingKey
    ))
    : undefined;
  const selectedEntry = presentation.catalogue.find((entry) => (
    entry.buildingKind === (placementBuildingKind ?? selectedBuildingKind)
  ));
  const selectedQuote = selectedEntry
    ? quoteFor(presentation, selectedEntry.buildingKind)
    : undefined;
  const initialDraft = useMemo(() => (
    placementBuildingKind
      ? initialInnerKeepPlacementDraft(
        placementBuildingKind,
        presentation.buildings,
      )
      : null
  ), [placementBuildingKind, presentation.buildings]);
  const revalidatedDraft = useMemo(() => (
    placementBuildingKind
    && placementDraft?.buildingKind === placementBuildingKind
      ? evaluateInnerKeepPlacementDraft(
        placementBuildingKind,
        placementDraft.transform,
        presentation.buildings,
      )
      : null
  ), [placementBuildingKind, placementDraft, presentation.buildings]);
  const activeDraft = placementBuildingKind
    && revalidatedDraft
    ? revalidatedDraft
    : initialDraft;
  const builderRemaining = useRealmRemainingDuration(
    presentation.builder.state === 'busy'
      ? presentation.builder.completesAtMicros
      : undefined,
  );

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (catalogueOpen || placementBuildingKind || selectedBuildingKind) {
      panelHeadingRef.current?.focus({ preventScroll: true });
    }
  }, [catalogueOpen, placementBuildingKind, selectedBuildingKind]);

  useEffect(() => {
    if (placementBuildingKind && placementDraft == null && initialDraft) {
      onPlacementDraftChange(initialDraft);
    }
    if (
      placementBuildingKind
      && placementDraft
      && revalidatedDraft
      && (
        placementDraft.evaluation.valid !== revalidatedDraft.evaluation.valid
        || placementDraft.evaluation.reason !== revalidatedDraft.evaluation.reason
        || placementDraft.evaluation.conflictingId
          !== revalidatedDraft.evaluation.conflictingId
        || placementDraft.evaluation.halfExtentsMicrounits[0]
          !== revalidatedDraft.evaluation.halfExtentsMicrounits[0]
        || placementDraft.evaluation.halfExtentsMicrounits[1]
          !== revalidatedDraft.evaluation.halfExtentsMicrounits[1]
      )
    ) {
      onPlacementDraftChange(revalidatedDraft);
    }
    if (!placementBuildingKind && placementDraft) onPlacementDraftChange(null);
  }, [
    initialDraft,
    onPlacementDraftChange,
    placementBuildingKind,
    placementDraft,
    revalidatedDraft,
  ]);

  useEffect(() => {
    const current = new Map(presentation.buildings.map((building) => [
      building.buildingKey,
      `${building.phase}:${building.completedLevel}:${building.targetLevel}:${building.revision}`,
    ]));
    const previous = previousBuildingStatesRef.current;
    previousBuildingStatesRef.current = current;
    if (!previous) return;
    for (const building of presentation.buildings) {
      const prior = previous.get(building.buildingKey);
      const label = presentation.catalogue.find((entry) => (
        entry.buildingKind === building.buildingKind
      ))?.label ?? 'Inner Keep building';
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

  const startProject = useCallback(async (intent: InnerKeepProjectIntent) => {
    if (!onStartProject || submissionRef.current) return;
    const next = Object.freeze({
      key: projectIntentKey(intent),
      authoritySignature,
      phase: 'submitting' as const,
    });
    submissionRef.current = next;
    setSubmission(next);
    setAnnouncement('Submitting construction for authoritative confirmation.');
    try {
      await onStartProject(intent);
      if (submissionRef.current !== next) return;
      const awaiting = Object.freeze({
        ...next,
        phase: 'awaiting-authority' as const,
      });
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
      const uncertain = Object.freeze({ ...next, phase: 'uncertain' as const });
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

  const quoteAffordable = selectedQuote
    ? innerKeepQuoteAffordable(selectedQuote, presentation.resources.available)
    : false;
  const quoteBlockedReason = selectedQuote
    ? innerKeepQuoteBlockedReason(selectedQuote, presentation.resources.available)
    : 'Authoritative project details are unavailable.';
  const commandBlockedReason = !valid
    ? 'Inner Keep placement policy could not be verified.'
    : !presentation.commandsEnabled
      ? presentation.statusMessage ?? 'Construction controls are read-only.'
      : presentation.phase !== 'ready'
        ? presentation.statusMessage ?? 'Construction controls are synchronizing.'
        : presentation.builder.state === 'busy'
          ? 'The Builder is occupied. Only one project can be active.'
          : quoteBlockedReason;
  const placementReason = activeDraft
    ? innerKeepPlacementReasonCopy(activeDraft.evaluation)
    : 'No valid location is currently available.';
  const placementIntent = placementBuildingKind && activeDraft
    ? Object.freeze({
      kind: 'construct' as const,
      buildingKind: placementBuildingKind,
      placement: activeDraft.transform,
    })
    : undefined;
  const selectedIntent = selectedBuildingKind && selectedBuilding?.phase === 'complete'
    ? Object.freeze({
      kind: 'upgrade' as const,
      buildingKind: selectedBuildingKind,
    })
    : undefined;
  const currentIntent = placementIntent ?? selectedIntent;
  const submissionKey = currentIntent ? projectIntentKey(currentIntent) : undefined;
  const currentSubmission = submissionKey === submission?.key ? submission : undefined;
  const startDisabled = !currentIntent
    || !selectedQuote
    || !quoteAffordable
    || Boolean(commandBlockedReason)
    || !onStartProject
    || Boolean(submission)
    || (currentIntent.kind === 'construct' && activeDraft?.evaluation.valid !== true);
  const statusCheckRequired = presentation.phase === 'synchronizing'
    || presentation.phase === 'failed';
  const unbuiltEntries = presentation.catalogue.filter((entry) => (
    !presentation.buildings.some((building) => (
      building.buildingKind === entry.buildingKind
    ))
  ));

  const updateDraft = (next: InnerKeepPlacementDraft) => {
    onPlacementDraftChange(next);
    setAnnouncement(innerKeepPlacementReasonCopy(next.evaluation));
  };

  return (
    <section
      aria-labelledby="inner-keep-title"
      className="inner-keep"
      data-inner-keep-renderer={renderMode}
      data-inner-keep-phase={presentation.phase}
      data-inner-keep-valid={String(valid)}
      data-inner-keep-placement={placementBuildingKind ?? undefined}
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
                <img alt="" aria-hidden="true" height="64" src={publicAssetUrl(copy.icon)} width="64" />
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
            <p role="status">{presentation.statusMessage
              ?? 'Construction status needs an authoritative Realm check.'}</p>
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
            <h2>Inner Keep unavailable</h2>
            <p>The current free-placement policy did not pass its integrity check.</p>
          </section>
        ) : presentation.phase === 'loading' ? (
          <section className="inner-keep__unavailable" role="status">
            <h2>Opening your Inner Keep…</h2>
            <p>Loading the authoritative town and Builder state.</p>
          </section>
        ) : (
          <section
            aria-label={`${renderMode === 'webgl' ? 'Interactive' : 'Schematic'} Inner Keep town`}
            className="inner-keep-map inner-keep-map--free"
          >
            <div aria-hidden="true" className="inner-keep-map__wall" />
            <div aria-hidden="true" className="inner-keep-map__road inner-keep-map__road--vertical" />
            {placementBuildingKind && activeDraft && selectedEntry ? (
              <div
                aria-hidden="true"
                className="inner-keep-map-placement-ghost"
                data-valid={String(activeDraft.evaluation.valid)}
                style={fallbackBuildingStyle(selectedEntry.buildingKind, activeDraft.transform)}
              >
                <BuildingArt entry={selectedEntry} />
                <strong>{activeDraft.evaluation.valid ? 'READY' : 'BLOCKED'}</strong>
              </div>
            ) : null}
            {presentation.buildings.map((building) => {
              const entry = presentation.catalogue.find((candidate) => (
                candidate.buildingKind === building.buildingKind
              ));
              return (
                <button
                  aria-label={`${entry?.label ?? 'Inner Keep building'}. ${
                    building.phase === 'constructing'
                      ? `Building Level ${building.targetLevel}`
                      : `Level ${building.completedLevel}`
                  }.`}
                  className="inner-keep-map-building"
                  data-inner-keep-building-key={building.buildingKey}
                  data-phase={building.phase}
                  key={building.buildingKey}
                  onClick={() => onOpenBuilding(building.buildingKind)}
                  style={fallbackBuildingStyle(building.buildingKind, building.placement)}
                  type="button"
                >
                  {building.phase === 'constructing'
                    ? <SmokeWorksite />
                    : <BuildingArt entry={entry} />}
                  <strong>{entry?.label ?? 'Building'}</strong>
                </button>
              );
            })}
            {presentation.buildings.length === 0 ? (
              <div className="inner-keep-map__empty-town">
                <strong>Your town is ready to grow</strong>
                <span>Choose a building, then place it anywhere valid inside the walls.</span>
              </div>
            ) : null}
          </section>
        )}
      </div>

      <button
        className="inner-keep-builder"
        data-warpkeep-sfx="none"
        disabled={!valid || (
          presentation.builder.state === 'idle' && unbuiltEntries.length === 0
        )}
        onClick={() => {
          if (activeBuilding) onOpenBuilding(activeBuilding.buildingKind);
          else onOpenCatalogue();
        }}
        type="button"
      >
        <span aria-hidden="true" className="inner-keep-builder__crest" />
        <span>
          <small>{presentation.builder.state === 'idle'
            ? 'BUILDER AVAILABLE'
            : 'BUILDER OCCUPIED'}</small>
          <strong>{presentation.builder.state === 'idle'
            ? unbuiltEntries.length > 0
              ? 'BUILD — choose a town project'
              : 'All available buildings are placed'
            : `${presentation.catalogue.find((entry) => (
              entry.buildingKind === busyBuilder?.buildingKind
            ))?.label ?? 'Construction'} · Building Level ${presentation.builder.targetLevel}`}</strong>
          {presentation.builder.state === 'busy' ? (
            <time dateTime={dateTimeForMicros(presentation.builder.completesAtMicros)}>
              {builderRemaining ?? 'Awaiting Realm update'}
            </time>
          ) : null}
        </span>
      </button>

      {catalogueOpen ? (
        <aside aria-labelledby="inner-keep-panel-title" className="inner-keep-panel">
          <header>
            <div>
              <p>BUILD</p>
              <h2 id="inner-keep-panel-title" ref={panelHeadingRef} tabIndex={-1}>
                Choose a town building
              </h2>
            </div>
            <button aria-label="Close Inner Keep panel" onClick={onBack} type="button">×</button>
          </header>
          <div className="inner-keep-panel__body">
            {unbuiltEntries.length > 0 ? (
              <ul className="inner-keep-catalogue" aria-label="Available town buildings">
                {unbuiltEntries.map((entry) => {
                  const quote = quoteFor(presentation, entry.buildingKind);
                  return (
                    <li key={entry.buildingKind}>
                      <BuildingArt entry={entry} />
                      <div>
                        <p>{categoryCopy(entry.category)}</p>
                        <h3>{entry.label}</h3>
                        <span>Level 1</span>
                      </div>
                      {quote ? <ResourceCost quote={quote} /> : null}
                      <p>{entry.effectCopy}</p>
                      <button
                        data-inner-keep-building-kind={entry.buildingKind}
                        disabled={!quote}
                        onClick={() => onBeginPlacement(entry.buildingKind)}
                        type="button"
                      >
                        PLACE BUILDING
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="inner-keep-panel__empty">Every available building is already placed.</p>
            )}
          </div>
        </aside>
      ) : null}

      {placementBuildingKind && selectedEntry ? (
        <aside
          aria-labelledby="inner-keep-panel-title"
          className="inner-keep-panel inner-keep-panel--placement"
          data-placement-valid={String(activeDraft?.evaluation.valid === true)}
        >
          <header>
            <div>
              <p>PLACE BUILDING</p>
              <h2 id="inner-keep-panel-title" ref={panelHeadingRef} tabIndex={-1}>
                {selectedEntry.label}
              </h2>
            </div>
            <button aria-label="Cancel building placement" onClick={onBack} type="button">×</button>
          </header>
          <div className="inner-keep-panel__body inner-keep-placement">
            <BuildingArt entry={selectedEntry} />
            {selectedQuote ? <ResourceCost quote={selectedQuote} /> : null}
            <p className="inner-keep-placement__help">
              Choose any clear space inside the walls. Roads and civic areas must remain open.
            </p>
            <fieldset className="inner-keep-placement__controls" disabled={!activeDraft}>
              <legend>Adjust placement</legend>
              <span />
              <button
                aria-label="Move building north by half a metre"
                onClick={() => activeDraft && updateDraft(nudgeInnerKeepPlacementDraft(
                  activeDraft, 0, -1, presentation.buildings,
                ))}
                type="button"
              >↑</button>
              <span />
              <button
                aria-label="Move building west by half a metre"
                onClick={() => activeDraft && updateDraft(nudgeInnerKeepPlacementDraft(
                  activeDraft, -1, 0, presentation.buildings,
                ))}
                type="button"
              >←</button>
              <button
                aria-label="Rotate building clockwise"
                onClick={() => activeDraft && updateDraft(rotateInnerKeepPlacementDraft(
                  activeDraft, 1, presentation.buildings,
                ))}
                type="button"
              >↻</button>
              <button
                aria-label="Move building east by half a metre"
                onClick={() => activeDraft && updateDraft(nudgeInnerKeepPlacementDraft(
                  activeDraft, 1, 0, presentation.buildings,
                ))}
                type="button"
              >→</button>
              <span />
              <button
                aria-label="Move building south by half a metre"
                onClick={() => activeDraft && updateDraft(nudgeInnerKeepPlacementDraft(
                  activeDraft, 0, 1, presentation.buildings,
                ))}
                type="button"
              >↓</button>
              <span />
            </fieldset>
            {activeDraft ? (
              <output className="inner-keep-placement__coordinates">
                {innerKeepPlacementMetersCopy(activeDraft.transform)}
              </output>
            ) : null}
            <p
              aria-live="polite"
              className="inner-keep-placement__validity"
              data-valid={String(activeDraft?.evaluation.valid === true)}
              role="status"
            >
              {placementReason}
            </p>
            <button
              data-command-intent="primary"
              disabled={startDisabled}
              onClick={() => currentIntent && void startProject(currentIntent)}
              type="button"
            >
              {currentSubmission?.phase === 'submitting'
                ? 'SUBMITTING…'
                : currentSubmission
                  ? 'AWAITING REALM STATUS'
                  : submission
                    ? otherSubmissionButtonCopy(submission)
                    : 'CONFIRM PLACEMENT'}
            </button>
            {startDisabled ? (
              <p className="inner-keep-confirmation__blocked" role="status">
                {currentSubmission
                  ? 'Waiting for the authoritative construction record.'
                  : submission
                    ? 'Another construction request is awaiting authoritative state.'
                    : !activeDraft?.evaluation.valid
                      ? placementReason
                      : commandBlockedReason}
              </p>
            ) : null}
            <button onClick={onBack} type="button">CANCEL</button>
          </div>
        </aside>
      ) : null}

      {selectedBuilding && selectedEntry && !placementBuildingKind ? (
        <aside aria-labelledby="inner-keep-panel-title" className="inner-keep-panel">
          <header>
            <div>
              <p>{selectedBuilding.phase === 'constructing'
                ? 'CONSTRUCTION IN PROGRESS'
                : 'TOWN BUILDING'}</p>
              <h2 id="inner-keep-panel-title" ref={panelHeadingRef} tabIndex={-1}>
                {selectedEntry.label}
              </h2>
            </div>
            <button aria-label="Close Inner Keep panel" onClick={onBack} type="button">×</button>
          </header>
          <div className="inner-keep-panel__body">
            {selectedBuilding.phase === 'constructing' ? (
              <section className="inner-keep-active-project">
                <SmokeWorksite />
                <strong>Building Level {selectedBuilding.targetLevel}</strong>
                {selectedBuilding.completesAtMicros !== undefined ? (
                  <time dateTime={dateTimeForMicros(selectedBuilding.completesAtMicros)}>
                    {builderRemaining ?? 'Awaiting Realm update'}
                  </time>
                ) : null}
                <p>The Realm completes this project automatically. No claim action is needed.</p>
              </section>
            ) : (
              <section className="inner-keep-building-detail">
                <BuildingArt entry={selectedEntry} />
                <p>COMPLETED BUILDING</p>
                <h3>{selectedEntry.label}</h3>
                <strong>Level {selectedBuilding.completedLevel}</strong>
                <p><strong>Current effect: </strong>{completedEffectCopy(
                  selectedEntry, selectedBuilding.completedLevel,
                )}</p>
                <p className="inner-keep-building-detail__location">
                  {innerKeepPlacementMetersCopy(selectedBuilding.placement)}
                </p>
                {selectedBuilding.completedLevel >= selectedEntry.maximumLevel ? (
                  <p>Maximum level reached.</p>
                ) : selectedQuote ? (
                  <>
                    <dl className="inner-keep-building-detail__next">
                      <div><dt>Next level</dt><dd>{selectedQuote.targetLevel}</dd></div>
                      <div><dt>Build time</dt><dd>{durationCopy(selectedQuote.durationMicros)}</dd></div>
                    </dl>
                    <ResourceCost quote={selectedQuote} />
                    <button
                      data-command-intent="primary"
                      disabled={startDisabled}
                      onClick={() => currentIntent && void startProject(currentIntent)}
                      type="button"
                    >
                      {currentSubmission ? 'AWAITING REALM STATUS' : `UPGRADE TO LEVEL ${
                        selectedQuote.targetLevel
                      }`}
                    </button>
                    {startDisabled ? (
                      <p className="inner-keep-confirmation__blocked" role="status">
                        {commandBlockedReason}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p>The authoritative upgrade quote is not available.</p>
                )}
              </section>
            )}
          </div>
        </aside>
      ) : null}

      <p aria-atomic="true" aria-live="polite" className="warpkeep-visually-hidden">
        {announcement}
      </p>
    </section>
  );
}

export default InnerKeepScreen;

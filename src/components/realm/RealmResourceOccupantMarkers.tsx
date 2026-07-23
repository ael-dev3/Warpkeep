import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react';

import { CastleProfileAvatar } from './RealmCastleLabels';
import {
  castleProfileLabel,
  type RealmCastlePublicPresentation
} from './realmCastlePresentation';
import {
  realmResourceOccupantMarkerKey,
  RESOURCE_WORKER_PHASE_LABELS,
  RESOURCE_WORKER_RATE_LABELS,
  RESOURCE_KIND_LABELS,
  type RealmResourceOccupantMarker
} from './realmResourceOccupantPresentation';

function documentFocusIsOrphaned(activeElement: Element | null) {
  return activeElement === null
    || activeElement === document.body
    || activeElement === document.documentElement
    || !activeElement.isConnected;
}

function publicAssetUrl(path: string) {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`;
}

type ResourceOccupantProfilePanelProps = Readonly<{
  marker: RealmResourceOccupantMarker;
  profile: RealmCastlePublicPresentation;
  onRequestClose: () => void;
  onFocusCastle: () => void;
}>;

function ResourceOccupantProfilePanel({
  marker,
  profile,
  onRequestClose,
  onFocusCastle
}: ResourceOccupantProfilePanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = `resource-occupant-${marker.resource}-${marker.siteId}-title`;
  const playerLabel = castleProfileLabel(profile);
  const keeperName = profile.displayName ?? playerLabel;

  useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <aside
      aria-labelledby={titleId}
      className="realm-camera-neutral-inspector realm-resource-occupant-panel"
      data-resource-occupant-panel="true"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onRequestClose();
        }
      }}
      role="dialog"
      aria-modal="false"
    >
      <header className="realm-resource-occupant-panel__header">
        <div>
          <span>PUBLIC WORKER RECORD</span>
          <h2 id={titleId}>{RESOURCE_KIND_LABELS[marker.resource]}</h2>
        </div>
        <button
          ref={closeButtonRef}
          aria-label="Close player record"
          className="realm-resource-occupant-panel__close"
          onClick={onRequestClose}
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <section className="realm-resource-occupant-panel__worker" aria-label="Worker assignment">
        <div className="realm-resource-occupant-panel__worker-art" aria-hidden="true">
          <img
            alt=""
            decoding="async"
            draggable={false}
            height="1024"
            src={publicAssetUrl('images/realm/hegemony-worker-record.webp')}
            width="1024"
          />
        </div>
        <div>
          <span>WORKER {String(marker.workerOrdinal).padStart(2, '0')}</span>
          <strong>{RESOURCE_WORKER_PHASE_LABELS[marker.workerPhase]}</strong>
          <small>{RESOURCE_WORKER_RATE_LABELS[marker.resource]} · 30-day deployment</small>
        </div>
      </section>

      <section className="realm-resource-occupant-panel__identity" aria-label="Gathering player">
        <CastleProfileAvatar profile={profile} size="large" />
        <div>
          <span>GATHERING BY</span>
          <strong>{keeperName}</strong>
          {keeperName !== playerLabel ? <small>{playerLabel}</small> : null}
        </div>
      </section>

      {profile.publicBio ? (
        <p className="realm-resource-occupant-panel__bio">{profile.publicBio}</p>
      ) : null}

      <dl className="realm-resource-occupant-panel__facts">
        <div>
          <dt>Resource site</dt>
          <dd>q {marker.nodeCoord.q} · r {marker.nodeCoord.r}</dd>
        </div>
        <div>
          <dt>Node tier</dt>
          <dd>T{marker.tier}</dd>
        </div>
        <div>
          <dt>Home castle</dt>
          <dd>{marker.castle.name}</dd>
        </div>
        <div>
          <dt>Castle location</dt>
          <dd>q {marker.castle.q} · r {marker.castle.r}</dd>
        </div>
        <div>
          <dt>Command authority</dt>
          <dd>Owning keeper only</dd>
        </div>
      </dl>

      <button
        className="realm-resource-occupant-panel__castle-action"
        onClick={onFocusCastle}
        type="button"
      >
        View castle location
        <span aria-hidden="true">→</span>
      </button>
    </aside>
  );
}

export function RealmResourceOccupantMarkers({
  markers,
  visibleMarkerKeys,
  selectedMarker,
  onMarkerLayout,
  onSelect,
  onRequestClose,
  onFocusCastle
}: Readonly<{
  markers: readonly RealmResourceOccupantMarker[];
  visibleMarkerKeys: readonly string[];
  selectedMarker: RealmResourceOccupantMarker | null;
  onMarkerLayout: () => void;
  onSelect: (marker: RealmResourceOccupantMarker) => void;
  onRequestClose: () => void;
  onFocusCastle: (marker: RealmResourceOccupantMarker) => void;
}>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const markerButtonsRef = useRef(new Map<string, HTMLButtonElement>());
  const focusedMarkerKeyRef = useRef<string | null>(null);
  const returningFocusKeyRef = useRef<string | null>(null);
  const availableKeySet = useMemo(
    () => new Set(markers.map(realmResourceOccupantMarkerKey)),
    [markers]
  );
  const visibleKeySet = useMemo(() => new Set(visibleMarkerKeys), [visibleMarkerKeys]);
  const visibleMarkers = useMemo(() => markers.filter((marker) => (
    visibleKeySet.has(realmResourceOccupantMarkerKey(marker))
  )), [markers, visibleKeySet]);
  const [rovingKey, setRovingKey] = useState<string | null>(
    visibleMarkerKeys[0] ?? null
  );

  useLayoutEffect(() => {
    // Membership is React-owned, while camera coordinates are updated
    // imperatively by the renderer. Reapply the latest frame after a public
    // snapshot adds/removes an occupied site so no stale hidden marker remains.
    onMarkerLayout();
  }, [markers, visibleMarkerKeys, onMarkerLayout]);

  useEffect(() => {
    if (rovingKey !== null && visibleKeySet.has(rovingKey)) return;
    setRovingKey(visibleMarkerKeys[0] ?? null);
  }, [rovingKey, visibleKeySet, visibleMarkerKeys]);

  useLayoutEffect(() => {
    const focusedKey = focusedMarkerKeyRef.current;
    const activeElement = document.activeElement;
    if (
      focusedKey === null
      || visibleKeySet.has(focusedKey)
      || !documentFocusIsOrphaned(activeElement)
    ) return;
    focusedMarkerKeyRef.current = null;
    const nextKey = visibleMarkerKeys[0];
    if (nextKey) {
      setRovingKey(nextKey);
      markerButtonsRef.current.get(nextKey)?.focus({ preventScroll: true });
    } else {
      containerRef.current?.focus({ preventScroll: true });
    }
  }, [visibleKeySet, visibleMarkerKeys]);

  useLayoutEffect(() => {
    const selectedKey = selectedMarker
      ? realmResourceOccupantMarkerKey(selectedMarker)
      : null;
    if (selectedKey !== null) {
      returningFocusKeyRef.current = selectedKey;
      return;
    }
    const returningKey = returningFocusKeyRef.current;
    if (returningKey === null) return;
    if (!availableKeySet.has(returningKey)) {
      returningFocusKeyRef.current = null;
      if (documentFocusIsOrphaned(document.activeElement)) {
        containerRef.current?.focus({ preventScroll: true });
      }
      return;
    }
    const target = markerButtonsRef.current.get(returningKey);
    if (target) {
      if (
        document.activeElement !== containerRef.current
        && !documentFocusIsOrphaned(document.activeElement)
      ) {
        returningFocusKeyRef.current = null;
        return;
      }
      returningFocusKeyRef.current = null;
      setRovingKey(returningKey);
      target.focus({ preventScroll: true });
    } else {
      if (
        document.activeElement !== containerRef.current
        && !documentFocusIsOrphaned(document.activeElement)
      ) {
        returningFocusKeyRef.current = null;
        return;
      }
      // The open panel itself can temporarily reserve and cull its trigger.
      // Keep the return key armed until the next composition pass remounts it.
      containerRef.current?.focus({ preventScroll: true });
    }
  }, [availableKeySet, selectedMarker, visibleMarkerKeys]);

  useEffect(() => {
    if (!selectedMarker) return undefined;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onRequestClose();
    };
    window.addEventListener('keydown', closeOnEscape, true);
    return () => window.removeEventListener('keydown', closeOnEscape, true);
  }, [onRequestClose, selectedMarker]);

  const moveRovingFocus = (currentKey: string, direction: -1 | 1) => {
    const currentIndex = visibleMarkerKeys.indexOf(currentKey);
    if (currentIndex < 0 || visibleMarkerKeys.length === 0) return;
    const nextKey = visibleMarkerKeys[
      (currentIndex + direction + visibleMarkerKeys.length) % visibleMarkerKeys.length
    ]!;
    setRovingKey(nextKey);
    markerButtonsRef.current.get(nextKey)?.focus({ preventScroll: true });
  };

  return (
    <div
      aria-label="Other players gathering resources"
      className="realm-resource-occupant-markers"
      data-resource-occupant-markers="true"
      ref={containerRef}
      role="group"
      tabIndex={-1}
    >
      {visibleMarkers.map((marker) => {
        const key = realmResourceOccupantMarkerKey(marker);
        const playerLabel = castleProfileLabel(marker.profile);
        const positionStyle = {
          '--realm-resource-marker-x': '0px',
          '--realm-resource-marker-y': '0px'
        } as CSSProperties;
        return (
          <button
            aria-label={`Inspect ${playerLabel} gathering at ${RESOURCE_KIND_LABELS[marker.resource]}, cell ${marker.nodeCoord.q},${marker.nodeCoord.r}`}
            className="realm-resource-occupant-marker"
            data-resource-occupant-key={key}
            data-resource-kind={marker.resource}
            data-projected-visible="false"
            key={key}
            onClick={() => {
              setRovingKey(key);
              onSelect(marker);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowUp'
                && event.key !== 'ArrowRight' && event.key !== 'ArrowDown') return;
              event.preventDefault();
              moveRovingFocus(
                key,
                event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
              );
            }}
            onFocus={() => {
              focusedMarkerKeyRef.current = key;
            }}
            ref={(element) => {
              if (element) markerButtonsRef.current.set(key, element);
              else markerButtonsRef.current.delete(key);
            }}
            style={positionStyle}
            tabIndex={rovingKey === key ? 0 : -1}
            type="button"
          >
            <CastleProfileAvatar profile={marker.profile} size="compact" />
            <span aria-hidden="true" className="realm-resource-occupant-marker__ring" />
            <span className="realm-resource-occupant-marker__kind" aria-hidden="true">
              {marker.resource === 'gold' ? 'G' : marker.resource === 'food' ? 'F' : marker.resource === 'wood' ? 'W' : 'S'}
            </span>
          </button>
        );
      })}

      {selectedMarker ? (
        <ResourceOccupantProfilePanel
          key={`${realmResourceOccupantMarkerKey(selectedMarker)}:${selectedMarker.castle.castleId}`}
          marker={selectedMarker}
          profile={selectedMarker.profile}
          onRequestClose={onRequestClose}
          onFocusCastle={() => {
            returningFocusKeyRef.current = null;
            onFocusCastle(selectedMarker);
          }}
        />
      ) : null}
    </div>
  );
}

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react';

import { CastleProfileAvatar } from './RealmCastleLabels';
import { castleProfileLabel } from './realmCastlePresentation';
import {
  realmResourceOccupantMarkerKey,
  RESOURCE_KIND_LABELS,
  type RealmResourceOccupantMarker
} from './realmResourceOccupantPresentation';

function documentFocusIsOrphaned(activeElement: Element | null) {
  return activeElement === null
    || activeElement === document.body
    || activeElement === document.documentElement
    || !activeElement.isConnected;
}

/**
 * Screen-space public portraits for occupied sites. Activating one delegates to
 * the canonical resource-site inspector; this layer never owns a second dialog.
 */
export function RealmResourceOccupantMarkers({
  markers,
  visibleMarkerKeys,
  presenceMarkerKeys = visibleMarkerKeys,
  selectedMarkerKey,
  showDiagnostics = false,
  onMarkerLayout,
  onHover,
  onSelect
}: Readonly<{
  markers: readonly RealmResourceOccupantMarker[];
  presenceMarkerKeys?: readonly string[];
  visibleMarkerKeys: readonly string[];
  selectedMarkerKey?: string;
  /** Enables operator-only q/r copy in interactive gathering markers. */
  showDiagnostics?: boolean;
  onMarkerLayout: () => void;
  onHover?: (key: string | null) => void;
  onSelect: (marker: RealmResourceOccupantMarker) => void;
}>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const markerButtonsRef = useRef(new Map<string, HTMLButtonElement>());
  const focusedMarkerKeyRef = useRef<string | null>(null);
  const markersByKey = useMemo(
    () => new Map(markers.map((marker) => [
      realmResourceOccupantMarkerKey(marker),
      marker
    ] as const)),
    [markers]
  );
  const visibleKeySet = useMemo(() => new Set(visibleMarkerKeys), [visibleMarkerKeys]);
  const presenceMarkers = useMemo(() => {
    const seen = new Set<string>();
    return presenceMarkerKeys.flatMap((key) => {
      // The bounded keyboard-control lane owns its selected keys. The passive
      // pointer lane fills the remainder, so one public occupation is never
      // represented by two PFPs, reservation badges, or hit targets.
      if (seen.has(key) || visibleKeySet.has(key)) return [];
      seen.add(key);
      const marker = markersByKey.get(key);
      return marker ? [marker] : [];
    });
  }, [markersByKey, presenceMarkerKeys, visibleKeySet]);
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
  }, [markers, presenceMarkerKeys, visibleMarkerKeys, onMarkerLayout]);

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
    onHover?.(null);
    const nextKey = visibleMarkerKeys[0];
    if (nextKey) {
      setRovingKey(nextKey);
      markerButtonsRef.current.get(nextKey)?.focus({ preventScroll: true });
    } else {
      containerRef.current?.focus({ preventScroll: true });
    }
  }, [onHover, visibleKeySet, visibleMarkerKeys]);

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
    <>
      <div
        aria-hidden="true"
        className="realm-resource-occupant-presences"
        data-resource-occupant-presences="true"
        onClick={(event) => {
          const target = (event.target as Element).closest<HTMLElement>(
            '[data-resource-occupant-lane="presence"][data-resource-occupant-key]'
          );
          if (!target || !event.currentTarget.contains(target)) return;
          const marker = markersByKey.get(target.dataset.resourceOccupantKey ?? '');
          if (!marker) return;
          event.preventDefault();
          event.stopPropagation();
          onSelect(marker);
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {presenceMarkers.map((marker) => {
          const key = realmResourceOccupantMarkerKey(marker);
          const reservedForGenericWorker = marker.source === 'generic-worker'
            && marker.workerPhase === 'outbound';
          return (
            <span
              className={[
                'realm-resource-occupant-presence',
                reservedForGenericWorker
                  ? 'realm-resource-occupant-presence--reserved'
                  : ''
              ].filter(Boolean).join(' ')}
              data-projected-visible="false"
              data-resource-kind={marker.resource}
              data-resource-occupant-key={key}
              data-resource-occupant-lane="presence"
              key={`presence:${key}`}
              onPointerEnter={() => onHover?.(key)}
              onPointerLeave={() => onHover?.(null)}
              title={reservedForGenericWorker
                ? `Reserved ${RESOURCE_KIND_LABELS[marker.resource]} · worker en route`
                : `Open ${castleProfileLabel(marker.profile)} at ${RESOURCE_KIND_LABELS[marker.resource]}`}
              style={{
                '--realm-resource-marker-x': '0px',
                '--realm-resource-marker-y': '0px'
              } as CSSProperties}
            >
              {reservedForGenericWorker ? (
                <>
                  <span aria-hidden="true" className="realm-resource-occupant-presence__kind">
                    {marker.resource === 'gold' ? 'G' : marker.resource === 'food' ? 'F' : marker.resource === 'wood' ? 'W' : 'S'}
                  </span>
                  <strong>Reserved</strong>
                </>
              ) : (
                <CastleProfileAvatar profile={marker.profile} size="compact" />
              )}
            </span>
          );
        })}
      </div>

      <div
        aria-label="Players gathering resources"
        className="realm-resource-occupant-markers"
        data-resource-occupant-markers="true"
        ref={containerRef}
        role="group"
        tabIndex={-1}
      >
        {visibleMarkers.map((marker) => {
          const key = realmResourceOccupantMarkerKey(marker);
          const playerLabel = castleProfileLabel(marker.profile);
          const reservedForGenericWorker = marker.source === 'generic-worker'
            && marker.workerPhase === 'outbound';
          const ownershipLabel = marker.occupiedByViewer
            ? marker.source === 'generic-worker' ? 'YOUR WORKER' : 'YOUR EXPEDITION'
            : playerLabel;
          const actionLabel = marker.occupiedByViewer
            ? `${ownershipLabel} at ${RESOURCE_KIND_LABELS[marker.resource]}`
            : `${playerLabel} gathering at ${RESOURCE_KIND_LABELS[marker.resource]}`;
          return (
            <button
              aria-label={reservedForGenericWorker
                ? `Inspect reserved ${RESOURCE_KIND_LABELS[marker.resource]}, worker en route${showDiagnostics
                  ? `, cell ${marker.nodeCoord.q},${marker.nodeCoord.r}`
                  : ''}`
                : `Inspect ${actionLabel}${showDiagnostics
                  ? `, cell ${marker.nodeCoord.q},${marker.nodeCoord.r}`
                  : ''}`}
              className={[
                'realm-resource-occupant-marker',
                reservedForGenericWorker
                  ? 'realm-resource-occupant-marker--reserved'
                  : ''
              ].filter(Boolean).join(' ')}
              data-occupied-by-viewer={marker.occupiedByViewer ? 'true' : 'false'}
              data-resource-occupant-key={key}
              data-resource-kind={marker.resource}
              data-resource-occupant-source={marker.source}
              data-resource-occupant-lane="control"
              data-projected-visible="false"
              data-selected={selectedMarkerKey === key ? 'true' : 'false'}
              data-warpkeep-sfx="none"
              key={key}
              onBlur={() => onHover?.(null)}
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
                onHover?.(key);
              }}
              onPointerEnter={() => onHover?.(key)}
              onPointerLeave={() => onHover?.(null)}
              ref={(element) => {
                if (element) markerButtonsRef.current.set(key, element);
                else markerButtonsRef.current.delete(key);
              }}
              style={{
                '--realm-resource-marker-x': '0px',
                '--realm-resource-marker-y': '0px'
              } as CSSProperties}
              tabIndex={rovingKey === key ? 0 : -1}
              type="button"
            >
              {reservedForGenericWorker ? null : (
                <CastleProfileAvatar profile={marker.profile} size="compact" />
              )}
              <span className="realm-resource-occupant-marker__kind" aria-hidden="true">
                {marker.resource === 'gold' ? 'G' : marker.resource === 'food' ? 'F' : marker.resource === 'wood' ? 'W' : 'S'}
              </span>
              <span className="realm-resource-occupant-marker__owner" title={ownershipLabel}>
                {reservedForGenericWorker ? 'Reserved · en route' : ownershipLabel}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

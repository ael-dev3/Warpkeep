import { castleProfileLabel } from './realmCastlePresentation';
import type {
  RealmResourceOccupantMarker
} from './realmResourceOccupantPresentation';
import type { RealmResourceKind } from './realmTypes';

export function matchingRealmResourceOccupant(
  marker: RealmResourceOccupantMarker | undefined,
  resource: RealmResourceKind,
  siteId: string
) {
  return marker?.resource === resource && marker.siteId === siteId
    ? marker
    : undefined;
}

export function realmResourceOccupantSiteStateLabel(
  marker: RealmResourceOccupantMarker
) {
  if (marker.workerPhase === 'outbound') return 'OCCUPIED · EN ROUTE';
  if (marker.workerPhase === 'returning') return 'OCCUPIED · RETURNING';
  return 'OCCUPIED · GATHERING';
}

export function realmResourceOccupantOwnerLabel(
  marker: RealmResourceOccupantMarker
) {
  if (marker.occupiedByViewer) {
    const assignment = marker.source === 'generic-worker'
      ? 'Your worker'
      : 'Your expedition';
    return `${assignment} · ${marker.castle.name}`;
  }
  return `${castleProfileLabel(marker.profile)} · ${marker.castle.name}`;
}

export function realmResourceOccupantNextAuthorityTimestamp(
  marker: RealmResourceOccupantMarker
) {
  if (marker.workerPhase === 'outbound') return marker.arrivesAtMicros;
  if (marker.workerPhase === 'gathering') return marker.gatheringEndsAtMicros;
  return marker.returnsAtMicros;
}

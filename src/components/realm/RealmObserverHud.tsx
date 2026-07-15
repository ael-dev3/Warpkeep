import {
  realmTerrainLabel,
  type RealmTerrainKind
} from '../../game/map/realmTerrainSemantics';
import type { TerrainCell } from '../../game/map/terrainTypes';
import {
  castleProfileLabel,
  type RealmCastlePublicPresentation
} from './realmCastlePresentation';

type RealmObserverHudProps = Readonly<{
  selectedCell: TerrainCell;
  selectedTerrainKind?: RealmTerrainKind;
  selectedCastle?: Readonly<{ name: string; q: number; r: number }>;
  selectedCastleProfile?: RealmCastlePublicPresentation;
  onShowRealm: () => void;
  onRequestReturn: () => void;
}>;

export function RealmObserverHud({
  selectedCell,
  selectedTerrainKind,
  selectedCastle,
  selectedCastleProfile,
  onShowRealm,
  onRequestReturn
}: RealmObserverHudProps) {
  const selection = selectedCastle
    ? `${selectedCastleProfile ? `${castleProfileLabel(selectedCastleProfile)} · ` : ''}${selectedCastle.name}`
    : realmTerrainLabel(selectedTerrainKind);

  return (
    <>
      <section className="realm-hud realm-observer-hud" aria-labelledby="realm-heading">
        <header className="realm-hud__header">
          <p>QA OBSERVER · READ ONLY</p>
          <h1 id="realm-heading">GENESIS 001</h1>
          <span className="realm-hud__keeper">Public presentation preview</span>
        </header>
        <div className="realm-hud__selection" aria-label="Current selection">
          <span>CURRENT SELECTION</span>
          <strong>{selection} · q {selectedCell.coord.q}, r {selectedCell.coord.r}</strong>
        </div>
      </section>

      <div className="realm-hud__actions" aria-label="Observer actions">
        <button type="button" aria-label="Close QA Observer" onClick={onRequestReturn}>
          <span aria-hidden="true">Exit</span>
        </button>
        <button type="button" aria-label="Show Full Realm" onClick={onShowRealm}>
          <span aria-hidden="true">Realm</span>
        </button>
      </div>
    </>
  );
}

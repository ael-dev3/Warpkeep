import type { RealmTerrainKind } from '../../game/map/realmTerrainSemantics';
import { realmTerrainLabel } from '../../game/map/realmTerrainSemantics';
import { RealmFullScreenSurface } from './RealmFullScreenSurface';
import './RealmTerrainInspectionPanel.css';

const TERRAIN_DESCRIPTIONS: Readonly<Record<RealmTerrainKind, string>> = Object.freeze({
  lowland:
    'Open lowlands bind the founded keeps, roads, rivers, and gathering grounds into one continuous frontier.',
  meadow:
    'A sunlit meadow where the Lowlands open into softer grass and long sightlines.',
  forest:
    'A denser lowland forest shaped by the Realm’s shared ecology rather than scattered decoration.',
  heath:
    'Amethyst heath marks the Hegemony landscape with resilient scrub and violet ground cover.',
  ridge:
    'A weathered rise of stone and hard soil overlooking the surrounding cells.',
  lake:
    'A quiet lowland basin retained in the terrain record. Water navigation follows the Realm’s authoritative river and ocean graph.',
  'ancient-stone':
    'Old stone breaks through the Lowlands here, a durable trace of the Realm before its present keeps.'
});

export function RealmTerrainInspectionPanel({
  terrainKind,
  passable,
  onBack,
  onCloseToRealm,
  onLocate
}: Readonly<{
  terrainKind?: RealmTerrainKind;
  passable?: boolean;
  onBack: () => void;
  onCloseToRealm: () => void;
  onLocate: () => void;
}>) {
  const resolvedKind = terrainKind ?? 'lowland';
  const title = realmTerrainLabel(resolvedKind);

  return (
    <RealmFullScreenSurface
      backLabel="Back to Realm"
      canGoBack
      eyebrow="GENESIS 001"
      onBack={onBack}
      onCloseToRealm={onCloseToRealm}
      subtitle="A living cell of the persistent Realm"
      title={title}
      tone="terrain"
    >
      <article className="realm-terrain-record">
        <section>
          <h2>THE LAND</h2>
          <p>{TERRAIN_DESCRIPTIONS[resolvedKind]}</p>
        </section>
        {passable !== undefined ? (
          <section>
            <h2>PASSAGE</h2>
            <p>
              {passable
                ? 'Workers and future Realm movement may cross this terrain when an authoritative route permits it.'
                : 'This terrain is not part of the current traversable world graph.'}
            </p>
          </section>
        ) : null}
        <button onClick={onLocate} type="button">
          LOCATE IN REALM
        </button>
      </article>
    </RealmFullScreenSurface>
  );
}

import type { KeyboardEvent } from 'react';
import { evaluatePlacement04, type Placement04 } from '../../../spacetimedb/gameplay04/placement';
import type { Building04 } from '../../../spacetimedb/gameplay04/policy';
import { nudgePlacement04, placementMessage04, rotatePlacement04 } from '../../ptr/gameplay04/gameplay04Placement';
import type { BuildingView04 } from '../../ptr/gameplay04/gameplay04Presentation';
import { BUILDING_NAMES04 } from './Keep04BuildingPanel';

// Presentation-only outlines mirror placement-v1 metres; evaluatePlacement04
// remains the sole validity authority. No scenery changes legal grounds.
const HALF_EXTENTS04: Readonly<Record<Building04, readonly [number, number]>> = {
  'city-mill': [5.65, 4.75], 'lumber-camp': [5.3, 4.4], 'city-stoneworks': [5.5, 4.6],
  'city-goldworks': [5.5, 4.6], 'city-barracks': [9.25, 7.75], 'grand-covenant-cathedral': [18.5, 16.01],
};
function rectangle(placement: Placement04) {
  const [hx, hz] = HALF_EXTENTS04[placement.kind]; const swap = placement.rotation === 90_000 || placement.rotation === 270_000;
  const halfX = swap ? hz : hx; const halfZ = swap ? hx : hz;
  return { x: Number(placement.x) / 1_000_000 - halfX, y: Number(placement.z) / 1_000_000 - halfZ, width: halfX * 2, height: halfZ * 2 };
}

export function Keep04Schematic({ buildings, draft, selectedKind, onSelect, onChange }: Readonly<{
  buildings: readonly BuildingView04[]; draft: Placement04 | null; selectedKind: Building04 | null;
  onSelect: (kind: Building04) => void; onChange: (draft: Placement04) => void;
}>) {
  const existing = buildings.find(building => building.kind === selectedKind);
  const editable = !existing && draft !== null && draft.kind === selectedKind;
  const result = editable ? evaluatePlacement04(draft, buildings.map(building => building.placement)) : null;
  function nudge(dx: -1 | 0 | 1, dz: -1 | 0 | 1) { if (editable) onChange(nudgePlacement04(draft, dx, dz)); }
  function rotate() { if (editable) onChange(rotatePlacement04(draft)); }
  function keyboard(event: KeyboardEvent<SVGSVGElement>) {
    if (!editable) return;
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as const;
    if (event.key in moves) { event.preventDefault(); const [dx, dz] = moves[event.key as keyof typeof moves]; nudge(dx, dz); }
    if (event.key.toLowerCase() === 'r') { event.preventDefault(); rotate(); }
  }
  return <section className="keep04-schematic" aria-label="Keep grounds">
    <div className="keep04-map-heading"><h2>Citadel grounds</h2><p>Placement schematic · 0.5 m grid</p></div>
    <svg role="application" aria-label="Keep placement schematic" aria-describedby="keep04-map-help" tabIndex={0}
      viewBox="-44 -40 88 72" preserveAspectRatio="none" onKeyDown={keyboard} onClick={event => {
        if (!editable) return;
        const bounds = event.currentTarget.getBoundingClientRect(); if (bounds.width <= 0 || bounds.height <= 0) return;
        const x = -44 + (event.clientX - bounds.left) / bounds.width * 88;
        const z = -40 + (event.clientY - bounds.top) / bounds.height * 72;
        onChange(Object.freeze({ ...draft, x: BigInt(Math.round(x * 2)) * 500_000n, z: BigInt(Math.round(z * 2)) * 500_000n }));
      }}>
      <rect className="keep04-grounds" x={-44} y={-40} width={88} height={72} />
      <g className="keep04-reserved"><rect x={-3} y={-3} width={6} height={35} /><rect x={-5} y={-3} width={10} height={10} /><rect x={-4} y={28} width={8} height={4} /></g>
      <g className="keep04-map-label" aria-hidden="true"><text x={0} y={3}>C</text><text x={0} y={17}>S</text><text x={0} y={31}>G</text></g>
      {buildings.map((building, index) => <g key={building.kind} className="keep04-footprint" data-selected={building.kind === selectedKind} data-phase={building.phase}
        role="button" tabIndex={0} aria-label={`${BUILDING_NAMES04[building.kind]} footprint, completed level ${building.completedLevel}`}
        onClick={event => { event.stopPropagation(); event.currentTarget.focus(); onSelect(building.kind); }}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onSelect(building.kind); }
        }}>
        <title>{BUILDING_NAMES04[building.kind]} · completed level {building.completedLevel} · {building.phase}</title>
        <rect {...rectangle(building.placement)} />
        <text aria-hidden="true" x={Number(building.placement.x) / 1_000_000} y={Number(building.placement.z) / 1_000_000 + 1.5}>{index + 1}</text>
      </g>)}
      {editable && <rect className="keep04-draft" data-valid={result?.valid} {...rectangle(draft)} />}
    </svg>
    <ul className="keep04-map-legend" aria-label="Reserved grounds legend">
      <li>C · <span>Civic commons</span></li><li>S · <span>Gate spine</span></li><li>G · <span>Gate approach</span></li>
    </ul>
    <p id="keep04-map-help">Tap to place. Arrow keys move 0.5 m; R rotates 90°. Roads and civic space must remain clear.</p>
    {result && <p role="status">{placementMessage04(result.reason)}</p>}
    {editable && <div className="keep04-placement-controls" aria-label="Placement controls">
      <button type="button" onClick={() => nudge(0, -1)}>Move up 0.5 m</button>
      <button type="button" onClick={() => nudge(-1, 0)}>Move left 0.5 m</button>
      <button type="button" onClick={() => nudge(1, 0)}>Move right 0.5 m</button>
      <button type="button" onClick={() => nudge(0, 1)}>Move down 0.5 m</button>
      <button type="button" onClick={rotate}>Rotate 90°</button>
    </div>}
    <div className="keep04-sites" aria-label="Completed and constructing sites">
      {buildings.map((building, index) => <button type="button" key={building.kind} aria-pressed={building.kind === selectedKind} onClick={() => onSelect(building.kind)}>
        {index + 1} · Select {BUILDING_NAMES04[building.kind]} · level {building.completedLevel} · {building.phase}
      </button>)}
    </div>
  </section>;
}

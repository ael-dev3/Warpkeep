import { useEffect, useMemo, useRef, useState } from 'react';
import { buildingCost04, buildingDuration04, type Building04, type Cost04, type Resource04 } from '../../../spacetimedb/gameplay04/policy';
import type { Placement04 } from '../../../spacetimedb/gameplay04/placement';
import { buildingBenefit04, buildingDeficits04, quoteBuilding04, type View04 } from '../../ptr/gameplay04/gameplay04Presentation';
import type { BuildQuote04 } from '../../ptr/gameplay04/ptrGameplay04Types';
import type { Snapshot04 } from '../../ptr/gameplay04/createGameplay04Controller';

export const BUILDING_NAMES04: Readonly<Record<Building04, string>> = Object.freeze({
  'city-mill': 'City Mill', 'lumber-camp': 'Lumber Camp', 'city-stoneworks': 'City Stoneworks',
  'city-goldworks': 'City Goldworks', 'city-barracks': 'City Barracks', 'grand-covenant-cathedral': 'Grand Covenant Cathedral',
});
export const RESOURCES04 = ['food', 'wood', 'stone', 'gold'] as const;
const KINDS04 = Object.keys(BUILDING_NAMES04) as Building04[];
const costText = (cost: Cost04) => RESOURCES04.map(resource => `${resource} ${cost[resource]}`).join(' · ');
const secondsText = (micros: bigint) => `${Number(micros) / 1_000_000} s`;

export function Keep04BuildingPanel({ view, selectedKind, draft, enabled, problem, onSelect, onConfirm, onCancelDraft, onFindResources }: Readonly<{
  view: View04; selectedKind: Building04 | null; draft: Placement04 | null; enabled: boolean; problem: Snapshot04['problem'];
  onSelect: (kind: Building04) => void; onConfirm: (quote: BuildQuote04) => void;
  onCancelDraft: () => void; onFindResources: (resource: Resource04) => void;
}>) {
  const completed = view.state.completedLevels;
  const levels = { 'city-mill': completed.mill, 'lumber-camp': completed.lumberCamp, 'city-stoneworks': completed.stoneworks,
    'city-goldworks': completed.goldworks, 'city-barracks': completed.barracks, 'grand-covenant-cathedral': completed.cathedral };
  const existing = view.buildings.find(building => building.kind === selectedKind);
  const placement = existing?.placement ?? (draft?.kind === selectedKind ? draft : null);
  const candidate = useMemo(() => {
    if (!selectedKind || !placement) return null;
    try { return quoteBuilding04(view, selectedKind, placement); } catch { return null; }
  }, [view, selectedKind, placement]);
  // Poll timestamps alone do not invalidate a quote. Authoritative revision, atlas,
  // policy or layout changes do; a fresh confirmation is then an explicit action.
  const realmKey = `${view.state.revision}:${view.atlas?.atlasId}:${view.atlas?.revision}:${view.state.policyVersion}:${view.state.layoutDigest}`;
  const draftKey = `${selectedKind}:${placement?.x}:${placement?.z}:${placement?.rotation}`;
  const [reviewed, setReviewed] = useState(() => ({ realmKey, draftKey, quote: candidate, problem: 'none' as Snapshot04['problem'] }));
  const [sent, setSent] = useState(false);
  const sentRef = useRef(false);
  const changedRealm = reviewed.realmKey !== realmKey || (problem === 'reconfirm' && reviewed.problem !== problem);
  const changedDraft = reviewed.draftKey !== draftKey;
  useEffect(() => {
    if (changedDraft && !changedRealm) {
      setReviewed({ realmKey, draftKey, quote: candidate, problem }); setSent(false); sentRef.current = false;
    }
  }, [changedDraft, changedRealm, realmKey, draftKey, candidate, problem]);
  const deficits = selectedKind ? buildingDeficits04(view, selectedKind) : null;
  const affordable = deficits !== null && RESOURCES04.every(resource => deficits[resource] === 0n);
  const canConfirm = enabled && candidate !== null && reviewed.quote !== null && !changedRealm && !changedDraft && !sent && affordable;
  function review() {
    setReviewed({ realmKey, draftKey, quote: candidate, problem }); setSent(false); sentRef.current = false;
  }
  return <section aria-label="Buildings" className="keep04-building-panel">
    <h2>Buildings</h2>
    <p>Benefits apply after completion. Existing expeditions keep their captured rates.</p>
    {view.state.project !== undefined && <p className="keep04-badge">Builder busy</p>}
    <div className="keep04-catalog">
      {KINDS04.map(kind => {
        const level = levels[kind]; const maximum = level === 5;
        const benefit = buildingBenefit04(view, kind); const missing = buildingDeficits04(view, kind);
        const firstDeficit = RESOURCES04.find(resource => missing[resource] > 0n);
        const value = (amount: bigint) => benefit.unit === 'micros' ? secondsText(amount) : amount.toString();
        return <article key={kind} aria-label={BUILDING_NAMES04[kind]} className="keep04-card" data-selected={selectedKind === kind}>
          <button type="button" aria-pressed={selectedKind === kind} onClick={() => onSelect(kind)}>{BUILDING_NAMES04[kind]}</button>
          <p className="keep04-badge">Completed level {level}</p>
          {maximum ? <p>Maximum level</p> : <>
            <p>Cost: {costText(buildingCost04(kind, level + 1))}</p>
            <p>Build duration: {secondsText(buildingDuration04(level + 1, levels))}</p>
          </>}
          <p>Missing: {costText(missing)}</p>
          <p>{benefit.label}</p><p>Current: {value(benefit.current)} → Next: {value(benefit.next)}</p>
          {firstDeficit && <button type="button" onClick={() => onFindResources(firstDeficit)}>Find {firstDeficit}</button>}
        </article>;
      })}
    </div>
    {selectedKind && <div className="keep04-primary-action">
      <h3>{existing ? 'Upgrade' : 'Place'} {BUILDING_NAMES04[selectedKind]}</h3>
      {placement && <p>{existing ? 'Permanent site' : 'Draft'}: x {Number(placement.x) / 1_000_000} m · z {Number(placement.z) / 1_000_000} m · {placement.rotation / 1000}°</p>}
      <p>Permanent placement: construction cannot be cancelled and spent resources are not refunded.</p>
      {changedRealm && <><p role="status">Review updated costs and confirm again</p><button type="button" disabled={!enabled} onClick={review}>Review updated costs</button></>}
      {!placement && <p role="status">No valid draft selected. Choose a building site.</p>}
      <button type="button" className="keep04-confirm" disabled={!canConfirm} onClick={() => {
        if (!canConfirm || sentRef.current || !reviewed.quote) return;
        sentRef.current = true; setSent(true); onConfirm(reviewed.quote);
      }}>{existing ? 'Confirm upgrade' : 'Confirm placement'}</button>
      {!existing && <button type="button" onClick={onCancelDraft}>Cancel draft · free</button>}
    </div>}
  </section>;
}

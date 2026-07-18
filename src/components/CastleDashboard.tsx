import { useMemo } from 'react';
import { BUILDING_DESCRIPTIONS, BUILDING_LABELS, UNIT_LABELS } from '../game/constants/gameConstants';
import type { BuildingType, GameState, NearbyCastle } from '../game/models/types';
import { createStaticCourtReport } from '../ai/courtReport';

interface CastleDashboardProps {
  state: GameState;
  onCollectResources: () => void;
  onUpgradeBuilding: (buildingType: BuildingType) => void;
  onTrainScouts: () => void;
  onScoutCastle: (castle: NearbyCastle) => void;
}

const resourceLabels = [
  ['grain', 'Grain'],
  ['stone', 'Stone'],
  ['iron', 'Iron'],
  ['influence', 'Influence']
] as const;

export function CastleDashboard({
  state,
  onCollectResources,
  onUpgradeBuilding,
  onTrainScouts,
  onScoutCastle
}: CastleDashboardProps) {
  const courtReport = useMemo(() => createStaticCourtReport({ state, tone: 'mysterious' }), [state]);

  return (
    <main className="dashboard-shell">
      <section className="command-card identity-card">
        <div>
          <p className="eyebrow">Castle dashboard</p>
          <h1>{state.castle.name}</h1>
          <p className="tagline">Every admitted founder has a castle.</p>
        </div>
        <dl className="identity-grid">
          <div>
            <dt>Handle</dt>
            <dd>@{state.player.handle}</dd>
          </div>
          <div>
            <dt>FID</dt>
            <dd>{state.player.fid}</dd>
          </div>
          <div>
            <dt>Faction / Region</dt>
            <dd>{state.castle.region}</dd>
          </div>
          <div>
            <dt>Castle Level</dt>
            <dd>{state.castle.level}</dd>
          </div>
        </dl>
      </section>

      <section className="dashboard-grid">
        <article className="command-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Stores</p>
              <h2>Resources</h2>
            </div>
            <button type="button" onClick={onCollectResources}>Collect resources</button>
          </div>
          <div className="resource-grid">
            {resourceLabels.map(([key, label]) => (
              <div className="resource-tile" key={key}>
                <span>{label}</span>
                <strong>{state.resources[key].toLocaleString()}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="command-card">
          <p className="eyebrow">Stone and signal</p>
          <h2>Castle overview</h2>
          <div className="building-grid">
            {state.buildings.map((building) => (
              <div className="building-card" key={building.id}>
                <div>
                  <strong>{BUILDING_LABELS[building.type]}</strong>
                  <span>Level {building.level}</span>
                </div>
                <p>{BUILDING_DESCRIPTIONS[building.type]}</p>
                <button type="button" onClick={() => onUpgradeBuilding(building.type)}>
                  Upgrade
                </button>
              </div>
            ))}
          </div>
        </article>

        <article className="command-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Orders</p>
              <h2>Queues</h2>
            </div>
            <button type="button" onClick={onTrainScouts}>Train scouts</button>
          </div>
          <div className="queue-list">
            <div>
              <h3>Building upgrade queue</h3>
              {state.constructionQueue.length === 0 ? <p>No masons assigned.</p> : state.constructionQueue.map((item) => (
                <p key={item.id}>{BUILDING_LABELS[item.buildingType]} → level {item.targetLevel}, completes at t+{item.completesAt}s</p>
              ))}
            </div>
            <div>
              <h3>Training queue</h3>
              {state.trainingQueue.length === 0 ? <p>No units training.</p> : state.trainingQueue.map((item) => (
                <p key={item.id}>{item.quantity} {UNIT_LABELS[item.unitType]} units, ready at t+{item.completesAt}s</p>
              ))}
            </div>
          </div>
        </article>

        <article className="command-card">
          <p className="eyebrow">World</p>
          <h2>Nearby FID castles</h2>
          <div className="nearby-grid">
            {state.nearbyCastles.map((castle) => (
              <div className="nearby-card" key={castle.fid}>
                <strong>@{castle.handle}</strong>
                <span>FID {castle.fid}</span>
                <span>Level {castle.level} keep · {castle.distance} leagues</span>
                <div className="nearby-actions">
                  <button type="button" onClick={() => onScoutCastle(castle)}>Scout</button>
                  <button type="button" disabled>Visit</button>
                  <button type="button" disabled>Diplomacy</button>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="command-card court-card">
          <p className="eyebrow">AI flavor placeholder</p>
          <h2>{courtReport.title}</h2>
          <p>{courtReport.body}</p>
          <small>AI may write flavor later. Game correctness remains deterministic.</small>
        </article>

        <article className="command-card activity-card">
          <p className="eyebrow">Realm memory</p>
          <h2>Activity log</h2>
          <ol>
            {state.activityLog.slice(0, 8).map((entry) => (
              <li key={entry.id}>{entry.message}</li>
            ))}
          </ol>
        </article>
      </section>
    </main>
  );
}

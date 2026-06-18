import { useState } from 'react';
import { CastleDashboard } from './components/CastleDashboard';
import { LandingPage } from './components/LandingPage';
import { placeholderFarcasterSession } from './farcaster/farcasterAuth';
import type { BuildingType, GameState, NearbyCastle } from './game/models/types';
import { collectResources, createCastleForFid, recordScoutReport, startBuildingUpgrade, startUnitTraining } from './game/systems/gameLoop';
import { nearbyFidCastles } from './game/mockData/mockCastle';

const createInitialState = (): GameState => ({
  ...createCastleForFid(placeholderFarcasterSession.identity),
  nearbyCastles: nearbyFidCastles
});

export default function App() {
  const [signedIn, setSignedIn] = useState(false);
  const [gameState, setGameState] = useState<GameState>(() => createInitialState());
  const [clock, setClock] = useState(1_000);

  const advanceClock = (seconds = 30) => {
    setClock((value) => value + seconds);
    return clock + seconds;
  };

  const handleCollectResources = () => {
    setGameState((state) => collectResources(state, 60));
  };

  const handleUpgradeBuilding = (buildingType: BuildingType) => {
    const now = advanceClock(15);
    setGameState((state) => startBuildingUpgrade(state, buildingType, now));
  };

  const handleTrainScouts = () => {
    const now = advanceClock(15);
    setGameState((state) => startUnitTraining(state, 'scout', 2, now));
  };

  const handleScoutCastle = (castle: NearbyCastle) => {
    setGameState((state) => recordScoutReport(state, castle));
  };

  if (!signedIn) {
    return <LandingPage onEnterCastle={() => setSignedIn(true)} />;
  }

  return (
    <CastleDashboard
      state={gameState}
      onCollectResources={handleCollectResources}
      onUpgradeBuilding={handleUpgradeBuilding}
      onTrainScouts={handleTrainScouts}
      onScoutCastle={handleScoutCastle}
    />
  );
}

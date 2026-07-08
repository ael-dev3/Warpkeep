import { WarpkeepTitleScreen3D } from './title/WarpkeepTitleScreen3D';

interface LandingPageProps {
  onEnterCastle: () => void;
}

export function LandingPage({ onEnterCastle }: LandingPageProps) {
  return <WarpkeepTitleScreen3D onEnterCastle={onEnterCastle} />;
}

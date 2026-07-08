import { titleTheme } from './titleTheme';

interface WarpkeepTitleScreenFallbackProps {
  onEnterCastle: () => void;
}

const fallbackStars = Array.from({ length: 34 }, (_, index) => ({
  id: `fallback-star-${index}`,
  left: `${(index * 29 + 11) % 100}%`,
  top: `${(index * 47 + 17) % 100}%`,
  delay: `${(index % 9) * -0.7}s`,
  size: `${2 + (index % 4)}px`
}));

export function WarpkeepTitleScreenFallback({ onEnterCastle }: WarpkeepTitleScreenFallbackProps) {
  return (
    <main className="warpkeep-title-screen warpkeep-title-screen--fallback" aria-label="Warpkeep title screen">
      <div className="warpkeep-fallback-nebula" aria-hidden="true" />
      <div className="warpkeep-fallback-stars" aria-hidden="true">
        {fallbackStars.map((star) => (
          <span
            key={star.id}
            style={{ left: star.left, top: star.top, animationDelay: star.delay, width: star.size, height: star.size }}
          />
        ))}
      </div>
      <div className="warpkeep-title-overlay warpkeep-title-overlay--fallback">
        <h1 className="warpkeep-fallback-title">{titleTheme.title}</h1>
        <button className="warpkeep-title-button" type="button" onClick={onEnterCastle}>
          Enter Warpkeep
        </button>
      </div>
    </main>
  );
}

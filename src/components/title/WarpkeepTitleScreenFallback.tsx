import { titleTheme } from './titleTheme';

const fallbackStars = Array.from({ length: 22 }, (_, index) => ({
  id: `fallback-star-${index}`,
  left: `${(index * 31 + 9) % 100}%`,
  top: `${(index * 43 + 13) % 100}%`,
  delay: `${(index % 7) * -0.85}s`,
  size: `${2 + (index % 3)}px`
}));

export function WarpkeepTitleScreenFallback() {
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
      <div className="warpkeep-title-overlay--fallback">
        <h1 className="warpkeep-fallback-title">{titleTheme.title}</h1>
      </div>
    </main>
  );
}

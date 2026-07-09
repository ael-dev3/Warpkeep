import { WarpkeepTitleSoundtrack } from './WarpkeepTitleSoundtrack';
import { titleTheme } from './titleTheme';

const fallbackStars = Array.from({ length: 48 }, (_, index) => ({
  id: `fallback-star-${index}`,
  left: `${(index * 47 + 7) % 101}%`,
  top: `${(index * 61 + 11) % 97}%`,
  delay: `${(index % 11) * -0.62}s`,
  duration: `${7.5 + (index % 6) * 0.8}s`,
  size: `${index % 13 === 0 ? 4 : 1 + (index % 3)}px`
}));

export function WarpkeepTitleScreenFallback() {
  return (
    <main className="warpkeep-title-screen warpkeep-title-screen--fallback" aria-label="Warpkeep title screen">
      <div className="warpkeep-fallback-stars" aria-hidden="true">
        {fallbackStars.map((star) => (
          <span
            key={star.id}
            style={{
              left: star.left,
              top: star.top,
              width: star.size,
              height: star.size,
              animationDelay: star.delay,
              animationDuration: star.duration
            }}
          />
        ))}
      </div>
      <div className="warpkeep-fallback-galaxy" aria-hidden="true">
        <div className="warpkeep-fallback-rift" />
      </div>
      <div className="warpkeep-fallback-title-stage">
        <h1 className="warpkeep-fallback-title">{titleTheme.title}</h1>
      </div>
      <div className="warpkeep-title-vignette" aria-hidden="true" />
      <WarpkeepTitleSoundtrack />
    </main>
  );
}

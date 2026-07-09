import { WarpkeepTitleSoundtrack } from './WarpkeepTitleSoundtrack';
import { getBrutalistGlyph } from './brutalistGlyphs';
import { titleTheme } from './titleTheme';

const fallbackStars = Array.from({ length: 48 }, (_, index) => ({
  id: `fallback-star-${index}`,
  left: `${(index * 47 + 7) % 101}%`,
  top: `${(index * 61 + 11) % 97}%`,
  delay: `${(index % 11) * -0.62}s`,
  duration: `${7.5 + (index % 6) * 0.8}s`,
  size: `${index % 13 === 0 ? 4 : 1 + (index % 3)}px`
}));

const glyphHeight = 100;
const glyphGap = 7;
const fallbackGlyphs = Array.from(titleTheme.title).map((character) => ({
  character,
  glyph: getBrutalistGlyph(character)
}));
const fallbackTitleWidth = fallbackGlyphs.reduce(
  (width, { glyph }, index) => width + glyph.width * glyphHeight + (index === 0 ? 0 : glyphGap),
  0
);

function polygonPoints(points: ReadonlyArray<readonly [number, number]>, glyphWidth: number) {
  return points
    .map(([x, y]) => `${(x * glyphWidth * glyphHeight).toFixed(2)},${((1 - y) * glyphHeight).toFixed(2)}`)
    .join(' ');
}

function MonumentWordmark() {
  let cursor = 0;

  return (
    <svg
      className="warpkeep-fallback-wordmark"
      viewBox={`-14 -9 ${fallbackTitleWidth + 28} 132`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="warpkeepConcreteFace" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7b7775" />
          <stop offset="0.28" stopColor="#c3beb4" />
          <stop offset="0.48" stopColor="#e1ddd2" />
          <stop offset="0.56" stopColor="#a78eae" />
          <stop offset="0.72" stopColor="#bcb7ad" />
          <stop offset="1" stopColor="#6d6a6b" />
        </linearGradient>
        <filter id="warpkeepConcreteWear" x="-15%" y="-15%" width="130%" height="145%">
          <feTurbulence type="fractalNoise" baseFrequency="0.065 0.24" numOctaves="3" seed="71" result="wear" />
          <feColorMatrix
            in="wear"
            values="0.26 0 0 0 0.16  0 0.25 0 0 0.15  0 0 0.24 0 0.14  0 0 0 0.34 0"
            result="weathering"
          />
          <feBlend in="SourceGraphic" in2="weathering" mode="multiply" />
        </filter>
      </defs>
      {fallbackGlyphs.map(({ character, glyph }, glyphIndex) => {
        const glyphWidth = glyph.width * glyphHeight;
        const glyphX = cursor + (glyphIndex === 0 ? 0 : glyphGap);
        cursor = glyphX + glyphWidth;

        return (
          <g key={`${character}-${glyphIndex}`} transform={`translate(${glyphX} 0)`}>
            {glyph.parts.map((glyphPart, partIndex) => {
              const points = polygonPoints(glyphPart.points, glyph.width);
              const depth = 8 + glyphPart.tier * 2.4;
              return (
                <g key={`${character}-${partIndex}`}>
                  <polygon
                    points={points}
                    transform={`translate(${-depth * 0.42} ${depth})`}
                    fill="#26252d"
                    stroke="#121219"
                    strokeWidth="1.2"
                  />
                  <polygon
                    points={points}
                    transform={`translate(${-depth * 0.18} ${depth * 0.5})`}
                    fill="#4d4950"
                    stroke="#2f2d34"
                    strokeWidth="0.7"
                  />
                  <polygon
                    points={points}
                    fill="url(#warpkeepConcreteFace)"
                    stroke="#716b70"
                    strokeWidth="0.85"
                    filter="url(#warpkeepConcreteWear)"
                  />
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

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
        <div className="warpkeep-fallback-galaxy-core" />
      </div>
      <div className="warpkeep-fallback-title-stage">
        <h1 className="sr-only">{titleTheme.title}</h1>
        <MonumentWordmark />
      </div>
      <div className="warpkeep-title-vignette" aria-hidden="true" />
      <WarpkeepTitleSoundtrack />
    </main>
  );
}

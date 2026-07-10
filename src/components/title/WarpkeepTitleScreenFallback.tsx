import { useCallback, useEffect, useRef } from 'react';
import {
  BlackHoleGateway,
  type BlackHoleGatewayHandle
} from './BlackHoleGateway';
import { WarpkeepTitleSoundtrack } from './WarpkeepTitleSoundtrack';
import {
  layoutBrutalistGlyphs,
  type BrutalistGlyphDefinition,
  type BrutalistGlyphPoint
} from './brutalistGlyphs';
import { titleTheme } from './titleTheme';
import { titleSceneSpec } from './titleSceneSpec';

const fallbackStars = Array.from({ length: 48 }, (_, index) => ({
  id: `fallback-star-${index}`,
  left: `${(index * 47 + 7) % 101}%`,
  top: `${(index * 61 + 11) % 97}%`,
  delay: `${(index % 11) * -0.62}s`,
  duration: `${7.5 + (index % 6) * 0.8}s`,
  size: `${index % 13 === 0 ? 4 : 1 + (index % 3)}px`
}));

const glyphHeight = 100;
const fallbackLayout = layoutBrutalistGlyphs(titleTheme.title, glyphHeight);
const fallbackTitleWidth = fallbackLayout.width;

function contourPath(points: ReadonlyArray<BrutalistGlyphPoint>, offsetX: number) {
  return points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${(x * glyphHeight + offsetX).toFixed(2)} ${((1 - y) * glyphHeight).toFixed(2)}`)
    .join(' ') + ' Z';
}

function glyphPath(glyph: BrutalistGlyphDefinition, offsetX: number) {
  return [glyph.outer, ...glyph.holes]
    .map((points) => contourPath(points, offsetX))
    .join(' ');
}

function MonumentWordmark() {
  const pathData = fallbackLayout.placements.map((placement) => ({
    ...placement,
    path: glyphPath(placement.glyph, placement.x)
  }));

  return (
    <svg
      className="warpkeep-fallback-wordmark"
      viewBox={`-12 -7 ${fallbackTitleWidth + 24} 125`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="warpkeepConcreteFace"
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="12"
          x2={fallbackTitleWidth}
          y2="92"
        >
          <stop offset="0" stopColor="#aaa7a2" />
          <stop offset="0.22" stopColor="#d7d3ca" />
          <stop offset="0.48" stopColor="#eeeae0" />
          <stop offset="0.68" stopColor="#d8d3cb" />
          <stop offset="1" stopColor="#aaa6a3" />
        </linearGradient>
        <filter
          id="warpkeepConcreteGrain"
          filterUnits="userSpaceOnUse"
          x="-12"
          y="-7"
          width={fallbackTitleWidth + 24}
          height="125"
        >
          <feTurbulence type="fractalNoise" baseFrequency="0.018 0.035" numOctaves="1" seed="71" result="grain" />
          <feColorMatrix
            in="grain"
            values="0.035 0 0 0 -0.012  0 0.035 0 0 -0.012  0 0 0.035 0 -0.012  0 0 0 0.09 0"
            result="subtleGrain"
          />
          <feBlend in="SourceGraphic" in2="subtleGrain" mode="soft-light" />
        </filter>
      </defs>

      <g className="warpkeep-fallback-wordmark-depth">
        {pathData.map(({ character, index, path }) => (
          <path
            key={`back-${character}-${index}`}
            d={path}
            transform="translate(-4.1 9.2)"
            fill="#3f3e45"
            fillRule="evenodd"
          />
        ))}
        {pathData.map(({ character, index, path }) => (
          <path
            key={`side-${character}-${index}`}
            d={path}
            transform="translate(-1.9 4.3)"
            fill="#96928f"
            fillRule="evenodd"
          />
        ))}
      </g>

      <g filter="url(#warpkeepConcreteGrain)">
        {pathData.map(({ character, index, path }) => (
          <path
            key={`face-${character}-${index}`}
            d={path}
            fill="url(#warpkeepConcreteFace)"
            fillRule="evenodd"
            clipRule="evenodd"
            stroke="#8f8b8b"
            strokeWidth="0.65"
          />
        ))}
      </g>
    </svg>
  );
}

export function WarpkeepTitleScreenFallback() {
  const screenRef = useRef<HTMLElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const gatewayRef = useRef<BlackHoleGatewayHandle>(null);
  const surgeTimerRef = useRef(0);

  const positionGateway = useCallback(() => {
    const screen = screenRef.current;
    const core = coreRef.current;
    if (!screen || !core) {
      return;
    }

    const screenBounds = screen.getBoundingClientRect();
    const coreBounds = core.getBoundingClientRect();
    const width = screenBounds.width || screen.clientWidth || window.innerWidth;
    const height = screenBounds.height || screen.clientHeight || window.innerHeight;
    const centerX = coreBounds.left - screenBounds.left + coreBounds.width * 0.5;
    const centerY = coreBounds.top - screenBounds.top + coreBounds.height * 0.5;
    gatewayRef.current?.setProjectedPosition(
      centerX,
      centerY,
      width,
      height,
      coreBounds.width > 0 && coreBounds.height > 0
    );
  }, []);

  const handleGatewayActivate = useCallback(() => {
    // Future: navigate to the Warpkeep game menu once that destination exists.
    const screen = screenRef.current;
    if (!screen) {
      return;
    }

    window.clearTimeout(surgeTimerRef.current);
    screen.dataset.gatewaySurging = 'false';
    void screen.offsetWidth;
    screen.dataset.gatewaySurging = 'true';
    surgeTimerRef.current = window.setTimeout(() => {
      screen.dataset.gatewaySurging = 'false';
    }, titleSceneSpec.gateway.surgeDurationSeconds * 1_000);
  }, []);

  useEffect(() => {
    const screen = screenRef.current;
    const core = coreRef.current;
    if (!screen || !core) {
      return undefined;
    }

    let resizeObserver: ResizeObserver | null = null;
    const frame = window.setTimeout(positionGateway, 0);
    window.addEventListener('resize', positionGateway);
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(positionGateway);
      resizeObserver.observe(screen);
      resizeObserver.observe(core);
    }
    positionGateway();

    return () => {
      window.clearTimeout(frame);
      window.clearTimeout(surgeTimerRef.current);
      window.removeEventListener('resize', positionGateway);
      resizeObserver?.disconnect();
      gatewayRef.current?.setProjectedPosition(0, 0, 0, 0, false);
    };
  }, [positionGateway]);

  return (
    <main
      ref={screenRef}
      className="warpkeep-title-screen warpkeep-title-screen--fallback"
      aria-label="Warpkeep title screen"
      data-gateway-surging="false"
    >
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
        <div ref={coreRef} className="warpkeep-fallback-galaxy-core" />
      </div>
      <div className="warpkeep-fallback-title-stage">
        <h1 className="sr-only">{titleTheme.title}</h1>
        <MonumentWordmark />
      </div>
      <BlackHoleGateway
        ref={gatewayRef}
        onActivate={handleGatewayActivate}
        autoDismissMs={titleSceneSpec.gateway.noticeDurationMs}
      />
      <div className="warpkeep-title-vignette" aria-hidden="true" />
      <WarpkeepTitleSoundtrack />
    </main>
  );
}

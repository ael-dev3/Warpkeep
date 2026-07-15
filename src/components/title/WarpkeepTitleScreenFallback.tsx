import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import {
  BlackHoleGateway,
  type BlackHoleGatewayHandle
} from './BlackHoleGateway';
import { titleSceneSpec } from './titleSceneSpec';
import {
  fallbackGatewayProjection,
  type WarpkeepTitleScreenHandle,
  type WarpkeepTitleScreenProps
} from './titleScreenTypes';

const fallbackStars = Array.from({ length: 48 }, (_, index) => ({
  id: `fallback-star-${index}`,
  left: `${(index * 47 + 7) % 101}%`,
  top: `${(index * 61 + 11) % 97}%`,
  delay: `${(index % 11) * -0.62}s`,
  duration: `${7.5 + (index % 6) * 0.8}s`,
  size: `${index % 13 === 0 ? 4 : 1 + (index % 3)}px`
}));

export const WarpkeepTitleScreenFallback = forwardRef<
  WarpkeepTitleScreenHandle,
  WarpkeepTitleScreenProps
>(function WarpkeepTitleScreenFallback(
  {
    phase = 'active',
    onRequestEnterMenu,
    onReady,
    onMeaningfulInteraction
  },
  forwardedRef
) {
  const screenRef = useRef<HTMLElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const gatewayRef = useRef<BlackHoleGatewayHandle>(null);
  const surgeTimerRef = useRef(0);
  const entryRequestedRef = useRef(false);
  const readyNotifiedRef = useRef(false);
  const callbacksRef = useRef({ onRequestEnterMenu, onReady, onMeaningfulInteraction });
  callbacksRef.current = { onRequestEnterMenu, onReady, onMeaningfulInteraction };

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
    if (!readyNotifiedRef.current && coreBounds.width > 0 && coreBounds.height > 0) {
      readyNotifiedRef.current = true;
      callbacksRef.current.onReady?.();
    }
  }, []);

  const requestEnter = useCallback((input: 'keyboard' | 'pointer') => {
    if (entryRequestedRef.current || phase !== 'active') {
      return;
    }
    entryRequestedRef.current = true;
    const screen = screenRef.current;
    if (screen) {
      window.clearTimeout(surgeTimerRef.current);
      screen.dataset.gatewaySurging = 'false';
      void screen.offsetWidth;
      screen.dataset.gatewaySurging = 'true';
      surgeTimerRef.current = window.setTimeout(() => {
        screen.dataset.gatewaySurging = 'false';
      }, titleSceneSpec.gateway.surgeDurationSeconds * 1_000);
    }
    callbacksRef.current.onMeaningfulInteraction?.();
    const projection = gatewayRef.current?.getProjectedPosition() ?? fallbackGatewayProjection();
    callbacksRef.current.onRequestEnterMenu?.(
      projection.visible ? projection : fallbackGatewayProjection(),
      input
    );
  }, [phase]);

  useImperativeHandle(forwardedRef, () => ({
    requestEnter,
    focusGateway: () => gatewayRef.current?.focus(),
    getGatewayProjection: () => (
      gatewayRef.current?.getProjectedPosition() ?? fallbackGatewayProjection()
    )
  }), [requestEnter]);

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
      data-title-phase={phase}
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
        <div ref={coreRef} className="warpkeep-fallback-galaxy-core">
          <span className="warpkeep-fallback-lens warpkeep-fallback-lens--upper" />
          <span className="warpkeep-fallback-lens warpkeep-fallback-lens--lower" />
          <span className="warpkeep-fallback-ray warpkeep-fallback-ray--primary" />
          <span className="warpkeep-fallback-ray warpkeep-fallback-ray--secondary" />
        </div>
      </div>
      <BlackHoleGateway
        ref={gatewayRef}
        onActivate={requestEnter}
        onMeaningfulInteraction={onMeaningfulInteraction}
        disabled={phase !== 'active'}
      />
      <div className="warpkeep-title-vignette" aria-hidden="true" />
    </main>
  );
});

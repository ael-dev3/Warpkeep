import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef
} from 'react';
import {
  BlackHoleGateway,
  type BlackHoleGatewayHandle,
  type GatewayActivationInput,
  type GatewayActivationRecord
} from './BlackHoleGateway';
import {
  createGatewayRendererPoint,
  snapshotGatewayRect,
  type GatewayRenderedMeasurement
} from './gatewayActivation';
import { titleSceneSpec } from './titleSceneSpec';
import {
  fallbackGatewayActivation,
  fallbackGatewayClientCenter,
  fallbackGatewayMeasurement,
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
  const galaxyRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const gatewayRef = useRef<BlackHoleGatewayHandle>(null);
  const frozenLayoutStyleRef = useRef<{
    surfaceCssText: string | null;
    galaxyCssText: string | null;
  } | null>(null);
  const surgeTimerRef = useRef(0);
  const entryRequestedRef = useRef(false);
  const readyNotifiedRef = useRef(false);
  const callbacksRef = useRef({ onRequestEnterMenu, onReady, onMeaningfulInteraction });
  callbacksRef.current = { onRequestEnterMenu, onReady, onMeaningfulInteraction };

  useLayoutEffect(() => {
    const surface = screenRef.current;
    const galaxy = galaxyRef.current;
    const shouldFreeze = phase === 'departing' || phase === 'returning';
    if (surface && galaxy && shouldFreeze && !frozenLayoutStyleRef.current) {
      const width = Math.max(1, surface.clientWidth);
      const height = Math.max(1, surface.clientHeight);
      const galaxyLeft = galaxy.offsetLeft;
      const galaxyTop = galaxy.offsetTop;
      const galaxyWidth = Math.max(1, galaxy.offsetWidth);
      const galaxyHeight = Math.max(1, galaxy.offsetHeight);
      frozenLayoutStyleRef.current = {
        surfaceCssText: surface.getAttribute('style'),
        galaxyCssText: galaxy.getAttribute('style')
      };
      surface.style.width = `${width}px`;
      surface.style.height = `${height}px`;
      surface.style.minWidth = `${width}px`;
      surface.style.maxWidth = `${width}px`;
      surface.style.minHeight = `${height}px`;
      surface.style.maxHeight = `${height}px`;
      galaxy.style.top = `${galaxyTop}px`;
      galaxy.style.left = `${galaxyLeft}px`;
      galaxy.style.width = `${galaxyWidth}px`;
      galaxy.style.height = `${galaxyHeight}px`;
      galaxy.style.aspectRatio = 'auto';
    } else if (surface && galaxy && !shouldFreeze && frozenLayoutStyleRef.current) {
      const { surfaceCssText, galaxyCssText } = frozenLayoutStyleRef.current;
      if (surfaceCssText === null) {
        surface.removeAttribute('style');
      } else {
        surface.setAttribute('style', surfaceCssText);
      }
      if (galaxyCssText === null) {
        galaxy.removeAttribute('style');
      } else {
        galaxy.setAttribute('style', galaxyCssText);
      }
      frozenLayoutStyleRef.current = null;
    }
  }, [phase]);

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
    const ready = gatewayRef.current?.setRenderedGateway(
      createGatewayRendererPoint({
        x: centerX,
        y: centerY,
        viewportWidth: width,
        viewportHeight: height,
        visible: coreBounds.width > 0 && coreBounds.height > 0
      }),
      snapshotGatewayRect(screenBounds)
    );
    if (!readyNotifiedRef.current && ready) {
      readyNotifiedRef.current = true;
      callbacksRef.current.onReady?.();
    }
  }, []);

  const requestEnter = useCallback((
    activationOrInput: GatewayActivationRecord | GatewayActivationInput
  ) => {
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
    const activation = typeof activationOrInput === 'string'
      ? gatewayRef.current?.captureActivation(activationOrInput)
        ?? fallbackGatewayActivation(activationOrInput)
      : activationOrInput;
    if (!activation.ready) {
      entryRequestedRef.current = false;
      return;
    }
    callbacksRef.current.onRequestEnterMenu?.(activation);
  }, [phase]);

  useImperativeHandle(forwardedRef, () => ({
    requestEnter,
    focusGateway: () => gatewayRef.current?.focus(),
    getGatewayClientCenter: () => (
      gatewayRef.current?.getGatewayClientCenter() ?? fallbackGatewayClientCenter()
    ),
    getGatewayMeasurement: (): GatewayRenderedMeasurement => (
      gatewayRef.current?.getRenderedMeasurement() ?? fallbackGatewayMeasurement()
    ),
    getGatewayActivation: (input) => (
      gatewayRef.current?.captureActivation(input) ?? fallbackGatewayActivation(input)
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
      gatewayRef.current?.setRenderedGateway(
        createGatewayRendererPoint({
          x: 0,
          y: 0,
          viewportWidth: 0,
          viewportHeight: 0,
          visible: false
        }),
        null
      );
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
      <div ref={galaxyRef} className="warpkeep-fallback-galaxy" aria-hidden="true">
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

import {
  type AnimationEvent,
  type CSSProperties,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import {
  clientPointToOverlay,
  snapshotGatewayRect,
  type GatewayOverlayPoint,
  type GatewaySurfaceRect
} from '../title/gatewayActivation';
import {
  getWarpTransitionTiming,
  type GatewayTransitionRequest
} from './experienceTransition';
import './WarpTransitionOverlay.css';

export type WarpTransitionOverlayProps = {
  request: GatewayTransitionRequest;
  /**
   * Pass the experience controller's media-query result when available. When
   * omitted, the current `prefers-reduced-motion` value is sampled at render.
   */
  reducedMotion?: boolean;
  onArmed?: () => void;
  onCovered?: () => void;
  onComplete?: () => void;
  className?: string;
};

type WarpOverlayStyle = CSSProperties & {
  '--warp-origin-x'?: string;
  '--warp-origin-y'?: string;
  '--warp-transition-duration': string;
  '--warp-cover-at': string;
};

type ResolvedOverlayOrigin = Readonly<{
  point: GatewayOverlayPoint;
  rect: GatewaySurfaceRect;
}>;

export function prefersReducedWarpMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function WarpTransitionOverlay({
  request,
  reducedMotion,
  onArmed,
  onCovered,
  onComplete,
  className
}: WarpTransitionOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const originLockedRef = useRef(false);
  const onArmedRef = useRef(onArmed);
  const coveredNotifiedRef = useRef(false);
  const completedNotifiedRef = useRef(false);
  const [resolvedOrigin, setResolvedOrigin] =
    useState<ResolvedOverlayOrigin | null>(null);
  const usesReducedMotion = reducedMotion ?? prefersReducedWarpMotion();
  const timing = getWarpTransitionTiming(usesReducedMotion);
  onArmedRef.current = onArmed;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    originLockedRef.current = false;

    const resolveOrigin = () => {
      if (originLockedRef.current) return;
      const rect = snapshotGatewayRect(root.getBoundingClientRect());
      const point = rect
        ? clientPointToOverlay(request.gatewayClientOrigin, rect)
        : null;
      if (!rect || !point) {
        setResolvedOrigin(null);
        return;
      }
      originLockedRef.current = true;
      setResolvedOrigin(Object.freeze({ point, rect }));
      onArmedRef.current?.();
    };

    resolveOrigin();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', resolveOrigin);
      return () => window.removeEventListener('resize', resolveOrigin);
    }
    const observer = new ResizeObserver(resolveOrigin);
    observer.observe(root);
    return () => observer.disconnect();
  }, [request]);

  const style: WarpOverlayStyle = {
    '--warp-transition-duration': `${timing.totalMs}ms`,
    '--warp-cover-at': `${timing.coverAtMs}ms`
  };
  if (resolvedOrigin) {
    style['--warp-origin-x'] = `${resolvedOrigin.point.x}px`;
    style['--warp-origin-y'] = `${resolvedOrigin.point.y}px`;
  }

  const notifyCovered = () => {
    if (!resolvedOrigin || coveredNotifiedRef.current) return;
    coveredNotifiedRef.current = true;
    onCovered?.();
  };

  const notifyComplete = (event: AnimationEvent<HTMLDivElement>) => {
    if (
      !resolvedOrigin
      || event.target !== event.currentTarget
      || completedNotifiedRef.current
    ) return;
    completedNotifiedRef.current = true;
    onComplete?.();
  };

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={['warp-transition-overlay', className].filter(Boolean).join(' ')}
      data-direction={request.direction}
      data-input={request.input}
      data-motion={usesReducedMotion ? 'reduced' : 'standard'}
      data-origin-ready={String(resolvedOrigin !== null)}
      data-transition-sequence={request.sequence}
      data-accepted-at={request.acceptedAt}
      data-gateway-client-x={request.gatewayClientOrigin.x}
      data-gateway-client-y={request.gatewayClientOrigin.y}
      data-overlay-left={resolvedOrigin?.rect.left ?? ''}
      data-overlay-top={resolvedOrigin?.rect.top ?? ''}
      data-overlay-width={resolvedOrigin?.rect.width ?? ''}
      data-overlay-height={resolvedOrigin?.rect.height ?? ''}
      data-overlay-origin-x={resolvedOrigin?.point.x ?? ''}
      data-overlay-origin-y={resolvedOrigin?.point.y ?? ''}
      data-testid="warp-transition-overlay"
      onAnimationEnd={notifyComplete}
      style={style}
    >
      <span className="warp-transition-overlay__depth" />
      <span className="warp-transition-overlay__ribbons" />
      <span
        className="warp-transition-overlay__cover-signal"
        onAnimationEnd={notifyCovered}
      />
    </div>
  );
}

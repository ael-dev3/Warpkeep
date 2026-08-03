import {
  type AnimationEvent,
  type CSSProperties,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';
import {
  clientPointToOverlay,
  snapshotGatewayRect,
  type GatewayOverlayPoint,
  type GatewaySurfaceRect
} from '../title/gatewayActivation';
import {
  getWarpTransitionTiming,
  type GatewayTransitionRequest,
  type WarpTransitionVariant
} from './experienceTransition';
import './WarpTransitionOverlay.css';

export type WarpTransitionOverlayProps = {
  request: GatewayTransitionRequest;
  /**
   * Pass the experience controller's media-query result when available. When
   * omitted, the current `prefers-reduced-motion` value is sampled at render.
   */
  reducedMotion?: boolean;
  variant?: WarpTransitionVariant;
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
  clientWidth: number;
  clientHeight: number;
  visualViewport: Readonly<{
    offsetLeft: number;
    offsetTop: number;
    width: number;
    height: number;
    scale: number;
  }>;
}>;

function finiteOr(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : fallback;
}

function currentVisualViewportSnapshot() {
  const viewport = window.visualViewport;
  return Object.freeze({
    offsetLeft: finiteOr(viewport?.offsetLeft, 0),
    offsetTop: finiteOr(viewport?.offsetTop, 0),
    width: finiteOr(viewport?.width, window.innerWidth),
    height: finiteOr(viewport?.height, window.innerHeight),
    scale: finiteOr(viewport?.scale, 1)
  });
}

export function prefersReducedWarpMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function WarpTransitionOverlay({
  request,
  reducedMotion,
  variant = 'standard',
  onArmed,
  onCovered,
  onComplete,
  className
}: WarpTransitionOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const armedRef = useRef(false);
  const onArmedRef = useRef(onArmed);
  const coveredNotifiedRef = useRef(false);
  const completedNotifiedRef = useRef(false);
  const [resolvedOrigin, setResolvedOrigin] =
    useState<ResolvedOverlayOrigin | null>(null);
  const usesReducedMotion = reducedMotion ?? prefersReducedWarpMotion();
  const timing = getWarpTransitionTiming(usesReducedMotion, variant);
  onArmedRef.current = onArmed;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    armedRef.current = false;

    const resolveOrigin = () => {
      const rect = snapshotGatewayRect(root.getBoundingClientRect());
      const point = rect
        ? clientPointToOverlay(request.gatewayClientOrigin, rect)
        : null;
      if (!rect || !point) {
        if (!armedRef.current) setResolvedOrigin(null);
        return;
      }
      const clientWidth = root.clientWidth > 0 ? root.clientWidth : rect.width;
      const clientHeight = root.clientHeight > 0 ? root.clientHeight : rect.height;
      setResolvedOrigin(Object.freeze({
        point,
        rect,
        clientWidth,
        clientHeight,
        visualViewport: currentVisualViewportSnapshot()
      }));
      if (!armedRef.current) {
        armedRef.current = true;
        onArmedRef.current?.();
      }
    };

    resolveOrigin();
    const visualViewport = window.visualViewport;
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(resolveOrigin);
    observer?.observe(root);
    window.addEventListener('resize', resolveOrigin);
    visualViewport?.addEventListener('resize', resolveOrigin);
    visualViewport?.addEventListener('scroll', resolveOrigin);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resolveOrigin);
      visualViewport?.removeEventListener('resize', resolveOrigin);
      visualViewport?.removeEventListener('scroll', resolveOrigin);
    };
  }, [request]);

  const style: WarpOverlayStyle = {
    '--warp-transition-duration': `${timing.totalMs}ms`,
    '--warp-cover-at': `${timing.coverAtMs}ms`
  };
  if (resolvedOrigin) {
    style['--warp-origin-x'] = `${resolvedOrigin.point.u * 100}%`;
    style['--warp-origin-y'] = `${resolvedOrigin.point.v * 100}%`;
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

  const overlay = (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={['warp-transition-overlay', className].filter(Boolean).join(' ')}
      data-direction={request.direction}
      data-input={request.input}
      data-motion={usesReducedMotion ? 'reduced' : 'standard'}
      data-variant={variant}
      data-origin-ready={String(resolvedOrigin !== null)}
      data-transition-sequence={request.sequence}
      data-accepted-at={request.acceptedAt}
      data-gateway-client-x={request.gatewayClientOrigin.x}
      data-gateway-client-y={request.gatewayClientOrigin.y}
      data-overlay-left={resolvedOrigin?.rect.left ?? ''}
      data-overlay-top={resolvedOrigin?.rect.top ?? ''}
      data-overlay-width={resolvedOrigin?.rect.width ?? ''}
      data-overlay-height={resolvedOrigin?.rect.height ?? ''}
      data-overlay-client-width={resolvedOrigin?.clientWidth ?? ''}
      data-overlay-client-height={resolvedOrigin?.clientHeight ?? ''}
      data-overlay-origin-u={resolvedOrigin?.point.u ?? ''}
      data-overlay-origin-v={resolvedOrigin?.point.v ?? ''}
      data-overlay-origin-x={resolvedOrigin
        ? resolvedOrigin.point.u * resolvedOrigin.clientWidth
        : ''}
      data-overlay-origin-y={resolvedOrigin
        ? resolvedOrigin.point.v * resolvedOrigin.clientHeight
        : ''}
      data-visual-viewport-offset-left={
        resolvedOrigin?.visualViewport.offsetLeft ?? ''
      }
      data-visual-viewport-offset-top={
        resolvedOrigin?.visualViewport.offsetTop ?? ''
      }
      data-visual-viewport-width={resolvedOrigin?.visualViewport.width ?? ''}
      data-visual-viewport-height={resolvedOrigin?.visualViewport.height ?? ''}
      data-visual-viewport-scale={resolvedOrigin?.visualViewport.scale ?? ''}
      data-portal-root="body"
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
  return typeof document === 'undefined'
    ? overlay
    : createPortal(overlay, document.body);
}

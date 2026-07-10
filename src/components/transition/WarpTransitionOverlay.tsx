import { type AnimationEvent, type CSSProperties, useRef } from 'react';
import {
  getWarpTransitionTiming,
  type WarpTransitionDirection
} from './experienceTransition';
import './WarpTransitionOverlay.css';

export type WarpTransitionOrigin = Readonly<{
  /** Viewport-space horizontal coordinate reported by the projected gateway. */
  x: number;
  /** Viewport-space vertical coordinate reported by the projected gateway. */
  y: number;
}>;

export type WarpTransitionOverlayProps = {
  direction: WarpTransitionDirection;
  origin?: WarpTransitionOrigin | null;
  /**
   * Pass the experience controller's media-query result when available. When
   * omitted, the current `prefers-reduced-motion` value is sampled at render.
   */
  reducedMotion?: boolean;
  onCovered?: () => void;
  onComplete?: () => void;
  className?: string;
};

type WarpOverlayStyle = CSSProperties & {
  '--warp-origin-x': string;
  '--warp-origin-y': string;
  '--warp-transition-duration': string;
  '--warp-cover-at': string;
};

function hasFiniteOrigin(origin: WarpTransitionOrigin | null | undefined): origin is WarpTransitionOrigin {
  return Boolean(origin && Number.isFinite(origin.x) && Number.isFinite(origin.y));
}

export function prefersReducedWarpMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function WarpTransitionOverlay({
  direction,
  origin,
  reducedMotion,
  onCovered,
  onComplete,
  className
}: WarpTransitionOverlayProps) {
  const coveredNotifiedRef = useRef(false);
  const completedNotifiedRef = useRef(false);
  const usesReducedMotion = reducedMotion ?? prefersReducedWarpMotion();
  const timing = getWarpTransitionTiming(usesReducedMotion);
  const validOrigin = hasFiniteOrigin(origin);
  const style: WarpOverlayStyle = {
    '--warp-origin-x': validOrigin ? `${origin.x}px` : '50%',
    '--warp-origin-y': validOrigin ? `${origin.y}px` : '42%',
    '--warp-transition-duration': `${timing.totalMs}ms`,
    '--warp-cover-at': `${timing.coverAtMs}ms`
  };

  const notifyCovered = () => {
    if (coveredNotifiedRef.current) return;
    coveredNotifiedRef.current = true;
    onCovered?.();
  };

  const notifyComplete = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || completedNotifiedRef.current) return;
    completedNotifiedRef.current = true;
    onComplete?.();
  };

  return (
    <div
      aria-hidden="true"
      className={['warp-transition-overlay', className].filter(Boolean).join(' ')}
      data-direction={direction}
      data-motion={usesReducedMotion ? 'reduced' : 'standard'}
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

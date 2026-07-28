import { useLayoutEffect, useRef } from 'react';
import type { GatewayClientPoint } from './gatewayActivation';
import { calculateGatewayNoticePosition } from './gatewayInteraction';
import { titleSceneSpec } from './titleSceneSpec';

type TitleGatewayHintProps = {
  getGatewayClientCenter: () => GatewayClientPoint | null;
  touch: boolean;
};

export function TitleGatewayHint({
  getGatewayClientCenter,
  touch
}: TitleGatewayHintProps) {
  const hintRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const hint = hintRef.current;
    if (!hint) {
      return undefined;
    }

    let animationFrame = 0;
    let lastAnchorX = Number.NaN;
    let lastAnchorY = Number.NaN;
    let hintWidth = 0;
    let hintHeight = 0;

    const measureHint = () => {
      const bounds = hint.getBoundingClientRect();
      hintWidth = bounds.width;
      hintHeight = bounds.height;
    };

    const positionHint = (force = false) => {
      const gatewayClientCenter = getGatewayClientCenter();
      const visualViewport = window.visualViewport;
      const viewportLeft = visualViewport?.offsetLeft ?? 0;
      const viewportTop = visualViewport?.offsetTop ?? 0;
      const viewportWidth = visualViewport?.width || window.innerWidth;
      const viewportHeight = visualViewport?.height || window.innerHeight;
      const anchorX = (gatewayClientCenter?.x ?? viewportWidth * 0.5) - viewportLeft;
      const anchorY = (gatewayClientCenter?.y ?? viewportHeight * 0.36) - viewportTop;
      if (
        !force
        && Math.abs(anchorX - lastAnchorX) < 2
        && Math.abs(anchorY - lastAnchorY) < 2
      ) {
        return;
      }
      const position = calculateGatewayNoticePosition({
        anchorX,
        anchorY,
        noticeWidth: hintWidth,
        noticeHeight: hintHeight,
        viewportWidth,
        viewportHeight,
        hitRadius: titleSceneSpec.gateway.hitHeightMaxPx * 0.5,
        preferredPlacement: 'above'
      });

      hint.style.left = `${position.left + viewportLeft}px`;
      hint.style.top = `${position.top + viewportTop}px`;
      hint.style.setProperty(
        '--warpkeep-title-hint-arrow-x',
        `${Math.min(Math.max(anchorX - position.left, 14), Math.max(14, hintWidth - 14))}px`
      );
      hint.dataset.placement = position.placement;
      lastAnchorX = anchorX;
      lastAnchorY = anchorY;
    };

    const followProjection = () => {
      positionHint();
      animationFrame = window.requestAnimationFrame(followProjection);
    };
    const handleResize = () => {
      measureHint();
      positionHint(true);
    };

    measureHint();
    positionHint(true);
    animationFrame = window.requestAnimationFrame(followProjection);
    window.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('scroll', handleResize);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
    };
  }, [getGatewayClientCenter]);

  return (
    <div
      ref={hintRef}
      className="warpkeep-title-entry-hint"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {touch
        ? 'Tap the core to enter.'
        : 'Click the core or press Enter.'}
    </div>
  );
}

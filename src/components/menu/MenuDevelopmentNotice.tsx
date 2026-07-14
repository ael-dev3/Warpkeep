import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import type { MenuCommand } from './menuCommands';

export type MenuNoticePlacement = 'above' | 'below';

export type MenuNoticePositionInput = {
  anchorLeft: number;
  anchorTop: number;
  anchorWidth: number;
  anchorHeight: number;
  noticeWidth: number;
  noticeHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  gap?: number;
  margin?: number;
};

export type MenuNoticePosition = {
  left: number;
  top: number;
  placement: MenuNoticePlacement;
};

const DEFAULT_NOTICE_GAP = 12;
const DEFAULT_NOTICE_MARGIN = 16;

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateMenuNoticePosition({
  anchorLeft,
  anchorTop,
  anchorWidth,
  anchorHeight,
  noticeWidth,
  noticeHeight,
  viewportWidth,
  viewportHeight,
  gap = DEFAULT_NOTICE_GAP,
  margin = DEFAULT_NOTICE_MARGIN
}: MenuNoticePositionInput): MenuNoticePosition {
  const safeViewportWidth = Math.max(0, finiteOr(viewportWidth, 0));
  const safeViewportHeight = Math.max(0, finiteOr(viewportHeight, 0));

  if (safeViewportWidth === 0 || safeViewportHeight === 0) {
    return { left: 0, top: 0, placement: 'below' };
  }

  const safeMargin = clamp(
    Math.max(0, finiteOr(margin, DEFAULT_NOTICE_MARGIN)),
    0,
    Math.min(safeViewportWidth, safeViewportHeight) * 0.5
  );
  const safeGap = Math.max(0, finiteOr(gap, DEFAULT_NOTICE_GAP));
  const safeAnchorLeft = clamp(finiteOr(anchorLeft, safeViewportWidth * 0.5), 0, safeViewportWidth);
  const safeAnchorTop = clamp(finiteOr(anchorTop, safeViewportHeight * 0.5), 0, safeViewportHeight);
  const safeAnchorWidth = Math.max(0, finiteOr(anchorWidth, 0));
  const safeAnchorHeight = Math.max(0, finiteOr(anchorHeight, 0));
  const availableWidth = Math.max(0, safeViewportWidth - safeMargin * 2);
  const availableHeight = Math.max(0, safeViewportHeight - safeMargin * 2);
  const safeNoticeWidth = clamp(Math.max(0, finiteOr(noticeWidth, 0)), 0, availableWidth);
  const safeNoticeHeight = clamp(Math.max(0, finiteOr(noticeHeight, 0)), 0, availableHeight);
  const anchorCenterX = safeAnchorLeft + safeAnchorWidth * 0.5;
  const belowTop = safeAnchorTop + safeAnchorHeight + safeGap;
  const aboveTop = safeAnchorTop - safeGap - safeNoticeHeight;
  const roomBelow = safeViewportHeight - safeMargin - belowTop;
  const roomAbove = safeAnchorTop - safeGap - safeMargin;
  const placement: MenuNoticePlacement = roomBelow >= safeNoticeHeight || roomBelow >= roomAbove
    ? 'below'
    : 'above';
  const desiredTop = placement === 'below' ? belowTop : aboveTop;
  const maximumLeft = Math.max(safeMargin, safeViewportWidth - safeMargin - safeNoticeWidth);
  const maximumTop = Math.max(safeMargin, safeViewportHeight - safeMargin - safeNoticeHeight);

  return {
    left: clamp(anchorCenterX - safeNoticeWidth * 0.5, safeMargin, maximumLeft),
    top: clamp(desiredTop, safeMargin, maximumTop),
    placement
  };
}

type MenuDevelopmentNoticeProps = {
  command: MenuCommand;
  anchorElement: HTMLElement;
  /** A runtime-safe override for an unavailable backend entry; never a command label. */
  notice?: string;
  refreshKey: number;
  onDismiss: () => void;
  durationMs?: number;
};

export function MenuDevelopmentNotice({
  command,
  anchorElement,
  notice,
  refreshKey,
  onDismiss,
  durationMs = 5600
}: MenuDevelopmentNoticeProps) {
  const noticeRef = useRef<HTMLDivElement>(null);
  const dismissedRef = useRef(false);
  const [position, setPosition] = useState<MenuNoticePosition>({
    left: 0,
    top: 0,
    placement: 'below'
  });
  const dismissOnce = useCallback(() => {
    if (dismissedRef.current) {
      return;
    }
    dismissedRef.current = true;
    onDismiss();
  }, [onDismiss]);

  useLayoutEffect(() => {
    const notice = noticeRef.current;
    if (!notice) {
      return undefined;
    }

    const updatePosition = () => {
      const anchorBounds = anchorElement.getBoundingClientRect();
      const noticeBounds = notice.getBoundingClientRect();
      const visualViewport = window.visualViewport;
      const viewportLeft = visualViewport?.offsetLeft ?? 0;
      const viewportTop = visualViewport?.offsetTop ?? 0;
      const nextPosition = calculateMenuNoticePosition({
        anchorLeft: anchorBounds.left - viewportLeft,
        anchorTop: anchorBounds.top - viewportTop,
        anchorWidth: anchorBounds.width,
        anchorHeight: anchorBounds.height,
        noticeWidth: noticeBounds.width || notice.offsetWidth,
        noticeHeight: noticeBounds.height || notice.offsetHeight,
        viewportWidth: visualViewport?.width ?? window.innerWidth,
        viewportHeight: visualViewport?.height ?? window.innerHeight
      });
      nextPosition.left += viewportLeft;
      nextPosition.top += viewportTop;

      setPosition((currentPosition) => (
        currentPosition.left === nextPosition.left
        && currentPosition.top === nextPosition.top
        && currentPosition.placement === nextPosition.placement
          ? currentPosition
          : nextPosition
      ));
    };

    updatePosition();
    const animationFrame = window.requestAnimationFrame(updatePosition);
    const visualViewport = window.visualViewport;
    window.addEventListener('resize', updatePosition);
    visualViewport?.addEventListener('resize', updatePosition);
    visualViewport?.addEventListener('scroll', updatePosition);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', updatePosition);
      visualViewport?.removeEventListener('resize', updatePosition);
      visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [anchorElement, refreshKey]);

  useLayoutEffect(() => {
    const dismissTimer = window.setTimeout(dismissOnce, Math.max(0, durationMs));

    const handleOutsidePointer = (event: PointerEvent) => {
      const eventTarget = event.target;
      if (!(eventTarget instanceof Node)) {
        return;
      }

      if (noticeRef.current?.contains(eventTarget) || anchorElement.contains(eventTarget)) {
        return;
      }

      dismissOnce();
    };

    document.addEventListener('pointerdown', handleOutsidePointer, true);

    return () => {
      window.clearTimeout(dismissTimer);
      document.removeEventListener('pointerdown', handleOutsidePointer, true);
    };
  }, [anchorElement, dismissOnce, durationMs, refreshKey]);

  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className="warpkeep-menu-notice"
      data-placement={position.placement}
      id={`warpkeep-menu-notice-${command.id}`}
      ref={noticeRef}
      role="status"
      style={{ left: position.left, top: position.top }}
    >
      <span aria-hidden="true" className="warpkeep-menu-notice__crest" />
      <span className="warpkeep-menu-notice__eyebrow">HEGEMONY DECREE</span>
      <span className="warpkeep-menu-notice__copy">{notice ?? command.notice}</span>
    </div>
  );
}

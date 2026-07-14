import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type PointerEventHandler
} from 'react';

import { getLatestPatchNotes } from './latestPatchNotes';
import './LatestPatchNotesPopover.css';

export type PatchNotesPlacement = 'left' | 'right' | 'above' | 'below';

export type PatchNotesPositionInput = Readonly<{
  anchorLeft: number;
  anchorTop: number;
  anchorWidth: number;
  anchorHeight: number;
  panelWidth: number;
  panelHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  gap?: number;
  margin?: number;
}>;

export type PatchNotesPosition = Readonly<{
  arrowOffset: number;
  left: number;
  top: number;
  placement: PatchNotesPlacement;
}>;

const DEFAULT_GAP = 14;
const DEFAULT_MARGIN = 16;
const PLACEMENT_ORDER: ReadonlyArray<PatchNotesPlacement> = [
  'above',
  'right',
  'left',
  'below'
];

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculatePatchNotesPosition({
  anchorLeft,
  anchorTop,
  anchorWidth,
  anchorHeight,
  panelWidth,
  panelHeight,
  viewportWidth,
  viewportHeight,
  gap = DEFAULT_GAP,
  margin = DEFAULT_MARGIN
}: PatchNotesPositionInput): PatchNotesPosition {
  const safeViewportWidth = Math.max(0, finiteOr(viewportWidth, 0));
  const safeViewportHeight = Math.max(0, finiteOr(viewportHeight, 0));

  if (safeViewportWidth === 0 || safeViewportHeight === 0) {
    return { arrowOffset: 0, left: 0, top: 0, placement: 'below' };
  }

  const safeMargin = clamp(
    Math.max(0, finiteOr(margin, DEFAULT_MARGIN)),
    0,
    Math.min(safeViewportWidth, safeViewportHeight) * 0.5
  );
  const safeGap = Math.max(0, finiteOr(gap, DEFAULT_GAP));
  const safeAnchorLeft = clamp(finiteOr(anchorLeft, safeViewportWidth * 0.5), 0, safeViewportWidth);
  const safeAnchorTop = clamp(finiteOr(anchorTop, safeViewportHeight * 0.5), 0, safeViewportHeight);
  const safeAnchorWidth = Math.max(0, finiteOr(anchorWidth, 0));
  const safeAnchorHeight = Math.max(0, finiteOr(anchorHeight, 0));
  const availableWidth = Math.max(0, safeViewportWidth - safeMargin * 2);
  const availableHeight = Math.max(0, safeViewportHeight - safeMargin * 2);
  const safePanelWidth = clamp(Math.max(0, finiteOr(panelWidth, 0)), 0, availableWidth);
  const safePanelHeight = clamp(Math.max(0, finiteOr(panelHeight, 0)), 0, availableHeight);
  const anchorRight = safeAnchorLeft + safeAnchorWidth;
  const anchorBottom = safeAnchorTop + safeAnchorHeight;
  const anchorCenterX = safeAnchorLeft + safeAnchorWidth * 0.5;
  const anchorCenterY = safeAnchorTop + safeAnchorHeight * 0.5;
  const room = {
    left: safeAnchorLeft - safeMargin - safeGap,
    right: safeViewportWidth - safeMargin - anchorRight - safeGap,
    above: safeAnchorTop - safeMargin - safeGap,
    below: safeViewportHeight - safeMargin - anchorBottom - safeGap
  };

  const requiredRoom: Record<PatchNotesPlacement, number> = {
    above: safePanelHeight,
    below: safePanelHeight,
    left: safePanelWidth,
    right: safePanelWidth
  };
  const placement = PLACEMENT_ORDER.find((candidate) => (
    room[candidate] >= requiredRoom[candidate]
  )) ?? PLACEMENT_ORDER.reduce((best, candidate) => (
    room[candidate] > room[best] ? candidate : best
  ));

  let desiredLeft = anchorCenterX - safePanelWidth * 0.5;
  let desiredTop = anchorCenterY - safePanelHeight * 0.5;
  if (placement === 'left') {
    desiredLeft = safeAnchorLeft - safeGap - safePanelWidth;
  } else if (placement === 'right') {
    desiredLeft = anchorRight + safeGap;
  } else if (placement === 'above') {
    desiredTop = safeAnchorTop - safeGap - safePanelHeight;
  } else {
    desiredTop = anchorBottom + safeGap;
  }

  const left = clamp(
    desiredLeft,
    safeMargin,
    Math.max(safeMargin, safeViewportWidth - safeMargin - safePanelWidth)
  );
  const top = clamp(
    desiredTop,
    safeMargin,
    Math.max(safeMargin, safeViewportHeight - safeMargin - safePanelHeight)
  );
  const verticalArrow = placement === 'left' || placement === 'right';
  const arrowAxisSize = verticalArrow ? safePanelHeight : safePanelWidth;
  const arrowInset = Math.min(20, arrowAxisSize * 0.5);
  const rawArrowOffset = verticalArrow
    ? anchorCenterY - top
    : anchorCenterX - left;

  return {
    arrowOffset: clamp(
      rawArrowOffset,
      arrowInset,
      Math.max(arrowInset, arrowAxisSize - arrowInset)
    ),
    left,
    top,
    placement
  };
}

export type LatestPatchNotesPopoverProps = Readonly<{
  anchorElement: HTMLElement;
  productVersion: string;
  onPointerEnter?: PointerEventHandler<HTMLElement>;
  onPointerLeave?: PointerEventHandler<HTMLElement>;
}>;

export const LatestPatchNotesPopover = forwardRef<HTMLElement, LatestPatchNotesPopoverProps>(
  function LatestPatchNotesPopover({
    anchorElement,
    productVersion,
    onPointerEnter,
    onPointerLeave
  }, forwardedRef) {
    const patchNotes = getLatestPatchNotes(productVersion);
    const [panelElement, setPanelElement] = useState<HTMLElement | null>(null);
    const [position, setPosition] = useState<PatchNotesPosition>({
      arrowOffset: 0,
      left: 0,
      top: 0,
      placement: 'left'
    });

    useLayoutEffect(() => {
      if (!panelElement) {
        return undefined;
      }

      const updatePosition = () => {
        const anchorBounds = anchorElement.getBoundingClientRect();
        const panelBounds = panelElement.getBoundingClientRect();
        const visualViewport = window.visualViewport;
        const viewportLeft = visualViewport?.offsetLeft ?? 0;
        const viewportTop = visualViewport?.offsetTop ?? 0;
        const nextPosition = calculatePatchNotesPosition({
          anchorLeft: anchorBounds.left - viewportLeft,
          anchorTop: anchorBounds.top - viewportTop,
          anchorWidth: anchorBounds.width,
          anchorHeight: anchorBounds.height,
          panelWidth: panelBounds.width || panelElement.offsetWidth,
          panelHeight: panelBounds.height || panelElement.offsetHeight,
          viewportWidth: visualViewport?.width ?? window.innerWidth,
          viewportHeight: visualViewport?.height ?? window.innerHeight
        });
        const viewportPosition = {
          ...nextPosition,
          left: nextPosition.left + viewportLeft,
          top: nextPosition.top + viewportTop
        };

        setPosition((current) => (
          current.left === viewportPosition.left
          && current.top === viewportPosition.top
          && current.arrowOffset === viewportPosition.arrowOffset
          && current.placement === viewportPosition.placement
            ? current
            : viewportPosition
        ));
      };

      updatePosition();
      const animationFrame = window.requestAnimationFrame(updatePosition);
      const visualViewport = window.visualViewport;
      const resizeObserver = typeof ResizeObserver === 'function'
        ? new ResizeObserver(updatePosition)
        : undefined;
      resizeObserver?.observe(panelElement);
      resizeObserver?.observe(anchorElement);
      window.addEventListener('resize', updatePosition);
      visualViewport?.addEventListener('resize', updatePosition);
      visualViewport?.addEventListener('scroll', updatePosition);

      return () => {
        window.cancelAnimationFrame(animationFrame);
        resizeObserver?.disconnect();
        window.removeEventListener('resize', updatePosition);
        visualViewport?.removeEventListener('resize', updatePosition);
        visualViewport?.removeEventListener('scroll', updatePosition);
      };
    }, [anchorElement, panelElement]);

    const setRefs = useCallback((element: HTMLElement | null) => {
      setPanelElement(element);
      if (typeof forwardedRef === 'function') {
        forwardedRef(element);
      } else if (forwardedRef) {
        forwardedRef.current = element;
      }
    }, [forwardedRef]);

    const panelStyle = {
      '--warpkeep-patch-notes-arrow-offset': `${position.arrowOffset}px`,
      left: position.left,
      top: position.top
    } as CSSProperties;

    return (
      <section
        aria-labelledby="warpkeep-latest-patch-notes-title"
        className="warpkeep-patch-notes"
        data-placement={position.placement}
        id="warpkeep-latest-patch-notes"
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        ref={setRefs}
        role="region"
        style={panelStyle}
        tabIndex={0}
      >
        <div aria-hidden="true" className="warpkeep-patch-notes__rail" />
        <header className="warpkeep-patch-notes__header">
          <p className="warpkeep-patch-notes__eyebrow">
            LATEST PATCH · ALPHA {productVersion}
          </p>
          {patchNotes ? (
            <p className="warpkeep-patch-notes__date">{patchNotes.releasedOn}</p>
          ) : null}
          <h2 id="warpkeep-latest-patch-notes-title">
            {patchNotes?.title ?? 'NOTES UNAVAILABLE'}
          </h2>
          <p className="warpkeep-patch-notes__summary">
            {patchNotes?.summary ?? 'This build does not contain a matching, verified patch chronicle.'}
          </p>
        </header>
        {patchNotes ? (
          <>
            <ul className="warpkeep-patch-notes__highlights">
              {patchNotes.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
            <p className="warpkeep-patch-notes__alpha-notice">
              {patchNotes.alphaNotice}
            </p>
          </>
        ) : null}
      </section>
    );
  }
);

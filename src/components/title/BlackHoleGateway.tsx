import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import { calculateGatewayNoticePosition } from './gatewayInteraction';

const defaultNotice = 'The Warpkeep gateway is still under development. Return soon.';
const defaultAutoDismissMs = 5_500;
const noticeRelayoutThreshold = 8;

type GatewayProjection = {
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
  visible: boolean;
};

type GatewayNoticeState = {
  open: boolean;
  version: number;
};

export type BlackHoleGatewayHandle = {
  setProjectedPosition: (
    x: number,
    y: number,
    viewportWidth: number,
    viewportHeight: number,
    visible?: boolean
  ) => void;
};

export type BlackHoleGatewayProps = {
  onActivate?: () => void;
  onFocusChange?: (focused: boolean) => void;
  autoDismissMs?: number | null;
  accessibleLabel?: string;
  notice?: string;
  className?: string;
};

function joinClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(' ');
}

export const BlackHoleGateway = forwardRef<BlackHoleGatewayHandle, BlackHoleGatewayProps>(
  function BlackHoleGateway(
    {
      onActivate,
      onFocusChange,
      autoDismissMs = defaultAutoDismissMs,
      accessibleLabel = 'Enter Warpkeep',
      notice = defaultNotice,
      className
    },
    forwardedRef
  ) {
    const gatewayRef = useRef<HTMLDivElement>(null);
    const anchorRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const noticeRef = useRef<HTMLDivElement>(null);
    const projectionRef = useRef<GatewayProjection>({
      x: 0,
      y: 0,
      viewportWidth: 0,
      viewportHeight: 0,
      visible: false
    });
    const noticeSizeRef = useRef({ width: 0, height: 0 });
    const noticeLayoutAnchorRef = useRef({ x: Number.NaN, y: Number.NaN });
    const noticeOpenRef = useRef(false);
    const [noticeState, setNoticeState] = useState<GatewayNoticeState>({
      open: false,
      version: 0
    });
    const reactId = useId();
    const noticeId = `warpkeep-gateway-notice-${reactId.replace(/:/g, '')}`;

    const positionNotice = useCallback((measure: boolean) => {
      const noticeElement = noticeRef.current;
      if (!noticeElement || !noticeOpenRef.current) {
        return;
      }

      if (measure) {
        const bounds = noticeElement.getBoundingClientRect();
        noticeSizeRef.current.width = Math.max(0, bounds.width);
        noticeSizeRef.current.height = Math.max(0, bounds.height);
      }

      const projection = projectionRef.current;
      const position = calculateGatewayNoticePosition({
        anchorX: projection.x,
        anchorY: projection.y,
        noticeWidth: noticeSizeRef.current.width,
        noticeHeight: noticeSizeRef.current.height,
        viewportWidth: projection.viewportWidth,
        viewportHeight: projection.viewportHeight,
        preferredPlacement: projection.viewportHeight < 460 &&
          projection.viewportWidth > projection.viewportHeight
          ? 'above'
          : 'below'
      });

      noticeElement.style.left = `${position.left - projection.x}px`;
      noticeElement.style.top = `${position.top - projection.y}px`;
      const arrowX = Math.min(
        Math.max(projection.x - position.left, 14),
        Math.max(14, noticeSizeRef.current.width - 14)
      );
      noticeElement.style.setProperty('--warpkeep-gateway-notice-arrow-x', `${arrowX}px`);
      noticeElement.dataset.placement = position.placement;
      noticeLayoutAnchorRef.current.x = projection.x;
      noticeLayoutAnchorRef.current.y = projection.y;
    }, []);

    const setProjectedPosition = useCallback((
      x: number,
      y: number,
      viewportWidth: number,
      viewportHeight: number,
      visible = true
    ) => {
      const validProjection =
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        Number.isFinite(viewportWidth) &&
        Number.isFinite(viewportHeight) &&
        viewportWidth > 0 &&
        viewportHeight > 0;
      const projectionVisible = Boolean(
        validProjection &&
        visible &&
        x >= 0 &&
        x <= viewportWidth &&
        y >= 0 &&
        y <= viewportHeight
      );
      const projection = projectionRef.current;
      const viewportChanged =
        projection.viewportWidth !== viewportWidth ||
        projection.viewportHeight !== viewportHeight;
      projection.x = validProjection ? x : 0;
      projection.y = validProjection ? y : 0;
      projection.viewportWidth = validProjection ? viewportWidth : 0;
      projection.viewportHeight = validProjection ? viewportHeight : 0;
      projection.visible = projectionVisible;

      const gatewayElement = gatewayRef.current;
      const anchorElement = anchorRef.current;
      const buttonElement = buttonRef.current;
      if (!anchorElement || !buttonElement) {
        return;
      }

      const visibilityValue = projectionVisible ? 'true' : 'false';
      if (anchorElement.hidden === projectionVisible) {
        anchorElement.hidden = !projectionVisible;
      }
      if (buttonElement.disabled !== !projectionVisible) {
        buttonElement.disabled = !projectionVisible;
      }
      if (anchorElement.dataset.visible !== visibilityValue) {
        anchorElement.dataset.visible = visibilityValue;
      }
      if (gatewayElement && gatewayElement.dataset.visible !== visibilityValue) {
        gatewayElement.dataset.visible = visibilityValue;
      }

      if (!projectionVisible) {
        return;
      }

      anchorElement.style.transform = `translate3d(${x}px, ${y}px, 0)`;

      const noticeAnchor = noticeLayoutAnchorRef.current;
      if (
        noticeOpenRef.current &&
        (
          viewportChanged ||
          Math.abs(x - noticeAnchor.x) >= noticeRelayoutThreshold ||
          Math.abs(y - noticeAnchor.y) >= noticeRelayoutThreshold
        )
      ) {
        positionNotice(false);
      }
    }, [positionNotice]);

    useImperativeHandle(forwardedRef, () => ({ setProjectedPosition }), [setProjectedPosition]);

    useLayoutEffect(() => {
      setProjectedPosition(0, 0, 0, 0, false);
    }, [setProjectedPosition]);

    const dismissNotice = useCallback(() => {
      if (!noticeOpenRef.current) {
        return;
      }

      noticeOpenRef.current = false;
      setNoticeState((current) => current.open ? { ...current, open: false } : current);
    }, []);

    const activateGateway = useCallback(() => {
      noticeOpenRef.current = true;
      setNoticeState((current) => ({ open: true, version: current.version + 1 }));
      onActivate?.();
    }, [onActivate]);

    const handleButtonKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' && !event.repeat) {
        event.preventDefault();
        activateGateway();
      } else if (event.key === ' ') {
        event.preventDefault();
      }
    }, [activateGateway]);

    const handleButtonKeyUp = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === ' ') {
        event.preventDefault();
        activateGateway();
      }
    }, [activateGateway]);

    useEffect(() => {
      if (!noticeState.open) {
        return undefined;
      }

      const handlePointerDown = (event: PointerEvent) => {
        const anchorElement = anchorRef.current;
        if (!anchorElement) {
          return;
        }

        const eventPath = event.composedPath();
        const targetInsideGateway = eventPath.includes(anchorElement) ||
          (event.target instanceof Node && anchorElement.contains(event.target));
        if (!targetInsideGateway) {
          dismissNotice();
        }
      };
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          dismissNotice();
        }
      };

      document.addEventListener('pointerdown', handlePointerDown, true);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('pointerdown', handlePointerDown, true);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [dismissNotice, noticeState.open]);

    useEffect(() => {
      if (!noticeState.open || autoDismissMs === null) {
        return undefined;
      }

      const safeDelay = Number.isFinite(autoDismissMs) && autoDismissMs > 0
        ? autoDismissMs
        : defaultAutoDismissMs;
      const timeout = window.setTimeout(dismissNotice, safeDelay);
      return () => window.clearTimeout(timeout);
    }, [autoDismissMs, dismissNotice, noticeState.open, noticeState.version]);

    useLayoutEffect(() => {
      if (!noticeState.open) {
        return undefined;
      }

      positionNotice(true);
      const noticeElement = noticeRef.current;
      if (!noticeElement || typeof ResizeObserver === 'undefined') {
        return undefined;
      }

      const observer = new ResizeObserver(() => positionNotice(true));
      observer.observe(noticeElement);
      return () => observer.disconnect();
    }, [noticeState.open, noticeState.version, positionNotice]);

    return (
      <div
        ref={gatewayRef}
        className={joinClassNames('warpkeep-gateway', className)}
        data-notice-open={String(noticeState.open)}
      >
        <div ref={anchorRef} className="warpkeep-gateway-anchor">
          <button
            ref={buttonRef}
            type="button"
            className="warpkeep-gateway-button"
            aria-label={accessibleLabel}
            aria-controls={noticeState.open ? noticeId : undefined}
            aria-describedby={noticeState.open ? noticeId : undefined}
            aria-expanded={noticeState.open}
            onClick={activateGateway}
            onKeyDown={handleButtonKeyDown}
            onKeyUp={handleButtonKeyUp}
            onFocus={() => onFocusChange?.(true)}
            onBlur={() => onFocusChange?.(false)}
          />
          {noticeState.open ? (
            <div
              key={noticeState.version}
              ref={noticeRef}
              id={noticeId}
              className="warpkeep-gateway-notice"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {notice}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
);

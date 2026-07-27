import {
  type CSSProperties,
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
import { titleSceneSpec } from './titleSceneSpec';

const defaultAutoDismissMs = 5_500;
const noticeRelayoutThreshold = 8;
const gatewayHitAreaStyle = {
  '--warpkeep-gateway-hit-width-min': `${titleSceneSpec.gateway.hitWidthMinPx}px`,
  '--warpkeep-gateway-hit-width-fluid': `${titleSceneSpec.gateway.hitWidthViewportRatio * 100}vw`,
  '--warpkeep-gateway-hit-width-max': `${titleSceneSpec.gateway.hitWidthMaxPx}px`,
  '--warpkeep-gateway-hit-height-min': `${titleSceneSpec.gateway.hitHeightMinPx}px`,
  '--warpkeep-gateway-hit-height-fluid': `${titleSceneSpec.gateway.hitHeightViewportRatio * 100}vw`,
  '--warpkeep-gateway-hit-height-max': `${titleSceneSpec.gateway.hitHeightMaxPx}px`
} as CSSProperties;

export type GatewayProjection = {
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
  getProjectedPosition: () => GatewayProjection;
  focus: () => void;
};

export type BlackHoleGatewayProps = {
  onActivate?: (input: 'keyboard' | 'pointer') => void;
  onFocusChange?: (focused: boolean) => void;
  onMeaningfulInteraction?: () => void;
  autoDismissMs?: number | null;
  accessibleLabel?: string;
  notice?: string | null;
  className?: string;
  disabled?: boolean;
};

function joinClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(' ');
}

export const BlackHoleGateway = forwardRef<BlackHoleGatewayHandle, BlackHoleGatewayProps>(
  function BlackHoleGateway(
    {
      onActivate,
      onFocusChange,
      onMeaningfulInteraction,
      autoDismissMs = defaultAutoDismissMs,
      accessibleLabel = 'Enter Warpkeep',
      notice = null,
      className,
      disabled = false
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
    const disabledRef = useRef(disabled);
    const activationInFlightRef = useRef(false);
    const activationLockedRef = useRef(false);
    const [activationLocked, setActivationLocked] = useState(false);
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
        hitRadius: titleSceneSpec.gateway.hitHeightMaxPx * 0.5,
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
      if (!activationLockedRef.current) {
        projection.x = validProjection ? x : 0;
        projection.y = validProjection ? y : 0;
        projection.viewportWidth = validProjection ? viewportWidth : 0;
        projection.viewportHeight = validProjection ? viewportHeight : 0;
        projection.visible = projectionVisible;
      } else {
        projection.visible = false;
      }
      const interactiveVisible = projection.visible
        && !disabledRef.current
        && !activationLockedRef.current;

      const gatewayElement = gatewayRef.current;
      const anchorElement = anchorRef.current;
      const buttonElement = buttonRef.current;
      if (!anchorElement || !buttonElement) {
        return;
      }

      const visibilityValue = interactiveVisible ? 'true' : 'false';
      if (anchorElement.hidden === interactiveVisible) {
        anchorElement.hidden = !interactiveVisible;
      }
      anchorElement.inert = !interactiveVisible;
      anchorElement.setAttribute('aria-hidden', String(!interactiveVisible));
      const buttonDisabled = !interactiveVisible;
      if (buttonElement.disabled !== buttonDisabled) {
        buttonElement.disabled = buttonDisabled;
      }
      buttonElement.tabIndex = interactiveVisible ? 0 : -1;
      if (anchorElement.dataset.visible !== visibilityValue) {
        anchorElement.dataset.visible = visibilityValue;
      }
      if (gatewayElement && gatewayElement.dataset.visible !== visibilityValue) {
        gatewayElement.dataset.visible = visibilityValue;
      }
      if (gatewayElement && gatewayElement.dataset.interactive !== visibilityValue) {
        gatewayElement.dataset.interactive = visibilityValue;
      }

      if (!interactiveVisible) {
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

    const getProjectedPosition = useCallback(() => ({ ...projectionRef.current }), []);
    const focus = useCallback(() => {
      if (
        disabledRef.current
        || activationLockedRef.current
        || !projectionRef.current.visible
      ) return;
      buttonRef.current?.focus();
    }, []);

    useImperativeHandle(
      forwardedRef,
      () => ({ setProjectedPosition, getProjectedPosition, focus }),
      [focus, getProjectedPosition, setProjectedPosition]
    );

    useLayoutEffect(() => {
      const wasDisabled = disabledRef.current;
      disabledRef.current = disabled;
      if (wasDisabled && !disabled) {
        activationLockedRef.current = false;
        activationInFlightRef.current = false;
        setActivationLocked(false);
      }
      const gateway = gatewayRef.current;
      const anchor = anchorRef.current;
      const button = buttonRef.current;
      const blocked = disabled || activationLockedRef.current;
      const visible = projectionRef.current.visible && !blocked;
      if (gateway) {
        gateway.dataset.visible = String(visible);
        gateway.dataset.interactive = String(visible);
      }
      if (anchor) {
        anchor.hidden = !visible;
        anchor.inert = !visible;
        anchor.dataset.visible = String(visible);
        anchor.setAttribute('aria-hidden', String(!visible));
        if (visible) {
          anchor.style.transform = `translate3d(${projectionRef.current.x}px, ${projectionRef.current.y}px, 0)`;
        }
      }
      if (button) {
        button.disabled = !visible;
        button.tabIndex = visible ? 0 : -1;
        if (!visible && document.activeElement === button) button.blur();
      }
    }, [disabled]);

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

    const activateGateway = useCallback((input: 'keyboard' | 'pointer') => {
      if (
        disabledRef.current
        || activationLockedRef.current
        || activationInFlightRef.current
        || !projectionRef.current.visible
      ) {
        return;
      }
      activationInFlightRef.current = true;
      if (notice) {
        noticeOpenRef.current = true;
        setNoticeState((current) => ({ open: true, version: current.version + 1 }));
      }
      onMeaningfulInteraction?.();
      try {
        onActivate?.(input);
      } finally {
        activationInFlightRef.current = false;
        if (onActivate) {
          activationLockedRef.current = true;
          projectionRef.current.visible = false;
          setActivationLocked(true);
          const gateway = gatewayRef.current;
          const anchor = anchorRef.current;
          const button = buttonRef.current;
          if (gateway) {
            gateway.dataset.visible = 'false';
            gateway.dataset.interactive = 'false';
          }
          if (anchor) {
            anchor.hidden = true;
            anchor.inert = true;
            anchor.dataset.visible = 'false';
            anchor.setAttribute('aria-hidden', 'true');
          }
          if (button) {
            button.disabled = true;
            button.tabIndex = -1;
            button.blur();
          }
        }
      }
    }, [notice, onActivate, onMeaningfulInteraction]);

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
        data-interactive={String(!disabled && !activationLocked)}
        data-notice-open={String(noticeState.open)}
        data-visible="false"
        style={gatewayHitAreaStyle}
      >
        <div
          ref={anchorRef}
          aria-hidden="true"
          className="warpkeep-gateway-anchor"
          data-visible="false"
          hidden
          inert
        >
          <button
            ref={buttonRef}
            type="button"
            className="warpkeep-gateway-button"
            aria-label={accessibleLabel}
            aria-controls={noticeState.open ? noticeId : undefined}
            aria-describedby={noticeState.open ? noticeId : undefined}
            aria-expanded={notice ? noticeState.open : undefined}
            disabled={disabled || activationLocked}
            tabIndex={disabled || activationLocked ? -1 : 0}
            onClick={(event) => activateGateway(event.detail === 0 ? 'keyboard' : 'pointer')}
            onFocus={() => {
              onFocusChange?.(true);
            }}
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

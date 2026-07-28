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
import {
  createGatewayClientPoint,
  createGatewayActivationRecord,
  createGatewayRendererPoint,
  gatewayClientDistance,
  gatewayClientPointInsideRect,
  gatewayRectCenter,
  rendererPointToClient,
  snapshotGatewayRect,
  type GatewayActivationInput,
  type GatewayActivationRecord,
  type GatewayClientPoint,
  type GatewayRenderedMeasurement,
  type GatewayRendererPoint,
  type GatewaySurfaceRect
} from './gatewayActivation';
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

export type {
  GatewayActivationInput,
  GatewayActivationRecord,
  GatewayClientPoint,
  GatewayRenderedMeasurement,
  GatewayRendererPoint,
  GatewaySurfaceRect
} from './gatewayActivation';

type GatewayNoticeState = {
  open: boolean;
  version: number;
};

export type BlackHoleGatewayHandle = {
  setRenderedGateway: (
    rendererPoint: GatewayRendererPoint,
    sourceSurfaceRect: GatewaySurfaceRect | null
  ) => boolean;
  getRenderedMeasurement: () => GatewayRenderedMeasurement;
  getGatewayClientCenter: () => GatewayClientPoint | null;
  captureActivation: (
    input: GatewayActivationInput,
    clientPoint?: GatewayClientPoint | null
  ) => GatewayActivationRecord;
  focus: () => void;
};

export type BlackHoleGatewayProps = {
  onActivate?: (activation: GatewayActivationRecord) => void;
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

const emptyRendererPoint = () => createGatewayRendererPoint({
  x: 0,
  y: 0,
  viewportWidth: 0,
  viewportHeight: 0,
  visible: false
});

const emptyRenderedMeasurement = (): GatewayRenderedMeasurement => Object.freeze({
  generation: 0,
  rendererPoint: emptyRendererPoint(),
  sourceSurfaceRect: null,
  gatewayClientCenter: null,
  buttonClientCenter: null,
  alignmentErrorPx: null,
  ready: false
});

function gatewayAlignmentTolerance(surfaceRect: GatewaySurfaceRect) {
  return surfaceRect.width <= 768 || surfaceRect.height <= 520 ? 3 : 2;
}

function clientPointToLayerLocal(
  point: GatewayClientPoint,
  layerRect: GatewaySurfaceRect,
  layer: HTMLElement
) {
  const localWidth = layer.clientWidth > 0 ? layer.clientWidth : layerRect.width;
  const localHeight = layer.clientHeight > 0 ? layer.clientHeight : layerRect.height;
  return {
    x: (point.x - layerRect.left) / layerRect.width * localWidth,
    y: (point.y - layerRect.top) / layerRect.height * localHeight,
    clientToLocalX: localWidth / layerRect.width,
    clientToLocalY: localHeight / layerRect.height
  };
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
    const measurementRef = useRef<GatewayRenderedMeasurement>(
      emptyRenderedMeasurement()
    );
    const noticeSizeRef = useRef({ width: 0, height: 0 });
    const noticeLayoutAnchorRef = useRef({ x: Number.NaN, y: Number.NaN });
    const noticeOpenRef = useRef(false);
    const disabledRef = useRef(disabled);
    const activationInFlightRef = useRef(false);
    const activationLockedRef = useRef(false);
    const pointerActivationPointRef = useRef<GatewayClientPoint | null>(null);
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

      const measurement = measurementRef.current;
      const gatewayCenter = measurement.gatewayClientCenter;
      const gatewayLayer = gatewayRef.current;
      const layerRect = snapshotGatewayRect(gatewayLayer?.getBoundingClientRect());
      if (!gatewayCenter || !gatewayLayer || !layerRect) {
        return;
      }
      const layerPoint = clientPointToLayerLocal(gatewayCenter, layerRect, gatewayLayer);
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const position = calculateGatewayNoticePosition({
        anchorX: gatewayCenter.x,
        anchorY: gatewayCenter.y,
        noticeWidth: noticeSizeRef.current.width,
        noticeHeight: noticeSizeRef.current.height,
        viewportWidth,
        viewportHeight,
        hitRadius: titleSceneSpec.gateway.hitHeightMaxPx * 0.5,
        preferredPlacement: viewportHeight < 460 &&
          viewportWidth > viewportHeight
          ? 'above'
          : 'below'
      });

      noticeElement.style.left =
        `${(position.left - gatewayCenter.x) * layerPoint.clientToLocalX}px`;
      noticeElement.style.top =
        `${(position.top - gatewayCenter.y) * layerPoint.clientToLocalY}px`;
      const arrowX = Math.min(
        Math.max(gatewayCenter.x - position.left, 14),
        Math.max(14, noticeSizeRef.current.width - 14)
      );
      noticeElement.style.setProperty(
        '--warpkeep-gateway-notice-arrow-x',
        `${arrowX * layerPoint.clientToLocalX}px`
      );
      noticeElement.dataset.placement = position.placement;
      noticeLayoutAnchorRef.current.x = gatewayCenter.x;
      noticeLayoutAnchorRef.current.y = gatewayCenter.y;
    }, []);

    const setRenderedGateway = useCallback((
      rendererPoint: GatewayRendererPoint,
      sourceSurfaceRect: GatewaySurfaceRect | null
    ) => {
      const normalizedRendererPoint = createGatewayRendererPoint(rendererPoint);
      const normalizedSourceRect = snapshotGatewayRect(sourceSurfaceRect);
      const gatewayClientCenter = rendererPointToClient(
        normalizedRendererPoint,
        normalizedSourceRect
      );
      const previousMeasurement = measurementRef.current;
      const viewportChanged =
        previousMeasurement.rendererPoint.viewportWidth
          !== normalizedRendererPoint.viewportWidth
        || previousMeasurement.rendererPoint.viewportHeight
          !== normalizedRendererPoint.viewportHeight
        || previousMeasurement.sourceSurfaceRect?.left !== normalizedSourceRect?.left
        || previousMeasurement.sourceSurfaceRect?.top !== normalizedSourceRect?.top
        || previousMeasurement.sourceSurfaceRect?.width !== normalizedSourceRect?.width
        || previousMeasurement.sourceSurfaceRect?.height !== normalizedSourceRect?.height;
      const gatewayElement = gatewayRef.current;
      const anchorElement = anchorRef.current;
      const buttonElement = buttonRef.current;
      const layerRect = snapshotGatewayRect(gatewayElement?.getBoundingClientRect());

      let buttonRect: GatewaySurfaceRect | null = null;
      let buttonClientCenter: GatewayClientPoint | null = null;
      let alignmentErrorPx: number | null = null;
      let measurementReady = Boolean(
        normalizedRendererPoint.visible
        && gatewayClientCenter
        && normalizedSourceRect
      );

      if (
        gatewayElement
        && anchorElement
        && buttonElement
        && gatewayClientCenter
        && normalizedSourceRect
        && layerRect
        && !activationLockedRef.current
      ) {
        const layerPoint = clientPointToLayerLocal(
          gatewayClientCenter,
          layerRect,
          gatewayElement
        );
        anchorElement.style.transform =
          `translate3d(${layerPoint.x}px, ${layerPoint.y}px, 0)`;

        if (!disabledRef.current) {
          gatewayElement.dataset.visible = 'true';
          gatewayElement.dataset.interactive = 'true';
          anchorElement.hidden = false;
          anchorElement.dataset.visible = 'true';
          anchorElement.setAttribute('aria-hidden', 'false');
          buttonElement.disabled = false;
          buttonRect = snapshotGatewayRect(buttonElement.getBoundingClientRect());
          buttonClientCenter = gatewayRectCenter(buttonRect);
          alignmentErrorPx = gatewayClientDistance(
            gatewayClientCenter,
            buttonClientCenter
          );
          measurementReady = measurementReady
            && alignmentErrorPx !== null
            && alignmentErrorPx <= gatewayAlignmentTolerance(normalizedSourceRect);
        }
      } else {
        measurementReady = false;
      }

      const nextMeasurement = Object.freeze({
        generation: previousMeasurement.generation + 1,
        rendererPoint: normalizedRendererPoint,
        sourceSurfaceRect: normalizedSourceRect,
        gatewayClientCenter,
        buttonClientCenter,
        alignmentErrorPx,
        ready: measurementReady
      }) satisfies GatewayRenderedMeasurement;
      measurementRef.current = nextMeasurement;

      const interactiveVisible = measurementReady
        && !disabledRef.current
        && !activationLockedRef.current;
      const visibilityValue = interactiveVisible ? 'true' : 'false';
      if (anchorElement) {
        anchorElement.hidden = !interactiveVisible;
        anchorElement.inert = !interactiveVisible;
        anchorElement.setAttribute('aria-hidden', String(!interactiveVisible));
        anchorElement.dataset.visible = visibilityValue;
      }
      if (buttonElement) {
        buttonElement.disabled = !interactiveVisible;
        buttonElement.tabIndex = interactiveVisible ? 0 : -1;
      }
      if (gatewayElement) {
        gatewayElement.dataset.visible = visibilityValue;
        gatewayElement.dataset.interactive = visibilityValue;
        gatewayElement.dataset.ready = String(measurementReady);
        gatewayElement.dataset.rendererViewportWidth =
          String(normalizedRendererPoint.viewportWidth);
        gatewayElement.dataset.rendererViewportHeight =
          String(normalizedRendererPoint.viewportHeight);
        gatewayElement.dataset.rendererX = String(normalizedRendererPoint.x);
        gatewayElement.dataset.rendererY = String(normalizedRendererPoint.y);
        gatewayElement.dataset.sourceLeft = String(normalizedSourceRect?.left ?? '');
        gatewayElement.dataset.sourceTop = String(normalizedSourceRect?.top ?? '');
        gatewayElement.dataset.sourceWidth = String(normalizedSourceRect?.width ?? '');
        gatewayElement.dataset.sourceHeight = String(normalizedSourceRect?.height ?? '');
        gatewayElement.dataset.clientX = String(gatewayClientCenter?.x ?? '');
        gatewayElement.dataset.clientY = String(gatewayClientCenter?.y ?? '');
        gatewayElement.dataset.buttonCenterX = String(buttonClientCenter?.x ?? '');
        gatewayElement.dataset.buttonCenterY = String(buttonClientCenter?.y ?? '');
        gatewayElement.dataset.alignmentError = String(alignmentErrorPx ?? '');
        gatewayElement.dataset.measurementGeneration =
          String(nextMeasurement.generation);
      }

      const noticeAnchor = noticeLayoutAnchorRef.current;
      if (
        interactiveVisible
        && noticeOpenRef.current
        && gatewayClientCenter
        && (
          viewportChanged
          || Math.abs(gatewayClientCenter.x - noticeAnchor.x) >= noticeRelayoutThreshold
          || Math.abs(gatewayClientCenter.y - noticeAnchor.y) >= noticeRelayoutThreshold
        )
      ) {
        positionNotice(false);
      }
      return measurementReady;
    }, [positionNotice]);

    const getRenderedMeasurement = useCallback(
      () => measurementRef.current,
      []
    );
    const getGatewayClientCenter = useCallback(
      () => measurementRef.current.gatewayClientCenter,
      []
    );
    const captureActivation = useCallback((
      input: GatewayActivationInput,
      clientPoint?: GatewayClientPoint | null
    ) => {
      const measurement = measurementRef.current;
      const buttonRect = snapshotGatewayRect(
        buttonRef.current?.getBoundingClientRect()
      );
      const buttonClientCenter = gatewayRectCenter(buttonRect)
        ?? measurement.buttonClientCenter;
      const alignmentErrorPx = gatewayClientDistance(
        measurement.gatewayClientCenter,
        buttonClientCenter
      ) ?? measurement.alignmentErrorPx;
      const interactiveAlignmentReady = Boolean(
        measurement.sourceSurfaceRect
        && alignmentErrorPx !== null
        && alignmentErrorPx <= gatewayAlignmentTolerance(
          measurement.sourceSurfaceRect
        )
      );
      const requiresInteractiveAlignment =
        input !== 'history' || !disabledRef.current;
      return createGatewayActivationRecord({
        input,
        pointerClientPoint: clientPoint,
        buttonRect,
        rendererPoint: measurement.rendererPoint,
        sourceSurfaceRect: measurement.sourceSurfaceRect,
        gatewayClientCenter: measurement.gatewayClientCenter,
        buttonClientCenter,
        alignmentErrorPx,
        measurementGeneration: measurement.generation,
        ready: measurement.ready
          && (
            !requiresInteractiveAlignment
            || interactiveAlignmentReady
          )
      });
    }, []);
    const focus = useCallback(() => {
      if (
        disabledRef.current
        || activationLockedRef.current
        || !measurementRef.current.ready
      ) return;
      buttonRef.current?.focus();
    }, []);

    useImperativeHandle(
      forwardedRef,
      () => ({
        setRenderedGateway,
        getRenderedMeasurement,
        getGatewayClientCenter,
        captureActivation,
        focus
      }),
      [
        captureActivation,
        focus,
        getGatewayClientCenter,
        getRenderedMeasurement,
        setRenderedGateway
      ]
    );

    useLayoutEffect(() => {
      const wasDisabled = disabledRef.current;
      disabledRef.current = disabled;
      pointerActivationPointRef.current = null;
      if (wasDisabled && !disabled) {
        activationLockedRef.current = false;
        activationInFlightRef.current = false;
        setActivationLocked(false);
      }
      const gateway = gatewayRef.current;
      const anchor = anchorRef.current;
      const button = buttonRef.current;
      const visible = !disabled
        && !activationLockedRef.current
        && measurementRef.current.ready;
      if (gateway) {
        gateway.dataset.visible = String(visible);
        gateway.dataset.interactive = String(visible);
      }
      if (anchor) {
        anchor.hidden = !visible;
        anchor.inert = !visible;
        anchor.dataset.visible = String(visible);
        anchor.setAttribute('aria-hidden', String(!visible));
      }
      if (button) {
        button.disabled = !visible;
        button.tabIndex = visible ? 0 : -1;
        if (!visible && document.activeElement === button) button.blur();
      }
      if (!disabled && measurementRef.current.sourceSurfaceRect) {
        setRenderedGateway(
          measurementRef.current.rendererPoint,
          measurementRef.current.sourceSurfaceRect
        );
      }
    }, [disabled, setRenderedGateway]);

    useLayoutEffect(() => {
      setRenderedGateway(emptyRendererPoint(), null);
    }, [setRenderedGateway]);

    const dismissNotice = useCallback(() => {
      if (!noticeOpenRef.current) {
        return;
      }

      noticeOpenRef.current = false;
      setNoticeState((current) => current.open ? { ...current, open: false } : current);
    }, []);

    const activateGateway = useCallback((
      input: GatewayActivationInput,
      clientPoint?: GatewayClientPoint | null
    ) => {
      if (
        disabledRef.current
        || activationLockedRef.current
        || activationInFlightRef.current
        || !measurementRef.current.ready
      ) {
        return;
      }
      activationInFlightRef.current = true;
      const activation = captureActivation(input, clientPoint);
      if (
        !activation.ready
        || (
          input === 'pointer'
          && !gatewayClientPointInsideRect(
            activation.pointerClientPoint,
            activation.buttonRect
          )
        )
      ) {
        activationInFlightRef.current = false;
        return;
      }
      const gatewayElement = gatewayRef.current;
      if (gatewayElement) {
        gatewayElement.dataset.acceptedPointerX =
          String(activation.pointerClientPoint?.x ?? '');
        gatewayElement.dataset.acceptedPointerY =
          String(activation.pointerClientPoint?.y ?? '');
        gatewayElement.dataset.frozenClientX =
          String(activation.gatewayClientCenter?.x ?? '');
        gatewayElement.dataset.frozenClientY =
          String(activation.gatewayClientCenter?.y ?? '');
        gatewayElement.dataset.measurementGeneration =
          String(activation.measurementGeneration);
      }
      if (notice) {
        noticeOpenRef.current = true;
        setNoticeState((current) => ({ open: true, version: current.version + 1 }));
      }
      onMeaningfulInteraction?.();
      try {
        onActivate?.(activation);
      } finally {
        activationInFlightRef.current = false;
        if (onActivate) {
          activationLockedRef.current = true;
          measurementRef.current = Object.freeze({
            ...measurementRef.current,
            rendererPoint: createGatewayRendererPoint({
              ...measurementRef.current.rendererPoint,
              visible: false
            }),
            ready: false
          });
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
    }, [captureActivation, notice, onActivate, onMeaningfulInteraction]);

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
            onPointerDown={(event) => {
              pointerActivationPointRef.current = (
                event.isPrimary !== false
                && event.button === 0
                && Number.isFinite(event.clientX)
                && Number.isFinite(event.clientY)
              )
                ? createGatewayClientPoint(event.clientX, event.clientY)
                : null;
            }}
            onPointerCancel={() => {
              pointerActivationPointRef.current = null;
            }}
            onClick={(event) => {
              const input = event.detail === 0 ? 'keyboard' : 'pointer';
              const pointerPoint = pointerActivationPointRef.current;
              pointerActivationPointRef.current = null;
              activateGateway(
                input,
                input === 'pointer'
                  ? pointerPoint
                    ?? createGatewayClientPoint(event.clientX, event.clientY)
                  : null
              );
            }}
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

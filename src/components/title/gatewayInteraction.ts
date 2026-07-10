export type GatewayInteractionDefaults = {
  interactionRadiusRatio: number;
  surgeDurationSeconds: number;
  surgeAttackSeconds: number;
  noticeGap: number;
  noticeMargin: number;
  hitRadius: number;
};

export const gatewayInteractionDefaults: GatewayInteractionDefaults = {
  interactionRadiusRatio: 0.31,
  surgeDurationSeconds: 1.6,
  surgeAttackSeconds: 0.12,
  noticeGap: 14,
  noticeMargin: 16,
  hitRadius: 36
};

export type GatewayNoticePlacement = 'above' | 'below';

export type GatewayNoticePositionInput = {
  anchorX: number;
  anchorY: number;
  noticeWidth: number;
  noticeHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  hitRadius?: number;
  gap?: number;
  margin?: number;
  preferredPlacement?: GatewayNoticePlacement | 'auto';
};

export type GatewayNoticePosition = {
  left: number;
  top: number;
  placement: GatewayNoticePlacement;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function nonNegativeOr(value: number | undefined, fallback: number) {
  const finiteValue = finiteOr(value ?? fallback, fallback);
  return Math.max(0, finiteValue);
}

export function smoothGatewayEasing(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const unit = clamp(value, 0, 1);
  return unit * unit * (3 - 2 * unit);
}

export function calculateGatewayProximity(
  pointerX: number,
  pointerY: number,
  centerX: number,
  centerY: number,
  interactionRadius: number
) {
  if (
    !Number.isFinite(pointerX) ||
    !Number.isFinite(pointerY) ||
    !Number.isFinite(centerX) ||
    !Number.isFinite(centerY) ||
    !Number.isFinite(interactionRadius) ||
    interactionRadius <= 0
  ) {
    return 0;
  }

  const distance = Math.hypot(pointerX - centerX, pointerY - centerY);
  const normalized = 1 - distance / interactionRadius;
  return smoothGatewayEasing(normalized);
}

export function calculateGatewayInteractionRadius(
  viewportWidth: number,
  viewportHeight: number,
  ratio: number = gatewayInteractionDefaults.interactionRadiusRatio
) {
  if (
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight) ||
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    !Number.isFinite(ratio) ||
    ratio <= 0
  ) {
    return 0;
  }

  return Math.min(viewportWidth, viewportHeight) * ratio;
}

export function calculateActivationSurge(
  elapsedSeconds: number,
  durationSeconds: number = gatewayInteractionDefaults.surgeDurationSeconds,
  attackSeconds: number = gatewayInteractionDefaults.surgeAttackSeconds
) {
  if (
    !Number.isFinite(elapsedSeconds) ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    elapsedSeconds < 0 ||
    elapsedSeconds >= durationSeconds
  ) {
    return 0;
  }

  const safeAttack = clamp(
    finiteOr(attackSeconds, gatewayInteractionDefaults.surgeAttackSeconds),
    0,
    durationSeconds * 0.5
  );

  if (safeAttack > 0 && elapsedSeconds < safeAttack) {
    return smoothGatewayEasing(elapsedSeconds / safeAttack);
  }

  const releaseDuration = durationSeconds - safeAttack;
  if (releaseDuration <= 0) {
    return 0;
  }

  const releaseProgress = (elapsedSeconds - safeAttack) / releaseDuration;
  return 1 - smoothGatewayEasing(releaseProgress);
}

export function calculateGatewayNoticePosition({
  anchorX,
  anchorY,
  noticeWidth,
  noticeHeight,
  viewportWidth,
  viewportHeight,
  hitRadius = gatewayInteractionDefaults.hitRadius,
  gap = gatewayInteractionDefaults.noticeGap,
  margin = gatewayInteractionDefaults.noticeMargin,
  preferredPlacement = 'auto'
}: GatewayNoticePositionInput): GatewayNoticePosition {
  const safeViewportWidth = Math.max(0, finiteOr(viewportWidth, 0));
  const safeViewportHeight = Math.max(0, finiteOr(viewportHeight, 0));

  if (safeViewportWidth === 0 || safeViewportHeight === 0) {
    return { left: 0, top: 0, placement: 'below' };
  }

  const maximumMargin = Math.min(safeViewportWidth, safeViewportHeight) * 0.5;
  const safeMargin = clamp(nonNegativeOr(margin, gatewayInteractionDefaults.noticeMargin), 0, maximumMargin);
  const availableWidth = Math.max(0, safeViewportWidth - safeMargin * 2);
  const availableHeight = Math.max(0, safeViewportHeight - safeMargin * 2);
  const safeNoticeWidth = clamp(nonNegativeOr(noticeWidth, 0), 0, availableWidth);
  const safeNoticeHeight = clamp(nonNegativeOr(noticeHeight, 0), 0, availableHeight);
  const safeAnchorX = clamp(finiteOr(anchorX, safeViewportWidth * 0.5), 0, safeViewportWidth);
  const safeAnchorY = clamp(finiteOr(anchorY, safeViewportHeight * 0.5), 0, safeViewportHeight);
  const safeHitRadius = nonNegativeOr(hitRadius, gatewayInteractionDefaults.hitRadius);
  const safeGap = nonNegativeOr(gap, gatewayInteractionDefaults.noticeGap);

  const belowTop = safeAnchorY + safeHitRadius + safeGap;
  const aboveTop = safeAnchorY - safeHitRadius - safeGap - safeNoticeHeight;
  const availableBelow = safeViewportHeight - safeMargin - belowTop;
  const availableAbove = safeAnchorY - safeHitRadius - safeGap - safeMargin;
  const fitsBelow = availableBelow >= safeNoticeHeight;
  const fitsAbove = availableAbove >= safeNoticeHeight;
  const placement: GatewayNoticePlacement = preferredPlacement === 'above' && fitsAbove
    ? 'above'
    : preferredPlacement === 'below' && fitsBelow
      ? 'below'
      : fitsBelow || (!fitsAbove && availableBelow >= availableAbove)
        ? 'below'
        : 'above';
  const desiredTop = placement === 'below' ? belowTop : aboveTop;
  const maximumLeft = Math.max(safeMargin, safeViewportWidth - safeMargin - safeNoticeWidth);
  const maximumTop = Math.max(safeMargin, safeViewportHeight - safeMargin - safeNoticeHeight);

  return {
    left: clamp(safeAnchorX - safeNoticeWidth * 0.5, safeMargin, maximumLeft),
    top: clamp(desiredTop, safeMargin, maximumTop),
    placement
  };
}

export const gatewayVfxVertexPassthrough = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const gatewayEyeFragmentShader = `
  varying vec2 vUv;
  uniform float time;
  uniform float coreExtent;
  uniform float shadowRadius;
  uniform float accretionRadius;
  uniform float lensRadius;
  uniform float gatewayBrightness;
  uniform float gatewayEyeFocus;
  uniform float gatewayPulsePhase;
  uniform float gatewayFlowPhase;
  uniform float activationProgress;
  uniform float activationCompression;
  uniform float activationFocus;
  uniform float activationRupture;
  uniform float activationShockwave;
  uniform float reducedMotion;

  const float TAU = 6.28318530718;

  float ellipseRadius(vec2 point, float verticalCompression) {
    return length(vec2(point.x, point.y / max(0.2, verticalCompression)));
  }

  float narrowRing(float radius, float target, float width) {
    return exp(-pow((radius - target) / max(0.0001, width), 2.0));
  }

  void main() {
    vec2 point = (vUv - vec2(0.5)) * 2.0 * coreExtent;
    float proximityFocus = clamp(gatewayEyeFocus + activationFocus * 0.72, 0.0, 1.0);
    float shadowCompression = 0.68 - proximityFocus * 0.075;
    float shadowMetric = ellipseRadius(point, shadowCompression);
    vec2 anglePoint = vec2(point.x, point.y / shadowCompression);
    if (dot(anglePoint, anglePoint) < 0.00000001) {
      anglePoint.x = 0.0001;
    }
    float angle = atan(anglePoint.y, anglePoint.x);
    float stableAsymmetry = 1.0 + sin(angle * 2.0 + 0.35) * 0.008;
    shadowMetric *= stableAsymmetry;

    float focusedShadowRadius = shadowRadius * (
      1.0 - proximityFocus * 0.045 - activationCompression * 0.07
    );
    float absorption = 1.0 - smoothstep(
      focusedShadowRadius * 0.84,
      focusedShadowRadius * 1.14,
      shadowMetric
    );

    float lensCompression = 0.45 - proximityFocus * 0.035;
    float lensMetric = ellipseRadius(point, lensCompression);
    float horizontalTaper = 1.0 - smoothstep(
      accretionRadius * 0.46,
      accretionRadius * 1.02,
      abs(point.x)
    );
    float sideCaustic = smoothstep(
      accretionRadius * 0.62,
      lensRadius * 0.72,
      abs(point.x)
    ) * (1.0 - smoothstep(lensRadius * 0.72, lensRadius * 1.02, abs(point.x)));
    sideCaustic *= exp(-pow(point.y / 0.034, 2.0));
    float upperGate = smoothstep(-0.012, 0.035, point.y);
    float lowerGate = 1.0 - smoothstep(-0.04, 0.018, point.y);
    float breathing = mix(
      0.5,
      0.5 + 0.5 * sin(time * 0.82 + gatewayPulsePhase * 0.2),
      1.0 - reducedMotion
    );
    float upperArc = narrowRing(
      lensMetric,
      accretionRadius * (1.0 - activationCompression * 0.05),
      0.009 + proximityFocus * 0.0015
    ) * upperGate * horizontalTaper;
    float lowerArc = narrowRing(
      lensMetric,
      accretionRadius * 1.075,
      0.0065 + proximityFocus * 0.001
    ) * lowerGate * horizontalTaper;
    float outerPhoton = narrowRing(lensMetric, lensRadius * 0.72, 0.008) * sideCaustic;

    float travellingHighlight = pow(
      max(0.0, 0.5 + 0.5 * cos(angle * 1.35 - gatewayFlowPhase * 1.8)),
      16.0
    );
    float innerRim = narrowRing(
      shadowMetric,
      focusedShadowRadius * 1.23,
      0.0045 + proximityFocus * 0.001
    ) * (0.2 + travellingHighlight * 0.8);

    float shockRadius = mix(
      accretionRadius * 0.78,
      lensRadius * 1.12,
      clamp(activationProgress, 0.0, 1.0)
    );
    float shockwave = narrowRing(lensMetric, shockRadius, 0.0065) *
      activationShockwave * horizontalTaper;
    float focusedFlash = narrowRing(lensMetric, accretionRadius * 0.96, 0.005) *
      activationRupture * travellingHighlight;

    float arcEnergy = upperArc * 0.9 + lowerArc * 0.54 + outerPhoton * 0.44;
    arcEnergy *= 0.62 + gatewayBrightness * 0.55 + breathing * 0.08;
    arcEnergy += innerRim * (0.34 + proximityFocus * 0.35);
    arcEnergy += shockwave * 0.62 + focusedFlash * 0.48;
    arcEnergy *= 1.0 - absorption * 0.985;

    vec3 black = vec3(0.00025, 0.00035, 0.0012);
    vec3 deepViolet = vec3(0.16, 0.025, 0.31);
    vec3 reflectiveViolet = vec3(0.53, 0.19, 0.86);
    vec3 caustic = vec3(0.87, 0.66, 1.0);
    float reflectiveMix = clamp(
      travellingHighlight * (upperArc + lowerArc) + shockwave * 0.8,
      0.0,
      1.0
    );
    vec3 energyColor = mix(deepViolet, reflectiveViolet, 0.42 + gatewayBrightness * 0.35);
    energyColor = mix(energyColor, caustic, reflectiveMix * 0.72);
    vec3 color = mix(black, energyColor, clamp(arcEnergy * 2.7, 0.0, 1.0));
    float alpha = max(absorption * 0.995, arcEnergy * 0.86);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const gatewayRibbonVertexShader = `
  attribute float ribbonAngle;
  attribute float ribbonSide;
  attribute float ribbonLayer;
  attribute float ribbonPhase;
  attribute float ribbonRadius;
  attribute float ribbonWidth;
  attribute float ribbonDirection;
  attribute float ribbonKind;
  varying float vAcross;
  varying float vAlong;
  varying float vPhase;
  varying float vLayer;
  varying float vKind;
  varying float vPointerFacing;
  uniform float time;
  uniform float galaxyRadius;
  uniform float gatewayOrbitSpeed;
  uniform float gatewayTurbulence;
  uniform float gatewayRayThickness;
  uniform float gatewayPointerBend;
  uniform float activationCompression;
  uniform float activationRupture;
  uniform vec2 gatewayPointerDirection;
  uniform float gatewayPointerValid;
  uniform float reducedMotion;

  const float TAU = 6.28318530718;

  void main() {
    float motionScale = 1.0 - reducedMotion * 0.985;
    float layerRate = mix(0.72, 1.24, fract(ribbonPhase * 0.137 + ribbonLayer * 0.31));
    float activeRate = 0.26 + max(0.0, gatewayOrbitSpeed - 0.18) * 1.55;
    float orbit = time * activeRate * ribbonDirection * layerRate * motionScale;
    float angle = ribbonAngle + ribbonPhase + orbit;
    float filament = step(0.5, ribbonKind);
    float spiralProgress = ribbonAngle / TAU;
    float spiralPull = filament * (0.5 - spiralProgress) * 0.055;
    float turbulence = sin(
      ribbonAngle * mix(3.0, 7.0, filament) + ribbonPhase * 2.0 +
      time * (0.18 + gatewayOrbitSpeed * 0.72) * ribbonDirection
    );
    turbulence += sin(
      ribbonAngle * mix(5.0, 11.0, filament) - ribbonPhase +
      time * (0.12 + gatewayOrbitSpeed * 0.41)
    ) * 0.46;
    float turbulentOffset = turbulence * (0.0025 + gatewayTurbulence * 0.0095);
    float compression = 1.0 - activationCompression * (0.09 + filament * 0.04);
    float ruptureExpansion = activationRupture * (0.012 + filament * 0.028);
    float radius = max(
      0.035,
      ribbonRadius * compression + spiralPull + turbulentOffset + ruptureExpansion
    );
    float width = ribbonWidth * gatewayRayThickness * (
      1.0 + filament * gatewayTurbulence * 0.06
    );
    vec2 radial = vec2(cos(angle), sin(angle));
    vec2 tangent = vec2(-radial.y, radial.x);
    float pointerFacing = max(0.0, dot(radial, gatewayPointerDirection));
    float pointerResponsive = step(0.53, fract(ribbonPhase * 0.73 + ribbonLayer * 0.37));
    vec2 pointerOffset = gatewayPointerDirection *
      gatewayPointerBend * gatewayPointerValid * pointerFacing * pointerResponsive *
      mix(0.012, 0.024, filament);
    vec2 localPoint = radial * radius + tangent * ribbonSide * width + pointerOffset;

    vAcross = ribbonSide;
    vAlong = ribbonAngle;
    vPhase = ribbonPhase;
    vLayer = ribbonLayer;
    vKind = ribbonKind;
    vPointerFacing = pointerFacing * pointerResponsive * gatewayPointerValid;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(localPoint * galaxyRadius, 0.0, 1.0);
  }
`;

export const gatewayRibbonFragmentShader = `
  varying float vAcross;
  varying float vAlong;
  varying float vPhase;
  varying float vLayer;
  varying float vKind;
  varying float vPointerFacing;
  uniform float time;
  uniform float gatewayBrightness;
  uniform float gatewayHighlightSpeed;
  uniform float gatewayTurbulence;
  uniform float activationRupture;
  uniform float reducedMotion;

  void main() {
    float edge = 1.0 - smoothstep(0.18, 1.0, abs(vAcross));
    float highlightRate = 0.4 + max(0.0, gatewayHighlightSpeed - 0.12) * 2.35;
    float travelling = 0.5 + 0.5 * cos(
      vAlong * (2.0 + mod(vLayer, 2.0)) -
      time * highlightRate * (1.0 - reducedMotion * 0.97) + vPhase * 3.0
    );
    float reflection = pow(max(0.0, travelling), 19.0);
    float brokenBand = pow(max(0.0, 0.5 + 0.5 * sin(vAlong * 5.0 + vPhase * 6.0)), 7.0);
    float filament = step(0.5, vKind);
    float ribbonCarrier = 0.5 + 0.5 * cos(vAlong - vPhase * 0.72 + vLayer * 1.91);
    float ribbonWindow = smoothstep(0.22, 0.84, ribbonCarrier);
    float filamentCarrier = 0.5 + 0.5 * sin(vAlong * 1.65 + vPhase * 2.3);
    float filamentWindow = smoothstep(0.46, 0.91, filamentCarrier) * (0.42 + brokenBand * 0.58);
    float visibility = mix(ribbonWindow, filamentWindow, filament);
    float body = edge * visibility * (0.018 + gatewayBrightness * mix(0.072, 0.052, filament));
    float narrowLight = edge * reflection * visibility * (0.24 + gatewayBrightness * 0.46);
    narrowLight *= mix(0.62 + brokenBand * 0.38, 0.38 + brokenBand * 0.62, filament);
    narrowLight *= 1.0 + vPointerFacing * gatewayTurbulence * 0.18;
    float violentActivity = smoothstep(0.34, 1.18, gatewayTurbulence);
    body *= 1.0 + violentActivity * mix(1.25, 0.82, filament);
    narrowLight *= 1.0 + violentActivity * 0.32;
    float shearGlint = pow(max(
      0.0,
      0.5 + 0.5 * sin(
        vAlong * mix(8.0, 13.0, filament) + vPhase * 4.0 +
        time * (1.4 + gatewayHighlightSpeed * 2.8)
      )
    ), 17.0);
    narrowLight += edge * visibility * shearGlint * violentActivity *
      mix(0.22, 0.15, filament);
    float rupture = edge * visibility * activationRupture * reflection * 0.19;
    float alpha = body + narrowLight + rupture;
    if (alpha < 0.004) discard;
    vec3 deepPurple = vec3(0.12, 0.018, 0.27);
    vec3 violet = vec3(0.46, 0.12, 0.78);
    vec3 lavender = vec3(0.84, 0.59, 1.0);
    vec3 color = mix(deepPurple, violet, 0.48 + gatewayBrightness * 0.36);
    color = mix(color, lavender, clamp(reflection * 0.78 + rupture, 0.0, 0.84));
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const gatewayParticleVertexShader = `
  attribute float particleAngle;
  attribute float particleRadius;
  attribute float particleOrbitSpeed;
  attribute float particleRadialDrift;
  attribute float particlePhase;
  attribute float particleVerticalOffset;
  attribute float particleSize;
  attribute float particleBrightness;
  attribute float particleBehavior;
  varying float vBrightness;
  varying float vBehavior;
  varying float vHot;
  uniform float time;
  uniform float pixelRatio;
  uniform float galaxyRadius;
  uniform float gatewayParticleSpeed;
  uniform float gatewayTurbulence;
  uniform float gatewayPointerBend;
  uniform float activationParticlePeel;
  uniform vec2 gatewayPointerDirection;
  uniform float gatewayPointerValid;
  uniform float reducedMotion;

  void main() {
    float motionScale = 1.0 - reducedMotion * 0.99;
    float cycleRate = 0.022 + max(0.0, gatewayParticleSpeed - 0.22) * 0.065;
    float cycle = fract(particlePhase / 6.28318530718 + time * cycleRate * motionScale);
    float baseRadius = mix(0.075, 0.37, particleRadius);
    float isOrbit = step(0.5, particleBehavior) * (1.0 - step(1.5, particleBehavior));
    float isEscape = step(1.5, particleBehavior);
    float isInfall = 1.0 - isOrbit - isEscape;
    float infallTarget = 0.068 + particleRadialDrift * 0.055;
    float infallRadius = mix(
      baseRadius,
      infallTarget,
      pow(cycle, 0.78 + abs(particleRadialDrift) * 1.6)
    );
    float orbitRadius = baseRadius + sin(time * 0.21 + particlePhase) * particleRadialDrift * 0.12;
    float escapeTarget = 0.43 + particleRadialDrift * 0.38;
    float escapeRadius = mix(baseRadius, escapeTarget, cycle);
    float radius = infallRadius * isInfall + orbitRadius * isOrbit + escapeRadius * isEscape;
    radius += activationParticlePeel * (0.025 + isEscape * 0.055) * smoothstep(0.15, 1.0, cycle);
    float orbitalRate = 0.16 + max(0.0, gatewayParticleSpeed - 0.22) * 1.45;
    float angle = particleAngle + time * orbitalRate * particleOrbitSpeed * motionScale;
    angle += sin(particlePhase + time * (0.14 + gatewayTurbulence * 0.5)) *
      gatewayTurbulence * 0.025;
    vec2 radial = vec2(cos(angle), sin(angle));
    vec2 localPoint = radial * radius;
    float pointerSubset = step(0.84, fract(particlePhase * 0.618));
    float pointerFacing = max(0.0, dot(radial, gatewayPointerDirection));
    localPoint += gatewayPointerDirection * gatewayPointerBend * gatewayPointerValid *
      pointerSubset * pointerFacing * 0.018;
    float z = particleVerticalOffset * 0.12 + sin(angle * 2.0 + particlePhase) * 0.008;
    vec4 viewPosition = modelViewMatrix * vec4(localPoint * galaxyRadius, z * galaxyRadius, 1.0);
    float activitySize = 1.0 + min(0.32, gatewayTurbulence * 0.08);
    gl_PointSize = clamp(
      particleSize * pixelRatio * 6.5 * activitySize / max(7.0, -viewPosition.z),
      1.0,
      5.5
    );
    gl_Position = projectionMatrix * viewPosition;
    vBrightness = particleBrightness;
    vBehavior = particleBehavior;
    vHot = pointerFacing * pointerSubset + activationParticlePeel * 0.7;
  }
`;

export const gatewayParticleFragmentShader = `
  varying float vBrightness;
  varying float vBehavior;
  varying float vHot;
  uniform float gatewayBrightness;

  void main() {
    vec2 point = gl_PointCoord - vec2(0.5);
    float radial = length(point);
    float spark = 1.0 - smoothstep(0.08, 0.48, radial);
    float horizontal = exp(-abs(point.y) * 34.0) *
      (1.0 - smoothstep(0.08, 0.5, abs(point.x)));
    float shape = max(spark, horizontal * 0.46);
    float alpha = shape * vBrightness * (0.24 + gatewayBrightness * 0.44);
    if (alpha < 0.008) discard;
    vec3 deepPurple = vec3(0.27, 0.065, 0.5);
    vec3 lavender = vec3(0.82, 0.58, 1.0);
    float heat = clamp(vHot * 0.52 + step(1.5, vBehavior) * 0.12, 0.0, 0.72);
    vec3 color = mix(deepPurple, lavender, 0.32 + heat);
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

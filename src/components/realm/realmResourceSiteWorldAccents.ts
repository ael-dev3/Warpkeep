import * as THREE from 'three';

export type RealmResourceSiteKind = 'gold' | 'food' | 'wood' | 'stone';

/**
 * The only world-state vocabulary understood by the decorative site layer.
 * Callers must derive it from an already validated public occupation graph.
 */
export type RealmResourceSiteWorldState =
  | 'available'
  | 'reserved'
  | 'gathering'
  | 'unavailable';

export type RealmResourceSiteWorldStateRecord = Readonly<{
  siteId: string;
  state: RealmResourceSiteWorldState;
}>;

export type RealmResourceSiteWorldAccentTelemetry = Readonly<{
  sourceSiteCount: number;
  renderedSiteCount: number;
  availableSiteCount: number;
  reservedSiteCount: number;
  gatheringSiteCount: number;
  unavailableSiteCount: number;
  drawNodeCount: number;
  triangleCount: number;
}>;

export const REALM_RESOURCE_SITE_WORLD_ACCENT_LIMITS = Object.freeze({
  maximumRenderedSitesPerResource: 256,
  maximumDrawNodesPerResource: 4,
  footprintSegments: 24,
  stateRingSegments: 24,
  focusRingSegments: 28
});

type SiteAnchor = Readonly<{
  siteId: string;
  x: number;
  y: number;
  z: number;
}>;

type AccentStyle = Readonly<{
  footprintRadiusX: number;
  footprintRadiusZ: number;
  footprintYaw: number;
  packedGround: string;
  contactEdge: string;
  accent: string;
  gatheringAccent: string;
  hoverAccent: string;
}>;

const ACCENT_STYLES: Readonly<Record<RealmResourceSiteKind, AccentStyle>> = Object.freeze({
  gold: Object.freeze({
    footprintRadiusX: 0.52,
    footprintRadiusZ: 0.47,
    footprintYaw: 0.12,
    packedGround: '#765b35',
    contactEdge: '#303124',
    accent: '#d7aa42',
    gatheringAccent: '#f2d47a',
    hoverAccent: '#e5c66c'
  }),
  food: Object.freeze({
    footprintRadiusX: 0.54,
    footprintRadiusZ: 0.49,
    footprintYaw: -0.1,
    packedGround: '#7a5a32',
    contactEdge: '#383326',
    accent: '#c99b48',
    gatheringAccent: '#efd788',
    hoverAccent: '#dec477'
  }),
  wood: Object.freeze({
    footprintRadiusX: 0.61,
    footprintRadiusZ: 0.54,
    footprintYaw: 0.16,
    packedGround: '#5a482f',
    contactEdge: '#293229',
    accent: '#88b56a',
    gatheringAccent: '#b8dc91',
    hoverAccent: '#a9cc85'
  }),
  stone: Object.freeze({
    footprintRadiusX: 0.61,
    footprintRadiusZ: 0.53,
    footprintYaw: -0.18,
    packedGround: '#68665e',
    contactEdge: '#343a36',
    accent: '#a99bb8',
    gatheringAccent: '#d1b8df',
    hoverAccent: '#c2add0'
  })
});

const UNAVAILABLE_COLOR = new THREE.Color('#777d77');
const RESERVED_COLOR = new THREE.Color('#d0a85d');
const SELECTED_COLOR = new THREE.Color('#f1df9d');
const FOOTPRINT_Y_OFFSET = -0.011;
const STATE_Y_OFFSET = 0.008;
const HOVER_Y_OFFSET = 0.011;
const SELECTED_Y_OFFSET = 0.014;

function isWorldState(value: unknown): value is RealmResourceSiteWorldState {
  return value === 'available'
    || value === 'reserved'
    || value === 'gathering'
    || value === 'unavailable';
}

/**
 * Legacy phase rows do not carry the v12 unified lease invariant. They stay
 * deliberately conservative until the scene supplies an explicit validated
 * world-state record through `reconcileWorldStates`.
 */
export function conservativeRealmResourceSiteWorldState(input: Readonly<{
  availability: string;
  hasOccupation: boolean;
}>): RealmResourceSiteWorldState {
  if (input.availability === 'available' && !input.hasOccupation) return 'available';
  if (input.availability === 'outbound' && input.hasOccupation) return 'reserved';
  if (input.availability === 'gathering' && input.hasOccupation) return 'gathering';
  return 'unavailable';
}

function createFootprintGeometry(style: AccentStyle) {
  const segments = REALM_RESOURCE_SITE_WORLD_ACCENT_LIMITS.footprintSegments;
  const positions: number[] = [0, 0, 0];
  const normals: number[] = [0, 1, 0];
  const colors: number[] = [];
  const packedColor = new THREE.Color(style.packedGround);
  const contactColor = new THREE.Color(style.contactEdge);
  colors.push(packedColor.r, packedColor.g, packedColor.b);

  for (const radius of [0.68, 1]) {
    const color = radius < 1 ? packedColor : contactColor;
    for (let index = 0; index < segments; index += 1) {
      const theta = index / segments * Math.PI * 2;
      positions.push(Math.cos(theta) * radius, 0, Math.sin(theta) * radius);
      normals.push(0, 1, 0);
      colors.push(color.r, color.g, color.b);
    }
  }

  const indices: number[] = [];
  const innerStart = 1;
  const outerStart = 1 + segments;
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    indices.push(0, innerStart + next, innerStart + index);
    indices.push(
      innerStart + index,
      innerStart + next,
      outerStart + index,
      innerStart + next,
      outerStart + next,
      outerStart + index
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function stateRadius(state: RealmResourceSiteWorldState) {
  if (state === 'reserved') return 0.72;
  if (state === 'gathering') return 0.94;
  if (state === 'unavailable') return 0.84;
  return 0.9;
}

function stateColor(state: RealmResourceSiteWorldState, style: AccentStyle) {
  if (state === 'reserved') return RESERVED_COLOR;
  if (state === 'gathering') return new THREE.Color(style.gatheringAccent);
  if (state === 'unavailable') return UNAVAILABLE_COLOR;
  return new THREE.Color(style.accent);
}

function isValidAnchor(anchor: SiteAnchor) {
  return typeof anchor.siteId === 'string'
    && anchor.siteId.length > 0
    && Number.isFinite(anchor.x)
    && Number.isFinite(anchor.y)
    && Number.isFinite(anchor.z);
}

export type RealmResourceSiteWorldAccents = Readonly<{
  group: THREE.Group;
  /**
   * Atomically updates presentation state while preserving every static
   * anchor, mesh, instance buffer, and canonical site identity.
   */
  reconcileWorldStates: (states: readonly RealmResourceSiteWorldStateRecord[]) => boolean;
  setSelectedSiteId: (siteId: string | null) => void;
  setHoveredSiteId: (siteId: string | null) => void;
  getTelemetry: () => RealmResourceSiteWorldAccentTelemetry;
  dispose: () => void;
}>;

export function createRealmResourceSiteWorldAccents(options: Readonly<{
  resource: RealmResourceSiteKind;
  sites: readonly SiteAnchor[];
  initialStates: readonly RealmResourceSiteWorldStateRecord[];
  dynamicShadows: boolean;
}>): RealmResourceSiteWorldAccents {
  const style = ACCENT_STYLES[options.resource];
  const group = new THREE.Group();
  group.name = `realm-${options.resource}-site-world-accents`;

  const allAnchors = new Map<string, SiteAnchor>();
  for (const anchor of options.sites) {
    if (!isValidAnchor(anchor) || allAnchors.has(anchor.siteId)) continue;
    allAnchors.set(anchor.siteId, Object.freeze({ ...anchor }));
  }
  const renderedAnchors = [...allAnchors.values()]
    .slice(0, REALM_RESOURCE_SITE_WORLD_ACCENT_LIMITS.maximumRenderedSitesPerResource);
  const renderedAnchorById = new Map(renderedAnchors.map((anchor) => [anchor.siteId, anchor]));

  const footprintGeometry = createFootprintGeometry(style);
  const footprintMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    metalness: 0,
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const footprints = new THREE.InstancedMesh(
    footprintGeometry,
    footprintMaterial,
    renderedAnchors.length
  );
  footprints.name = `realm-${options.resource}-site-ground-footprints`;
  footprints.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  footprints.castShadow = false;
  footprints.receiveShadow = options.dynamicShadows;
  footprints.frustumCulled = false;
  footprints.renderOrder = 1;

  const stateGeometry = new THREE.RingGeometry(
    0.86,
    1,
    REALM_RESOURCE_SITE_WORLD_ACCENT_LIMITS.stateRingSegments
  );
  const stateMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  const stateRings = new THREE.InstancedMesh(
    stateGeometry,
    stateMaterial,
    renderedAnchors.length
  );
  stateRings.name = `realm-${options.resource}-site-state-rings`;
  stateRings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  stateRings.frustumCulled = false;
  stateRings.renderOrder = 2;

  const focusGeometry = new THREE.RingGeometry(
    0.9,
    1,
    REALM_RESOURCE_SITE_WORLD_ACCENT_LIMITS.focusRingSegments
  );
  const selectedMaterial = new THREE.MeshBasicMaterial({
    color: SELECTED_COLOR,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3
  });
  const selectedRing = new THREE.Mesh(focusGeometry, selectedMaterial);
  selectedRing.name = `realm-${options.resource}-site-selection-ring`;
  selectedRing.rotation.x = -Math.PI * 0.5;
  selectedRing.visible = false;
  selectedRing.renderOrder = 3;

  const hoverMaterial = new THREE.MeshBasicMaterial({
    color: style.hoverAccent,
    transparent: true,
    opacity: 0.64,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2.5,
    polygonOffsetUnits: -2.5
  });
  const hoverRing = new THREE.Mesh(focusGeometry, hoverMaterial);
  hoverRing.name = `realm-${options.resource}-site-hover-ring`;
  hoverRing.rotation.x = -Math.PI * 0.5;
  hoverRing.visible = false;
  hoverRing.renderOrder = 3;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const footprintRotation = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    style.footprintYaw
  );
  const ringRotation = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    -Math.PI * 0.5
  );
  const scale = new THREE.Vector3();
  renderedAnchors.forEach((anchor, index) => {
    position.set(anchor.x, anchor.y + FOOTPRINT_Y_OFFSET, anchor.z);
    scale.set(style.footprintRadiusX, 1, style.footprintRadiusZ);
    matrix.compose(position, footprintRotation, scale);
    footprints.setMatrixAt(index, matrix);
  });
  footprints.count = renderedAnchors.length;
  footprints.instanceMatrix.needsUpdate = true;
  footprints.computeBoundingSphere();

  group.add(footprints, stateRings, selectedRing, hoverRing);
  let selectedSiteId: string | undefined;
  let hoveredSiteId: string | undefined;
  let disposed = false;
  let telemetry: RealmResourceSiteWorldAccentTelemetry = Object.freeze({
    sourceSiteCount: allAnchors.size,
    renderedSiteCount: renderedAnchors.length,
    availableSiteCount: 0,
    reservedSiteCount: 0,
    gatheringSiteCount: 0,
    unavailableSiteCount: allAnchors.size,
    drawNodeCount: renderedAnchors.length === 0 ? 0 : 2,
    triangleCount: 0
  });

  const syncFocusRings = () => {
    const selectedAnchor = selectedSiteId
      ? renderedAnchorById.get(selectedSiteId)
      : undefined;
    const hoveredAnchor = hoveredSiteId && hoveredSiteId !== selectedSiteId
      ? renderedAnchorById.get(hoveredSiteId)
      : undefined;
    selectedRing.visible = selectedAnchor !== undefined;
    hoverRing.visible = hoveredAnchor !== undefined;
    if (selectedAnchor) {
      selectedRing.position.set(
        selectedAnchor.x,
        selectedAnchor.y + SELECTED_Y_OFFSET,
        selectedAnchor.z
      );
      selectedRing.scale.set(
        style.footprintRadiusX * 1.15,
        style.footprintRadiusZ * 1.15,
        1
      );
    }
    if (hoveredAnchor) {
      hoverRing.position.set(
        hoveredAnchor.x,
        hoveredAnchor.y + HOVER_Y_OFFSET,
        hoveredAnchor.z
      );
      hoverRing.scale.set(
        style.footprintRadiusX * 1.07,
        style.footprintRadiusZ * 1.07,
        1
      );
    }
  };

  const reconcileWorldStates = (
    states: readonly RealmResourceSiteWorldStateRecord[]
  ) => {
    if (disposed || states.length !== allAnchors.size) return false;
    const nextStates = new Map<string, RealmResourceSiteWorldState>();
    for (const record of states) {
      if (
        !allAnchors.has(record.siteId)
        || nextStates.has(record.siteId)
        || !isWorldState(record.state)
      ) return false;
      nextStates.set(record.siteId, record.state);
    }

    const counts: Record<RealmResourceSiteWorldState, number> = {
      available: 0,
      reserved: 0,
      gathering: 0,
      unavailable: 0
    };
    for (const state of nextStates.values()) counts[state] += 1;
    renderedAnchors.forEach((anchor, index) => {
      const state = nextStates.get(anchor.siteId) ?? 'unavailable';
      const radius = stateRadius(state);
      position.set(anchor.x, anchor.y + STATE_Y_OFFSET, anchor.z);
      scale.set(
        style.footprintRadiusX * radius,
        style.footprintRadiusZ * radius,
        1
      );
      matrix.compose(position, ringRotation, scale);
      stateRings.setMatrixAt(index, matrix);
      stateRings.setColorAt(index, stateColor(state, style));
    });
    stateRings.count = renderedAnchors.length;
    stateRings.instanceMatrix.needsUpdate = true;
    if (stateRings.instanceColor) stateRings.instanceColor.needsUpdate = true;
    stateRings.computeBoundingSphere();

    const footprintTriangles = REALM_RESOURCE_SITE_WORLD_ACCENT_LIMITS.footprintSegments * 3;
    const stateTriangles = REALM_RESOURCE_SITE_WORLD_ACCENT_LIMITS.stateRingSegments * 2;
    telemetry = Object.freeze({
      sourceSiteCount: allAnchors.size,
      renderedSiteCount: renderedAnchors.length,
      availableSiteCount: counts.available,
      reservedSiteCount: counts.reserved,
      gatheringSiteCount: counts.gathering,
      unavailableSiteCount: counts.unavailable,
      drawNodeCount: renderedAnchors.length === 0
        ? 0
        : 2 + Number(selectedRing.visible) + Number(hoverRing.visible),
      triangleCount: renderedAnchors.length * (footprintTriangles + stateTriangles)
        + (Number(selectedRing.visible) + Number(hoverRing.visible))
          * REALM_RESOURCE_SITE_WORLD_ACCENT_LIMITS.focusRingSegments * 2
    });
    return true;
  };

  // Invalid initial state is contained as unavailable instead of allowing a
  // malformed occupation to look dispatchable.
  if (!reconcileWorldStates(options.initialStates)) {
    reconcileWorldStates([...allAnchors.keys()].map((siteId) => ({
      siteId,
      state: 'unavailable' as const
    })));
  }

  return Object.freeze({
    group,
    reconcileWorldStates,
    setSelectedSiteId: (siteId) => {
      if (disposed) return;
      selectedSiteId = siteId !== null && allAnchors.has(siteId) ? siteId : undefined;
      syncFocusRings();
    },
    setHoveredSiteId: (siteId) => {
      if (disposed) return;
      hoveredSiteId = siteId !== null && allAnchors.has(siteId) ? siteId : undefined;
      syncFocusRings();
    },
    getTelemetry: () => {
      const focusDrawCount = Number(selectedRing.visible) + Number(hoverRing.visible);
      if (
        telemetry.drawNodeCount !== (renderedAnchors.length === 0 ? 0 : 2 + focusDrawCount)
      ) {
        telemetry = Object.freeze({
          ...telemetry,
          drawNodeCount: renderedAnchors.length === 0 ? 0 : 2 + focusDrawCount,
          triangleCount: renderedAnchors.length * (
            REALM_RESOURCE_SITE_WORLD_ACCENT_LIMITS.footprintSegments * 3
            + REALM_RESOURCE_SITE_WORLD_ACCENT_LIMITS.stateRingSegments * 2
          ) + focusDrawCount
            * REALM_RESOURCE_SITE_WORLD_ACCENT_LIMITS.focusRingSegments * 2
        });
      }
      return telemetry;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      let firstError: unknown;
      for (const release of [
        () => footprints.dispose(),
        () => stateRings.dispose(),
        () => footprintGeometry.dispose(),
        () => footprintMaterial.dispose(),
        () => stateGeometry.dispose(),
        () => stateMaterial.dispose(),
        () => focusGeometry.dispose(),
        () => selectedMaterial.dispose(),
        () => hoverMaterial.dispose()
      ]) {
        try {
          release();
        } catch (error) {
          firstError ??= error;
        }
      }
      if (firstError) throw firstError;
    }
  });
}

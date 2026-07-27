import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  REALM_RESOURCE_SITE_WORLD_ACCENT_LIMITS,
  conservativeRealmResourceSiteWorldState,
  createRealmResourceSiteWorldAccents,
  type RealmResourceSiteWorldStateRecord
} from '../src/components/realm/realmResourceSiteWorldAccents';

const SITES = Object.freeze([
  Object.freeze({ siteId: 'gold:1', x: -2.25, y: 0.318, z: 1.5 }),
  Object.freeze({ siteId: 'gold:2', x: 0, y: 0.218, z: -1.75 }),
  Object.freeze({ siteId: 'gold:3', x: 2.5, y: 0.418, z: 0.75 }),
  Object.freeze({ siteId: 'gold:4', x: 4.25, y: 0.118, z: -0.5 })
]);

const INITIAL_STATES: readonly RealmResourceSiteWorldStateRecord[] = Object.freeze([
  Object.freeze({ siteId: 'gold:1', state: 'available' }),
  Object.freeze({ siteId: 'gold:2', state: 'reserved' }),
  Object.freeze({ siteId: 'gold:3', state: 'gathering' }),
  Object.freeze({ siteId: 'gold:4', state: 'unavailable' })
]);

describe('realm resource-site world accents', () => {
  it('maps legacy phases conservatively until unified occupancy is supplied', () => {
    expect(conservativeRealmResourceSiteWorldState({
      availability: 'available',
      hasOccupation: false
    })).toBe('available');
    expect(conservativeRealmResourceSiteWorldState({
      availability: 'outbound',
      hasOccupation: true
    })).toBe('reserved');
    expect(conservativeRealmResourceSiteWorldState({
      availability: 'gathering',
      hasOccupation: true
    })).toBe('gathering');
    expect(conservativeRealmResourceSiteWorldState({
      availability: 'returning',
      hasOccupation: true
    })).toBe('unavailable');
    expect(conservativeRealmResourceSiteWorldState({
      availability: 'available',
      hasOccupation: true
    })).toBe('unavailable');
  });

  it('keeps exact anchors while reconciling four coherent states in place', () => {
    const accents = createRealmResourceSiteWorldAccents({
      resource: 'gold',
      sites: SITES,
      initialStates: INITIAL_STATES,
      dynamicShadows: true
    });
    const footprints = accents.group.getObjectByName(
      'realm-gold-site-ground-footprints'
    ) as THREE.InstancedMesh;
    const stateRings = accents.group.getObjectByName(
      'realm-gold-site-state-rings'
    ) as THREE.InstancedMesh;
    const selected = accents.group.getObjectByName(
      'realm-gold-site-selection-ring'
    ) as THREE.Mesh;
    const hovered = accents.group.getObjectByName(
      'realm-gold-site-hover-ring'
    ) as THREE.Mesh;

    expect(footprints.count).toBe(4);
    expect(stateRings.count).toBe(4);
    expect(accents.getTelemetry()).toMatchObject({
      sourceSiteCount: 4,
      renderedSiteCount: 4,
      availableSiteCount: 1,
      reservedSiteCount: 1,
      gatheringSiteCount: 1,
      unavailableSiteCount: 1,
      drawNodeCount: 2
    });

    const footprintMatrix = new THREE.Matrix4();
    const footprintPosition = new THREE.Vector3();
    footprints.getMatrixAt(0, footprintMatrix);
    footprintMatrix.decompose(
      footprintPosition,
      new THREE.Quaternion(),
      new THREE.Vector3()
    );
    expect(footprintPosition.x).toBeCloseTo(SITES[0]!.x);
    expect(footprintPosition.z).toBeCloseTo(SITES[0]!.z);

    const groupIdentity = accents.group;
    const footprintIdentity = footprints;
    const stateIdentity = stateRings;
    expect(accents.reconcileWorldStates([
      { siteId: 'gold:1', state: 'gathering' },
      { siteId: 'gold:2', state: 'available' },
      { siteId: 'gold:3', state: 'unavailable' },
      { siteId: 'gold:4', state: 'reserved' }
    ])).toBe(true);
    expect(accents.group).toBe(groupIdentity);
    expect(accents.group.getObjectByName(
      'realm-gold-site-ground-footprints'
    )).toBe(footprintIdentity);
    expect(accents.group.getObjectByName(
      'realm-gold-site-state-rings'
    )).toBe(stateIdentity);
    expect(accents.getTelemetry()).toMatchObject({
      availableSiteCount: 1,
      reservedSiteCount: 1,
      gatheringSiteCount: 1,
      unavailableSiteCount: 1
    });

    accents.setSelectedSiteId('gold:2');
    accents.setHoveredSiteId('gold:3');
    expect(selected.visible).toBe(true);
    expect(hovered.visible).toBe(true);
    expect(selected.position.x).toBe(SITES[1]!.x);
    expect(selected.position.z).toBe(SITES[1]!.z);
    expect(hovered.position.x).toBe(SITES[2]!.x);
    expect(hovered.position.z).toBe(SITES[2]!.z);
    expect((selected.material as THREE.MeshBasicMaterial).color.getHex()).not.toBe(
      (hovered.material as THREE.MeshBasicMaterial).color.getHex()
    );
    expect(accents.getTelemetry().drawNodeCount).toBe(4);

    accents.setHoveredSiteId('gold:2');
    expect(selected.visible).toBe(true);
    expect(hovered.visible).toBe(false);
    expect(accents.getTelemetry().drawNodeCount).toBe(3);
    accents.dispose();
  });

  it('rejects malformed state graphs atomically and fails closed on malformed initial input', () => {
    const accents = createRealmResourceSiteWorldAccents({
      resource: 'food',
      sites: SITES,
      initialStates: [
        { siteId: 'gold:1', state: 'available' },
        { siteId: 'gold:1', state: 'available' }
      ],
      dynamicShadows: false
    });
    expect(accents.getTelemetry()).toMatchObject({
      availableSiteCount: 0,
      reservedSiteCount: 0,
      gatheringSiteCount: 0,
      unavailableSiteCount: 4
    });
    const before = accents.getTelemetry();
    expect(accents.reconcileWorldStates([
      { siteId: 'gold:1', state: 'available' },
      { siteId: 'gold:2', state: 'available' },
      { siteId: 'gold:3', state: 'available' },
      { siteId: 'unknown', state: 'available' }
    ])).toBe(false);
    expect(accents.getTelemetry()).toBe(before);
    accents.dispose();
  });

  it('caps decorative instances and releases every owned GPU resource once', () => {
    const sites = Array.from(
      { length: REALM_RESOURCE_SITE_WORLD_ACCENT_LIMITS.maximumRenderedSitesPerResource + 9 },
      (_, index) => ({
        siteId: `stone:${index}`,
        x: index,
        y: 0.1,
        z: -index
      })
    );
    const states = sites.map(({ siteId }) => ({
      siteId,
      state: 'available' as const
    }));
    const meshDispose = vi.spyOn(THREE.InstancedMesh.prototype, 'dispose');
    const accents = createRealmResourceSiteWorldAccents({
      resource: 'stone',
      sites,
      initialStates: states,
      dynamicShadows: false
    });
    const telemetry = accents.getTelemetry();
    expect(telemetry.sourceSiteCount).toBe(sites.length);
    expect(telemetry.renderedSiteCount).toBe(
      REALM_RESOURCE_SITE_WORLD_ACCENT_LIMITS.maximumRenderedSitesPerResource
    );
    expect(telemetry.drawNodeCount).toBeLessThanOrEqual(
      REALM_RESOURCE_SITE_WORLD_ACCENT_LIMITS.maximumDrawNodesPerResource
    );

    accents.dispose();
    accents.dispose();
    expect(meshDispose).toHaveBeenCalledTimes(2);
    expect(accents.group.children).toHaveLength(0);
    meshDispose.mockRestore();
  });
});

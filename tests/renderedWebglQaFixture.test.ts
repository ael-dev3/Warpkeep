import { describe, expect, it } from 'vitest';

import { CANONICAL_CASTLE_SLOTS } from '../spacetimedb/src/world';
import {
  CANONICAL_GENESIS_FOREST_INSTANCES_V1
} from '../spacetimedb/src/forestLayoutPolicy';
import {
  GENESIS_WATER_BODIES_V1,
  GENESIS_WATER_CELLS_V1
} from '../spacetimedb/src/waterWorld';
import {
  CANONICAL_GENESIS_WATER_REVISION_V1
} from '../spacetimedb/src/waterRevision';
import {
  createRenderedWebglQaFixtureRealm,
  createRenderedWebglQaOccupancyStressRealm,
  RENDERED_WEBGL_QA_LONG_DISPLAY_NAME,
  RENDERED_WEBGL_QA_LONG_PUBLIC_BIO,
  RENDERED_WEBGL_QA_OCCUPANT_CASTLE_ID,
  RENDERED_WEBGL_QA_OCCUPANCY_STRESS_COUNT,
  RENDERED_WEBGL_QA_OCCUPIED_GOLD_SITE_ID,
  RENDERED_WEBGL_QA_OVERVIEW_GOLD_SITE_ID,
  RENDERED_WEBGL_QA_OVERVIEW_OCCUPANT_CASTLE_ID,
  renderedWebglQaFixtureSnapshot
} from '../src/dev/renderedWebglQaFixture';
import { REALM_OBSERVER_PORTRAIT_PLACEHOLDER_PATH } from '../src/dev/realmObserverSnapshot';
import { resolveRealmGoldNodePresentations } from '../src/components/realm/realmGoldNodePresentation';
import { resolveRealmFoodNodePresentations } from '../src/components/realm/realmFoodNodePresentation';
import { resolveRealmStoneNodePresentations } from '../src/components/realm/realmStoneNodePresentation';
import { resolveRealmWoodNodePresentations } from '../src/components/realm/realmWoodNodePresentation';
import {
  realmResourceOccupantMarkerKey,
  resolveRealmResourceOccupantMarkers,
  visibleRealmResourceOccupantMarkerKeys,
  visibleRealmResourceOccupantPresenceKeys
} from '../src/components/realm/realmResourceOccupantPresentation';
import { REALM_PROFILE_IMAGE_MAX_CONCURRENT_LOADS } from '../src/components/profile/StaticProfileImageCanvas';
import { publicProfileForCastle } from '../src/components/realm/realmCastlePresentation';
import {
  boundedRenderedWebglQaReadyMilliseconds,
  RENDERED_WEBGL_QA_CASTLE_COUNT,
  RENDERED_WEBGL_QA_DEFAULT_FIXTURE_VARIANT,
  RENDERED_WEBGL_QA_DEFAULT_PRESENTATION_MODE,
  RENDERED_WEBGL_QA_DEFAULT_QUALITY,
  RENDERED_WEBGL_QA_FIXTURE_ID,
  readRenderedWebglQaFixtureVariant,
  readRenderedWebglQaOptions,
  renderedWebglQaRendererForReadyTiming,
  renderedWebglQaStatusForRenderer
} from '../src/dev/renderedWebglQa';

describe('rendered WebGL local QA fixture', () => {
  it('uses every canonical slot with deterministic synthetic-only public presentation', () => {
    const snapshot = renderedWebglQaFixtureSnapshot();

    expect(snapshot.castles).toHaveLength(RENDERED_WEBGL_QA_CASTLE_COUNT);
    expect(snapshot.castles.map((castle) => castle.tileKey))
      .toEqual(CANONICAL_CASTLE_SLOTS.map((slot) => slot.tileKey));
    expect(snapshot.castles.map((castle) => castle.canonicalUsername))
      .toEqual(Array.from({ length: 100 }, (_, index) => (
        `qa-keep-${String(index + 1).padStart(3, '0')}`
      )));
    expect(snapshot.castles.every((castle) => (
      castle.displayName === RENDERED_WEBGL_QA_LONG_DISPLAY_NAME
      && castle.publicBio === RENDERED_WEBGL_QA_LONG_PUBLIC_BIO
    ))).toBe(true);
    expect(snapshot.castles.every((castle) => castle.portraitAvailable === true)).toBe(true);

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toMatch(/(?:https?:|pfp|wallet|token|terms|farcaster|\bfid\b)/i);
    expect(serialized).toContain('Synthetic Keep 001');
    expect(serialized).toContain('Synthetic Keep 100');
  });

  it('adapts one synthetic fixture for both bounded presentation paths', () => {
    const realm = createRenderedWebglQaFixtureRealm();

    expect(realm.snapshot.castles).toHaveLength(RENDERED_WEBGL_QA_CASTLE_COUNT);
    expect(realm.snapshot.profiles).toHaveLength(RENDERED_WEBGL_QA_CASTLE_COUNT);
    expect(realm.snapshot.profiles.every((profile) => (
      profile.pfpUrl === REALM_OBSERVER_PORTRAIT_PLACEHOLDER_PATH
    ))).toBe(true);
    expect(realm.snapshot.profiles.every((profile) => profile.communityStatsVisible === false)).toBe(true);
    expect(realm.snapshot.ownCastle.castleId).toBe(900_000);
    expect(realm.snapshot.forestTrees).toHaveLength(CANONICAL_GENESIS_FOREST_INSTANCES_V1.length);
    expect(realm.snapshot.waterBodies).toHaveLength(GENESIS_WATER_BODIES_V1.length);
    expect(realm.snapshot.waterCells).toHaveLength(GENESIS_WATER_CELLS_V1.length);
    expect(realm.snapshot.waterRevision).toMatchObject({
      ...CANONICAL_GENESIS_WATER_REVISION_V1,
      activated: true
    });
    expect(realm.snapshot.goldNodeOccupations).toEqual([
      {
        siteId: RENDERED_WEBGL_QA_OCCUPIED_GOLD_SITE_ID,
        originCastleId: RENDERED_WEBGL_QA_OCCUPANT_CASTLE_ID,
        phase: 'gathering',
        startedAtMicros: 1_800_000_000_000_000n,
        arrivesAtMicros: 1_800_000_060_000_000n,
        gatheringEndsAtMicros: 1_802_592_060_000_000n,
        returnsAtMicros: 1_802_592_120_000_000n
      },
      {
        siteId: RENDERED_WEBGL_QA_OVERVIEW_GOLD_SITE_ID,
        originCastleId: RENDERED_WEBGL_QA_OVERVIEW_OCCUPANT_CASTLE_ID,
        phase: 'gathering',
        startedAtMicros: 1_800_000_000_000_000n,
        arrivesAtMicros: 1_800_000_060_000_000n,
        gatheringEndsAtMicros: 1_802_592_060_000_000n,
        returnsAtMicros: 1_802_592_120_000_000n
      }
    ]);
    expect(realm.snapshot.profiles.find((profile) => (
      realm.snapshot.castles.find((castle) => (
        castle.castleId === RENDERED_WEBGL_QA_OCCUPANT_CASTLE_ID
      ))?.ownerFid === profile.fid
    ))?.pfpUrl).toBe(REALM_OBSERVER_PORTRAIT_PLACEHOLDER_PATH);

    const serializedSnapshot = JSON.stringify(renderedWebglQaFixtureSnapshot());
    expect(serializedSnapshot).not.toMatch(
      /(?:https?:|pfp|wallet|token|terms|farcaster|\bfid\b)/i
    );

    const goldNodes = resolveRealmGoldNodePresentations({
      sites: realm.snapshot.goldSites,
      occupations: realm.snapshot.goldNodeOccupations,
      castles: realm.snapshot.castles
    });
    const profilesByOwner = new Map(realm.snapshot.profiles.map((profile) => [
      profile.fid,
      profile
    ]));
    const markers = resolveRealmResourceOccupantMarkers({
      buckets: [{ resource: 'gold', nodes: goldNodes }],
      castles: realm.snapshot.castles,
      profiles: new Map(realm.snapshot.castles.map((castle) => [
        castle.castleId,
        { profile: profilesByOwner.get(castle.ownerFid)! }
      ]))
    });
    expect(markers).toHaveLength(2);
    const focusedMarker = markers.find((marker) => (
      realmResourceOccupantMarkerKey(marker)
        === `gold:${RENDERED_WEBGL_QA_OCCUPIED_GOLD_SITE_ID}`
    ));
    expect(focusedMarker).toMatchObject({
      source: 'legacy-expedition',
      workerPhase: 'gathering',
      occupiedByViewer: false,
      castle: {
        castleId: RENDERED_WEBGL_QA_OCCUPANT_CASTLE_ID,
        name: 'Synthetic Keep 002',
        q: 2,
        r: -1
      },
      profile: {
        canonicalUsername: 'qa-keep-002'
      }
    });
    expect(markers.map(realmResourceOccupantMarkerKey)).toContain(
      `gold:${RENDERED_WEBGL_QA_OVERVIEW_GOLD_SITE_ID}`
    );
    const markerPortrait = new URL(focusedMarker!.profile.pfpUrl!, window.location.origin);
    expect(markerPortrait.origin).toBe(window.location.origin);
    expect(markerPortrait.pathname).toBe(REALM_OBSERVER_PORTRAIT_PLACEHOLDER_PATH);

    const publicProfiles = new Map(realm.snapshot.castles.map((castle) => [
      castle.castleId,
      {
        profile: publicProfileForCastle(
          castle.ownerFid,
          realm.snapshot.profiles,
          realm.snapshot.players
        )
      }
    ]));
    const allResourceMarkers = resolveRealmResourceOccupantMarkers({
      buckets: [
        {
          resource: 'gold',
          nodes: resolveRealmGoldNodePresentations({
            sites: realm.snapshot.goldSites,
            occupations: realm.snapshot.goldNodeOccupations,
            castles: realm.snapshot.castles
          })
        },
        {
          resource: 'food',
          nodes: resolveRealmFoodNodePresentations({
            sites: realm.snapshot.foodSites,
            occupations: realm.snapshot.foodNodeOccupations,
            castles: realm.snapshot.castles
          })
        },
        {
          resource: 'wood',
          nodes: resolveRealmWoodNodePresentations({
            sites: realm.snapshot.woodSites,
            occupations: realm.snapshot.woodNodeOccupations,
            castles: realm.snapshot.castles
          })
        },
        {
          resource: 'stone',
          nodes: resolveRealmStoneNodePresentations({
            sites: realm.snapshot.stoneSites,
            occupations: realm.snapshot.stoneNodeOccupations,
            castles: realm.snapshot.castles
          })
        }
      ],
      castles: realm.snapshot.castles,
      profiles: publicProfiles
    });
    expect(allResourceMarkers.map(realmResourceOccupantMarkerKey)).toEqual([
      'food:genesis-001-tier1-food-004',
      'gold:genesis-001-tier1-gold-03',
      'gold:genesis-001-tier1-gold-11',
      'stone:genesis-001-tier1-stone-059',
      'wood:genesis-001-tier1-wood-033'
    ]);
    expect(allResourceMarkers.filter((marker) => (
      !realm.snapshot.tiles.some((tile) => (
        tile.q === marker.nodeCoord.q
        && tile.r === marker.nodeCoord.r
      ))
    )).map(realmResourceOccupantMarkerKey)).toEqual([]);
  });

  it('accepts only reviewed quality and presentation modes and bounds local timing', () => {
    expect(readRenderedWebglQaOptions('?quality=high')).toEqual({
      presentationMode: 'observer',
      quality: 'high'
    });
    expect(readRenderedWebglQaOptions('?quality=balanced&mode=player')).toEqual({
      presentationMode: 'player',
      quality: 'balanced'
    });
    expect(readRenderedWebglQaOptions('?mode=observer&quality=reduced')).toEqual({
      presentationMode: 'observer',
      quality: 'reduced'
    });
    expect(readRenderedWebglQaOptions(
      '?quality=balanced&fixture=occupancy-stress'
    )).toEqual({
      presentationMode: 'observer',
      quality: 'balanced'
    });
    expect(readRenderedWebglQaFixtureVariant(
      '?quality=balanced&fixture=occupancy-stress'
    )).toBe('occupancy-stress');
    expect(readRenderedWebglQaFixtureVariant('?quality=high')).toBe(
      RENDERED_WEBGL_QA_DEFAULT_FIXTURE_VARIANT
    );
    expect(readRenderedWebglQaOptions('?quality=high&host=example.invalid')).toEqual({
      presentationMode: RENDERED_WEBGL_QA_DEFAULT_PRESENTATION_MODE,
      quality: RENDERED_WEBGL_QA_DEFAULT_QUALITY
    });
    expect(readRenderedWebglQaOptions('?quality=unsafe')).toEqual({
      presentationMode: RENDERED_WEBGL_QA_DEFAULT_PRESENTATION_MODE,
      quality: RENDERED_WEBGL_QA_DEFAULT_QUALITY
    });
    expect(readRenderedWebglQaOptions('?quality=high&mode=unsafe')).toEqual({
      presentationMode: RENDERED_WEBGL_QA_DEFAULT_PRESENTATION_MODE,
      quality: RENDERED_WEBGL_QA_DEFAULT_QUALITY
    });
    expect(readRenderedWebglQaFixtureVariant(
      '?quality=high&fixture=occupancy-stress&host=example.invalid'
    )).toBe(RENDERED_WEBGL_QA_DEFAULT_FIXTURE_VARIANT);
    expect(readRenderedWebglQaFixtureVariant(
      '?quality=high&fixture=unknown'
    )).toBe(RENDERED_WEBGL_QA_DEFAULT_FIXTURE_VARIANT);
    expect(readRenderedWebglQaOptions('?quality=high&quality=reduced')).toEqual({
      presentationMode: RENDERED_WEBGL_QA_DEFAULT_PRESENTATION_MODE,
      quality: RENDERED_WEBGL_QA_DEFAULT_QUALITY
    });
    expect(boundedRenderedWebglQaReadyMilliseconds(100, 1_700)).toBe(1_600);
    expect(boundedRenderedWebglQaReadyMilliseconds(100, 120_101)).toBeUndefined();
    expect(renderedWebglQaRendererForReadyTiming('webgl', 1_600)).toBe('webgl');
    expect(renderedWebglQaRendererForReadyTiming('webgl', undefined)).toBe('error');
    expect(renderedWebglQaRendererForReadyTiming('fallback', undefined)).toBe('fallback');
    expect(renderedWebglQaStatusForRenderer('webgl')).toBe('ready');
    expect(renderedWebglQaStatusForRenderer('fallback')).toBe('fallback');
    expect(RENDERED_WEBGL_QA_FIXTURE_ID).toBe('synthetic-canonical-100');
  });

  it('bounds a local-only all-node occupation stress projection to every presence and 24 controls', () => {
    const realm = createRenderedWebglQaOccupancyStressRealm();
    const castleRows = realm.snapshot.castles;
    const profilesByOwner = new Map(realm.snapshot.profiles.map((profile) => [
      profile.fid,
      profile
    ]));
    const profileRecords = new Map(castleRows.map((castle) => [
      castle.castleId,
      { profile: profilesByOwner.get(castle.ownerFid)! }
    ]));
    const presentationInput = {
      castles: castleRows,
      ownCastleId: realm.snapshot.ownCastle.castleId
    };
    const markers = resolveRealmResourceOccupantMarkers({
      buckets: [
        {
          resource: 'gold',
          nodes: resolveRealmGoldNodePresentations({
            ...presentationInput,
            sites: realm.snapshot.goldSites,
            occupations: realm.snapshot.goldNodeOccupations
          })
        },
        {
          resource: 'food',
          nodes: resolveRealmFoodNodePresentations({
            ...presentationInput,
            sites: realm.snapshot.foodSites,
            occupations: realm.snapshot.foodNodeOccupations
          })
        },
        {
          resource: 'wood',
          nodes: resolveRealmWoodNodePresentations({
            ...presentationInput,
            sites: realm.snapshot.woodSites,
            occupations: realm.snapshot.woodNodeOccupations
          })
        },
        {
          resource: 'stone',
          nodes: resolveRealmStoneNodePresentations({
            ...presentationInput,
            sites: realm.snapshot.stoneSites,
            occupations: realm.snapshot.stoneNodeOccupations
          })
        }
      ],
      castles: castleRows,
      profiles: profileRecords,
      ownCastleId: realm.snapshot.ownCastle.castleId
    });
    expect(markers).toHaveLength(RENDERED_WEBGL_QA_OCCUPANCY_STRESS_COUNT);
    expect(new Set(markers.map(realmResourceOccupantMarkerKey)).size)
      .toBe(RENDERED_WEBGL_QA_OCCUPANCY_STRESS_COUNT);
    expect(new Set(markers.map((marker) => marker.workerPhase))).toEqual(
      new Set(['outbound', 'gathering', 'returning'])
    );
    expect(markers.every((marker) => marker.source === 'legacy-expedition')).toBe(true);

    const frame = {
      width: 1_300,
      height: 760,
      markers: markers.map((marker, index) => ({
        resource: marker.resource,
        siteId: marker.siteId,
        x: 26 + (index % 26) * 48,
        y: 48 + Math.floor(index / 26) * 56,
        depth: index,
        visible: true
      }))
    };
    const authoritativeKeys = new Set(markers.map(realmResourceOccupantMarkerKey));
    const passivePresenceKeys = visibleRealmResourceOccupantPresenceKeys(
      frame,
      authoritativeKeys
    );
    const controlKeys = visibleRealmResourceOccupantMarkerKeys(
      frame,
      authoritativeKeys,
      []
    );
    expect(passivePresenceKeys).toHaveLength(RENDERED_WEBGL_QA_OCCUPANCY_STRESS_COUNT);
    expect(new Set(passivePresenceKeys)).toEqual(authoritativeKeys);
    expect(controlKeys).toHaveLength(24);
    expect(controlKeys.every((key) => authoritativeKeys.has(key))).toBe(true);
    expect(REALM_PROFILE_IMAGE_MAX_CONCURRENT_LOADS).toBe(4);
  });
});

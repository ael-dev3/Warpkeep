const REGIONS = new Set(['overview', 'transition', 'deep', 'water-edge']);
const RELIEF = Object.freeze({
  high: 'two-band',
  balanced: 'one-band',
  reduced: 'none',
});
const BYTE_LIMIT = Object.freeze({
  high: 0.5 * 1_024 * 1_024,
  balanced: 0.35 * 1_024 * 1_024,
  reduced: 0.25 * 1_024 * 1_024,
});
const TRANSITION_MINIMUM_FRAME_SAND_SAMPLES = 64;
const TRANSITION_MINIMUM_COMPOSED_SAND_SAMPLES = 1;
const DEEP_MINIMUM_FRAME_SAND_SAMPLES = 64;
const DEEP_MINIMUM_COMPOSED_SAND_SAMPLES = 4;
// A deep-south frame intentionally retains ocean along its outer edge. Demand
// a clear warm majority without making one antialiased sample decide the lane.
const DEEP_MINIMUM_SAND_DOMINANCE_SAMPLES = 24;
const WATER_EDGE_MINIMUM_FRAME_SAND_SAMPLES = 8;
const OVERVIEW_MINIMUM_CLIMATE_SAMPLES = 3;
const OVERVIEW_MINIMUM_SPATIAL_DIFFERENCE = 6;
const MAXIMUM_CLIPPED_BLACK_SAMPLES = 1;

export const SUNSCOURED_SOUTH_RENDERED_TARGET_MANIFEST = Object.freeze({
  transition: Object.freeze({
    q: 24,
    r: 32,
    expectedCoverage: 0.5393086022906172,
    expectedTerrainKind: 'heath',
    expectedPassable: true,
    expectedStaticContentKind: 'empty',
    expectedWater: false,
    neighborResource: Object.freeze({
      kind: 'food',
      siteId: 'genesis-001-tier1-food-077',
      q: 25,
      r: 32,
    }),
  }),
  deep: Object.freeze({
    q: -43,
    r: 48,
    expectedCoverage: 0.9793524620332346,
    expectedTerrainKind: 'meadow',
    expectedPassable: true,
    expectedStaticContentKind: 'empty',
    expectedWater: false,
    neighborResource: Object.freeze({
      kind: 'food',
      siteId: 'genesis-001-tier1-food-045',
      q: -43,
      r: 47,
    }),
  }),
  'water-edge': Object.freeze({
    q: -36,
    r: 35,
    expectedCoverage: 0.7027061415048433,
    expectedTerrainKind: 'meadow',
    expectedPassable: true,
    expectedStaticContentKind: 'empty',
    expectedWater: false,
    neighborWater: Object.freeze({
      bodyId: 'genesis-001-canonical-water-v1:river:genesis-001-river-06',
      cellKey: '-35,35',
      q: -35,
      r: 35,
      regime: 'river',
    }),
  }),
});

function hexDistance(first, second) {
  const q = first.q - second.q;
  const r = first.r - second.r;
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
}

export function assertSunscouredSouthRenderedTarget(target, observation) {
  const invalid = () => new TypeError(
    'Invalid Sunscoured South rendered target.'
  );
  const resource = target?.neighborResource;
  const water = target?.neighborWater;
  const neighbor = resource ?? water;
  if (
    !target || typeof target !== 'object' || Array.isArray(target)
    || !Number.isSafeInteger(target.q) || !Number.isSafeInteger(target.r)
    || !Number.isFinite(target.expectedCoverage)
    || typeof target.expectedTerrainKind !== 'string'
    || target.expectedPassable !== true
    || target.expectedStaticContentKind !== 'empty'
    || target.expectedWater !== false
    || (resource === undefined) === (water === undefined)
    || !neighbor || typeof neighbor !== 'object' || Array.isArray(neighbor)
    || !Number.isSafeInteger(neighbor.q) || !Number.isSafeInteger(neighbor.r)
    || observation?.coverage !== target.expectedCoverage
    || observation?.terrainKind !== target.expectedTerrainKind
    || observation?.passable !== target.expectedPassable
    || observation?.staticContentKind !== target.expectedStaticContentKind
    || observation?.water !== target.expectedWater
    || hexDistance(target, neighbor) !== 1
  ) throw invalid();
  if (resource) {
    if (
      resource.kind !== 'food'
      || typeof resource.siteId !== 'string' || resource.siteId.length === 0
      || observation.resourceKind !== resource.kind
      || observation.resourceSiteId !== resource.siteId
      || observation.resourceQ !== resource.q
      || observation.resourceR !== resource.r
      || observation.resourceTier !== 1
      || observation.resourceActive !== true
    ) throw invalid();
    return;
  }
  if (
    typeof water.bodyId !== 'string' || water.bodyId.length === 0
    || typeof water.cellKey !== 'string' || water.cellKey.length === 0
    || water.regime !== 'river'
    || observation.waterBodyId !== water.bodyId
    || observation.waterCellKey !== water.cellKey
    || observation.waterQ !== water.q
    || observation.waterR !== water.r
    || observation.waterRegime !== water.regime
  ) throw invalid();
}

export function parseRegionalClimateRenderedEvidence(value, expected) {
  const invalid = () => new TypeError(
    'Invalid Sunscoured South rendered evidence.'
  );
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const keys = [
    'band',
    'climate',
    'compositionBucket',
    'coverage',
    'material',
    'quality',
    'recovered',
    'recoveryExercised',
    'region',
    'retained',
    'selected',
    'separation',
    'stable',
    'vertices',
  ].sort();
  const actual = Object.keys(value).sort();
  const [
    climateCount,
    deep,
    playableRatio,
    deepRatio,
    innerLeaks,
    northernLeaks,
  ] = value.coverage ?? [];
  const [
    sampledCellCenters,
    retainedCellCenters,
    retainedDeepCellCenters,
    retainedRatio,
    retainedDeepRatio,
    retainedMean,
    retainedInnerLeaks,
    retainedNorthernLeaks,
    retainedSouthernmostMean,
  ] = value.retained ?? [];
  const [minimum, maximum, mean, bytes] = value.vertices ?? [];
  const [revision, relief, enhanced, fallback] = value.material ?? [];
  const [overlapCells, overlapVertices] = value.separation ?? [];
  const quality = expected?.quality;
  const recover = expected?.recover;
  const region = expected?.region;
  const shaderFallback = expected?.shaderFallback ?? false;
  const band = region === 'overview'
    ? 'overview'
    : region === 'transition' || expected?.viewport?.width <= 480
      ? 'strategy'
      : 'close';
  if (
    actual.length !== keys.length
    || actual.some((key, index) => key !== keys[index])
    || value.climate !== 'south'
    || !Object.hasOwn(RELIEF, quality)
    || !REGIONS.has(region)
    || typeof recover !== 'boolean'
    || typeof shaderFallback !== 'boolean'
    || (recover && region !== 'deep')
    || !Number.isSafeInteger(expected?.viewport?.width)
    || !Number.isSafeInteger(expected?.viewport?.height)
    || value.quality !== quality
    || value.region !== region
    || value.band !== band
    || !Number.isSafeInteger(value.compositionBucket)
    || value.compositionBucket < 0
    || value.compositionBucket > 8
    || value.selected !== true
    || value.stable !== true
    || value.recoveryExercised !== recover
    || value.recovered !== recover
    || !Array.isArray(value.coverage)
    || value.coverage.length !== 6
    || !Number.isSafeInteger(climateCount)
    || !Number.isSafeInteger(deep)
    || climateCount < 1
    || deep < 1
    || deep > climateCount
    || ![playableRatio, deepRatio, minimum, maximum, mean].every(Number.isFinite)
    || playableRatio < 0.22
    || playableRatio > 0.30
    || deepRatio < 0.09
    || deepRatio > 0.15
    || innerLeaks !== 0
    || northernLeaks !== 0
    || !Array.isArray(value.retained)
    || value.retained.length !== 9
    || sampledCellCenters !== 9_600
    || retainedCellCenters !== climateCount
    || retainedDeepCellCenters !== deep
    || retainedRatio !== playableRatio
    || retainedDeepRatio !== deepRatio
    || !Number.isSafeInteger(retainedCellCenters)
    || !Number.isSafeInteger(retainedDeepCellCenters)
    || ![
      retainedRatio,
      retainedDeepRatio,
      retainedMean,
      retainedSouthernmostMean,
    ].every(Number.isFinite)
    || retainedRatio !== retainedCellCenters / sampledCellCenters
    || retainedDeepRatio !== retainedDeepCellCenters / sampledCellCenters
    || retainedMean <= 0
    || retainedMean >= 0.5
    || retainedInnerLeaks !== 0
    || retainedNorthernLeaks !== 0
    || retainedSouthernmostMean <= 0.75
    || retainedSouthernmostMean > 1
    || !Array.isArray(value.vertices)
    || value.vertices.length !== 4
    || minimum < 0
    || maximum > 1
    || maximum <= 0.75
    || mean <= 0
    || !Number.isSafeInteger(bytes)
    || bytes < 1
    || bytes > BYTE_LIMIT[quality]
    || !Array.isArray(value.material)
    || value.material.length !== 4
    || revision !== 'genesis-001-southern-desert-presentation-v1'
    || relief !== RELIEF[quality]
    || enhanced !== !shaderFallback
    || fallback !== shaderFallback
    || !Array.isArray(value.separation)
    || value.separation.length !== 2
    || overlapCells !== 0
    || overlapVertices !== 0
  ) throw invalid();
  return Object.freeze({ ...value });
}

function exactSpatialAggregate(value, total) {
  return Array.isArray(value)
    && value.length === 9
    && value.every((entry) => Number.isSafeInteger(entry) && entry >= 0)
    && value.reduce((sum, entry) => sum + entry, 0) === total;
}

export function assertRegionalClimateRenderedVisual(evidence, visual) {
  const cool = visual?.coolHighAlbedoSamples;
  const warm = visual?.warmLowGreenSamples;
  const targetComposedSand = visual?.warmSpatialBuckets?.[
    evidence?.compositionBucket
  ];
  const spatialDifference = Array.isArray(visual?.coolSpatialBuckets)
    && Array.isArray(visual?.warmSpatialBuckets)
    ? visual.coolSpatialBuckets.reduce(
      (sum, entry, index) => (
        sum + Math.abs(entry - visual.warmSpatialBuckets[index])
      ),
      0
    )
    : 0;
  if (
    !visual || typeof visual !== 'object'
    || !Number.isSafeInteger(cool)
    || !Number.isSafeInteger(warm)
    || !Number.isSafeInteger(targetComposedSand)
    || !exactSpatialAggregate(visual.coolSpatialBuckets, cool)
    || !exactSpatialAggregate(visual.warmSpatialBuckets, warm)
    || (evidence?.region === 'overview' && (
      cool < OVERVIEW_MINIMUM_CLIMATE_SAMPLES
      || warm < OVERVIEW_MINIMUM_CLIMATE_SAMPLES
      || spatialDifference < OVERVIEW_MINIMUM_SPATIAL_DIFFERENCE
    ))
    || (evidence?.region === 'transition' && (
      warm < TRANSITION_MINIMUM_FRAME_SAND_SAMPLES
      || warm * 2 < cool
      || targetComposedSand < TRANSITION_MINIMUM_COMPOSED_SAND_SAMPLES
    ))
    || (evidence?.region === 'deep' && (
      warm < DEEP_MINIMUM_FRAME_SAND_SAMPLES
      || warm - cool < DEEP_MINIMUM_SAND_DOMINANCE_SAMPLES
      || targetComposedSand < DEEP_MINIMUM_COMPOSED_SAND_SAMPLES
    ))
    || (evidence?.region === 'water-edge' && (
      warm < WATER_EDGE_MINIMUM_FRAME_SAND_SAMPLES
      || targetComposedSand < TRANSITION_MINIMUM_COMPOSED_SAND_SAMPLES
    ))
    || !Number.isSafeInteger(visual.clippedBlackSamples)
    || visual.clippedBlackSamples < 0
    || visual.clippedBlackSamples > MAXIMUM_CLIPPED_BLACK_SAMPLES
    || visual.clippedWhiteSamples !== 0
    || visual.hotYellowSamples !== 0
  ) {
    throw new TypeError('Invalid Sunscoured South visual aggregate.');
  }
}

function numericArrayNear(first, second, tolerance) {
  return Array.isArray(first)
    && Array.isArray(second)
    && first.length === second.length
    && first.every((entry, index) => (
      Number.isFinite(entry)
      && Number.isFinite(second[index])
      && Math.abs(entry - second[index]) <= tolerance
    ));
}

export function assertRegionalClimateRepeatedReducedMotionEvidence(
  first,
  repeated
) {
  const invalid = () => new TypeError(
    'Invalid Sunscoured South repeated reduced-motion evidence.'
  );
  const firstEvidence = first?.evidence;
  const repeatedEvidence = repeated?.evidence;
  const firstVisual = first?.visual;
  const repeatedVisual = repeated?.visual;
  const discreteEvidenceKeys = [
    'band',
    'climate',
    'compositionBucket',
    'material',
    'quality',
    'recovered',
    'recoveryExercised',
    'region',
    'selected',
    'separation',
    'stable',
  ];
  if (
    !first || typeof first !== 'object' || Array.isArray(first)
    || !repeated || typeof repeated !== 'object' || Array.isArray(repeated)
    || !firstEvidence || !repeatedEvidence
    || discreteEvidenceKeys.some((key) => (
      JSON.stringify(firstEvidence[key]) !== JSON.stringify(repeatedEvidence[key])
    ))
    || !numericArrayNear(firstEvidence.coverage, repeatedEvidence.coverage, 0.000_001)
    || !numericArrayNear(firstEvidence.retained, repeatedEvidence.retained, 0.000_001)
    || !numericArrayNear(firstEvidence.vertices, repeatedEvidence.vertices, 0.000_001)
    || JSON.stringify(first.signature) !== JSON.stringify(repeated.signature)
    || !firstVisual || !repeatedVisual
    || ![
      firstVisual.clippedBlackSamples,
      repeatedVisual.clippedBlackSamples,
      firstVisual.clippedWhiteSamples,
      repeatedVisual.clippedWhiteSamples,
      firstVisual.hotYellowSamples,
      repeatedVisual.hotYellowSamples,
      firstVisual.warmLowGreenSamples,
      repeatedVisual.warmLowGreenSamples,
      firstVisual.coolHighAlbedoSamples,
      repeatedVisual.coolHighAlbedoSamples,
    ].every(Number.isSafeInteger)
    || firstVisual.clippedBlackSamples !== repeatedVisual.clippedBlackSamples
    || firstVisual.clippedWhiteSamples !== repeatedVisual.clippedWhiteSamples
    || firstVisual.hotYellowSamples !== repeatedVisual.hotYellowSamples
    || Math.abs(
      firstVisual.warmLowGreenSamples - repeatedVisual.warmLowGreenSamples
    ) > 2
    || Math.abs(
      firstVisual.coolHighAlbedoSamples - repeatedVisual.coolHighAlbedoSamples
    ) > 2
    || !numericArrayNear(
      firstVisual.warmSpatialBuckets,
      repeatedVisual.warmSpatialBuckets,
      1
    )
    || !numericArrayNear(
      firstVisual.coolSpatialBuckets,
      repeatedVisual.coolSpatialBuckets,
      1
    )
  ) throw invalid();
}

export async function applyRegionalClimateRenderedEvidence(session, options) {
  const {
    quality,
    recover = false,
    region,
    shaderFallback = false,
    viewport,
  } = options ?? {};
  if (
    !session || typeof session.command !== 'function'
    || !Object.hasOwn(RELIEF, quality)
    || !REGIONS.has(region)
    || typeof recover !== 'boolean'
    || typeof shaderFallback !== 'boolean'
    || (recover && region !== 'deep')
    || !Number.isSafeInteger(viewport?.width)
    || !Number.isSafeInteger(viewport?.height)
  ) {
    throw new TypeError('Invalid Sunscoured South rendered journey.');
  }
  const renderedTargets = JSON.stringify(
    SUNSCOURED_SOUTH_RENDERED_TARGET_MANIFEST
  );
  const assertRenderedTarget =
    assertSunscouredSouthRenderedTarget.toString();
  const targetHexDistance = hexDistance.toString();
  const result = await session.command('Runtime.evaluate', {
    expression: `(async () => {
      const region=${JSON.stringify(region)}, recover=${recover};
      const viewport=${JSON.stringify(viewport)};
      const targets=${renderedTargets};
      const hexDistance=${targetHexDistance};
      const assertTarget=${assertRenderedTarget};
      const wait=async(fn,ms=30000)=>{const end=performance.now()+ms;
        while(performance.now()<=end){if(fn())return true;
          await new Promise(resolve=>setTimeout(resolve,32));}return false;};
      const root=document.querySelector('.realm-map-screen');
      const overlay=document.querySelector('[data-rendered-webgl-status]');
      const canvas=()=>root?.querySelector('canvas[data-realm-canvas-active="true"]');
      const trigger=document.querySelector('.realm-cell-navigator > button');
      const initialCameraStateToken=canvas()?.dataset.realmCameraStateToken;
      if(!(root instanceof HTMLElement)||!(overlay instanceof HTMLElement)
        ||!(trigger instanceof HTMLButtonElement)||trigger.disabled
        ||!/^[0-9a-f]{24}$/.test(initialCameraStateToken??'')
        ||innerWidth!==viewport.width||innerHeight!==viewport.height)return null;
      trigger.click();
      if(!await wait(()=>document.querySelector('.realm-cell-navigator__dialog')
        instanceof HTMLElement,5000))return null;
      let selected=region==='overview';
      if(region==='overview'){
        const button=[...document.querySelectorAll('.realm-cell-navigator__presets button')]
          .find(entry=>(entry.textContent??'').trim()==='Realm');
        if(!(button instanceof HTMLButtonElement))return null;button.click();
      }else{
        const [{CANONICAL_REALM,canonicalMetaForKey},
          {GENESIS_WATER_REVISION_ENABLED_CELLS_V1},
          {createRealmSouthernDesertField},
          {CANONICAL_TIER_I_FOOD_SITES_V1}]
          =await Promise.all([import('/spacetimedb/src/world.ts'),
            import('/spacetimedb/src/waterRevision.ts'),
            import('/src/game/map/realmSouthernDesert.ts'),
            import('/spacetimedb/src/foodSitePolicy.ts')]);
        const water=new Map(
          GENESIS_WATER_REVISION_ENABLED_CELLS_V1.map(row=>[row.cellKey,row])
        );
        const field=createRealmSouthernDesertField({
          worldSeed:CANONICAL_REALM.numericSeed,hexSize:1,
          playableRadius:CANONICAL_REALM.authoritativeRadius,
          renderRadius:CANONICAL_REALM.renderRadius});
        const target=targets[region];
        const targetKey=target?target.q+','+target.r:'';
        const metadata=canonicalMetaForKey(targetKey);
        const resource=target?.neighborResource
          ?CANONICAL_TIER_I_FOOD_SITES_V1.find(
            row=>row.siteId===target.neighborResource.siteId):undefined;
        const waterNeighbor=target?.neighborWater
          ?water.get(target.neighborWater.cellKey):undefined;
        try{
          assertTarget(target,{
            coverage:field.sampleCoord(target).sand,
            terrainKind:metadata?.terrainKind,
            passable:metadata?.passable,
            staticContentKind:metadata?.staticContentKind,
            water:water.has(targetKey),
            resourceKind:target?.neighborResource?.kind,
            resourceSiteId:resource?.siteId,
            resourceQ:resource?.q,
            resourceR:resource?.r,
            resourceTier:resource?.tier,
            resourceActive:resource?.active,
            waterBodyId:waterNeighbor?.bodyId,
            waterCellKey:waterNeighbor?.cellKey,
            waterQ:waterNeighbor?.q,
            waterR:waterNeighbor?.r,
            waterRegime:waterNeighbor?.regime});
        }catch{return null;}
        const form=document.querySelector('.realm-cell-navigator__jump');
        const inputs=form?.querySelectorAll('input');
        const setter=Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,'value')?.set;
        if(!target||!(form instanceof HTMLFormElement)
          ||inputs?.length!==2||!setter)return null;
        for(const [input,value] of [[inputs[0],target.q],[inputs[1],target.r]]){
          setter.call(input,String(value));
          input.dispatchEvent(new Event('input',{bubbles:true}));
        }
        await new Promise(resolve=>requestAnimationFrame(resolve));
        form.requestSubmit();selected=true;
      }
      if(!await wait(()=>document.querySelector('.realm-cell-navigator__dialog')===null
        &&root.dataset.rendererState==='ready'
        &&canvas()?.dataset.realmCameraSettled==='true'
        &&canvas()?.dataset.realmCameraStateToken!==initialCameraStateToken
        &&(region==='overview'?root.dataset.realmCameraTargetKind==='realm'
          :root.dataset.realmCameraTargetKind==='cell-location'),5000))return null;
      const targetBand=region==='overview'?'overview'
        :region==='transition'||viewport.width<=480?'strategy':'close';
      for(let step=0;step<12
        &&root.dataset.realmCameraPresentationBand!==targetBand;step++){
        canvas()?.dispatchEvent(new WheelEvent('wheel',{
          bubbles:true,cancelable:true,deltaY:-250,
          clientX:viewport.width/2,clientY:viewport.height/2}));
        await new Promise(resolve=>setTimeout(resolve,64));
        await wait(()=>canvas()?.dataset.realmCameraSettled==='true',5000);
      }
      const selectedTargetKey=region==='overview'
        ?'':targets[region].q+','+targets[region].r;
      if(region!=='overview'
        &&root.dataset.realmSelectedCellKey!==selectedTargetKey)return null;
      const signature=()=>[
        root.dataset.southernDesertFieldRevision,
        root.dataset.sandAttributeBytes,
        root.dataset.snowFieldRevision,
        root.dataset.snowAttributeBytes,
        root.dataset.terrainTriangleCount,
        root.dataset.waterLayoutVersion,
        root.dataset.grassDrawCalls,
        root.dataset.forestDecorativeDrawCalls,
        root.dataset.sharedForestTreeCount
      ].join('|');
      const cameraToken=()=>canvas()?.dataset.realmCameraStateToken??'';
      const before=signature(),beforeCameraToken=cameraToken();
      let recovered=false;
      if(!/^[0-9a-f]{24}$/.test(beforeCameraToken))return null;
      if(recover){
        const generation=Number(root.dataset.rendererGeneration);
        const context=canvas()?.getContext('webgl2')??canvas()?.getContext('webgl');
        const controller=context?.getExtension('WEBGL_lose_context');
        if(!controller)return null;
        controller.loseContext();
        const recovering=await wait(()=>root.dataset.rendererState==='recovering'
          &&root.dataset.rendererFailure==='context-lost');
        if(recovering){
          await new Promise(resolve=>setTimeout(resolve,64));
          controller.restoreContext();
        }
        recovered=recovering&&await wait(()=>root.dataset.rendererState==='ready'
          &&root.dataset.rendererFailure==='none'
          &&Number(root.dataset.rendererGeneration)>generation
          &&canvas()?.dataset.realmCameraSettled==='true'
          &&signature()===before&&cameraToken()===beforeCameraToken
          &&root.dataset.realmSelectedCellKey===selectedTargetKey);
      }
      const number=name=>Number(root.dataset[name]);
      const activeCanvas=canvas();
      const safeCenterX=Number(activeCanvas?.dataset.realmCameraSafeCenterX);
      const safeCenterY=Number(activeCanvas?.dataset.realmCameraSafeCenterY);
      const bucket=(value,size,start,span)=>Math.min(2,Math.max(0,
        Math.floor((((value/size)-start)/span)*3)));
      if(!Number.isFinite(safeCenterX)
        ||!Number.isFinite(safeCenterY))return null;
      const compositionBucket=bucket(
        safeCenterY,viewport.height,0.16,0.68)*3
        +bucket(safeCenterX,viewport.width,0.12,0.76);
      return {
        band:root.dataset.realmCameraPresentationBand,
        climate:'south',
        compositionBucket,
        coverage:[
          number('desertClimateCellCountAbove015'),
          number('desertDeepCellCountAbove075'),
          number('desertPlayableCoverageRatio'),
          number('desertDeepCoverageRatio'),
          number('desertInnerRadiusLeakCount'),
          number('desertNorthernLeakCount')],
        material:[
          root.dataset.southernDesertFieldRevision,
          root.dataset.sandFineReliefMode,
          root.dataset.sandShaderEnhanced==='true',
          root.dataset.sandShaderFallbackActive==='true'],
        quality:overlay.dataset.quality,
        recovered,
        recoveryExercised:recover,
        region,
        retained:[
          number('desertSampledPlayableLandCellCenterCount'),
          number('desertClimateCellCountAbove015'),
          number('desertDeepCellCountAbove075'),
          number('desertPlayableCoverageRatio'),
          number('desertDeepCoverageRatio'),
          number('desertCellCenterCoverageMean'),
          number('desertInnerRadiusLeakCount'),
          number('desertNorthernLeakCount'),
          number('desertSouthernmostRowCoverageMean')],
        selected,
        separation:[
          number('sandSnowOverlapCellCount'),
          number('sandSnowOverlapVertexCount')],
        stable:root.dataset.renderer==='webgl'
          &&root.dataset.rendererState==='ready'
          &&root.dataset.rendererFailure==='none'
          &&canvas()?.dataset.realmCameraSettled==='true',
        vertices:[
          number('sandVertexCoverageMin'),
          number('sandVertexCoverageMax'),
          number('sandVertexCoverageMean'),
          number('sandAttributeBytes')]
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  }, recover ? 40_000 : 10_000);
  if (result?.exceptionDetails || result?.result?.type !== 'object') {
    throw new Error('Sunscoured South rendered observation failed.');
  }
  if (process.env.WARPKEEP_QA_LOCAL_DIAGNOSTICS === '1') {
    process.stderr.write(
      `Local synthetic South raw aggregate: ${
        JSON.stringify(result.result.value)
      }\n`
    );
  }
  return parseRegionalClimateRenderedEvidence(result.result.value, {
    quality,
    recover,
    region,
    shaderFallback,
    viewport,
  });
}

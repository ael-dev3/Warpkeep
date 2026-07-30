const REGIONS = new Set(['overview', 'transition', 'deep']);
const RELIEF = Object.freeze({ high: 'two-band', balanced: 'one-band', reduced: 'none' });
const BYTE_LIMIT = Object.freeze({
  high: 0.5 * 1_024 * 1_024,
  balanced: 0.35 * 1_024 * 1_024,
  reduced: 0.25 * 1_024 * 1_024,
});
const TARGET_CENTER_BUCKET_INDEX = 4;
const TARGET_MINIMUM_SNOW_SAMPLES = 1;
const TARGET_MINIMUM_FRAME_SNOW_SAMPLES = 8;
const OVERVIEW_MINIMUM_SNOW_SAMPLES = 8;

export const NORTHERN_REACH_RENDERED_TARGET_MANIFEST = Object.freeze({
  transition: Object.freeze({
    q: -13,
    r: -36,
    expectedCoverage: 0.5972293087793965,
    expectedTerrainKind: 'heath',
    expectedPassable: true,
    expectedWater: false,
    neighborResource: Object.freeze({
      kind: 'stone',
      siteId: 'genesis-001-tier1-stone-043',
      q: -13,
      r: -35,
    }),
  }),
  deep: Object.freeze({
    q: -3,
    r: -38,
    expectedCoverage: 0.7696110263652703,
    expectedTerrainKind: 'forest',
    expectedPassable: true,
    expectedWater: false,
    neighborResource: Object.freeze({
      kind: 'food',
      siteId: 'genesis-001-tier1-food-044',
      q: -4,
      r: -38,
    }),
  }),
});

export function assertNorthernReachRenderedTarget(target, observation) {
  const invalid = () => new TypeError('Invalid Northern Reach rendered target.');
  const resource = target?.neighborResource;
  const qDistance = observation?.resourceQ - target?.q;
  const rDistance = observation?.resourceR - target?.r;
  const hexDistance = Math.max(
    Math.abs(qDistance),
    Math.abs(rDistance),
    Math.abs(-qDistance - rDistance),
  );
  if (
    !target || typeof target !== 'object' || Array.isArray(target)
    || !Number.isSafeInteger(target.q) || !Number.isSafeInteger(target.r)
    || !Number.isFinite(target.expectedCoverage)
    || typeof target.expectedTerrainKind !== 'string'
    || target.expectedPassable !== true || target.expectedWater !== false
    || !resource || typeof resource !== 'object' || Array.isArray(resource)
    || (resource.kind !== 'stone' && resource.kind !== 'food')
    || typeof resource.siteId !== 'string' || resource.siteId.length === 0
    || !Number.isSafeInteger(resource.q) || !Number.isSafeInteger(resource.r)
    || !observation || typeof observation !== 'object' || Array.isArray(observation)
    || observation.coverage !== target.expectedCoverage
    || observation.terrainKind !== target.expectedTerrainKind
    || observation.passable !== target.expectedPassable
    || observation.water !== target.expectedWater
    || observation.resourceKind !== resource.kind
    || observation.resourceSiteId !== resource.siteId
    || observation.resourceQ !== resource.q || observation.resourceR !== resource.r
    || observation.resourceTier !== 1 || observation.resourceActive !== true
    || hexDistance !== 1
  ) throw invalid();
}

export function parseNorthernReachRenderedEvidence(value, expected) {
  const invalid = () => new TypeError('Invalid Northern Reach rendered evidence.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const keys = ['band', 'coverage', 'material', 'quality', 'recovered',
    'recoveryExercised', 'region', 'retained', 'selected', 'stable',
    'vertices'].sort();
  const actual = Object.keys(value).sort();
  const [climate, deep, playableRatio, deepRatio, innerLeaks, southernLeaks]
    = value.coverage ?? [];
  const [
    sampledCellCenters,
    retainedCellCenters,
    retainedDeepCellCenters,
    retainedRatio,
    retainedDeepRatio,
    retainedMean,
    retainedInnerLeaks,
    retainedSouthernLeaks,
    retainedNorthernmostMean,
  ] = value.retained ?? [];
  const [minimum, maximum, mean, bytes] = value.vertices ?? [];
  const [revision, relief, enhanced, fallback] = value.material ?? [];
  const quality = expected?.quality;
  const recover = expected?.recover;
  const region = expected?.region;
  const band = region === 'overview' ? 'overview'
    : region === 'transition' || expected?.viewport?.width <= 480
      ? 'strategy'
      : 'close';
  if (
    actual.length !== keys.length || actual.some((key, index) => key !== keys[index])
    || !Object.hasOwn(RELIEF, quality) || !REGIONS.has(region)
    || typeof recover !== 'boolean'
    || !Number.isSafeInteger(expected?.viewport?.width)
    || !Number.isSafeInteger(expected?.viewport?.height)
    || value.quality !== quality || value.region !== region || value.band !== band
    || value.selected !== true || value.stable !== true
    || value.recoveryExercised !== recover || value.recovered !== recover
    || !Array.isArray(value.coverage) || value.coverage.length !== 6
    || !Number.isSafeInteger(climate) || climate < 1 || climate > 10_000
    || !Number.isSafeInteger(deep) || deep < 1 || deep > climate
    || [playableRatio, deepRatio, minimum, maximum, mean].some(
      (entry) => !Number.isFinite(entry)
    )
    || playableRatio < 0.22 || playableRatio > 0.30
    || deepRatio < 0.09 || deepRatio > 0.15
    || innerLeaks !== 0 || southernLeaks !== 0
    || !Array.isArray(value.retained) || value.retained.length !== 9
    || sampledCellCenters !== 9_600
    || !Number.isSafeInteger(retainedCellCenters)
    || !Number.isSafeInteger(retainedDeepCellCenters)
    || retainedCellCenters < 1 || retainedCellCenters > sampledCellCenters
    || retainedDeepCellCenters < 1
    || retainedDeepCellCenters > retainedCellCenters
    || ![
      retainedRatio,
      retainedDeepRatio,
      retainedMean,
      retainedNorthernmostMean,
    ].every(Number.isFinite)
    || retainedRatio !== retainedCellCenters / sampledCellCenters
    || retainedDeepRatio !== retainedDeepCellCenters / sampledCellCenters
    || retainedRatio < 0.22 || retainedRatio > 0.30
    || retainedDeepRatio < 0.09 || retainedDeepRatio > 0.15
    || retainedMean <= 0 || retainedMean >= 0.5
    || retainedInnerLeaks !== 0 || retainedSouthernLeaks !== 0
    || retainedNorthernmostMean <= 0.75 || retainedNorthernmostMean > 1
    || !Array.isArray(value.vertices) || value.vertices.length !== 4
    || minimum < 0 || maximum > 1 || maximum <= 0.75 || mean <= 0
    || !Number.isSafeInteger(bytes) || bytes < 1 || bytes > BYTE_LIMIT[quality]
    || !Array.isArray(value.material) || value.material.length !== 4
    || revision !== 'genesis-001-northern-snow-presentation-v1'
    || relief !== RELIEF[quality] || enhanced !== true || fallback !== false
  ) throw invalid();
  return Object.freeze({ ...value });
}

function exactSpatialAggregate(value, total) {
  return Array.isArray(value)
    && value.length === 9
    && value.every((entry) => Number.isSafeInteger(entry) && entry >= 0)
    && value.reduce((sum, entry) => sum + entry, 0) === total;
}

export function assertNorthernReachRenderedVisual(evidence, visual) {
  const cool = visual?.coolHighAlbedoSamples;
  const targetSnowMass = visual?.coolSpatialBuckets?.[TARGET_CENTER_BUCKET_INDEX];
  const strongestSnowBucket = Math.max(
    0,
    ...(visual?.coolSpatialBuckets ?? [])
  );
  if (!visual || typeof visual !== 'object'
    || !Number.isSafeInteger(cool)
    || !exactSpatialAggregate(visual.coolSpatialBuckets, cool)
    || (evidence?.region === 'overview'
      ? cool < OVERVIEW_MINIMUM_SNOW_SAMPLES
        || strongestSnowBucket < OVERVIEW_MINIMUM_SNOW_SAMPLES
      : cool < TARGET_MINIMUM_FRAME_SNOW_SAMPLES
        || !Number.isSafeInteger(targetSnowMass)
        || targetSnowMass < TARGET_MINIMUM_SNOW_SAMPLES)
    || visual.clippedBlackSamples !== 0 || visual.clippedWhiteSamples !== 0
    || visual.hotYellowSamples !== 0) {
    throw new TypeError('Invalid Northern Reach visual aggregate.');
  }
}

export async function applyNorthernReachRenderedEvidence(session, options) {
  const { quality, recover = false, region, viewport } = options ?? {};
  if (!session || typeof session.command !== 'function' || !Object.hasOwn(RELIEF, quality)
    || !REGIONS.has(region) || typeof recover !== 'boolean'
    || (recover && region !== 'deep') || !Number.isSafeInteger(viewport?.width)
    || !Number.isSafeInteger(viewport?.height)) {
    throw new TypeError('Invalid Northern Reach rendered journey.');
  }
  const renderedTargets = JSON.stringify(NORTHERN_REACH_RENDERED_TARGET_MANIFEST);
  const assertRenderedTarget = assertNorthernReachRenderedTarget.toString();
  const result = await session.command('Runtime.evaluate', {
    expression: `(async () => {
      const region=${JSON.stringify(region)}, recover=${recover};
      const viewport=${JSON.stringify(viewport)};
      const targets=${renderedTargets};
      const assertTarget=${assertRenderedTarget};
      const wait=async(fn,ms=30000)=>{const end=performance.now()+ms;while(performance.now()<=end){
        if(fn())return true;await new Promise(resolve=>setTimeout(resolve,32));}return false;};
      const root=document.querySelector('.realm-map-screen');
      const overlay=document.querySelector('[data-rendered-webgl-status]');
      const canvas=()=>root?.querySelector('canvas[data-realm-canvas-active="true"]');
      const trigger=document.querySelector('.realm-cell-navigator > button');
      if(!(root instanceof HTMLElement)||!(overlay instanceof HTMLElement)
        ||!(trigger instanceof HTMLButtonElement)||trigger.disabled
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
          {GENESIS_WATER_REVISION_ENABLED_CELLS_V1},{createRealmNorthernSnowField},
          {CANONICAL_TIER_I_STONE_SITES_V1},{CANONICAL_TIER_I_FOOD_SITES_V1}]
          =await Promise.all([import('/spacetimedb/src/world.ts'),
            import('/spacetimedb/src/waterRevision.ts'),
            import('/src/game/map/realmNorthernSnow.ts'),
            import('/spacetimedb/src/stoneSitePolicy.ts'),
            import('/spacetimedb/src/foodSitePolicy.ts')]);
        const water=new Set(GENESIS_WATER_REVISION_ENABLED_CELLS_V1.map(row=>row.cellKey));
        const field=createRealmNorthernSnowField({worldSeed:CANONICAL_REALM.numericSeed,
          hexSize:1,playableRadius:CANONICAL_REALM.authoritativeRadius,
          renderRadius:CANONICAL_REALM.renderRadius});
        const target=targets[region];
        const targetKey=target?target.q+','+target.r:'';
        const metadata=canonicalMetaForKey(targetKey);
        const resourceCatalog=target?.neighborResource?.kind==='stone'
          ?CANONICAL_TIER_I_STONE_SITES_V1:target?.neighborResource?.kind==='food'
            ?CANONICAL_TIER_I_FOOD_SITES_V1:null;
        const resource=resourceCatalog?.find(
          row=>row.siteId===target?.neighborResource?.siteId);
        try{
          assertTarget(target,{coverage:field.sampleCoord(target).coverage,
            terrainKind:metadata?.terrainKind,passable:metadata?.passable,
            water:water.has(targetKey),resourceKind:target?.neighborResource?.kind,
            resourceSiteId:resource?.siteId,resourceQ:resource?.q,resourceR:resource?.r,
            resourceTier:resource?.tier,resourceActive:resource?.active});
        }catch{return null;}
        const form=document.querySelector('.realm-cell-navigator__jump');
        const inputs=form?.querySelectorAll('input');
        const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
        if(!target||!(form instanceof HTMLFormElement)||inputs?.length!==2||!setter)return null;
        for(const [input,value] of [[inputs[0],target.q],[inputs[1],target.r]]){
          setter.call(input,String(value));input.dispatchEvent(new Event('input',{bubbles:true}));
        }
        await new Promise(resolve=>requestAnimationFrame(resolve));form.requestSubmit();selected=true;
      }
      if(!await wait(()=>document.querySelector('.realm-cell-navigator__dialog')===null
        &&root.dataset.rendererState==='ready'&&canvas()?.dataset.realmCameraSettled==='true'
        &&(region==='overview'?root.dataset.realmCameraTargetKind==='realm'
          :root.dataset.realmCameraTargetKind==='cell-location'),5000))return null;
      const targetBand=region==='overview'?'overview'
        :region==='transition'||viewport.width<=480?'strategy':'close';
      for(let step=0;step<12&&root.dataset.realmCameraPresentationBand!==targetBand;step++){
        canvas()?.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-250,
          clientX:viewport.width/2,clientY:viewport.height/2}));
        await new Promise(resolve=>setTimeout(resolve,64));
        await wait(()=>canvas()?.dataset.realmCameraSettled==='true',5000);
      }
      const signature=()=>[root.dataset.snowFieldRevision,root.dataset.snowAttributeBytes,
        root.dataset.terrainTriangleCount,root.dataset.grassDrawCalls,
        root.dataset.forestDecorativeDrawCalls,root.dataset.sharedForestTreeCount].join('|');
      const selectedTargetKey=region==='overview'?'':targets[region].q+','+targets[region].r;
      if(region!=='overview'&&root.dataset.realmSelectedCellKey!==selectedTargetKey)return null;
      const cameraToken=()=>canvas()?.dataset.realmCameraStateToken??'';
      const before=signature(),beforeCameraToken=cameraToken();let recovered=false;
      if(!/^[0-9a-f]{24}$/.test(beforeCameraToken))return null;
      if(recover){
        const generation=Number(root.dataset.rendererGeneration);
        const context=canvas()?.getContext('webgl2')??canvas()?.getContext('webgl');
        const controller=context?.getExtension('WEBGL_lose_context');if(!controller)return null;
        controller.loseContext();
        const recovering=await wait(()=>root.dataset.rendererState==='recovering'
          &&root.dataset.rendererFailure==='context-lost');
        if(recovering){await new Promise(resolve=>setTimeout(resolve,64));controller.restoreContext();}
        recovered=recovering&&await wait(()=>root.dataset.rendererState==='ready'
          &&root.dataset.rendererFailure==='none'&&Number(root.dataset.rendererGeneration)>generation
          &&canvas()?.dataset.realmCameraSettled==='true'&&signature()===before
          &&cameraToken()===beforeCameraToken
          &&root.dataset.realmSelectedCellKey===selectedTargetKey);
      }
      const number=name=>Number(root.dataset[name]);
      return {band:root.dataset.realmCameraPresentationBand,
        coverage:[number('snowPreRetentionCellCountAbove015'),
          number('snowPreRetentionDeepCellCountAbove075'),
          number('snowPreRetentionCoverageRatio'),
          number('snowPreRetentionDeepCoverageRatio'),
          number('snowInnerRadiusLeakCount'),number('snowSouthernLeakCount')],
        material:[root.dataset.snowFieldRevision,root.dataset.snowFineReliefMode,
          root.dataset.snowShaderEnhanced==='true',root.dataset.snowShaderFallbackActive==='true'],
        quality:overlay.dataset.quality,recovered,recoveryExercised:recover,region,selected,
        retained:[number('snowSampledPlayableLandCellCenterCount'),
          number('snowRetainedCellCenterCountAbove015'),
          number('snowRetainedDeepCellCenterCountAbove075'),
          number('snowRetainedCellCenterCoverageRatio'),
          number('snowRetainedDeepCellCenterCoverageRatio'),
          number('snowRetainedCellCenterCoverageMean'),
          number('snowRetainedCellCenterInnerRadiusLeakCount'),
          number('snowRetainedCellCenterSouthernLeakCount'),
          number('snowRetainedNorthernmostRowCoverageMean')],
        stable:root.dataset.renderer==='webgl'&&root.dataset.rendererState==='ready'
          &&root.dataset.rendererFailure==='none'&&canvas()?.dataset.realmCameraSettled==='true',
        vertices:[number('snowVertexCoverageMin'),number('snowVertexCoverageMax'),
          number('snowVertexCoverageMean'),number('snowAttributeBytes')]};
    })()`,
    awaitPromise: true,
    returnByValue: true,
  }, recover ? 40_000 : 10_000);
  if (result?.exceptionDetails || result?.result?.type !== 'object') {
    throw new Error('Northern Reach rendered observation failed.');
  }
  return parseNorthernReachRenderedEvidence(result.result.value, {
    quality,
    recover,
    region,
    viewport
  });
}

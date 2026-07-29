const CLIMATES = new Set(['north', 'south']);
const REGIONS = new Set(['overview', 'transition', 'deep']);
const RELIEF = Object.freeze({ high: 'two-band', balanced: 'one-band', reduced: 'none' });
const BYTE_LIMIT = Object.freeze({
  high: 0.5 * 1_024 * 1_024,
  balanced: 0.35 * 1_024 * 1_024,
  reduced: 0.25 * 1_024 * 1_024,
});
const REVISION = Object.freeze({
  north: 'genesis-001-northern-snow-presentation-v1',
  south: 'genesis-001-southern-desert-presentation-v1',
});
const TARGET_MINIMUM_FRAME_CLIMATE_SAMPLES = 8;
const OVERVIEW_MINIMUM_CLIMATE_SAMPLES = 3;
const OVERVIEW_MINIMUM_SPATIAL_DIFFERENCE = 6;
const MAXIMUM_CLIPPED_BLACK_SAMPLES = 1;

export function parseRegionalClimateRenderedEvidence(value, expected) {
  const invalid = () => new TypeError('Invalid regional climate rendered evidence.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const keys = ['band', 'climate', 'coverage', 'material', 'quality', 'recovered',
    'recoveryExercised', 'region', 'selected', 'separation', 'stable', 'vertices'].sort();
  const actual = Object.keys(value).sort();
  const [climateCount, deep, playableRatio, deepRatio, innerLeaks, oppositeLeaks]
    = value.coverage ?? [];
  const [minimum, maximum, mean, bytes] = value.vertices ?? [];
  const [revision, relief, enhanced, fallback] = value.material ?? [];
  const [overlapCells, overlapVertices] = value.separation ?? [];
  const climate = expected?.climate;
  const quality = expected?.quality;
  const recover = expected?.recover;
  const region = expected?.region;
  const band = region === 'overview' ? 'overview'
    : region === 'transition' || expected?.viewport?.width <= 480
      ? 'strategy'
      : 'close';
  if (
    actual.length !== keys.length || actual.some((key, index) => key !== keys[index])
    || !CLIMATES.has(climate) || !Object.hasOwn(RELIEF, quality) || !REGIONS.has(region)
    || typeof recover !== 'boolean'
    || !Number.isSafeInteger(expected?.viewport?.width)
    || !Number.isSafeInteger(expected?.viewport?.height)
    || value.climate !== climate || value.quality !== quality
    || value.region !== region || value.band !== band
    || value.selected !== true || value.stable !== true
    || value.recoveryExercised !== recover || value.recovered !== recover
    || !Array.isArray(value.coverage) || value.coverage.length !== 6
    || !Number.isSafeInteger(climateCount) || climateCount < 1 || climateCount > 10_000
    || !Number.isSafeInteger(deep) || deep < 1 || deep > climateCount
    || [playableRatio, deepRatio, minimum, maximum, mean].some(
      (entry) => !Number.isFinite(entry)
    )
    || playableRatio < 0.22 || playableRatio > 0.30
    || deepRatio < 0.09 || deepRatio > 0.15 || innerLeaks !== 0
    || oppositeLeaks !== 0
    || !Array.isArray(value.vertices) || value.vertices.length !== 4
    || minimum < 0 || maximum > 1 || maximum <= 0.75 || mean <= 0
    || !Number.isSafeInteger(bytes) || bytes < 1 || bytes > BYTE_LIMIT[quality]
    || !Array.isArray(value.material) || value.material.length !== 4
    || revision !== REVISION[climate]
    || relief !== RELIEF[quality] || enhanced !== true || fallback !== false
    || !Array.isArray(value.separation) || value.separation.length !== 2
    || overlapCells !== 0 || overlapVertices !== 0
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
  const spatialDifference = Array.isArray(visual?.coolSpatialBuckets)
    && Array.isArray(visual?.warmSpatialBuckets)
    ? visual.coolSpatialBuckets.reduce(
      (sum, entry, index) => sum + Math.abs(entry - visual.warmSpatialBuckets[index]),
      0
    )
    : 0;
  const targetClimateTotal = evidence?.climate === 'north' ? cool : warm;
  const oppositeClimateTotal = evidence?.climate === 'north' ? warm : cool;
  if (!visual || typeof visual !== 'object'
    || !Number.isSafeInteger(cool) || !Number.isSafeInteger(warm)
    || !exactSpatialAggregate(visual.coolSpatialBuckets, cool)
    || !exactSpatialAggregate(visual.warmSpatialBuckets, warm)
    || (evidence?.region === 'overview' && (
      cool < OVERVIEW_MINIMUM_CLIMATE_SAMPLES
      || warm < OVERVIEW_MINIMUM_CLIMATE_SAMPLES
      || spatialDifference < OVERVIEW_MINIMUM_SPATIAL_DIFFERENCE
    ))
    || (evidence?.region !== 'overview' && (
      targetClimateTotal < TARGET_MINIMUM_FRAME_CLIMATE_SAMPLES
      || targetClimateTotal <= oppositeClimateTotal
    ))
    || !Number.isSafeInteger(visual.clippedBlackSamples)
    || visual.clippedBlackSamples < 0
    || visual.clippedBlackSamples > MAXIMUM_CLIPPED_BLACK_SAMPLES
    || visual.clippedWhiteSamples !== 0
    || visual.hotYellowSamples !== 0) {
    throw new TypeError('Invalid regional climate visual aggregate.');
  }
}

export async function applyRegionalClimateRenderedEvidence(session, options) {
  const { climate, quality, recover = false, region, viewport } = options ?? {};
  if (!session || typeof session.command !== 'function' || !CLIMATES.has(climate)
    || !Object.hasOwn(RELIEF, quality)
    || !REGIONS.has(region) || typeof recover !== 'boolean'
    || (recover && region !== 'deep') || !Number.isSafeInteger(viewport?.width)
    || !Number.isSafeInteger(viewport?.height)) {
    throw new TypeError('Invalid regional climate rendered journey.');
  }
  const result = await session.command('Runtime.evaluate', {
    expression: `(async () => {
      const climate=${JSON.stringify(climate)}, region=${JSON.stringify(region)}, recover=${recover};
      const viewport=${JSON.stringify(viewport)};
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
        const [{CANONICAL_REALM,CANONICAL_WORLD_TILES,CANONICAL_WORLD_TILE_META},
          {GENESIS_WATER_REVISION_ENABLED_CELLS_V1},climateModule]
          =await Promise.all([import('/spacetimedb/src/world.ts'),
            import('/spacetimedb/src/waterRevision.ts'),
            climate==='north'?import('/src/game/map/realmNorthernSnow.ts')
              :import('/src/game/map/realmSouthernDesert.ts')]);
        const metadata=new Map(CANONICAL_WORLD_TILE_META.map(row=>[row.tileKey,row]));
        const water=new Set(GENESIS_WATER_REVISION_ENABLED_CELLS_V1.map(row=>row.cellKey));
        const field=(climate==='north'?climateModule.createRealmNorthernSnowField
          :climateModule.createRealmSouthernDesertField)({
            worldSeed:CANONICAL_REALM.numericSeed,hexSize:1,
            playableRadius:CANONICAL_REALM.authoritativeRadius,
            renderRadius:CANONICAL_REALM.renderRadius});
        const desired=region==='transition'?0.52:0.98;
        let target, best=Infinity;
        for(const tile of CANONICAL_WORLD_TILES){
          const sample=field.sampleCoord(tile);
          const coverage=climate==='north'?sample.coverage:sample.sand;
          const direction=climate==='north'?-tile.r:tile.r;
          const tileMeta=metadata.get(tile.key);
          const eligible=tileMeta?.passable===true&&tileMeta.ring<=45
            &&tileMeta.terrainKind!=='forest'&&tileMeta.staticContentKind==='empty'
            &&!water.has(tile.key)&&direction>0&&(region==='transition'
              ? direction>=24&&direction<=36&&coverage>=0.42&&coverage<=0.62
              : direction>=44&&direction<=45&&coverage>=0.95&&coverage<=0.99);
          const score=Math.abs(coverage-desired);
          if(eligible&&(score<best||(score===best&&(!target||direction>
            (climate==='north'?-target.r:target.r)
            ||(direction===(climate==='north'?-target.r:target.r)&&tile.q<target.q))))){
            target=tile;best=score;}
        }
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
        root.dataset.southernDesertFieldRevision,root.dataset.sandAttributeBytes,
        root.dataset.terrainTriangleCount,root.dataset.grassDrawCalls,
        root.dataset.forestDecorativeDrawCalls,root.dataset.sharedForestTreeCount].join('|');
      const before=signature();let recovered=false;
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
          &&canvas()?.dataset.realmCameraSettled==='true'&&signature()===before);
      }
      const number=name=>Number(root.dataset[name]);
      const north=climate==='north';
      return {band:root.dataset.realmCameraPresentationBand,climate,
        coverage:north
          ?[number('snowClimateCellCountAbove015'),number('snowDeepCellCountAbove075'),
            number('snowPlayableCoverageRatio'),number('snowDeepCoverageRatio'),
            number('snowInnerRadiusLeakCount'),number('snowSouthernLeakCount')]
          :[number('desertClimateCellCountAbove015'),number('desertDeepCellCountAbove075'),
            number('desertPlayableCoverageRatio'),number('desertDeepCoverageRatio'),
            number('desertInnerRadiusLeakCount'),number('desertNorthernLeakCount')],
        material:north
          ?[root.dataset.snowFieldRevision,root.dataset.snowFineReliefMode,
            root.dataset.snowShaderEnhanced==='true',root.dataset.snowShaderFallbackActive==='true']
          :[root.dataset.southernDesertFieldRevision,root.dataset.sandFineReliefMode,
            root.dataset.sandShaderEnhanced==='true',root.dataset.sandShaderFallbackActive==='true'],
        quality:overlay.dataset.quality,recovered,recoveryExercised:recover,region,selected,
        separation:[number('sandSnowOverlapCellCount'),number('sandSnowOverlapVertexCount')],
        stable:root.dataset.renderer==='webgl'&&root.dataset.rendererState==='ready'
          &&root.dataset.rendererFailure==='none'&&canvas()?.dataset.realmCameraSettled==='true',
        vertices:north
          ?[number('snowVertexCoverageMin'),number('snowVertexCoverageMax'),
            number('snowVertexCoverageMean'),number('snowAttributeBytes')]
          :[number('sandVertexCoverageMin'),number('sandVertexCoverageMax'),
            number('sandVertexCoverageMean'),number('sandAttributeBytes')]};
    })()`,
    awaitPromise: true,
    returnByValue: true,
  }, recover ? 40_000 : 10_000);
  if (result?.exceptionDetails || result?.result?.type !== 'object') {
    throw new Error('Regional climate rendered observation failed.');
  }
  return parseRegionalClimateRenderedEvidence(result.result.value, {
    climate,
    quality,
    recover,
    region,
    viewport
  });
}

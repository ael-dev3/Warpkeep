const REGIONS = new Set(['overview', 'transition', 'deep']);
const RELIEF = Object.freeze({ high: 'two-band', balanced: 'one-band', reduced: 'none' });
const BYTE_LIMIT = Object.freeze({
  high: 0.5 * 1_024 * 1_024,
  balanced: 0.35 * 1_024 * 1_024,
  reduced: 0.25 * 1_024 * 1_024,
});

export function parseNorthernReachRenderedEvidence(value, expected) {
  const invalid = () => new TypeError('Invalid Northern Reach rendered evidence.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const keys = ['band', 'coverage', 'material', 'quality', 'recovered', 'region',
    'selected', 'stable', 'vertices'].sort();
  const actual = Object.keys(value).sort();
  const [climate, deep, playableRatio, deepRatio, innerLeaks] = value.coverage ?? [];
  const [minimum, maximum, mean, bytes] = value.vertices ?? [];
  const [revision, relief, enhanced, fallback] = value.material ?? [];
  const quality = expected?.quality;
  const region = expected?.region;
  const band = region === 'overview' ? 'overview'
    : region === 'transition' || expected?.viewport?.width <= 480
      ? 'strategy'
      : 'close';
  if (
    actual.length !== keys.length || actual.some((key, index) => key !== keys[index])
    || !Object.hasOwn(RELIEF, quality) || !REGIONS.has(region)
    || !Number.isSafeInteger(expected?.viewport?.width)
    || !Number.isSafeInteger(expected?.viewport?.height)
    || value.quality !== quality || value.region !== region || value.band !== band
    || value.selected !== true || value.stable !== true || value.recovered !== true
    || !Array.isArray(value.coverage) || value.coverage.length !== 5
    || !Number.isSafeInteger(climate) || climate < 1 || climate > 10_000
    || !Number.isSafeInteger(deep) || deep < 1 || deep > climate
    || [playableRatio, deepRatio, minimum, maximum, mean].some(
      (entry) => !Number.isFinite(entry)
    )
    || playableRatio < 0.22 || playableRatio > 0.30
    || deepRatio < 0.09 || deepRatio > 0.15 || innerLeaks !== 0
    || !Array.isArray(value.vertices) || value.vertices.length !== 4
    || minimum < 0 || maximum > 1 || maximum <= 0.75 || mean <= 0
    || !Number.isSafeInteger(bytes) || bytes < 1 || bytes > BYTE_LIMIT[quality]
    || !Array.isArray(value.material) || value.material.length !== 4
    || revision !== 'genesis-001-northern-snow-presentation-v1'
    || relief !== RELIEF[quality] || enhanced !== true || fallback !== false
  ) throw invalid();
  return Object.freeze({ ...value });
}

export function assertNorthernReachRenderedVisual(evidence, visual) {
  if (!visual || typeof visual !== 'object'
    || (evidence.region !== 'overview' && visual.coolHighAlbedoSamples < 1)
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
  const result = await session.command('Runtime.evaluate', {
    expression: `(async () => {
      const region=${JSON.stringify(region)}, recover=${recover};
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
          {GENESIS_WATER_REVISION_ENABLED_CELLS_V1},{createRealmNorthernSnowField}]
          =await Promise.all([import('/spacetimedb/src/world.ts'),
            import('/spacetimedb/src/waterRevision.ts'),
            import('/src/game/map/realmNorthernSnow.ts')]);
        const metadata=new Map(CANONICAL_WORLD_TILE_META.map(row=>[row.tileKey,row]));
        const water=new Set(GENESIS_WATER_REVISION_ENABLED_CELLS_V1.map(row=>row.cellKey));
        const field=createRealmNorthernSnowField({worldSeed:CANONICAL_REALM.numericSeed,
          hexSize:1,playableRadius:CANONICAL_REALM.authoritativeRadius,
          renderRadius:CANONICAL_REALM.renderRadius});
        const desired=region==='transition'?0.52:0.77;
        let target, best=Infinity;
        for(const tile of CANONICAL_WORLD_TILES){
          const coverage=field.sampleCoord(tile).coverage;
          const eligible=metadata.get(tile.key)?.passable===true&&!water.has(tile.key)&&tile.r<0
            &&(region==='transition'
              ? tile.r>=-36&&tile.r<=-24&&coverage>=0.42&&coverage<=0.62
              : tile.r>=-48&&tile.r<=-38&&coverage>0.75&&coverage<=0.82);
          const score=Math.abs(coverage-desired);
          if(eligible&&(score<best||(score===best&&(!target||tile.r<target.r
            ||(tile.r===target.r&&tile.q<target.q))))){target=tile;best=score;}
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
        root.dataset.terrainTriangleCount,root.dataset.grassDrawCalls,
        root.dataset.forestDecorativeDrawCalls,root.dataset.sharedForestTreeCount].join('|');
      const before=signature();let recovered=true;
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
      return {band:root.dataset.realmCameraPresentationBand,
        coverage:[number('snowClimateCellCountAbove015'),number('snowDeepCellCountAbove075'),
          number('snowPlayableCoverageRatio'),number('snowDeepCoverageRatio'),
          number('snowInnerRadiusLeakCount')],
        material:[root.dataset.snowFieldRevision,root.dataset.snowFineReliefMode,
          root.dataset.snowShaderEnhanced==='true',root.dataset.snowShaderFallbackActive==='true'],
        quality:overlay.dataset.quality,recovered,region,selected,
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
    region,
    viewport
  });
}

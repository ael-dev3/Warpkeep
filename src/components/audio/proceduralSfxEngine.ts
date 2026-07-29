import {
  WARPKEEP_SFX_EFFECTS_LEVEL,
  WARPKEEP_SFX_VOICE_CAP,
  clusterWarpkeepSfxEvents,
  warpkeepSfxEventCount,
  warpkeepSfxEventFamily,
  warpkeepSfxPan,
  type WarpkeepSfxEvent
} from './sfxEvents';
import {
  WARPKEEP_WATER_AMBIENCE_OFF,
  normalizeWarpkeepWaterAmbience,
  type WarpkeepWaterAmbienceState
} from './waterAmbience';

type SfxBus = 'ui' | 'world';

type ToneLayer = Readonly<{
  attack: number;
  duration: number;
  endFrequency?: number;
  gain: number;
  offset?: number;
  startFrequency: number;
  type: OscillatorType;
}>;

type NoiseLayer = Readonly<{
  attack: number;
  duration: number;
  filterFrequency: number;
  filterQ: number;
  filterType: BiquadFilterType;
  gain: number;
  offset?: number;
}>;

export type WarpkeepSfxRecipe = Readonly<{
  bus: SfxBus;
  duration: number;
  gain: number;
  noise?: NoiseLayer;
  priority: number;
  tones: readonly ToneLayer[];
}>;

type ScheduledSource = OscillatorNode | AudioBufferSourceNode;

type ScheduledVoice = Readonly<{
  endsAt: number;
  input: GainNode;
  nodes: readonly AudioNode[];
  sources: readonly ScheduledSource[];
}>;

type ActiveVoice = ScheduledVoice & Readonly<{
  id: number;
  priority: number;
  startedAt: number;
}>;

type SfxGraph = Readonly<{
  compressor: DynamicsCompressorNode;
  master: GainNode;
  noise: AudioBuffer;
  uiBus: GainNode;
  worldBus: GainNode;
}>;

type WaterAmbienceVoice = Readonly<{
  gain: GainNode;
  highpass: BiquadFilterNode;
  lowpass: BiquadFilterNode;
  nodes: readonly AudioNode[];
  source: AudioBufferSourceNode;
}>;

export type WarpkeepSfxEngineSnapshot = Readonly<{
  activeVoices: number;
  waterAmbienceActive: boolean;
  waterAmbienceRegime: WarpkeepWaterAmbienceState['regime'];
  contextCreated: boolean;
  contextState: AudioContextState | 'unavailable';
  hidden: boolean;
  muted: boolean;
  voiceCap: number;
}>;

export type WarpkeepSfxEngineOptions = Readonly<{
  contextFactory?: () => AudioContext;
  effectsLevel?: number;
  getViewportWidth?: () => number;
  voiceCap?: number;
}>;

const MIN_GAIN = 0.0001;
const GENERIC_UI_SUPPRESSION_MILLISECONDS = 32;
// Long enough that a gently filtered ambience bed never reads as a short
// repeating sample, while remaining one small shared mono buffer.
const SHARED_NOISE_SECONDS = 2;
const SHARED_NOISE_SEED = 0x7d31_94a5;
const WATER_AMBIENCE_RAMP_SECONDS = 0.12;
const WATER_AMBIENCE_RELEASE_SECONDS = 0.08;

const EVENT_COOLDOWN_MILLISECONDS: Readonly<Record<WarpkeepSfxEvent['kind'], number>> =
  Object.freeze({
    'ui-press': 55,
    'ui-back': 90,
    'ui-open': 90,
    'ui-close': 90,
    'ui-deny': 180,
    'select-keep': 140,
    'select-worker': 140,
    'select-gold': 140,
    'select-food': 140,
    'select-wood': 140,
    'select-stone': 140,
    'select-water': 160,
    'worker-dispatch-confirmed': 180,
    'worker-recall-confirmed': 180,
    'worker-arrived': 750,
    'worker-returned': 750,
    'command-failed': 220,
    'river-focus-entered': 280,
    'river-focus-left': 280
  });

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function tone(
  startFrequency: number,
  endFrequency: number,
  duration: number,
  gain: number,
  type: OscillatorType = 'sine',
  offset = 0,
  attack = 0.006
): ToneLayer {
  return Object.freeze({
    attack,
    duration,
    endFrequency,
    gain,
    offset,
    startFrequency,
    type
  });
}

function noise(
  duration: number,
  gain: number,
  filterType: BiquadFilterType,
  filterFrequency: number,
  filterQ = 0.7,
  offset = 0,
  attack = 0.003
): NoiseLayer {
  return Object.freeze({
    attack,
    duration,
    filterFrequency,
    filterQ,
    filterType,
    gain,
    offset
  });
}

function countedGain(event: WarpkeepSfxEvent) {
  return 1 + Math.log2(warpkeepSfxEventCount(event)) * 0.11;
}

/**
 * The recipe table is deliberately declarative: all sources are finite and
 * every event has one reviewed maximum tail.
 */
export function getWarpkeepSfxRecipe(event: WarpkeepSfxEvent): WarpkeepSfxRecipe {
  const countGain = countedGain(event);
  switch (event.kind) {
    case 'ui-press': {
      const emphasis = event.emphasis ?? 'normal';
      const emphasisGain = emphasis === 'quiet' ? 0.72 : emphasis === 'primary' ? 1.12 : 1;
      return Object.freeze({
        bus: 'ui',
        duration: 0.09,
        gain: 0.62 * emphasisGain,
        noise: noise(0.045, 0.09, 'bandpass', 1_550, 0.65),
        priority: emphasis === 'primary' ? 3 : 1,
        tones: Object.freeze([
          tone(174, 158, 0.075, 0.12, 'triangle')
        ])
      });
    }
    case 'ui-open':
      return Object.freeze({
        bus: 'ui',
        duration: 0.17,
        gain: 0.58,
        noise: noise(0.075, 0.055, 'lowpass', 1_250, 0.7),
        priority: 2,
        tones: Object.freeze([
          tone(238, 274, 0.09, 0.1, 'triangle'),
          tone(318, 348, 0.1, 0.075, 'sine', 0.045)
        ])
      });
    case 'ui-close':
    case 'ui-back':
      return Object.freeze({
        bus: 'ui',
        duration: 0.17,
        gain: event.kind === 'ui-back' ? 0.54 : 0.5,
        noise: noise(0.07, 0.045, 'lowpass', 1_050, 0.7),
        priority: 2,
        tones: Object.freeze([
          tone(286, 246, 0.09, 0.09, 'triangle'),
          tone(218, 184, 0.1, 0.07, 'sine', 0.045)
        ])
      });
    case 'ui-deny':
    case 'command-failed':
      return Object.freeze({
        bus: 'ui',
        duration: 0.24,
        gain: event.kind === 'command-failed' ? 0.66 : 0.6,
        noise: noise(0.055, 0.045, 'lowpass', 720, 0.75),
        priority: 4,
        tones: Object.freeze([
          tone(154, 126, 0.11, 0.12, 'triangle'),
          tone(132, 108, 0.12, 0.1, 'triangle', 0.085)
        ])
      });
    case 'select-keep':
      return Object.freeze({
        bus: 'world',
        duration: 0.31,
        gain: 0.64,
        noise: noise(0.085, 0.085, 'lowpass', 860, 0.8),
        priority: 3,
        tones: Object.freeze([
          tone(118, 106, 0.13, 0.14, 'triangle'),
          tone(512, 498, 0.27, 0.055, 'sine', 0.018, 0.008)
        ])
      });
    case 'select-worker':
      return Object.freeze({
        bus: 'world',
        duration: 0.2,
        gain: 0.5,
        noise: noise(0.075, 0.07, 'bandpass', 940, 0.75),
        priority: 2,
        tones: Object.freeze([
          tone(176, 164, 0.15, 0.09, 'triangle')
        ])
      });
    case 'select-gold':
      return Object.freeze({
        bus: 'world',
        duration: 0.27,
        gain: 0.5,
        priority: 2,
        tones: Object.freeze([
          tone(622, 608, 0.2, 0.085, 'sine'),
          tone(932, 890, 0.24, 0.045, 'sine', 0.012)
        ])
      });
    case 'select-food':
      return Object.freeze({
        bus: 'world',
        duration: 0.18,
        gain: 0.5,
        noise: noise(0.12, 0.1, 'bandpass', 1_080, 0.55),
        priority: 2,
        tones: Object.freeze([
          tone(162, 148, 0.1, 0.08, 'triangle', 0.012)
        ])
      });
    case 'select-wood':
      return Object.freeze({
        bus: 'world',
        duration: 0.18,
        gain: 0.54,
        noise: noise(0.055, 0.075, 'bandpass', 1_480, 0.7, 0.018),
        priority: 2,
        tones: Object.freeze([
          tone(112, 96, 0.13, 0.14, 'triangle')
        ])
      });
    case 'select-stone':
      return Object.freeze({
        bus: 'world',
        duration: 0.18,
        gain: 0.5,
        noise: noise(0.048, 0.075, 'highpass', 760, 0.75),
        priority: 2,
        tones: Object.freeze([
          tone(202, 176, 0.13, 0.1, 'triangle', 0.008)
        ])
      });
    case 'select-water':
    case 'river-focus-entered':
      return Object.freeze({
        bus: 'world',
        duration: event.kind === 'river-focus-entered' ? 0.31 : 0.24,
        gain: event.kind === 'select-water' && event.regime === 'ocean' ? 0.48 : 0.44,
        noise: noise(
          event.kind === 'river-focus-entered' ? 0.24 : 0.18,
          0.075,
          'bandpass',
          event.kind === 'select-water' && event.regime === 'ocean' ? 420 : 620,
          0.48
        ),
        priority: 2,
        tones: Object.freeze([
          tone(486, 442, 0.18, 0.05, 'sine', 0.035)
        ])
      });
    case 'river-focus-left':
      return Object.freeze({
        bus: 'world',
        duration: 0.16,
        gain: 0.38,
        noise: noise(0.12, 0.055, 'bandpass', 520, 0.5),
        priority: 1,
        tones: Object.freeze([])
      });
    case 'worker-dispatch-confirmed':
      return Object.freeze({
        bus: 'world',
        duration: 0.31,
        gain: 0.58 * countGain,
        noise: noise(0.09, 0.085, 'bandpass', 1_040, 0.65, 0.015),
        priority: 5,
        tones: Object.freeze([
          tone(102, 92, 0.16, 0.14, 'triangle'),
          tone(246, 274, 0.2, 0.065, 'sine', 0.06)
        ])
      });
    case 'worker-recall-confirmed':
      return Object.freeze({
        bus: 'world',
        duration: 0.32,
        gain: 0.58 * countGain,
        noise: noise(0.085, 0.08, 'bandpass', 1_180, 0.7),
        priority: 5,
        tones: Object.freeze([
          tone(286, 218, 0.16, 0.08, 'triangle'),
          tone(184, 142, 0.2, 0.11, 'triangle', 0.07)
        ])
      });
    case 'worker-arrived':
      return Object.freeze({
        bus: 'world',
        duration: 0.23,
        gain: 0.4 * countGain,
        noise: noise(0.055, 0.045, 'lowpass', 920, 0.65),
        priority: 3,
        tones: Object.freeze([
          tone(228, 254, 0.18, 0.065, 'sine', 0.025)
        ])
      });
    case 'worker-returned':
      return Object.freeze({
        bus: 'world',
        duration: 0.25,
        gain: 0.42 * countGain,
        noise: noise(0.065, 0.055, 'lowpass', 840, 0.65),
        priority: 3,
        tones: Object.freeze([
          tone(214, 178, 0.19, 0.075, 'triangle', 0.02)
        ])
      });
  }
}

function createDefaultContext() {
  if (typeof window === 'undefined') {
    throw new Error('Web Audio is unavailable outside a browser.');
  }
  const AudioContextConstructor = window.AudioContext
    ?? (window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error('Web Audio is unavailable in this browser.');
  }
  return new AudioContextConstructor({ latencyHint: 'interactive' });
}

function createSharedNoiseBuffer(context: BaseAudioContext) {
  const sampleCount = Math.max(1, Math.round(context.sampleRate * SHARED_NOISE_SECONDS));
  const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
  const channel = buffer.getChannelData(0);
  let state = SHARED_NOISE_SEED >>> 0;
  let mean = 0;
  for (let index = 0; index < channel.length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const value = ((state >>> 0) / 0xffff_ffff) * 2 - 1;
    channel[index] = value;
    mean += value;
  }
  mean /= channel.length;
  let peak = 0;
  for (let index = 0; index < channel.length; index += 1) {
    channel[index] -= mean;
    peak = Math.max(peak, Math.abs(channel[index]));
  }
  const scale = peak > 0 ? 0.94 / peak : 1;
  for (let index = 0; index < channel.length; index += 1) {
    channel[index] *= scale;
  }
  return buffer;
}

function createGraph(context: BaseAudioContext, effectsLevel: number): SfxGraph {
  const uiBus = context.createGain();
  const worldBus = context.createGain();
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();

  uiBus.gain.value = 0.78;
  worldBus.gain.value = 0.72;
  master.gain.value = clamp(effectsLevel, 0, 0.5);
  compressor.threshold.value = -18;
  compressor.knee.value = 18;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.14;

  uiBus.connect(master);
  worldBus.connect(master);
  master.connect(compressor);
  compressor.connect(context.destination);

  return Object.freeze({
    compressor,
    master,
    noise: createSharedNoiseBuffer(context),
    uiBus,
    worldBus
  });
}

function scheduleEnvelope(
  parameter: AudioParam,
  start: number,
  attack: number,
  end: number,
  peak: number
) {
  parameter.setValueAtTime(MIN_GAIN, start);
  parameter.linearRampToValueAtTime(Math.max(MIN_GAIN, peak), start + attack);
  parameter.exponentialRampToValueAtTime(MIN_GAIN, end);
}

function scheduleRecipe(
  context: BaseAudioContext,
  graph: SfxGraph,
  recipe: WarpkeepSfxRecipe,
  start: number,
  pan: number,
  variation: number,
  onEnded?: () => void
): ScheduledVoice {
  const input = context.createGain();
  const nodes: AudioNode[] = [input];
  let output: AudioNode = input;
  const createStereoPanner = context.createStereoPanner?.bind(context);
  if (createStereoPanner) {
    const panner = createStereoPanner();
    panner.pan.value = clamp(pan, -0.72, 0.72);
    input.connect(panner);
    nodes.push(panner);
    output = panner;
  }
  output.connect(recipe.bus === 'ui' ? graph.uiBus : graph.worldBus);
  input.gain.value = clamp(recipe.gain, 0, 1.25);

  const sources: ScheduledSource[] = [];
  const frequencyScale = 1 + clamp(variation, -1, 1) * 0.022;

  for (const layer of recipe.tones) {
    const layerStart = start + (layer.offset ?? 0);
    const layerEnd = layerStart + layer.duration;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = layer.type;
    oscillator.frequency.setValueAtTime(layer.startFrequency * frequencyScale, layerStart);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(20, (layer.endFrequency ?? layer.startFrequency) * frequencyScale),
      layerEnd
    );
    scheduleEnvelope(envelope.gain, layerStart, layer.attack, layerEnd, layer.gain);
    oscillator.connect(envelope);
    envelope.connect(input);
    oscillator.start(layerStart);
    oscillator.stop(layerEnd + 0.012);
    sources.push(oscillator);
    nodes.push(oscillator, envelope);
  }

  if (recipe.noise) {
    const layer = recipe.noise;
    const layerStart = start + (layer.offset ?? 0);
    const layerEnd = layerStart + layer.duration;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = graph.noise;
    source.loop = true;
    filter.type = layer.filterType;
    filter.frequency.value = layer.filterFrequency * frequencyScale;
    filter.Q.value = layer.filterQ;
    scheduleEnvelope(envelope.gain, layerStart, layer.attack, layerEnd, layer.gain);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(input);
    const noiseOffset = Math.abs(variation) * Math.max(0, SHARED_NOISE_SECONDS - 0.05);
    source.start(layerStart, noiseOffset);
    source.stop(layerEnd + 0.01);
    sources.push(source);
    nodes.push(source, filter, envelope);
  }

  const endsAt = start + recipe.duration + 0.014;
  if (sources.length > 0 && onEnded) {
    let remainingSources = sources.length;
    for (const source of sources) {
      source.onended = () => {
        source.onended = null;
        remainingSources -= 1;
        if (remainingSources === 0) onEnded();
      };
    }
  }

  return Object.freeze({
    endsAt,
    input,
    nodes: Object.freeze(nodes),
    sources: Object.freeze(sources)
  });
}

function disconnectVoice(voice: ScheduledVoice) {
  for (const node of voice.nodes) {
    try {
      node.disconnect();
    } catch {
      // A browser may already have disconnected an ended source.
    }
  }
}

function stopVoice(
  voice: ScheduledVoice,
  at: number,
  disconnectImmediately = true
) {
  for (const source of voice.sources) {
    try {
      source.stop(at);
    } catch {
      // Stopping an already-ended source is harmless.
    }
  }
  if (disconnectImmediately) disconnectVoice(voice);
}

function variationFor(serial: number, event: WarpkeepSfxEvent) {
  let state = (serial * 0x9e37_79b1) ^ 0x6d2b_79f5;
  const family = warpkeepSfxEventFamily(event);
  for (let index = 0; index < family.length; index += 1) {
    state = Math.imul(state ^ family.charCodeAt(index), 0x45d9_f3b);
  }
  state ^= state >>> 16;
  return ((state >>> 0) / 0xffff_ffff) * 2 - 1;
}

function isGenericUiEvent(event: WarpkeepSfxEvent) {
  return event.kind === 'ui-press';
}

function hasScreenX(event: WarpkeepSfxEvent): event is WarpkeepSfxEvent & ScreenPosition {
  return 'screenX' in event;
}

type ScreenPosition = Readonly<{ screenX?: number }>;

export class ProceduralSfxEngine {
  readonly voiceCap: number;

  private readonly contextFactory: () => AudioContext;
  private readonly effectsLevel: number;
  private readonly getViewportWidth: () => number;
  private readonly activeVoices = new Map<number, ActiveVoice>();
  private readonly lastFamilyAt = new Map<string, number>();
  private context: AudioContext | undefined;
  private disposed = false;
  private graph: SfxGraph | undefined;
  private hidden = false;
  private lastSpecificEventAt = Number.NEGATIVE_INFINITY;
  private muted = false;
  private resumePromise: Promise<void> | undefined;
  private serial = 0;
  private waterAmbience = WARPKEEP_WATER_AMBIENCE_OFF;
  private waterAmbienceVoice: WaterAmbienceVoice | undefined;

  constructor(options: WarpkeepSfxEngineOptions = {}) {
    this.contextFactory = options.contextFactory ?? createDefaultContext;
    this.effectsLevel = clamp(
      options.effectsLevel ?? WARPKEEP_SFX_EFFECTS_LEVEL,
      0,
      0.5
    );
    this.getViewportWidth = options.getViewportWidth ?? (() => (
      typeof window === 'undefined' ? 0 : window.innerWidth
    ));
    this.voiceCap = Math.max(
      1,
      Math.min(32, Math.floor(options.voiceCap ?? WARPKEEP_SFX_VOICE_CAP))
    );
  }

  async activateFromTrustedGesture(trusted: boolean) {
    if (!trusted || this.disposed || this.muted || this.hidden) return false;
    try {
      if (!this.context) {
        const candidateContext = this.contextFactory();
        try {
          const candidateGraph = createGraph(candidateContext, this.effectsLevel);
          this.context = candidateContext;
          this.graph = candidateGraph;
        } catch {
          try {
            await candidateContext.close();
          } catch {
            // A failed graph never becomes active authority. Some browser
            // implementations may also reject close while initialization is
            // unwinding; leave both engine fields empty so the next trusted
            // gesture can still retry with a fresh context.
          }
          return false;
        }
      }
      if (this.context.state === 'suspended') {
        const context = this.context;
        const resume = this.resumePromise ?? context.resume();
        this.resumePromise = resume;
        try {
          await resume;
        } finally {
          if (this.resumePromise === resume) this.resumePromise = undefined;
        }
      }
      this.syncWaterAmbience();
      return this.context.state === 'running';
    } catch {
      return false;
    }
  }

  emit(event: WarpkeepSfxEvent) {
    return this.emitBatch([event]) > 0;
  }

  emitBatch(events: readonly WarpkeepSfxEvent[]) {
    const context = this.context;
    const graph = this.graph;
    if (
      this.disposed
      || this.muted
      || this.hidden
      || !context
      || !graph
      || context.state !== 'running'
    ) return 0;

    this.pruneFinished(context.currentTime);
    let emitted = 0;
    for (const event of clusterWarpkeepSfxEvents(events)) {
      const nowMilliseconds = context.currentTime * 1_000;
      if (
        isGenericUiEvent(event)
        && nowMilliseconds - this.lastSpecificEventAt
          <= GENERIC_UI_SUPPRESSION_MILLISECONDS
      ) continue;

      const family = warpkeepSfxEventFamily(event);
      const previousAt = this.lastFamilyAt.get(family) ?? Number.NEGATIVE_INFINITY;
      if (
        nowMilliseconds - previousAt
        < EVENT_COOLDOWN_MILLISECONDS[event.kind]
      ) continue;

      const recipe = getWarpkeepSfxRecipe(event);
      if (!this.makeRoom(recipe.priority, context.currentTime)) continue;

      this.serial += 1;
      const id = this.serial;
      const pan = warpkeepSfxPan(
        hasScreenX(event) ? event.screenX : undefined,
        this.getViewportWidth()
      );
      const variation = variationFor(id, event);
      let scheduled: ScheduledVoice | undefined;
      scheduled = scheduleRecipe(
        context,
        graph,
        recipe,
        context.currentTime + 0.004,
        pan,
        variation,
        () => this.finishVoice(id, scheduled)
      );
      this.activeVoices.set(id, Object.freeze({
        ...scheduled,
        id,
        priority: recipe.priority,
        startedAt: context.currentTime
      }));
      this.lastFamilyAt.set(family, nowMilliseconds);
      if (!isGenericUiEvent(event)) this.lastSpecificEventAt = nowMilliseconds;
      emitted += 1;
    }
    return emitted;
  }

  setMuted(muted: boolean) {
    if (this.disposed || this.muted === muted) return;
    this.muted = muted;
    const context = this.context;
    const graph = this.graph;
    if (!context || !graph) return;
    const now = context.currentTime;
    graph.master.gain.cancelScheduledValues(now);
    graph.master.gain.setValueAtTime(
      Math.max(MIN_GAIN, graph.master.gain.value),
      now
    );
    graph.master.gain.linearRampToValueAtTime(
      muted ? MIN_GAIN : this.effectsLevel,
      now + 0.025
    );
    if (muted) this.stopAllAt(now + 0.025, false);
    else this.syncWaterAmbience();
  }

  setHidden(hidden: boolean) {
    if (this.disposed || this.hidden === hidden) return;
    this.hidden = hidden;
    if (!hidden) return;
    this.stopAllAt(this.context?.currentTime ?? 0, true);
    const suspension = this.context?.suspend();
    if (suspension && typeof suspension.catch === 'function') {
      void suspension.catch(() => undefined);
    }
  }

  setWaterAmbience(input: WarpkeepWaterAmbienceState) {
    if (this.disposed) return;
    this.waterAmbience = normalizeWarpkeepWaterAmbience(input);
    this.syncWaterAmbience();
  }

  stopAll() {
    const at = this.context?.currentTime ?? 0;
    this.waterAmbience = WARPKEEP_WATER_AMBIENCE_OFF;
    this.stopAllAt(at, true);
  }

  private stopAllAt(at: number, disconnectImmediately: boolean) {
    for (const voice of this.activeVoices.values()) {
      stopVoice(voice, at, disconnectImmediately);
    }
    this.activeVoices.clear();
    this.releaseWaterAmbience(at, disconnectImmediately);
    this.lastFamilyAt.clear();
    this.lastSpecificEventAt = Number.NEGATIVE_INFINITY;
  }

  snapshot(): WarpkeepSfxEngineSnapshot {
    return Object.freeze({
      activeVoices: this.activeVoices.size + Number(this.waterAmbienceVoice !== undefined),
      waterAmbienceActive: this.waterAmbienceVoice !== undefined,
      waterAmbienceRegime: this.waterAmbienceVoice
        ? this.waterAmbience.regime
        : 'none',
      contextCreated: this.context !== undefined,
      contextState: this.context?.state ?? 'unavailable',
      hidden: this.hidden,
      muted: this.muted,
      voiceCap: this.voiceCap
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stopAll();
    if (this.graph) {
      this.graph.uiBus.disconnect();
      this.graph.worldBus.disconnect();
      this.graph.master.disconnect();
      this.graph.compressor.disconnect();
    }
    const closure = this.context?.close();
    if (closure && typeof closure.catch === 'function') {
      void closure.catch(() => undefined);
    }
    this.graph = undefined;
    this.context = undefined;
    this.resumePromise = undefined;
  }

  private finishVoice(id: number, scheduled?: ScheduledVoice) {
    const voice = this.activeVoices.get(id) ?? scheduled;
    if (!voice) return;
    this.activeVoices.delete(id);
    disconnectVoice(voice);
    this.syncWaterAmbience();
  }

  private makeRoom(priority: number, at: number) {
    if (
      this.activeVoices.size + Number(this.waterAmbienceVoice !== undefined)
      < this.voiceCap
    ) return true;
    if (this.waterAmbienceVoice) {
      this.releaseWaterAmbience(at, true);
      return this.activeVoices.size < this.voiceCap;
    }
    let candidate: ActiveVoice | undefined;
    for (const voice of this.activeVoices.values()) {
      if (voice.priority > priority) continue;
      if (
        !candidate
        || voice.priority < candidate.priority
        || (
          voice.priority === candidate.priority
          && voice.startedAt < candidate.startedAt
        )
      ) candidate = voice;
    }
    if (!candidate) return false;
    this.activeVoices.delete(candidate.id);
    stopVoice(candidate, at);
    return true;
  }

  private pruneFinished(at: number) {
    for (const [id, voice] of this.activeVoices) {
      if (voice.endsAt > at) continue;
      this.activeVoices.delete(id);
      disconnectVoice(voice);
    }
    this.syncWaterAmbience();
  }

  private syncWaterAmbience() {
    const context = this.context;
    const graph = this.graph;
    const state = this.waterAmbience;
    if (
      this.disposed
      || this.muted
      || this.hidden
      || !context
      || !graph
      || context.state !== 'running'
      || state.regime === 'none'
      || state.relevance <= 0
    ) {
      this.releaseWaterAmbience(
        context?.currentTime ?? 0,
        this.disposed
          || this.hidden
          || !context
          || context.state !== 'running'
      );
      return;
    }
    if (
      !this.waterAmbienceVoice
      && this.activeVoices.size >= this.voiceCap
    ) return;

    let voice = this.waterAmbienceVoice;
    if (!voice) {
      const source = context.createBufferSource();
      const highpass = context.createBiquadFilter();
      const lowpass = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = graph.noise;
      source.loop = true;
      highpass.type = 'highpass';
      highpass.Q.value = 0.42;
      lowpass.type = 'lowpass';
      lowpass.Q.value = 0.38;
      gain.gain.value = MIN_GAIN;
      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(gain);
      gain.connect(graph.worldBus);
      voice = Object.freeze({
        gain,
        highpass,
        lowpass,
        nodes: Object.freeze([source, highpass, lowpass, gain]),
        source
      });
      this.waterAmbienceVoice = voice;
      const offset = state.regime === 'river'
        ? SHARED_NOISE_SECONDS * 0.19
        : SHARED_NOISE_SECONDS * 0.61;
      source.start(context.currentTime, offset);
      source.onended = () => {
        source.onended = null;
        for (const node of voice!.nodes) {
          try {
            node.disconnect();
          } catch {
            // An already released browser node is inert.
          }
        }
      };
    }

    const now = context.currentTime;
    const targetGain = state.relevance * (
      state.regime === 'river' ? 0.055 : 0.043
    );
    const targetHighpass = state.regime === 'river'
      ? 125 + state.character * 65
      : 48 + state.character * 24;
    const targetLowpass = state.regime === 'river'
      ? 820 + state.character * 620
      : 360 + state.character * 260;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(
      Math.max(MIN_GAIN, voice.gain.gain.value),
      now
    );
    voice.gain.gain.linearRampToValueAtTime(
      Math.max(MIN_GAIN, targetGain),
      now + WATER_AMBIENCE_RAMP_SECONDS
    );
    for (const [parameter, target] of [
      [voice.highpass.frequency, targetHighpass],
      [voice.lowpass.frequency, targetLowpass]
    ] as const) {
      parameter.cancelScheduledValues(now);
      parameter.setValueAtTime(Math.max(20, parameter.value), now);
      parameter.linearRampToValueAtTime(
        target,
        now + WATER_AMBIENCE_RAMP_SECONDS * 12
      );
    }
  }

  private releaseWaterAmbience(at: number, disconnectImmediately: boolean) {
    const voice = this.waterAmbienceVoice;
    if (!voice) return;
    this.waterAmbienceVoice = undefined;
    const releaseAt = at + (disconnectImmediately ? 0 : WATER_AMBIENCE_RELEASE_SECONDS);
    try {
      voice.gain.gain.cancelScheduledValues(at);
      voice.gain.gain.setValueAtTime(
        Math.max(MIN_GAIN, voice.gain.gain.value),
        at
      );
      voice.gain.gain.linearRampToValueAtTime(MIN_GAIN, releaseAt);
      voice.source.stop(releaseAt);
    } catch {
      // The browser may already have ended this bounded ambience source.
    }
    if (disconnectImmediately) {
      voice.source.onended = null;
      for (const node of voice.nodes) {
        try {
          node.disconnect();
        } catch {
          // Already disconnected.
        }
      }
    }
  }
}

export type WarpkeepRenderedAudioMetrics = Readonly<{
  clippedFraction: number;
  dcOffset: number;
  durationSeconds: number;
  highFrequencyEnergyRatio: number;
  nonFiniteSamples: number;
  peak: number;
  rms: number;
  spectralCentroidHz: number;
  tailSilenceSeconds: number;
}>;

function mixedChannel(buffer: AudioBuffer) {
  const mixed = new Float32Array(buffer.length);
  for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex += 1) {
    const channel = buffer.getChannelData(channelIndex);
    for (let index = 0; index < channel.length; index += 1) {
      mixed[index] += channel[index] / buffer.numberOfChannels;
    }
  }
  return mixed;
}

function spectrumMetrics(samples: Float32Array, sampleRate: number) {
  const fftSize = 512;
  const real = new Float64Array(fftSize);
  const imaginary = new Float64Array(fftSize);
  let firstSignal = samples.findIndex((sample) => Math.abs(sample) > 0.0001);
  if (firstSignal < 0) firstSignal = 0;
  for (let index = 0; index < fftSize; index += 1) {
    const sample = samples[firstSignal + index] ?? 0;
    real[index] = sample * (0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (fftSize - 1)));
  }

  for (let index = 1, swapIndex = 0; index < fftSize; index += 1) {
    let bit = fftSize >> 1;
    while (swapIndex & bit) {
      swapIndex ^= bit;
      bit >>= 1;
    }
    swapIndex ^= bit;
    if (index < swapIndex) {
      [real[index], real[swapIndex]] = [real[swapIndex], real[index]];
    }
  }

  for (let length = 2; length <= fftSize; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const phaseReal = Math.cos(angle);
    const phaseImaginary = Math.sin(angle);
    for (let offset = 0; offset < fftSize; offset += length) {
      let rotationReal = 1;
      let rotationImaginary = 0;
      for (let index = 0; index < length / 2; index += 1) {
        const even = offset + index;
        const odd = even + length / 2;
        const oddReal =
          real[odd] * rotationReal - imaginary[odd] * rotationImaginary;
        const oddImaginary =
          real[odd] * rotationImaginary + imaginary[odd] * rotationReal;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
        const nextRotationReal =
          rotationReal * phaseReal - rotationImaginary * phaseImaginary;
        rotationImaginary =
          rotationReal * phaseImaginary + rotationImaginary * phaseReal;
        rotationReal = nextRotationReal;
      }
    }
  }

  let weightedFrequency = 0;
  let magnitudeSum = 0;
  let totalEnergy = 0;
  let highFrequencyEnergy = 0;
  for (let bin = 1; bin < fftSize / 2; bin += 1) {
    const magnitude = Math.hypot(real[bin], imaginary[bin]);
    const frequency = (bin * sampleRate) / fftSize;
    const energy = magnitude * magnitude;
    weightedFrequency += frequency * magnitude;
    magnitudeSum += magnitude;
    totalEnergy += energy;
    if (frequency >= 4_000) highFrequencyEnergy += energy;
  }
  return {
    highFrequencyEnergyRatio: totalEnergy > 0 ? highFrequencyEnergy / totalEnergy : 0,
    spectralCentroidHz: magnitudeSum > 0 ? weightedFrequency / magnitudeSum : 0
  };
}

export function measureWarpkeepAudioBuffer(
  buffer: AudioBuffer
): WarpkeepRenderedAudioMetrics {
  const samples = mixedChannel(buffer);
  let clipped = 0;
  let dc = 0;
  let energy = 0;
  let lastSignal = -1;
  let nonFiniteSamples = 0;
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (!Number.isFinite(sample)) {
      nonFiniteSamples += 1;
      continue;
    }
    const absolute = Math.abs(sample);
    peak = Math.max(peak, absolute);
    if (absolute >= 0.999) clipped += 1;
    if (absolute > 0.0001) lastSignal = index;
    dc += sample;
    energy += sample * sample;
  }
  const spectrum = spectrumMetrics(samples, buffer.sampleRate);
  return Object.freeze({
    clippedFraction: samples.length > 0 ? clipped / samples.length : 0,
    dcOffset: samples.length > 0 ? dc / samples.length : 0,
    durationSeconds: buffer.duration,
    highFrequencyEnergyRatio: spectrum.highFrequencyEnergyRatio,
    nonFiniteSamples,
    peak,
    rms: samples.length > 0 ? Math.sqrt(energy / samples.length) : 0,
    spectralCentroidHz: spectrum.spectralCentroidHz,
    tailSilenceSeconds: lastSignal < 0
      ? buffer.duration
      : Math.max(0, buffer.duration - (lastSignal + 1) / buffer.sampleRate)
  });
}

export async function renderWarpkeepSfxEventOffline(
  event: WarpkeepSfxEvent,
  sampleRate = 44_100
) {
  if (typeof OfflineAudioContext === 'undefined') return undefined;
  const recipe = getWarpkeepSfxRecipe(event);
  const duration = recipe.duration + 0.16;
  const context = new OfflineAudioContext(
    1,
    Math.ceil(duration * sampleRate),
    sampleRate
  );
  const graph = createGraph(context, WARPKEEP_SFX_EFFECTS_LEVEL);
  scheduleRecipe(
    context,
    graph,
    recipe,
    0.02,
    0,
    variationFor(1, event)
  );
  return context.startRendering();
}

import { describe, expect, it, vi } from 'vitest';

import {
  ProceduralSfxEngine,
  getWarpkeepSfxRecipe,
  measureWarpkeepAudioBuffer,
  renderWarpkeepSfxEventOffline
} from '../src/components/audio/proceduralSfxEngine';
import {
  WARPKEEP_SFX_EVENT_KINDS,
  clusterWarpkeepSfxEvents,
  warpkeepSfxPan,
  type WarpkeepSfxEvent
} from '../src/components/audio/sfxEvents';

class FakeAudioParam {
  value = 0;
  readonly linearRamps: Readonly<{ at: number; value: number }>[] = [];
  readonly scheduled: number[] = [];

  cancelScheduledValues() {
    return this;
  }

  exponentialRampToValueAtTime(value: number) {
    this.value = value;
    this.scheduled.push(value);
    return this;
  }

  linearRampToValueAtTime(value: number, at = 0) {
    this.value = value;
    this.linearRamps.push({ at, value });
    this.scheduled.push(value);
    return this;
  }

  setValueAtTime(value: number) {
    this.value = value;
    this.scheduled.push(value);
    return this;
  }
}

class FakeAudioNode {
  disconnected = false;
  readonly connections: FakeAudioNode[] = [];

  connect(destination: FakeAudioNode) {
    this.connections.push(destination);
    return destination;
  }

  disconnect() {
    this.disconnected = true;
  }
}

class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam();
}

class FakeCompressorNode extends FakeAudioNode {
  readonly attack = new FakeAudioParam();
  readonly knee = new FakeAudioParam();
  readonly ratio = new FakeAudioParam();
  readonly release = new FakeAudioParam();
  readonly threshold = new FakeAudioParam();
}

class FakeBiquadNode extends FakeAudioNode {
  readonly Q = new FakeAudioParam();
  readonly frequency = new FakeAudioParam();
  type: BiquadFilterType = 'lowpass';
}

class FakePannerNode extends FakeAudioNode {
  readonly pan = new FakeAudioParam();
}

class FakeScheduledNode extends FakeAudioNode {
  onended: (() => void) | null = null;
  readonly starts: number[] = [];
  readonly stops: number[] = [];

  start(at = 0) {
    this.starts.push(at);
  }

  stop(at = 0) {
    this.stops.push(at);
  }
}

class FakeOscillatorNode extends FakeScheduledNode {
  readonly frequency = new FakeAudioParam();
  type: OscillatorType = 'sine';
}

class FakeBufferSourceNode extends FakeScheduledNode {
  buffer: AudioBuffer | null = null;
  loop = false;
}

class FakeAudioBuffer {
  readonly duration: number;
  readonly numberOfChannels: number;
  private readonly channels: Float32Array[];

  constructor(
    readonly length: number,
    readonly sampleRate: number,
    numberOfChannels: number
  ) {
    this.duration = length / sampleRate;
    this.numberOfChannels = numberOfChannels;
    this.channels = Array.from(
      { length: numberOfChannels },
      () => new Float32Array(length)
    );
  }

  getChannelData(channel: number) {
    return this.channels[channel];
  }
}

class FakeAudioContext {
  readonly destination = new FakeAudioNode();
  readonly gains: FakeGainNode[] = [];
  readonly oscillators: FakeOscillatorNode[] = [];
  readonly sources: FakeBufferSourceNode[] = [];
  buffersCreated = 0;
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  currentTime = 0;
  readonly sampleRate = 48_000;
  state: AudioContextState = 'suspended';
  suspend = vi.fn(async () => {
    this.state = 'suspended';
  });
  resume = vi.fn(async () => {
    this.state = 'running';
  });

  createBiquadFilter() {
    return new FakeBiquadNode();
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    this.buffersCreated += 1;
    return new FakeAudioBuffer(length, sampleRate, channels) as unknown as AudioBuffer;
  }

  createBufferSource() {
    const source = new FakeBufferSourceNode();
    this.sources.push(source);
    return source;
  }

  createDynamicsCompressor() {
    return new FakeCompressorNode();
  }

  createGain() {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain;
  }

  createOscillator() {
    const oscillator = new FakeOscillatorNode();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createStereoPanner() {
    return new FakePannerNode();
  }
}

function eventForKind(kind: WarpkeepSfxEvent['kind']): WarpkeepSfxEvent {
  switch (kind) {
    case 'ui-press':
      return { kind, emphasis: 'normal' };
    case 'select-water':
      return { kind, regime: 'river', screenX: 400 };
    case 'worker-dispatch-confirmed':
    case 'worker-recall-confirmed':
    case 'worker-arrived':
    case 'worker-returned':
      return { kind, count: 1, screenX: 400 };
    case 'select-keep':
    case 'select-worker':
    case 'select-gold':
    case 'select-food':
    case 'select-wood':
    case 'select-stone':
    case 'river-focus-entered':
      return { kind, screenX: 400 };
    default:
      return { kind };
  }
}

function createEngine(
  context: FakeAudioContext,
  voiceCap = 16
) {
  const contextFactory = vi.fn(
    () => context as unknown as AudioContext
  );
  return {
    contextFactory,
    engine: new ProceduralSfxEngine({
      contextFactory,
      getViewportWidth: () => 800,
      voiceCap
    })
  };
}

describe('procedural SFX contracts', () => {
  it('keeps every event finite, restrained, and assigned to one shared bus', () => {
    for (const kind of WARPKEEP_SFX_EVENT_KINDS) {
      const recipe = getWarpkeepSfxRecipe(eventForKind(kind));
      expect(recipe.duration).toBeGreaterThan(0);
      expect(recipe.duration).toBeLessThanOrEqual(0.35);
      expect(recipe.gain).toBeGreaterThan(0);
      expect(recipe.gain).toBeLessThanOrEqual(0.8);
      expect(['ui', 'world']).toContain(recipe.bus);
      expect(recipe.noise !== undefined || recipe.tones.length > 0).toBe(true);
      for (const layer of recipe.tones) {
        expect(Number.isFinite(layer.startFrequency)).toBe(true);
        expect(Number.isFinite(layer.endFrequency)).toBe(true);
        expect(layer.duration).toBeGreaterThan(0);
      }
      if (recipe.noise) expect(recipe.noise.duration).toBeGreaterThan(0);
    }
  });

  it('clusters simultaneous Worker events and derives bounded stereo pan', () => {
    expect(clusterWarpkeepSfxEvents([
      { kind: 'worker-recall-confirmed', count: 1, screenX: 100 },
      { kind: 'worker-recall-confirmed', count: 3, screenX: 500 },
      { kind: 'worker-arrived', count: 2 }
    ])).toEqual([
      { kind: 'worker-recall-confirmed', count: 4, screenX: 400 },
      { kind: 'worker-arrived', count: 2 }
    ]);
    expect(warpkeepSfxPan(undefined, 800)).toBe(0);
    expect(warpkeepSfxPan(0, 800)).toBe(-0.72);
    expect(warpkeepSfxPan(400, 800)).toBe(0);
    expect(warpkeepSfxPan(800, 800)).toBe(0.72);
    expect(warpkeepSfxPan(Number.NaN, 800)).toBe(0);
  });
});

describe('ProceduralSfxEngine lifecycle', () => {
  it('creates and resumes WebAudio only from an allowed trusted gesture', async () => {
    const context = new FakeAudioContext();
    const { contextFactory, engine } = createEngine(context);

    expect(engine.snapshot()).toMatchObject({
      activeVoices: 0,
      contextCreated: false,
      contextState: 'unavailable'
    });
    await expect(engine.activateFromTrustedGesture(false)).resolves.toBe(false);
    expect(contextFactory).not.toHaveBeenCalled();

    engine.setMuted(true);
    await expect(engine.activateFromTrustedGesture(true)).resolves.toBe(false);
    expect(contextFactory).not.toHaveBeenCalled();
    engine.setMuted(false);

    await expect(engine.activateFromTrustedGesture(true)).resolves.toBe(true);
    expect(contextFactory).toHaveBeenCalledOnce();
    expect(context.buffersCreated).toBe(1);
    expect(context.resume).toHaveBeenCalledOnce();

    await expect(engine.activateFromTrustedGesture(true)).resolves.toBe(true);
    expect(contextFactory).toHaveBeenCalledOnce();
    expect(context.buffersCreated).toBe(1);
  });

  it('coalesces concurrent trusted resume attempts into one browser request', async () => {
    const context = new FakeAudioContext();
    let releaseResume: (() => void) | undefined;
    context.resume.mockImplementationOnce(() => new Promise<void>((resolve) => {
      releaseResume = () => {
        context.state = 'running';
        resolve();
      };
    }));
    const { engine } = createEngine(context);

    const first = engine.activateFromTrustedGesture(true);
    const second = engine.activateFromTrustedGesture(true);
    expect(context.resume).toHaveBeenCalledOnce();
    releaseResume?.();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });

  it('normalizes the voice budget and exposes only an immutable lifecycle snapshot', () => {
    const lower = createEngine(new FakeAudioContext(), 0).engine;
    const fractional = createEngine(new FakeAudioContext(), 3.9).engine;
    const upper = createEngine(new FakeAudioContext(), 99).engine;

    expect(lower.voiceCap).toBe(1);
    expect(fractional.voiceCap).toBe(3);
    expect(upper.voiceCap).toBe(32);
    const snapshot = fractional.snapshot();
    expect(snapshot).toEqual({
      activeVoices: 0,
      contextCreated: false,
      contextState: 'unavailable',
      hidden: false,
      muted: false,
      voiceCap: 3
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('enforces family cooldowns without coupling river and ocean selection', async () => {
    const context = new FakeAudioContext();
    const { engine } = createEngine(context);
    await engine.activateFromTrustedGesture(true);

    expect(engine.emit({ kind: 'select-water', regime: 'river' })).toBe(true);
    expect(engine.emit({ kind: 'select-water', regime: 'river' })).toBe(false);
    expect(engine.emit({ kind: 'select-water', regime: 'ocean' })).toBe(true);
    context.currentTime = 0.161;
    expect(engine.emit({ kind: 'select-water', regime: 'river' })).toBe(true);
    expect(engine.snapshot().activeVoices).toBeLessThanOrEqual(engine.voiceCap);
  });

  it('never exceeds its voice cap and gives every source an explicit stop', async () => {
    const context = new FakeAudioContext();
    const { engine } = createEngine(context, 4);
    await engine.activateFromTrustedGesture(true);

    const emitted = engine.emitBatch(
      WARPKEEP_SFX_EVENT_KINDS.map(eventForKind)
    );
    expect(emitted).toBeGreaterThan(0);
    expect(engine.snapshot().activeVoices).toBeLessThanOrEqual(4);
    expect(context.buffersCreated).toBe(1);
    expect(context.sources.length + context.oscillators.length).toBeGreaterThan(0);
    for (const source of [...context.sources, ...context.oscillators]) {
      expect(source.starts).toHaveLength(1);
      expect(source.stops.length).toBeGreaterThanOrEqual(1);
      expect(source.stops.every(Number.isFinite)).toBe(true);
      expect(source.stops.some((stop) => stop > source.starts[0])).toBe(true);
    }
  });

  it('lets a critical confirmation replace one lower-priority voice at capacity', async () => {
    const context = new FakeAudioContext();
    const { engine } = createEngine(context, 1);
    await engine.activateFromTrustedGesture(true);

    expect(engine.emit({ kind: 'ui-press' })).toBe(true);
    const replacedSources = [...context.sources, ...context.oscillators];
    expect(engine.emit({ kind: 'worker-dispatch-confirmed', count: 1 })).toBe(true);
    expect(engine.snapshot().activeVoices).toBe(1);
    expect(replacedSources.every((source) => source.stops.includes(0))).toBe(true);
    expect(replacedSources.every((source) => source.disconnected)).toBe(true);
  });

  it('drops a passive cue rather than stealing a critical confirmation', async () => {
    const context = new FakeAudioContext();
    const { engine } = createEngine(context, 1);
    await engine.activateFromTrustedGesture(true);

    expect(engine.emit({ kind: 'worker-dispatch-confirmed', count: 1 })).toBe(true);
    expect(engine.emit({ kind: 'ui-press' })).toBe(false);
    expect(engine.snapshot().activeVoices).toBe(1);
  });

  it('stops and gates voices while muted or hidden without replay on resume', async () => {
    const context = new FakeAudioContext();
    const { engine } = createEngine(context);
    await engine.activateFromTrustedGesture(true);
    expect(engine.emit({ kind: 'select-keep' })).toBe(true);
    expect(engine.snapshot().activeVoices).toBe(1);

    engine.setMuted(true);
    expect(engine.snapshot().activeVoices).toBe(0);
    expect(context.gains[2]?.gain.linearRamps.at(-1)).toEqual({
      at: 0.025,
      value: 0.0001
    });
    expect(
      [...context.sources, ...context.oscillators]
        .every((source) => source.stops.includes(0.025))
    ).toBe(true);
    expect(engine.emit({ kind: 'select-gold' })).toBe(false);
    engine.setMuted(false);
    expect(engine.snapshot().activeVoices).toBe(0);

    engine.setHidden(true);
    expect(context.suspend).toHaveBeenCalledOnce();
    engine.setHidden(false);
    expect(context.state).toBe('suspended');
    expect(engine.emit({ kind: 'select-water', regime: 'river' })).toBe(false);
    await engine.activateFromTrustedGesture(true);
    expect(context.resume).toHaveBeenCalledTimes(2);
    expect(engine.emit({ kind: 'select-water', regime: 'river' })).toBe(true);

    engine.dispose();
    expect(context.close).toHaveBeenCalledOnce();
    expect(engine.snapshot().contextCreated).toBe(false);
  });

  it('clears ended listeners and disconnects every finite voice node', async () => {
    const context = new FakeAudioContext();
    const { engine } = createEngine(context);
    await engine.activateFromTrustedGesture(true);

    expect(engine.emit({ kind: 'select-keep' })).toBe(true);
    const sources = [...context.sources, ...context.oscillators];
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) source.onended?.();

    expect(engine.snapshot().activeVoices).toBe(0);
    expect(sources.every((source) => source.onended === null)).toBe(true);
    expect(sources.every((source) => source.disconnected)).toBe(true);
  });
});

describe('OfflineAudioContext safety', () => {
  it('renders and measures every event when the browser provides offline WebAudio', async () => {
    if (typeof OfflineAudioContext === 'undefined') return;

    for (const kind of WARPKEEP_SFX_EVENT_KINDS) {
      const buffer = await renderWarpkeepSfxEventOffline(eventForKind(kind), 22_050);
      expect(buffer).toBeDefined();
      const metrics = measureWarpkeepAudioBuffer(buffer!);
      expect(metrics.durationSeconds).toBeLessThan(0.55);
      expect(metrics.nonFiniteSamples).toBe(0);
      expect(metrics.peak).toBeLessThan(0.99);
      expect(metrics.clippedFraction).toBe(0);
      expect(Math.abs(metrics.dcOffset)).toBeLessThan(0.05);
      expect(metrics.rms).toBeGreaterThan(0);
      expect(metrics.tailSilenceSeconds).toBeGreaterThan(0.02);
      expect(Number.isFinite(metrics.spectralCentroidHz)).toBe(true);
      expect(metrics.highFrequencyEnergyRatio).toBeGreaterThanOrEqual(0);
      expect(metrics.highFrequencyEnergyRatio).toBeLessThanOrEqual(1);
    }
  });
});

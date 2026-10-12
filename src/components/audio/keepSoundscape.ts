// The keep's quiet soundscape: a soft breeze bed with sparse birdsong by day,
// and crickets with a rare owl after dusk. It is presentation only: the state
// carries no player, keep or Realm value, and it plays only while a keep scene
// publishes that it is on screen, the page is visible and sound is unmuted.
// Every phrase is finite, scheduled one at a time and stopped on any gate.

export type WarpkeepKeepAmbienceState = Readonly<{
  active: boolean;
  /** 0 by day … 1 at night (from the daylight mood). */
  night: number;
}>;

export const WARPKEEP_KEEP_AMBIENCE_OFF: WarpkeepKeepAmbienceState = Object.freeze({ active: false, night: 0 });

function clampUnit(value: number) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export function normalizeWarpkeepKeepAmbience(state: WarpkeepKeepAmbienceState): WarpkeepKeepAmbienceState {
  if (state.active !== true) return WARPKEEP_KEEP_AMBIENCE_OFF;
  return Object.freeze({ active: true, night: Math.round(clampUnit(state.night) * 20) / 20 });
}

type KeepAmbienceListener = (state: WarpkeepKeepAmbienceState) => void;
const publisherStates = new Map<symbol, WarpkeepKeepAmbienceState>();
const listeners = new Set<KeepAmbienceListener>();
let resolved = WARPKEEP_KEEP_AMBIENCE_OFF;

function resolve() {
  // Any active keep scene keeps the soundscape on; the most recent mood wins.
  let next = WARPKEEP_KEEP_AMBIENCE_OFF;
  for (const state of publisherStates.values()) if (state.active) next = state;
  if (next.active === resolved.active && next.night === resolved.night) return;
  resolved = next;
  for (const listener of listeners) listener(resolved);
}

export type WarpkeepKeepAmbiencePublisher = Readonly<{
  publish: (state: WarpkeepKeepAmbienceState) => void;
  dispose: () => void;
}>;

/** One opaque token per scene generation, so a retiring renderer cannot silence its successor. */
export function createWarpkeepKeepAmbiencePublisher(): WarpkeepKeepAmbiencePublisher {
  const token = Symbol('warpkeep-keep-ambience-publisher');
  let disposed = false;
  return Object.freeze({
    publish: input => {
      if (disposed) return;
      const state = normalizeWarpkeepKeepAmbience(input);
      if (state.active) publisherStates.set(token, state); else publisherStates.delete(token);
      resolve();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true; publisherStates.delete(token); resolve();
    },
  });
}

export function subscribeWarpkeepKeepAmbience(listener: KeepAmbienceListener) {
  listeners.add(listener); listener(resolved);
  return () => { listeners.delete(listener); };
}

export type KeepSoundscapeTimers = Readonly<{
  setTimeout: (callback: () => void, milliseconds: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}>;

type Voice = Readonly<{ nodes: readonly AudioNode[]; sources: readonly (OscillatorNode | AudioBufferSourceNode)[]; endsAt: number }>;

const MIN_GAIN = 0.0001;

/** Small deterministic generator so phrase timing never depends on global randomness. */
export function keepSoundscapeRandom(seed = 0x5eed_b17d) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type KeepSoundscapeOptions = Readonly<{
  random?: () => number;
  timers?: KeepSoundscapeTimers;
  /** The engine's voice gate: phrases never take room from gameplay cues. */
  canStartPhrase?: () => boolean;
}>;

export class KeepSoundscape {
  private readonly random: () => number;
  private readonly timers: KeepSoundscapeTimers;
  private readonly canStartPhrase: () => boolean;
  private state = WARPKEEP_KEEP_AMBIENCE_OFF;
  private bed: Voice & Readonly<{ gain: GainNode }> | undefined;
  private phrase: Voice | undefined;
  private timer: unknown;
  private disposed = false;

  constructor(private readonly context: BaseAudioContext, private readonly destination: AudioNode, private readonly noise: AudioBuffer, options: KeepSoundscapeOptions = {}) {
    this.random = options.random ?? keepSoundscapeRandom();
    this.timers = options.timers ?? {
      setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
      clearTimeout: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
    };
    this.canStartPhrase = options.canStartPhrase ?? (() => true);
  }

  /** Physical voices currently sounding (bed and at most one phrase). */
  activeVoices() {
    this.pruneFinished();
    return Number(this.bed !== undefined) + Number(this.phrase !== undefined);
  }

  setState(input: WarpkeepKeepAmbienceState) {
    if (this.disposed) return;
    this.state = normalizeWarpkeepKeepAmbience(input);
    if (!this.state.active) { this.stop(); return; }
    this.ensureBed();
    if (this.timer === undefined) this.scheduleNext(600 + this.random() * 900);
  }

  /** Releases everything immediately (mute, hidden page, voice pressure or disposal). */
  stop() {
    if (this.timer !== undefined) { this.timers.clearTimeout(this.timer); this.timer = undefined; }
    for (const voice of [this.bed, this.phrase]) if (voice) this.release(voice);
    this.bed = undefined; this.phrase = undefined;
  }

  dispose() {
    if (this.disposed) return;
    this.stop(); this.disposed = true;
  }

  private release(voice: Voice) {
    for (const source of voice.sources) {
      source.onended = null;
      try { source.stop(); } catch { /* an ended source cannot be stopped again */ }
    }
    for (const node of voice.nodes) {
      try { node.disconnect(); } catch { /* already released */ }
    }
  }

  private pruneFinished() {
    if (this.phrase && this.phrase.endsAt <= this.context.currentTime) { this.release(this.phrase); this.phrase = undefined; }
  }

  private ensureBed() {
    const now = this.context.currentTime;
    const target = (.016 - this.state.night * .005);
    if (!this.bed) {
      const source = this.context.createBufferSource(); const band = this.context.createBiquadFilter();
      const gain = this.context.createGain(); const gust = this.context.createOscillator(); const gustDepth = this.context.createGain();
      source.buffer = this.noise; source.loop = true;
      band.type = 'bandpass'; band.frequency.value = 520; band.Q.value = .45;
      gain.gain.value = MIN_GAIN; gust.type = 'sine'; gust.frequency.value = .07; gustDepth.gain.value = .005;
      source.connect(band); band.connect(gain); gain.connect(this.destination); gust.connect(gustDepth); gustDepth.connect(gain.gain);
      source.start(now, this.noise.duration * .37); gust.start(now);
      this.bed = Object.freeze({ nodes: Object.freeze([source, band, gain, gust, gustDepth]), sources: Object.freeze([source, gust]), endsAt: Infinity, gain });
    }
    const param = this.bed.gain.gain;
    param.cancelScheduledValues(now); param.setValueAtTime(Math.max(MIN_GAIN, param.value), now);
    param.linearRampToValueAtTime(Math.max(MIN_GAIN, target), now + 1.2);
  }

  private scheduleNext(milliseconds: number) {
    this.timer = this.timers.setTimeout(() => {
      this.timer = undefined;
      if (this.disposed || !this.state.active) return;
      this.pruneFinished();
      if (!this.phrase && this.canStartPhrase()) this.playPhrase();
      const night = this.state.night > .5;
      this.scheduleNext(night ? 1_100 + this.random() * 2_200 : 2_600 + this.random() * 5_400);
    }, milliseconds);
  }

  private playPhrase() {
    const night = this.state.night > .5;
    const start = this.context.currentTime + .02;
    const pan = (this.random() - .5) * 1.1;
    const notes: Array<{ at: number; from: number; to: number; duration: number; gain: number; type: OscillatorType }> = [];
    if (night && this.random() < .06) {
      // A distant tawny owl: two soft falling hoots.
      notes.push({ at: 0, from: 392, to: 368, duration: .28, gain: .03, type: 'sine' });
      notes.push({ at: .46, from: 372, to: 344, duration: .38, gain: .028, type: 'sine' });
    } else if (night) {
      // A cricket trill: short high pulses.
      const pitch = 4_200 + this.random() * 500; const pulses = 5 + Math.floor(this.random() * 3);
      for (let i = 0; i < pulses; i++) notes.push({ at: i * .038, from: pitch, to: pitch * .99, duration: .018, gain: .012, type: 'sine' });
    } else {
      // A small songbird: two to four rising chirps.
      const base = 2_500 + this.random() * 1_100; const chirps = 2 + Math.floor(this.random() * 3);
      for (let i = 0; i < chirps; i++) {
        const lift = 1.18 + this.random() * .22;
        notes.push({ at: i * (.075 + this.random() * .045), from: base * (1 + i * .04), to: base * lift, duration: .045 + this.random() * .03, gain: .026, type: 'sine' });
      }
    }
    const input = this.context.createGain(); input.gain.value = 1;
    const nodes: AudioNode[] = [input]; const sources: OscillatorNode[] = [];
    let output: AudioNode = input;
    if (typeof this.context.createStereoPanner === 'function') {
      const panner = this.context.createStereoPanner(); panner.pan.value = Math.max(-.6, Math.min(.6, pan));
      input.connect(panner); nodes.push(panner); output = panner;
    }
    output.connect(this.destination);
    let endsAt = start;
    for (const note of notes) {
      const at = start + note.at; const end = at + note.duration;
      const oscillator = this.context.createOscillator(); const envelope = this.context.createGain();
      oscillator.type = note.type;
      oscillator.frequency.setValueAtTime(note.from, at); oscillator.frequency.exponentialRampToValueAtTime(note.to, end);
      envelope.gain.setValueAtTime(MIN_GAIN, at); envelope.gain.linearRampToValueAtTime(note.gain, at + Math.min(.008, note.duration / 3));
      envelope.gain.exponentialRampToValueAtTime(MIN_GAIN, end);
      oscillator.connect(envelope); envelope.connect(input);
      oscillator.start(at); oscillator.stop(end + .01);
      nodes.push(oscillator, envelope); sources.push(oscillator); endsAt = Math.max(endsAt, end + .01);
    }
    this.phrase = Object.freeze({ nodes: Object.freeze(nodes), sources: Object.freeze(sources), endsAt });
  }
}

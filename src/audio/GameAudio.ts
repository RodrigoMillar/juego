/**
 * Audio del juego.
 *
 * - Motor sintetizado con Web Audio: cambia de tono con la velocidad y de
 *   volumen con el acelerador.
 * - Música: intenta cargar `public/music/return-of-the-tres.mp3`. Si no
 *   existe, suena un loop synthwave original generado en tiempo real.
 * - También se puede cargar un MP3 propio desde la interfaz.
 */

export interface AudioSettings {
  music: boolean;
  engine: boolean;
  musicVolume: number;
  engineVolume: number;
}

const SETTINGS_KEY = 'neonracer:audio';
const DEFAULT_TRACK = `${import.meta.env.BASE_URL}music/return-of-the-tres.mp3`;

const DEFAULT_SETTINGS: AudioSettings = {
  music: true,
  engine: true,
  musicVolume: 0.32,
  engineVolume: 0.85,
};

function clamp01(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      music: parsed.music !== false,
      engine: parsed.engine !== false,
      musicVolume: clamp01(parsed.musicVolume, DEFAULT_SETTINGS.musicVolume),
      engineVolume: clamp01(parsed.engineVolume, DEFAULT_SETTINGS.engineVolume),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export type MusicSource = 'default' | 'synth' | 'custom';

/** Loop synthwave original para cuando no hay MP3 disponible. */
class NeonSynth {
  private timer = 0;
  private step = 0;
  private nextTime = 0;
  private running = false;
  private readonly out: GainNode;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    volume: number,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = volume;
    this.out.connect(destination);
  }

  setVolume(value: number): void {
    this.out.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.06;
    this.timer = window.setInterval(() => this.schedule(), 60);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    window.clearInterval(this.timer);
    this.timer = 0;
  }

  dispose(): void {
    this.stop();
    this.out.disconnect();
  }

  private schedule(): void {
    if (!this.running) return;
    const stepDuration = 60 / 112 / 4;
    while (this.nextTime < this.ctx.currentTime + 0.18) {
      this.playStep(this.step, this.nextTime, stepDuration);
      this.nextTime += stepDuration;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(step: number, time: number, stepDuration: number): void {
    const bar = Math.floor(step / 16);
    const inBar = step % 16;
    const roots = [55, 43.65, 65.41, 49];
    const chords = [
      [220, 261.63, 329.63],
      [174.61, 220, 261.63],
      [261.63, 329.63, 392],
      [196, 246.94, 293.66],
    ];

    // Bombo cuatro por cuatro.
    if (inBar % 4 === 0) this.kick(time, 1);
    // Caja en el 2 y el 4.
    if (inBar === 4 || inBar === 12) this.noiseHit(time, 0.18, 1900, 0.16);
    // Hi-hats a contratiempo.
    if (inBar % 4 === 2) this.noiseHit(time, 0.05, 7200, 0.07);

    // Bajo en corcheas.
    if (inBar % 4 === 0 || inBar === 6 || inBar === 10 || inBar === 14) {
      this.tone(roots[bar] * (inBar >= 8 ? 1 : 1), time, stepDuration * 1.7, 'sawtooth', 0.16, 380);
    }

    // Arpegio.
    if (inBar % 2 === 0) {
      const notes = chords[bar];
      const note = notes[(inBar / 2) % notes.length];
      this.tone(note, time, stepDuration * 1.4, 'triangle', 0.075, 2600);
    }
  }

  private tone(
    frequency: number,
    time: number,
    duration: number,
    type: OscillatorType,
    gainValue: number,
    cutoff: number,
  ): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(gainValue, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.out);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  private kick(time: number, level: number): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.16);
    gain.gain.setValueAtTime(0.34 * level, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
    osc.connect(gain);
    gain.connect(this.out);
    osc.start(time);
    osc.stop(time + 0.26);
  }

  private noiseHit(time: number, duration: number, cutoff: number, level: number): void {
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = cutoff;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.out);
    source.start(time);
    source.stop(time + duration + 0.02);
  }
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineBus: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineOscA: OscillatorNode | null = null;
  private engineOscB: OscillatorNode | null = null;
  private engineOscC: OscillatorNode | null = null;
  private engineDistortion: WaveShaperNode | null = null;
  private exhaustFilter: BiquadFilterNode | null = null;
  private exhaustGain: GainNode | null = null;
  private exhaustSource: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private windSource: AudioBufferSourceNode | null = null;
  private previousThrottle = false;
  private synth: NeonSynth | null = null;

  private readonly musicEl: HTMLAudioElement;
  private settings = loadSettings();
  private unlocked = false;
  private engineRunning = false;
  private musicSource: MusicSource = 'default';
  private customUrl: string | null = null;
  private defaultFailed = false;

  onNotice: ((message: string) => void) | null = null;

  constructor() {
    this.musicEl = new Audio();
    this.musicEl.loop = true;
    this.musicEl.preload = 'auto';
    this.musicEl.volume = this.settings.musicVolume;
    this.musicEl.crossOrigin = 'anonymous';
    this.musicEl.addEventListener('error', () => this.handleTrackError());
    this.musicEl.addEventListener('playing', () => {
      if (this.musicSource === 'default') this.emitNotice(null);
    });
    this.loadDefaultTrack();
  }

  get audioSettings(): AudioSettings {
    return { ...this.settings };
  }

  get source(): MusicSource {
    return this.musicSource;
  }

  get sourceLabel(): string {
    if (this.musicSource === 'custom') return this.musicEl.dataset.name || 'MP3 propio';
    if (this.musicSource === 'synth') return 'Synthwave original';
    return 'Return of the Tres';
  }

  /** Debe llamarse desde un gesto del usuario (click/tecla). */
  unlock(): void {
    if (this.unlocked) {
      void this.ensureRunning();
      return;
    }
    this.unlocked = true;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) {
      this.ctx = new Ctor();
      this.buildGraph();
    }
    void this.ensureRunning();
    this.applyMusic();
  }

  setMusicEnabled(enabled: boolean): void {
    this.settings.music = enabled;
    this.save();
    this.applyMusic();
  }

  setEngineEnabled(enabled: boolean): void {
    this.settings.engine = enabled;
    this.save();
    if (!enabled) this.silenceEngine();
  }

  setMusicVolume(value: number): void {
    this.settings.musicVolume = clamp01(value, this.settings.musicVolume);
    this.musicEl.volume = this.settings.musicVolume;
    this.synth?.setVolume(this.settings.musicVolume);
    this.save();
  }

  setEngineVolume(value: number): void {
    this.settings.engineVolume = clamp01(value, this.settings.engineVolume);
    this.engineBus?.gain.setTargetAtTime(
      this.settings.engine ? this.settings.engineVolume : 0,
      this.ctx?.currentTime ?? 0,
      0.08,
    );
    this.save();
  }

  useCustomTrack(file: File): void {
    if (this.customUrl) URL.revokeObjectURL(this.customUrl);
    this.customUrl = URL.createObjectURL(file);
    this.musicSource = 'custom';
    this.musicEl.dataset.name = file.name.replace(/\.(mp3|ogg|wav|m4a)$/i, '');
    this.musicEl.src = this.customUrl;
    this.musicEl.load();
    this.settings.music = true;
    this.save();
    this.applyMusic();
  }

  useDefaultTrack(): void {
    if (this.customUrl) {
      URL.revokeObjectURL(this.customUrl);
      this.customUrl = null;
    }
    this.musicSource = 'default';
    this.defaultFailed = false;
    this.loadDefaultTrack();
    this.applyMusic();
  }

  startEngine(): void {
    if (!this.ctx || !this.engineBus) return;
    this.engineRunning = true;
    this.engineBus.gain.setTargetAtTime(
      this.settings.engine ? this.settings.engineVolume * 0.9 : 0,
      this.ctx.currentTime,
      0.2,
    );
    if (this.exhaustGain) {
      this.exhaustGain.gain.setTargetAtTime(this.settings.engine ? 0.02 : 0, this.ctx.currentTime, 0.3);
    }
    if (this.windGain) {
      this.windGain.gain.setTargetAtTime(this.settings.engine ? 0.05 : 0, this.ctx.currentTime, 0.3);
    }
  }

  stopEngine(): void {
    this.engineRunning = false;
    this.silenceEngine();
  }

  /** Llamado ~60 veces por segundo desde la carrera. */
  updateEngine(params: {
    speedRatio: number;
    throttle: boolean;
    braking: boolean;
    offroad: boolean;
  }): void {
    if (!this.ctx || !this.engineRunning || !this.settings.engine) return;
    if (!this.engineOscA || !this.engineOscB || !this.engineOscC || !this.engineFilter || !this.engineBus) return;

    const now = this.ctx.currentTime;
    const ratio = Math.max(0, Math.min(1, params.speedRatio));
    const load = params.throttle ? 1 : params.braking ? 0.2 : 0.4;

    // Escape libre: más armónicos y distorsión.
    const base = 58 + ratio * 175 + (params.throttle ? 14 : 0);
    this.engineOscA.frequency.setTargetAtTime(base, now, 0.045);
    this.engineOscB.frequency.setTargetAtTime(base * 1.5, now, 0.045);
    this.engineOscC.frequency.setTargetAtTime(base * 0.5, now, 0.045);
    this.engineFilter.frequency.setTargetAtTime(
      520 + ratio * 2600 + (params.throttle ? 420 : 0),
      now,
      0.07,
    );
    const gain = (0.07 + ratio * 0.09 + load * 0.05) * this.settings.engineVolume;
    this.engineBus.gain.setTargetAtTime(gain, now, 0.08);

    if (this.exhaustGain) {
      this.exhaustGain.gain.setTargetAtTime(0.025 + ratio * 0.06 + (params.throttle ? 0.03 : 0), now, 0.12);
    }
    if (this.exhaustFilter) {
      this.exhaustFilter.frequency.setTargetAtTime(1200 + ratio * 1800, now, 0.15);
    }

    if (this.windGain) {
      this.windGain.gain.setTargetAtTime(0.012 + ratio * 0.045, now, 0.2);
    }

    // Petardeo al soltar el acelerador.
    if (this.previousThrottle && !params.throttle && ratio > 0.25) {
      this.backfire();
    }
    this.previousThrottle = params.throttle;
  }

  private backfire(): void {
    if (!this.ctx || !this.settings.engine || !this.master) return;
    const ctx = this.ctx;
    const time = ctx.currentTime;
    const length = Math.floor(ctx.sampleRate * 0.12);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 1.6);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 620;
    filter.Q.value = 1.4;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.22 * this.settings.engineVolume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(time);
    source.stop(time + 0.16);
  }

  countdownBeep(final: boolean): void {
    if (!this.ctx || !this.settings.engine) return;
    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = final ? 'square' : 'sine';
    osc.frequency.setValueAtTime(final ? 880 : 520, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.14, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    osc.connect(gain);
    gain.connect(this.master ?? this.ctx.destination);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  dispose(): void {
    this.stopEngine();
    this.musicEl.pause();
    this.musicEl.removeAttribute('src');
    this.synth?.dispose();
    this.synth = null;
    if (this.customUrl) {
      URL.revokeObjectURL(this.customUrl);
      this.customUrl = null;
    }
    void this.ctx?.close();
    this.ctx = null;
  }

  // -------------------------------------------------------------------------
  // Interno
  // -------------------------------------------------------------------------
  private buildGraph(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    this.engineBus = ctx.createGain();
    this.engineBus.gain.value = 0;
    this.engineBus.connect(this.master);

    // Distorsión para escape libre.
    this.engineDistortion = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i += 1) {
      const x = (i / 128) - 1;
      curve[i] = Math.tanh(x * 1.1) * 0.45;
    }
    this.engineDistortion.curve = curve;
    this.engineDistortion.oversample = '2x';
    this.engineDistortion.connect(this.engineBus);

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 600;
    this.engineFilter.Q.value = 4.5;
    this.engineFilter.connect(this.engineDistortion);

    this.engineOscA = ctx.createOscillator();
    this.engineOscA.type = 'sawtooth';
    this.engineOscA.frequency.value = 58;
    this.engineOscA.connect(this.engineFilter);

    this.engineOscB = ctx.createOscillator();
    this.engineOscB.type = 'triangle';
    this.engineOscB.frequency.value = 87;
    this.engineOscB.detune.value = 4;
    this.engineOscB.connect(this.engineFilter);

    this.engineOscC = ctx.createOscillator();
    this.engineOscC.type = 'sine';
    this.engineOscC.frequency.value = 29;
    this.engineOscC.connect(this.engineFilter);

    // Escape / resonancia metálica.
    this.exhaustGain = ctx.createGain();
    this.exhaustGain.gain.value = 0;
    this.exhaustGain.connect(this.master);

    this.exhaustFilter = ctx.createBiquadFilter();
    this.exhaustFilter.type = 'bandpass';
    this.exhaustFilter.frequency.value = 1300;
    this.exhaustFilter.Q.value = 2.2;
    this.exhaustFilter.connect(this.exhaustGain);

    const exhaustLength = Math.floor(ctx.sampleRate * 1.5);
    const exhaustBuffer = ctx.createBuffer(1, exhaustLength, ctx.sampleRate);
    const exhaustData = exhaustBuffer.getChannelData(0);
    for (let i = 0; i < exhaustLength; i += 1) exhaustData[i] = Math.random() * 2 - 1;
    this.exhaustSource = ctx.createBufferSource();
    this.exhaustSource.buffer = exhaustBuffer;
    this.exhaustSource.loop = true;
    this.exhaustSource.connect(this.exhaustFilter);
    this.exhaustSource.start();

    // Viento.
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 900;
    windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    windFilter.connect(this.windGain);
    this.windGain.connect(this.master);

    const length = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    this.windSource = ctx.createBufferSource();
    this.windSource.buffer = buffer;
    this.windSource.loop = true;
    this.windSource.connect(windFilter);
    this.windSource.start();

    this.engineOscA.start();
    this.engineOscB.start();
    this.engineOscC.start();

    this.synth = new NeonSynth(ctx, this.master, this.settings.musicVolume);
  }

  private async ensureRunning(): Promise<void> {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // El navegador aún no permite audio; se reintentará en el próximo gesto.
      }
    }
  }

  private applyMusic(): void {
    if (!this.settings.music) {
      this.musicEl.pause();
      this.synth?.stop();
      return;
    }
    void this.ensureRunning();
    if (this.musicSource === 'synth') {
      this.musicEl.pause();
      this.synth?.start();
      return;
    }
    this.synth?.stop();
    this.musicEl.volume = this.settings.musicVolume;
    const attempt = this.musicEl.play();
    if (attempt) {
      attempt.catch(() => {
        // Autoplay bloqueado: se reintenta al desbloquear con un gesto.
      });
    }
  }

  private loadDefaultTrack(): void {
    this.musicSource = 'default';
    this.musicEl.src = DEFAULT_TRACK;
    this.musicEl.load();
  }

  private handleTrackError(): void {
    if (this.musicSource === 'custom') {
      this.emitNotice('No se pudo reproducir ese MP3. Prueba con otro archivo.');
      this.useDefaultTrack();
      return;
    }
    if (this.musicSource !== 'default' || this.defaultFailed) return;
    this.defaultFailed = true;
    this.musicSource = 'synth';
    this.musicEl.pause();
    if (this.settings.music) {
      this.synth?.start();
      this.emitNotice(
        'No encontré return-of-the-tres.mp3: suena un synthwave original. Carga tu MP3 desde el menú de audio.',
      );
    }
  }

  private silenceEngine(): void {
    if (this.ctx && this.engineBus) {
      this.engineBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    }
    if (this.ctx && this.exhaustGain) {
      this.exhaustGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    }
    if (this.ctx && this.windGain) {
      this.windGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    }
  }

  private save(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // Sin persistencia disponible.
    }
  }

  private lastNotice: string | null = null;
  private emitNotice(message: string | null): void {
    if (message === this.lastNotice) return;
    this.lastNotice = message;
    this.onNotice?.(message ?? '');
  }
}

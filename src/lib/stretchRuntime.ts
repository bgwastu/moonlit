export interface SignalsmithStretchInstance {
  connect(node: AudioNode): void;
  disconnect(): void;
  addBuffers(buffers: Float32Array[]): Promise<void>;
  seek(timeSeconds: number): void;
  stop(): void;
  schedule(opts: {
    active?: boolean;
    input?: number;
    rate?: number;
    semitones?: number;
    loopStart?: number;
    loopEnd?: number;
  }): void;
  inputTime: number;
  setTransposeSemitones(semitones: number): void;
  process(input: Float32Array[], output: Float32Array[], numFrames: number): void;
}

export interface PlayerRuntime {
  audioContext: AudioContext | null;
  stretch: SignalsmithStretchInstance | null;
  buffer: AudioBuffer | null;
  convolver: ConvolverNode | null;
  dryGain: GainNode | null;
  wetGain: GainNode | null;
  masterGain: GainNode | null;
  isPlaying: boolean;
  duration: number;
  rate: number;
  semitones: number;
  volume: number;
  reverbAmount: number;
  repeat: boolean;
  currentPosition: number;
  pendingSeek: number | null;
  rafId: number | null;
  lastUiUpdateMs: number;
  onEnded?: () => void;
}

const UI_UPDATE_INTERVAL = 100;
const DRIFT_THRESHOLD = 0.25;

export function syncMediaSession(
  position: number,
  duration: number,
  playbackRate = 1,
): void {
  if ("mediaSession" in navigator && "setPositionState" in navigator.mediaSession) {
    try {
      navigator.mediaSession.setPositionState({
        duration: duration || 0,
        playbackRate: Math.max(0.25, playbackRate),
        position,
      });
    } catch {
      // Some browsers reject invalid position ranges.
    }
  }
}

export function startStretchTick(
  runtime: PlayerRuntime,
  setCurrentTime: (t: number) => void,
  setIsPlaying: (p: boolean) => void,
  syncPosition = false,
): void {
  const tick = () => {
    if (!runtime.stretch) {
      runtime.rafId = null;
      return;
    }
    if (runtime.isPlaying) {
      const reportedTime = runtime.stretch.inputTime;
      const pendingSeek = runtime.pendingSeek;
      const t =
        pendingSeek !== null &&
        (!Number.isFinite(reportedTime) ||
          Math.abs(reportedTime - pendingSeek) > DRIFT_THRESHOLD)
          ? pendingSeek
          : reportedTime;
      if (pendingSeek !== null && t === reportedTime) runtime.pendingSeek = null;
      if (Number.isFinite(t)) runtime.currentPosition = t;
      const now = performance.now();
      if (now - runtime.lastUiUpdateMs > UI_UPDATE_INTERVAL) {
        const clamped = Number.isFinite(t) ? Math.min(t, runtime.duration) : 0;
        setCurrentTime(clamped);
        if (syncPosition) {
          syncMediaSession(clamped, runtime.duration, runtime.rate);
        }
        runtime.lastUiUpdateMs = now;
      }
      if (t >= runtime.duration - 0.05) {
        if (runtime.repeat) {
          runtime.stretch.schedule({
            input: 0,
            rate: runtime.rate,
            semitones: runtime.semitones,
            active: true,
          });
        } else {
          runtime.stretch.schedule({ active: false });
          runtime.isPlaying = false;
          setIsPlaying(false);
          setCurrentTime(runtime.duration);
          runtime.onEnded?.();
          runtime.rafId = null;
          return;
        }
      }
    }
    runtime.rafId = requestAnimationFrame(tick);
  };
  runtime.rafId = requestAnimationFrame(tick);
}

export function generateImpulseResponse(
  context: AudioContext,
  dur = 2,
  decay = 2,
): AudioBuffer {
  const length = context.sampleRate * dur;
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = impulse.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const n = i / context.sampleRate;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / dur, decay);
    }
  }
  return impulse;
}

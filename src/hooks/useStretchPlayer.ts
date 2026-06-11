import { useCallback, useEffect, useRef, useState } from "react";

type StretchPlayerState = "loading" | "ready" | "error";

interface UseStretchPlayerProps {
  fileUrl: string;
  liteMode?: boolean;
  initialRate?: number;
  initialSemitones?: number;
  initialPosition?: number;
  initialReverbAmount?: number;
  initialVolume?: number;
  autoPlay?: boolean;
  isRepeat?: boolean;
  onEnded?: () => void;
  onError?: (e: unknown) => void;
}

interface UseStretchPlayerReturn {
  audioRef: React.RefObject<HTMLAudioElement>;
  state: StretchPlayerState;
  isPlaying: boolean;
  currentTime: number;
  buffered: number;
  duration: number;
  rate: number;
  semitones: number;
  reverbAmount: number;
  volume: number;
  isNativeFallback: boolean;
  play: (startTime?: number) => void;
  pause: () => void;
  togglePlayback: () => void;
  setRate: (rate: number) => void;
  setSemitones: (semitones: number) => void;
  setReverbAmount: (amount: number) => void;
  setVolume: (volume: number) => void;
  seek: (timeSeconds: number) => void;
}

interface SignalsmithStretchInstance {
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

interface PlayerRuntime {
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
  rafId: number | null;
  lastUiUpdateMs: number;
  onEnded?: () => void;
}

const UI_UPDATE_INTERVAL = 100;
const DRIFT_THRESHOLD = 0.25;

function generateImpulseResponse(context: AudioContext, dur = 2, decay = 2): AudioBuffer {
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

export function useStretchPlayer({
  fileUrl,
  liteMode = false,
  initialRate = 1,
  initialSemitones = 0,
  initialPosition = 0,
  initialReverbAmount = 0,
  initialVolume = 1,
  autoPlay = true,
  isRepeat = false,
  onEnded,
  onError: onPlayerError,
}: UseStretchPlayerProps): UseStretchPlayerReturn {
  const audioRef = useRef<HTMLAudioElement>(null);

  const [state, setState] = useState<StretchPlayerState>("loading");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rateState, setRateState] = useState(initialRate);
  const [semitonesState, setSemitonesState] = useState(initialSemitones);
  const [reverbAmountState, setReverbAmountState] = useState(initialReverbAmount);
  const [volumeState, setVolumeState] = useState(initialVolume);

  const runtime = useRef<PlayerRuntime>({
    audioContext: null,
    stretch: null,
    buffer: null,
    convolver: null,
    dryGain: null,
    wetGain: null,
    masterGain: null,
    isPlaying: false,
    duration: 0,
    rate: initialRate,
    semitones: initialSemitones,
    volume: initialVolume,
    reverbAmount: initialReverbAmount,
    repeat: isRepeat,
    rafId: null,
    lastUiUpdateMs: 0,
  });

  const liteCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    runtime.current.repeat = isRepeat;
    runtime.current.onEnded = onEnded;
  }, [isRepeat, onEnded]);

  const cleanup = useCallback(() => {
    liteCleanupRef.current?.();
    liteCleanupRef.current = null;

    const rt = runtime.current;
    if (rt.rafId !== null) {
      cancelAnimationFrame(rt.rafId);
      rt.rafId = null;
    }
    if (rt.stretch) {
      try {
        rt.stretch.stop();
        rt.stretch.disconnect();
      } catch {}
      rt.stretch = null;
    }
    [rt.convolver, rt.dryGain, rt.wetGain, rt.masterGain].forEach((n) => {
      if (n)
        try {
          n.disconnect();
        } catch {}
    });
    rt.convolver = null;
    rt.dryGain = null;
    rt.wetGain = null;
    rt.masterGain = null;
    if (rt.audioContext && rt.audioContext.state !== "closed") {
      rt.audioContext.close().catch(() => {});
      rt.audioContext = null;
    }
    rt.buffer = null;
    rt.isPlaying = false;
  }, []);

  const setupLite = useCallback(
    (audio: HTMLAudioElement, pos: number) => {
      audio.muted = false;
      audio.volume = initialVolume;
      audio.playbackRate = initialRate;
      (audio as any).preservesPitch = false;
      (audio as any).mozPreservesPitch = false;
      (audio as any).webkitPreservesPitch = false;

      const onTime = () => {
        setCurrentTime(audio.currentTime);
        if (audio.buffered.length > 0)
          setBuffered(audio.buffered.end(audio.buffered.length - 1));
      };
      const onProg = () => {
        if (audio.buffered.length > 0)
          setBuffered(audio.buffered.end(audio.buffered.length - 1));
      };
      const onEnd = () => {
        if (runtime.current.repeat) {
          audio.currentTime = 0;
          audio.play().catch(() => {});
        } else {
          setIsPlaying(false);
          setCurrentTime(audio.duration);
          runtime.current.onEnded?.();
        }
      };
      audio.addEventListener("timeupdate", onTime);
      audio.addEventListener("progress", onProg);
      audio.addEventListener("ended", onEnd);
      liteCleanupRef.current = () => {
        audio.removeEventListener("timeupdate", onTime);
        audio.removeEventListener("progress", onProg);
        audio.removeEventListener("ended", onEnd);
      };
      if (pos > 0) audio.currentTime = pos;
      setCurrentTime(pos);
    },
    [initialRate, initialVolume],
  );

  const setupFull = useCallback(
    async (audio: HTMLAudioElement, pos: number) => {
      const rt = runtime.current;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      rt.audioContext = audioContext;

      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      rt.buffer = audioBuffer;
      rt.duration = audioBuffer.duration;
      setDuration(audioBuffer.duration);

      const SignalsmithStretch = (await import("signalsmith-stretch")).default;
      const stretch = await SignalsmithStretch(audioContext);
      rt.stretch = stretch;

      const channelBuffers: Float32Array[] = [];
      for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
        channelBuffers.push(audioBuffer.getChannelData(c));
      }
      await stretch.addBuffers(channelBuffers);

      const convolver = audioContext.createConvolver();
      const dryGain = audioContext.createGain();
      const wetGain = audioContext.createGain();
      const masterGain = audioContext.createGain();

      convolver.buffer = generateImpulseResponse(audioContext, 2, 2);
      dryGain.gain.value = 1 - initialReverbAmount * 0.5;
      wetGain.gain.value = initialReverbAmount;
      masterGain.gain.value = initialVolume;

      stretch.connect(dryGain);
      stretch.connect(convolver);
      convolver.connect(wetGain);
      dryGain.connect(masterGain);
      wetGain.connect(masterGain);
      masterGain.connect(audioContext.destination);

      rt.convolver = convolver;
      rt.dryGain = dryGain;
      rt.wetGain = wetGain;
      rt.masterGain = masterGain;

      const resumePos = Math.max(0, Math.min(pos, audioBuffer.duration));
      stretch.schedule({
        active: false,
        input: resumePos,
        rate: initialRate,
        semitones: initialSemitones,
        loopStart: 0,
        loopEnd: 0,
      });
      setCurrentTime(resumePos);
    },
    [fileUrl, initialRate, initialSemitones, initialReverbAmount, initialVolume],
  );

  const initFullMode = useCallback(
    async (audio: HTMLAudioElement, pos: number) => {
      const rt = runtime.current;
      if (rt.stretch) {
        try {
          rt.stretch.stop();
          rt.stretch.disconnect();
        } catch {}
        rt.stretch = null;
      }
      if (rt.audioContext && rt.audioContext.state !== "closed") {
        rt.audioContext.close().catch(() => {});
        rt.audioContext = null;
      }
      await setupFull(audio, pos);

      const rt2 = runtime.current;
      if (rt2.stretch) {
        const tick = () => {
          if (!rt2.isPlaying || !rt2.stretch) {
            rt2.rafId = null;
            return;
          }
          const t = rt2.stretch.inputTime ?? 0;
          const now = performance.now();
          if (now - rt2.lastUiUpdateMs > UI_UPDATE_INTERVAL) {
            const clamped = Number.isFinite(t) ? Math.min(t, rt2.duration) : 0;
            setCurrentTime(clamped);
            rt2.lastUiUpdateMs = now;
          }
          if (t >= rt2.duration - 0.05) {
            if (rt2.repeat) {
              rt2.stretch.schedule({
                input: 0,
                rate: rt2.rate,
                semitones: rt2.semitones,
                active: true,
              });
            } else {
              rt2.stretch.schedule({ active: false });
              rt2.isPlaying = false;
              setIsPlaying(false);
              setCurrentTime(rt2.duration);
              rt2.onEnded?.();
              rt2.rafId = null;
              return;
            }
          }
          rt2.rafId = requestAnimationFrame(tick);
        };
        rt2.rafId = requestAnimationFrame(tick);
      }
    },
    [setupFull],
  );

  const posBeforeSwitch = useRef(0);

  useEffect(() => {
    if (!fileUrl) return;
    const audio = audioRef.current;
    if (!audio) return;
    let aborted = false;

    // Capture current position before re-init
    const rt = runtime.current;
    const currentPos = rt.stretch?.inputTime ?? audio.currentTime ?? 0;
    posBeforeSwitch.current = Number.isFinite(currentPos) ? currentPos : 0;

    const init = async () => {
      cleanup();
      setState("loading");

      try {
        const resumePos =
          posBeforeSwitch.current > 0 ? posBeforeSwitch.current : initialPosition;

        if (liteMode) {
          audio.muted = false;
          audio.src = fileUrl;
          audio.preload = "metadata";
          audio.load();
          await new Promise<void>((resolve, reject) => {
            if (audio.readyState >= 3) {
              resolve();
              return;
            }
            const onCanPlay = () => {
              audio.removeEventListener("canplay", onCanPlay);
              audio.removeEventListener("error", onError);
              resolve();
            };
            const onError = (e: Event) => {
              audio.removeEventListener("canplay", onCanPlay);
              audio.removeEventListener("error", onError);
              reject(new Error((e.target as HTMLAudioElement)?.error?.message || e.type));
            };
            audio.addEventListener("canplay", onCanPlay);
            audio.addEventListener("error", onError);
          });
          if (aborted) return;
          setDuration(audio.duration);
          setBuffered(0);
          setupLite(audio, resumePos);
        } else {
          audio.src = fileUrl;
          audio.load();
          await initFullMode(audio, resumePos);
          if (aborted) return;
        }

        setState("ready");
        if (autoPlay || posBeforeSwitch.current > 0) {
          setTimeout(() => {
            if (liteMode) {
              if (resumePos > 0) audio.currentTime = resumePos;
              audio.play().catch(() => {});
              setIsPlaying(true);
            } else {
              const rt2 = runtime.current;
              if (rt2.stretch && rt2.audioContext) {
                if (rt2.audioContext.state === "suspended") rt2.audioContext.resume();
                rt2.stretch.schedule({
                  active: true,
                  input: resumePos,
                  rate: rt2.rate,
                  semitones: rt2.semitones,
                });
                rt2.isPlaying = true;
                setIsPlaying(true);
                audio.muted = true;
                audio.play().catch(() => {});
              }
            }
          }, 50);
        }
      } catch (error) {
        if (!aborted) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error("StretchPlayer:", msg);
          setState("error");
          onPlayerError?.(error);
        }
      }
    };

    init();
    return () => {
      aborted = true;
      cleanup();
    };
  }, [
    fileUrl,
    liteMode,
    initialPosition,
    autoPlay,
    onPlayerError,
    cleanup,
    setupLite,
    initFullMode,
  ]);

  useEffect(() => cleanup, [cleanup]);

  const play = useCallback(
    async (startTime?: number) => {
      const a = audioRef.current;
      if (!a) return;
      const rt = runtime.current;
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";

      if (liteMode) {
        a.play().catch(() => {});
        setIsPlaying(true);
        return;
      }
      if (!rt.audioContext || !rt.stretch) return;
      if (rt.audioContext.state === "suspended") await rt.audioContext.resume();
      const t =
        startTime !== undefined && Number.isFinite(startTime)
          ? Math.max(0, Math.min(startTime, rt.duration))
          : (rt.stretch.inputTime ?? 0);
      rt.stretch.schedule({
        active: true,
        input: t,
        rate: rt.rate,
        semitones: rt.semitones,
      });
      rt.isPlaying = true;
      setIsPlaying(true);
      // Also play native element so OS detects playback (even muted, it registers as active)
      a.muted = true;
      a.play().catch(() => {});
      if (rt.rafId === null) {
        const tick = () => {
          if (!rt.isPlaying || !rt.stretch) {
            rt.rafId = null;
            return;
          }
          const t2 = rt.stretch.inputTime ?? 0;
          const now = performance.now();
          if (now - rt.lastUiUpdateMs > UI_UPDATE_INTERVAL) {
            const clamped = Number.isFinite(t2) ? Math.min(t2, rt.duration) : 0;
            setCurrentTime(clamped);
            if (
              "mediaSession" in navigator &&
              "setPositionState" in navigator.mediaSession
            ) {
              try {
                navigator.mediaSession.setPositionState({
                  duration: rt.duration,
                  playbackRate: Math.max(0.25, rt.rate),
                  position: clamped,
                });
              } catch {}
            }
            rt.lastUiUpdateMs = now;
          }
          if (t2 >= rt.duration - 0.05) {
            if (rt.repeat) {
              rt.stretch.schedule({
                input: 0,
                rate: rt.rate,
                semitones: rt.semitones,
                active: true,
              });
            } else {
              rt.stretch.schedule({ active: false });
              rt.isPlaying = false;
              setIsPlaying(false);
              setCurrentTime(rt.duration);
              rt.onEnded?.();
              rt.rafId = null;
              return;
            }
          }
          rt.rafId = requestAnimationFrame(tick);
        };
        rt.rafId = requestAnimationFrame(tick);
      }
    },
    [liteMode],
  );

  const pause = useCallback(() => {
    const rt = runtime.current;
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "paused";
      if ("setPositionState" in navigator.mediaSession) {
        try {
          const a = audioRef.current;
          navigator.mediaSession.setPositionState({
            duration: rt.duration || a?.duration || 0,
            playbackRate: 1,
            position: rt.stretch?.inputTime ?? a?.currentTime ?? 0,
          });
        } catch {}
      }
    }
    if (liteMode) {
      audioRef.current?.pause();
      setIsPlaying(false);
      return;
    }
    rt.isPlaying = false;
    setIsPlaying(false);
    if (rt.stretch) rt.stretch.schedule({ active: false });
    if (rt.rafId !== null) {
      cancelAnimationFrame(rt.rafId);
      rt.rafId = null;
    }
    audioRef.current?.pause();
  }, [liteMode]);

  const togglePlayback = useCallback(() => {
    isPlaying ? pause() : play();
  }, [isPlaying, play, pause]);

  const seek = useCallback(
    (t: number) => {
      if (!Number.isFinite(t)) return;
      const rt = runtime.current;
      if (liteMode) {
        const a = audioRef.current;
        if (!a) return;
        const clamped = Math.max(0, Math.min(t, a.duration || 0));
        a.currentTime = clamped;
        setCurrentTime(clamped);
        return;
      }
      const clamped = Math.max(0, Math.min(t, rt.duration));
      setCurrentTime(clamped);
      if (rt.stretch)
        rt.stretch.schedule({
          input: clamped,
          rate: rt.rate,
          semitones: rt.semitones,
          active: rt.isPlaying,
        });
    },
    [liteMode],
  );

  const setRate = useCallback(
    (r: number) => {
      const rt = runtime.current;
      rt.rate = r;
      setRateState(r);
      if (liteMode) {
        const a = audioRef.current;
        if (a) a.playbackRate = r;
        return;
      }
      if (rt.stretch) rt.stretch.schedule({ rate: r, semitones: rt.semitones });
    },
    [liteMode],
  );

  const setSemitones = useCallback((s: number) => {
    const rt = runtime.current;
    rt.semitones = s;
    setSemitonesState(s);
    if (rt.stretch) rt.stretch.schedule({ rate: rt.rate, semitones: s });
  }, []);

  const setReverbAmount = useCallback((a: number) => {
    const c = Math.max(0, Math.min(1, a));
    const rt = runtime.current;
    rt.reverbAmount = c;
    setReverbAmountState(c);
    if (rt.dryGain && rt.wetGain) {
      rt.dryGain.gain.value = 1 - c * 0.5;
      rt.wetGain.gain.value = c;
    }
  }, []);

  const setVolume = useCallback(
    (v: number) => {
      const c = Math.max(0, Math.min(1, v));
      const rt = runtime.current;
      rt.volume = c;
      setVolumeState(c);
      if (liteMode) {
        const a = audioRef.current;
        if (a) a.volume = c;
        return;
      }
      if (rt.masterGain) rt.masterGain.gain.value = c;
    },
    [liteMode],
  );

  return {
    audioRef,
    state,
    isPlaying,
    currentTime,
    buffered,
    duration,
    rate: rateState,
    semitones: semitonesState,
    reverbAmount: reverbAmountState,
    volume: volumeState,
    isNativeFallback: liteMode,
    play,
    pause,
    togglePlayback,
    setRate,
    setSemitones,
    setReverbAmount,
    setVolume,
    seek,
  };
}

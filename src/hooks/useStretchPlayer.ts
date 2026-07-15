import { useCallback, useEffect, useRef, useState } from "react";
import { parseApiError } from "@/lib/apiError";
import { STREAM_CHUNK_BYTES } from "@/lib/streamConstants";

type StretchPlayerState = "loading" | "ready" | "error";

export type LoadProgress =
  | { phase: "downloading"; percent: number }
  | { phase: "processing"; percent: number }
  | null;

interface UseStretchPlayerProps {
  fileUrl: string;
  advancedStretch?: boolean;
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

export interface BufferedRange {
  start: number;
  end: number;
}

interface UseStretchPlayerReturn {
  audioRef: React.RefObject<HTMLAudioElement>;
  state: StretchPlayerState;
  isPlaying: boolean;
  isWaiting: boolean;
  currentTime: number;
  duration: number;
  buffered: BufferedRange[];
  rate: number;
  semitones: number;
  reverbAmount: number;
  volume: number;
  progress: LoadProgress;
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
  currentPosition: number;
  pendingSeek: number | null;
  rafId: number | null;
  lastUiUpdateMs: number;
  onEnded?: () => void;
}

const decodedAudioCache = new Map<string, AudioBuffer>();
const MAX_DECODED_AUDIO_CACHE_ENTRIES = 2;
const UI_UPDATE_INTERVAL = 100;
const DRIFT_THRESHOLD = 0.25;

function syncMediaSession(position: number, duration: number, playbackRate = 1): void {
  if ("mediaSession" in navigator && "setPositionState" in navigator.mediaSession) {
    try {
      navigator.mediaSession.setPositionState({
        duration: duration || 0,
        playbackRate: Math.max(0.25, playbackRate),
        position,
      });
    } catch {}
  }
}

function startStretchTick(
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

async function fetchFile(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const chunkSize = STREAM_CHUNK_BYTES;
  const firstEnd = chunkSize - 1;
  const firstResponse = await fetch(url, {
    headers: { Range: `bytes=0-${firstEnd}` },
    signal,
  });
  if (!firstResponse.ok) {
    throw new Error(await parseApiError(firstResponse));
  }

  // Some upstreams ignore Range and return the complete file. Use that response
  // directly rather than concatenating duplicate full-file responses.
  if (firstResponse.status === 200) {
    const total = Number(firstResponse.headers.get("content-length")) || 0;
    const buffer = await firstResponse.arrayBuffer();
    onProgress?.(buffer.byteLength, total || buffer.byteLength);
    return buffer;
  }

  const firstRange = firstResponse.headers.get("content-range");
  const firstMatch = firstRange?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
  if (!firstMatch || Number(firstMatch[1]) !== 0) {
    throw new Error("Audio server returned an invalid byte range");
  }

  const total = Number(firstMatch[3]);
  const merged = new Uint8Array(total);
  const firstBuffer = new Uint8Array(await firstResponse.arrayBuffer());
  const firstEndActual = Number(firstMatch[2]);
  if (firstBuffer.byteLength !== firstEndActual + 1) {
    throw new Error("Audio server returned incomplete byte range");
  }
  merged.set(firstBuffer, 0);
  let loaded = firstBuffer.byteLength;
  onProgress?.(loaded, total);

  if (loaded >= total) return merged.buffer;

  let nextStart = loaded;
  const worker = async () => {
    for (;;) {
      const start = nextStart;
      if (start >= total) return;
      nextStart = Math.min(start + chunkSize, total);
      const end = nextStart - 1;
      const response = await fetch(url, {
        headers: { Range: `bytes=${start}-${end}` },
        signal,
      });
      if (response.status !== 206) {
        throw new Error(await parseApiError(response));
      }
      const range = response.headers.get("content-range");
      const match = range?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
      if (!match || Number(match[1]) !== start || Number(match[2]) !== end) {
        throw new Error("Audio server returned an unexpected byte range");
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength !== end - start + 1 || Number(match[3]) !== total) {
        throw new Error("Audio server returned an incomplete byte range");
      }
      merged.set(bytes, start);
      loaded += bytes.byteLength;
      onProgress?.(loaded, total);
    }
  };

  await Promise.all(Array.from({ length: 4 }, () => worker()));
  return merged.buffer;
}

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
  advancedStretch = false,
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
  const [duration, setDuration] = useState(0);
  const [rateState, setRateState] = useState(initialRate);
  const [semitonesState, setSemitonesState] = useState(initialSemitones);
  const [reverbAmountState, setReverbAmountState] = useState(initialReverbAmount);
  const [volumeState, setVolumeState] = useState(initialVolume);
  const [progress, setProgress] = useState<LoadProgress>(null);
  const [buffered, setBuffered] = useState<BufferedRange[]>([]);
  const [isWaiting, setIsWaiting] = useState(false);
  const isPlayingRef = useRef(false);

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
    currentPosition: initialPosition,
    pendingSeek: null,
    rafId: null,
    lastUiUpdateMs: 0,
  });

  const advancedStretchRef = useRef(advancedStretch);
  const initializationId = useRef(0);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    advancedStretchRef.current = advancedStretch;
  }, [advancedStretch]);
  const nativeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    runtime.current.repeat = isRepeat;
    runtime.current.onEnded = onEnded;
  }, [isRepeat, onEnded]);

  const cleanup = useCallback(() => {
    nativeCleanupRef.current?.();
    nativeCleanupRef.current = null;

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
    rt.duration = 0;
    rt.isPlaying = false;
    rt.pendingSeek = null;
    setIsPlaying(false);
    setIsWaiting(false);
    setBuffered([]);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const setupNative = useCallback(
    (audio: HTMLAudioElement, pos: number) => {
      audio.muted = false;
      audio.volume = initialVolume;
      audio.playbackRate = initialRate;
      (audio as any).preservesPitch = false;
      (audio as any).mozPreservesPitch = false;
      (audio as any).webkitPreservesPitch = false;

      const onTime = () => {
        const ct = audio.currentTime;
        runtime.current.currentPosition = ct;
        setCurrentTime(ct);
        syncMediaSession(ct, audio.duration, audio.playbackRate);
      };
      const onDuration = () => {
        if (Number.isFinite(audio.duration)) {
          runtime.current.duration = audio.duration;
          setDuration(audio.duration);
        }
      };
      const onEnd = () => {
        if (runtime.current.repeat) {
          audio.currentTime = 0;
          runtime.current.currentPosition = 0;
          audio.play().catch(() => {});
        } else {
          runtime.current.isPlaying = false;
          runtime.current.currentPosition = audio.duration;
          setIsPlaying(false);
          setCurrentTime(audio.duration);
          runtime.current.onEnded?.();
        }
      };
      const onProgress = () => {
        const ranges: BufferedRange[] = [];
        try {
          for (let i = 0; i < audio.buffered.length; i++) {
            ranges.push({ start: audio.buffered.start(i), end: audio.buffered.end(i) });
          }
        } catch {}
        setBuffered(ranges);
      };
      const onWaiting = () => setIsWaiting(true);
      const onPlaying = () => {
        runtime.current.isPlaying = true;
        setIsWaiting(false);
      };
      const onSeeked = () => setIsWaiting(false);

      audio.addEventListener("timeupdate", onTime);
      audio.addEventListener("loadedmetadata", onDuration);
      audio.addEventListener("durationchange", onDuration);
      audio.addEventListener("ended", onEnd);
      audio.addEventListener("progress", onProgress);
      audio.addEventListener("waiting", onWaiting);
      audio.addEventListener("playing", onPlaying);
      audio.addEventListener("seeked", onSeeked);

      nativeCleanupRef.current = () => {
        audio.removeEventListener("timeupdate", onTime);
        audio.removeEventListener("loadedmetadata", onDuration);
        audio.removeEventListener("durationchange", onDuration);
        audio.removeEventListener("ended", onEnd);
        audio.removeEventListener("progress", onProgress);
        audio.removeEventListener("waiting", onWaiting);
        audio.removeEventListener("playing", onPlaying);
        audio.removeEventListener("seeked", onSeeked);
      };
      runtime.current.currentPosition = pos;
      if (pos > 0) audio.currentTime = pos;
      setCurrentTime(pos);
    },
    [initialRate, initialVolume],
  );

  const setupFull = useCallback(
    async (
      audio: HTMLAudioElement,
      pos: number,
      signal: AbortSignal,
      isCurrent: () => boolean,
    ) => {
      const rt = runtime.current;

      const throwIfInactive = () => {
        if (signal.aborted || !isCurrent())
          throw new DOMException("Initialization aborted", "AbortError");
      };
      throwIfInactive();

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass)
        throw new Error("Web Audio is not supported in this browser");
      const audioContext = new AudioContextClass();
      rt.audioContext = audioContext;

      const signalsmithModulePromise = import("signalsmith-stretch");
      let audioBuffer = decodedAudioCache.get(fileUrl);
      if (!audioBuffer) {
        setProgress({ phase: "downloading", percent: 0 });
        const arrayBuffer = await fetchFile(
          fileUrl,
          (loaded, total) => {
            const pct = total ? Math.round((loaded / total) * 70) : 0;
            setProgress({ phase: "downloading", percent: pct });
          },
          signal,
        );
        throwIfInactive();
        setProgress({ phase: "processing", percent: 70 });
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        decodedAudioCache.set(fileUrl, audioBuffer);
        while (decodedAudioCache.size > MAX_DECODED_AUDIO_CACHE_ENTRIES) {
          const oldestKey = decodedAudioCache.keys().next().value;
          if (oldestKey === undefined) break;
          decodedAudioCache.delete(oldestKey);
        }
      } else {
        setProgress({ phase: "processing", percent: 70 });
      }
      throwIfInactive();
      rt.buffer = audioBuffer;
      rt.duration = audioBuffer.duration;
      rt.currentPosition = Math.max(0, Math.min(pos, audioBuffer.duration));
      setDuration(audioBuffer.duration);
      setBuffered([{ start: 0, end: audioBuffer.duration }]);
      setIsWaiting(false);

      setProgress({ phase: "processing", percent: 80 });
      const SignalsmithStretch = (await signalsmithModulePromise).default;
      throwIfInactive();
      const stretch = await SignalsmithStretch(audioContext);
      throwIfInactive();
      rt.stretch = stretch;

      setProgress({ phase: "processing", percent: 85 });
      const channelBuffers: Float32Array[] = [];
      for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
        channelBuffers.push(audioBuffer.getChannelData(c));
      }
      await stretch.addBuffers(channelBuffers);
      throwIfInactive();
      setProgress({ phase: "processing", percent: 95 });

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

      throwIfInactive();
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
    async (
      audio: HTMLAudioElement,
      pos: number,
      signal: AbortSignal,
      isCurrent: () => boolean,
    ) => {
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
      await setupFull(audio, pos, signal, isCurrent);
      if (!isCurrent()) return;

      const rt2 = runtime.current;
      if (rt2.stretch) {
        startStretchTick(rt2, setCurrentTime, setIsPlaying, false);
      }
    },
    [setupFull],
  );

  const posBeforeSwitch = useRef(0);
  const wasPlayingBeforeSwitch = useRef(false);

  useEffect(() => {
    if (!fileUrl) return;
    const audio = audioRef.current;
    if (!audio) return;
    let aborted = false;
    const controller = new AbortController();
    const id = ++initializationId.current;
    const isCurrent = () => !aborted && initializationId.current === id;

    const rt = runtime.current;
    const currentPos = Number.isFinite(rt.currentPosition)
      ? rt.currentPosition
      : (rt.stretch?.inputTime ?? audio.currentTime ?? 0);
    posBeforeSwitch.current = Number.isFinite(currentPos) ? currentPos : 0;
    wasPlayingBeforeSwitch.current =
      isPlayingRef.current || rt.isPlaying || !audio.paused;

    const init = async () => {
      cleanup();
      setState("loading");
      setProgress(null);

      const resumePos =
        posBeforeSwitch.current > 0 ? posBeforeSwitch.current : initialPosition;
      setCurrentTime(resumePos);

      try {
        if (advancedStretch) {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
          await initFullMode(audio, resumePos, controller.signal, isCurrent);
          if (!isCurrent()) return;

          setState("ready");
          setProgress(null);
          if (autoPlay || wasPlayingBeforeSwitch.current) {
            setTimeout(async () => {
              if (aborted) return;
              const rt2 = runtime.current;
              if (rt2.stretch && rt2.audioContext) {
                if (rt2.audioContext.state === "suspended") {
                  try {
                    await rt2.audioContext.resume();
                  } catch {
                    return;
                  }
                }
                if (aborted) return;
                rt2.stretch.schedule({
                  active: true,
                  input: resumePos,
                  rate: rt2.rate,
                  semitones: rt2.semitones,
                });
                rt2.isPlaying = true;
                setIsPlaying(true);
              }
            }, 50);
          }
        } else {
          // Native mode: use HTMLAudioElement directly
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
          if (!isCurrent()) return;
          runtime.current.duration = audio.duration;
          setDuration(audio.duration);
          setupNative(audio, resumePos);

          setState("ready");
          setTimeout(() => {
            if (aborted) return;
            if (resumePos > 0) audio.currentTime = resumePos;
            runtime.current.currentPosition = resumePos;
            setCurrentTime(resumePos);
            if (autoPlay || wasPlayingBeforeSwitch.current) {
              audio.play().then(
                () => {
                  runtime.current.isPlaying = true;
                  setIsPlaying(true);
                },
                () => {
                  runtime.current.isPlaying = false;
                  setIsPlaying(false);
                },
              );
            }
          }, 50);
        }
      } catch (error) {
        if (isCurrent()) {
          cleanup();
          setProgress(null);
          console.error("StretchPlayer initialization failed:", error);
          setState("error");
          onPlayerError?.(error);
        }
      }
    };

    init();
    return () => {
      aborted = true;
      controller.abort();
      cleanup();
    };
  }, [
    fileUrl,
    advancedStretch,
    initialPosition,
    autoPlay,
    onPlayerError,
    cleanup,
    initFullMode,
    setupNative,
  ]);

  useEffect(() => cleanup, [cleanup]);

  const play = useCallback(async (startTime?: number) => {
    const a = audioRef.current;
    if (!a) return;
    const rt = runtime.current;
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";

    if (!advancedStretchRef.current) {
      // Native mode
      try {
        if (startTime !== undefined && Number.isFinite(startTime)) {
          a.currentTime = startTime;
          rt.currentPosition = startTime;
        }
        await a.play();
        rt.isPlaying = true;
        setIsPlaying(true);
      } catch {
        rt.isPlaying = false;
        setIsPlaying(false);
      }
      return;
    }

    // Advanced stretch mode
    if (!rt.audioContext || !rt.stretch) return;
    if (rt.audioContext.state === "suspended") {
      try {
        await rt.audioContext.resume();
      } catch {
        setIsPlaying(false);
        return;
      }
    }
    const t =
      startTime !== undefined && Number.isFinite(startTime)
        ? Math.max(0, Math.min(startTime, rt.duration))
        : rt.currentPosition;
    rt.currentPosition = t;
    rt.stretch.schedule({
      active: true,
      input: t,
      rate: rt.rate,
      semitones: rt.semitones,
    });
    rt.isPlaying = true;
    setIsPlaying(true);
    a.muted = true;
    a.play().catch(() => {});
    if (rt.rafId === null) {
      startStretchTick(rt, setCurrentTime, setIsPlaying, true);
    }
  }, []);

  const pause = useCallback(() => {
    const rt = runtime.current;
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "paused";
      const a = audioRef.current;
      syncMediaSession(rt.currentPosition, rt.duration || a?.duration || 0);
    }
    if (advancedStretchRef.current) {
      rt.isPlaying = false;
      setIsPlaying(false);
      if (rt.stretch) rt.stretch.schedule({ active: false });
      if (rt.rafId !== null) {
        cancelAnimationFrame(rt.rafId);
        rt.rafId = null;
      }
    } else {
      rt.isPlaying = false;
      setIsPlaying(false);
    }
    audioRef.current?.pause();
  }, []);

  const togglePlayback = useCallback(() => {
    isPlaying ? pause() : play();
  }, [isPlaying, play, pause]);

  const seek = useCallback((t: number) => {
    if (!Number.isFinite(t)) return;
    if (process.env.NODE_ENV !== "production") {
      console.debug("[StretchPlayer] seek", {
        requested: t,
        advanced: advancedStretchRef.current,
        currentTime: runtime.current.currentPosition,
        duration: runtime.current.duration,
      });
    }
    if (!advancedStretchRef.current) {
      const a = audioRef.current;
      if (!a) return;
      const rt = runtime.current;
      const clamped = Math.max(0, Math.min(t, rt.duration || a.duration || 0));
      a.currentTime = clamped;
      rt.currentPosition = clamped;
      setCurrentTime(clamped);
      syncMediaSession(clamped, a.duration, a.playbackRate);
      return;
    }
    const rt = runtime.current;
    const clamped = Math.max(0, Math.min(t, rt.duration || Number.POSITIVE_INFINITY));
    rt.currentPosition = clamped;
    rt.pendingSeek = clamped;
    setCurrentTime(clamped);
    rt.lastUiUpdateMs = performance.now();
    if (rt.stretch) {
      // inputTime is updated asynchronously by Signalsmith, so schedule the
      // new position and keep using it until the processor catches up.
      rt.stretch.schedule({
        input: clamped,
        rate: rt.rate,
        semitones: rt.semitones,
        active: rt.isPlaying,
      });
    }
  }, []);

  const setRate = useCallback((r: number) => {
    const rt = runtime.current;
    rt.rate = r;
    setRateState(r);
    if (!advancedStretchRef.current) {
      const a = audioRef.current;
      if (a) a.playbackRate = r;
      return;
    }
    if (rt.stretch) rt.stretch.schedule({ rate: r, semitones: rt.semitones });
  }, []);

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

  const setVolume = useCallback((v: number) => {
    const c = Math.max(0, Math.min(1, v));
    const rt = runtime.current;
    rt.volume = c;
    setVolumeState(c);
    if (!advancedStretchRef.current) {
      const a = audioRef.current;
      if (a) a.volume = c;
      return;
    }
    if (rt.masterGain) rt.masterGain.gain.value = c;
  }, []);

  return {
    audioRef,
    state,
    isPlaying,
    isWaiting,
    currentTime,
    duration,
    buffered,
    rate: rateState,
    semitones: semitonesState,
    reverbAmount: reverbAmountState,
    volume: volumeState,
    progress,
    isNativeFallback: !advancedStretch,
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

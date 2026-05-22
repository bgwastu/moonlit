import { useCallback, useEffect, useRef, useState } from "react";

type StretchPlayerState = "loading" | "ready" | "error";

interface UseStretchPlayerProps {
  fileUrl: string;
  /** Lite mode: native video playback only (speed only; no pitch/reverb). Much more stable; default on. */
  liteMode?: boolean;
  initialRate?: number;
  initialSemitones?: number;
  initialPosition?: number;
  initialReverbAmount?: number;
  initialVolume?: number;
  autoPlay?: boolean;
  isRepeat?: boolean;
  onEnded?: () => void;
  onVideoError?: (e: unknown) => void;
}

interface UseStretchPlayerReturn {
  videoRef: React.RefObject<HTMLVideoElement>;
  videoElement: HTMLVideoElement | null;
  isVideoReady: boolean;
  state: StretchPlayerState;
  isPlaying: boolean;
  currentTime: number;
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

// All mutable runtime state in one ref to avoid stale closures
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

  // Audio graph nodes
  convolver: ConvolverNode | null;
  dryGain: GainNode | null;
  wetGain: GainNode | null;
  masterGain: GainNode | null;

  // Playback state
  isPlaying: boolean;
  duration: number;
  rate: number;
  semitones: number;
  volume: number;
  reverbAmount: number;
  repeat: boolean;
  liteMode: boolean;

  // Sync
  rafId: number | null;
  lastUiUpdateMs: number;
  lastRateChangeMs: number;
  lastDriftCorrectionMs: number;

  // Callbacks
  onEnded?: () => void;
}

const DRIFT_THRESHOLD = 0.25; // seconds - allow some drift before correcting
const UI_UPDATE_INTERVAL = 100; // ms - throttle React updates
const RATE_CHANGE_GRACE_PERIOD = 300; // ms - skip drift correction after rate change
const DRIFT_CORRECTION_INTERVAL = 500; // ms - minimum time between drift corrections

function generateImpulseResponse(
  context: AudioContext,
  duration = 2,
  decay = 2,
): AudioBuffer {
  const sampleRate = context.sampleRate;
  const length = sampleRate * duration;
  const impulse = context.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const n = i / sampleRate;
    const envelope = Math.pow(1 - n / duration, decay);
    left[i] = (Math.random() * 2 - 1) * envelope;
    right[i] = (Math.random() * 2 - 1) * envelope;
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
  onVideoError,
}: UseStretchPlayerProps): UseStretchPlayerReturn {
  const videoRef = useRef<HTMLVideoElement>(null);

  // UI state (React renders)
  const [state, setState] = useState<StretchPlayerState>("loading");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRateState] = useState(initialRate);
  const [semitones, setSemitonesState] = useState(initialSemitones);
  const [reverbAmount, setReverbAmountState] = useState(initialReverbAmount);
  const [volume, setVolumeState] = useState(initialVolume);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const liteTeardownRef = useRef<(() => void) | null>(null);

  /** Set when init succeeds; enables preserving time when only `liteMode` toggles */
  const lastSuccessfulInitFileUrlRef = useRef<string | null>(null);

  // Single runtime ref for all mutable state
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
    lastRateChangeMs: 0,
    lastDriftCorrectionMs: 0,
    onEnded,
    liteMode: false,
  });

  const syncLoopImplRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const rt = runtime.current;
    rt.repeat = isRepeat;
    rt.onEnded = onEnded;
    rt.liteMode = liteMode ?? false;
  }, [isRepeat, onEnded, liteMode]);

  // Cleanup function
  const cleanup = useCallback(() => {
    liteTeardownRef.current?.();
    liteTeardownRef.current = null;

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

    [rt.convolver, rt.dryGain, rt.wetGain, rt.masterGain].forEach((node) => {
      if (node) {
        try {
          node.disconnect();
        } catch {}
      }
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

  // rAF sync loop implementation (stored in effect to avoid Hooks purity lint on nested impure APIs)
  useEffect(() => {
    syncLoopImplRef.current = () => {
      const rt = runtime.current;
      const video = videoRef.current;

      if (!rt.isPlaying || !rt.stretch) {
        rt.rafId = null;
        return;
      }

      const audioTime = rt.stretch.inputTime ?? 0;
      const now = performance.now();

      // Throttle UI updates
      if (now - rt.lastUiUpdateMs > UI_UPDATE_INTERVAL) {
        setCurrentTime(Math.min(audioTime, rt.duration));
        rt.lastUiUpdateMs = now;
      }

      // Sync video to audio (video is visual slave)
      // Skip drift correction briefly after rate changes to avoid visual jumps
      const timeSinceRateChange = now - rt.lastRateChangeMs;
      const timeSinceDriftCorrection = now - rt.lastDriftCorrectionMs;
      if (video && !video.seeking) {
        // Sync playback rate (only when different)
        if (Math.abs(video.playbackRate - rt.rate) > 0.01) {
          video.playbackRate = rt.rate;
        }
        // Only correct drift if enough time has passed since rate change AND last correction
        if (
          timeSinceRateChange > RATE_CHANGE_GRACE_PERIOD &&
          timeSinceDriftCorrection > DRIFT_CORRECTION_INTERVAL
        ) {
          const drift = Math.abs(video.currentTime - audioTime);
          if (drift > DRIFT_THRESHOLD) {
            video.currentTime = audioTime;
            rt.lastDriftCorrectionMs = now;
          }
        }
        // Ensure video is playing (needed for initial start and visibility restore)
        if (video.paused && document.visibilityState === "visible") {
          video.play().catch(() => {});
        }
      }

      // Handle end/repeat
      if (audioTime >= rt.duration - 0.05) {
        if (rt.repeat) {
          rt.stretch.schedule({
            input: 0,
            rate: rt.rate,
            semitones: rt.semitones,
            active: true,
          });
          if (video) video.currentTime = 0;
        } else {
          rt.stretch.schedule({ active: false });
          rt.isPlaying = false;
          setIsPlaying(false);
          setCurrentTime(rt.duration);
          if (video) video.pause();
          rt.onEnded?.();
          rt.rafId = null;
          return;
        }
      }

      rt.rafId = requestAnimationFrame(() => syncLoopImplRef.current?.());
    };

    return () => {
      syncLoopImplRef.current = null;
    };
  }, []);

  // Play
  const play = useCallback(async (startTime?: number) => {
    const rt = runtime.current;
    const video = videoRef.current;

    if (rt.liteMode) {
      if (video) {
        video.play().catch(() => {});
        rt.isPlaying = true;
        setIsPlaying(true);
      }
      return;
    }

    if (!rt.audioContext || !rt.stretch) return;

    // Resume AudioContext (required for autoplay policies)
    if (rt.audioContext.state === "suspended") {
      await rt.audioContext.resume();
    }

    const inputTime = startTime ?? rt.stretch.inputTime ?? 0;

    // Set grace period to prevent immediate drift correction
    rt.lastRateChangeMs = performance.now();

    // Prepare video BEFORE starting audio to minimize desync
    if (video) {
      // Set rate and position before playing to avoid flicker
      video.playbackRate = rt.rate;
      if (
        startTime !== undefined ||
        Math.abs(video.currentTime - inputTime) > DRIFT_THRESHOLD
      ) {
        video.currentTime = inputTime;
      }
    }

    // Start audio
    rt.stretch.schedule({
      active: true,
      input: inputTime,
      rate: rt.rate,
      semitones: rt.semitones,
    });

    rt.isPlaying = true;
    setIsPlaying(true);

    // Start video after audio is scheduled
    if (video && video.paused) {
      video.play().catch(() => {});
    }

    // Start sync loop
    if (rt.rafId === null) {
      rt.lastUiUpdateMs = 0;
      rt.rafId = requestAnimationFrame(() => syncLoopImplRef.current?.());
    }
  }, []);

  // Pause
  const pause = useCallback(() => {
    const rt = runtime.current;
    const video = videoRef.current;

    if (rt.liteMode) {
      if (video) video.pause();
      rt.isPlaying = false;
      setIsPlaying(false);
      return;
    }

    if (rt.stretch) {
      rt.stretch.schedule({ active: false });
    }

    rt.isPlaying = false;
    setIsPlaying(false);

    if (video) {
      video.pause();
    }

    if (rt.rafId !== null) {
      cancelAnimationFrame(rt.rafId);
      rt.rafId = null;
    }
  }, []);

  // Toggle
  const togglePlayback = useCallback(() => {
    if (runtime.current.isPlaying) {
      pause();
    } else {
      play();
    }
  }, [play, pause]);

  // Seek
  const seek = useCallback((timeSeconds: number) => {
    const rt = runtime.current;
    const video = videoRef.current;
    const clampedTime = Math.max(0, Math.min(timeSeconds, rt.duration));

    setCurrentTime(clampedTime);

    if (rt.liteMode) {
      if (video) video.currentTime = clampedTime;
      return;
    }

    if (rt.stretch) {
      rt.stretch.schedule({
        input: clampedTime,
        rate: rt.rate,
        semitones: rt.semitones,
        active: rt.isPlaying,
      });
    }

    if (video) {
      video.currentTime = clampedTime;
    }
  }, []);

  // Set rate
  const setRate = useCallback((newRate: number) => {
    const rt = runtime.current;
    const video = videoRef.current;

    rt.rate = newRate;
    rt.lastRateChangeMs = performance.now();
    setRateState(newRate);

    if (rt.liteMode) {
      if (video) video.playbackRate = newRate;
      return;
    }

    if (rt.stretch) {
      rt.stretch.schedule({
        rate: newRate,
        semitones: rt.semitones,
      });
    }
  }, []);

  // Set semitones
  const setSemitones = useCallback((newSemitones: number) => {
    const rt = runtime.current;
    if (rt.liteMode) return; // no pitch in lite mode
    rt.semitones = newSemitones;
    setSemitonesState(newSemitones);
    if (rt.stretch) {
      rt.stretch.schedule({
        rate: rt.rate,
        semitones: newSemitones,
      });
    }
  }, []);

  // Set reverb
  const setReverbAmount = useCallback((amount: number) => {
    const rt = runtime.current;
    if (rt.liteMode) return; // no reverb in lite mode
    const clamped = Math.max(0, Math.min(1, amount));
    rt.reverbAmount = clamped;
    setReverbAmountState(clamped);
    if (rt.dryGain && rt.wetGain) {
      rt.dryGain.gain.value = 1 - clamped * 0.5;
      rt.wetGain.gain.value = clamped;
    }
  }, []);

  // Set volume
  const setVolume = useCallback((newVolume: number) => {
    const rt = runtime.current;
    const video = videoRef.current;
    const clamped = Math.max(0, Math.min(1, newVolume));
    rt.volume = clamped;
    setVolumeState(clamped);
    if (rt.liteMode && video) {
      video.volume = clamped;
      return;
    }
    if (rt.masterGain) {
      rt.masterGain.gain.value = clamped;
    }
  }, []);

  // Initialize: load audio + setup stretch node
  useEffect(() => {
    if (!fileUrl) return;

    const video = videoRef.current;
    if (!video) return;

    let aborted = false;
    const abortController = new AbortController();

    const init = async () => {
      const rtSnap = runtime.current;
      const vid = videoRef.current;
      const sameTrack =
        !!fileUrl &&
        lastSuccessfulInitFileUrlRef.current === fileUrl &&
        rtSnap.duration > 0;

      let resumePosition = initialPosition;
      let resumePlayback = autoPlay;
      if (sameTrack) {
        resumePlayback = rtSnap.isPlaying;
        if (rtSnap.stretch !== null) {
          resumePosition = Math.min(
            Math.max(0, rtSnap.stretch.inputTime ?? 0),
            rtSnap.duration,
          );
        } else if (vid && Number.isFinite(vid.currentTime)) {
          resumePosition = Math.min(Math.max(0, vid.currentTime), rtSnap.duration);
        }
      }

      if (!sameTrack) {
        lastSuccessfulInitFileUrlRef.current = null;
      }

      cleanup();
      setState("loading");
      runtime.current.liteMode = liteMode;

      try {
        const rt = runtime.current;

        if (!sameTrack) {
          rt.rate = initialRate;
          rt.semitones = initialSemitones;
          rt.reverbAmount = initialReverbAmount;
          rt.volume = initialVolume;
          setRateState(initialRate);
          setSemitonesState(initialSemitones);
          setReverbAmountState(initialReverbAmount);
          setVolumeState(initialVolume);
        }

        if (liteMode) {
          // Lite mode: native video playback only (speed only; no pitch/reverb). Much more stable.
          video.src = fileUrl;
          video.muted = false;
          video.volume = rt.volume;
          video.playsInline = true;
          (video as any).preservesPitch = false;
          (video as any).mozPreservesPitch = false;
          (video as any).webkitPreservesPitch = false;
          video.load();

          await new Promise<void>((resolve, reject) => {
            if (video.readyState >= 3) {
              resolve();
              return;
            }
            const onCanPlay = () => {
              video.removeEventListener("canplay", onCanPlay);
              video.removeEventListener("error", onError);
              resolve();
            };
            const onError = (e: Event) => {
              video.removeEventListener("canplay", onCanPlay);
              video.removeEventListener("error", onError);
              reject(e);
            };
            video.addEventListener("canplay", onCanPlay);
            video.addEventListener("error", onError);
          });

          if (aborted) return;

          rt.duration = video.duration;
          rt.semitones = 0;
          rt.reverbAmount = 0;
          setDuration(video.duration);
          setRateState(rt.rate);
          setVolumeState(rt.volume);
          setReverbAmountState(0);
          setSemitonesState(0);
          setVideoElement(video);
          setIsVideoReady(true);
          video.playbackRate = rt.rate;
          video.currentTime = resumePosition;
          setCurrentTime(resumePosition);

          const onTimeUpdate = () => setCurrentTime(video.currentTime);
          const onVideoEnded = () => {
            if (rt.repeat) {
              video.currentTime = 0;
              video.play().catch(() => {});
            } else {
              rt.isPlaying = false;
              setIsPlaying(false);
              setCurrentTime(rt.duration);
              rt.onEnded?.();
            }
          };
          video.addEventListener("timeupdate", onTimeUpdate);
          video.addEventListener("ended", onVideoEnded);
          liteTeardownRef.current = () => {
            video.removeEventListener("timeupdate", onTimeUpdate);
            video.removeEventListener("ended", onVideoEnded);
          };

          setState("ready");
          lastSuccessfulInitFileUrlRef.current = fileUrl;
          if (resumePlayback) {
            setTimeout(() => {
              video.play().catch(() => {});
              rt.isPlaying = true;
              setIsPlaying(true);
            }, 50);
          }
          return;
        }

        // Full mode: Web Audio (stretch) + muted video for visuals
        // Video is muted so only Web Audio (stretch → destination) is heard; avoids doubled sound.
        video.src = fileUrl;
        video.muted = true;
        video.playsInline = true;
        (video as any).preservesPitch = false;
        (video as any).mozPreservesPitch = false;
        (video as any).webkitPreservesPitch = false;
        video.load();

        // Wait for video to be ready
        await new Promise<void>((resolve, reject) => {
          if (video.readyState >= 3) {
            resolve();
            return;
          }
          const onCanPlay = () => {
            video.removeEventListener("canplay", onCanPlay);
            video.removeEventListener("error", onError);
            resolve();
          };
          const onError = (e: Event) => {
            video.removeEventListener("canplay", onCanPlay);
            video.removeEventListener("error", onError);
            reject(e);
          };
          video.addEventListener("canplay", onCanPlay);
          video.addEventListener("error", onError);
        });

        if (aborted) return;

        setVideoElement(video);
        setIsVideoReady(true);
        video.playbackRate = rt.rate;

        // Create AudioContext
        const AudioContextClass =
          window.AudioContext || (window as any).webkitAudioContext;
        const audioContext = new AudioContextClass();
        rt.audioContext = audioContext;

        // Fetch and decode audio
        const response = await fetch(fileUrl, { signal: abortController.signal });
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        if (aborted) return;

        rt.buffer = audioBuffer;
        rt.duration = audioBuffer.duration;
        setDuration(audioBuffer.duration);

        // Create signalsmith-stretch node
        const SignalsmithStretch = (await import("signalsmith-stretch")).default;
        const stretch = await SignalsmithStretch(audioContext);
        rt.stretch = stretch;

        // Add audio buffers
        const channelBuffers: Float32Array[] = [];
        for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
          channelBuffers.push(audioBuffer.getChannelData(c));
        }
        await stretch.addBuffers(channelBuffers);

        // Setup audio graph: stretch -> dry/wet -> master -> destination
        const convolver = audioContext.createConvolver();
        const dryGain = audioContext.createGain();
        const wetGain = audioContext.createGain();
        const masterGain = audioContext.createGain();

        convolver.buffer = generateImpulseResponse(audioContext, 2, 2);

        dryGain.gain.value = 1 - rt.reverbAmount * 0.5;
        wetGain.gain.value = rt.reverbAmount;
        masterGain.gain.value = rt.volume;

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

        // Set initial position
        stretch.schedule({
          active: false,
          input: resumePosition,
          rate: rt.rate,
          semitones: rt.semitones,
          // Same value disables buffer looping (signalsmith-stretch repeats when loopEnd > loopStart)
          loopStart: 0,
          loopEnd: 0,
        });

        if (resumePosition > 0) {
          video.currentTime = resumePosition;
          setCurrentTime(resumePosition);
        }

        setState("ready");
        lastSuccessfulInitFileUrlRef.current = fileUrl;

        if (resumePlayback) {
          setTimeout(() => play(), 50);
        }
      } catch (error) {
        if (!aborted) {
          console.error("StretchPlayer: init failed:", error);
          setState("error");
          onVideoError?.(error);
        }
      }
    };

    init();

    return () => {
      aborted = true;
      abortController.abort();
    };
  }, [
    fileUrl,
    liteMode,
    cleanup,
    play,
    initialRate,
    initialSemitones,
    initialReverbAmount,
    initialPosition,
    initialVolume,
    autoPlay,
    onVideoError,
  ]);

  // Visibility change handler
  useEffect(() => {
    const handleVisibility = () => {
      const rt = runtime.current;
      const video = videoRef.current;

      if (document.visibilityState !== "visible" || !rt.isPlaying || !video) return;

      if (rt.liteMode) {
        video.play().catch(() => {});
        return;
      }
      // Resync video to audio when returning from background
      const audioTime = rt.stretch?.inputTime ?? 0;
      video.currentTime = audioTime;
      video.play().catch(() => {});
      if (rt.rafId === null) {
        rt.rafId = requestAnimationFrame(() => syncLoopImplRef.current?.());
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  return {
    videoRef,
    videoElement,
    isVideoReady,
    state,
    isPlaying,
    currentTime,
    duration,
    rate,
    semitones,
    reverbAmount,
    volume,
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

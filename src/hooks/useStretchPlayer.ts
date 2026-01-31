import { useCallback, useEffect, useRef, useState } from "react";

export type StretchPlayerState = "loading" | "ready" | "error";

interface UseStretchPlayerProps {
  fileUrl: string;
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
  play: () => void;
  pause: () => void;
  togglePlayback: () => void;
  setRate: (rate: number) => void;
  setSemitones: (semitones: number) => void;
  setReverbAmount: (amount: number) => void;
  setVolume: (volume: number) => void;
  seek: (timeSeconds: number) => void;
}

// All mutable runtime state in one ref to avoid stale closures
interface PlayerRuntime {
  audioContext: AudioContext | null;
  stretch: any | null;
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

  // Sync
  rafId: number | null;
  lastUiUpdateMs: number;

  // Callbacks
  onEnded?: () => void;
}

const DRIFT_THRESHOLD = 0.1; // seconds
const UI_UPDATE_INTERVAL = 100; // ms - throttle React updates

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
    onEnded,
  });

  // Keep runtime in sync with props
  runtime.current.repeat = isRepeat;
  runtime.current.onEnded = onEnded;

  // Cleanup function
  const cleanup = useCallback(() => {
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

  // rAF sync loop - runs only while playing
  const syncLoop = useCallback(() => {
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
    if (video && !video.seeking) {
      const drift = Math.abs(video.currentTime - audioTime);
      if (drift > DRIFT_THRESHOLD) {
        video.currentTime = audioTime;
      }
      // Keep video playing
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

    rt.rafId = requestAnimationFrame(syncLoop);
  }, []);

  // Play
  const play = useCallback(async () => {
    const rt = runtime.current;
    const video = videoRef.current;

    if (!rt.audioContext || !rt.stretch) return;

    // Resume AudioContext (required for autoplay policies)
    if (rt.audioContext.state === "suspended") {
      await rt.audioContext.resume();
    }

    const inputTime = rt.stretch.inputTime ?? 0;

    rt.stretch.schedule({
      active: true,
      input: inputTime,
      rate: rt.rate,
      semitones: rt.semitones,
    });

    rt.isPlaying = true;
    setIsPlaying(true);

    // Start video (muted, visual only)
    if (video) {
      video.currentTime = inputTime;
      video.playbackRate = rt.rate;
      video.play().catch(() => {});
    }

    // Start sync loop
    if (rt.rafId === null) {
      rt.lastUiUpdateMs = 0;
      rt.rafId = requestAnimationFrame(syncLoop);
    }
  }, [syncLoop]);

  // Pause
  const pause = useCallback(() => {
    const rt = runtime.current;
    const video = videoRef.current;

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
    setRateState(newRate);

    if (rt.stretch) {
      rt.stretch.schedule({
        rate: newRate,
        semitones: rt.semitones,
      });
    }

    if (video) {
      video.playbackRate = newRate;
    }
  }, []);

  // Set semitones
  const setSemitones = useCallback((newSemitones: number) => {
    const rt = runtime.current;

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
    const clamped = Math.max(0, Math.min(1, newVolume));

    rt.volume = clamped;
    setVolumeState(clamped);

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
      cleanup();
      setState("loading");

      try {
        const rt = runtime.current;

        // Setup video element (muted - audio comes from stretch)
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
        video.playbackRate = initialRate;

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
          input: initialPosition,
          rate: rt.rate,
          semitones: rt.semitones,
          loopStart: 0,
          loopEnd: audioBuffer.duration,
        });

        if (initialPosition > 0) {
          video.currentTime = initialPosition;
          setCurrentTime(initialPosition);
        }

        setState("ready");

        // Auto-play if requested
        if (autoPlay) {
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
  }, [fileUrl, cleanup, play, initialRate, initialPosition, autoPlay, onVideoError]);

  // Visibility change handler
  useEffect(() => {
    const handleVisibility = () => {
      const rt = runtime.current;
      const video = videoRef.current;

      if (document.visibilityState === "visible" && rt.isPlaying && video) {
        // Resync video to audio when returning from background
        const audioTime = rt.stretch?.inputTime ?? 0;
        video.currentTime = audioTime;
        video.play().catch(() => {});

        // Restart sync loop if needed
        if (rt.rafId === null) {
          rt.rafId = requestAnimationFrame(syncLoop);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [syncLoop]);

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
    isNativeFallback: false, // No more native fallback
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

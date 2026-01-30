import { useCallback, useEffect, useRef, useState } from "react";

export type StretchPlayerState = "loading" | "ready" | "error";

interface UseStretchPlayerProps {
  videoElement: HTMLVideoElement | null;
  fileUrl: string;
  isVideoReady: boolean;
  initialRate?: number;
  initialSemitones?: number;
  initialPosition?: number;
  initialReverbAmount?: number;
  initialVolume?: number;
  autoPlay?: boolean;
  onEnded?: () => void;
}

interface UseStretchPlayerReturn {
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

const FETCH_TIMEOUT_MS = 30000;

// Generate impulse response for reverb
function generateImpulseResponse(
  context: AudioContext | OfflineAudioContext,
  duration: number = 2,
  decay: number = 2,
): AudioBuffer {
  const sampleRate = context.sampleRate;
  const length = sampleRate * duration;
  const impulse = context.createBuffer(2, length, sampleRate);
  const leftChannel = impulse.getChannelData(0);
  const rightChannel = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const n = i / sampleRate;
    leftChannel[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / duration, decay);
    rightChannel[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / duration, decay);
  }

  return impulse;
}

export function useStretchPlayer({
  videoElement,
  fileUrl,
  isVideoReady,
  initialRate = 1,
  initialSemitones = 0,
  initialPosition = 0,
  initialReverbAmount = 0,
  initialVolume = 1,
  autoPlay = true,
  onEnded,
}: UseStretchPlayerProps): UseStretchPlayerReturn {
  const [state, setState] = useState<StretchPlayerState>("loading");
  const [rate, setRateState] = useState(initialRate);
  const [semitones, setSemitonesState] = useState(initialSemitones);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isNativeFallback, setIsNativeFallback] = useState(false);
  const [reverbAmount, setReverbAmountState] = useState(initialReverbAmount);
  const [volume, setVolumeState] = useState(initialVolume);

  const audioContextRef = useRef<AudioContext | null>(null);
  const stretchNodeRef = useRef<any>(null);
  const timeUpdateIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileUrlRef = useRef(fileUrl);
  const initStartedRef = useRef(false);
  const stretchInitedRef = useRef(false);
  const useNativeFallbackRef = useRef(false);
  const durationRef = useRef(0);
  const audioBufferRef = useRef<AudioBuffer | null>(null);

  // Reverb nodes
  const convolverRef = useRef<ConvolverNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const reverbAmountRef = useRef(initialReverbAmount);
  const volumeRef = useRef(initialVolume);

  // Use refs for values needed in callbacks to avoid stale closures
  const rateRef = useRef(initialRate);
  const semitonesRef = useRef(initialSemitones);
  const isPlayingRef = useRef(false);
  const onEndedRef = useRef(onEnded);

  // Keep refs in sync
  rateRef.current = rate;
  semitonesRef.current = semitones;
  isPlayingRef.current = isPlaying;
  reverbAmountRef.current = reverbAmount;
  volumeRef.current = volume;
  onEndedRef.current = onEnded;

  const cleanup = useCallback(() => {
    console.log("StretchPlayer: cleanup");
    if (timeUpdateIdRef.current) {
      clearInterval(timeUpdateIdRef.current);
      timeUpdateIdRef.current = null;
    }
    if (stretchNodeRef.current) {
      try {
        stretchNodeRef.current.stop();
        stretchNodeRef.current.disconnect();
      } catch (e) {
        // Ignore cleanup errors
      }
      stretchNodeRef.current = null;
    }
    // Clean up reverb nodes
    if (convolverRef.current) {
      try {
        convolverRef.current.disconnect();
      } catch (e) {}
      convolverRef.current = null;
    }
    if (dryGainRef.current) {
      try {
        dryGainRef.current.disconnect();
      } catch (e) {}
      dryGainRef.current = null;
    }
    if (wetGainRef.current) {
      try {
        wetGainRef.current.disconnect();
      } catch (e) {}
      wetGainRef.current = null;
    }
    if (masterGainRef.current) {
      try {
        masterGainRef.current.disconnect();
      } catch (e) {}
      masterGainRef.current = null;
    }
    stretchInitedRef.current = false;
    useNativeFallbackRef.current = false;
    audioBufferRef.current = null;
    initStartedRef.current = false;
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  // Initialize stretch node - called on first play() with user gesture
  const initStretch = useCallback(async (): Promise<boolean> => {
    const audioContext = audioContextRef.current;
    const audioBuffer = audioBufferRef.current;
    if (!audioContext || !audioBuffer) {
      console.log("StretchPlayer: initStretch - no context or buffer");
      return false;
    }

    // Check if AudioWorklet is available
    if (!audioContext.audioWorklet) {
      console.warn("StretchPlayer: AudioWorklet not available, using native fallback");
      return false;
    }

    try {
      // Resume context first (required for user gesture on iOS)
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const SignalsmithStretch = (await import("signalsmith-stretch")).default;
      const stretchNode = await SignalsmithStretch(audioContext);
      stretchNodeRef.current = stretchNode;

      // Set up reverb audio graph with ConvolverNode and master volume
      const convolver = audioContext.createConvolver();
      const dryGain = audioContext.createGain();
      const wetGain = audioContext.createGain();
      const masterGain = audioContext.createGain();

      // Generate impulse response for reverb
      convolver.buffer = generateImpulseResponse(audioContext, 2, 2);

      // Initial mix based on reverbAmount
      const amount = reverbAmountRef.current;
      dryGain.gain.value = 1 - amount * 0.5;
      wetGain.gain.value = amount;
      masterGain.gain.value = volumeRef.current;

      // Route: stretchNode -> (dry + convolver->wet) -> masterGain -> destination
      stretchNode.connect(dryGain);
      stretchNode.connect(convolver);
      convolver.connect(wetGain);
      dryGain.connect(masterGain);
      wetGain.connect(masterGain);
      masterGain.connect(audioContext.destination);

      convolverRef.current = convolver;
      dryGainRef.current = dryGain;
      wetGainRef.current = wetGain;
      masterGainRef.current = masterGain;

      console.log("StretchPlayer: reverb nodes initialized");

      // Add audio buffers
      const channelBuffers: Float32Array[] = [];
      for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
        channelBuffers.push(audioBuffer.getChannelData(c));
      }
      await stretchNode.addBuffers(channelBuffers);

      // Mute video element (audio comes from stretch node)
      if (videoElement) {
        videoElement.muted = true;
      }

      // Set initial position
      stretchNode.schedule({
        active: false,
        input: currentTime || 0,
        rate: rateRef.current,
        semitones: semitonesRef.current,
        loopStart: 0,
        loopEnd: audioBuffer.duration,
      });

      console.log("StretchPlayer: stretch node initialized");
      return true;
    } catch (err) {
      console.error("StretchPlayer: stretch init failed:", err);
      return false;
    }
  }, [videoElement, currentTime]);

  // Setup native fallback (video plays audio directly with playbackRate)
  const setupNativeFallback = useCallback(() => {
    if (!videoElement) return;

    console.log("StretchPlayer: using native fallback");
    useNativeFallbackRef.current = true;
    setIsNativeFallback(true);

    // Unmute video (audio comes from video element)
    videoElement.muted = false;

    // Disable pitch preservation for proper slowed/sped up effect
    (videoElement as any).preservesPitch = false;
    (videoElement as any).mozPreservesPitch = false;
    (videoElement as any).webkitPreservesPitch = false;

    // Apply current rate (semitones is folded into rate for native)
    const effectiveRate = rateRef.current * Math.pow(2, semitonesRef.current / 12);
    videoElement.playbackRate = effectiveRate;
  }, [videoElement]);

  // Play function - initializes stretch on first call (user gesture)
  const play = useCallback(async () => {
    const audioContext = audioContextRef.current;
    if (!audioContext) {
      console.log("StretchPlayer: play - no context");
      return;
    }

    // Resume context if suspended (iOS requirement)
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    // Initialize stretch node on first play (needs user gesture on iOS)
    if (!stretchInitedRef.current) {
      setState("loading");
      const success = await initStretch();
      if (!success) {
        setupNativeFallback();
      }
      stretchInitedRef.current = true;
      setState("ready");
    }

    // Native fallback path
    if (useNativeFallbackRef.current && videoElement) {
      const effectiveRate = rateRef.current * Math.pow(2, semitonesRef.current / 12);
      videoElement.playbackRate = effectiveRate;
      videoElement.play().catch(() => {});
      setIsPlaying(true);
      isPlayingRef.current = true;
      return;
    }

    // Stretch node path
    const stretchNode = stretchNodeRef.current;
    if (!stretchNode) {
      console.log("StretchPlayer: play - no stretch node");
      return;
    }

    const inputTime = stretchNode.inputTime || 0;
    stretchNode.schedule({
      active: true,
      input: inputTime,
      rate: rateRef.current,
      semitones: semitonesRef.current,
    });

    // Sync video
    if (videoElement) {
      videoElement.currentTime = inputTime;
      videoElement.playbackRate = rateRef.current;
      videoElement.play().catch(() => {});
    }

    setIsPlaying(true);
    isPlayingRef.current = true;
    console.log("StretchPlayer: playing at", inputTime);
  }, [videoElement, initStretch, setupNativeFallback]);

  // Pause function
  const pause = useCallback(() => {
    // Native fallback path
    if (useNativeFallbackRef.current && videoElement) {
      videoElement.pause();
      setIsPlaying(false);
      isPlayingRef.current = false;
      return;
    }

    // Stretch node path
    const stretchNode = stretchNodeRef.current;
    if (stretchNode) {
      stretchNode.schedule({ active: false });
    }

    if (videoElement) {
      videoElement.pause();
    }

    setIsPlaying(false);
    isPlayingRef.current = false;
    console.log("StretchPlayer: paused");
  }, [videoElement]);

  // Toggle playback
  const togglePlayback = useCallback(() => {
    if (isPlayingRef.current) {
      pause();
    } else {
      play();
    }
  }, [play, pause]);

  // Set rate
  const setRate = useCallback(
    (newRate: number) => {
      setRateState(newRate);
      rateRef.current = newRate;

      // Native fallback: combine rate and semitones
      if (useNativeFallbackRef.current && videoElement) {
        const effectiveRate = newRate * Math.pow(2, semitonesRef.current / 12);
        videoElement.playbackRate = effectiveRate;
        return;
      }

      // Stretch node path
      const stretchNode = stretchNodeRef.current;
      if (stretchNode) {
        stretchNode.schedule({
          rate: newRate,
          semitones: semitonesRef.current,
        });
      }

      if (videoElement) {
        videoElement.playbackRate = newRate;
      }
    },
    [videoElement],
  );

  // Set semitones
  const setSemitones = useCallback(
    (newSemitones: number) => {
      setSemitonesState(newSemitones);
      semitonesRef.current = newSemitones;

      // Native fallback: combine rate and semitones
      if (useNativeFallbackRef.current && videoElement) {
        const effectiveRate = rateRef.current * Math.pow(2, newSemitones / 12);
        videoElement.playbackRate = effectiveRate;
        return;
      }

      // Stretch node path
      const stretchNode = stretchNodeRef.current;
      if (stretchNode) {
        stretchNode.schedule({
          rate: rateRef.current,
          semitones: newSemitones,
        });
      }
    },
    [videoElement],
  );

  // Set reverb amount (0-1)
  const setReverbAmount = useCallback((amount: number) => {
    // Skip in native fallback mode (no Web Audio reverb available)
    if (useNativeFallbackRef.current) return;

    const clampedAmount = Math.max(0, Math.min(1, amount));
    setReverbAmountState(clampedAmount);
    reverbAmountRef.current = clampedAmount;

    // Update gain values if nodes are initialized
    if (dryGainRef.current && wetGainRef.current) {
      dryGainRef.current.gain.value = 1 - clampedAmount * 0.5;
      wetGainRef.current.gain.value = clampedAmount;
      console.log(
        `StretchPlayer: reverb set dry=${dryGainRef.current.gain.value.toFixed(2)}, wet=${wetGainRef.current.gain.value.toFixed(2)}`,
      );
    }
  }, []);

  // Set volume (0-1)
  const setVolume = useCallback(
    (newVolume: number) => {
      const clampedVolume = Math.max(0, Math.min(1, newVolume));
      setVolumeState(clampedVolume);
      volumeRef.current = clampedVolume;

      // Native fallback: use video.volume
      if (useNativeFallbackRef.current && videoElement) {
        videoElement.volume = clampedVolume;
        return;
      }

      // Stretch node path: update master gain
      if (masterGainRef.current) {
        masterGainRef.current.gain.value = clampedVolume;
      }
    },
    [videoElement],
  );

  // Seek
  const seek = useCallback(
    (timeSeconds: number) => {
      const clampedTime = Math.max(0, Math.min(timeSeconds, durationRef.current));
      setCurrentTime(clampedTime);

      // Native fallback path
      if (useNativeFallbackRef.current && videoElement) {
        videoElement.currentTime = clampedTime;
        return;
      }

      // Stretch node path
      const stretchNode = stretchNodeRef.current;
      if (stretchNode) {
        stretchNode.schedule({
          input: clampedTime,
          rate: rateRef.current,
          semitones: semitonesRef.current,
          active: isPlayingRef.current,
        });
      }

      if (videoElement) {
        videoElement.currentTime = clampedTime;
      }
    },
    [videoElement],
  );

  // Initial load: context + fetch + decode (stretch node is deferred to play())
  // Re-run when context was cleared (e.g. hot reload) so we don't get stuck with no context
  useEffect(() => {
    if (!isVideoReady || !videoElement || !fileUrl) {
      return;
    }
    if (initStartedRef.current && audioContextRef.current !== null) {
      return;
    }
    initStartedRef.current = true;

    const abortController = new AbortController();

    const load = async () => {
      console.log("StretchPlayer: loading...");
      setState("loading");

      try {
        cleanup();
        initStartedRef.current = true;

        // Create AudioContext
        const audioContext = new (
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext
        )();
        audioContextRef.current = audioContext;

        // Fetch with timeout
        const timeoutId = setTimeout(() => abortController.abort(), FETCH_TIMEOUT_MS);
        console.log("StretchPlayer: fetching audio...");
        const response = await fetch(fileUrl, { signal: abortController.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Fetch failed: ${response.status}`);
        }

        console.log("StretchPlayer: decoding audio...");
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        audioBufferRef.current = audioBuffer;
        durationRef.current = audioBuffer.duration;
        setDuration(audioBuffer.duration);

        if (initialPosition > 0) {
          setCurrentTime(initialPosition);
          videoElement.currentTime = initialPosition;
        }

        // Start polling for time updates
        timeUpdateIdRef.current = setInterval(() => {
          // Native fallback: use video time
          if (useNativeFallbackRef.current && videoElement) {
            const time = videoElement.currentTime;
            setCurrentTime(Math.min(time, durationRef.current));

            // Handle end
            if (time >= durationRef.current - 0.1 && isPlayingRef.current) {
              if (onEndedRef.current) {
                onEndedRef.current();
              } else {
                videoElement.pause();
                setIsPlaying(false);
                isPlayingRef.current = false;
              }
            }
            return;
          }

          // Stretch node: use inputTime
          const node = stretchNodeRef.current;
          if (!node) return;

          const audioTime = node.inputTime || 0;
          const dur = durationRef.current;
          setCurrentTime(Math.min(audioTime, dur));

          // Sync video to audio
          if (videoElement) {
            // Keep playback rate in sync (browsers might reset it in background)
            const targetRate = useNativeFallbackRef.current
              ? rateRef.current * Math.pow(2, semitonesRef.current / 12)
              : rateRef.current;
            if (Math.abs(videoElement.playbackRate - targetRate) > 0.01) {
              videoElement.playbackRate = targetRate;
            }

            if (isPlayingRef.current && !videoElement.seeking) {
              const drift = Math.abs(videoElement.currentTime - audioTime);
              // Tighter sync threshold (0.15s) and check if it's lagging
              if (drift > 0.15) {
                videoElement.currentTime = audioTime;
              }

              // Ensure video is playing if we think it should be
              if (videoElement.paused && document.visibilityState === "visible") {
                videoElement.play().catch(() => {});
              }
            }
          }

          // Handle end
          if (audioTime >= dur - 0.1 && isPlayingRef.current) {
            if (onEndedRef.current) {
              onEndedRef.current();
            } else {
              node.schedule({ active: false });
              setIsPlaying(false);
              isPlayingRef.current = false;
              if (videoElement) videoElement.pause();
            }
          }
        }, 100);

        console.log("StretchPlayer: ready (stretch init deferred to play)");
        setState("ready");

        // Auto-play if enabled (user just clicked play in UnifiedPlayer)
        if (autoPlay) {
          // Small delay to ensure UI is rendered
          setTimeout(() => {
            play();
          }, 100);
        }
      } catch (error) {
        const err = error as Error;
        if (err.name === "AbortError") {
          console.error("StretchPlayer: fetch timeout");
        } else {
          console.error("StretchPlayer: load failed:", err?.name, err?.message, err);
        }
        initStartedRef.current = false;
        cleanup();
        setState("error");
      }
    };

    load();

    return () => {
      abortController.abort();
    };
  }, [isVideoReady, videoElement, fileUrl, initialPosition, autoPlay, cleanup, play]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Reset when file URL changes
  useEffect(() => {
    if (fileUrl !== fileUrlRef.current) {
      console.log("StretchPlayer: file changed, resetting");
      fileUrlRef.current = fileUrl;
      initStartedRef.current = false;
      stretchInitedRef.current = false;
      cleanup();
      setState("loading");
      setCurrentTime(0);
      setIsPlaying(false);
    }
  }, [fileUrl, cleanup]);

  // Keep video playback rate in sync
  useEffect(() => {
    if (!videoElement || state !== "ready") return;
    if (useNativeFallbackRef.current) {
      const effectiveRate = rate * Math.pow(2, semitones / 12);
      videoElement.playbackRate = effectiveRate;
    } else {
      videoElement.playbackRate = rate;
    }
  }, [videoElement, state, rate, semitones]);

  // Re-sync state when tab becomes visible again (browser sleep, background tab, etc.)
  useEffect(() => {
    const syncFromSource = () => {
      if (document.visibilityState !== "visible") return;
      const video = videoElement;
      if (!video || durationRef.current <= 0) return;

      if (useNativeFallbackRef.current) {
        const time = video.currentTime;
        const playing = !video.paused;
        setCurrentTime(Math.min(time, durationRef.current));
        setIsPlaying(playing);
        isPlayingRef.current = playing;
        return;
      }

      const node = stretchNodeRef.current;
      if (!node) return;
      const audioTime = node.inputTime ?? 0;
      const dur = durationRef.current;
      setCurrentTime(Math.min(audioTime, dur));

      // Check if audio was still playing in background
      const audioWasPlaying = isPlayingRef.current;

      if (video) {
        const drift = Math.abs(video.currentTime - audioTime);
        if (drift > 0.05) video.currentTime = audioTime;

        // Ensure rate is correct
        const targetRate = useNativeFallbackRef.current
          ? rateRef.current * Math.pow(2, semitonesRef.current / 12)
          : rateRef.current;
        video.playbackRate = targetRate;

        // Resume video if audio was playing in background
        if (audioWasPlaying) {
          video.play().catch((err) => {
            console.warn("StretchPlayer: could not resume video on visible:", err);
          });
        }
      }
    };

    const onVisible = () => {
      // Small delay to let browser stabilize
      setTimeout(syncFromSource, 50);
    };

    const handleVideoPause = () => {
      // If the video was paused by the system (not by us), sync our state
      if (isPlayingRef.current && document.visibilityState === "visible") {
        console.log("StretchPlayer: video paused by system/user-gesture, syncing state");
        pause();
      }
    };

    const handleVideoPlay = () => {
      if (!isPlayingRef.current && document.visibilityState === "visible") {
        console.log("StretchPlayer: video played by system/user-gesture, syncing state");
        play();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    videoElement?.addEventListener("pause", handleVideoPause);
    videoElement?.addEventListener("play", handleVideoPlay);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
      videoElement?.removeEventListener("pause", handleVideoPause);
      videoElement?.removeEventListener("play", handleVideoPlay);
    };
  }, [videoElement, play, pause]);

  return {
    state,
    isPlaying,
    currentTime,
    duration,
    rate,
    semitones,
    reverbAmount,
    volume,
    isNativeFallback,
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

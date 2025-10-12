import { useEffect, useRef, useState } from "react";

interface AudioNodes {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  convolver: ConvolverNode;
  dryGain: GainNode;
  wetGain: GainNode;
  masterGain: GainNode;
}

interface UseAudioContextReturn {
  isReady: boolean;
  setReverbAmount: (amount: number) => void;
  reverbAmount: number;
  isWebAudioActive: boolean;
}

function generateImpulseResponse(
  context: AudioContext,
  duration: number = 2,
  decay: number = 2
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

export function useAudioContext(
  videoElement: HTMLVideoElement | null
): UseAudioContextReturn {
  const audioNodesRef = useRef<AudioNodes | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [reverbAmount, setReverbAmountState] = useState(0);
  const [isWebAudioActive, setIsWebAudioActive] = useState(false);
  const resumeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const handlePlayRef = useRef<(() => void) | null>(null);

  const isSafari =
    typeof window !== "undefined" &&
    /Safari/.test(navigator.userAgent) &&
    !/Chrome/.test(navigator.userAgent);

  const initializeWebAudio = async (video: HTMLVideoElement) => {
    if (audioNodesRef.current) {
      console.log("Web Audio API already initialized");
      return;
    }

    try {
      const context = new AudioContext({
        latencyHint: "playback",
        sampleRate: 48000,
      });

      const ensureContextRunning = async () => {
        if (context.state === "suspended") {
          try {
            await context.resume();
            console.log("AudioContext resumed");
          } catch (e) {
            console.error("Failed to resume AudioContext:", e);
          }
        }
      };

      // IMPORTANT: Resume context BEFORE creating source node
      await ensureContextRunning();

      resumeIntervalRef.current = setInterval(() => {
        if (context.state === "suspended" && !video.paused) {
          ensureContextRunning();
        }
      }, 1000);

      // Mute video element BEFORE creating the source node
      // Once createMediaElementSource is called, audio routing is permanently changed
      const wasPlaying = !video.paused;
      const currentTime = video.currentTime;

      const source = context.createMediaElementSource(video);
      const convolver = context.createConvolver();
      const dryGain = context.createGain();
      const wetGain = context.createGain();
      const masterGain = context.createGain();

      const impulseResponse = generateImpulseResponse(context, 2, 2);
      convolver.buffer = impulseResponse;

      dryGain.gain.value = 1;
      wetGain.gain.value = 0;
      masterGain.gain.value = 1;

      source.connect(dryGain);
      source.connect(convolver);
      convolver.connect(wetGain);
      dryGain.connect(masterGain);
      wetGain.connect(masterGain);
      masterGain.connect(context.destination);

      handlePlayRef.current = () => {
        ensureContextRunning();
      };

      video.addEventListener("play", handlePlayRef.current);

      audioNodesRef.current = {
        context,
        source,
        convolver,
        dryGain,
        wetGain,
        masterGain,
      };

      setIsReady(true);
      setIsWebAudioActive(true);

      console.log("Web Audio API initialized successfully", {
        state: context.state,
        sampleRate: context.sampleRate,
        videoPlaying: wasPlaying,
      });
    } catch (error) {
      console.error("Failed to initialize Web Audio API:", error);
    }
  };

  useEffect(() => {
    videoElementRef.current = videoElement;
  }, [videoElement]);

  useEffect(() => {
    return () => {
      if (resumeIntervalRef.current) {
        clearInterval(resumeIntervalRef.current);
        resumeIntervalRef.current = null;
      }

      if (handlePlayRef.current && videoElementRef.current) {
        videoElementRef.current.removeEventListener("play", handlePlayRef.current);
        handlePlayRef.current = null;
      }

      if (audioNodesRef.current) {
        try {
          const { context } = audioNodesRef.current;
          context.close();
          console.log("Web Audio API cleaned up");
        } catch (error) {
          console.error("Error cleaning up Web Audio API:", error);
        }
        audioNodesRef.current = null;
        setIsReady(false);
        setIsWebAudioActive(false);
      }
    };
  }, []);

  const setReverbAmount = async (amount: number) => {
    if (isSafari) {
      console.log("Reverb disabled on Safari");
      return;
    }

    const clampedAmount = Math.max(0, Math.min(1, amount));
    setReverbAmountState(clampedAmount);

    if (clampedAmount > 0 && !audioNodesRef.current && videoElementRef.current) {
      await initializeWebAudio(videoElementRef.current);
    }

    if (audioNodesRef.current) {
      const { dryGain, wetGain } = audioNodesRef.current;
      dryGain.gain.value = 1 - clampedAmount * 0.5;
      wetGain.gain.value = clampedAmount;
      console.log(`Reverb set: dry=${dryGain.gain.value.toFixed(2)}, wet=${wetGain.gain.value.toFixed(2)}`);
    }
  };

  return {
    isReady,
    setReverbAmount,
    reverbAmount,
    isWebAudioActive,
  };
}

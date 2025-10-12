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
  const [isReady, setIsReady] = useState(false);
  const [reverbAmount, setReverbAmountState] = useState(0);

  useEffect(() => {
    if (!videoElement) {
      return;
    }

    try {
      const context = new AudioContext();
      const source = context.createMediaElementSource(videoElement);
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

      audioNodesRef.current = {
        context,
        source,
        convolver,
        dryGain,
        wetGain,
        masterGain,
      };

      setIsReady(true);

      console.log("Web Audio API initialized successfully");
    } catch (error) {
      console.error("Failed to initialize Web Audio API:", error);
    }

    return () => {
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
      }
    };
  }, [videoElement]);

  const setReverbAmount = (amount: number) => {
    if (!audioNodesRef.current) return;

    const clampedAmount = Math.max(0, Math.min(1, amount));
    setReverbAmountState(clampedAmount);

    const { dryGain, wetGain } = audioNodesRef.current;

    dryGain.gain.value = 1 - clampedAmount * 0.5;
    wetGain.gain.value = clampedAmount;
  };

  return {
    isReady,
    setReverbAmount,
    reverbAmount,
  };
}

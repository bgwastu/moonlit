import { useEffect, useRef } from "react";
import { saveVideoState } from "@/lib/videoState";

interface UseVideoStatePersistenceProps {
  sourceUrl: string;
  currentTime: number;
  rate: number;
  semitones: number;
  reverbAmount: number;
  pitchLockedToSpeed: boolean;
  isRepeat: boolean;
  volume: number;
  isReady: boolean;
  stateLoaded: boolean;
  videoDisabled: boolean;
  showLyrics: boolean;
}

/**
 * Hook for persisting video playback state.
 * Saves periodically (every 5s), on visibility change, and on unmount.
 */
export function useVideoStatePersistence({
  sourceUrl,
  currentTime,
  rate,
  semitones,
  reverbAmount,
  pitchLockedToSpeed,
  isRepeat,
  volume,
  isReady,
  stateLoaded,
  videoDisabled,
  showLyrics,
}: UseVideoStatePersistenceProps): void {
  const lastSaveRef = useRef<number>(0);

  useEffect(() => {
    if (!stateLoaded || !isReady) return;

    const now = Date.now();
    if (now - lastSaveRef.current < 5000) return;
    lastSaveRef.current = now;

    saveVideoState(sourceUrl, {
      position: currentTime,
      rate,
      semitones,
      reverbAmount,
      pitchLockedToSpeed,
      isRepeat,
      volume,
      videoDisabled,
      showLyrics,
    });
  }, [
    currentTime,
    rate,
    semitones,
    reverbAmount,
    pitchLockedToSpeed,
    isRepeat,
    volume,
    sourceUrl,
    stateLoaded,
    isReady,
    videoDisabled,
    showLyrics,
  ]);

  useEffect(() => {
    const saveState = () => {
      if (!stateLoaded) return;
      saveVideoState(sourceUrl, {
        position: currentTime,
        rate,
        semitones,
        reverbAmount,
        pitchLockedToSpeed,
        isRepeat,
        volume,
        videoDisabled,
        showLyrics,
      });
    };

    const handleVisibilityChange = () => {
      if (document.hidden) saveState();
    };

    window.addEventListener("beforeunload", saveState);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      saveState();
      window.removeEventListener("beforeunload", saveState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    currentTime,
    rate,
    semitones,
    reverbAmount,
    pitchLockedToSpeed,
    isRepeat,
    volume,
    sourceUrl,
    stateLoaded,
    videoDisabled,
    showLyrics,
  ]);
}

import { useEffect, useRef } from "react";
import { saveVideoState } from "@/lib/videoState";

interface UseVideoStatePersistenceProps {
  videoUrl: string;
  currentTime: number;
  rate: number;
  semitones: number;
  reverbAmount: number;
  pitchLockedToSpeed: boolean;
  isRepeat: boolean;
  isReady: boolean;
  stateLoaded: boolean;
}

/**
 * Hook for persisting video playback state.
 * Saves periodically (every 5s), on visibility change, and on unmount.
 */
export function useVideoStatePersistence({
  videoUrl,
  currentTime,
  rate,
  semitones,
  reverbAmount,
  pitchLockedToSpeed,
  isRepeat,
  isReady,
  stateLoaded,
}: UseVideoStatePersistenceProps): void {
  const lastSaveRef = useRef<number>(0);

  useEffect(() => {
    if (!stateLoaded || !isReady) return;

    const now = Date.now();
    if (now - lastSaveRef.current < 5000) return;
    lastSaveRef.current = now;

    saveVideoState(videoUrl, {
      position: currentTime,
      rate,
      semitones,
      reverbAmount,
      pitchLockedToSpeed,
      isRepeat,
    });
  }, [
    currentTime,
    rate,
    semitones,
    reverbAmount,
    pitchLockedToSpeed,
    isRepeat,
    videoUrl,
    stateLoaded,
    isReady,
  ]);

  useEffect(() => {
    const saveState = () => {
      if (!stateLoaded) return;
      saveVideoState(videoUrl, {
        position: currentTime,
        rate,
        semitones,
        reverbAmount,
        pitchLockedToSpeed,
        isRepeat,
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
    videoUrl,
    stateLoaded,
  ]);
}

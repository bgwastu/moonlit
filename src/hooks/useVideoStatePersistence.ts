import { useEffect, useRef } from "react";
import { saveVideoState } from "@/lib/videoState";

interface UseVideoStatePersistenceProps {
  sourceUrl: string;
  rate: number;
  semitones: number;
  reverbAmount: number;
  isRepeat: boolean;
  volume: number;
  isReady: boolean;
  stateLoaded: boolean;
  showLyrics: boolean;
}

export function useVideoStatePersistence({
  sourceUrl,
  rate,
  semitones,
  reverbAmount,
  isRepeat,
  volume,
  isReady,
  stateLoaded,
  showLyrics,
}: UseVideoStatePersistenceProps): void {
  const lastSaveRef = useRef<number>(0);

  useEffect(() => {
    if (!stateLoaded || !isReady) return;
    const now = Date.now();
    if (now - lastSaveRef.current < 5000) return;
    lastSaveRef.current = now;
    saveVideoState(sourceUrl, {
      rate,
      semitones,
      reverbAmount,
      isRepeat,
      volume,
      showLyrics,
    });
  }, [
    rate,
    semitones,
    reverbAmount,
    isRepeat,
    volume,
    sourceUrl,
    stateLoaded,
    isReady,
    showLyrics,
  ]);

  useEffect(() => {
    const saveState = () => {
      if (!stateLoaded) return;
      saveVideoState(sourceUrl, {
        rate,
        semitones,
        reverbAmount,
        isRepeat,
        volume,
        showLyrics,
      });
    };
    const handler = () => {
      if (document.hidden) saveState();
    };
    window.addEventListener("beforeunload", saveState);
    document.addEventListener("visibilitychange", handler);
    return () => {
      saveState();
      window.removeEventListener("beforeunload", saveState);
      document.removeEventListener("visibilitychange", handler);
    };
  }, [
    rate,
    semitones,
    reverbAmount,
    isRepeat,
    volume,
    sourceUrl,
    stateLoaded,
    showLyrics,
  ]);
}

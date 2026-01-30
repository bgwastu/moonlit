import { useCallback, useEffect, useRef, useState } from "react";

interface UseAmbientModeProps {
  videoElement: HTMLVideoElement | null;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isAudioOnly: boolean;
  isPlaying: boolean;
}

interface UseAmbientModeReturn {
  isSafari: boolean;
}

/**
 * Hook for managing ambient mode (canvas-based video glow effect).
 * Automatically disables on Safari due to rendering issues.
 */
export function useAmbientMode({
  videoElement,
  canvasRef,
  isAudioOnly,
  isPlaying,
}: UseAmbientModeProps): UseAmbientModeReturn {
  const [isSafari, setIsSafari] = useState(false);
  const animationFrameRef = useRef<number>();

  // Detect Safari
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent;
    setIsSafari(ua.includes("Safari") && !ua.includes("Chrome") && !ua.includes("CriOS"));
  }, []);

  // Canvas drawing loop for ambient effect
  useEffect(() => {
    if (isSafari || !videoElement || !canvasRef.current || isAudioOnly) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { alpha: false });

    if (!ctx) return;

    const draw = () => {
      if (videoElement && !videoElement.paused && !videoElement.ended) {
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      }
      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isSafari, videoElement, canvasRef, isAudioOnly, isPlaying]);

  return { isSafari };
}

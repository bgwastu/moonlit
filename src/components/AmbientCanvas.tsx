"use client";

import { useEffect, useRef, useState } from "react";

interface AmbientCanvasProps {
  videoElement: HTMLVideoElement | null;
  isAudioOnly: boolean;
  isPlaying: boolean;
}

/**
 * Canvas-based ambient glow effect behind the video.
 * Disabled on Safari due to rendering issues.
 */
export default function AmbientCanvas({
  videoElement,
  isAudioOnly,
  isPlaying,
}: AmbientCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isSafari, setIsSafari] = useState(false);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent;
    setIsSafari(ua.includes("Safari") && !ua.includes("Chrome") && !ua.includes("CriOS"));
  }, []);

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
  }, [isSafari, videoElement, isAudioOnly, isPlaying]);

  if (isSafari) return null;

  return (
    <canvas
      ref={canvasRef}
      width={30}
      height={15}
      style={{
        position: "absolute",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        filter: "blur(80px) contrast(1.15) saturate(1.1)",
        transform: "scale(1.3)",
        opacity: 0.35,
        zIndex: -1,
        pointerEvents: "none",
      }}
    />
  );
}

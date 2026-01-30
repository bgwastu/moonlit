"use client";

import { useEffect, useRef } from "react";

interface AmbientCanvasProps {
  videoElement: HTMLVideoElement | null;
  isAudioOnly: boolean;
  isPlaying: boolean;
}

/**
 * Canvas-based ambient glow behind the video.
 * Full-screen layer so the blur has no visible edges.
 */
export default function AmbientCanvas({
  videoElement,
  isAudioOnly,
  isPlaying,
}: AmbientCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (!videoElement || !canvasRef.current || isAudioOnly) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const draw = () => {
      if (videoElement && !videoElement.paused && !videoElement.ended) {
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      }
      rafRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [videoElement, isAudioOnly, isPlaying]);

  if (isAudioOnly) return null;

  return (
    <canvas
      ref={canvasRef}
      width={80}
      height={45}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        filter: "blur(80px) contrast(1.15) saturate(1.1)",
        opacity: 0.35,
        zIndex: -1,
        pointerEvents: "none",
      }}
    />
  );
}

"use client";

import { useEffect, useRef } from "react";

interface AmbientCanvasProps {
  videoElement: HTMLVideoElement | null;
  isAudioOnly: boolean;
  isPlaying: boolean;
  imageUrl?: string | null;
}

export default function AmbientCanvas({
  videoElement,
  isAudioOnly,
  isPlaying,
  imageUrl,
}: AmbientCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>();
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current || isAudioOnly) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    if (imageUrl) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = undefined;
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = imageUrl;
      imageRef.current = img;
      return;
    }

    if (!videoElement) return;

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
  }, [videoElement, isAudioOnly, isPlaying, imageUrl]);

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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseSyncedVideoOptions {
  src: string | undefined;
  active: boolean;
  isPlaying: boolean;
  /** Read the audio/DSP clock directly, independently of throttled UI updates. */
  getPlaybackTime: () => number;
  rate: number;
  onError?: () => void;
}

/** Match native video to the live audio clock without rounding rates or pausing to seek. */
export function useSyncedVideo(options: UseSyncedVideoOptions) {
  const { src, active } = options;
  const videoNode = useRef<HTMLVideoElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const videoRef = useCallback((node: HTMLVideoElement | null) => {
    videoNode.current = node;
    setVideoEl(node);
  }, []);
  const live = useRef(options);
  const [frame, setFrame] = useState<{ src?: string; ready: boolean; error?: string }>({
    ready: false,
  });
  useEffect(() => {
    live.current = options;
  });

  useEffect(() => {
    const video = videoNode.current;
    if (!video || !src) return;
    if (!active) {
      video.pause();
      return;
    }
    let raf = 0;
    let disposed = false;
    let failed = false;
    let framed = false;
    let initial = true;
    let playPending = false;
    let lastSeek = -Infinity;
    let previous: { audio: number; now: number } | undefined;
    const reset = requestAnimationFrame(() => setFrame({ src, ready: false }));
    video.muted = true;

    const onError = () => {
      if (disposed || failed) return;
      failed = true;
      cancelAnimationFrame(reset);
      setFrame({
        src,
        ready: false,
        error: "Video could not be played. You can keep listening with artwork.",
      });
      live.current.onError?.();
    };
    video.addEventListener("error", onError);
    if (video.error) onError();
    const sync = (now: number) => {
      if (disposed || failed) return;
      const { isPlaying, rate, getPlaybackTime } = live.current;
      const audioTime = getPlaybackTime();
      if (
        Number.isFinite(audioTime) &&
        video.readyState >= HTMLMediaElement.HAVE_METADATA
      ) {
        const target = Math.max(
          0,
          Math.min(
            audioTime,
            Number.isFinite(video.duration)
              ? Math.max(0, video.duration - 0.04)
              : audioTime,
          ),
        );
        const drift = target - video.currentTime;
        const jump =
          previous &&
          Math.abs(
            audioTime -
              previous.audio -
              (isPlaying ? ((now - previous.now) / 1000) * rate : 0),
          ) > 0.5;
        if (
          !video.seeking &&
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          now - lastSeek > 900 &&
          Math.abs(drift) > 0.06 &&
          (initial ||
            jump ||
            !isPlaying ||
            (Math.abs(drift) > 1.25 &&
              video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA))
        ) {
          // Align on startup, an actual seek, or a large discontinuity. Keep the last frame painted.
          try {
            video.currentTime = target;
            lastSeek = now;
          } catch {
            /* Metadata may be changing. */
          }
        }
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) initial = false;
        previous = { audio: audioTime, now };
        // Gently remove small drift; arbitrary rates such as 0.83 stay continuous.
        const correction =
          isPlaying && Math.abs(drift) > 0.04
            ? Math.max(-0.05, Math.min(0.05, drift * 0.2))
            : 0;
        const desiredRate = Math.max(0.25, Math.min(4, rate * (1 + correction)));
        if (Math.abs(video.playbackRate - desiredRate) > 0.002)
          video.playbackRate = desiredRate;
        const ended =
          Number.isFinite(video.duration) && audioTime >= video.duration - 0.04;
        if (!isPlaying || ended) {
          if (!video.paused) video.pause();
        } else if (video.paused && !playPending && !video.seeking) {
          playPending = true;
          void video
            .play()
            .catch((error) => {
              if (!disposed && error.name !== "AbortError") onError();
            })
            .finally(() => {
              playPending = false;
            });
        }
        if (
          !framed &&
          !video.seeking &&
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          Math.abs(drift) < 0.25
        ) {
          framed = true;
          setFrame({ src, ready: true });
        }
      }
      raf = requestAnimationFrame(sync);
    };
    raf = requestAnimationFrame(sync);
    return () => {
      disposed = true;
      cancelAnimationFrame(reset);
      cancelAnimationFrame(raf);
      video.removeEventListener("error", onError);
      video.pause();
    };
  }, [src, active, videoEl]);

  return {
    videoRef,
    videoEl,
    isVideoReady: Boolean(src && frame.src === src && frame.ready),
    error: frame.src === src ? frame.error : undefined,
  };
}

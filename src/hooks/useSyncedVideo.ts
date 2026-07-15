"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SOFT_DRIFT_S = 0.35;
const HARD_SEEK_S = 1.0;
const SEEK_TIMEOUT_MS = 2500;

export interface UseSyncedVideoOptions {
  /** Stream URL — when set, the video element is expected to be mounted. */
  src: string | undefined;
  /** When false, video stays mounted but is not driven. */
  active: boolean;
  isPlaying: boolean;
  currentTime: number;
  rate: number;
}

export interface UseSyncedVideoResult {
  videoRef: (node: HTMLVideoElement | null) => void;
  /** True once we have a paintable frame near the audio clock. */
  isVideoReady: boolean;
}

/**
 * Keep a muted video element locked to an external audio/stretch clock.
 * Coalesces seeks and never re-enters currentTime while seeking (avoids freeze
 * loops on range-proxied streams).
 */
export function useSyncedVideo({
  src,
  active,
  isPlaying,
  currentTime,
  rate,
}: UseSyncedVideoOptions): UseSyncedVideoResult {
  const videoNodeRef = useRef<HTMLVideoElement | null>(null);
  const [nodeVersion, setNodeVersion] = useState(0);

  const videoRef = useCallback((node: HTMLVideoElement | null) => {
    videoNodeRef.current = node;
    setNodeVersion((v) => v + 1);
  }, []);

  const [trackedSrc, setTrackedSrc] = useState(src);
  const [frameReady, setFrameReady] = useState(false);
  // Reset readiness when the stream URL changes (React-approved render adjustment).
  if (src !== trackedSrc) {
    setTrackedSrc(src);
    setFrameReady(false);
  }

  const activeRef = useRef(active);
  const playingRef = useRef(isPlaying);
  const timeRef = useRef(currentTime);
  const pendingSeekRef = useRef<number | null>(null);
  const seekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncApiRef = useRef<{
    seekTo: (t: number) => void;
    applyPlayState: () => void;
  } | null>(null);

  useEffect(() => {
    activeRef.current = active;
    playingRef.current = isPlaying;
    timeRef.current = currentTime;
  });

  // Bind listeners to the live element whenever src / node changes.
  useEffect(() => {
    const video = videoNodeRef.current;
    if (!src || !video) {
      syncApiRef.current = null;
      return;
    }

    const clearSeekTimeout = () => {
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
        seekTimeoutRef.current = null;
      }
    };

    const markReadyIfFramed = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        setFrameReady(true);
      }
    };

    const applyPlayState = () => {
      if (!activeRef.current) {
        if (!video.paused) video.pause();
        return;
      }
      if (video.seeking || pendingSeekRef.current !== null) return;

      if (playingRef.current) {
        if (video.paused) void video.play().catch(() => {});
      } else if (!video.paused) {
        video.pause();
      }
    };

    const seekTo = (t: number) => {
      if (!activeRef.current || !Number.isFinite(t)) return;

      if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
        pendingSeekRef.current = t;
        return;
      }

      if (video.seeking) {
        pendingSeekRef.current = t;
        return;
      }

      const drift = Math.abs(video.currentTime - t);
      if (
        drift <= SOFT_DRIFT_S &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        markReadyIfFramed();
        applyPlayState();
        return;
      }

      if (drift > HARD_SEEK_S && !video.paused) {
        video.pause();
      }

      pendingSeekRef.current = null;
      if (drift > HARD_SEEK_S || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        setFrameReady(false);
      }

      clearSeekTimeout();
      seekTimeoutRef.current = setTimeout(() => {
        pendingSeekRef.current = null;
        markReadyIfFramed();
        applyPlayState();
      }, SEEK_TIMEOUT_MS);

      try {
        video.currentTime = Math.max(0, t);
      } catch {
        clearSeekTimeout();
        applyPlayState();
      }
    };

    const finishSeek = () => {
      clearSeekTimeout();
      markReadyIfFramed();

      const next = pendingSeekRef.current;
      pendingSeekRef.current = null;
      if (next !== null && Math.abs(video.currentTime - next) > SOFT_DRIFT_S) {
        seekTo(next);
        return;
      }
      applyPlayState();
    };

    syncApiRef.current = { seekTo, applyPlayState };
    pendingSeekRef.current = null;

    const onSeeked = () => finishSeek();
    const onLoadedData = () => {
      markReadyIfFramed();
      const pending = pendingSeekRef.current;
      seekTo(pending ?? timeRef.current);
    };
    const onCanPlay = () => {
      markReadyIfFramed();
      applyPlayState();
    };
    const onError = () => {
      clearSeekTimeout();
      pendingSeekRef.current = null;
      setFrameReady(false);
    };

    video.muted = true;
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("error", onError);

    if (activeRef.current && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      seekTo(timeRef.current);
    }

    return () => {
      clearSeekTimeout();
      syncApiRef.current = null;
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("error", onError);
    };
  }, [src, nodeVersion]);

  // Deactivate: pause only (keep last frame ready so toggle-on is instant).
  useEffect(() => {
    if (active) return;
    pendingSeekRef.current = null;
    if (seekTimeoutRef.current) {
      clearTimeout(seekTimeoutRef.current);
      seekTimeoutRef.current = null;
    }
    const video = videoNodeRef.current;
    if (video && !video.paused) video.pause();
  }, [active, nodeVersion]);

  // Drive clock / rate / play from React state.
  useEffect(() => {
    const video = videoNodeRef.current;
    const api = syncApiRef.current;
    if (!video || !api || !active) return;

    video.muted = true;
    if (Math.abs(video.playbackRate - rate) > 0.01) {
      video.playbackRate = rate;
    }

    const drift = Math.abs(video.currentTime - currentTime);
    if (drift > SOFT_DRIFT_S) {
      api.seekTo(currentTime);
      return;
    }

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      setFrameReady(true);
    }
    api.applyPlayState();
  }, [active, isPlaying, currentTime, rate, nodeVersion]);

  return {
    videoRef,
    isVideoReady: Boolean(src && frameReady),
  };
}

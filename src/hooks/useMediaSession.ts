import { useEffect } from "react";
import { Media } from "@/interfaces";
import { getPlatform } from "@/utils";

interface UseMediaSessionProps {
  media: Media;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  rate: number;
  onPlay: () => void;
  onPause: () => void;
  onSeekBackward: () => void;
  onSeekForward: () => void;
  onSeek: (time: number) => void;
}

/**
 * Hook for managing Media Session API integration.
 * Sets up metadata, action handlers, and playback state.
 */
export function useMediaSession({
  media,
  isPlaying,
  currentTime,
  duration,
  rate,
  onPlay,
  onPause,
  onSeekBackward,
  onSeekForward,
  onSeek,
}: UseMediaSessionProps): void {
  // Set up metadata and action handlers
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    let highResCover = media.metadata.coverUrl;
    if (getPlatform(media.sourceUrl) === "youtube") {
      highResCover =
        media.metadata.coverUrl?.replace(
          /(?<!maxres)(hq|mq|sd)?default/,
          "maxresdefault",
        ) || media.metadata.coverUrl;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: media.metadata.title,
      artist: media.metadata.artist ?? media.metadata.author,
      album: media.metadata.album ?? "",
      artwork: [
        {
          src: highResCover,
          sizes: "512x512",
          type: "image/jpeg",
        },
      ],
    });

    navigator.mediaSession.setActionHandler("play", onPlay);
    navigator.mediaSession.setActionHandler("pause", onPause);
    navigator.mediaSession.setActionHandler("seekbackward", onSeekBackward);
    navigator.mediaSession.setActionHandler("seekforward", onSeekForward);
    navigator.mediaSession.setActionHandler("previoustrack", onSeekBackward);
    navigator.mediaSession.setActionHandler("nexttrack", onSeekForward);

    try {
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime !== undefined) {
          onSeek(details.seekTime);
        }
      });
    } catch {
      console.log("MediaSession seekto not supported");
    }

    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("seekbackward", null);
      navigator.mediaSession.setActionHandler("seekforward", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      try {
        navigator.mediaSession.setActionHandler("seekto", null);
      } catch {}
    };
  }, [media, onPlay, onPause, onSeekBackward, onSeekForward, onSeek]);

  // Update playback state and position state together
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";

    // Also update position state (playbackRate cannot be 0 per spec; use 1 when paused)
    if ("setPositionState" in navigator.mediaSession) {
      try {
        const safeRate = Math.max(0.25, isPlaying ? rate : 1);
        navigator.mediaSession.setPositionState({
          duration: Math.max(0, duration),
          playbackRate: safeRate,
          position: Math.max(0, Math.min(currentTime, duration)),
        });
      } catch (e) {
        console.error("Error setting position state:", e);
      }
    }
  }, [isPlaying, currentTime, duration, rate]);
}

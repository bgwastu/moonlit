import { useEffect } from "react";
import { Song } from "@/interfaces";

interface UseMediaSessionProps {
  song: Song;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
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
  song,
  isPlaying,
  currentTime,
  duration,
  onPlay,
  onPause,
  onSeekBackward,
  onSeekForward,
  onSeek,
}: UseMediaSessionProps): void {
  // Set up metadata and action handlers
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    let highResCover = song.metadata.coverUrl;
    if (song.metadata.platform === "youtube") {
      highResCover =
        song.metadata.coverUrl?.replace(/(hq|mq|sd)?default/, "maxresdefault") ||
        song.metadata.coverUrl;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.metadata.title,
      artist: song.metadata.author,
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
  }, [song, onPlay, onPause, onSeekBackward, onSeekForward, onSeek]);

  // Update playback state
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  // Update position state
  useEffect(() => {
    if (!("mediaSession" in navigator) || !("setPositionState" in navigator.mediaSession))
      return;

    try {
      navigator.mediaSession.setPositionState({
        duration: Math.max(0, duration),
        playbackRate: 1.0,
        position: Math.max(0, Math.min(currentTime, duration)),
      });
    } catch (e) {
      console.error("Error setting position state:", e);
    }
  }, [currentTime, duration]);
}

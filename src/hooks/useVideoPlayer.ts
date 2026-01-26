import { useShallowEffect } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PlaybackMode, Song } from "@/interfaces";
import { getSongLength } from "@/utils";
import useNoSleep from "./useNoSleep";

interface UseVideoPlayerProps {
  song: Song;
  repeating: boolean;
  playbackMode: PlaybackMode;
  customPlaybackRate: number;
  startAt?: number;
}

export function useVideoPlayer({
  song,
  repeating,
  playbackMode,
  customPlaybackRate,
  startAt = 0,
}: UseVideoPlayerProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(
    null,
  );
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [, forceUpdate] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPosition, setSeekPosition] = useState(0);
  const [, setNoSleepEnabled] = useNoSleep();

  // Computed values
  const currentPlayback = videoElement
    ? Math.floor(videoElement.currentTime / videoElement.playbackRate)
    : 0;

  const displayPosition = isSeeking ? seekPosition : currentPlayback;
  const isPlaying = videoElement ? !videoElement.paused : false;
  const isFinished = videoElement ? videoElement.ended : false;
  const isRepeat = videoElement ? videoElement.loop : repeating;

  const songLength =
    videoElement && videoElement.duration && !isNaN(videoElement.duration)
      ? getSongLength(videoElement.duration, videoElement.playbackRate)
      : 0;

  // Setup Video
  useShallowEffect(() => {
    let isMounted = true;

    async function setupVideo() {
      try {
        const video = videoRef.current;
        if (!video || !isMounted) return;

        if (
          videoElement &&
          videoElement === video &&
          video.src === song.fileUrl
        ) {
          return;
        }

        console.log("Setting up new video:", song.fileUrl);
        setVideoElement(video);

        // Pitch preservation settings
        (video as any).preservesPitch = false;
        (video as any).mozPreservesPitch = false;
        (video as any).webkitPreservesPitch = false;

        video.src = song.fileUrl;
        video.load();

        await new Promise((resolve, reject) => {
          const onCanPlay = () => {
            video.removeEventListener("canplay", onCanPlay);
            video.removeEventListener("error", onError);
            resolve(undefined);
          };

          const onError = (e: Event) => {
            video.removeEventListener("canplay", onCanPlay);
            video.removeEventListener("error", onError);
            reject(e);
          };

          if (video.readyState >= 3) {
            resolve(undefined);
          } else {
            video.addEventListener("canplay", onCanPlay);
            video.addEventListener("error", onError);
          }
        });

        // Loop initialization
        video.loop = repeating;

        // Calculate rate
        let rate = 1;
        if (playbackMode === "slowed") rate = 0.8;
        else if (playbackMode === "speedup") rate = 1.25;
        else if (playbackMode === "custom") rate = customPlaybackRate;
        video.playbackRate = rate;

        // Start time
        const initialTime = startAt || 0;
        video.currentTime = initialTime * rate;

        setIsVideoReady(true);
        console.log("Video setup completed");
      } catch (e) {
        console.error("Video setup failed:", e);
        notifications.show({
          title: "Error",
          message: "An error occurred while loading the video",
        });
        router.push("/");
      }
    }

    setupVideo();

    return () => {
      isMounted = false;
    };
  }, [song.fileUrl]);

  // Cleanup Effect on Unmount
  useShallowEffect(() => {
    window.onbeforeunload = () => {
      return "Are you sure?";
    };

    return () => {
      console.log("Player cleanup started");
      if (videoElement) {
        videoElement.pause();
        videoElement.removeAttribute("src");
        videoElement.load();
      }
      window.onbeforeunload = null;
      setVideoElement(null);
      setIsVideoReady(false);
      console.log("Player cleanup completed");
    };
  }, []); // Only runs on mount/unmount

  // Handle video ended event
  useEffect(() => {
    if (!videoElement) return;

    const handleEnded = () => {
      if (!videoElement.loop) {
        setNoSleepEnabled(false);
      }
    };

    videoElement.addEventListener("ended", handleEnded);
    return () => videoElement.removeEventListener("ended", handleEnded);
  }, [videoElement, setNoSleepEnabled]);

  // Apply playback rate changes
  useEffect(() => {
    if (!videoElement) return;

    let rate = 1;
    if (playbackMode === "slowed") rate = 0.8;
    else if (playbackMode === "speedup") rate = 1.25;
    else if (playbackMode === "custom") rate = customPlaybackRate;

    // Skip if rate is already correct
    if (Math.abs(videoElement.playbackRate - rate) < 0.01) return;

    videoElement.playbackRate = rate;
  }, [playbackMode, customPlaybackRate, videoElement]);

  const togglePlayer = () => {
    if (!videoElement) {
      console.warn("No video element available");
      return;
    }

    if (isPlaying) {
      videoElement.pause();
      setNoSleepEnabled(false);
    } else {
      if (isFinished) {
        videoElement.currentTime = 0;
      }

      videoElement
        .play()
        .then(() => {
          setNoSleepEnabled(true);
        })
        .catch((error) => {
          console.error("Video play failed:", error);
        });
    }
    // Update UI
    forceUpdate((prev) => prev + 1);
  };

  const setPlaybackPosition = (value: number) => {
    if (!videoElement) return;

    setSeekPosition(value);
    setIsSeeking(false);

    const videoTime = value * videoElement.playbackRate;
    videoElement.currentTime = videoTime;

    if (isPlaying) {
      videoElement.play().catch(console.error);
    }
  };

  const handleSliderChange = (value: number) => {
    setSeekPosition(value);
    setIsSeeking(true);
  };

  const backward = () => {
    const currentPos = isSeeking ? seekPosition : currentPlayback;
    if (currentPos < 5) {
      setPlaybackPosition(0);
      return;
    }
    setPlaybackPosition(currentPos - 5);
  };

  const forward = () => {
    const currentPos = isSeeking ? seekPosition : currentPlayback;
    if (currentPos >= songLength - 5) {
      setPlaybackPosition(songLength);
      return;
    }
    setPlaybackPosition(currentPos + 5);
  };

  const toggleLoop = () => {
    if (videoElement) {
      videoElement.loop = !videoElement.loop;
      forceUpdate((prev) => prev + 1);
    }
  };

  const onTimeUpdate = () => {
    forceUpdate((prev) => prev + 1);
  };

  const onError = (e: any) => {
    console.error("Video error:", e);
    notifications.show({
      title: "Video Error",
      message: "Failed to load video",
    });
  };

  return {
    videoRef,
    videoElement,
    isVideoReady,
    isPlaying,
    isFinished,
    isRepeat,
    currentPlayback,
    displayPosition,
    songLength,
    isSeeking,
    togglePlayer,
    setPlaybackPosition,
    handleSliderChange,
    backward,
    forward,
    toggleLoop,
    onTimeUpdate,
    onError,
    forceUpdate,
  };
}

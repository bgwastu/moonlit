import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useShallowEffect } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { Media } from "@/interfaces";
import useNoSleep from "./useNoSleep";

interface UseVideoPlayerProps {
  media: Media;
  repeating: boolean;
  initialRate: number;
  startAt?: number;
}

export function useVideoPlayer({
  media,
  repeating,
  initialRate,
  startAt = 0,
}: UseVideoPlayerProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [, forceUpdate] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPosition, setSeekPosition] = useState(0);
  const [, noSleepControls] = useNoSleep();

  // Computed values
  const currentPlayback = videoElement ? videoElement.currentTime : 0;

  const displayPosition = isSeeking ? seekPosition : currentPlayback;
  const isPlaying = videoElement ? !videoElement.paused : false;
  const isFinished = videoElement ? videoElement.ended : false;
  const isRepeat = videoElement ? videoElement.loop : repeating;

  const songLength =
    videoElement && videoElement.duration && !isNaN(videoElement.duration)
      ? videoElement.duration
      : 0;

  // Refs to track latest props for async cleanup/setup
  const initialRateRef = useRef(initialRate);

  useEffect(() => {
    initialRateRef.current = initialRate;
  }, [initialRate]);

  // Setup Video
  useShallowEffect(() => {
    let isMounted = true;

    async function setupVideo() {
      try {
        const video = videoRef.current;
        if (!video || !isMounted) return;

        if (videoElement && videoElement === video && video.src === media.fileUrl) {
          return;
        }

        console.log("Setting up new video:", media.fileUrl);
        setVideoElement(video);

        // Pitch preservation settings
        (video as any).preservesPitch = false;
        (video as any).mozPreservesPitch = false;
        (video as any).webkitPreservesPitch = false;

        video.src = media.fileUrl;
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

        // Apply rate
        const currentRate = initialRateRef.current;
        video.playbackRate = currentRate;

        // Start time
        const initialTime = startAt || 0;
        video.currentTime = initialTime;

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
  }, [media.fileUrl]);

  // Cleanup Effect on Unmount
  useShallowEffect(() => {
    return () => {
      console.log("Player cleanup started");
      if (videoElement) {
        videoElement.pause();
        videoElement.removeAttribute("src");
        videoElement.load();
      }
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
        noSleepControls.disable();
      }
    };

    videoElement.addEventListener("ended", handleEnded);
    return () => videoElement.removeEventListener("ended", handleEnded);
  }, [videoElement, noSleepControls]);

  // No longer syncing rate here to avoid circular dependency with useStretchPlayer

  const togglePlayer = () => {
    if (!videoElement) {
      console.warn("No video element available");
      return;
    }

    if (isPlaying) {
      videoElement.pause();
      noSleepControls.disable();
    } else {
      if (isFinished) {
        videoElement.currentTime = 0;
      }

      videoElement
        .play()
        .then(() => {
          noSleepControls.enable();
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

    videoElement.currentTime = value;

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

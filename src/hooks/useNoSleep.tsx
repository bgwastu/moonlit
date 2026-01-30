import { useCallback, useEffect, useRef, useState } from "react";
import { SILENT_VIDEO_MP4 } from "@/lib/silentVideo";

/** Detect iOS (iPhone, iPad) - Safari and in-app WebViews */
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Screen wake lock hook: Wake Lock API + iOS silent-video fallback + NoSleep.js fallback */
export default function useNoSleep() {
  const [enabled, setEnabledState] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const noSleepRef = useRef<{ enable: () => Promise<void>; disable: () => void } | null>(
    null,
  );
  const noSleepReadyRef = useRef<Promise<void> | null>(null);
  const iosVideoRef = useRef<HTMLVideoElement | null>(null);

  // Preload NoSleep so it's ready when enable() is called (avoids race on first tap)
  useEffect(() => {
    if (typeof window === "undefined") return;
    noSleepReadyRef.current = import("nosleep.js").then((NoSleep) => {
      noSleepRef.current = new NoSleep.default();
    });
  }, []);

  const enableIosVideo = useCallback(() => {
    if (typeof document === "undefined") return;
    if (iosVideoRef.current) {
      iosVideoRef.current.play().catch(() => {});
      return;
    }
    const video = document.createElement("video");
    video.setAttribute("title", "No Sleep");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("muted", "");
    video.setAttribute("loop", "");
    video.muted = true;
    video.loop = true;
    video.src = SILENT_VIDEO_MP4;
    video.style.cssText =
      "position:fixed;width:1px;height:1px;left:-9999px;top:0;opacity:0;pointer-events:none;";
    document.body.appendChild(video);
    iosVideoRef.current = video;
    video.play().catch(() => {});
  }, []);

  const disableIosVideo = useCallback(() => {
    const video = iosVideoRef.current;
    if (video && video.parentNode) {
      video.pause();
      video.remove();
      iosVideoRef.current = null;
    }
  }, []);

  const enable = useCallback(async () => {
    if (typeof window === "undefined") return;

    // Ensure NoSleep is loaded before we might need it
    if (noSleepReadyRef.current) {
      await noSleepReadyRef.current;
    }

    const useIosVideo = isIOS();

    if ("wakeLock" in navigator) {
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        wakeLockRef.current = sentinel;
        setEnabledState(true);

        sentinel.addEventListener("release", () => {
          if (wakeLockRef.current === sentinel) {
            wakeLockRef.current = null;
            setEnabledState(false);
          }
        });
      } catch (err) {
        console.warn("Wake Lock API failed, using fallback", err);
      }
    }

    // On iOS, Wake Lock can fail (e.g. PWA / Add to Home Screen) or be unreliable.
    // Always use silent-video fallback on iOS so the device stays awake.
    if (useIosVideo) {
      enableIosVideo();
      setEnabledState(true);
      return;
    }

    // Non-iOS fallback: NoSleep.js (uses Wake Lock or its own video)
    if (noSleepRef.current) {
      try {
        await noSleepRef.current.enable();
        setEnabledState(true);
      } catch (err) {
        console.warn("NoSleep.js failed", err);
      }
    }
  }, [enableIosVideo]);

  const disable = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(console.error);
      wakeLockRef.current = null;
    }
    if (noSleepRef.current) {
      noSleepRef.current.disable();
    }
    disableIosVideo();
    setEnabledState(false);
  }, [disableIosVideo]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== "visible") return;
      if (!enabled) return;

      if ("wakeLock" in navigator && !wakeLockRef.current) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        } catch {
          // ignore
        }
      }

      if (isIOS() && iosVideoRef.current) {
        iosVideoRef.current.play().catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLockRef.current) wakeLockRef.current.release().catch(() => {});
      if (noSleepRef.current) noSleepRef.current.disable();
      disableIosVideo();
    };
  }, [enabled, disableIosVideo]);

  return [enabled, { enable, disable }] as const;
}

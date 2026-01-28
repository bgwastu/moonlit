import { useCallback, useEffect, useRef, useState } from "react";
import NoSleep from "nosleep.js";

export default function useNoSleep() {
  const [enabled, setEnabledState] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const noSleepRef = useRef<NoSleep | null>(null);

  // Initialize NoSleep.js as fallback
  useEffect(() => {
    if (typeof window !== "undefined" && !noSleepRef.current) {
      noSleepRef.current = new NoSleep();
    }
  }, []);

  const enable = useCallback(async () => {
    // Try Native Wake Lock API first
    if ("wakeLock" in navigator) {
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        wakeLockRef.current = sentinel;
        setEnabledState(true);

        sentinel.addEventListener("release", () => {
          // If released externally (e.g. system), update state
          if (wakeLockRef.current === sentinel) {
            wakeLockRef.current = null;
            // Only update state if we didn't intentionally disable it?
            // Actually for now let's just sync state.
            // If the system releases it, we might want to try re-acquiring on visibility change,
            // but for now let's just mark it as disabled.
            setEnabledState(false);
          }
        });
        return;
      } catch (err) {
        console.warn("Wake Lock API failed, falling back to NoSleep.js", err);
      }
    }

    // Fallback to NoSleep.js
    try {
      if (noSleepRef.current) {
        // NoSleep.enable() normally requires a user gesture
        await noSleepRef.current.enable();
        setEnabledState(true);
      }
    } catch (err) {
      console.error("NoSleep.js failed", err);
    }
  }, []);

  const disable = useCallback(() => {
    // Release Native Wake Lock
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(console.error);
      wakeLockRef.current = null;
    }

    // Disable NoSleep.js
    if (noSleepRef.current) {
      noSleepRef.current.disable();
    }

    setEnabledState(false);
  }, []);

  // Re-acquire lock when page becomes visible if it was enabled
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (
        document.visibilityState === "visible" &&
        enabled &&
        !wakeLockRef.current
      ) {
        // Attempt to re-acquire
        // Note: This might fail without user gesture if using NoSleep,
        // but Wake Lock API usually works if permissions were granted.
        if ("wakeLock" in navigator) {
          try {
            wakeLockRef.current = await navigator.wakeLock.request("screen");
          } catch (e) {
            console.error("Failed to re-acquire wake lock", e);
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      // Clean up on unmount
      if (wakeLockRef.current) wakeLockRef.current.release().catch(() => {});
      if (noSleepRef.current) noSleepRef.current.disable();
    };
  }, [enabled]);

  return [enabled, { enable, disable }] as const;
}
